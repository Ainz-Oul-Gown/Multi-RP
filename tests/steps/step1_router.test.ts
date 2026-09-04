// tests/steps/step1_router.test.ts
// Тесты для AI-Маршрутизатора (Шаг 1)
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем _shared/utils.ts
vi.mock("../../supabase/functions/_shared/utils.ts", () => ({
  parseAIJson: vi.fn(),
  cleanTextForAI: vi.fn((s: string) => String(s || "").trim()),
  sanitizeKey: vi.fn((s: string) => String(s || "").trim()),
}));

import { parseAIJson } from "../../supabase/functions/_shared/utils.ts";
import { RouterInputContext } from "../../supabase/functions/process-turn/types.ts";

// Мокаем fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Тестовый контекст
function createTestContext(): RouterInputContext {
  return {
    player_action_text: "Я беру меч и атакую гоблина",
    player: {
      id: "player-1",
      name: "Элария",
      race: "Полукровка",
      class: "Убийца",
      level: 5,
      hp: 45,
      max_hp: 50,
      stats: { STR: 12, DEX: 18, CON: 14, INT: 13, WIS: 12, CHA: 15 },
      location_name: "Лагерь Полукровок",
      state_name: "Сумеречный Предел",
    },
    inventory: [
      { id: "item-sword-1", item_name: "Стальной меч", item_type: "weapon", quantity: 1, condition: 80, durability: 15 },
      { id: "item-potion-1", item_name: "Зелье лечения", item_type: "consumable", quantity: 3, condition: null, durability: null },
    ],
    nearby_npcs: [
      { id: "npc-goblin-1", name: "Гоблин-разведчик", race: "Гоблин", is_hostile: true, hp: 12, max_hp: 15, distance_meters: 5 },
    ],
    weather: { description: "Пасмурно", temperature: 12, is_raining: true, is_night: false, wind_speed: 3 },
    game_time: { year: 1, month: 5, day: 12, hour: 14, minute: 30 },
    current_location_id: "loc-1",
    current_location_name: "Лагерь Полукровок",
  };
}

function mockOpenRouterResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  };
}

