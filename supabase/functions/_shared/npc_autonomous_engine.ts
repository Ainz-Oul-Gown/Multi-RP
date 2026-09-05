// supabase/functions/_shared/npc_autonomous_engine.ts
// Автономность NPC: инициатива спутников в текущей сцене и долгосрочные экспедиции
// Оптимизировано по токенам (0 токенов в обычные ходы благодаря Event-driven Lazy Simulation)

export interface GameTimePoint {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function gameTimeToMinutes(t: GameTimePoint): number {
  return (
    (t.year || 1248) * 365 * 24 * 60 +
    (t.month || 1) * 30 * 24 * 60 +
    (t.day || 1) * 24 * 60 +
    (t.hour || 0) * 60 +
    (t.minute || 0)
  );
}

import { parseAIJson } from "./utils.ts";

/**
 * Инициатива спутника в текущей сцене:
 * Спутник (член отряда) анализирует действие игрока через быструю Free LLM.
 * Он понимает контекст (даже неочевидные или рискованные замыслы игрока),
 * активно предлагает помощь, прикрывает, ищет ресурсы или комментирует происходящее.
 */
export async function handleCompanionInSceneAction(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  location_npcs: any[];
  session_id: string;
  openrouter_api_key?: string;
  model?: string;
}): Promise<{
  npc_name: string;
  dialogue: string;
  item_obtained?: string;
  action_description: string;
} | null> {
  const { supabase, player_action_text, acting_player_name, location_npcs, openrouter_api_key, model } = params;
  if (!location_npcs || location_npcs.length === 0) return null;

  // Ищем живого спутника из отряда
  const companion = location_npcs.find((n) => {
    if (n.is_hostile || n.is_alive === false || n.role === "hostile") return false;
    const role = (n.role || "").toLowerCase();
    const tags = Array.isArray(n.status_tags) ? n.status_tags.map((t: string) => t.toLowerCase()) : [];
    return role === "companion" || tags.includes("спутник") || tags.includes("в_отряде") || tags.includes("спутница") || tags.includes("компаньон");
  });
  if (!companion) return null;

  const rawAction = (player_action_text || "").trim();
  if (!rawAction) return null;

  // 1. Попытка через Free LLM: анализируем намерение игрока и даем живую инициативу спутнику
  if (openrouter_api_key) {
    try {
      const modelsToTry = [
        model || "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemini-2.5-flash:free",
        "qwen/qwen3-235b-a22b:free",
      ];

      const companionInfo = `Имя: ${companion.name}, Раса: ${companion.race || "Человек"}, Класс: ${companion.class || "Спутник"}.
Характер/привычки: ${Array.isArray(companion.habits) ? companion.habits.join(", ") : companion.habits || "Преданный соратник"}.
Предыстория: ${companion.background || "Спутник игрока"}.`;

      const systemPrompt = `Ты — ИИ-модуль спутника в настольной ролевой игре (D&D / ЛитРПГ).
Твоя задача — решить, как спутник игрока инициативно реагирует и помогает игроку (${acting_player_name}) в текущей сцене.
Спутник — живой соратник, он понимает глубокий замысел игрока (даже если игрок блефует, рискует, творит безумие или готовит засаду).
Спутник может:
1. Помочь делу (собрать припасы, подать инструмент, прикрыть спину, встать на страже, отвлечь кого-то).
2. Добыть полезный предмет/ресурс (если действие связано с поиском, лагерем, охотой, исследованием) — опционально.
3. Одобрить, предупредить или эмоционально поддержать действие.

Отвечай СТРОГО в формате JSON без markdown и пояснений:
{
  "should_act": true,
  "dialogue": "«Прямая речь спутника к игроку»",
  "action_description": "Художественное описание того, что конкретно сделал спутник (в 3-м лице)",
  "item_obtained": "Название предмета или null"
}`;

      const userPrompt = `Спутник:\n${companionInfo}\n\nДействие игрока (${acting_player_name}): "${rawAction}"\n\nКак спутник реагирует и помогает? Выдай JSON.`;

      for (const curModel of modelsToTry) {
        try {
          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouter_api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: curModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.6,
              max_tokens: 300,
              response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(7000),
          });

          if (resp.ok) {
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
              const parsed = parseAIJson(content);
              if (parsed && parsed.should_act !== false && parsed.dialogue && parsed.action_description) {
                const itemObtained = parsed.item_obtained && parsed.item_obtained !== "null" ? String(parsed.item_obtained).trim() : null;

                if (itemObtained) {
                  try {
                    await supabase.rpc("add_item_to_inventory", {
                      p_npc_id: companion.id,
                      p_item_name: itemObtained,
                      p_quantity: 1,
                      p_type: "consumable",
                      p_attributes: { fresh: true, collected_by: companion.name },
                    });
                  } catch (itemErr) {
                    console.warn("[npc_autonomous_engine] Failed to add companion item:", itemErr);
                  }
                }

                return {
                  npc_name: companion.name,
                  dialogue: parsed.dialogue.startsWith("«") ? parsed.dialogue : `«${parsed.dialogue.replace(/^["'«]|["'»]$/g, "")}»`,
                  item_obtained: itemObtained || undefined,
                  action_description: parsed.action_description,
                };
              }
            }
          }
        } catch (mErr) {
          console.warn(`[npc_autonomous_engine] Model ${curModel} companion action failed, trying next:`, mErr);
        }
      }
    } catch (llmErr) {
      console.warn("[npc_autonomous_engine] Companion LLM check error, falling back to procedural:", llmErr);
    }
  }

  // 2. Процедурный умный fallback (если LLM недоступна или нет сети)
  const lowerText = rawAction.toLowerCase();
  let itemToFind: string | null = null;
  let dialogue = `«${acting_player_name}, я прикрою тебя и помогу, на меня всегда можешь положиться!»`;
  let actionDesc = `${companion.name} внимательно следит за окружением и ассистирует ${acting_player_name}.`;

  if (lowerText.includes("вод") || lowerText.includes("пить") || lowerText.includes("ручей")) {
    itemToFind = "Охапка сухих дров";
    dialogue = `«${acting_player_name}, отлично, набирай воду, а я пока соберу сухих веток для костра!»`;
    actionDesc = `${companion.name} собрал охапку сухих веток и сложил их в центре стоянки.`;
  } else if (lowerText.includes("хворост") || lowerText.includes("дров") || lowerText.includes("костер") || lowerText.includes("костёр")) {
    itemToFind = "Горсть спелых лесных ягод";
    dialogue = `«${acting_player_name}, ты руби дрова, а я осмотрю кустарники на опушке — кажется, там была спелая малина!»`;
    actionDesc = `${companion.name} насобирал горсть спелых лесных ягод и угостил ${acting_player_name}.`;
  } else if (lowerText.includes("ран") || lowerText.includes("леч") || lowerText.includes("кровь") || lowerText.includes("бинт")) {
    itemToFind = "Целебный подорожник";
    dialogue = `«Держись, ${acting_player_name}! Я знаю, как остановить кровь и затянуть рану.»`;
    actionDesc = `${companion.name} наложил чистую повязку и помог обработать повреждения.`;
  }

  if (itemToFind) {
    try {
      await supabase.rpc("add_item_to_inventory", {
        p_npc_id: companion.id,
        p_item_name: itemToFind,
        p_quantity: 1,
        p_type: "consumable",
        p_attributes: { fresh: true, collected_by: companion.name },
      });
    } catch (err) {
      console.warn("[npc_autonomous_engine] Failed to add companion item:", err);
    }
  }

  return {
    npc_name: companion.name,
    dialogue,
    item_obtained: itemToFind || undefined,
    action_description: actionDesc,
  };
}

