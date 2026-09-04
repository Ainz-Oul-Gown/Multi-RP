// supabase/functions/_shared/skill_engine.ts
// Система динамических навыков игрока (1..100)
// Канонический реестр, нормализация алиасов без дублей, расчёт бонусов

export interface SkillDefinition {
  key: string;
  name: string;
  description: string;
  statAffinity: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
}

export const CANONICAL_SKILLS: Record<string, SkillDefinition> = {
  swordsmanship: {
    key: "swordsmanship",
    name: "Владение мечом",
    description: "Мастерство боя холодным оружием. Увеличивает урон и точность ударов клинком.",
    statAffinity: "STR",
  },
  archery: {
    key: "archery",
    name: "Стрельба из лука",
    description: "Меткость и владение стрелковым оружием. Увеличивает урон на дистанции и шанс попадания.",
    statAffinity: "DEX",
  },
  gathering: {
    key: "gathering",
    name: "Собирательство",
    description: "Умение находить травы, ягоды, грибы, древесину и руду. Повышает шанс редких находок и ускоряет сбор.",
    statAffinity: "WIS",
  },
  leatherworking: {
    key: "leatherworking",
    name: "Кожевничество",
    description: "Снятие шкур, выделка кож и создание кожаной экипировки.",
    statAffinity: "DEX",
  },
  crafting: {
    key: "crafting",
    name: "Кузнечное дело и ремесло",
    description: "Ковка, починка и улучшение металлических предметов и инструментов.",
    statAffinity: "STR",
  },
  stealth: {
    key: "stealth",
    name: "Скрытность",
    description: "Бесшумное передвижение, маскировка и подготовка внезапных атак из засады.",
    statAffinity: "DEX",
  },
  survival: {
    key: "survival",
    name: "Выживание",
    description: "Ориентирование в диких землях, обустройство лагеря и эффективность отдыха.",
    statAffinity: "CON",
  },
  persuasion: {
    key: "persuasion",
    name: "Красноречие",
    description: "Умение договариваться, убеждать NPC и торговаться за выгодные цены.",
    statAffinity: "CHA",
  },
  medicine: {
    key: "medicine",
    name: "Медицина и первая помощь",
    description: "Лечение травм, перевязка ран и изготовление базовых лечебных припарок.",
    statAffinity: "WIS",
  },
  magic: {
    key: "magic",
    name: "Магия и аркана",
    description: "Управление потоками маны, чтение свитков и сотворение заклинаний.",
    statAffinity: "INT",
  },
};

// ============================================
// Нормализатор синонимов (защита от дубликатов)
// ============================================
const SKILL_ALIASES: Record<string, string> = {
  // Кожевничество
  "заготовка кожи": "leatherworking",
  "заготовка_кожи": "leatherworking",
  "снятие шкур": "leatherworking",
  "снятие_шкур": "leatherworking",
  "кожевное дело": "leatherworking",
  "выделка": "leatherworking",
  "кожа": "leatherworking",

  // Собирательство
  "сбор ягод": "gathering",
  "сбор грибов": "gathering",
  "сбор трав": "gathering",
  "сбор руды": "gathering",
  "рубка дров": "gathering",
  "сбор хвороста": "gathering",
  "травы": "gathering",
  "поиск ресурсов": "gathering",
  "собирание": "gathering",

  // Владение оружием
  "фехтование": "swordsmanship",
  "рубка": "swordsmanship",
  "клинок": "swordsmanship",
  "меч": "swordsmanship",
  "нож": "swordsmanship",

  // Стрельба
  "стрельба": "archery",
  "лук": "archery",
  "арбалет": "archery",
  "меткость": "archery",

  // Кузнечное дело
  "кузнец": "crafting",
  "ковка": "crafting",
  "ремонт": "crafting",
  "ремесло": "crafting",

  // Скрытность
  "прятаться": "stealth",
  "маскировка": "stealth",
  "засада": "stealth",

  // Дипломатия
  "торговля": "persuasion",
  "дипломатия": "persuasion",
  "убеждение": "persuasion",
  "обман": "persuasion",

  // Медицина
  "лечение": "medicine",
  "перевязка": "medicine",
  "врачевание": "medicine",
  "первая помощь": "medicine",
};

/**
 * Нормализует произвольную строку в канонический skill_key
 */
export function normalizeSkillKey(raw: string): string {
  if (!raw) return "gathering";
  const cleaned = raw.toLowerCase().trim();

  if (CANONICAL_SKILLS[cleaned]) {
    return cleaned;
  }

  if (SKILL_ALIASES[cleaned]) {
    return SKILL_ALIASES[cleaned];
  }

  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    if (cleaned.includes(alias)) {
      return canonical;
    }
  }

  return "gathering";
}

/**
 * Автоматически определяет, какой навык развивает действие игрока
 */
