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

5. **clarification_needed vs Свободный отыгрыш / Описание сцены**:
   - КРИТИЧЕСКИ ВАЖНО: Описательные, созерцательные, ознакомительные и ролевые действия (например: "Опиши мое появление в каком-либо городе", "Осматриваюсь вокруг", "Вхожу в город", "Прислушиваюсь к шуму улицы", "Отдыхаю у костра", "Размышляю", "Любуюсь закатом") — это ПОЛНОСТЬЮ ВАЛИДНЫЕ действия! Для них ОБЯЗАТЕЛЬНО возвращай status: "success", пустой массив actions: [] (или действие "search"/"talk" если уместно), и время 10-30 минут. Ни в коем случае НЕ возвращай clarification_needed для таких действий! Нарратор (AI Dungeon Master) сам красочно опишет сцену.
   - clarification_needed разрешено возвращать ИСКЛЮЧИТЕЛЬНО если ввод игрока является случайным мусором/набором букв (например: "asdfghjk", "???", "123"). Сообщение clarification_msg ДОЛЖНО БЫТЬ СТРОГО НА РУССКОМ ЯЗЫКЕ (например: "Уточните, какое действие вы хотите совершить").

6. **Навыки игрока (skill_hint)**:
   Определи, какой навык развивает это действие (если применимо): "swordsmanship", "archery", "gathering", "crafting", "leatherworking", "stealth", "survival", "persuasion", "medicine", "magic" или null.

7. **Время**: оцени сколько минут займёт действие (1-1440).

8. **Атмосфера**: 1-3 звука и 1-3 визуальных образа для сцены.

9. **Сбор ресурсов (harvest_ambient)**:
   - Если игрок собирает или ищет природные или окружающие ресурсы (камни, палки, ветки, ягоды, травы, грибы, руду, воду, или в киберпанке: металлолом, микросхемы, запчасти, проводку, картриджи стимуляторов, чипы памяти):
   - action_type: "harvest_ambient"
   - Обязательно указывай 'target_item_name' с конкретным названием на русском языке в именительном падеже (например: "Камни", "Сухие ветки", "Лесные грибы", "Лесная черника", "Целебная трава", "Медный самородок", "Обломки электроники", "Химический стимулятор"). НИКОГДА не оставляй target_item_name пустым или словом "ресурс" или "находка"!
   - Указывай 'item_type':
     * Для еды/трав/лекарств: "consumable", "herb", "food", "potion", "stim"
     * Для материалов/руды/дерева/металла/камня: "material", "wood", "ore", "gem", "scrap", "electronics", "stone"
     * Для технологий/киберпанка: "cyberware", "implant", "software", "datashard", "ammo", "energy_cell"
     * По умолчанию: "material" или "consumable"
   - КРИТИЧЕСКИ ВАЖНО: При поиске/сборе ресурсов возвращай СТРОГО ОДНО действие: "harvest_ambient"! КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО добавлять дублирующее действие "search" (обыск). Действие "search" предназначено ТОЛЬКО для обыска тел, сундуков, шкафов, тайников или поиска скрытых улик.

10. **Прокачка характеристик / распределение очков**:
   - Если игрок распределяет свободные очки характеристик (например: "Вкладываю 2 очка в силу", "Качаю ловкость +1", "распредели очки"):
   - Это валидное действие! Ставь status: "success", time_estimate_minutes: 5, actions: [] (движок игры автоматически применит улучшение характеристик персонажа).

11. **Выбрасывание предметов (drop)**:
   - Если игрок выбрасывает, бросает на землю или избавляется от предмета ("выкидываю 2 гриба", "бросаю сухие ветки"):
   - action_type: "drop"
   - target_item_name: точное название предмета на русском языке
   - used_item_id: точный ID предмета из списка инвентаря
   - consumed_materials: [{"quantity": N}] (где N — сколько штук выбросить)
   - stat_to_check: "none"
   - ai_custom_dc: null

12. **Передача предмета NPC или другому игроку (transfer)**:
   - Если игрок дарит, отдаёт или передаёт предмет ("отдаю 1 гриб Гордону", "передаю факел спутнику"):
   - action_type: "transfer"
   - target_entity_id: точный UUID получателя из списка "NPC рядом"
   - target_item_name: название предмета
   - used_item_id: точный ID предмета из списка инвентаря
   - consumed_materials: [{"quantity": N}]
   - stat_to_check: "none"
   - ai_custom_dc: null

