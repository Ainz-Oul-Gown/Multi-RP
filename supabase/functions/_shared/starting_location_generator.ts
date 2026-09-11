// supabase/functions/_shared/starting_location_generator.ts
// Генератор стартовой локации на основе карточки персонажа и первого сообщения
import { cleanTextForAI, parseAIJson } from "./utils.ts";
import { resolveNpcRace } from "./npcRaceResolver.ts";

export interface SubzoneInfo {
  id: string;
  name: string;
  description?: string;
  pos_x?: number;
  pos_y?: number;
  radius?: number;
}

export interface AvailableLocationInfo {
  id: string;
  name: string;
  type: string;
  description?: string;
  state_name?: string;
  pos_x?: number;
  pos_y?: number;
  subzones?: SubzoneInfo[];
}

export interface StartingLocationResult {
  is_new_location: boolean;
  location_id: string;
  location_name: string;
  location_type: string;
  state_name: string;
  pos_x?: number;
  pos_y?: number;
  subzone_id?: string | null;
  subzone_name?: string | null;
  weather: string;
  atmosphere: {
    sounds: string[];
    visuals: string[];
  };
  game_time: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  initial_npcs: Array<{
    id: string;
    name: string;
    race: string;
    role: string;
    status_tags: string[];
    background?: string;
  }>;
}

/**
 * Промпт для генерации стартовой локации под персонажа и его вводную реплику
 */
