// tests/steps/step4_system_truth.test.ts
// Тесты для Шага 4: System Truth Compiler

import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем Deno и Supabase
vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return null;
    }),
  },
});

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

import { compileSystemTruth, SystemTruthInputContext } from "../../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { EngineOutputPayload } from "../../supabase/functions/process-turn/engine/types.ts";

// ============================================
// Утилиты
// ============================================
function makePlayers() {
  return [
    { id: "p1", name: "Элария", hp: 45, max_hp: 50, inventory: [] },
    { id: "p2", name: "Торин", hp: 40, max_hp: 50, inventory: [] },
  ];
}

function makeNpcs() {
  return [
    { id: "npc-1", name: "Гоблин-разведчик", race: "Гоблин", role: "Разведчик", status_tags: ["hostile", "alive"] },
    { id: "npc-2", name: "Торговец Лиор", race: "Человек", role: "Торговец", status_tags: ["friendly"] },
  ];
}

function makeBaseContext(overrides: Partial<SystemTruthInputContext> = {}): SystemTruthInputContext {
  return {
    session_id: "session-1",
    acting_player_id: "p1",
    engine_output: {
      action_results: [],
      mutations: [],
      raw_system_facts: [],
      success: true,
    },
    persistence_output: {
      status: "committed",
      applied_mutations_count: 0,
      enriched_system_facts: [],
    },
    session: {
      game_year: 1, game_month: 1, game_day: 1,
      game_hour: 14, game_minute: 30,
      current_location_id: "loc-1",
    },
    location: { name: "Таверна 'Бронзовый дракон'", weather: null },
    players: makePlayers(),
    npcs: makeNpcs(),
    atmosphere: { sounds: ["потрескивание камина"], visuals: ["тёплый свет"] },
    time_passed_minutes: 0,
    encounter_alert: null,
    ...overrides,
  };
}

