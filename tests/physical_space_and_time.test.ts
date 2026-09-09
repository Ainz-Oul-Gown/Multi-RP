// tests/physical_space_and_time.test.ts
// Тесты для нового функционала: физическое пространство, координаты (X,Y),
// статус длительной занятости (Busy State) и учет сложности/скрытности при энкаунтерах.

import { describe, it, expect } from "vitest";
import { executeEngine } from "../supabase/functions/process-turn/engine/step2_engine.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
import { buildUserMessage } from "../supabase/functions/process-turn/steps/step1_router.ts";

function createMockPlayer(overrides = {}) {
  return {
    id: "player-test-uuid",
    name: "Рейнджер",
    stats: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 14, CHA: 8 },
    hp: 40,
    max_hp: 40,
    armor_class: 14,
    initiative: 3,
    level: 3,
    inventory: [],
    injuries: [],
    pos_x: 10,
    pos_y: 20,
    ...overrides,
  };
}

function createMockContext(overrides = {}): EngineInputContext {
  const player = createMockPlayer();
  return {
    router_output: {
      status: "success",
      clarification_msg: null,
      actions: [],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 10,
      atmosphere: { sounds: [], visuals: [] },
    },
    session: {
      id: "sess-1",
      difficulty: "normal",
      is_pvp_enabled: false,
      game_year: 1,
      game_month: 1,
      game_day: 1,
      game_hour: 12,
      game_minute: 0,
      current_location_id: "loc-1",
    },
    acting_player: player,
    targets: {
      players: new Map([[player.id, player]]),
      npcs: new Map(),
      location_items: new Map(),
    },
    ...overrides,
  };
}

describe("Физическое пространство и Перемещение", () => {
  it("генерирует мутации UPDATE_ENTITY_COORDS и SET_PLAYER_SUBZONE при движении", () => {
    const ctx = createMockContext({
      router_output: {
        status: "success",
        clarification_msg: null,
        actions: [
          {
            action_type: "move",
            target_entity_id: null,
            target_subzone_id: "subzone-tavern-counter",
            target_name: null,
            target_item_name: "Стойка трактирщика",
            item_type: null,
            used_item_id: null,
            consumed_materials: null,
            stat_to_check: "none",
            ai_custom_dc: null,
            improper_tool_usage: null,
            target_coords: { x: 15.5, y: 22.0 },
            speed_modifier: 1.0,
            stealth_factor: 0.8,
          },
        ],
        encounter_intent: { type: "none", target_name: null },
        time_estimate_minutes: 5,
        atmosphere: { sounds: [], visuals: [] },
      },
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(true);

    const subzoneMutation = result.mutations.find((m) => m.type === "SET_PLAYER_SUBZONE");
    expect(subzoneMutation).toBeDefined();
    // @ts-ignore
    expect(subzoneMutation?.subzone_id).toBe("subzone-tavern-counter");

    const coordsMutation = result.mutations.find((m) => m.type === "UPDATE_ENTITY_COORDS");
    expect(coordsMutation).toBeDefined();
    // @ts-ignore
    expect(coordsMutation?.pos_x).toBe(15.5);
    // @ts-ignore
    expect(coordsMutation?.pos_y).toBe(22.0);
  });

  it("Step 1 Router передает физические подзоны в prompt context", () => {
    const userMsg = buildUserMessage({
      player_action_text: "Иду к стойке",
      player: { name: "Герой" },
      available_subzones: [
        { id: "sz-1", name: "Барная стойка", pos_x: 5, pos_y: 5, radius: 3 },
        { id: "sz-2", name: "Камин", pos_x: -4, pos_y: 2, radius: 4 },
      ],
    });

    expect(userMsg).toContain("## Физические подзоны рядом");
    expect(userMsg).toContain("[ID:sz-1] \"Барная стойка\"");
    expect(userMsg).toContain("x=5, y=5");
  });
});

describe("Управление Временем и Статус занятости (Busy State)", () => {
  it("генерирует мутацию SET_PLAYER_BUSY при наличии long_term_activity", () => {
    const ctx = createMockContext({
      router_output: {
        status: "success",
        clarification_msg: null,
        actions: [],
        encounter_intent: { type: "none", target_name: null },
        time_estimate_minutes: 0,
        atmosphere: { sounds: [], visuals: [] },
        long_term_activity: {
          is_long_term: true,
          activity_name: "Добыча руды в шахте",
          duration_minutes: 20160, // 2 недели
          reward_preview: "2 тонны железной руды",
        },
      },
    });

    const result = executeEngine(ctx);
    expect(result.success).toBe(true);

    const busyMutation = result.mutations.find((m) => m.type === "SET_PLAYER_BUSY");
    expect(busyMutation).toBeDefined();
    // @ts-ignore
    expect(busyMutation?.activity).toBe("Добыча руды в шахте");
    // @ts-ignore
    expect(busyMutation?.minutes).toBe(20160);
    // @ts-ignore
    expect(busyMutation?.reward_preview).toBe("2 тонны железной руды");

    expect(result.raw_system_facts.some((f) => f.includes("начал длительное занятие"))).toBe(true);
  });

  it("продвижение времени генерирует мутацию ADVANCE_TIME", () => {
    const ctx = createMockContext({
      router_output: {
        status: "success",
        clarification_msg: null,
        actions: [],
        encounter_intent: { type: "none", target_name: null },
        time_estimate_minutes: 45,
        atmosphere: { sounds: [], visuals: [] },
      },
    });

    const result = executeEngine(ctx);
    const timeMutation = result.mutations.find((m) => m.type === "ADVANCE_TIME");
    expect(timeMutation).toBeDefined();
    // @ts-ignore
    expect(timeMutation?.minutes).toBe(45);
  });
});
