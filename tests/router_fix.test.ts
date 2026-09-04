// tests/router_fix.test.ts
// Тесты проверки исправления бага ложного "Your request is too vague"
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/functions/_shared/utils.ts", () => ({
  parseAIJson: vi.fn(),
  cleanTextForAI: vi.fn((s: string) => String(s || "").trim()),
  sanitizeKey: vi.fn((s: string) => String(s || "").trim()),
}));

import { parseAIJson } from "../supabase/functions/_shared/utils.ts";
import { RouterInputContext } from "../supabase/functions/process-turn/types.ts";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function createTestContext(actionText: string): RouterInputContext {
  return {
    player_action_text: actionText,
    player: {
      id: "player-1",
      name: "Влад",
      race: "Человек",
      class: "Воин",
      level: 1,
      hp: 20,
      max_hp: 20,
      stats: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      location_name: null,
      state_name: null,
    },
    inventory: [],
    nearby_npcs: [],
    weather: { description: "Ясно", temperature: 20, is_raining: false, is_night: false, wind_speed: 1 },
    game_time: { year: 1248, month: 5, day: 14, hour: 10, minute: 0 },
    current_location_id: null,
    current_location_name: null,
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

describe("Router Fix: Open-ended and descriptive actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("конвертирует ложный 'Your request is too vague' в success для описания появления в городе", async () => {
    const rawVagueResponse = JSON.stringify({
      status: "clarification_needed",
      clarification_msg: "Your request is too vague. Please specify what you would like to do in the city (e.g., talk to NPCs, explore locations, search for items, fight enemies, craft something).",
      actions: [],
      encounter_intent: { type: "none" },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValue(JSON.parse(rawVagueResponse));
    mockFetch.mockResolvedValue(mockOpenRouterResponse(rawVagueResponse));

    const { parsePlayerIntent } = await import("../supabase/functions/process-turn/steps/step1_router.ts");
    const ctx = createTestContext("Опиши мое появление в каком-либо городе");
    const result = await parsePlayerIntent(ctx, "test-key");

    expect(result.status).toBe("success");
    expect(result.clarification_msg).toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.time_estimate_minutes).toBeGreaterThan(0);
  });

  it("конвертирует clarification_needed в success для действий осмотра и ориентирования", async () => {
    const rawVagueResponse = JSON.stringify({
      status: "clarification_needed",
      clarification_msg: "Уточните, куда именно вы смотрите?",
      actions: [],
      encounter_intent: { type: "none" },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    });

    (parseAIJson as any).mockReturnValue(JSON.parse(rawVagueResponse));
    mockFetch.mockResolvedValue(mockOpenRouterResponse(rawVagueResponse));

    const { parsePlayerIntent } = await import("../supabase/functions/process-turn/steps/step1_router.ts");
    const ctx = createTestContext("Осмотреться вокруг и понять, где я нахожусь");
    const result = await parsePlayerIntent(ctx, "test-key");

    expect(result.status).toBe("success");
    expect(result.clarification_msg).toBeNull();
  });
});
