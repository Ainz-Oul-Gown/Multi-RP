// supabase/functions/process-turn/engine/dice.ts
// Чистые D&D кубики для Deno/Edge runtime
// TypeScript-портировано из src/utils/dice.js

// ============================================
// Базовые броски
// ============================================

/**
 * Бросок кубика с N гранями (dN), 1..N
 */
export function rollDie(sides: number): number {
  if (sides < 1) return 0;
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Бросок d20 (1-20)
 */
export function rollD20(): number {
  return rollDie(20);
}

/**
 * Бросок d100 (1-100)
 */
export function rollD100(): number {
  return rollDie(100);
}

/**
 * Бросок с преимуществом (advantage): бросаем 2d20, берём большее
 */
export function rollD20Advantage(): { rolls: [number, number]; best: number } {
  const r1 = rollD20();
  const r2 = rollD20();
  return { rolls: [r1, r2], best: Math.max(r1, r2) };
}

/**
 * Бросок с помехой (disadvantage): бросаем 2d20, берём меньшее
 */
export function rollD20Disadvantage(): { rolls: [number, number]; worst: number } {
  const r1 = rollD20();
  const r2 = rollD20();
  return { rolls: [r1, r2], worst: Math.min(r1, r2) };
}

// ============================================
// Модификаторы характеристик
// ============================================

/**
 * Модификатор характеристики D&D: floor((STAT - 10) / 2)
 */
export function getStatModifier(statValue: number): number {
  return Math.floor((statValue - 10) / 2);
}

/**
 * Бонус proficiency (D&D правило: ceil(level / 4) + 1)
 */
export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// ============================================
// Парсинг и бросок дайсов урона
// ============================================

/**
 * Парсит строку типа "1d8+2" или "2d6" или "1d4-1" в объект
 */
export function parseDiceString(diceStr: string): { count: number; sides: number; modifier: number } | null {
  if (!diceStr || typeof diceStr !== "string") return null;
  // Поддержка: 1d8, 1d8+2, 1d8-1, 2d6+3
  const match = diceStr.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  };
}

/**
 * Бросает урон по строке типа "1d8+2"
 */
export function rollDamage(diceStr: string): { total: number; rolls: number[]; modifier: number } {
  const parsed = parseDiceString(diceStr);
  if (!parsed) {
    return { total: 0, rolls: [], modifier: 0 };
  }
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(rollDie(parsed.sides));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  return { total: sum + parsed.modifier, rolls, modifier: parsed.modifier };
}

/**
 * Генерирует строку дайсов урона по уровню и тиру
 */
export function generateDamageDice(level: number, tier: number = 1, isSpecial: boolean = false): string {
  // Базовые кубики по уровню
  let baseDie = 4;
  if (level >= 11) baseDie = 6;
  if (level >= 21) baseDie = 8;
  if (level >= 41) baseDie = 10;
  if (level >= 61) baseDie = 12;
  if (isSpecial) {
    baseDie = Math.min(12, baseDie + 2);
  }
  const count = tier >= 3 ? 2 : 1;
  return `${count}d${baseDie}`;
}

// ============================================
// Проверка попадания (Attack Roll)
// ============================================

export interface AttackRollResult {
  rolls: number[];
  chosen: number;
  modifier: number;
  total: number;
  target_dc: number;
  success: boolean;
  is_crit: boolean;
  is_fumble: boolean;
}

export interface AttackRollOptions {
  target_dc: number;
  stat_modifier: number;
  proficiency_bonus?: number;
  advantage?: boolean;
  disadvantage?: boolean;
}

/**
 * Бросок атаки против DC (AC цели или кастомный DC)
 */
export function performAttackRoll(opts: AttackRollOptions): AttackRollResult {
  const { target_dc, stat_modifier, proficiency_bonus = 0, advantage = false, disadvantage = false } = opts;

  let chosen: number;
  let rolls: number[];

  if (advantage && !disadvantage) {
    const adv = rollD20Advantage();
    rolls = [...adv.rolls];
    chosen = adv.best;
  } else if (disadvantage && !advantage) {
    const dis = rollD20Disadvantage();
    rolls = [...dis.rolls];
    chosen = dis.worst;
  } else {
    rolls = [rollD20()];
    chosen = rolls[0];
  }

  const is_crit = chosen === 20;
  const is_fumble = chosen === 1;
  const total = chosen + stat_modifier + proficiency_bonus;

  // Крит = автоуспех, фамбл = автопровал
  let success: boolean;
  if (is_crit) success = true;
  else if (is_fumble) success = false;
  else success = total >= target_dc;

  return { rolls, chosen, modifier: stat_modifier + proficiency_bonus, total, target_dc, success, is_crit, is_fumble };
}

// ============================================
// Спасброски (Saving Throws)
// ============================================

/**
 * Бросок спасброска
 */
export function performSavingThrow(
  stat_modifier: number,
  dc: number,
  proficiency_bonus: number = 0
): { roll: number; total: number; success: boolean } {
  const roll = rollD20();
  const total = roll + stat_modifier + proficiency_bonus;
  return { roll, total, success: total >= dc };
}

// ============================================
// Утилиты
// ============================================

/**
 * Бросок N костей с M гранями
 */
export function rollDice(count: number, sides: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  return rolls;
}

/**
 * Сумма бросков
 */
export function sumRolls(rolls: number[]): number {
  return rolls.reduce((a, b) => a + b, 0);
}

/**
 * Среднее дайса для D&D (1d6=3.5, 1d8=4.5, etc.)
 */
export function getDieAverage(sides: number): number {
  return (sides + 1) / 2;
}
