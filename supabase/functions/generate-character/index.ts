// supabase/functions/generate-character/index.ts
// Генерация статов персонажа на основе биографии

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

const STATS_SYSTEM_PROMPT = `Ты — D&D-балансировщик персонажей. Твоя задача — создать сбалансированные характеристики на основе биографии персонажа.

Доступные характеристики: STR, DEX, CON, INT, WIS, CHA.

ПРАВИЛА:
1. Сумма всех шести характеристик ДОЛЖНА быть ровно 72 очка.
2. Каждая характеристика — от 3 до 18.
3. Анализируй биографию: если персонаж воин — повысь STR/CON, если маг — INT/WIS, если плут — DEX, если дипломат — CHA.
4. Учитывай расу и класс для тематической подгонки.
5. Не ставь все значения по 12 — делай выраженные сильные и слабые стороны.

ОБЯЗАТЕЛЬНО верни ТОЛЬКО валидный JSON без markdown-обёрток:
{
  "STR": 14,
  "DEX": 12,
  "CON": 13,
  "INT": 10,
  "WIS": 11,
  "CHA": 12
}

Сумма = 72. Никакого другого текста.`;

function parseAIJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[1]); } catch {} }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, name, race, class: charClass, appearance, bio } = await req.json();

    if (!user_id || !bio) {
      return new Response(JSON.stringify({ error: "user_id и bio обязательны" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Resolve API key
    let apiKey = FALLBACK_OPENROUTER_KEY;
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("openrouter_key")
      .eq("id", user_id)
      .maybeSingle();

    if (userSettings?.openrouter_key) {
      apiKey = userSettings.openrouter_key;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
        code: "MISSING_API_KEY",
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user message from character info
    const userMessage = [
      name ? `Имя: ${name}` : "",
      race ? `Раса: ${race}` : "",
      charClass ? `Класс: ${charClass}` : "",
      appearance ? `Внешность: ${appearance}` : "",
      `Биография: ${bio}`,
    ].filter(Boolean).join("\n");

    // Call AI
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://multirp-ai.app",
        "X-Title": "MultiRP AI Character Generator",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: STATS_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", errText);
      return new Response(JSON.stringify({ error: "Ошибка AI API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawContent = data.choices[0].message.content;
    const stats = parseAIJson(rawContent);

    if (!stats) {
      return new Response(JSON.stringify({ error: "Не удалось распарсить ответ ИИ", raw: rawContent }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate: sum must be 72, each stat 3-18
    const validStats = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    const result: Record<string, number> = {};
    let sum = 0;

    for (const s of validStats) {
      const val = Math.min(18, Math.max(3, Math.round(Number(stats[s]) || 10)));
      result[s] = val;
      sum += val;
    }

    // Normalize to exactly 72 if needed
    if (sum !== 72) {
      const diff = 72 - sum;
      // Adjust the stat furthest from 10
      let adjustStat = "STR";
      let maxDist = 0;
      for (const s of validStats) {
        const dist = Math.abs(result[s] - 10);
        if (dist > maxDist) {
          maxDist = dist;
          adjustStat = s;
        }
      }
      result[adjustStat] = Math.min(18, Math.max(3, result[adjustStat] + diff));
    }

    return new Response(JSON.stringify({ stats: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-character error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
