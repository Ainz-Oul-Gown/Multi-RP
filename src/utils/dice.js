// src/utils/dice.js
// Утилита для бросков кубиков в стиле D&D

/**
 * Парсит строку кубиков формата "XdY+Z" или "XdY-Z"
 * @param {string} diceStr - строка типа "1d6", "3d4+2", "2d8-1"
 * @returns {object} { count, sides, bonus, raw }
 */
export function parseDice(diceStr) {
  if (!diceStr || typeof diceStr !== 'string') {
    return { count: 1, sides: 6, bonus: 0, raw: '1d6' };
  }
  
  const cleaned = diceStr.toString().toLowerCase().replace(/\s/g, '');
  const match = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  
  if (!match) {
    // Пробуем распознать просто число
    const num = parseInt(cleaned, 10);
    if (!isNaN(num)) {
      return { count: 0, sides: 0, bonus: num, raw: cleaned };
    }
    return { count: 1, sides: 6, bonus: 0, raw: '1d6' };
  }
  
  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    bonus: match[3] ? parseInt(match[3], 10) : 0,
    raw: cleaned,
  };
}

/**
 * Бросает один кубик
 * @param {number} sides - количество граней
 * @returns {number} результат броска
 */
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Бросает кубики по строке формата "XdY+Z"
 * @param {string} diceStr - строка типа "1d6", "3d4+2"
 * @returns {object} { total, rolls, bonus, raw }
 */
export function rollDice(diceStr) {
  const { count, sides, bonus, raw } = parseDice(diceStr);
  
  if (count === 0) {
    return { total: bonus, rolls: [], bonus, raw };
  }
  
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  
  const rollsTotal = rolls.reduce((a, b) => a + b, 0);
  
  return {
    total: rollsTotal + bonus,
    rolls,
    bonus,
    raw,
  };
}

/**
 * Бросает кубики и возвращает только число (для быстрого расчёта)
 * @param {string} diceStr 
 * @returns {number}
 */
export function rollDamage(diceStr) {
  return rollDice(diceStr).total;
}

/**
 * Бросает  Initiative (1d20 + модификатор)
 * @param {number} modifier - модификатор ловкости
 * @returns {object} { total, roll, modifier }
 */
export function rollInitiative(modifier = 0) {
  const roll = rollDie(20);
  return {
    total: roll + modifier,
    roll,
    modifier,
  };
}

/**
 * Бросок спасброска (1d20 + модификатор)
 * @param {number} modifier - модификатор способности
 * @returns {object} { total, roll, modifier }
 */
export function rollSave(modifier = 0) {
  const roll = rollDie(20);
  return {
    total: roll + modifier,
    roll,
    modifier,
  };
}

/**
 * Проверка попадания по КД
 * @param {number} attackBonus - бонус атаки
 * @param {number} targetAC - класс брони цели
 * @returns {object} { hit, roll, total, critical }
 */
export function rollAttack(attackBonus, targetAC) {
  const roll = rollDie(20);
  const isCritical = roll === 20;
  const isFumble = roll === 1;
  
  return {
    hit: isCritical || (!isFumble && roll + attackBonus >= targetAC),
    roll,
    total: roll + attackBonus,
    critical: isCritical,
    fumble: isFumble,
  };
}

/**
 * Рассчитывает средний урон от кубиков (для балансировки)
 * @param {string} diceStr 
 * @returns {number}
 */
export function getAverageDamage(diceStr) {
  const { count, sides, bonus } = parseDice(diceStr);
  if (count === 0) return bonus;
  return count * ((sides + 1) / 2) + bonus;
}

/**
 * Рассчитывает минимальный и максимальный урон
 * @param {string} diceStr 
 * @returns {object} { min, max }
 */
export function getDamageRange(diceStr) {
  const { count, sides, bonus } = parseDice(diceStr);
  return {
    min: count * 1 + bonus,
    max: count * sides + bonus,
  };
}

/**
 * Форматирует строку кубиков для отображения
 * @param {string} diceStr 
 * @returns {string}
 */
export function formatDice(diceStr) {
  const { count, sides, bonus } = parseDice(diceStr);
  if (count === 0) return bonus.toString();
  
  let result = `${count}d${sides}`;
  if (bonus > 0) result += `+${bonus}`;
  if (bonus < 0) result += `${bonus}`;
  
  return result;
}

/**
 * Генерирует строку кубиков на основе уровня и тира
 * @param {number} level - уровень существа
 * @param {number} tier - тир существа
 * @param {boolean} isSpecial - спецатака (больше урона)
 * @returns {string} строка типа "2d6+3"
 */
export function generateDamageDice(level, tier, isSpecial = false) {
  // Базовое количество кубиков от уровня
  // Level 1-10: 1 die, 11-20: 2 dice, 21-30: 3 dice, etc.
  const dieCount = Math.max(1, Math.min(10, Math.ceil(level / 10)));
  
  // Грани кубика от тира
  // Tier 1: d4, Tier 2: d6, Tier 3: d8, Tier 4: d10, Tier 5: d12
  const dieSides = [4, 6, 8, 10, 12][tier - 1] || 6;
  
  // Бонус от уровня и тира
  const bonus = Math.floor(level / 5) + tier;
  
  // Сецатаки наносят больше урона
  const specialMultiplier = isSpecial ? 1.5 : 1;
  const finalCount = Math.max(1, Math.round(dieCount * specialMultiplier));
  
  return `${finalCount}d${dieSides}+${bonus}`;
}

/**
 * Все стандартные грани кубиков D&D
 */
export const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];
