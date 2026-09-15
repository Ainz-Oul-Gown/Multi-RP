// supabase/functions/process-turn/engine/step2_engine.ts
// Шаг 2: Математическое Ядро (D&D Engine)
// Оркестратор: прогоняет actions через хендлеры, считает энкаунтеры, агрегирует мутации.

import {
  EngineInputContext,
  EngineOutputPayload,
  ActionResult,
  EngineMutation,
  EncounterTriggered,
  ActionHandlerResult,
} from "./types.ts";
import { RouterOutputPayload, RouterAction } from "../types.ts";
import { getHandler, getRegisteredActionTypes } from "./handlers/index.ts";
import { rollD100 } from "./dice.ts";

// ============================================
// Пороги энкаунтеров по сложности (d100)
// ============================================
const ENCOUNTER_THRESHOLDS: Record<"easy" | "normal" | "hard", number> = {
  easy: 5,   // < 5%
  normal: 10, // < 10%
  hard: 15,   // < 15%
};

const ENCOUNTER_TIERS: Record<number, { name: string; tier: number }> = {
  1: { name: "Слабое существо", tier: 1 },
  25: { name: "Обычное существо", tier: 2 },
  50: { name: "Сильное существо", tier: 3 },
  75: { name: "Элитное существо", tier: 4 },
  95: { name: "Легендарное существо", tier: 5 },
};

function getEncounterTier(d100roll: number): { name: string; tier: number } {
  if (d100roll < 25) return ENCOUNTER_TIERS[1];
  if (d100roll < 50) return ENCOUNTER_TIERS[25];
  if (d100roll < 75) return ENCOUNTER_TIERS[50];
  if (d100roll < 95) return ENCOUNTER_TIERS[75];
  return ENCOUNTER_TIERS[95];
}

// ============================================
// Обработка одного действия
// ============================================
function processAction(
  action: RouterAction,
  context: EngineInputContext
): ActionHandlerResult {
  const handler = getHandler(action.action_type);
  if (!handler) {
    return {
      result: {
        action_type: action.action_type,
        success: false,
        details: `Неизвестный тип действия: ${action.action_type}. Доступные: ${getRegisteredActionTypes().join(", ")}`,
      },
      mutations: [],
      system_facts: [`Неизвестное действие: ${action.action_type}`],
    };
  }
  return handler.handle(action, context);
}

// ============================================
// Генерация энкаунтера (d100)
// ============================================
function rollEncounter(difficulty: "easy" | "normal" | "hard"): EncounterTriggered {
  const roll = rollD100();
  const threshold = ENCOUNTER_THRESHOLDS[difficulty];

  if (roll < threshold) {
    const tierRoll = rollD100();
    const tier = getEncounterTier(tierRoll);
    return {
      triggered: true,
      tier: tier.tier,
      creature_name: tier.name,
    };
  }

  return { triggered: false };
}

