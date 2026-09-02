// supabase/functions/process-turn/steps/step1_router.ts
// Шаг 1: AI-Маршрутизатор (AI Router)
// Лёгкий вызов LLM (satellite_model) для парсинга намерений игрока в строгий JSON.
// ИИ выступает "вышибалой" — отсекает абсурд и помечает нецелевое использование предметов.

import { RouterInputContext, RouterOutputPayload, RouterAction, Atmosphere } from "../types.ts";
import { parseAIJson, cleanTextForAI } from "../../_shared/utils.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "xiaomi/mimo-v2.5";

// ============================================
// Системный промпт
// ============================================
function buildRouterSystemPrompt(): string {
  return `Ты — AI-Парсер для D&D ЛитРПГ игры. Твоя задача — извлекать намерения игрока и переводить их в строгий JSON.

## ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА

1. **Сопоставление предметов**: Каждый предмет в инвентаре имеет уникальный ID. Используй ТОЛЬКО ID из предоставленного списка, никогда не придумывай.

2. **Определение характеристики**: Выбери одну стату для проверки:
   - strength (STR) — физические действия, рубка, борьба
   - dexterity (DEX) — ловкость рук, уклонение
   - stealth — скрытность, засада
   - survival — выживание, охота, собирательство
   - investigation — обыск, поиск улик
   - insight — понимание NPC, чтение намерений
   - none — действие не требует проверки

3. **Фильтр абсурда (status: "impossible")**:
   - Игрок делает то, что нарушает физику (летает без магии, дышит под водой)
   - Игрок использует предмет, которого нет в инвентаре
   - Действие требует навыка, недоступного персонажу (без причины)
   - Нереалистичные таймфреймы ("мгновенно построить замок")

4. **Нецелевое использование инструментов (improper_tool_usage)**:
   Если игрок использует предмет НЕ по назначению (рубит дерево мечом, копает ложкой) — ставь status: "success", но:
   - is_improper: true
   - durability_penalty: 1-3 (потеря прочности)
   - stat_penalty: "damage" (если может сломаться)
   - reason: объяснение
   - ai_custom_dc: 30-40 (высокая сложность)

5. **clarification_needed**: Если действие неоднозначно и нужно уточнение (например: "помогаю городу" — каким образом?).

6. **Время**: оцени сколько минут займёт действие (1-1440).

7. **Атмосфера**: 1-3 звука и 1-3 визуальных образа для сцены.

## ФОРМАТ ОТВЕТА

Отвечай ТОЛЬКО валидным JSON без markdown-разметки (без \`\`\`json).

{
  "status": "success" | "clarification_needed" | "impossible",
  "clarification_msg": "string или null",
  "actions": [
    {
      "action_type": "attack" | "stealth_attack" | "move" | "loot" | "craft_recipe" | "craft_custom" | "transfer" | "talk" | "search" | "harvest_ambient",
      "target_entity_id": "uuid или null",
      "target_item_name": "string или null",
      "used_item_id": "uuid или null",
      "consumed_materials": [{"id": "uuid", "quantity": 1}] или null,
      "stat_to_check": "strength" | "dexterity" | "stealth" | "survival" | "investigation" | "insight" | "none",
      "ai_custom_dc": 10-40 или null,
      "improper_tool_usage": {
        "is_improper": true,
        "durability_penalty": 1,
        "stat_penalty": "damage" или null,
        "reason": "string"
      } или null
    }
  ],
  "encounter_intent": {
    "type": "targeted" | "random" | "none",
    "target_name": "string или null"
  },
  "time_estimate_minutes": 30,
  "atmosphere": {
    "sounds": ["string"],
    "visuals": ["string"]
  }
}

Если действие невозможно, массив actions может быть пустым.
Не придумывай NPC, предметы или локации — используй только данные из контекста.`;
}

