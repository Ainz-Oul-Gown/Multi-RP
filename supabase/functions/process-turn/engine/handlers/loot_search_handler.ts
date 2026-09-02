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

    const roll = this.performCheck(statMod, targetDc, proficiency);

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
    const itemName = action.target_item_name || "добыча";
    const quantity = Math.max(1, Math.floor(rollD100() / 34));

    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: {
        item_name: itemName,
        type: "misc",
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

    const roll = this.performCheck(statMod, targetDc, proficiency);

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

    const itemName = action.target_item_name || "находка";
    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: { item_name: itemName, type: "misc", quantity: 1 },
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
