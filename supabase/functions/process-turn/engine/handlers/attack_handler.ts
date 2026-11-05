// supabase/functions/process-turn/engine/handlers/attack_handler.ts
// Обработчик атаки (и stealth_attack)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollDamage } from "../dice.ts";
import { resolveWeaponSkill } from "../../../_shared/skill_engine.ts";

export class AttackHandler extends BaseActionHandler {
  override readonly action_type: string = "attack";

  override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawActionText =
      (context as any)?.raw_action_text ||
      (context.router_output as any)?.raw_action_text ||
      (action as any)?.raw_action_text ||
      "";
    const hint = (
      (action as any).target_entity_name ||
      (action as any).target_name ||
      action.target_item_name ||
      ""
    ).trim();

    let target = this.findNpcById(context, action.target_entity_id || "")
      || this.findPlayerById(context, action.target_entity_id || "");

    // Если UUID цели не передан, пробуем сопоставить по имени/описанию среди живых NPC и игроков
    if (!target && !action.target_entity_id && hint) {
      const hintLower = hint.toLowerCase();
      for (const [_id, npc] of context.targets.npcs.entries()) {
        if (npc.is_alive !== false && npc.name) {
          const nLower = npc.name.toLowerCase();
          if (nLower.includes(hintLower) || hintLower.includes(nLower)) {
            target = npc;
            break;
          }
        }
      }
      if (!target) {
        for (const [id, p] of context.targets.players.entries()) {
          if (id !== player.id && p.name) {
            const pLower = p.name.toLowerCase();
            if (pLower.includes(hintLower) || hintLower.includes(pLower)) {
              target = p;
              break;
            }
          }
        }
      }
    }

    const isPracticeOrObjectTarget =
      !target &&
      !action.target_entity_id &&
      /ветк|сухосто|мишен|чучел|бревн|дерев|кам|пен[ья]|бутылк|ящик|бочк|замок|цеп|веревк|тренир|прицел|провер.*тетив/i.test(
        `${hint} ${rawActionText}`
      );

    // Если цель не найдена, это не выстрел по предмету, и UUID не был задан явно — берём ближайшего живого враждебного NPC
    if (!target && !action.target_entity_id && !isPracticeOrObjectTarget) {
      const hostileNpc = Array.from(context.targets.npcs.values()).find(
        (n: any) => n.is_hostile && n.is_alive !== false
      );
      if (hostileNpc) {
        target = hostileNpc;
      }
    }

    // Модификаторы (с учётом травм)
    const injuryPenalties: Record<string, number> = {};
    for (const injury of player.injuries || []) {
      if (injury.stat_penalties) {
        for (const [stat, penalty] of Object.entries(injury.stat_penalties)) {
          injuryPenalties[stat] = (injuryPenalties[stat] || 0) + penalty;
        }
      }
    }

    // Определение оружия и соответствующего боевого навыка игрока
    const weapon = action.used_item_id
      ? this.findItemById(player, action.used_item_id)
      : (player.inventory || []).find((i) => i.type === "weapon") || null;
    const weaponSkill = resolveWeaponSkill(
      weapon,
      `${(action as any).details || ""} ${action.target_item_name || ""} ${rawActionText}`
    );
    const skillInfo = player.skills?.[weaponSkill.key];
    const skillEffects = skillInfo?.effects || {};
    const skillAttackBonus = skillEffects.attack_bonus || skillEffects.accuracy_bonus || 0;
    const skillDmgBonusPct = skillEffects.damage_bonus_pct || skillEffects.ranged_damage_pct || 0;
    const critBonusPct = skillEffects.crit_chance_bonus_pct || 0;

    const defaultAttackStat = weaponSkill.key === "archery" ? "dexterity" : "strength";
    const statMod = this.getStatToCheckMod(player, action.stat_to_check || defaultAttackStat, injuryPenalties);
    const proficiency = this.getProficiency(player);

    const forceAdvantage = Boolean((action as any)._force_advantage) || this.action_type === "stealth_attack";
    const advantage = forceAdvantage || context.session.difficulty === "easy";
    const disadvantage = !forceAdvantage && context.session.difficulty === "hard";

