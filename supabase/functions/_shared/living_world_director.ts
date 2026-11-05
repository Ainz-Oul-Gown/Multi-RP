// supabase/functions/_shared/living_world_director.ts
// Режиссёр Живого Мира (Proactive World Director) и генератор тактических выборов игрока.
// Работает за 0 дополнительных токенов: превращает пассивные ходы («выхожу из таверны»,
// «иду по улице», «жду», «осматриваюсь») в активные события, дилеммы и инициативу NPC,
// чтобы игрок решал задачи и выбирал действия, а не придумывал сюжет за Мастера.

import { SystemTruthDto } from "../process-turn/steps/step4_system_truth.ts";

export interface ProactiveWorldDirective {
  is_passive_or_routine_action: boolean;
  event_category: "combat_tactical" | "story_catalyst" | "npc_initiative" | "world_incident";
  headline: string;
  master_instruction: string;
  fallback_narrative_hook: string;
  suggested_choices: string[];
}

const PASSIVE_ACTION_PATTERNS = [
  /^(?:я\s+)?(?:просто\s+)?(?:осматриваюсь|оглядываюсь|смотрю\s+по\s+сторонам|наблюдаю|жду|подожду|выжидаю|скучаю|сижу|стою|ничего\s+не\s+делаю|отдыхаю|пью|ем|гуляю|брожу)/i,
  /(?:выхожу|выйти)\s+из\s+(?:таверн|трактир|дом|здани|комнат|лавк)/i,
  /(?:иду|шагаю|бреду|прогуливаюсь)\s+(?:по\s+улиц|по\s+дорог|по\s+город|по\s+деревн|впер[её]д|дальше)/i,
  /(?:что\s+происходит|что\s+вокруг|что\s+нового|опиши\s+обстановку|опиши\s+появление)/i,
];

function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function isPassiveOrRoutineAction(actionText: string, knowledgeFacts: string[]): boolean {
  const clean = (actionText || "").trim();
  if (!clean || clean.length < 22) {
    if (PASSIVE_ACTION_PATTERNS.some((rx) => rx.test(clean))) return true;
  }
  if (PASSIVE_ACTION_PATTERNS.some((rx) => rx.test(clean))) return true;
  // Если в фактах хода нет ни боя, ни крафта, ни находки, ни диалога с конкретным ответом
  if (!knowledgeFacts || knowledgeFacts.length === 0) return true;
  const joinedFacts = knowledgeFacts.join(" ").toLowerCase();
  if (
    joinedFacts.includes("переместился в направлении") &&
    !joinedFacts.includes("ун") &&
    !joinedFacts.includes("наш") &&
    !joinedFacts.includes("обращается")
  ) {
    return true;
  }
  return false;
}

