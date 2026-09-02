// tests/steps/step3_persistence.test.ts
// Тесты для Шага 3: ACID Транзакция (Persistence)
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем Deno до импорта модуля
vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return null;
    }),
  },
});

// Мокаем Supabase
const mockSupabase = {
  rpc: vi.fn(),
};

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

import { applyTurnMutations, PersistenceInputContext } from "../../supabase/functions/process-turn/steps/step3_persistence.ts";
import { EngineOutputPayload } from "../../supabase/functions/process-turn/engine/types.ts";

function makeEngineOutput(mutations: any[] = [], facts: string[] = []): EngineOutputPayload {
  return {
    success: true,
    action_results: [],
    mutations: mutations as any,
    encounter_triggered: { triggered: false },
    raw_system_facts: facts,
  };
}

describe("Step 3: Persistence (ACID Транзакция)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Базовые случаи
  // ============================================
  it("возвращает committed если мутаций нет", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([], ["Some fact"]),
    };

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("committed");
    expect(result.applied_mutations_count).toBe(0);
    expect(result.enriched_system_facts).toContain("Нет мутаций для применения.");
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("успешно коммитит мутации (UPDATE_HP, DELETE_ITEM, INSERT_ITEM)", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "npc", id: "npc-1", delta: -15 },
        { type: "DELETE_ITEM", item_id: "item-1", quantity: 1 },
        { type: "INSERT_ITEM", owner_id: "player-1", owner_type: "player", item: { item_name: "Сокровище", quantity: 1, type: "misc" } },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        applied_count: 3,
        new_time: { year: 1, month: 1, day: 5, hour: 14, minute: 30 },
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("committed");
    expect(result.applied_mutations_count).toBe(3);
    expect(result.new_game_time).toEqual({ year: 1, month: 1, day: 5, hour: 14, minute: 30 });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("apply_turn_mutations", {
      p_mutations: ctx.engine_output.mutations,
      p_session_id: "session-1",
    });
  });

  // ============================================
  // Race Condition / Conflict
  // ============================================
  it("возвращает aborted_conflict при ITEM_NOT_AVAILABLE", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "DELETE_ITEM", item_id: "item-stolen", quantity: 1 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "ITEM_NOT_AVAILABLE: item-stolen (have 0, need 1)" },
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("aborted_conflict");
    expect(result.applied_mutations_count).toBe(0);
    expect(result.conflict_details).toContain("ITEM_NOT_AVAILABLE");
    expect(result.enriched_system_facts.some((f) => f.includes("race condition"))).toBe(true);
  });

  it("возвращает aborted_conflict при TARGET_NOT_FOUND", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "npc", id: "deleted-npc", delta: -10 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "TARGET_NOT_FOUND: npc deleted-npc" },
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("aborted_conflict");
    expect(result.conflict_details).toContain("TARGET_NOT_FOUND");
  });

  it("обрабатывает структуру {success: false} из RPC", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "TRANSFER_ITEM", item_id: "item-1", from_id: "p-1", to_id: "p-2", from_type: "player", to_type: "player", quantity: 5 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: false,
        error_code: "RACE_CONDITION_CONFLICT",
        details: "ITEM_NOT_AVAILABLE_FOR_TRANSFER: item-1",
        sql_state: "P0001",
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("aborted_conflict");
    expect(result.conflict_details).toContain("ITEM_NOT_AVAILABLE_FOR_TRANSFER");
  });

  // ============================================
  // Ошибка применения
  // ============================================
  it("возвращает error при неожиданной ошибке RPC", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "player", id: "p-1", delta: -5 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Connection timeout" },
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("error");
    expect(result.conflict_details).toContain("Connection timeout");
  });

  it("пробрасывает исключение при критической ошибке", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "player", id: "p-1", delta: -5 },
      ]),
    };

    mockSupabase.rpc.mockRejectedValueOnce(new Error("Network unreachable"));

    await expect(applyTurnMutations(ctx)).rejects.toThrow(/Network unreachable/);
  });

  // ============================================
  // Каскадный пересчёт времени
  // ============================================
  it("корректно обрабатывает каскадный пересчёт времени", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "ADVANCE_TIME", minutes: 20 },
      ]),
    };

    // 23:50 + 20 минут = 00:10 следующего дня
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        applied_count: 1,
        new_time: { year: 1, month: 1, day: 2, hour: 0, minute: 10 },
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);

    expect(result.status).toBe("committed");
    expect(result.new_game_time).toEqual({ year: 1, month: 1, day: 2, hour: 0, minute: 10 });
  });

  it("обрабатывает переход через месяц и год", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "ADVANCE_TIME", minutes: 60 * 24 * 30 * 6 + 60 }, // 6 месяцев + 1 час
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        applied_count: 1,
        new_time: { year: 2, month: 7, day: 2, hour: 1, minute: 0 },
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);
    expect(result.status).toBe("committed");
    expect(result.new_game_time?.year).toBe(2);
  });

  // ============================================
  // Обогащение фактов
  // ============================================
  it("обогащает system_facts подтверждёнными данными", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "npc", id: "npc-goblin", delta: -10 },
        { type: "DELETE_ITEM", item_id: "item-potion", quantity: 1 },
        { type: "INSERT_ITEM", owner_id: "player-1", owner_type: "player", item: { item_name: "Зелье лечения", quantity: 1, type: "consumable" } },
        { type: "UPDATE_DURABILITY", item_id: "item-sword", delta: -5, set_broken: false },
        { type: "ADVANCE_TIME", minutes: 15 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        applied_count: 5,
        new_time: { year: 1, month: 1, day: 1, hour: 8, minute: 15 },
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);

    expect(result.enriched_system_facts.length).toBeGreaterThan(5);
    expect(result.enriched_system_facts.some((f) => f.includes("10 урона"))).toBe(true);
    expect(result.enriched_system_facts.some((f) => f.includes("Удалено 1 ед"))).toBe(true);
    expect(result.enriched_system_facts.some((f) => f.includes("Зелье лечения"))).toBe(true);
    expect(result.enriched_system_facts.some((f) => f.includes("Прочность"))).toBe(true);
    expect(result.enriched_system_facts.some((f) => f.includes("Текущее время"))).toBe(true);
  });

  // ============================================
  // Откат при ошибке: мутации не применяются частично
  // ============================================
  it("не применяет мутации частично при ошибке (atomicity)", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "DELETE_ITEM", item_id: "item-1", quantity: 1 },
        { type: "DELETE_ITEM", item_id: "item-2", quantity: 1 }, // Этот упадёт
        { type: "UPDATE_HP", target_type: "npc", id: "npc-1", delta: -10 },
      ]),
    };

    // RPC: атомарный откат всей транзакции
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: false,
        error_code: "RACE_CONDITION_CONFLICT",
        details: "ITEM_NOT_AVAILABLE: item-2",
      },
      error: null,
    });

    const result = await applyTurnMutations(ctx);

    // Несмотря на то, что первая мутация могла бы пройти,
    // весь batch откатывается
    expect(result.status).toBe("aborted_conflict");
    expect(result.applied_mutations_count).toBe(0);
    expect(result.conflict_details).toContain("item-2");
  });

  // ============================================
  // TRANSFER_ITEM
  // ============================================
  it("обрабатывает TRANSFER_ITEM", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        {
          type: "TRANSFER_ITEM",
          item_id: "item-1",
          from_id: "player-1",
          to_id: "player-2",
          from_type: "player",
          to_type: "player",
          quantity: 1,
        },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: { success: true, applied_count: 1, new_time: null },
      error: null,
    });

    const result = await applyTurnMutations(ctx);
    expect(result.status).toBe("committed");
  });

  // ============================================
  // SPAWN_STRUCTURE
  // ============================================
  it("обрабатывает SPAWN_STRUCTURE", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        {
          type: "SPAWN_STRUCTURE",
          location_id: "loc-1",
          structure: { name: "Укрытие", type: "shelter", hp: 100, max_hp: 100 },
        },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({
      data: { success: true, applied_count: 1, new_time: null },
      error: null,
    });

    const result = await applyTurnMutations(ctx);
    expect(result.status).toBe("committed");
    expect(result.enriched_system_facts.some((f) => f.includes("структура"))).toBe(true);
  });

  // ============================================
  // Fallback при пустом data
  // ============================================
  it("fallback на committed при пустом data", async () => {
    const ctx: PersistenceInputContext = {
      session_id: "session-1",
      engine_output: makeEngineOutput([
        { type: "UPDATE_HP", target_type: "npc", id: "npc-1", delta: -5 },
      ]),
    };

    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await applyTurnMutations(ctx);
    expect(result.status).toBe("committed");
  });
});
