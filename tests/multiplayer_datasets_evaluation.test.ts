import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return null;
    }),
  },
});

vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  location: { hash: "", pathname: "/" },
});

vi.stubGlobal("document", {
  addEventListener: vi.fn(),
  createElement: vi.fn(() => ({
    textContent: "",
    innerHTML: "",
  })),
});

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: vi.fn(),
    from: vi.fn(),
  }),
}));

import { TalkHandler } from "../supabase/functions/process-turn/engine/handlers/talk_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { buildNarratorSystemPrompt, buildNarratorContext } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
import { buildRouterSystemPrompt, buildUserMessage, buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";

// =========================================================================
// ВАЛИДАТОРЫ КАЧЕСТВА И КУКЛОВОДСТВА
// =========================================================================
function analyzeNarrativeQuality(narrative: string, targetPlayerName: string) {
  const words = narrative.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Технические артефакты (запрещены)
  const hasTechnicalTags = /\[(?:Навык|Успех|Провал|Урон|DC|Выживание|Атака|Получен предмет|Выброшен предмет):?[^\]]*\]/i.test(narrative);

  // Чувственные детали (звуки, запахи, зрение)
  const sensoryKeywords = /(?:слыш|звук|ветер|запах|аромат|холод|мороз|тепло|свет|тень|мерца|скрип|капл|треск|пар|гул)/i;
  const hasSensoryDetails = sensoryKeywords.test(narrative);

  // Проверка кукловодства
  const forcedSpeechPattern = new RegExp(`${targetPlayerName}\\s+(?:ответил[а-я]*|сказал[а-я]*|возразил[а-я]*|согласил[а-я]*|крикнул[а-я]*|прошептал[а-я]*)\\s*[:«"']`, "i");
  const forcedAgreementPattern = new RegExp(`${targetPlayerName}\\s+(?:кивнул[а-я]*\\s+и\\s+согласил[а-я]*|с\\s+радостью\\s+согласил[а-я]*|отказал[а-я]*сь)`, "i");
  const forcedActionPattern = new RegExp(`${targetPlayerName}\\s+(?:выхватил[а-я]*|напал[а-я]*|побежал[а-я]*|выпил[а-я]*\\s+залпом)`, "i");

  const puppeteeringViolations: string[] = [];
  if (forcedSpeechPattern.test(narrative)) puppeteeringViolations.push("Forced speech");
  if (forcedAgreementPattern.test(narrative)) puppeteeringViolations.push("Forced agreement/decision");
  if (forcedActionPattern.test(narrative)) puppeteeringViolations.push("Forced physical action");

  return {
    wordCount,
    isSufficientLength: wordCount >= 60,
    hasNoTechnicalTags: !hasTechnicalTags,
    hasSensoryDetails,
    isCleanOfPuppeteering: puppeteeringViolations.length === 0,
    puppeteeringViolations,
  };
}