describe("parsePlayerIntent (Шаг 1: AI Router)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("успешно парсит атаку мечом по гоблину", async () => {
    const llmResponse = JSON.stringify({
      status: "success",
      clarification_msg: null,
      actions: [
        {
          action_type: "attack",
          target_entity_id: "npc-goblin-1",
          target_item_name: null,
          used_item_id: "item-sword-1",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 12,
          improper_tool_usage: null,
        },
      ],
      encounter_intent: { type: "targeted", target_name: "Гоблин-разведчик" },
      time_estimate_minutes: 5,
      atmosphere: { sounds: ["звон стали"], visuals: ["кровавый закат"] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const result = await parsePlayerIntent(createTestContext(), "test-api-key");

    expect(result.status).toBe("success");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action_type).toBe("attack");
    expect(result.actions[0].used_item_id).toBe("item-sword-1");
    expect(result.actions[0].target_entity_id).toBe("npc-goblin-1");
    expect(result.time_estimate_minutes).toBe(5);
  });

  it("отклоняет абсурдное действие со status: impossible", async () => {
    const llmResponse = JSON.stringify({
      status: "impossible",
      clarification_msg: "Персонаж не может летать без магических способностей",
      actions: [],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const ctx = createTestContext();
    ctx.player_action_text = "Я взлетаю в небо и стреляю молниями";
    const result = await parsePlayerIntent(ctx, "test-api-key");

    expect(result.status).toBe("impossible");
    expect(result.actions).toHaveLength(0);
  });

  it("определяет нецелевое использование инструмента (рубка дерева мечом)", async () => {
    const llmResponse = JSON.stringify({
      status: "success",
      clarification_msg: null,
      actions: [
        {
          action_type: "harvest_ambient",
          target_entity_id: null,
          target_item_name: "дерево",
          used_item_id: "item-sword-1",
          consumed_materials: null,
          stat_to_check: "strength",
          ai_custom_dc: 35,
          improper_tool_usage: {
            is_improper: true,
            durability_penalty: 2,
            stat_penalty: "damage",
            reason: "Меч предназначен для боя, а не рубки деревьев",
          },
        },
      ],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 30,
      atmosphere: { sounds: ["стук металла о дерево"], visuals: ["опавшая листва"] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const ctx = createTestContext();
    ctx.player_action_text = "Я рублю дерево мечом";
    const result = await parsePlayerIntent(ctx, "test-api-key");

    expect(result.status).toBe("success");
    expect(result.actions[0].improper_tool_usage).toBeDefined();
    expect(result.actions[0].improper_tool_usage?.is_improper).toBe(true);
    expect(result.actions[0].improper_tool_usage?.durability_penalty).toBe(2);
    expect(result.actions[0].ai_custom_dc).toBeGreaterThanOrEqual(30);
  });

  it("требует уточнение для неоднозначного действия", async () => {
    const llmResponse = JSON.stringify({
      status: "clarification_needed",
      clarification_msg: "Каким именно способом вы хотите помочь городу?",
      actions: [],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const ctx = createTestContext();
    ctx.player_action_text = "Я помогаю городу";
    const result = await parsePlayerIntent(ctx, "test-api-key");

    expect(result.status).toBe("clarification_needed");
    expect(result.clarification_msg).toBeTruthy();
  });

  it("бросает ошибку при невалидном JSON от LLM", async () => {
    // Каждый retry должен получать тот же "not a json" ответ
    mockFetch.mockResolvedValue(mockOpenRouterResponse("not a json"));
    (parseAIJson as any).mockReturnValue(null);

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    await expect(parsePlayerIntent(createTestContext(), "test-api-key", "test-model", 1)).rejects.toThrow(/JSON/);
  });

  it("бросает ошибку при неверном action_type", async () => {
    const llmResponse = JSON.stringify({
      status: "success",
      clarification_msg: null,
      actions: [
        { action_type: "invalid_type", stat_to_check: "strength", ai_custom_dc: 10, target_entity_id: null, target_item_name: null, used_item_id: null, consumed_materials: null, improper_tool_usage: null },
      ],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 5,
      atmosphere: { sounds: [], visuals: [] },
    });

    mockFetch.mockResolvedValue(mockOpenRouterResponse(llmResponse));
    (parseAIJson as any).mockReturnValue(JSON.parse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    await expect(parsePlayerIntent(createTestContext(), "test-api-key", "test-model", 1)).rejects.toThrow(/action_type/);
  });

  it("нормализует отсутствующие поля к дефолтным значениям", async () => {
    const llmResponse = JSON.stringify({
      status: "success",
      actions: [
        { action_type: "search", stat_to_check: "investigation", ai_custom_dc: null },
      ],
      encounter_intent: { type: "none" },
      time_estimate_minutes: 15,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const result = await parsePlayerIntent(createTestContext(), "test-api-key");

    expect(result.actions[0].target_entity_id).toBeNull();
    expect(result.actions[0].used_item_id).toBeNull();
    expect(result.actions[0].consumed_materials).toBeNull();
    expect(result.actions[0].improper_tool_usage).toBeNull();
    expect(result.clarification_msg).toBeNull();
  });

  it("ограничивает time_estimate_minutes диапазоном 0-1440", async () => {
    const llmResponse = JSON.stringify({
      status: "success",
      actions: [],
      encounter_intent: { type: "none" },
      time_estimate_minutes: 99999,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValueOnce(JSON.parse(llmResponse));
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(llmResponse));

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const result = await parsePlayerIntent(createTestContext(), "test-api-key");

    expect(result.time_estimate_minutes).toBeLessThanOrEqual(1440);
  });

  it("делает retry при ошибке API", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockOpenRouterResponse(JSON.stringify({
        status: "success",
        actions: [],
        encounter_intent: { type: "none" },
        time_estimate_minutes: 0,
        atmosphere: { sounds: [], visuals: [] },
      })));
    (parseAIJson as any).mockReturnValueOnce({
      status: "success", actions: [], encounter_intent: { type: "none" }, time_estimate_minutes: 0, atmosphere: { sounds: [], visuals: [] }
    });

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    const result = await parsePlayerIntent(createTestContext(), "test-api-key", "test-model", 3);

    expect(result.status).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("не падает с ошибкой Cannot read properties of undefined ('name') если player не передан", async () => {
    mockFetch.mockResolvedValueOnce(mockOpenRouterResponse(JSON.stringify({
      status: "success",
      actions: [],
      encounter_intent: { type: "none" },
      time_estimate_minutes: 5,
      atmosphere: { sounds: [], visuals: [] },
    })));
    (parseAIJson as any).mockReturnValueOnce({
      status: "success", actions: [], encounter_intent: { type: "none" }, time_estimate_minutes: 5, atmosphere: { sounds: [], visuals: [] }
    });

    const { parsePlayerIntent } = await import("../../supabase/functions/process-turn/steps/step1_router.ts");
    // Передаём плоский объект без input.player и с ключом внутри
    const legacyInput = {
      action_text: "Осматриваюсь вокруг",
      player_name: "Бродяга",
      openrouter_api_key: "test-api-key",
      satellite_model: "test-model",
    };

    const result = await parsePlayerIntent(legacyInput);
    expect(result.status).toBe("success");
    expect(result.time_estimate_minutes).toBe(5);
  });
});
