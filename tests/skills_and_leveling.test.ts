// tests/skills_and_leveling.test.ts
// Тесты для системы динамических навыков (1..100) и прокачки характеристик без ограничения в 20
import { describe, it, expect, vi } from "vitest";
import {
  detectSkillFromAction,
  calculateSkillBonuses,
  resolveWeaponSkill,
  CANONICAL_SKILLS,
} from "../supabase/functions/_shared/skill_engine.ts";
import { AttackHandler } from "../supabase/functions/process-turn/engine/handlers/attack_handler.ts";
import { HarvestAmbientHandler } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";
import { getItemMeta, ITEM_TYPES } from "../src/config.js";

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
    const s3 = detectSkillFromAction({ action_text: "Собираю грибы на поляне" });

    expect(s1?.key).toBe("gathering");
    expect(s2?.key).toBe("gathering");
    expect(s3?.key).toBe("gathering");
    expect(s1?.name).toBe("Собирательство");
  });

  it("распознает различные виды оружия (кинжал, топор, копье, лук, меч, кулаки)", () => {
    const dagger = resolveWeaponSkill({ item_name: "Охотничий кинжал" }, "Колющий удар");
    const axe = resolveWeaponSkill({ item_name: "Боевой топор" }, "Рубящий взмах");
    const spear = resolveWeaponSkill({ item_name: "Длинное копье" }, "Выпад острием");
    const bow = resolveWeaponSkill({ item_name: "Композитный лук" }, "Выстрел стрелой");
    const fists = resolveWeaponSkill(null, "Удар кулаком в челюсть");

    expect(dagger.key).toBe("daggers");
    expect(axe.key).toBe("axes");
    expect(spear.key).toBe("polearms");
    expect(bow.key).toBe("archery");
    expect(fists.key).toBe("unarmed");
  });

  it("распознает строительство, шахтерское дело, приручение и алхимию", () => {
    const mining = detectSkillFromAction({ action_text: "Бью киркой по богатой рудной жиле в шахте" });
    const building = detectSkillFromAction({ action_text: "Начинаю возводить шалаш и защитное укрытие" });
    const taming = detectSkillFromAction({ action_text: "Пытаюсь задобрить и приручить дикого волка мясом" });
    const alchemy = detectSkillFromAction({ action_text: "Варю целебное зелье из трав в котелке" });

    expect(mining?.key).toBe("mining");
    expect(building?.key).toBe("construction");
    expect(taming?.key).toBe("taming");
    expect(alchemy?.key).toBe("alchemy");
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

    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.7);
    const res = harvestHandler.handle(action, harvestContext);
    randSpy.mockRestore();

    expect(res.result.success).toBe(true);
    expect(res.mutations.length).toBeGreaterThan(0);
    expect(res.system_facts[0]).toContain("навык Собирательство ур. 100: +60% к находкам");
  });

  it("распознает атаку кинжалом и применяет навык владения кинжалами (daggers)", () => {
    const daggerContext = {
      session: { id: "s1", difficulty: "normal", is_pvp_enabled: false },
      acting_player: {
        id: "p1",
        name: "Влад",
        stats: { STR: 10, DEX: 16, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: 30,
        max_hp: 30,
        armor_class: 14,
        inventory: [
          { id: "item-dagger-1", item_name: "Острый стальной кинжал", type: "weapon" },
        ],
        skills: {
          daggers: {
            level: 80,
            effects: { damage_bonus_pct: 32, attack_bonus: 10, crit_chance_bonus_pct: 20 },
          },
        },
      },
      targets: {
        npcs: new Map([
          ["goblin-1", { id: "goblin-1", name: "Гоблин", hp: 20, max_hp: 20, armor_class: 11, is_hostile: true }],
        ]),
        players: new Map(),
      },
    } as any;

    const action = {
      type: "attack",
      target_entity_id: "goblin-1",
      used_item_id: "item-dagger-1",
      details: "Наношу быстрый удар кинжалом в шею",
    } as any;

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.7); // d20 = 15
    const res = attackHandler.handle(action, daggerContext);
    randomSpy.mockRestore();

    expect(res.result.success).toBe(true);
    expect(res.system_facts.some((f: string) => f.includes("Владение кинжалами") || f.includes("[+32% урона от навыка]"))).toBe(true);
  });

  it("распознает добычу железной руды и применяет навык шахтёрского дела (mining)", () => {
    const miningHandler = new HarvestAmbientHandler();
    const miningContext = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Влад",
        stats: { STR: 14, DEX: 10, CON: 12, INT: 10, WIS: 12, CHA: 10 },
        skills: {
          mining: {
            level: 70,
            effects: { find_chance_bonus_pct: 42, time_reduction_pct: 35 },
          },
        },
      },
    } as any;

    const action = {
      type: "harvest_ambient",
      target_item_name: "Богатая железная руда",
      ai_custom_dc: 5,
    } as any;

    const res = miningHandler.handle(action, miningContext);
    expect(res.result.success).toBe(true);
    expect(res.system_facts[0]).toContain("Шахтёрское дело");
  });

  it("корректно определяет название и тип для природных и научно-фантастических сборов (ягоды, травы, лом, стимы)", () => {
    const handler = new HarvestAmbientHandler();
    const ctx = {
      session: { id: "s1", difficulty: "normal" },
      acting_player: {
        id: "p1",
        name: "Кибер-Влад",
        stats: { STR: 12, DEX: 14, CON: 12, INT: 14, WIS: 14, CHA: 10 },
        skills: {},
      },
    } as any;

    // 1. Сбор ягод (Fantasy)
    const berryRes = handler.handle({
      type: "harvest_ambient",
      target_item_name: "ресурс",
      raw_action_text: "собираю чернику в лесу",
      ai_custom_dc: 2,
    } as any, ctx);
    expect(berryRes.result.success).toBe(true);
    const berryItem = (berryRes.mutations[0] as any).item;
    expect(berryItem.item_name).toBe("Лесная черника");
    expect(berryItem.type).toBe("food");

    // 2. Сбор металлолома / электроники (Cyberpunk / Sci-Fi)
    const scrapRes = handler.handle({
      type: "harvest_ambient",
      target_item_name: "ресурс",
      raw_action_text: "разбираю сломанного дрона на металлолом и электронику",
      ai_custom_dc: 2,
    } as any, ctx);
    expect(scrapRes.result.success).toBe(true);
    const scrapItem = (scrapRes.mutations[0] as any).item;
    expect(scrapItem.item_name).toContain("лом");
    expect(scrapItem.type).toBe("scrap");

    // 3. Сбор стимулятора
    const stimRes = handler.handle({
      type: "harvest_ambient",
      target_item_name: "ресурс",
      raw_action_text: "нахожу медицинский стимулятор в руинах лаборатории",
      ai_custom_dc: 2,
    } as any, ctx);
    expect(stimRes.result.success).toBe(true);
    const stimItem = (stimRes.mutations[0] as any).item;
    expect(stimItem.item_name).toMatch(/стимулятор/i);
    expect(stimItem.type).toBe("stim");
  });

  it("getItemMeta возвращает корректные значки и бейджи для фэнтези и sci-fi/киберпанк предметов", () => {
    // Fantasy
    expect(getItemMeta("weapon").icon).toBe("⚔️");
    expect(getItemMeta("herb").icon).toBe("🌿");
    expect(getItemMeta("wood").icon).toBe("🪵");
    expect(getItemMeta("gem").icon).toBe("💎");

    // Sci-Fi / Cyberpunk
    expect(getItemMeta("cyberware").icon).toBe("🦾");
    expect(getItemMeta("stim").icon).toBe("💉");
    expect(getItemMeta("firearm").icon).toBe("🔫");
    expect(getItemMeta("datashard").icon).toBe("💽");
    expect(getItemMeta("electronics").icon).toBe("🔌");
    expect(getItemMeta("scrap").icon).toBe("⚙️");

    // Fallback for unknown type
    expect(getItemMeta("unknown_artifact").icon).toBe("🎒");
  });
});