export function buildStartingLocationPrompt(params: {
  player: {
    name: string;
    race?: string;
    class?: string;
    appearance?: string;
    personality?: string;
    bio?: string;
  };
  action_text: string;
  world_name?: string;
  lore_context?: string;
  available_locations?: AvailableLocationInfo[];
}): string {
  const { player, action_text, world_name, lore_context, available_locations } = params;

  let existingLocationsBlock = "";
  if (available_locations && available_locations.length > 0) {
    const locLines = available_locations.map((loc) => {
      const subNames = (loc.subzones || []).map((sz) => sz.name).filter(Boolean);
      const subStr = subNames.length > 0 ? `\n    Подзоны / места: ${subNames.join(", ")}` : "";
      const descStr = loc.description ? `\n    Описание: ${cleanTextForAI(loc.description)}` : "";
      return `- "${loc.name}" (тип: ${loc.type}${loc.state_name ? `, регион: ${loc.state_name}` : ""})${descStr}${subStr}`;
    });

    existingLocationsBlock = `
ДОСТУПНЫЕ СУЩЕСТВУЮЩИЕ ЛОКАЦИИ МИРА (ВЫБЕРИ ИЗ НИХ):
${locLines.join("\n")}

ПРАВИЛА ВЫБОРА ЛОКАЦИИ ИЗ СПИСКА:
1. **Строго выбери одну из существующих локаций выше**:
   - Если игрок просит появление в деревне/деревушке/селе («в деревушке», «в селе», «в тихой деревне» и т.п.) — найди наиболее подходящую локацию с типом "village".
   - Если игрок просит появление в столице («в столице», «во дворце правителя» и т.п.) — найди локацию с типом "capital".
   - Если игрок просит город («в городе», «в портовом городе») — выбери наиболее подходящую локацию с типом "city" или "capital".
   - Если игрок просит руины/подземелье/замок/дикую местность — выбери подходящую по типу ("ruins", "dungeon", "landmark", "fortress", "wilderness").
   - Если игрок не уточнил тип локации (например «оглядываюсь», «начинаю путь»), выбери наиболее естественную локацию из списка под расу, класс и биографию героя.
2. **Выбор подзоны (selected_subzone)**:
   - В выбранной локации выбери конкретную подзону из списка её подзон (например, таверна, центральная площадь, главные ворота, причал, рыночная площадь).
   - Если игрок уточнил конкретное место (например «сижу в таверне»), выбери подзону-таверну, если она есть, или наиболее близкую.
   - Если подходящей подзоны в списке нет или список пуст, укажи логичное название подзоны (например, "Главная площадь" или "Трактир").
3. **ВАЖНО**:
   - В поле "location_name" верни ТОЧНОЕ название локации из списка доступных! Не выдумывай новое название, если в списке есть подходящая локация.
   - В поле "location_type" верни её тип.
`;
  }

  return `Ты — гейм-мастер текстовой ЛитРПГ игры.
Игрок начинает игру и делает свой ПЕРВЫЙ ход. Твоя задача — определить идеальную стартовую локацию, идеально подходящую под персонажа и его первое сообщение.

КАРТОЧКА ГЕРОЯ:
- Имя: ${player.name}
- Раса: ${player.race || "Человек"}
- Класс: ${player.class || "Искатель приключений"}
${player.appearance ? `- Внешность: ${player.appearance}` : ""}
${player.personality ? `- Характер: ${player.personality}` : ""}
${player.bio ? `- Предыстория: ${player.bio}` : ""}

ПЕРВОЕ ДЕЙСТВИЕ ИГРОКА:
"${cleanTextForAI(action_text)}"

${world_name ? `МИР: ${world_name}` : ""}
${lore_context ? `ЛОР И СЕТТИНГ:\n${lore_context}` : ""}
${existingLocationsBlock}
ПРАВИЛА ГЕНЕРАЦИИ:
1. **Согласованность с действием игрока**:
   - Если игрок прямо написал, где он («сижу в таверне», «просыпаюсь в сырой темнице», «иду по тракту через лес», «стою на пристани»), локация ДОЛЖНА точно отражать это место!
   - Если действие абстрактное («оглядываюсь», «достаю оружие»), подбери колоритное стартовое место, естественное для его класса и расы.
2. **Тип локации (location_type)**:
   Выбери строго один из: 'tavern', 'city', 'village', 'ruins', 'landmark', 'dungeon', 'wilderness', 'fortress', 'settlement', 'camp', 'outpost', 'capital'.
3. **Название (location_name)**:
   Если выше дан список существующих локаций — используй точное имя выбранной локации из списка!
   Если списка нет — придумай красивое, атмосферное фэнтези-название (например: "Таверна «Хромой василиск»", "Опушка Шепчущего леса", "Сторожевая башня Кроухолд").
4. **Подзона (selected_subzone)**:
   Укажи название конкретного места/подзоны внутри локации, где находится игрок (например: таверна, площадь, кузница, ворота, мельница).
5. **Погода и атмосфера**:
   Живые звуки (2-3), визуальные образы (2-3) и погода.
6. **Время (game_time)**:
   Понятный фэнтезийный год (по умолчанию 1248 г.), месяц (1-12, например 5 — май), день (1-30, например 14), час (0-23) и минута. Если игрок написал про ночь/вечер — поставь ночной/вечерний час (20..23).
7. **Начальные NPC (initial_npcs)**:
   1–2 колоритных местных персонажа, которые могут находиться в этой локации (например: трактирщик, стражник, охотник, торговец).

Верни СТРОГО JSON без markdown-обёрток (\`\`\`json):
{
  "location_name": "Таверна «Хромой василиск»",
  "location_type": "tavern",
  "state_name": "Центральные земли",
  "selected_subzone": "Главный зал таверны",
  "description": "Шумный трактир у тракта, наполненный запахом жареного мяса и хмеля.",
  "weather": "Сырой вечерний туман",
  "atmosphere": {
    "sounds": ["гул голосов", "потрескивание очага", "звон кружек"],
    "visuals": ["пляшущие тени от пламени", "дым трубок", "запотевшие окна"]
  },
  "time": {
    "year": 1248,
    "month": 5,
    "day": 14,
    "hour": 19,
    "minute": 30
  },
  "initial_npcs": [
    {
      "name": "Бран",
      "race": "Человек",
      "role": "Трактирщик",
      "background": "Бывалый хозяин заведения, повидавший немало авантюристов",
      "status_tags": ["местный", "хозяин"]
    }
  ]
}`;
}

/**
 * Эвристический фоллбэк генерации стартовой локации (если AI недоступен)
 */
