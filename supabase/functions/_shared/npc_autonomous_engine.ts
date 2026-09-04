// supabase/functions/_shared/npc_autonomous_engine.ts
// Автономность NPC: инициатива спутников в текущей сцене и долгосрочные экспедиции
// Оптимизировано по токенам (0 токенов в обычные ходы благодаря Event-driven Lazy Simulation)

export interface GameTimePoint {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function gameTimeToMinutes(t: GameTimePoint): number {
  return (
    (t.year || 1248) * 365 * 24 * 60 +
    (t.month || 1) * 30 * 24 * 60 +
    (t.day || 1) * 24 * 60 +
    (t.hour || 0) * 60 +
    (t.minute || 0)
  );
}

/**
 * Инициатива спутника в текущей сцене:
 * Если игрок занимается собирательством, обустройством лагеря или мирным делом,
 * дружелюбный NPC предлагает свою помощь, добывает предмет и делится с игроком.
 */
export async function handleCompanionInSceneAction(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  location_npcs: any[];
  session_id: string;
}): Promise<{
  npc_name: string;
  dialogue: string;
  item_obtained: string;
  action_description: string;
} | null> {
  const { supabase, player_action_text, acting_player_name, location_npcs } = params;
  if (!location_npcs || location_npcs.length === 0) return null;

  const lowerText = (player_action_text || "").toLowerCase();
  const isPeacefulWork =
    lowerText.includes("хворост") ||
    lowerText.includes("дров") ||
    lowerText.includes("костер") ||
    lowerText.includes("костёр") ||
    lowerText.includes("лагер") ||
    lowerText.includes("ягод") ||
    lowerText.includes("гриб") ||
    lowerText.includes("трав") ||
    lowerText.includes("вод") ||
    lowerText.includes("готов") ||
    lowerText.includes("еду") ||
    lowerText.includes("отдых");

  if (!isPeacefulWork) return null;

  // Ищем дружелюбного или живого разумного спутника/NPC
  const companion = location_npcs.find((n) => !n.is_hostile && n.is_alive !== false && n.role !== "hostile");
  if (!companion) return null;

  let itemToFind = "Фляга родниковой воды";
  let dialogue = `«${acting_player_name}, ты займись этим, а я пока сбегаю к ручью и наберу свежей воды!»`;
  let actionDesc = `${companion.name} отправился к ручью, наполнил флягу родниковой водой и вернулся к стоянке, предложив сделать глоток.`;

  if (lowerText.includes("вод")) {
    itemToFind = "Охапка сухих дров";
    dialogue = `«${acting_player_name}, отлично, набирай воду, а я пока соберу сухих веток для костра!»`;
    actionDesc = `${companion.name} собрал охапку сухих веток и сложил их в центре стоянки.`;
  } else if (lowerText.includes("хворост") || lowerText.includes("дров")) {
    itemToFind = "Горсть спелых лесных ягод";
    dialogue = `«${acting_player_name}, ты руби дрова, а я осмотрю кустарники на опушке — кажется, там была спелая малина!»`;
    actionDesc = `${companion.name} насобирал горсть спелых лесных ягод и угостил ${acting_player_name}.`;
  }

  // Кладём предмет в инвентарь NPC через RPC
  try {
    await supabase.rpc("add_item_to_inventory", {
      p_npc_id: companion.id,
      p_item_name: itemToFind,
      p_quantity: 1,
      p_type: "consumable",
      p_attributes: { fresh: true, collected_by: companion.name },
    });
  } catch (err) {
    console.warn("[npc_autonomous_engine] Failed to add companion item:", err);
  }

  return {
    npc_name: companion.name,
    dialogue,
    item_obtained: itemToFind,
    action_description: actionDesc,
  };
}

/**
 * Обработка приглашения NPC в спутники / путешествие / отряд.
 * Срабатывает при высоком уровне отношений (friendly, trusted, devoted или score >= 20).
 */
export async function handleCompanionInvitation(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  acting_player_id: string;
  location_npcs: any[];
}): Promise<{
  npc_id: string;
  npc_name: string;
  dialogue: string;
  joined_party: boolean;
} | null> {
  const { supabase, player_action_text, acting_player_name, acting_player_id, location_npcs } = params;
  if (!location_npcs || location_npcs.length === 0) return null;

  const lowerText = (player_action_text || "").toLowerCase();
  const isInvite =
    lowerText.includes("пойд") ||
    lowerText.includes("следуй") ||
    lowerText.includes("вместе") ||
    lowerText.includes("в отряд") ||
    lowerText.includes("в путешеств") ||
    lowerText.includes("на охоту");

  if (!isInvite) return null;

  // Ищем дружелюбного живого NPC
  const candidate = location_npcs.find((n) => {
    if (n.is_hostile || n.is_alive === false) return false;
    if (n.name && lowerText.includes(n.name.toLowerCase())) return true;
    return true;
  });

  if (!candidate) return null;

  // Проверяем отношения с игроком в npc_relationships
  const { data: rel } = await supabase
    .from("npc_relationships")
    .select("score, tier, status_tags")
    .eq("npc_id", candidate.id)
    .eq("player_id", acting_player_id)
    .maybeSingle();

  const score = rel?.score ?? 0;
  const tier = rel?.tier ?? "neutral";
  const isGoodRelationship = score >= 20 || ["friendly", "trusted", "devoted"].includes(tier);

  if (!isGoodRelationship) {
    return {
      npc_id: candidate.id,
      npc_name: candidate.name,
      dialogue: `«${acting_player_name}, мы пока ещё недостаточно близки, чтобы я отправлялась с тобой в опасный путь. Нам стоит получше узнать друг друга.»`,
      joined_party: false,
    };
  }

  // NPC соглашается стать спутником и присоединиться к отряду!
  const currentTags = Array.isArray(candidate.status_tags) ? candidate.status_tags : [];
  const updatedTags = Array.from(new Set([...currentTags, "спутник", "в_отряде"]));

  await supabase
    .from("npcs")
    .update({
      role: "companion",
      status_tags: updatedTags,
    })
    .eq("id", candidate.id);

  if (rel) {
    const relTags = Array.from(new Set([...(rel.status_tags || []), "спутник", "в_отряде"]));
    await supabase
      .from("npc_relationships")
      .update({ status_tags: relTags })
      .eq("npc_id", candidate.id)
      .eq("player_id", acting_player_id);
  }

  return {
    npc_id: candidate.id,
    npc_name: candidate.name,
    dialogue: `«С удовольствием пойду с тобой, ${acting_player_name}! Вместе мы преодолеем любые опасности и одолеем любую тварь на нашем пути.»`,
    joined_party: true,
  };
}

