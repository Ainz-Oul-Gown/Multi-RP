// supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts
// Обработчик сбора ресурсов из окружающей среды

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollD100 } from "../dice.ts";

export const ABSTRACT_OBSERVATION_REGEX = /след|отпечат|троп|путь|дорог|тракт|запах|звук|шум|ветер|знак|символ|улик|зацепк|направлен|панорам|вид|горизонт|окрестност|информац|слух|весть|секрет|подсказк|надпис/i;

export function isAbstractObservation(name?: string | null): boolean {
  if (!name) return false;
  return ABSTRACT_OBSERVATION_REGEX.test(name.trim());
}

export function resolveHarvestedItem(
  rawTargetName?: string | null,
  actionText?: string
): { name: string; type: string; is_observation?: boolean } {
  const text = ((actionText || "") + " " + (rawTargetName || "")).toLowerCase();

  // Признаки реальных собираемых физических ресурсов
  const hasPhysicalResource = /стим|аптечк|медпак|бинт|вакцин|лекарств|гриб|ягод|фрукт|плод|яблок|груш|хлеб|сыр|мяс|дичь|рыб|трав|растен|корен|цвет|мох|листь|алхим|ветк|палк|древ|бревн|суч|доск|руд|жил|метал|кристал|самоцвет|кам|кремен|булыж|гранит|шкур|кож|мех|микросхем|плат|чип|провод|кабел|лом|хлам|свалк|утиль|детал|запчаст|батаре|энергоячейк|аккумул|патрон|пуль|снаряд|шард|флешк/i.test(text);

  if (!hasPhysicalResource && (isAbstractObservation(rawTargetName) || isAbstractObservation(actionText))) {
    return {
      name: rawTargetName || "Окружение и следы",
      type: "observation",
      is_observation: true,
    };
  }

  const isGeneric =
    !rawTargetName ||
    /^(ресурс|предмет|resource|item|находка|добыча|материал)$/i.test(
      rawTargetName.trim()
    );

  if (!isGeneric && rawTargetName) {
    const lower = rawTargetName.toLowerCase();
    if (/гриб|ягод|фрукт|яблок|груш|плод|хлеб|сыр|мяс|дичь|рыб/i.test(lower)) {
      return {
        name: rawTargetName,
        type: /мяс|дичь|рыб/i.test(lower) ? "cooking_ingredient" : "food",
      };
    }
    if (/трав|растен|корен|цвет|мох|листь|алхим/i.test(lower)) {
      return { name: rawTargetName, type: "herb" };
    }
    if (/ветк|палк|древ|бревн|суч|доск/i.test(lower)) {
      return { name: rawTargetName, type: "wood" };
    }
    if (/руд|жил|метал/i.test(lower)) {
      return { name: rawTargetName, type: "ore" };
    }
    if (/кристал|самоцвет|алмаз|рубин|изумруд|аметист/i.test(lower)) {
      return { name: rawTargetName, type: "gem" };
    }
    if (/кам|кремен|булыж|гранит|обсидиан/i.test(lower)) {
      return { name: rawTargetName, type: "stone" };
    }
    if (/шкур|кож|мех/i.test(lower)) {
      return { name: rawTargetName, type: "leather" };
    }
    if (/микросхем|плат|чип|провод|кабел/i.test(lower)) {
      return { name: rawTargetName, type: "electronics" };
    }
    if (/лом|хлам|свалк|утиль|детал|запчаст/i.test(lower)) {
      return { name: rawTargetName, type: "scrap" };
    }
    if (/стим|аптечк|медпак|бинт|вакцин|лекарств/i.test(lower)) {
      return { name: rawTargetName, type: "stim" };
    }
    if (/патрон|пуль|снаряд|болт|стрел/i.test(lower)) {
      return { name: rawTargetName, type: "ammo" };
    }
    if (/батаре|энергоячейк|аккумул/i.test(lower)) {
      return { name: rawTargetName, type: "energy_cell" };
    }
    if (/шард|флешк|софт|диск|чип данных/i.test(lower)) {
      return { name: rawTargetName, type: "datashard" };
    }
    return { name: rawTargetName, type: "material" };
  }

  // Извлечение из текста действия игрока (фэнтези и природа)
  if (/гриб/i.test(text)) return { name: "Лесные грибы", type: "food" };
  if (/черник/i.test(text)) return { name: "Лесная черника", type: "food" };
  if (/земляник|клубник/i.test(text)) return { name: "Дикая земляника", type: "food" };
  if (/малин/i.test(text)) return { name: "Лесная малина", type: "food" };
  if (/брусник|клюкв/i.test(text)) return { name: "Северные ягоды", type: "food" };
  if (/ягод/i.test(text)) return { name: "Спелые лесные ягоды", type: "food" };
  if (/фрукт|яблок|груш|плод/i.test(text)) return { name: "Дикие плоды", type: "food" };
  if (/трав|растен|корен|цвет|мох/i.test(text)) return { name: "Дикие целебные травы", type: "herb" };
  if (/палк|ветк|суч|древ/i.test(text)) return { name: "Сухие ветки и сучья", type: "wood" };
  if (/кам|кремен|булыж/i.test(text)) return { name: "Полевые камни", type: "stone" };
  if (/руд|жил|шахт/i.test(text)) return { name: "Железная руда", type: "ore" };
  if (/кристал|самоцвет/i.test(text)) return { name: "Осколок мана-кристалла", type: "gem" };
  if (/рыб|улов/i.test(text)) return { name: "Свежая рыба", type: "cooking_ingredient" };
  if (/дичь|мяс|охот/i.test(text)) return { name: "Свежая дичь", type: "cooking_ingredient" };
  if (/шкур|кож|мех/i.test(text)) return { name: "Шкура дикого зверя", type: "leather" };
  if (/вод|родник|ручей/i.test(text)) return { name: "Чистая родниковая вода", type: "drink" };

  // Киберпанк / Sci-Fi / Постапокалипсис (свалка, город, технологии)
  if (/провод|кабел|микросхем|плат|чип/i.test(text)) return { name: "Медные провода и микросхемы", type: "electronics" };
  if (/свалк|лом|хлам|утиль|детал|запчаст/i.test(text)) return { name: "Электронный лом и детали", type: "scrap" };
  if (/батаре|энерг|аккумул/i.test(text)) return { name: "Энергоячейка", type: "energy_cell" };
  if (/стим|аптечк|бинт|лекарств|мед/i.test(text)) return { name: "Полевой стимулятор", type: "stim" };
  if (/патрон|пуль|снаряд/i.test(text)) return { name: "Коробка патронов", type: "ammo" };
  if (/шард|данн|флешк|софт/i.test(text)) return { name: "Зашифрованный дата-шард", type: "datashard" };

  return { name: "Лесные дары", type: "food" };
}

