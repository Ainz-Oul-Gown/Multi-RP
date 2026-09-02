// supabase/functions/process-turn/index.ts
// Главная Edge Function: двухшаговый конвейер хода
// Шаг 1: AI-Парсер → JSON
// Шаг 2: Математика (Supabase RPC)
// Шаг 3: AI-Рассказчик → Нарратив
// Шаг 4: Трансляция через Realtime

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

// ============================================
// Сателит: AI Parser System Prompt Builder
// ============================================
function buildSatellitePrompt(params: {
  playerName: string;
  playerRace: string;
  playerClass: string;
  currentLocation: string | null;
  currentState: string | null;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentHour: number;
  currentMinute: number;
  recentMessages: string[];
}): string {
  const timeStr = `${params.currentDay}.${params.currentMonth}.${params.currentYear} ${params.currentHour}:${params.currentMinute.toString().padStart(2, '0')}`;
  const locationStr = params.currentLocation 
    ? `${params.currentLocation}` + (params.currentState ? `, ${params.currentState}` : '')
    : 'неизвестно';

  return `Ты — анализатор намерений в текстовой RPG (Сателит). Твоя цель: перевести действие игрока в строгий JSON.

Текущее время в мире: ${timeStr}
Текущая локация: ${locationStr}

Доступные навыки (статы): STR, DEX, CON, INT, WIS, CHA.
Сложность (difficulty): от 5 до 25. По умолчанию 12 (средняя).

Ты НЕ решаешь, преуспел ли игрок. Ты лишь формируешь намерение.

Возможные intent_type:
- "skill_check" — проверка навыка (бросок кубика)
- "combat" — атака или защита в бою
- "use_item" — использование предмета
- "explore" — исследование, поиск
- "social" — разговор, убеждение
- "movement" — перемещение, побег
- "rest" — отдых, сон, лечение
- "free_form" — описание без проверки

ОБЯЗАТЕЛЬНО верни ТОЛЬКО валидный JSON без markdown-обёрток:

{
  "intent_type": "skill_check",
  "target": "описание цели",
  "required_check": { "skill": "DEX", "difficulty": 15 },
  "items_used": ["название предмета"],
  "damage_dealt": 0,
  "damage_received": 0,
  "description": "Краткое описание намерения",
  "wants_location_change": false,
  "location_change_description": ""
}

ВАЖНО:
- wants_location_change: true если игрок явно хочет переместиться (например "иду в таверну", "отправляюсь в лес")
- location_change_description: описание куда именно (название локации или направление)
- Если действие не требует проверки — required_check может быть null
- Сложность: Лёгкое 5-8, Среднее 10-15, Сложное 16-20, Эпическое 21-25`;
}

// ============================================
// GPS: время и локация
// ============================================
function buildGpsPrompt(params: {
  playerName: string;
  actionText: string;
  intentType: string;
  intentDescription: string;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentHour: number;
  currentMinute: number;
  currentLocation: string | null;
  currentState: string | null;
  wantsLocationChange: boolean;
  locationChangeDescription: string;
  availableLocations: { name: string; type: string; state_name: string }[];
}): string {
  const timeStr = `${params.currentDay}.${params.currentMonth}.${params.currentYear} ${params.currentHour}:${params.currentMinute.toString().padStart(2, '0')}`;
  const locationStr = params.currentLocation 
    ? `${params.currentLocation}` + (params.currentState ? `, ${params.currentState}` : '')
    : 'неизвестно';

  const locationsList = params.availableLocations?.length
    ? params.availableLocations.map(l => `- ${l.name} (${l.type}, ${l.state_name})`).join('\n')
    : 'локации не найдены';

  return `Ты — система GPS в текстовой RPG. Определи сколько времени занимает действие и как изменится локация.

Текущее время: ${timeStr}
Текущая локация: ${locationStr}

Действие игрока: "${params.actionText}"
Тип намерения: ${params.intentType}
Описание: ${params.intentDescription}

${params.wantsLocationChange ? `Игрок хочет переместиться: ${params.locationChangeDescription}` : 'Игрок не меняет локацию'}

${params.wantsLocationChange ? `Доступные локации:
${locationsList}` : ''}

Верни ТОЛЬКО валидный JSON без markdown:

{
  "time_minutes": 30,
  "new_location_id": null,
  "new_location_name": null,
  "location_changed": false,
  "travel_description": ""
}

ПРАВИЛА ВРЕМЕНИ:
- Разговор/торговля: 5-15 минут
- Поиск/исследование: 15-60 минут
- Бой: 5-30 минут
- Отдых короткий (передышка): 15-30 минут
- Отдых долгий (сон): 6-10 часов (360-600 минут)
- Перемещение по городу: 10-30 минут
- Перемещение между локациями: 1-12 часов
- Обучение/тренировка: 1-4 часа

ПРАВИЛА ЛОКАЦИИ:
- Если игрок не меняет локацию: location_changed = false, new_location_id = null
- Если игрок меняет локацию: location_changed = true, new_location_id = ID из списка
- Если локация не найдена в списке: new_location_name = описание, new_location_id = null
- travel_description: краткое описание перемещения (1 предложение)`;
}

