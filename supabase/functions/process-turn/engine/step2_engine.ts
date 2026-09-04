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
    const tier = getEncounterTier(roll);
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
  // Случайный энкаунтер
  // ============================================
  let encounter_triggered: EncounterTriggered = { triggered: false };
  if (router_output.encounter_intent.type === "random") {
    encounter_triggered = rollEncounter(session.difficulty);
    if (encounter_triggered.triggered) {
      raw_system_facts.push(
        `🎲 Случайный энкаунтер! Появилось: ${encounter_triggered.creature_name} (тир ${encounter_triggered.tier}).`
      );
    }
  } else if (router_output.encounter_intent.type === "targeted" && router_output.encounter_intent.target_name) {
    raw_system_facts.push(`Целевой энкаунтер: ${router_output.encounter_intent.target_name}.`);
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
