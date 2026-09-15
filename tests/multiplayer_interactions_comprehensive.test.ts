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
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";

describe("Multiplayer Comprehensive: 1. Player vs NPC Target Distinction", () => {
  const playerA = {
    id: "player-arin",
    name: "Арин",
    stats: { STR: 14, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 14 },
    hp: 24,
    max_hp: 24,
    armor_class: 13,
    initiative: 3,
    level: 2,
    inventory: [
      { id: "item-healing-salve", item_name: "Целебная мазь", quantity: 2, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const playerB = {
    id: "player-iris",
    name: "Ирис",
    stats: { STR: 10, DEX: 14, CON: 12, INT: 16, WIS: 14, CHA: 12 },
    hp: 20,
    max_hp: 20,
    armor_class: 12,
    initiative: 2,
    level: 2,
    inventory: [],
    injuries: [],
    skills: {},
  };

  const npcBran = {
    id: "npc-bran",
    name: "Бран",
    role: "Трактирщик",
    race: "Человек",
    is_hostile: false,
    hp: 15,
    max_hp: 15,
  };

  const mockContext: EngineInputContext = {
    session: {
      id: "sess-mp-test",
      difficulty: "normal",
      is_pvp_enabled: false,
      game_year: 1248,
      game_month: 6,
      game_day: 10,
      game_hour: 14,
      game_minute: 30,
      current_location_id: "loc-tavern",
    },
    acting_player: playerA,
    targets: {
      players: new Map([
        ["player-arin", playerA],
        ["player-iris", playerB],
      ]),
      npcs: new Map([
        ["npc-bran", npcBran as any],
      ]),
      location_items: new Map(),
    },
  };

  it("accurately targets live player Iris when addressed by name", () => {
    const handler = new TalkHandler();
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: null,
        target_item_name: "Ирис",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...mockContext,
        raw_action_text: 'Поворачиваюсь к Ирис и говорю: «Ирис, давай объединимся в отряд!»',
      } as any
    );

    expect(result.result.success).toBe(true);
    expect((result.result as any).target_id).toBe("player-iris");
    expect(result.system_facts[0]).toContain("Арин обращается к Ирис");
    expect(result.system_facts[0]).not.toContain("Бран");
  });

  it("accurately targets NPC Bran when addressed by role or name", () => {
    const handler = new TalkHandler();
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: null,
        target_item_name: "Бран",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...mockContext,
        raw_action_text: 'Подхожу к трактирщику: «Бран, налей нам две кружки лучшего эля!»',
      } as any
    );

    expect(result.result.success).toBe(true);
    expect((result.result as any).target_id).toBe("npc-bran");
    expect(result.system_facts[0]).toContain("Бран");
    expect(result.system_facts[0]).toContain("поговорить с Бран");
    expect(result.system_facts[0]).not.toContain("Ирис");
  });

  it("buildNarratorContext distinguishes fellow player from local NPCs", () => {
    const systemTruth = {
      environment: {
        location_name: "Таверна «Пьяный гоблин»",
        time: { year: 1248, month: 6, day: 10, hour: 14, minute: 30 },
        weather: "Ясно",
        atmosphere: { sounds: ["Гул голосов", "Звон кружек"], visuals: ["Теплый свет очага"] },
      },
      player_truths: {
        "player-arin": {
          player_name: "Арин",
          player_race: "Эльф",
          player_class: "Следопыт",
          is_acting_player: true,
          knowledge: ["Арин обращается к Ирис с предложением идти вместе."],
          hp_status: { current: 24, max: 24, delta: 0 },
          inventory_delta: { added: [], removed: [], damaged: [] },
        },
        "player-iris": {
          player_name: "Ирис",
          player_race: "Человек",
          player_class: "Чародейка",
          is_acting_player: false,
          knowledge: ["Арин обращается к вам с предложением объединиться в отряд."],
          hp_status: { current: 20, max: 20, delta: 0 },
          inventory_delta: { added: [], removed: [], damaged: [] },
        },
      },
      present_npcs: [
        { name: "Бран", race: "Человек", role: "Трактирщик", is_hostile: false, current_activity: "протирает кружку" },
      ],
      global_events: [],
    };

    const ctx = buildNarratorContext(systemTruth as any, 'Обращаюсь к Ирис: "Пойдем вместе"');

    // Living players are clearly labeled with role and status
    expect(ctx).toContain("[Игрок Арин (Эльф Следопыт, ID: player-arin) — СОВЕРШАЕТ ДЕЙСТВИЕ]");
    expect(ctx).toContain("[Игрок Ирис (Человек Чародейка, ID: player-iris) — НАПАРНИК В ОТРЯДЕ РЯДОМ]");
    // NPC is clearly under NPC section
    expect(ctx).toContain("NPC В ЛОКАЦИИ");
    expect(ctx).toContain("Бран (Человек, Трактирщик) — сейчас занят: протирает кружку");
  });
});