// ============================================
// Сборка userMessage из контекста
// ============================================
function buildUserMessage(input: RouterInputContext): string {
  const lines: string[] = [];

  lines.push(`## Действие игрока`);
  lines.push(`"${cleanTextForAI(input.player_action_text)}"`);
  lines.push("");

  lines.push(`## Снимок игрока`);
  lines.push(`Имя: ${input.player.name} (${input.player.race}, ${input.player.class}, ур.${input.player.level})`);
  lines.push(`HP: ${input.player.hp}/${input.player.max_hp}`);
  lines.push(`Характеристики: STR=${input.player.stats.STR} DEX=${input.player.stats.DEX} CON=${input.player.stats.CON} INT=${input.player.stats.INT} WIS=${input.player.stats.WIS} CHA=${input.player.stats.CHA}`);
  if (input.player.location_name) {
    lines.push(`Локация: ${input.player.location_name}${input.player.state_name ? `, ${input.player.state_name}` : ''}`);
  }
  lines.push("");

  lines.push(`## Игровое время`);
  const t = input.game_time;
  lines.push(`${t.day}.${t.month}.${t.year} ${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`);
  lines.push("");

  lines.push(`## Погода`);
  lines.push(`${input.weather.description}, температура ${input.weather.temperature}°C${input.weather.is_raining ? ', дождь' : ''}${input.weather.is_night ? ', ночь' : ''}, ветер ${input.weather.wind_speed} м/с`);
  lines.push("");

  if (input.inventory.length > 0) {
    lines.push(`## Инвентарь игрока (строгие ID)`);
    for (const item of input.inventory) {
      const condStr = item.durability !== null ? `, прочность ${item.durability}` : '';
      const condStr2 = item.condition !== null ? `, состояние ${item.condition}%` : '';
      lines.push(`- [${item.id}] ${item.item_name} (${item.item_type}) x${item.quantity}${condStr}${condStr2}`);
    }
    lines.push("");
  } else {
    lines.push(`## Инвентарь игрока`);
    lines.push("Пусто.");
    lines.push("");
  }

  if (input.nearby_npcs.length > 0) {
    lines.push(`## NPC рядом`);
    for (const npc of input.nearby_npcs) {
      lines.push(`- [${npc.id}] ${npc.name} (${npc.race})${npc.is_hostile ? ' ⚔️ ВРАГ' : ''}, HP ${npc.hp}/${npc.max_hp}, дистанция ${npc.distance_meters}м`);
    }
    lines.push("");
  } else {
    lines.push(`## NPC рядом`);
    lines.push("Никого.");
    lines.push("");
  }

  lines.push(`## Инструкция`);
  lines.push(`Верни ТОЛЬКО валидный JSON по указанной схеме. Используй ТОЛЬКО ID из инвентаря. Если действие невозможно — status: "impossible".`);

  return lines.join("\n");
}

// ============================================
// Валидация ответа LLM
// ============================================
function validateRouterOutput(parsed: any): asserts parsed is RouterOutputPayload {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI Router: ответ не является объектом");
  }

  // Проверка status
  const validStatuses = ["success", "clarification_needed", "impossible"];
  if (!validStatuses.includes(parsed.status)) {
    throw new Error(`AI Router: неверный status "${parsed.status}". Допустимо: ${validStatuses.join(", ")}`);
  }

  // Проверка actions
  if (!Array.isArray(parsed.actions)) {
    throw new Error('AI Router: поле "actions" должно быть массивом');
  }

  const validActionTypes = [
    "attack", "stealth_attack", "move", "loot",
    "craft_recipe", "craft_custom", "transfer",
    "talk", "search", "harvest_ambient"
  ];
  const validStats = [
    "strength", "dexterity", "stealth", "survival",
    "investigation", "insight", "none"
  ];

  for (let i = 0; i < parsed.actions.length; i++) {
    const action = parsed.actions[i];
    if (!validActionTypes.includes(action.action_type)) {
      throw new Error(`AI Router: actions[${i}].action_type "${action.action_type}" недопустим`);
    }
    if (!validStats.includes(action.stat_to_check)) {
      throw new Error(`AI Router: actions[${i}].stat_to_check "${action.stat_to_check}" недопустим`);
    }
    if (action.ai_custom_dc !== null && (action.ai_custom_dc < 5 || action.ai_custom_dc > 40)) {
      throw new Error(`AI Router: actions[${i}].ai_custom_dc должен быть 5-40 или null`);
    }
  }

  // Проверка encounter_intent
  if (!parsed.encounter_intent || typeof parsed.encounter_intent !== "object") {
    throw new Error('AI Router: поле "encounter_intent" обязательно');
  }
  const validEncounterTypes = ["targeted", "random", "none"];
  if (!validEncounterTypes.includes(parsed.encounter_intent.type)) {
    throw new Error(`AI Router: encounter_intent.type "${parsed.encounter_intent.type}" недопустим`);
  }

  // Проверка time_estimate_minutes
  if (typeof parsed.time_estimate_minutes !== "number" || parsed.time_estimate_minutes < 0) {
    throw new Error('AI Router: time_estimate_minutes должно быть неотрицательным числом');
  }

  // Проверка atmosphere
  if (!parsed.atmosphere || typeof parsed.atmosphere !== "object") {
    throw new Error('AI Router: поле "atmosphere" обязательно');
  }
  if (!Array.isArray(parsed.atmosphere.sounds)) {
    throw new Error('AI Router: atmosphere.sounds должно быть массивом');
  }
  if (!Array.isArray(parsed.atmosphere.visuals)) {
    throw new Error('AI Router: atmosphere.visuals должно быть массивом');
  }
}

