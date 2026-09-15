// tests/router_evaluation.test.ts
// Бенчмарк-оценка качества классификации пар запрос-ответ (Dataset Evaluation)
// Покрывает все ключевые сценарии: охота, перемещение, бой, диалоги, сбор, крафт, дроп, амбиент.

import { describe, it, expect } from "vitest";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";

interface TestCase {
  id: string;
  category: "hunting" | "movement" | "combat" | "social" | "gathering" | "crafting" | "inventory" | "ambient";
  input_text: string;
  expected_action_type: string | null;
  expected_target_name?: string | null;
  expected_encounter_type?: "targeted" | "random" | "none";
  expected_encounter_target?: string | null;
  context?: any;
}

export const BENCHMARK_DATASET: TestCase[] = [
  // 1. Охота и целевой поиск (Targeted Hunt)
  {
    id: "hunt_01",
    category: "hunting",
    input_text: "Выслеживаю волка по следам на снегу",
    expected_action_type: "search",
    expected_encounter_type: "targeted",
    expected_encounter_target: "Волк",
  },
  {
    id: "hunt_02",
    category: "hunting",
    input_text: "Ищу кабана в густом кустарнике",
    expected_action_type: "search",
    expected_encounter_type: "targeted",
    expected_encounter_target: "Кабан",
  },
  {
    id: "hunt_03",
    category: "hunting",
    input_text: "Охочусь на медведя в предгорьях",
    expected_action_type: "search",
    expected_encounter_type: "targeted",
    expected_encounter_target: "Медведь",
  },

  // 2. Перемещение (Movement)
  {
    id: "move_01",
    category: "movement",
    input_text: "Иду в лес за ягодами",
    expected_action_type: "move",
  },
  {
    id: "move_02",
    category: "movement",
    input_text: "Возвращаюсь в таверну «Пьяный гоблин»",
    expected_action_type: "move",
  },
  {
    id: "move_03",
    category: "movement",
    input_text: "Вхожу в темную сырую пещеру",
    expected_action_type: "move",
  },
  {
    id: "move_04",
    category: "movement",
    input_text: "Отправляюсь в ближайший город",
    expected_action_type: "move",
  },
  {
    id: "move_05",
    category: "movement",
    input_text: "Спускаюсь по винтовой лестнице в подвал",
    expected_action_type: "move",
  },

  // 3. Бой и атака (Combat)
  {
    id: "combat_01",
    category: "combat",
    input_text: "Бью мечом гоблина",
    expected_action_type: "attack",
    context: {
      nearby_npcs: [{ id: "npc-goblin", name: "Гоблин", is_hostile: true }],
    },
  },
  {
    id: "combat_02",
    category: "combat",
    input_text: "Бросаюсь на волка с кинжалом наперевес",
    expected_action_type: "attack",
    context: {
      nearby_npcs: [{ id: "npc-wolf", name: "Волк", is_hostile: true }],
    },
  },
  {
    id: "combat_03",
    category: "combat",
    input_text: "Уклоняюсь от удара разбойника и контратакую в грудь",
    expected_action_type: "attack",
    context: {
      nearby_npcs: [{ id: "npc-bandit", name: "Разбойник", is_hostile: true }],
    },
  },

  // 4. Диалоги и социальные взаимодействия (Social / Talk)
  {
    id: "social_01",
    category: "social",
    input_text: "Спрашиваю у трактирщика о последних новостях в округе",
    expected_action_type: "talk",
    context: {
      nearby_npcs: [{ id: "npc-innkeeper", name: "Трактирщик", is_hostile: false }],
    },
  },
  {
    id: "social_02",
    category: "social",
    input_text: "Ирис, давай пойдем вместе исследовать руины?",
    expected_action_type: "talk",
    context: {
      nearby_players: [{ id: "player-iris", name: "Ирис" }],
      nearby_npcs: [{ id: "npc-innkeeper", name: "Трактирщик" }],
    },
  },

  // 5. Сбор ресурсов из окружения (Harvest Ambient)
  {
    id: "gather_01",
    category: "gathering",
    input_text: "Собираю сухие ветки и хворост для костра",
    expected_action_type: "harvest_ambient",
  },
  {
    id: "gather_02",
    category: "gathering",
    input_text: "Ищу кремни и острые камни на берегу ручья",
    expected_action_type: "harvest_ambient",
  },
  {
    id: "gather_03",
    category: "gathering",
    input_text: "Срываю спелые лесные ягоды с куста",
    expected_action_type: "harvest_ambient",
  },

  // 6. Крафт и создание предметов (Crafting)
  {
    id: "craft_01",
    category: "crafting",
    input_text: "Затачиваю ветку ножом, делая острое деревянное копьё",
    expected_action_type: "craft_recipe",
  },
  {
    id: "craft_02",
    category: "crafting",
    input_text: "Смастерить факел из палки и промасленной тряпки",
    expected_action_type: "craft_recipe",
  },

  // 7. Инвентарь: выброс и передача (Inventory)
  {
    id: "inv_01",
    category: "inventory",
    input_text: "Выкидываю 2 лесных гриба из сумки",
    expected_action_type: "drop",
    context: {
      inventory: [{ id: "item-mush", item_name: "Лесные грибы", quantity: 5 }],
    },
  },
  {
    id: "inv_02",
    category: "inventory",
    input_text: "Передаю целебное зелье Ирис",
    expected_action_type: "transfer",
    context: {
      inventory: [{ id: "item-potion", item_name: "Целебное зелье", quantity: 1 }],
      nearby_players: [{ id: "player-iris", name: "Ирис" }],
    },
  },

  // 8. Осмотр и фоновое ролевое действие (Ambient)
  {
    id: "ambient_01",
    category: "ambient",
    input_text: "Осматриваюсь вокруг и прислушиваюсь к звукам ночи",
    expected_action_type: null, // actions: []
  },
  {
    id: "ambient_02",
    category: "ambient",
    input_text: "Сижу у костра, любуясь пляшущими языками пламени",
    expected_action_type: null, // actions: []
  },
];

