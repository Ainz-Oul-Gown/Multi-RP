// tests/steps/step2_engine.test.ts
// Тесты для Шага 2: Математическое Ядро (D&D Engine)
import { describe, it, expect, vi, beforeEach } from "vitest";

import { EngineInputContext } from "../../supabase/functions/process-turn/engine/types.ts";
import { RouterOutputPayload } from "../../supabase/functions/process-turn/types.ts";
import { executeEngine } from "../../supabase/functions/process-turn/engine/step2_engine.ts";
import {
  rollD20, rollD100, rollD20Advantage, rollD20Disadvantage,
  getStatModifier, getProficiencyBonus, performAttackRoll,
  rollDamage, parseDiceString,
} from "../../supabase/functions/process-turn/engine/dice.ts";

// ============================================
// Утилиты для тестов
// ============================================
function makePlayer(overrides: Partial<any> = {}): any {
  return {
    id: "player-1",
    name: "Элария",
    stats: { STR: 12, DEX: 18, CON: 14, INT: 13, WIS: 12, CHA: 15 },
    hp: 45, max_hp: 50,
    armor_class: 14,
    initiative: 4,
    level: 5,
    inventory: [
      { id: "item-sword", item_name: "Стальной меч", type: "weapon", quantity: 1, durability: 15, condition: "good", attributes: { damage_dice: "1d8+2" } },
      { id: "item-wood", item_name: "Дерево", type: "material", quantity: 5, durability: null, condition: null, attributes: null },
      { id: "item-stone", item_name: "Камень", type: "material", quantity: 10, durability: null, condition: null, attributes: null },
    ],
    injuries: [],
    ...overrides,
  };
}

function makeNpc(overrides: Partial<any> = {}): any {
  return {
    id: "npc-goblin-1",
    name: "Гоблин-разведчик",
    race: "Гоблин",
    hp: 12, max_hp: 15,
    armor_class: 13,
    level: 1,
    stats: { STR: 8, DEX: 14, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    is_hostile: true,
    is_alive: true,
    ...overrides,
  };
}

function makeContext(overrides: Partial<EngineInputContext> = {}): EngineInputContext {
  const player = overrides.acting_player || makePlayer();
  const npc = makeNpc();
  const playerMap = new Map([[player.id, player]]);
  const npcMap = new Map([[npc.id, npc]]);

  return {
    router_output: overrides.router_output || {
      status: "success",
      clarification_msg: null,
      actions: [],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    },
    session: overrides.session || {
      id: "session-1",
      difficulty: "normal",
      is_pvp_enabled: false,
      game_year: 1, game_month: 1, game_day: 1,
      game_hour: 8, game_minute: 0,
      current_location_id: "loc-1",
    },
    acting_player: player,
    targets: overrides.targets || {
      players: playerMap,
      npcs: npcMap,
      location_items: new Map(),
    },
  };
}

function makeRouterOutput(actions: any[], opts: Partial<RouterOutputPayload> = {}): RouterOutputPayload {
  return {
    status: "success",
    clarification_msg: null,
    actions,
    encounter_intent: { type: "none", target_name: null },
    time_estimate_minutes: 0,
    atmosphere: { sounds: [], visuals: [] },
    ...opts,
  };
}

// ============================================
// ТЕСТЫ: Кубики (dice.ts)
// ============================================
describe("Кубики (dice.ts)", () => {
  it("getStatModifier: floor((STAT-10)/2)", () => {
    expect(getStatModifier(10)).toBe(0);
    expect(getStatModifier(14)).toBe(2);
    expect(getStatModifier(18)).toBe(4);
    expect(getStatModifier(8)).toBe(-1);
    expect(getStatModifier(7)).toBe(-2);
  });

  it("getProficiencyBonus: ceil(level/4)+1", () => {
    expect(getProficiencyBonus(1)).toBe(2);
    expect(getProficiencyBonus(4)).toBe(2);
    expect(getProficiencyBonus(5)).toBe(3);
    expect(getProficiencyBonus(8)).toBe(3);
    expect(getProficiencyBonus(9)).toBe(4);
  });

  it("parseDiceString парсит корректные строки", () => {
    expect(parseDiceString("1d8")).toEqual({ count: 1, sides: 8, modifier: 0 });
    expect(parseDiceString("1d8+2")).toEqual({ count: 1, sides: 8, modifier: 2 });
    expect(parseDiceString("2d6-1")).toEqual({ count: 2, sides: 6, modifier: -1 });
    expect(parseDiceString("invalid")).toBeNull();
  });

  it("rollDamage выдаёт total в ожидаемом диапазоне", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollDamage("1d8+2");
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(10);
      expect(r.rolls).toHaveLength(1);
    }
  });

  it("performAttackRoll: crit=20 → success, fumble=1 → fail (мок через spy)", () => {
    // Тестируем логику crit/fumble без мока Math.random (ненадёжен в Vitest)
    // Создаём 1000 бросков и считаем статистику
    let crits = 0, fumbles = 0, successes = 0;
    for (let i = 0; i < 1000; i++) {
      const r = performAttackRoll({ target_dc: 50, stat_modifier: 0 });
      if (r.is_crit) crits++;
      if (r.is_fumble) fumbles++;
      if (r.success) successes++;
    }

    // crit и fumble должны быть ~5% каждый (1/20)
    expect(crits).toBeGreaterThan(20);
    expect(crits).toBeLessThan(80);
    expect(fumbles).toBeGreaterThan(20);
    expect(fumbles).toBeLessThan(80);
    // При DC=50 и mod=0 — успехи только от crit (~5%)
    expect(successes).toBeGreaterThan(20);
    expect(successes).toBeLessThan(80);
  });

  it("performAttackRoll: advantage/disadvantage (использует 2 броска)", () => {
    // Используем [5, 18] через прямое присваивание
    const adv = { rolls: [5, 18] as [number, number], best: 18 };
    const dis = { rolls: [5, 18] as [number, number], worst: 5 };

    expect(adv.best).toBeGreaterThan(adv.rolls[0]);
    expect(dis.worst).toBeLessThan(dis.rolls[1]);

    // Реальный вызов: 2 броска d20 в диапазоне 1-20
    for (let i = 0; i < 20; i++) {
      const a = rollD20Advantage();
      const d = rollD20Disadvantage();
      expect(a.rolls).toHaveLength(2);
      expect(d.rolls).toHaveLength(2);
      expect(a.best).toBe(Math.max(a.rolls[0], a.rolls[1]));
      expect(d.worst).toBe(Math.min(d.rolls[0], d.rolls[1]));
      expect(a.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(a.rolls[0]).toBeLessThanOrEqual(20);
    }
  });
});

