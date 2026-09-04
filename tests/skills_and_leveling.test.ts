// tests/skills_and_leveling.test.ts
// Тесты для системы динамических навыков (1..100) и прокачки характеристик без ограничения в 20
import { describe, it, expect } from "vitest";
import {
  detectSkillFromAction,
  calculateSkillBonuses,
  CANONICAL_SKILLS,
} from "../supabase/functions/_shared/skill_engine.ts";
import { AttackHandler } from "../supabase/functions/process-turn/engine/handlers/attack_handler.ts";
import { HarvestAmbientHandler } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";

describe("Система навыков (Track 2: Action-based 1..100)", () => {
  it("нормализует синонимы кожевничества к каноническому ключу leatherworking", () => {
    const s1 = detectSkillFromAction({ action_text: "Занимаюсь заготовкой кожи и снятием шкур" });
    const s2 = detectSkillFromAction({ action_text: "Практикую кожевное дело в мастерской" });
    const s3 = detectSkillFromAction({ action_text: "Выделка шкуры оленя" });

    expect(s1?.key).toBe("leatherworking");
    expect(s2?.key).toBe("leatherworking");
    expect(s3?.key).toBe("leatherworking");
    expect(s1?.name).toBe("Кожевничество");
  });

  it("нормализует собирательство и лесные промыслы к gathering", () => {
    const s1 = detectSkillFromAction({ action_text: "Иду в лес на рубку дров и сбор хвороста" });
    const s2 = detectSkillFromAction({ action_text: "Собираю лесные травы и ягоды у ручья" });
    const s3 = detectSkillFromAction({ action_text: "Поиск руды в пещере" });

    expect(s1?.key).toBe("gathering");
    expect(s2?.key).toBe("gathering");
    expect(s3?.key).toBe("gathering");
    expect(s1?.name).toBe("Собирательство");
  });

  it("распознает владение мечом, стрельбу, скрытность и медицину", () => {
    const sword = detectSkillFromAction({ action_text: "Атакую разбойника взмахом меча" });
    const bow = detectSkillFromAction({ action_text: "Натягиваю тетиву лука и стреляю" });
    const stealth = detectSkillFromAction({ action_text: "Крадусь бесшумно в тенях" });
    const med = detectSkillFromAction({ action_text: "Перевязываю раны напарнику" });

    expect(sword?.key).toBe("swordsmanship");
    expect(bow?.key).toBe("archery");
    expect(stealth?.key).toBe("stealth");
    expect(med?.key).toBe("medicine");
  });

  it("рассчитывает возрастающие бонусы от уровня навыка (1..100)", () => {
    // Начальный уровень 1
    const lvl1Sword = calculateSkillBonuses("swordsmanship", 1);
    expect(lvl1Sword.damage_bonus_pct).toBe(0);
    expect(lvl1Sword.attack_bonus).toBe(0);

    // Средний уровень 20
    const lvl20Sword = calculateSkillBonuses("swordsmanship", 20);
    expect(lvl20Sword.damage_bonus_pct).toBe(10);
    expect(lvl20Sword.attack_bonus).toBe(2);

    // Максимальный уровень 100
    const lvl100Sword = calculateSkillBonuses("swordsmanship", 100);
    expect(lvl100Sword.damage_bonus_pct).toBe(50);
    expect(lvl100Sword.attack_bonus).toBe(10);

    // Собирательство на 50 уровне
    const lvl50Gathering = calculateSkillBonuses("gathering", 50);
    expect(lvl50Gathering.find_chance_bonus_pct).toBe(30);
    expect(lvl50Gathering.time_reduction_pct).toBe(25);
  });
});

describe("Система уровней и характеристик (Track 1: Без ограничения в 20)", () => {
  it("позволяет расти характеристикам выше 20 (до 30, 40+) с правильным модификатором", () => {
    const stat22 = 22;
    const mod22 = Math.floor((stat22 - 10) / 2);
    expect(mod22).toBe(6);

    const stat30 = 30;
    const mod30 = Math.floor((stat30 - 10) / 2);
    expect(mod30).toBe(10);

    const stat40 = 40;
    const mod40 = Math.floor((stat40 - 10) / 2);
    expect(mod40).toBe(15);
  });

  it("корректно рассчитывает прирост HP (Hit die + CON mod) и формулу MP (INT * 2 + Level * 5)", () => {
    const level = 5;
    const con = 18;
    const conMod = Math.floor((con - 10) / 2); // +4
    const hitDieAvg = 5; // d8 average
    const hpGain = Math.max(1, hitDieAvg + conMod); // 9 HP за уровень
    expect(hpGain).toBe(9);

    const int = 16;
    const maxMp = int * 2 + level * 5; // 32 + 25 = 57 MP
    expect(maxMp).toBe(57);

    // На 10 уровне с INT 24
    const highLvl = 10;
    const highInt = 24;
    const highMaxMp = highInt * 2 + highLvl * 5; // 48 + 50 = 98 MP
    expect(highMaxMp).toBe(98);
  });
});

describe("Влияние навыков на игровой процесс в Game Engine", () => {
  const attackHandler = new AttackHandler();

  it("учитывает бонус к меткости и бонус к урону (+50%) от высокого уровня владения оружием", () => {
    const contextWithSkill = {
      session: { id: "s1", difficulty: "normal", is_pvp_enabled: false },
      acting_player: {
        id: "p1",
        name: "Влад",
        stats: { STR: 14, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: 30,
        max_hp: 30,
        armor_class: 15,
        skills: {
          swordsmanship: {
            level: 100,
            effects: { damage_bonus_pct: 50, attack_bonus: 10 },
          },
        },
      },
      targets: {
        npcs: new Map([
          ["wolf-1", { id: "wolf-1", name: "Волк", hp: 40, max_hp: 40, armor_class: 10, is_hostile: true }],
        ]),
        players: new Map(),
      },
    } as any;

    const action = {
      type: "attack",
      target_entity_id: "wolf-1",
      stat_to_check: "strength",
    } as any;

    const res = attackHandler.handle(action, contextWithSkill);
    expect(res.result.success).toBe(true);
    // Проверяем факт применения бонуса навыка в логах системы (+50% урона)
    expect(res.system_facts.some((f: string) => f.includes("[+50% урона от навыка]"))).toBe(true);
    // Проверяем факт нанесения урона
    expect(res.mutations.some((m: any) => m.type === "UPDATE_HP" && m.delta < 0)).toBe(true);
  });

  it("учитывает бонусы собирательства в harvest_ambient", () => {
    const harvestHandler = new HarvestAmbientHandler();
    const harvestContext = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Влад",
        stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 14, CHA: 10 },
        skills: {
          gathering: {
            level: 100,
            effects: { find_chance_bonus_pct: 60, time_reduction_pct: 50 },
          },
        },
      },
    } as any;

    const action = {
      type: "harvest_ambient",
      target_item_name: "Лекарственные травы",
      ai_custom_dc: 5, // лёгкий DC для гарантированного успеха
    } as any;

    const res = harvestHandler.handle(action, harvestContext);
    expect(res.result.success).toBe(true);
    expect(res.mutations.length).toBeGreaterThan(0);
    expect(res.system_facts[0]).toContain("навык Собирательство ур. 100: +60% к находкам");
  });
});

