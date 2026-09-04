// supabase/functions/process-turn/steps/step4_system_truth.ts
// Шаг 4: Сборка Системной Истины (System Truth Compiler)
//
// Принимает:
//   - EngineOutputPayload (Шаг 2: кубики и проверки)
//   - PersistenceOutputPayload (Шаг 3: подтверждено БД)
//   - session, location, players, npcs, items
//
// Назначение:
//   1. Скомпилировать строгий SystemTruthDto для Шага 5 (LLM-нарратор).
//   2. Разделить события по персональным корзинам видимости (Туман Войны / Anti-Metagaming).
//   3. Подтянуть RAG-память NPC (match_npc_memories) только для тех NPC, с которыми игрок взаимодействовал.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EngineOutputPayload, EngineMutation } from "../engine/types.ts";
import {
  calculateRelationshipTier,
  getRelationshipTierLabel,
  RelationshipTier,
} from "../../_shared/npc_relationship_engine.ts";

// ============================================
// Типы
// ============================================

export interface PlayerKnowledge {
  player_id: string;
  knowledge: string[]; // Только то, что видит ЭТОТ игрок
  hp_status: {
    current: number;
    max: number;
    delta: number;
  };
  inventory_delta: {
    added: string[];
    removed: string[];
    damaged: string[];
  };
}

export interface NpcContextSummary {
  npc_id: string;
  name: string;
  race?: string;
  role?: string;
  status_tags?: string[];
  relationship_score?: number;
  relationship_tier?: string;
  relationship_tier_label?: string;
  relevant_memories: string[];
  vivid_memories?: string[];
  regular_memories?: string[];
  impressions?: string[];
}

export interface SystemTruthDto {
  session_id: string;
  turn_status: "success" | "conflict" | "impossible";
  environment: {
    location_name: string;
    weather: string | null;
    time: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    };
    time_passed_minutes: number;
    atmosphere: {
      sounds: string[];
      visuals: string[];
    };
  };
  global_events: string[];
  player_truths: Record<string, PlayerKnowledge>;
  present_npcs?: Array<{
    id: string;
    name: string;
    race?: string;
    role?: string;
    category?: string;
    status_tags?: string[];
    is_hostile?: boolean;
  }>;
  npc_context: Record<string, NpcContextSummary>;
  encounter_alert: {
    spawned: boolean;
    tier?: number;
    creature_name?: string;
  } | null;
  storyline?: {
    title: string;
    prologue?: string;
    current_arc?: {
      act: number;
      title: string;
      description: string;
      goals: string[];
      completed_goals: string[];
      key_npcs?: string[];
      key_locations?: string[];
    } | null;
  } | null;
}

export interface SystemTruthInputContext {
  session_id: string;
  acting_player_id: string;
  engine_output: EngineOutputPayload;
  persistence_output: {
    status: "committed" | "aborted_conflict" | "error";
    applied_mutations_count: number;
    new_game_time?: { year: number; month: number; day: number; hour: number; minute: number };
    conflict_details?: string | null;
    enriched_system_facts: string[];
  };
  // Состояние мира
  session: {
    game_year: number;
    game_month: number;
    game_day: number;
    game_hour: number;
    game_minute: number;
    current_location_id: string;
  };
  location: { name: string; weather: string | null };
  // Все игроки в комнате
  players: Array<{
    id: string;
    name: string;
    hp: number;
    max_hp: number;
    inventory: Array<{ id: string; item_name: string; quantity: number; durability?: number | null; condition?: string | null }>;
  }>;
  // Все NPC в комнате
  npcs: Array<{
    id: string;
    name: string;
    race?: string;
    role?: string;
    category?: string;
    status_tags?: string[];
    is_alive?: boolean;
    is_hostile?: boolean;
  }>;
  // Атмосфера
  atmosphere: { sounds: string[]; visuals: string[] };
  // Сколько минут прошло (для time_passed_minutes)
  time_passed_minutes: number;
  // Случайный энкаунтер
  encounter_alert: { spawned: boolean; tier?: number; creature_name?: string } | null;
  // Сюжетная линия сессии
  storyline?: any;
}

// ============================================
// Lazy Supabase client
// ============================================
let _supabase: any = null;

