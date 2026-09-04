// tests/npc_combat_and_life.test.ts
// Тесты для автономности NPC (спутники, экспедиции) и пошагового боя D&D
import { describe, it, expect, vi } from "vitest";
import {
  buildFallbackNpcDecision,
  executeNpcAttack,
  BattlefieldPlayer,
} from "../supabase/functions/_shared/npc_combat_ai.ts";
import {
  gameTimeToMinutes,
  handleCompanionInSceneAction,
  resolveNpcBackgroundActivities,
} from "../supabase/functions/_shared/npc_autonomous_engine.ts";

describe("D&D Боевой ИИ для NPC", () => {
  const mockPlayer: BattlefieldPlayer = {
    id: "player-1",
    name: "Влад",
    hp: 30,
    max_hp: 30,
    armor_class: 14,
    class: "Воин",
  };

  const mockNpc = {
    id: "npc-wolf-alpha",
    name: "Вожак стаи",
    race: "Зверь",
    role: "хищник",
    level: 3,
    hp: 12,
    max_hp: 35,
    stats: { STR: 16, DEX: 14, CON: 14, INT: 6, WIS: 12, CHA: 8 },
    special_attacks: [
      { name: "Смертельный укус за горло", damage_dice: "2d6", damage_type: "piercing", is_special: true },
    ],
    base_attacks: [
      { name: "Удар когтистой лапой", damage_dice: "1d6", damage_type: "slashing" },
    ],
  };

  it("выбирает спецатаку или базовую атаку в зависимости от ситуации", () => {
    const decision = buildFallbackNpcDecision({
      npc: mockNpc,
      players: [mockPlayer],
    });

    expect(decision.target_player_id).toBe(mockPlayer.id);
    expect(decision.target_player_name).toBe(mockPlayer.name);
    expect(["special_attack", "base_attack"]).toContain(decision.action_type);
    expect(decision.damage_dice).toBeTruthy();
  });

  it("исполняет D&D атаку по правилам (d20 + мод vs AC игрока, расчёт урона и мутации)", () => {
    const decision = {
      action_type: "special_attack" as const,
      attack_name: "Смертельный укус за горло",
      damage_dice: "2d6",
      damage_type: "piercing",
      target_player_id: mockPlayer.id,
      target_player_name: mockPlayer.name,
      tactical_reason: "Тестовая атака",
    };

    const result = executeNpcAttack({
      npc: mockNpc,
      targetPlayer: mockPlayer,
      decision,
    });

    expect(result.npc_name).toBe("Вожак стаи");
    expect(result.target_player_id).toBe(mockPlayer.id);
    expect(result.d20).toBeGreaterThanOrEqual(1);
    expect(result.d20).toBeLessThanOrEqual(20);
    expect(result.log_message).toContain("атакует");
    expect(result.mutation.type).toBe("UPDATE_HP");
    expect(result.mutation.target_type).toBe("player");

    if (result.is_hit) {
      expect(result.damage).toBeGreaterThan(0);
      expect(result.mutation.delta).toBe(-result.damage);
    } else {
      expect(result.damage).toBe(0);
      expect(result.mutation.delta).toBe(0);
    }
  });
});

describe("Автономия спутников в текущей сцене", () => {
  it("активирует инициативу спутника при мирных действиях (сбор хвороста/рубка дров)", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const companionNpc = {
      id: "npc-shiro",
      name: "Широ",
      is_hostile: false,
      is_alive: true,
      role: "companion",
    };

    const result = await handleCompanionInSceneAction({
      supabase: mockSupabase,
      player_action_text: "Собираю сухой хворост для костра",
      acting_player_name: "Влад",
      location_npcs: [companionNpc],
      session_id: "session-1",
    });

    expect(result).not.toBeNull();
    expect(result?.npc_name).toBe("Широ");
    expect(result?.item_obtained).toBeTruthy();
    expect(result?.dialogue).toContain("Влад");
    expect(mockSupabase.rpc).toHaveBeenCalledWith("add_item_to_inventory", expect.any(Object));
  });

  it("не активирует инициативу спутника при боевых действиях", async () => {
    const mockSupabase = { rpc: vi.fn() };
    const companionNpc = { id: "npc-shiro", name: "Широ", is_hostile: false, is_alive: true };

    const result = await handleCompanionInSceneAction({
      supabase: mockSupabase,
      player_action_text: "Бью гоблина мечом в грудь",
      acting_player_name: "Влад",
      location_npcs: [companionNpc],
      session_id: "session-1",
    });

    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });
});

describe("Ленивая календарная симуляция долгосрочных экспедиций (0 токенов)", () => {
  it("точно конвертирует календарные даты в минуты", () => {
    const t1 = { year: 1248, month: 5, day: 14, hour: 10, minute: 0 };
    const t2 = { year: 1248, month: 5, day: 14, hour: 12, minute: 30 };

    const m1 = gameTimeToMinutes(t1);
    const m2 = gameTimeToMinutes(t2);

    expect(m2 - m1).toBe(150); // 2 часа 30 минут = 150 минут
  });

  it("пропускает симуляцию, если срок экспедиции ещё не подошел (0 токенов)", async () => {
    const futureEndTime = { year: 1248, month: 5, day: 18, hour: 10, minute: 0 };
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "npc-shiro",
                  name: "Широ",
                  current_activity: "Охота в лесу",
                  activity_data: { ends_game_time: futureEndTime },
                },
              ],
            }),
          }),
        }),
      }),
    };

    const currentTime = { year: 1248, month: 5, day: 15, hour: 10, minute: 0 };
    const results = await resolveNpcBackgroundActivities({
      supabase: mockSupabase,
      world_id: "world-1",
      current_game_time: currentTime,
    });

    expect(results).toEqual([]);
  });

  it("завершает экспедицию, начисляет опыт, лут и повышает уровень по достижении времени", async () => {
    const pastEndTime = { year: 1248, month: 5, day: 17, hour: 10, minute: 0 };
    const mockNpc = {
      id: "npc-shiro",
      name: "Широ",
      level: 1,
      xp: 80,
      stats: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 10 },
      current_activity: "Охота на оленя",
      activity_data: {
        duration_days: 3,
        ends_game_time: pastEndTime,
        expected_loot: ["Шкура взрослого оленя", "Мясо дичи"],
      },
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [mockNpc] }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: true, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: true, error: null }),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const currentTime = { year: 1248, month: 5, day: 18, hour: 12, minute: 0 };
    const results = await resolveNpcBackgroundActivities({
      supabase: mockSupabase,
      world_id: "world-1",
      current_game_time: currentTime,
    });

    expect(results.length).toBe(1);
    expect(results[0].npc_name).toBe("Широ");
    expect(results[0].leveled_up).toBe(true);
    expect(results[0].new_level).toBe(2);
    expect(results[0].loot).toEqual(["Шкура взрослого оленя", "Мясо дичи"]);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("add_item_to_inventory", expect.any(Object));
  });
});
