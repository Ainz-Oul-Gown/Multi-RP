import { describe, it, expect } from "vitest";
import { SearchHandler, LootSearchHandler } from "../supabase/functions/process-turn/engine/handlers/loot_search_handler.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";

describe("SearchHandler & LootSearchHandler: No dummy 'находка' items", () => {
  it("SearchHandler with generic target ('находка', 'что-нибудь', or empty) produces perception fact, NOT an item mutation", () => {
    const handler = new SearchHandler();
    const context: any = {
      acting_player: {
        id: "player-vlad",
        name: "Влад",
        stats: { WIS: 14, INT: 14 },
      },
      session: { difficulty: "easy" },
    };

    // Case 1: target_item_name is "находка"
    const actionNahodka: any = {
      action_type: "search",
      target_item_name: "находка",
    };
    const res1 = handler.handle(actionNahodka, context);
    expect(res1.result.success).toBe(true);
    expect(res1.mutations).toHaveLength(0); // NO INSERT_ITEM for dummy "находка"!
    expect(res1.system_facts[0]).toContain("Влад внимательно осмотрел округу");

    // Case 2: target_item_name is null / empty
    const actionEmpty: any = {
      action_type: "search",
      target_item_name: null,
    };
    const res2 = handler.handle(actionEmpty, context);
    expect(res2.result.success).toBe(true);
    expect(res2.mutations).toHaveLength(0);
  });

  it("SearchHandler with specific target ('древний ключ') creates the specific item in mutations", () => {
    const handler = new SearchHandler();
    const context: any = {
      acting_player: {
        id: "player-vlad",
        name: "Влад",
        stats: { WIS: 14, INT: 14 },
      },
      session: { difficulty: "easy" },
    };

    const actionKey: any = {
      action_type: "search",
      target_item_name: "древний ключ",
    };
    const res = handler.handle(actionKey, context);
    expect(res.result.success).toBe(true);
    expect(res.mutations).toHaveLength(1);
    expect(res.mutations[0].type).toBe("INSERT_ITEM");
    expect(res.mutations[0].item.item_name).toBe("древний ключ");
  });

  it("LootSearchHandler resolves generic targets to 'Трофей (<TargetName>)' instead of dummy names", () => {
    const handler = new LootSearchHandler();
    const context: any = {
      acting_player: {
        id: "player-vlad",
        name: "Влад",
        stats: { INT: 12 },
      },
      session: { difficulty: "easy" },
      targets: {
        npcs: new Map([
          ["wolf-1", { id: "wolf-1", name: "Лютый волк", is_alive: false }],
        ]),
      },
    };

    const actionLoot: any = {
      action_type: "loot",
      target_entity_id: "wolf-1",
      target_item_name: "добыча",
    };
    const res = handler.handle(actionLoot, context);
    expect(res.result.success).toBe(true);
    expect(res.mutations).toHaveLength(1);
    expect(res.mutations[0].item.item_name).toBe("Трофей (Лютый волк)");
  });
});

describe("Router Heuristic: Gathering resources vs search", () => {
  it("'Ищу в округе камни' yields harvest_ambient for 'Камни' (material), NOT search", () => {
    const input: any = {
      player_action_text: "Ищу в округе камни",
      inventory: [],
      nearby_npcs: [],
    };
    const res = buildRouterHeuristicFallback(input);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].action_type).toBe("harvest_ambient");
    expect(res.actions[0].target_item_name).toBe("Камни");
    expect(res.actions[0].item_type).toBe("material");
    expect(res.skill_hint).toBe("gathering");
  });

  it("'Ищу палки в округе' yields harvest_ambient for 'Сухие ветки' (material)", () => {
    const input: any = {
      player_action_text: "Ищу палки в округе",
      inventory: [],
      nearby_npcs: [],
    };
    const res = buildRouterHeuristicFallback(input);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].action_type).toBe("harvest_ambient");
    expect(res.actions[0].target_item_name).toBe("Сухие ветки");
    expect(res.actions[0].item_type).toBe("material");
  });

  it("'Ищу грибы' yields harvest_ambient for 'Лесные грибы' (food)", () => {
    const input: any = {
      player_action_text: "Ищу грибы",
      inventory: [],
      nearby_npcs: [],
    };
    const res = buildRouterHeuristicFallback(input);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].action_type).toBe("harvest_ambient");
    expect(res.actions[0].target_item_name).toBe("Лесные грибы");
    expect(res.actions[0].item_type).toBe("food");
  });

  it("Generic search without resources has null target_item_name (never 'находка')", () => {
    const input: any = {
      player_action_text: "Обыскиваю старый чердак",
      inventory: [],
      nearby_npcs: [],
    };
    const res = buildRouterHeuristicFallback(input);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].action_type).toBe("search");
    expect(res.actions[0].target_item_name).toBeNull();
  });
});

describe("Wild Zone NPC Isolation: Town NPCs stay in town", () => {
  it("filters out town merchants and citizens when in a wild zone", () => {
    const isCompanionNpc = (n: any) => {
      const role = (n.role || "").toLowerCase();
      const tags = Array.isArray(n.status_tags) ? n.status_tags.map((t: string) => String(t).toLowerCase()) : [];
      return role === "companion" || role === "спутник" || tags.some((t: string) => ["companion", "спутник", "в_отряде", "питомец", "приручен"].includes(t));
    };

    const allNpcs = [
      { id: "gordon", name: "Гордон", role: "secondary", status_tags: ["торговец"], is_hostile: false },
      { id: "blacksmith", name: "Кузнец Торвальд", role: "secondary", status_tags: ["кузнец"], is_hostile: false },
      { id: "companion-1", name: "Лидия", role: "companion", status_tags: ["спутник", "в_отряде"], is_hostile: false },
      { id: "wolf", name: "Лесной волк", role: "mob", status_tags: ["дикий", "зверь"], is_hostile: true },
    ];

    const currentWildZone = "Лес у Ривервуда";

    const filtered = currentWildZone
      ? allNpcs.filter((n) =>
          isCompanionNpc(n) ||
          n.is_hostile === true ||
          (Array.isArray(n.status_tags) && n.status_tags.some((t: string) => ["дикий", "монстр", "дикая_зона", "зверь", "хищник"].includes(String(t).toLowerCase())))
        )
      : allNpcs;

    expect(filtered).toHaveLength(2);
    expect(filtered.map((n) => n.name)).toEqual(["Лидия", "Лесной волк"]);
    expect(filtered.some((n) => n.name === "Гордон")).toBe(false);
    expect(filtered.some((n) => n.name === "Кузнец Торвальд")).toBe(false);
  });
});
