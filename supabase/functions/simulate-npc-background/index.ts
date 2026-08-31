// supabase/functions/simulate-npc-background/index.ts
// Фоновая автономность NPC: действия главных персонажей за кадром
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Прошло дней: [days_passed]. Опиши 1 предложением, что NPC сделал за кадром (на основе его background и habits). Если он нашел или создал предмет, укажи его. JSON: { action_summary: 'текст', obtained_item_name: 'Название или null', item_type: 'weapon|misc' }`;

async function callChatLLM(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SUPABASE_URL,
      "X-Title": "MultiRP-AI",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Chat API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const raw = await req.text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Некорректный JSON в теле запроса" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const session_id = sanitizeKey(parsed.session_id);
    const days_passed = Number(parsed.days_passed) || 1;
    const user_id = sanitizeKey(parsed.user_id);

    console.log("simulate-npc-background input:", { session_id, days_passed, user_id });

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id обязателен" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Получаем мир сессии
    const { data: session } = await supabase
      .from("sessions")
      .select("world_id")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Сессия не найдена" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Получаем главных NPC мира
    const { data: mainNpcs } = await supabase
      .from("npcs")
      .select("*")
      .eq("world_id", session.world_id)
      .eq("role", "main");

    if (!mainNpcs || mainNpcs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Нет главных NPC для симуляции", actions: [] }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Получаем API ключ
    let apiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    if (user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key")
        .eq("id", user_id)
        .maybeSingle();
      if (userSettings?.openrouter_key) {
        apiKey = sanitizeKey(userSettings.openrouter_key);
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
          code: "MISSING_API_KEY",
        }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const actions: any[] = [];

    // Симулируем каждого главного NPC
    for (const npc of mainNpcs) {
      const userMessage = `NPC: ${npc.name}
Раса: ${npc.race}
Предыстория: ${npc.background || "Неизвестно"}
Привычки: ${(npc.habits || []).join(", ") || "Неизвестно"}
Прошло дней: ${days_passed}`;

      try {
        const aiResponse = await callChatLLM(SYSTEM_PROMPT.replace("[days_passed]", String(days_passed)), userMessage, apiKey);
        const actionData = parseAIJson(aiResponse);

        if (actionData) {
          const action = {
            npc_id: npc.id,
            npc_name: npc.name,
            action_summary: actionData.action_summary || "",
            obtained_item_name: actionData.obtained_item_name || null,
            item_type: actionData.item_type || "misc",
          };

          // Если NPC получил предмет - добавляем в инвентарь
          if (actionData.obtained_item_name) {
            const { error: itemError } = await supabase.rpc("add_item_to_inventory", {
              p_npc_id: npc.id,
              p_item_name: cleanTextForAI(actionData.obtained_item_name),
              p_quantity: 1,
              p_type: ["weapon", "armor", "consumable", "misc"].includes(actionData.item_type) ? actionData.item_type : "misc",
              p_attributes: {},
            });

            if (itemError) {
              console.error(`Failed to add item to NPC ${npc.id} inventory:`, itemError);
            }
          }

          actions.push(action);
        }
      } catch (err) {
        console.error(`Failed to simulate NPC ${npc.id}:`, err);
      }
    }

    console.log(`Simulated ${actions.length} NPC actions`);

    return new Response(
      JSON.stringify({
        success: true,
        days_passed,
        actions_count: actions.length,
        actions,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("simulate-npc-background error:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Internal error",
        details: err.message,
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