function getSupabase() {
  if (_supabase) return _supabase;
  // @ts-ignore
  const url = (typeof Deno !== "undefined" ? Deno.env.get("SUPABASE_URL") : null) ?? process.env?.SUPABASE_URL ?? "https://test.supabase.co";
  // @ts-ignore
  const key = (typeof Deno !== "undefined" ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") : null) ?? process.env?.SUPABASE_SERVICE_ROLE_KEY ?? "test-key";
  _supabase = createClient(url, key);
  return _supabase;
}

// ============================================
// Утилиты: работа с временем
// ============================================
function minutesToTimeParts(baseHour: number, baseMinute: number, baseDay: number, baseMonth: number, baseYear: number, addMinutes: number) {
  let totalMin = baseHour * 60 + baseMinute + addMinutes;
  const minutesPerDay = 24 * 60;
  const days = Math.floor(totalMin / minutesPerDay);
  totalMin -= days * minutesPerDay;
  const hour = Math.floor(totalMin / 60);
  const minute = totalMin - hour * 60;
  return {
    year: baseYear,
    month: baseMonth,
    day: baseDay + days,
    hour,
    minute,
  };
}

function timeOfDayRu(hour: number): string {
  if (hour >= 0 && hour < 6) return "ночь";
  if (hour >= 6 && hour < 12) return "утро";
  if (hour >= 12 && hour < 18) return "день";
  return "вечер";
}

// ============================================
// Парсинг мутаций → human-readable события
// ============================================
function getDamageFromHpUpdate(m: any): number {
  // delta отрицательный — значит это урон
  return typeof m.delta === "number" ? -m.delta : 0;
}

function getActionDisplayName(action: any): string {
  return action.target_item_name || action.action_type || "действие";
}

function getActionSkillLabel(actionType: string, statToCheck?: string): string {
  switch (actionType) {
    case "harvest_ambient": return "Выживание";
    case "search":
    case "loot": return "Внимательность";
    case "attack": return "Атака";
    case "stealth_attack": return "Скрытность";
    case "craft_recipe":
    case "craft_custom": return "Ремесло";
    case "talk": return "Убеждение";
    default:
      if (statToCheck === "stealth") return "Скрытность";
      if (statToCheck === "survival") return "Выживание";
      if (statToCheck === "investigation") return "Внимательность";
      if (statToCheck === "insight") return "Проницательность";
      if (statToCheck === "strength") return "Атлетика";
      if (statToCheck === "dexterity") return "Ловкость";
      return "Проверка";
  }
}

// ============================================
// Главная функция Шага 4
// ============================================
export async function compileSystemTruth(context: SystemTruthInputContext): Promise<SystemTruthDto> {
  const {
    session_id,
    acting_player_id,
    engine_output,
    persistence_output,
    session,
    location,
    players,
    npcs,
    atmosphere,
    time_passed_minutes,
    encounter_alert,
  } = context;

  // ============================================
  // 1. Определяем turn_status
  // ============================================
  // Приоритет: conflict > impossible > success
  // (race condition важнее: даже если действие могло бы быть impossible, транзакция провалилась)
  let turn_status: "success" | "conflict" | "impossible" = "success";

  if (persistence_output.status === "aborted_conflict") {
    turn_status = "conflict";
  } else {
    const allBlocked = engine_output.action_results.length > 0 && engine_output.action_results.every((r) => r.blocked);
    if (allBlocked) {
      turn_status = "impossible";
    }
  }

  // ============================================
  // 2. Считаем время
  // ============================================
  const baseTime = {
    year: session.game_year,
    month: session.game_month,
    day: session.game_day,
    hour: session.game_hour,
    minute: session.game_minute,
  };
  const newTime = persistence_output.new_game_time
    ? persistence_output.new_game_time
    : minutesToTimeParts(
        baseTime.hour,
        baseTime.minute,
        baseTime.day,
        baseTime.month,
        baseTime.year,
        time_passed_minutes,
      );

  const dayChanged = persistence_output.new_game_time
    ? persistence_output.new_game_time.day !== baseTime.day
    : Math.floor((baseTime.hour * 60 + baseTime.minute + time_passed_minutes) / (24 * 60)) > 0;

  // ============================================
  // 3. Собираем global_events (видны ВСЕМ в комнате)
  // ============================================
  const global_events: string[] = [];

  if (encounter_alert?.spawned) {
    global_events.push(`В окрестностях послышался рык: появляется ${encounter_alert.creature_name || "существо"}!`);
  }

  // Смена времени суток
  if (dayChanged) {
    const newTod = timeOfDayRu(newTime.hour);
    global_events.push(`Наступил(а) ${newTod} (${String(newTime.hour).padStart(2, "0")}:${String(newTime.minute).padStart(2, "0")}).`);
  }

  // Спавн структур
  for (const m of engine_output.mutations) {
    if (m.type === "SPAWN_STRUCTURE") {
      const sm = m as any;
      global_events.push(`В локации появилась постройка: ${sm.structure?.name || "?"}.`);
    }
  }

  // Бросок встречи был, но не сработал (если был)
  // (это не global event — это личный факт, но мы можем логировать)

  // ============================================
  // 4. Считаем HP и инвентарь для каждого игрока
  // ============================================
  const player_truths: Record<string, PlayerKnowledge> = {};

  for (const player of players) {
    // ============================================
    // HP delta
    // ============================================
    let hpDelta = 0;
    const hpMutations = engine_output.mutations.filter(
      (m) => m.type === "UPDATE_HP" && (m as any).id === player.id,
    );
    for (const m of hpMutations) {
      hpDelta += (m as any).delta as number;
    }

    // ============================================
    // Inventory delta
    // ============================================
    const added: string[] = [];
    const removed: string[] = [];
    const damaged: string[] = [];

    for (const m of engine_output.mutations) {
      if (m.type === "INSERT_ITEM") {
        const im = m as any;
        if (im.owner_type === "player" && im.owner_id === player.id) {
          added.push(im.item?.item_name || im.item?.name || "предмет");
        }
      }
      if (m.type === "DELETE_ITEM") {
        const dm = m as any;
        const found = (player.inventory || []).find((i: any) => i.id === dm.item_id);
        if (found) {
          const qtyStr = dm.quantity > 1 ? ` x${dm.quantity}` : "";
          removed.push(`${found.item_name || dm.item_id}${qtyStr}`);
        } else if (dm.owner_type === "player" && dm.owner_id === player.id) {
          removed.push(dm.item_id);
        }
      }
      if (m.type === "UPDATE_DURABILITY") {
        const um = m as any;
        const found = (player.inventory || []).find((i: any) => i.id === um.item_id);
        if (found) {
          damaged.push(`${found.item_name || um.item_id} (износ: ${Math.abs(um.delta)})`);
        } else if (um.owner_type === "player" && um.owner_id === player.id) {
          damaged.push(um.item_id);
        }
      }
      if (m.type === "TRANSFER_ITEM") {
        const tm = m as any;
        if (tm.to_type === "player" && tm.to_id === player.id) {
          added.push(`+${tm.quantity} предмета (получено)`);
        }
        if (tm.from_type === "player" && tm.from_id === player.id) {
          removed.push(`-${tm.quantity} предмета (передано)`);
        }
      }
    }

    // ============================================
    // Knowledge (факты для этого игрока)
    // ============================================
    const knowledge: string[] = [];

    // Конфликт транзакции — критичный факт
    if (persistence_output.status === "aborted_conflict" && player.id === acting_player_id) {
      knowledge.push("Ваше действие не удалось: предмет уже был забран другим игроком или перемещён.");
    }

    // Если этот игрок — инициатор, видит свои броски и DC
    if (player.id === acting_player_id) {
      for (const ar of engine_output.action_results) {
        if (ar.blocked) {
          knowledge.push(`Действие заблокировано: ${ar.block_reason || "нет причины"}.`);
          continue;
        }
        if (!ar.success) {
          knowledge.push(`Действие "${getActionDisplayName(ar)}" провалилось: ${ar.details || "бросок не удался"}.`);
          continue;
        }
        // Успех
        if (ar.dice_roll) {
          const skillLabel = getActionSkillLabel(ar.action_type, (ar as any).stat_to_check);
          const isSuccess = ar.success;
          knowledge.push(`[${skillLabel}: ${isSuccess ? "Успех" : "Провал"}]`);
        }
        if (ar.damage_dealt !== undefined && ar.damage_dealt > 0) {
          knowledge.push(`Нанесено ${ar.damage_dealt} урона.`);
        }
        if (ar.action_type === "craft_recipe" && added.length > 0) {
          knowledge.push(`Вы успешно создали: ${added.join(", ")}.`);
        }
        if (ar.action_type === "harvest_ambient" && added.length > 0) {
          knowledge.push(`Вы добыли: ${added.join(", ")}.`);
        }
        if (ar.action_type === "search" && added.length > 0) {
          knowledge.push(`Вы нашли: ${added.join(", ")}.`);
        }
        // Действия без броска и урона (свободное перемещение, разговор, осмотр)
        if (!ar.dice_roll && (ar.damage_dealt === undefined || ar.damage_dealt === 0) && ar.action_type !== "craft_recipe" && ar.action_type !== "harvest_ambient" && ar.action_type !== "search") {
          if (ar.details) {
            knowledge.push(ar.details);
          }
        }
      }

      const facts = engine_output.system_facts || engine_output.raw_system_facts || [];
      if (knowledge.length === 0 && facts.length) {
        knowledge.push(...facts);
      }
    } else {
      // Этот игрок — НЕ инициатор. Нужно решить, видит ли он действие.
      // Ищем все экшены, где цель = этот игрок
      const actionsTargetingThisPlayer = engine_output.action_results.filter(
        (ar) => {
          const actions = engine_output.action_results;
          // Определяем: цель — player с этим id
          return actions.some(() => false); // упрощённо
        },
      );
      // Более прямая проверка: были ли мутации UPDATE_HP на этого игрока
      const wasAttacked = hpMutations.length > 0;

      if (wasAttacked) {
        // Проверяем, было ли это скрытной атакой
        const isStealth = engine_output.action_results.some(
          (ar) => ar.action_type === "stealth_attack" || ar.action_type === "attack",
        );

        // Упрощённо: если attack, но не stealth — видим имя инициатора
        const attackerIsActing = engine_output.action_results.find(
          (ar) => ar.action_type === "attack" || ar.action_type === "stealth_attack",
        );

        if (attackerIsActing?.action_type === "stealth_attack") {
          // Скрытная атака: ID атакующего НЕ раскрывается
          knowledge.push(`Вы внезапно получили ${Math.abs(hpDelta)} физического урона. Источник урона неизвестен!`);
        } else {
          // Открытая атака
          const actingPlayer = players.find((p) => p.id === acting_player_id);
          const attackerName = actingPlayer?.name || "Неизвестный";
          knowledge.push(`${attackerName} атаковал вас и нанёс ${Math.abs(hpDelta)} урона.`);
        }
      } else {
        // Игрок не был целью — он bystander
        // Видит ли он событие? Смотрим на глобальный бой
        const globalAttack = engine_output.action_results.some(
          (ar) => ar.action_type === "attack" || ar.action_type === "stealth_attack",
        );
        if (globalAttack) {
          const attackerIsStealth = engine_output.action_results.some(
            (ar) => ar.action_type === "stealth_attack",
          );
          if (attackerIsStealth) {
            // Скрытая атака: bystander видит только следствие
            const victimName = players.find((p) => p.id !== acting_player_id)?.name || "другой игрок";
            knowledge.push(`${victimName} внезапно вздрагивает от ранения из ниоткуда.`);
          } else {
            const attacker = players.find((p) => p.id === acting_player_id)?.name || "Игрок";
            const victim = players.find((p) => p.id !== acting_player_id)?.name || "другой игрок";
            knowledge.push(`${attacker} атакует ${victim}!`);
          }
        }
      }
    }

    player_truths[player.id] = {
      player_id: player.id,
      knowledge,
      hp_status: {
        current: player.hp + hpDelta,
        max: player.max_hp,
        delta: hpDelta,
      },
      inventory_delta: { added, removed, damaged },
    };
  }

  // ============================================
  // 5. NPC context (Lazy RAG)
  // ============================================
  const npc_context: Record<string, NpcContextSummary> = {};

  // Находим NPC, с которыми взаимодействовал инициатор
  const interactedNpcIds = new Set<string>();
  for (const ar of engine_output.action_results) {
    // action.target_entity_id может быть id NPC
    const targetEntityId = (ar as any).target_entity_id;
    if (typeof targetEntityId === "string" && npcs.some((n) => n.id === targetEntityId)) {
      interactedNpcIds.add(targetEntityId);
    }
    // talk-действия всегда требуют памяти
    if (ar.action_type === "talk" || ar.action_type === "talk_free_action") {
      // target_entity_id должен быть в списке npcs
      if (typeof targetEntityId === "string") {
        interactedNpcIds.add(targetEntityId);
      }
    }
  }

  // Подтягиваем память и отношения только для активных NPC
  if (interactedNpcIds.size > 0) {
    const supabase = getSupabase();
    for (const npcId of interactedNpcIds) {
      const npc = npcs.find((n) => n.id === npcId);
      if (!npc) continue;

      let score = 0;
      let tier = "neutral";
      let statusTags: string[] = npc?.status_tags || [];

      // 1) Отношения NPC с игроком
      try {
        const res = await supabase
          .from("npc_relationships")
          .select("score, tier, status_tags")
          .eq("npc_id", npcId)
          .eq("player_id", acting_player_id);
        const relData = Array.isArray(res?.data) ? res.data[0] : (res?.data || null);
        if (relData) {
          score = typeof relData.score === "number" ? relData.score : 0;
          tier = relData.tier || calculateRelationshipTier(score);
          if (Array.isArray(relData.status_tags)) {
            statusTags = Array.from(new Set([...statusTags, ...relData.status_tags]));
          }
        }
      } catch {
        // ignore if table not yet migrated or in test mocks
      }

      // 2) Векторный поиск воспоминаний (Lazy RAG)
      let memories: string[] = [];
      try {
        const { data, error } = await supabase.rpc("match_npc_memories", {
          p_npc_id: npcId,
          p_player_id: acting_player_id,
          p_match_count: 3,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          memories = data
            .map((row: any) => row.content || row.memory_text || row.text || "")
            .filter((s: string) => s.length > 0);
        }
      } catch {
        // ignore
      }

      // Fallback: последние 3 воспоминания по created_at DESC
      if (memories.length === 0) {
        try {
          const { data } = await supabase
            .from("npc_memories")
            .select("content, memory_text, text")
            .eq("npc_id", npcId)
            .order("created_at", { ascending: false })
            .limit(3);
          if (Array.isArray(data)) {
            memories = data
              .map((row: any) => row.content || row.memory_text || row.text || "")
              .filter((s: string) => s.length > 0);
          }
        } catch {
          // ignore
        }
      }

      // 3) Разделение по уровням памяти (vivid, regular, impression)
      let vivid_memories: string[] = [];
      let regular_memories: string[] = [];
      let impressions: string[] = [];

      try {
        const { data: tieredData } = await supabase
          .from("npc_memories")
          .select("memory_text, memory_type, vividness")
          .eq("npc_id", npcId)
          .eq("player_id", acting_player_id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (Array.isArray(tieredData)) {
          for (const row of tieredData) {
            const txt = row.memory_text || "";
            if (!txt) continue;
            if (row.memory_type === "vivid" || (row.vividness && row.vividness >= 8)) {
              vivid_memories.push(txt);
            } else if (row.memory_type === "impression" || (row.vividness && row.vividness <= 3)) {
              impressions.push(txt);
            } else {
              regular_memories.push(txt);
            }
          }
        }
      } catch {
        // ignore
      }

      npc_context[npcId] = {
        npc_id: npcId,
        name: npc?.name || "NPC",
        race: npc?.race || "Гуманоид",
        role: npc?.role || "Обыватель",
        status_tags: statusTags,
        relationship_score: score,
        relationship_tier: tier,
        relationship_tier_label: getRelationshipTierLabel(tier as RelationshipTier),
        relevant_memories: memories,
        vivid_memories,
        regular_memories,
        impressions,
      };
    }
  }

  // ============================================
  // 6. Финальный DTO
  // ============================================
  const present_npcs = (npcs || [])
    .filter((n) => n.is_alive !== false)
    .map((n) => ({
      id: n.id,
      name: n.name || "NPC",
      race: n.race || "Человек",
      role: n.role || "Обыватель",
      category: n.category || "npc",
      status_tags: n.status_tags || [],
      is_hostile: n.is_hostile || false,
    }));

  return {
    session_id,
    turn_status,
    environment: {
      location_name: location?.name || "Неизвестно",
      weather: location?.weather || null,
      time: newTime,
      time_passed_minutes,
      atmosphere,
    },
    global_events,
    player_truths,
    present_npcs,
    npc_context,
    encounter_alert,
    storyline: context.storyline || null,
  };
}
