import { describe, it, expect } from "vitest";
import { DropHandler } from "../supabase/functions/process-turn/engine/handlers/drop_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { handleCompanionInSceneAction } from "../supabase/functions/_shared/npc_autonomous_engine.ts";

describe("DropHandler & TransferHandler", () => {
  it("DropHandler deletes items from player inventory without dice rolls", () => {
    const handler = new DropHandler();
    const context: any = {
      acting_player: {
        id: "player-1",
        name: "Влад",
        inventory: [
          { id: "item-mushrooms", item_name: "Лесные грибы", quantity: 4 },
        ],
      },
      session: { difficulty: "normal" },
      targets: { npcs: new Map(), players: new Map() },
    };

    const action: any = {
      action_type: "drop",
      target_item_name: "лесных гриба",
      quantity: 2,
    };

    const result = handler.handle(action, context);
    expect(result.result.success).toBe(true);
    expect(result.result.dice_roll).toBeUndefined();
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0]).toEqual({
      type: "DELETE_ITEM",
      item_id: "item-mushrooms",
      quantity: 2,
    });
  });

  it("TransferHandler resolves target NPC and transfers item", () => {
    const handler = new TransferHandler();
    const npcId = "npc-gordon";
    const context: any = {
      acting_player: {
        id: "player-1",
        name: "Влад",
        inventory: [
          { id: "item-wood", item_name: "Сухие ветки", quantity: 3 },
        ],
      },
      session: { difficulty: "normal" },
      targets: {
        npcs: new Map([
          [npcId, { id: npcId, name: "Гордон", is_hostile: false }],
        ]),
        players: new Map(),
        location_items: new Map(),
      },
    };

    const action: any = {
      action_type: "transfer",
      target_item_name: "Сухие ветки",
      target_name: "Гордон",
      quantity: 1,
    };

    const result = handler.handle(action, context);
    expect(result.result.success).toBe(true);
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0]).toEqual({
      type: "TRANSFER_ITEM",
      item_id: "item-wood",
      from_id: "player-1",
      to_id: npcId,
      from_type: "player",
      to_type: "npc",
      quantity: 1,
    });
  });
});

describe("Router Heuristic: Drop detection vs Gathering", () => {
  it("correctly identifies 'Я выкидываю 2 лесных гриба' as drop, not harvest_ambient", () => {
    const input: any = {
      player_action_text: "Я выкидываю 2 лесных гриба",
      inventory: [
        { id: "mush-1", item_name: "Лесные грибы", quantity: 2 },
      ],
      nearby_npcs: [],
    };

    const result = buildRouterHeuristicFallback(input);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action_type).toBe("drop");
    expect(result.actions[0].target_item_name).toBe("Лесные грибы");
    expect(result.actions[0].used_item_id).toBe("mush-1");
    expect(result.actions[0].stat_to_check).toBe("none");
    expect(result.actions[0].consumed_materials?.[0]?.quantity).toBe(2);
  });
});

describe("Companion party requirement", () => {
  it("ignores town NPCs who are not companions in scene actions", async () => {
    const mockSupabase: any = {
      rpc: () => Promise.resolve({ data: null, error: null }),
    };

    const townNpc = {
      id: "npc-gordon",
      name: "Гордон",
      role: "secondary",
      is_hostile: false,
      status_tags: ["торговец"],
    };

    const action = await handleCompanionInSceneAction({
      supabase: mockSupabase,
      player_action_text: "Ищу палки в округе",
      acting_player_name: "Влад",
      location_npcs: [townNpc],
      session_id: "session-1",
    });

    expect(action).toBeNull();
  });

  it("triggers for true party companions with role companion", async () => {
    const mockSupabase: any = {
      rpc: () => Promise.resolve({ data: null, error: null }),
    };

    const companionNpc = {
      id: "npc-lydia",
      name: "Лидия",
      role: "companion",
      is_hostile: false,
      status_tags: ["спутник", "в_отряде"],
    };

    const action = await handleCompanionInSceneAction({
      supabase: mockSupabase,
      player_action_text: "Ищу хворост для костра",
      acting_player_name: "Влад",
      location_npcs: [companionNpc],
      session_id: "session-1",
    });

    expect(action).not.toBeNull();
    expect(action?.npc_name).toBe("Лидия");
  });
});
