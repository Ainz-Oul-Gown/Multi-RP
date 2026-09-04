// supabase/functions/process-turn/steps/step5_narrator.ts
// Шаг 5: AI-Рассказчик (Dungeon Master)
//
// Главный запрет: Категорически запрещено придумывать новый урон, предметы,
// смертельные исходы или события, которых нет в объекте player_truths[id].knowledge.

import { SystemTruthDto } from "./step4_system_truth.ts";

export interface NarratorOutputPayload {
  players: Record<string, string>; // player_id -> индивидуальный художественный текст
  global_narrative: string;        // Общий лог комнаты
}

export interface NarratorInputContext {
  system_truth: SystemTruthDto;
  action_text: string;
  player_name: string;
  player_race: string;
  player_class: string;
  lore_context: string;
  openrouter_api_key: string;
  dm_model: string;
}

// ============================================
// Промпт для LLM
// ============================================
function buildNarratorSystemPrompt(
  playerName: string, 
  playerRace: string, 
  playerClass: string, 
  loreContext: string,
  storyline?: any
): string {
  let storylineSection = "";
  if (storyline && storyline.current_arc) {
    const arc = storyline.current_arc;
    const remainingGoals = (arc.goals || []).filter((g: string) => !(arc.completed_goals || []).includes(g));
    storylineSection = `
СЮЖЕТНАЯ ЛИНИЯ («ЛЫЖИ, НО НЕ ПРАВИЛО»):
Кампания: "${storyline.title || 'Сюжетная линия'}"
Текущая арка (Акт ${arc.act || 1}): "${arc.title || ''}"
Описание арки: ${arc.description || ''}
Оставшиеся цели арки:
${remainingGoals.length > 0 ? remainingGoals.map((g: string) => ` - [ ] ${g}`).join("\n") : "Все основные цели текущей арки достигнуты!"}
${arc.key_npcs && arc.key_npcs.length > 0 ? `Ключевые персонажи арки: ${arc.key_npcs.join(", ")}` : ""}
${arc.key_locations && arc.key_locations.length > 0 ? `Ключевые локации арки: ${arc.key_locations.join(", ")}` : ""}

ПРИНЦИП «ЛЫЖИ, НО НЕ ПРАВИЛО»:
- Сюжет служит мягким ориентиром («лыжи»), направляющим мир, но НЕ железнодорожными рельсами, сковывающими свободу воли игрока.
- Если игрок целенаправленно идёт по сюжету или выполняет цели арки — развивай интригу, вплетай ключевых NPC, выдавай подсказки.
- Если игрок занят песочницей (сбор трав/грибов/веток, крафт, торговля, блуждание по лесу, отдых в таверне) — ПОЛНОСТЬЮ ПОДДЕРЖИ ЕГО СВОБОДУ! Не заставляй его бросать свои дела ради сюжета. Сюжет может лишь мягко отражаться в фоновой атмосфере (отдалённый слух, тревожный взгляд прохожего), не отвлекая игрока от его личных планов.
`;
  }

  return `Ты — Dungeon Master в текстовой многопользовательской ЛитРПГ.
Твоя задача — превратить сухой SystemTruthDto в захватывающий литературный текст для КАЖДОГО игрока индивидуально.

ПРАВИЛА:
1. Опирайся СТРОГО на массив knowledge для каждого игрока в player_truths.
2. КРИТИЧЕСКИЙ ЗАПРЕТ: НИКАКОГО выдуманного лута, урона, смертей или изменений ХП, кроме явно указанных в knowledge и hp_status!
3. СТРОЖАЙШИЙ ЗАПРЕТ НА МЕТА-КОММЕНТАРИИ И КУБИКИ:
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО обсуждать в тексте кубики, числа d20, модификаторы и формулы ("Бросок d20 с вашим бонусом в 2 дает 22...", "Ваш d20 показал..."). Ты — литературный рассказчик, а не калькулятор! Описывай только физические действия персонажа, его мастерство, удачу и живой мир вокруг.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО упоминать неизменное здоровье ("Ваше текущее здоровье остается неизменным на уровне 27 очков", "Вы не потеряли ХП"). Если урон или лечение не произошли — здоровье ВООБЩЕ не упоминается в тексте!
4. СИСТЕМНЫЕ ТЕГИ ЛИТ-РПГ:
   - Вставляй короткие теги в скобках [Навык: Успех], [Получен предмет: ...], [Выброшен предмет: ...], [Урон: N] ИСКЛЮЧИТЕЛЬНО на основе фактов из knowledge.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать проверки, которых не было (например, НИКОГДА не вставляй [Скрытность: Успех], если игрок не совершал проверку скрытности в knowledge!).
5. ЖИВЫЕ NPC В ЛОКАЦИИ (present_npcs):
   - Если в SystemTruthDto передан массив present_npcs (NPC, находящиеся в данной локации), и игрок осматривается вокруг, гуляет, ищет кого-то, прибыл на место или просто находится в городе/поселении — ОБЯЗАТЕЛЬНО упомяни и опиши присутствующих NPC (их внешность, занятие, реакцию на героя), чтобы мир не казался вымершим!
   - КРИТИЧЕСКИ ВАЖНО: НИКОГДА не перемещай NPC в локации, где их нет! Если игрок в лесу, горах, пещере или дикой зоне — в тексте могут быть ТОЛЬКО его спутники из отряда либо дикие обитатели/враги. Городские жители, торговцы и ремесленники остаются в городе и не появляются в глухом лесу!
6. Используй atmosphere (звуки, визуальные образы) и погоду для создания глубокого погружения.
7. Используй npc_context: характер NPC, шкалу отношений (-100..+100), статус-теги и прошлые воспоминания. При общении NPC должен говорить и действовать в соответствии со своим характером.
8. Стиль: Тёмное фэнтези / ЛитРПГ. Лаконично (1–3 ёмких абзаца на игрока).
9. Ответ СТРОГО в формате JSON без markdown-обёрток (без \`\`\`json):

{
  "players": {
    "<player_id_1>": "текст для игрока 1",
    "<player_id_2>": "текст для игрока 2"
  },
  "global_narrative": "краткая сводка для общего лога"
}

Игрок-инициатор: ${playerName} (${playerRace}, ${playerClass})
${storylineSection}
${loreContext ? `Лор мира:\n${loreContext}\n` : ''}`;
}

