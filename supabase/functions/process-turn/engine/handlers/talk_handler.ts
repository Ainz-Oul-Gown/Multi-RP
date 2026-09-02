// supabase/functions/process-turn/engine/handlers/talk_handler.ts
// Обработчик разговора / социального взаимодействия

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TalkHandler extends BaseActionHandler {
  readonly action_type = "talk";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const target = this.findNpcById(context, action.target_entity_id || "");

    if (!target) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Цель разговора не найдена",
        },
        mutations: [],
        system_facts: [`${player.name} попытался поговорить с несуществующим NPC.`],
      };
    }

    // ============================================
    // Модификатор: insight (WIS) или persuasion (CHA)
    // ============================================
    const stat = action.stat_to_check === "insight" ? "insight" : "insight";
    const statMod = this.getStatToCheckMod(player, stat);
    const proficiency = this.getProficiency(player);
    const targetDc = action.ai_custom_dc || 12;

    const roll = this.performCheck(statMod, targetDc, proficiency);

    const systemFacts: string[] = [
      `${player.name} попытался поговорить с ${target.name} (${roll.total} vs DC=${targetDc}).`,
    ];

    if (!roll.success) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: `${target.name} не в настроении для разговора`,
        },
        mutations: [],
        system_facts: systemFacts,
      };
    }

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Успешный разговор с ${target.name}`,
      },
      mutations: [],
      system_facts: systemFacts,
    };
  }
}
