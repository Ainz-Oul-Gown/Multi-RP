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
  recent_history: string[]; // последние 6 сообщений для контекста ДМ
  openrouter_api_key: string;
  backup_api_keys?: string[];
  dm_model: string;
}

// ============================================
// Промпт для LLM
// ============================================
export function buildNarratorSystemPrompt(
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
    const validPrologue = storyline.prologue && !/^(пролога нет|нет пролога|нет|none|null|-)$/i.test(String(storyline.prologue).trim())
      ? String(storyline.prologue).trim()
      : "";
    storylineSection = `
СЮЖЕТНАЯ ЛИНИЯ («ЛЫЖИ, НО НЕ ПРАВИЛО»):
Кампания: "${storyline.title || 'Сюжетная линия'}"
${validPrologue ? `Пролог мира: ${validPrologue}\n` : ""}Текущая арка (Акт ${arc.act || 1}): "${arc.title || ''}"
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

  return `Ты — профессиональный Dungeon Master в текстовой многопользовательской ЛитРПГ.
Твоя задача — превратить сухой SystemTruthDto в живой, динамичный литературный текст для КАЖДОГО игрока индивидуально.

🔴 АБСОЛЮТНОЕ ПРАВИЛО №0 — ЯЗЫК ОТВЕТА:
ВЕСЬ твой текст (художественный нарратив, реплики NPC, описания) ОБЯЗАН быть написан ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ.
Английский, немецкий, китайские иероглифы или любой другой язык — СТРОГО ЗАПРЕЩЕНЫ. Никогда не пиши фразы вроде «Пролога нет».

ПРАВИЛА:
1. Опирайся СТРОГО на массив knowledge для каждого игрока в player_truths.
2. КРИТИЧЕСКИЙ ЗАПРЕТ: НИКАКОГО выдуманного лута, урона, смертей или изменений ХП, кроме явно указанных в knowledge и hp_status!
3. СТРОЖАЙШИЙ ЗАПРЕТ НА МЕТА-КОММЕНТАРИИ И КУБИКИ:
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО обсуждать в тексте кубики, числа d20, модификаторы и формулы ("Бросок d20 с вашим бонусом в 2 дает 22...", "Ваш d20 показал..."). Ты — литературный рассказчик, а не калькулятор! Описывай только физические действия персонажа, его мастерство, удачу и живой мир вокруг.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО упоминать неизменное здоровье ("Ваше текущее здоровье остается неизменным на уровне 27 очков", "Вы не потеряли ХП"). Если урон или лечение не произошли — здоровье ВООБЩЕ не упоминается в тексте!
4. ЧИСТЫЙ ЛИТЕРАТУРНЫЙ ТЕКСТ БЕЗ ТЕХНИЧЕСКИХ ТЕГОВ:
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вставлять в текст искусственные технические скобки и псевдо-теги вроде "[Навык: Успех]", "[Выживание: Успех]", "[Получен предмет: ...]", "[Выброшен предмет: ...]".
   - Все события — применение навыков, успехи, неудачи, получение или потеря предметов, ранения — должны описываться ИСКЛЮЧИТЕЛЬНО ЖИВЫМ ХУДОЖЕСТВЕННЫМ ЯЗЫКОМ, органично вплетаясь в действие и физику мира.
5. СТРОЖАЙШИЙ ЗАПРЕТ НА ПОВТОРЫ («АНТИ-ПОПУГАЙ»):
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО копировать или перефразировать абзацы из прошлых ходов!
   - ЗАПРЕЩЕНО в каждом ходе заново описывать одежду, плащ, клинок или броню героя одними и теми же словами.
   - ЗАПРЕЩЕНО просто пересказывать словами игрока его же действие или вопрос без продвижения сцены вперёд. Каждый ход ОБЯЗАН давать НОВУЮ деталь, новый результат и живой отклик мира!
6. ЖИВЫЕ NPC В ЛОКАЦИИ И ОБЯЗАТЕЛЬНЫЙ ОТВЕТ В ДИАЛОГЕ:
   - Если игрок обратился к NPC с вопросом, репликой или просьбой — в 3-м абзаце («МИР ОТВЕЧАЕТ») этот NPC ОБЯЗАН ответить содержательной прямой речью в кавычках («...»)!
   - В ответе NPC обязан прямо ответить на заданный вопрос игрока, используя свои слухи (rumors), мотивацию (motivation), характер (temperament) и манеру речи (speech_style). НИКОГДА не оставляй вопрос игрока к NPC без ответа вслух!
   - Если игрок НЕ взаимодействует с фоновыми NPC (занят боем, бегом, одиночным исследованием) — не вставляй одних и тех же фоновых NPC в каждый пост.
   - КРИТИЧЕСКИ ВАЖНО: НИКОГДА не перемещай городских NPC в дикие зоны (лес, горы, пещеры).
7. ХАРАКТЕР, ПСИХОЛОГИЯ И ОТЫГРЫШ NPC НА 100% (npc_context и present_npcs):
   - СТИЛЬ РЕЧИ (speech_style): NPC говорит СТРОГО в своём уникальном стиле (жаргон, архаизмы, высокомерие мага, просторечие, солдатская лаконичность, присказки).
   - ТЕМПЕРАМЕНТ И НАСТРОЕНИЕ (temperament, current_mood): Раздражённый огрызается и спешит; напуганный вздрагивает и шепчет; благодушный охотно шутит; подозрительный щурится.
   - МОТИВАЦИЯ (motivation): NPC всегда преследует свою выгоду или цель.
   - СЕКРЕТЫ И СЛУХИ (secrets, rumors): Тайны NPC раскрывает при доверительных отношениях (+70 и выше) либо при критическом успехе. Слухами (rumors) NPC охотно делится в разговоре!
   - ШКАЛА ОТНОШЕНИЙ (relationship_score) определяет тон: -100..-30 (враждебно/грубо), -29..+29 (сдержанно/деловито), +30..+69 (дружелюбно), +70..+100 (преданный друг).
8. СТРУКТУРА ОТВЕТА (строго соблюдать, 3 абзаца, разделённых пустой строкой \\n\\n):
   ▸ АБЗАЦ 1 — «КАРТИНА И МОМЕНТ»: Сенсорное погружение в НОВЫЙ момент сцены (2–3 предложения). Звуки, освещение, запахи, перемена обстановки. НЕ копируй прошлый ход и НЕ начинай с имени героя.
   ▸ АБЗАЦ 2 — «ДЕЙСТВИЕ И РЕЗУЛЬТАТ»: Физическое описание того, что сделал герой и что из этого вышло согласно ФАКТАМ (2–4 предложения). При успехе навыка — покажи конкретную находку, деталь, улику или мастерство.
   ▸ АБЗАЦ 3 — «МИР ОТВЕЧАЕТ»: Живая реакция мира, природы или собеседника (2–3 предложения). Если был диалог с NPC — здесь ОБЯЗАТЕЛЬНА его прямая речь («— ...») с ответом по сути и зацепкой для следующего шага игрока!
9. ВЗАИМОДЕЙСТВИЕ МЕЖДУ ИГРОКАМИ И СТРОГИЙ ЗАПРЕТ КУКЛОВОДСТВА (No Puppeteering / No Godmoding):
   - СТРОЖАЙШИЙ ЗАПРЕТ КУКЛОВОДСТВА (NO GODMODING): ДМ категорически ЗАПРЕЩЕНО совершать действия, принимать решения, соглашаться, отказываться или произносить реплики ЗА ДРУГОГО ЖИВОГО ИГРОКА!
   - Опиши обращение к сопартийцу, но ОСТАВЬ РЕАКЦИЮ И ОТВЕТ ЦЕЛИКОМ НА УСМОТРЕНИЕ САМОГО ИГРОКА в его собственный ход!
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО отвечать от лица NPC, когда игрок обращался по имени к живому сопартийцу.
10. РОЛЕВАЯ РАЗМЕТКА И ОТЫГРЫШ ОТРЯДА (Party Dynamics & RP Notation):
   - СКАЗАННОЕ ВСЛУХ В КАВЫЧКАХ ("..." / «...»): слышат все NPC и сопартийцы в комнате.
   - ДЕЙСТВИЯ В ЗВЁЗДОЧКАХ (*...*): видимые физические жесты и движения.
   - МЫСЛИ ВНЕ КАВЫЧЕК: NPC не умеют читать мысли и не реагируют на то, что не сказано вслух!
   - СОВМЕСТНЫЙ ОТРЯД (Party): когда сопартийцы идут вместе, описывай их как сплочённую группу.
11. СИНХРОНИЗАЦИЯ ПЕРЕМЕЩЕНИЯ:
   - Если в фактах НЕТ подтверждения прибытия в новую локацию — описывай процесс пути или препятствие, но НЕ объявляй, что герой уже дошёл.
12. Ответ СТРОГО в формате JSON без markdown-обёрток (без \`\`\`json):

{
  "players": {
    "<player_id_1>": "текст для игрока 1",
    "<player_id_2>": "текст для игрока 2"
  },
  "global_narrative": "краткая сводка для общего лога"
}

Игрок-инициатор: ${playerName} (${playerRace}, ${playerClass})
${storylineSection}
${loreContext ? `Лор мира:\n${loreContext}\n` : ''}

13. ВАРИАТИВНОСТЬ НАЧАЛА:
   НИКОГДА не начинай два хода подряд одинаково! Чередуй начало с действия, звука, тактильного ощущения, детали окружения или реплики собеседника.`;
}


// ============================================
// Безопасный парсинг JSON с починкой переносов строк
// ============================================
function fixUnescapedNewlinesInJson(jsonStr: string): string {
  let inString = false;
  let escaped = false;
  let out = "";
  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (c === "\\" && inString) {
      escaped = !escaped;
      out += c;
    } else if (c === '"' && !escaped) {
      inString = !inString;
      out += c;
    } else if (inString && (c === "\n" || c === "\r")) {
      out += c === "\n" ? "\\n" : "\\r";
    } else if (inString && c === "\t") {
      out += "\\t";
    } else {
      escaped = false;
      out += c;
    }
  }
  return out;
}

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
    // Попробуем починить неэкранированные переносы строк и висячие запятые
    try {
      const fixed = fixUnescapedNewlinesInJson(candidate)
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

    // Атмосфера (художественно)
    if (systemTruth.environment.atmosphere.sounds.length > 0) {
      lines.push(`В воздухе чувствуется: ${systemTruth.environment.atmosphere.sounds.join(", ")}.`);
    }
    if (systemTruth.environment.weather) {
      lines.push(`За окном — ${systemTruth.environment.weather}.`);
    }

    // Факты хода
    if (truth.knowledge.length > 0) {
      lines.push(truth.knowledge.join("\n"));
    } else {
      lines.push("Ничего особенного не произошло.");
    }

    // HP изменение (только если было)
    if (truth.hp_status.delta !== 0) {
      if (truth.hp_status.delta > 0) {
        lines.push(`Вы чувствуете прилив сил. (+${truth.hp_status.delta} здоровья, сейчас ${truth.hp_status.current}/${truth.hp_status.max})`);
      } else {
        lines.push(`Вы ощущаете боль от ран. (${truth.hp_status.delta} здоровья, осталось ${truth.hp_status.current}/${truth.hp_status.max})`);
      }
    }

    // Предметы (художественно)
    if (truth.inventory_delta.added.length > 0) {
      lines.push(`Вы подбираете: ${truth.inventory_delta.added.join(", ")}.`);
    }
    if (truth.inventory_delta.removed.length > 0) {
      lines.push(`Вы расстались с частью вещей.`);
    }
    if (truth.inventory_delta.damaged.length > 0) {
      lines.push(`Некоторые предметы пострадали в бою.`);
    }

    players[pid] = lines.join("\n");
  }

  const globalParts: string[] = [];
  if (systemTruth.environment.location_name) {
    globalParts.push(`📍 ${systemTruth.environment.location_name}`);
  }
  globalParts.push(`🕐 ${String(systemTruth.environment.time.hour).padStart(2, "0")}:${String(systemTruth.environment.time.minute).padStart(2, "0")}`);
  for (const evt of systemTruth.global_events) {
    globalParts.push(evt);
  }

  return {
    players,
    global_narrative: globalParts.join(" | "),
  };
}

