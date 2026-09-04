// tests/pipeline_integration.test.ts
// Сквозной интеграционный тест всего 5-шагового конвейера process-turn.
// Проверяет: от строки "Бью орка мечом" до сохранения сообщений с мутациями.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      if (key === "OPENROUTER_API_KEY") return "test-fallback-key";
      return null;
    }),
  },
});

// Mocked Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

// Helper: создаёт цепочку thenable
function makeChain(result: any) {
  const chain: any = {};
  chain.then = (onFulfilled: any) => Promise.resolve(result).then(onFulfilled);
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.insert = vi.fn(() => Promise.resolve({ error: null }));
  chain.update = vi.fn(() => chain);
  return chain;
}

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
    from: (table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        update: vi.fn(() => builder),
      };
      return builder;
    },
  }),
}));

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

// Mock fetch для OpenRouter (Шаг 1 + Шаг 5)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { executeEngine } from "../supabase/functions/process-turn/engine/step2_engine.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { generateNarrative, buildFallbackNarrative } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SystemTruthDto } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
import { RouterOutputPayload } from "../supabase/functions/process-turn/types.ts";

describe("Pipeline Integration: 5-step end-to-end", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRpc.mockReset();
  });

  it("полный прогон: атака мечом по орку → мутации HP → нарратив", async () => {
    // ============================================
    // MOCK: Шаг 5 (Narrator LLM) — только narrator, т.к. Router+Engine мы вызываем напрямую
    // ============================================
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          players: {
            "player-1": "Элария взмахнула мечом. [Урон: 8] Лезвие рассекло орку плечо.",
          },
          global_narrative: "[Локация: Арена] Время: 14:35 — Бой!",
        }) } }],
      }),
    });

    // ============================================
    // Шаг 1: Router — эмулируем успешный парсинг
    // (для теста мы пропускаем HTTP-вызов и создаём RouterOutput напрямую)
    // ============================================
    const routerOutput: RouterOutputPayload = {
      status: "success",
      clarification_msg: null,
      actions: [{
        action_type: "attack",
        target_entity_id: "npc-orc-1",
        target_item_name: "орк",
        used_item_id: "item-sword",
        consumed_materials: null,
        stat_to_check: "strength",
        ai_custom_dc: 10,
        improper_tool_usage: null,
      } as any],
      encounter_intent: { type: "attack", target_name: "орк" },
      time_estimate_minutes: 5,
      atmosphere: { sounds: ["лязг стали"], visuals: ["кровь"] },
    };

    // ============================================
    // Шаг 2: Engine
    // ============================================
    const player = {
      id: "player-1", name: "Элария",
      stats: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 13 },
      hp: 45, max_hp: 50, armor_class: 14, initiative: 4, level: 5,
      inventory: [
        { id: "item-sword", item_name: "Стальной меч", type: "weapon", quantity: 1, durability: 15, condition: "good", attributes: { damage_dice: "1d8+3" } },
      ],
      injuries: [],
    };
    const orc = {
      id: "npc-orc-1", name: "Орк-вожак", race: "Орк", role: "Воин",
      hp: 30, max_hp: 30, armor_class: 13, level: 3,
      stats: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 10, CHA: 8 },
      is_hostile: true, is_alive: true,
    };

    const engineCtx: EngineInputContext = {
      router_output: routerOutput,
      session: {
        id: "session-1", difficulty: "normal", is_pvp_enabled: false,
        game_year: 1, game_month: 1, game_day: 1, game_hour: 14, game_minute: 30,
        current_location_id: "loc-1",
      },
      acting_player: player,
      targets: {
        players: new Map([["player-1", player]]),
        npcs: new Map([["npc-orc-1", orc]]),
        location_items: new Map(),
      },
    };

    const origRandom = Math.random;
    Math.random = () => 0.99; // гарантируем попадание (d20 = 20)
    let engineResult;
    try {
      engineResult = executeEngine(engineCtx);
    } finally {
      Math.random = origRandom;
    }

    // Проверки Шага 2
    expect(engineResult.success).toBe(true);
    expect(engineResult.action_results).toHaveLength(1);
    const hpMutation = engineResult.mutations.find((m) => m.type === "UPDATE_HP");
    expect(hpMutation).toBeDefined();
    expect((hpMutation as any).target_type).toBe("npc");
    expect((hpMutation as any).id).toBe("npc-orc-1");
    expect((hpMutation as any).delta).toBeLessThan(0);

    // ============================================
    // Шаг 3: Persistence (mock RPC via DI)
    // ============================================
    const fakeSupabase = {
      rpc: vi.fn().mockResolvedValueOnce({
        data: { success: true, applied_count: engineResult.mutations.length, new_time: null },
        error: null,
      }),
    };

    const { applyTurnMutations } = await import("../supabase/functions/process-turn/steps/step3_persistence.ts");
    const persistenceResult = await applyTurnMutations({
      session_id: "session-1",
      engine_output: engineResult,
    }, fakeSupabase);

    expect(persistenceResult.status).toBe("committed");
    expect(persistenceResult.applied_mutations_count).toBe(engineResult.mutations.length);
    expect(fakeSupabase.rpc).toHaveBeenCalledWith("apply_turn_mutations", expect.objectContaining({
      p_session_id: "session-1",
      p_mutations: engineResult.mutations,
    }));

    // ============================================
    // Шаг 4: System Truth
    // ============================================
    const systemTruth = await compileSystemTruth({
      session_id: "session-1",
      acting_player_id: "player-1",
      engine_output: engineResult,
      persistence_output: persistenceResult,
      session: {
        game_year: 1, game_month: 1, game_day: 1, game_hour: 14, game_minute: 30,
        current_location_id: "loc-1",
      },
      location: { name: "Арена", weather: null },
      players: [
        { id: "player-1", name: "Элария", hp: 45, max_hp: 50, inventory: player.inventory },
      ],
      npcs: [{ id: "npc-orc-1", name: "Орк-вожак", race: "Орк", role: "Воин" }],
      atmosphere: routerOutput.atmosphere,
      time_passed_minutes: 5,
      encounter_alert: null,
    });

    expect(systemTruth.turn_status).toBe("success");
    expect(systemTruth.player_truths["player-1"]).toBeDefined();
    const p1Truth = systemTruth.player_truths["player-1"];
    expect(p1Truth.knowledge.length).toBeGreaterThan(0);
    expect(p1Truth.knowledge.some((f) => f.includes("Бросок") || f.includes("Нанесено"))).toBe(true);

    // ============================================
    // Шаг 5: Narrator
    // ============================================
    const narratorOutput = await generateNarrative({
      system_truth: systemTruth,
      action_text: "Бью орка мечом",
      player_name: "Элария",
      player_race: "Эльф",
      player_class: "Воин",
      lore_context: "",
      openrouter_api_key: "test-key",
      dm_model: "test-model",
    });

    expect(narratorOutput.players["player-1"]).toBeTruthy();
    expect(narratorOutput.players["player-1"]).toContain("Элария");
    expect(narratorOutput.global_narrative).toBeTruthy();

    // ============================================
    // Финальные проверки
    // ============================================
    console.log("=== PIPELINE RESULT ===");
    console.log("Step 2 mutations:", engineResult.mutations.length);
    console.log("Step 3 status:", persistenceResult.status);
    console.log("Step 4 turn_status:", systemTruth.turn_status);
    console.log("Step 5 players:", Object.keys(narratorOutput.players));
  });

  it("Fallback работает на полном пайплайне: LLM сбой → fallback-нарратив", async () => {
    const routerOutput: RouterOutputPayload = {
      status: "success",
      clarification_msg: null,
      actions: [{
        action_type: "harvest_ambient",
        target_entity_id: null,
        target_item_name: "камень",
        used_item_id: null,
        consumed_materials: null,
        stat_to_check: "strength",
        ai_custom_dc: 10,
        improper_tool_usage: null,
      } as any],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    };

    const player = {
      id: "player-1", name: "Торин",
      stats: { STR: 18, DEX: 10, CON: 16, INT: 8, WIS: 10, CHA: 8 },
      hp: 50, max_hp: 60, armor_class: 14, initiative: 0, level: 4,
      inventory: [
        { id: "item-pickaxe", item_name: "Кирка", type: "tool", quantity: 1, durability: 20, condition: "good", attributes: null },
      ],
      injuries: [],
    };

    const engineCtx: EngineInputContext = {
      router_output: routerOutput,
      session: { id: "session-1", difficulty: "normal", is_pvp_enabled: false, game_year: 1, game_month: 1, game_day: 1, game_hour: 10, game_minute: 0, current_location_id: "loc-1" },
      acting_player: player,
      targets: { players: new Map([["player-1", player]]), npcs: new Map(), location_items: new Map() },
    };

    const engineResult = executeEngine(engineCtx);

    // Mock persistence
    const fakeSupabase2 = {
      rpc: vi.fn().mockResolvedValueOnce({
        data: { success: true, applied_count: engineResult.mutations.length, new_time: null },
        error: null,
      }),
    };
    const { applyTurnMutations } = await import("../supabase/functions/process-turn/steps/step3_persistence.ts");
    const persistenceResult = await applyTurnMutations({ session_id: "session-1", engine_output: engineResult }, fakeSupabase2);

    const systemTruth = await compileSystemTruth({
      session_id: "session-1",
      acting_player_id: "player-1",
      engine_output: engineResult,
      persistence_output: persistenceResult,
      session: { game_year: 1, game_month: 1, game_day: 1, game_hour: 10, game_minute: 0, current_location_id: "loc-1" },
      location: { name: "Шахта", weather: null },
      players: [{ id: "player-1", name: "Торин", hp: 50, max_hp: 60, inventory: player.inventory }],
      npcs: [],
      atmosphere: { sounds: [], visuals: [] },
      time_passed_minutes: 0,
      encounter_alert: null,
    });

    // Force LLM failure
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "LLM down" });

    let fallback: any;
    try {
      await generateNarrative({
        system_truth, action_text: "Добываю камень",
        player_name: "Торин", player_race: "Дварф", player_class: "Шахтёр",
        lore_context: "", openrouter_api_key: "test-key", dm_model: "test-model",
      });
    } catch {
      fallback = buildFallbackNarrative(systemTruth);
    }

    expect(fallback).toBeDefined();
    expect(fallback.players["player-1"]).toBeTruthy();
    // Fallback должен содержать какую-то информацию
    expect(fallback.players["player-1"].length).toBeGreaterThan(5);
  });

  it("Обрабатывает race condition на полном пайплайне", async () => {
    const routerOutput: RouterOutputPayload = {
      status: "success",
      clarification_msg: null,
      actions: [{
        action_type: "transfer_item",
        target_entity_id: "player-2",
        target_item_name: "зелье",
        used_item_id: "item-potion",
        consumed_materials: null,
        stat_to_check: null,
        ai_custom_dc: 1,
        improper_tool_usage: null,
      } as any],
      encounter_intent: { type: "none", target_name: null },
      time_estimate_minutes: 0,
      atmosphere: { sounds: [], visuals: [] },
    };

    const p1 = {
      id: "p1", name: "Элария",
      stats: { STR: 12, DEX: 14, CON: 12, INT: 12, WIS: 12, CHA: 14 },
      hp: 45, max_hp: 50, armor_class: 14, initiative: 4, level: 5,
      inventory: [{ id: "item-potion", item_name: "Зелье", type: "consumable", quantity: 1, durability: null, condition: null, attributes: null }],
      injuries: [],
    };
    const p2 = {
      id: "p2", name: "Торин",
      stats: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      hp: 40, max_hp: 50, armor_class: 12, initiative: 0, level: 3,
      inventory: [], injuries: [],
    };

    const engineCtx: EngineInputContext = {
      router_output: routerOutput,
      session: { id: "session-1", difficulty: "normal", is_pvp_enabled: true, game_year: 1, game_month: 1, game_day: 1, game_hour: 12, game_minute: 0, current_location_id: "loc-1" },
      acting_player: p1,
      targets: { players: new Map([["p1", p1], ["p2", p2]]), npcs: new Map(), location_items: new Map() },
    };

    const engineResult = executeEngine(engineCtx);
    // Engine может не создать мутаций в этом сценарии (transfer с pvp) — подменим
    // на минимальный конфликтный сценарий через прямую подмену engine_output
    const conflictEngineResult = {
      ...engineResult,
      mutations: [
        { type: "TRANSFER_ITEM", from_type: "player", from_id: "p1", to_type: "player", to_id: "p2", item_id: "item-potion", quantity: 1 } as any,
      ],
      raw_system_facts: ["Конфликт при передаче"],
    };
    console.log("[TEST] engine mutations:", conflictEngineResult.mutations.length);

    // Mock persistence: aborted_conflict via DI
    const fakeSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: false, details: "ITEM_NOT_AVAILABLE" },
        error: null,
      }),
    };
    const { applyTurnMutations } = await import("../supabase/functions/process-turn/steps/step3_persistence.ts");
    const persistenceResult = await applyTurnMutations({ session_id: "session-1", engine_output: conflictEngineResult as any }, fakeSupabase);
    console.log("[TEST] persistence status:", persistenceResult.status, "details:", persistenceResult.conflict_details);

    expect(persistenceResult.status).toBe("aborted_conflict");

    const systemTruth = await compileSystemTruth({
      session_id: "session-1",
      acting_player_id: "p1",
      engine_output: conflictEngineResult as any,
      persistence_output: persistenceResult,
      session: { game_year: 1, game_month: 1, game_day: 1, game_hour: 12, game_minute: 0, current_location_id: "loc-1" },
      location: { name: "Лагерь", weather: null },
      players: [
        { id: "p1", name: "Элария", hp: 45, max_hp: 50, inventory: p1.inventory },
        { id: "p2", name: "Торин", hp: 40, max_hp: 50, inventory: [] },
      ],
      npcs: [],
      atmosphere: { sounds: [], visuals: [] },
      time_passed_minutes: 0,
      encounter_alert: null,
    });

    expect(systemTruth.turn_status).toBe("conflict");
    expect(systemTruth.player_truths["p1"].knowledge.some((f) => f.includes("не удалось"))).toBe(true);
  });
});
