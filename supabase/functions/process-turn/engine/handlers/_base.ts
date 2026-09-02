// supabase/functions/process-turn/engine/handlers/_base.ts
// Базовый класс для хендлеров действий

import { ActionHandler, ActionHandlerResult, EngineInputContext, ActionResult, EngineMutation, EnginePlayer, EngineNpc } from "../types.ts";
import { RouterAction, ImproperToolUsage, StatToCheck } from "../../types.ts";
import { getStatModifier, getProficiencyBonus, performAttackRoll, rollDamage, parseDiceString, rollD100 } from "../dice.ts";

/**
 * Базовый хендлер с утилитами
 */
export abstract class BaseActionHandler implements ActionHandler {
  abstract readonly action_type: string;
  abstract handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult;

  // ============================================
  // Утилиты
  // ============================================

  protected getStatMod(player: EnginePlayer, statName: string, injuryMod: number = 0): number {
    const baseMod = getStatModifier(player.stats[statName] || 10);
    return baseMod + injuryMod;
  }

  protected getProficiency(player: EnginePlayer): number {
    return getProficiencyBonus(player.level || 1);
  }

  protected getStatToCheckMod(player: EnginePlayer, stat: StatToCheck, injuryPenalties: Record<string, number> = {}): number {
    // Маппинг StatToCheck → стат игрока
    const statMap: Record<StatToCheck, string> = {
      strength: "STR",
      dexterity: "DEX",
      stealth: "DEX", // скрытность = DEX
      survival: "WIS", // выживание = WIS
      investigation: "INT",
      insight: "WIS",
      none: "STR", // fallback
    };
    const statName = statMap[stat];
    const baseMod = this.getStatMod(player, statName, injuryPenalties[statName] || 0);
    return baseMod;
  }

  protected findItemById(player: EnginePlayer, itemId: string): EnginePlayer["inventory"][0] | null {
    return player.inventory.find((i) => i.id === itemId) || null;
  }

  protected findNpcById(context: EngineInputContext, npcId: string): EngineNpc | null {
    return context.targets.npcs.get(npcId) || null;
  }

  protected findPlayerById(context: EngineInputContext, playerId: string): EnginePlayer | null {
    return context.targets.players.get(playerId) || null;
  }

  /**
   * Парсит дайсы урона из атрибутов предмета или возвращает дефолт
   */
  protected getWeaponDamage(item: EnginePlayer["inventory"][0] | null, defaultDice: string = "1d4"): string {
    if (!item) return defaultDice;
    const attrs = item.attributes || {};
    if (typeof attrs.damage_dice === "string") return attrs.damage_dice;
    if (typeof attrs.damage === "string") return attrs.damage;
    return defaultDice;
  }

  /**
   * Создаёт мутацию UPDATE_DURABILITY для improper_tool_usage
   */
  protected buildDurabilityMutation(item: EnginePlayer["inventory"][0], usage: ImproperToolUsage): EngineMutation | null {
    if (!usage.is_improper) return null;
    return {
      type: "UPDATE_DURABILITY",
      item_id: item.id,
      delta: -Math.abs(usage.durability_penalty || 1),
      set_broken: usage.stat_penalty === "damage",
    };
  }

  /**
   * Выполняет бросок атаки/проверки
   */
  protected performCheck(
    statMod: number,
    targetDc: number,
    proficiency: number,
    advantage: boolean = false,
    disadvantage: boolean = false
  ): { d20: number; modifier: number; total: number; target_dc: number; is_crit: boolean; is_fumble: boolean; success: boolean } {
    return performAttackRoll({
      target_dc: targetDc,
      stat_modifier: statMod,
      proficiency_bonus: proficiency,
      advantage,
      disadvantage,
    });
  }
}
