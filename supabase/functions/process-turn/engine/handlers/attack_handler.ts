// supabase/functions/process-turn/engine/handlers/attack_handler.ts
// Обработчик атаки (и stealth_attack)

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollDamage } from "../dice.ts";
import { resolveWeaponSkill } from "../../../_shared/skill_engine.ts";

export class AttackHandler extends BaseActionHandler {
  readonly action_type = "attack";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const target = this.findNpcById(context, action.target_entity_id || "")
      || this.findPlayerById(context, action.target_entity_id || "");

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

    // ============================================
    // Модификаторы (с учётом травм)
    // ============================================
    const injuryPenalties: Record<string, number> = {};
    for (const injury of player.injuries || []) {
      if (injury.stat_penalties) {
        for (const [stat, penalty] of Object.entries(injury.stat_penalties)) {
          injuryPenalties[stat] = (injuryPenalties[stat] || 0) + penalty;
        }
      }
    }

    // STR-мод для melee, DEX для ranged (упрощение: STR)
    const statMod = this.getStatToCheckMod(player, action.stat_to_check || "strength", injuryPenalties);
    const proficiency = this.getProficiency(player);

    // Преимущество/помеха по сложности сессии
    let advantage = false;
    let disadvantage = false;
    if (context.session.difficulty === "easy") advantage = true;
    if (context.session.difficulty === "hard") disadvantage = true;

    // DC: AC цели (или кастомный)
    const targetAc = target.armor_class;
    const targetDc = action.ai_custom_dc || targetAc;

    // Определение оружия и соответствующего боевого навыка игрока (мечи, кинжалы, топоры, копья, луки, кулаки, магия)
    const weapon = action.used_item_id ? this.findItemById(player, action.used_item_id) : null;
    const weaponSkill = resolveWeaponSkill(weapon, action.details || "");
    const skillInfo = player.skills?.[weaponSkill.key];
    const skillEffects = skillInfo?.effects || {};
    const skillAttackBonus = skillEffects.attack_bonus || skillEffects.accuracy_bonus || 0;
    const skillDmgBonusPct = skillEffects.damage_bonus_pct || skillEffects.ranged_damage_pct || 0;
    const critBonusPct = skillEffects.crit_chance_bonus_pct || 0;

    const roll = this.performCheck(statMod + skillAttackBonus, targetDc, proficiency, advantage, disadvantage);

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

    // Применяем растущий бонус навыка к урону (1..100)
    if (skillDmgBonusPct > 0) {
      totalDamage = Math.max(1, Math.floor(totalDamage * (1 + skillDmgBonusPct / 100)));
    }

    if (totalDamage < 0) totalDamage = 0;

    // Мутация HP цели
    const targetType = isNpc ? "npc" : "player";
    mutations.push({
      type: "UPDATE_HP",
      target_type: targetType,
      id: target.id,
      delta: -totalDamage,
    });

    systemFacts.push(
      `${player.name} попал по ${target.name} (d20=${roll.d20}, total=${roll.total} vs DC=${targetDc}, урон ${totalDamage}${roll.is_crit ? " — КРИТ" : ""}${skillDmgBonusPct > 0 ? ` [+${skillDmgBonusPct}% урона от навыка]` : ""}).`
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
  readonly action_type = "stealth_attack";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    // Выполняем базовую атаку, но форсируем преимущество
    const result = super.handle(action, context);

    // Бонус +1d6 к урону за скрытность
    if (result.result.success && result.result.dice_roll && result.result.dice_roll.is_crit !== true) {
      const bonusDmg = 6; // 1d6 = 6 в среднем
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
