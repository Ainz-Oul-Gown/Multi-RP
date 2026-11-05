// supabase/functions/process-turn/engine/handlers/trade_handler.ts
// Обработчик живой торговли, покупок, продажи трофеев и торга с NPC (trade)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TradeHandler extends BaseActionHandler {
  readonly action_type = "trade";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawActionText = (
      (context as any)?.raw_action_text ||
      (context.router_output as any)?.raw_action_text ||
      (action as any)?.raw_action_text ||
      ""
    ).trim();
    const lowerRaw = rawActionText.toLowerCase();

    // 1. Находим торговца / трактирщика / собеседника
    let merchant = action.target_entity_id ? this.findNpcById(context, action.target_entity_id) : null;
    if (!merchant) {
      const hint = ((action as any).target_name || (action as any).target_entity_name || "").toLowerCase();
      if (hint) {
        for (const [_id, npc] of context.targets.npcs.entries()) {
          if (!npc.is_hostile && npc.name?.toLowerCase().includes(hint)) {
            merchant = npc;
            break;
          }
        }
      }
    }
    if (!merchant) {
      merchant =
        Array.from(context.targets.npcs.values()).find(
          (n: any) => !n.is_hostile && /торгов|купец|трактирщ|кузнец|алхимик|лавочн|корчмар|аптекар|оружейн/i.test(`${n.role || ""} ${n.name || ""}`)
        ) ||
        Array.from(context.targets.npcs.values()).find((n: any) => !n.is_hostile) ||
        null;
    }

    const merchantName = merchant?.name || "Торговец";

    // 2. Бросок Харизмы / Убеждения на выгодную сделку (торг)
    const chaMod = this.getStatMod(player, "CHA");
    const persuasionBonus =
      player.skills?.persuasion?.effects?.discount_pct
        ? Math.floor(player.skills.persuasion.effects.discount_pct / 5)
        : Math.floor((player.skills?.persuasion?.level || 0) / 5);
    const tradeDc = action.ai_custom_dc || 12;
    const haggleRoll = this.performCheck(chaMod + persuasionBonus, tradeDc, this.getProficiency(player));

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    // Определяем режим: ПРОДАЖА (sell) или ПОКУПКА (buy)
    const isSelling = /прода[юетьм]|сбыва|сдаю|обменива.*на монет|выручить за/i.test(lowerRaw);
    const targetItemName = (action.target_item_name || "").trim();

    // Поиск кошелька с монетами у игрока
    const goldItem = (player.inventory || []).find((i: any) =>
      /золот|монет|серебр|деньг|крон|кредит/i.test(i.item_name || i.name || "")
    );

    if (isSelling) {
      // Ищем предмет на продажу в инвентаре игрока
      let itemToSell: any = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;
      if (!itemToSell && targetItemName) {
        const lowerTarget = targetItemName.toLowerCase();
        itemToSell = (player.inventory || []).find((i: any) => {
          const n = (i.item_name || i.name || "").toLowerCase();
          return n.includes(lowerTarget) || lowerTarget.includes(n);
        });
      }
      if (!itemToSell) {
        // Берём первый материал/трофей, если игрок сказал "продаю добычу/трофеи"
        itemToSell = (player.inventory || []).find(
          (i: any) => (i.type === "material" || i.type === "misc") && !/золот|монет/i.test(i.item_name || "")
        );
      }

      if (!itemToSell) {
        return {
          result: {
            action_type: this.action_type,
            success: false,
            details: `Предмет для продажи "${targetItemName || "товар"}" не найден в инвентаре`,
          },
          mutations: [],
          system_facts: [`${player.name} хотел продать товар ${merchantName}, но нужного предмета не оказалось в сумке.`],
        };
      }

      const sellQty = Math.min(
        itemToSell.quantity || 1,
        action.consumed_materials?.[0]?.quantity || 1
      );
      const baseUnitPrice = itemToSell.type === "weapon" || itemToSell.type === "armor" ? 12 : 5;
      const haggleMultiplier = haggleRoll.is_crit ? 1.5 : haggleRoll.success ? 1.25 : 0.9;
      const earnedGold = Math.max(1, Math.round(baseUnitPrice * sellQty * haggleMultiplier));

      mutations.push({
        type: "DELETE_ITEM",
        item_id: String(itemToSell.id),
        quantity: sellQty,
      });

      mutations.push({
        type: "INSERT_ITEM",
        owner_id: player.id,
        owner_type: "player",
        item: {
          item_name: goldItem?.item_name || "Золотые монеты",
          type: "misc",
          quantity: earnedGold,
          description: "Звонкие монеты, вырученные в торговле",
        },
      });

      systemFacts.push(
        `${player.name} продал «${itemToSell.item_name}» (x${sellQty}) персонажу ${merchantName} и выручил ${earnedGold} золотых монет (${haggleRoll.success ? `удачный торг: бросок ${haggleRoll.total} vs СЛ ${tradeDc}` : `обычная цена: ${haggleRoll.total} vs СЛ ${tradeDc}`}).`
      );

      return {
        result: {
          action_type: this.action_type,
          success: true,
          dice_roll: haggleRoll,
          details: `Продано «${itemToSell.item_name}» (x${sellQty}) за ${earnedGold} монет`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // Режим ПОКУПКИ / ЗАКАЗА в таверне или лавке
    let purchasedName = targetItemName;
    if (!purchasedName) {
      if (/эль|пив|вин|медовух|кружк|выпивк/i.test(lowerRaw)) purchasedName = "Кружка крепкого эля";
      else if (/жарен.*мяс|рагу|ужин|обед|похлебк|ед[уы]|хлеб/i.test(lowerRaw)) purchasedName = "Горячий дорожный обед";
      else if (/зель|эликсир|лечен/i.test(lowerRaw)) purchasedName = "Малое зелье лечения";
      else if (/бинт|аптечк|повязк/i.test(lowerRaw)) purchasedName = "Перевязочный пакет";
      else if (/стрел|колчан|болт/i.test(lowerRaw)) purchasedName = "Связка охотничьих стрел";
      else if (/факел|фонар/i.test(lowerRaw)) purchasedName = "Промасленный факел";
      else if (/веревк|канат/i.test(lowerRaw)) purchasedName = "Крепкая пеньковая верёвка";
      else if (/кинжал|нож/i.test(lowerRaw)) purchasedName = "Стальной походный кинжал";
      else if (/меч|клинок/i.test(lowerRaw)) purchasedName = "Добротный стальной меч";
      else purchasedName = "Походный припас";
    }

    const isEquipment = /меч|клинок|кинжал|лук|арбалет|топор|брон|кольчуг|щит/i.test(purchasedName);
    const isPotion = /зель|эликсир|отвар|аптечк/i.test(purchasedName);
    const baseCost = isEquipment ? 15 : isPotion ? 8 : 2;
    const finalCost = haggleRoll.success ? Math.max(1, Math.floor(baseCost * 0.75)) : baseCost;

    const currentGold = goldItem?.quantity || 0;
    if (goldItem && currentGold >= 1) {
      const paid = Math.min(currentGold, finalCost);
      mutations.push({
        type: "DELETE_ITEM",
        item_id: String(goldItem.id),
        quantity: paid,
      });
    } else if (!haggleRoll.success && isEquipment) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: haggleRoll,
          details: `Недостаточно золота для покупки «${purchasedName}» (нужно ${finalCost} монет)`,
        },
        mutations: [],
        system_facts: [
          `${player.name} попытался приобрести «${purchasedName}» у ${merchantName}, но в кошельке не хватило монет (требуется ${finalCost} золотых), а уговорить отдать в долг не удалось.`,
        ],
      };
    }

    const inferredType = isEquipment
      ? "weapon"
      : /эль|пив|вин|обед|рагу|мяс|зель|эликсир|бинт|хлеб/i.test(purchasedName)
      ? "consumable"
      : "misc";

    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: {
        item_name: purchasedName,
        type: inferredType,
        quantity: 1,
        attributes: isEquipment ? { damage_dice: "1d8" } : null,
      },
    });

    const paymentNote =
      goldItem && currentGold >= 1
        ? `за ${Math.min(currentGold, finalCost)} монет${haggleRoll.success ? " (со скидкой после удачного торга!)" : ""}`
        : "в счёт будущей услуги благодаря красноречию";

    systemFacts.push(
      `${player.name} приобрёл «${purchasedName}» у ${merchantName} ${paymentNote}. Предмет добавлен в инвентарь.`
    );

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: haggleRoll,
        details: `Куплено: «${purchasedName}» у ${merchantName}`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