    // Тренировочный выстрел / удар по неодушевлённому объекту окружения (ветка, мишень, замок и т.д.)
    if (isPracticeOrObjectTarget) {
      const objectName = hint || "выбранную цель";
      const targetDc = action.ai_custom_dc || 12;
      const roll = this.performCheck(statMod + skillAttackBonus, targetDc, proficiency, advantage, disadvantage);
      const isCritHit = roll.is_crit || (critBonusPct > 0 && roll.d20 >= 19);
      const mutations: EngineMutation[] = [];
      const systemFacts: string[] = [];

      if (action.improper_tool_usage?.is_improper && weapon) {
        const durMutation = this.buildDurabilityMutation(weapon, action.improper_tool_usage);
        if (durMutation) mutations.push(durMutation);
      }

      if (roll.success) {
        systemFacts.push(
          `${player.name} метко поразил цель «${objectName}» (${weapon ? weapon.item_name : weaponSkill.name}, бросок ${roll.total} vs DC=${targetDc}${isCritHit ? " — филигранное попадание!" : ""}).`
        );
      } else {
        systemFacts.push(
          `${player.name} прицелился и атаковал «${objectName}», но удар прошёл вскользь (${roll.total} vs DC=${targetDc}).`
        );
      }

      return {
        result: {
          action_type: this.action_type,
          success: roll.success ?? false,
          dice_roll: roll,
          details: roll.success
            ? `Точное попадание по «${objectName}» (${roll.total} vs ${targetDc})`
            : `Промах по «${objectName}» (${roll.total} vs ${targetDc})`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    if (!target) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          details: "Цель не найдена",
        },
        mutations: [],
        system_facts: [`${player.name} атаковал несуществующую цель.`],
      };
    }

    // ============================================
    // PvP проверка
    // ============================================
    const isNpc = "is_hostile" in target;
    if (!isNpc) {
      // Цель — другой игрок
      if (!context.session.is_pvp_enabled) {
        return {
          result: {
            action_type: this.action_type,
            success: false,
            blocked: true,
            block_reason: "PvP отключен в настройках сессии",
            details: "PvP отключен в настройках сессии",
          },
          mutations: [],
          system_facts: [`${player.name} попытался атаковать ${target.name}, но PvP отключён.`],
        };
      }
    }

    // DC: AC цели (или кастомный)
    const targetAc = target.armor_class;
    const targetDc = action.ai_custom_dc || targetAc;

    // Тактическое использование окружения в бою (жаровня, люстра, песок в глаза, стол, уступ, подсечка)
    const isEnvironmentalStunt = /жаровн|угл[ией]|люстр|песок в глаз|грязь в глаз|пина.*стол|переворачива.*стол|бочк|сталкива.*с|толка.*в огонь|подсечк|укрыт/i.test(
      rawActionText
    );

    // Кооперативная синергия (фланговый обход / атака в отряде с соратником или спутником)
    const hasCoopAllyPresent =
      Array.from(context.targets.players.keys()).some((id) => id !== player.id) ||
      Array.from(context.targets.npcs.values()).some(
        (n: any) => !n.is_hostile && n.is_alive !== false && /companion|спутник|питомец|приручен/i.test(`${(n as any).role || ""} ${((n as any).status_tags || []).join(" ")}`)
      );
    const isExplicitCoopAttack = /вместе|одновременно|с фланга|со спины|по сигналу|прикрыва|вдвоём|вдвоем|комбо/i.test(rawActionText);
    const flankingAttackBonus = (hasCoopAllyPresent && isExplicitCoopAttack) ? 2 : 0;

    const effectiveAdvantage = advantage || isEnvironmentalStunt;
    const roll = this.performCheck(
      statMod + skillAttackBonus + flankingAttackBonus,
      targetDc,
      proficiency,
      effectiveAdvantage,
      disadvantage && !effectiveAdvantage
    );

    // Дополнительный шанс крита для кинжалов/высоких боевых навыков (крит при d20 >= 19)
    const isCritHit = roll.is_crit || (critBonusPct > 0 && roll.d20 >= 19);

    const mutations: EngineMutation[] = [];
    const systemFacts: string[] = [];

    // ============================================
    // Improper tool usage: штраф прочности
    // ============================================
    if (action.improper_tool_usage?.is_improper) {
      const usedItem = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;
      if (usedItem) {
        const durMutation = this.buildDurabilityMutation(usedItem, action.improper_tool_usage);
        if (durMutation) mutations.push(durMutation);
        systemFacts.push(`${player.name} использовал ${usedItem.item_name} не по назначению.`);
      }
    }

