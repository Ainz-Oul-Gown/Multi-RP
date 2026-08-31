// supabase/functions/generate-character/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sanitizeKey,
  cleanTextForAI,
  parseAIJson,
  validateAndFixStats,
  calculateDerivedStats,
} from "../_shared/utils.ts";

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

КРИТИЧЕСКИ ВАЖНО:
- Ответь ТОЛЬКО валидным JSON. Никакого текста до или после.
- Не используй markdown, не оборачивай в код-блоки.
- Не добавляй объяснений, вступлений, заключений.
- Убедись, что JSON полный и закрыт фигурной скобкой.
- НЕ упоминай изображения, файлы, base64, avatar, image, photo, picture, icon. Этот текст не содержит изображений, это обычный текстовый запрос.

Формат:
{"STR": 14, "DEX": 12, "CON": 13, "INT": 10, "WIS": 11, "CHA": 12}

Сумма = 72. Только JSON.`;

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

    const user_id = cleanTextForAI(parsed.user_id);
    const name = cleanTextForAI(parsed.name);
    const race = cleanTextForAI(parsed.race);
    const charClass = cleanTextForAI(parsed.class);
    const appearance = cleanTextForAI(parsed.appearance);
    const bio = cleanTextForAI(parsed.bio);

    console.log('generate-character input:', JSON.stringify({ user_id, name, race, charClass, appearance, bio }));

    const imagePattern = /\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi;
    const checkFields = [name, race, charClass, appearance, bio];
    for (const field of checkFields) {
      if (field && new RegExp(imagePattern.source, imagePattern.flags).test(field)) {
        return new Response(JSON.stringify({ error: "Обнаружены ссылки на изображения. Удалите их и попробуйте снова." }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
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
        error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
        code: "MISSING_API_KEY",
      }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userMessage = `Имя: ${name}\nРаса: ${race}\nКласс: ${charClass}\nВнешность: ${appearance}\nБиография: ${bio}\n\nСоздай характеристики персонажа.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          { role: "system", content: STATS_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(60000),
    });

    console.log('generate-character OpenRouter status:', response.status);

    if (!response.ok) {
      let errDetails = "";
      try {
        const errJson = await response.json();
        errDetails = errJson?.error?.message || errJson?.error || JSON.stringify(errJson);
      } catch {
        errDetails = await response.text();
      }
      console.error("AI API error:", errDetails);
      return new Response(JSON.stringify({
        error: "Ошибка AI API",
        details: errDetails,
        status: response.status,
      }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    console.log('generate-character AI raw:', rawContent);
    const stats = parseAIJson(rawContent);

    if (!stats) {
      return new Response(JSON.stringify({
        error: "Не удалось распарсить ответ ИИ",
        raw: rawContent || null,
        stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const result = validateAndFixStats(stats);
    const race2 = cleanTextForAI(parsed.race) || 'Человек';
    const raceAcBonus = calculateDerivedStats(result, race2, []).armor_class - 10 - Math.floor(((result.DEX || 10) - 10) / 2);
    const derived = calculateDerivedStats(result, race2, [], raceAcBonus);

    return new Response(JSON.stringify({ stats: result, race_ac_bonus: raceAcBonus, ...derived }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-character error:", err);
    return new Response(JSON.stringify({
      error: err.message || "Internal error",
      details: err.message,
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
