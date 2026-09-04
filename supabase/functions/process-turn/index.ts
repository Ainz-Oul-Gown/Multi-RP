// supabase/functions/process-turn/index.ts
// 5-шаговый конвейер process-turn: Router → Engine → Persistence → SystemTruth → Narrator
//
// Шаги:
//   1. AI Router  (step1_router.ts)        — парсинг намерений игрока → JSON actions
//   2. Game Engine (engine/step2_engine.ts) — броски кубиков, проверки, мутации
//   3. Persistence (step3_persistence.ts)   — атомарное применение мутаций через RPC
//   4. System Truth (step4_system_truth.ts) — Туман Войны, разделение видимости, RAG
//   5. Narrator  (step5_narrator.ts)        — LLM-нарратор (или fallback)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
import { parsePlayerIntent } from "./steps/step1_router.ts";
import { executeEngine } from "./engine/step2_engine.ts";
import { applyTurnMutations } from "./steps/step3_persistence.ts";
import { compileSystemTruth } from "./steps/step4_system_truth.ts";
import { generateNarrative, buildFallbackNarrative } from "./steps/step5_narrator.ts";
import { buildSatellitePrompt, buildGpsPrompt } from "./steps/_shared_prompts.ts";
import { RouterInputContext } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================
// AI API call
// ============================================
async function callAI(systemPrompt: string, userMessage: string, apiKey: string, retries = 3, model?: string): Promise<string> {
  const useModel = model || AI_MODEL;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        if (attempt === retries - 1) throw new Error(`AI API error: ${response.status}`);
        continue;
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("AI call failed after all retries");
}

// ============================================
// Утилиты времени (для fallback в GPS, если Шаг 1.6 не вызывается)
// ============================================
function advanceTime(base: { year: number; month: number; day: number; hour: number; minute: number }, addMinutes: number) {
  let totalMin = (base.hour * 60 + base.minute + addMinutes);
  let day = base.day, month = base.month, year = base.year;
  const minutesInDay = 24 * 60;
  while (totalMin >= minutesInDay) {
    totalMin -= minutesInDay;
    day++;
    if (day > 30) { day = 1; month++; if (month > 12) { month = 1; year++; } }
  }
  return { year, month, day, hour: Math.floor(totalMin / 60), minute: totalMin % 60 };
}

