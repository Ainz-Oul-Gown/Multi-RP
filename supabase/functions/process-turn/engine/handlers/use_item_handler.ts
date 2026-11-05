// supabase/functions/process-turn/engine/handlers/use_item_handler.ts
// Обработчик применения расходников, зелий, бинтов, еды, свитков и спасения раненых сопартийцев (use_item)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollDamage } from "../dice.ts";

export class UseItemHandler extends BaseActionHandler {
  readonly action_type = "use_item";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawActionText = (
      (context as any)?.raw_action_text ||
      (context.router_output as any)?.raw_action_text ||
      (action as any)?.raw_action_text ||
      ""
    ).trim();

    const itemHint = (action.target_item_name || "").trim().toLowerCase();

    // 1. Поиск предмета в инвентаре игрока
    let item: any = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;

    if (!item && itemHint) {
      item = (player.inventory || []).find((i: any) => {
        const name = (i.item_name || i.name || "").toLowerCase();
        return name.includes(itemHint) || itemHint.includes(name);
      });
      if (!item) {
        const rootMatch = itemHint.replace(/(?:а|ов|ев|и|ы|у|ю|е|ом|ем|ам|ами|ях)$/i, "");
        if (rootMatch.length >= 3) {
          item = (player.inventory || []).find((i: any) => {
            const name = (i.item_name || i.name || "").toLowerCase();
            return name.includes(rootMatch);
          });
        }
      }
    }

    // Если точное имя не совпало, ищем подходящий расходник по смыслу текста заявки
    if (!item && rawActionText) {
      const lowerRaw = rawActionText.toLowerCase();
      if (/зель|эликсир|отвар|настойк|фляг|склянк/i.test(lowerRaw)) {
        item = (player.inventory || []).find((i: any) =>
          /зель|эликсир|отвар|настойк|лечен|здоров/i.test(i.item_name || i.name || "")
        );
      } else if (/бинт|повязк|аптечк|жгут|перевяз|пластыр|стимулятор/i.test(lowerRaw)) {
        item = (player.inventory || []).find((i: any) =>
          /бинт|повязк|аптечк|трав|стимулятор|лечен/i.test(i.item_name || i.name || "")
        );
      } else if (/ем\b|съеда|перекус|мяс|хлеб|паёк|паек|гриб|ягод|провиз|сыр|яблок/i.test(lowerRaw)) {
        item = (player.inventory || []).find((i: any) =>
          i.type === "consumable" ||
          /мяс|хлеб|паёк|паек|гриб|ягод|провиз|сыр|яблок|еда|пищ|трав/i.test(i.item_name || i.name || "")
        );
      } else if (/свиток|бомб|гранат|динамит|коктейл/i.test(lowerRaw)) {
        item = (player.inventory || []).find((i: any) =>
          /свиток|бомб|гранат|динамит|взрыв|масл/i.test(i.item_name || i.name || "")
        );
      }
    }

    // Если игрок оказывает первую помощь раненому товарищу без предмета (проверка Медицины / Мудрости)
    const isFirstAidWithoutItem =
      !item &&
      /перевяз|перв.*помощ|останов.*кров|реанимир|подня.*на ног|вытащ.*с того свет|исцел|лечу|полечи/i.test(rawActionText);

