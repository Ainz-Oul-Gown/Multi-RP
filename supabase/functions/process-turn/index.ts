// supabase/functions/process-turn/index.ts
// Главная Edge Function: двухшаговый конвейер хода
// Шаг 1: AI-Парсер → JSON
// Шаг 2: Математика (Supabase RPC)
// Шаг 3: AI-Рассказчик → Нарратив
// Шаг 4: Трансляция через Realtime

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";

// ============================================
// AI Parser System Prompt
// ============================================
const PARSER_SYSTEM_PROMPT = `Ты — системный анализатор действий в текстовой RPG. Твоя цель: перевести художественный текст действия игрока в строгий JSON-объект.

Доступные навыки (статы): STR, DEX, CON, INT, WIS, CHA.
Сложность (difficulty): от 5 до 25. По умолчанию 12 (средняя).

Ты НЕ решаешь, преуспел ли игрок. Ты лишь формируешь намерение и определяешь, какой бросок нужен.

Возможные intent_type:
- "skill_check" — проверка навыка (бросок кубика)
- "combat" — атака или защита в бою
- "use_item" — использование предмета из инвентаря
- "explore" — исследование, поиск
- "social" — разговор, убеждение, запугивание
- "movement" — перемещение, побег, преследование
- "free_form" — описание без механической проверки

ОБЯЗАТЕЛЬНО верни ТОЛЬКО валидный JSON без markdown-обёрток:

{
  "intent_type": "skill_check",
  "target": "описание цели (напр. 'гоблин-часовой')",
  "required_check": {
    "skill": "DEX",
    "difficulty": 15
  },
  "items_used": ["название предмета из инвентаря"],
  "damage_dealt": 0,
  "damage_received": 0,
  "description": "Краткое описание намерения игрока"
}

Если предмет не указан в items_used — оставь пустой массив.
Если действие не требует проверки — required_check может быть null.
Сложность оценивай по контексту:
- Лёгкое действие: 5-8
- Среднее: 10-15
- Сложное: 16-20
- Эпическое: 21-25`;

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

function sanitizeKey(raw: string): string {
  return (raw || "").trim().replace(/[^\x20-\x7E]/g, "");
}

function cleanTextForAI(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  text = text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "");
  text = text.replace(/\b(image|img|photo|picture|avatar|icon)[_.-]?\w*\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================
// AI API Call
// ============================================
async function callAI(systemPrompt: string, userMessage: string, apiKey: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
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
      });

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
function parseAIJson(text: string): any {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // Try extracting JSON from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }

  // Try finding JSON object in text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {}
  }

  return null;
}

