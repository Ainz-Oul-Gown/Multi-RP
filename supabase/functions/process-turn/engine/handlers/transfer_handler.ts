// supabase/functions/process-turn/engine/handlers/transfer_handler.ts
// Обработчик передачи предметов между владельцами

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TransferHandler extends BaseActionHandler {
  readonly action_type = "transfer";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const itemId = action.used_item_id;
    const targetId = action.target_entity_id;
    const quantity = 1; // По умолчанию 1, можно расширить через атрибуты

    if (!itemId) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Не указан предмет для передачи",
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать предмет, не указав ID.`],
      };
    }

    if (!targetId) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Не указан получатель",
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать предмет, не указав получателя.`],
      };
    }

    // ============================================
    // Проверка: предмет принадлежит инициатору
    // ============================================
    const item = this.findItemById(player, itemId);
    if (!item) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Предмет ${itemId} не найден в инвентаре`,
        },
        mutations: [],
        system_facts: [`${player.name} попытался передать несуществующий предмет.`],
      };
    }

    if (item.quantity < quantity) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Недостаточно предметов: есть ${item.quantity}, нужно ${quantity}`,
        },
        mutations: [],
        system_facts: [`${player.name} не смог передать ${item.item_name}: недостаточно.`],
      };
    }

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
      item_id: itemId,
      from_id: player.id,
      to_id: targetId,
      from_type: "player",
      to_type: toType,
      quantity,
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