// ============================================
// Main Handler — 5-шаговый конвейер
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[${requestId}] ════════ PROCESS-TURN (5-step pipeline) START ════════`);

  try {
    const { session_id, player_id, action_text } = await req.json();
    const safeActionText = cleanTextForAI(action_text);

    if (!session_id || !player_id || !safeActionText) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const imagePattern = /\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi;
    if (imagePattern.test(safeActionText)) {
      return new Response(JSON.stringify({ error: "Обнаружены ссылки на изображения. Удалите их и попробуйте снова." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ============================================
    // LOAD CONTEXT
    // ============================================
    const { data: player, error: playerErr } = await supabase
      .from("players")
      .select("*, inventory(*)")
      .eq("id", player_id)
      .single();
    if (playerErr || !player) {
      return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("*, worlds(settings)")
      .eq("id", session_id)
      .single();
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Resolve API key + models
    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    let satelliteModel = AI_MODEL, gpsModel = AI_MODEL, dmModel = AI_MODEL;
    if (player.user_id) {
      const { data: us } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", player.user_id).maybeSingle();
      if (us?.openrouter_key) openrouterApiKey = sanitizeKey(us.openrouter_key);
      if (us?.satellite_model) satelliteModel = us.satellite_model;
      if (us?.gps_model) gpsModel = us.gps_model;
      if (us?.dm_model) dmModel = us.dm_model;
    }
    if (!openrouterApiKey) {
      return new Response(JSON.stringify({ error: "Укажите ваш OpenRouter API Key в настройках.", code: "MISSING_API_KEY" }), {
        status: 402, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load location, available locations, lore
    let currentLocationName: string | null = null, currentStateName: string | null = null;
    if (session.current_location_id) {
      try {
        const { data: locData } = await supabase
          .from("locations")
          .select("name, states(name)")
          .eq("id", session.current_location_id)
          .maybeSingle();
        if (locData) {
          currentLocationName = locData.name;
          const stateObj = Array.isArray(locData.states) ? locData.states[0] : locData.states;
          currentStateName = stateObj?.name || null;
        }
      } catch (locErr) {
        console.warn(`[${requestId}] Failed to load current location:`, locErr);
      }
    }

    let availableLocations: { id: string; name: string; type: string; state_name: string }[] = [];
    if (session.world_id) {
      try {
        const { data: statesWithLocs } = await supabase
          .from("states")
          .select("id, name, locations(id, name, type)")
          .eq("world_id", session.world_id);
        if (statesWithLocs) {
          for (const s of statesWithLocs) {
            const locs = Array.isArray(s.locations) ? s.locations : [];
            for (const l of locs) {
              availableLocations.push({
                id: l.id,
                name: l.name,
                type: l.type,
                state_name: s.name,
              });
            }
          }
        }
      } catch (locsErr) {
        console.warn(`[${requestId}] Failed to load available locations:`, locsErr);
      }
    }

    let loreContext = "";
    if (session.world_id) {
      const { data: loreFiles } = await supabase.from("lore_files").select("title, content").eq("world_id", session.world_id).limit(5);
      if (loreFiles?.length) {
        loreContext = loreFiles.map((f) => `### ${f.title}\n${cleanTextForAI(f.content).slice(0, 500)}`).join("\n\n");
      }
    }
    const { data: recentMsgs } = await supabase.from("messages").select("content, sender_type").eq("session_id", session_id).order("created_at", { ascending: false }).limit(10);
    const recentMessages = (recentMsgs || []).reverse().map((m) => `[${m.sender_type === "master" ? "Мастер" : "Игрок"}]: ${cleanTextForAI(m.content).slice(0, 200)}`);

    // Load all players in session (for router, engine and system truth context)
    const { data: allPlayersData } = await supabase.from("players").select("*, inventory(*)").eq("session_id", session_id);
    const allPlayers = allPlayersData || [];

    // Load all NPCs in current location (for router, engine and system truth context)
    let allNpcs: any[] = [];
    if (session.current_location_id) {
      const { data: npcData } = await supabase.from("npcs")
        .select("id, name, race, role, hp, max_hp, armor_class, level, is_alive, is_hostile, status_tags, stats")
        .eq("location_id", session.current_location_id);
      allNpcs = npcData || [];
    }

    // ============================================
    // ШАГ 1: AI Router (parsePlayerIntent)
    // ============================================
    console.log(`[${requestId}] [STEP 1] AI Router...`);
    const routerInput: RouterInputContext = {
      player_action_text: safeActionText,
      player: {
        id: player.id,
        name: player.name || "Герой",
        race: player.race || "Человек",
        class: player.class || "Воин",
        level: player.level || 1,
        hp: player.hp ?? 100,
        max_hp: player.max_hp ?? 100,
        stats: player.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        location_name: currentLocationName,
        state_name: currentStateName,
      },
      inventory: (player.inventory || []).map((i: any) => ({
        id: i.id,
        item_name: i.item_name || i.name || "Предмет",
        item_type: i.type || i.item_type || "misc",
        quantity: i.quantity || 1,
        condition: i.condition ?? null,
        durability: i.durability ?? null,
        description: i.description || "",
      })),
      nearby_npcs: allNpcs.map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "Гуманоид",
        is_hostile: n.is_hostile || false,
        hp: n.hp ?? 10,
        max_hp: n.max_hp ?? 10,
        distance_meters: 5,
      })),
      weather: {
        description: "Ясно",
        temperature: 20,
        is_raining: false,
        is_night: ((session.game_hour ?? 8) < 6 || (session.game_hour ?? 8) >= 22),
        wind_speed: 2,
      },
      game_time: {
        year: session.game_year || 1,
        month: session.game_month || 1,
        day: session.game_day || 1,
        hour: session.game_hour || 8,
        minute: session.game_minute || 0,
      },
      current_location_id: session.current_location_id || null,
      current_location_name: currentLocationName,
    };

    const routerResult = await parsePlayerIntent(
      routerInput,
      openrouterApiKey,
      satelliteModel
    );

    if (routerResult.status === "clarification_needed") {
      return new Response(JSON.stringify({
        success: false,
        status: "clarification_needed",
        clarification_msg: routerResult.clarification_msg,
        actions: [],
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    console.log(`[${requestId}] [STEP 1] OK: ${routerResult.actions.length} actions`);

    // Apply GPS time/location (still here, as it's pre-engine)
    let time_passed_minutes = 0;
    let location_changed = false, new_location_id: string | null = null, travel_description = "";
    try {
      const gpsSystemPrompt = buildGpsPrompt({
        playerName: cleanTextForAI(player.name || "Герой"),
        actionText: safeActionText,
        intentType: "router",
        intentDescription: safeActionText,
        currentYear: session.game_year || 1, currentMonth: session.game_month || 1,
        currentDay: session.game_day || 1, currentHour: session.game_hour || 8,
        currentMinute: session.game_minute || 0,
        currentLocation: currentLocationName, currentState: currentStateName,
        wantsLocationChange: false, locationChangeDescription: "",
        availableLocations,
      });
      const gpsResp = await callAI(gpsSystemPrompt, "Определи время.", openrouterApiKey, 2, gpsModel);
      const gpsParsed = parseAIJson(gpsResp);
      if (gpsParsed) {
        time_passed_minutes = Math.max(0, Math.min(1440, Number(gpsParsed.time_minutes) || 0));
        location_changed = gpsParsed.location_changed === true;
        new_location_id = gpsParsed.new_location_id || null;
        travel_description = gpsParsed.travel_description || "";
      }
    } catch (e) { /* ignore */ }

    // ============================================
    // ШАГ 2: Game Engine
    // ============================================
    console.log(`[${requestId}] [STEP 2] Game Engine...`);

    const engineResult = executeEngine({
      router_output: routerResult,
      session: {
        id: session_id,
        difficulty: session.difficulty || "normal",
        is_pvp_enabled: session.is_pvp_enabled || false,
        game_year: session.game_year || 1, game_month: session.game_month || 1,
        game_day: session.game_day || 1, game_hour: session.game_hour || 8,
        game_minute: session.game_minute || 0,
        current_location_id: session.current_location_id,
      },
      acting_player: {
        id: player.id, name: player.name || "Герой",
        stats: player.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: player.hp, max_hp: player.max_hp,
        armor_class: player.armor_class || 10,
        initiative: player.initiative || 0,
        level: player.level || 1,
        inventory: player.inventory || [],
        injuries: player.injuries || [],
      },
      targets: {
        players: new Map((allPlayers || []).map((p: any) => [p.id, p])),
        npcs: new Map(allNpcs.map((n: any) => [n.id, n])),
        location_items: new Map(),
      },
    });
    console.log(`[${requestId}] [STEP 2] OK: ${engineResult.mutations.length} mutations`);

    // ============================================
    // ШАГ 3: DB Persistence
    // ============================================
    console.log(`[${requestId}] [STEP 3] Persistence...`);
    const persistenceResult = await applyTurnMutations({
      session_id,
      engine_output: engineResult,
    });
    console.log(`[${requestId}] [STEP 3] ${persistenceResult.status}, ${persistenceResult.applied_mutations_count} applied`);

    // Apply time advance to session
    if (time_passed_minutes > 0) {
      const nt = advanceTime({
        year: session.game_year || 1, month: session.game_month || 1, day: session.game_day || 1,
        hour: session.game_hour || 8, minute: session.game_minute || 0,
      }, time_passed_minutes);
      await supabase.from("sessions").update({
        game_year: nt.year, game_month: nt.month, game_day: nt.day,
        game_hour: nt.hour, game_minute: nt.minute,
      }).eq("id", session_id);
    }
    if (location_changed && new_location_id) {
      await supabase.from("sessions").update({ current_location_id: new_location_id }).eq("id", session_id);
    }

    // ============================================
    // ШАГ 4: System Truth Compiler
    // ============================================
    console.log(`[${requestId}] [STEP 4] System Truth...`);
    const systemTruth = await compileSystemTruth({
      session_id,
      acting_player_id: player.id,
      engine_output: engineResult,
      persistence_output: persistenceResult,
      session: {
        game_year: session.game_year || 1, game_month: session.game_month || 1,
        game_day: session.game_day || 1, game_hour: session.game_hour || 8,
        game_minute: session.game_minute || 0,
        current_location_id: session.current_location_id,
      },
      location: { name: currentLocationName || "Неизвестно", weather: routerInput.weather?.description || null },
      players: (allPlayers || []).map((p: any) => ({
        id: p.id, name: p.name || "Герой", hp: p.hp ?? 100, max_hp: p.max_hp ?? 100, inventory: p.inventory || [],
      })),
      npcs: allNpcs.map((n: any) => ({ id: n.id, name: n.name || "NPC", race: n.race || "Существо", role: n.role || "Обыватель", status_tags: n.status_tags || [] })),
      atmosphere: routerResult.atmosphere || { sounds: [], visuals: [] },
      time_passed_minutes,
      encounter_alert: null,
    });
    console.log(`[${requestId}] [STEP 4] turn_status=${systemTruth.turn_status}, ${Object.keys(systemTruth.player_truths).length} player_truths`);

    // ============================================
    // ШАГ 5: Narrator
    // ============================================
    console.log(`[${requestId}] [STEP 5] Narrator...`);
    let narratorOutput: { players: Record<string, string>; global_narrative: string };
    try {
      narratorOutput = await generateNarrative({
        system_truth: systemTruth,
        action_text: safeActionText,
        player_name: player.name || "Герой",
        player_race: player.race || "Человек",
        player_class: player.class || "Воин",
        lore_context: loreContext,
        openrouter_api_key: openrouterApiKey,
        dm_model: dmModel,
      });
    } catch (narratorErr) {
      console.warn(`[${requestId}] [STEP 5] LLM failed, using fallback:`, narratorErr);
      narratorOutput = buildFallbackNarrative(systemTruth);
    }
    console.log(`[${requestId}] [STEP 5] ${Object.keys(narratorOutput.players).length} player narratives`);

    // ============================================
    // SAVE: messages + turn_queue
    // ============================================
    console.log(`[${requestId}] [SAVE] Persisting messages...`);
    // 1) Player action
    await supabase.from("messages").insert({
      session_id, sender_type: "player", sender_id: player.user_id, sender_name: player.name || "Герой", content: safeActionText,
    });
    // 2) Master narratives — по одному сообщению на игрока
    for (const [targetPlayerId, narrative] of Object.entries(narratorOutput.players)) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Мастер", content: narrative,
        metadata: {
          target_player_id: targetPlayerId,
          turn_status: systemTruth.turn_status,
          hp_status: systemTruth.player_truths[targetPlayerId]?.hp_status,
          inventory_delta: systemTruth.player_truths[targetPlayerId]?.inventory_delta,
        },
      });
    }
    // 3) Global log (только при наличии > 1 игрока, чтобы в соло не дублировать персональный нарратив)
    if (narratorOutput.global_narrative && allPlayers.length > 1) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Лог",
        content: narratorOutput.global_narrative,
        metadata: { type: "global_log", is_global: true, initiator_player_id: player.id },
      });
    }

    // turn_queue: текущий ход completed → следующий active
    try {
      const { data: existingTurns } = await supabase.from("turn_queue")
        .select("id, player_id, status")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

      if (!existingTurns || existingTurns.length === 0) {
        // Очереди ещё нет — инициализируем для всех игроков сессии
        if (allPlayers && allPlayers.length > 1) {
          const nextPlayer = allPlayers.find((p: any) => p.id !== player.id) || allPlayers[0];
          for (const p of allPlayers) {
            const isActor = p.id === player.id;
            const isNext = p.id === nextPlayer.id && !isActor;
            await supabase.from("turn_queue").insert({
              session_id,
              player_id: p.id,
              status: isActor ? "completed" : (isNext ? "active" : "waiting"),
              resolved_at: isActor ? new Date().toISOString() : null,
              parsed_action: isActor ? routerResult : null,
              roll_result: isActor ? engineResult : null,
            });
          }
        }
      } else {
        // Добавляем игроков сессии, которых ещё нет в turn_queue
        if (allPlayers && allPlayers.length > 1) {
          const existingPids = new Set(existingTurns.map((t: any) => t.player_id));
          for (const p of allPlayers) {
            if (!existingPids.has(p.id)) {
              await supabase.from("turn_queue").insert({
                session_id,
                player_id: p.id,
                status: "waiting",
              });
            }
          }
        }

        // Завершаем текущий ход игрока
        await supabase.from("turn_queue").update({
          status: "completed", resolved_at: new Date().toISOString(),
          parsed_action: routerResult, roll_result: engineResult,
        }).eq("session_id", session_id).eq("player_id", player.id);

        // Ищем следующий ход со статусом 'waiting'
        const { data: nextTurn } = await supabase.from("turn_queue")
          .select("id, player_id")
          .eq("session_id", session_id).eq("status", "waiting")
          .order("created_at", { ascending: true }).limit(1).maybeSingle();

        if (nextTurn) {
          await supabase.from("turn_queue").update({ status: "active" }).eq("id", nextTurn.id);
        } else {
          // Раунд завершен! Все игроки сделали ход.
          // Перезапускаем очередь: первый игрок становится 'active', остальные 'waiting'
          const firstTurn = existingTurns[0];
          const otherTurnIds = existingTurns.slice(1).map((t: any) => t.id);
          if (otherTurnIds.length > 0) {
            await supabase.from("turn_queue").update({ status: "waiting", resolved_at: null }).in("id", otherTurnIds);
          }
          await supabase.from("turn_queue").update({ status: "active", resolved_at: null }).eq("id", firstTurn.id);
        }
      }
    } catch (queueErr) { console.warn(`[${requestId}] [SAVE] turn_queue update failed:`, queueErr); }

    return new Response(JSON.stringify({
      success: true,
      pipeline: {
        step1: { status: "ok", actions_count: routerResult.actions.length },
        step2: { status: "ok", mutations_count: engineResult.mutations.length },
        step3: { status: persistenceResult.status, applied: persistenceResult.applied_mutations_count },
        step4: { status: "ok", turn_status: systemTruth.turn_status },
        step5: { status: "ok", players_narrated: Object.keys(narratorOutput.players).length },
      },
      turn_status: systemTruth.turn_status,
      narratives: narratorOutput,
      game_time: systemTruth.environment.time,
      time_minutes: time_passed_minutes,
      location_changed,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(`[${requestId}] ❌ ERROR:`, err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
