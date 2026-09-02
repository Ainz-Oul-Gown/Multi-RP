// tests/steps/step5_narrator.test.ts
// Тесты для Шага 5: AI Narrator (с LLM-моком и Fallback)

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return null;
    }),
  },
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

import { generateNarrative, buildFallbackNarrative } from "../../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SystemTruthDto } from "../../supabase/functions/process-turn/steps/step4_system_truth.ts";

function makeBaseTruth(): SystemTruthDto {
  return {
    session_id: "session-1",
    turn_status: "success",
    environment: {
      location_name: "Таверна",
      weather: null,
      time: { year: 1, month: 1, day: 1, hour: 14, minute: 30 },
      time_passed_minutes: 6,
      atmosphere: { sounds: ["потрескивание камина"], visuals: ["тёплый свет"] },
    },
    global_events: [],
    player_truths: {
      p1: {
        player_id: "p1",
        knowledge: ["Бросок d20: 18 vs DC 12 → успех.", "Нанесено 9 урона."],
        hp_status: { current: 45, max: 50, delta: 0 },
        inventory_delta: { added: [], removed: [], damaged: [] },
      },
      p2: {
        player_id: "p2",
        knowledge: ["Вы внезапно получили 9 физического урона. Источник урона неизвестен!"],
        hp_status: { current: 31, max: 50, delta: -9 },
        inventory_delta: { added: [], removed: [], damaged: [] },
      },
    },
    npc_context: {},
    encounter_alert: null,
  };
}

function mockNarratorJson(payload: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });
}

describe("Step 5: Narrator", () => {
  beforeEach(() => mockFetch.mockReset());

  it("генерирует персонализированный нарратив для двух игроков", async () => {
    mockNarratorJson({
      players: {
        p1: "Элария взмахнула мечом, лезвие со свистом рассекло воздух. [Урон: 9] Лезвие впилось в плоть.",
        p2: "Что-то острое пронзило Торина. [Урон: 9] Боль вспыхнула из ниоткуда.",
      },
      global_narrative: "В таверне произошла стычка.",
    });

    const result = await generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "Бью гоблина мечом",
      player_name: "Элария",
      player_race: "Эльф",
      player_class: "Воин",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    });

    expect(result.players["p1"]).toContain("Элария");
    expect(result.players["p2"]).toContain("Торин");
    expect(result.players["p1"]).toContain("9");
    expect(result.players["p2"]).toContain("9");
    expect(result.global_narrative).toBeTruthy();
  });

  it("соблюдает асимметрию: жертва не знает нападающего", async () => {
    mockNarratorJson({
      players: {
        p1: "Элария нанесла удар из тени. [Урон: 9]",
        p2: "Что-то пронзило вас из ниоткуда. [Урон: 9] Источник неизвестен.",
      },
      global_narrative: "...",
    });

    const result = await generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "Скрытно атакую",
      player_name: "Элария",
      player_race: "Эльф",
      player_class: "Плут",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    });

    // Жертва (p2) НЕ должна видеть имя атакующего
    expect(result.players["p2"]).not.toContain("Элария");
  });

  it("Fallback: формирует текст из сухих фактов при сбое LLM", () => {
    const truth = makeBaseTruth();
    const result = buildFallbackNarrative(truth);

    expect(result.players["p1"]).toContain("Бросок");
    expect(result.players["p2"]).toContain("Источник урона неизвестен");
    expect(result.players["p1"]).toContain("потрескивание камина");
    // Должен присутствовать HP-блок
    expect(result.players["p2"]).toContain("HP");
  });

  it("Fallback: обрабатывает conflict-статус (race condition)", () => {
    const truth = makeBaseTruth();
    truth.turn_status = "conflict";
    truth.player_truths["p1"].knowledge = ["Ваше действие не удалось: предмет уже был забран другим игроком."];

    const result = buildFallbackNarrative(truth);
    expect(result.players["p1"]).toContain("не удалось");
    expect(result.players["p1"]).toContain("забран");
  });

  it("LLM ошибка → бросает исключение (вызывающий код использует fallback)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "test",
      player_name: "X",
      player_race: "Y",
      player_class: "Z",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    })).rejects.toThrow();
  });

  it("Кривой JSON от LLM → бросает исключение", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "невалидный json" } }] }),
    });

    await expect(generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "test",
      player_name: "X",
      player_race: "Y",
      player_class: "Z",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    })).rejects.toThrow();
  });

  it("Нормализует ответ LLM: добавляет отсутствующих players", async () => {
    mockNarratorJson({
      players: { p1: "текст для p1" }, // p2 пропущен
      global_narrative: "",
    });

    const result = await generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "test",
      player_name: "Элария",
      player_race: "Эльф",
      player_class: "Воин",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    });

    // p1 — из ответа LLM
    expect(result.players["p1"]).toBe("текст для p1");
    // p2 — заглушка, т.к. LLM не вернул
    expect(result.players["p2"]).toBeDefined();
  });

  it("Убирает markdown-обёртки из ответа LLM", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"players": {"p1": "ok"}, "global_narrative": "log"}\n```' } }],
      }),
    });

    const result = await generateNarrative({
      system_truth: makeBaseTruth(),
      action_text: "test",
      player_name: "Элария",
      player_race: "Эльф",
      player_class: "Воин",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    });
    expect(result.players["p1"]).toBe("ok");
  });
});