const CITY_INCIDENTS = [
  {
    headline: "Срочный переполох и подозрительная находка на улице",
    instruction:
      "Прямо перед героем разворачивается острая уличная сцена: торопливый курьер в дорожном плаще оступается на мостовой, спасаясь от двух мрачных соглядатаев, и роняет к ногам героя опечатанный сургучом тубус (или странный медальон), умоляющим взглядом прося не выдавать его.",
    fallback:
      "Едва вы делаете несколько шагов, как из бокового переулка вылетает запыхавшийся гонец в разорванном плаще. Оглядываясь на двух преследователей с тяжёлыми дубинками, он случайно сталкивается с вами и незаметно суёт вам в ладонь холодный бронзовый жетон с тайной печатью: «— Умоляю, спрячьте! Если они отберут его у старого колодца — беды не миновать!»",
    choices: [
      "Спрятать жетон и преградить дорогу преследователям: «Стоять! В чём дело?»",
      "Незаметно укрыть гонца в тени и осмотреть странную печать на жетоне",
      "Окликнуть стражу или потребовать объяснений у обеих сторон конфликта",
    ],
  },
  {
    headline: "Инцидент у купеческой повозки и выгодное предложение",
    instruction:
      "Впереди на улице с грохотом ломается ось гружёной повозки торговца редкостями. Из треснувшего ящика выкатывается необычный артефакт или склянка со светящимся эликсиром, к которой уже тянется рука уличного воришки, пока хозяин повозки зовёт на помощь.",
    fallback:
      "В нескольких шагах от вас с треском ломается колесо окованной железом повозки. Из упавшего ларца по брусчатке раскатываются диковинные склянки с серебристым свечением, а юркий уличный карманник в сером балахоне уже тянет руку к самому ценному свёртку, пока встревоженный купец громко ищет помощи.",
    choices: [
      "Перехватить руку воришки и вернуть свёрток купцу, рассчитывая на награду",
      "Помочь купцу поднять груз и расспросить его, что за редкий товар он везёт",
      "Присмотреться к странному свёртку и незаметно проследить за воришкой",
    ],
  },
  {
    headline: "Спор у доски объявлений и срочный контракт",
    instruction:
      "У перекрёстка или выхода из заведения собралась взволнованная толпа: десятник стражи только что прибил свежий указ о щедрой награде за опасное расследование и, заметив вооружённого героя, прямо обращается к нему с предложением взяться за дело.",
    fallback:
      "У фонарного столба неподалёку собралась кучка встревоженных горожан. Десятник местной стражи ударом кинжала прибивает к доске свежий пергамент с сургучной печатью и, заметив вас в толпе, решительно подходит ближе: «— Эй, путник! Вижу, ты не из робкого десятка. Нам позарез нужен человек со светлой головой и крепкой рукой — заплатим звонкой монетой, если разберёшься в одном тёмном деле уже сегодня!»",
    choices: [
      "Подойти к десятнику и спросить: «О каком деле речь и сколько платите?»",
      "Внимательно прочитать свежий указ на доске и послушать, о чём шепчется толпа",
      "Осмотреть снаряжение десятника и уточнить, почему стража не справилась сама",
    ],
  },
  {
    headline: "Тайный знак и приглашение к закрытому разговору",
    instruction:
      "Из тени крыльца или соседнего столика за героем внимательно наблюдает колоритный незнакомец (или местный информатор). Он делает недвусмысленный жест подойти, намекая, что знает важную тайну об этом месте и готов поделиться за небольшую услугу.",
    fallback:
      "Ваше внимание привлекает невысокий человек в промасленном дорожном плаще у каменной арки: он выразительно постукивает серебряным перстнем по рукояти кинжала и кивает вам. Когда ваши взгляды встречаются, он негромко произносит: «— Не советую идти дальше вслепую. В этом квартале за чужаками уже приглядывают... Подойди на пару слов, есть разговор не для лишних ушей.»",
    choices: [
      "Подойти к незнакомцу, держа ладонь ближе к оружию: «Говори, что тебе известно»",
      "Оглядеть крыши и переулки вокруг — проверить, кто именно следит за улицей",
      "Ответить с холодной усмешкой и выяснить, чего он хочет взамен за информацию",
    ],
  },
];

const WILDERNESS_INCIDENTS = [
  {
    headline: "Брошенный привал со следами недавней схватки",
    instruction:
      "На пути героя обнаруживается ещё дымящийся чужой костёр, опрокинутая походная сумка с запертой шкатулкой и две свежие цепочки следов — одна уходит в чащу, а другая ведёт к скальному выступу, откуда доносится подозрительный шорох.",
    fallback:
      "Тропа выводит вас на небольшую поляну, где среди примятой травы ещё тлеют угли недавнего костра. Рядом валяется разрубленный кожаный ранец и окованная медью шкатулка со сложным замком, а на влажной земле отчётливо видны следы борьбы, уходящие в сторону старого грота.",
    choices: [
      "Осмотреть медную шкатулку и попытаться аккуратно вскрыть или изучить замок",
      "Изучить свежие следы на земле и осторожно двинуться в сторону грота",
      "Занять укрытие за деревьями и прислушаться — не засада ли это",
    ],
  },
  {
    headline: "Путник в западне и опасная развилка",
    instruction:
      "Впереди слышится звон металла и треск ветвей: раненый следопыт или странствующий торговец отбивается от дикой твари (или пытается выбраться из охотничьей ловушки) рядом со старинным дорожным камнем.",
    fallback:
      "Сквозь шум ветра доносится резкий вскрик и лязг железа: в тридцати шагах впереди у поваленного дуба раненый охотник пытается разжать зубья старого капкана, пока в густом кустарнике за его спиной хищно блестят жёлтые глаза лесного зверя.",
    choices: [
      "Броситься на помощь охотнику и отпугнуть или атаковать хищника в кустах",
      "Помочь охотнику освободить ногу из капкана и расспросить, кто расставил ловушки",
      "Обойти поляну по дуге и занять выгодную позицию для внезапного удара",
    ],
  },
  {
    headline: "Древний тайник и странная аномалия у тропы",
    instruction:
      "Среди корней векового дерева или у замшелых руин внимание героя привлекает странное свечение и полустёртые руны на каменной плите, под которой явно скрыт древний тайник с механизмом.",
    fallback:
      "У обочины тропы корни огромного дерева оплели расколотую каменную стелу с тускло мерцающими знаками. Под сдвинутой плитой виднеется узкая ниша с кованым ларцом, но тонкая серебряная струна у входа явно соединена со скрытым защитным механизмом.",
    choices: [
      "Аккуратно обезвредить серебряную струну и достать кованый ларец из ниши",
      "Изучить мерцающие знаки на стеле, чтобы понять природу ловушки и тайника",
      "Подцепить ларец с безопасного расстояния веткой или шестом",
    ],
  },
];

