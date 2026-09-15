// tests/router_multitier_fallback.test.ts
// Тесты для проверки 3-уровневого пайплайна роутера:
// Tier 1 (Primary AI Router) -> Tier 2 (Targeted Smart Free AI Classifier) -> Tier 3 (Emergency Regex Heuristic)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyIntentWithAI, buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";

describe("Tier 2 Targeted AI Classifier (classifyIntentWithAI)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts targeted hunting intent with creature name", async () => {
    const mockResponse = {
      action_type: "search",
      target_name: "Волк",
      target_subzone_name: null,
      item_name: null,
      stat_to_check: "survival",
      encounter_intent: {
        type: "targeted",
        target_name: "Волк",
      },
      reasoning: "Игрок выслеживает волка в чаще леса",
    };

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    const input: any = {
      player_action_text: "Выслеживаю волка по свежим следам на опушке",
      current_location_name: "Шепчущий лес",
      nearby_npcs: [],
      nearby_players: [],
      inventory: [],
      available_subzones: [],
    };

    const result = await classifyIntentWithAI(input, "test-api-key");
    expect(result).not.toBeNull();
    expect(result?.status).toBe("success");
    expect(result?.encounter_intent.type).toBe("targeted");
    expect(result?.encounter_intent.target_name).toBe("Волк");
    expect(result?.actions[0].action_type).toBe("search");
    expect(result?.actions[0].stat_to_check).toBe("survival");
  });

  it("resolves target_subzone_id when moving to known subzone", async () => {
    const mockResponse = {
      action_type: "move",
      target_name: null,
      target_subzone_name: "Подземный грот",
      item_name: "Подземный грот",
      stat_to_check: "none",
      encounter_intent: {
        type: "random",
        target_name: null,
      },
      reasoning: "Игрок переходит в подземный грот",
    };

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    const input: any = {
      player_action_text: "Спускаюсь в подземный грот",
      current_location_name: "Пещеры Шепота",
      available_subzones: [
        { id: "sz-grotto-123", name: "Подземный грот" },
        { id: "sz-lake-456", name: "Подземное озеро" },
      ],
      nearby_npcs: [],
      nearby_players: [],
    };

    const result = await classifyIntentWithAI(input, "test-api-key");
    expect(result).not.toBeNull();
    expect(result?.actions[0].action_type).toBe("move");
    expect(result?.actions[0].target_subzone_id).toBe("sz-grotto-123");
    expect(result?.encounter_intent.type).toBe("random");
  });

  it("prioritizes party member (human player) over background NPCs in talk action", async () => {
    const mockResponse = {
      action_type: "talk",
      target_name: "Ирис",
      target_subzone_name: null,
      item_name: null,
      stat_to_check: "none",
      encounter_intent: { type: "none", target_name: null },
      reasoning: "Игрок обращается к напарнице Ирис",
    };

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    const input: any = {
      player_action_text: 'Ирис, давай разделим добычу поровну?',
      nearby_players: [
        { id: "player-iris-uuid", name: "Ирис", race: "Эльф", class: "Лучник" },
      ],
      nearby_npcs: [
        { id: "npc-bran-uuid", name: "Бран", race: "Человек", is_hostile: false },
      ],
    };

    const result = await classifyIntentWithAI(input, "test-api-key");
    expect(result).not.toBeNull();
    expect(result?.actions[0].action_type).toBe("talk");
    expect(result?.actions[0].target_entity_id).toBe("player-iris-uuid");
    expect(result?.actions[0].target_name).toBe("Ирис");
  });

  it("handles ambient / look around with actions: [] (none action)", async () => {
    const mockResponse = {
      action_type: "none",
      target_name: null,
      target_subzone_name: null,
      item_name: null,
      stat_to_check: "none",
      encounter_intent: { type: "none", target_name: null },
      reasoning: "Осмотр окрестностей без физического действия",
    };

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    const input: any = {
      player_action_text: "Осматриваюсь по сторонам, прислушиваясь к звукам ночного леса",
      nearby_npcs: [],
      nearby_players: [],
    };

    const result = await classifyIntentWithAI(input, "test-api-key");
    expect(result).not.toBeNull();
    expect(result?.status).toBe("success");
    expect(result?.actions).toHaveLength(0);
  });

  it("Tier 3 Emergency Fallback is used when all AI models fail", async () => {
    // Симулируем отказ всех сетевых вызовов
    // @ts-ignore
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection refused / OpenRouter offline"));

    const input: any = {
      player_action_text: "Иду в лес за ягодами",
      inventory: [],
      nearby_npcs: [],
      nearby_players: [],
    };

    // Tier 2 возвращает null
    const tier2Result = await classifyIntentWithAI(input, "test-api-key");
    expect(tier2Result).toBeNull();

    // Задействуется Tier 3 (эвристика)
    const tier3Result = buildRouterHeuristicFallback(input);
    expect(tier3Result.status).toBe("success");
    expect(tier3Result.actions.some(a => a.action_type === "move")).toBe(true);
    expect(tier3Result.actions[0].target_item_name).toBe("лес за ягодами");
  });
});
