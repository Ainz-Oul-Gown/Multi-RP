// supabase/functions/_shared/npc_combat_ai.ts
// Пошаговый боевой ИИ для NPC: тактический выбор навыка (спецатака vs базовая атака), D&D броски и расчёт урона

import { parseAIJson, cleanTextForAI } from "./utils.ts";

export interface NpcAttackDefinition {
  name: string;
  description?: string;
  damage_type?: string;
  damage_dice: string;
  is_special?: boolean;
}

export interface BattlefieldPlayer {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
  armor_class: number;
  class?: string;
}

export interface NpcTacticalDecision {
  action_type: "special_attack" | "base_attack" | "basic_attack";
  attack_name: string;
  damage_dice: string;
  damage_type: string;
  target_player_id: string;
  target_player_name: string;
  tactical_reason: string;
}

export interface NpcAttackResult {
  npc_id: string;
  npc_name: string;
  target_player_id: string;
  target_player_name: string;
  attack_name: string;
  damage_type: string;
  d20: number;
  total_attack: number;
  target_ac: number;
  is_hit: boolean;
  is_crit: boolean;
  damage: number;
  log_message: string;
  mutation: {
    type: "UPDATE_HP";
    target_type: "player";
    id: string;
    delta: number;
  };
}

function getStatMod(statValue: number): number {
  return Math.floor(((statValue || 10) - 10) / 2);
}

function getProficiencyBonus(level: number): number {
  return Math.floor(((level || 1) - 1) / 4) + 2;
}

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDice(diceStr: string): number {
  const match = (diceStr || "1d6").match(/^(\d+)d(\d+)/i);
  if (!match) return Math.floor(Math.random() * 6) + 1;
  const count = parseInt(match[1], 10) || 1;
  const sides = parseInt(match[2], 10) || 6;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += Math.floor(Math.random() * sides) + 1;
  }
  return sum;
}

/**
 * Тактический фоллбэк выбора атаки NPC (без LLM)
 */
export function buildFallbackNpcDecision(params: {
  npc: any;
  players: BattlefieldPlayer[];
}): NpcTacticalDecision {
  const { npc, players } = params;
  const target = players.slice().sort((a, b) => a.hp - b.hp)[0] || {
    id: "unknown",
    name: "Игрок",
    hp: 10,
    max_hp: 10,
    armor_class: 10,
  };

  const specialAttacks: NpcAttackDefinition[] = Array.isArray(npc.special_attacks) ? npc.special_attacks : [];
  const baseAttacks: NpcAttackDefinition[] = Array.isArray(npc.base_attacks) ? npc.base_attacks : [];

  const npcHpPercent = npc.max_hp ? (npc.hp / npc.max_hp) * 100 : 100;
  const shouldUseSpecial = specialAttacks.length > 0 && (npcHpPercent < 40 || Math.random() < 0.45);

  if (shouldUseSpecial && specialAttacks.length > 0) {
    const atk = specialAttacks[Math.floor(Math.random() * specialAttacks.length)];
    return {
      action_type: "special_attack",
      attack_name: atk.name || "Спецатака",
      damage_dice: atk.damage_dice || "2d6",
      damage_type: atk.damage_type || "fire",
      target_player_id: target.id,
      target_player_name: target.name,
      tactical_reason: "Использование мощного особого навыка против уязвимого противника",
    };
  }

  if (baseAttacks.length > 0) {
    const atk = baseAttacks[Math.floor(Math.random() * baseAttacks.length)];
    return {
      action_type: "base_attack",
      attack_name: atk.name || "Базовая атака",
      damage_dice: atk.damage_dice || "1d8",
      damage_type: atk.damage_type || "slashing",
      target_player_id: target.id,
      target_player_name: target.name,
      tactical_reason: "Применение базового боевого приёма",
    };
  }

  return {
    action_type: "basic_attack",
    attack_name: npc.category === "beast" ? "Укус и когти" : "Удар оружием",
    damage_dice: "1d6",
    damage_type: "bludgeoning",
    target_player_id: target.id,
    target_player_name: target.name,
    tactical_reason: "Стандартная физическая атака",
  };
}

/**
 * ИИ-выбор тактического действия NPC на его ходу
 */