export function buildProactiveWorldDirective(params: {
  system_truth: SystemTruthDto;
  acting_player_id: string;
  action_text: string;
  recent_history?: string[];
}): ProactiveWorldDirective {
  const { system_truth, acting_player_id, action_text, recent_history = [] } = params;
  const playerTruth = system_truth.player_truths[acting_player_id];
  const knowledgeFacts = playerTruth?.knowledge || [];
  const isPassive = isPassiveOrRoutineAction(action_text, knowledgeFacts);

  const locationName = system_truth.environment.location_name || "Неизвестная местность";
  const isWild =
    /лес|троп|опушк|гор|пещер|болот|степ|пустош|руин|дикая|тракт|перевал/i.test(locationName) &&
    !/таверн|трактир|лавк|площад|квартал|замок|дворец/i.test(locationName);

  const rawPresentNpcs = system_truth.present_npcs && system_truth.present_npcs.length > 0
    ? system_truth.present_npcs
    : Object.entries(system_truth.npc_context || {}).map(([key, ctx]: [string, any]) => ({
        id: ctx?.npc_id || key,
        name: ctx?.name || key,
        role: ctx?.role || "житель",
        race: ctx?.race || "Человек",
        is_hostile: false,
        speech_style: ctx?.speech_style,
        current_activity: ctx?.motivation,
      }));
  const presentNpcs = rawPresentNpcs.filter((n: any) => !n.is_hostile);
  const hostileNpcs = rawPresentNpcs.filter((n: any) => n.is_hostile);
  const npcContexts = Object.entries(system_truth.npc_context || {}).map(([key, ctx]: [string, any]) => ({
    ...ctx,
    name: ctx?.name || key,
  }));
  const recentJoined = recent_history.join(" ").toLowerCase();
  const seed = simpleHash(`${action_text}|${locationName}|${system_truth.environment.time.hour}:${system_truth.environment.time.minute}|${recent_history.length}`);

  // 1. Если идёт бой или появилась опасная тварь
  if (system_truth.encounter_alert?.spawned || hostileNpcs.length > 0) {
    const enemyName =
      system_truth.encounter_alert?.creature_name ||
      hostileNpcs[0]?.name ||
      "враждебное существо";
    return {
      is_passive_or_routine_action: false,
      event_category: "combat_tactical",
      headline: `Боевое столкновение: ${enemyName} переходит к активным действиям`,
      master_instruction: `Враг (${enemyName}) не стоит как мишень! Опиши его опасный тактический манёвр, подготовку к сокрушительному выпаду или изменение окружения на поле боя, которое ставит перед игроком острую тактическую задачу.`,
      fallback_narrative_hook: `${enemyName} рычит, смещаясь в сторону и выбирая момент для стремительного броска. Медлить нельзя — каждое мгновение решает исход схватки!`,
      suggested_choices: [
        `Атаковать ${enemyName} в уязвимое место, опережая его выпад`,
        `Использовать окружение для укрытия и нанести точный контрудар по ${enemyName}`,
        `Попытаться запугать или сбить с толку ${enemyName} резким манёвром`,
      ],
    };
  }

  // 2. Проверяем активную сюжетную арку и её невыполненные цели
  const currentArc = system_truth.storyline?.current_arc;
  const remainingGoals: string[] = currentArc
    ? (currentArc.goals || []).filter((g: string) => !(currentArc.completed_goals || []).includes(g))
    : [];
  const nextStoryGoal = remainingGoals.length > 0 ? remainingGoals[0] : null;

  // 3. Если в локации есть живые NPC — пусть NPC САМ проявит инициативу или создаст ситуацию!
  if (presentNpcs.length > 0) {
    // Приоритет: сюжетный NPC из key_npcs или тот, кто меньше упоминался в последнем сообщении
    const keyNpcNames = (currentArc?.key_npcs || []).map((k: string) => k.toLowerCase());
    let chosenNpc =
      presentNpcs.find((n) => keyNpcNames.some((kn: string) => n.name.toLowerCase().includes(kn))) ||
      presentNpcs[seed % presentNpcs.length];

    const fullCtx = npcContexts.find((c) => c.npc_id === (chosenNpc as any).id || c.name === chosenNpc.name);
    const rumor = fullCtx?.rumors?.[0] || null;
    const motivation = fullCtx?.motivation || chosenNpc.current_activity || null;
    const speechHint = fullCtx?.speech_style || chosenNpc.speech_style || "живая, характерная речь";

    if (nextStoryGoal) {
      return {
        is_passive_or_routine_action: isPassive,
        event_category: "story_catalyst",
        headline: `Проактивный сюжетный крючок через ${chosenNpc.name} (${chosenNpc.role || "житель"})`,
        master_instruction: `Игрок НЕ должен сам выдумывать сюжет! В 3-м абзаце («МИР ОТВЕЧАЕТ») сделай так, чтобы ${chosenNpc.name} (${chosenNpc.race || "Человек"}, ${chosenNpc.role || "житель"}, манера речи: ${speechHint}) САМ проявил инициативу к герою или оказался в центре острой ситуации прямо перед ним, связанной с текущей целью («${nextStoryGoal}»)${rumor ? ` и слухом («${rumor}»)` : ""}. ${chosenNpc.name} ОБЯЗАН обратиться к герою с прямой речью («— ...»), задать вопрос, предложить сделку или попросить о срочной помощи!`,
        fallback_narrative_hook: `Неожиданно ваше внимание перехватывает ${chosenNpc.name} (${chosenNpc.role || "местный житель"}). Оглянувшись по сторонам, он решительно делает шаг к вам: «— Послушай, ты ведь не просто так здесь слоняешься? Тут назревает серьёзное дело: ${rumor || nextStoryGoal}. Мне пригодится тот, кто умеет принимать решения — ты в деле или пройдёшь мимо?»`,
        suggested_choices: [
          `Обратиться к ${chosenNpc.name}: «Расскажи подробнее, в чём суть дела и какая моя выгода?»`,
          `Выслушать ${chosenNpc.name}, но сначала внимательно осмотреть его и проверить, не ловушка ли это`,
          `Немедленно взяться за задачу: «Я помогу. Веди или показывай, с чего начнём!»`,
          nextStoryGoal ? `Сразу заняться целью: ${nextStoryGoal}` : `Расспросить ${chosenNpc.name} о местных тайнах и слухах`,
        ].slice(0, 3),
      };
    }

    return {
      is_passive_or_routine_action: isPassive,
      event_category: "npc_initiative",
      headline: `Живая инициатива NPC: ${chosenNpc.name} вовлекает героя в ситуацию`,
      master_instruction: `Мир вокруг живой и проактивный! В 3-м абзаце («МИР ОТВЕЧАЕТ») ${chosenNpc.name} (${chosenNpc.race || "Человек"}, ${chosenNpc.role || "обыватель"}) активно действует или САМ заговаривает с героем прямой речью («— ...»), вовлекая его в интересную проблему, спор, просьбу или интригу${motivation ? ` (его цель: ${motivation})` : ""}${rumor ? ` (знает слух: «${rumor}»)` : ""}. Поставь перед игроком конкретный выбор или задачу!`,
      fallback_narrative_hook: `Рядом с вами ${chosenNpc.name} (${chosenNpc.role || "местный житель"}) внезапно отвлекается от своих дел и обращается прямо к вам: «— Эй, путник! У тебя как раз вид человека, который ищет не пустых разговоров, а настоящего дела. ${rumor ? `Говорят, что ${rumor}. ` : ""}Не поможешь разобраться с одной непростой задачей за достойную плату?»`,
      suggested_choices: [
        `Поговорить с ${chosenNpc.name}: «Выкладывай, что за задача и что ты предлагаешь взамен?»`,
        `Оценить намерения ${chosenNpc.name} и расспросить о деталях и возможных опасностях`,
        `Предложить ${chosenNpc.name} свои условия или отправиться проверять слухи лично`,
      ],
    };
  }

  // 4. Если рядом нет конкретных NPC (улица, дорога, дикая зона, выход из таверны) — запускаем динамическое событие мира!
  const pool = isWild ? WILDERNESS_INCIDENTS : CITY_INCIDENTS;
  const incident = pool[seed % pool.length];

  const storyBridge = nextStoryGoal
    ? ` Свяжи это происшествие с зацепкой к сюжетной цели: «${nextStoryGoal}».`
    : "";

  return {
    is_passive_or_routine_action: isPassive,
    event_category: "world_incident",
    headline: incident.headline,
    master_instruction: `ЗАПРЕЩЕНО писать, что «ничего не произошло» или оставлять героя просто стоять на пустой улице/тропе! Введи в сцену активное событие: ${incident.instruction}${storyBridge} Заверши ответ моментом, требующим от игрока немедленного решения!`,
    fallback_narrative_hook: incident.fallback,
    suggested_choices: nextStoryGoal
      ? [
          incident.choices[0],
          incident.choices[1],
          `Направиться к сюжетной цели: ${nextStoryGoal}`,
        ]
      : incident.choices,
  };
}

