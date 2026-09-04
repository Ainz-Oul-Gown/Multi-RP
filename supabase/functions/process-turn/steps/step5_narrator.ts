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
function buildNarratorSystemPrompt(playerName: string, playerRace: string, playerClass: string, loreContext: string): string {
  return `Ты — Dungeon Master в текстовой многопользовательской ЛитРПГ.
Твоя задача — превратить сухой SystemTruthDto в захватывающий литературный текст для КАЖДОГО игрока индивидуально.

ПРАВИЛА:
1. Опирайся СТРОГО на массив knowledge для каждого игрока в player_truths.
2. КРИТИЧЕСКИЙ ЗАПРЕТ: НИКАКОГО выдуманного лута, урона, смертей или изменений ХП, кроме явно указанных в knowledge и hp_status!
3. Соблюдай Туман Войны: если у игрока написано "Источник урона неизвестен" — ни в коем случае не упоминай имя нападающего!
4. Вплетай системные ЛитРПГ-сообщения в скобках [Скрытность: Успех], [Урон: 5], [Получен предмет: ...].
5. Используй atmosphere (звуки, визуальные образы) и погоду для создания глубокого погружения.
6. Используй npc_context: характер NPC, шкалу отношений (-100..+100: заклятый враг, неприязнь, нейтрал, доверие, преданность), статус-теги и прошлые воспоминания (яркие, обычные, впечатления). NPC должен общаться, жестикулировать и реагировать строго в соответствии со своими отношениями к игроку и пережитыми событиями!
7. Стиль: Тёмное фэнтези / ЛитРПГ. Лаконично (1–3 ёмких абзаца на игрока).
8. Ответ СТРОГО в формате JSON без markdown-обёрток (без \`\`\`json):

{
  "players": {
    "<player_id_1>": "текст для игрока 1",
    "<player_id_2>": "текст для игрока 2"
  },
  "global_narrative": "краткая сводка для общего лога"
}

Игрок-инициатор: ${playerName} (${playerRace}, ${playerClass})

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

  const systemPrompt = buildNarratorSystemPrompt(player_name, player_race, player_class, lore_context);
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

