// supabase/functions/process-turn/engine/handlers/craft_handler.ts
// Обработчик крафта (recipe + custom)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation, EngineInventoryItem } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class CraftHandler extends BaseActionHandler {
  readonly action_type = "craft_recipe";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    return this.handleCraft(action, context);
  }

  /**
   * Общая логика для craft_recipe и craft_custom
   */
  private handleCraft(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const blueprint = action.dynamic_blueprint;
    const targetDc = action.ai_custom_dc || 12;

    // ============================================
    // Проверка наличия материалов
    // ============================================
    const requiredMaterials = action.consumed_materials || [];
    if (requiredMaterials.length === 0) {
      return {
        result: {
          action_type: action.action_type,
          success: false,
          details: "Не указаны материалы для крафта",
        },
        mutations: [],
        system_facts: [`${player.name} попытался крафтить без указания материалов.`],
      };
    }

    // Строим Map инвентаря для быстрого поиска
    const inventoryMap = new Map<string, EngineInventoryItem>();
    for (const item of player.inventory) {
      inventoryMap.set(item.id, item);
    }

    // Проверяем что все материалы есть в инвентаре
    const missingMaterials: { id: string; required: number; available: number; name: string }[] = [];
    for (const required of requiredMaterials) {
      const owned = inventoryMap.get(required.id);
      if (!owned) {
        missingMaterials.push({ id: required.id, required: required.quantity, available: 0, name: required.id });
      } else if (owned.quantity < required.quantity) {
        missingMaterials.push({
          id: required.id,
          required: required.quantity,
          available: owned.quantity,
          name: owned.item_name,
        });
      }
    }

    if (missingMaterials.length > 0) {
      const list = missingMaterials.map((m) => `${m.name} (нужно ${m.required}, есть ${m.available})`).join(", ");
      return {
        result: {
          action_type: action.action_type,
          success: false,
          details: `Недостаточно материалов: ${list}`,
        },
        mutations: [],
        system_facts: [`${player.name} не смог скрафтить: не хватает ${list}.`],
      };
    }

    // ============================================
    // Бросок против DC
    // ============================================
    const statMod = this.getStatToCheckMod(player, action.stat_to_check || "dexterity");
    const proficiency = this.getProficiency(player);
    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod, targetDc, proficiency, advantage, disadvantage);


    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    if (!roll.success) {
      // Провал: списываем 50% материалов как испорченные
      for (const required of requiredMaterials) {
        const lostQuantity = Math.ceil(required.quantity * 0.5);
        if (lostQuantity > 0) {
          mutations.push({
            type: "DELETE_ITEM",
            item_id: required.id,
            quantity: lostQuantity,
          });
        }
      }
      systemFacts.push(`${player.name} неудачно скрафтил: потеряно ${Math.ceil(requiredMaterials.length * 0.5)} материалов.`);
      return {
        result: {
          action_type: action.action_type,
          success: false,
          dice_roll: roll,
          details: `Крафт не удался (${roll.total} vs ${targetDc}), часть материалов испорчена`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Успех: списываем все материалы + создаём предмет
    // ============================================
    for (const required of requiredMaterials) {
      mutations.push({
        type: "DELETE_ITEM",
        item_id: required.id,
        quantity: required.quantity,
      });
    }

    if (blueprint && (blueprint.item_name || blueprint.name)) {
      mutations.push({
        type: "INSERT_ITEM",
        owner_id: player.id,
        owner_type: "player",
        item: {
          item_name: blueprint.item_name || blueprint.name,
          type: blueprint.type || "misc",
          quantity: blueprint.quantity || 1,
          attributes: blueprint.attributes || {},
        },
      });
    }

    systemFacts.push(`${player.name} успешно скрафтил "${blueprint?.item_name || blueprint?.name || "предмет"}".`);

    return {
      result: {
        action_type: action.action_type,
        success: true,
        dice_roll: roll,
        details: `Крафт успешен: ${blueprint?.item_name || blueprint?.name || "предмет"}`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}

/**
 * CraftCustomHandler — крафт по кастомному чертежу (dynamic_blueprint обязателен)
 */
export class CraftCustomHandler extends CraftHandler {
  readonly action_type = "craft_custom";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    if (!action.dynamic_blueprint || (!action.dynamic_blueprint.item_name && !action.dynamic_blueprint.name)) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Для кастомного крафта требуется dynamic_blueprint с item_name или name",
        },
        mutations: [],
        system_facts: [`${context.acting_player.name} попытался кастомный крафт без чертежа.`],
      };
    }
    return super.handle(action, context);
  }
}
