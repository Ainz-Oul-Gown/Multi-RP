// src/config/hitDice.js
// Система костей хитов в стиле D&D 5e

/**
 * Кость хитов по классу
 * d6: волшебники, чародеи
 * d8: барды, жрецы, друиды, монахи, плути, колдуны
 * d10: воины, паладины, следопыты, рейнджеры
 * d12: варвары
 */
export const CLASS_HIT_DICE = {
  // d6 — хилые маги
  'волшебник': 6,
  'чародей': 6,
  'маг': 6,
  
  // d8 — средние
  'бард': 8,
  'жрец': 8,
  'друид': 8,
  'монах': 8,
  'плут': 8,
  'колдун': 8,
  'шаман': 8,
  
  // d10 — крепкие
  'воин': 10,
  'паладин': 10,
  'следопыт': 10,
  'рейнджер': 10,
  'наемник': 10,
  'рыцарь': 10,
  
  // d12 — самые живучие
  'варвар': 12,
  'берсерк': 12,
};

// Среднее значение кости (половина, округлённая вверх)
export const DIE_AVERAGE = {
  4: 3,   // d4: 2.5 → 3
  6: 4,   // d6: 3.5 → 4
  8: 5,   // d8: 4.5 → 5
  10: 6,  // d10: 5.5 → 6
  12: 7,  // d12: 6.5 → 7
  20: 11, // d20: 10.5 → 11
};

/**
 * Получить кость хитов по классу
 * @param {string} className - класс персонажа/существа
 * @returns {number} грани кости (6, 8, 10, 12)
 */
export function getHitDice(className) {
  if (!className) return 8;
  const normalized = className.toLowerCase().trim();
  return CLASS_HIT_DICE[normalized] || 8; // По умолчанию d8
}

/**
 * Получить среднее значение кости
 * @param {number} dieSides - грани кости
 * @returns {number} среднее (округлено вверх)
 */
export function getDieAverage(dieSides) {
  return DIE_AVERAGE[dieSides] || Math.ceil(dieSides / 2);
}

/**
 * Рассчитать HP по системе D&D
 * Уровень 1: макс кости + CON mod + 10
 * Каждый следующий: среднее кости + CON mod
 * 
 * @param {number} con - значение Телосложения
 * @param {number} level - уровень
 * @param {number} dieSides - грани кости хитов
 * @returns {number} HP
 */
export function calculateHpDnd(con = 10, level = 1, dieSides = 8) {
  const conMod = Math.floor((con - 10) / 2);
  const dieAvg = getDieAverage(dieSides);
  
  // Уровень 1: макс кости + CON mod + 10
  const level1Hp = dieSides + conMod + 10;
  
  if (level <= 1) return Math.max(1, level1Hp);
  
  // Каждый следующий уровень: среднее + CON mod
  const perLevelGain = dieAvg + conMod;
  const totalHp = level1Hp + (level - 1) * perLevelGain;
  
  return Math.max(1, totalHp);
}

/**
 * Получить информацию о кости хитов
 * @param {number} dieSides 
 * @returns {object} { sides, average, level1Bonus }
 */
export function getHitDiceInfo(dieSides) {
  return {
    sides: dieSides,
    average: getDieAverage(dieSides),
    max: dieSides,
  };
}

/**
 * Все доступные кости хитов
 */
export const ALL_HIT_DICE = [6, 8, 10, 12];