/**
 * Гарантирует 3–4 качественных, разнообразных варианта выбора для игрока на каждом ходу
 * (использует варианты от LLM, если они валидны, либо дополняет их из контекста сцены и Режиссёра мира).
 */
export function ensurePlayerChoices(params: {
  llmChoices?: any;
  directive: ProactiveWorldDirective;
  system_truth: SystemTruthDto;
  player_id: string;
}): string[] {
  const { llmChoices, directive, system_truth, player_id } = params;
  const cleanList: string[] = [];

  // 1. Извлекаем варианты от LLM, если они пришли
  let rawArr: any[] = [];
  if (Array.isArray(llmChoices)) {
    rawArr = llmChoices;
  } else if (llmChoices && typeof llmChoices === "object") {
    if (Array.isArray(llmChoices[player_id])) {
      rawArr = llmChoices[player_id];
    } else {
      const firstVal = Object.values(llmChoices)[0];
      if (Array.isArray(firstVal)) rawArr = firstVal;
    }
  }

  for (const item of rawArr) {
    const str = typeof item === "string"
      ? item.trim()
      : (item && typeof item === "object" && (item.text || item.action || item.label))
      ? String(item.text || item.action || item.label).trim()
      : "";
    if (!str) continue;
    const cleaned = str
      .replace(/^\s*(?:\d+[.)]|[-•▸])\s*/, "")
      .replace(/^["']+$/, "")
      .trim();
    if (cleaned.length >= 8 && cleaned.length <= 150 && /[а-яёА-ЯЁ]{4,}/.test(cleaned)) {
      if (!cleanList.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
        cleanList.push(cleaned);
      }
    }
  }

  // 2. Дополняем вариантами от Режиссёра Живого Мира, если у LLM меньше 3 вариантов
  for (const fallbackChoice of directive.suggested_choices) {
    if (cleanList.length >= 4) break;
    if (!cleanList.some((c) => c.toLowerCase() === fallbackChoice.toLowerCase())) {
      cleanList.push(fallbackChoice);
    }
  }

  // 3. Если есть активная цель сюжета, а в списке ещё есть место — добавляем сюжетный шаг
  const currentArc = system_truth.storyline?.current_arc;
  const remainingGoals: string[] = currentArc
    ? (currentArc.goals || []).filter((g: string) => !(currentArc.completed_goals || []).includes(g))
    : [];
  if (cleanList.length < 4 && remainingGoals.length > 0) {
    const goalAction = `Заняться сюжетной задачей: ${remainingGoals[0]}`;
    if (!cleanList.some((c) => c.toLowerCase().includes(remainingGoals[0].slice(0, 15).toLowerCase()))) {
      cleanList.push(goalAction);
    }
  }

  return cleanList.slice(0, 4);
}
