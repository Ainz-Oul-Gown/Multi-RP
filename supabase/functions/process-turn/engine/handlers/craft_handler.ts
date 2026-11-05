// supabase/functions/process-turn/engine/handlers/craft_handler.ts
// Обработчик крафта (recipe + custom)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation, EngineInventoryItem } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class CraftHandler extends BaseActionHandler {
  override readonly action_type: string = "craft_recipe";

  override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
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

    // Строим Map инвентаря для быстрого поиска (по ID и по имени предмета для устойчивости к бесплатным LLM)
    const inventoryMap = new Map<string, EngineInventoryItem>();
    for (const item of player.inventory) {
      inventoryMap.set(item.id, item);
    }

    const findInventoryItem = (idOrName: string): EngineInventoryItem | undefined => {
      if (!idOrName) return undefined;
      const byId = inventoryMap.get(idOrName);
      if (byId) return byId;
      const needle = idOrName.trim().toLowerCase();
      return player.inventory.find(
        (i) =>
          (i.item_name || "").trim().toLowerCase() === needle ||
          (i.item_name || "").trim().toLowerCase().includes(needle) ||
          needle.includes((i.item_name || "").trim().toLowerCase())
      );
    };

    // Проверяем что все материалы есть в инвентаре и сохраняем их реальные ID
    const resolvedMaterials: { item_id: string; quantity: number; name: string }[] = [];
    const missingMaterials: { id: string; required: number; available: number; name: string }[] = [];
    for (const required of requiredMaterials) {
      const reqKey = required.id || (required as any).name || (required as any).item_name || "";
      const owned = findInventoryItem(reqKey);
      if (!owned) {
        missingMaterials.push({ id: reqKey, required: required.quantity, available: 0, name: reqKey });
      } else if (owned.quantity < required.quantity) {
        missingMaterials.push({
          id: owned.id,
          required: required.quantity,
          available: owned.quantity,
          name: owned.item_name,
        });
      } else {
        resolvedMaterials.push({ item_id: owned.id, quantity: required.quantity, name: owned.item_name });
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
      for (const required of resolvedMaterials) {
        const lostQuantity = Math.ceil(required.quantity * 0.5);
        if (lostQuantity > 0) {
          mutations.push({
            type: "DELETE_ITEM",
            item_id: required.item_id,
            quantity: lostQuantity,
          });
        }
      }
      systemFacts.push(`${player.name} неудачно скрафтил: потеряно ${Math.ceil(resolvedMaterials.length * 0.5)} материалов.`);
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
    for (const required of resolvedMaterials) {
      mutations.push({
        type: "DELETE_ITEM",
        item_id: required.item_id,
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
  override readonly action_type: string = "craft_custom";

  override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
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