export class HarvestAmbientHandler extends BaseActionHandler {
  readonly action_type = "harvest_ambient";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawActionText = (action as any).raw_action_text || (context.router_output as any)?.raw_action_text || "";
    const resolved = resolveHarvestedItem(action.target_item_name, rawActionText);
    const targetItem = resolved.name;
    const itemType = (action as any).item_type || resolved.type;

    // ============================================
    // Модификатор (survival = WIS) + бонус навыка собирательства/шахтёрства
    // ============================================
    const statMod = this.getStatToCheckMod(player, "survival");
    const proficiency = this.getProficiency(player);
    const isMining = /руд|жил|кам|минер|самоцвет|желез|мед|золот|уголь|серебр/i.test(targetItem);
    const applicableSkill = isMining ? (player.skills?.mining || player.skills?.gathering) : (player.skills?.gathering || player.skills?.mining);
    const skillName = isMining && player.skills?.mining ? "Шахтёрское дело" : "Собирательство";
    const skillEffects = applicableSkill?.effects || {};
    const skillCheckBonus = Math.floor((applicableSkill?.level || 0) / 10);

    const findChanceBonusPct = skillEffects.find_chance_bonus_pct || skillEffects.ore_yield_bonus_pct || 0;

    // DC: из AI (обычно 10-15 для лёгкого сбора, 25-40 для сложного)
    const targetDc = action.ai_custom_dc || 12;

    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod + skillCheckBonus, targetDc, proficiency, advantage, disadvantage);


    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    // ============================================
    // Improper tool usage: всегда применяем (если есть)
    // ============================================
    if (action.improper_tool_usage?.is_improper) {
      const usedItem = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;
      if (usedItem) {
        const durMutation = this.buildDurabilityMutation(usedItem, action.improper_tool_usage);
        if (durMutation) mutations.push(durMutation);
        systemFacts.push(`${player.name} использовал ${usedItem.item_name} не по назначению при сборе.`);
      }
    }

    // Если действие оказалось наблюдением/следами, а не сбором физических предметов
    if (resolved.is_observation || isAbstractObservation(targetItem)) {
      if (!roll.success) {
        systemFacts.push(`${player.name} попытался изучить окружение (${targetItem}), но ничего конкретного не разобрал.`);
        return {
          result: {
            action_type: this.action_type,
            success: false,
            dice_roll: roll,
            details: `Не удалось разобрать ${targetItem}`,
          },
          mutations,
          system_facts: systemFacts,
        };
      }
      systemFacts.push(`${player.name} внимательно изучил окружение и подметил важные детали: ${targetItem}.`);
      return {
        result: {
          action_type: this.action_type,
          success: true,
          dice_roll: roll,
          details: `Изучены ${targetItem}`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    if (!roll.success) {
      systemFacts.push(`${player.name} не смог собрать ${targetItem} (${roll.total} vs DC=${targetDc}${skillCheckBonus > 0 ? ` [бонус навыка +${skillCheckBonus}]` : ""}).`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: `Не удалось собрать ${targetItem}`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Успех: INSERT_ITEM
    // ============================================
    // Бросок d100 для базового количества (1-3 единиц)
    let quantity = Math.min(3, Math.max(1, Math.ceil(rollD100() / 33.33))); // 1, 2 или 3

    // Бонус шанса находок от навыка Собирательства (до +60% на 100 ур.)
    if (findChanceBonusPct > 0 && Math.random() * 100 < findChanceBonusPct) {
      quantity += 1;
    }

    const newItem = {
      item_name: targetItem,
      type: itemType,
      quantity,
      attributes: { harvested_at: context.session.id },
    };

    mutations.push({
      type: "INSERT_ITEM",
      owner_id: player.id,
      owner_type: "player",
      item: newItem,
    });

    systemFacts.push(`${player.name} успешно собрал ${quantity} ед. "${targetItem}"${applicableSkill ? ` (навык ${skillName} ур. ${applicableSkill.level}: +${findChanceBonusPct}% к находкам)` : ""}.`);

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        details: `Собрано ${quantity} ед. "${targetItem}"`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}