describe("Multiplayer Comprehensive: 2. Party Formation & Disbandment", () => {
  const isPartyInviteOrJoinRegex = /(?:объедини(?:ться|мся)|созда(?:ть|дим) отряд|пойд[емё]м вместе|ид[емё]м вместе|давай(?:те)?.*(?:вместе|путешеств|отряд)|будем вместе|путешеств(?:овать|уем).*вместе|вместе.*путешеств|держимся вместе|в отряд|возьми.*отряд|прими.*отряд|вступай.*отряд|вступи.*отряд|беру за руку|предлагаю.*(?:отряд|вместе))/i;
  const isPartyLeaveRegex = /(?:покидаю отряд|выхожу из отряда|отделяюсь от отряда|иду один|пойду один|разделяемся)/i;

  it("detects party invite/join intentions across realistic roleplay phrasing", () => {
    const validInvites = [
      "Ирис, давай объединимся в отряд!",
      "Предлагаю объединиться и пойти на болота вместе.",
      "Пойдём вместе, вдвоём безопаснее.",
      "Идем вместе в Шепчущую рощу.",
      "Давайте создадим отряд для защиты деревни.",
      "Возьми меня в свой отряд!",
      "Давай держаться вместе в этом подземелье.",
      "Беру за руку Ирис и веду за собой вглубь леса.",
      "Предлагаю создать совместный отряд.",
      "Вступай в наш отряд, Ирис!",
    ];

    for (const phrase of validInvites) {
      expect(isPartyInviteOrJoinRegex.test(phrase), `Failed on phrase: "${phrase}"`).toBe(true);
    }
  });

  it("detects party leave/disband intentions", () => {
    const validLeaves = [
      "Я покидаю отряд, мне нужно в столицу.",
      "Выхожу из отряда, дальше каждый сам за себя.",
      "Отделяюсь от отряда и ухожу в горы.",
      "Дальше я иду один.",
      "Пойду один, не хочу рисковать вашей жизнью.",
      "Разделяемся: ты направо, я налево.",
    ];

    for (const phrase of validLeaves) {
      expect(isPartyLeaveRegex.test(phrase), `Failed on phrase: "${phrase}"`).toBe(true);
    }
  });

  it("does not false-positive on ordinary neutral dialog", () => {
    const neutrals = [
      "Просто осматриваю таверну и пью эль.",
      "Спрашиваю у торговца, сколько стоит этот меч.",
      "Иду спать на второй этаж.",
      "Атакую гоблина мечом!",
    ];

    for (const phrase of neutrals) {
      expect(isPartyInviteOrJoinRegex.test(phrase)).toBe(false);
      expect(isPartyLeaveRegex.test(phrase)).toBe(false);
    }
  });

  it("forms a party correctly and updates session & player party_id", () => {
    const session: any = {
      id: "sess-1",
      party_groups: [],
    };
    const player1: any = { id: "p1", name: "Арин", party_id: null, current_zone: "зал" };
    const player2: any = { id: "p2", name: "Ирис", party_id: null, current_zone: "зал" };

    // Simulate party formation block from index.ts
    const partner = player2;
    let groups = Array.isArray(session.party_groups) ? [...session.party_groups] : [];
    let existingParty = groups.find((g: any) => g.members?.includes(partner.id) || g.members?.includes(player1.id));
    let partyId = existingParty?.id || "party-uuid-123";

    if (!existingParty) {
      groups.push({
        id: partyId,
        name: `Отряд ${player1.name} и ${partner.name}`,
        leader_id: player1.id,
        members: [player1.id, partner.id],
      });
    }

    session.party_groups = groups;
    player1.party_id = partyId;
    player2.party_id = partyId;

    expect(session.party_groups).toHaveLength(1);
    expect(session.party_groups[0].name).toBe("Отряд Арин и Ирис");
    expect(session.party_groups[0].members).toEqual(["p1", "p2"]);
    expect(player1.party_id).toBe("party-uuid-123");
    expect(player2.party_id).toBe("party-uuid-123");
  });

  it("disbands party cleanly when members leave", () => {
    const session: any = {
      id: "sess-1",
      party_groups: [
        {
          id: "party-uuid-123",
          name: "Отряд Арин и Ирис",
          leader_id: "p1",
          members: ["p1", "p2"],
        },
      ],
    };
    const player1: any = { id: "p1", name: "Арин", party_id: "party-uuid-123" };
    const player2: any = { id: "p2", name: "Ирис", party_id: "party-uuid-123" };

    // Player 1 leaves
    let groups = session.party_groups
      .map((g: any) => ({
        ...g,
        members: (g.members || []).filter((m: string) => m !== player1.id),
      }))
      .filter((g: any) => (g.members || []).length > 1);

    session.party_groups = groups;
    player1.party_id = null;

    // Remaining party had only 1 member, so dissolved
    expect(session.party_groups).toHaveLength(0);
    expect(player1.party_id).toBeNull();
  });
});