export function detectSkillFromAction(params: {
  action_type: string;
  action_text?: string;
  used_item_name?: string;
  skill_hint?: string;
}): { key: string; name: string } | null {
  const { action_type, action_text = "", used_item_name = "", skill_hint } = params;
  const lowerText = `${action_text} ${used_item_name}`.toLowerCase();

  if (skill_hint) {
    const canonical = normalizeSkillKey(skill_hint);
    if (CANONICAL_SKILLS[canonical]) {
      return { key: canonical, name: CANONICAL_SKILLS[canonical].name };
    }
  }

  if (action_type === "attack" || action_type === "stealth_attack" || lowerText.includes("атак") || lowerText.includes("меч") || lowerText.includes("клинок") || lowerText.includes("фехтован") || lowerText.includes("удар")) {
    if (lowerText.includes("лук") || lowerText.includes("арбалет") || lowerText.includes("стрел")) {
      return { key: "archery", name: CANONICAL_SKILLS.archery.name };
    }
    if (lowerText.includes("заклинани") || lowerText.includes("маги") || lowerText.includes("фаербол")) {
      return { key: "magic", name: CANONICAL_SKILLS.magic.name };
    }
    return { key: "swordsmanship", name: CANONICAL_SKILLS.swordsmanship.name };
  }

  if (lowerText.includes("лук") || lowerText.includes("арбалет") || lowerText.includes("стрел")) {
    return { key: "archery", name: CANONICAL_SKILLS.archery.name };
  }

  if (action_type === "harvest_ambient" || action_type === "search" || lowerText.includes("хворост") || lowerText.includes("дров") || lowerText.includes("ягод") || lowerText.includes("гриб") || lowerText.includes("трав") || lowerText.includes("руд")) {
    return { key: "gathering", name: CANONICAL_SKILLS.gathering.name };
  }

  if (lowerText.includes("кож") || lowerText.includes("шкур")) {
    return { key: "leatherworking", name: CANONICAL_SKILLS.leatherworking.name };
  }

  if (action_type === "craft_recipe" || action_type === "craft_custom" || lowerText.includes("кузн") || lowerText.includes("ковать") || lowerText.includes("чинить")) {
    return { key: "crafting", name: CANONICAL_SKILLS.crafting.name };
  }

  if (lowerText.includes("крад") || lowerText.includes("пряч") || lowerText.includes("скрыт")) {
    return { key: "stealth", name: CANONICAL_SKILLS.stealth.name };
  }

  if (action_type === "talk" && (lowerText.includes("торгов") || lowerText.includes("убед") || lowerText.includes("скидк"))) {
    return { key: "persuasion", name: CANONICAL_SKILLS.persuasion.name };
  }

  if (lowerText.includes("перевяз") || lowerText.includes("лечить") || lowerText.includes("ран")) {
    return { key: "medicine", name: CANONICAL_SKILLS.medicine.name };
  }

  return null;
}

/**
 * Рассчитывает процентные и числовые бонусы от уровня навыка (1..100)
 */
export function calculateSkillBonuses(skillKey: string, level: number): Record<string, number> {
  const safeLvl = Math.max(1, Math.min(100, Number(level) || 1));

  switch (skillKey) {
    case "swordsmanship":
      return {
        damage_bonus_pct: Math.floor(safeLvl * 0.5), // До +50% урона на 100 уровне
        attack_bonus: Math.floor(safeLvl / 10),     // +1 к попаданию за каждые 10 уровней
      };
    case "archery":
      return {
        ranged_damage_pct: Math.floor(safeLvl * 0.5),
        accuracy_bonus: Math.floor(safeLvl / 8),
      };
    case "gathering":
      return {
        find_chance_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)), // До +60% шанса
        time_reduction_pct: Math.min(50, Math.floor(safeLvl * 0.5)),    // До -50% времени поиска
      };
    case "leatherworking":
    case "crafting":
      return {
        craft_quality_bonus_pct: Math.floor(safeLvl * 0.5),
        durability_preservation_pct: Math.floor(safeLvl * 0.4),
      };
    case "stealth":
      return {
        stealth_check_bonus: Math.floor(safeLvl / 5), // До +20 к проверке скрытности
        sneak_attack_bonus_dice: safeLvl >= 50 ? 2 : 1,
      };
    case "persuasion":
      return {
        discount_pct: Math.min(30, Math.floor(safeLvl * 0.3)), // До -30% цен в лавках
        persuasion_check_bonus: Math.floor(safeLvl / 5),
      };
    case "medicine":
      return {
        heal_bonus_hp: Math.floor(safeLvl / 10),
        injury_recovery_speed_pct: Math.min(50, Math.floor(safeLvl * 0.5)),
      };
    case "magic":
      return {
        spell_damage_bonus_pct: Math.floor(safeLvl * 0.5),
        mana_cost_reduction_pct: Math.min(30, Math.floor(safeLvl * 0.3)),
      };
    default:
      return {
        bonus_pct: safeLvl,
      };
  }
}