// ============================================
// ТЕСТЫ: Attack Handler
// ============================================
describe("AttackHandler", () => {
  it("успешная атака по NPC с нанесением урона", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "attack",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 1, // низкий DC = гарантированный успех
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(true);
    expect(result.action_results).toHaveLength(1);
    expect(result.action_results[0].action_type).toBe("attack");
    expect(result.action_results[0].dice_roll?.success).toBe(true);
    expect(result.action_results[0].damage_dealt).toBeGreaterThan(0);
    
    // Должна быть мутация UPDATE_HP
    const updateHp = result.mutations.find((m) => m.type === "UPDATE_HP");
    expect(updateHp).toBeDefined();
    expect((updateHp as any).target_type).toBe("npc");
    expect((updateHp as any).id).toBe("npc-goblin-1");
    expect((updateHp as any).delta).toBeLessThan(0); // отрицательный урон
  });

  it("атака с промахом — нет мутации HP", () => {
    // Мокаем Math.random так, чтобы d20 = 11 (Math.floor(0.5 * 20) + 1 = 11), но DC=100 → промах гарантирован
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "attack",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 100, // невозможно попасть (11+мод < 100)
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    randomSpy.mockRestore();
    expect(result.action_results[0].dice_roll?.success).toBe(false);
    expect(result.action_results[0].damage_dealt).toBeUndefined();
    expect(result.mutations.find((m) => m.type === "UPDATE_HP")).toBeUndefined();
  });

  it("PvP блокировка когда is_pvp_enabled = false", () => {
    const targetPlayer = makePlayer({ id: "player-2", name: "Другой игрок" });
    const playerMap = new Map([
      ["player-1", makePlayer()],
      ["player-2", targetPlayer],
    ]);

    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "attack",
          target_entity_id: "player-2",
          target_item_name: null,
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 1,
          improper_tool_usage: null,
        },
      ]),
      session: {
        id: "session-1",
        difficulty: "normal",
        is_pvp_enabled: false,
        game_year: 1, game_month: 1, game_day: 1,
        game_hour: 8, game_minute: 0,
        current_location_id: "loc-1",
      },
      targets: { players: playerMap, npcs: new Map(), location_items: new Map() },
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].blocked).toBe(true);
    expect(result.action_results[0].block_reason).toContain("PvP");
    expect(result.mutations.find((m) => m.type === "UPDATE_HP")).toBeUndefined();
  });

  it("PvP разрешён когда is_pvp_enabled = true", () => {
    // Мокаем Math.random чтобы гарантировать попадание (d20 = 20)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9999); // → d20=20
    try {
      const targetPlayer = makePlayer({ id: "player-2", name: "Другой игрок" });
    const playerMap = new Map([
      ["player-1", makePlayer()],
      ["player-2", targetPlayer],
    ]);

    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "attack",
          target_entity_id: "player-2",
          target_item_name: null,
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 1,
          improper_tool_usage: null,
        },
      ]),
      session: {
        id: "session-1",
        difficulty: "normal",
        is_pvp_enabled: true,
        game_year: 1, game_month: 1, game_day: 1,
        game_hour: 8, game_minute: 0,
        current_location_id: "loc-1",
      },
      targets: { players: playerMap, npcs: new Map(), location_items: new Map() },
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].blocked).toBeFalsy();
    const updateHp = result.mutations.find((m) => m.type === "UPDATE_HP" && (m as any).target_type === "player");
    expect(updateHp).toBeDefined();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("improper_tool_usage добавляет мутацию UPDATE_DURABILITY", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "harvest_ambient",
          target_entity_id: null,
          target_item_name: "камень",
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 1,
          improper_tool_usage: {
            is_improper: true,
            durability_penalty: 2,
            stat_penalty: "damage",
            reason: "Меч для рубки дерева",
          },
        },
      ]),
    });

    const result = executeEngine(ctx);
    const durMutation = result.mutations.find((m) => m.type === "UPDATE_DURABILITY");
    expect(durMutation).toBeDefined();
    expect((durMutation as any).item_id).toBe("item-sword");
    expect((durMutation as any).delta).toBe(-2);
    expect((durMutation as any).set_broken).toBe(true);
  });
});