// ============================================
// Главный фасад движка
// ============================================
export function executeEngine(context: EngineInputContext): EngineOutputPayload {
  const { router_output, session, acting_player } = context;

  // Если роутер пометил действие как impossible — сразу выход
  if (router_output.status === "impossible") {
    return {
      success: false,
      action_results: [
        {
          action_type: "blocked",
          success: false,
          blocked: true,
          block_reason: router_output.clarification_msg || "Действие невозможно",
          details: router_output.clarification_msg || "Действие невозможно",
        },
      ],
      mutations: [],
      encounter_triggered: { triggered: false },
      raw_system_facts: [`Действие заблокировано: ${router_output.clarification_msg}`],
      system_facts: [`Действие заблокировано: ${router_output.clarification_msg}`],
    };
  }

  if (router_output.status === "clarification_needed") {
    return {
      success: false,
      action_results: [
        {
          action_type: "clarification_needed",
          success: false,
          blocked: true,
          block_reason: router_output.clarification_msg || "Требуется уточнение",
          details: router_output.clarification_msg || "Требуется уточнение",
        },
      ],
      mutations: [],
      encounter_triggered: { triggered: false },
      raw_system_facts: [`Требуется уточнение: ${router_output.clarification_msg}`],
      system_facts: [`Требуется уточнение: ${router_output.clarification_msg}`],
    };
  }

  // ============================================
  // Прогон всех действий через хендлеры
  // ============================================
  const action_results: ActionResult[] = [];
  const mutations: EngineMutation[] = [];
  const raw_system_facts: string[] = [];

  for (const action of router_output.actions) {
    const handlerResult = processAction(action, context);
    action_results.push(handlerResult.result);
    mutations.push(...handlerResult.mutations);
    raw_system_facts.push(...handlerResult.system_facts);
  }

  // ============================================
  // Длительное действие (Busy State)
  // ============================================
  if (router_output.long_term_activity?.is_long_term) {
    const lta = router_output.long_term_activity;
    mutations.push({
      type: "SET_PLAYER_BUSY",
      player_id: acting_player.id,
      activity: lta.activity_name,
      minutes: lta.duration_minutes,
      reward_preview: lta.reward_preview,
    });
    raw_system_facts.push(`Персонаж ${acting_player.name} начал длительное занятие: "${lta.activity_name}" (займет ${lta.duration_minutes} мин).`);
  }

  // ============================================
  // ADVANCE_TIME
  // ============================================
  if (router_output.time_estimate_minutes > 0) {
    mutations.push({
      type: "ADVANCE_TIME",
      minutes: router_output.time_estimate_minutes,
    });
    raw_system_facts.push(`Прошло ${router_output.time_estimate_minutes} минут игрового времени.`);
  }

  // ============================================
  // Случайный и целевой энкаунтер
  // ============================================
  let encounter_triggered: EncounterTriggered = { triggered: false };
  const isEncounterAction =
    router_output.encounter_intent.type === "random" ||
    router_output.encounter_intent.type === "targeted" ||
    router_output.actions.some(a => a.action_type === "move" || a.action_type === "search");

  if (isEncounterAction) {
    // ----- Базовый порог по danger_level локации -----
    // safe=2%, normal=12%, danger=35%, lethal=65%
    const DANGER_BASE: Record<string, number> = {
      safe: 2,
      normal: 12,
      danger: 35,
      lethal: 65,
    };
    const dangerLevel = session.location_danger_level || "normal";
    let baseThreshold = DANGER_BASE[dangerLevel] ?? 12;

    // ----- Модификатор сложности сессии -----
    const DIFFICULTY_MULT: Record<string, number> = { easy: 0.5, normal: 1.0, hard: 1.5 };
    baseThreshold *= (DIFFICULTY_MULT[session.difficulty] ?? 1.0);

    // 🛡️ Защита новичка (Novice Grace Period):
    // На сложности "easy" в первые 3 раунда для персонажа 1-го уровня случайные нападения врагов
    // отключены (порог = 0), ЕСЛИ игрок сам целенаправленно не ищет бой (encounter_intent.type !== "targeted").
    const isEasy = (session.difficulty || "normal") === "easy";
    const isNovice = (context.acting_player.level || 1) <= 1 && (session.current_round ?? 1) <= 3;
    const isExplicitHunting = router_output.encounter_intent.type === "targeted";
    if (isEasy && isNovice && !isExplicitHunting) {
      baseThreshold = 0;
    }

    // ----- Время: чем дольше ходишь — тем выше шанс (max 3x) -----
    const timeHours = Math.max(0.25, (router_output.time_estimate_minutes || 30) / 60);
    const timeMult = Math.min(3.0, timeHours);

    // ----- Целевой поиск (игрок ИЩЕТ врага) — базовый шанс ×3 -----
    const intentMult = router_output.encounter_intent.type === "targeted" ? 3.0 : 1.0;

    // ----- Скрытность — снижает шанс встретить НПС (поднимает для НПС найти игрока) -----
    const moveAction = router_output.actions.find(a => a.action_type === "move");
    const stealthFactor = moveAction?.stealth_factor ?? 1.0;

    // ----- Навык выживания/внимательности (WIS) даёт бонус к целевому поиску -----
    let skillBonus = 1.0;
    if (router_output.encounter_intent.type === "targeted") {
      const wis = context.acting_player.stats?.WIS || 10;
      const wisMod = Math.floor((wis - 10) / 2);
      if (wisMod > 0) {
        skillBonus += wisMod * 0.1; // +10% к шансу за каждый +1 модификатора
      }
    }

    const dynamicThreshold = baseThreshold * timeMult * intentMult * stealthFactor * skillBonus;
    const roll = rollD100();

    if (roll < dynamicThreshold) {
      const tierRoll = rollD100();
      const tier = getEncounterTier(tierRoll);
      const isTargeted = router_output.encounter_intent.type === "targeted";
      const creatureName = (isTargeted && router_output.encounter_intent.target_name)
        ? router_output.encounter_intent.target_name
        : tier.name;

      encounter_triggered = {
        triggered: true,
        tier: tier.tier,
        creature_name: creatureName,
      };
      // Чистый факт для мира без отладочных порогов кубиков
      raw_system_facts.push(
        `🎯 Встреча в пути! Появилось: ${encounter_triggered.creature_name} — существо нападает на ${acting_player.name}!`
      );
    } else if (router_output.encounter_intent.type === "targeted") {
      const targetLabel = router_output.encounter_intent.target_name ? ` ("${router_output.encounter_intent.target_name}")` : "";
      raw_system_facts.push(
        `Поиск врагов${targetLabel} не дал результата — местность вокруг кажется безлюдной и спокойной.`
      );
    }
  }

  return {
    success: true,
    action_results,
    mutations,
    encounter_triggered,
    raw_system_facts,
    system_facts: raw_system_facts,
  };
}