// ============================================
// ТЕСТЫ
// ============================================
describe("Step 4: System Truth Compiler", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  // ============================================
  // Тест 1: Асимметричная скрытная атака
  // ============================================
  it("асимметричная скрытная атака: жертва НЕ видит ID/имя атакующего", async () => {
    const context = makeBaseContext({
      engine_output: {
        action_results: [
          {
            action_type: "stealth_attack",
            success: true,
            blocked: false,
            dice_roll: { roll: 18, modifier: 4, dc: 12, success: true },
            damage_dealt: 12,
            target_entity_id: "p2",
            target_item_name: null,
            used_item_id: "item-dagger",
            consumed_materials: null,
            stat_to_check: "dexterity",
            ai_custom_dc: 12,
            improper_tool_usage: null,
          } as any,
        ],
        mutations: [
          { type: "UPDATE_HP", target_type: "player", id: "p2", delta: -12 } as any,
        ],
        raw_system_facts: [],
        success: true,
      },
      time_passed_minutes: 6,
    });

    const result = await compileSystemTruth(context);

    // Атакующий (p1) видит свои броски
    const attackerKnowledge = result.player_truths["p1"].knowledge;
    expect(attackerKnowledge.some((f) => f.includes("Бросок") || f.includes("Нанесено"))).toBe(true);

    // Жертва (p2) НЕ должна видеть "Элария" или "p1"
    const victimKnowledge = result.player_truths["p2"].knowledge;
    const hasAttackerName = victimKnowledge.some((f) => f.includes("Элария") || f.includes("p1"));
    expect(hasAttackerName).toBe(false);

    // Жертва должна получить урон
    expect(result.player_truths["p2"].hp_status.delta).toBe(-12);

    // В фактах жертвы должно быть "Источник урона неизвестен" или подобное
    expect(victimKnowledge.some((f) => f.toLowerCase().includes("неизвестен") || f.toLowerCase().includes("из ниоткуда"))).toBe(true);
  });

  // ============================================
  // Тест 2: Открытый бой — оба игрока видят
  // ============================================
  it("открытый бой: атакующий и жертва видят корректные факты", async () => {
    const context = makeBaseContext({
      engine_output: {
        action_results: [
          {
            action_type: "attack",
            success: true,
            blocked: false,
            dice_roll: { roll: 16, modifier: 3, dc: 13, success: true },
            damage_dealt: 9,
            target_entity_id: "p2",
            target_item_name: null,
            used_item_id: "item-sword",
            consumed_materials: null,
            stat_to_check: "strength",
            ai_custom_dc: 13,
            improper_tool_usage: null,
          } as any,
        ],
        mutations: [
          { type: "UPDATE_HP", target_type: "player", id: "p2", delta: -9 } as any,
        ],
        raw_system_facts: [],
        success: true,
      },
    });

    const result = await compileSystemTruth(context);

    // Жертва (p2) ДОЛЖНА видеть имя атакующего
    const victimKnowledge = result.player_truths["p2"].knowledge;
    expect(victimKnowledge.some((f) => f.includes("Элария"))).toBe(true);
    expect(victimKnowledge.some((f) => f.includes("9"))).toBe(true);
  });

  // ============================================
  // Тест 3: Race Condition / Отмена хода
  // ============================================
  it("Race Condition: корректное сообщение об ошибке в knowledge инициатора", async () => {
    const context = makeBaseContext({
      persistence_output: {
        status: "aborted_conflict",
        applied_mutations_count: 0,
        conflict_details: "ITEM_NOT_AVAILABLE",
        enriched_system_facts: ["Конфликт"],
      },
    });

    const result = await compileSystemTruth(context);

    expect(result.turn_status).toBe("conflict");
    const actorKnowledge = result.player_truths["p1"].knowledge;
    expect(actorKnowledge.some((f) => f.toLowerCase().includes("не удалось") || f.toLowerCase().includes("забран"))).toBe(true);
  });

  // ============================================
  // Тест 4: Lazy Loading памяти NPC
  // ============================================
  it("Lazy RAG: память NPC подтягивается ТОЛЬКО для активного NPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { content: "Элария напоила меня элем" },
        { content: "Элария спасла мне жизнь" },
      ],
      error: null,
    });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [] }),
          }),
        }),
      }),
    });

    const context = makeBaseContext({
      engine_output: {
        action_results: [
          {
            action_type: "talk",
            success: true,
            blocked: false,
            target_entity_id: "npc-2", // Торговец Лиор
            target_item_name: null,
            used_item_id: null,
            consumed_materials: null,
            stat_to_check: "charisma",
            ai_custom_dc: 10,
            improper_tool_usage: null,
          } as any,
        ],
        mutations: [],
        raw_system_facts: [],
        success: true,
      },
    });

    const result = await compileSystemTruth(context);

    // Активный NPC (npc-2) должен иметь память
    expect(result.npc_context["npc-2"]).toBeDefined();
    expect(result.npc_context["npc-2"].relevant_memories.length).toBeGreaterThan(0);

    // НЕактивный NPC (npc-1) НЕ должен иметь память
    expect(result.npc_context["npc-1"]).toBeUndefined();

    // Rpc вызвался ровно один раз (для активного NPC)
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("match_npc_memories", expect.objectContaining({
      p_npc_id: "npc-2",
    }));
  });

  // ============================================
  // Тест 5: Глобальные события (смена времени, структура, энкаунтер)
  // ============================================
  it("глобальные события: смена времени, появление структуры, энкаунтер", async () => {
    const context = makeBaseContext({
      session: {
        game_year: 1, game_month: 1, game_day: 1,
        game_hour: 23, game_minute: 50,
        current_location_id: "loc-1",
      },
      time_passed_minutes: 30, // переход через полночь
      engine_output: {
        action_results: [],
        mutations: [
          { type: "SPAWN_STRUCTURE", structure: { name: "Кострище" }, location_id: "loc-1" } as any,
        ],
        raw_system_facts: [],
        success: true,
      },
      encounter_alert: { spawned: true, tier: 1, creature_name: "Волк" },
    });

    const result = await compileSystemTruth(context);

    // Смена времени → "Наступил(а) ..."
    expect(result.global_events.some((e) => e.includes("Наступил"))).toBe(true);

    // Структура
    expect(result.global_events.some((e) => e.includes("Кострище"))).toBe(true);

    // Энкаунтер
    expect(result.global_events.some((e) => e.includes("Волк"))).toBe(true);

    // environment.time должен быть обновлён
    expect(result.environment.time.hour).toBe(0); // 23:50 + 30 мин = 00:20, но мы проверим только что час другой
    expect(result.environment.time.day).toBe(2);
  });

  // ============================================
  // Тест 6: Inventory delta (added/removed/damaged)
  // ============================================
  it("Inventory delta корректно отслеживает добавленные/удалённые/повреждённые предметы", async () => {
    const context = makeBaseContext({
      engine_output: {
        action_results: [],
        mutations: [
          {
            type: "INSERT_ITEM",
            owner_type: "player",
            owner_id: "p1",
            item: { item_name: "Факел", quantity: 1 },
          } as any,
          {
            type: "DELETE_ITEM",
            owner_type: "player",
            owner_id: "p1",
            item_id: "item-wood",
            quantity: 2,
          } as any,
          {
            type: "UPDATE_DURABILITY",
            owner_type: "player",
            owner_id: "p1",
            item_id: "item-sword",
            delta: -3,
            set_broken: false,
          } as any,
        ],
        raw_system_facts: [],
        success: true,
      },
    });

    const result = await compileSystemTruth(context);

    const p1 = result.player_truths["p1"];
    expect(p1.inventory_delta.added).toContain("Факел");
    expect(p1.inventory_delta.removed).toContain("item-wood");
    expect(p1.inventory_delta.damaged).toContain("item-sword");
  });

  // ============================================
  // Тест 7: Fallback памяти NPC (если vector search пуст)
  // ============================================
  it("Fallback: если match_npc_memories вернул [], берём последние 3 по created_at", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [
                { content: "fallback memory 1" },
                { content: "fallback memory 2" },
                { content: "fallback memory 3" },
              ],
            }),
          }),
        }),
      }),
    });

    const context = makeBaseContext({
      engine_output: {
        action_results: [
          {
            action_type: "talk",
            success: true,
            blocked: false,
            target_entity_id: "npc-1",
            target_item_name: null,
            used_item_id: null,
            consumed_materials: null,
            stat_to_check: "charisma",
            ai_custom_dc: 10,
            improper_tool_usage: null,
          } as any,
        ],
        mutations: [],
        raw_system_facts: [],
        success: true,
      },
    });

    const result = await compileSystemTruth(context);

    expect(result.npc_context["npc-1"]).toBeDefined();
    expect(result.npc_context["npc-1"].relevant_memories).toEqual([
      "fallback memory 1",
      "fallback memory 2",
      "fallback memory 3",
    ]);
  });

  // ============================================
  // Тест 8: turn_status = "impossible" когда все экшены заблокированы
  // ============================================
  it("turn_status = 'impossible' когда все экшены заблокированы", async () => {
    const context = makeBaseContext({
      engine_output: {
        action_results: [
          { action_type: "attack", success: false, blocked: true, block_reason: "PvP отключён" } as any,
        ],
        mutations: [],
        raw_system_facts: [],
        success: false,
      },
    });

    const result = await compileSystemTruth(context);
    expect(result.turn_status).toBe("impossible");
  });
});
