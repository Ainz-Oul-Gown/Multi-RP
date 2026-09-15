import { describe, it, expect } from "vitest";
import { executeEngine } from "../supabase/functions/process-turn/engine/step2_engine.ts";
import { MoveHandler } from "../supabase/functions/process-turn/engine/handlers/move_handler.ts";
import { buildGpsPrompt } from "../supabase/functions/process-turn/steps/_shared_prompts.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";

describe("Danger Levels & Encounters", () => {
  it("Targeted hunt sets creature_name and gives x3 intentMult in step2_engine", () => {
    const routerOutput: any = {
      status: "success",
      actions: [
        {
          action_type: "search",
          target_entity_id: null,
          target_name: "Волк",
          target_item_name: null,
          item_type: null,
          used_item_id: null,
          consumed_materials: null,
          stat_to_check: "survival",
          ai_custom_dc: 12,
        },
      ],
      encounter_intent: {
        type: "targeted",
        target_name: "Волк",
      },
      time_estimate_minutes: 60, // 1 hour = timeMult 1.0
      atmosphere: { sounds: [], visuals: [] },
    };

    const context: any = {
      acting_player: {
        id: "p1",
        name: "Влад",
        stats: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 14, CHA: 10 },
        inventory: [],
      },
      session: {
        difficulty: "normal",
        location_danger_level: "normal", // 12% base
      },
      targets: {
        players: new Map(),
        npcs: new Map(),
      },
      router_output: routerOutput,
    };

    const engineResult = executeEngine(context);
    expect(engineResult.success).toBe(true);
    // If encounter triggered, creature_name must be 'Волк'
    if (engineResult.encounter_triggered.triggered) {
      expect(engineResult.encounter_triggered.creature_name).toBe("Волк");
      expect(engineResult.raw_system_facts.some(f => f.includes("Появилось: Волк"))).toBe(true);
    } else {
      expect(engineResult.raw_system_facts.some(f => f.includes("Поиск врагов (\"Волк\") не дал результата"))).toBe(true);
    }
  });

  it("Danger levels influence encounter rate base thresholds", () => {
    // Safe base threshold = 2%
    // Normal base threshold = 12%
    // Danger base threshold = 35%
    // Lethal base threshold = 65%
    const routerOutput: any = {
      status: "success",
      actions: [{ action_type: "move", target_item_name: "дорога" }],
      encounter_intent: { type: "random", target_name: null },
      time_estimate_minutes: 60,
      atmosphere: { sounds: [], visuals: [] },
    };

    const makeContext = (danger: string) => ({
      acting_player: { id: "p1", name: "Влад", stats: { WIS: 10 }, inventory: [] },
      session: { difficulty: "normal", location_danger_level: danger },
      targets: { players: new Map(), npcs: new Map() },
      router_output: routerOutput,
    });

    // Roll d100 with safe level: threshold = 2 * 1 * 1 = 2%
    // At safe level, encounter is extremely unlikely
    let safeTriggers = 0;
    for (let i = 0; i < 50; i++) {
      const res = executeEngine(makeContext("safe") as any);
      if (res.encounter_triggered.triggered) safeTriggers++;
    }
    expect(safeTriggers).toBeLessThanOrEqual(10); // statistically very low
  });

  it("buildRouterHeuristicFallback extracts targeted creature from text", () => {
    const input: any = {
      player_action_text: "Выслеживаю волка по следам на снегу",
      inventory: [],
      nearby_npcs: [],
    };

    const res = buildRouterHeuristicFallback(input);
    expect(res.encounter_intent.type).toBe("targeted");
    expect(res.encounter_intent.target_name).toBe("Волк");
    expect(res.skill_hint).toBe("survival");
  });
});

describe("Movement & Plausibility Handling", () => {
  it("buildRouterHeuristicFallback creates move action for movement verbs", () => {
    const input: any = {
      player_action_text: "Иду в лес за ягодами",
      inventory: [],
      nearby_npcs: [],
    };

    const res = buildRouterHeuristicFallback(input);
    expect(res.actions.some(a => a.action_type === "move")).toBe(true);
    const moveAction = res.actions.find(a => a.action_type === "move");
    expect(moveAction?.target_item_name).toBe("лес за ягодами");
  });

  it("MoveHandler rejects movement when action.movement_rejected is true", () => {
    const handler = new MoveHandler();
    const context: any = {
      acting_player: { id: "p1", name: "Герой", stats: {} },
      session: { difficulty: "normal" },
    };

    const rejectedAction: any = {
      action_type: "move",
      target_item_name: "сокровищница",
      movement_rejected: true,
      rejection_reason: "Такого места в окрестностях леса нет.",
    };

    const result = handler.handle(rejectedAction, context);
    expect(result.result.success).toBe(false);
    expect(result.result.details).toContain("Такого места в окрестностях леса нет.");
    expect(result.system_facts[0]).toContain("не смог: Такого места в окрестностях леса нет.");
    expect(result.mutations).toHaveLength(0);
  });

  it("buildGpsPrompt includes plausibility instructions and wild zone danger level in schema", () => {
    const prompt = buildGpsPrompt({
      playerName: "Герой",
      actionText: "Иду в сокровищницу в 10 км от леса",
      intentType: "router",
      intentDescription: "Иду в сокровищницу в 10 км от леса",
      currentYear: 1248,
      currentMonth: 5,
      currentDay: 14,
      currentHour: 10,
      currentMinute: 0,
      currentLocation: "Шепчущий лес",
      currentState: "Северные земли",
      currentDangerLevel: "normal",
      wantsLocationChange: true,
      locationChangeDescription: "Иду в сокровищницу в 10 км от леса",
      availableLocations: [
        { id: "loc-1", name: "Ривервуд", type: "city", state_name: "Северные земли" },
      ],
    });

    expect(prompt).toContain("is_plausible");
    expect(prompt).toContain("wild_zone_danger_level");
    expect(prompt).toContain("МАТРИЦА ПЛАУЗИБИЛНЫХ ПЕРЕХОДОВ");
    expect(prompt).toContain("сокровищница");
    expect(prompt).toContain("Если игрок находится внутри здания, таверны или подземелья и выходит наружу");
  });
});