export function buildFallbackStartingLocation(
  paramsOrPlayer: any,
  actionTextOpt?: string,
  availableLocationsOpt?: AvailableLocationInfo[]
): {
  location_name: string;
  location_type: string;
  state_name: string;
  description: string;
  weather: string;
  atmosphere: { sounds: string[]; visuals: string[] };
  game_time: { year: number; month: number; day: number; hour: number; minute: number };
  time: { year: number; month: number; day: number; hour: number; minute: number };
  initial_npcs: Array<{ name: string; race: string; role: string; background: string; status_tags: string[]; is_alive?: boolean }>;
  subzone_id?: string | null;
  subzone_name?: string | null;
  pos_x?: number;
  pos_y?: number;
} {
  const player = paramsOrPlayer?.player ?? paramsOrPlayer ?? {};
  const action_text = actionTextOpt ?? paramsOrPlayer?.action_text ?? "";
  const available_locations: AvailableLocationInfo[] = paramsOrPlayer?.available_locations ?? availableLocationsOpt ?? [];
  const lowerAction = (action_text || "").toLowerCase();
  const lowerClass = (player?.class || "").toLowerCase();

  // Если переданы существующие локации из БД — выбираем наиболее подходящую из них
  if (available_locations.length > 0) {
    let candidateLocs = available_locations;

    if (lowerAction.includes("дерев") || lowerAction.includes("сел") || lowerAction.includes("хутор")) {
      const villages = available_locations.filter((l) => l.type === "village");
      if (villages.length > 0) candidateLocs = villages;
    } else if (lowerAction.includes("столиц")) {
      const capitals = available_locations.filter((l) => l.type === "capital");
      if (capitals.length > 0) candidateLocs = capitals;
    } else if (lowerAction.includes("город") || lowerAction.includes("полис")) {
      const cities = available_locations.filter((l) => l.type === "city" || l.type === "capital");
      if (cities.length > 0) candidateLocs = cities;
    } else if (lowerAction.includes("руин") || lowerAction.includes("катакомб") || lowerAction.includes("склеп") || lowerAction.includes("пещер") || lowerAction.includes("подземель")) {
      const ruins = available_locations.filter((l) => l.type === "ruins" || l.type === "dungeon");
      if (ruins.length > 0) candidateLocs = ruins;
    } else if (lowerAction.includes("башн") || lowerAction.includes("академи") || lowerAction.includes("замок") || lowerAction.includes("крепост")) {
      const landmarks = available_locations.filter((l) => l.type === "landmark" || l.type === "fortress");
      if (landmarks.length > 0) candidateLocs = landmarks;
    } else if (lowerAction.includes("лес") || lowerAction.includes("охот") || lowerAction.includes("тракт")) {
      const wild = available_locations.filter((l) => l.type === "wilderness" || l.type === "landmark" || l.type === "village");
      if (wild.length > 0) candidateLocs = wild;
    } else if (lowerClass.includes("маг") || lowerClass.includes("волшебник")) {
      const magic = available_locations.filter((l) => l.type === "landmark" || l.type === "capital" || l.type === "city");
      if (magic.length > 0) candidateLocs = magic;
    } else if (lowerClass.includes("следопыт") || lowerClass.includes("друид")) {
      const nature = available_locations.filter((l) => l.type === "village" || l.type === "wilderness");
      if (nature.length > 0) candidateLocs = nature;
    }

    const namedMatch = candidateLocs.find((l) => lowerAction.includes(l.name.toLowerCase()));
    const selectedLoc = namedMatch || candidateLocs[0];

    // Выбираем подзону внутри локации
    let chosenSubzone: SubzoneInfo | null = null;
    const subzones = selectedLoc.subzones || [];
    if (subzones.length > 0) {
      chosenSubzone = subzones.find((sz) => {
        const szName = sz.name.toLowerCase();
        return lowerAction.includes(szName) || szName.split(/\s+/).some((w) => w.length > 3 && lowerAction.includes(w));
      }) || null;

      if (!chosenSubzone) {
        const randIdx = Math.floor(Math.random() * subzones.length);
        chosenSubzone = subzones[randIdx];
      }
    }

    let hour = 10;
    if (lowerAction.includes("ноч") || lowerAction.includes("полноч") || lowerAction.includes("тьм") || lowerAction.includes("вечер")) {
      hour = 21;
    } else if (lowerAction.includes("утр") || lowerAction.includes("рассвет")) {
      hour = 8;
    }

    return {
      location_name: selectedLoc.name,
      location_type: selectedLoc.type,
      state_name: selectedLoc.state_name || "Центральные земли",
      description: selectedLoc.description || `Поселение ${selectedLoc.name}, где начинается путь героя.`,
      weather: "Ясный день",
      atmosphere: {
        sounds: ["шум ветра", "далекие голоса жителей"],
        visuals: ["каменные и деревянные постройки", "открытый горизонт"],
      },
      game_time: { year: 1248, month: 5, day: 14, hour, minute: 0 },
      time: { year: 1248, month: 5, day: 14, hour, minute: 0 },
      initial_npcs: [],
      subzone_id: chosenSubzone?.id || null,
      subzone_name: chosenSubzone?.name || null,
      pos_x: chosenSubzone?.pos_x ?? selectedLoc.pos_x ?? 0,
      pos_y: chosenSubzone?.pos_y ?? selectedLoc.pos_y ?? 0,
    };
  }

  let name = "Таверна «Старый путник»";
  let type = "tavern";
  let desc = "Тёплый придорожный трактир с дубовыми столами и очагом.";
  let weather = "Прохладный вечер";
  let sounds = ["потрескивание поленьев", "приглушённые разговоры"];
  let visuals = ["тёплый свет масляных ламп", "тяжёлые дубовые балки"];
  let hour = 18;
  let npcs = [
    {
      name: "Бран",
      race: "Человек",
      role: "Трактирщик",
      background: "Хозяин трактира, протирающий кружки за стойкой",
      status_tags: ["местный", "хозяин"],
    },
  ];

  if (lowerAction.includes("лес") || lowerAction.includes("охот") || lowerAction.includes("дерев") || lowerClass.includes("следопыт") || lowerClass.includes("друид")) {
    name = "Опушка Шепчущей рощи";
    type = "wilderness";
    desc = "Древний лес, где кроны вековых сосен шумят на ветру, а мох глушит каждый шаг.";
    weather = "Свежее туманное утро";
    sounds = ["шелест листвы", "крик лесной птицы", "скрип ветвей"];
    visuals = ["лучи солнца сквозь кроны", "густой зелёный мох", "следы на сырой земле"];
    hour = 8;
    npcs = [
      {
        name: "Эдгар",
        race: "Человек",
        role: "Охотник",
        background: "Местный следопыт, проверяющий силки",
        status_tags: ["охотник", "местный"],
      },
    ];
  } else if (lowerAction.includes("пещер") || lowerAction.includes("подземель") || lowerAction.includes("темниц") || lowerAction.includes("склеп") || lowerAction.includes("руин")) {
    name = "Вход в Забытые катакомбы";
    type = "dungeon";
    desc = "Сырой каменный коридор с арочными сводами, откуда веет могильным холодом.";
    weather = "Сырость подземелья";
    sounds = ["капли воды, падающие в тишине", "далёкий шорох в глубине"];
    visuals = ["пятна плесени на камнях", "древние полустёртые руны", "колеблющийся свет факела"];
    hour = 12;
    npcs = [];
  } else if (lowerAction.includes("город") || lowerAction.includes("рынок") || lowerAction.includes("площад") || lowerAction.includes("улиц") || lowerClass.includes("плут") || lowerClass.includes("вор")) {
    name = "Торговая площадь Ривервуда";
    type = "city";
    desc = "Оживлённая мощёная камнем площадь, окружённая лавками ремесленников и торговцев.";
    weather = "Ясный день";
    sounds = ["выкрики зазывал", "стук копыт по мостовой", "гул толпы"];
    visuals = ["яркие тенты торговых палаток", "каменные фасады ратуши", "струйки дыма из пекарен"];
    hour = 11;
    npcs = [
      {
        name: "Гордон",
        race: "Человек",
        role: "Торговец",
        background: "Купец, раскладывающий диковинные товары на прилавке",
        status_tags: ["торговец"],
      },
    ];
  } else if (lowerAction.includes("башн") || lowerAction.includes("академи") || lowerClass.includes("маг") || lowerClass.includes("волшебник") || lowerClass.includes("чародей")) {
    name = "Башня Арканистов";
    type = "landmark";
    desc = "Высокая каменная башня, в воздухе которой чувствуется покалывание древней магии.";
    weather = "Спокойное сияние";
    sounds = ["шелест свитков", "гудение магического кристалла"];
    visuals = ["парящие в воздухе фолианты", "мерцающие синие руны", "астрономические приборы"];
    hour = 10;
    npcs = [
      {
        name: "Магистр Алдус",
        race: "Человек",
        role: "Маг",
        background: "Архивариус башни, изучающий древние манускрипты",
        status_tags: ["учёный", "маг"],
      },
    ];
  }

  // Если игрок явно упомянул ночь
  if (lowerAction.includes("ноч") || lowerAction.includes("полноч") || lowerAction.includes("тьм")) {
    hour = 23;
  }

  return {
    location_name: name,
    location_type: type,
    state_name: "Центральные земли",
    description: desc,
    weather,
    atmosphere: { sounds, visuals },
    game_time: {
      year: 1248,
      month: 5,
      day: 14,
      hour,
      minute: 0,
    },
    time: {
      year: 1248,
      month: 5,
      day: 14,
      hour,
      minute: 0,
    },
    initial_npcs: npcs,
  };
}