describe("Multiplayer Comprehensive: 3. Group Movement Synchronization", () => {
  function arePlayersInSameParty(playerA: any, playerB: any, sess: any): boolean {
    if (!playerA || !playerB) return false;
    if (playerA.party_id && playerB.party_id && playerA.party_id === playerB.party_id) return true;
    if (Array.isArray(sess?.party_groups)) {
      for (const g of sess.party_groups) {
        if (Array.isArray(g.members) && g.members.includes(playerA.id) && g.members.includes(playerB.id)) {
          return true;
        }
      }
    }
    return false;
  }

  it("moves party members together only if they are in the same starting zone", () => {
    const session = {
      party_groups: [{ id: "party-1", members: ["p1", "p2", "p3"] }],
    };

    const p1 = { id: "p1", name: "Арин", party_id: "party-1", current_zone: "зал", current_subzone: "очаг" };
    const p2 = { id: "p2", name: "Ирис", party_id: "party-1", current_zone: "зал", current_subzone: "очаг" };
    const p3 = { id: "p3", name: "Торин", party_id: "party-1", current_zone: "лес", current_subzone: "поляна" }; // in a different zone!
    const p4 = { id: "p4", name: "Бродяга", party_id: null, current_zone: "зал", current_subzone: "очаг" }; // not in party

    const allPlayers = [p1, p2, p3, p4];
    const playerStartingZone = p1.current_zone;
    const destinationZone = "площадь";
    const destinationSubzone = "фонтан";

    // Engine logic from index.ts:
    const partyFellowsInSameZone = allPlayers.filter((p) =>
      p.id !== p1.id &&
      arePlayersInSameParty(p1, p, session) &&
      (p.current_zone || null) === playerStartingZone
    );

    // Only p2 should qualify (in party AND in same zone)
    expect(partyFellowsInSameZone.map(p => p.id)).toEqual(["p2"]);

    // Apply movement
    for (const fellow of partyFellowsInSameZone) {
      fellow.current_zone = destinationZone;
      fellow.current_subzone = destinationSubzone;
    }
    p1.current_zone = destinationZone;
    p1.current_subzone = destinationSubzone;

    // p1 and p2 moved to square
    expect(p1.current_zone).toBe("площадь");
    expect(p2.current_zone).toBe("площадь");
    // p3 remained in forest
    expect(p3.current_zone).toBe("лес");
    // p4 remained in tavern
    expect(p4.current_zone).toBe("зал");
  });
});