// ============================================
// Безопасный парсинг JSON
// ============================================
function safeParseJson(text: string): any | null {
  // Убираем markdown-блоки
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  // Ищем первую { и последнюю }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Попробуем починить частые ошибки
    try {
      const fixed = candidate
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\\"/g, '"');
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

// ============================================
// Fallback-нарратор (если LLM упал)
// ============================================
export function buildFallbackNarrative(systemTruth: SystemTruthDto): NarratorOutputPayload {
  const players: Record<string, string> = {};
  for (const [pid, truth] of Object.entries(systemTruth.player_truths)) {
    const lines: string[] = [];
    if (systemTruth.environment.atmosphere.sounds.length > 0) {
      lines.push(`[Атмосфера: ${systemTruth.environment.atmosphere.sounds.join(", ")}]`);
    }
    if (systemTruth.environment.weather) {
      lines.push(`[Погода: ${systemTruth.environment.weather}]`);
    }
    if (truth.knowledge.length > 0) {
      lines.push(truth.knowledge.join("\n"));
    } else {
      lines.push("Ничего особенного не произошло.");
    }
    if (truth.hp_status.delta !== 0) {
      const sign = truth.hp_status.delta > 0 ? "+" : "";
      lines.push(`[HP: ${truth.hp_status.current}/${truth.hp_status.max} (${sign}${truth.hp_status.delta})]`);
    }
    if (truth.inventory_delta.added.length > 0) {
      lines.push(`[Получено: ${truth.inventory_delta.added.join(", ")}]`);
    }
    if (truth.inventory_delta.removed.length > 0) {
      lines.push(`[Утрачено: ${truth.inventory_delta.removed.length} ед.]`);
    }
    if (truth.inventory_delta.damaged.length > 0) {
      lines.push(`[Повреждено: ${truth.inventory_delta.damaged.length} ед.]`);
    }
    players[pid] = lines.join("\n");
  }

  const globalParts: string[] = [];
  if (systemTruth.environment.location_name) {
    globalParts.push(`[Локация: ${systemTruth.environment.location_name}]`);
  }
  globalParts.push(`[Время: ${String(systemTruth.environment.time.hour).padStart(2, "0")}:${String(systemTruth.environment.time.minute).padStart(2, "0")}]`);
  for (const evt of systemTruth.global_events) {
    globalParts.push(evt);
  }

  return {
    players,
    global_narrative: globalParts.join("\n"),
  };
}

// ============================================
// Главная функция Шага 5
// ============================================
export async function generateNarrative(context: NarratorInputContext): Promise<NarratorOutputPayload> {
  const { system_truth, action_text, player_name, player_race, player_class, lore_context, openrouter_api_key, dm_model } = context;

  const systemPrompt = buildNarratorSystemPrompt(player_name, player_race, player_class, lore_context, system_truth.storyline);
  const userMessage = `Действие игрока: "${action_text}"

SystemTruthDto:
${JSON.stringify(system_truth, null, 2)}

Сгенерируй нарратив в JSON.`;

  const modelsToTry = [dm_model, "google/gemini-2.0-flash-001", "meta-llama/llama-3.3-70b-instruct"];
  let lastErr: any = null;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const curModel = modelsToTry[attempt];
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouter_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: curModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Narrator LLM error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content || content.trim() === "") throw new Error("Empty narrator response");

      const parsed = safeParseJson(content);
      if (!parsed || typeof parsed.players !== "object") {
        throw new Error("Failed to parse narrator JSON");
      }

      // Валидация: проверяем, что все players из SystemTruthDto присутствуют
      const validatedPlayers: Record<string, string> = {};
      for (const pid of Object.keys(system_truth.player_truths)) {
        validatedPlayers[pid] = typeof parsed.players[pid] === "string" ? parsed.players[pid] : "…";
      }

      return {
        players: validatedPlayers,
        global_narrative: typeof parsed.global_narrative === "string" ? parsed.global_narrative : "",
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[step5_narrator] Attempt ${attempt + 1} (${curModel}) failed:`, err);
    }
  }

  throw lastErr || new Error("Failed all narrator attempts");
}