/**
 * Обеспечивает наличие стартовой локации для сессии.
 * Если у сессии нет локации или это самый первый ход — генерирует её.
 */
export async function ensureStartingLocation(params: {
  supabase: any;
  session: any;
  player: {
    id: string;
    name: string;
    race?: string;
    class?: string;
    appearance?: string;
    personality?: string;
    bio?: string;
  };
  action_text: string;
  is_first_turn: boolean;
  lore_context?: string;
  available_locations?: AvailableLocationInfo[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<StartingLocationResult | null> {
  const {
    supabase,
    session,
    player,
    action_text,
    is_first_turn,
    lore_context = "",
    available_locations = [],
    openrouter_api_key,
    model = "xiaomi/mimo-v2.5",
  } = params;

  // Если локация уже есть и это не первый ход сессии — возвращаем метаданные существующей локации
  if (session.current_location_id && !is_first_turn) {
    let locName = "Существующая локация";
    let stateName = "Центральные земли";
    try {
      const { data: existingLoc } = await supabase
        .from("locations")
        .select("id, name, states(name)")
        .eq("id", session.current_location_id)
        .maybeSingle();
      if (existingLoc) {
        locName = existingLoc.name;
        const st = Array.isArray(existingLoc.states) ? existingLoc.states[0] : existingLoc.states;
        stateName = st?.name || "Центральные земли";
      }
    } catch { /* ignore */ }

    return {
      is_new_location: false,
      location_id: session.current_location_id,
      location_name: locName,
      location_type: "settlement",
      state_name: stateName,
      weather: "Ясно",
      atmosphere: { sounds: [], visuals: [] },
      game_time: {
        year: session.game_year || 1248,
        month: session.game_month || 5,
        day: session.game_day || 14,
        hour: session.game_hour || 10,
        minute: session.game_minute || 0,
      },
      initial_npcs: [],
    };
  }

  // 1. Генерируем данные локации (через LLM или fallback)
  let generatedData: any = null;

  if (openrouter_api_key) {
    try {
      const prompt = buildStartingLocationPrompt({
        player,
        action_text,
        world_name: session.worlds?.name,
        lore_context,
        available_locations,
      });

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouter_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Ты — модуль генерации стартовых локаций ЛитРПГ. Отвечай строго в формате JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 700,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const rawContent = data.choices?.[0]?.message?.content || "";
        const parsed = parseAIJson(rawContent);
        if (parsed && typeof parsed.location_name === "string" && parsed.location_name.trim().length > 0) {
          generatedData = {
            location_name: parsed.location_name.trim(),
            location_type: parsed.location_type || "settlement",
            state_name: parsed.state_name || "Центральные земли",
            selected_subzone: parsed.selected_subzone || parsed.subzone || parsed.subzone_name || "",
            description: parsed.description || "",
            weather: parsed.weather || "Ясно",
            atmosphere: {
              sounds: Array.isArray(parsed.atmosphere?.sounds) ? parsed.atmosphere.sounds : [],
              visuals: Array.isArray(parsed.atmosphere?.visuals) ? parsed.atmosphere.visuals : [],
            },
            time: {
              year: Number(parsed.time?.year) || 1248,
              month: Number(parsed.time?.month) || 5,
              day: Number(parsed.time?.day) || 14,
              hour: Number(parsed.time?.hour) ?? 10,
              minute: Number(parsed.time?.minute) ?? 0,
            },
            initial_npcs: Array.isArray(parsed.initial_npcs) ? parsed.initial_npcs : [],
          };
        }
      }
    } catch (llmErr) {
      console.warn("[starting_location_generator] LLM failed, using fallback:", llmErr);
    }
  }

  if (!generatedData) {
    generatedData = buildFallbackStartingLocation({ player, action_text, available_locations });
  }

  // 2. Проверяем, есть ли совпадение со списком существующих локаций в БД
  const availLocs = available_locations || [];
  let matchedLoc: AvailableLocationInfo | null = null;

  if (availLocs.length > 0) {
    const targetName = (generatedData.location_name || "").trim().toLowerCase();
    matchedLoc = availLocs.find((l) => l.name.trim().toLowerCase() === targetName) || null;

    if (!matchedLoc && targetName) {
      matchedLoc = availLocs.find((l) => {
        const lName = l.name.trim().toLowerCase();
        return lName.includes(targetName) || targetName.includes(lName);
      }) || null;
    }

    const lowerAct = (action_text || "").toLowerCase();
    if (lowerAct.includes("дерев") || lowerAct.includes("сел") || lowerAct.includes("хутор")) {
      const vill = availLocs.find((l) => l.type === "village");
      if (vill && matchedLoc?.type !== "village") {
        matchedLoc = vill;
      }
    } else if (lowerAct.includes("столиц")) {
      const cap = availLocs.find((l) => l.type === "capital");
      if (cap && matchedLoc?.type !== "capital") {
        matchedLoc = cap;
      }
    } else if (lowerAct.includes("город") || lowerAct.includes("полис")) {
      const city = availLocs.find((l) => l.type === "city" || l.type === "capital");
      if (city && matchedLoc?.type !== "city" && matchedLoc?.type !== "capital") {
        matchedLoc = city;
      }
    }

    if (!matchedLoc && generatedData.location_type) {
      matchedLoc = availLocs.find((l) => l.type === generatedData.location_type) || null;
    }

    if (!matchedLoc) {
      matchedLoc = availLocs[0];
    }
  }

  let locationId = session.current_location_id;
  let locPosX = 0;
  let locPosY = 0;
  let subzoneId: string | null = generatedData.subzone_id || null;
  let subzoneName: string | null = generatedData.subzone_name || null;
  let stateId: string | null = null;
  const createdNpcs: any[] = [];
  let existingNpcs: any[] = [];

  if (matchedLoc) {
    // Используем существующую локацию из БД! НЕ ДУБЛИРУЕМ её создание!
    locationId = matchedLoc.id;
    generatedData.location_name = matchedLoc.name;
    generatedData.location_type = matchedLoc.type;
    if (matchedLoc.state_name) {
      generatedData.state_name = matchedLoc.state_name;
    }
    locPosX = matchedLoc.pos_x ?? 0;
    locPosY = matchedLoc.pos_y ?? 0;

    // Определяем подзону
    const locSubzones = matchedLoc.subzones || [];
    if (locSubzones.length > 0) {
      let matchedSubzone: SubzoneInfo | null = null;
      const requestedSubzone = (generatedData.selected_subzone || generatedData.subzone_name || "").trim().toLowerCase();

      if (requestedSubzone) {
        matchedSubzone = locSubzones.find((sz) => {
          const szName = sz.name.trim().toLowerCase();
          return szName === requestedSubzone || szName.includes(requestedSubzone) || requestedSubzone.includes(szName);
        }) || null;
      }

      if (!matchedSubzone) {
        const lowerAct = (action_text || "").toLowerCase();
        matchedSubzone = locSubzones.find((sz) => {
          const szName = sz.name.trim().toLowerCase();
          return lowerAct.includes(szName) || szName.split(/\s+/).some((w) => w.length > 3 && lowerAct.includes(w));
        }) || null;
      }

      if (!matchedSubzone) {
        const randIdx = Math.floor(Math.random() * locSubzones.length);
        matchedSubzone = locSubzones[randIdx];
      }

      if (matchedSubzone) {
        subzoneId = matchedSubzone.id;
        subzoneName = matchedSubzone.name;
        if (matchedSubzone.pos_x != null && matchedSubzone.pos_y != null) {
          locPosX = matchedSubzone.pos_x;
          locPosY = matchedSubzone.pos_y;
        }
      }
    }

    // Загружаем существующих NPC этой локации
    try {
      const { data: dbNpcs } = await supabase
        .from("npcs")
        .select("id, name, race, role, status_tags, background")
        .eq("location_id", locationId)
        .limit(10);
      if (dbNpcs && dbNpcs.length > 0) {
        existingNpcs = dbNpcs;
      }
    } catch (npcErr) {
      console.warn("[starting_location_generator] Failed to load existing NPCs:", npcErr);
    }
  } else {
    // Существующих локаций в БД не найдено (пустой мир) — создаём государство и стартовую локацию
    if (session.world_id) {
      try {
        const { data: existingState } = await supabase
          .from("states")
          .select("id, name")
          .eq("world_id", session.world_id)
          .limit(1)
          .maybeSingle();

        if (existingState?.id) {
          stateId = existingState.id;
        } else {
          const { data: newState } = await supabase
            .from("states")
            .insert({
              world_id: session.world_id,
              name: generatedData.state_name,
              description: "Стартовый регион приключений",
            })
            .select("id, name")
            .single();
          stateId = newState?.id || null;
          if (newState?.name) {
            generatedData.state_name = newState.name;
          }
        }
      } catch (stateErr) {
        console.warn("[starting_location_generator] State lookup/create error:", stateErr);
      }
    }

    try {
      locPosX = Math.floor(Math.random() * 401) - 200; // -200..200
      locPosY = Math.floor(Math.random() * 401) - 200; // -200..200
      const { data: newLoc, error: locErr } = await supabase
        .from("locations")
        .insert({
          world_id: session.world_id || null,
          state_id: stateId,
          name: generatedData.location_name,
          type: generatedData.location_type,
          description: generatedData.description,
          weather: generatedData.weather,
          pos_x: locPosX,
          pos_y: locPosY,
        })
        .select("id, name, type")
        .single();

      if (!locErr && newLoc?.id) {
        locationId = newLoc.id;
        if (newLoc.name) {
          generatedData.location_name = newLoc.name;
        }
      }
    } catch (createLocErr) {
      console.warn("[starting_location_generator] Failed to insert location:", createLocErr);
    }
  }

  // Спавним стартовых NPC (если локация только что создана или у неё нет NPC)
  if (locationId && existingNpcs.length === 0 && generatedData.initial_npcs?.length) {
    for (const npc of generatedData.initial_npcs) {
      if (!npc.name) continue;
      try {
        const { data: insertedNpc } = await supabase
          .from("npcs")
          .insert({
            world_id: session.world_id,
            location_id: locationId,
            state_id: stateId,
            name: npc.name,
            race: resolveNpcRace(npc),
            role: "secondary",
            background: npc.background || "",
            status_tags: Array.isArray(npc.status_tags) ? npc.status_tags : ["местный"],
          })
          .select("id, name, race, role, status_tags, background")
          .single();

        if (insertedNpc) {
          createdNpcs.push(insertedNpc);
        }
      } catch (npcInsertErr) {
        console.warn("[starting_location_generator] Failed to insert initial NPC:", npcInsertErr);
      }
    }
  }

  // Обновляем сессию: текущая локация и игровая дата/время
  const gameTime = generatedData.time;
  try {
    const updatePayload: any = {
      game_year: gameTime.year,
      game_month: gameTime.month,
      game_day: gameTime.day,
      game_hour: gameTime.hour,
      game_minute: gameTime.minute,
    };
    if (locationId) {
      updatePayload.current_location_id = locationId;
    }
    await supabase.from("sessions").update(updatePayload).eq("id", session.id);
  } catch (sessUpdateErr) {
    console.warn("[starting_location_generator] Failed to update session location/date:", sessUpdateErr);
  }

  return {
    is_new_location: !matchedLoc,
    location_id: locationId || "loc-generated",
    location_name: generatedData.location_name,
    location_type: generatedData.location_type,
    state_name: generatedData.state_name,
    pos_x: locPosX,
    pos_y: locPosY,
    subzone_id: subzoneId || null,
    subzone_name: subzoneName || null,
    weather: generatedData.weather,
    atmosphere: generatedData.atmosphere,
    game_time: gameTime,
    initial_npcs: existingNpcs.length > 0 ? existingNpcs : createdNpcs,
  };
}

