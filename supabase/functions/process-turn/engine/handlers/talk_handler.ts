// supabase/functions/process-turn/engine/handlers/talk_handler.ts
// Обработчик разговора / социального взаимодействия

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TalkHandler extends BaseActionHandler {
  readonly action_type = "talk";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    let targetNpc = this.findNpcById(context, action.target_entity_id || "");
    let targetPlayer = this.findPlayerById(context, action.target_entity_id || "");

    // Резолв по подсказке имени, если ID не сопоставлен напрямую
    if (!targetNpc && !targetPlayer) {
      const hint = (((action as any).target_entity_name || (action as any).target_name || action.target_item_name || "") as string).toLowerCase().trim();
      if (hint) {
        for (const [id, p] of context.targets.players.entries()) {
          if (id !== player.id && (p.name.toLowerCase().includes(hint) || hint.includes(p.name.toLowerCase()))) {
            targetPlayer = p;
            break;
          }
        }
        if (!targetPlayer) {
          for (const [id, n] of context.targets.npcs.entries()) {
            if (n.name.toLowerCase().includes(hint) || hint.includes(n.name.toLowerCase())) {
              targetNpc = n;
              break;
            }
          }
        }
      }
    }

    // ============================================
    // Диалог с другим игроком (Party Roleplay)
    // ============================================
    if (targetPlayer) {
      const rawText = (context as any)?.raw_action_text || (action as any)?.speech || "";
      const speechMatch = rawText.match(/[«"]([^»"]{1,120})[»"]/);
      const speechContent = speechMatch ? speechMatch[1] : "";
      const fact = speechContent
        ? `${player.name} обращается к ${targetPlayer.name}: «${speechContent}».`
        : `${player.name} заводит разговор с ${targetPlayer.name}.`;

      return {
        result: {
          action_type: this.action_type,
          success: true,
          target_entity_id: targetPlayer.id,
          target_type: "player",
          target_id: targetPlayer.id,
          details: `Обращение к игроку ${targetPlayer.name}`,
        } as any,
        mutations: [],
        system_facts: [fact],
      };
    }

    if (!targetNpc) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Цель разговора не найдена",
        },
        mutations: [],
        system_facts: [`${player.name} попытался заговорить с неизвестным персонажем.`],
      };
    }

    // ============================================
    // Диалог с NPC: insight (WIS) или persuasion (CHA)
    // ============================================
    const stat = action.stat_to_check || "insight";
    const statMod = this.getStatToCheckMod(player, stat);
    const proficiency = this.getProficiency(player);
    const targetDc = action.ai_custom_dc || 12;

    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod, targetDc, proficiency, advantage, disadvantage);

    const systemFacts: string[] = [
      `${player.name} попытался поговорить с ${targetNpc.name} (${roll.total} vs DC=${targetDc}).`,
    ];

    if (!roll.success) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          target_entity_id: targetNpc.id,
          target_type: "npc",
          target_id: targetNpc.id,
          details: `${targetNpc.name} не в настроении для разговора`,
        } as any,
        mutations: [],
        system_facts: systemFacts,
      };
    }

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        target_entity_id: targetNpc.id,
        target_type: "npc",
        target_id: targetNpc.id,
        details: `Успешный разговор с ${targetNpc.name}`,
      } as any,
      mutations: [],
      system_facts: systemFacts,
    };
  }
}
