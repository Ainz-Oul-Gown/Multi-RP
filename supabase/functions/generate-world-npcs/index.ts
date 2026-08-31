// supabase/functions/generate-world-npcs/index.ts
// Полная генерация NPC при создании мира на основе Матрицы Тиров
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

const SYSTEM_PROMPT = `Извлеки из текста всех упомянутых существ, NPC, врагов и животных.
Шаг 1: Оцени уровень угрозы (Tier) для каждого на основе контекста.
- Tier 1: Статы 4-10, HP 1-15.
- Tier 2: Статы 10-14, HP 15-40.
- Tier 3: Статы 14-18, HP 40-100.
- Tier 4: Статы 18-22, HP 100-250.
- Tier 5: Статы 22-26, HP 250-500.
Шаг 2: Сгенерируй им статы в рамках этого Тира.
Верни ТОЛЬКО JSON массив: [{name: 'Имя', role: 'main' или 'secondary', race: 'Раса', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]`;

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
      max_tokens: 2000,
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

    const world_id = sanitizeKey(parsed.world_id);
    const lore_text = cleanTextForAI(parsed.lore_text);
    const user_id = sanitizeKey(parsed.user_id);

    console.log("generate-world-npcs input:", { world_id, user_id, lore_text_length: lore_text.length });

    if (!world_id || !lore_text) {
      return new Response(
        JSON.stringify({ error: "world_id и lore_text обязательны" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

    // Вызываем LLM для генерации NPC
    let npcs: any[];
    try {
      const aiResponse = await callChatLLM(SYSTEM_PROMPT, lore_text, apiKey);
      console.log("generate-world-npcs AI raw:", aiResponse);
      npcs = parseAIJson(aiResponse);
    } catch (err) {
      console.error("AI call failed:", err);
      return new Response(
        JSON.stringify({ error: "Ошибка генерации NPC", details: err.message }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(npcs) || npcs.length === 0) {
      return new Response(
        JSON.stringify({ error: "Не удалось извлечь NPC из текста" }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Подготавливаем данные для INSERT
    const npcsToInsert = npcs.map((npc) => ({
      world_id,
      role: npc.role === "main" ? "main" : "secondary",
      name: cleanTextForAI(npc.name),
      race: cleanTextForAI(npc.race) || "Человек",
      appearance: cleanTextForAI(npc.appearance) || "",
      background: cleanTextForAI(npc.background) || "",
      status_tags: Array.isArray(npc.status_tags) ? npc.status_tags : [],
      habits: Array.isArray(npc.habits) ? npc.habits : [],
      catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases : [],
      stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: Number(npc.hp) || 30,
      max_hp: Number(npc.max_hp) || 30,
    }));

    // Массовый INSERT
    const { data: insertedNpcs, error: insertError } = await supabase
      .from("npcs")
      .insert(npcsToInsert)
      .select();

    if (insertError) {
      console.error("Failed to insert NPCs:", insertError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения NPC", details: insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`Generated ${insertedNpcs.length} NPCs for world ${world_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedNpcs.length,
        npcs: insertedNpcs,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-world-npcs error:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Internal error",
        details: err.message,
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
