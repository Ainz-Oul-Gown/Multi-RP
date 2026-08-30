// supabase/functions/process-rest/index.ts
// Обработка отдыха, восстановления HP и генерация травм через ИИ
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

const SYSTEM_PROMPT = `Ты — медицинский и ролевой анализатор для текстовой RPG. Твоя задача — обработать действие игрока, связанное с отдыхом/сном/лечением, и вернуть структурированный результат.

ПРАВИЛА:
1. Определи, действительно ли действие — это отдых, сон, лечение, лагерь.
2. Оцени длительность отдыха в часах (краткий: 1-2ч, средний: 4-6ч, длинный: 8-12ч, полный: 24ч).
3. Оцени качество отдыха: poor, normal, good, excellent.
4. Если контекст предполагает травму (падение, бой, тяжелые условия), создай травму.
5. Травмы должны быть реалистичны: перелом, ушиб, открытая рана, отравление, головокружение и т.д.
6. НЕ создавай невозможные травмы без сюжетного обоснования (отсутствие конечности, blindness и т.п. только если явно описано).
7. Дебаффы от травм: headache (головная боль), dizziness (головокружение), slowed (замедление), poisoned (отравление), bleeding (кровотечение), exhaustion (истощение).
8. Каждый дебафф должен иметь: тип, длительность в часах, штраф к статам/инициативе/HP.

Формат ответа — ТОЛЬКО валидный JSON:
{
  "is_rest": true/false,
  "rest_quality": "poor|normal|good|excellent",
  "rest_duration_hours": 8,
  "hp_recovery": 15,
  "injuries": [
    {
      "type": "Перелом руки",
      "severity": "minor|major|critical",
      "description": "Ты упал с лошади и сломал руку",
      "stat_penalties": {"STR": -2, "DEX": -1},
      "hp_penalty": 5,
      "duration_hours": 48,
      "is_permanent": false,
      "debuffs": [
        {
          "type": "pain",
          "duration_hours": 24,
          "stat_penalties": {"STR": -2},
          "initiative_penalty": -2,
          "hp_per_turn": 1
        }
      ]
    }
  ],
  "narrative": "Ты хорошо отдохнул в лагере..."
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
    const player_id = sanitizeKey(parsed.player_id);
    const session_id = sanitizeKey(parsed.session_id);
    const action_text = cleanTextForAI(parsed.action_text);
    const player_stats = parsed.player_stats || {};
    const player_hp = Number(parsed.player_hp) || 0;
    const player_max_hp = Number(parsed.player_max_hp) || 100;
    const current_injuries = Array.isArray(parsed.current_injuries) ? parsed.current_injuries : [];

    console.log('process-rest input:', { user_id, player_id, session_id, action_text });

    if (!user_id || !player_id || !session_id || !action_text) {
      return new Response(JSON.stringify({ error: "user_id, player_id, session_id и action_text обязательны" }), {
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

    const userMessage = `Действие игрока: "${action_text}"\n\nТекущие характеристики: ${JSON.stringify(player_stats)}\nТекущее HP: ${player_hp}/${player_max_hp}\nТекущие травмы: ${JSON.stringify(current_injuries)}\n\nОпредели, является ли это действие отдыхом/сном/лечением, и рассчитай результат.`;

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
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(60000),
    });

    console.log('process-rest OpenRouter status:', response.status);

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
    console.log('process-rest AI raw:', rawContent);
    const restData = parseAIJson(rawContent);

    if (!restData) {
      return new Response(JSON.stringify({ error: "Не удалось распарсить ответ ИИ", raw: rawContent || null }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const hpRecovery = Number(restData.hp_recovery) || 0;
    const newHp = Math.min(player_max_hp, Math.max(0, player_hp + hpRecovery));

    const injuries = Array.isArray(restData.injuries) ? restData.injuries : [];
    if (injuries.length > 0) {
      for (const injury of injuries) {
        await supabase.from("player_injuries").insert({
          player_id,
          session_id,
          injury_type: cleanTextForAI(injury.type),
          severity: cleanTextForAI(injury.severity) || 'minor',
          description: cleanTextForAI(injury.description),
          stat_penalties: injury.stat_penalties || {},
          hp_penalty: Number(injury.hp_penalty) || 0,
          duration_hours: Number(injury.duration_hours) || 0,
          is_permanent: Boolean(injury.is_permanent),
        });
      }
    }

    const { error: updateError } = await supabase
      .from("players")
      .update({
        hp: newHp,
        last_rested_at: new Date().toISOString(),
      })
      .eq("id", player_id);

    if (updateError) {
      console.error("Failed to update player:", updateError);
    }

    return new Response(JSON.stringify({
      is_rest: Boolean(restData.is_rest),
      rest_quality: restData.rest_quality || 'normal',
      rest_duration_hours: Number(restData.rest_duration_hours) || 0,
      hp_recovery: hpRecovery,
      new_hp: newHp,
      injuries,
      narrative: restData.narrative || '',
    }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("process-rest error:", err);
    return new Response(JSON.stringify({
      error: err.message || "Internal error",
      details: err.message,
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
