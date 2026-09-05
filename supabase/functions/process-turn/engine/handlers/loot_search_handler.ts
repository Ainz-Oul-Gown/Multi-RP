// supabase/functions/process-turn/engine/handlers/loot_search_handler.ts
// Обработчик лута/обыска

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollD100 } from "../dice.ts";

export class LootSearchHandler extends BaseActionHandler {
  readonly action_type = "loot";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const target = this.findNpcById(context, action.target_entity_id || "");

    if (!target) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Цель для лута не найдена",
        },
        mutations: [],
        system_facts: [`${player.name} попытался обыскать несуществующую цель.`],
      };
    }

    // Нельзя лутать живого врага (без флага "is_alive = false" — нельзя)
    if (target.is_alive) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          blocked: true,
          block_reason: "Цель ещё жива",
          details: "Нельзя обыскать живого врага",
        },
        mutations: [],
        system_facts: [`${player.name} попытался обыскать живого ${target.name}.`],
      };
    }

    // ============================================
    // Бросок: investigation
    // ============================================
    const statMod = this.getStatToCheckMod(player, "investigation");
    const proficiency = this.getProficiency(player);
    const targetDc = action.ai_custom_dc || 10;

    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod, targetDc, proficiency, advantage, disadvantage);


    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    if (!roll.success) {
      systemFacts.push(`${player.name} не нашёл ничего полезного на теле ${target.name}.`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: "Обыск не дал результатов",
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Успех: генерируем 1-3 предмета (упрощённо — 1 предмет из target_name)
    // ============================================
    const rawLootName = (action.target_item_name || "").trim();
    const itemName = !rawLootName || /^(добыча|лут|loot|item|предмет|вещь|находка)$/i.test(rawLootName)
      ? `Трофей (${target.name})`
      : rawLootName;
    const quantity = Math.min(3, Math.max(1, Math.ceil(rollD100() / 33.33)));

    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: {
        item_name: itemName,
        type: (action as any).item_type || "misc",
        quantity,
        attributes: { looted_from: target.id },
      },
    });

    systemFacts.push(`${player.name} обыскал ${target.name} и нашёл ${quantity} ед. "${itemName}".`);

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Найдено: ${quantity} ед. "${itemName}"`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}

/**
 * SearchHandler — обыск локации (без цели-NPC)
 */
export class SearchHandler extends BaseActionHandler {
  readonly action_type = "search";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const statMod = this.getStatToCheckMod(player, "investigation");
    const proficiency = this.getProficiency(player);
    const targetDc = action.ai_custom_dc || 12;

    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod, targetDc, proficiency, advantage, disadvantage);

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    if (!roll.success) {
      systemFacts.push(`${player.name} ничего не нашёл при обыске.`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: "Обыск не дал результатов",
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    const rawItemName = (action.target_item_name || "").trim();
    const isGeneric = !rawItemName || /^(находка|предмет|вещь|что-нибудь|что-то|лут|добыча|item|loot)$/i.test(rawItemName);
    const isAbstract = /след|отпечат|троп|путь|дорог|тракт|запах|звук|шум|ветер|знак|символ|улик|зацепк|направлен|панорам|вид|горизонт|окрестност|информац|слух|весть|секрет|подсказк|надпис|руин/i.test(rawItemName);

    if (isGeneric || isAbstract) {
      // Игрок внимательно осматривал/обыскивал местность без конкретного предмета или исследовал следы/улики —
      // фиксируем успех внимательности как факт восприятия без захламления инвентаря пустышками
      const desc = isAbstract ? `подмечены важные детали (${rawItemName})` : "подмечены важные детали обстановки";
      systemFacts.push(`${player.name} внимательно осмотрел округу и обнаружил: ${rawItemName || "важные ориентиры"}.`);
      return {
        result: {
          action_type: this.action_type,
          success: true,
          dice_roll: roll,
          details: `Успешный осмотр местности: ${desc}`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    const itemName = rawItemName;
    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: { item_name: itemName, type: (action as any).item_type || "misc", quantity: 1 },
    });

    systemFacts.push(`${player.name} нашёл "${itemName}" при обыске.`);

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Найдено: ${itemName}`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
