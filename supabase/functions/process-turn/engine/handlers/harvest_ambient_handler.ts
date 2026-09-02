// supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts
// Обработчик сбора ресурсов из окружающей среды

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollD100 } from "../dice.ts";

export class HarvestAmbientHandler extends BaseActionHandler {
  readonly action_type = "harvest_ambient";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const targetItem = action.target_item_name || "ресурс";

    // ============================================
    // Модификатор (survival = WIS)
    // ============================================
    const statMod = this.getStatToCheckMod(player, "survival");
    const proficiency = this.getProficiency(player);

    // DC: из AI (обычно 10-15 для лёгкого сбора, 25-40 для сложного)
    const targetDc = action.ai_custom_dc || 12;

    const roll = this.performCheck(statMod, targetDc, proficiency);

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    // ============================================
    // Improper tool usage: всегда применяем (если есть)
    // ============================================
    if (action.improper_tool_usage?.is_improper) {
      const usedItem = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;
      if (usedItem) {
        const durMutation = this.buildDurabilityMutation(usedItem, action.improper_tool_usage);
        if (durMutation) mutations.push(durMutation);
        systemFacts.push(`${player.name} использовал ${usedItem.item_name} не по назначению при сборе.`);
      }
    }

    if (!roll.success) {
      systemFacts.push(`${player.name} не смог собрать ${targetItem} (${roll.total} vs DC=${targetDc}).`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: `Не удалось собрать ${targetItem}`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Успех: INSERT_ITEM
    // ============================================
    // Бросок d100 для количества (1-3 единиц)
    const quantity = Math.max(1, Math.floor(rollD100() / 34)); // 1, 2 или 3

    const newItem = {
      item_name: targetItem,
      type: "material",
      quantity,
      attributes: { harvested_at: context.session.id },
    };

    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: newItem,
    });

    systemFacts.push(`${player.name} успешно собрал ${quantity} ед. "${targetItem}".`);

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Собрано ${quantity} ед. "${targetItem}"`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