export async function decideNpcCombatAction(params: {
  npc: any;
  players: BattlefieldPlayer[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<NpcTacticalDecision> {
  const { npc, players, openrouter_api_key, model = "xiaomi/mimo-v2.5" } = params;
  if (!players || players.length === 0) {
    return buildFallbackNpcDecision({ npc, players });
  }

  if (!openrouter_api_key) {
    return buildFallbackNpcDecision({ npc, players });
  }

  const specialAttacks = Array.isArray(npc.special_attacks) ? npc.special_attacks : [];
  const baseAttacks = Array.isArray(npc.base_attacks) ? npc.base_attacks : [];

  const prompt = `Ты — тактический боевой модуль D&D для существа/NPC.
Существо: ${npc.name} (${npc.race || "чудовище"}, роль: ${npc.role || "враг"}, уровень ${npc.level || 1}, HP ${npc.hp || 10}/${npc.max_hp || 10})
Доступные спецатаки: ${JSON.stringify(specialAttacks)}
Доступные базовые атаки: ${JSON.stringify(baseAttacks)}
Цели на поле боя (игроки): ${JSON.stringify(players.map((p) => ({ id: p.id, name: p.name, hp: p.hp, ac: p.armor_class, class: p.class })))}

Выбери действие для этого хода существа:
1. Выбери цель из списка игроков.
2. Выбери атаку: спецатаку (если ситуация требует максимального урона/эффекта) или базовую атаку.
Отвечай СТРОГО в формате JSON без markdown:
{
  "action_type": "special_attack" | "base_attack" | "basic_attack",
  "attack_name": "Название атаки",
  "damage_dice": "кубики урона, например 2d6",
  "damage_type": "slashing" | "piercing" | "fire" | "poison" и т.д.,
  "target_player_id": "uuid цели",
  "tactical_reason": "краткое объяснение тактики"
}`;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouter_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Ты — тактический ИИ боевого движка D&D. Отвечай строго валидным JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      const parsed = parseAIJson(rawContent);
      if (parsed && parsed.target_player_id && parsed.attack_name) {
        const targetP = players.find((p) => p.id === parsed.target_player_id) || players[0];
        return {
          action_type: parsed.action_type || "base_attack",
          attack_name: parsed.attack_name,
          damage_dice: parsed.damage_dice || "1d8",
          damage_type: parsed.damage_type || "slashing",
          target_player_id: targetP.id,
          target_player_name: targetP.name,
          tactical_reason: parsed.tactical_reason || "Тактическое решение ИИ",
        };
      }
    }
  } catch (err) {
    console.warn("[npc_combat_ai] LLM tactical decision failed, using fallback:", err);
  }

  return buildFallbackNpcDecision({ npc, players });
}

/**
 * Исполняет атаку NPC по правилам D&D: d20 + мод против AC игрока, урон, криты
 */
export function executeNpcAttack(params: {
  npc: any;
  targetPlayer: BattlefieldPlayer;
  decision: NpcTacticalDecision;
}): NpcAttackResult {
  const { npc, targetPlayer, decision } = params;

  const strMod = getStatMod(npc.stats?.STR || 10);
  const dexMod = getStatMod(npc.stats?.DEX || 10);
  // Используем лучший модификатор (STR или DEX)
  const statMod = Math.max(strMod, dexMod);
  const prof = getProficiencyBonus(npc.level || 1);

  const d20 = rollD20();
  const isCrit = d20 === 20;
  const isCritMiss = d20 === 1;
  const totalAttack = d20 + statMod + prof;

  const isHit = !isCritMiss && (isCrit || totalAttack >= targetPlayer.armor_class);

  let damage = 0;
  if (isHit) {
    const baseDamage = rollDice(decision.damage_dice);
    damage = Math.max(1, baseDamage + statMod);
    if (isCrit) {
      const critDamage = rollDice(decision.damage_dice);
      damage = Math.max(2, baseDamage + critDamage + statMod);
    }
  }

  const logMessage = `⚔️ [Ход NPC: ${npc.name}] атакует ${targetPlayer.name} способностью «${decision.attack_name}»! (d20=${d20}, всего=${totalAttack} vs КД=${targetPlayer.armor_class} — ${isHit ? (isCrit ? "КРИТИЧЕСКИЙ УДАР!" : "Попадание!") : "Промах!"}${isHit ? `, Урон: ${damage}` : ""})`;

  return {
    npc_id: npc.id,
    npc_name: npc.name,
    target_player_id: targetPlayer.id,
    target_player_name: targetPlayer.name,
    attack_name: decision.attack_name,
    damage_type: decision.damage_type,
    d20,
    total_attack: totalAttack,
    target_ac: targetPlayer.armor_class,
    is_hit: isHit,
    is_crit: isCrit,
    damage,
    log_message: logMessage,
    mutation: {
      type: "UPDATE_HP",
      target_type: "player",
      id: targetPlayer.id,
      delta: damage === 0 ? 0 : -damage,
    },
  };
}

export interface CompanionAttackResult {
  companion_id: string;
  companion_name: string;
  target_mob_id: string;
  target_mob_name: string;
  attack_name: string;
  d20: number;
  total_attack: number;
  target_ac: number;
  is_hit: boolean;
  is_crit: boolean;
  damage: number;
  remaining_mob_hp: number;
  is_mob_defeated: boolean;
  log_message: string;
}

/**
 * Исполняет атаку спутника по враждебному мобу (например, волку) по правилам D&D:
 * бросок d20 + мод характеристики + бонус мастерства vs КД моба, расчёт урона и победы над врагом.
 */
export function executeCompanionAttack(params: {
  companion: any;
  targetMob: { id: string; name: string; hp: number; max_hp?: number; armor_class?: number };
  attackName?: string;
  damageDice?: string;
}): CompanionAttackResult {
  const { companion, targetMob } = params;

  const strMod = getStatMod(companion.stats?.STR || 12);
  const dexMod = getStatMod(companion.stats?.DEX || 14);
  const statMod = Math.max(strMod, dexMod);
  const prof = getProficiencyBonus(companion.level || 1);

  const specialAttacks = Array.isArray(companion.special_attacks) ? companion.special_attacks : [];
  const baseAttacks = Array.isArray(companion.base_attacks) ? companion.base_attacks : [];
  let chosenAttack = baseAttacks[0];
  if (specialAttacks.length > 0 && Math.random() < 0.5) {
    chosenAttack = specialAttacks[0];
  }
  const attackName = params.attackName || chosenAttack?.name || "Точный удар клинком";
  const damageDice = params.damageDice || chosenAttack?.damage_dice || "1d8";

  const d20 = rollD20();
  const isCrit = d20 === 20;
  const isCritMiss = d20 === 1;
  const totalAttack = d20 + statMod + prof;
  const mobAc = targetMob.armor_class ?? 12;

  const isHit = !isCritMiss && (isCrit || totalAttack >= mobAc);

  let damage = 0;
  if (isHit) {
    const baseDamage = rollDice(damageDice);
    damage = Math.max(1, baseDamage + statMod);
    if (isCrit) {
      const critDamage = rollDice(damageDice);
      damage = Math.max(2, baseDamage + critDamage + statMod);
    }
  }

  const remainingHp = Math.max(0, (targetMob.hp ?? 10) - damage);
  const isMobDefeated = isHit && remainingHp <= 0;

  let outcomeText = isHit
    ? `${isCrit ? "КРИТИЧЕСКИЙ УДАР! 💥" : "Попадание! 🎯"} Нанесено ${damage} урона.`
    : "Промах! 💨";
  if (isMobDefeated) {
    outcomeText += ` 💀 Враг (${targetMob.name}) повержен(а) в бою!`;
  } else if (isHit) {
    outcomeText += ` У врага осталось ${remainingHp} HP.`;
  }

  const logMessage = `⚔️ [Ход спутника: ${companion.name}] атакует врага (${targetMob.name}) приёмом «${attackName}»! (d20: ${d20}, всего: ${totalAttack} vs КД: ${mobAc} — ${outcomeText})`;

  return {
    companion_id: companion.id,
    companion_name: companion.name,
    target_mob_id: targetMob.id,
    target_mob_name: targetMob.name,
    attack_name: attackName,
    d20,
    total_attack: totalAttack,
    target_ac: mobAc,
    is_hit: isHit,
    is_crit: isCrit,
    damage,
    remaining_mob_hp: remainingHp,
    is_mob_defeated: isMobDefeated,
    log_message: logMessage,
  };
}

