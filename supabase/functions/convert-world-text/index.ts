// supabase/functions/convert-world-text/index.ts
// Конвертирует текстовое описание мира в структурированный JSON
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

const SYSTEM_PROMPT = `Ты — D&D-дизайнер мира. Твоя задача: проанализировать текстовое описание ролевого мира и превратить его в структурированный JSON-объект настроек.

Извлеки из текста:
- Доступные расы (races)
- Доступные классы (classes)
- Глобальные лимиты (max_level, starting_gold и т.д.)
- Локации/регионы (locations)
- Фракции (factions)
- Ключевые правила дома (house_rules)

Формат ответа — ТОЛЬКО валидный JSON без markdown:

{
  "races": ["Человек", "Эльф"],
  "classes": ["Воин", "Маг", "Плут"],
  "max_level": 20,
  "starting_gold": 100,
  "locations": ["Город Теней", "Лес Древних"],
  "factions": ["Стражи Рассвета", "Теневая Лига"],
  "house_rules": ["Криты наносят двойной урон"],
  "description_summary": "Краткое описание (1-2 предложения)"
}

Если какая-то информация отсутствует в тексте — поставь пустой массив или значение по умолчанию.
ВСЁ на русском языке.`;

function sanitizeKey(raw: string): string {
  return (raw || "").trim().replace(/[^\x20-\x7E]/g, "");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { user_id, world_name, description } = await req.json();

    if (!user_id || !world_name || !description) {
      return new Response(JSON.stringify({ error: "user_id, world_name и description обязательны" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let apiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("openrouter_key")
      .eq("id", user_id)
      .maybeSingle();
    if (userSettings?.openrouter_key) apiKey = sanitizeKey(userSettings.openrouter_key);

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Укажите OpenRouter API Key в настройках аккаунта",
        code: "MISSING_API_KEY",
      }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userMessage = `Мир: "${world_name}"\n\nОписание:\n${description}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.5,
        max_tokens: 1500,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "Ошибка AI API" }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices[0].message.content;

    let settings = null;
    try { settings = JSON.parse(rawContent); } catch {}
    if (!settings) {
      const jsonMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) { try { settings = JSON.parse(jsonMatch[1]); } catch {} }
    }
    if (!settings) {
      const objMatch = rawContent.match(/\{[\s\S]*\}/);
      if (objMatch) { try { settings = JSON.parse(objMatch[0]); } catch {} }
    }

    if (!settings) {
      return new Response(JSON.stringify({ error: "Не удалось распарсить ответ ИИ", raw: rawContent }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ settings }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("convert-world-text error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
