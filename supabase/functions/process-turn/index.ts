// supabase/functions/process-turn/index.ts
// 5-РЎв‚¬Р В°Р С–Р С•Р Р†РЎвЂ№Р в„– Р С”Р С•Р Р…Р Р†Р ВµР в„–Р ВµРЎР‚ process-turn: Router РІвЂ вЂ™ Engine РІвЂ вЂ™ Persistence РІвЂ вЂ™ SystemTruth РІвЂ вЂ™ Narrator
//
// Р РЃР В°Р С–Р С‘:
//   1. AI Router  (step1_router.ts)        РІР‚вЂќ Р С—Р В°РЎР‚РЎРѓР С‘Р Р…Р С– Р Р…Р В°Р СР ВµРЎР‚Р ВµР Р…Р С‘Р в„– Р С‘Р С–РЎР‚Р С•Р С”Р В° РІвЂ вЂ™ JSON actions
//   2. Game Engine (engine/step2_engine.ts) РІР‚вЂќ Р В±РЎР‚Р С•РЎРѓР С”Р С‘ Р С”РЎС“Р В±Р С‘Р С”Р С•Р Р†, Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р С‘, Р СРЎС“РЎвЂљР В°РЎвЂ Р С‘Р С‘
//   3. Persistence (step3_persistence.ts)   РІР‚вЂќ Р В°РЎвЂљР С•Р СР В°РЎР‚Р Р…Р С•Р Вµ Р С—РЎР‚Р С‘Р СР ВµР Р…Р ВµР Р…Р С‘Р Вµ Р СРЎС“РЎвЂљР В°РЎвЂ Р С‘Р в„– РЎвЂЎР ВµРЎР‚Р ВµР В· RPC
//   4. System Truth (step4_system_truth.ts) РІР‚вЂќ Р СћРЎС“Р СР В°Р Р… Р вЂ™Р С•Р в„–Р Р…РЎвЂ№, РЎР‚Р В°Р В·Р Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р Р†Р С‘Р Т‘Р С‘Р СР С•РЎРѓРЎвЂљР С‘, RAG
//   5. Narrator  (step5_narrator.ts)        РІР‚вЂќ LLM-Р Р…Р В°РЎР‚РЎР‚Р В°РЎвЂљР С•РЎР‚ (Р С‘Р В»Р С‘ fallback)

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
      // OpenRouter sometimes returns null/empty content РІР‚вЂќ treat as transient error, retry
      if (!content || content.trim() === "") {
        lastError = new Error("AI Router: Р С—РЎС“РЎРѓРЎвЂљР С•Р в„– Р С•РЎвЂљР Р†Р ВµРЎвЂљ Р С•РЎвЂљ LLM");
        console.warn(`[callAI] attempt ${attempt + 1}/${retries} РІР‚вЂќ empty content, retrying...`);
        continue;
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(`AI Router: Р Р…Р Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С—Р С•Р В»РЎС“РЎвЂЎР С‘РЎвЂљРЎРЉ Р Р†Р В°Р В»Р С‘Р Т‘Р Р…РЎвЂ№Р в„– Р С•РЎвЂљР Р†Р ВµРЎвЂљ Р С—Р С•РЎРѓР В»Р Вµ ${retries} Р С—Р С•Р С—РЎвЂ№РЎвЂљР С•Р С”. Р СџР С•РЎРѓР В»Р ВµР Т‘Р Р…РЎРЏРЎРЏ Р С•РЎв‚¬Р С‘Р В±Р С”Р В°: ${lastError?.message || "unknown"}`);
}


// ============================================

