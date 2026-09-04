// tests/pet_taming.test.ts
// Тесты для интеллектуальной системы приручения питомцев (звери и монстры)
import { describe, it, expect, vi } from "vitest";
import {
  getCreatureDiet,
  evaluateFoodSuitability,
  generatePetNickname,
  evaluatePetTamingAttempt,
  evaluatePetLoyaltyCheck,
  awardPetCombatXp,
} from "../supabase/functions/_shared/pet_taming_engine.ts";

describe("Интеллектуальная система приручения питомцев", () => {
  describe("Диета и пригодность пищи", () => {
    it("точно определяет диету существ (хищники, травоядные, всеядные, магические)", () => {
      expect(getCreatureDiet("Дикий серый волк", "beast")).toBe("carnivore");
      expect(getCreatureDiet("Благородный олень", "beast")).toBe("herbivore");
      expect(getCreatureDiet("Бурый медведь", "beast")).toBe("omnivore");
      expect(getCreatureDiet("Горный грифон", "monster")).toBe("magical");
      expect(getCreatureDiet("Огненная саламандра", "monster")).toBe("magical");
    });

    it("поощряет правильную пищу и штрафует неподходящую", () => {
      // Волк и сырое мясо
      const wolfMeat = evaluateFoodSuitability("carnivore", "Свежий окорок кабана");
      expect(wolfMeat.is_suitable).toBe(true);
      expect(wolfMeat.bonus).toBeGreaterThan(0);

      // Волк и яблоко (отказ!)
      const wolfApple = evaluateFoodSuitability("carnivore", "Спелое лесное яблоко");
      expect(wolfApple.is_suitable).toBe(false);
      expect(wolfApple.bonus).toBeLessThan(0);

      // Олень и трава
      const deerHerb = evaluateFoodSuitability("herbivore", "Ароматная горная трава");
      expect(deerHerb.is_suitable).toBe(true);
      expect(deerHerb.bonus).toBeGreaterThan(0);

      // Олень и сырое мясо (испуг!)
      const deerMeat = evaluateFoodSuitability("herbivore", "Окровавленное мясо");
      expect(deerMeat.is_suitable).toBe(false);
      expect(deerMeat.bonus).toBeLessThan(0);

      // Грифон и кристалл маны
      const griffinMana = evaluateFoodSuitability("magical", "Мерцающий кристалл маны");
      expect(griffinMana.is_suitable).toBe(true);
      expect(griffinMana.bonus).toBe(5);
    });

    it("генерирует характерные клички по виду зверя", () => {
      expect(generatePetNickname("Серый волк")).toBe("Клык");
      expect(generatePetNickname("Северная рысь")).toBe("Шепот");
      expect(generatePetNickname("Бурый медведь")).toBe("Бурый");
      expect(generatePetNickname("Быстроногий олень")).toBe("Ветерок");
      expect(generatePetNickname("Пещерный грифон")).toBe("Крыло");
    });
  });

  describe("Многоступенчатое приручение и эволюция статуса (tertiary -> secondary -> main)", () => {
    const mockPlayer = {
      id: "player-1",
      name: "Влад",
      stats: { WIS: 16, CHA: 14 },
      skills: {
        taming: {
          level: 30,
          effects: { taming_check_bonus: 3, taming_bonus_pct: 15 },
        },
      },
    };

    const mockWildWolf = {
      id: "npc-wild-wolf",
      name: "Дикий волк",
      category: "beast",
      race: "Зверь",
      role: "tertiary" as const,
      level: 2,
      hp: 14,
      max_hp: 14,
      is_hostile: false,
      status_tags: ["дикий"],
    };

    it("задобряет зверя подходящей едой: получает статус secondary, кличку и тег 'приручаемый'", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { score: 10, tier: "neutral", status_tags: ["дикий"] },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: true, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: true, error: null }),
        })),
      };

      const result = await evaluatePetTamingAttempt({
        supabase: mockSupabase,
        acting_player: mockPlayer,
        target_creature: mockWildWolf,
        action_text: "Осторожно приседаю и протягиваю волку кусок сочного мяса",
        offered_item_name: "Кусок сочного мяса",
      });

      expect(result).not.toBeNull();
      expect(result?.is_taming_action).toBe(true);
      expect(result?.success).toBe(true);
      expect(result?.relationship_delta).toBeGreaterThan(0);
      expect(result?.new_role).toBe("secondary");
      expect(result?.assigned_pet_name).toBe("Клык");
      expect(result?.status_tags).toContain("приручаемый");
      expect(result?.beast_memory).toContain("Человек угостил вкусной пищей");
    });

    it("переводит зверя в ранг 'main' (полноценный питомец в отряде) при достижении высокого доверия (score >= 50)", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { score: 45, tier: "friendly", status_tags: ["приручаемый"] },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: true, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: true, error: null }),
        })),
      };

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.7);
      const result = await evaluatePetTamingAttempt({
        supabase: mockSupabase,
        acting_player: mockPlayer,
        target_creature: { ...mockWildWolf, role: "secondary", status_tags: ["приручаемый"] },
        action_text: "Глажу волка за ухом и даю лакомый кусок дичи",
        offered_item_name: "Лакомый кусок дичи",
      });
      randomSpy.mockRestore();

      expect(result).not.toBeNull();
      expect(result?.new_score).toBeGreaterThanOrEqual(50);
      expect(result?.new_role).toBe("main");
      expect(result?.status_tags).toContain("питомец");
      expect(result?.status_tags).toContain("спутник");
      expect(result?.status_tags).toContain("в_отряде");
    });


    it("дает огромный бонус к приручению при исцелении раненого зверя", async () => {
      const woundedBeast = {
        ...mockWildWolf,
        hp: 4,
        max_hp: 20,
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: true }) }),
          insert: vi.fn().mockResolvedValue({ data: true }),
        })),
      };

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.6); // d20 = 13
      const result = await evaluatePetTamingAttempt({
        supabase: mockSupabase,
        acting_player: mockPlayer,
        target_creature: woundedBeast,
        action_text: "Достаю бинты и целебную мазь, осторожно перевязываю лапу раненому зверю",
      });
      randomSpy.mockRestore();

      expect(result).not.toBeNull();
      expect(result?.beast_memory).toContain("Человек бережно обработал рану");
    });
  });

  describe("Верность, побег и бунт питомца", () => {
    const mockTamedWolf = {
      id: "pet-wolf",
      name: "Волк «Клык»",
      category: "beast",
      role: "main",
      status_tags: ["питомец", "в_отряде"],
    };

    const mockTamedDeer = {
      id: "pet-deer",
      name: "Олень «Ветерок»",
      category: "beast",
      race: "Олень",
      role: "main",
      status_tags: ["питомец", "в_отряде"],
    };

    it("хищник поднимает бунт и нападает на хозяина при падении отношений в глубокий минус", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { score: 10, tier: "wary" },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: true }),
            }),
          }),
        })),
      };

      const loyaltyResult = await evaluatePetLoyaltyCheck({
        supabase: mockSupabase,
        pet: mockTamedWolf,
        player_id: "player-1",
        harm_done_delta: -30, // критический урон отношениям (10 - 30 = -20)
      });

      expect(loyaltyResult.rebellion_action).toBe("attack");
      expect(loyaltyResult.log_message).toContain("Бунт питомца");
      expect(loyaltyResult.log_message).toContain("бросается в атаку");
    });

    it("пугливый травоядный питомец в ужасе сбегает в дикую природу при жестокости", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { score: 10, tier: "wary" },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: true }),
            }),
          }),
        })),
      };

      const loyaltyResult = await evaluatePetLoyaltyCheck({
        supabase: mockSupabase,
        pet: mockTamedDeer,
        player_id: "player-1",
        harm_done_delta: -30,
      });

      expect(loyaltyResult.rebellion_action).toBe("flee");
      expect(loyaltyResult.log_message).toContain("Побег питомца");
      expect(loyaltyResult.log_message).toContain("убегает глубоко в дикую природу");
    });
  });

  describe("Прокачка уровня питомца (1..100)", () => {
    it("начисляет опыт и повышает уровень питомца с приростом максимального HP", () => {
      const pet = {
        id: "pet-wolf",
        name: "Волк «Клык»",
        level: 1,
        xp: 60,
        hp: 15,
        max_hp: 15,
        stats: { CON: 14 },
      };

      // +50 XP переваливает за 100 XP (нужно 100 на 1 уровне)
      const res = awardPetCombatXp(pet, 50);

      expect(res.leveled_up).toBe(true);
      expect(res.new_level).toBe(2);
      expect(res.new_max_hp).toBeGreaterThan(15);
      expect(res.new_hp).toBeGreaterThan(15);
      expect(res.xp).toBe(10); // 110 - 100 = 10
    });
  });
});