// ============================================
// Main Handler
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { session_id, player_id, action_text } = await req.json();

    const safeActionText = cleanTextForAI(action_text);

    if (!session_id || !player_id || !safeActionText) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Supabase client with service_role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ============================================
    // STEP 0: Load game state
    // ============================================
    const { data: player, error: playerErr } = await supabase
      .from("players")
      .select("*, inventory(*)")
      .eq("id", player_id)
      .single();

    if (playerErr || !player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ============================================
    // STEP 0.1: Resolve user's OpenRouter API key
    // ============================================
    let openrouterApiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);

    if (player.user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key")
        .eq("id", player.user_id)
        .maybeSingle();

      if (userSettings?.openrouter_key) {
        openrouterApiKey = sanitizeKey(userSettings.openrouter_key);
      }
    }

    if (!openrouterApiKey) {
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
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load lore context
    let loreContext = "";
    if (session.world_id) {
      const { data: loreFiles } = await supabase
        .from("lore_files")
        .select("title, content")
        .eq("world_id", session.world_id)
        .limit(5);

      if (loreFiles?.length) {
        loreContext = loreFiles
          .map((f) => `### ${f.title}\n${cleanTextForAI(f.content).slice(0, 500)}`)
          .join("\n\n");
      }
    }

    // ============================================
    // STEP 0.3: Load plot storyline content
    // ============================================
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

    // ============================================
    // STEP 1: AI-Парсер → JSON
    // ============================================
    const parserUserMessage = `Игрок "${player.name}" (${player.race}, ${player.class}) пишет:
"${safeActionText}"

Инвентарь игрока: ${player.inventory?.map((i: any) => i.item_name).join(", ") || "пусто"}`;

    let rawParserResponse = await callAI(PARSER_SYSTEM_PROMPT, parserUserMessage, openrouterApiKey, 3);
    let parsedAction = parseAIJson(rawParserResponse);

    // Retry if parse failed
    if (!parsedAction) {
      for (let retry = 0; retry < 2; retry++) {
        rawParserResponse = await callAI(
          PARSER_SYSTEM_PROMPT + "\n\nВАЖНО: Ответ должен строго начинаться с { и заканчиваться }. Только JSON, без текста.",
          parserUserMessage,
          openrouterApiKey,
          1
        );
        parsedAction = parseAIJson(rawParserResponse);
        if (parsedAction) break;
      }
    }

    if (!parsedAction) {
      return new Response(JSON.stringify({
        error: "Не удалось распознать действие. Пожалуйста, перефразируйте.",
        raw: rawParserResponse,
      }), {
        status: 422,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ============================================
    // STEP 1.5: Валидация предметов (Фантомные предметы)
    // ============================================
    const inventoryChanges: string[] = [];
    const itemsToRemove: string[] = [];

    if (parsedAction.items_used?.length) {
      for (const itemName of parsedAction.items_used) {
        const ownedItem = player.inventory?.find(
          (i: any) => i.item_name.toLowerCase() === itemName.toLowerCase()
        );
        if (ownedItem) {
          itemsToRemove.push(ownedItem.item_name);
        } else {
          // Фантомный предмет — прерываем конвейер
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
      }
    }

    // ============================================
    // STEP 2: Математика (Supabase RPC)
    // ============================================
    let rollResult: any = { type: "none", roll: 0, total: 0, success: false, difficulty: 0 };

    if (parsedAction.required_check) {
      const skill = parsedAction.required_check.skill;
      const difficulty = Math.min(25, Math.max(5, parsedAction.required_check.difficulty || 12));
      const statValue = player.stats?.[skill] || 10;
      const difficultyMod = difficulty - 10;

      if (session.difficulty === "easy") {
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
    }

    // Handle damage
    let hpChange = 0;
    if (parsedAction.damage_received) {
      hpChange = -Math.abs(parsedAction.damage_received);
    }

    // ============================================
    // STEP 2.5: Применяем изменения к БД
    // ============================================

    // Apply HP change
    if (hpChange !== 0) {
      const { data: hpData } = await supabase.rpc("update_player_hp", {
        p_player_id: player_id,
        p_hp_change: hpChange,
      });

      if (hpData) {
        const hpStatus = !hpData.is_alive ? " (ПОТЕРЯ СОЗНАНИЯ!)" : "";
        inventoryChanges.push(`Здоровье${hpStatus}`);
      }
    }

    // Remove used items
    for (const itemName of itemsToRemove) {
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

    // Add loot if any
    if (parsedAction.damage_dealt && !parsedAction.required_check) {
      // Free-form combat without skill check still processes
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
    const playerFlaws = player.personality?.flaws || [];
    const narratorSystemPrompt = buildNarratorPrompt({
      sessionMode: session.current_plot_stage ? "plot" : "sandbox",
      plotStage: session.current_plot_stage,
      plotContent,
      playerName: player.name,
      playerRace: player.race,
      playerClass: player.class,
      playerFlaws,
      playerAppearance: player.appearance || "",
      actionText,
      rollResult: rollResultText,
      inventoryChanges: inventoryText,
      hpChanges: hpChange !== 0 ? `Изменение HP: ${hpChange}` : "",
      loreContext,
      sessionDifficulty: session.difficulty,
      isPvp: session.is_pvp_enabled,
      recentMessages,
    });

    const narrative = await callAI(narratorSystemPrompt, "Сгенерируй нарратив для этого действия.", openrouterApiKey, 2);

    // ============================================
    // STEP 4: Сохраняем сообщения
    // ============================================
    // Player action message
    await supabase.from("messages").insert({
      session_id,
      sender_type: "player",
      sender_id: player.user_id,
      sender_name: player.name,
      content: safeActionText,
    });

    // Master narrative message
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

    // ============================================
    // Response
    // ============================================
    return new Response(JSON.stringify({
      success: true,
      narrative,
      roll_result: rollResult,
      hp_change: hpChange,
      items_used: parsedAction.items_used || [],
      parsed_action: parsedAction,
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Process-turn error:", err);
    return new Response(JSON.stringify({
      error: err.message || "Internal server error",
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
