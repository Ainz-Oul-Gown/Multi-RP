// supabase/functions/process-turn/engine/handlers/build_handler.ts
// Обработчик постройки структур (build_structure)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class BuildHandler extends BaseActionHandler {
  readonly action_type = "build_structure";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const targetDc = action.ai_custom_dc || 15;

    // ============================================
    // Проверка наличия материалов
    // ============================================
    const requiredMaterials = action.consumed_materials || [];
    if (requiredMaterials.length === 0) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Не указаны материалы для постройки",
        },
        mutations: [],
        system_facts: [`${player.name} попытался строить без материалов.`],
      };
    }

    const inventoryMap = new Map();
    for (const item of player.inventory) {
      inventoryMap.set(item.id, item);
    }

    for (const required of requiredMaterials) {
      const owned = inventoryMap.get(required.id);
      if (!owned || owned.quantity < required.quantity) {
        return {
          result: {
            action_type: this.action_type,
            success: false,
            details: `Недостаточно материалов: ${owned?.item_name || required.id}`,
          },
          mutations: [],
          system_facts: [`${player.name} не смог построить: не хватает материалов.`],
        };
      }
    }

    // ============================================
    // Бросок против DC
    // ============================================
    const statMod = this.getStatToCheckMod(player, action.stat_to_check || "strength");
    const proficiency = this.getProficiency(player);
    const roll = this.performCheck(statMod, targetDc, proficiency);

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    if (!roll.success) {
      // Провал: 30% материалов испорчено
      for (const required of requiredMaterials) {
        const lost = Math.ceil(required.quantity * 0.3);
        if (lost > 0) mutations.push({ type: "DELETE_ITEM", item_id: required.id, quantity: lost });
      }
      systemFacts.push(`${player.name} неудачно построил: потеряно ~30% материалов.`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: `Строительство не удалось`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Успех: списать материалы + создать структуру
    // ============================================
    for (const required of requiredMaterials) {
      mutations.push({ type: "DELETE_ITEM", item_id: required.id, quantity: required.quantity });
    }

    if (context.session.current_location_id) {
      mutations.push({
        type: "SPAWN_STRUCTURE",
        location_id: context.session.current_location_id,
        structure: action.dynamic_blueprint || { name: action.target_item_name || "Структура", type: "structure" },
      });
    }

    systemFacts.push(`${player.name} успешно построил "${action.target_item_name || "структуру"}".`);

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Построено: ${action.target_item_name || "структура"}`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