// ============================================
// Нормализация: заполнение дефолтных значений
// ============================================
function normalizeRouterOutput(parsed: any): RouterOutputPayload {
  return {
    status: parsed.status,
    clarification_msg: parsed.clarification_msg ?? null,
    actions: (parsed.actions || []).map((a: any): RouterAction => ({
      action_type: a.action_type,
      target_entity_id: a.target_entity_id ?? null,
      target_item_name: a.target_item_name ?? null,
      used_item_id: a.used_item_id ?? null,
      consumed_materials: a.consumed_materials ?? null,
      stat_to_check: a.stat_to_check,
      ai_custom_dc: a.ai_custom_dc ?? null,
      improper_tool_usage: a.improper_tool_usage ?? null,
      dynamic_blueprint: a.dynamic_blueprint ?? null,
    })),
    encounter_intent: {
      type: parsed.encounter_intent.type,
      target_name: parsed.encounter_intent.target_name ?? null,
    },
    time_estimate_minutes: Math.max(0, Math.min(1440, Number(parsed.time_estimate_minutes) || 0)),
    atmosphere: {
      sounds: Array.isArray(parsed.atmosphere.sounds) ? parsed.atmosphere.sounds : [],
      visuals: Array.isArray(parsed.atmosphere.visuals) ? parsed.atmosphere.visuals : [],
    },
  };
}

// ============================================
// Главная функция Шага 1
// ============================================
export async function parsePlayerIntent(
  input: RouterInputContext,
  apiKey: string,
  model: string = DEFAULT_MODEL,
  retries: number = 3
): Promise<RouterOutputPayload> {
  const systemPrompt = buildRouterSystemPrompt();
  const userMessage = buildUserMessage(input);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[step1_router] Attempt ${attempt + 1}/${retries}, model: ${model}`);

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.3, // Низкая температура для стабильного JSON
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content;

      if (!rawContent) {
        throw new Error("AI Router: пустой ответ от LLM");
      }

      console.log(`[step1_router] Raw LLM response (${rawContent.length} chars):`, rawContent.slice(0, 200));

      // Парсинг JSON
      const parsed = parseAIJson(rawContent);
      if (!parsed) {
        throw new Error("AI Router: не удалось распарсить JSON из ответа LLM");
      }

      // Валидация структуры
      validateRouterOutput(parsed);

      // Нормализация дефолтных значений
      const normalized = normalizeRouterOutput(parsed);

      console.log(`[step1_router] ✅ Parsed: status=${normalized.status}, actions=${normalized.actions.length}, time=${normalized.time_estimate_minutes}min`);

      return normalized;

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[step1_router] Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < retries - 1) {
        // Экспоненциальная задержка
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error(`AI Router: не удалось получить валидный ответ после ${retries} попыток. Последняя ошибка: ${lastError?.message}`);
}