/**
 * Обработка приглашения NPC в спутники / путешествие / отряд.
 * Срабатывает при высоком уровне отношений (friendly, trusted, devoted или score >= 20).
 */
export type CompanionDialogueType = "invitation_accepted" | "invitation_rejected" | "proactive_offer";

/**
 * Процедурный генератор реплик спутников по архетипам, привычкам и коронным фразам (Offline / Fallback).
 * Обеспечивает уникальный голос для каждого класса и характера без шаблонности.
 */
export function generateProceduralCompanionDialogue(params: {
  npc: any;
  player_name: string;
  relationship: { score: number; tier: string };
  type: CompanionDialogueType;
}): string {
  const { npc, player_name, relationship, type } = params;
  const name = npc.name || "Спутник";
  const npcClass = (npc.class || "").toLowerCase();
  const race = (npc.race || "").toLowerCase();
  const tags = Array.isArray(npc.status_tags) ? npc.status_tags.map((t: string) => t.toLowerCase()) : [];
  const habits = Array.isArray(npc.habits) ? npc.habits : [];
  const catchphrases = Array.isArray(npc.catchphrases) ? npc.catchphrases : [];
  const tier = relationship.tier || "neutral";

  // Префикс привычки/действия персонажа
  let actionPrefix = "";
  if (habits.length > 0) {
    actionPrefix = `[${name} ${habits[0]}] `;
  }

  // Коронная фраза (если есть)
  const catchphrase = catchphrases.length > 0 ? catchphrases[0] : null;

  // Определение архетипа
  const isBeast = npc.category === "beast" || tags.includes("питомец") || tags.includes("приручен") ||
    ["зверь", "волк", "животное", "медведь", "пес", "кот", "грифон", "тигр"].some((w) => race.includes(w) || name.toLowerCase().includes(w));

  const isWarrior = !isBeast && (
    ["воин", "варвар", "рыцарь", "паладин", "наемник", "боец", "дворф"].some((w) => npcClass.includes(w) || race.includes(w) || tags.includes(w))
  );

  const isMage = !isBeast && !isWarrior && (
    ["маг", "волшебник", "чародей", "колдун", "ученый", "эльф", "арканист"].some((w) => npcClass.includes(w) || race.includes(w) || tags.includes(w))
  );

  const isRogue = !isBeast && !isWarrior && !isMage && (
    ["плут", "вор", "следопыт", "охотник", "разведчик", "убийца", "стрелок"].some((w) => npcClass.includes(w) || tags.includes(w))
  );

  const isCleric = !isBeast && !isWarrior && !isMage && !isRogue && (
    ["жрец", "священник", "целитель", "монах", "друид"].some((w) => npcClass.includes(w) || tags.includes(w))
  );

  // 1) Питомец / Зверь
  if (isBeast) {
    if (type === "invitation_accepted") {
      return `[${name} радостно взмахивает хвостом, издает дружелюбный рык и преданно трется о плечо ${player_name}, признавая своего вожака].`;
    }
    if (type === "proactive_offer") {
      return `[${name} нетерпеливо переступает лапами, тихо урчит и тычется носом в ладонь ${player_name}, выразительно глядя на тропу и просясь бежать рядом].`;
    }
    return `[${name} настороженно прижимает уши, делает шаг назад и с недоверием следит за движениями ${player_name}].`;
  }

  // 2) Воин / Наёмник / Дворф
  if (isWarrior) {
    if (type === "invitation_accepted") {
      if (tier === "devoted") {
        return `${actionPrefix}«Пока бьётся моё сердце, ${player_name}, мой клинок и моя жизнь принадлежат нашему общему делу. Веди вперёд — я прикрою твою спину в любом пекле!»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«Отличный выбор, ${player_name}! Вдвоём мы сокрушим любую тварь, а звон нашей стали запомнят надолго. По рукам — я иду с тобой!»`;
      }
      return `${actionPrefix}«С удовольствием пойду с тобой, ${player_name}! Вместе мы преодолеем любые опасности и одолеем любого врага на нашем пути.»`;
    }
    if (type === "proactive_offer") {
      if (tier === "devoted") {
        return `${actionPrefix}«${player_name}, куда бы ты ни держал(а) путь, я не оставлю тебя без верного меча рядом. Позволишь мне пойти с тобой? Я клянусь прикрывать тебя до последнего вздоха!»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«Эй, ${player_name}! Моя секира заржавеет без настоящего боя, а на трактах сейчас неспокойно. Позволишь мне пойти с тобой? Вдвоём мы снесём любую преграду!»`;
      }
      return `${actionPrefix}«${player_name}, одному на опасных дорогах легко сложить голову, а вдвоём мы станем отличным боевым отрядом. Позволишь мне пойти с тобой? Спина к спине мы одолеем любые испытания!»`;
    }
    return `${actionPrefix}«${player_name}, клинок достают из ножен только за тех, кого хорошо знаешь. Пока я не вижу причин рисковать своей шкурой рядом с тобой.»`;
  }

  // 3) Маг / Эльф / Учёный
  if (isMage) {
    if (type === "invitation_accepted") {
      if (tier === "devoted") {
        return `${actionPrefix}«Плетения судьбы и магии неразрывно связали нас, ${player_name}. Мои тайные знания и мощь заклинаний всецело к твоим услугам — я пойду за тобой куда угодно.»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«Твои поиски ведут к истинному величию, ${player_name}. Мои чары дополнят твоё мастерство, и вместе мы раскроем любые тайны этого мира. Я с тобой.»`;
      }
      return `${actionPrefix}«Разумное решение, ${player_name}. В глуши и на трактах мало кто понимает суть древних знаков и тайных сил так, как я. Я пойду с тобой.»`;
    }
    if (type === "proactive_offer") {
      if (tier === "devoted") {
        return `${actionPrefix}«${player_name}, древние пророчества и звёзды шепчут мне, что твой путь полон великих свершений. Моё место — рядом с тобой. Позволишь мне пойти с тобой?»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«${player_name}, я чувствую, что впереди нас ждут неизведанные аномалии и древние артефакты. Путешествовать без знатока тайных искусств — безрассудство. Позволишь мне пойти с тобой?»`;
      }
      return `${actionPrefix}«${player_name}, впереди опасные тропы, где грубая сила бессильна перед чарами. Позволишь мне пойти с тобой? Мои заклинания и мудрость сберегут наши жизни.»`;
    }
    return `${actionPrefix}«${player_name}, древние тайны требуют осторожности, как и выбор попутчиков. Наше знакомство пока слишком поверхностно для столь опасного похода.»`;
  }

  // 4) Плут / Следопыт / Охотник
  if (isRogue) {
    if (type === "invitation_accepted") {
      if (tier === "devoted") {
        return `${actionPrefix}«Немногим я открываю свою спину, ${player_name}, но тебе я верю без оглядки. Я пойду впереди — ни одна стрела и ни одна скрытая ловушка не застанут нас врасплох.»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«Хех, отличная сделка, ${player_name}! Забытые руины, звонкая добыча и верный лук наготове... Сработаемся на славу, я с тобой в доле!»`;
      }
      return `${actionPrefix}«Договорились, ${player_name}. Кто-то же должен высматривать засады и снимать часовых из тени, пока ты прорываешься вперёд.»`;
    }
    if (type === "proactive_offer") {
      if (tier === "devoted") {
        return `${actionPrefix}«${player_name}, ты собираешься в путь, а я не привык(ла) оставлять тех, кто мне дорог, один на один с опасностью. Позволишь мне пойти с тобой? Пусть враги боятся каждого шороха в кустах.»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«Эй, ${player_name}, ты ведь не думаешь соваться в неизведанные дебри без того, кто чует ловушки за версту? Позволишь мне пойти с тобой? Добычу поделим честно, а спины прикроем надежно!»`;
      }
      return `${actionPrefix}«${player_name}, на этих дорогах полно разбойников и капканов. Позволишь мне пойти с тобой? В разведке мне нет равных, а вдвоём мы пройдём незамеченными там, где другие полягут.»`;
    }
    return `${actionPrefix}«Не так быстро, ${player_name}. В моём ремесле доверяют только проверенным соратникам. Покажи на деле, чего ты стоишь, тогда и поговорим о совместной добыче.»`;
  }

  // 5) Жрец / Целитель / Монах
  if (isCleric) {
    if (type === "invitation_accepted") {
      if (tier === "devoted") {
        return `${actionPrefix}«Да благословят высшие силы наш союз, ${player_name}. Моя вера, молитвы и исцеляющие руки будут щитом на твоём пути. Я пойду за тобой через любые испытания.»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«В твоих поступках горит свет надежды, ${player_name}. Я сочту за честь разделить с тобой тяготы странствий и оберегать твою жизнь от гибели. Я иду с тобой.»`;
      }
      return `${actionPrefix}«Да пребудет с нами благословение, ${player_name}. Путь долог и полон ран, но пока я рядом — твоё здоровье в надёжных руках. Я пойду с тобой.»`;
    }
    if (type === "proactive_offer") {
      if (tier === "devoted") {
        return `${actionPrefix}«${player_name}, моё сердце подсказывает, что твоя стезя благословенна. Я не могу оставаться здесь, зная, что могу защитить тебя от тьмы и исцелить любую рану. Позволишь мне пойти с тобой?»`;
      }
      if (tier === "trusted") {
        return `${actionPrefix}«${player_name}, в этих землях сгущается мрак, и путешествовать без защиты веры и целительного дара опасно. Позволишь мне пойти с тобой? Вместе мы преодолеем любые испытания.»`;
      }
      return `${actionPrefix}«${player_name}, дорога впереди нелегка, и многим путникам не хватает доброй молитвы и целебных трав. Позволишь мне пойти с тобой? Я позабочусь о том, чтобы каждый из нас вернулся живым.»`;
    }
    return `${actionPrefix}«${player_name}, моё служение требует терпения и верности. Пока высшие силы не дают мне знака, что мне следует разделить твой путь.»`;
  }

  // 6) Общий странник / искатель приключений (Default)
  if (type === "invitation_accepted") {
    if (catchphrase) {
      return `${actionPrefix}«"${catchphrase}" С удовольствием пойду с тобой, ${player_name}! Вместе мы преодолеем любые опасности и одолеем любую тварь на нашем пути.»`;
    }
    if (tier === "devoted") {
      return `${actionPrefix}«Для меня великая честь быть твоим спутником, ${player_name}! Куда бы ни лежал наш путь — я пойду с тобой до самого конца.»`;
    }
    if (tier === "trusted") {
      return `${actionPrefix}«С удовольствием пойду с тобой, ${player_name}! Мы уже доказали, чего стоим вместе. Вперёд, навстречу новым приключениям!»`;
    }
    return `${actionPrefix}«С удовольствием пойду с тобой, ${player_name}! Вместе мы преодолеем любые опасности и одолеем любую тварь на нашем пути.»`;
  }

  if (type === "proactive_offer") {
    if (catchphrase) {
      return `${actionPrefix}«"${catchphrase}" ${player_name}, мы отлично ладим, и я вижу, что ты собираешься в путь дальше. Позволишь мне пойти с тобой? Вдвоём мы станем отличной командой и прикроем друг другу спину!»`;
    }
    if (tier === "devoted") {
      return `${actionPrefix}«${player_name}, мы прошли через столько испытаний, и я не представляю свой путь без тебя. Позволишь мне пойти с тобой? Я буду стоять за тебя горой до последнего вздоха!»`;
    }
    return `${actionPrefix}«${player_name}, мы отлично ладим, и я вижу, что ты собираешься в путь дальше. Позволишь мне пойти с тобой? Вдвоём мы станем отличной командой и прикроем друг другу спину!»`;
  }

  // invitation_rejected
  return `${actionPrefix}«${player_name}, мы пока ещё недостаточно близки, чтобы я отправлялась с тобой в опасный путь. Нам стоит получше узнать друг друга.»`;
}

