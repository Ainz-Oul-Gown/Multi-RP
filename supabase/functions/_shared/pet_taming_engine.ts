// supabase/functions/_shared/pet_taming_engine.ts
// Интеллектуальная система приручения питомцев (звери и монстры)
// Эволюция: tertiary -> secondary -> main, звериные воспоминания, верность, бунт/побег и прокачка

export interface PetTamingAttemptParams {
  supabase: any;
  acting_player: {
    id: string;
    name: string;
    stats?: { STR?: number; DEX?: number; CON?: number; INT?: number; WIS?: number; CHA?: number };
    skills?: Record<string, { level: number; effects: Record<string, number> }>;
  };
  target_creature: {
    id: string;
    name: string;
    category?: string; // 'beast' | 'monster' | 'npc'
    race?: string;
    role?: string; // 'tertiary' | 'secondary' | 'main'
    level?: number;
    hp?: number;
    max_hp?: number;
    armor_class?: number;
    is_hostile?: boolean;
    status_tags?: string[];
    stats?: Record<string, number>;
  };
  action_text: string;
  offered_item_name?: string;
}

export interface PetTamingResult {
  is_taming_action: boolean;
  success: boolean;
  relationship_delta: number;
  new_score: number;
  new_tier: string;
  new_role: "tertiary" | "secondary" | "main";
  assigned_pet_name?: string;
  narrative_feedback: string;
  beast_memory?: string;
  status_tags: string[];
  became_hostile?: boolean;
  ran_away?: boolean;
}

/**
 * Определяет предпочтительную пищу существа по его названию, расе и категории
 */
export function getCreatureDiet(name: string, category = "beast", race = ""): "carnivore" | "herbivore" | "magical" | "omnivore" {
  const lower = `${name} ${race} ${category}`.toLowerCase();

  // Магические существа / монстры
  if (
    lower.includes("грифон") || lower.includes("виверн") || lower.includes("дракон") ||
    lower.includes("слизь") || lower.includes("элементал") || lower.includes("василиск") ||
    lower.includes("мантикор") || lower.includes("магическ") || category === "monster"
  ) {
    return "magical";
  }

  // Травоядные
  if (
    lower.includes("олен") || lower.includes("лан") || lower.includes("заяц") ||
    lower.includes("кролик") || lower.includes("лошад") || lower.includes("конь") ||
    lower.includes("лось") || lower.includes("коз") || lower.includes("баран") || lower.includes("овц")
  ) {
    return "herbivore";
  }

  // Всеядные
  if (lower.includes("медвед") || lower.includes("кабан") || lower.includes("енот")) {
    return "omnivore";
  }

  // Хищники по умолчанию для диких зверей (волк, лиса, рысь и т.д.)
  return "carnivore";
}

/**
 * Проверяет, подходит ли предложенный предмет/еда диете существа
 */
export function evaluateFoodSuitability(diet: "carnivore" | "herbivore" | "magical" | "omnivore", foodName: string): {
  is_suitable: boolean;
  bonus: number;
  reaction_note: string;
} {
  const lowerFood = (foodName || "").toLowerCase();
  if (!foodName) {
    return { is_suitable: false, bonus: 0, reaction_note: "без подношения пищи" };
  }

  const isMeat = /мяс|дич|рыб|окорок|тушк|кров|печен|сало|говядин|свинин/i.test(lowerFood);
  const isPlant = /трав|ягод|яблок|морков|сено|хлеб|зерн|гриб|корень|соль/i.test(lowerFood);
  const isMagical = /кристалл|эликсир|мана|эссенци|зель|светящ|магическ|аркан/i.test(lowerFood);

  if (diet === "carnivore") {
    if (isMeat) return { is_suitable: true, bonus: 4, reaction_note: "свежее мясо жадно привлекает хищника" };
    if (isPlant) return { is_suitable: false, bonus: -3, reaction_note: "хищник презрительно фыркает на растительную пищу" };
    if (isMagical) return { is_suitable: true, bonus: 2, reaction_note: "звера манит лёгкое мерцание магии" };
  }

  if (diet === "herbivore") {
    if (isPlant) return { is_suitable: true, bonus: 4, reaction_note: "сочные травы и лакомства успокаивают осторожного зверя" };
    if (isMeat) return { is_suitable: false, bonus: -4, reaction_note: "запах сырого мяса и крови пугает мирное травоядное" };
  }

  if (diet === "omnivore") {
    if (isMeat || isPlant) return { is_suitable: true, bonus: 3, reaction_note: "всеядный зверь с удовольствием принимает угощение" };
  }

  if (diet === "magical") {
    if (isMagical) return { is_suitable: true, bonus: 5, reaction_note: "магическая эссенция насыщает глубинную сущность монстра" };
    if (isMeat) return { is_suitable: true, bonus: 2, reaction_note: "монстр не прочь перекусить мясом" };
  }

  return { is_suitable: true, bonus: 1, reaction_note: "зверь осторожно принюхивается к подношению" };
}