describe("Multiplayer Comprehensive: 4. Inter-Player Item Transfer", () => {
  const pGiver = {
    id: "p-giver",
    name: "Арин",
    stats: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 10 },
    hp: 20,
    max_hp: 20,
    armor_class: 12,
    initiative: 2,
    level: 1,
    inventory: [
      { id: "item-torch", item_name: "Смоляной факел", quantity: 3, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const pReceiver = {
    id: "p-receiver",
    name: "Ирис",
    stats: { STR: 10, DEX: 12, CON: 10, INT: 14, WIS: 12, CHA: 14 },
    hp: 18,
    max_hp: 18,
    armor_class: 11,
    initiative: 1,
    level: 1,
    inventory: [],
    injuries: [],
    skills: {},
  };

  const dummyContext: EngineInputContext = {
    session: {
      id: "sess-mp",
      difficulty: "normal",
      is_pvp_enabled: false,
      game_year: 1248,
      game_month: 6,
      game_day: 10,
      game_hour: 20,
      game_minute: 0,
      current_location_id: "loc-dungeon",
    },
    acting_player: pGiver,
    targets: {
      players: new Map([
        ["p-giver", pGiver],
        ["p-receiver", pReceiver],
      ]),
      npcs: new Map(),
      location_items: new Map(),
    },
  };

  it("TransferHandler creates TRANSFER_ITEM mutation from player to player", () => {
    const handler = new TransferHandler();
    const result = handler.handle(
      {
        action_type: "transfer",
        target_entity_id: "p-receiver",
        used_item_id: "item-torch",
        consumed_materials: [{ id: "item-torch", quantity: 1 }],
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      dummyContext
    );

    expect(result.result.success).toBe(true);
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0]).toMatchObject({
      type: "TRANSFER_ITEM",
      from_type: "player",
      from_id: "p-giver",
      to_type: "player",
      to_id: "p-receiver",
      quantity: 1,
    });
    expect(result.system_facts[0]).toContain("Арин передал Смоляной факел (x1) → Ирис");
  });

  it("compileSystemTruth accurately records added/removed item deltas for both parties", async () => {
    const truth = await compileSystemTruth({
      session_id: "sess-mp",
      acting_player_id: "p-giver",
      engine_output: {
        action_results: [
          {
            action_type: "transfer",
            success: true,
            target_entity_id: "p-receiver",
            target_id: "p-receiver",
            details: "Передача факела",
          } as any,
        ],
        mutations: [
          {
            type: "TRANSFER_ITEM",
            from_id: "p-giver",
            to_id: "p-receiver",
            from_type: "player",
            to_type: "player",
            item_id: "item-torch",
            quantity: 1,
          },
        ],
        system_facts: [
          "Арин передал Смоляной факел (x1) → Ирис.",
        ],
        raw_system_facts: [],
      },
      persistence_output: {
        status: "committed",
        applied_mutations_count: 1,
        logs: [],
      },
      session: {
        id: "sess-mp",
        current_location: "Пещера",
        current_location_id: "loc-dungeon",
        game_year: 1248,
        game_month: 6,
        game_day: 10,
        game_hour: 20,
        game_minute: 0,
      } as any,
      location: {
        id: "loc-dungeon",
        name: "Пещера",
      } as any,
      players: [
        { id: "p-giver", name: "Арин", current_hp: 20, max_hp: 20, inventory: [] },
        { id: "p-receiver", name: "Ирис", current_hp: 18, max_hp: 18, inventory: [{ item_name: "Смоляной факел", quantity: 1 }] },
      ] as any,
      npcs: [],
      time_passed_minutes: 2,
      atmosphere: { sounds: ["Капли воды"], visuals: ["Сырость"] },
      encounter_alert: null,
    });

    const giverTruth = truth.player_truths["p-giver"];
    const receiverTruth = truth.player_truths["p-receiver"];

    expect(giverTruth).toBeDefined();
    expect(receiverTruth).toBeDefined();
    expect(receiverTruth.knowledge.some(k => k.includes("Арин передал") || k.includes("Ирис"))).toBe(true);
  });
});

describe("Multiplayer Comprehensive: 5. Strict Anti-Puppeteering (No Godmoding)", () => {
  it("Narrator system prompt contains explicit rule 10 strictly forbidding DM puppeteering", () => {
    const prompt = buildNarratorSystemPrompt("Арин", "Эльф", "Следопыт", "Лор мира");

    expect(prompt).toContain("ВЗАИМОДЕЙСТВИЕ МЕЖДУ ИГРОКАМИ И СТРОГИЙ ЗАПРЕТ КУКЛОВОДСТВА");
    expect(prompt).toContain("СТРОЖАЙШИЙ ЗАПРЕТ КУКЛОВОДСТВА (NO GODMODING)");
    expect(prompt).toContain("ЗАПРЕЩЕНО совершать действия, принимать решения, соглашаться, отказываться или произносить реплики ЗА ДРУГОГО ЖИВОГО ИГРОКА");
    expect(prompt).toContain("ОСТАВЬ РЕАКЦИЮ И ОТВЕТ ЦЕЛИКОМ НА УСМОТРЕНИЕ САМОГО ИГРОКА");
  });

  // Automated puppeteering detector for quality checks
  function detectPuppeteeringViolations(textForTarget: string, targetPlayerName: string): { isClean: boolean; violations: string[] } {
    const violations: string[] = [];

    // Puppeteering patterns: DM forcing spoken replies or decisions on behalf of target player
    const forcedSpeechPattern = new RegExp(`${targetPlayerName}\\s+(?:ответил[а-я]*|сказал[а-я]*|возразил[а-я]*|согласил[а-я]*|крикнул[а-я]*|прошептал[а-я]*)\\s*[:«"']`, "i");
    const forcedAgreementPattern = new RegExp(`${targetPlayerName}\\s+(?:кивнул[а-я]*\\s+и\\s+согласил[а-я]*|с\\s+радостью\\s+согласил[а-я]*|отказал[а-я]*сь)`, "i");
    const forcedActionPattern = new RegExp(`${targetPlayerName}\\s+(?:выхватил[а-я]*|напал[а-я]*|побежал[а-я]*|выпил[а-я]*\\s+залпом)`, "i");

    if (forcedSpeechPattern.test(textForTarget)) {
      violations.push(`Forced speech generated on behalf of living player ${targetPlayerName}`);
    }
    if (forcedAgreementPattern.test(textForTarget)) {
      violations.push(`Forced decision/agreement generated on behalf of living player ${targetPlayerName}`);
    }
    if (forcedActionPattern.test(textForTarget)) {
      violations.push(`Forced independent physical action generated on behalf of living player ${targetPlayerName}`);
    }

    return {
      isClean: violations.length === 0,
      violations,
    };
  }

  it("passes compliant narrative where DM leaves response up to the living player", () => {
    const compliantNarrative = `
      Тени ложатся на замшелые камни. Прохладный сквозняк колышет край плаща.
      Арин делает шаг навстречу и протягивает вам целебную мазь, держа её на раскрытой ладони: «Возьми, впереди опасные тропы».
      Его взгляд выжидателен. Весь выбор — принимать ли дар и отвечать ли спутнику — остаётся за вами.
    `;

    const check = detectPuppeteeringViolations(compliantNarrative, "Ирис");
    expect(check.isClean).toBe(true);
    expect(check.violations).toHaveLength(0);
  });

  it("correctly flags and rejects non-compliant narratives with godmoding/puppeteering", () => {
    const violatingNarrative1 = `
      Ирис ответила: «Конечно, я пойду с тобой!» и взяла факел.
    `;
    const check1 = detectPuppeteeringViolations(violatingNarrative1, "Ирис");
    expect(check1.isClean).toBe(false);
    expect(check1.violations.some(v => v.includes("Forced speech"))).toBe(true);

    const violatingNarrative2 = `
      Ирис кивнула и согласилась на предложение Арина.
    `;
    const check2 = detectPuppeteeringViolations(violatingNarrative2, "Ирис");
    expect(check2.isClean).toBe(false);
    expect(check2.violations.some(v => v.includes("Forced decision/agreement"))).toBe(true);

    const violatingNarrative3 = `
      Ирис выпила залпом всё зелье до дна и почувствовала прилив сил.
    `;
    const check3 = detectPuppeteeringViolations(violatingNarrative3, "Ирис");
    expect(check3.isClean).toBe(false);
    expect(check3.violations.some(v => v.includes("Forced independent physical action"))).toBe(true);
  });
});
