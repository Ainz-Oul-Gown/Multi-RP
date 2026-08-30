// supabase/functions/assess-durability/index.ts
// Оценка износа/потери предмета после использования
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Ты — оценщик износа предметов в текстовой RPG. Твоя задача — оценить, как использование предмета повлияло на его состояние.

ПРАВИЛА:
1. Опиши, как именно использование предмета повлияло на его прочность.
2. Учитывай тип предмета: оружие тупится при ударе о броню, броня получает вмятины, расходники тратятся.
3. Оцени новое состояние предмета: new, used, damaged, broken.
4. Рассчитай новую прочность (durability) в процентах.
5. Если предмет сломан — укажи, можно ли его починить.
6. Если предмет был утерян — укажи это.
7. Будь реалистичен: долбежка камня мечом → сильный износ, мягкая ткань → умеренный износ.

Формат ответа — ТОЛЬКО валидный JSON:
{
  "durability_change": -15,
  "new_durability": 85,
  "new_condition": "used|damaged|broken",
  "is_destroyed": false,
  "is_lost": false,
  "description": "Меч получил несколько вмятин при ударе о камень",
  "repairable": true,
  "repair_cost": 5
}

ВСЁ на русском языке.`;

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

    const user_id = sanitizeKey(parsed.user_id);
    const item_id = sanitizeKey(parsed.item_id);
    const item_name = cleanTextForAI(parsed.item_name);
    const item_type = cleanTextForAI(parsed.item_type);
    const item_condition = cleanTextForAI(parsed.item_condition);
    const item_durability = Number(parsed.item_durability) || 100;
    const action_description = cleanTextForAI(parsed.action_description);
    const use_context = cleanTextForAI(parsed.use_context);

    console.log('assess-durability input:', { user_id, item_id, item_name, item_type, action_description });

    if (!user_id || !item_id || !action_description) {
      return new Response(JSON.stringify({ error: "user_id, item_id и action_description обязательны" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
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
        error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
        code: "MISSING_API_KEY",
      }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userMessage = `Предмет: ${item_name} (тип: ${item_type}, состояние: ${item_condition}, прочность: ${item_durability}%)\nДействие: ${action_description}\nКонтекст: ${use_context}\n\nОцени износ и новое состояние предмета.`;

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(60000),
    });

    console.log('assess-durability OpenRouter status:', response.status);

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
    console.log('assess-durability AI raw:', rawContent);
    const assessment = parseAIJson(rawContent);

    if (!assessment) {
      return new Response(JSON.stringify({ error: "Не удалось распарсить ответ ИИ", raw: rawContent || null }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const newDurability = Math.max(0, Math.min(100, item_durability + (Number(assessment.durability_change) || 0)));
    const newCondition = cleanTextForAI(assessment.new_condition) || item_condition;

    if (Boolean(assessment.is_destroyed) || Boolean(assessment.is_lost)) {
      await supabase.from("inventory").delete().eq("id", item_id);
    } else {
      await supabase.from("inventory").update({
        durability: newDurability,
        condition: newCondition,
      }).eq("id", item_id);
    }

    return new Response(JSON.stringify({
      item_id,
      durability_change: Number(assessment.durability_change) || 0,
      new_durability: newDurability,
      new_condition: newCondition,
      is_destroyed: Boolean(assessment.is_destroyed),
      is_lost: Boolean(assessment.is_lost),
      description: cleanTextForAI(assessment.description),
      repairable: Boolean(assessment.repairable),
      repair_cost: Number(assessment.repair_cost) || 0,
    }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("assess-durability error:", err);
    return new Response(JSON.stringify({
      error: err.message || "Internal error",
      details: err.message,
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
