import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn(() => "https://test.supabase.co"),
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

import { HarvestAmbientHandler, isAbstractObservation, resolveHarvestedItem } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";
import { SearchHandler } from "../supabase/functions/process-turn/engine/handlers/loot_search_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";

describe("Качество геймплея: предотвращение мусорных предметов и чистота нарратива", () => {
  it("абстрактные понятия (следы, тропы, запахи, улики) не должны становиться физическими предметами инвентаря в harvest_ambient", () => {
    const handler = new HarvestAmbientHandler();
    const ctx = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Валериан",
        stats: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 14, CHA: 10 },
        skills: {},
      },
    } as any;

    // Игрок проверяет следы у тракта
    const res = handler.handle({
      action_type: "harvest_ambient",
      target_item_name: "Следы у тракта",
      raw_action_text: "проверить ближайшие следы у тракта",
      ai_custom_dc: 5,
    } as any, ctx);

    expect(res.result.success).toBe(true);
    // КРИТИЧНО: никаких мутаций INSERT_ITEM для следов!
    expect(res.mutations.length).toBe(0);
    expect(res.result.details).toContain("Следы у тракта");
    expect(res.system_facts[0]).toContain("внимательно изучил окружение");
  });

  it("обыск местности (search) со следами или уликами не захламляет инвентарь", () => {
    const searchHandler = new SearchHandler();
    const ctx = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Валериан",
        stats: { STR: 12, DEX: 14, CON: 12, INT: 14, WIS: 14, CHA: 10 },
        skills: {},
      },
    } as any;

    const res = searchHandler.handle({
      action_type: "search",
      target_item_name: "следы чужаков",
      ai_custom_dc: 5,
    } as any, ctx);

    expect(res.result.success).toBe(true);
    expect(res.mutations.length).toBe(0);
    expect(res.system_facts[0]).toContain("внимательно осмотрел округу");
  });

  it("реальные физические ресурсы (сухие ветки, грибы) продолжают успешно собираться как предметы", () => {
    const handler = new HarvestAmbientHandler();
    const ctx = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Валериан",
        stats: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 14, CHA: 10 },
        skills: {},
      },
    } as any;

    const res = handler.handle({
      action_type: "harvest_ambient",
      target_item_name: "Сухие ветки",
      raw_action_text: "собираю сухие ветки для костра",
      ai_custom_dc: 2,
    } as any, ctx);

    expect(res.result.success).toBe(true);
    expect(res.mutations.length).toBe(1);
    expect(res.mutations[0].type).toBe("INSERT_ITEM");
    expect((res.mutations[0] as any).item.item_name).toBe("Сухие ветки");
    expect((res.mutations[0] as any).item.type).toBe("wood");
  });

  it("compileSystemTruth не генерирует уродливые псевдо-теги в квадратных скобках вида [Навык: Успех]", async () => {
    const truth = await compileSystemTruth({
      session_id: "s1",
      acting_player_id: "p1",
      engine_output: {
        action_results: [
          {
            action_type: "harvest_ambient",
            success: true,
            dice_roll: { d20: 15, total: 17, dc: 10, is_crit: false, is_fumble: false, rolls: [15], chosen: 15, target_dc: 10 },
            details: "Изучены Следы у тракта",
          },
        ],
        mutations: [],
        system_facts: ["Валериан изучил следы"],
        time_passed_minutes: 10,
      } as any,
      persistence_output: { status: "committed" } as any,
      session: { id: "s1", current_time_minutes: 480 } as any,
      location: { name: "Опушка леса" } as any,
      players: [{ id: "p1", name: "Валериан", hp: 20, max_hp: 20 }] as any,
      npcs: [],
      atmosphere: { sounds: [], visuals: [] },
      time_passed_minutes: 10,
    });

    const knowledge = truth.player_truths["p1"].knowledge.join("\n");
    expect(knowledge).not.toContain("[Навык: Успех]");
    expect(knowledge).not.toContain("[Выживание: Успех]");
    expect(knowledge).toContain("Проверка навыка (Выживание) прошла успешно");
    expect(knowledge).toContain("Изучены Следы у тракта");
  });
});