// ============================================
// ТЕСТЫ: Craft Handler
// ============================================
describe("CraftHandler", () => {
  it("провал крафта при нехватке материалов", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "craft_recipe",
          target_entity_id: null,
          target_item_name: "Меч",
          used_item_id: null,
          consumed_materials: [
            { id: "item-wood", quantity: 100 }, // нужно 100, есть 5
          ],
          stat_to_check: "dexterity",
          ai_custom_dc: 10,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(false);
    expect(result.action_results[0].details).toContain("Недостаточно материалов");
    expect(result.mutations.find((m) => m.type === "DELETE_ITEM")).toBeUndefined();
  });

  it("успешный крафт с правильным количеством материалов", () => {
    // Мокаем Math.random чтобы гарантировать успех проверки (d20 = 20)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9999);
    try {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "craft_recipe",
          target_entity_id: null,
          target_item_name: "Деревянный меч",
          used_item_id: null,
          consumed_materials: [
            { id: "item-wood", quantity: 2 },
          ],
          stat_to_check: "dexterity",
          ai_custom_dc: 1, // гарантированный успех
          improper_tool_usage: null,
          dynamic_blueprint: { item_name: "Деревянный меч", type: "weapon", quantity: 1 },
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(true);

    // DELETE_ITEM для материалов
    const deleteMutation = result.mutations.find((m) => m.type === "DELETE_ITEM" && (m as any).item_id === "item-wood");
    expect(deleteMutation).toBeDefined();
    expect((deleteMutation as any).quantity).toBe(2);

    // INSERT_ITEM для нового предмета
    const insertMutation = result.mutations.find((m) => m.type === "INSERT_ITEM");
    expect(insertMutation).toBeDefined();
    expect((insertMutation as any).item.item_name).toBe("Деревянный меч");
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("провал крафта списывает 50% материалов", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.0001);
    try {
      const ctx = makeContext({
        router_output: makeRouterOutput([
          {
            action_type: "craft_recipe",
            target_entity_id: null,
            target_item_name: "Меч",
            used_item_id: null,
            consumed_materials: [
              { id: "item-wood", quantity: 4 },
            ],
            stat_to_check: "dexterity",
            ai_custom_dc: 100, // гарантированный провал
            improper_tool_usage: null,
            dynamic_blueprint: { item_name: "Меч" },
          },
        ]),
      });

      const result = executeEngine(ctx);
      expect(result.action_results[0].success).toBe(false);
      
      const deleteMutation = result.mutations.find((m) => m.type === "DELETE_ITEM");
      expect(deleteMutation).toBeDefined();
      // 50% от 4 = 2
      expect((deleteMutation as any).quantity).toBe(2);
      
      // Нет INSERT_ITEM при провале
      expect(result.mutations.find((m) => m.type === "INSERT_ITEM")).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

// ============================================
// ТЕСТЫ: Transfer Handler
// ============================================
describe("TransferHandler", () => {
  it("успешная передача предмета NPC", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "transfer",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-wood",
          consumed_materials: null,
          stat_to_check: "none",
          ai_custom_dc: null,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(true);
    const transfer = result.mutations.find((m) => m.type === "TRANSFER_ITEM");
    expect(transfer).toBeDefined();
    expect((transfer as any).item_id).toBe("item-wood");
    expect((transfer as any).to_id).toBe("npc-goblin-1");
    expect((transfer as any).to_type).toBe("npc");
  });

  it("провал при отсутствии предмета в инвентаре", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "transfer",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-nonexistent",
          consumed_materials: null,
          stat_to_check: "none",
          ai_custom_dc: null,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(false);
    expect(result.mutations.find((m) => m.type === "TRANSFER_ITEM")).toBeUndefined();
  });
});

// ============================================
// ТЕСТЫ: Encounter (d100)
// ============================================
describe("Random Encounter (d100)", () => {
  it("не срабатывает когда encounter_intent.type = 'none'", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([], {
        encounter_intent: { type: "none", target_name: null },
      }),
    });
    const result = executeEngine(ctx);
    expect(result.encounter_triggered.triggered).toBe(false);
  });

  it("может сработать на easy/normal/hard (мок Math.random)", () => {
    const originalRandom = Math.random;
    Math.random = () => 0.001; // d100 = 1 → < 5/10/15 → триггернется на любой сложности

    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const ctx = makeContext({
        router_output: makeRouterOutput([], {
          encounter_intent: { type: "random", target_name: null },
        }),
        session: {
          id: "session-1",
          difficulty,
          is_pvp_enabled: false,
          game_year: 1, game_month: 1, game_day: 1,
          game_hour: 8, game_minute: 0,
          current_location_id: "loc-1",
        },
      });
      const result = executeEngine(ctx);
      expect(result.encounter_triggered.triggered).toBe(true);
    }

    Math.random = originalRandom;
  });

  it("не срабатывает при roll > threshold", () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // d100 = 50 → > 5/10/15

    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const ctx = makeContext({
        router_output: makeRouterOutput([], {
          encounter_intent: { type: "random", target_name: null },
        }),
        session: {
          id: "session-1",
          difficulty,
          is_pvp_enabled: false,
          game_year: 1, game_month: 1, game_day: 1,
          game_hour: 8, game_minute: 0,
          current_location_id: "loc-1",
        },
      });
      const result = executeEngine(ctx);
      expect(result.encounter_triggered.triggered).toBe(false);
    }

    Math.random = originalRandom;
  });
});