/**
 * Генерирует диалог спутника: приоритетно через OpenRouter LLM, с откатом к процедурному движку.
 */
export async function generateCompanionDialogue(params: {
  npc: any;
  player_name: string;
  relationship: { score: number; tier: string };
  type: CompanionDialogueType;
  openrouter_api_key?: string;
  model?: string;
}): Promise<string> {
  const { npc, player_name, relationship, type, openrouter_api_key, model } = params;

  if (openrouter_api_key) {
    try {
      const systemPrompt = `Ты — ролевой ИИ в ЛитРПГ/D&D игре. Твоя задача — сгенерировать ОДНУ прямую реплику персонажа (NPC), обращенную к конкретному игроку (${player_name}).
Реплика должна СТРОГО отражать уникальный характер персонажа, его расу, класс, привычки, коронные фразы и текущие отношения.
Отвечай ТОЛЬКО репликой персонажа от первого лица в русских кавычках «...». Без вводных слов, пояснений и метаданных.`;

      const userPrompt = `NPC: ${npc.name || "Спутник"}
Раса: ${npc.race || "Человек"}, Класс: ${npc.class || "Странник"}
Предыстория / Характер: ${npc.background || "Искатель приключений"}
Привычки: ${Array.isArray(npc.habits) && npc.habits.length > 0 ? npc.habits.join(", ") : "Нет"}
Коронные фразы: ${Array.isArray(npc.catchphrases) && npc.catchphrases.length > 0 ? npc.catchphrases.join(", ") : "Нет"}
Отношения с игроком (${player_name}): ${relationship.score} / 100 (${relationship.tier})

Событие: ${
        type === "proactive_offer"
          ? `NPC САМ проявляет инициативу и просится в команду / отряд / совместное путешествие к ${player_name}.`
          : type === "invitation_accepted"
          ? `Игрок ${player_name} позвал NPC в отряд / путешествие, и NPC с радостью соглашается.`
          : `Игрок ${player_name} зовет NPC с собой, но NPC отказывается из-за недоверия или нежелания рисковать.`
      }

Сгенерируй живую, выразительную реплику (1-2 предложения), обращаясь к игроку по имени (${player_name}).`;

      const modelsToTry = [
        model || "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemini-2.5-flash:free",
        "qwen/qwen3-235b-a22b:free",
      ];

      for (const curModel of modelsToTry) {
        try {
          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouter_api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: curModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 150,
            }),
            signal: AbortSignal.timeout(4500),
          });

          if (resp.ok) {
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 5) {
              return content.startsWith("«") ? content : `«${content.replace(/^["'«]|["'»]$/g, "")}»`;
            }
          }
        } catch (subErr) {
          console.warn(`[npc_autonomous_engine] Dialogue model ${curModel} failed:`, subErr);
        }
      }
    } catch (e) {
      console.warn("[npc_autonomous_engine] OpenRouter dialogue generation failed, falling back to procedural:", e);
    }
  }

  return generateProceduralCompanionDialogue({
    npc,
    player_name,
    relationship,
    type,
  });
}

