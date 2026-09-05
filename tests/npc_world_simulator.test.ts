import { describe, it, expect, vi } from "vitest";

// Мокаем Deno и https импорты для совместимости с node/vitest
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

vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({
  serve: vi.fn(),
}));

import { executeRoundCycleNpcSimulation } from "../supabase/functions/_shared/npc_world_simulator.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { generateNarrative } from "../supabase/functions/process-turn/steps/step5_narrator.ts";

describe("Living World Round-Cycle Simulation & NPC Dialogue AI", () => {
  it("фильтрует спутников и NPC в одной локации с игроком, моделируя только удалённых", async () => {
    const mockSessionId = "session-test-uuid";
    const mockLocationId = "loc-town-square";
    const mockWorldId = "world-test-uuid";

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "players") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "p1", name: "Арагорн", current_zone: "Рынок" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "npc_relationships") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { npc_id: "npc-local", score: 10, interactions_count: 2 },
                  { npc_id: "npc-companion", score: 50, interactions_count: 5 },
                  { npc_id: "npc-distant", score: 20, interactions_count: 3 },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "npc_memories") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "npcs") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "npc-local",
                    name: "Торговец Бран",
                    race: "Человек",
                    role: "merchant",
                    location_id: mockLocationId, // В ТОЙ ЖЕ ЛОКАЦИИ!
                    hp: 30,
                    status_tags: [],
                  },
                  {
                    id: "npc-companion",
                    name: "Эльфийка Лира",
                    race: "Эльф",
                    role: "companion", // СПУТНИК!
                    location_id: "loc-other",
                    hp: 45,
                    status_tags: ["спутник"],
                  },
                  {
                    id: "npc-distant",
                    name: "Охотник Торин",
                    race: "Дворф",
                    role: "hunter",
                    class: "охотник",
                    location_id: "loc-mountains", // ДАЛЕКО!
                    hp: 50,
                    status_tags: [],
                    temperament: "холерик",
                    motivation: "добыть шкуру белого волка",
                  },
                ],
                error: null,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === "locations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { id: "loc-mountains", name: "Горный перевал", type: "wilderness" },
                    { id: "loc-tavern", name: "Таверна Пьяный Дракон", type: "tavern" },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "npc_world_logs") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "messages") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn().mockReturnThis(),
        };
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    // Вызываем фоновую симуляцию раунда
    const result = await executeRoundCycleNpcSimulation({
      supabase: mockSupabase,
      sessionId: mockSessionId,
      roundNumber: 2,
      currentLocationId: mockLocationId,
      worldId: mockWorldId,
      loreContext: "Суровые северные земли...",
      openrouterApiKey: "", // Без ключа сработает умный процедурный движок
    });

    // Из 3 NPC только Торин должен быть смоделирован
    expect(result.simulated_count).toBe(1);
    expect(result.actions[0].npc_id).toBe("npc-distant");
    expect(result.actions[0].npc_name).toBe("Охотник Торин");
    expect(result.chronicle_message).toContain("Охотник Торин");
  });

  it("Step 4 & Step 5 обогащают диалог NPC психологией (temperament, current_mood, speech_style, secrets)", async () => {
    const systemTruth = await compileSystemTruth({
      session_id: "s1",
      acting_player_id: "p1",
      engine_output: {
        success: true,
        action_results: [
          { action_type: "talk", target_entity_id: "npc-1", is_success: true, narrative_fact: "Игрок заговорил со стражником." },
        ],
        mutations: [],
      } as any,
      persistence_output: {
        status: "committed",
        applied_mutations_count: 0,
        enriched_system_facts: [],
      },
      session: {
        game_year: 1248, game_month: 5, game_day: 14, game_hour: 12, game_minute: 0,
        current_location_id: "loc-gate",
      },
      location: { name: "Городские ворота", weather: "Пасмурно" },
      players: [{ id: "p1", name: "Роланд", hp: 30, max_hp: 30, inventory: [] }],
      npcs: [{
        id: "npc-1",
        name: "Капитан Варис",
        race: "Человек",
        role: "guard_captain",
        temperament: "подозрительный",
        current_mood: "раздражён",
        speech_style: "отрывистый командный тон с хрипотцой",
        motivation: "найти шпиона до заката",
        secrets: "берёт взятки у гильдии воров",
        rumors: ["В катакомбах видели культистов"],
        habits: "теребит рукоять меча",
        is_alive: true,
        is_hostile: false,
      }],
      atmosphere: { sounds: ["скрип ворот"], visuals: ["мрачные башни"] },
      time_passed_minutes: 5,
      encounter_alert: null,
    });

    // Проверяем, что в SystemTruth npc_context содержит психологические поля
    const npcCtx = systemTruth.npc_context["npc-1"];
    expect(npcCtx).toBeDefined();
    expect(npcCtx.temperament).toBe("подозрительный");
    expect(npcCtx.current_mood).toBe("раздражён");
    expect(npcCtx.speech_style).toBe("отрывистый командный тон с хрипотцой");
    expect(npcCtx.motivation).toBe("найти шпиона до заката");
    expect(npcCtx.secrets).toBe("берёт взятки у гильдии воров");

    // Проверяем промпт нарратора
    let capturedPrompt = "";
    const fakeFetch = vi.fn().mockImplementation((url, opts) => {
      const body = JSON.parse(opts.body);
      capturedPrompt = body.messages.map((m: any) => m.content).join("\n");
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                players: { "p1": "Варис резко повернулся..." },
                global_narrative: "Варис побеседовал с Роландом.",
              }),
            },
          }],
        }),
      });
    });

    // @ts-ignore
    global.fetch = fakeFetch;

    await generateNarrative({
      system_truth: systemTruth,
      action_text: "Спрашиваю у Вариса о подозрительных людях",
      player_name: "Роланд",
      player_race: "Человек",
      player_class: "Воин",
      lore_context: "",
      openrouter_api_key: "mock-key",
      dm_model: "test-model",
    });

    expect(capturedPrompt).toContain("ОТЫГРЫШ NPC НА 100%");
    expect(capturedPrompt).toContain("подозрительный");
    expect(capturedPrompt).toContain("раздражён");
    expect(capturedPrompt).toContain("отрывистый командный тон с хрипотцой");
    expect(capturedPrompt).toContain("найти шпиона до заката");
  });
});
