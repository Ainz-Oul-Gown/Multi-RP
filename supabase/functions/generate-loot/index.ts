// supabase/functions/generate-loot/index.ts
// Генерация лута, построек или предметов через отдельную нейросеть
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

const SYSTEM_PROMPT = `Ты — генератор предметов и построений для текстовой RPG. Твоя задача — создать реалистичный, сбалансированный предмет/постройку/лут на основе контекста.

ПРАВИЛА:
1. Предмет должен соответствовать контексту (локация, сюжет, уровень, раса, класс).
2. Не создавай "Экскалибур в подвале", если это не указано в сюжете.
3. Учитывай характеристики игрока (STR/DEX/CON/INT/WIS/CHA) для подбора редкости и параметров.
4. Баланс: обычные предметы → 1-2 параметра, редкие → 3-4 параметра, легендарные → только если явно указано в сюжете.
5. Оцени состояние предмета: new, used, damaged, broken.
6. Если контекст бедный — создай простой предмет подходящего уровня.

Формат ответа — ТОЛЬКО валидный JSON без markdown:
{
  "name": "Название",
  "type": "weapon|armor|consumable|misc|building|material",
  "rarity": "common|uncommon|rare|legendary",
  "description": "Описание внешнего вида и истории",
  "stats": {
    "STR": 0,
    "DEX": 0,
    "CON": 0,
    "INT": 0,
    "WIS": 0,
    "CHA": 0
  },
  "ac_bonus": 0,
  "damage": "1d8",
  "heal_amount": 0,
  "value": 10,
  "condition": "new|used|damaged|broken",
  "durability": 100,
  "requirements": {
    "level": 1,
    "stats": {}
  },
  "effects": ["Эффект 1", "Эффект 2"],
  "world_hints": {
    "location": "Таверна",
    "theme": " medieval",
    "plot_relevance": "низкая"
  }
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

    const user_id = cleanTextForAI(parsed.user_id);
    const context = cleanTextForAI(parsed.context);
    const recent_messages = Array.isArray(parsed.recent_messages) ? parsed.recent_messages.map((m: any) => cleanTextForAI(m)).join('\n') : '';
    const plot_stage = cleanTextForAI(parsed.plot_stage);
    const player_stats = parsed.player_stats || {};
    const player_race = cleanTextForAI(parsed.player_race) || 'Человек';
    const item_type = cleanTextForAI(parsed.item_type) || 'misc';
    const rarity = cleanTextForAI(parsed.rarity) || 'common';
    const location = cleanTextForAI(parsed.location) || 'Неизвестно';
    const save_to_inventory = Boolean(parsed.save_to_inventory);
    const player_id = sanitizeKey(parsed.player_id);

    console.log('generate-loot input:', { user_id, item_type, rarity, player_race, location, save_to_inventory });

    if (!user_id || !context) {
      return new Response(JSON.stringify({ error: "user_id и context обязательны" }), {
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

    const userMessage = `Контекст: ${context}\nЛокация: ${location}\n\n${recent_messages ? `Последние события:\n${recent_messages}\n\n` : ''}${plot_stage ? `Сюжет: ${plot_stage}\n\n` : ''}Игрок (${player_race}) имеет характеристики: ${JSON.stringify(player_stats)}.\n\nСоздай ${rarity === 'legendary' ? 'легендарный' : rarity === 'rare' ? 'редкий' : rarity === 'uncommon' ? 'необычный' : 'обычный'} предмет типа ${item_type}.`;

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

    console.log('generate-loot OpenRouter status:', response.status);

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
    console.log('generate-loot AI raw:', rawContent);
    const item = parseAIJson(rawContent);

    if (!item) {
      return new Response(JSON.stringify({ error: "Не удалось распарсить ответ ИИ", raw: rawContent || null }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const normalizedItem = {
      name: cleanTextForAI(item.name),
      type: cleanTextForAI(item.type) || 'misc',
      rarity: cleanTextForAI(item.rarity) || 'common',
      description: cleanTextForAI(item.description),
      stats: item.stats || {},
      ac_bonus: Number(item.ac_bonus) || 0,
      damage: cleanTextForAI(item.damage) || '',
      heal_amount: Number(item.heal_amount) || 0,
      value: Number(item.value) || 10,
      condition: cleanTextForAI(item.condition) || 'new',
      durability: Number(item.durability) || 100,
      requirements: item.requirements || {},
      effects: Array.isArray(item.effects) ? item.effects.map((e: any) => cleanTextForAI(String(e))) : [],
      world_hints: item.world_hints || {},
    };

    let inventoryItem = null;
    if (save_to_inventory && player_id) {
      const { data: inventoryData, error: inventoryError } = await supabase
        .from("inventory")
        .insert({
          player_id,
          item_name: normalizedItem.name,
          type: normalizedItem.type,
          rarity: normalizedItem.rarity,
          description: normalizedItem.description,
          stats: normalizedItem.stats,
          ac_bonus: normalizedItem.ac_bonus,
          damage: normalizedItem.damage,
          heal_amount: normalizedItem.heal_amount,
          value: normalizedItem.value,
          condition: normalizedItem.condition,
          durability: normalizedItem.durability,
          requirements: normalizedItem.requirements,
          effects: normalizedItem.effects,
          quantity: 1,
        })
        .select()
        .single();

      if (inventoryError) {
        console.error('Failed to save item to inventory:', inventoryError);
      } else {
        inventoryItem = inventoryData;
      }
    }

    return new Response(JSON.stringify({
      item: normalizedItem,
      inventory_item: inventoryItem,
      location,
    }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-loot error:", err);
    return new Response(JSON.stringify({
      error: err.message || "Internal error",
      details: err.message,
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