/**
 * Обработка приглашения NPC в спутники / путешествие / отряд.
 * Срабатывает при высоком уровне отношений (friendly, trusted, devoted или score >= 20).
 */
export async function handleCompanionInvitation(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  acting_player_id: string;
  location_npcs: any[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<{
  npc_id: string;
  npc_name: string;
  dialogue: string;
  joined_party: boolean;
} | null> {
  const { supabase, player_action_text, acting_player_name, acting_player_id, location_npcs, openrouter_api_key, model } = params;
  if (!location_npcs || location_npcs.length === 0) return null;

  const lowerText = (player_action_text || "").toLowerCase();
  const isInvite =
    lowerText.includes("пойд") ||
    lowerText.includes("следуй") ||
    lowerText.includes("вместе") ||
    lowerText.includes("в отряд") ||
    lowerText.includes("в путешеств") ||
    lowerText.includes("на охоту");

  if (!isInvite) return null;

  // Ищем дружелюбного живого NPC
  const candidate = location_npcs.find((n) => {
    if (n.is_hostile || n.is_alive === false) return false;
    if (n.name && lowerText.includes(n.name.toLowerCase())) return true;
    return true;
  });

  if (!candidate) return null;

  // Проверяем отношения с игроком в npc_relationships
  const { data: rel } = await supabase
    .from("npc_relationships")
    .select("score, tier, status_tags")
    .eq("npc_id", candidate.id)
    .eq("player_id", acting_player_id)
    .maybeSingle();

  const score = rel?.score ?? 0;
  const tier = rel?.tier ?? "neutral";
  const isGoodRelationship = score >= 20 || ["friendly", "trusted", "devoted"].includes(tier);

  if (!isGoodRelationship) {
    const rejectDialogue = await generateCompanionDialogue({
      npc: candidate,
      player_name: acting_player_name,
      relationship: { score, tier },
      type: "invitation_rejected",
      openrouter_api_key,
      model,
    });

    return {
      npc_id: candidate.id,
      npc_name: candidate.name,
      dialogue: rejectDialogue,
      joined_party: false,
    };
  }

  // NPC соглашается стать спутником и присоединиться к отряду!
  const currentTags = Array.isArray(candidate.status_tags) ? candidate.status_tags : [];
  const updatedTags = Array.from(new Set([...currentTags, "спутник", "в_отряде"]));

  await supabase
    .from("npcs")
    .update({
      role: "companion",
      status_tags: updatedTags,
    })
    .eq("id", candidate.id);

  if (rel) {
    const relTags = Array.from(new Set([...(rel.status_tags || []), "спутник", "в_отряде"]));
    await supabase
      .from("npc_relationships")
      .update({ status_tags: relTags })
      .eq("npc_id", candidate.id)
      .eq("player_id", acting_player_id);
  }

  const acceptDialogue = await generateCompanionDialogue({
    npc: candidate,
    player_name: acting_player_name,
    relationship: { score, tier },
    type: "invitation_accepted",
    openrouter_api_key,
    model,
  });

  return {
    npc_id: candidate.id,
    npc_name: candidate.name,
    dialogue: acceptDialogue,
    joined_party: true,
  };
}

/**
 * Проактивная инициатива NPC: NPC САМ предлагает отправиться в путешествие с игроком,
 * если уровень доверия и симпатии высок (score >= 25 или friendly/trusted/devoted),
 * а NPC ещё не состоит в отряде.
 */
export async function checkNpcProactiveCompanionOffer(params: {
  supabase: any;
  acting_player_name: string;
  acting_player_id: string;
  location_npcs: any[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<{
  npc_id: string;
  npc_name: string;
  dialogue: string;
  proactive_offer: boolean;
} | null> {
  const { supabase, acting_player_name, acting_player_id, location_npcs, openrouter_api_key, model } = params;
  if (!location_npcs || location_npcs.length === 0) return null;

  // Ищем дружелюбного живого NPC, который ещё не спутник
  const candidate = location_npcs.find((n) => {
    if (n.is_hostile || n.is_alive === false) return false;
    const tags = Array.isArray(n.status_tags) ? n.status_tags : [];
    if (tags.includes("спутник") || tags.includes("в_отряде") || tags.includes("предложил_спутничество")) return false;
    return true;
  });

  if (!candidate) return null;

  // Проверяем отношения
  const { data: rel } = await supabase
    .from("npc_relationships")
    .select("score, tier, status_tags")
    .eq("npc_id", candidate.id)
    .eq("player_id", acting_player_id)
    .maybeSingle();

  const score = rel?.score ?? 0;
  const tier = rel?.tier ?? "neutral";
  const isHighAffinity = score >= 25 || ["friendly", "trusted", "devoted"].includes(tier);

  if (!isHighAffinity) return null;

  // Фиксируем флаг, чтобы не спамить предложением каждый ход
  const currentTags = Array.isArray(candidate.status_tags) ? candidate.status_tags : [];
  const updatedTags = Array.from(new Set([...currentTags, "предложил_спутничество", "готов_в_путь"]));

  await supabase
    .from("npcs")
    .update({ status_tags: updatedTags })
    .eq("id", candidate.id);

  const dialogue = await generateCompanionDialogue({
    npc: candidate,
    player_name: acting_player_name,
    relationship: { score, tier },
    type: "proactive_offer",
    openrouter_api_key,
    model,
  });

  return {
    npc_id: candidate.id,
    npc_name: candidate.name,
    dialogue,
    proactive_offer: true,
  };
}

/**
 * Разрешает долгосрочные экспедиции NPC за кадром (Lazy Resolution по календарю).
 * Срабатывает, когда игровое время дошло до activity_ends_game_time.
 * Тратит 0 токенов во время обычных ходов!
 */
export async function resolveNpcBackgroundActivities(params: {
  supabase: any;
  world_id: string;
  current_game_time: GameTimePoint;
}): Promise<Array<{
  npc_id: string;
  npc_name: string;
  summary: string;
  loot: string[];
  xp_gained: number;
  leveled_up: boolean;
  new_level: number;
}>> {
  const { supabase, world_id, current_game_time } = params;
  if (!world_id) return [];

  const currentMinutes = gameTimeToMinutes(current_game_time);

  // Находим NPC мира, у которых есть незавершённая деятельность
  const { data: activeNpcs, error } = await supabase
    .from("npcs")
    .select("id, name, race, role, level, xp, stats, current_activity, activity_data, location_id")
    .eq("world_id", world_id)
    .not("current_activity", "is", null);

  if (error || !activeNpcs || activeNpcs.length === 0) {
    return [];
  }

  const results: any[] = [];

  for (const npc of activeNpcs) {
    const actData = npc.activity_data || {};
    const endsTime = actData.ends_game_time;
    if (!endsTime) continue;

    const endsMinutes = gameTimeToMinutes(endsTime);

    // Если срок экспедиции ещё не подошёл — пропускаем (0 токенов, 0 лишних действий)
    if (currentMinutes < endsMinutes) {
      continue;
    }

    // Время экспедиции завершилось! Начисляем результаты
    const daysDuration = actData.duration_days || 3;
    const xpGained = daysDuration * 50; // 50 XP за день охоты/тренировки
    const newXp = (npc.xp || 0) + xpGained;
    const xpForLevel = (npc.level || 1) * 100;
    const leveledUp = newXp >= xpForLevel && (npc.level || 1) < 100;
    const newLevel = leveledUp ? (npc.level || 1) + 1 : (npc.level || 1);

    const lootItems = actData.expected_loot || [
      "Шкура взрослого оленя",
      "Свежая дичь (3 порции)",
      "Клыки лесного волка",
    ];

    // Добавляем трофеи в инвентарь NPC
    for (const item of lootItems) {
      try {
        await supabase.rpc("add_item_to_inventory", {
          p_npc_id: npc.id,
          p_item_name: item,
          p_quantity: 1,
          p_type: "misc",
          p_attributes: { obtained_from_hunt: true },
        });
      } catch (itemErr) {
        console.warn(`[npc_autonomous_engine] Failed to add loot item ${item}:`, itemErr);
      }
    }

    const returnLocationId = actData.origin_location_id || npc.location_id;
    const memoryText = `Завершила долгосрочную экспедицию (${npc.current_activity}, ${daysDuration} дн.). Добыто: ${lootItems.join(", ")}. Получено ${xpGained} опыта${leveledUp ? `, новый уровень ${newLevel}!` : "."}`;

    // Записываем воспоминание NPC о походе
    try {
      await supabase.from("npc_memories").insert({
        npc_id: npc.id,
        player_id: actData.associated_player_id || null,
        memory_text: memoryText,
        vividness: 8,
        tier: "vivid",
        emotional_tone: "positive",
        significance_reason: "Успешная автономная охота и прокачка навыков",
      });
    } catch (memErr) {
      console.warn("[npc_autonomous_engine] Failed to insert hunt memory:", memErr);
    }

    // Обновляем NPC: очищаем деятельность, сохраняем уровень, статы и возвращаем в локацию
    const updatedStats = { ...(npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }) };
    if (leveledUp) {
      // Авто-распределение статов в зависимости от расы/роли
      updatedStats.STR = (updatedStats.STR || 10) + 1;
      updatedStats.DEX = (updatedStats.DEX || 10) + 1;
    }

    await supabase
      .from("npcs")
      .update({
        level: newLevel,
        xp: leveledUp ? newXp - xpForLevel : newXp,
        stats: updatedStats,
        location_id: returnLocationId,
        current_activity: null,
        activity_data: null,
        last_activity_time: new Date().toISOString(),
      })
      .eq("id", npc.id);

    results.push({
      npc_id: npc.id,
      npc_name: npc.name,
      summary: memoryText,
      loot: lootItems,
      xp_gained: xpGained,
      leveled_up: leveledUp,
      new_level: newLevel,
    });
  }

  return results;
}
