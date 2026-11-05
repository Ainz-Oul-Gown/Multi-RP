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
    const rawText = String(
      (context as any)?.raw_action_text ||
      (context.router_output as any)?.raw_action_text ||
      action.target_item_name ||
      ""
    ).trim();
    const targetDc = action.ai_custom_dc || 12;

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

    // ============================================
    // Проверка наличия материалов (с авто-подбором из инвентаря, если LLM-роутер не заполнил consumed_materials)
    // ============================================
    let requiredMaterials = [...(action.consumed_materials || [])];
    if (requiredMaterials.length === 0 && player.inventory.length > 0) {
      const lowerRaw = rawText.toLowerCase();
      // Ищем упоминание материала из инвентаря в тексте действия
      const matchedByText = player.inventory.find((item) => {
        if ((item.quantity || 0) < 1) return false;
        const words = (item.item_name || "")
          .toLowerCase()
          .replace(/[^a-zа-яё0-9\s-]/gi, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        return words.some((w) => {
          const stem = w.length >= 5 ? w.slice(0, -2) : w.length === 4 ? w.slice(0, -1) : w;
          return lowerRaw.includes(stem);
        });
      });
      const fallbackMat =
        matchedByText ||
        (action.used_item_id ? inventoryMap.get(action.used_item_id) : undefined) ||
        player.inventory.find((i) => i.type === "material" && (i.quantity || 0) >= 1);

      if (fallbackMat && (fallbackMat.quantity || 0) >= 1) {
        requiredMaterials = [{ id: fallbackMat.id, quantity: 1 }];
      }
    }

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

    // Определяем итоговый чертёж предмета (dynamic_blueprint или эвристика по тексту/цели)
    let blueprint = action.dynamic_blueprint;
    if (!blueprint || (!blueprint.item_name && !blueprint.name)) {
      let inferredName = (action.target_item_name || "").trim();
      const lowerClean = `${inferredName} ${rawText}`.toLowerCase();
      if (/копь[еёя]/i.test(lowerClean)) inferredName = "Деревянное копьё";
      else if (/факел/i.test(lowerClean)) inferredName = "Самодельный факел";
      else if (/стрел/i.test(lowerClean)) inferredName = "Связка стрел";
      else if (/лук/i.test(lowerClean)) inferredName = "Самодельный лук";
      else if (/дубин|палиц/i.test(lowerClean)) inferredName = "Тяжёлая дубина";
      else if (/нож|кинжал|заточк/i.test(lowerClean)) inferredName = "Самодельный нож";
      else if (/бинт|повязк/i.test(lowerClean)) inferredName = "Перевязочный бинт";
      else if (/зель|отвар|настой/i.test(lowerClean)) inferredName = "Травяной отвар";
      else if (!inferredName || inferredName.length > 35 || /^(затачива|смастер|скрафт|сдела|созда|выструг)/i.test(inferredName)) {
        const intoMatch = rawText.match(/(?:в|сделать|смастерить|создать|скрафтить|выстругать)\s+([а-яёa-z0-9\s-]{3,30})/i);
        inferredName = intoMatch ? intoMatch[1].trim() : (inferredName || "Самодельный предмет");
        inferredName = inferredName.charAt(0).toUpperCase() + inferredName.slice(1);
      }

      const isWeapon = /копь|меч|лук|кинжал|нож|дубин|топор|посох/i.test(inferredName);
      const isConsumable = /бинт|повязк|зель|отвар|настой|мазь/i.test(inferredName);
      blueprint = {
        item_name: inferredName,
        type: isWeapon ? "weapon" : isConsumable ? "consumable" : "misc",
        quantity: 1,
        attributes: isWeapon ? { damage: "1d6" } : {},
      };
    }

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
