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
import { parsePlayerIntent, buildRouterHeuristicFallback, classifyIntentWithAI } from "./steps/step1_router.ts";
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
import { ensureLocationMapAndTerrain, TERRAIN_MODIFIERS, TerrainType } from "../_shared/fog_location_generator.ts";
import { executeRoundCycleNpcSimulation } from "../_shared/npc_world_simulator.ts";
import { parseStatAllocationIntent } from "./steps/stat_allocation_utils.ts";
import { advanceTime } from "./steps/time_utils.ts";

import { DISTANCE_TIER, fogPickNarrative, fogGetEffectiveThresholds, fogGetDistanceTier, fogExtractSpeech } from "./steps/fog_of_war_utils.ts";

function getPlayerPartyId(p: any, session: any): string | null {
  if (p?.party_id) return String(p.party_id);
  const groups = Array.isArray(session?.party_groups) ? session.party_groups : [];
  for (const g of groups) {
    if (Array.isArray(g.members) && g.members.includes(p?.id)) {
      return g.id;
    }
  }
  return null;
}

function arePlayersInSameParty(p1: any, p2: any, session: any): boolean {
  if (!p1 || !p2 || p1.id === p2.id) return false;
  const party1 = getPlayerPartyId(p1, session);
  const party2 = getPlayerPartyId(p2, session);
  return !!party1 && party1 === party2;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "google/gemma-4-31b-it:free";

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
          temperature: 0.5,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = new Error(`AI API error: ${response.status}`);
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          throw lastError;
        }
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
// Main Handler — 5-шаговый конвейер
// ============================================
serve(async (req: any) => {
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
      .select("*, worlds(owner_id, settings)")
      .eq("id", session_id)
      .single();
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sessionStoryline = session.storyline || session.worlds?.settings?.storyline || null;

    // Resolve API key + models:
    // Поддержка режима общего ключа хоста (ai_key_mode: 'host' | 'individual')
    // По умолчанию 'host': ходы всех игроков используют ключ и модели создателя сессии/мира,
    // если не выбран режим 'individual' (каждый со своим).
    const aiKeyMode = session.ai_key_mode || 'host';
    const hostUserId = session.worlds?.owner_id || null;

    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    let satelliteModel = AI_MODEL, gpsModel = AI_MODEL, dmModel = AI_MODEL;

    // 1. Загрузка настроек текущего игрока (если есть)
    let playerSettings: any = null;
    if (player.user_id) {
      const { data: us } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", player.user_id).maybeSingle();
      playerSettings = us;
    }

    // 2. Загрузка настроек хоста (создателя мира/сессии)
    let hostSettings: any = null;
    if (hostUserId && hostUserId !== player.user_id) {
      const { data: hs } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", hostUserId).maybeSingle();
      hostSettings = hs;
    } else if (hostUserId && hostUserId === player.user_id) {
      hostSettings = playerSettings;
    }

    // 3. Выбор источника ключа и моделей в зависимости от ai_key_mode
    if (aiKeyMode === 'host') {
      // Приоритет Хоста: сначала ключ и модели создателя сессии
      const targetSettings = hostSettings?.openrouter_key ? hostSettings : playerSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    } else {
      // Режим 'individual': каждый игрок использует свой ключ; если у игрока нет ключа — фоллбэк на ключ хоста
      const targetSettings = playerSettings?.openrouter_key ? playerSettings : hostSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    }

    if (!openrouterApiKey) {
      const errorMsg = aiKeyMode === 'host'
        ? "Не задан OpenRouter API Key создателя сессии. Хост должен указать ключ в настройках аккаунта."
        : "Укажите ваш OpenRouter API Key в настройках аккаунта.";
      return new Response(JSON.stringify({ error: errorMsg, code: "MISSING_API_KEY" }), {
        status: 402, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load location, available locations, lore
    let currentLocationName: string | null = null, currentStateName: string | null = null, currentLocationType: string | null = null;
    const currentWildZone: string | null = session.current_wild_zone || null;
    let parentLocationDanger = "normal";
    let parentLocationName: string | null = null;
    let currentLocationPosX: number | null = null;
    let currentLocationPosY: number | null = null;
    let currentLocationSubzones: any[] = [];

    // Всегда загружаем данные базовой/родительской локации, даже если игрок в дикой зоне
    if (session.current_location_id) {
      try {
        const { data: locData } = await supabase
          .from("locations")
          .select("id, name, type, danger_level, pos_x, pos_y, states(name), subzones(id, name, description, pos_x, pos_y, radius)")
          .eq("id", session.current_location_id)
          .maybeSingle();
        if (locData) {
          parentLocationDanger = locData.danger_level || "normal";
          parentLocationName = locData.name || null;
          currentLocationPosX = typeof locData.pos_x === "number" ? locData.pos_x : null;
          currentLocationPosY = typeof locData.pos_y === "number" ? locData.pos_y : null;
          currentLocationSubzones = Array.isArray(locData.subzones) ? locData.subzones : [];
          if (!currentWildZone) {
            currentLocationName = locData.name;
            currentLocationType = locData.type || null;
          }
          const stateObj = Array.isArray(locData.states) ? locData.states[0] : locData.states;
          currentStateName = stateObj?.name || null;
        }
      } catch (locErr) {
        console.warn(`[${requestId}] Failed to load current location:`, locErr);
      }
    }

    // Если игрок в дикой зоне — берём сохранённый уровень опасности дикой зоны или наследуем от родительского города
    let currentDangerLevel = "normal";
    if (currentWildZone) {
      currentLocationName = currentWildZone;
      currentLocationType = "wild";
      currentDangerLevel = session.current_wild_zone_danger_level || parentLocationDanger || "normal";
    } else {
      currentDangerLevel = parentLocationDanger;
    }

    let availableLocations: {
      id: string;
      name: string;
      type: string;
      state_name: string;
      danger_level?: "safe" | "normal" | "danger" | "lethal";
      pos_x?: number;
      pos_y?: number;
      subzones?: any[];
    }[] = [];
    if (session.world_id) {
      try {
        const { data: statesWithLocs } = await supabase
          .from("states")
          .select("id, name, locations(id, name, type, danger_level, pos_x, pos_y, subzones(id, name, description, pos_x, pos_y, radius))")
          .eq("world_id", session.world_id);
        if (statesWithLocs) {
          for (const s of statesWithLocs) {
            const locs = Array.isArray(s.locations) ? s.locations : [];
            for (const l of locs) {
              availableLocations.push({
                id: l.id,
                name: l.name,
                type: l.type,
                danger_level: l.danger_level || "normal",
                state_name: s.name,
                pos_x: l.pos_x,
                pos_y: l.pos_y,
                subzones: Array.isArray(l.subzones) ? l.subzones : [],
              });
            }
          }
        }
      } catch (locsErr) {
        console.warn(`[${requestId}] Failed to load available locations:`, locsErr);
      }
    }

    // Авто-синхронизация координат игрока, если они рассинхронизировались с текущей локацией сессии
    if (
      !currentWildZone &&
      session.current_location_id &&
      currentLocationPosX !== null &&
      currentLocationPosY !== null
    ) {
      const px = typeof player.pos_x === "number" ? player.pos_x : 0;
      const py = typeof player.pos_y === "number" ? player.pos_y : 0;
      const distToLoc = Math.hypot(px - currentLocationPosX, py - currentLocationPosY);
      if (distToLoc > 120) {
        const activeSub = currentLocationSubzones.find(
          (s: any) => s.id === player.subzone_id || (player.current_zone && s.name?.toLowerCase().includes(player.current_zone.toLowerCase()))
        ) || currentLocationSubzones[0] || null;
        player.pos_x = typeof activeSub?.pos_x === "number" ? activeSub.pos_x : currentLocationPosX;
        player.pos_y = typeof activeSub?.pos_y === "number" ? activeSub.pos_y : currentLocationPosY;
        if (activeSub) {
          player.subzone_id = activeSub.id;
          if (!player.current_zone) player.current_zone = activeSub.name;
        }
        try {
          await supabase.from("players").update({
            pos_x: player.pos_x,
            pos_y: player.pos_y,
            subzone_id: player.subzone_id || null,
            current_zone: player.current_zone || null,
          }).eq("id", player.id);
          console.log(`[${requestId}] [POS_SYNC] Synced out-of-bounds player coords to location "${currentLocationName}": (${player.pos_x}, ${player.pos_y})`);
        } catch (syncErr) {
          console.warn(`[${requestId}] [POS_SYNC] Failed to sync player coords:`, syncErr);
        }
      }
    }

    let loreContext = "";
    if (session.world_id) {
      const { data: loreFiles } = await supabase
        .from("lore_files")
        .select("title, content")
        .eq("world_id", session.world_id)
        .limit(20);

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

        const allLore = relevantLore.length > 0 ? relevantLore : loreFiles.slice(0, 2);
        loreContext = allLore
          .map((f: any) => `### ${f.title}\n${cleanTextForAI(f.content).slice(0, 1500)}`)
          .join("\n\n");
      }
    }

    const { data: recentMsgs } = await supabase.from("messages").select("content, sender_type, sender_name").eq("session_id", session_id).order("created_at", { ascending: false }).limit(8);
    const recentMessages = (recentMsgs || []).reverse().map((m: any) => {
      if (m.sender_type === "master") {
        // Разбиваем на абзацы ДО вызова cleanTextForAI (т.к. cleanTextForAI схлопывает \n\n в пробел),
        // и берём только концовку ответа Мастера (реакция мира / реплика NPC), а не первый абзац,
        // чтобы бесплатные LLM не копировали вступительный абзац прошлого хода слово в слово!
        const rawParagraphs = String(m.content || "")
          .split(/\n\s*\n/)
          .map((p: string) => cleanTextForAI(p))
          .filter(Boolean);
        const summaryPart = rawParagraphs.length >= 2
          ? rawParagraphs.slice(-2).join(" ").slice(-260)
          : cleanTextForAI(m.content || "").slice(-260);
        return `[Итог прошлого шага]: ${summaryPart}`;
      }
      const cleaned = cleanTextForAI(m.content || "");
      return `[${m.sender_name || "Игрок"}]: ${cleaned.slice(0, 240)}`;
    });

    // Load all players in session (for router, engine and system truth context)
    const { data: allPlayersData } = await supabase.from("players").select("*, inventory(*), current_zone").eq("session_id", session_id).order("created_at", { ascending: true });
    const allPlayers = allPlayersData || [];

    // Загружаем карту расстояний зон и тип местности из кэша сессии (заполняется при создании/смене локации)
    let locationMap: Record<string, Record<string, number>> = session.location_map || {};
    let currentTerrain: string | null = session.current_terrain_type || null;

    // Load all NPCs in current location (for router, engine and system truth context)
    let allNpcs: any[] = [];
    if (session.current_location_id) {
      const { data: npcData, error: npcErr } = await supabase.from("npcs")
        .select("id, name, race, class, role, category, hp, max_hp, armor_class, level, is_hostile, status_tags, stats, background, appearance, habits, catchphrases, special_attacks, base_attacks, current_activity, activity_data, last_activity_time, temperament, motivation, current_mood, secrets, rumors, speech_style, daily_routine")
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

    console.log(`[${requestId}] [START] 🎲 Turn for player "${player.name}" (${player.id}) in session "${session_id}". Action: "${safeActionText}"`);
    console.log(`[${requestId}] [LOCATION] 📍 LocationID=${session.current_location_id}, Name="${currentLocationName}", WildZone="${session.current_wild_zone || 'none'}", NPCs present=${allNpcs.length} (${allNpcs.map((n: any) => n.name).join(', ') || 'none'})`);

    // Проверяем, первый ли это ход в сессии (нет сообщений игрока или локация не задана)
    const isFirstTurn = !session.current_location_id || !(recentMsgs || []).some((m: any) => m.sender_type === "player");
    let startingLocationGenerated = false;

    if (isFirstTurn) {
      console.log(`[${requestId}] [STARTING_LOCATION] Generating/ensuring starting location for first turn...`);
      let availableStartingLocations: any[] = [];
      if (session.world_id) {
        try {
          const { data: statesWithLocs, error: stErr } = await supabase
            .from("states")
            .select(`
              id,
              name,
              locations(
                id,
                name,
                type,
                danger_level,
                description,
                pos_x,
                pos_y,
                subzones(id, name, description, pos_x, pos_y, radius)
              )
            `)
            .eq("world_id", session.world_id);

          if (!stErr && statesWithLocs) {
            for (const s of statesWithLocs) {
              const locs = Array.isArray(s.locations) ? s.locations : [];
              for (const l of locs) {
                availableStartingLocations.push({
                  id: l.id,
                  name: l.name,
                  type: l.type,
                  danger_level: l.danger_level || "normal",
                  description: l.description || "",
                  state_name: s.name,
                  pos_x: l.pos_x,
                  pos_y: l.pos_y,
                  subzones: Array.isArray(l.subzones) ? l.subzones : [],
                });
              }
            }
          }
        } catch (stErr) {
          console.warn(`[${requestId}] Failed to load detailed locations from states:`, stErr);
        }

        if (availableStartingLocations.length === 0) {
          try {
            const { data: directLocs, error: dirErr } = await supabase
              .from("locations")
              .select(`
                id,
                name,
                type,
                danger_level,
                description,
                pos_x,
                pos_y,
                states(name),
                subzones(id, name, description, pos_x, pos_y, radius)
              `)
              .eq("world_id", session.world_id);

            if (!dirErr && directLocs) {
              for (const l of directLocs) {
                const st = Array.isArray(l.states) ? l.states[0] : l.states;
                availableStartingLocations.push({
                  id: l.id,
                  name: l.name,
                  type: l.type,
                  danger_level: l.danger_level || "normal",
                  description: l.description || "",
                  state_name: st?.name || "",
                  pos_x: l.pos_x,
                  pos_y: l.pos_y,
                  subzones: Array.isArray(l.subzones) ? l.subzones : [],
                });
              }
            }
          } catch (dirErr) {
            console.warn(`[${requestId}] Failed to load detailed locations directly:`, dirErr);
          }
        }
      }

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
          available_locations: availableStartingLocations,
          openrouter_api_key: openrouterApiKey,
          model: satelliteModel,
        });

        if (startLoc && startLoc.location_id) {
          startingLocationGenerated = true;
          session.current_location_id = startLoc.location_id;
          currentLocationName = startLoc.location_name;
          currentLocationType = startLoc.location_type;
          currentStateName = startLoc.state_name;
          session.game_year = startLoc.game_time.year;
          session.game_month = startLoc.game_time.month;
          session.game_day = startLoc.game_time.day;
          session.game_hour = startLoc.game_time.hour;
          session.game_minute = startLoc.game_time.minute;

          const playerUpdate: Record<string, any> = {};
          if (startLoc.pos_x !== undefined) {
            playerUpdate.pos_x = startLoc.pos_x;
            player.pos_x = startLoc.pos_x;
          }
          if (startLoc.pos_y !== undefined) {
            playerUpdate.pos_y = startLoc.pos_y;
            player.pos_y = startLoc.pos_y;
          }
          if (startLoc.subzone_id) {
            playerUpdate.subzone_id = startLoc.subzone_id;
            player.subzone_id = startLoc.subzone_id;
          }
          if (startLoc.subzone_name) {
            playerUpdate.current_zone = startLoc.subzone_name;
            player.current_zone = startLoc.subzone_name;
          } else if (startLoc.location_name) {
            playerUpdate.current_zone = startLoc.location_name;
            player.current_zone = startLoc.location_name;
          }

          if (Object.keys(playerUpdate).length > 0) {
            try {
              await supabase.from("players").update(playerUpdate).eq("id", player.id);
            } catch (pUpdErr) {
              console.warn(`[${requestId}] [STARTING_LOCATION] Failed to update player position:`, pUpdErr);
            }
          }

          if (startLoc.initial_npcs?.length) {
            allNpcs = startLoc.initial_npcs;
          } else if (session.current_location_id) {
            try {
              const { data: npcData } = await supabase.from("npcs")
                .select("id, name, race, class, role, category, hp, max_hp, armor_class, level, is_hostile, status_tags, stats, background, appearance, habits, catchphrases, special_attacks, base_attacks, current_activity, activity_data, last_activity_time, temperament, motivation, current_mood, secrets, rumors, speech_style, daily_routine")
                .eq("location_id", session.current_location_id);
              if (npcData && npcData.length > 0) {
                allNpcs = npcData.map((n: any) => ({
                  ...n,
                  is_alive: (n.hp ?? 10) > 0,
                }));
              }
            } catch (npcReloadErr) {
              console.warn(`[${requestId}] Failed to reload NPCs for chosen location:`, npcReloadErr);
            }
          }

          if (!availableLocations.some((al) => al.id === startLoc.location_id)) {
            availableLocations.push({
              id: startLoc.location_id,
              name: startLoc.location_name,
              type: startLoc.location_type,
              state_name: startLoc.state_name,
            });
          }

          console.log(`[${requestId}] [STARTING_LOCATION] Spawned player ${player.name} in location "${currentLocationName}" (${currentStateName}), subzone: "${startLoc.subzone_name || 'none'}" at (${player.pos_x}, ${player.pos_y})`);

          try {
            const startMap = await ensureLocationMapAndTerrain({
              supabase,
              sessionId: session_id,
              locationId: startLoc.location_id,
              locationName: startLoc.location_name,
              locationType: startLoc.location_type,
              openrouterApiKey,
              model: satelliteModel,
            });
            locationMap = startMap.location_map;
            currentTerrain = startMap.terrain_type;
            session.location_map = locationMap;
            session.current_terrain_type = currentTerrain;
          } catch (startMapErr) {
            console.warn(`[${requestId}] [STARTING_LOCATION] Failed to generate location_map:`, startMapErr);
          }
        }
      } catch (locGenErr) {
        console.warn(`[${requestId}] [STARTING_LOCATION] Generation error:`, locGenErr);
      }
    }

    // Если карта расстояний или тип местности ещё не созданы — генерируем через ИИ
    if (Object.keys(locationMap).length === 0 && (session.current_location_id || currentWildZone || currentLocationName)) {
      try {
        const initLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: session.current_location_id,
          locationName: currentLocationName || "Локация",
          isWildZone: Boolean(currentWildZone),
          openrouterApiKey,
          model: satelliteModel,
        });
        locationMap = initLocMap.location_map;
        currentTerrain = initLocMap.terrain_type;
        session.location_map = locationMap;
        session.current_terrain_type = currentTerrain;
      } catch (locMapInitErr) {
        console.warn(`[${requestId}] [FOG] Failed to ensure initial location_map:`, locMapInitErr);
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
            STR: "сила", DEX: "ловкость", CON: "выносливость",
            INT: "интеллект", WIS: "мудрость", CHA: "харизма"
          };
          const statRu = statNamesRu[statAllocIntent.stat] || statAllocIntent.stat;
          statAllocatedFact = `${player.name} успешно вложил ${statAllocIntent.points} оч. в характеристику ${statRu} (новое значение: ${rpcRes.new_value}, свободно очков: ${rpcRes.remaining_points}).`;

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
    // Подгружаем историю для контекста общения с NPC/игроками
    let recentHistoryStr = "";
    const { data: routerRecentMsgs } = await supabase.from("messages").select("sender_name, content, sender_type").eq("session_id", session_id).order("created_at", { ascending: false }).limit(3);
    if (routerRecentMsgs && routerRecentMsgs.length > 0) {
      recentHistoryStr = routerRecentMsgs.reverse().map((m: any) => `${m.sender_name || (m.sender_type === 'master' ? 'ДМ' : 'Система')}: "${cleanTextForAI(m.content || "").slice(0, 220)}"`).join("\n");
    }

    const routerInput: RouterInputContext = {
      player_action_text: safeActionText,
      recent_history: recentHistoryStr,
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
      nearby_players: (allPlayers || [])
        .filter((p: any) => p.id !== player.id)
        .map((p: any) => ({
          id: p.id,
          name: p.name || "Герой",
          race: p.race || "Человек",
          class: p.class || "Игрок",
          level: p.level || 1,
          hp: p.hp ?? 100,
          max_hp: p.max_hp ?? 100,
          current_zone: p.current_zone || null,
        })),
      weather: (() => {
        const gameMonth = session.game_month || 1;
        const gameHour = session.game_hour ?? 8;
        const isNight = gameHour < 6 || gameHour >= 22;
        const isSummer = gameMonth >= 5 && gameMonth <= 8;
        const isWinter = gameMonth === 12 || gameMonth <= 2;
        const isAutumn = gameMonth >= 9 && gameMonth <= 11;
        const baseTemp = isWinter ? -5 : isSummer ? 24 : isAutumn ? 10 : 15;
        const tempVariance = (parseInt(session.id?.slice(-4) || '0', 16) % 11) - 5;
        const temperature = Math.round(baseTemp + tempVariance + (isNight ? -4 : 0));
        const rainSeed = parseInt(session.id?.slice(-8, -4) || '0', 16) % 10;
        const isRaining = isAutumn ? rainSeed < 4 : isSummer ? rainSeed < 1 : rainSeed < 2;
        let description = isRaining ? (isWinter ? 'Снегопад' : 'Дождь') : 'Ясно';
        if (!isRaining && isWinter) description = 'Морозно';
        if (!isRaining && isNight && !isWinter) description = 'Ясная ночь';
        if (!isRaining && isSummer && !isNight) description = 'Солнечно';
        const windSeed = parseInt(session.id?.slice(-6, -4) || '0', 16) % 5;
        return { description, temperature, is_raining: isRaining, is_night: isNight, wind_speed: windSeed + 1 };
      })(),
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
        lore_context: loreContext.slice(0, 1500),
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
      console.warn(`[${requestId}] [STEP 1] Router LLM (Tier 1) failed (${routerErr?.message}), invoking Tier 2 Targeted AI classifier...`);
      routerResult = null;
    }

    // Проверяем необходимость задействовать Tier 2 AI Classifier:
    // 1) Tier 1 упал с ошибкой (routerResult == null)
    // 2) Tier 1 вернул clarification_needed, но действие содержит явные глаголы активности
    // 3) Tier 1 вернул actions: [] при явном глаголе активности
    const rawActionText = (routerInput.player_action_text || "").trim().toLowerCase();
    const hasObviousActionVerbs = /(?:иду|пойду|бегу|шагаю|направл|вхожу|выхожу|вернусь|бью|атак|удар|выслеж|ищу|собира|крафт|смастер|выкин|выброс|отда|переда)/i.test(rawActionText);
    const tier1NeedsRescue = !routerResult ||
      (routerResult.status === "clarification_needed" && hasObviousActionVerbs) ||
      (routerResult.status === "success" && routerResult.actions?.length === 0 && hasObviousActionVerbs);

    if (tier1NeedsRescue) {
      console.log(`[${requestId}] [STEP 1] Tier 2 rescue triggered for action: "${rawActionText}"`);
      let classifierResult: any = null;
      try {
        classifierResult = await classifyIntentWithAI(routerInput, openrouterApiKey);
      } catch (classErr: any) {
        console.warn(`[${requestId}] [STEP 1] Tier 2 AI classifier error:`, classErr?.message);
      }

      if (classifierResult && (classifierResult.actions?.length > 0 || classifierResult.encounter_intent?.type === "targeted")) {
        console.log(`[${requestId}] [STEP 1] ✅ Tier 2 AI classifier rescued turn: action=${classifierResult.actions?.[0]?.action_type}`);
        routerResult = classifierResult;
      } else if (!routerResult) {
        console.warn(`[${requestId}] [STEP 1] Tier 1 & Tier 2 failed, falling back to Tier 3 emergency regex-heuristic`);
        routerResult = buildRouterHeuristicFallback(routerInput);
      }
    }

    if (routerResult.status === "clarification_needed") {
      return new Response(JSON.stringify({
        success: false,
        status: "clarification_needed",
        clarification_msg: routerResult.clarification_msg,
        actions: [],
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    console.log(`[${requestId}] [STEP 1] 📡 Router: status="${routerResult.status}", actions=${JSON.stringify(routerResult.actions.map((a: any) => ({ type: a.action_type, target: a.target_item_name || a.target_entity_id, stat: a.stat_to_check })))}`);

    // ============================================
    // MOVEMENT SAFETY NET
    // Если роутер вернул actions:[] но текст содержит глаголы движения —
    // инжектируем move action, т.к. модель часто игнорирует правило #16
    // ============================================
    const _movementVerbRegex = /\b(иду\b|идём|пойду|пошёл|пошла|шагаю|направляюсь|перемещаюсь|двигаюсь|отправляюсь|выхожу|вхожу|захожу|зайду|выйду|бегу|еду|лечу|плыву|перехожу|спускаюсь|поднимаюсь|взбираюсь|ухожу|покидаю|прихожу|возвращаюсь|доберусь|добираюсь)\b/i;
    const _hasRouterMove = routerResult.actions?.some((a: any) => a.action_type === "move");
    if (!_hasRouterMove && _movementVerbRegex.test(safeActionText) && routerResult.status === "success") {
      // Извлекаем место назначения из текста
      const _destMatch = safeActionText.match(/(?:иду|пойду|направляюсь|отправляюсь|вхожу|выхожу|перехожу|спускаюсь|поднимаюсь)\s+(?:в|к|на|из|до|за)\s+([^,.!?]{2,60})/i);
      const _moveDest = _destMatch?.[1]?.trim() || safeActionText.slice(0, 80).trim();
      routerResult.actions = routerResult.actions || [];
      routerResult.actions.push({
        action_type: "move",
        target_entity_id: null,
        target_name: null,
        target_item_name: _moveDest,
        item_type: null,
        used_item_id: null,
        consumed_materials: null,
        stat_to_check: "none",
        ai_custom_dc: null,
        improper_tool_usage: null,
        dynamic_blueprint: null,
        raw_action_text: safeActionText,
      });
      console.log(`[${requestId}] [MOVE_INJECT] ⚡ Injected move action (router missed it): dest="${_moveDest}"`);
    }

    // ============================================
    // CONSUMABLE / HEALING & TRADE SAFETY NETS
    // ============================================
    const _useItemRegex = /\b(?:выпива|выпью|пью\s+(?:зель|эликсир|отвар|настойк)|перевязыва|перевяжу|накладыва.*повязк|использу.*(?:зель|аптечк|бинт|стимулятор|свиток)|влива.*зель|оказыва.*первую помощь|реанимиру)\b/i;
    const _tradeRegex = /\b(?:покупаю|куплю|хочу купить|продаю|продам|торгуюсь с|заказываю\s+(?:эль|пив|вин|обед|ужин|рагу|комнат))\b/i;
    if (routerResult.status === "success" && (!routerResult.actions || routerResult.actions.length === 0)) {
      if (_useItemRegex.test(safeActionText)) {
        routerResult.actions = [{
          action_type: "use_item",
          target_entity_id: null,
          target_name: null,
          target_item_name: null,
          item_type: "consumable",
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "none",
          ai_custom_dc: null,
          improper_tool_usage: null,
          raw_action_text: safeActionText,
        }];
        console.log(`[${requestId}] [USE_ITEM_INJECT] 🧪 Injected use_item action`);
      } else if (_tradeRegex.test(safeActionText)) {
        routerResult.actions = [{
          action_type: "trade",
          target_entity_id: null,
          target_name: null,
          target_item_name: null,
          item_type: null,
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "insight",
          ai_custom_dc: 12,
          improper_tool_usage: null,
          raw_action_text: safeActionText,
        }];
        console.log(`[${requestId}] [TRADE_INJECT] 🪙 Injected trade action`);
      }
    }

    // Apply GPS time/location (still here, as it's pre-engine)
    let time_passed_minutes = 0;
    let location_changed = startingLocationGenerated,
      new_location_id: string | null = startingLocationGenerated ? session.current_location_id : null,
      new_wild_zone: string | null = null,
      wild_zone_changed = false,
      travel_description = "";

    // Вспомогательная нормализация русских корней для точного сопоставления локаций и подзон в любых падежах
    const normalizeRuStem = (word: string): string =>
      word
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/(?:ами|ями|ого|его|ому|ему|ыми|ими|ую|юю|ой|ей|ом|ем|ах|ях|ам|ям|ов|ев|ий|ый|ая|яя|ое|ее|ие|ые|а|я|у|ю|е|и|ы|ь)$/i, "");

    const matchesNamedPlace = (inputText: string, placeName: string): boolean => {
      if (!inputText || !placeName) return false;
      const normInput = inputText.toLowerCase().replace(/ё/g, "е");
      const fullNormPlace = placeName.toLowerCase().replace(/ё/g, "е").trim();
      const baseNormPlace = fullNormPlace.replace(/\s*\([^)]*\)\s*/g, " ").trim();

      if (baseNormPlace.length >= 3 && normInput.includes(baseNormPlace)) return true;
      if (fullNormPlace.length >= 3 && normInput.includes(fullNormPlace)) return true;

      const stopWords = new Set(["в", "к", "на", "из", "по", "у", "за", "над", "под", "при", "для", "или"]);
      const tokens = baseNormPlace
        .split(/[\s,.\-«»"()]+/)
        .filter((w) => w.length >= 3 && !stopWords.has(w));
      if (tokens.length === 0) return false;

      const stems = tokens.map((w) => {
        const st = normalizeRuStem(w);
        return st.length >= 3 ? st : w.slice(0, 3);
      });

      return stems.every((st) => normInput.includes(st));
    };

    // Объединяем подзоны из БД (subzones) и из кэша locationMap
    const dbSubzoneNames = (currentLocationSubzones || []).map((s: any) => s.name).filter(Boolean);
    const mapSubzoneNames = locationMap && Object.keys(locationMap).length > 0 ? Object.keys(locationMap) : [];
    const combinedSubzoneNames = Array.from(new Set([...dbSubzoneNames, ...mapSubzoneNames]));

    // 1. Детерминированный поиск явного упоминания подзоны или мировой локации в заявке игрока
    const deterministicSubzoneObj = (currentLocationSubzones || []).find((s: any) =>
      matchesNamedPlace(safeActionText, s.name)
    ) || null;
    const deterministicSubzoneName =
      deterministicSubzoneObj?.name ||
      combinedSubzoneNames.find((zName) => matchesNamedPlace(safeActionText, zName)) ||
      null;

    // Если игрок явно не назвал подзону текущей локации, проверяем мировые локации
    const deterministicWorldLoc = !deterministicSubzoneName
      ? availableLocations.find((l) => matchesNamedPlace(safeActionText, l.name)) || null
      : null;

    // Детектор намерения перемещения или выхода из помещения
    const isMovementAction =
      Boolean(deterministicSubzoneName) ||
      Boolean(deterministicWorldLoc) ||
      routerResult.actions?.some((a: any) => a.action_type === "move") ||
      /выход|выйти|выхожу|покинуть|покидаю|уйти|ухожу|отправиться|отправляюсь|иду |пойду|шагаю|двигаюсь|направляюсь|перехожу|еду |бегу |на улиц|наружу|за пределы|на тракт|в лес|в город|к озеру|в путь|зайти в |вернуться/i.test(safeActionText);

    // Гарантируем наличие действия move в routerResult, если распознан переход в локацию/подзону
    if (isMovementAction && routerResult.status === "success" && !routerResult.actions?.some((a: any) => a.action_type === "move")) {
      routerResult.actions = routerResult.actions || [];
      routerResult.actions.push({
        action_type: "move",
        target_entity_id: null,
        target_name: null,
        target_item_name: deterministicSubzoneName || deterministicWorldLoc?.name || safeActionText.slice(0, 60),
        item_type: null,
        used_item_id: null,
        consumed_materials: null,
        stat_to_check: "none",
        ai_custom_dc: null,
        improper_tool_usage: null,
        dynamic_blueprint: null,
        raw_action_text: safeActionText,
      });
    }

    let gpsMovedToSubzone: string | null = null;
    if (isMovementAction) {
      // Случай А: Игрок явно переходит в известную подзону текущей локации (0 мс без риска галлюцинации GPS)
      if (deterministicSubzoneName && !deterministicWorldLoc) {
        gpsMovedToSubzone = deterministicSubzoneName;
        time_passed_minutes = Math.max(5, Math.min(60, Number(routerResult.time_estimate_minutes) || 15));
        travel_description = `${player.name} направляется через «${currentLocationName || "локацию"}» и переходит в подзону «${deterministicSubzoneName}».`;
        console.log(`[${requestId}] [GPS_DETERMINISTIC] 🎯 Subzone match: "${deterministicSubzoneName}" (${time_passed_minutes} min)`);
      }
      // Случай Б: Игрок явно отправляется в известную именную локацию мира (или возвращается в неё из дикой зоны)
      else if (deterministicWorldLoc && (deterministicWorldLoc.id !== session.current_location_id || Boolean(currentWildZone))) {
        location_changed = true;
        new_location_id = deterministicWorldLoc.id;
        wild_zone_changed = true;
        new_wild_zone = null;
        currentDangerLevel = deterministicWorldLoc.danger_level || "normal";

        // Рассчитываем реалистичное время в пути по координатам карты
        if (
          typeof deterministicWorldLoc.pos_x === "number" &&
          typeof deterministicWorldLoc.pos_y === "number" &&
          typeof player.pos_x === "number" &&
          typeof player.pos_y === "number"
        ) {
          const dist = Math.hypot(deterministicWorldLoc.pos_x - player.pos_x, deterministicWorldLoc.pos_y - player.pos_y);
          time_passed_minutes = Math.max(15, Math.min(720, Math.round(dist * 0.25) || 30));
        } else {
          time_passed_minutes = Math.max(20, Math.min(240, Number(routerResult.time_estimate_minutes) || 30));
        }

        // Проверяем, не упомянута ли сразу и подзона целевой локации
        const targetLocSubs = Array.isArray(deterministicWorldLoc.subzones) ? deterministicWorldLoc.subzones : [];
        const matchedTargetSub = targetLocSubs.find((s: any) => matchesNamedPlace(safeActionText, s.name));
        if (matchedTargetSub) {
          gpsMovedToSubzone = matchedTargetSub.name;
        }

        travel_description = `${player.name} совершает переход и прибывает в локацию «${deterministicWorldLoc.name}»${deterministicWorldLoc.state_name ? ` (${deterministicWorldLoc.state_name})` : ""}.`;
        console.log(`[${requestId}] [GPS_DETERMINISTIC] 🗺️ World location match: "${deterministicWorldLoc.name}" (${new_location_id}, ${time_passed_minutes} min)`);
      }
      // Случай В: Произвольное перемещение, исследование, выход в дикую зону или проверка правдоподобия через ИИ GPS
      else {
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
            currentDangerLevel,
            wantsLocationChange: isMovementAction, locationChangeDescription: safeActionText,
            availableLocations,
            availableSubzones: combinedSubzoneNames.length > 0 ? combinedSubzoneNames : undefined,
            terrainType: currentTerrain || currentLocationType || "unknown",
          } as any);

          const gpsResp = await callAI(gpsSystemPrompt, "Определи время и маршрут.", openrouterApiKey, 2, gpsModel);
          const gpsParsed = parseAIJson(gpsResp);
          if (gpsParsed) {
            gpsMovedToSubzone = gpsParsed?.moved_to_subzone || null;
            time_passed_minutes = Math.max(1, Math.min(1440, Number(gpsParsed.time_minutes) || Number(routerResult.time_estimate_minutes) || 10));

            // ПЛАУЗИБИЛЬНОСТЬ: отклоняем перемещение ТОЛЬКО если ИИ явно вернул is_plausible === false
            const moveAction = routerResult.actions?.find((a: any) => a.action_type === "move");
            if (isMovementAction && gpsParsed.is_plausible === false) {
              if (moveAction) {
                moveAction.movement_rejected = true;
                moveAction.rejection_reason = gpsParsed.travel_description || "Такого места поблизости нет.";
                console.log(`[${requestId}] [GPS_REJECT] 🚫 Movement rejected (implausible): ${moveAction.rejection_reason}`);
              }
            } else if (gpsParsed.travel_description) {
              travel_description = gpsParsed.travel_description;
            }

            if (gpsParsed.location_changed === true && gpsParsed.is_plausible !== false) {
              if (gpsParsed.is_wild_zone === true && gpsParsed.new_location_name) {
                // Переход в дикую зону (лес, пещера, поле, тракт)
                wild_zone_changed = true;
                new_wild_zone = gpsParsed.new_location_name;
                travel_description = gpsParsed.travel_description || "";
                const gpsWildDanger = gpsParsed.wild_zone_danger_level;
                const validDangers = ["safe", "normal", "danger", "lethal"];
                currentDangerLevel = (validDangers.includes(gpsWildDanger) ? gpsWildDanger : parentLocationDanger) || "normal";
                console.log(`[${requestId}] [GPS] Wild zone: ${new_wild_zone} (danger: ${currentDangerLevel})`);
              } else if (gpsParsed.new_location_id || gpsParsed.new_location_name) {
                // Сопоставляем ID или название локации со списком реальных локаций мира
                const resolvedLoc =
                  availableLocations.find((l) => l.id === gpsParsed.new_location_id) ||
                  availableLocations.find((l) => matchesNamedPlace(String(gpsParsed.new_location_name || gpsParsed.new_location_id || ""), l.name)) ||
                  null;

                if (resolvedLoc) {
                  location_changed = true;
                  new_location_id = resolvedLoc.id;
                  wild_zone_changed = true;
                  new_wild_zone = null;
                  travel_description = gpsParsed.travel_description || "";
                  currentDangerLevel = resolvedLoc.danger_level || "normal";
                  console.log(`[${requestId}] [GPS] Location change → ${resolvedLoc.name} (${new_location_id}, danger: ${currentDangerLevel})`);
                } else if (typeof gpsParsed.new_location_id === "string" && /^[0-9a-f-]{32,36}$/i.test(gpsParsed.new_location_id)) {
                  location_changed = true;
                  new_location_id = gpsParsed.new_location_id;
                  wild_zone_changed = true;
                  new_wild_zone = null;
                  travel_description = gpsParsed.travel_description || "";
                  try {
                    const { data: newLocRow } = await supabase.from("locations").select("danger_level").eq("id", new_location_id).maybeSingle();
                    if (newLocRow?.danger_level) currentDangerLevel = newLocRow.danger_level;
                  } catch (_) {}
                  console.log(`[${requestId}] [GPS] Location change → ${new_location_id} (danger: ${currentDangerLevel})`);
                }
              }
            }
          }
        } catch (e) {
          time_passed_minutes = Math.max(1, Math.min(1440, Number(routerResult.time_estimate_minutes) || 15));
        }
      }
    } else {
      // Экономия токенов и времени: если перемещения нет, берем оценку времени напрямую из Step 1 Router!
      time_passed_minutes = Math.max(1, Math.min(1440, Number(routerResult.time_estimate_minutes) || 5));
    }

    // Детерминированная гарантия: выход из здания/таверны наружу, если GPS не переключил зону
    const isBuildingLocation = /таверн|трактир|постоял|дом|подвал|грот|катакомб|погреб|tavern|building|dungeon/i.test(currentLocationType || "") ||
      /таверн|трактир|постоял|дом|башн|катакомб|погреб/i.test(currentLocationName || "");
    const isExitingBuilding = /выход|выйти|выхожу|покида|наружу|на улиц|на воздух|во двор|на двор|на тракт|на дорог|в путь/i.test(safeActionText);
    const isEnteringBuilding = /зайти в таверну|захожу в таверну|вернуться в таверну|вхожу в таверну|зайти внутрь|вернуться внутрь/i.test(safeActionText);

    if (isBuildingLocation && isExitingBuilding && !location_changed && !wild_zone_changed) {
      wild_zone_changed = true;
      new_wild_zone = `Окрестности у ${currentLocationName || "таверны"}`;
      travel_description = `Вы распахиваете дверь и выходите из ${currentLocationName || "помещения"} наружу на свежий воздух придорожного тракта.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [EXIT_BUILDING] Player stepped outside: ${new_wild_zone}`);
    } else if (currentWildZone && isEnteringBuilding && !location_changed) {
      wild_zone_changed = true;
      new_wild_zone = null;
      travel_description = `Вы возвращаетесь внутрь таверны в тёплое помещение.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [ENTER_BUILDING] Player stepped back inside tavern`);
    }

    // ============================================
    // НЕМЕДЛЕННОЕ ОБНОВЛЕНИЕ КОНТЕКСТА ЛОКАЦИИ И NPC ПЕРЕД STEP 2 (ENGINE) И STEP 4 (SYSTEM TRUTH)
    // ============================================
    if (location_changed && new_location_id) {
      const targetLocMeta = availableLocations.find((l) => l.id === new_location_id) || null;
      session.current_location_id = new_location_id;
      session.current_wild_zone = null;
      if (targetLocMeta) {
        currentLocationName = targetLocMeta.name;
        currentLocationType = targetLocMeta.type;
        currentStateName = targetLocMeta.state_name || currentStateName;
        currentDangerLevel = targetLocMeta.danger_level || currentDangerLevel;
        currentLocationPosX = typeof targetLocMeta.pos_x === "number" ? targetLocMeta.pos_x : currentLocationPosX;
        currentLocationPosY = typeof targetLocMeta.pos_y === "number" ? targetLocMeta.pos_y : currentLocationPosY;
        currentLocationSubzones = Array.isArray(targetLocMeta.subzones) ? targetLocMeta.subzones : [];
      } else {
        try {
          const { data: newLocRow } = await supabase
            .from("locations")
            .select("id, name, type, danger_level, pos_x, pos_y, states(name), subzones(id, name, description, pos_x, pos_y, radius)")
            .eq("id", new_location_id)
            .maybeSingle();
          if (newLocRow) {
            currentLocationName = newLocRow.name || currentLocationName;
            currentLocationType = newLocRow.type || currentLocationType;
            currentDangerLevel = newLocRow.danger_level || currentDangerLevel;
            currentLocationPosX = typeof newLocRow.pos_x === "number" ? newLocRow.pos_x : currentLocationPosX;
            currentLocationPosY = typeof newLocRow.pos_y === "number" ? newLocRow.pos_y : currentLocationPosY;
            currentLocationSubzones = Array.isArray(newLocRow.subzones) ? newLocRow.subzones : [];
            const stObj = Array.isArray(newLocRow.states) ? newLocRow.states[0] : newLocRow.states;
            if (stObj?.name) currentStateName = stObj.name;
          }
        } catch (_) {}
      }

      // Переносим спутников в новую локацию и перезагружаем NPC новой локации ДО запуска Engine!
      try {
        const companionIdsToMove = allNpcs.filter((n: any) => isCompanionNpc(n)).map((n: any) => n.id);
        if (companionIdsToMove.length > 0) {
          await supabase.from("npcs").update({ location_id: new_location_id }).in("id", companionIdsToMove);
        }
        const { data: newLocNpcs } = await supabase
          .from("npcs")
          .select("id, name, race, class, role, category, hp, max_hp, armor_class, level, is_hostile, status_tags, stats, background, appearance, habits, catchphrases, special_attacks, base_attacks, current_activity, activity_data, last_activity_time, temperament, motivation, current_mood, secrets, rumors, speech_style, daily_routine")
          .eq("location_id", new_location_id);
        if (newLocNpcs) {
          allNpcs = newLocNpcs.map((n: any) => ({
            ...n,
            is_alive: (n.hp ?? 10) > 0,
          }));
          console.log(`[${requestId}] [LOCATION_RELOAD] Reloaded ${allNpcs.length} NPC(s) for new location "${currentLocationName}"`);
        }
      } catch (reloadErr) {
        console.warn(`[${requestId}] [LOCATION_RELOAD] Failed to reload NPCs for new location:`, reloadErr);
      }

      // Обновляем цель действия move в routerResult, чтобы MoveHandler записал точное имя новой локации
      const moveAct = routerResult.actions?.find((a: any) => a.action_type === "move");
      if (moveAct && currentLocationName) {
        moveAct.target_item_name = gpsMovedToSubzone
          ? `${currentLocationName} (${gpsMovedToSubzone})`
          : currentLocationName;
      }
    } else if (gpsMovedToSubzone) {
      const moveAct = routerResult.actions?.find((a: any) => a.action_type === "move");
      if (moveAct) {
        moveAct.target_item_name = gpsMovedToSubzone;
      }
    }

    // ============================================
    // УПРАВЛЕНИЕ ОТРЯДОМ И СОПОСТАВЛЕНИЕ ИГРОКОВ (Party & Player Resolution)
    // ============================================
    let partyEventFact: string | null = null;
    const lowerAct = safeActionText.toLowerCase();

    // Детерминированное сопоставление цели с живыми игроками по имени в тексте
    const targetedOtherPlayer = (allPlayers || []).filter((p: any) => p.id !== player.id).find((p: any) => {
      if (!p.name) return false;
      const pNameLower = p.name.trim().toLowerCase();
      const nameRegex = new RegExp(`(^|[\\s,."«*!?])${pNameLower}[а-яё]*([\\s,."»*!?]|$)`, 'i');
      return nameRegex.test(lowerAct) || lowerAct.includes(pNameLower);
    });

    if (targetedOtherPlayer) {
      console.log(`[${requestId}] [PLAYER_TARGET] Detected player "${targetedOtherPlayer.name}" (${targetedOtherPlayer.id}) in action text`);
      let hasTargetedAction = false;
      if (routerResult.actions && routerResult.actions.length > 0) {
        for (const act of routerResult.actions) {
          if (act.action_type === "talk" || act.action_type === "transfer" || act.action_type === "attack") {
            act.target_entity_id = targetedOtherPlayer.id;
            (act as any).target_name = targetedOtherPlayer.name;
            (act as any).target_type = "player";
            hasTargetedAction = true;
          }
        }
      }
      if (!hasTargetedAction) {
        if (!routerResult.actions) routerResult.actions = [];
        routerResult.actions.push({
          action_type: "talk",
          target_entity_id: targetedOtherPlayer.id,
          target_item_name: null,
          stat_to_check: "none",
          ai_custom_dc: null,
          improper_tool_usage: null,
        });
      }
    }

    const isPartyInviteOrJoin = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i.test(lowerAct);
    const isPartyLeave = /(?:покидаю отряд|выхожу из отряда|отделяюсь от отряда|иду один|пойду один|разделяемся)/i.test(lowerAct);

    if (isPartyLeave) {
      const priorPartyId = getPlayerPartyId(player, session);
      if (priorPartyId) {
        let groups = Array.isArray(session.party_groups) ? [...session.party_groups] : [];
        groups = groups.map((g: any) => ({
          ...g,
          members: (g.members || []).filter((m: string) => m !== player.id),
        })).filter((g: any) => (g.members || []).length > 1);

        session.party_groups = groups;
        try {
          await supabase.from("sessions").update({ party_groups: groups }).eq("id", session_id);
          await supabase.from("players").update({ party_id: null }).eq("id", player.id);
          player.party_id = null;
        } catch {}

        partyEventFact = `${player.name} отделился от отряда и теперь действует самостоятельно.`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "Система",
            content: `🚶 ${partyEventFact}`,
          });
        } catch {}
      }
    } else if (isPartyInviteOrJoin) {
      let partner = targetedOtherPlayer;
      if (!partner) {
        const otherPlayersInZone = (allPlayers || []).filter((p: any) => p.id !== player.id && (!player.current_zone || !p.current_zone || p.current_zone === player.current_zone));
        if (otherPlayersInZone.length === 1) {
          partner = otherPlayersInZone[0];
        }
      }

      if (partner && !arePlayersInSameParty(player, partner, session)) {
        let groups = Array.isArray(session.party_groups) ? [...session.party_groups] : [];
        let existingParty = groups.find((g: any) => g.members?.includes(partner.id) || g.members?.includes(player.id));
        let partyId = existingParty?.id || crypto.randomUUID();

        if (existingParty) {
          if (!existingParty.members.includes(player.id)) existingParty.members.push(player.id);
          if (!existingParty.members.includes(partner.id)) existingParty.members.push(partner.id);
        } else {
          groups.push({
            id: partyId,
            name: `Отряд ${player.name} и ${partner.name}`,
            leader_id: player.id,
            members: [player.id, partner.id],
          });
        }

        session.party_groups = groups;
        try {
          await supabase.from("sessions").update({ party_groups: groups }).eq("id", session_id);
          await supabase.from("players").update({ party_id: partyId }).in("id", [player.id, partner.id]);
          player.party_id = partyId;
          partner.party_id = partyId;
        } catch {}

        partyEventFact = `Сформирован отряд: ${player.name} и ${partner.name} теперь путешествуют вместе!`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "Система",
            content: `⚔️ ${partyEventFact}`,
          });
        } catch {}
      }
    }

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
        location_danger_level: (currentDangerLevel as any) || "normal",
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
    if (partyEventFact) {
      if (!engineResult.raw_system_facts) engineResult.raw_system_facts = [];
      engineResult.raw_system_facts.push(partyEventFact);
      if (!engineResult.system_facts) engineResult.system_facts = engineResult.raw_system_facts;
      else engineResult.system_facts.push(partyEventFact);
    }
    // Обработка энкаунтера: найти/спаунить NPC если триггернулось
    if (engineResult.encounter_triggered?.triggered) {
      const enc = engineResult.encounter_triggered;
      const targetCreature = enc.creature_name ? enc.creature_name.toLowerCase() : null;

      // 1) Ищем враждебного NPC уже в текущей локации (приоритет совпадению по имени)
      let matchingNpc = allNpcs.find((n: any) => n.is_hostile && n.is_alive !== false && targetCreature && n.name?.toLowerCase().includes(targetCreature));
      if (!matchingNpc && !targetCreature) {
        matchingNpc = allNpcs.find((n: any) => n.is_hostile && n.is_alive !== false);
      }

      if (matchingNpc) {
        engineResult.raw_system_facts.push(`Враг ${matchingNpc.name} замечает ${player.name} и готовится к атаке!`);
        engineResult.system_facts.push(`Враг ${matchingNpc.name} замечает ${player.name} и готовится к атаке!`);
      } else {
        // 2) Ищем подходящего из мира или шаблонов
        const tierTarget = enc.tier || 1;
        let spawned: any = null;

        if (targetCreature) {
          // Сначала ищем в существующих NPC мира
          const { data: targetCandidates } = await supabase
            .from("npcs")
            .select("id, name, hp, max_hp, is_hostile, category, tier, level, base_attacks, special_attacks, armor_class, initiative, stats")
            .eq("world_id", session.world_id)
            .eq("is_hostile", true)
            .ilike("name", `%${targetCreature}%`)
            .limit(5);

          if (targetCandidates && targetCandidates.length > 0) {
            spawned = targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
          }

          // Если нет в NPC — ищем в creature_templates
          if (!spawned) {
            const { data: tmpls } = await supabase
              .from("creature_templates")
              .select("*")
              .eq("world_id", session.world_id)
              .ilike("species_name", `%${targetCreature}%`)
              .limit(1);

            if (tmpls && tmpls.length > 0) {
              const tmpl = tmpls[0];
              const { data: createdNpc } = await supabase.from("npcs").insert({
                world_id: session.world_id,
                location_id: session.current_location_id,
                name: tmpl.species_name,
                race: tmpl.race || "Чудовище",
                category: tmpl.category || "beast",
                tier: tmpl.tier || tierTarget,
                level: tmpl.level_min || 1,
                hp: 25,
                max_hp: 25,
                is_hostile: true,
                is_alive: true,
                base_attacks: tmpl.base_attacks || [],
                special_attacks: tmpl.special_attacks || [],
              }).select().maybeSingle();
              spawned = createdNpc;
            }
          }
        }

        // Если не найден целевой или энкаунтер случайный — общий пул врагов мира
        if (!spawned) {
          const { data: spawnCandidates } = await supabase
            .from("npcs")
            .select("id, name, hp, max_hp, is_hostile, category, tier, level, base_attacks, special_attacks, armor_class, initiative, stats")
            .eq("world_id", session.world_id)
            .eq("is_hostile", true)
            .lte("tier", tierTarget + 1)
            .order("tier", { ascending: false })
            .limit(10);
          if (spawnCandidates && spawnCandidates.length > 0) {
            spawned = spawnCandidates[Math.floor(Math.random() * spawnCandidates.length)];
          }
        }

        if (spawned) {
          await supabase.from("npcs").update({ location_id: session.current_location_id }).eq("id", spawned.id);
          allNpcs.push({ ...spawned, is_alive: true, location_id: session.current_location_id });
          engineResult.raw_system_facts.push(`${spawned.name} выпрыгивает из тени и нападает на ${player.name}!`);
          engineResult.system_facts.push(`${spawned.name} выпрыгивает из тени и нападает на ${player.name}!`);
          console.log(`[${requestId}] [ENCOUNTER] Spawned ${spawned.name} (tier=${spawned.tier}) into location ${session.current_location_id}`);
        } else {
          console.log(`[${requestId}] [ENCOUNTER] No matching hostile NPC found for tier=${tierTarget}`);
        }
      }
    }

    console.log(`[${requestId}] [STEP 2] Engine done: mutations=${JSON.stringify(engineResult.mutations.map((m: any) => m.type))}, facts=${engineResult.raw_system_facts?.length ?? 0}`);

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

    const playerStartingZone = player.current_zone || null;

    if (location_changed && new_location_id) {
      await supabase.from("sessions").update({
        current_location_id: new_location_id,
        current_wild_zone: null, // вернулись в именованную локацию
        current_wild_zone_description: null,
        current_wild_zone_danger_level: null,
      }).eq("id", session_id);

      // Определяем целевую подзону и координаты новой локации
      const entrySubzone =
        (gpsMovedToSubzone
          ? currentLocationSubzones.find((s: any) => matchesNamedPlace(gpsMovedToSubzone || "", s.name))
          : null) ||
        currentLocationSubzones[0] ||
        null;

      const nextPosX = typeof entrySubzone?.pos_x === "number"
        ? entrySubzone.pos_x
        : (typeof currentLocationPosX === "number" ? currentLocationPosX : player.pos_x);
      const nextPosY = typeof entrySubzone?.pos_y === "number"
        ? entrySubzone.pos_y
        : (typeof currentLocationPosY === "number" ? currentLocationPosY : player.pos_y);
      const nextZoneName = entrySubzone?.name || gpsMovedToSubzone || null;
      const nextSubzoneId = entrySubzone?.id || null;

      try {
        await supabase.from("players").update({
          current_zone: nextZoneName,
          subzone_id: nextSubzoneId,
          pos_x: nextPosX,
          pos_y: nextPosY,
        }).eq("id", player.id);
        player.current_zone = nextZoneName;
        player.subzone_id = nextSubzoneId;
        player.pos_x = nextPosX;
        player.pos_y = nextPosY;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to update player position on location change:`, pzErr);
      }

      // Члены одного отряда, находившиеся в той же зоне/локации, перемещаются вместе!
      const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
        p.id !== player.id &&
        arePlayersInSameParty(player, p, session) &&
        (p.current_zone || null) === playerStartingZone
      );
      if (partyFellowsInSameZone.length > 0) {
        const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
        try {
          await supabase.from("players").update({
            current_zone: nextZoneName,
            subzone_id: nextSubzoneId,
            pos_x: nextPosX,
            pos_y: nextPosY,
          }).in("id", fellowIds);
          for (const fellow of partyFellowsInSameZone) {
            fellow.current_zone = nextZoneName;
            fellow.subzone_id = nextSubzoneId;
            fellow.pos_x = nextPosX;
            fellow.pos_y = nextPosY;
          }
          console.log(`[${requestId}] [PARTY] Fellows ${partyFellowsInSameZone.map((p: any) => p.name).join(", ")} followed ${player.name} to new location ${new_location_id}`);
        } catch (fErr) {
          console.warn(`[${requestId}] Failed to update party fellows position:`, fErr);
        }
      }

      // Сгенерировать карту расстояний зон и тип местности для новой локации
      try {
        const newLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: new_location_id,
          locationName: currentLocationName || "Локация",
          openrouterApiKey,
          model: satelliteModel,
        });
        locationMap = newLocMap.location_map;
        currentTerrain = newLocMap.terrain_type;
        session.location_map = locationMap;
        session.current_terrain_type = currentTerrain;
      } catch (locChangeMapErr) {
        console.warn(`[${requestId}] [FOG] Failed to generate location_map on location change:`, locChangeMapErr);
      }

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
        current_wild_zone_danger_level: currentDangerLevel || "normal",
      }).eq("id", session_id);
      currentLocationName = new_wild_zone;
      session.current_wild_zone = new_wild_zone;
      session.current_wild_zone_danger_level = currentDangerLevel;

      // Игроки двигаются: сбрасываем подзону переместившегося игрока
      try {
        await supabase.from("players").update({ current_zone: null, subzone_id: null }).eq("id", player.id);
        player.current_zone = null;
        player.subzone_id = null;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to reset player current_zone:`, pzErr);
      }

      // Члены отряда переходят в дикую зону вместе
      const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
        p.id !== player.id &&
        arePlayersInSameParty(player, p, session) &&
        (p.current_zone || null) === playerStartingZone
      );
      if (partyFellowsInSameZone.length > 0) {
        const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
        try {
          await supabase.from("players").update({ current_zone: null, subzone_id: null }).in("id", fellowIds);
          for (const fellow of partyFellowsInSameZone) {
            fellow.current_zone = null;
            fellow.subzone_id = null;
          }
          console.log(`[${requestId}] [PARTY] Fellows ${partyFellowsInSameZone.map((p: any) => p.name).join(", ")} followed ${player.name} to wild zone ${new_wild_zone}`);
        } catch (fErr) {
          console.warn(`[${requestId}] Failed to reset party fellows current_zone:`, fErr);
        }
      }

      // Сгенерировать карту расстояний зон и тип местности для дикой зоны через ИИ
      try {
        const wildLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: null,
          locationName: new_wild_zone,
          locationDescription: travel_description,
          isWildZone: true,
          openrouterApiKey,
          model: satelliteModel,
        });
        locationMap = wildLocMap.location_map;
        currentTerrain = wildLocMap.terrain_type;
        session.location_map = locationMap;
        session.current_terrain_type = currentTerrain;
      } catch (wildChangeMapErr) {
        console.warn(`[${requestId}] [FOG] Failed to generate location_map on wild zone change:`, wildChangeMapErr);
      }

      allNpcs = allNpcs.filter((n: any) =>
        isCompanionNpc(n) ||
        n.is_hostile === true ||
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["дикий", "монстр", "дикая_зона", "зверь", "хищник"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] Player entered wild zone: ${new_wild_zone}`);
    }

    // Отслеживание перемещения игрока внутри подзон локации (реальные subzones из БД + locationMap)
    if (!location_changed && !wild_zone_changed && (currentLocationSubzones.length > 0 || (locationMap && Object.keys(locationMap).length > 0))) {
      // 1. Сопоставление с реальными подзонами из таблицы subzones (с нечётким поиском по корням слов)
      let matchedDbSubzone: any = null;
      if (gpsMovedToSubzone) {
        matchedDbSubzone = currentLocationSubzones.find(
          (s: any) => s.name.toLowerCase() === gpsMovedToSubzone!.toLowerCase() || matchesNamedPlace(gpsMovedToSubzone!, s.name)
        ) || null;
      }
      if (!matchedDbSubzone) {
        matchedDbSubzone = currentLocationSubzones.find((s: any) => matchesNamedPlace(safeActionText, s.name)) || null;
      }

      let matchedZone: string | null = matchedDbSubzone?.name || null;

      // 2. Если в БД-подзонах не нашлось, проверяем кэш locationMap
      if (!matchedZone && locationMap && Object.keys(locationMap).length > 0) {
        const availableZones = Object.keys(locationMap);
        if (gpsMovedToSubzone) {
          matchedZone = availableZones.find(
            (z) => z.toLowerCase() === gpsMovedToSubzone!.toLowerCase() || matchesNamedPlace(gpsMovedToSubzone!, z)
          ) || null;
        }
        if (!matchedZone) {
          matchedZone = availableZones.find((z) => matchesNamedPlace(safeActionText, z)) || null;
        }
      }

      if (matchedZone && (matchedZone !== (player.current_zone || "") || (matchedDbSubzone && matchedDbSubzone.id !== player.subzone_id))) {
        const prevZone = player.current_zone || null;
        console.log(`[${requestId}] [ZONE] ${player.name} -> "${matchedZone}" (was: "${player.current_zone || 'основная'}")`);
        gpsMovedToSubzone = matchedZone;
        player.current_zone = matchedZone;

        const playerZoneUpdate: Record<string, any> = { current_zone: matchedZone };
        if (matchedDbSubzone) {
          player.subzone_id = matchedDbSubzone.id;
          playerZoneUpdate.subzone_id = matchedDbSubzone.id;
          if (typeof matchedDbSubzone.pos_x === "number") {
            player.pos_x = matchedDbSubzone.pos_x;
            playerZoneUpdate.pos_x = matchedDbSubzone.pos_x;
          }
          if (typeof matchedDbSubzone.pos_y === "number") {
            player.pos_y = matchedDbSubzone.pos_y;
            playerZoneUpdate.pos_y = matchedDbSubzone.pos_y;
          }
        }

        try {
          await supabase.from("players").update(playerZoneUpdate).eq("id", player.id);
        } catch (zErr) {
          console.warn(`[${requestId}] Failed to update player current_zone:`, zErr);
        }

        const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
          p.id !== player.id &&
          arePlayersInSameParty(player, p, session) &&
          (p.current_zone || null) === prevZone
        );
        if (partyFellowsInSameZone.length > 0) {
          const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
          try {
            await supabase.from("players").update(playerZoneUpdate).in("id", fellowIds);
            for (const fellow of partyFellowsInSameZone) {
              fellow.current_zone = matchedZone;
              if (matchedDbSubzone) {
                fellow.subzone_id = matchedDbSubzone.id;
                if (typeof matchedDbSubzone.pos_x === "number") fellow.pos_x = matchedDbSubzone.pos_x;
                if (typeof matchedDbSubzone.pos_y === "number") fellow.pos_y = matchedDbSubzone.pos_y;
              }
            }
            console.log(`[${requestId}] [PARTY] Fellows moved together to "${matchedZone}"`);
          } catch (fErr) {
            console.warn(`[${requestId}] Failed to update party fellows current_zone:`, fErr);
          }
        }
      }
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
    // ИНИЦИАТИВА СПУТНИКОВ В ТЕКУЩЕЙ СЦЕНЕ (Мирные и ролевые действия)
    // ============================================
    let companionAction: any = null;
    if (allNpcs.some((n: any) => isCompanionNpc(n))) {
      try {
        companionAction = await handleCompanionInSceneAction({
          supabase,
          player_action_text: safeActionText,
          acting_player_name: player.name || "Герой",
          location_npcs: allNpcs,
          session_id,
          openrouter_api_key: openrouterApiKey,
          model: satelliteModel || "google/gemma-4-31b-it:free",
        });
        console.log(`[${requestId}] [COMPANION] 🤝 Checked:`, companionAction ? `${companionAction.npc_name} did: ${companionAction.action_description}` : "none");
      } catch (compErr) {
        console.warn(`[${requestId}] Companion action failed:`, compErr);
      }
    }

    // ============================================
    // ДИНАМИЧЕСКИЕ НАВЫКИ ИГРОКА (1..100)
    // ============================================
    let skillProgress: any = null;
    try {
      const detectedSkill = detectSkillFromAction({
        action_text: safeActionText,
        action_type: routerResult.actions[0]?.action_type || routerResult.actions[0]?.type,
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
      const isCombatAction = routerResult.actions.some((a: any) => (a.action_type || a.type) === "attack");
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
        temperament: n.temperament || null,
        motivation: n.motivation || null,
        current_mood: n.current_mood || null,
        secrets: n.secrets || null,
        rumors: n.rumors || null,
        speech_style: n.speech_style || null,
        daily_routine: n.daily_routine || null,
      })),
      atmosphere: routerResult.atmosphere || { sounds: [], visuals: [] },
      time_passed_minutes,
      encounter_alert: engineResult.encounter_triggered?.triggered ? {
        spawned: true,
        tier: engineResult.encounter_triggered.tier,
        creature_name: engineResult.encounter_triggered.creature_name || undefined,
      } : null,
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
    let narratorOutput: { players: Record<string, string>; global_narrative: string; choices?: Record<string, string[]> };
    let narratorStatus: "ok" | "fallback" = "ok";
    let narratorError: string | null = null;
    const backupKeys = [
      playerSettings?.openrouter_key ? sanitizeKey(playerSettings.openrouter_key) : null,
      hostSettings?.openrouter_key ? sanitizeKey(hostSettings.openrouter_key) : null,
      FALLBACK_OPENROUTER_KEY ? sanitizeKey(FALLBACK_OPENROUTER_KEY) : null,
    ].filter(Boolean) as string[];

    try {
      narratorOutput = await generateNarrative({
        system_truth: systemTruth,
        action_text: safeActionText,
        player_name: player.name || "Герой",
        player_race: player.race || "Человек",
        player_class: player.class || "Воин",
        lore_context: loreContext,
        recent_history: recentMessages.slice(-6),
        openrouter_api_key: openrouterApiKey,
        backup_api_keys: backupKeys,
        dm_model: dmModel,
      });
    } catch (narratorErr: any) {
      console.warn(`[${requestId}] [STEP 5] LLM failed, using fallback:`, narratorErr);
      narratorStatus = "fallback";
      narratorError = narratorErr?.message || String(narratorErr);
      narratorOutput = buildFallbackNarrative(systemTruth, safeActionText);
    }
    console.log(`[${requestId}] [STEP 5] ${Object.keys(narratorOutput.players).length} player narratives (status: ${narratorStatus})`);

    // ============================================
    // SAVE: messages + turn_queue
    // ============================================
    console.log(`[${requestId}] [SAVE] Persisting messages...`);
    // 1) Player action
    await supabase.from("messages").insert({
      session_id, sender_type: "player", sender_id: player.user_id, sender_name: player.name || "Герой", content: safeActionText,
    });
    // 2) Master narratives — по одному сообщению на игрока с наглядными RPG-бейджами итогов хода
    for (const [targetPlayerId, narrative] of Object.entries(narratorOutput.players)) {
      const playerChoices = narratorOutput.choices?.[targetPlayerId] || [];
      const pTruth = systemTruth.player_truths[targetPlayerId];
      const turnBadges: Array<{ icon: string; label: string; tone: string }> = [];

      if (targetPlayerId === player.id) {
        for (const ar of engineResult.action_results || []) {
          if (ar.dice_roll) {
            const dr = ar.dice_roll;
            const statusLabel = dr.is_crit ? "КРИТ!" : dr.success ? "Успех" : "Промах";
            turnBadges.push({
              icon: dr.is_crit ? "💥" : dr.success ? "🎲" : "💨",
              label: `${ar.details || `${dr.total} vs СЛ ${dr.target_dc}`} (${statusLabel})`,
              tone: dr.is_crit ? "gold" : dr.success ? "success" : "muted",
            });
          } else if (ar.details && ar.action_type !== "move" && ar.action_type !== "talk") {
            turnBadges.push({
              icon: ar.success ? "✨" : "⚠️",
              label: ar.details,
              tone: ar.success ? "info" : "muted",
            });
          }
        }
        if (skillProgress?.name) {
          turnBadges.push({
            icon: "⬆️",
            label: `${skillProgress.name}: ур. ${skillProgress.level}`,
            tone: skillProgress.leveled_up ? "gold" : "info",
          });
        }
      }

      if (pTruth?.hp_status && pTruth.hp_status.delta !== 0) {
        const hpDelta = pTruth.hp_status.delta;
        turnBadges.push({
          icon: hpDelta > 0 ? "💚" : "🩸",
          label: `${hpDelta > 0 ? `+${hpDelta}` : hpDelta} HP (${pTruth.hp_status.current_hp}/${pTruth.hp_status.max_hp})`,
          tone: hpDelta > 0 ? "success" : "danger",
        });
      }

      if (pTruth?.inventory_delta) {
        for (const gained of pTruth.inventory_delta.gained || []) {
          turnBadges.push({ icon: "🎒", label: `+${gained}`, tone: "success" });
        }
        for (const lost of pTruth.inventory_delta.lost || []) {
          turnBadges.push({ icon: "📦", label: `-${lost}`, tone: "muted" });
        }
      }

      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Мастер", content: narrative,
        metadata: {
          target_player_id: targetPlayerId,
          turn_status: systemTruth.turn_status,
          hp_status: pTruth?.hp_status,
          inventory_delta: pTruth?.inventory_delta,
          turn_badges: turnBadges,
          game_time: systemTruth.environment.time,
          choices: playerChoices,
        },
      });
    }
    // 3) Global log (только при наличии > 1 игрока, чтобы в соло не дублировать персональный нарратив)
    if (narratorOutput.global_narrative && allPlayers.length > 1) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Лог",
        content: narratorOutput.global_narrative,
        metadata: {
          type: "global_log",
          is_global: true,
          initiator_player_id: player.id,
          initiator_zone: player.current_zone || null,
          game_time: systemTruth.environment.time,
        },
      });
    }

    // 3.5) ТУМАН ВОЙНЫ — fog-сообщения для игроков в других зонах
    // Работает только при наличии нескольких игроков в сессии
    if (allPlayers.length > 1) {
      try {
        // AI определяет event_type в Router — никаких regex-эвристик!
        const eventType = routerResult.event_type || null;
        if (eventType) {
          const thresholds = fogGetEffectiveThresholds(eventType, currentTerrain);
          const actorZone: string | null = player.current_zone || null;
          const speechContent = fogExtractSpeech(safeActionText);

          // Наблюдатели = все игроки, кроме автора действия
          const observers = allPlayers.filter((p: any) => p.id !== player.id);

          let fogCount = 0;
          for (const obs of observers) {
            const obsZone: string | null = obs.current_zone || null;
            const tier = fogGetDistanceTier(actorZone, obsZone, locationMap);

            // same_room (tier 0) — этот игрок уже находится в той же зоне/комнате
            if (tier === DISTANCE_TIER.SAME_ROOM) continue;

            const hears = tier <= thresholds.audioTier;
            const sees = tier <= thresholds.visualTier;
            if (!hears && !sees) continue; // слишком далеко — ничего не доходит

            const fogText = fogPickNarrative(eventType, tier, speechContent);
            if (!fogText) continue;

            await supabase.from("messages").insert({
              session_id,
              sender_type: "master",
              sender_name: "Мастер",
              content: fogText,
              metadata: {
                target_player_id: obs.id,
                type: "fog_perception",
                fog_event_type: eventType,
                fog_distance_tier: tier,
                fog_terrain_type: currentTerrain,
                fog_filtered: true,
                initiator_player_id: player.id,
              },
            });
            fogCount++;
            console.log(`[${requestId}] [FOG] 🌫️ ${player.name} (${eventType}, terrain=${currentTerrain || 'default'}) → ${obs.name} tier=${tier}: "${fogText.slice(0, 60)}..."`);
          }
          if (fogCount > 0) {
            console.log(`[${requestId}] [FOG] Dispatched ${fogCount} fog message(s) for AI event_type="${eventType}", terrain="${currentTerrain || 'default'}"`);
          }
        }
      } catch (fogErr) {
        console.warn(`[${requestId}] [FOG] Fog dispatch failed (non-critical):`, fogErr);
      }
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
    // Только если игрок не обращается к другому живому игроку!
    const isDirectedToOtherPlayer = allPlayers.some((p: any) =>
      p.id !== player.id && p.name && safeActionText.toLowerCase().includes(p.name.toLowerCase())
    );
    let companionInviteHandled = false;
    if (!isDirectedToOtherPlayer) {
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
    let isRoundCompleted = (!allPlayers || allPlayers.length <= 1);
    try {
      const isCombat = routerResult.actions.some((a: any) => (a.action_type || a.type) === "attack") ||
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
          isRoundCompleted = false;
          // Сортируем игроков: в бою по инициативе, в мирном режиме — строго по порядку входа в мир (created_at ASC)
          const sortedPlayers = [...allPlayers].sort((a: any, b: any) => {
            if (isCombat) {
              const diff = (b.initiative || 10) - (a.initiative || 10);
              if (diff !== 0) return diff;
            }
            return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          });

          const actorIndex = sortedPlayers.findIndex((p: any) => p.id === player.id);
          const nextIndex = actorIndex >= 0 ? (actorIndex + 1) % sortedPlayers.length : 0;
          const nextPlayer = sortedPlayers[nextIndex];

          for (const p of sortedPlayers) {
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
        // Добавляем игроков, которых ещё нет в очереди (в порядке их входа created_at ASC)
        if (allPlayers && allPlayers.length > 1) {
          const existingPids = new Set(existingTurns.filter((t: any) => t.player_id).map((t: any) => t.player_id));
          const missingPlayers = allPlayers
            .filter((p: any) => !existingPids.has(p.id))
            .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          for (const p of missingPlayers) {
            await supabase.from("turn_queue").insert({
              session_id,
              player_id: p.id,
              entity_type: "player",
              initiative: p.initiative || 10,
              status: "waiting",
            });
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
        // При isCombat = false ходы передаются строго по очереди входа в мир (created_at ASC) от одного игрока другому.
        // При isCombat = true ходы упорядочены по боевой инициативе (initiative DESC, created_at ASC).
        let nextQuery = supabase.from("turn_queue")
          .select("id, player_id, npc_id, entity_type, status, initiative, created_at")
          .eq("session_id", session_id)
          .eq("status", "waiting");

        if (isCombat) {
          nextQuery = nextQuery.order("initiative", { ascending: false }).order("created_at", { ascending: true });
        } else {
          nextQuery = nextQuery.order("created_at", { ascending: true });
        }

        const { data: nextTurnData } = await nextQuery.limit(1).maybeSingle();
        let nextTurn = nextTurnData;

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
          if (allPlayers && allPlayers.length > 1) {
            isRoundCompleted = false;
          }
        } else {
          // Раунд завершен! Перезапускаем очередь
          isRoundCompleted = true;
          let queueOrderQuery = supabase.from("turn_queue")
            .select("id, entity_type, initiative, created_at")
            .eq("session_id", session_id);

          if (isCombat) {
            queueOrderQuery = queueOrderQuery.order("initiative", { ascending: false }).order("created_at", { ascending: true });
          } else {
            queueOrderQuery = queueOrderQuery.order("created_at", { ascending: true });
          }

          const { data: allSessionTurns } = await queueOrderQuery;

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

    // ============================================
    // ФОНОВЫЙ ПРОЦЕСС СИМУЛЯЦИИ ЖИЗНИ МИРА ПОСЛЕ КРУГА ХОДОВ
    // (В соло-игре запускается раз в 3 раунда, чтобы не спамить в чат каждый ход)
    // ============================================
    let worldSimResult: any = null;
    if (isRoundCompleted) {
      try {
        const nextRound = (session.current_round || 1) + 1;
        await supabase.from("sessions").update({ current_round: nextRound }).eq("id", session_id);

        const isMultiplayerSession = (allPlayers || []).length > 1;
        const shouldSimulateWorldThisRound = isMultiplayerSession || nextRound % 3 === 0;

        if (shouldSimulateWorldThisRound) {
          worldSimResult = await executeRoundCycleNpcSimulation({
            supabase,
            sessionId: session_id,
            roundNumber: nextRound,
            currentLocationId: session.current_location_id,
            worldId: session.world_id,
            loreContext,
            storyline: sessionStoryline,
            openrouterApiKey,
            model: dmModel,
          });
          console.log(`[${requestId}] [WORLD_SIM] 🌍 Round ${nextRound} simulated: ${worldSimResult?.simulated_count || 0} distant NPC(s) acted.`);
        }
      } catch (simErr) {
        console.warn(`[${requestId}] [WORLD_SIM] executeRoundCycleNpcSimulation failed:`, simErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      pipeline: {
        step1: { status: "ok", actions_count: routerResult.actions.length },
        step2: { status: "ok", mutations_count: engineResult.mutations.length },
        step3: { status: persistenceResult.status, applied: persistenceResult.applied_mutations_count },
        step4: { status: "ok", turn_status: systemTruth.turn_status },
        step5: {
          status: narratorStatus,
          players_narrated: Object.keys(narratorOutput.players).length,
          error: narratorError,
        },
      },
      turn_status: systemTruth.turn_status,
      narratives: narratorOutput,
      npc_updates: npcUpdates,
      companion_action: companionAction,
      expedition_events: expeditionEvents,
      skill_progress: skillProgress,
      level_up: playerLevelUp,
      npc_combat_turns: npcCombatTurns,
      world_simulation: worldSimResult,
      game_time: systemTruth.environment.time,
      time_minutes: time_passed_minutes,
      location_changed: location_changed || wild_zone_changed,
      moved_to_subzone: gpsMovedToSubzone || null,
      new_location_id: session.current_location_id || new_location_id,
      current_location_name: currentLocationName,
      current_state_name: currentStateName,
      current_wild_zone: session.current_wild_zone || null,
      current_zone: player.current_zone || null,
      subzone_id: player.subzone_id || null,
      pos_x: player.pos_x,
      pos_y: player.pos_y,
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