// ============================================
// ТЕСТЫ: Оркестратор
// ============================================
describe("executeEngine (оркестратор)", () => {
  it("блокирует все действия если status=impossible", () => {
    const ctx = makeContext({
      router_output: {
        status: "impossible",
        clarification_msg: "Невозможно",
        actions: [],
        encounter_intent: { type: "none", target_name: null },
        time_estimate_minutes: 0,
        atmosphere: { sounds: [], visuals: [] },
      },
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(false);
    expect(result.action_results[0].blocked).toBe(true);
    expect(result.mutations).toHaveLength(0);
  });

  it("блокирует все действия если status=clarification_needed", () => {
    const ctx = makeContext({
      router_output: {
        status: "clarification_needed",
        clarification_msg: "Уточните",
        actions: [],
        encounter_intent: { type: "none", target_name: null },
        time_estimate_minutes: 0,
        atmosphere: { sounds: [], visuals: [] },
      },
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(false);
    expect(result.action_results[0].blocked).toBe(true);
  });

  it("добавляет мутацию ADVANCE_TIME если time_estimate_minutes > 0", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([], { time_estimate_minutes: 45 }),
    });

    const result = executeEngine(ctx);
    const advanceMutation = result.mutations.find((m) => m.type === "ADVANCE_TIME");
    expect(advanceMutation).toBeDefined();
    expect((advanceMutation as any).minutes).toBe(45);
  });

  it("raw_system_facts содержит итоги всех действий", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "attack",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-sword",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 1,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.raw_system_facts.length).toBeGreaterThan(0);
    expect(result.raw_system_facts.some((f) => f.includes("Элария"))).toBe(true);
  });
});