describe("Evaluation Benchmark: Router Intent Classification Dataset", () => {
  it("evaluates dataset pairs against Router logic and computes Accuracy / Precision metrics", () => {
    let passedCount = 0;
    const categoryStats: Record<string, { total: number; passed: number }> = {};

    console.log(`\n══════════════════════════════════════════════════════════════════`);
    console.log(`📊 НАЧАЛО БЕНЧМАРКА: ОЦЕНКА ПАР ЗАПРОС-ОТВЕТ (${BENCHMARK_DATASET.length} сценариев)`);
    console.log(`══════════════════════════════════════════════════════════════════`);

    for (const testCase of BENCHMARK_DATASET) {
      const cat = testCase.category;
      if (!categoryStats[cat]) categoryStats[cat] = { total: 0, passed: 0 };
      categoryStats[cat].total++;

      const routerInput: any = {
        player_action_text: testCase.input_text,
        inventory: testCase.context?.inventory || [],
        nearby_npcs: testCase.context?.nearby_npcs || [],
        nearby_players: testCase.context?.nearby_players || [],
      };

      const result = buildRouterHeuristicFallback(routerInput);
      const actualActionType = result.actions.length > 0 ? result.actions[0].action_type : null;

      let isSuccess = false;
      if (testCase.expected_action_type === null) {
        // Ожидаем пустой actions
        isSuccess = result.actions.length === 0;
      } else {
        isSuccess = actualActionType === testCase.expected_action_type;
      }

      // Проверка encounter_intent если задано
      if (isSuccess && testCase.expected_encounter_type) {
        isSuccess = result.encounter_intent.type === testCase.expected_encounter_type;
        if (testCase.expected_encounter_target) {
          isSuccess = isSuccess && result.encounter_intent.target_name === testCase.expected_encounter_target;
        }
      }

      if (isSuccess) {
        passedCount++;
        categoryStats[cat].passed++;
        console.log(`  ✅ [${testCase.id}] [${cat.toUpperCase()}]: "${testCase.input_text}" → ${actualActionType || "none"} (${result.encounter_intent.type})`);
      } else {
        console.log(`  ❌ [${testCase.id}] [${cat.toUpperCase()}]: "${testCase.input_text}"`);
        console.log(`     Ожидалось: action=${testCase.expected_action_type}, encounter=${testCase.expected_encounter_type || "n/a"}`);
        console.log(`     Получено:   action=${actualActionType}, encounter=${result.encounter_intent.type}`);
      }
    }

    const accuracyPercent = (passedCount / BENCHMARK_DATASET.length) * 100;
    console.log(`\n──────────────────────────────────────────────────────────────────`);
    console.log(`🏆 ИТОГИ ОЦЕНКИ ПАР ЗАПРОС-ОТВЕТ:`);
    console.log(`  Общая точность (Accuracy): ${passedCount}/${BENCHMARK_DATASET.length} (${accuracyPercent.toFixed(1)}%)`);
    console.log(`──────────────────────────────────────────────────────────────────`);
    for (const [cat, stat] of Object.entries(categoryStats)) {
      const p = ((stat.passed / stat.total) * 100).toFixed(0);
      console.log(`  - ${cat.padEnd(12)}: ${stat.passed}/${stat.total} (${p}%)`);
    }
    console.log(`══════════════════════════════════════════════════════════════════\n`);

    // Требуем не менее 90% точности по бенчмарку
    expect(accuracyPercent).toBeGreaterThanOrEqual(90);
  });
});