## ФОРМАТ ОТВЕТА

Отвечай ТОЛЬКО валидным JSON без markdown-разметки (без \`\`\`json).

{
  "status": "success" | "clarification_needed" | "impossible",
  "clarification_msg": "string или null",
  "skill_hint": "swordsmanship" | "gathering" | "stealth" | "crafting" | "persuasion" | null,
  "actions": [
    {
      "action_type": "attack" | "stealth_attack" | "move" | "loot" | "craft_recipe" | "craft_custom" | "transfer" | "drop" | "talk" | "search" | "harvest_ambient",
      "target_entity_id": "uuid или null",
      "target_item_name": "string или null",
      "item_type": "string или null",
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
function buildUserMessage(input: any): string {
  const lines: string[] = [];

  const actionText = input?.player_action_text || input?.action_text || "";
  lines.push(`## Действие игрока`);
  lines.push(`"${cleanTextForAI(actionText)}"`);
  lines.push("");

  const p = input?.player || {};
  const playerName = p.name || input?.player_name || "Герой";
  const playerRace = p.race || input?.player_race || "Человек";
  const playerClass = p.class || input?.player_class || "Воин";
  const playerLevel = p.level || input?.player_level || 1;
  const playerHp = p.hp ?? input?.player_hp ?? 100;
  const playerMaxHp = p.max_hp ?? input?.player_max_hp ?? 100;
  const stats = p.stats || input?.player_stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

  lines.push(`## Снимок игрока`);
  lines.push(`Имя: ${playerName} (${playerRace}, ${playerClass}, ур.${playerLevel})`);
  lines.push(`HP: ${playerHp}/${playerMaxHp}`);
  lines.push(`Характеристики: STR=${stats.STR ?? 10} DEX=${stats.DEX ?? 10} CON=${stats.CON ?? 10} INT=${stats.INT ?? 10} WIS=${stats.WIS ?? 10} CHA=${stats.CHA ?? 10}`);

  const locName = p.location_name || input?.current_location;
  const stateName = p.state_name || input?.current_state;
  if (locName) {
    lines.push(`Локация: ${locName}${stateName ? `, ${stateName}` : ''}`);
  }
  lines.push("");

  const t = input?.game_time || input?.current_time || { year: 1, month: 1, day: 1, hour: 8, minute: 0 };
  lines.push(`## Игровое время`);
  lines.push(`${t.day ?? 1}.${t.month ?? 1}.${t.year ?? 1} ${(t.hour ?? 8).toString().padStart(2, '0')}:${(t.minute ?? 0).toString().padStart(2, '0')}`);
  lines.push("");

  const w = input?.weather || { description: "Ясно", temperature: 20, is_raining: false, is_night: false, wind_speed: 2 };
  lines.push(`## Погода`);
  lines.push(`${w.description || "Ясно"}, температура ${w.temperature ?? 20}°C${w.is_raining ? ', дождь' : ''}${w.is_night ? ', ночь' : ''}, ветер ${w.wind_speed ?? 0} м/с`);
  lines.push("");

  const inv = Array.isArray(input?.inventory) ? input.inventory : Array.isArray(input?.player_inventory) ? input.player_inventory : [];
  if (inv.length > 0) {
    lines.push(`## Инвентарь игрока (строгие ID)`);
    for (const item of inv) {
      if (typeof item === "string") {
        lines.push(`- ${item}`);
      } else {
        const condStr = item.durability !== null && item.durability !== undefined ? `, прочность ${item.durability}` : '';
        const condStr2 = item.condition !== null && item.condition !== undefined ? `, состояние ${item.condition}%` : '';
        lines.push(`- [${item.id || 'item'}] ${item.item_name || item.name || 'предмет'} (${item.item_type || item.type || 'misc'}) x${item.quantity || 1}${condStr}${condStr2}`);
      }
    }
    lines.push("");
  } else {
    lines.push(`## Инвентарь игрока`);
    lines.push("Пусто.");
    lines.push("");
  }

  const npcs = Array.isArray(input?.nearby_npcs) ? input.nearby_npcs : [];
  if (npcs.length > 0) {
    lines.push(`## NPC рядом`);
    for (const npc of npcs) {
      lines.push(`- [${npc.id || 'npc'}] ${npc.name || 'NPC'} (${npc.race || 'гуманоид'})${npc.is_hostile ? ' ⚔️ ВРАГ' : ''}, HP ${npc.hp ?? 10}/${npc.max_hp ?? 10}, дистанция ${npc.distance_meters ?? 5}м`);
    }
    lines.push("");
  } else {
    lines.push(`## NPC рядом`);
    lines.push("Никого.");
    lines.push("");
  }

  const story = input?.storyline;
  if (story?.current_arc) {
    lines.push(`## Сюжетный контекст (ориентиры)`);
    lines.push(`Сюжет: ${story.title || "Основной сюжет"}`);
    lines.push(`Активная арка: ${story.current_arc.title}`);
    if (story.current_arc.goals?.length) {
      lines.push(`Ориентиры: ${story.current_arc.goals.join("; ")}`);
    }
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
    "craft_recipe", "craft_custom", "transfer", "drop",
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
  const hasHarvest = (parsed.actions || []).some((a: any) => a.action_type === "harvest_ambient");
  let rawActions: any[] = parsed.actions || [];

  // Если есть harvest_ambient, убираем избыточный/ложный search (например, если модель выдала и сбор, и поиск)
  if (hasHarvest) {
    rawActions = rawActions.filter((a: any) => {
      if (a.action_type === "search" && !a.target_entity_id) {
        const target = (a.target_item_name || "").toLowerCase().trim();
        if (!target || /^(находка|предмет|вещь|что-нибудь|что-то|лут|добыча|item|loot)$/i.test(target) || /камн|палк|ветк|гриб|ягод|трав|руд|кремен/i.test(target)) {
          return false;
        }
      }
      return true;
    });
  }

  return {
    status: parsed.status,
    clarification_msg: parsed.clarification_msg ?? null,
    skill_hint: parsed.skill_hint ?? null,
    actions: rawActions.map((a: any): RouterAction => ({
      action_type: a.action_type,
      target_entity_id: a.target_entity_id ?? null,
      target_item_name: (a.target_item_name && a.target_item_name.toLowerCase().trim() === "находка") ? null : (a.target_item_name ?? null),
      item_type: a.item_type ?? null,
      used_item_id: a.used_item_id ?? null,
      consumed_materials: a.consumed_materials ?? null,
      stat_to_check: a.stat_to_check,
      ai_custom_dc: a.ai_custom_dc ?? null,
      improper_tool_usage: a.improper_tool_usage ?? null,
      dynamic_blueprint: a.dynamic_blueprint ?? null,
      raw_action_text: a.raw_action_text ?? parsed.raw_action_text ?? null,
    })),
    encounter_intent: {
      type: parsed.encounter_intent?.type || "none",
      target_name: parsed.encounter_intent?.target_name ?? null,
    },
    time_estimate_minutes: Math.max(0, Math.min(1440, Number(parsed.time_estimate_minutes) || 0)),
    atmosphere: {
      sounds: Array.isArray(parsed.atmosphere?.sounds) ? parsed.atmosphere.sounds : [],
      visuals: Array.isArray(parsed.atmosphere?.visuals) ? parsed.atmosphere.visuals : [],
    },
  };
}

// ============================================
// Главная функция Шага 1
// ============================================
export async function parsePlayerIntent(
  input: RouterInputContext | any,
  apiKey?: string,
  model: string = DEFAULT_MODEL,
  retries: number = 3
): Promise<RouterOutputPayload> {
  const resolvedApiKey = apiKey || input?.openrouter_api_key || "";
  const resolvedModel = (model && model !== DEFAULT_MODEL) ? model : (input?.satellite_model || model || DEFAULT_MODEL);
  const systemPrompt = buildRouterSystemPrompt();
  const userMessage = buildUserMessage(input);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[step1_router] Attempt ${attempt + 1}/${retries}, model: ${resolvedModel}`);

      const modelList = [
        resolvedModel,
        "google/gemma-4-31b-it:free",
        "minimax/minimax-m3:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "minimax/minimax-m2.7:free",
      ].filter(Boolean);
      const currentModel = modelList[attempt % modelList.length] || resolvedModel;

      const requestPayload: Record<string, any> = {
        model: currentModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      };

      let response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15000),
      });

      // Fallback: если модель не поддерживает response_format (HTTP 400), пробуем без него
      if (response.status === 400) {
        delete requestPayload.response_format;
        response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resolvedApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(15000),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content;

      if (!rawContent || rawContent.trim() === "") {
        throw new Error("AI Router: пустой ответ от LLM");
      }

      console.log(`[step1_router] Raw LLM response (${rawContent.length} chars) using ${currentModel}:`, rawContent.slice(0, 200));

      // Парсинг JSON
      const parsed = parseAIJson(rawContent);
      if (!parsed) {
        throw new Error("AI Router: не удалось распарсить JSON из ответа LLM");
      }

      // Защита от ложного clarification_needed:
      // Если ввод игрока — это осмысленный ролевой запрос (описание появления, осмотр, путешествие),
      // а нейросеть ошибочно вернула clarification_needed — автоматически конвертируем в success!
      if (parsed.status === "clarification_needed") {
        const rawAction = (input?.player_action_text || input?.action_text || "").trim().toLowerCase();
        const msg = (parsed.clarification_msg || "").toLowerCase();

        const isVagueBotMessage = msg.includes("too vague") || msg.includes("specify what you would like to do");
        const isDescriptiveOrArrival = rawAction.includes("опиши") ||
          rawAction.includes("появлен") ||
          rawAction.includes("осмотр") ||
          rawAction.includes("вокруг") ||
          rawAction.includes("где я") ||
          rawAction.includes("взглянуть") ||
          rawAction.includes("посмотр") ||
          rawAction.includes("прибыл") ||
          rawAction.includes("вкладываю") ||
          rawAction.includes("качаю") ||
          rawAction.includes("вкачиваю") ||
          rawAction.includes("распредели") ||
          rawAction.includes("очк");

        if (isVagueBotMessage || isDescriptiveOrArrival) {
          console.log(`[step1_router] Converting false clarification_needed to success for action: "${rawAction}"`);
          parsed.status = "success";
          parsed.clarification_msg = null;
          if (!Array.isArray(parsed.actions)) parsed.actions = [];
          if (!parsed.time_estimate_minutes) parsed.time_estimate_minutes = 15;
          if (!parsed.atmosphere) parsed.atmosphere = { sounds: ["городской гул"], visuals: ["оживлённые улицы"] };
          if (!parsed.encounter_intent) parsed.encounter_intent = { type: "none" };
        }
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
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }

  throw new Error(`AI Router: не удалось получить валидный ответ после ${retries} попыток. Последняя ошибка: ${lastError?.message}`);
}

/**
 * Эвристический парсер действий на случай сбоя API OpenRouter
 */
export function buildRouterHeuristicFallback(input: RouterInputContext): RouterOutputPayload {

  const rawText = (input?.player_action_text || (input as any)?.action_text || "").trim();
  const lower = rawText.toLowerCase();

  const actions: RouterAction[] = [];
  let skillHint: string | null = null;
  let timeEstimate = 15;

  const inv = Array.isArray(input?.inventory) ? input.inventory : Array.isArray((input as any)?.player_inventory) ? (input as any).player_inventory : [];
  const npcs = Array.isArray(input?.nearby_npcs) ? input.nearby_npcs : [];

  // 1. Выбрасывание предметов (drop) — выполняется гарантированно и без бросков кубиков
  if (/(?:выкид|выброс|броса|выкину|избавл|избавь)/i.test(lower)) {
    const qtyMatch = lower.match(/\b(\d+)\b/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    const cleanStem = (w: string) => w.replace(/(?:а|ов|ев|и|ы|у|е|ом|ам|ами|ях|ых|их|ого|его|ому|ему|ым|им|ую|ею|ей|я)$/i, "");
    const actionStems = lower.split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);

    let matchedItem = inv.find((i: any) => {
      const itemStems = (i.item_name || i.name || "").toLowerCase().split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);
      return itemStems.some((is: string) => actionStems.some((as: string) => as.includes(is) || is.includes(as)));
    });

    let targetName = matchedItem?.item_name || "предмет";
    if (!matchedItem) {
      if (lower.includes("гриб")) targetName = "Лесные грибы";
      else if (lower.includes("ветк") || lower.includes("палк")) targetName = "Сухие ветки";
    }

    actions.push({
      action_type: "drop",
      target_entity_id: null,
      target_item_name: targetName,
      used_item_id: matchedItem?.id || null,
      consumed_materials: [{ id: matchedItem?.id || "drop", quantity: qty }],
      stat_to_check: "none",
      ai_custom_dc: null,
      improper_tool_usage: null,
    });
    timeEstimate = 1;
  }
  // 2. Передача предмета другому персонажу / NPC (transfer)
  else if (/(?:переда|отда|дар|вруч)/i.test(lower)) {
    const qtyMatch = lower.match(/\b(\d+)\b/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    const cleanStem = (w: string) => w.replace(/(?:а|ов|ев|и|ы|у|е|ом|ам|ами|ях|ых|их|ого|его|ому|ему|ым|им|ую|ею|ей|я)$/i, "");
    const actionStems = lower.split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);

    let matchedItem = inv.find((i: any) => {
      const itemStems = (i.item_name || i.name || "").toLowerCase().split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);
      return itemStems.some((is: string) => actionStems.some((as: string) => as.includes(is) || is.includes(as)));
    });

    let matchedNpc = npcs.find((n: any) => {
      const npcStems = (n.name || "").toLowerCase().split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);
      return npcStems.some((ns: string) => actionStems.some((as: string) => as.includes(ns) || ns.includes(as)));
    });

    if (!matchedNpc && npcs.length === 1 && !npcs[0].is_hostile) {
      matchedNpc = npcs[0];
    }

    actions.push({
      action_type: "transfer",
      target_entity_id: matchedNpc?.id || null,
      target_item_name: matchedItem?.item_name || null,
      used_item_id: matchedItem?.id || null,
      consumed_materials: [{ id: matchedItem?.id || "transfer", quantity: qty }],
      stat_to_check: "none",
      ai_custom_dc: null,
      improper_tool_usage: null,
    });
    timeEstimate = 2;
  }
  else if (lower.includes("палк") || lower.includes("ветк")) {
    actions.push({
      action_type: "harvest_ambient",
      target_entity_id: null,
      target_item_name: "Сухие ветки",
      item_type: "material",
      used_item_id: null,
      consumed_materials: null,
      stat_to_check: "survival",
      ai_custom_dc: 10,
      improper_tool_usage: null,
    });
    skillHint = "gathering";
  } else if (lower.includes("камн") || lower.includes("руда") || lower.includes("кремень")) {
    actions.push({
      action_type: "harvest_ambient",
      target_entity_id: null,
      target_item_name: "Камни",
      item_type: "material",
      used_item_id: null,
      consumed_materials: null,
      stat_to_check: "survival",
      ai_custom_dc: 10,
      improper_tool_usage: null,
    });
    skillHint = "gathering";
  } else if (lower.includes("трав") || lower.includes("растен") || lower.includes("ягод") || lower.includes("съедобн") || lower.includes("гриб") || lower.includes("пищ") || lower.includes("еду")) {
    const isMushroom = lower.includes("гриб");
    const isBerry = lower.includes("ягод");
    let targetName = "съедобные растения";
    let itype = "herb";
    if (isMushroom) {
      targetName = "Лесные грибы";
      itype = "food";
    } else if (isBerry) {
      targetName = "Спелые лесные ягоды";
      itype = "food";
    }
    actions.push({
      action_type: "harvest_ambient",
      target_entity_id: null,
      target_item_name: targetName,
      item_type: itype,
      used_item_id: null,
      consumed_materials: null,
      stat_to_check: "survival",
      ai_custom_dc: 12,
      improper_tool_usage: null,
    });
    skillHint = "gathering";
  } else if (lower.includes("кружк") || lower.includes("чашк") || lower.includes("посуд")) {
    actions.push({
      action_type: "search",
      target_entity_id: null,
      target_item_name: "кружка",
      item_type: "misc",
      used_item_id: null,
      consumed_materials: null,
      stat_to_check: "investigation",
      ai_custom_dc: 10,
      improper_tool_usage: null,
    });
  } else if (lower.includes("ищу") || lower.includes("обыск") || lower.includes("найти") || lower.includes("поискать")) {
    actions.push({
      action_type: "search",
      target_entity_id: null,
      target_item_name: null,
      item_type: null,
      used_item_id: null,
      consumed_materials: null,
      stat_to_check: "investigation",
      ai_custom_dc: 12,
      improper_tool_usage: null,
    });
  }

  const isForest = lower.includes("лес") || lower.includes("рощ") || lower.includes("дерев");
  const sounds = isForest ? ["шелест листвы", "пение лесных птиц"] : ["шаги", "шум ветра"];
  const visuals = isForest ? ["густые ветви деревьев", "игра солнечных лучей"] : ["окружающий пейзаж", "свет"];

  return {
    status: "success",
    clarification_msg: null,
    skill_hint: skillHint as any,
    actions,
    time_estimate_minutes: timeEstimate,
    atmosphere: { sounds, visuals },
    encounter_intent: { type: "none", target_name: null },
  };
}

