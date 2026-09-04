// supabase/functions/process-turn/engine/handlers/transfer_handler.ts
// Обработчик передачи предметов между владельцами

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TransferHandler extends BaseActionHandler {
  readonly action_type = "transfer";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    let itemId = action.used_item_id;
    let targetId = action.target_entity_id;
    const rawTargetName = (action.target_item_name || "").trim().toLowerCase();
    const qtyFromAction = (action as any).quantity ?? action.consumed_materials?.[0]?.quantity;
    const quantity = typeof qtyFromAction === "number" && qtyFromAction > 0 ? qtyFromAction : 1;

    // Резолв предмета по ID или названию
    let item: any = null;
    if (itemId) {
      item = this.findItemById(player, itemId);
    }
    if (!item && rawTargetName) {
      item = (player.inventory || []).find((i: any) => {
        const name = (i.item_name || i.name || "").toLowerCase();
        return name.includes(rawTargetName) || rawTargetName.includes(name);
      });
    }
    if (!item && rawTargetName) {
      const rootMatch = rawTargetName.replace(/(?:а|ов|ев|и|ы|у|е|ом|ам|ами|ях)$/i, "");
      if (rootMatch.length >= 3) {
        item = (player.inventory || []).find((i: any) => {
          const name = (i.item_name || i.name || "").toLowerCase();
          return name.includes(rootMatch);
        });
      }
    }

    if (!item) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Предмет "${action.target_item_name || itemId || "не указан"}" не найден в вашем инвентаре`,
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать предмет, которого у него нет.`],
      };
    }
    itemId = item.id;

    // Резолв получателя по ID или имени
    if (!targetId) {
      const targetHint = ((action as any).target_entity_name || (action as any).target_name || "").toLowerCase();
      if (targetHint) {
        for (const [id, npc] of context.targets.npcs.entries()) {
          if (npc.name?.toLowerCase().includes(targetHint) || targetHint.includes(npc.name?.toLowerCase() || "")) {
            targetId = id;
            break;
          }
        }
        if (!targetId) {
          for (const [id, p] of context.targets.players.entries()) {
            if (p.name?.toLowerCase().includes(targetHint) || targetHint.includes(p.name?.toLowerCase() || "")) {
              targetId = id;
              break;
            }
          }
        }
      }
    }

    // Если всё ещё нет targetId, но рядом есть ровно один мирный NPC — передаём ему
    if (!targetId && context.targets.npcs.size === 1) {
      const onlyNpc = Array.from(context.targets.npcs.values())[0];
      if (!onlyNpc.is_hostile) {
        targetId = onlyNpc.id;
      }
    }

    if (!targetId) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Не указан получатель (кому передать)",
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать ${item.item_name}, не указав получателя.`],
      };
    }

    const transferQty = Math.min(item.quantity, quantity);

    // ============================================
    // Определяем тип получателя (player/npc/location)
    // ============================================
    const isNpc = context.targets.npcs.has(targetId);
    const isPlayer = context.targets.players.has(targetId);
    const isLocation = context.targets.location_items.has(targetId);

    if (!isNpc && !isPlayer && !isLocation) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Получатель ${targetId} не найден`,
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать предмет несуществующему получателю.`],
      };
    }

    const toType: "player" | "npc" | "location" = isNpc ? "npc" : isPlayer ? "player" : "location";

    // ============================================
    // Мутация TRANSFER_ITEM (без кубиков)
    // ============================================
    const mutation: EngineMutation = {
      type: "TRANSFER_ITEM",
      item_id: String(itemId || item.id),
      from_id: player.id,
      to_id: targetId,
      from_type: "player",
      to_type: toType,
      quantity: transferQty,
    };

    const targetName = isNpc 
      ? context.targets.npcs.get(targetId)?.name 
      : isPlayer 
      ? context.targets.players.get(targetId)?.name 
      : "локацию";

    return {
      result: {
        action_type: this.action_type,
        success: true,
        details: `Передано: ${item.item_name} → ${targetName}`,
      },
      mutations: [mutation],
      system_facts: [`${player.name} передал ${item.item_name} (x${quantity}) → ${targetName}.`],
    };
  }
}