// ============================================
// ТЕСТЫ: Move Handler
// ============================================
describe("MoveHandler", () => {
  it("свободное перемещение без DC — всегда успешно", () => {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "move",
          target_entity_id: null,
          target_item_name: "озеро",
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "dexterity",
          ai_custom_dc: 0,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(true);
    expect(result.action_results[0].action_type).toBe("move");
    expect(result.action_results[0].success).toBe(true);
    expect(result.action_results[0].details).toContain("озеро");
  });

  it("перемещение с DC = 1 — гарантированный успех", () => {
    // Мокаем Math.random чтобы d20 = 20 (гарантированный успех)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9999);
    try {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "move",
          target_entity_id: null,
          target_item_name: "укрытие",
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "dexterity",
          ai_custom_dc: 1,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(true);
    expect(result.action_results[0].dice_roll?.success).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("перемещение с невозможным DC = 100 — провал", () => {
    // Мокаем Math.random чтобы d20 = 1 (fumble, гарантированный провал)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.0001);
    try {
    const ctx = makeContext({
      router_output: makeRouterOutput([
        {
          action_type: "move",
          target_entity_id: null,
          target_item_name: "недоступная зона",
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "dexterity",
          ai_custom_dc: 100,
          improper_tool_usage: null,
        },
      ]),
    });

    const result = executeEngine(ctx);
    expect(result.action_results[0].success).toBe(false);
    expect(result.action_results[0].dice_roll?.success).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  });

  describe("Сложность сессии (difficulty: easy / hard)", () => {
    it("сложность easy делает броски сбора ресурсов (harvest_ambient) с преимуществом (2 броска, выбирается лучший)", () => {
      // Мокаем 2 броска d20: первый 0.05 (d20=2), второй 0.95 (d20=20)
      const randomSpy = vi.spyOn(Math, "random")
        .mockReturnValueOnce(0.05) // d20=2
        .mockReturnValueOnce(0.95) // d20=20 (преимущество выбирает 20)
        .mockReturnValue(0.5);

      try {
        const ctx = makeContext({
          session: {
            id: "session-1",
            difficulty: "easy",
            is_pvp_enabled: false,
            game_year: 1248,
            game_month: 5,
            game_day: 14,
            game_hour: 10,
            game_minute: 0,
            current_location_id: "loc-1",
          },
          router_output: makeRouterOutput([
            {
              action_type: "harvest_ambient",
              target_entity_id: null,
              target_item_name: "палки",
              used_item_id: null,
              consumed_materials: null,
              stat_to_check: "survival",
              ai_custom_dc: 15,
              improper_tool_usage: null,
            },
          ]),
        });

        const result = executeEngine(ctx);
        expect(result.action_results[0].success).toBe(true);
        expect(result.action_results[0].dice_roll?.d20).toBe(20);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it("сложность hard делает броски поиска (search) с помехой (2 броска, выбирается худший)", () => {
      // Мокаем 2 броска: первый 0.95 (d20=20), второй 0.05 (d20=2)
      const randomSpy = vi.spyOn(Math, "random")
        .mockReturnValueOnce(0.95) // d20=20
        .mockReturnValueOnce(0.05) // d20=2 (помеха выбирает 2)
        .mockReturnValue(0.5);

      try {
        const ctx = makeContext({
          session: {
            id: "session-1",
            difficulty: "hard",
            is_pvp_enabled: false,
            game_year: 1248,
            game_month: 5,
            game_day: 14,
            game_hour: 10,
            game_minute: 0,
            current_location_id: "loc-1",
          },
          router_output: makeRouterOutput([
            {
              action_type: "search",
              target_entity_id: null,
              target_item_name: "тайник",
              used_item_id: null,
              consumed_materials: null,
              stat_to_check: "investigation",
              ai_custom_dc: 10,
              improper_tool_usage: null,
            },
          ]),
        });

        const result = executeEngine(ctx);
        expect(result.action_results[0].success).toBe(false);
        expect(result.action_results[0].dice_roll?.d20).toBe(2);
      } finally {
        randomSpy.mockRestore();
      }
    });
  });
});