/**
 * Разрешает долгосрочные экспедиции NPC за кадром (Lazy Resolution по календарю).
 * Срабатывает, когда игровое время дошло до activity_ends_game_time.
 * Тратит 0 токенов во время обычных ходов!
 */
export async function resolveNpcBackgroundActivities(params: {
  supabase: any;
  world_id: string;
  current_game_time: GameTimePoint;
}): Promise<Array<{
  npc_id: string;
  npc_name: string;
  summary: string;
  loot: string[];
  xp_gained: number;
  leveled_up: boolean;
  new_level: number;
}>> {
  const { supabase, world_id, current_game_time } = params;
  if (!world_id) return [];

  const currentMinutes = gameTimeToMinutes(current_game_time);

  // Находим NPC мира, у которых есть незавершённая деятельность
  const { data: activeNpcs, error } = await supabase
    .from("npcs")
    .select("id, name, race, role, level, xp, stats, current_activity, activity_data, location_id")
    .eq("world_id", world_id)
    .not("current_activity", "is", null);

  if (error || !activeNpcs || activeNpcs.length === 0) {
    return [];
  }

  const results: any[] = [];

  for (const npc of activeNpcs) {
    const actData = npc.activity_data || {};
    const endsTime = actData.ends_game_time;
    if (!endsTime) continue;

    const endsMinutes = gameTimeToMinutes(endsTime);

    // Если срок экспедиции ещё не подошёл — пропускаем (0 токенов, 0 лишних действий)
    if (currentMinutes < endsMinutes) {
      continue;
    }

    // Время экспедиции завершилось! Начисляем результаты
    const daysDuration = actData.duration_days || 3;
    const xpGained = daysDuration * 50; // 50 XP за день охоты/тренировки
    const newXp = (npc.xp || 0) + xpGained;
    const xpForLevel = (npc.level || 1) * 100;
    const leveledUp = newXp >= xpForLevel && (npc.level || 1) < 100;
    const newLevel = leveledUp ? (npc.level || 1) + 1 : (npc.level || 1);

    const lootItems = actData.expected_loot || [
      "Шкура взрослого оленя",
      "Свежая дичь (3 порции)",
      "Клыки лесного волка",
    ];

    // Добавляем трофеи в инвентарь NPC
    for (const item of lootItems) {
      try {
        await supabase.rpc("add_item_to_inventory", {
          p_npc_id: npc.id,
          p_item_name: item,
          p_quantity: 1,
          p_type: "misc",
          p_attributes: { obtained_from_hunt: true },
        });
      } catch (itemErr) {
        console.warn(`[npc_autonomous_engine] Failed to add loot item ${item}:`, itemErr);
      }
    }

    const returnLocationId = actData.origin_location_id || npc.location_id;
    const memoryText = `Завершила долгосрочную экспедицию (${npc.current_activity}, ${daysDuration} дн.). Добыто: ${lootItems.join(", ")}. Получено ${xpGained} опыта${leveledUp ? `, новый уровень ${newLevel}!` : "."}`;

    // Записываем воспоминание NPC о походе
    try {
      await supabase.from("npc_memories").insert({
        npc_id: npc.id,
        player_id: actData.associated_player_id || null,
        memory_text: memoryText,
        vividness: 8,
        tier: "vivid",
        emotional_tone: "positive",
        significance_reason: "Успешная автономная охота и прокачка навыков",
      });
    } catch (memErr) {
      console.warn("[npc_autonomous_engine] Failed to insert hunt memory:", memErr);
    }

    // Обновляем NPC: очищаем деятельность, сохраняем уровень, статы и возвращаем в локацию
    const updatedStats = { ...(npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }) };
    if (leveledUp) {
      // Авто-распределение статов в зависимости от расы/роли
      updatedStats.STR = (updatedStats.STR || 10) + 1;
      updatedStats.DEX = (updatedStats.DEX || 10) + 1;
    }

    await supabase
      .from("npcs")
      .update({
        level: newLevel,
        xp: leveledUp ? newXp - xpForLevel : newXp,
        stats: updatedStats,
        location_id: returnLocationId,
        current_activity: null,
        activity_data: null,
        last_activity_time: new Date().toISOString(),
      })
      .eq("id", npc.id);

    results.push({
      npc_id: npc.id,
      npc_name: npc.name,
      summary: memoryText,
      loot: lootItems,
      xp_gained: xpGained,
      leveled_up: leveledUp,
      new_level: newLevel,
    });
  }

  return results;
}