/**
 * Генерирует благозвучную кличку питомца по виду и повадкам
 */
export function generatePetNickname(creatureName: string): string {
  const lower = creatureName.toLowerCase();
  if (lower.includes("волк")) return "Клык";
  if (lower.includes("рысь")) return "Шепот";
  if (lower.includes("медвед")) return "Бурый";
  if (lower.includes("олен")) return "Ветерок";
  if (lower.includes("лис")) return "Огонёк";
  if (lower.includes("грифон")) return "Крыло";
  if (lower.includes("виверн")) return "Шторм";
  if (lower.includes("слизь")) return "Капелька";
  return "Лютый";
}

/**
 * Интеллектуальная обработка попытки приручения зверя или монстра
 */
export async function evaluatePetTamingAttempt(params: PetTamingAttemptParams): Promise<PetTamingResult | null> {
  const { supabase, acting_player, target_creature, action_text, offered_item_name } = params;
  const lowerAction = action_text.toLowerCase();

  const isTamingIntent =
    lowerAction.includes("прируч") ||
    lowerAction.includes("корм") ||
    lowerAction.includes("угост") ||
    lowerAction.includes("протяг") ||
    lowerAction.includes("дать ед") ||
    lowerAction.includes("дать мяс") ||
    lowerAction.includes("мяс") ||
    lowerAction.includes("задобр") ||
    lowerAction.includes("глад") ||
    lowerAction.includes("успоко") ||
    lowerAction.includes("дрессир") ||
    lowerAction.includes("перевяз") ||
    lowerAction.includes("лечить") ||
    lowerAction.includes("бинтова") ||
    Boolean(offered_item_name);

  if (!isTamingIntent) return null;

  // 1. Проверяем диету и пригодность подношения
  const diet = getCreatureDiet(target_creature.name, target_creature.category, target_creature.race);
  const detectedFood = offered_item_name || (
    lowerAction.includes("мяс") ? "Кусок сырого мяса" :
    lowerAction.includes("ягод") ? "Лесные ягоды" :
    lowerAction.includes("трав") ? "Свежая трава" :
    lowerAction.includes("кристалл") ? "Кристалл маны" : ""
  );

  const foodEval = evaluateFoodSuitability(diet, detectedFood);

  // 2. Рассчитываем D&D сложность (DC)
  const baseCrDc = 10 + (target_creature.level || 1) * 2;
  let targetDc = target_creature.category === "monster" ? baseCrDc + 3 : baseCrDc;

  // Если зверь в бою и враждебен — сложнее
  if (target_creature.is_hostile) {
    targetDc += 4;
  }

  // Если зверь ранен и игрок лечит/перевязывает его — огромный плюс к успеху
  const isHealing = lowerAction.includes("перевяз") || lowerAction.includes("лечить") || lowerAction.includes("исцел");
  if (isHealing && (target_creature.hp ?? 10) < (target_creature.max_hp ?? 10)) {
    targetDc -= 5;
  }

  // 3. Бросок игрока (WIS или CHA + навык дрессировки)
  const wisMod = Math.floor(((acting_player.stats?.WIS || 10) - 10) / 2);
  const chaMod = Math.floor(((acting_player.stats?.CHA || 10) - 10) / 2);
  const statMod = Math.max(wisMod, chaMod);

  const tamingSkill = acting_player.skills?.taming;
  const tamingCheckBonus = tamingSkill?.effects?.taming_check_bonus || Math.floor((tamingSkill?.level || 0) / 10);
  const tamingPctBonus = tamingSkill?.effects?.taming_bonus_pct || 0;

  const d20 = Math.floor(Math.random() * 20) + 1;
  const isCrit = d20 === 20;

  const healingBonus = isHealing && (target_creature.hp ?? 10) < (target_creature.max_hp ?? 10) ? 6 : 0;
  const totalRoll = d20 + statMod + tamingCheckBonus + foodEval.bonus + healingBonus;
  const isSuccess = isCrit || totalRoll >= targetDc || (foodEval.is_suitable && Math.random() * 100 < tamingPctBonus);

  // 4. Загружаем или создаём запись отношений в npc_relationships
  let { data: rel } = await supabase
    .from("npc_relationships")
    .select("score, tier, status_tags")
    .eq("npc_id", target_creature.id)
    .eq("player_id", acting_player.id)
    .maybeSingle();

  let curScore = rel?.score ?? 0;
  let delta = 0;
  let beastMemory = "";
  let narrative = "";
  let becameHostile = false;
  let ranAway = false;

  if (isSuccess) {
    delta = isCrit ? 25 : (10 + (foodEval.is_suitable ? 5 : 0));
    curScore = Math.min(100, curScore + delta);

    if (isHealing) {
      beastMemory = `Человек бережно обработал рану. Боль отступила, в воздухе пахнет теплом и заботой. Человек — друг.`;
      narrative = `${acting_player.name} осторожно приближается и перевязывает рану ${target_creature.name}. Зверь тихо поскуливает, но чувствует облегчение и благодарно прижимает уши!`;
    } else if (foodEval.is_suitable) {
      beastMemory = `Человек угостил вкусной пищей (${detectedFood}). Голод отступил, агрессия угасла. Запах человека запомнился как безопасность.`;
      narrative = `${acting_player.name} аккуратно протягивает ${detectedFood}. ${target_creature.name} принюхивается, не чует угрозы и с аппетитом принимает угощение!`;
    } else {
      beastMemory = `Человек говорит мягким голосом и не проявляет злобы. Осторожный контакт налажен.`;
      narrative = `${acting_player.name} говорит спокойным, уверенным тоном. ${target_creature.name} настороженно наблюдает, но успокаивается.`;
    }
  } else {
    // Неудача
    delta = foodEval.bonus < 0 ? -15 : -5;
    curScore = Math.max(-100, curScore + delta);

    if (foodEval.bonus < 0) {
      beastMemory = `Человек принес неподходящую пищу (${detectedFood}) или сделал резкое движение. Чувство раздражения и угрозы!`;
      narrative = `${target_creature.name} сердито скалится и отталкивает ${detectedFood}! Попытка приручения вызвала раздражение.`;
      if (curScore <= -15 && target_creature.category !== "herbivore") {
        becameHostile = true;
      }
    } else {
      beastMemory = `Человек подошел слишком близко. Страх и сомнение. Зверь держит дистанцию.`;
      narrative = `${target_creature.name} пятится назад и не решается подойти ближе. Нужно больше терпения или подходящая приманка.`;
    }
  }

  // 5. Вычисляем новый тир и статус роли (tertiary -> secondary -> main)
  let newTier = "neutral";
  let newRole: "tertiary" | "secondary" | "main" = "tertiary";
  let petNickname: string | undefined = undefined;

  if (curScore >= 50) {
    newTier = curScore >= 80 ? "devoted" : "trusted";
    newRole = "main"; // ПОЛНОЦЕННЫЙ ГЛАВНЫЙ СПУТНИК!
  } else if (curScore >= 20) {
    newTier = "friendly";
    newRole = "secondary"; // ВТОРОСТЕПЕННЫЙ ПЕРСОНАЖ С ИМЕНЕМ!
  } else if (curScore <= -20) {
    newTier = "hostile";
  }

  // Если зверь перешел в secondary или main — присваиваем красивую кличку
  if (newRole !== "tertiary") {
    petNickname = generatePetNickname(target_creature.name);
  }

  // 6. Обновляем статус-теги существа
  const existingTags = Array.isArray(target_creature.status_tags) ? target_creature.status_tags : [];
  let updatedTags = [...existingTags];

  if (newRole === "main") {
    updatedTags = Array.from(new Set([...updatedTags, "питомец", "приручен", "спутник", "в_отряде"]));
    updatedTags = updatedTags.filter((t) => t !== "дикий" && t !== "агрессивный");
  } else if (newRole === "secondary") {
    updatedTags = Array.from(new Set([...updatedTags, "приручаемый", "задобрен"]));
  }

  if (becameHostile) {
    updatedTags = Array.from(new Set([...updatedTags, "в_ярости"]));
  }

  // 7. Сохраняем в базу данных
  await supabase
    .from("npcs")
    .update({
      role: newRole,
      is_hostile: becameHostile ? true : (isSuccess ? false : target_creature.is_hostile),
      status_tags: updatedTags,
      name: petNickname && newRole === "main" ? `${target_creature.name} «${petNickname}»` : target_creature.name,
    })
    .eq("id", target_creature.id);

  if (rel) {
    await supabase
      .from("npc_relationships")
      .update({
        score: curScore,
        tier: newTier,
        status_tags: updatedTags,
      })
      .eq("npc_id", target_creature.id)
      .eq("player_id", acting_player.id);
  } else {
    await supabase.from("npc_relationships").insert({
      npc_id: target_creature.id,
      player_id: acting_player.id,
      score: curScore,
      tier: newTier,
      status_tags: updatedTags,
    });
  }

  // Записываем звериное воспоминание в npc_memories
  if (beastMemory) {
    await supabase.from("npc_memories").insert({
      npc_id: target_creature.id,
      player_id: acting_player.id,
      content: beastMemory,
      importance: isSuccess ? (isCrit ? "vivid" : "ordinary") : "ordinary",
      vividness: isSuccess ? (isCrit ? 95 : 70) : 40,
    });
  }

  return {
    is_taming_action: true,
    success: isSuccess,
    relationship_delta: delta,
    new_score: curScore,
    new_tier: newTier,
    new_role: newRole,
    assigned_pet_name: petNickname,
    narrative_feedback: narrative,
    beast_memory: beastMemory,
    status_tags: updatedTags,
    became_hostile: becameHostile,
    ran_away: ranAway,
  };
}

