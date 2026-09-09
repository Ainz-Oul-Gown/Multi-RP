// supabase/functions/process-turn/index.ts
// 5-С€Р°РіРѕРІС‹Р№ РєРѕРЅРІРµР№РµСЂ process-turn: Router в†’ Engine в†’ Persistence в†’ SystemTruth в†’ Narrator
//
// РЁР°РіРё:
//   1. AI Router  (step1_router.ts)        вЂ” РїР°СЂСЃРёРЅРі РЅР°РјРµСЂРµРЅРёР№ РёРіСЂРѕРєР° в†’ JSON actions
//   2. Game Engine (engine/step2_engine.ts) вЂ” Р±СЂРѕСЃРєРё РєСѓР±РёРєРѕРІ, РїСЂРѕРІРµСЂРєРё, РјСѓС‚Р°С†РёРё
//   3. Persistence (step3_persistence.ts)   вЂ” Р°С‚РѕРјР°СЂРЅРѕРµ РїСЂРёРјРµРЅРµРЅРёРµ РјСѓС‚Р°С†РёР№ С‡РµСЂРµР· RPC
//   4. System Truth (step4_system_truth.ts) вЂ” РўСѓРјР°РЅ Р’РѕР№РЅС‹, СЂР°Р·РґРµР»РµРЅРёРµ РІРёРґРёРјРѕСЃС‚Рё, RAG
//   5. Narrator  (step5_narrator.ts)        вЂ” LLM-РЅР°СЂСЂР°С‚РѕСЂ (РёР»Рё fallback)

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
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          throw lastError;
        }
        continue; // retry
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      // OpenRouter sometimes returns null/empty content вЂ” treat as transient error, retry
      if (!content || content.trim() === "") {
        lastError = new Error("AI Router: РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚ РѕС‚ LLM");
        console.warn(`[callAI] attempt ${attempt + 1}/${retries} вЂ” empty content, retrying...`);
        continue;
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(`AI Router: РЅРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РІР°Р»РёРґРЅС‹Р№ РѕС‚РІРµС‚ РїРѕСЃР»Рµ ${retries} РїРѕРїС‹С‚РѕРє. РџРѕСЃР»РµРґРЅСЏСЏ РѕС€РёР±РєР°: ${lastError?.message || "unknown"}`);
}


// ============================================

