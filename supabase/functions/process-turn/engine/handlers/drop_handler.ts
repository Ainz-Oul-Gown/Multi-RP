// supabase/functions/process-turn/engine/handlers/drop_handler.ts
// Обработчик выбрасывания/избавления от предметов из инвентаря

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class DropHandler extends BaseActionHandler {
  readonly action_type = "drop";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawTargetName = (action.target_item_name || "").trim().toLowerCase();
    const itemId = action.used_item_id;

    // Определяем количество для сброса
    const qtyFromAction = (action as any).quantity ?? action.consumed_materials?.[0]?.quantity;
    const quantity = typeof qtyFromAction === "number" && qtyFromAction > 0 ? qtyFromAction : 1;

    // Ищем предмет в инвентаре игрока
    let item: any = null;

    if (itemId) {
      item = this.findItemById(player, itemId);
    }

    if (!item && rawTargetName) {
      // Поиск по точному совпадению или подстроке
      item = (player.inventory || []).find((i: any) => {
        const name = (i.item_name || i.name || "").toLowerCase();
        return name.includes(rawTargetName) || rawTargetName.includes(name);
      });
    }

    if (!item && rawTargetName) {
      // Нечёткий поиск по корням слов (учитывая падежные окончания русского языка)
      const cleanStem = (w: string) => w.replace(/(?:а|ов|ев|и|ы|у|е|ом|ам|ами|ях|ых|их|ого|его|ому|ему|ым|им|ую|ею|ей|я)$/i, "");
      const targetStems = rawTargetName.toLowerCase().split(/[\s,.-]+/).map(cleanStem).filter((w) => w.length >= 3);
      item = (player.inventory || []).find((i: any) => {
        const itemStems = (i.item_name || i.name || "").toLowerCase().split(/[\s,.-]+/).map(cleanStem).filter((w: string) => w.length >= 3);
        return targetStems.some((ts) => itemStems.some((is: string) => is.includes(ts) || ts.includes(is)));
      });
    }

    if (!item) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Предмет "${action.target_item_name || itemId || "неизвестно"}" не найден в вашем инвентаре`,
        },
        mutations: [],
        system_facts: [`${player.name} попытался выбросить предмет, которого у него нет.`],
      };
    }

    const dropQuantity = Math.min(item.quantity, quantity);

    const mutation: EngineMutation = {
      type: "DELETE_ITEM",
      item_id: item.id,
      quantity: dropQuantity,
    };

    return {
      result: {
        action_type: this.action_type,
        success: true,
        details: `Выброшено: ${item.item_name} (x${dropQuantity})`,
      },
      mutations: [mutation],
      system_facts: [`${player.name} выбросил ${item.item_name} (x${dropQuantity}).`],
    };
  }
}