    if (!roll.success) {
      systemFacts.push(`${player.name} промахнулся по ${target.name} (d20=${roll.d20}, total=${roll.total} vs DC=${targetDc}${skillAttackBonus > 0 ? ` [бонус навыка ${weaponSkill.name} +${skillAttackBonus}]` : ""}).`);
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          details: `Промах по ${target.name} (${roll.total} vs ${targetDc})`,
        },
        mutations,
        system_facts: systemFacts,
      };
    }

    // ============================================
    // Попадание: расчёт урона
    // ============================================
    const damageDice = this.getWeaponDamage(weapon, "1d4");
    const damageRoll = rollDamage(damageDice);

    // Крит: удваиваем кубики урона
    let totalDamage = damageRoll.total + statMod;
    if (isCritHit) {
      const critRoll = rollDamage(damageDice);
      totalDamage = (damageRoll.total + critRoll.total) + statMod;
    }

    // Бонус за тактический приём с окружением (+1d4 урона и дезориентация врага)
    if (isEnvironmentalStunt) {
      const envBonus = rollDamage("1d4").total;
      totalDamage += envBonus;
      systemFacts.push(`Тактический приём с использованием окружения приносит +${envBonus} дополнительного урона и ошеломляет противника!`);
    }

    // Бонус за слаженную фланговую атаку с соратником (+1d4)
    if (flankingAttackBonus > 0) {
      const coopBonus = rollDamage("1d4").total;
      totalDamage += coopBonus;
      systemFacts.push(`Слаженная фланговая атака с соратником (+2 к точности, +${coopBonus} бонусного урона)!`);
    }

    // Применяем растущий бонус навыка к урону (1..100)
    if (skillDmgBonusPct > 0) {
      totalDamage = Math.max(1, Math.floor(totalDamage * (1 + skillDmgBonusPct / 100)));
    }

    // Любое успешное попадание наносит минимум 1 единицу урона (базовое правило TTRPG/D&D)
    if (totalDamage < 1) totalDamage = 1;

    // Мутация HP цели
    const targetType = isNpc ? "npc" : "player";
    mutations.push({
      type: "UPDATE_HP",
      target_type: targetType,
      id: target.id,
      delta: -totalDamage,
    });

    systemFacts.push(
      `${player.name} попал по ${target.name} (d20=${roll.d20}, total=${roll.total} vs DC=${targetDc}, урон ${totalDamage}${isCritHit ? " — КРИТ" : ""}${skillDmgBonusPct > 0 ? ` [+${skillDmgBonusPct}% урона от навыка]` : ""}).`
    );

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        damage_dealt: totalDamage,
        details: `Попадание по ${target.name}: ${totalDamage} урона`,
      },
      mutations,
      system_facts: systemFacts,
    };
  }
}

/**
 * Stealth Attack — атака из скрытности (преимущество + бонусный урон)
 */
export class StealthAttackHandler extends AttackHandler {
  override readonly action_type: string = "stealth_attack";

  override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    // Выполняем базовую атаку с форсированным преимуществом
    const result = super.handle({ ...action, _force_advantage: true } as any, context);

    // Бонус +6 (1d6) к урону за скрытность при попадании (если это не чистый натур. 20 крит, где урон уже удвоен по спеке)
    if (result.result.success && result.result.dice_roll && result.result.dice_roll.is_crit !== true) {
      const bonusDmg = 6;
      result.result.damage_dealt = (result.result.damage_dealt || 0) + bonusDmg;

      const hpMutation = result.mutations.find((m) => m.type === "UPDATE_HP" && m.id === action.target_entity_id);
      if (hpMutation && hpMutation.type === "UPDATE_HP") {
        hpMutation.delta -= bonusDmg;
      } else {
        const isNpc = context.targets.npcs.has(action.target_entity_id || "");
        result.mutations.push({
          type: "UPDATE_HP",
          target_type: isNpc ? "npc" : "player",
          id: action.target_entity_id || "",
          delta: -bonusDmg,
        });
      }
      result.system_facts.push(`Скрытая атака: +${bonusDmg} бонусного урона.`);
    }

    return result;
  }
}