    if (!item && !isFirstAidWithoutItem) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: `Предмет "${action.target_item_name || "расходник"}" не найден в инвентаре`,
        },
        mutations: [],
        system_facts: [`${player.name} попытался использовать предмет «${action.target_item_name || "расходник"}», но его не оказалось в рюкзаке.`],
      };
    }

    // 2. Определяем цель применения (на себя, на сопартийца/NPC или по врагу для боевых расходников)
    const itemName = item ? (item.item_name || item.name || "Расходник") : "Первая помощь";
    const itemLower = itemName.toLowerCase();
    const isOffensiveConsumable = /бомб|гранат|динамит|взрыв|яд|кислот|огненн.*свиток|свиток.*молн|свиток.*атак|коктейл/i.test(
      `${itemLower} ${rawActionText.toLowerCase()}`
    );

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    // Списываем 1 единицу использованного предмета
    if (item && item.id) {
      mutations.push({
        type: "DELETE_ITEM",
        item_id: String(item.id),
        quantity: 1,
      });
    }

    // Вариант А: Боевой расходник / атакующий свиток / бомба
    if (isOffensiveConsumable) {
      let target: any =
        this.findNpcById(context, action.target_entity_id || "") ||
        Array.from(context.targets.npcs.values()).find((n: any) => n.is_hostile && n.is_alive !== false);

      const intMod = this.getStatMod(player, "INT");
      const dexMod = this.getStatMod(player, "DEX");
      const bestMod = Math.max(intMod, dexMod);
      const targetDc = target?.armor_class || action.ai_custom_dc || 12;
      const roll = this.performCheck(bestMod, targetDc, this.getProficiency(player));

      const dmgRoll = rollDamage("2d6");
      const totalDamage = Math.max(2, dmgRoll.total + Math.max(0, bestMod));

      if (target) {
        const appliedDamage = roll.success ? totalDamage : Math.max(1, Math.floor(totalDamage / 2));
        mutations.push({
          type: "UPDATE_HP",
          target_type: "is_hostile" in target ? "npc" : "player",
          id: target.id,
          delta: -appliedDamage,
        });
        systemFacts.push(
          `${player.name} применяет «${itemName}» против ${target.name} и наносит ${appliedDamage} ед. урона (${roll.success ? "точное попадание" : "задело взрывной волной"})!`
        );
        return {
          result: {
            action_type: this.action_type,
            success: true,
            dice_roll: roll,
            damage_dealt: appliedDamage,
            details: `Применено «${itemName}» по ${target.name}: ${appliedDamage} урона`,
          },
          mutations,
          system_facts: systemFacts,
        };
      }
    }

    // Вариант Б: Лечение / Восстановление сил / Поднятие упавшего товарища (Downed Ally Rescue)
    let healTarget: any = player;
    let isAllyTarget = false;

    if (action.target_entity_id && action.target_entity_id !== player.id) {
      const foundPlayer = this.findPlayerById(context, action.target_entity_id);
      const foundNpc = this.findNpcById(context, action.target_entity_id);
      if (foundPlayer) {
        healTarget = foundPlayer;
        isAllyTarget = true;
      } else if (foundNpc && !foundNpc.is_hostile) {
        healTarget = foundNpc;
        isAllyTarget = true;
      }
    } else {
      // Проверяем, не упомянуто ли имя сопартийца в тексте заявки
      for (const [id, p] of context.targets.players.entries()) {
        if (id !== player.id && p.name && rawActionText.toLowerCase().includes(p.name.toLowerCase())) {
          healTarget = p;
          isAllyTarget = true;
          break;
        }
      }
    }

    const medicineSkillBonus = player.skills?.medicine?.effects?.heal_bonus || player.skills?.medicine?.level || 0;
    const wisMod = Math.max(0, this.getStatMod(player, "WIS"));

    // Определяем объём исцеления в зависимости от типа предмета
    const isMajorPotion = /больш|великое|крепк|сильн|эликсир|аптечк|стимулятор/i.test(itemLower);
    const isStandardPotion = /зель|отвар|настойк|бинт|повязк/i.test(itemLower);
    const diceFormula = isMajorPotion ? "3d4" : isStandardPotion ? "2d4" : "1d6";
    const baseFlatBonus = isMajorPotion ? 4 : isStandardPotion ? 2 : 1;

    const healRoll = rollDamage(diceFormula);
    const healAmount = Math.max(2, healRoll.total + baseFlatBonus + wisMod + Math.floor(medicineSkillBonus / 5));

    const targetWasDowned = (healTarget.hp ?? 10) <= 0;
    const targetType: "player" | "npc" = "is_hostile" in healTarget ? "npc" : "player";

    mutations.push({
      type: "UPDATE_HP",
      target_type: targetType,
      id: healTarget.id,
      delta: healAmount,
    });

    if (isAllyTarget) {
      if (targetWasDowned) {
        systemFacts.push(
          `🚑 СПАСЕНИЕ ЖИЗНИ! ${player.name} использует «${itemName}» и возвращает упавшего без сознания ${healTarget.name} в строй (+${healAmount} HP)!`
        );
      } else {
        systemFacts.push(
          `${player.name} применяет «${itemName}» на соратника ${healTarget.name} и восстанавливает ему ${healAmount} HP.`
        );
      }
    } else {
      systemFacts.push(
        `${player.name} использует «${itemName}» и восстанавливает ${healAmount} HP здоровья.`
      );
    }

    return {
      result: {
        action_type: this.action_type,
        success: true,
        details: isAllyTarget
          ? `Исцеление ${healTarget.name} (${itemName}): +${healAmount} HP`
          : `Использовано «${itemName}»: +${healAmount} HP`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