// ============================================
// Main Handler РІР‚вЂќ 5-РЎв‚¬Р В°Р С–Р С•Р Р†РЎвЂ№Р в„– Р С”Р С•Р Р…Р Р†Р ВµР в„–Р ВµРЎР‚
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[${requestId}] РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’ PROCESS-TURN (5-step pipeline) START РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’`);

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
      return new Response(JSON.stringify({ error: "Р С›Р В±Р Р…Р В°РЎР‚РЎС“Р В¶Р ВµР Р…РЎвЂ№ РЎРѓРЎРѓРЎвЂ№Р В»Р С”Р С‘ Р Р…Р В° Р С‘Р В·Р С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘РЎРЏ. Р Р€Р Т‘Р В°Р В»Р С‘РЎвЂљР Вµ Р С‘РЎвЂ¦ Р С‘ Р С—Р С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ РЎРѓР Р…Р С•Р Р†Р В°." }), {
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
    // Р СџР С•Р Т‘Р Т‘Р ВµРЎР‚Р В¶Р С”Р В° РЎР‚Р ВµР В¶Р С‘Р СР В° Р С•Р В±РЎвЂ°Р ВµР С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В° РЎвЂ¦Р С•РЎРѓРЎвЂљР В° (ai_key_mode: 'host' | 'individual')
    // Р СџР С• РЎС“Р СР С•Р В»РЎвЂЎР В°Р Р…Р С‘РЎР‹ 'host': РЎвЂ¦Р С•Р Т‘РЎвЂ№ Р Р†РЎРѓР ВµРЎвЂ¦ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“РЎР‹РЎвЂљ Р С”Р В»РЎР‹РЎвЂЎ Р С‘ Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘/Р СР С‘РЎР‚Р В°,
    // Р ВµРЎРѓР В»Р С‘ Р Р…Р Вµ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р… РЎР‚Р ВµР В¶Р С‘Р С 'individual' (Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– РЎРѓР С• РЎРѓР Р†Р С•Р С‘Р С).
    const aiKeyMode = session.ai_key_mode || 'host';
    const hostUserId = session.worlds?.owner_id || null;

    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    let satelliteModel = AI_MODEL, gpsModel = AI_MODEL, dmModel = AI_MODEL;

    // 1. Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” РЎвЂљР ВµР С”РЎС“РЎвЂ°Р ВµР С–Р С• Р С‘Р С–РЎР‚Р С•Р С”Р В° (Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ)
    let playerSettings: any = null;
    if (player.user_id) {
      const { data: us } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", player.user_id).maybeSingle();
      playerSettings = us;
    }

    // 2. Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” РЎвЂ¦Р С•РЎРѓРЎвЂљР В° (РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ Р СР С‘РЎР‚Р В°/РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘)
    let hostSettings: any = null;
    if (hostUserId && hostUserId !== player.user_id) {
      const { data: hs } = await supabase.from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", hostUserId).maybeSingle();
      hostSettings = hs;
    } else if (hostUserId && hostUserId === player.user_id) {
      hostSettings = playerSettings;
    }

    // 3. Р вЂ™РЎвЂ№Р В±Р С•РЎР‚ Р С‘РЎРѓРЎвЂљР С•РЎвЂЎР Р…Р С‘Р С”Р В° Р С”Р В»РЎР‹РЎвЂЎР В° Р С‘ Р СР С•Р Т‘Р ВµР В»Р ВµР в„– Р Р† Р В·Р В°Р Р†Р С‘РЎРѓР С‘Р СР С•РЎРѓРЎвЂљР С‘ Р С•РЎвЂљ ai_key_mode
    if (aiKeyMode === 'host') {
      // Р СџРЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљ Р ТђР С•РЎРѓРЎвЂљР В°: РЎРѓР Р…Р В°РЎвЂЎР В°Р В»Р В° Р С”Р В»РЎР‹РЎвЂЎ Р С‘ Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
      const targetSettings = hostSettings?.openrouter_key ? hostSettings : playerSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    } else {
      // Р В Р ВµР В¶Р С‘Р С 'individual': Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р С‘Р С–РЎР‚Р С•Р С” Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµРЎвЂљ РЎРѓР Р†Р С•Р в„– Р С”Р В»РЎР‹РЎвЂЎ; Р ВµРЎРѓР В»Р С‘ РЎС“ Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ Р С”Р В»РЎР‹РЎвЂЎР В° РІР‚вЂќ РЎвЂћР С•Р В»Р В»Р В±РЎРЊР С” Р Р…Р В° Р С”Р В»РЎР‹РЎвЂЎ РЎвЂ¦Р С•РЎРѓРЎвЂљР В°
      const targetSettings = playerSettings?.openrouter_key ? playerSettings : hostSettings;
      if (targetSettings?.openrouter_key) openrouterApiKey = sanitizeKey(targetSettings.openrouter_key);
      if (targetSettings?.satellite_model) satelliteModel = targetSettings.satellite_model;
      if (targetSettings?.gps_model) gpsModel = targetSettings.gps_model;
      if (targetSettings?.dm_model) dmModel = targetSettings.dm_model;
    }

    if (!openrouterApiKey) {
      const errorMsg = aiKeyMode === 'host'
        ? "Р СњР Вµ Р В·Р В°Р Т‘Р В°Р Р… OpenRouter API Key РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘. Р ТђР С•РЎРѓРЎвЂљ Р Т‘Р С•Р В»Р В¶Р ВµР Р… РЎС“Р С”Р В°Р В·Р В°РЎвЂљРЎРЉ Р С”Р В»РЎР‹РЎвЂЎ Р Р† Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р В°РЎвЂ¦ Р В°Р С”Р С”Р В°РЎС“Р Р…РЎвЂљР В°."
        : "Р Р€Р С”Р В°Р В¶Р С‘РЎвЂљР Вµ Р Р†Р В°РЎв‚¬ OpenRouter API Key Р Р† Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р В°РЎвЂ¦ Р В°Р С”Р С”Р В°РЎС“Р Р…РЎвЂљР В°.";
      return new Response(JSON.stringify({ error: errorMsg, code: "MISSING_API_KEY" }), {
        status: 402, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load location, available locations, lore
    let currentLocationName: string | null = null, currentStateName: string | null = null, currentLocationType: string | null = null;
    // Wild zone РІР‚вЂќ Р С—РЎР‚Р С‘РЎР‚Р С•Р Т‘Р Р…Р В°РЎРЏ Р В·Р С•Р Р…Р В° Р Р†Р Р…Р Вµ Р С‘Р СР ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р в„– (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—Р С•Р В»Р Вµ)
    const currentWildZone: string | null = session.current_wild_zone || null;
    if (currentWildZone) {
      // Player is in open world / wild zone РІР‚вЂќ use currentWildZone as location name
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
    const recentMessages = (recentMsgs || []).reverse().map((m) => `[${m.sender_type === "master" ? "Р СљР В°РЎРѓРЎвЂљР ВµРЎР‚" : "Р ВР С–РЎР‚Р С•Р С”"}]: ${cleanTextForAI(m.content).slice(0, 200)}`);

    // Load all players in session (for router, engine and system truth context)
    const { data: allPlayersData } = await supabase.from("players").select("*, inventory(*), current_zone").eq("session_id", session_id).order("created_at", { ascending: true });
    const allPlayers = allPlayersData || [];

    // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р С‘Р В· Р С”РЎРЊРЎв‚¬Р В° РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘ (Р В·Р В°Р С—Р С•Р В»Р Р…РЎРЏР ВµРЎвЂљРЎРѓРЎРЏ Р С—РЎР‚Р С‘ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘Р С‘/РЎРѓР СР ВµР Р…Р Вµ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘)
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
      return role === "companion" || role === "РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”" || tags.some((t: string) => ["companion", "РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”", "Р Р†_Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р Вµ", "Р С—Р С‘РЎвЂљР С•Р СР ВµРЎвЂ ", "Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…"].includes(t));
    };

    // Р вЂўРЎРѓР В»Р С‘ Р С‘Р С–РЎР‚Р С•Р С” Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљРЎРѓРЎРЏ Р Р† Р Т‘Р С‘Р С”Р С•Р в„– Р В·Р С•Р Р…Р Вµ (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—РЎС“РЎРѓРЎвЂљР С•РЎв‚¬РЎРЉ), Р С–Р С•РЎР‚Р С•Р Т‘РЎРѓР С”Р С‘Р Вµ NPC (РЎвЂљР С•РЎР‚Р С–Р С•Р Р†РЎвЂ РЎвЂ№, Р В¶Р С‘РЎвЂљР ВµР В»Р С‘) Р С•РЎРѓРЎвЂљР В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р† Р С–Р С•РЎР‚Р С•Р Т‘Р Вµ!
    // Р вЂ™ РЎРѓРЎвЂ Р ВµР Р…Р Вµ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р С Р С—РЎР‚Р С‘РЎРѓРЎС“РЎвЂљРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂљ Р СћР С›Р вЂєР В¬Р С™Р С› РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С‘/Р С—Р С‘РЎвЂљР С•Р СРЎвЂ РЎвЂ№ Р С‘Р В»Р С‘ Р Т‘Р С‘Р С”Р С‘Р Вµ Р Р†РЎР‚Р В°Р С–Р С‘/РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†Р В°.
    if (currentWildZone) {
      const totalLoaded = allNpcs.length;
      allNpcs = allNpcs.filter((n: any) =>
        isCompanionNpc(n) ||
        n.is_hostile === true ||
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["Р Т‘Р С‘Р С”Р С‘Р в„–", "Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚", "Р Т‘Р С‘Р С”Р В°РЎРЏ_Р В·Р С•Р Р…Р В°", "Р В·Р Р†Р ВµРЎР‚РЎРЉ", "РЎвЂ¦Р С‘РЎвЂ°Р Р…Р С‘Р С”"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] In wild zone "${currentWildZone}": filtered out town NPCs (${totalLoaded} -> ${allNpcs.length} present)`);
    }

    console.log(`[${requestId}] [START] СЂСџР‹Р‡ Turn for player "${player.name}" (${player.id}) in session "${session_id}". Action: "${safeActionText}"`);
    console.log(`[${requestId}] [LOCATION] СЂСџвЂњРЊ LocationID=${session.current_location_id}, Name="${currentLocationName}", WildZone="${session.current_wild_zone || 'none'}", NPCs present=${allNpcs.length} (${allNpcs.map((n: any) => n.name).join(', ') || 'none'})`);

    // Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С, Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В»Р С‘ РЎРЊРЎвЂљР С• РЎвЂ¦Р С•Р Т‘ Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘ (Р Р…Р ВµРЎвЂљ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р в„– Р С‘Р С–РЎР‚Р С•Р С”Р В° Р С‘Р В»Р С‘ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р Вµ Р В·Р В°Р Т‘Р В°Р Р…Р В°)
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

    // Р вЂўРЎРѓР В»Р С‘ Р С”Р В°РЎР‚РЎвЂљР В° РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р С‘Р В»Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р ВµРЎвЂ°РЎвЂ Р Р…Р Вµ РЎРѓР С•Р В·Р Т‘Р В°Р Р…РЎвЂ№ РІР‚вЂќ Р С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
    if (Object.keys(locationMap).length === 0 && (session.current_location_id || currentWildZone || currentLocationName)) {
      try {
        const initLocMap = await ensureLocationMapAndTerrain({
          supabase,
          sessionId: session_id,
          locationId: session.current_location_id,
          locationName: currentLocationName || "Р вЂєР С•Р С”Р В°РЎвЂ Р С‘РЎРЏ",
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
    // Р В§Р В°РЎвЂљ: РЎР‚Р В°РЎРѓР С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р С•РЎвЂЎР С”Р С•Р Р† РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”
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
            STR: "РЎРѓР С‘Р В»РЎС“", DEX: "Р В»Р С•Р Р†Р С”Р С•РЎРѓРЎвЂљРЎРЉ", CON: "Р Р†РЎвЂ№Р Р…Р С•РЎРѓР В»Р С‘Р Р†Р С•РЎРѓРЎвЂљРЎРЉ",
            INT: "Р С‘Р Р…РЎвЂљР ВµР В»Р В»Р ВµР С”РЎвЂљ", WIS: "Р СРЎС“Р Т‘РЎР‚Р С•РЎРѓРЎвЂљРЎРЉ", CHA: "РЎвЂ¦Р В°РЎР‚Р С‘Р В·Р СРЎС“"
          };
          const statRu = statNamesRu[statAllocIntent.stat] || statAllocIntent.stat;
          statAllocatedFact = `${player.name} РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р Р†Р В»Р С•Р В¶Р С‘Р В» ${statAllocIntent.points} Р С•РЎвЂЎР С”. Р Р† РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”РЎС“ ${statRu} (Р Р…Р С•Р Р†Р С•Р Вµ Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ: ${rpcRes.new_value}, РЎРѓР Р†Р С•Р В±Р С•Р Т‘Р Р…Р С• Р С•РЎвЂЎР С”Р С•Р Р†: ${rpcRes.remaining_points}).`;

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
          statAllocatedFact = `${player.name} Р С—Р С•Р С—РЎвЂ№РЎвЂљР В°Р В»РЎРѓРЎРЏ РЎР‚Р В°РЎРѓР С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘РЎвЂљРЎРЉ Р С•РЎвЂЎР С”Р С‘ Р Р† ${statAllocIntent.stat}, Р Р…Р С• Р Р…Р Вµ РЎРѓР СР С•Р С–: ${rpcRes.error}`;
        }
      } catch (allocEx) {
        console.warn(`[${requestId}] [STAT_ALLOC] Exception:`, allocEx);
      }
    }

    // ============================================
    // Р РЃР С’Р вЂњ 1: AI Router (parsePlayerIntent)
    // ============================================
    console.log(`[${requestId}] [STEP 1] AI Router...`);
    // Р СџР С•Р Т‘Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С‘РЎРѓРЎвЂљР С•РЎР‚Р С‘РЎР‹ Р Т‘Р В»РЎРЏ Р С”Р С•Р Р…РЎвЂљР ВµР С”РЎРѓРЎвЂљР В° Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ РЎРѓ NPC/Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘
    let recentHistoryStr = "";
    const { data: routerRecentMsgs } = await supabase.from("messages").select("sender_name, content, sender_type").eq("session_id", session_id).order("created_at", { ascending: false }).limit(3); if (routerRecentMsgs && routerRecentMsgs.length > 0) {
      recentHistoryStr = routerRecentMsgs.reverse().map((m: any) => `${m.sender_name || (m.sender_type === 'master' ? 'Р вЂќР Сљ' : 'Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°')}: "${m.content}"`).join("\n");
    }

    const routerInput: RouterInputContext = {
      player_action_text: safeActionText,
      recent_history: recentHistoryStr,
      player: {
        id: player.id,
        name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
        race: player.race || "Р В§Р ВµР В»Р С•Р Р†Р ВµР С”",
        class: player.class || "Р вЂ™Р С•Р С‘Р Р…",
        level: player.level || 1,
        hp: player.hp ?? 100,
        max_hp: player.max_hp ?? 100,
        stats: player.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        location_name: currentLocationName,
        state_name: currentStateName,
      },
      inventory: (player.inventory || []).map((i: any) => ({
        id: i.id,
        item_name: i.item_name || i.name || "Р СџРЎР‚Р ВµР Т‘Р СР ВµРЎвЂљ",
        item_type: i.type || i.item_type || "misc",
        quantity: i.quantity || 1,
        condition: i.condition ?? null,
        durability: i.durability ?? null,
        description: i.description || "",
      })),
      nearby_npcs: allNpcs.map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "Р вЂњРЎС“Р СР В°Р Р…Р С•Р С‘Р Т‘",
        is_hostile: n.is_hostile || false,
        hp: n.hp ?? 10,
        max_hp: n.max_hp ?? 10,
        distance_meters: 5,
      })),
      nearby_players: (allPlayers || [])
        .filter((p: any) => p.id !== player.id)
        .map((p: any) => ({
          id: p.id,
          name: p.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
          race: p.race || "Р В§Р ВµР В»Р С•Р Р†Р ВµР С”",
          class: p.class || "Р ВР С–РЎР‚Р С•Р С”",
          level: p.level || 1,
          hp: p.hp ?? 100,
          max_hp: p.max_hp ?? 100,
          current_zone: p.current_zone || null,
        })),
      weather: {
        description: "Р Р‡РЎРѓР Р…Р С•",
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

    console.log(`[${requestId}] [STEP 1] СЂСџВ§В­ Router: status="${routerResult.status}", actions=${JSON.stringify(routerResult.actions.map((a: any) => ({ type: a.action_type, target: a.target_item_name || a.target_entity_id, stat: a.stat_to_check })))}`);

    // Apply GPS time/location (still here, as it's pre-engine)
    let time_passed_minutes = 0;
    let location_changed = startingLocationGenerated,
      new_location_id: string | null = startingLocationGenerated ? session.current_location_id : null,
      new_wild_zone: string | null = null,
      wild_zone_changed = false,
      travel_description = "";

    // Р вЂќР ВµРЎвЂљР ВµР С”РЎвЂљР С•РЎР‚ Р Р…Р В°Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р С‘Р В»Р С‘ Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘Р В° Р С‘Р В· Р С—Р С•Р СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ
    const isMovementAction = routerResult.actions?.some((a: any) => a.action_type === "move") ||
      /Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘|Р Р†РЎвЂ№Р в„–РЎвЂљР С‘|Р Р†РЎвЂ№РЎвЂ¦Р С•Р В¶РЎС“|Р С—Р С•Р С”Р С‘Р Р…РЎС“РЎвЂљРЎРЉ|Р С—Р С•Р С”Р С‘Р Т‘Р В°РЎР‹|РЎС“Р в„–РЎвЂљР С‘|РЎС“РЎвЂ¦Р С•Р В¶РЎС“|Р С•РЎвЂљР С—РЎР‚Р В°Р Р†Р С‘РЎвЂљРЎРЉРЎРѓРЎРЏ|Р С‘Р Т‘РЎС“ |Р ВµР Т‘РЎС“ |Р В±Р ВµР С–РЎС“ |Р Р…Р В° РЎС“Р В»Р С‘РЎвЂ |Р Р…Р В°РЎР‚РЎС“Р В¶РЎС“|Р В·Р В° Р С—РЎР‚Р ВµР Т‘Р ВµР В»РЎвЂ№|Р Р…Р В° РЎвЂљРЎР‚Р В°Р С”РЎвЂљ|Р Р† Р В»Р ВµРЎРѓ|Р Р† Р С–Р С•РЎР‚Р С•Р Т‘|Р С” Р С•Р В·Р ВµРЎР‚РЎС“|Р Р† Р С—РЎС“РЎвЂљРЎРЉ|Р В·Р В°Р в„–РЎвЂљР С‘ Р Р† |Р Р†Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉРЎРѓРЎРЏ/i.test(safeActionText);

    try {
      const gpsSystemPrompt = buildGpsPrompt({
        playerName: cleanTextForAI(player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–"),
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
      const gpsResp = await callAI(gpsSystemPrompt, "Р С›Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘ Р Р†РЎР‚Р ВµР СРЎРЏ.", openrouterApiKey, 2, gpsModel);
      const gpsParsed = parseAIJson(gpsResp);
      if (gpsParsed) {
        time_passed_minutes = Math.max(0, Math.min(1440, Number(gpsParsed.time_minutes) || 0));
        if (gpsParsed.location_changed === true) {
          if (gpsParsed.is_wild_zone === true && gpsParsed.new_location_name) {
            // Р СџР ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р Р† Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“ (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—Р С•Р В»Р Вµ, РЎвЂљРЎР‚Р В°Р С”РЎвЂљ)
            wild_zone_changed = true;
            new_wild_zone = gpsParsed.new_location_name;
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Wild zone: ${new_wild_zone}`);
          } else if (gpsParsed.new_location_id) {
            // Р СџР ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р Р† Р С‘Р СР ВµР Р…Р С•Р Р†Р В°Р Р…Р Р…РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
            location_changed = true;
            new_location_id = gpsParsed.new_location_id;
            wild_zone_changed = true;
            new_wild_zone = null; // Р С•РЎвЂЎР С‘РЎвЂ°Р В°Р ВµР С Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“
            travel_description = gpsParsed.travel_description || "";
            console.log(`[${requestId}] [GPS] Location change РІвЂ вЂ™ ${new_location_id}`);
          }
        }
      }
    } catch (e) { /* ignore GPS errors, game continues */ }

    // Р вЂќР ВµРЎвЂљР ВµРЎР‚Р СР С‘Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р В°РЎРЏ Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ: Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘ Р С‘Р В· Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ/РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎвЂ№ Р Р…Р В°РЎР‚РЎС“Р В¶РЎС“, Р ВµРЎРѓР В»Р С‘ GPS Р Р…Р Вµ Р С—Р ВµРЎР‚Р ВµР С”Р В»РЎР‹РЎвЂЎР С‘Р В» Р В·Р С•Р Р…РЎС“
    const isBuildingLocation = /РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…|РЎвЂљРЎР‚Р В°Р С”РЎвЂљР С‘РЎР‚|Р С—Р С•РЎРѓРЎвЂљР С•РЎРЏР В»|Р Т‘Р С•Р С|Р С—Р С•Р Т‘Р Р†Р В°Р В»|Р С–РЎР‚Р С•РЎвЂљ|Р С”Р В°РЎвЂљР В°Р С”Р С•Р СР В±|Р С—Р С•Р С–РЎР‚Р ВµР В±|tavern|building|dungeon/i.test(currentLocationType || "") ||
      /РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…|РЎвЂљРЎР‚Р В°Р С”РЎвЂљР С‘РЎР‚|Р С—Р С•РЎРѓРЎвЂљР С•РЎРЏР В»|Р Т‘Р С•Р С|Р В±Р В°РЎв‚¬Р Р…|Р С”Р В°РЎвЂљР В°Р С”Р С•Р СР В±|Р С—Р С•Р С–РЎР‚Р ВµР В±/i.test(currentLocationName || "");
    const isExitingBuilding = /Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘|Р Р†РЎвЂ№Р в„–РЎвЂљР С‘|Р Р†РЎвЂ№РЎвЂ¦Р С•Р В¶РЎС“|Р С—Р С•Р С”Р С‘Р Т‘Р В°|Р Р…Р В°РЎР‚РЎС“Р В¶РЎС“|Р Р…Р В° РЎС“Р В»Р С‘РЎвЂ |Р Р…Р В° Р Р†Р С•Р В·Р Т‘РЎС“РЎвЂ¦|Р Р†Р С• Р Т‘Р Р†Р С•РЎР‚|Р Р…Р В° Р Т‘Р Р†Р С•РЎР‚|Р Р…Р В° РЎвЂљРЎР‚Р В°Р С”РЎвЂљ|Р Р…Р В° Р Т‘Р С•РЎР‚Р С•Р С–|Р Р† Р С—РЎС“РЎвЂљРЎРЉ/i.test(safeActionText);
    const isEnteringBuilding = /Р В·Р В°Р в„–РЎвЂљР С‘ Р Р† РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎС“|Р В·Р В°РЎвЂ¦Р С•Р В¶РЎС“ Р Р† РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎС“|Р Р†Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉРЎРѓРЎРЏ Р Р† РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎС“|Р Р†РЎвЂ¦Р С•Р В¶РЎС“ Р Р† РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎС“|Р В·Р В°Р в„–РЎвЂљР С‘ Р Р†Р Р…РЎС“РЎвЂљРЎР‚РЎРЉ|Р Р†Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉРЎРѓРЎРЏ Р Р†Р Р…РЎС“РЎвЂљРЎР‚РЎРЉ/i.test(safeActionText);

    if (isBuildingLocation && isExitingBuilding && !location_changed && !wild_zone_changed) {
      wild_zone_changed = true;
      new_wild_zone = `Р СћРЎР‚Р В°Р С”РЎвЂљ РЎС“ ${currentLocationName || "РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎвЂ№"}`;
      travel_description = `Р вЂ™РЎвЂ№ РЎР‚Р В°РЎРѓР С—Р В°РЎвЂ¦Р С‘Р Р†Р В°Р ВµРЎвЂљР Вµ Р Т‘РЎС“Р В±Р С•Р Р†РЎС“РЎР‹ Р Т‘Р Р†Р ВµРЎР‚РЎРЉ Р С‘ Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљР Вµ Р С‘Р В· ${currentLocationName || "Р С—Р С•Р СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ"} Р Р…Р В°РЎР‚РЎС“Р В¶РЎС“ Р Р…Р В° РЎРѓР Р†Р ВµР В¶Р С‘Р в„– Р Р†Р С•Р В·Р Т‘РЎС“РЎвЂ¦ Р С—РЎР‚Р С‘Р Т‘Р С•РЎР‚Р С•Р В¶Р Р…Р С•Р С–Р С• РЎвЂљРЎР‚Р В°Р С”РЎвЂљР В°.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [EXIT_BUILDING] Player stepped outside: ${new_wild_zone}`);
    } else if (currentWildZone && isEnteringBuilding && !location_changed) {
      wild_zone_changed = true;
      new_wild_zone = null;
      travel_description = `Р вЂ™РЎвЂ№ Р Р†Р С•Р В·Р Р†РЎР‚Р В°РЎвЂ°Р В°Р ВµРЎвЂљР ВµРЎРѓРЎРЉ Р Р†Р Р…РЎС“РЎвЂљРЎР‚РЎРЉ РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎвЂ№ Р Р† РЎвЂљРЎвЂР С—Р В»Р С•Р Вµ Р С—Р С•Р СР ВµРЎвЂ°Р ВµР Р…Р С‘Р Вµ.`;
      time_passed_minutes = Math.max(time_passed_minutes, 5);
      console.log(`[${requestId}] [ENTER_BUILDING] Player stepped back inside tavern`);
    }


    // ============================================
    // Р Р€Р СџР В Р С’Р вЂ™Р вЂєР вЂўР СњР ВР вЂў Р С›Р СћР В Р Р‡Р вЂќР С›Р Сљ Р В Р РЋР С›Р СџР С›Р РЋР СћР С’Р вЂ™Р вЂєР вЂўР СњР ВР вЂў Р ВР вЂњР В Р С›Р С™Р С›Р вЂ™ (Party & Player Resolution)
    // ============================================
    let partyEventFact: string | null = null;
    const lowerAct = safeActionText.toLowerCase();

    // Р вЂќР ВµРЎвЂљР ВµРЎР‚Р СР С‘Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С•Р Вµ РЎРѓР С•Р С—Р С•РЎРѓРЎвЂљР В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ РЎвЂ Р ВµР В»Р С‘ РЎРѓ Р В¶Р С‘Р Р†РЎвЂ№Р СР С‘ Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘ Р С—Р С• Р С‘Р СР ВµР Р…Р С‘ Р Р† РЎвЂљР ВµР С”РЎРѓРЎвЂљР Вµ
    const targetedOtherPlayer = (allPlayers || []).filter((p: any) => p.id !== player.id).find((p: any) => {
      if (!p.name) return false;
      const pNameLower = p.name.trim().toLowerCase();
      const nameRegex = new RegExp(`(^|[\\s,."Р’В«*!?])${pNameLower}[Р В°-РЎРЏ]*([\\s,."Р’В»*!?]|$)`, 'i');
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

    const isPartyInviteOrJoin = /(?:Р С•Р В±РЎР‰Р ВµР Т‘Р С‘Р Р…Р С‘(?:РЎвЂљРЎРЉРЎРѓРЎРЏ|Р СРЎРѓРЎРЏ)|РЎРѓР С•Р В·Р Т‘Р В°(?:РЎвЂљРЎРЉ|Р Т‘Р С‘Р С) Р С•РЎвЂљРЎР‚РЎРЏР Т‘|Р С—Р С•Р в„–Р Т‘[Р ВµРЎвЂ]Р С Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р С‘Р Т‘[Р ВµРЎвЂ]Р С Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р Т‘Р В°Р Р†Р В°Р в„–(?:РЎвЂљР Вµ)?.*(?:Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р С—РЎС“РЎвЂљР ВµРЎв‚¬Р ВµРЎРѓРЎвЂљР Р†|Р С•РЎвЂљРЎР‚РЎРЏР Т‘)|Р В±РЎС“Р Т‘Р ВµР С Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р С—РЎС“РЎвЂљР ВµРЎв‚¬Р ВµРЎРѓРЎвЂљР Р†(?:Р С•Р Р†Р В°РЎвЂљРЎРЉ|РЎС“Р ВµР С).*Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ.*Р С—РЎС“РЎвЂљР ВµРЎв‚¬Р ВµРЎРѓРЎвЂљР Р†|Р Т‘Р ВµРЎР‚Р В¶Р С‘Р СРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ|Р Р† Р С•РЎвЂљРЎР‚РЎРЏР Т‘|Р Р†Р С•Р В·РЎРЉР СР С‘ Р Р† Р С•РЎвЂљРЎР‚РЎРЏР Т‘|Р В±Р ВµРЎР‚РЎС“ Р В·Р В° РЎР‚РЎС“Р С”РЎС“|Р С—РЎР‚Р ВµР Т‘Р В»Р В°Р С–Р В°РЎР‹.*(?:Р С•РЎвЂљРЎР‚РЎРЏР Т‘|Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ))/i.test(lowerAct);
    const isPartyLeave = /(?:Р С—Р С•Р С”Р С‘Р Т‘Р В°РЎР‹ Р С•РЎвЂљРЎР‚РЎРЏР Т‘|Р Р†РЎвЂ№РЎвЂ¦Р С•Р В¶РЎС“ Р С‘Р В· Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В°|Р С•РЎвЂљР Т‘Р ВµР В»РЎРЏРЎР‹РЎРѓРЎРЉ Р С•РЎвЂљ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В°|Р С‘Р Т‘РЎС“ Р С•Р Т‘Р С‘Р Р…|Р С—Р С•Р в„–Р Т‘РЎС“ Р С•Р Т‘Р С‘Р Р…|РЎР‚Р В°Р В·Р Т‘Р ВµР В»РЎРЏР ВµР СРЎРѓРЎРЏ)/i.test(lowerAct);

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

        partyEventFact = `${player.name} Р С•РЎвЂљР Т‘Р ВµР В»Р С‘Р В»РЎРѓРЎРЏ Р С•РЎвЂљ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В° Р С‘ РЎвЂљР ВµР С—Р ВµРЎР‚РЎРЉ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†РЎС“Р ВµРЎвЂљ РЎРѓР В°Р СР С•РЎРѓРЎвЂљР С•РЎРЏРЎвЂљР ВµР В»РЎРЉР Р…Р С•.`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°",
            content: `СЂСџС™В¶РІР‚РЊРІв„ўвЂљРїС‘РЏ ${partyEventFact}`,
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
            name: `Р С›РЎвЂљРЎР‚РЎРЏР Т‘ ${player.name} Р С‘ ${partner.name}`,
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

        partyEventFact = `Р РЋРЎвЂћР С•РЎР‚Р СР С‘РЎР‚Р С•Р Р†Р В°Р Р… Р С•РЎвЂљРЎР‚РЎРЏР Т‘: ${player.name} Р С‘ ${partner.name} РЎвЂљР ВµР С—Р ВµРЎР‚РЎРЉ Р С—РЎС“РЎвЂљР ВµРЎв‚¬Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂљ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ!`;
        try {
          await supabase.from("messages").insert({
            session_id,
            sender_type: "system",
            sender_name: "Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°",
            content: `РІС™вЂќРїС‘РЏ ${partyEventFact}`,
          });
        } catch {}
      }
    }

    // ============================================
    // Р РЃР С’Р вЂњ 2: Game Engine
    // ============================================
    console.log(`[${requestId}] [STEP 2] Game Engine...`);

    // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°Р Р†РЎвЂ№Р С”Р С•Р Р† Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Т‘Р В»РЎРЏ Р СР В°РЎвЂљР ВµР СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘РЎвЂ¦ Р В±Р С•Р Р…РЎС“РЎРѓР С•Р Р† Р Т‘Р Р†Р С‘Р В¶Р С”Р В° (РЎС“РЎР‚Р С•Р Р…, Р С—Р С•Р С—Р В°Р Т‘Р В°Р Р…Р С‘Р Вµ, РЎРѓР В±Р С•РЎР‚, Р Р†РЎР‚Р ВµР СРЎРЏ)
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

    // Р РЋР С•Р С”РЎР‚Р В°РЎвЂ°Р ВµР Р…Р С‘Р Вµ Р Р†РЎР‚Р ВµР СР ВµР Р…Р С‘ Р Р…Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ Р С•РЎвЂљ Р Р…Р В°Р Р†РЎвЂ№Р С”Р С•Р Р† (РЎРѓР С•Р В±Р С‘РЎР‚Р В°РЎвЂљР ВµР В»РЎРЉРЎРѓРЎвЂљР Р†Р С•, Р Р†РЎвЂ№Р В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ, Р С–Р С•РЎР‚Р Р…Р С•Р Вµ Р Т‘Р ВµР В»Р С• Р С‘ РЎвЂљ.Р Т‘.)
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
        id: player.id, name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
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
    console.log(`[${requestId}] [STEP 2] РІС™в„ўРїС‘РЏ Engine: mutations=${JSON.stringify(engineResult.mutations.map((m: any) => m.type))}, facts=${JSON.stringify(engineResult.raw_system_facts)}`);

    // ============================================
    // Р РЃР С’Р вЂњ 3: DB Persistence
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
        current_wild_zone: null, // Р Р†Р ВµРЎР‚Р Р…РЎС“Р В»Р С‘РЎРѓРЎРЉ Р Р† Р С‘Р СР ВµР Р…Р С•Р Р†Р В°Р Р…Р Р…РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
        current_wild_zone_description: null,
      }).eq("id", session_id);

      // Р ВР С–РЎР‚Р С•Р С”Р С‘ Р Т‘Р Р†Р С‘Р С–Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ: РЎРѓР В±РЎР‚Р В°РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С—Р С•Р Т‘Р В·Р С•Р Р…РЎС“ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎРѓРЎвЂљР С‘Р Р†РЎв‚¬Р ВµР С–Р С•РЎРѓРЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В°
      try {
        await supabase.from("players").update({ current_zone: null }).eq("id", player.id);
        player.current_zone = null;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to reset player current_zone:`, pzErr);
      }

      // Р В§Р В»Р ВµР Р…РЎвЂ№ Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В°, Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘Р Р†РЎв‚¬Р С‘Р ВµРЎРѓРЎРЏ Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р В·Р С•Р Р…Р Вµ/Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘, Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ!
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

      // Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В»РЎРЏ Р Р…Р С•Р Р†Р С•Р в„– Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
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

      // Р РЋР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С‘ Р С‘ РЎвЂЎР В»Р ВµР Р…РЎвЂ№ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В° Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р С Р Р† Р Р…Р С•Р Р†РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
      try {
        const { data: compNpcs } = await supabase
          .from("npcs")
          .select("id, status_tags, role")
          .eq("world_id", session.world_id);
        const companionIds = (compNpcs || [])
          .filter((n: any) =>
            n.role === "companion" ||
            (Array.isArray(n.status_tags) && (n.status_tags.includes("РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”") || n.status_tags.includes("Р Р†_Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р Вµ") || n.status_tags.includes("Р С—Р С‘РЎвЂљР С•Р СР ВµРЎвЂ ") || n.status_tags.includes("Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…")))
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

      // Р ВР С–РЎР‚Р С•Р С”Р С‘ Р Т‘Р Р†Р С‘Р С–Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ: РЎРѓР В±РЎР‚Р В°РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С—Р С•Р Т‘Р В·Р С•Р Р…РЎС“ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎРѓРЎвЂљР С‘Р Р†РЎв‚¬Р ВµР С–Р С•РЎРѓРЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В°
      try {
        await supabase.from("players").update({ current_zone: null }).eq("id", player.id);
        player.current_zone = null;
      } catch (pzErr) {
        console.warn(`[${requestId}] Failed to reset player current_zone:`, pzErr);
      }

      // Р В§Р В»Р ВµР Р…РЎвЂ№ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В° Р С—Р ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂљ Р Р† Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ
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

      // Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В»РЎРЏ Р Т‘Р С‘Р С”Р С•Р в„– Р В·Р С•Р Р…РЎвЂ№ РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
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
        (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["Р Т‘Р С‘Р С”Р С‘Р в„–", "Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚", "Р Т‘Р С‘Р С”Р В°РЎРЏ_Р В·Р С•Р Р…Р В°", "Р В·Р Р†Р ВµРЎР‚РЎРЉ", "РЎвЂ¦Р С‘РЎвЂ°Р Р…Р С‘Р С”"].includes(String(t).toLowerCase())))
      );
      console.log(`[${requestId}] [WILD_ZONE] Player entered wild zone: ${new_wild_zone}`);
    }

    // Р С›РЎвЂљРЎРѓР В»Р ВµР В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Р†Р Р…РЎС“РЎвЂљРЎР‚Р С‘ Р С—Р С•Р Т‘Р В·Р С•Р Р… Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ (Р Т‘Р В»РЎРЏ Р СћРЎС“Р СР В°Р Р…Р В° Р вЂ™Р С•Р в„–Р Р…РЎвЂ№ / Р В­РЎвЂ¦Р В° Р вЂ™Р С•Р в„–Р Р…РЎвЂ№)
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
        console.log(`[${requestId}] [ZONE] Player ${player.name} moved to subzone "${matchedZone}" (was: "${player.current_zone || 'Р С•РЎРѓР Р…Р С•Р Р†Р Р…Р В°РЎРЏ'}")`);
        player.current_zone = matchedZone;
        try {
          await supabase.from("players").update({ current_zone: matchedZone }).eq("id", player.id);
        } catch (zErr) {
          console.warn(`[${requestId}] Failed to update player current_zone:`, zErr);
        }

        // Р В§Р В»Р ВµР Р…РЎвЂ№ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В°, Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘Р Р†РЎв‚¬Р С‘Р ВµРЎРѓРЎРЏ Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р В·Р С•Р Р…Р Вµ, Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ!
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
    // Р С’Р вЂ™Р СћР С›Р СњР С›Р СљР СњР В«Р вЂў Р В­Р С™Р РЋР СџР вЂўР вЂќР ВР В¦Р ВР В NPC (0 РЎвЂљР С•Р С”Р ВµР Р…Р С•Р Р†, Lazy Calendar Simulation)
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
    // Р ВР СњР ВР В¦Р ВР С’Р СћР ВР вЂ™Р С’ Р РЋР СџР Р€Р СћР СњР ВР С™Р С›Р вЂ™ Р вЂ™ Р СћР вЂўР С™Р Р€Р В©Р вЂўР в„ў Р РЋР В¦Р вЂўР СњР вЂў (Р СљР С‘РЎР‚Р Р…РЎвЂ№Р Вµ Р С‘ РЎР‚Р С•Р В»Р ВµР Р†РЎвЂ№Р Вµ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ)
    // ============================================
    let companionAction: any = null;
    try {
      companionAction = await handleCompanionInSceneAction({
        supabase,
        player_action_text: safeActionText,
        acting_player_name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
        location_npcs: allNpcs,
        session_id,
        openrouter_api_key: openrouterApiKey,
        model: satelliteModel || "meta-llama/llama-3.3-70b-instruct:free",
      });
      console.log(`[${requestId}] [COMPANION] СЂСџВ¤Сњ Checked:`, companionAction ? `${companionAction.npc_name} did: ${companionAction.action_description}` : "none (no party companions in scene)");
    } catch (compErr) {
      console.warn(`[${requestId}] Companion action failed:`, compErr);
    }

    // ============================================
    // Р вЂќР ВР СњР С’Р СљР ВР В§Р вЂўР РЋР С™Р ВР вЂў Р СњР С’Р вЂ™Р В«Р С™Р В Р ВР вЂњР В Р С›Р С™Р С’ (1..100)
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
    // Р СџР В Р С›Р С™Р С’Р В§Р С™Р С’ Р Р€Р В Р С›Р вЂ™Р СњР Р‡ Р СџР вЂўР В Р РЋР С›Р СњР С’Р вЂ“Р С’ (1..100, +2 Р С›Р Тђ, HP/MP)
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
    // Р РЃР С’Р вЂњ 4: System Truth Compiler
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
      location: { name: currentLocationName || currentWildZone || "Р С›РЎвЂљР С”РЎР‚РЎвЂ№РЎвЂљРЎвЂ№Р в„– Р СР С‘РЎР‚", weather: routerInput.weather?.description || null },
      players: (allPlayers || []).map((p: any) => ({
        id: p.id, name: p.name || "Р вЂњР ВµРЎР‚Р С•Р в„–", hp: p.hp ?? 100, max_hp: p.max_hp ?? 100, inventory: p.inventory || [],
      })),
      npcs: (session.current_wild_zone ? allNpcs.filter((n: any) => isCompanionNpc(n) || n.is_hostile === true || (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["Р Т‘Р С‘Р С”Р С‘Р в„–", "Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚", "Р Т‘Р С‘Р С”Р В°РЎРЏ_Р В·Р С•Р Р…Р В°", "Р В·Р Р†Р ВµРЎР‚РЎРЉ", "РЎвЂ¦Р С‘РЎвЂ°Р Р…Р С‘Р С”"].includes(String(t).toLowerCase())))) : allNpcs).map((n: any) => ({
        id: n.id,
        name: n.name || "NPC",
        race: n.race || "Р РЋРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†Р С•",
        role: n.role || "Р С›Р В±РЎвЂ№Р Р†Р В°РЎвЂљР ВµР В»РЎРЉ",
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
    // Р РЃР С’Р вЂњ 5: Narrator
    // ============================================
    console.log(`[${requestId}] [STEP 5] Narrator...`);
    let narratorOutput: { players: Record<string, string>; global_narrative: string };
    try {
      narratorOutput = await generateNarrative({
        system_truth: systemTruth,
        action_text: safeActionText,
        player_name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
        player_race: player.race || "Р В§Р ВµР В»Р С•Р Р†Р ВµР С”",
        player_class: player.class || "Р вЂ™Р С•Р С‘Р Р…",
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
      session_id, sender_type: "player", sender_id: player.user_id, sender_name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–", content: safeActionText,
    });
    // 2) Master narratives РІР‚вЂќ Р С—Р С• Р С•Р Т‘Р Р…Р С•Р СРЎС“ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎР‹ Р Р…Р В° Р С‘Р С–РЎР‚Р С•Р С”Р В°
    for (const [targetPlayerId, narrative] of Object.entries(narratorOutput.players)) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Р СљР В°РЎРѓРЎвЂљР ВµРЎР‚", content: narrative,
        metadata: {
          target_player_id: targetPlayerId,
          turn_status: systemTruth.turn_status,
          hp_status: systemTruth.player_truths[targetPlayerId]?.hp_status,
          inventory_delta: systemTruth.player_truths[targetPlayerId]?.inventory_delta,
          game_time: systemTruth.environment.time,
        },
      });
    }
    // 3) Global log (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—РЎР‚Р С‘ Р Р…Р В°Р В»Р С‘РЎвЂЎР С‘Р С‘ > 1 Р С‘Р С–РЎР‚Р С•Р С”Р В°, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р Р† РЎРѓР С•Р В»Р С• Р Р…Р Вµ Р Т‘РЎС“Р В±Р В»Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р…Р В°РЎР‚РЎР‚Р В°РЎвЂљР С‘Р Р†)
    if (narratorOutput.global_narrative && allPlayers.length > 1) {
      await supabase.from("messages").insert({
        session_id, sender_type: "master", sender_name: "Р вЂєР С•Р С–",
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

    // 3.5) Р СћР Р€Р СљР С’Р Сњ Р вЂ™Р С›Р в„ўР СњР В« РІР‚вЂќ fog-РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р Т‘Р В»РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р Р† Р Т‘РЎР‚РЎС“Р С–Р С‘РЎвЂ¦ Р В·Р С•Р Р…Р В°РЎвЂ¦
    // Р В Р В°Р В±Р С•РЎвЂљР В°Р ВµРЎвЂљ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—РЎР‚Р С‘ Р Р…Р В°Р В»Р С‘РЎвЂЎР С‘Р С‘ Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С‘РЎвЂ¦ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
    if (allPlayers.length > 1) {
      try {
        // AI Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»РЎРЏР ВµРЎвЂљ event_type Р Р† Router РІР‚вЂќ Р Р…Р С‘Р С”Р В°Р С”Р С‘РЎвЂ¦ regex-РЎРЊР Р†РЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”!
        const eventType = routerResult.event_type || null;
        if (eventType) {
          const thresholds = fogGetEffectiveThresholds(eventType, currentTerrain);
          const actorZone: string | null = player.current_zone || null;
          const speechContent = fogExtractSpeech(safeActionText);

          // Р СњР В°Р В±Р В»РЎР‹Р Т‘Р В°РЎвЂљР ВµР В»Р С‘ = Р Р†РЎРѓР Вµ Р С‘Р С–РЎР‚Р С•Р С”Р С‘, Р С”РЎР‚Р С•Р СР Вµ Р В°Р Р†РЎвЂљР С•РЎР‚Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ
          const observers = allPlayers.filter((p: any) => p.id !== player.id);

          let fogCount = 0;
          for (const obs of observers) {
            const obsZone: string | null = obs.current_zone || null;
            const tier = fogGetDistanceTier(actorZone, obsZone, locationMap);

            // same_room (tier 0) РІР‚вЂќ РЎРЊРЎвЂљР С•РЎвЂљ Р С‘Р С–РЎР‚Р С•Р С” РЎС“Р В¶Р Вµ Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљРЎРѓРЎРЏ Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р В·Р С•Р Р…Р Вµ/Р С”Р С•Р СР Р…Р В°РЎвЂљР Вµ
            if (tier === DISTANCE_TIER.SAME_ROOM) continue;

            const hears  = tier <= thresholds.audioTier;
            const sees   = tier <= thresholds.visualTier;
            if (!hears && !sees) continue; // РЎРѓР В»Р С‘РЎв‚¬Р С”Р С•Р С Р Т‘Р В°Р В»Р ВµР С”Р С• РІР‚вЂќ Р Р…Р С‘РЎвЂЎР ВµР С–Р С• Р Р…Р Вµ Р Т‘Р С•РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљ

            const fogText = fogPickNarrative(eventType, tier, speechContent);
            if (!fogText) continue;

            await supabase.from("messages").insert({
              session_id,
              sender_type: "master",
              sender_name: "Р СљР В°РЎРѓРЎвЂљР ВµРЎР‚",
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
            console.log(`[${requestId}] [FOG] СЂСџРЉВ«РїС‘РЏ ${player.name} (${eventType}, terrain=${currentTerrain || 'default'}) РІвЂ вЂ™ ${obs.name} tier=${tier}: "${fogText.slice(0, 60)}..."`);
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
        sender_name: "Р СљР С‘РЎР‚",
        content: `СЂСџвЂњСљ **Р РЋР С•Р В±РЎвЂ№РЎвЂљР С‘Р Вµ Р СР С‘РЎР‚Р В°**: ${ev.summary}`,
        metadata: { type: "npc_expedition", npc_id: ev.npc_id, loot: ev.loot, leveled_up: ev.leveled_up },
      });
    }

    // 6) Skill level up notification
    if (skillProgress?.leveled_up) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°",
        content: `СЂСџвЂќвЂќ **[Р СњР В°Р Р†РЎвЂ№Р С” Р С—Р С•Р Р†РЎвЂ№РЎв‚¬Р ВµР Р…!]** ${skillProgress.name} Р Т‘Р С•РЎРѓРЎвЂљР С‘Р С– РЎС“РЎР‚. ${skillProgress.level}! (+${skillProgress.level}% Р С” РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘)`,
        metadata: { type: "skill_level_up", skill_key: skillProgress.skill_key, level: skillProgress.level },
      });
    }

    // 7) Player level up notification
    if (playerLevelUp) {
      await supabase.from("messages").insert({
        session_id,
        sender_type: "system",
        sender_name: "Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°",
        content: `СЂСџР‹вЂ° **[Р СњР С•Р Р†РЎвЂ№Р в„– РЎС“РЎР‚Р С•Р Р†Р ВµР Р…РЎРЉ!]** Р СџР С•Р В·Р Т‘РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С, Р Р†РЎвЂ№ Р Т‘Р С•РЎРѓРЎвЂљР С‘Р С–Р В»Р С‘ ${playerLevelUp.new_level} РЎС“РЎР‚Р С•Р Р†Р Р…РЎРЏ!\nР СџР С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С• +2 РЎРѓР Р†Р С•Р В±Р С•Р Т‘Р Р…РЎвЂ№РЎвЂ¦ Р С•РЎвЂЎР С”Р В° РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С” (Р С›Р Тђ). Р СљР В°Р С”РЎРѓ. HP: ${playerLevelUp.max_hp}, Р СљР В°Р С”РЎРѓ. MP: ${playerLevelUp.max_mp}.`,
        metadata: { type: "player_level_up", ...playerLevelUp },
      });
    }

    // 7.1) Storyline Progress Evaluation (Р В°Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С•Р Вµ Р С•РЎвЂљРЎРѓР В»Р ВµР В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ РЎвЂ Р ВµР В»Р ВµР в„– Р В°РЎР‚Р С”Р С‘)
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
              sender_name: "Р РЋРЎР‹Р В¶Р ВµРЎвЂљ",
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
        acting_player_name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
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

    // 10) Pet Taming interaction (Р С‘Р Р…РЎвЂљР ВµР В»Р В»Р ВµР С”РЎвЂљРЎС“Р В°Р В»РЎРЉР Р…Р С•Р Вµ Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р В·Р Р†Р ВµРЎР‚РЎРЏ/Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚Р В°)
    try {
      const targetCreature = allNpcs.find((n: any) =>
        n.category === "beast" || n.category === "monster" ||
        (n.race && ["Р В·Р Р†Р ВµРЎР‚РЎРЉ", "Р Р†Р С•Р В»Р С”", "Р В¶Р С‘Р Р†Р С•РЎвЂљР Р…Р С•Р Вµ", "Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚"].some(r => n.race.toLowerCase().includes(r)))
      );
      if (targetCreature) {
        const tamingResult = await evaluatePetTamingAttempt({
          supabase,
          acting_player: {
            id: player.id,
            name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
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
            sender_name: "Р СџРЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ",
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

    // 11) Proactive Companion Offer (NPC РЎРѓР В°Р С Р С—РЎР‚Р ВµР Т‘Р В»Р В°Р С–Р В°Р ВµРЎвЂљ Р С—Р С•Р в„–РЎвЂљР С‘ Р Р† Р С—РЎС“РЎвЂљРЎРЉ Р С—РЎР‚Р С‘ Р Р†РЎвЂ№РЎРѓР С•Р С”Р С•Р С Р Т‘Р С•Р Р†Р ВµРЎР‚Р С‘Р С‘)
    try {
      if (!companionInviteHandled) {
        const proactiveOffer = await checkNpcProactiveCompanionOffer({
          supabase,
          acting_player_name: player.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
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
    // D&D Р вЂР С›Р вЂўР вЂ™Р С’Р Р‡ Р С›Р В§Р вЂўР В Р вЂўР вЂќР В¬ Р ТђР С›Р вЂќР С›Р вЂ™ (TURN QUEUE Р РЋ Р ВР СњР ВР В¦Р ВР С’Р СћР ВР вЂ™Р С›Р в„ў NPC, Р РЋР СџР Р€Р СћР СњР ВР С™Р С›Р вЂ™ Р В Р СџР ВР СћР С›Р СљР В¦Р вЂўР вЂ™)
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
        // Р СџР С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР В°Р ВµР С Р С” Р В±Р С•РЎР‹ Р Р†РЎР‚Р В°Р В¶Р Т‘Р ВµР В±Р Р…РЎвЂ№РЎвЂ¦ NPC РЎРѓ Р В±РЎР‚Р С•РЎРѓР С”Р С•Р С Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†РЎвЂ№
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

        // Р СџР С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР В°Р ВµР С Р С” Р В±Р С•РЎР‹ РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С•Р Р† Р С‘ Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р С—Р С‘РЎвЂљР С•Р СРЎвЂ Р ВµР Р† Р С‘Р С–РЎР‚Р С•Р С”Р В°
        const activeCompanions = allNpcs.filter((n: any) =>
          !n.is_hostile &&
          n.is_alive !== false &&
          (n.hp ?? 10) > 0 &&
          (n.role === "companion" || (Array.isArray(n.status_tags) && (n.status_tags.includes("РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”") || n.status_tags.includes("Р Р†_Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р Вµ") || n.status_tags.includes("Р С—Р С‘РЎвЂљР С•Р СР ВµРЎвЂ ") || n.status_tags.includes("Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…"))))
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
        // Р С›РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ Р ВµРЎвЂ°РЎвЂ Р Р…Р ВµРЎвЂљ РІР‚вЂќ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂР С Р Т‘Р В»РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
        if (allPlayers && allPlayers.length > 1) {
          isRoundCompleted = false;
          // Р РЋР С•РЎР‚РЎвЂљР С‘РЎР‚РЎС“Р ВµР С Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р†: Р Р† Р В±Р С•РЎР‹ Р С—Р С• Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†Р Вµ, Р Р† Р СР С‘РЎР‚Р Р…Р С•Р С РЎР‚Р ВµР В¶Р С‘Р СР Вµ РІР‚вЂќ РЎРѓРЎвЂљРЎР‚Р С•Р С–Р С• Р С—Р С• Р С—Р С•РЎР‚РЎРЏР Т‘Р С”РЎС“ Р Р†РЎвЂ¦Р С•Р Т‘Р В° Р Р† Р СР С‘РЎР‚ (created_at ASC)
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
        // Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р†, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№РЎвЂ¦ Р ВµРЎвЂ°РЎвЂ Р Р…Р ВµРЎвЂљ Р Р† Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ (Р Р† Р С—Р С•РЎР‚РЎРЏР Т‘Р С”Р Вµ Р С‘РЎвЂ¦ Р Р†РЎвЂ¦Р С•Р Т‘Р В° created_at ASC)
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

        // Р вЂ”Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р В°Р ВµР С РЎвЂљР ВµР С”РЎС“РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ Р С‘Р С–РЎР‚Р С•Р С”Р В°
        await supabase.from("turn_queue").update({
          status: "completed",
          resolved_at: new Date().toISOString(),
          parsed_action: routerResult,
          roll_result: engineResult,
        }).eq("session_id", session_id).eq("player_id", player.id);

        // Р ВРЎвЂ°Р ВµР С РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ РЎРѓР С• РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓР С•Р С 'waiting'
        // Р СџРЎР‚Р С‘ isCombat = false РЎвЂ¦Р С•Р Т‘РЎвЂ№ Р С—Р ВµРЎР‚Р ВµР Т‘Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ РЎРѓРЎвЂљРЎР‚Р С•Р С–Р С• Р С—Р С• Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ Р Р†РЎвЂ¦Р С•Р Т‘Р В° Р Р† Р СР С‘РЎР‚ (created_at ASC) Р С•РЎвЂљ Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Т‘РЎР‚РЎС“Р С–Р С•Р СРЎС“.
        // Р СџРЎР‚Р С‘ isCombat = true РЎвЂ¦Р С•Р Т‘РЎвЂ№ РЎС“Р С—Р С•РЎР‚РЎРЏР Т‘Р С•РЎвЂЎР ВµР Р…РЎвЂ№ Р С—Р С• Р В±Р С•Р ВµР Р†Р С•Р в„– Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†Р Вµ (initiative DESC, created_at ASC).
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

        // Р вЂўРЎРѓР В»Р С‘ РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ Р С—РЎР‚Р С‘Р Р…Р В°Р Т‘Р В»Р ВµР В¶Р С‘РЎвЂљ NPC РІР‚вЂќ Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…РЎРЏР ВµР С Р В±Р С•Р ВµР Р†РЎвЂ№Р Вµ РЎвЂ¦Р С•Р Т‘РЎвЂ№ NPC
        while (nextTurn && nextTurn.entity_type === "npc" && nextTurn.npc_id) {
          const currentTurnNpcId = nextTurn.npc_id;
          const turnNpc = allNpcs.find((n: any) => n.id === currentTurnNpcId);
          if (turnNpc && turnNpc.is_alive !== false && (turnNpc.hp ?? 10) > 0) {
            const isCompanion = !turnNpc.is_hostile &&
              (turnNpc.role === "companion" || (Array.isArray(turnNpc.status_tags) && (turnNpc.status_tags.includes("РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”") || turnNpc.status_tags.includes("Р Р†_Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р Вµ") || turnNpc.status_tags.includes("Р С—Р С‘РЎвЂљР С•Р СР ВµРЎвЂ ") || turnNpc.status_tags.includes("Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…"))));

            if (isCompanion) {
              // Р ТђР С›Р вЂќ Р РЋР СџР Р€Р СћР СњР ВР С™Р С’ / Р СџР ВР СћР С›Р СљР В¦Р С’: Р В°РЎвЂљР В°Р С”РЎС“Р ВµРЎвЂљ Р Р†РЎР‚Р В°Р В¶Р Т‘Р ВµР В±Р Р…Р С•Р С–Р С• Р СР С•Р В±Р В° (Р Р…Р В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚, Р Р†Р С•Р В»Р С”Р В°) Р Р† Р С—Р С•Р СР С•РЎвЂ°РЎРЉ Р С‘Р С–РЎР‚Р С•Р С”РЎС“!
              const hostileMobs = allNpcs.filter((n: any) => n.is_hostile && n.is_alive !== false && (n.hp ?? 10) > 0);
              if (hostileMobs.length > 0) {
                const targetMob = hostileMobs[0];
                const attackResult = executeCompanionAttack({
                  companion: turnNpc,
                  targetMob: {
                    id: targetMob.id,
                    name: targetMob.name || "Р вЂ™РЎР‚Р В°Р С–",
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

                  // Р вЂР С•Р Р…РЎС“РЎРѓ Р С” Р С•РЎвЂљР Р…Р С•РЎв‚¬Р ВµР Р…Р С‘РЎРЏР С РЎРѓР С• РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С•Р С Р В·Р В° Р С—Р С•Р СР С•РЎвЂ°РЎРЉ Р Р† Р В±Р С•РЎР‹ (+1)
                  try {
                    const { data: rel } = await supabase.from("npc_relationships").select("score").eq("npc_id", turnNpc.id).eq("player_id", player.id).maybeSingle();
                    if (rel) {
                      await supabase.from("npc_relationships").update({ score: rel.score + 1 }).eq("npc_id", turnNpc.id).eq("player_id", player.id);
                    }
                  } catch (e) { /* ignore */ }

                  // Р СџРЎР‚Р С•Р С”Р В°РЎвЂЎР С”Р В° РЎС“РЎР‚Р С•Р Р†Р Р…РЎРЏ Р С—Р С‘РЎвЂљР С•Р СРЎвЂ Р В° Р В·Р В° РЎС“РЎвЂЎР В°РЎРѓРЎвЂљР С‘Р Вµ Р Р† Р В±Р С•РЎР‹ (1..100)
                  const isPet = Array.isArray(turnNpc.status_tags) && turnNpc.status_tags.includes("Р С—Р С‘РЎвЂљР С•Р СР ВµРЎвЂ ");
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
                          sender_name: "Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В°",
                          content: `СЂСџР‹вЂ° **[Р СџР С‘РЎвЂљР С•Р СР ВµРЎвЂ  Р С—Р С•Р Р†РЎвЂ№РЎРѓР С‘Р В» РЎС“РЎР‚Р С•Р Р†Р ВµР Р…РЎРЉ!]** ${turnNpc.name} Р Т‘Р С•РЎРѓРЎвЂљР С‘Р С– ${turnNpc.level} РЎС“РЎР‚Р С•Р Р†Р Р…РЎРЏ! Р СљР В°Р С”РЎРѓ. Р В·Р Т‘Р С•РЎР‚Р С•Р Р†РЎРЉР Вµ: ${turnNpc.max_hp} HP.`,
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
              // Р ТђР С›Р вЂќ Р вЂ™Р В Р С’Р вЂ“Р вЂќР вЂўР вЂР СњР С›Р вЂњР С› NPC (Р В°РЎвЂљР В°Р С”Р В° Р С‘Р С–РЎР‚Р С•Р С”Р В°)
              const battlefieldPlayers = (allPlayers || []).map((p: any) => ({
                id: p.id,
                name: p.name || "Р вЂњР ВµРЎР‚Р С•Р в„–",
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
                sender_name: "Р вЂР С•Р в„–",
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

          // Р СџР С•Р СР ВµРЎвЂЎР В°Р ВµР С РЎвЂ¦Р С•Р Т‘ NPC Р С”Р В°Р С” Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…Р Р…РЎвЂ№Р в„–
          await supabase.from("turn_queue").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
          }).eq("id", nextTurn.id);

          // Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘
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
          // Р В Р В°РЎС“Р Р…Р Т‘ Р В·Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р ВµР Р…! Р СџР ВµРЎР‚Р ВµР В·Р В°Р С—РЎС“РЎРѓР С”Р В°Р ВµР С Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘РЎРЉ
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
    // Р В¤Р С›Р СњР С›Р вЂ™Р В«Р в„ў Р СџР В Р С›Р В¦Р вЂўР РЋР РЋ Р РЋР ВР СљР Р€Р вЂєР Р‡Р В¦Р ВР В Р вЂ“Р ВР вЂ”Р СњР В Р СљР ВР В Р С’ Р СџР С›Р РЋР вЂєР вЂў Р С™Р В Р Р€Р вЂњР С’ Р ТђР С›Р вЂќР С›Р вЂ™
    // (Р В Р С•Р Р†Р Р…Р С• 1 Р В·Р В°Р С—РЎР‚Р С•РЎРѓ Р С” Р ВР В Р Р…Р В° Р Р†РЎРѓР ВµРЎвЂ¦ РЎС“Р Т‘Р В°Р В»Р ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ NPC, Р С”Р С•Р Р…РЎвЂљР В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р†РЎв‚¬Р С‘РЎвЂ¦ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘)
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
        console.log(`[${requestId}] [WORLD_SIM] СЂСџРЉРЊ Round ${nextRound} simulated: ${worldSimResult?.simulated_count || 0} distant NPC(s) acted.`);
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
    console.error(`[${requestId}] РІСњРЉ ERROR:`, err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});