/**
 * Проверка верности питомца при жестоком или пренебрежительном отношении игрока
 */
export async function evaluatePetLoyaltyCheck(params: {
  supabase: any;
  pet: any;
  player_id: string;
  harm_done_delta: number;
}): Promise<{
  pet_id: string;
  pet_name: string;
  score: number;
  rebellion_action: "attack" | "flee" | "sullen" | "loyal";
  log_message: string;
}> {
  const { supabase, pet, player_id, harm_done_delta } = params;

  const { data: rel } = await supabase
    .from("npc_relationships")
    .select("score, tier, status_tags")
    .eq("npc_id", pet.id)
    .eq("player_id", player_id)
    .maybeSingle();

  const oldScore = rel?.score ?? 50;
  const newScore = Math.max(-100, oldScore + harm_done_delta);

  let rebellionAction: "attack" | "flee" | "sullen" | "loyal" = "loyal";
  let logMessage = "";

  if (newScore <= -10) {
    const isPredatorOrMonster = pet.category === "monster" || getCreatureDiet(pet.name, pet.category) === "carnivore";
    if (isPredatorOrMonster) {
      rebellionAction = "attack";
      logMessage = `⚠️ [Бунт питомца!] Терпение ${pet.name} лопнуло! Зверь в ярости сбрасывает повиновение, признает вас врагом и бросается в атаку!`;
      await supabase
        .from("npcs")
        .update({
          is_hostile: true,
          role: "secondary",
          status_tags: ["в_ярости", "предательство"],
        })
        .eq("id", pet.id);
    } else {
      rebellionAction = "flee";
      logMessage = `🐾 [Побег питомца!] ${pet.name} в ужасе и обиде срывается с места и убегает глубоко в дикую природу!`;
      await supabase
        .from("npcs")
        .update({
          role: "tertiary",
          status_tags: ["сбежал", "дикий"],
        })
        .eq("id", pet.id);
    }
  } else if (newScore < 25) {
    rebellionAction = "sullen";
    logMessage = `😾 ${pet.name} обиженно рычит и держится в стороне, теряя доверие к хозяину.`;
  }

  await supabase
    .from("npc_relationships")
    .update({ score: newScore, tier: newScore <= -10 ? "hostile" : (newScore < 20 ? "wary" : "friendly") })
    .eq("npc_id", pet.id)
    .eq("player_id", player_id);

  return {
    pet_id: pet.id,
    pet_name: pet.name,
    score: newScore,
    rebellion_action: rebellionAction,
    log_message: logMessage,
  };
}

/**
 * Прокачка уровня питомца (1..100) за боевой опыт
 */
export function awardPetCombatXp(pet: any, xpGained: number): {
  new_level: number;
  leveled_up: boolean;
  new_max_hp: number;
  new_hp: number;
  xp: number;
} {
  const curLvl = pet.level || 1;
  const curXp = (pet.xp || 0) + xpGained;
  const xpNeeded = curLvl * 100;

  if (curXp >= xpNeeded && curLvl < 100) {
    const nextLvl = curLvl + 1;
    const conMod = Math.floor(((pet.stats?.CON || 12) - 10) / 2);
    const hpGain = Math.max(2, 6 + conMod); // d8 кость хитов для зверя
    const newMaxHp = (pet.max_hp || 15) + hpGain;
    const newHp = (pet.hp || 15) + hpGain;

    return {
      new_level: nextLvl,
      leveled_up: true,
      new_max_hp: newMaxHp,
      new_hp: newHp,
      xp: curXp - xpNeeded,
    };
  }

  return {
    new_level: curLvl,
    leveled_up: false,
    new_max_hp: pet.max_hp || 15,
    new_hp: pet.hp || 15,
    xp: curXp,
  };
}
