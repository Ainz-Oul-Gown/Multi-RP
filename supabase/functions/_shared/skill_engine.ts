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
  daggers: {
    key: "daggers",
    name: "Владение кинжалами",
    description: "Быстрые точные удары кинжалами и ножами. Увеличивает шанс критического удара, меткость и урон.",
    statAffinity: "DEX",
  },
  axes: {
    key: "axes",
    name: "Владение топорами",
    description: "Сокрушительные рубящие удары топорами и секирами. Пробивает броню и увеличивает урон.",
    statAffinity: "STR",
  },
  polearms: {
    key: "polearms",
    name: "Древковое оружие",
    description: "Удары копьями, пиками и алебардами. Позволяет удерживать врагов на дистанции.",
    statAffinity: "STR",
  },
  unarmed: {
    key: "unarmed",
    name: "Рукопашный бой",
    description: "Удары кулаками, пинки, броски и захваты. Увеличивает урон без оружия и шанс оглушения.",
    statAffinity: "STR",
  },
  mining: {
    key: "mining",
    name: "Шахтёрское дело",
    description: "Добыча руды, драгоценных камней и минералов. Сокращает время раскопок и повышает выход ценных ископаемых.",
    statAffinity: "STR",
  },
  construction: {
    key: "construction",
    name: "Строительство",
    description: "Возведение укреплений, шалашей, ловушек и ремонт построек. Повышает прочность созданных конструкций.",
    statAffinity: "STR",
  },
  taming: {
    key: "taming",
    name: "Приручение и дрессировка",
    description: "Понимание повадок зверей и монстров, завоевание их доверия и обучение командам.",
    statAffinity: "WIS",
  },
  alchemy: {
    key: "alchemy",
    name: "Алхимия",
    description: "Приготовление целебных зелий, ядов и алхимических экстрактов из трав и реагентов.",
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
  "рубка дров": "gathering",
  "сбор хвороста": "gathering",
  "травы": "gathering",
  "поиск ресурсов": "gathering",
  "собирание": "gathering",

  // Шахтёрское / горное дело
  "сбор руды": "mining",
  "шахтерское дело": "mining",
  "горное дело": "mining",
  "добыча руды": "mining",
  "рудокоп": "mining",
  "кирка": "mining",
  "рудная жила": "mining",
  "копать руду": "mining",
  "шахта": "mining",

  // Строительство
  "строительство": "construction",
  "постройка": "construction",
  "строить": "construction",
  "шалаш": "construction",
  "укрытие": "construction",
  "баррикада": "construction",
  "возведение": "construction",

  // Приручение и дрессировка
  "приручение": "taming",
  "дрессировка": "taming",
  "приручить": "taming",
  "задобрить": "taming",
  "покормить зверя": "taming",
  "успокоить зверя": "taming",
  "питомец": "taming",

  // Алхимия
  "алхимия": "alchemy",
  "зельеварение": "alchemy",
  "зелье": "alchemy",
  "отвар": "alchemy",
  "приготовить зелье": "alchemy",

  // Мечи
  "фехтование": "swordsmanship",
  "рубка": "swordsmanship",
  "клинок": "swordsmanship",
  "меч": "swordsmanship",

  // Кинжалы и ножи
  "кинжал": "daggers",
  "нож": "daggers",
  "стилет": "daggers",
  "кортик": "daggers",
  "дага": "daggers",

  // Топоры
  "топор": "axes",
  "секира": "axes",
  "колун": "axes",

  // Древковое оружие
  "копье": "polearms",
  "копьё": "polearms",
  "пика": "polearms",
  "алебарда": "polearms",

  // Рукопашный бой
  "рукопашный бой": "unarmed",
  "кулачный бой": "unarmed",
  "кулак": "unarmed",
  "кулаки": "unarmed",
  "пинок": "unarmed",
  "борьба": "unarmed",

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
 * Определяет боевой навык по экипированному оружию и тексту действия
 */
export function resolveWeaponSkill(weapon: any, actionText = ""): { key: string; name: string } {
  const itemName = (weapon?.item_name || weapon?.name || "").toLowerCase();
  const text = `${actionText} ${itemName}`.toLowerCase();

  if (text.includes("кинжал") || text.includes("нож") || text.includes("стилет") || text.includes("кортик") || text.includes("дага")) {
    return { key: "daggers", name: CANONICAL_SKILLS.daggers.name };
  }
  if (text.includes("топор") || text.includes("секира") || text.includes("колун")) {
    return { key: "axes", name: CANONICAL_SKILLS.axes.name };
  }
  if (text.includes("копь") || text.includes("пик") || text.includes("алебард") || text.includes("трезубец")) {
    return { key: "polearms", name: CANONICAL_SKILLS.polearms.name };
  }
  if (text.includes("лук") || text.includes("арбалет") || text.includes("стрел")) {
    return { key: "archery", name: CANONICAL_SKILLS.archery.name };
  }
  if (text.includes("кулак") || text.includes("рукопаш") || text.includes("пинок") || text.includes("борьб") || (!weapon && (text.includes("удар рукой") || text.includes("ногой")))) {
    return { key: "unarmed", name: CANONICAL_SKILLS.unarmed.name };
  }
  if (text.includes("заклинани") || text.includes("маги") || text.includes("посох") || text.includes("свиток") || text.includes("фаербол")) {
    return { key: "magic", name: CANONICAL_SKILLS.magic.name };
  }
  return { key: "swordsmanship", name: CANONICAL_SKILLS.swordsmanship.name };
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

  // Приручение и взаимодействие с животными
  if (lowerText.includes("прируч") || lowerText.includes("дрессир") || lowerText.includes("задобрить") || lowerText.includes("покормить зверя") || lowerText.includes("погладить зверя") || lowerText.includes("успокоить зверя") || lowerText.includes("питомец")) {
    return { key: "taming", name: CANONICAL_SKILLS.taming.name };
  }

  // Боевые действия и оружие
  if (action_type === "attack" || action_type === "stealth_attack" || lowerText.includes("атак") || lowerText.includes("удар") || lowerText.includes("рубить") || lowerText.includes("колоть") || lowerText.includes("стрелять")) {
    if (lowerText.includes("кинжал") || lowerText.includes("нож") || lowerText.includes("стилет") || lowerText.includes("кортик")) {
      return { key: "daggers", name: CANONICAL_SKILLS.daggers.name };
    }
    if (lowerText.includes("топор") || lowerText.includes("секира") || lowerText.includes("колун")) {
      return { key: "axes", name: CANONICAL_SKILLS.axes.name };
    }
    if (lowerText.includes("копь") || lowerText.includes("пик") || lowerText.includes("алебард")) {
      return { key: "polearms", name: CANONICAL_SKILLS.polearms.name };
    }
    if (lowerText.includes("лук") || lowerText.includes("арбалет") || lowerText.includes("стрел")) {
      return { key: "archery", name: CANONICAL_SKILLS.archery.name };
    }
    if (lowerText.includes("кулак") || lowerText.includes("рукопаш") || lowerText.includes("пинок") || lowerText.includes("борьб")) {
      return { key: "unarmed", name: CANONICAL_SKILLS.unarmed.name };
    }
    if (lowerText.includes("заклинани") || lowerText.includes("маги") || lowerText.includes("фаербол")) {
      return { key: "magic", name: CANONICAL_SKILLS.magic.name };
    }
    return { key: "swordsmanship", name: CANONICAL_SKILLS.swordsmanship.name };
  }

  // Шахтёрское дело (руда, жила, кирка, камень)
  if (lowerText.includes("шахт") || lowerText.includes("руд") || lowerText.includes("жила") || lowerText.includes("кирка") || lowerText.includes("копать камень")) {
    return { key: "mining", name: CANONICAL_SKILLS.mining.name };
  }

  // Строительство
  if (lowerText.includes("строит") || lowerText.includes("постройк") || lowerText.includes("шалаш") || lowerText.includes("укрыти") || lowerText.includes("баррикад") || lowerText.includes("возвести")) {
    return { key: "construction", name: CANONICAL_SKILLS.construction.name };
  }

  // Алхимия
  if (lowerText.includes("алхим") || lowerText.includes("зель") || lowerText.includes("отвар") || lowerText.includes("дистилл")) {
    return { key: "alchemy", name: CANONICAL_SKILLS.alchemy.name };
  }

  // Собирательство (природа, лес, ягоды, хворост)
  if (action_type === "harvest_ambient" || action_type === "search" || lowerText.includes("хворост") || lowerText.includes("дров") || lowerText.includes("ягод") || lowerText.includes("гриб") || lowerText.includes("трав")) {
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
    case "daggers":
      return {
        damage_bonus_pct: Math.floor(safeLvl * 0.4),
        attack_bonus: Math.floor(safeLvl / 8),
        crit_chance_bonus_pct: Math.min(25, Math.floor(safeLvl * 0.25)), // до +25% крита
      };
    case "axes":
      return {
        damage_bonus_pct: Math.floor(safeLvl * 0.6), // Мощный урон до +60%
        attack_bonus: Math.floor(safeLvl / 12),
        armor_pen_bonus: Math.floor(safeLvl / 10),
      };
    case "polearms":
      return {
        damage_bonus_pct: Math.floor(safeLvl * 0.5),
        attack_bonus: Math.floor(safeLvl / 10),
      };
    case "unarmed":
      return {
        damage_bonus_pct: Math.floor(safeLvl * 0.5),
        attack_bonus: Math.floor(safeLvl / 10),
        stun_chance_pct: Math.min(30, Math.floor(safeLvl * 0.3)),
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
    case "mining":
      return {
        find_chance_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)),
        ore_yield_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)),
        time_reduction_pct: Math.min(50, Math.floor(safeLvl * 0.5)),
      };
    case "construction":
      return {
        structure_hp_bonus_pct: Math.floor(safeLvl * 0.8),
        time_reduction_pct: Math.min(50, Math.floor(safeLvl * 0.4)),
        craft_quality_bonus_pct: Math.floor(safeLvl * 0.5),
      };
    case "taming":
      return {
        taming_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)), // До +60% к шансу приручения
        taming_check_bonus: Math.floor(safeLvl / 10),
        pet_stat_bonus: Math.floor(safeLvl / 20),
      };
    case "alchemy":
      return {
        potion_potency_pct: Math.floor(safeLvl * 0.5),
        craft_quality_bonus_pct: Math.floor(safeLvl * 0.5),
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
      // Универсальный фоллбэк для любых динамически генерируемых навыков
      return {
        bonus_pct: safeLvl,
        check_bonus: Math.floor(safeLvl / 10),
        damage_bonus_pct: Math.floor(safeLvl * 0.5),
        find_chance_bonus_pct: Math.min(50, Math.floor(safeLvl * 0.5)),
        time_reduction_pct: Math.min(40, Math.floor(safeLvl * 0.4)),
      };
  }
}