// =========================================================================
// ТЕСТОВЫЙ НАБОР 1: Седые Пики / Заснеженный Перевал (Дворф и Эльфийка)
// =========================================================================
describe("Dataset 1: Mountain Pass / Arctic Survival (Торин & Элеонора)", () => {
  const pThorin = {
    id: "p-thorin",
    name: "Торин Железнобров",
    race: "Дворф",
    class: "Варвар",
    stats: { STR: 16, DEX: 12, CON: 16, INT: 8, WIS: 12, CHA: 10 },
    hp: 32,
    max_hp: 32,
    armor_class: 14,
    initiative: 1,
    level: 3,
    inventory: [
      { id: "item-flask", item_name: "Фляга со шнапсом", quantity: 1, condition: null, durability: null },
      { id: "item-rope", item_name: "Моток пеньковой верёвки", quantity: 1, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const pEleonora = {
    id: "p-eleonora",
    name: "Элеонора",
    race: "Эльф",
    class: "Чародейка",
    stats: { STR: 8, DEX: 14, CON: 10, INT: 16, WIS: 14, CHA: 16 },
    hp: 18,
    max_hp: 18,
    armor_class: 12,
    initiative: 2,
    level: 3,
    inventory: [
      { id: "item-warmth-amulet", item_name: "Амулет пылающего очага", quantity: 1, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const npcGromli = {
    id: "npc-gromli",
    name: "Седой Громли",
    role: "Отшельник",
    race: "Человек",
    is_hostile: false,
    hp: 20,
    max_hp: 20,
  };

  const contextMountain: EngineInputContext = {
    session: {
      id: "sess-mountain",
      difficulty: "hard",
      is_pvp_enabled: false,
      game_year: 1248,
      game_month: 1, // Январь (зима/метель)
      game_day: 15,
      game_hour: 18,
      game_minute: 0,
      current_location_id: "loc-pass",
    },
    acting_player: pThorin,
    targets: {
      players: new Map([
        ["p-thorin", pThorin],
        ["p-eleonora", pEleonora],
      ]),
      npcs: new Map([
        ["npc-gromli", npcGromli as any],
      ]),
      location_items: new Map(),
    },
  };

  it("Turn 1: Торин обращается к NPC Громли, не путая его с Элеонорой", () => {
    const handler = new TalkHandler();
    const actionText = 'Окликаю отшельника: «Громли, где здесь укрыться от ледяной метели?»';
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: null,
        target_item_name: "Громли",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...contextMountain,
        raw_action_text: actionText,
      } as any
    );

    expect((result.result as any).target_id).toBe("npc-gromli");
    expect(result.system_facts[0]).toContain("Громли");
    expect(result.system_facts[0]).not.toContain("Элеонора");
  });

  it("Turn 2: Элеонора предлагает объединиться в отряд и передаёт Амулет Торину", () => {
    // 1. Проверка интента отряда
    const inviteText = 'Торин, давай объединимся в отряд! Держи этот амулет согревающего огня.';
    const isPartyInviteOrJoinRegex = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i;
    expect(isPartyInviteOrJoinRegex.test(inviteText)).toBe(true);

    // 2. Трансфер амулета от Элеоноры к Торину
    const transferHandler = new TransferHandler();
    const transferContext: EngineInputContext = {
      ...contextMountain,
      acting_player: pEleonora,
    };

    const res = transferHandler.handle(
      {
        action_type: "transfer",
        target_entity_id: "p-thorin",
        used_item_id: "item-warmth-amulet",
        consumed_materials: [{ id: "item-warmth-amulet", quantity: 1 }],
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      transferContext
    );

    expect(res.result.success).toBe(true);
    expect(res.mutations[0]).toMatchObject({
      type: "TRANSFER_ITEM",
      from_id: "p-eleonora",
      to_id: "p-thorin",
      quantity: 1,
    });
    expect(res.system_facts[0]).toContain("Элеонора передал Амулет пылающего очага (x1) → Торин Железнобров");
  });

  it("Turn 3: Проверка памяти ДМ (recent history) и синхронного перехода на Перевал", () => {
    const history = [
      'Торин Железнобров обращается к Громли с вопросом об укрытии.',
      'Громли указывает на заброшенную караульню у скалы.',
      'Элеонора передает Торину Амулет пылающего очага и предлагает объединиться в отряд.',
    ];

    const systemTruth = {
      environment: {
        location_name: "Перевал Ветров",
        time: { year: 1248, month: 1, day: 15, hour: 18, minute: 15 },
        weather: "Метель и мороз -18°C",
        atmosphere: { sounds: ["Завывание ледяного ветра", "Хруст наста"], visuals: ["Слепящие вихри снега"] },
      },
      player_truths: {
        "p-thorin": {
          player_name: "Торин Железнобров",
          player_race: "Дворф",
          player_class: "Варвар",
          is_acting_player: true,
          knowledge: [
            "Торин надевает подаренный Элеонорой амулет, чувствуя разлившееся по груди тепло.",
            "Отряд начинает подъём сквозь снежную бурю.",
          ],
          hp_status: { current: 32, max: 32, delta: 0 },
          inventory_delta: { added: ["Амулет пылающего очага"], removed: [], damaged: [] },
        },
        "p-eleonora": {
          player_name: "Элеонора",
          player_race: "Эльф",
          player_class: "Чародейка",
          is_acting_player: false,
          knowledge: [
            "Торин ведёт отряд вперёд, укрывая вас широкой спиной от порывов бурана.",
          ],
          hp_status: { current: 18, max: 18, delta: 0 },
          inventory_delta: { added: [], removed: ["Амулет пылающего очага"], damaged: [] },
        },
      },
      present_npcs: [],
      global_events: ["Сформирован отряд: Торин и Элеонора."],
    };

    const narrativePrompt = buildNarratorContext(
      systemTruth as any,
      'Надеваю амулет и кричу сквозь вой ветра: «Держись за моим плечом, Элеонора, идём на вершину!»',
      history
    );

    // ДМ видит в контексте историю передачи и память о погоде
    expect(narrativePrompt).toContain("ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ");
    expect(narrativePrompt).toContain("Амулет пылающего очага");
    expect(narrativePrompt).toContain("Метель и мороз");

    // Проверяем качество текста ответа
    const simulatedNarratorText = `
      Ледяной буран с воем хлещет по каменным уступам, вздымая вихри колючего снега.
      Торин застёгивает на шее подаренный амулет пылающего очага — тёплый магический жар мгновенно разливается под кольчугой, разгоняя смертоносный холод.
      Взмахнув топором, дворф делает первый тяжёлый шаг в снежный занос, закрывая спутницу от ярости стихии.
    `;

    const quality = analyzeNarrativeQuality(simulatedNarratorText, "Элеонора");
    expect(quality.hasNoTechnicalTags).toBe(true);
    expect(quality.hasSensoryDetails).toBe(true);
    expect(quality.isCleanOfPuppeteering).toBe(true);
  });
});

// =========================================================================
// ТЕСТОВЫЙ НАБОР 2: Затопленная Крипта (Тифлинг и Жрец)
// =========================================================================
describe("Dataset 2: Sunken Crypt / Undead Crypt (Веспер & Брат Олдер)", () => {
  const pVesper = {
    id: "p-vesper",
    name: "Веспер",
    race: "Тифлинг",
    class: "Плут",
    stats: { STR: 10, DEX: 18, CON: 12, INT: 14, WIS: 12, CHA: 12 },
    hp: 22,
    max_hp: 22,
    armor_class: 15,
    initiative: 4,
    level: 3,
    inventory: [
      { id: "item-gem", item_name: "Светящийся сапфир глубин", quantity: 1, condition: null, durability: null },
      { id: "item-picks", item_name: "Воровские отмычки", quantity: 1, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const pAlder = {
    id: "p-alder",
    name: "Брат Олдер",
    race: "Человек",
    class: "Жрец",
    stats: { STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: 26,
    max_hp: 26,
    armor_class: 16,
    initiative: 0,
    level: 3,
    inventory: [
      { id: "item-symbol", item_name: "Серебряный символ Света", quantity: 1, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const npcGhost = {
    id: "npc-sir-gawain",
    name: "Сэр Гавейн",
    role: "Призрак рыцаря",
    race: "Нежить",
    is_hostile: false,
    hp: 45,
    max_hp: 45,
  };

  const contextCrypt: EngineInputContext = {
    session: {
      id: "sess-crypt",
      difficulty: "normal",
      is_pvp_enabled: false,
      game_year: 1248,
      game_month: 6,
      game_day: 20,
      game_hour: 23,
      game_minute: 40,
      current_location_id: "loc-crypt",
    },
    acting_player: pAlder,
    targets: {
      players: new Map([
        ["p-vesper", pVesper],
        ["p-alder", pAlder],
      ]),
      npcs: new Map([
        ["npc-sir-gawain", npcGhost as any],
      ]),
      location_items: new Map(),
    },
  };

  it("Turn 1: Олдер обращается к Призраку Сэру Гавейну", () => {
    const handler = new TalkHandler();
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: "npc-sir-gawain",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...contextCrypt,
        raw_action_text: 'Обращаюсь к духу: «Сэр Гавейн, упокой свой дух и укажи нам проход к гробнице!»',
      } as any
    );

    expect((result.result as any).target_id).toBe("npc-sir-gawain");
    expect(result.system_facts[0]).toContain("Сэр Гавейн");
  });

  it("Turn 2: Веспер передает сапфир Олдеру со строгим запретом кукловодства", () => {
    const transferHandler = new TransferHandler();
    const res = transferHandler.handle(
      {
        action_type: "transfer",
        target_entity_id: "p-alder",
        used_item_id: "item-gem",
        consumed_materials: [{ id: "item-gem", quantity: 1 }],
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...contextCrypt,
        acting_player: pVesper,
      }
    );

    expect(res.result.success).toBe(true);
    expect(res.mutations[0]).toMatchObject({
      type: "TRANSFER_ITEM",
      from_id: "p-vesper",
      to_id: "p-alder",
      quantity: 1,
    });

    // Валидация текста для Олдера: нарратор НЕ должен выдумывать слова согласия за Олдера
    const narrativeForAlder = `
      Холодная тьма катакомб сгущается вокруг. Эхо редких капель гулко отзывается в затопленном зале.
      Веспер подходит ближе и протягивает вам гранёный Светящийся сапфир глубин: «Возьми, священник. Пусть твой Свет напитает этот камень».
      Камень слабо фосфоресцирует в её ладони, ожидая вашего прикосновения.
    `;

    const quality = analyzeNarrativeQuality(narrativeForAlder, "Брат Олдер");
    expect(quality.isCleanOfPuppeteering).toBe(true);
    expect(quality.hasNoTechnicalTags).toBe(true);
  });
});

// =========================================================================
// ТЕСТОВЫЙ НАБОР 3: Топи Увядания (Полурослик и Полуорк)
// =========================================================================
describe("Dataset 3: Murky Fens / Swamp Hunting (Финн & Громмаш)", () => {
  const pFinn = {
    id: "p-finn",
    name: "Финн Быстроног",
    race: "Полурослик",
    class: "Следопыт",
    stats: { STR: 8, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: 20,
    max_hp: 20,
    armor_class: 14,
    initiative: 3,
    level: 2,
    inventory: [
      { id: "item-bow", item_name: "Охотничий лук", quantity: 1, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const pGrommash = {
    id: "p-grommash",
    name: "Громмаш",
    race: "Полуорк",
    class: "Паладин",
    stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 14 },
    hp: 28,
    max_hp: 28,
    armor_class: 16,
    initiative: 0,
    level: 2,
    inventory: [],
    injuries: [],
    skills: {},
  };

  it("Turn 1: Финн выслеживает василиска (целевой поиск / hunting)", () => {
    // Проверка Router Heuristic / Classifier для hunting
    const actionText = 'Выслеживаю болотного василиска по свежим следам на тине';
    const fallback = buildRouterHeuristicFallback({ player_action_text: actionText } as any);

    expect(fallback.actions[0].action_type).toBe("search");
    expect(fallback.encounter_intent.type).toBe("targeted");
    expect(fallback.encounter_intent.target_name?.toLowerCase()).toContain("василиск");
  });

  it("Turn 2: Громмаш объединяется с Финном в отряд в болотах", () => {
    const inviteText = 'Финн, держимся вместе, если тварь выскочит из тины!';
    const isPartyInviteOrJoinRegex = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i;

    expect(isPartyInviteOrJoinRegex.test(inviteText)).toBe(true);
  });

  it("Turn 3: Память о найденных следах в истории ходов", () => {
    const history = [
      'Финн Быстроног обнаружил трёхпалые следы болотного василиска у тростника.',
      'Громмаш предложил держаться вместе и обнажил палаш.',
    ];

    const promptContext = buildNarratorContext(
      {
        environment: {
          location_name: "Топи Увядания",
          time: { year: 1248, month: 8, day: 5, hour: 16, minute: 20 },
          weather: "Удушливый туман и морось",
          atmosphere: { sounds: ["Кваканье жаб", "Бульканье газа"], visuals: ["Клочья серых испарений над трясиной"] },
        },
        player_truths: {
          "p-finn": {
            player_name: "Финн Быстроног",
            player_race: "Полурослик",
            player_class: "Следопыт",
            is_acting_player: true,
            knowledge: ["Финн видит шевеление камыша прямо по направлению найденных ранее следов."],
            hp_status: { current: 20, max: 20, delta: 0 },
            inventory_delta: { added: [], removed: [], damaged: [] },
          },
        },
        present_npcs: [],
        global_events: [],
      } as any,
      'Натягиваю тетиву лука и шепчу: «Оно там, среди камышей!»',
      history
    );

    expect(promptContext).toContain("трёхпалые следы болотного василиска");
    expect(promptContext).toContain("Топи Увядания");
    expect(promptContext).toContain("Удушливый туман");
  });
});
