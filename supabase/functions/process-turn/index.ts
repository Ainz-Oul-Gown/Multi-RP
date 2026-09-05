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
import { parsePlayerIntent, buildRouterHeuristicFallback } from "./steps/step1_router.ts";
import { executeEngine } from "./engine/step2_engine.ts";

import { applyTurnMutations } from "./steps/step3_persistence.ts";
import { compileSystemTruth } from "./steps/step4_system_truth.ts";
import { generateNarrative, buildFallbackNarrative } from "./steps/step5_narrator.ts";
import { processNpcInteractions } from "./steps/npc_memory_updater.ts";
import { ensureStartingLocation } from "../_shared/starting_location_generator.ts";
import { detectSkillFromAction, calculateSkillBonuses } from "../_shared/skill_engine.ts";
import { handleCompanionInSceneAction, resolveNpcBackgroundActivities, handleCompanionInvitation, checkNpcProactiveCompanionOffer } from "../_shared/npc_autonomous_engine.ts";
import { decideNpcCombatAction, executeNpcAttack, executeCompanionAttack } from "../_shared/npc_combat_ai.ts";
import { evaluatePetTamingAttempt, evaluatePetLoyaltyCheck, awardPetCombatXp } from "../_shared/pet_taming_engine.ts";
import { buildSatellitePrompt, buildGpsPrompt } from "./steps/_shared_prompts.ts";
import { RouterInputContext } from "./types.ts";
import { evaluateStoryProgress } from "../_shared/storyProgressEvaluator.ts";

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
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
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
        lastError = new Error(`AI API error: ${response.status}`);
        continue; // retry
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      // OpenRouter sometimes returns null/empty content — treat as transient error, retry
      if (!content || content.trim() === "") {
        lastError = new Error("AI Router: пустой ответ от LLM");
        console.warn(`[callAI] attempt ${attempt + 1}/${retries} — empty content, retrying...`);
        continue;
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(`AI Router: не удалось получить валидный ответ после ${retries} попыток. Последняя ошибка: ${lastError?.message || "unknown"}`);
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
// Парсинг намерения прокачки характеристик из текста чата
// ============================================
function parseStatAllocationIntent(text: string): { stat: string; points: number } | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();

  const statMap: Record<string, string> = {
    "сил": "STR", "str": "STR", "strength": "STR",
    "ловк": "DEX", "dex": "DEX", "dexterity": "DEX",
    "вынос": "CON", "con": "CON", "constitution": "CON", "тело": "CON",
    "интел": "INT", "int": "INT", "intelligence": "INT", "ум": "INT",
    "мудр": "WIS", "wis": "WIS", "wisdom": "WIS",
    "хариз": "CHA", "cha": "CHA", "charisma": "CHA", "обаяни": "CHA"
  };

  // Шаблон 1: глагол + количество + характеристика
  // "вкладываю 2 очка в силу", "качаю ловкость +1", "добавь 2 в выносливость", "повысь мудрость на 1"
  const verbRegex = /(?:вкладываю|вкачиваю|качаю|повышаю|добавь|распредели|кинь|увеличь|подними|повысь|поставь)\s*(?:себе)?\s*(\+?\d+)?\s*(?:очка|очко|очков|ед|пт|поинт[а-я]*)?\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match1 = clean.match(verbRegex);
  if (match1) {
    const rawPts = match1[1] ? parseInt(match1[1].replace("+", ""), 10) : 1;
    const rawStat = match1[2].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 2: характеристика + количество ("ловкость +1", "сила 2", "интеллект +2")
  const statFirstRegex = /([а-яa-z]+)\s*(?:\+|\bплюс\b|\bна\b)?\s*(\d+)\s*(?:очка|очко|очков|ед|пт|поинт[а-я]*)?/i;
  const match2 = clean.match(statFirstRegex);
  if (match2) {
    const rawStat = match2[1].toLowerCase();
    const rawPts = parseInt(match2[2], 10);
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 3: +N характеристика ("+1 сила", "+2 выносливость")
  const plusFirstRegex = /\+(\d+)\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match3 = clean.match(plusFirstRegex);
  if (match3) {
    const rawPts = parseInt(match3[1], 10);
    const rawStat = match3[2].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: isNaN(rawPts) || rawPts <= 0 ? 1 : rawPts };
      }
    }
  }

  // Шаблон 4: глагол + характеристика без цифр ("качаю силу", "повысь ловкость" -> 1 очко)
  const simpleRegex = /(?:вкладываю|вкачиваю|качаю|повышаю|увеличь|подними|повысь)\s*(?:себе)?\s*(?:в|на|к)?\s*([а-яa-z]+)/i;
  const match4 = clean.match(simpleRegex);
  if (match4) {
    const rawStat = match4[1].toLowerCase();
    for (const [prefix, statKey] of Object.entries(statMap)) {
      if (rawStat.startsWith(prefix)) {
        return { stat: statKey, points: 1 };
      }
    }
  }

  return null;
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

    const sessionStoryline = session.storyline || session.worlds?.settings?.storyline || null;

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
    // Wild zone — природная зона вне именных локаций (лес, пещера, поле)
    const currentWildZone: string | null = session.current_wild_zone || null;
    if (currentWildZone) {
      // Player is in open world / wild zone — use currentWildZone as location name
      currentLocationName = currentWildZone;
    } else if (session.current_location_id) {
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
      const { data: loreFiles } = await supabase
        .from("lore_files")
        .select("title, content")
        .eq("world_id", session.world_id)
        .limit(10);

      if (loreFiles && loreFiles.length > 0) {
        const keywords = [safeActionText, currentLocationName || "", currentWildZone || ""]
          .join(" ")
          .toLowerCase();

        const relevantLore = loreFiles.filter((f: any) => {
          const content = ((f.title || "") + " " + (f.content || "")).toLowerCase();
          return keywords
            .split(/\s+/)
            .some((w: string) => w.length > 4 && content.includes(w));
        }).slice(0, 2);

        const allLore = relevantLore.length > 0 ? relevantLore : loreFiles.slice(0, 1);
        loreContext = allLore
          .map((f: any) => `### ${f.title}\n${cleanTextForAI(f.content).slice(0, 600)}`)
          .join("\n\n");
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
      const { data: npcData, error: npcErr } = await supabase.from("npcs")
        .select("id, name, race, class, role, category, hp, max_hp, armor_class, level, is_hostile, status_tags, stats, background, appearance, habits, catchphrases, special_attacks, base_attacks, current_activity, activity_data, last_activity_time")
        .eq("location_id", session.current_location_id);
      if (!npcErr) {
        // Derive is_alive from hp (column might not exist yet in all environments)
        allNpcs = (npcData || []).map((n: any) => ({
          ...n,
          is_alive: (n.hp ?? 10) > 0,
        }));
      }
    }

    const isCompanionNpc = (n: any) => {
      const role = (n.role || "").toLowerCase();
      const tags = Array.isArray(n.status_tags) ? n.status_tags.map((t: string) => String(t).toLowerCase()) : [];
      return role === "companion" || role === "спутник" || tags.some((t: string) => ["companion", "спутник", "в_отряде", "питомец", "приручен"].includes(t));
    };

    // Если игрок находится в дикой зоне (лес, пещера, пустошь), городские NPC (торговцы, жители) остаются в городе!
    // В сцене с игроком присутствуют ТОЛЬКО спутники/питомцы или дикие враги/существа.
    if (currentWildZone) {
      const totalLoaded = allNpcs.length;
      allNpcs = allNpcs.filter((n: any) =>
        isCompanionNpc(n) ||
        n.is_hostile === true ||
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["дикий", "монстр", "дикая_зона", "зверь", "хищник"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] In wild zone "${currentWildZone}": filtered out town NPCs (${totalLoaded} -> ${allNpcs.length} present)`);
    }

    console.log(`[${requestId}] [START] 🎯 Turn for player "${player.name}" (${player.id}) in session "${session_id}". Action: "${safeActionText}"`);
    console.log(`[${requestId}] [LOCATION] 📍 LocationID=${session.current_location_id}, Name="${currentLocationName}", WildZone="${session.current_wild_zone || 'none'}", NPCs present=${allNpcs.length} (${allNpcs.map((n: any) => n.name).join(', ') || 'none'})`);

    // Проверяем, первый ли это ход в сессии (нет сообщений игрока или локация не задана)
    const isFirstTurn = !session.current_location_id || !(recentMsgs || []).some((m: any) => m.sender_type === "player");
    let startingLocationGenerated = false;

    if (isFirstTurn) {
      console.log(`[${requestId}] [STARTING_LOCATION] Generating/ensuring starting location for first turn...`);
      try {
        const startLoc = await ensureStartingLocation({
          supabase,
          session,
          player: {
            id: player.id,
            name: player.name || "Герой",
            race: player.race,
            class: player.class,
            appearance: player.appearance,
            personality: player.personality,
            bio: player.bio,
          },
          action_text: safeActionText,
          is_first_turn: true,
          lore_context: loreContext,
          openrouter_api_key: openrouterApiKey,
          model: satelliteModel,
        });

        if (startLoc && startLoc.is_new_location) {
          startingLocationGenerated = true;
          session.current_location_id = startLoc.location_id;
          currentLocationName = startLoc.location_name;
          currentStateName = startLoc.state_name;
          session.game_year = startLoc.game_time.year;
          session.game_month = startLoc.game_time.month;
          session.game_day = startLoc.game_time.day;
          session.game_hour = startLoc.game_time.hour;
          session.game_minute = startLoc.game_time.minute;

          if (startLoc.initial_npcs?.length) {
            allNpcs = startLoc.initial_npcs;
          }
          console.log(`[${requestId}] [STARTING_LOCATION] Created start location "${currentLocationName}" (${currentStateName}) for ${player.name}`);
        }
      } catch (locGenErr) {
        console.warn(`[${requestId}] [STARTING_LOCATION] Generation error:`, locGenErr);
      }
    }

    // ============================================
    // Чат: распределение очков характеристик
    // ============================================
    let statAllocatedFact: string | null = null;
    const statAllocIntent = parseStatAllocationIntent(safeActionText);
    if (statAllocIntent) {
      console.log(`[${requestId}] [STAT_ALLOC] Detected chat intent: +${statAllocIntent.points} to ${statAllocIntent.stat}`);
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("allocate_stat_points", {
          p_player_id: player.id,
          p_stat_name: statAllocIntent.stat,
          p_points: statAllocIntent.points,
        });
        if (rpcErr) {
          console.warn(`[${requestId}] [STAT_ALLOC] RPC error:`, rpcErr);
        } else if (rpcRes && rpcRes.success) {
          console.log(`[${requestId}] [STAT_ALLOC] Successfully allocated:`, rpcRes);
          const statNamesRu: Record<string, string> = {
            STR: "силу", DEX: "ловкость", CON: "выносливость",
            INT: "интеллект", WIS: "мудрость", CHA: "харизму"
          };
          const statRu = statNamesRu[statAllocIntent.stat] || statAllocIntent.stat;
          statAllocatedFact = `${player.name} успешно вложил ${statAllocIntent.points} очк. в характеристику ${statRu} (новое значение: ${rpcRes.new_value}, свободно очков: ${rpcRes.remaining_points}).`;

          player.stat_points = rpcRes.remaining_points;
          if (!player.stats) player.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
          player.stats[statAllocIntent.stat] = rpcRes.new_value;
          if (statAllocIntent.stat === "CON") {
            const conMod = Math.floor((rpcRes.new_value - 10) / 2);
            player.max_hp = Math.max(10, rpcRes.new_value * 2 + (player.level || 1) * Math.max(1, conMod + 5));
          } else if (statAllocIntent.stat === "INT") {
            player.max_mp = Math.max(20, rpcRes.new_value * 2 + (player.level || 1) * 5);
          }
        } else if (rpcRes && !rpcRes.success) {
          console.log(`[${requestId}] [STAT_ALLOC] Allocation rejected: ${rpcRes.error}`);
          statAllocatedFact = `${player.name} попытался распределить очки в ${statAllocIntent.stat}, но не смог: ${rpcRes.error}`;
        }
      } catch (allocEx) {
        console.warn(`[${requestId}] [STAT_ALLOC] Exception:`, allocEx);
      }
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
      storyline: sessionStoryline ? {
        title: sessionStoryline.title,
        current_arc: sessionStoryline.arcs?.[sessionStoryline.current_arc_index || 0] || null,
      } : null,
    };

    let routerResult: any;
    try {
      routerResult = await parsePlayerIntent(
        routerInput,
        openrouterApiKey,
        satelliteModel
      );
    } catch (routerErr: any) {
      console.warn(`[${requestId}] [STEP 1] Router LLM failed (${routerErr?.message}), using heuristic fallback...`);
      routerResult = buildRouterHeuristicFallback(routerInput);
    }


    if (routerResult.status === "clarification_needed") {
      return new Response(JSON.stringify({
        success: false,
        status: "clarification_needed",
        clarification_msg: routerResult.clarification_msg,
        actions: [],
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    console.log(`[${requestId}] [STEP 1] 🧭 Router: status="${routerResult.status}", actions=${JSON.stringify(routerResult.actions.map((a: any) => ({ type: a.action_type, target: a.target_item_name || a.target_entity_id, stat: a.stat_to_check })))}`);

    // Apply GPS time/location (still here, as it's pre-engine)
    let time_passed_minutes = 0;
    let location_changed = startingLocationGenerated,
      new_location_id: string | null = startingLocationGenerated ? session.current_location_id : null,
      new_wild_zone: string | null = null,
      wild_zone_changed = false,
      travel_description = "";
    try {
      const gpsSystemPrompt = buildGpsPrompt({
        playerName: cleanTextForAI(player.name || "Герой"),
        actionText: safeActionText,
        intentType: "router",
        intentDescription: safeActionText,
        currentYear: session.game_year || 1248, currentMonth: session.game_month || 5,
        currentDay: session.game_day || 14, currentHour: session.game_hour || 10,
        currentMinute: session.game_minute || 0,
        currentLocation: currentLocationName, currentState: currentStateName,
        currentWildZone,
        wantsLocationChange: false, locationChangeDescription: "",
        availableLocations,
      });
      const gpsResp = await callAI(gpsSystemPrompt, "Определи время.", openrouterApiKey, 2, gpsModel);
      const gpsParsed = parseAIJson(gpsResp);
      if (gpsParsed) {
        time_passed_minutes = Math.max(0, Math.min(1440, Number(gpsParsed.time_minutes) || 0));
        if (gpsParsed.location_changed === true) {
          if (gpsParsed.is_wild_zone === true && gpsParsed.new_location_name) {
            // Переход в дикую зону (лес, пещера, поле)
            wild_zone_changed = true;
            new_wild_zone = gpsParsed.new_location_name;
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Wild zone: ${new_wild_zone}`);
          } else if (gpsParsed.new_location_id) {
            // Переход в именованную локацию
            location_changed = true;
            new_location_id = gpsParsed.new_location_id;
            wild_zone_changed = true;
            new_wild_zone = null; // очищаем дикую зону
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Location change → ${new_location_id}`);
          }
        }
      }
    } catch (e) { /* ignore GPS errors, game continues */ }


    // ============================================
    // ШАГ 2: Game Engine
    // ============================================
    console.log(`[${requestId}] [STEP 2] Game Engine...`);

    // Загрузка навыков игрока для математических бонусов движка (урон, попадание, сбор, время)
    const { data: pSkills } = await supabase
      .from("player_skills")
      .select("skill_key, level, effects")
      .eq("player_id", player.id);
    const skillsMap: Record<string, { level: number; effects: Record<string, number> }> = {};
    if (pSkills) {
      for (const ps of pSkills) {
        skillsMap[ps.skill_key] = { level: ps.level, effects: ps.effects || {} };
      }
    }

    // Сокращение времени на действия от навыков (собирательство, выживание, горное дело и т.д.)
    if (time_passed_minutes > 0) {
      let maxTimeRedPct = 0;
      for (const s of Object.values(skillsMap)) {
        if (s.effects?.time_reduction_pct && s.effects.time_reduction_pct > maxTimeRedPct) {
          maxTimeRedPct = s.effects.time_reduction_pct;
        }
      }
      if (maxTimeRedPct > 0) {
        const reduced = Math.round(time_passed_minutes * (1 - maxTimeRedPct / 100));
        console.log(`[${requestId}] [SKILLS] Time reduced by ${maxTimeRedPct}% from ${time_passed_minutes}m to ${reduced}m`);
        time_passed_minutes = Math.max(1, reduced);
      }
    }

    const engineResult = executeEngine({
      router_output: {
        ...routerResult,
        raw_action_text: safeActionText,
      },
      session: {
        id: session_id,
        difficulty: session.difficulty || "normal",
        is_pvp_enabled: session.is_pvp_enabled || false,
        game_year: session.game_year || 1248, game_month: session.game_month || 5,
        game_day: session.game_day || 14, game_hour: session.game_hour || 10,
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
        skills: skillsMap,
      },
      targets: {
        players: new Map((allPlayers || []).map((p: any) => [p.id, p])),
        npcs: new Map(allNpcs.map((n: any) => [n.id, n])),
        location_items: new Map(),
      },
    });
    if (statAllocatedFact) {
      if (!engineResult.raw_system_facts) engineResult.raw_system_facts = [];
      engineResult.raw_system_facts.push(statAllocatedFact);
      if (!engineResult.system_facts) engineResult.system_facts = engineResult.raw_system_facts;
      else engineResult.system_facts.push(statAllocatedFact);
    }
    console.log(`[${requestId}] [STEP 2] ⚙️ Engine: mutations=${JSON.stringify(engineResult.mutations.map((m: any) => m.type))}, facts=${JSON.stringify(engineResult.raw_system_facts)}`);

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
        year: session.game_year || 1248, month: session.game_month || 5, day: session.game_day || 14,
        hour: session.game_hour || 10, minute: session.game_minute || 0,
      }, time_passed_minutes);
      await supabase.from("sessions").update({
        game_year: nt.year, game_month: nt.month, game_day: nt.day,
        game_hour: nt.hour, game_minute: nt.minute,
      }).eq("id", session_id);
      session.game_year = nt.year;
      session.game_month = nt.month;
      session.game_day = nt.day;
      session.game_hour = nt.hour;
      session.game_minute = nt.minute;
    }
    if (location_changed && new_location_id) {
      await supabase.from("sessions").update({
        current_location_id: new_location_id,
        current_wild_zone: null, // вернулись в именованную локацию
        current_wild_zone_description: null,
      }).eq("id", session_id);

      // Спутники и члены отряда перемещаются вместе с игроком в новую локацию
      try {
        const { data: compNpcs } = await supabase
          .from("npcs")
          .select("id, status_tags, role")
          .eq("world_id", session.world_id);
        const companionIds = (compNpcs || [])
          .filter((n: any) =>
            n.role === "companion" ||
            (Array.isArray(n.status_tags) && (n.status_tags.includes("спутник") || n.status_tags.includes("в_отряде") || n.status_tags.includes("питомец") || n.status_tags.includes("приручен")))
          )
          .map((n: any) => n.id);

        if (companionIds.length > 0) {
          await supabase.from("npcs").update({ location_id: new_location_id }).in("id", companionIds);
          console.log(`[${requestId}] [COMPANION] Moved ${companionIds.length} companion(s) to new location ${new_location_id}`);
        }
      } catch (moveErr) {
        console.warn(`[${requestId}] [COMPANION] Failed to move companions:`, moveErr);
      }
    }

    if (wild_zone_changed && new_wild_zone) {
      await supabase.from("sessions").update({
        current_wild_zone: new_wild_zone,
        current_wild_zone_description: travel_description || null,
      }).eq("id", session_id);
      currentLocationName = new_wild_zone;
      session.current_wild_zone = new_wild_zone;
      allNpcs = allNpcs.filter((n: any) =>
        isCompanionNpc(n) ||
        n.is_hostile === true ||
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["дикий", "монстр", "дикая_зона", "зверь", "хищник"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] Player entered wild zone: ${new_wild_zone}`);
    }


    // ============================================
    // АВТОНОМНЫЕ ЭКСПЕДИЦИИ NPC (0 токенов, Lazy Calendar Simulation)
    // ============================================
    let expeditionEvents: any[] = [];
    if (time_passed_minutes > 0 && session.world_id) {
      try {
        expeditionEvents = await resolveNpcBackgroundActivities({
          supabase,
          world_id: session.world_id,
          current_game_time: {
            year: session.game_year || 1248,
            month: session.game_month || 5,
            day: session.game_day || 14,
            hour: session.game_hour || 10,
            minute: session.game_minute || 0,
          },
        });
      } catch (expErr) {
        console.warn(`[${requestId}] resolveNpcBackgroundActivities failed:`, expErr);
      }
    }

    // ============================================
    // ИНИЦИАТИВА СПУТНИКОВ В ТЕКУЩЕЙ СЦЕНЕ (Мирные действия)
    // ============================================
    let companionAction: any = null;
    try {
      companionAction = await handleCompanionInSceneAction({
        supabase,
        player_action_text: safeActionText,
        acting_player_name: player.name || "Герой",
        location_npcs: allNpcs,
        session_id,
      });
      console.log(`[${requestId}] [COMPANION] 🤝 Checked:`, companionAction ? `${companionAction.npc_name} did: ${companionAction.action_description}` : "none (no party companions in scene)");
    } catch (compErr) {
      console.warn(`[${requestId}] Companion action failed:`, compErr);
    }

    // ============================================
    // ДИНАМИЧЕСКИЕ НАВЫКИ ИГРОКА (1..100)
    // ============================================
    let skillProgress: any = null;
    try {
      const detectedSkill = detectSkillFromAction({
        action_text: safeActionText,
        action_type: routerResult.actions[0]?.type,
        skill_hint: routerResult.skill_hint,
      });

      if (detectedSkill) {
        const xpAmount = routerResult.actions.length > 0 ? 35 : 20;
        const { data: skillRes, error: skillErr } = await supabase.rpc("add_player_skill_xp", {
          p_player_id: player.id,
          p_skill_key: detectedSkill.key,
          p_skill_name: detectedSkill.name,
          p_xp_amount: xpAmount,
        });

        if (!skillErr && skillRes?.success) {
          skillProgress = skillRes;
          console.log(`[${requestId}] [SKILL] ${detectedSkill.name} +${xpAmount} XP (Lvl ${skillRes.level}${skillRes.leveled_up ? ' - LEVEL UP!' : ''})`);
        }
      }
    } catch (skillExc) {
      console.warn(`[${requestId}] Skill progression failed:`, skillExc);
    }

    // ============================================
    // ПРОКАЧКА УРОВНЯ ПЕРСОНАЖА (1..100, +2 ОХ, HP/MP)
    // ============================================
    let playerLevelUp: any = null;
    try {
      const isCombatAction = routerResult.actions.some((a: any) => a.type === "attack");
      const baseTurnXp = isCombatAction ? 50 : 25;
      const currentLevel = player.level || 1;
      const currentXp = (player.xp || 0) + baseTurnXp;
      const xpNeeded = currentLevel * 100;

      if (currentXp >= xpNeeded && currentLevel < 100) {
        const newLevel = currentLevel + 1;
        const leftoverXp = currentXp - xpNeeded;
        const newStatPoints = (player.stat_points || 0) + 2;

        const conVal = player.stats?.CON || 10;
        const conMod = Math.floor((conVal - 10) / 2);
        const hpGain = Math.max(1, 5 + conMod);
        const newMaxHp = (player.max_hp || 10) + hpGain;
        const newHp = Math.min(newMaxHp, (player.hp || 10) + hpGain);

        const intVal = player.stats?.INT || 10;
        const newMaxMp = Math.max(20, intVal * 2 + newLevel * 5);
        const newMp = Math.min(newMaxMp, (player.mp || 50) + 15);

        const { error: lvlUpdateErr } = await supabase.from("players").update({
          level: newLevel,
          xp: leftoverXp,
          stat_points: newStatPoints,
          max_hp: newMaxHp,
          hp: newHp,
          max_mp: newMaxMp,
          mp: newMp,
          updated_at: new Date().toISOString(),
        }).eq("id", player.id);

        if (lvlUpdateErr) {
          console.error(`[${requestId}] [LEVEL_UP] DB update error:`, lvlUpdateErr);
        } else {
          player.level = newLevel;
          player.xp = leftoverXp;
          player.stat_points = newStatPoints;
          player.max_hp = newMaxHp;
          player.hp = newHp;
          player.max_mp = newMaxMp;
          player.mp = newMp;
        }

        playerLevelUp = {
          old_level: currentLevel,
          new_level: newLevel,
          stat_points_gained: 2,
          total_stat_points: newStatPoints,
          hp_gained: hpGain,
          max_hp: newMaxHp,
          max_mp: newMaxMp,
        };
        console.log(`[${requestId}] [LEVEL_UP] Player ${player.name} leveled up to ${newLevel}! (+2 stat points)`);
      } else {
        const { error: xpUpdateErr } = await supabase.from("players").update({
          xp: currentXp,
          updated_at: new Date().toISOString(),
        }).eq("id", player.id);
        if (xpUpdateErr) {
          console.error(`[${requestId}] [XP_UPDATE] DB update error:`, xpUpdateErr);
        } else {
          player.xp = currentXp;
        }
      }
    } catch (lvlErr) {
      console.warn(`[${requestId}] Leveling check failed:`, lvlErr);
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
        game_year: session.game_year || 1248, game_month: session.game_month || 5,
        game_day: session.game_day || 14, game_hour: session.game_hour || 10,
        game_minute: session.game_minute || 0,
        current_location_id: session.current_location_id,
      },
      location: { name: currentLocationName || currentWildZone || "Открытый мир", weather: routerInput.weather?.description || null },
      players: (allPlayers || []).map((p: any) => ({
        id: p.id, name: p.name || "Герой", hp: p.hp ?? 100, max_hp: p.max_hp ?? 100, inventory: p.inventory || [],
      })),
      npcs: (session.current_wild_zone ? allNpcs.filter((n: any) => isCompanionNpc(n) || n.is_hostile === true || (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["дикий", "монстр", "дикая_зона", "зверь", "хищник"].includes(String(t).toLowerCase())))) : allNpcs).map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "Существо",
        role: n.role || "Обыватель",
        category: n.category,
        status_tags: n.status_tags || [],
        is_alive: n.is_alive,
        is_hostile: n.is_hostile || false,
        appearance: n.appearance || null,
        background: n.background || null,
        habits: n.habits || null,
        catchphrases: Array.isArray(n.catchphrases) ? n.catchphrases : [],
        current_activity: n.current_activity || null,
      })),
      atmosphere: routerResult.atmosphere || { sounds: [], visuals: [] },
      time_passed_minutes,
      encounter_alert: null,
      storyline: sessionStoryline ? {
        title: sessionStoryline.title,
        prologue: sessionStoryline.prologue,
        current_arc: sessionStoryline.arcs?.[sessionStoryline.current_arc_index || 0] || null,
      } : null,
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

    // 4) Companion action message
    if (companionAction) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "npc",
        sender_name: companionAction.npc_name,
        content: `${companionAction.dialogue}\n\n*${companionAction.action_description}*`,
        metadata: { is_companion: true, item_obtained: companionAction.item_obtained },
      });
    }

    // 5) Expedition events messages
    for (const ev of expeditionEvents) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "master",
        sender_name: "Мир",
        content: `📜 **Событие мира**: ${ev.summary}`,
        metadata: { type: "npc_expedition", npc_id: ev.npc_id, loot: ev.loot, leveled_up: ev.leveled_up },
      });
    }

    // 6) Skill level up notification
    if (skillProgress?.leveled_up) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "Система",
        content: `🔔 **[Навык повышен!]** ${skillProgress.name} достиг ур. ${skillProgress.level}! (+${skillProgress.level}% к эффективности)`,
        metadata: { type: "skill_level_up", skill_key: skillProgress.skill_key, level: skillProgress.level },
      });
    }

    // 7) Player level up notification
    if (playerLevelUp) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "Система",
        content: `🎉 **[Новый уровень!]** Поздравляем, вы достигли ${playerLevelUp.new_level} уровня!\nПолучено +2 свободных очка характеристик (ОХ). Макс. HP: ${playerLevelUp.max_hp}, Макс. MP: ${playerLevelUp.max_mp}.`,
        metadata: { type: "player_level_up", ...playerLevelUp },
      });
    }

    // 7.1) Storyline Progress Evaluation (автоматическое отслеживание целей арки)
    let storyProgressResult: any = null;
    if (sessionStoryline && sessionStoryline.status !== "completed" && sessionStoryline.status !== "sandbox") {
      try {
        const actingPlayerTruth = systemTruth.player_truths[player.id];
        const narrativeForPlayer = narratorOutput.players[player.id] || "";
        storyProgressResult = evaluateStoryProgress({
          storyline: sessionStoryline,
          playerAction: safeActionText,
          systemFacts: actingPlayerTruth?.knowledge || [],
          narrativeText: narrativeForPlayer,
          currentLocation: currentLocationName || "",
          nearbyNpcs: allNpcs,
        });

        if (storyProgressResult.completedGoalTitles.length > 0 || storyProgressResult.advancedArc) {
          console.log(`[${requestId}] [STORY] Progress evaluated: ${storyProgressResult.completedGoalTitles.length} goals completed, arcAdvanced=${storyProgressResult.advancedArc}`);
          const currentPlotStage = storyProgressResult.updatedStoryline.arcs?.[storyProgressResult.updatedStoryline.current_arc_index]?.title || null;
          await supabase.from("sessions").update({
            storyline: storyProgressResult.updatedStoryline,
            current_plot_stage: currentPlotStage,
          }).eq("id", session_id);

          for (const announcement of storyProgressResult.announcements) {
            await supabase.from("messages").insert({
              session_id,
              sender_type: "system",
              sender_name: "Сюжет",
              content: announcement,
              metadata: {
                type: "story_progress",
                completed_goals: storyProgressResult.completedGoalTitles,
                advanced_arc: storyProgressResult.advancedArc,
                arc_index: storyProgressResult.updatedStoryline.current_arc_index,
              },
            });
          }
        }
      } catch (storyEvalErr) {
        console.warn(`[${requestId}] Failed to evaluate story progress:`, storyEvalErr);
      }
    }

    // 8) NPC Relationships & Memories update
    let npcUpdates: any[] = [];
    try {
      npcUpdates = await processNpcInteractions({
        supabase,
        session_id,
        acting_player: player,
        action_text: safeActionText,
        router_result: routerResult,
        engine_result: engineResult,
        narrator_output: narratorOutput,
        all_npcs: allNpcs,
        openrouter_api_key: openrouterApiKey,
        chat_model: dmModel,
      });
      if (npcUpdates.length > 0) {
        console.log(`[${requestId}] [NPC] Updated ${npcUpdates.length} NPC relationship(s):`, npcUpdates.map(u => `${u.npc_name}: ${u.delta > 0 ? '+' : ''}${u.delta} -> ${u.score} (${u.tier})`));
      }
    } catch (npcErr) {
      console.warn(`[${requestId}] [NPC] processNpcInteractions failed:`, npcErr);
    }

    // 9) Companion Invitation & Pet Taming interactions
    let companionInviteHandled = false;
    try {
      const companionInviteResult = await handleCompanionInvitation({
        supabase,
        player_action_text: safeActionText,
        acting_player_name: player.name || "Герой",
        acting_player_id: player.id,
        location_npcs: allNpcs,
        openrouter_api_key: openrouterApiKey,
        model: dmModel,
      });
      if (companionInviteResult) {
        companionInviteHandled = true;
        await supabase.from("messages").insert({
          session_id,
          sender_type: "master",
          sender_name: companionInviteResult.npc_name,
          content: companionInviteResult.dialogue,
          metadata: {
            type: "companion_invitation",
            npc_id: companionInviteResult.npc_id,
            joined_party: companionInviteResult.joined_party,
          },
        });
      }
    } catch (inviteErr) {
      console.warn(`[${requestId}] [COMPANION] handleCompanionInvitation failed:`, inviteErr);
    }

    // 10) Pet Taming interaction (интеллектуальное приручение зверя/монстра)
    try {
      const targetCreature = allNpcs.find((n: any) =>
        n.category === "beast" || n.category === "monster" ||
        (n.race && ["зверь", "волк", "животное", "монстр"].some(r => n.race.toLowerCase().includes(r)))
      );
      if (targetCreature) {
        const tamingResult = await evaluatePetTamingAttempt({
          supabase,
          acting_player: {
            id: player.id,
            name: player.name || "Герой",
            stats: player.stats,
            skills: skillsMap,
          },
          target_creature: targetCreature,
          action_text: safeActionText,
        });

        if (tamingResult && tamingResult.is_taming_action) {
          companionInviteHandled = true;
          await supabase.from("messages").insert({
            session_id,
            sender_type: "master",
            sender_name: "Приручение",
            content: tamingResult.narrative_feedback,
            metadata: {
              type: "pet_taming",
              creature_id: targetCreature.id,
              result: tamingResult,
            },
          });
        }
      }
    } catch (tameErr) {
      console.warn(`[${requestId}] [PET] evaluatePetTamingAttempt failed:`, tameErr);
    }

    // 11) Proactive Companion Offer (NPC сам предлагает пойти в путь при высоком доверии)
    try {
      if (!companionInviteHandled) {
        const proactiveOffer = await checkNpcProactiveCompanionOffer({
          supabase,
          acting_player_name: player.name || "Герой",
          acting_player_id: player.id,
          location_npcs: allNpcs,
          openrouter_api_key: openrouterApiKey,
          model: dmModel,
        });
        if (proactiveOffer) {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "master",
            sender_name: proactiveOffer.npc_name,
            content: proactiveOffer.dialogue,
            metadata: {
              type: "proactive_companion_offer",
              npc_id: proactiveOffer.npc_id,
            },
          });
        }
      }
    } catch (proErr) {
      console.warn(`[${requestId}] [COMPANION] checkNpcProactiveCompanionOffer failed:`, proErr);
    }

    // ============================================
    // D&D БОЕВАЯ ОЧЕРЕДЬ ХОДОВ (TURN QUEUE С ИНИЦИАТИВОЙ NPC, СПУТНИКОВ И ПИТОМЦЕВ)
    // ============================================
    let npcCombatTurns: any[] = [];
    try {
      const isCombat = routerResult.actions.some((a: any) => a.type === "attack") ||
        allNpcs.some((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);

      const { data: existingTurns } = await supabase.from("turn_queue")
        .select("id, player_id, npc_id, entity_type, status, initiative")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

      if (isCombat) {
        // Подключаем к бою враждебных NPC с броском инициативы
        const activeHostileNpcs = allNpcs.filter((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);
        for (const hostNpc of activeHostileNpcs) {
          const alreadyInQueue = existingTurns?.some((t: any) => t.npc_id === hostNpc.id);
          if (!alreadyInQueue) {
            const dexMod = Math.floor(((hostNpc.stats?.DEX || 10) - 10) / 2);
            const d20 = Math.floor(Math.random() * 20) + 1;
            const initRoll = d20 + dexMod;
            await supabase.from("turn_queue").insert({
              session_id,
              npc_id: hostNpc.id,
              player_id: null,
              entity_type: "npc",
              initiative: initRoll,
              status: "waiting",
              round_number: 1,
            });
          }
        }

        // Подключаем к бою спутников и прирученных питомцев игрока
        const activeCompanions = allNpcs.filter((n: any) =>
          !n.is_hostile &&
          n.is_alive !== false &&
          (n.hp ?? 10) > 0 &&
          (n.role === "companion" || (Array.isArray(n.status_tags) && (n.status_tags.includes("спутник") || n.status_tags.includes("в_отряде") || n.status_tags.includes("питомец") || n.status_tags.includes("приручен"))))
        );
        for (const compNpc of activeCompanions) {
          const alreadyInQueue = existingTurns?.some((t: any) => t.npc_id === compNpc.id);
          if (!alreadyInQueue) {
            const dexMod = Math.floor(((compNpc.stats?.DEX || 12) - 10) / 2);
            const d20 = Math.floor(Math.random() * 20) + 1;
            const initRoll = d20 + dexMod;
            await supabase.from("turn_queue").insert({
              session_id,
              npc_id: compNpc.id,
              player_id: null,
              entity_type: "npc",
              initiative: initRoll,
              status: "waiting",
              round_number: 1,
            });
          }
        }
      }

      if (!existingTurns || existingTurns.length === 0) {
        // Очереди ещё нет — создаём для игроков сессии
        if (allPlayers && allPlayers.length > 1) {
          const nextPlayer = allPlayers.find((p: any) => p.id !== player.id) || allPlayers[0];
          for (const p of allPlayers) {
            const isActor = p.id === player.id;
            const isNext = p.id === nextPlayer.id && !isActor;
            await supabase.from("turn_queue").insert({
              session_id,
              player_id: p.id,
              entity_type: "player",
              initiative: p.initiative || 10,
              status: isActor ? "completed" : (isNext ? "active" : "waiting"),
              resolved_at: isActor ? new Date().toISOString() : null,
              parsed_action: isActor ? routerResult : null,
              roll_result: isActor ? engineResult : null,
            });
          }
        }
      } else {
        // Добавляем игроков, которых ещё нет в очереди
        if (allPlayers && allPlayers.length > 1) {
          const existingPids = new Set(existingTurns.filter((t: any) => t.player_id).map((t: any) => t.player_id));
          for (const p of allPlayers) {
            if (!existingPids.has(p.id)) {
              await supabase.from("turn_queue").insert({
                session_id,
                player_id: p.id,
                entity_type: "player",
                initiative: p.initiative || 10,
                status: "waiting",
              });
            }
          }
        }

        // Завершаем текущий ход игрока
        await supabase.from("turn_queue").update({
          status: "completed",
          resolved_at: new Date().toISOString(),
          parsed_action: routerResult,
          roll_result: engineResult,
        }).eq("session_id", session_id).eq("player_id", player.id);

        // Ищем следующий ход со статусом 'waiting'
        let { data: nextTurn } = await supabase.from("turn_queue")
          .select("id, player_id, npc_id, entity_type, status, initiative")
          .eq("session_id", session_id)
          .eq("status", "waiting")
          .order("initiative", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        // Если следующий ход принадлежит NPC — выполняем боевые ходы NPC
        while (nextTurn && nextTurn.entity_type === "npc" && nextTurn.npc_id) {
          const currentTurnNpcId = nextTurn.npc_id;
          const turnNpc = allNpcs.find((n: any) => n.id === currentTurnNpcId);
          if (turnNpc && turnNpc.is_alive !== false && (turnNpc.hp ?? 10) > 0) {
            const isCompanion = !turnNpc.is_hostile &&
              (turnNpc.role === "companion" || (Array.isArray(turnNpc.status_tags) && (turnNpc.status_tags.includes("спутник") || turnNpc.status_tags.includes("в_отряде") || turnNpc.status_tags.includes("питомец") || turnNpc.status_tags.includes("приручен"))));

            if (isCompanion) {
              // ХОД СПУТНИКА / ПИТОМЦА: атакует враждебного моба (например, волка) в помощь игроку!
              const hostileMobs = allNpcs.filter((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);
              if (hostileMobs.length > 0) {
                const targetMob = hostileMobs[0];
                const attackResult = executeCompanionAttack({
                  companion: turnNpc,
                  targetMob: {
                    id: targetMob.id,
                    name: targetMob.name || "Враг",
                    hp: targetMob.hp ?? 10,
                    max_hp: targetMob.max_hp ?? 10,
                    armor_class: targetMob.armor_class || 11,
                  },
                });

                if (attackResult.is_hit && attackResult.damage > 0) {
                  targetMob.hp = attackResult.remaining_mob_hp;
                  if (attackResult.is_mob_defeated) {
                    targetMob.is_alive = false;
                  }
                  await supabase.from("npcs").update({
                    hp: targetMob.hp,
                    is_alive: targetMob.is_alive,
                  }).eq("id", targetMob.id);

                  // Бонус к отношениям со спутником за помощь в бою (+1)
                  try {
                    const { data: rel } = await supabase.from("npc_relationships").select("score").eq("npc_id", turnNpc.id).eq("player_id", player.id).maybeSingle();
                    if (rel) {
                      await supabase.from("npc_relationships").update({ score: rel.score + 1 }).eq("npc_id", turnNpc.id).eq("player_id", player.id);
                    }
                  } catch (e) { /* ignore */ }

                  // Прокачка уровня питомца за участие в бою (1..100)
                  const isPet = Array.isArray(turnNpc.status_tags) && turnNpc.status_tags.includes("питомец");
                  if (isPet) {
                    try {
                      const xpAward = attackResult.is_mob_defeated ? 50 : 20;
                      const petXpRes = awardPetCombatXp(turnNpc, xpAward);
                      turnNpc.level = petXpRes.new_level;
                      turnNpc.max_hp = petXpRes.new_max_hp;
                      turnNpc.hp = petXpRes.new_hp;
                      turnNpc.xp = petXpRes.xp;

                      await supabase.from("npcs").update({
                        level: turnNpc.level,
                        max_hp: turnNpc.max_hp,
                        hp: turnNpc.hp,
                        xp: turnNpc.xp,
                      }).eq("id", turnNpc.id);

                      if (petXpRes.leveled_up) {
                        await supabase.from("messages").insert({
                          session_id,
                          sender_type: "system",
                          sender_name: "Система",
                          content: `🎉 **[Питомец повысил уровень!]** ${turnNpc.name} достиг ${turnNpc.level} уровня! Макс. здоровье: ${turnNpc.max_hp} HP.`,
                          metadata: { type: "pet_level_up", pet_id: turnNpc.id, new_level: turnNpc.level },
                        });
                      }
                    } catch (petXpErr) {
                      console.warn(`[${requestId}] [PET_XP] Failed to award pet XP:`, petXpErr);
                    }
                  }
                }

                await supabase.from("messages").insert({
                  session_id,
                  sender_type: "master",
                  sender_name: turnNpc.name,
                  content: attackResult.log_message,
                  metadata: {
                    type: "companion_combat_turn",
                    npc_id: turnNpc.id,
                    target_mob_id: targetMob.id,
                    attack_result: attackResult,
                  },
                });

                npcCombatTurns.push(attackResult);
              }
            } else {
              // ХОД ВРАЖДЕБНОГО NPC (атака игрока)
              const battlefieldPlayers = (allPlayers || []).map((p: any) => ({
                id: p.id,
                name: p.name || "Герой",
                hp: p.hp ?? 10,
                max_hp: p.max_hp ?? 10,
                armor_class: p.armor_class || 10,
                class: p.class,
              }));

              const decision = await decideNpcCombatAction({
                npc: turnNpc,
                players: battlefieldPlayers,
                openrouter_api_key: openrouterApiKey,
                model: dmModel,
              });

              const targetPlayer = battlefieldPlayers.find((p: any) => p.id === decision.target_player_id) || battlefieldPlayers[0];

              const attackResult = executeNpcAttack({
                npc: turnNpc,
                targetPlayer,
                decision,
              });

              if (attackResult.is_hit && attackResult.damage > 0) {
                const { data: curTarget } = await supabase.from("players").select("hp").eq("id", targetPlayer.id).single();
                if (curTarget) {
                  const updatedHp = Math.max(0, (curTarget.hp ?? 10) - attackResult.damage);
                  await supabase.from("players").update({ hp: updatedHp }).eq("id", targetPlayer.id);
                }
              }

              await supabase.from("messages").insert({
                session_id,
                sender_type: "master",
                sender_name: "Бой",
                content: attackResult.log_message,
                metadata: {
                  type: "npc_combat_turn",
                  npc_id: turnNpc.id,
                  target_player_id: targetPlayer.id,
                  attack_result: attackResult,
                },
              });

              npcCombatTurns.push(attackResult);
            }
          }

          // Помечаем ход NPC как выполненный
          await supabase.from("turn_queue").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
          }).eq("id", nextTurn.id);

          // Проверяем следующий ход
          const nextQuery = await supabase.from("turn_queue")
            .select("id, player_id, npc_id, entity_type, status, initiative")
            .eq("session_id", session_id)
            .eq("status", "waiting")
            .order("initiative", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          nextTurn = nextQuery.data;
        }

        if (nextTurn) {
          await supabase.from("turn_queue").update({ status: "active" }).eq("id", nextTurn.id);
        } else {
          // Раунд завершен! Перезапускаем очередь
          const { data: allSessionTurns } = await supabase.from("turn_queue")
            .select("id, entity_type, initiative")
            .eq("session_id", session_id)
            .order("initiative", { ascending: false });

          if (allSessionTurns && allSessionTurns.length > 0) {
            const firstTurn = allSessionTurns[0];
            const otherTurnIds = allSessionTurns.slice(1).map((t: any) => t.id);
            if (otherTurnIds.length > 0) {
              await supabase.from("turn_queue").update({ status: "waiting", resolved_at: null }).in("id", otherTurnIds);
            }
            await supabase.from("turn_queue").update({ status: "active", resolved_at: null }).eq("id", firstTurn.id);
          }
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
      npc_updates: npcUpdates,
      companion_action: companionAction,
      expedition_events: expeditionEvents,
      skill_progress: skillProgress,
      level_up: playerLevelUp,
      npc_combat_turns: npcCombatTurns,
      game_time: systemTruth.environment.time,
      time_minutes: time_passed_minutes,
      location_changed: location_changed || wild_zone_changed,
      new_location_id,
      current_location_name: currentLocationName,
      current_state_name: currentStateName,
      current_wild_zone: session.current_wild_zone || null,
      story_progress: storyProgressResult ? {
        completed_goals: storyProgressResult.completedGoalTitles,
        advanced_arc: storyProgressResult.advancedArc,
        current_arc_index: storyProgressResult.updatedStoryline.current_arc_index,
      } : null,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });


  } catch (err: any) {
    console.error(`[${requestId}] ❌ ERROR:`, err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
