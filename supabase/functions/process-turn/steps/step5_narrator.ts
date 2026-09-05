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
   - Каждый NPC имеет current_activity — ВСЕГДА показывай их занятыми делом: кузнец бьёт молотом, торговка зазывает покупателей, стражник лениво опирается на алебарду.
   - Если есть appearance — опиши NPC через одну-две яркие физические детали (не весь список!).
   - NPC не смотрят в пустоту и не стоят статично. Они реагируют краем взгляда, продолжают дело или переговариваются.
   - КРИТИЧЕСКИ ВАЖНО: НИКОГДА не перемещай NPC в локации, где их нет! Если игрок в лесу, горах, пещере или дикой зоне — в тексте могут быть ТОЛЬКО его спутники из отряда либо дикие обитатели/враги. Городские жители, торговцы и ремесленники остаются в городе и не появляются в глухом лесу!
6. Используй atmosphere (звуки, визуальные образы) и погоду для создания глубокого погружения.
7. ХАРАКТЕР И ОТНОШЕНИЯ NPC (npc_context):
   - Используй habits для описания манеры поведения NPC (как держится, как говорит, мелкие жесты).
   - Если есть catchphrases — вплети одну характерную фразу в диалог NPC органично, не цитируя списком.
   - background влияет на подтекст и манеру речи: бывший солдат говорит кратко и сухо; торговец льстит и преувеличивает.
   - Шкала отношений (relationship_score) СТРОГО определяет тон диалога:
     • -100..-30 = враждебно, грубо, с угрозами или презрением;
     • -29..+29  = нейтрально, формально, осторожно;
     • +30..+69  = тепло, дружелюбно, охотно отвечает и шутит;
     • +70..+100 = как со старым проверенным другом или союзником, готов выручить и делится секретами.
   - Если NPC враждебен (is_hostile=true): он атакует, угрожает или проявляет агрессию — он НЕ может внезапно помочь игроку без веской причины.
