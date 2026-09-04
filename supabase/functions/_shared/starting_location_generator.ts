// supabase/functions/_shared/starting_location_generator.ts
// Генератор стартовой локации на основе карточки персонажа и первого сообщения
import { cleanTextForAI, parseAIJson } from "./utils.ts";
import { resolveNpcRace } from "./npcRaceResolver.ts";

export interface StartingLocationResult {
  is_new_location: boolean;
  location_id: string;
  location_name: string;
  location_type: string;
  state_name: string;
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
}): string {
  const { player, action_text, world_name, lore_context } = params;

  return `Ты — гейм-мастер текстовой ЛитРПГ игры.
Игрок начинает игру и делает свой ПЕРВЫЙ ход. Твоя задача — сгенерировать идеальную стартовую локацию, идеально подходящую под персонажа и его первое сообщение.

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

ПРАВИЛА ГЕНЕРАЦИИ:
1. **Согласованность с действием игрока**:
   - Если игрок прямо написал, где он («сижу в таверне», «просыпаюсь в сырой темнице», «иду по тракту через лес», «стою на пристани»), локация ДОЛЖНА точно отражать это место!
   - Если действие абстрактное («оглядываюсь», «достаю оружие»), подбери колоритное стартовое место, естественное для его класса и расы.
2. **Тип локации (location_type)**:
   Выбери строго один из: 'tavern', 'city', 'village', 'ruins', 'landmark', 'dungeon', 'wilderness', 'fortress', 'settlement', 'camp', 'outpost'.
3. **Название**:
   Красивое, атмосферное фэнтези-название (например: "Таверна «Хромой василиск»", "Опушка Шепчущего леса", "Сторожевая башня Кроухолд").
4. **Погода и атмосфера**:
   Живые звуки (2-3), визуальные образы (2-3) и погода.
5. **Время (game_time)**:
   Понятный фэнтезийный год (по умолчанию 1248 г.), месяц (1-12, например 5 — май), день (1-30, например 14), час (0-23) и минута. Если игрок написал про ночь/вечер — поставь ночной/вечерний час (20..23).
6. **Начальные NPC (initial_npcs)**:
   1–2 колоритных местных персонажа, которые могут находиться в этой локации (например: трактирщик, стражник, охотник, торговец).

Верни СТРОГО JSON без markdown-обёрток (\`\`\`json):
{
  "location_name": "Таверна «Хромой василиск»",
  "location_type": "tavern",
  "state_name": "Центральные земли",
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
  actionTextOpt?: string
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
} {
  const player = paramsOrPlayer?.player ?? paramsOrPlayer ?? {};
  const action_text = actionTextOpt ?? paramsOrPlayer?.action_text ?? "";
  const lowerAction = (action_text || "").toLowerCase();
  const lowerClass = (player?.class || "").toLowerCase();

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
    generatedData = buildFallbackStartingLocation({ player, action_text });
  }

  // 2. Находим или создаём государство (state) в этом мире
  let stateId: string | null = null;
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

  // 3. Создаём локацию в locations
  let locationId = session.current_location_id;
  try {
    const { data: newLoc, error: locErr } = await supabase
      .from("locations")
      .insert({
        world_id: session.world_id || null,
        state_id: stateId,
        name: generatedData.location_name,
        type: generatedData.location_type,
        description: generatedData.description,
        weather: generatedData.weather,
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

  // 4. Если локация создана, спавним стартовых NPC (если есть)
  const createdNpcs: any[] = [];
  if (locationId && generatedData.initial_npcs?.length) {
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

  // 5. Обновляем сессию: текущая локация и понятная дата/время
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
    is_new_location: true,
    location_id: locationId || "loc-generated",
    location_name: generatedData.location_name,
    location_type: generatedData.location_type,
    state_name: generatedData.state_name,
    weather: generatedData.weather,
    atmosphere: generatedData.atmosphere,
    game_time: gameTime,
    initial_npcs: createdNpcs,
  };
}