// ============================================
// Преобразование SystemTruthDto в чистый нарративный контекст
// ============================================
export function buildNarratorContext(system_truth: SystemTruthDto, action_text: string, recent_history?: string[]): string {
  const t = system_truth.environment.time;
  const lines: string[] = [];

  // Предыстория — последние ходы (если есть)
  if (recent_history && recent_history.length > 0) {
    lines.push("ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ (не повторяй уже описанное, продолжай повествование):");
    recent_history.forEach((msg) => lines.push(`  ${msg}`));
    lines.push("");
  }

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
    const playerLabel = truth.player_name
      ? `[Игрок ${truth.player_name} (${truth.player_race || 'Человек'} ${truth.player_class || 'Герой'}, ID: ${pid})${truth.is_acting_player ? ' — СОВЕРШАЕТ ДЕЙСТВИЕ' : ' — НАПАРНИК В ОТРЯДЕ РЯДОМ'}]`
      : `[Игрок ${pid}]`;
    lines.push(playerLabel);
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
    lines.push("ХАРАКТЕР, ПСИХОЛОГИЯ И РЕЧЬ NPC (отыгрывать на 100% живым языком!):");
    for (const ctx of npcEntries) {
      let ctxLine = `  • ${ctx.name} (${ctx.race || "Гуманоид"}, ${ctx.role || "обыватель"})`;
      if (ctx.temperament) ctxLine += ` | Темперамент: ${ctx.temperament}`;
      if (ctx.current_mood) ctxLine += ` | Настроение: ${ctx.current_mood}`;
      if (ctx.speech_style) ctxLine += ` | Стиль речи: "${ctx.speech_style}"`;
      if (ctx.motivation) ctxLine += ` | Цель/мотивация: "${ctx.motivation}"`;
      if (ctx.habits) ctxLine += ` | Привычки: ${ctx.habits}`;
      if (ctx.relationship_score !== undefined) {
        ctxLine += ` | Отношения: ${ctx.relationship_score}/100 (${ctx.relationship_tier_label || ctx.relationship_tier || "нейтральные"})`;
      }
      if (ctx.secrets) {
        const canReveal = (ctx.relationship_score || 0) >= 70;
        ctxLine += canReveal
          ? ` | Доверенная тайна: "${ctx.secrets}"`
          : ` | Тайна: скрывает, не доверяет (раскроет только при дружбе >70)`;
      }
      if (ctx.rumors && ctx.rumors.length > 0) {
        ctxLine += ` | Знает слухи: ${ctx.rumors.slice(0, 2).map((r) => `"${r}"`).join(", ")}`;
      }
      if (ctx.vivid_memories && ctx.vivid_memories.length > 0) {
        ctxLine += ` | Ярко помнит: ${ctx.vivid_memories.slice(0, 2).join("; ")}`;
      } else if (ctx.regular_memories && ctx.regular_memories.length > 0) {
        ctxLine += ` | Помнит: ${ctx.regular_memories.slice(0, 1).join("; ")}`;
      }
      lines.push(ctxLine);
    }
    lines.push("💬 ДИАЛОГОВАЯ ДИРЕКТИВА: Если действие игрока содержит вопрос или обращение к NPC — в 3-м абзаце этот NPC ОБЯЗАН ответить прямой речью («— ...»), используя свои слухи, характер и мотивацию!");
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
  const { system_truth, action_text, player_name, player_race, player_class, lore_context, recent_history, openrouter_api_key, dm_model } = context;

  // Очистка lore_context: удаляем не-кириллические символы (иероглифы, латиница длинными сериями)
  const cleanLoreContext = lore_context
    ? lore_context
        .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u0100-\u024f]{1}/g, '') // CJK + латинские расширенные
        .replace(/[a-zA-Z]{8,}/g, '') // длинные английские слова (>8 символов)
        .replace(/\s{2,}/g, ' ')
        .trim()
    : '';

  const systemPrompt = buildNarratorSystemPrompt(player_name, player_race, player_class, cleanLoreContext, system_truth.storyline);
  const narratorContext = buildNarratorContext(system_truth, action_text, recent_history);
  const userMessage = `${narratorContext}\n\nСгенерируй нарратив строго по указанным фактам в JSON-формате. ВЕСЬ текст (описания, действия, диалоги NPC) ОБЯЗАН быть исключительно на русском языке! ЗАПРЕЩЕНО повторять вступительный абзац прошлых ходов!`;

  const isTest = openrouter_api_key === "test-key" || dm_model === "test-model";
  const allKeys = isTest
    ? [openrouter_api_key]
    : Array.from(
        new Set(
          [openrouter_api_key, ...(context.backup_api_keys || [])]
            .map((k) => (k || "").trim())
            .filter((k) => k.length > 5)
        )
      );

  // Сначала лучшие бесплатные модели 24B-72B+ (чтобы при нулевом балансе не падать на 402 и не деградировать до 1B/3B),
  // затем сверхэкономичные платные модели ($10 хватает на ~15 000+ ходов)
  const modelsToTry = isTest
    ? [dm_model || "test-model"]
    : Array.from(
        new Set(
          [
            dm_model,
            "google/gemma-4-31b-it:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "qwen/qwen-2.5-72b-instruct:free",
            "deepseek/deepseek-chat:free",
            "google/gemini-2.0-flash-exp:free",
            "mistralai/mistral-small-24b-instruct-2501:free",
            "deepseek/deepseek-chat",
            "google/gemini-2.0-flash-001",
            "openai/gpt-4o-mini",
          ].filter(Boolean) as string[]
        )
      );
  const attemptErrors: string[] = [];
  let lastErr: any = null;

  for (const curKey of allKeys) {
    let keyAuthFailed = false;
    for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
      if (keyAuthFailed) break;
      const curModel = modelsToTry[attempt];
      try {
        if (attempt > 0 && !isTest) {
          await new Promise((r) => setTimeout(r, 350 * Math.min(attempt, 3)));
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${curKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ainz-oul-gown.github.io/Multi-RP/",
            "X-Title": "Multi-RP",
          },
          body: JSON.stringify({
            model: curModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: 0.72,
            max_tokens: 1400,
          }),
          signal: AbortSignal.timeout(26000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          const errMsg = `Narrator LLM error: ${response.status} - ${errText.slice(0, 150)}`;
          // ВАЖНО: 402 (Insufficient credits) на платной модели НЕ означает невалидный ключ для :free моделей!
          // Прерываем цикл по ключу ТОЛЬКО при 401 (Unauthorized / неверный API-ключ).
          if (response.status === 401) {
            console.warn(`[step5_narrator] Key auth failure (401) on ${curModel}. Trying next key.`);
            keyAuthFailed = true;
            lastErr = new Error(errMsg);
            break;
          }
          throw new Error(errMsg);
        }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content || content.trim() === "") throw new Error("Empty narrator response");

      let parsed = safeParseJson(content);
      if (!parsed || typeof parsed !== "object") {
        // Если модель ответила художественным текстом напрямую вместо JSON
        const isRussianText = /[а-яёА-ЯЁ]{15,}/.test(content);
        if (isRussianText && content.trim().length > 30) {
          parsed = { players: {} };
          for (const pid of Object.keys(system_truth.player_truths)) {
            parsed.players[pid] = content.trim();
          }
        } else {
          throw new Error(`Failed to parse narrator JSON from response: "${content.slice(0, 100)}..."`);
        }
      }

      const cleanNarrativeText = (raw: string): string => {
        if (!raw) return raw;
        return raw
          .replace(/(?:^|\n)\s*Пролога нет\.?\s*(?=\n|$)/gi, "\n")
          .replace(/\[\s*(?:Навык|Проверка|Выживание|Внимательность|Скрытность|Атлетика|Ловкость|Сила|Интеллект|Харизма|Мудрость|Ремесло|Убеждение|Атака)\s*:\s*(?:Успех|Провал|Крит|Победа)[^\]]*\]/gi, "")
          .replace(/\[\s*(?:Получен предмет|Выброшен предмет|Найден предмет|Утрачен предмет)\s*:[^\]]*\]/gi, "")
          // Удаляем просочившиеся системные теги речи NPC в скобках вида "[Мортис Разговаривать...]" или "[Мортис]"
          .replace(/\[\s*[А-Яа-яA-Za-z\s]+(?:Разговаривать|Говорить|кричит|шепчет|отвечает|произносит|бормочет)[^\]]*\]\s*/gi, "")
          .replace(/\[\s*[А-ЯЁ][а-яё]+\s*\]\s*/g, "")
          // Сначала удаляем смешанные слова CJK+кириллица (например "遠кий" → "")
          .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af][а-яёА-ЯЁ]*/g, "")
          .replace(/[а-яёА-ЯЁ]*[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
          // Затем удаляем оставшиеся одиночные CJK иероглифы
          .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
          // Удаляем случайные длинные английские слова (≥5 букв), не трогая d20/DC/HP и переносы строк
          .replace(/\b[a-zA-Z]+ing\b/g, "")
          .replace(/\b(?!HP\b|MP\b|DC\b|XP\b)[a-zA-Z]{5,}\b/g, "")
          .replace(/ +([.,!?;:])/g, "$1")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      };


      // Валидация: проверяем, что все players из SystemTruthDto присутствуют и очищены от псевдо-тегов
      const EXACT_PLACEHOLDERS = [
        '<narrative text>', 'текст...', '...', '…', '[narrative]', '{narrative}',
        '<text>', 'нарратив', 'narrative text',
      ];
      const validatedPlayers: Record<string, string> = {};
      let hasPlaceholder = false;
      for (const pid of Object.keys(system_truth.player_truths)) {
        const playerName = system_truth.player_truths[pid]?.player_name;
        let rawText: string | null = null;
        if (parsed.players && typeof parsed.players === "object") {
          if (typeof parsed.players[pid] === "string") {
            rawText = parsed.players[pid];
          } else if (playerName && typeof parsed.players[playerName] === "string") {
            rawText = parsed.players[playerName];
          } else {
            for (const [k, v] of Object.entries(parsed.players)) {
              if (typeof v === "string" && playerName && (k.toLowerCase().includes(playerName.toLowerCase()) || playerName.toLowerCase().includes(k.toLowerCase()))) {
                rawText = v;
                break;
              }
            }
          }
          if (!rawText && Object.keys(parsed.players).length === 1 && Object.keys(system_truth.player_truths).length === 1) {
            const singleVal = Object.values(parsed.players)[0];
            if (typeof singleVal === "string") rawText = singleVal;
          }
        }
        if (!rawText || rawText.trim().length === 0) {
          rawText = 'Персонаж внимательно следит за происходящим вокруг.';
        }
        const cleaned = cleanNarrativeText(rawText);
        const lowerCleaned = cleaned.trim().toLowerCase();
        // Проверка на placeholder: если ответ слишком короткий (< 10) или состоит из плейсхолдера
        const isPlaceholder = EXACT_PLACEHOLDERS.some(p => lowerCleaned === p.toLowerCase())
          || lowerCleaned.startsWith('<narrative')
          || lowerCleaned.startsWith('[narrative');
        if (cleaned.trim().length < 10 || isPlaceholder) {
          hasPlaceholder = true;
          console.warn(`[step5_narrator] Placeholder detected for player ${pid}: "${cleaned.slice(0, 50)}"`);
        }
        validatedPlayers[pid] = cleaned;
      }
      if (hasPlaceholder) throw new Error('Narrator returned placeholder text — retry next model');

      return {
        players: validatedPlayers,
        global_narrative: typeof parsed.global_narrative === "string" ? cleanNarrativeText(parsed.global_narrative) : "",
      };
      } catch (err: any) {
        lastErr = err;
        attemptErrors.push(`[${curModel}]: ${err?.message || err}`);
        console.warn(`[step5_narrator] Attempt ${attempt + 1} (${curModel}) failed:`, err);
      }
    }
  }

  throw new Error(`Failed all narrator attempts: ${attemptErrors.join(" | ")}`);
}