// ============================================
// AI Narrator System Prompt Builder
// ============================================
function buildNarratorPrompt(params: {
  sessionMode: string;
  plotStage: string | null;
  plotContent: string | null;
  playerName: string;
  playerRace: string;
  playerClass: string;
  playerFlaws: string[];
  playerAppearance: string;
  actionText: string;
  rollResult: any;
  inventoryChanges: string;
  hpChanges: string;
  loreContext: string;
  sessionDifficulty: string;
  isPvp: boolean;
  recentMessages: string[];
}): string {
  const modeBlock = params.plotStage
    ? `[Режим сессии: Сюжет. Текущий Акт: ${params.plotStage}]`
    : `[Режим сессии: Песочница (свободная игра)]`;

  const difficultyHint = params.sessionDifficulty === 'easy'
    ? 'Герою сопутствует удача. Описывай удачные стечения обстоятельств.'
    : params.sessionDifficulty === 'hard'
    ? 'Мир суров и безжалостен. Подчёркивай трудности и риски.'
    : '';

  const plotBlock = params.plotContent
    ? `\nТЕКУЩИЙ АКТ СЮЖЕТА:\n${params.plotContent}\nПлавно направляй игроков к этой цели. Не раскрывай сюжетные твисты заранее — подводи к ним через атмосферу и детали.\n`
    : '';

  return `Ты — Мастер (Гейммастер) в текстовой RPG. Твоя роль — рассказчик, писатель, режиссёр.
Ты генерируешь КИНЕМАТОГРАФИЧЕСКИЙ НАРРАТИВ от третьего лица.

АБСОЛЮТНЫЕ ЗАПРЕТЫ (нарушение = критическая ошибка):
- НИКОГДА не упоминай цифры, числа, характеристики (STR, DEX, CON, INT, WIS, CHA).
- НИКОГДА не упоминай кубики, броски,骰子, d20, проверки.
- НИКОГДА не упоминай очки здоровья (HP), урон числом, модификаторы.
- НИКОГДА не используй слова: "проверка", "бросок", "успех", "провал" в системном смысле.
- ВСЁ описывай исключительно через действия, ощущения и последствия в мире игры.

ПРАВИЛА:
1. Описывай события ярко, с деталями, эмоциями и атмосферой.
2. Результат описывай через последствия: если действие удалось — герой преодолевает препятствие; если нет — спотыкается, роняет, получает ушиб.
3. Учитывай черты характера (flaws) персонажа — делай это частью нарратива.
4. Используй лор мира для обогащения описаний.
5. Не повторяй текст действия игрока — перескажи результат.
6. НЕ используй markdown-разметку, таблицы или JSON.
7. Длина ответа: 2-5 абзацев.
8. Добавляй атмосферные звуки и запахи.
9. Заканчивай каждый ответ зацепкой или вопросом игроку.

${modeBlock}
${difficultyHint}
${plotBlock}

Игрок: ${params.playerName} (${params.playerRace}, ${params.playerClass})
${params.playerFlaws.length ? `Слабости персонажа: ${params.playerFlaws.join(', ')}` : ''}
${params.playerAppearance ? `Внешность: ${params.playerAppearance}` : ''}

Заявка игрока: "${params.actionText}"

Системный результат (строгие факты от кода):
${params.rollResult}
${params.inventoryChanges}
${params.hpChanges}

${params.loreContext ? `Лор мира:\n${params.loreContext}` : ''}

${params.recentMessages.length ? `Предыдущие события:\n${params.recentMessages.join('\n')}` : ''}

ВАЖНО: Опиши результат действия от лица Мастера. Сделай это живым языком. Никаких цифр и игровой терминологии.`;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================
// AI API Call
// ============================================
async function callAI(systemPrompt: string, userMessage: string, apiKey: string, retries = 3, model?: string): Promise<string> {
  const useModel = model || AI_MODEL;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      console.log(`process-turn OpenRouter status: ${response.status}, model: ${useModel}, attempt: ${attempt + 1}`);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`AI API error (attempt ${attempt + 1}):`, errText);
        if (attempt === retries - 1) throw new Error(`AI API error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      console.error(`AI call attempt ${attempt + 1} failed:`, err);
      if (attempt === retries - 1) throw err;
      // Wait before retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("AI call failed after all retries");
}

// ============================================
// Parse AI JSON response safely
// ============================================

// ============================================
// Main Handler
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[${requestId}] ═══════════════════════════════════════════════`);
  console.log(`[${requestId}] 🎮 PROCESS-TURN START`);
  console.log(`[${requestId}] ═══════════════════════════════════════════════`);

  try {
    const { session_id, player_id, action_text } = await req.json();
    const safeActionText = cleanTextForAI(action_text);

    console.log(`[${requestId}] 📥 INPUT:`);
    console.log(`[${requestId}]    • session_id: ${session_id}`);
    console.log(`[${requestId}]    • player_id: ${player_id}`);
    console.log(`[${requestId}]    • action_text: "${safeActionText.slice(0, 80)}${safeActionText.length > 80 ? '...' : ''}"`);

    const imagePattern = /\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi;
    if (imagePattern.test(safeActionText)) {
      console.warn(`[${requestId}] ⚠️ Image links detected - rejecting`);
      return new Response(JSON.stringify({ error: "Обнаружены ссылки на изображения. Удалите их и попробуйте снова." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!session_id || !player_id || !safeActionText) {
      console.error(`[${requestId}] ❌ Missing required fields`);
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ============================================
    // STEP 0: Load game state
    // ============================================
    console.log(`\n[${requestId}] 📊 STEP 0: Loading game state...`);

    const { data: player, error: playerErr } = await supabase
      .from("players")
      .select("*, inventory(*)")
      .eq("id", player_id)
      .single();

    if (playerErr || !player) {
      console.error(`[${requestId}] ❌ Player not found: ${playerErr?.message || 'unknown'}`);
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log(`[${requestId}] 👤 Player loaded: ${player.name} (${player.race}, ${player.class})`);
    console.log(`[${requestId}]    • HP: ${player.hp}/${player.max_hp}`);
    console.log(`[${requestId}]    • Stats: STR=${player.stats?.STR} DEX=${player.stats?.DEX} CON=${player.stats?.CON}`);
    console.log(`[${requestId}]    • Inventory: ${player.inventory?.length || 0} items`);

    // ============================================
    // STEP 0.1: Resolve user's OpenRouter API key and models
    // ============================================
    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    let satelliteModel = AI_MODEL;
    let gpsModel = AI_MODEL;
    let dmModel = AI_MODEL;
    console.log(`\n[${requestId}] 🔑 API Key resolution:`);
    console.log(`[${requestId}]    • Fallback key available: ${openrouterApiKey ? 'YES' : 'NO'}`);

    if (player.user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key, satellite_model, gps_model, dm_model")
        .eq("id", player.user_id)
        .maybeSingle();

      if (userSettings?.openrouter_key) {
        openrouterApiKey = sanitizeKey(userSettings.openrouter_key);
        console.log(`[${requestId}]    • Using user's key from settings ✓`);
      } else {
        console.log(`[${requestId}]    • No user key found, using fallback`);
      }

      if (userSettings?.satellite_model) {
        satelliteModel = userSettings.satellite_model;
        console.log(`[${requestId}]    • Satellite model: ${satelliteModel}`);
      }
      if (userSettings?.gps_model) {
        gpsModel = userSettings.gps_model;
        console.log(`[${requestId}]    • GPS model: ${gpsModel}`);
      }
      if (userSettings?.dm_model) {
        dmModel = userSettings.dm_model;
        console.log(`[${requestId}]    • DM model: ${dmModel}`);
      }
    }

    if (!openrouterApiKey) {
      console.error(`[${requestId}] ❌ No API key available`);
      return new Response(JSON.stringify({
        error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
        code: "MISSING_API_KEY",
      }), {
        status: 402,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("*, worlds(settings)")
      .eq("id", session_id)
      .single();

    if (!session) {
      console.error(`[${requestId}] ❌ Session not found`);
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log(`[${requestId}] 🎮 Session loaded:`);
    console.log(`[${requestId}]    • World ID: ${session.world_id}`);
    console.log(`[${requestId}]    • Difficulty: ${session.difficulty}`);
    console.log(`[${requestId}]    • Plot stage: ${session.current_plot_stage || 'sandbox'}`);
    console.log(`[${requestId}]    • Game time: ${session.game_day}.${session.game_month}.${session.game_year} ${session.game_hour}:${session.game_minute.toString().padStart(2, '0')}`);

    // Load current location info
    let currentLocationName: string | null = null;
    let currentStateName: string | null = null;
    if (session.current_location_id) {
      const { data: locData } = await supabase
        .from("locations")
        .select("name, states(name)")
        .eq("id", session.current_location_id)
        .maybeSingle();
      if (locData) {
        currentLocationName = locData.name;
        currentStateName = locData.states?.name || null;
        console.log(`[${requestId}]    • Current location: ${currentLocationName}, ${currentStateName}`);
      }
    }

    // Load available locations for GPS (if location changed or not set)
    let availableLocations: { id: string; name: string; type: string; state_name: string }[] = [];
    if (session.world_id) {
      const { data: locsData } = await supabase
        .from("locations")
        .select("id, name, type, states(name)")
        .eq("world_id", session.world_id)
        .order("name");
      availableLocations = (locsData || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        state_name: l.states?.name || '',
      }));
    }

    // Load lore context
    let loreContext = "";
    console.log(`\n[${requestId}] 📚 Loading lore context...`);
    if (session.world_id) {
      const { data: loreFiles } = await supabase
        .from("lore_files")
        .select("title, content")
        .eq("world_id", session.world_id)
        .limit(5);

      if (loreFiles?.length) {
        console.log(`[${requestId}] 📚 Loaded ${loreFiles.length} lore files`);
        loreContext = loreFiles
          .map((f) => `### ${f.title}\n${cleanTextForAI(f.content).slice(0, 500)}`)
          .join("\n\n");
      } else {
        console.log(`[${requestId}] 📚 No lore files found`);
      }
    }

    // ============================================
    // STEP 0.2: Load NPC and Beliefs
    // ============================================
    console.log(`\n[${requestId}] 🐉 STEP 0.2: Loading NPCs and beliefs...`);
    let worldNpcs: any[] = [];
    if (session.world_id) {
      const { data: npcs } = await supabase
        .from("npcs")
        .select("id, name")
        .eq("world_id", session.world_id);
      worldNpcs = npcs || [];
      console.log(`[${requestId}] 🐉 Found ${worldNpcs.length} NPCs in world`);
      if (worldNpcs.length > 0) {
        console.log(`[${requestId}]    • NPC names: ${worldNpcs.map(n => n.name).join(', ')}`);
      }

      // Load beliefs about this player
      const { data: beliefs } = await supabase
        .from("npc_memories")
        .select("memory_text")
        .eq("player_id", player.id)
        .eq("memory_type", "belief");

      if (beliefs && beliefs.length > 0) {
        console.log(`[${requestId}] 💭 Found ${beliefs.length} beliefs about player`);
        const beliefsText = beliefs
          .map((b, i) => `${i + 1}. ${cleanTextForAI(b.memory_text).slice(0, 200)}`)
          .join("\n");
        loreContext += `\n\nУбеждения NPC о вас:\n${beliefsText}`;
      } else {
        console.log(`[${requestId}] 💭 No beliefs found`);
      }
    }

    // ============================================
    // STEP 0.3: Load plot storyline content
    // ============================================
    console.log(`\n[${requestId}] 📖 Loading plot content...`);
    let plotContent: string | null = null;
    if (session.current_plot_stage && session.world_id) {
      const { data: plotFile } = await supabase
        .from("lore_files")
        .select("content")
        .eq("world_id", session.world_id)
        .eq("title", session.current_plot_stage)
        .maybeSingle();

      if (plotFile?.content) {
        plotContent = cleanTextForAI(plotFile.content);
        console.log(`[${requestId}] 📖 Plot content loaded (${plotContent.length} chars)`);
      } else {
        console.log(`[${requestId}] 📖 No plot content for stage: ${session.current_plot_stage}`);
      }
    }

    // Load recent messages for context
    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("content, sender_type")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const recentMessages = (recentMsgs || [])
      .reverse()
      .map((m) => `[${m.sender_type === "master" ? "Мастер" : "Игрок"}]: ${cleanTextForAI(m.content).slice(0, 200)}`);

    console.log(`[${requestId}] 💬 Loaded ${recentMessages.length} recent messages`);

    // ============================================
    // STEP 1: Сателит — AI-Парсер → JSON
    // ============================================
    console.log(`\n[${requestId}] 🤖 STEP 1: Calling Сателит (intent parser)...`);
    const satelliteSystemPrompt = buildSatellitePrompt({
      playerName: cleanTextForAI(player.name),
      playerRace: cleanTextForAI(player.race),
      playerClass: cleanTextForAI(player.class),
      currentLocation: currentLocationName,
      currentState: currentStateName,
      currentYear: session.game_year || 1,
      currentMonth: session.game_month || 1,
      currentDay: session.game_day || 1,
      currentHour: session.game_hour || 8,
      currentMinute: session.game_minute || 0,
      recentMessages,
    });

    const parserUserMessage = `Игрок "${cleanTextForAI(player.name)}" (${cleanTextForAI(player.race)}, ${cleanTextForAI(player.class)}) пишет:
"${safeActionText}"

Инвентарь игрока: ${player.inventory?.map((i: any) => i.item_name).join(", ") || "пусто"}`;

    let rawParserResponse = await callAI(satelliteSystemPrompt, parserUserMessage, openrouterApiKey, 3, satelliteModel);
    console.log(`[${requestId}] 🤖 Parser response: ${rawParserResponse.slice(0, 150)}...`);

    let parsedAction = parseAIJson(rawParserResponse);

    // Retry if parse failed
    if (!parsedAction) {
      console.warn(`[${requestId}] ⚠️ Failed to parse, retrying...`);
      for (let retry = 0; retry < 2; retry++) {
        rawParserResponse = await callAI(
          satelliteSystemPrompt + "\n\nВАЖНО: Ответ должен строго начинаться с { и заканчиваться }. Только JSON, без текста.",
          parserUserMessage,
          openrouterApiKey,
          1,
          satelliteModel
        );
        parsedAction = parseAIJson(rawParserResponse);
        if (parsedAction) break;
      }
    }

    if (!parsedAction) {
      console.error(`[${requestId}] ❌ Failed to parse action after retries`);
      return new Response(JSON.stringify({
        error: "Не удалось распознать действие. Пожалуйста, перефразируйте.",
        raw: rawParserResponse,
      }), {
        status: 422,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log(`[${requestId}] ✅ Parsed action:`);
    console.log(`[${requestId}]    • intent_type: ${parsedAction.intent_type}`);
    console.log(`[${requestId}]    • target: ${parsedAction.target}`);
    console.log(`[${requestId}]    • items_used: ${parsedAction.items_used?.join(', ') || 'none'}`);
    console.log(`[${requestId}]    • wants_location_change: ${parsedAction.wants_location_change}`);

    // ============================================
    // STEP 1.6: GPS — Определение времени и локации
    // ============================================
    console.log(`\n[${requestId}] 📍 STEP 1.6: Calling GPS (time & location)...`);
    
    let gpsResult = {
      time_minutes: 0,
      new_location_id: null as string | null,
      new_location_name: null as string | null,
      location_changed: false,
      travel_description: '',
    };

    // Only call GPS if we have a valid action
    if (parsedAction && !parsedAction.is_phantom_item) {
      const gpsSystemPrompt = buildGpsPrompt({
        playerName: cleanTextForAI(player.name),
        actionText: safeActionText,
        intentType: parsedAction.intent_type,
        intentDescription: parsedAction.description || '',
        currentYear: session.game_year || 1,
        currentMonth: session.game_month || 1,
        currentDay: session.game_day || 1,
        currentHour: session.game_hour || 8,
        currentMinute: session.game_minute || 0,
        currentLocation: currentLocationName,
        currentState: currentStateName,
        wantsLocationChange: parsedAction.wants_location_change === true,
        locationChangeDescription: parsedAction.location_change_description || '',
        availableLocations: parsedAction.wants_location_change ? availableLocations : [],
      });

      try {
        const gpsResponse = await callAI(gpsSystemPrompt, 'Определи время и локацию.', openrouterApiKey, 2, gpsModel);
        const gpsParsed = parseAIJson(gpsResponse);
        if (gpsParsed) {
          gpsResult = {
            time_minutes: Math.max(0, Math.min(1440, Number(gpsParsed.time_minutes) || 0)),
            new_location_id: gpsParsed.new_location_id || null,
            new_location_name: gpsParsed.new_location_name || null,
            location_changed: gpsParsed.location_changed === true,
            travel_description: gpsParsed.travel_description || '',
          };
          console.log(`[${requestId}] 📍 GPS result: +${gpsResult.time_minutes}min, location_changed: ${gpsResult.location_changed}`);
        }
      } catch (gpsErr) {
        console.warn(`[${requestId}] ⚠️ GPS call failed, using defaults:`, gpsErr);
      }
    }

    // Update game time
    if (gpsResult.time_minutes > 0) {
      let totalMinutes = (session.game_hour || 0) * 60 + (session.game_minute || 0) + gpsResult.time_minutes;
      let newDay = session.game_day || 1;
      let newMonth = session.game_month || 1;
      let newYear = session.game_year || 1;

      // Advance time
      const minutesInDay = 24 * 60;
      while (totalMinutes >= minutesInDay) {
        totalMinutes -= minutesInDay;
        newDay++;
        if (newDay > 30) {
          newDay = 1;
          newMonth++;
          if (newMonth > 12) {
            newMonth = 1;
            newYear++;
          }
        }
      }
      const newHour = Math.floor(totalMinutes / 60);
      const newMinute = totalMinutes % 60;

      // Update session time
      await supabase.from('sessions').update({
        game_year: newYear,
        game_month: newMonth,
        game_day: newDay,
        game_hour: newHour,
        game_minute: newMinute,
      }).eq('id', session_id);

      console.log(`[${requestId}] 🕐 Time updated: ${newDay}.${newMonth}.${newYear} ${newHour}:${newMinute.toString().padStart(2, '0')}`);
    }

    // Update location if changed
    if (gpsResult.location_changed && gpsResult.new_location_id) {
      await supabase.from('sessions').update({
        current_location_id: gpsResult.new_location_id,
        current_state_id: gpsResult.new_location_id ? (
          availableLocations.find(l => l.id === gpsResult.new_location_id)?.state_name ? 
          (await supabase.from('locations').select('state_id').eq('id', gpsResult.new_location_id).single())?.data?.state_id : null
        ) : null,
      }).eq('id', session_id);
      console.log(`[${requestId}] 📍 Location updated to: ${gpsResult.new_location_name || gpsResult.new_location_id}`);
    }

    // ============================================
    // STEP 1.5: Валидация предметов (Фантомные предметы)
    // ============================================
    console.log(`\n[${requestId}] 🎒 STEP 1.5: Validating items...`);
    const inventoryChanges: string[] = [];
    const itemsToRemove: string[] = [];

    if (parsedAction.items_used?.length) {
      console.log(`[${requestId}] 🎒 Items to use: ${parsedAction.items_used.join(', ')}`);
      const safeStats = player.stats || {};
      const safeInventory = player.inventory || [];
      for (const itemName of parsedAction.items_used) {
        const ownedItem = safeInventory.find(
          (i: any) => i.item_name.toLowerCase() === itemName.toLowerCase()
        );
        if (!ownedItem) {
          console.warn(`[${requestId}] 👻 Phantom item detected: ${itemName}`);
          return new Response(JSON.stringify({
            success: true,
            narrative: `Ты потянулся за «${itemName}», но нащупал лишь пустой карман. У тебя нет этого предмета.`,
            roll_result: null,
            is_phantom_item: true,
          }), {
            status: 200,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        console.log(`[${requestId}] 🎒 Checking durability for: ${ownedItem.item_name}`);
        try {
          const durabilityResponse = await fetch(`${SUPABASE_URL}/functions/v1/assess-durability`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: player.user_id,
              item_id: ownedItem.id,
              item_name: ownedItem.item_name,
              item_type: ownedItem.type,
              item_condition: ownedItem.condition,
              item_durability: ownedItem.durability,
              action_description: safeActionText,
              use_context: `Игрок использует ${ownedItem.item_name}`,
            }),
          });

          if (durabilityResponse.ok) {
            const durabilityResult = await durabilityResponse.json();
            console.log(`[${requestId}] 🎒 Durability result:`, durabilityResult);

            if (durabilityResult.is_destroyed || durabilityResult.is_lost) {
              itemsToRemove.push(ownedItem.item_name);
              console.log(`[${requestId}] 🎒 Item ${ownedItem.item_name} will be removed (destroyed/lost)`);
            }
          }
        } catch (durabilityErr) {
          console.error(`[${requestId}] ❌ assess-durability call failed:`, durabilityErr);
        }
      }
    }

    // ============================================
    // STEP 2: Математика (Supabase RPC)
    // ============================================
    console.log(`\n[${requestId}] 🎲 STEP 2: Rolling dice...`);
    let rollResult: any = { type: "none", roll: 0, total: 0, success: false, difficulty: 0 };

    if (parsedAction.required_check) {
      const skill = parsedAction.required_check.skill;
      const difficulty = Math.min(25, Math.max(5, parsedAction.required_check.difficulty || 12));
      const statValue = player.stats?.[skill] || 10;
      const difficultyMod = difficulty - 10;

      console.log(`[${requestId}] 🎲 Check: ${skill} vs DC ${difficulty}, stat=${statValue}, mod=${difficultyMod}`);

      if (session.difficulty === "easy") {
        console.log(`[${requestId}] 🎲 Roll type: ADVANTAGE`);
        const { data: rollData } = await supabase.rpc("roll_d20_advantage", {
          stat_value: statValue,
        });
        if (rollData) {
          rollResult = {
            type: "advantage",
            rolls: rollData.rolls,
            result: rollData.best_roll,
            total: rollData.total + difficultyMod,
            success: (rollData.total + difficultyMod) >= difficulty,
            skill,
            difficulty,
            statValue,
          };
        }
      } else if (session.difficulty === "hard") {
        console.log(`[${requestId}] 🎲 Roll type: DISADVANTAGE`);
        const { data: rollData } = await supabase.rpc("roll_d20_disadvantage", {
          stat_value: statValue,
        });
        if (rollData) {
          rollResult = {
            type: "disadvantage",
            rolls: rollData.rolls,
            result: rollData.worst_roll,
            total: rollData.total + difficultyMod,
            success: (rollData.total + difficultyMod) >= difficulty,
            skill,
            difficulty,
            statValue,
          };
        }
      } else {
        console.log(`[${requestId}] 🎲 Roll type: NORMAL`);
        const { data: rollData } = await supabase.rpc("roll_d20", {
          stat_value: statValue,
          difficulty_mod: difficultyMod,
        });
        if (rollData) {
          rollResult = {
            type: "normal",
            roll: rollData.roll,
            total: rollData.total,
            success: rollData.success,
            skill,
            difficulty,
            statValue,
          };
        }
      }
      console.log(`[${requestId}] 🎲 Result: ${rollResult.type}, total=${rollResult.total}, success=${rollResult.success}`);
    } else {
      console.log(`[${requestId}] 🎲 No skill check required`);
    }

    // Handle damage
    let hpChange = 0;
    if (parsedAction.damage_received) {
      hpChange = -Math.abs(parsedAction.damage_received);
      console.log(`[${requestId}] 💔 Damage received: ${hpChange}`);
    }

    // ============================================
    // STEP 2.5: Применяем изменения к БД
    // ============================================
    console.log(`\n[${requestId}] 💾 STEP 2.5: Applying changes to DB...`);

    // Apply HP change
    if (hpChange !== 0) {
      console.log(`[${requestId}] 💾 Updating HP: ${hpChange}`);
      const { data: hpData } = await supabase.rpc("update_player_hp", {
        p_player_id: player_id,
        p_hp_change: hpChange,
      });

      if (hpData) {
        const hpStatus = !hpData.is_alive ? " (ПОТЕРЯ СОЗНАНИЯ!)" : "";
        console.log(`[${requestId}] 💾 New HP: ${hpData.new_hp}/${hpData.new_max_hp}${hpStatus}`);
        inventoryChanges.push(`Здоровье${hpStatus}`);
      }
    }

    // Remove used items
    for (const itemName of itemsToRemove) {
      console.log(`[${requestId}] 💾 Removing item: ${itemName}`);
      const { data: removed } = await supabase.rpc("remove_item_from_inventory", {
        p_player_id: player_id,
        p_item_name: itemName,
        p_quantity: 1,
      });
      if (removed === false) {
        inventoryChanges.push(`Предмет «${itemName}» не найден в инвентаре`);
      } else {
        inventoryChanges.push(`Предмет «${itemName}» использован`);
      }
    }

    // Format results for narrator (без цифр — только суть)
    const rollResultText = rollResult.type !== "none"
      ? `Системный результат: Попытка действия ${rollResult.success ? "УСПЕШНА" : "ПРОВАЛЕНА"}.`
      : "Нет проверки навыка.";

    const inventoryText = inventoryChanges.length
      ? inventoryChanges.map((c) => `- ${c}`).join("\n")
      : "- Инвентарь не изменён.";

    // ============================================
    // STEP 3: AI-Рассказчик → Нарратив
    // ============================================
    console.log(`\n[${requestId}] 📖 STEP 3: Generating narrative...`);
    const playerFlaws = player.personality?.flaws || [];
    const narratorSystemPrompt = buildNarratorPrompt({
      sessionMode: session.current_plot_stage ? "plot" : "sandbox",
      plotStage: session.current_plot_stage,
      plotContent,
      playerName: cleanTextForAI(player.name),
      playerRace: cleanTextForAI(player.race),
      playerClass: cleanTextForAI(player.class),
      playerFlaws,
      playerAppearance: cleanTextForAI(player.appearance) || "",
      actionText: safeActionText,
      rollResult: rollResultText,
      inventoryChanges: inventoryText,
      hpChanges: hpChange !== 0 ? `Изменение HP: ${hpChange}` : "",
      loreContext,
      sessionDifficulty: session.difficulty,
      isPvp: session.is_pvp_enabled,
      recentMessages,
    });

    const narrative = await callAI(narratorSystemPrompt, "Сгенерируй нарратив для этого действия.", openrouterApiKey, 2, dmModel);
    console.log(`[${requestId}] 📖 Narrative generated (${narrative.length} chars)`);
    console.log(`[${requestId}]    • Preview: "${narrative.slice(0, 100)}..."`);

    // ============================================
    // STEP 3.5: Автоматическое определение отдыха через ИИ
    // ============================================
    let restResult = null;
    const restKeywords = ['отдых', 'спать', 'сон', 'лагерь', 'camp', 'rest', 'sleep', 'лечение', 'heal', 'meditate', 'медитация'];
    const actionTextLower = safeActionText.toLowerCase();
    const isRestAction = restKeywords.some(keyword => actionTextLower.includes(keyword));

    if (isRestAction) {
      console.log(`\n[${requestId}] 🛏️ STEP 3.5: Rest action detected, calling process-rest...`);
      try {
        const restResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-rest`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: player.user_id,
            player_id: player.id,
            session_id,
            action_text: safeActionText,
            player_stats: player.stats || {},
            player_hp: player.hp,
            player_max_hp: player.max_hp,
            current_injuries: player.injuries || [],
          }),
        });

        if (restResponse.ok) {
          restResult = await restResponse.json();
          console.log(`[${requestId}] 🛏️ Rest result:`, restResult);

          if (restResult.new_hp !== undefined) {
            await supabase.from("players").update({ hp: restResult.new_hp }).eq("id", player.id);
            console.log(`[${requestId}] 🛏️ HP updated to: ${restResult.new_hp}`);
          }
        }
      } catch (restErr) {
        console.error(`[${requestId}] ❌ process-rest call failed:`, restErr);
      }
    }

    // ============================================
    // STEP 4: Сохраняем сообщения
    // ============================================
    console.log(`\n[${requestId}] 💬 STEP 4: Saving messages to DB...`);
    await supabase.from("messages").insert({
      session_id,
      sender_type: "player",
      sender_id: player.user_id,
      sender_name: player.name,
      content: safeActionText,
    });
    console.log(`[${requestId}] 💬 Player action saved`);

    await supabase.from("messages").insert({
      session_id,
      sender_type: "master",
      sender_name: "Мастер",
      content: narrative,
      metadata: {
        roll: rollResult,
        hp_change: hpChange,
        items_used: parsedAction.items_used || [],
      },
    });
    console.log(`[${requestId}] 💬 Master narrative saved`);

    // ============================================
    // STEP 4.5: Save NPC memories (async, no await)
    // ============================================
    console.log(`\n[${requestId}] 🧠 STEP 4.5: Checking NPC memory triggers...`);
    let memoryTriggers = 0;
    if (worldNpcs.length > 0) {
      for (const npc of worldNpcs) {
        const npcNameLower = npc.name?.toLowerCase() || "";
        const narrativeLower = narrative.toLowerCase();
        const actionLower = safeActionText.toLowerCase();

        if (npcNameLower && (narrativeLower.includes(npcNameLower) || actionLower.includes(npcNameLower))) {
          memoryTriggers++;
          console.log(`[${requestId}] 🧠 Triggered memory for NPC: ${npc.name}`);
          fetch(`${SUPABASE_URL}/functions/v1/npc-memory-engine`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              npc_id: npc.id,
              player_id: player.id,
              memory_text: narrative,
            }),
          }).catch((err) => {
            console.error(`[${requestId}] ❌ Failed to save memory for NPC ${npc.id}:`, err);
          });
        }
      }
    }
    console.log(`[${requestId}] 🧠 NPC memory triggers: ${memoryTriggers}`);

    // ============================================
    // Response
    // ============================================
    console.log(`\n[${requestId}] ✅ PROCESS-TURN COMPLETE`);
    console.log(`[${requestId}]    • Narrative length: ${narrative.length} chars`);
    console.log(`[${requestId}]    • HP change: ${hpChange}`);
    console.log(`[${requestId}]    • Items used: ${parsedAction.items_used?.length || 0}`);
    console.log(`[${requestId}]    • NPC memories triggered: ${memoryTriggers}`);
    console.log(`[${requestId}] ═══════════════════════════════════════════════\n`);

    return new Response(JSON.stringify({
      success: true,
      narrative: restResult?.narrative ? `${narrative}\n\n${restResult.narrative}` : narrative,
      roll_result: rollResult,
      hp_change: hpChange + (restResult?.hp_recovery || 0),
      items_used: parsedAction.items_used || [],
      parsed_action: parsedAction,
      rest_result: restResult,
      // GPS results
      time_minutes: gpsResult.time_minutes,
      location_changed: gpsResult.location_changed,
      travel_description: gpsResult.travel_description,
      new_location: gpsResult.new_location_name || (gpsResult.new_location_id ? availableLocations.find(l => l.id === gpsResult.new_location_id)?.name : null),
      // Current game time after update
      game_time: {
        year: session.game_year,
        month: session.game_month,
        day: session.game_day,
        hour: session.game_hour,
        minute: session.game_minute,
      },
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`\n[${requestId}] ❌ PROCESS-TURN ERROR:`);
    console.error(`[${requestId}]    • ${err.message || "Internal server error"}`);
    console.error(`[${requestId}] ═══════════════════════════════════════════════\n`);
    return new Response(JSON.stringify({
      error: err.message || "Internal server error",
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