8. СТРУКТУРА ОТВЕТА (строго соблюдать):
   ▸ АБЗАЦ 1 — «КАРТИНА»: Сенсорное погружение. Что видит, слышит, чувствует игрок прямо сейчас. 2–3 предложения. Запахи, текстуры, звуки, освещение. НЕ начинай с имени героя.
   ▸ АБЗАЦ 2 — «ДЕЙСТВИЕ»: Физическое описание того, что произошло согласно ФАКТАМ. Только то, что есть в knowledge. 2–4 предложения. При успехе навыка — описывай уверенность и мастерство. При провале — напряжение, случайность, непредвиденное препятствие.
   ▸ АБЗАЦ 3 — «МИР ОТВЕЧАЕТ» (если есть NPC, событие или диалог): Реакция мира, окружающих людей или природы. NPC говорит своими словами в соответствии с характером и уровнем отношений. 1–3 предложения.

   МИНИМУМ 120 слов на игрока. Используй активный залог, конкретные и живые глаголы. ЗАПРЕЩЕНО начинать два абзаца подряд с одного и того же слова.
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
// Преобразование SystemTruthDto в чистый нарративный контекст
// ============================================
export function buildNarratorContext(system_truth: SystemTruthDto, action_text: string): string {
  const t = system_truth.environment.time;
  const lines: string[] = [];

  lines.push(`ДЕЙСТВИЕ ИГРОКА: "${action_text}"`);
  lines.push(`МЕСТО: ${system_truth.environment.location_name} | ВРЕМЯ: ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`);

  if (system_truth.environment.atmosphere.sounds.length > 0 || system_truth.environment.atmosphere.visuals.length > 0) {
    const sounds = system_truth.environment.atmosphere.sounds.join(", ");
    const visuals = system_truth.environment.atmosphere.visuals.join(", ");
    lines.push(`АТМОСФЕРА — ${sounds ? `Звуки: ${sounds}` : ""}${sounds && visuals ? " | " : ""}${visuals ? `Визуальные детали: ${visuals}` : ""}`);
  }
  if (system_truth.environment.weather) {
    lines.push(`ПОГОДА: ${system_truth.environment.weather}`);
  }

  lines.push("");
  lines.push("ФАКТЫ ЭТОГО ХОДА (только эти факты переводить в художественный текст!):");
  for (const [pid, truth] of Object.entries(system_truth.player_truths)) {
    lines.push(`[Игрок ${pid}]`);
    if (truth.knowledge.length > 0) {
      truth.knowledge.forEach((k) => lines.push(`  • ${k}`));
    } else {
      lines.push(`  • Ничего особенного не произошло, персонаж осматривается или выжидает.`);
    }
    if (truth.hp_status.delta !== 0) {
      const sign = truth.hp_status.delta > 0 ? "+" : "";
      lines.push(`  • HP: ${truth.hp_status.current}/${truth.hp_status.max} (${sign}${truth.hp_status.delta})`);
    }
    if (truth.inventory_delta.added.length > 0) {
      lines.push(`  • Получено: ${truth.inventory_delta.added.join(", ")}`);
    }
    if (truth.inventory_delta.removed.length > 0) {
      lines.push(`  • Утрачено: ${truth.inventory_delta.removed.join(", ")}`);
    }
    if (truth.inventory_delta.damaged.length > 0) {
      lines.push(`  • Повреждено: ${truth.inventory_delta.damaged.join(", ")}`);
    }
  }

  if (system_truth.global_events.length > 0) {
    lines.push("");
    lines.push(`СОБЫТИЯ МИРА: ${system_truth.global_events.join(" | ")}`);
  }

  if (system_truth.present_npcs && system_truth.present_npcs.length > 0) {
    lines.push("");
    lines.push("NPC В ЛОКАЦИИ (оживи их, покажи занятыми делом!):");
    system_truth.present_npcs.slice(0, 6).forEach((n) => {
      let npcLine = `  • ${n.name} (${n.race || "Гуманоид"}, ${n.role || "обыватель"})${n.is_hostile ? " ⚔️ ВРАГ" : ""}`;
      if (n.current_activity) npcLine += ` — сейчас занят: ${n.current_activity}`;
      if (n.appearance) npcLine += ` | Внешность: ${n.appearance}`;
      if (n.catchphrases && n.catchphrases.length > 0) npcLine += ` | Характерная фраза: "${n.catchphrases[0]}"`;
      lines.push(npcLine);
    });
  }

  const npcEntries = Object.values(system_truth.npc_context || {});
  if (npcEntries.length > 0) {
    lines.push("");
    lines.push("ХАРАКТЕР И ПАМЯТЬ NPC (для диалогов и реакций):");
    for (const ctx of npcEntries) {
      let ctxLine = `  • ${ctx.name}`;
      if (ctx.habits) ctxLine += ` | Привычки: ${ctx.habits}`;
      if (ctx.background) ctxLine += ` | Предыстория: ${ctx.background.slice(0, 150)}`;
      if (ctx.relationship_score !== undefined) {
        ctxLine += ` | Отношения: ${ctx.relationship_score}/100 (${ctx.relationship_tier_label || ctx.relationship_tier || "нейтральные"})`;
      }
      if (ctx.vivid_memories && ctx.vivid_memories.length > 0) {
        ctxLine += ` | Ярко помнит: ${ctx.vivid_memories.slice(0, 2).join("; ")}`;
      } else if (ctx.regular_memories && ctx.regular_memories.length > 0) {
        ctxLine += ` | Помнит: ${ctx.regular_memories.slice(0, 1).join("; ")}`;
      }
      lines.push(ctxLine);
    }
  }

  if (system_truth.encounter_alert?.spawned) {
    lines.push("");
    lines.push(`⚠️ ВСТРЕЧА: Появляется ${system_truth.encounter_alert.creature_name || "существо"} (тир ${system_truth.encounter_alert.tier || 1})`);
  }

  return lines.join("\n");
}

// ============================================
// Главная функция Шага 5
// ============================================
export async function generateNarrative(context: NarratorInputContext): Promise<NarratorOutputPayload> {
  const { system_truth, action_text, player_name, player_race, player_class, lore_context, openrouter_api_key, dm_model } = context;

  const systemPrompt = buildNarratorSystemPrompt(player_name, player_race, player_class, lore_context, system_truth.storyline);
  const narratorContext = buildNarratorContext(system_truth, action_text);
  const userMessage = `${narratorContext}\n\nСгенерируй нарратив строго по указанным фактам в JSON-формате.`;

  const modelsToTry = [
    dm_model,
    "google/gemma-4-31b-it:free",
    "minimax/minimax-m3:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-26b-a4b-it:free",
    "minimax/minimax-m2.7:free",
  ].filter(Boolean);
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
        signal: AbortSignal.timeout(28000),
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

