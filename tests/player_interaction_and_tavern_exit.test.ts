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

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: vi.fn(),
    from: vi.fn(),
  }),
}));

import { TalkHandler } from "../supabase/functions/process-turn/engine/handlers/talk_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { buildGpsPrompt } from "../supabase/functions/process-turn/steps/_shared_prompts.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";

describe("Player-to-Player Interaction in Game Engine", () => {
  const basePlayer = {
    id: "p-actor",
    name: "Рейнджер Варис",
    stats: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: 25,
    max_hp: 25,
    armor_class: 14,
    initiative: 3,
    level: 2,
    inventory: [
      { id: "item-potion", item_name: "Зелье здоровья", quantity: 2, condition: null, durability: null },
    ],
    injuries: [],
    skills: {},
  };

  const targetPlayer = {
    id: "p-target",
    name: "Воин Борис",
    stats: { STR: 16, DEX: 10, CON: 16, INT: 8, WIS: 10, CHA: 12 },
    hp: 30,
    max_hp: 30,
    armor_class: 16,
    initiative: 0,
    level: 2,
    inventory: [],
    injuries: [],
    skills: {},
  };

  const dummyContext: EngineInputContext = {
    session: {
      id: "sess-test",
      difficulty: "normal",
      is_pvp_enabled: true,
      game_year: 1248,
      game_month: 5,
      game_day: 14,
      game_hour: 12,
      game_minute: 0,
      current_location_id: "loc-1",
    },
    acting_player: basePlayer,
    targets: {
      players: new Map([
        ["p-actor", basePlayer],
        ["p-target", targetPlayer],
      ]),
      npcs: new Map(),
      location_items: new Map(),
    },
  };

  it("TalkHandler correctly recognizes and handles speech to a fellow player", () => {
    const handler = new TalkHandler();
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: "p-target",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      {
        ...dummyContext,
        raw_action_text: 'Говорю Борису: «Держи щит крепче, впереди засада!»',
      } as any
    );

    expect(result.result.success).toBe(true);
    expect(result.result.action_type).toBe("talk");
    expect((result.result as any).target_id).toBe("p-target");
    expect(result.system_facts[0]).toContain("Рейнджер Варис обращается к Воин Борис");
    expect(result.system_facts[0]).toContain("Держи щит крепче");
  });

  it("TalkHandler resolves target player by name hint if ID was missing", () => {
    const handler = new TalkHandler();
    const result = handler.handle(
      {
        action_type: "talk",
        target_entity_id: null,
        target_item_name: "Борис",
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      dummyContext
    );

    expect(result.result.success).toBe(true);
    expect((result.result as any).target_id).toBe("p-target");
    expect(result.system_facts[0]).toContain("Воин Борис");
  });

  it("TransferHandler successfully transfers an item to another player", () => {
    const handler = new TransferHandler();
    const result = handler.handle(
      {
        action_type: "transfer",
        target_entity_id: "p-target",
        used_item_id: "item-potion",
        consumed_materials: [{ id: "item-potion", quantity: 1 }],
        stat_to_check: "none",
        ai_custom_dc: null,
      },
      dummyContext
    );

    expect(result.result.success).toBe(true);
    expect(result.mutations.length).toBe(1);
    expect(result.mutations[0]).toMatchObject({
      type: "TRANSFER_ITEM",
      from_type: "player",
      from_id: "p-actor",
      to_type: "player",
      to_id: "p-target",
      quantity: 1,
    });
    expect(result.system_facts[0]).toContain("Рейнджер Варис передал Зелье здоровья (x1) → Воин Борис");
  });
});

describe("Step 4 System Truth: Player-to-Player Knowledge Resolution", () => {
  it("Targeted player receives clear knowledge when spoken to or given an item", async () => {
    const truth = await compileSystemTruth({
      session_id: "sess-test",
      acting_player_id: "p-actor",
      engine_output: {
        action_results: [
          {
            action_type: "talk",
            success: true,
            target_entity_id: "p-target",
            target_id: "p-target",
            details: "Обращение к игроку Воин Борис",
          } as any,
        ],
        mutations: [
          {
            type: "TRANSFER_ITEM",
            from_id: "p-actor",
            to_id: "p-target",
            from_type: "player",
            to_type: "player",
            item_id: "item-1",
            quantity: 1,
          },
        ],
        system_facts: [
          "Рейнджер Варис обращается к Воин Борис: «Возьми целебное зелье».",
        ],
        raw_system_facts: [],
      },
      persistence_output: {
        status: "committed",
        applied_mutations_count: 1,
        enriched_system_facts: [],
      },
      session: {
        game_year: 1248,
        game_month: 5,
        game_day: 14,
        game_hour: 12,
        game_minute: 0,
        current_location_id: "loc-1",
      },
      location: { name: "Таверна «Старый путник»", weather: "Ясно" },
      players: [
        { id: "p-actor", name: "Рейнджер Варис", hp: 25, max_hp: 25, inventory: [] },
        { id: "p-target", name: "Воин Борис", hp: 30, max_hp: 30, inventory: [] },
      ],
      npcs: [],
      atmosphere: { sounds: [], visuals: [] },
      time_passed_minutes: 5,
      encounter_alert: null,
    });

    const targetKnowledge = truth.player_truths["p-target"].knowledge;
    expect(targetKnowledge.length).toBeGreaterThan(0);
    expect(targetKnowledge.some((k) => k.includes("обращается к") || k.includes("Возьми целебное зелье"))).toBe(true);
    expect(targetKnowledge.some((k) => k.includes("передал вам предмет"))).toBe(true);
  });
});

describe("Tavern Exit and GPS Movement Prompt", () => {
  it("buildGpsPrompt includes building and tavern exit rules", () => {
    const prompt = buildGpsPrompt({
      playerName: "Рейнджер Варис",
      actionText: "Выхожу из таверны наружу на свежий воздух",
      intentType: "router",
      intentDescription: "выход из таверны",
      currentYear: 1248,
      currentMonth: 5,
      currentDay: 14,
      currentHour: 18,
      currentMinute: 0,
      currentLocation: "Таверна «Старый путник»",
      currentState: "Центральные земли",
      wantsLocationChange: true,
      locationChangeDescription: "Выхожу из таверны наружу на свежий воздух",
      availableLocations: [
        { id: "loc-tav", name: "Таверна «Старый путник»", type: "tavern" },
      ],
    });

    expect(prompt).toContain("Игрок хочет переместиться");
    expect(prompt).toContain("Если игрок находится внутри здания, таверны или подземелья и выходит наружу");
    expect(prompt).toContain("Придорожный тракт у");
  });
});
