// supabase/functions/process-turn/engine/handlers/move_handler.ts
// Хендлер перемещения: «Бегу в укрытие», «Иду к озеру», «Отступаю назад».
// Если DC указан — выполняется проверка (например преодоление препятствия).
// Без DC — это свободное перемещение, всегда успешное (время/локация уже учтены в GPS).

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, ActionResult, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class MoveHandler extends BaseActionHandler {
  readonly action_type = "move";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const destination = action.target_item_name || "новое местоположение";

    // ============================================
    // Если есть DC — это проверка (например преодоление сложного участка)
    // ============================================
    if (action.ai_custom_dc && action.ai_custom_dc > 0) {
      const statMod = this.getStatToCheckMod(player, action.stat_to_check || "dexterity");
      const proficiency = this.getProficiency(player);
      const advantage = context.session.difficulty === "easy";
      const disadvantage = context.session.difficulty === "hard";
      const roll = this.performCheck(statMod, action.ai_custom_dc, proficiency, advantage, disadvantage);



      if (!roll.success) {
        const result: ActionResult = {
          action_type: this.action_type,
          success: false,
          dice_roll: {
            roll: roll.d20,
            modifier: roll.modifier,
            dc: action.ai_custom_dc,
            success: false,
          },
          details: `Не удалось преодолеть препятствие на пути к "${destination}" (бросок ${roll.total} vs DC ${action.ai_custom_dc}).`,
        };
        return {
          result,
          mutations: [],
          system_facts: [`${player.name} попытался переместиться к "${destination}", но препятствие помешало (бросок ${roll.total} vs DC ${action.ai_custom_dc}).`],
        };
      }

      const result: ActionResult = {
        action_type: this.action_type,
        success: true,
        dice_roll: {
          roll: roll.d20,
          modifier: roll.modifier,
          dc: action.ai_custom_dc,
          success: true,
        },
        details: `Успешное перемещение к: ${destination}`,
      };
      return {
        result,
        mutations: [],
        system_facts: [`${player.name} успешно преодолел препятствие и переместился к "${destination}" (бросок ${roll.total} vs DC ${action.ai_custom_dc}).`],
      };
    }

    // ============================================
    // Свободное перемещение без проверки (DC = null или 0)
    // Локация/время уже обрабатываются GPS-стадией.
    // ============================================
    const result: ActionResult = {
      action_type: this.action_type,
      success: true,
      details: `Перемещение: ${destination}`,
    };
    return {
      result,
      mutations: [],
      system_facts: [`${player.name} переместился в направлении: ${destination}.`],
    };
  }
}