// ============================================
// Main Handler вЂ” 5-С€Р°РіРѕРІС‹Р№ РєРѕРЅРІРµР№РµСЂ
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[${requestId}] в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ PROCESS-TURN (5-step pipeline) START в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ`);

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
      return new Response(JSON.stringify({ error: "РћР±РЅР°СЂСѓР¶РµРЅС‹ СЃСЃС‹Р»РєРё РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёСЏ. РЈРґР°Р»РёС‚Рµ РёС… Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°." }), {
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
    // РџРѕРґРґРµСЂР¶РєР° СЂРµР¶РёРјР° РѕР±С‰РµРіРѕ РєР»СЋС‡Р° С…РѕСЃС‚Р° (ai_key_mode: 'host' | 'individual')
    // РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 'host': С…РѕРґС‹ РІСЃРµС… РёРіСЂРѕРєРѕРІ РёСЃРїРѕР»СЊР·СѓСЋС‚ РєР»СЋС‡ Рё РјРѕРґРµР»Рё СЃРѕР·РґР°С‚РµР»СЏ СЃРµСЃСЃРёРё/РјРёСЂР°,
    // РµСЃР»Рё РЅРµ РІС‹Р±СЂР°РЅ СЂРµР¶РёРј 'individual' (РєР°Р¶РґС‹Р№ СЃРѕ СЃРІРѕРёРј).
    const aiKeyMode = session.ai_key_mode || 'host';
    const hostUserId = session.worlds?.owner_id || null;

    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    let satelliteModel = AI_MODEL, gpsModel = AI_MODEL, dmModel = AI_MODEL;

    // 1. Р—Р°РіСЂСѓР·РєР° РЅР°СЃС‚СЂРѕРµРє С‚РµРєСѓС‰РµРіРѕ РёРіСЂРѕРєР° (РµСЃР»Рё РµСЃС‚СЊ)
    let playerSettings: any = null;
    if (player.user_id) {
      const { data: us } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", player.user_id).maybeSingle();
      playerSettings = us;
    }

    // 2. Р—Р°РіСЂСѓР·РєР° РЅР°СЃС‚СЂРѕРµРє С…РѕСЃС‚Р° (СЃРѕР·РґР°С‚РµР»СЏ РјРёСЂР°/СЃРµСЃСЃРёРё)
    let hostSettings: any = null;
    if (hostUserId && hostUserId !== player.user_id) {
      const { data: hs } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", hostUserId).maybeSingle();
      hostSettings = hs;
    } else if (hostUserId && hostUserId === player.user_id) {
      hostSettings = playerSettings;
    }

    // 3. Р’С‹Р±РѕСЂ РёСЃС‚РѕС‡РЅРёРєР° РєР»СЋС‡Р° Рё РјРѕРґРµР»РµР№ РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ ai_key_mode
    if (aiKeyMode === 'host') {
      // РџСЂРёРѕСЂРёС‚РµС‚ РҐРѕСЃС‚Р°: СЃРЅР°С‡Р°Р»Р° РєР»СЋС‡ Рё РјРѕРґРµР»Рё СЃРѕР·РґР°С‚РµР»СЏ СЃРµСЃСЃРёРё
      const targetSettings = hostSettings?.openrouter_key ? hostSettings : playerSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    } else {
      // Р РµР¶РёРј 'individual': РєР°Р¶РґС‹Р№ РёРіСЂРѕРє РёСЃРїРѕР»СЊР·СѓРµС‚ СЃРІРѕР№ РєР»СЋС‡; РµСЃР»Рё Сѓ РёРіСЂРѕРєР° РЅРµС‚ РєР»СЋС‡Р° вЂ” С„РѕР»Р»Р±СЌРє РЅР° РєР»СЋС‡ С…РѕСЃС‚Р°
      const targetSettings = playerSettings?.openrouter_key ? playerSettings : hostSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    }

    if (!openrouterApiKey) {
      const errorMsg = aiKeyMode === 'host'
        ? "РќРµ Р·Р°РґР°РЅ OpenRouter API Key СЃРѕР·РґР°С‚РµР»СЏ СЃРµСЃСЃРёРё. РҐРѕСЃС‚ РґРѕР»Р¶РµРЅ СѓРєР°Р·Р°С‚СЊ РєР»СЋС‡ РІ РЅР°СЃС‚СЂРѕР№РєР°С… Р°РєРєР°СѓРЅС‚Р°."
        : "РЈРєР°Р¶РёС‚Рµ РІР°С€ OpenRouter API Key РІ РЅР°СЃС‚СЂРѕР№РєР°С… Р°РєРєР°СѓРЅС‚Р°.";
      return new Response(JSON.stringify({ error: errorMsg, code: "MISSING_API_KEY" }), {
        status: 402, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load location, available locations, lore
    let currentLocationName: string | null = null, currentStateName: string | null = null, currentLocationType: string | null = null;
    // Wild zone вЂ” РїСЂРёСЂРѕРґРЅР°СЏ Р·РѕРЅР° РІРЅРµ РёРјРµРЅРЅС‹С… Р»РѕРєР°С†РёР№ (Р»РµСЃ, РїРµС‰РµСЂР°, РїРѕР»Рµ)
    const currentWildZone: string | null = session.current_wild_zone || null;
    if (currentWildZone) {
      // Player is in open world / wild zone вЂ” use currentWildZone as location name
      currentLocationName = currentWildZone;
      currentLocationType = "wild";
    } else if (session.current_location_id) {
      try {
        const { data: locData } = await supabase
          .from("locations")
          .select("name, type, states(name)")
          .eq("id", session.current_location_id)
          .maybeSingle();
        if (locData) {
          currentLocationName = locData.name;
          currentLocationType = locData.type || null;
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
    const recentMessages = (recentMsgs || []).reverse().map((m) => `[${m.sender_type === "master" ? "РњР°СЃС‚РµСЂ" : "РРіСЂРѕРє"}]: ${cleanTextForAI(m.content).slice(0, 200)}`);

    // Load all players in session (for router, engine and system truth context)
    const { data: allPlayersData } = await supabase.from("players").select("*, inventory(*), current_zone").eq("session_id", session_id).order("created_at", { ascending: true });
    const allPlayers = allPlayersData || [];

    // Р—Р°РіСЂСѓР¶Р°РµРј РєР°СЂС‚Сѓ СЂР°СЃСЃС‚РѕСЏРЅРёР№ Р·РѕРЅ Рё С‚РёРї РјРµСЃС‚РЅРѕСЃС‚Рё РёР· РєСЌС€Р° СЃРµСЃСЃРёРё (Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ РїСЂРё СЃРѕР·РґР°РЅРёРё/СЃРјРµРЅРµ Р»РѕРєР°С†РёРё)
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
      return role === "companion" || role === "СЃРїСѓС‚РЅРёРє" || tags.some((t: string) => ["companion", "СЃРїСѓС‚РЅРёРє", "РІ_РѕС‚СЂСЏРґРµ", "РїРёС‚РѕРјРµС†", "РїСЂРёСЂСѓС‡РµРЅ"].includes(t));
    };

    // Р•СЃР»Рё РёРіСЂРѕРє РЅР°С…РѕРґРёС‚СЃСЏ РІ РґРёРєРѕР№ Р·РѕРЅРµ (Р»РµСЃ, РїРµС‰РµСЂР°, РїСѓСЃС‚РѕС€СЊ), РіРѕСЂРѕРґСЃРєРёРµ NPC (С‚РѕСЂРіРѕРІС†С‹, Р¶РёС‚РµР»Рё) РѕСЃС‚Р°СЋС‚СЃСЏ РІ РіРѕСЂРѕРґРµ!
    // Р’ СЃС†РµРЅРµ СЃ РёРіСЂРѕРєРѕРј РїСЂРёСЃСѓС‚СЃС‚РІСѓСЋС‚ РўРћР›Р¬РљРћ СЃРїСѓС‚РЅРёРєРё/РїРёС‚РѕРјС†С‹ РёР»Рё РґРёРєРёРµ РІСЂР°РіРё/СЃСѓС‰РµСЃС‚РІР°.
    if (currentWildZone) {
      const totalLoaded = allNpcs.length;
      allNpcs = allNpcs.filter((n: any) =>
        isCompanionNpc(n) ||
        n.is_hostile === true ||
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["РґРёРєРёР№", "РјРѕРЅСЃС‚СЂ", "РґРёРєР°СЏ_Р·РѕРЅР°", "Р·РІРµСЂСЊ", "С…РёС‰РЅРёРє"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] In wild zone "${currentWildZone}": filtered out town NPCs (${totalLoaded} -> ${allNpcs.length} present)`);
    }

    console.log(`[${requestId}] [START] рџЋЇ Turn for player "${player.name}" (${player.id}) in session "${session_id}". Action: "${safeActionText}"`);
    console.log(`[${requestId}] [LOCATION] рџ“Ќ LocationID=${session.current_location_id}, Name="${currentLocationName}", WildZone="${session.current_wild_zone || 'none'}", NPCs present=${allNpcs.length} (${allNpcs.map((n: any) => n.name).join(', ') || 'none'})`);

    // РџСЂРѕРІРµСЂСЏРµРј, РїРµСЂРІС‹Р№ Р»Рё СЌС‚Рѕ С…РѕРґ РІ СЃРµСЃСЃРёРё (РЅРµС‚ СЃРѕРѕР±С‰РµРЅРёР№ РёРіСЂРѕРєР° РёР»Рё Р»РѕРєР°С†РёСЏ РЅРµ Р·Р°РґР°РЅР°)
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
            name: player.name || "Р“РµСЂРѕР№",
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

          if (startLoc.pos_x !== undefined && startLoc.pos_y !== undefined) {
            await supabase.from("players").update({
              pos_x: startLoc.pos_x,
              pos_y: startLoc.pos_y
            }).eq("id", player.id);
          }

          if (startLoc.initial_npcs?.length) {
            allNpcs = startLoc.initial_npcs;
          }
          console.log(`[${requestId}] [STARTING_LOCATION] Created start location "${currentLocationName}" (${currentStateName}) for ${player.name}`);

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

    // Р•СЃР»Рё РєР°СЂС‚Р° СЂР°СЃСЃС‚РѕСЏРЅРёР№ РёР»Рё С‚РёРї РјРµСЃС‚РЅРѕСЃС‚Рё РµС‰С‘ РЅРµ СЃРѕР·РґР°РЅС‹ вЂ” РіРµРЅРµСЂРёСЂСѓРµРј С‡РµСЂРµР· РР
    if (Object.keys(locationMap).length === 0 && (session.current_location_id || currentWildZone || currentLocationName)) {
      try {
        const initLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: session.current_location_id,
          locationName: currentLocationName || "Р›РѕРєР°С†РёСЏ",
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
    // Р§Р°С‚: СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ РѕС‡РєРѕРІ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРє
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
            STR: "СЃРёР»Сѓ", DEX: "Р»РѕРІРєРѕСЃС‚СЊ", CON: "РІС‹РЅРѕСЃР»РёРІРѕСЃС‚СЊ",
            INT: "РёРЅС‚РµР»Р»РµРєС‚", WIS: "РјСѓРґСЂРѕСЃС‚СЊ", CHA: "С…Р°СЂРёР·РјСѓ"
          };
          const statRu = statNamesRu[statAllocIntent.stat] || statAllocIntent.stat;
          statAllocatedFact = `${player.name} СѓСЃРїРµС€РЅРѕ РІР»РѕР¶РёР» ${statAllocIntent.points} РѕС‡Рє. РІ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєСѓ ${statRu} (РЅРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ: ${rpcRes.new_value}, СЃРІРѕР±РѕРґРЅРѕ РѕС‡РєРѕРІ: ${rpcRes.remaining_points}).`;

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
          statAllocatedFact = `${player.name} РїРѕРїС‹С‚Р°Р»СЃСЏ СЂР°СЃРїСЂРµРґРµР»РёС‚СЊ РѕС‡РєРё РІ ${statAllocIntent.stat}, РЅРѕ РЅРµ СЃРјРѕРі: ${rpcRes.error}`;
        }
      } catch (allocEx) {
        console.warn(`[${requestId}] [STAT_ALLOC] Exception:`, allocEx);
      }
    }

    // ============================================
    // РЁРђР“ 1: AI Router (parsePlayerIntent)
    // ============================================
    console.log(`[${requestId}] [STEP 1] AI Router...`);
    // РџРѕРґРіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋ РґР»СЏ РєРѕРЅС‚РµРєСЃС‚Р° РѕР±С‰РµРЅРёСЏ СЃ NPC/РёРіСЂРѕРєР°РјРё
    let recentHistoryStr = "";
    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("sender_name, content, sender_type")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(3);
    if (recentMsgs && recentMsgs.length > 0) {
      recentHistoryStr = recentMsgs.reverse().map((m: any) => `${m.sender_name || (m.sender_type === 'master' ? 'Р”Рњ' : 'РЎРёСЃС‚РµРјР°')}: "${m.content}"`).join("\n");
    }

    const routerInput: RouterInputContext = {
      player_action_text: safeActionText,
      recent_history: recentHistoryStr,
      player: {
        id: player.id,
        name: player.name || "Р“РµСЂРѕР№",
        race: player.race || "Р§РµР»РѕРІРµРє",
        class: player.class || "Р’РѕРёРЅ",
        level: player.level || 1,
        hp: player.hp ?? 100,
        max_hp: player.max_hp ?? 100,
        stats: player.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        location_name: currentLocationName,
        state_name: currentStateName,
      },
      inventory: (player.inventory || []).map((i: any) => ({
        id: i.id,
        item_name: i.item_name || i.name || "РџСЂРµРґРјРµС‚",
        item_type: i.type || i.item_type || "misc",
        quantity: i.quantity || 1,
        condition: i.condition ?? null,
        durability: i.durability ?? null,
        description: i.description || "",
      })),
      nearby_npcs: allNpcs.map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "Р“СѓРјР°РЅРѕРёРґ",
        is_hostile: n.is_hostile || false,
        hp: n.hp ?? 10,
        max_hp: n.max_hp ?? 10,
        distance_meters: 5,
      })),
      nearby_players: (allPlayers || [])
        .filter((p: any) => p.id !== player.id)
        .map((p: any) => ({
          id: p.id,
          name: p.name || "Р“РµСЂРѕР№",
          race: p.race || "Р§РµР»РѕРІРµРє",
          class: p.class || "РРіСЂРѕРє",
          level: p.level || 1,
          hp: p.hp ?? 100,
          max_hp: p.max_hp ?? 100,
          current_zone: p.current_zone || null,
        })),
      weather: {
        description: "РЇСЃРЅРѕ",
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

    console.log(`[${requestId}] [STEP 1] рџ§­ Router: status="${routerResult.status}", actions=${JSON.stringify(routerResult.actions.map((a: any) => ({ type: a.action_type, target: a.target_item_name || a.target_entity_id, stat: a.stat_to_check })))}`);

    // Apply GPS time/location (still here, as it's pre-engine)
    let time_passed_minutes = 0;
    let location_changed = startingLocationGenerated,
      new_location_id: string | null = startingLocationGenerated ? session.current_location_id : null,
      new_wild_zone: string | null = null,
      wild_zone_changed = false,
      travel_description = "";

    // Р”РµС‚РµРєС‚РѕСЂ РЅР°РјРµСЂРµРЅРёСЏ РїРµСЂРµРјРµС‰РµРЅРёСЏ РёР»Рё РІС‹С…РѕРґР° РёР· РїРѕРјРµС‰РµРЅРёСЏ
    const isMovementAction = routerResult.actions?.some((a: any) => a.action_type === "move") ||
      /РІС‹С…РѕРґ|РІС‹Р№С‚Рё|РІС‹С…РѕР¶Сѓ|РїРѕРєРёРЅСѓС‚СЊ|РїРѕРєРёРґР°СЋ|СѓР№С‚Рё|СѓС…РѕР¶Сѓ|РѕС‚РїСЂР°РІРёС‚СЊСЃСЏ|РёРґСѓ |РµРґСѓ |Р±РµРіСѓ |РЅР° СѓР»РёС†|РЅР°СЂСѓР¶Сѓ|Р·Р° РїСЂРµРґРµР»С‹|РЅР° С‚СЂР°РєС‚|РІ Р»РµСЃ|РІ РіРѕСЂРѕРґ|Рє РѕР·РµСЂСѓ|РІ РїСѓС‚СЊ|Р·Р°Р№С‚Рё РІ |РІРµСЂРЅСѓС‚СЊСЃСЏ/i.test(safeActionText);

    try {
      const gpsSystemPrompt = buildGpsPrompt({
        playerName: cleanTextForAI(player.name || "Р“РµСЂРѕР№"),
        actionText: safeActionText,
        intentType: "router",
        intentDescription: safeActionText,
        currentYear: session.game_year || 1248, currentMonth: session.game_month || 5,
        currentDay: session.game_day || 14, currentHour: session.game_hour || 10,
        currentMinute: session.game_minute || 0,
        currentLocation: currentLocationName, currentState: currentStateName,
        currentWildZone,
        wantsLocationChange: isMovementAction, locationChangeDescription: safeActionText,
        availableLocations,
      });
      const gpsResp = await callAI(gpsSystemPrompt, "РћРїСЂРµРґРµР»Рё РІСЂРµРјСЏ.", openrouterApiKey, 2, gpsModel);
      const gpsParsed = parseAIJson(gpsResp);
      if (gpsParsed) {
        time_passed_minutes = Math.max(0, Math.min(1440, Number(gpsParsed.time_minutes) || 0));
        if (gpsParsed.location_changed === true) {
          if (gpsParsed.is_wild_zone === true && gpsParsed.new_location_name) {
            // РџРµСЂРµС…РѕРґ РІ РґРёРєСѓСЋ Р·РѕРЅСѓ (Р»РµСЃ, РїРµС‰РµСЂР°, РїРѕР»Рµ, С‚СЂР°РєС‚)
            wild_zone_changed = true;
            new_wild_zone = gpsParsed.new_location_name;
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Wild zone: ${new_wild_zone}`);
          } else if (gpsParsed.new_location_id) {
            // РџРµСЂРµС…РѕРґ РІ РёРјРµРЅРѕРІР°РЅРЅСѓСЋ Р»РѕРєР°С†РёСЋ
            location_changed = true;
            new_location_id = gpsParsed.new_location_id;
            wild_zone_changed = true;
            new_wild_zone = null; // РѕС‡РёС‰Р°РµРј РґРёРєСѓСЋ Р·РѕРЅСѓ
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Location change в†’ ${new_location_id}`);
          }
        }
      }
    } catch (e) { /* ignore GPS errors, game continues */ }

    // Р”РµС‚РµСЂРјРёРЅРёСЂРѕРІР°РЅРЅР°СЏ РіР°СЂР°РЅС‚РёСЏ: РІС‹С…РѕРґ РёР· Р·РґР°РЅРёСЏ/С‚Р°РІРµСЂРЅС‹ РЅР°СЂСѓР¶Сѓ, РµСЃР»Рё GPS РЅРµ РїРµСЂРµРєР»СЋС‡РёР» Р·РѕРЅСѓ
    const isBuildingLocation = /С‚Р°РІРµСЂРЅ|С‚СЂР°РєС‚РёСЂ|РїРѕСЃС‚РѕСЏР»|РґРѕРј|РїРѕРґРІР°Р»|РіСЂРѕС‚|РєР°С‚Р°РєРѕРјР±|РїРѕРіСЂРµР±|tavern|building|dungeon/i.test(currentLocationType || "") ||
      /С‚Р°РІРµСЂРЅ|С‚СЂР°РєС‚РёСЂ|РїРѕСЃС‚РѕСЏР»|РґРѕРј|Р±Р°С€РЅ|РєР°С‚Р°РєРѕРјР±|РїРѕРіСЂРµР±/i.test(currentLocationName || "");
    const isExitingBuilding = /РІС‹С…РѕРґ|РІС‹Р№С‚Рё|РІС‹С…РѕР¶Сѓ|РїРѕРєРёРґР°|РЅР°СЂСѓР¶Сѓ|РЅР° СѓР»РёС†|РЅР° РІРѕР·РґСѓС…|РІРѕ РґРІРѕСЂ|РЅР° РґРІРѕСЂ|РЅР° С‚СЂР°РєС‚|РЅР° РґРѕСЂРѕРі|РІ РїСѓС‚СЊ/i.test(safeActionText);
    const isEnteringBuilding = /Р·Р°Р№С‚Рё РІ С‚Р°РІРµСЂРЅСѓ|Р·Р°С…РѕР¶Сѓ РІ С‚Р°РІРµСЂРЅСѓ|РІРµСЂРЅСѓС‚СЊСЃСЏ РІ С‚Р°РІРµСЂРЅСѓ|РІС…РѕР¶Сѓ РІ С‚Р°РІРµСЂРЅСѓ|Р·Р°Р№С‚Рё РІРЅСѓС‚СЂСЊ|РІРµСЂРЅСѓС‚СЊСЃСЏ РІРЅСѓС‚СЂСЊ/i.test(safeActionText);

    if (isBuildingLocation && isExitingBuilding && !location_changed && !wild_zone_changed) {
      wild_zone_changed = true;
      new_wild_zone = `РўСЂР°РєС‚ Сѓ ${currentLocationName || "С‚Р°РІРµСЂРЅС‹"}`;
      travel_description = `Р’С‹ СЂР°СЃРїР°С…РёРІР°РµС‚Рµ РґСѓР±РѕРІСѓСЋ РґРІРµСЂСЊ Рё РІС‹С…РѕРґРёС‚Рµ РёР· ${currentLocationName || "РїРѕРјРµС‰РµРЅРёСЏ"} РЅР°СЂСѓР¶Сѓ РЅР° СЃРІРµР¶РёР№ РІРѕР·РґСѓС… РїСЂРёРґРѕСЂРѕР¶РЅРѕРіРѕ С‚СЂР°РєС‚Р°.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [EXIT_BUILDING] Player stepped outside: ${new_wild_zone}`);
    } else if (currentWildZone && isEnteringBuilding && !location_changed) {
      wild_zone_changed = true;
      new_wild_zone = null;
      travel_description = `Р’С‹ РІРѕР·РІСЂР°С‰Р°РµС‚РµСЃСЊ РІРЅСѓС‚СЂСЊ С‚Р°РІРµСЂРЅС‹ РІ С‚С‘РїР»РѕРµ РїРѕРјРµС‰РµРЅРёРµ.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [ENTER_BUILDING] Player stepped back inside tavern`);
    }


    // ============================================
    // РЈРџР РђР’Р›Р•РќРР• РћРўР РЇР”РћРњ Р РЎРћРџРћРЎРўРђР’Р›Р•РќРР• РР“Р РћРљРћР’ (Party & Player Resolution)
    // ============================================
    let partyEventFact: string | null = null;
    const lowerAct = safeActionText.toLowerCase();

    // Р”РµС‚РµСЂРјРёРЅРёСЂРѕРІР°РЅРЅРѕРµ СЃРѕРїРѕСЃС‚Р°РІР»РµРЅРёРµ С†РµР»Рё СЃ Р¶РёРІС‹РјРё РёРіСЂРѕРєР°РјРё РїРѕ РёРјРµРЅРё РІ С‚РµРєСЃС‚Рµ
    const targetedOtherPlayer = (allPlayers || []).filter((p: any) => p.id !== player.id).find((p: any) => {
      if (!p.name) return false;
      const pNameLower = p.name.trim().toLowerCase();
      const nameRegex = new RegExp(`(^|[\\s,."В«*!?])${pNameLower}[Р°-СЏ]*([\\s,."В»*!?]|$)`, 'i');
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

    const isPartyInviteOrJoin = /(?:РѕР±СЉРµРґРёРЅРё(?:С‚СЊСЃСЏ|РјСЃСЏ)|СЃРѕР·РґР°(?:С‚СЊ|РґРёРј) РѕС‚СЂСЏРґ|РїРѕР№Рґ[РµС‘]Рј РІРјРµСЃС‚Рµ|РёРґ[РµС‘]Рј РІРјРµСЃС‚Рµ|РґР°РІР°Р№(?:С‚Рµ)?.*(?:РІРјРµСЃС‚Рµ|РїСѓС‚РµС€РµСЃС‚РІ|РѕС‚СЂСЏРґ)|Р±СѓРґРµРј РІРјРµСЃС‚Рµ|РїСѓС‚РµС€РµСЃС‚РІ(?:РѕРІР°С‚СЊ|СѓРµРј).*РІРјРµСЃС‚Рµ|РІРјРµСЃС‚Рµ.*РїСѓС‚РµС€РµСЃС‚РІ|РґРµСЂР¶РёРјСЃСЏ РІРјРµСЃС‚Рµ|РІ РѕС‚СЂСЏРґ|РІРѕР·СЊРјРё РІ РѕС‚СЂСЏРґ|Р±РµСЂСѓ Р·Р° СЂСѓРєСѓ|РїСЂРµРґР»Р°РіР°СЋ.*(?:РѕС‚СЂСЏРґ|РІРјРµСЃС‚Рµ))/i.test(lowerAct);
    const isPartyLeave = /(?:РїРѕРєРёРґР°СЋ РѕС‚СЂСЏРґ|РІС‹С…РѕР¶Сѓ РёР· РѕС‚СЂСЏРґР°|РѕС‚РґРµР»СЏСЋСЃСЊ РѕС‚ РѕС‚СЂСЏРґР°|РёРґСѓ РѕРґРёРЅ|РїРѕР№РґСѓ РѕРґРёРЅ|СЂР°Р·РґРµР»СЏРµРјСЃСЏ)/i.test(lowerAct);

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

        partyEventFact = `${player.name} РѕС‚РґРµР»РёР»СЃСЏ РѕС‚ РѕС‚СЂСЏРґР° Рё С‚РµРїРµСЂСЊ РґРµР№СЃС‚РІСѓРµС‚ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅРѕ.`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "РЎРёСЃС‚РµРјР°",
            content: `рџљ¶вЂЌв™‚пёЏ ${partyEventFact}`,
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
            name: `РћС‚СЂСЏРґ ${player.name} Рё ${partner.name}`,
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

        partyEventFact = `РЎС„РѕСЂРјРёСЂРѕРІР°РЅ РѕС‚СЂСЏРґ: ${player.name} Рё ${partner.name} С‚РµРїРµСЂСЊ РїСѓС‚РµС€РµСЃС‚РІСѓСЋС‚ РІРјРµСЃС‚Рµ!`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "РЎРёСЃС‚РµРјР°",
            content: `вљ”пёЏ ${partyEventFact}`,
          });
        } catch {}
      }
    }

    // ============================================
    // РЁРђР“ 2: Game Engine
    // ============================================
    console.log(`[${requestId}] [STEP 2] Game Engine...`);

    // Р—Р°РіСЂСѓР·РєР° РЅР°РІС‹РєРѕРІ РёРіСЂРѕРєР° РґР»СЏ РјР°С‚РµРјР°С‚РёС‡РµСЃРєРёС… Р±РѕРЅСѓСЃРѕРІ РґРІРёР¶РєР° (СѓСЂРѕРЅ, РїРѕРїР°РґР°РЅРёРµ, СЃР±РѕСЂ, РІСЂРµРјСЏ)
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

    // РЎРѕРєСЂР°С‰РµРЅРёРµ РІСЂРµРјРµРЅРё РЅР° РґРµР№СЃС‚РІРёСЏ РѕС‚ РЅР°РІС‹РєРѕРІ (СЃРѕР±РёСЂР°С‚РµР»СЊСЃС‚РІРѕ, РІС‹Р¶РёРІР°РЅРёРµ, РіРѕСЂРЅРѕРµ РґРµР»Рѕ Рё С‚.Рґ.)
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
        id: player.id, name: player.name || "Р“РµСЂРѕР№",
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
    console.log(`[${requestId}] [STEP 2] вљ™пёЏ Engine: mutations=${JSON.stringify(engineResult.mutations.map((m: any) => m.type))}, facts=${JSON.stringify(engineResult.raw_system_facts)}`);

    // ============================================
    // РЁРђР“ 3: DB Persistence
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
        current_wild_zone: null, // РІРµСЂРЅСѓР»РёСЃСЊ РІ РёРјРµРЅРѕРІР°РЅРЅСѓСЋ Р»РѕРєР°С†РёСЋ
        current_wild_zone_description: null,
      }).eq("id", session_id);

      // РРіСЂРѕРєРё РґРІРёРіР°СЋС‚СЃСЏ: СЃР±СЂР°СЃС‹РІР°РµРј РїРѕРґР·РѕРЅСѓ РїРµСЂРµРјРµСЃС‚РёРІС€РµРіРѕСЃСЏ РёРіСЂРѕРєР°
      try {
        await supabase.from("players").update({ current_zone: null }).eq("id", player.id);
        player.current_zone = null;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to reset player current_zone:`, pzErr);
      }

      // Р§Р»РµРЅС‹ РѕРґРЅРѕРіРѕ РѕС‚СЂСЏРґР°, РЅР°С…РѕРґРёРІС€РёРµСЃСЏ РІ С‚РѕР№ Р¶Рµ Р·РѕРЅРµ/Р»РѕРєР°С†РёРё, РїРµСЂРµРјРµС‰Р°СЋС‚СЃСЏ РІРјРµСЃС‚Рµ!
      const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
        p.id !== player.id &&
        arePlayersInSameParty(player, p, session) &&
        (p.current_zone || null) === playerStartingZone
      );
      if (partyFellowsInSameZone.length > 0) {
        const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
        try {
          await supabase.from("players").update({ current_zone: null }).in("id", fellowIds);
          for (const fellow of partyFellowsInSameZone) {
            fellow.current_zone = null;
          }
          console.log(`[${requestId}] [PARTY] Fellows ${partyFellowsInSameZone.map((p: any) => p.name).join(", ")} followed ${player.name} to new location ${new_location_id}`);
        } catch (fErr) {
          console.warn(`[${requestId}] Failed to reset party fellows current_zone:`, fErr);
        }
      }

      // РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєР°СЂС‚Сѓ СЂР°СЃСЃС‚РѕСЏРЅРёР№ Р·РѕРЅ Рё С‚РёРї РјРµСЃС‚РЅРѕСЃС‚Рё РґР»СЏ РЅРѕРІРѕР№ Р»РѕРєР°С†РёРё С‡РµСЂРµР· РР
      try {
        const newLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: new_location_id,
          locationName: currentLocationName,
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

      // РЎРїСѓС‚РЅРёРєРё Рё С‡Р»РµРЅС‹ РѕС‚СЂСЏРґР° РїРµСЂРµРјРµС‰Р°СЋС‚СЃСЏ РІРјРµСЃС‚Рµ СЃ РёРіСЂРѕРєРѕРј РІ РЅРѕРІСѓСЋ Р»РѕРєР°С†РёСЋ
      try {
        const { data: compNpcs } = await supabase
          .from("npcs")
          .select("id, status_tags, role")
          .eq("world_id", session.world_id);
        const companionIds = (compNpcs || [])
          .filter((n: any) =>
            n.role === "companion" ||
            (Array.isArray(n.status_tags) && (n.status_tags.includes("СЃРїСѓС‚РЅРёРє") || n.status_tags.includes("РІ_РѕС‚СЂСЏРґРµ") || n.status_tags.includes("РїРёС‚РѕРјРµС†") || n.status_tags.includes("РїСЂРёСЂСѓС‡РµРЅ")))
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

      // РРіСЂРѕРєРё РґРІРёРіР°СЋС‚СЃСЏ: СЃР±СЂР°СЃС‹РІР°РµРј РїРѕРґР·РѕРЅСѓ РїРµСЂРµРјРµСЃС‚РёРІС€РµРіРѕСЃСЏ РёРіСЂРѕРєР°
      try {
        await supabase.from("players").update({ current_zone: null }).eq("id", player.id);
        player.current_zone = null;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to reset player current_zone:`, pzErr);
      }

      // Р§Р»РµРЅС‹ РѕС‚СЂСЏРґР° РїРµСЂРµС…РѕРґСЏС‚ РІ РґРёРєСѓСЋ Р·РѕРЅСѓ РІРјРµСЃС‚Рµ
      const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
        p.id !== player.id &&
        arePlayersInSameParty(player, p, session) &&
        (p.current_zone || null) === playerStartingZone
      );
      if (partyFellowsInSameZone.length > 0) {
        const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
        try {
          await supabase.from("players").update({ current_zone: null }).in("id", fellowIds);
          for (const fellow of partyFellowsInSameZone) {
            fellow.current_zone = null;
          }
          console.log(`[${requestId}] [PARTY] Fellows ${partyFellowsInSameZone.map((p: any) => p.name).join(", ")} followed ${player.name} to wild zone ${new_wild_zone}`);
        } catch (fErr) {
          console.warn(`[${requestId}] Failed to reset party fellows current_zone:`, fErr);
        }
      }

      // РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєР°СЂС‚Сѓ СЂР°СЃСЃС‚РѕСЏРЅРёР№ Р·РѕРЅ Рё С‚РёРї РјРµСЃС‚РЅРѕСЃС‚Рё РґР»СЏ РґРёРєРѕР№ Р·РѕРЅС‹ С‡РµСЂРµР· РР
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
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["РґРёРєРёР№", "РјРѕРЅСЃС‚СЂ", "РґРёРєР°СЏ_Р·РѕРЅР°", "Р·РІРµСЂСЊ", "С…РёС‰РЅРёРє"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] Player entered wild zone: ${new_wild_zone}`);
    }

    // РћС‚СЃР»РµР¶РёРІР°РЅРёРµ РїРµСЂРµРјРµС‰РµРЅРёСЏ РёРіСЂРѕРєР° РІРЅСѓС‚СЂРё РїРѕРґР·РѕРЅ Р»РѕРєР°С†РёРё (РґР»СЏ РўСѓРјР°РЅР° Р’РѕР№РЅС‹ / Р­С…Р° Р’РѕР№РЅС‹)
    if (!location_changed && !wild_zone_changed && locationMap && Object.keys(locationMap).length > 0) {
      const availableZones = Object.keys(locationMap);
      const lowerAction = safeActionText.toLowerCase();

      const matchedZone = availableZones.find((z) => {
        const normZone = z.toLowerCase();
        return lowerAction.includes(normZone) ||
          normZone.split(/\s+/).some((word) => word.length > 3 && lowerAction.includes(word.slice(0, -1)));
      });

      if (matchedZone && matchedZone !== (player.current_zone || "")) {
        const prevZone = player.current_zone || null;
        console.log(`[${requestId}] [ZONE] Player ${player.name} moved to subzone "${matchedZone}" (was: "${player.current_zone || 'РѕСЃРЅРѕРІРЅР°СЏ'}")`);
        player.current_zone = matchedZone;
        try {
          await supabase.from("players").update({ current_zone: matchedZone }).eq("id", player.id);
        } catch (zErr) {
          console.warn(`[${requestId}] Failed to update player current_zone:`, zErr);
        }

        // Р§Р»РµРЅС‹ РѕС‚СЂСЏРґР°, РЅР°С…РѕРґРёРІС€РёРµСЃСЏ РІ С‚РѕР№ Р¶Рµ Р·РѕРЅРµ, РїРµСЂРµРјРµС‰Р°СЋС‚СЃСЏ РІРјРµСЃС‚Рµ!
        const partyFellowsInSameZone = (allPlayers || []).filter((p: any) =>
          p.id !== player.id &&
          arePlayersInSameParty(player, p, session) &&
          (p.current_zone || null) === prevZone
        );
        if (partyFellowsInSameZone.length > 0) {
          const fellowIds = partyFellowsInSameZone.map((p: any) => p.id);
          try {
            await supabase.from("players").update({ current_zone: matchedZone }).in("id", fellowIds);
            for (const fellow of partyFellowsInSameZone) {
              fellow.current_zone = matchedZone;
            }
            console.log(`[${requestId}] [PARTY] Fellows ${partyFellowsInSameZone.map((p: any) => p.name).join(", ")} moved together to "${matchedZone}"`);
          } catch (fErr) {
            console.warn(`[${requestId}] Failed to update party fellows current_zone:`, fErr);
          }
        }
      }
    }


    // ============================================
    // РђР’РўРћРќРћРњРќР«Р• Р­РљРЎРџР•Р”РР¦РР NPC (0 С‚РѕРєРµРЅРѕРІ, Lazy Calendar Simulation)
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
    // РРќРР¦РРђРўРР’Рђ РЎРџРЈРўРќРРљРћР’ Р’ РўР•РљРЈР©Р•Р™ РЎР¦Р•РќР• (РњРёСЂРЅС‹Рµ Рё СЂРѕР»РµРІС‹Рµ РґРµР№СЃС‚РІРёСЏ)
    // ============================================
    let companionAction: any = null;
    try {
      companionAction = await handleCompanionInSceneAction({
        supabase,
        player_action_text: safeActionText,
        acting_player_name: player.name || "Р“РµСЂРѕР№",
        location_npcs: allNpcs,
        session_id,
        openrouter_api_key: openrouterApiKey,
        model: satelliteModel || "meta-llama/llama-3.3-70b-instruct:free",
      });
      console.log(`[${requestId}] [COMPANION] рџ¤ќ Checked:`, companionAction ? `${companionAction.npc_name} did: ${companionAction.action_description}` : "none (no party companions in scene)");
    } catch (compErr) {
      console.warn(`[${requestId}] Companion action failed:`, compErr);
    }

    // ============================================
    // Р”РРќРђРњРР§Р•РЎРљРР• РќРђР’Р«РљР РР“Р РћРљРђ (1..100)
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
    // РџР РћРљРђР§РљРђ РЈР РћР’РќРЇ РџР•Р РЎРћРќРђР–Рђ (1..100, +2 РћРҐ, HP/MP)
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
    // РЁРђР“ 4: System Truth Compiler
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
      location: { name: currentLocationName || currentWildZone || "РћС‚РєСЂС‹С‚С‹Р№ РјРёСЂ", weather: routerInput.weather?.description || null },
      players: (allPlayers || []).map((p: any) => ({
        id: p.id, name: p.name || "Р“РµСЂРѕР№", hp: p.hp ?? 100, max_hp: p.max_hp ?? 100, inventory: p.inventory || [],
      })),
      npcs: (session.current_wild_zone ? allNpcs.filter((n: any) => isCompanionNpc(n) || n.is_hostile === true || (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["РґРёРєРёР№", "РјРѕРЅСЃС‚СЂ", "РґРёРєР°СЏ_Р·РѕРЅР°", "Р·РІРµСЂСЊ", "С…РёС‰РЅРёРє"].includes(String(t).toLowerCase())))) : allNpcs).map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "РЎСѓС‰РµСЃС‚РІРѕ",
        role: n.role || "РћР±С‹РІР°С‚РµР»СЊ",
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
      encounter_alert: null,
      storyline: sessionStoryline ? {
        title: sessionStoryline.title,
        prologue: sessionStoryline.prologue,
        current_arc: sessionStoryline.arcs?.[sessionStoryline.current_arc_index || 0] || null,
      } : null,
    });
    console.log(`[${requestId}] [STEP 4] turn_status=${systemTruth.turn_status}, ${Object.keys(systemTruth.player_truths).length} player_truths`);

    // ============================================
    // РЁРђР“ 5: Narrator
    // ============================================
    console.log(`[${requestId}] [STEP 5] Narrator...`);
    let narratorOutput: { players: Record<string, string>; global_narrative: string };
    try {
      narratorOutput = await generateNarrative({
        system_truth: systemTruth,
        action_text: safeActionText,
        player_name: player.name || "Р“РµСЂРѕР№",
        player_race: player.race || "Р§РµР»РѕРІРµРє",
        player_class: player.class || "Р’РѕРёРЅ",
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
      session_id, sender_type: "player", sender_id: player.user_id, sender_name: player.name || "Р“РµСЂРѕР№", content: safeActionText,
    });
    // 2) Master narratives вЂ” РїРѕ РѕРґРЅРѕРјСѓ СЃРѕРѕР±С‰РµРЅРёСЋ РЅР° РёРіСЂРѕРєР°
    for (const [targetPlayerId, narrative] of Object.entries(narratorOutput.players)) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "РњР°СЃС‚РµСЂ", content: narrative,
        metadata: {
          target_player_id: targetPlayerId,
          turn_status: systemTruth.turn_status,
          hp_status: systemTruth.player_truths[targetPlayerId]?.hp_status,
          inventory_delta: systemTruth.player_truths[targetPlayerId]?.inventory_delta,
          game_time: systemTruth.environment.time,
        },
      });
    }
    // 3) Global log (С‚РѕР»СЊРєРѕ РїСЂРё РЅР°Р»РёС‡РёРё > 1 РёРіСЂРѕРєР°, С‡С‚РѕР±С‹ РІ СЃРѕР»Рѕ РЅРµ РґСѓР±Р»РёСЂРѕРІР°С‚СЊ РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РЅР°СЂСЂР°С‚РёРІ)
    if (narratorOutput.global_narrative && allPlayers.length > 1) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Р›РѕРі",
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

    // 3.5) РўРЈРњРђРќ Р’РћР™РќР« вЂ” fog-СЃРѕРѕР±С‰РµРЅРёСЏ РґР»СЏ РёРіСЂРѕРєРѕРІ РІ РґСЂСѓРіРёС… Р·РѕРЅР°С…
    // Р Р°Р±РѕС‚Р°РµС‚ С‚РѕР»СЊРєРѕ РїСЂРё РЅР°Р»РёС‡РёРё РЅРµСЃРєРѕР»СЊРєРёС… РёРіСЂРѕРєРѕРІ РІ СЃРµСЃСЃРёРё
    if (allPlayers.length > 1) {
      try {
        // AI РѕРїСЂРµРґРµР»СЏРµС‚ event_type РІ Router вЂ” РЅРёРєР°РєРёС… regex-СЌРІСЂРёСЃС‚РёРє!
        const eventType = routerResult.event_type || null;
        if (eventType) {
          const thresholds = fogGetEffectiveThresholds(eventType, currentTerrain);
          const actorZone: string | null = player.current_zone || null;
          const speechContent = fogExtractSpeech(safeActionText);

          // РќР°Р±Р»СЋРґР°С‚РµР»Рё = РІСЃРµ РёРіСЂРѕРєРё, РєСЂРѕРјРµ Р°РІС‚РѕСЂР° РґРµР№СЃС‚РІРёСЏ
          const observers = allPlayers.filter((p: any) => p.id !== player.id);

          let fogCount = 0;
          for (const obs of observers) {
            const obsZone: string | null = obs.current_zone || null;
            const tier = fogGetDistanceTier(actorZone, obsZone, locationMap);

            // same_room (tier 0) вЂ” СЌС‚РѕС‚ РёРіСЂРѕРє СѓР¶Рµ РЅР°С…РѕРґРёС‚СЃСЏ РІ С‚РѕР№ Р¶Рµ Р·РѕРЅРµ/РєРѕРјРЅР°С‚Рµ
            if (tier === DISTANCE_TIER.SAME_ROOM) continue;

            const hears  = tier <= thresholds.audioTier;
            const sees   = tier <= thresholds.visualTier;
            if (!hears && !sees) continue; // СЃР»РёС€РєРѕРј РґР°Р»РµРєРѕ вЂ” РЅРёС‡РµРіРѕ РЅРµ РґРѕС…РѕРґРёС‚

            const fogText = fogPickNarrative(eventType, tier, speechContent);
            if (!fogText) continue;

            await supabase.from("messages").insert({
              session_id,
              sender_type: "master",
              sender_name: "РњР°СЃС‚РµСЂ",
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
            console.log(`[${requestId}] [FOG] рџЊ«пёЏ ${player.name} (${eventType}, terrain=${currentTerrain || 'default'}) в†’ ${obs.name} tier=${tier}: "${fogText.slice(0, 60)}..."`);
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
        sender_name: "РњРёСЂ",
        content: `рџ“њ **РЎРѕР±С‹С‚РёРµ РјРёСЂР°**: ${ev.summary}`,
        metadata: { type: "npc_expedition", npc_id: ev.npc_id, loot: ev.loot, leveled_up: ev.leveled_up },
      });
    }

    // 6) Skill level up notification
    if (skillProgress?.leveled_up) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "РЎРёСЃС‚РµРјР°",
        content: `рџ”” **[РќР°РІС‹Рє РїРѕРІС‹С€РµРЅ!]** ${skillProgress.name} РґРѕСЃС‚РёРі СѓСЂ. ${skillProgress.level}! (+${skillProgress.level}% Рє СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚Рё)`,
        metadata: { type: "skill_level_up", skill_key: skillProgress.skill_key, level: skillProgress.level },
      });
    }

    // 7) Player level up notification
    if (playerLevelUp) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "РЎРёСЃС‚РµРјР°",
        content: `рџЋ‰ **[РќРѕРІС‹Р№ СѓСЂРѕРІРµРЅСЊ!]** РџРѕР·РґСЂР°РІР»СЏРµРј, РІС‹ РґРѕСЃС‚РёРіР»Рё ${playerLevelUp.new_level} СѓСЂРѕРІРЅСЏ!\nРџРѕР»СѓС‡РµРЅРѕ +2 СЃРІРѕР±РѕРґРЅС‹С… РѕС‡РєР° С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРє (РћРҐ). РњР°РєСЃ. HP: ${playerLevelUp.max_hp}, РњР°РєСЃ. MP: ${playerLevelUp.max_mp}.`,
        metadata: { type: "player_level_up", ...playerLevelUp },
      });
    }

    // 7.1) Storyline Progress Evaluation (Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ РѕС‚СЃР»РµР¶РёРІР°РЅРёРµ С†РµР»РµР№ Р°СЂРєРё)
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
              sender_name: "РЎСЋР¶РµС‚",
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
        acting_player_name: player.name || "Р“РµСЂРѕР№",
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

    // 10) Pet Taming interaction (РёРЅС‚РµР»Р»РµРєС‚СѓР°Р»СЊРЅРѕРµ РїСЂРёСЂСѓС‡РµРЅРёРµ Р·РІРµСЂСЏ/РјРѕРЅСЃС‚СЂР°)
    try {
      const targetCreature = allNpcs.find((n: any) =>
        n.category === "beast" || n.category === "monster" ||
        (n.race && ["Р·РІРµСЂСЊ", "РІРѕР»Рє", "Р¶РёРІРѕС‚РЅРѕРµ", "РјРѕРЅСЃС‚СЂ"].some(r => n.race.toLowerCase().includes(r)))
      );
      if (targetCreature) {
        const tamingResult = await evaluatePetTamingAttempt({
          supabase,
          acting_player: {
            id: player.id,
            name: player.name || "Р“РµСЂРѕР№",
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
            sender_name: "РџСЂРёСЂСѓС‡РµРЅРёРµ",
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

    // 11) Proactive Companion Offer (NPC СЃР°Рј РїСЂРµРґР»Р°РіР°РµС‚ РїРѕР№С‚Рё РІ РїСѓС‚СЊ РїСЂРё РІС‹СЃРѕРєРѕРј РґРѕРІРµСЂРёРё)
    try {
      if (!companionInviteHandled) {
        const proactiveOffer = await checkNpcProactiveCompanionOffer({
          supabase,
          acting_player_name: player.name || "Р“РµСЂРѕР№",
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
    // D&D Р‘РћР•Р’РђРЇ РћР§Р•Р Р•Р”Р¬ РҐРћР”РћР’ (TURN QUEUE РЎ РРќРР¦РРђРўРР’РћР™ NPC, РЎРџРЈРўРќРРљРћР’ Р РџРРўРћРњР¦Р•Р’)
    // ============================================
    let npcCombatTurns: any[] = [];
    let isRoundCompleted = (!allPlayers || allPlayers.length <= 1);
    try {
      const isCombat = routerResult.actions.some((a: any) => a.type === "attack") ||
        allNpcs.some((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);

      const { data: existingTurns } = await supabase.from("turn_queue")
        .select("id, player_id, npc_id, entity_type, status, initiative")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

      if (isCombat) {
        // РџРѕРґРєР»СЋС‡Р°РµРј Рє Р±РѕСЋ РІСЂР°Р¶РґРµР±РЅС‹С… NPC СЃ Р±СЂРѕСЃРєРѕРј РёРЅРёС†РёР°С‚РёРІС‹
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

        // РџРѕРґРєР»СЋС‡Р°РµРј Рє Р±РѕСЋ СЃРїСѓС‚РЅРёРєРѕРІ Рё РїСЂРёСЂСѓС‡РµРЅРЅС‹С… РїРёС‚РѕРјС†РµРІ РёРіСЂРѕРєР°
        const activeCompanions = allNpcs.filter((n: any) =>
          !n.is_hostile &&
          n.is_alive !== false &&
          (n.hp ?? 10) > 0 &&
          (n.role === "companion" || (Array.isArray(n.status_tags) && (n.status_tags.includes("СЃРїСѓС‚РЅРёРє") || n.status_tags.includes("РІ_РѕС‚СЂСЏРґРµ") || n.status_tags.includes("РїРёС‚РѕРјРµС†") || n.status_tags.includes("РїСЂРёСЂСѓС‡РµРЅ"))))
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
        // РћС‡РµСЂРµРґРё РµС‰С‘ РЅРµС‚ вЂ” СЃРѕР·РґР°С‘Рј РґР»СЏ РёРіСЂРѕРєРѕРІ СЃРµСЃСЃРёРё
        if (allPlayers && allPlayers.length > 1) {
          isRoundCompleted = false;
          // РЎРѕСЂС‚РёСЂСѓРµРј РёРіСЂРѕРєРѕРІ: РІ Р±РѕСЋ РїРѕ РёРЅРёС†РёР°С‚РёРІРµ, РІ РјРёСЂРЅРѕРј СЂРµР¶РёРјРµ вЂ” СЃС‚СЂРѕРіРѕ РїРѕ РїРѕСЂСЏРґРєСѓ РІС…РѕРґР° РІ РјРёСЂ (created_at ASC)
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
        // Р”РѕР±Р°РІР»СЏРµРј РёРіСЂРѕРєРѕРІ, РєРѕС‚РѕСЂС‹С… РµС‰С‘ РЅРµС‚ РІ РѕС‡РµСЂРµРґРё (РІ РїРѕСЂСЏРґРєРµ РёС… РІС…РѕРґР° created_at ASC)
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

        // Р—Р°РІРµСЂС€Р°РµРј С‚РµРєСѓС‰РёР№ С…РѕРґ РёРіСЂРѕРєР°
        await supabase.from("turn_queue").update({
          status: "completed",
          resolved_at: new Date().toISOString(),
          parsed_action: routerResult,
          roll_result: engineResult,
        }).eq("session_id", session_id).eq("player_id", player.id);

        // РС‰РµРј СЃР»РµРґСѓСЋС‰РёР№ С…РѕРґ СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј 'waiting'
        // РџСЂРё isCombat = false С…РѕРґС‹ РїРµСЂРµРґР°СЋС‚СЃСЏ СЃС‚СЂРѕРіРѕ РїРѕ РѕС‡РµСЂРµРґРё РІС…РѕРґР° РІ РјРёСЂ (created_at ASC) РѕС‚ РѕРґРЅРѕРіРѕ РёРіСЂРѕРєР° РґСЂСѓРіРѕРјСѓ.
        // РџСЂРё isCombat = true С…РѕРґС‹ СѓРїРѕСЂСЏРґРѕС‡РµРЅС‹ РїРѕ Р±РѕРµРІРѕР№ РёРЅРёС†РёР°С‚РёРІРµ (initiative DESC, created_at ASC).
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

        // Р•СЃР»Рё СЃР»РµРґСѓСЋС‰РёР№ С…РѕРґ РїСЂРёРЅР°РґР»РµР¶РёС‚ NPC вЂ” РІС‹РїРѕР»РЅСЏРµРј Р±РѕРµРІС‹Рµ С…РѕРґС‹ NPC
        while (nextTurn && nextTurn.entity_type === "npc" && nextTurn.npc_id) {
          const currentTurnNpcId = nextTurn.npc_id;
          const turnNpc = allNpcs.find((n: any) => n.id === currentTurnNpcId);
          if (turnNpc && turnNpc.is_alive !== false && (turnNpc.hp ?? 10) > 0) {
            const isCompanion = !turnNpc.is_hostile &&
              (turnNpc.role === "companion" || (Array.isArray(turnNpc.status_tags) && (turnNpc.status_tags.includes("СЃРїСѓС‚РЅРёРє") || turnNpc.status_tags.includes("РІ_РѕС‚СЂСЏРґРµ") || turnNpc.status_tags.includes("РїРёС‚РѕРјРµС†") || turnNpc.status_tags.includes("РїСЂРёСЂСѓС‡РµРЅ"))));

            if (isCompanion) {
              // РҐРћР” РЎРџРЈРўРќРРљРђ / РџРРўРћРњР¦Рђ: Р°С‚Р°РєСѓРµС‚ РІСЂР°Р¶РґРµР±РЅРѕРіРѕ РјРѕР±Р° (РЅР°РїСЂРёРјРµСЂ, РІРѕР»РєР°) РІ РїРѕРјРѕС‰СЊ РёРіСЂРѕРєСѓ!
              const hostileMobs = allNpcs.filter((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);
              if (hostileMobs.length > 0) {
                const targetMob = hostileMobs[0];
                const attackResult = executeCompanionAttack({
                  companion: turnNpc,
                  targetMob: {
                    id: targetMob.id,
                    name: targetMob.name || "Р’СЂР°Рі",
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

                  // Р‘РѕРЅСѓСЃ Рє РѕС‚РЅРѕС€РµРЅРёСЏРј СЃРѕ СЃРїСѓС‚РЅРёРєРѕРј Р·Р° РїРѕРјРѕС‰СЊ РІ Р±РѕСЋ (+1)
                  try {
                    const { data: rel } = await supabase.from("npc_relationships").select("score").eq("npc_id", turnNpc.id).eq("player_id", player.id).maybeSingle();
                    if (rel) {
                      await supabase.from("npc_relationships").update({ score: rel.score + 1 }).eq("npc_id", turnNpc.id).eq("player_id", player.id);
                    }
                  } catch (e) { /* ignore */ }

                  // РџСЂРѕРєР°С‡РєР° СѓСЂРѕРІРЅСЏ РїРёС‚РѕРјС†Р° Р·Р° СѓС‡Р°СЃС‚РёРµ РІ Р±РѕСЋ (1..100)
                  const isPet = Array.isArray(turnNpc.status_tags) && turnNpc.status_tags.includes("РїРёС‚РѕРјРµС†");
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
                          sender_name: "РЎРёСЃС‚РµРјР°",
                          content: `рџЋ‰ **[РџРёС‚РѕРјРµС† РїРѕРІС‹СЃРёР» СѓСЂРѕРІРµРЅСЊ!]** ${turnNpc.name} РґРѕСЃС‚РёРі ${turnNpc.level} СѓСЂРѕРІРЅСЏ! РњР°РєСЃ. Р·РґРѕСЂРѕРІСЊРµ: ${turnNpc.max_hp} HP.`,
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
              // РҐРћР” Р’Р РђР–Р”Р•Р‘РќРћР“Рћ NPC (Р°С‚Р°РєР° РёРіСЂРѕРєР°)
              const battlefieldPlayers = (allPlayers || []).map((p: any) => ({
                id: p.id,
                name: p.name || "Р“РµСЂРѕР№",
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
                sender_name: "Р‘РѕР№",
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

          // РџРѕРјРµС‡Р°РµРј С…РѕРґ NPC РєР°Рє РІС‹РїРѕР»РЅРµРЅРЅС‹Р№
          await supabase.from("turn_queue").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
          }).eq("id", nextTurn.id);

          // РџСЂРѕРІРµСЂСЏРµРј СЃР»РµРґСѓСЋС‰РёР№ С…РѕРґ
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
          // Р Р°СѓРЅРґ Р·Р°РІРµСЂС€РµРЅ! РџРµСЂРµР·Р°РїСѓСЃРєР°РµРј РѕС‡РµСЂРµРґСЊ
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
    // Р¤РћРќРћР’Р«Р™ РџР РћР¦Р•РЎРЎ РЎРРњРЈР›РЇР¦РР Р–РР—РќР РњРР Рђ РџРћРЎР›Р• РљР РЈР“Рђ РҐРћР”РћР’
    // (Р РѕРІРЅРѕ 1 Р·Р°РїСЂРѕСЃ Рє РР РЅР° РІСЃРµС… СѓРґР°Р»РµРЅРЅС‹С… NPC, РєРѕРЅС‚Р°РєС‚РёСЂРѕРІР°РІС€РёС… СЃ РёРіСЂРѕРєР°РјРё)
    // ============================================
    let worldSimResult: any = null;
    if (isRoundCompleted) {
      try {
        const nextRound = (session.current_round || 1) + 1;
        await supabase.from("sessions").update({ current_round: nextRound }).eq("id", session_id);

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
        console.log(`[${requestId}] [WORLD_SIM] рџЊЌ Round ${nextRound} simulated: ${worldSimResult?.simulated_count || 0} distant NPC(s) acted.`);
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
      world_simulation: worldSimResult,
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
    console.error(`[${requestId}] вќЊ ERROR:`, err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

