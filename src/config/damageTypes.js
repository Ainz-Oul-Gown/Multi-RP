// src/config/damageTypes.js
// Предопределённые типы урона в стиле D&D с алгоритмическими свойствами

/**
 * Типы урона:
 * - dot: может наносить урон каждый ход (damage over time)
 * - half_on_save: цель может получить половину урона при успешном спасброске
 * - common_resistance: часто встречается сопротивление у существ
 * - common_vulnerability: часто встречается уязвимость
 * - ignore_armor: игнорирует физическую броню
 */

export const DAMAGE_TYPES = {
  // Физические
  slashing: {
    id: 'slashing',
    name: 'Режущий',
    nameEn: 'Slashing',
    category: 'physical',
    description: 'Урон острыми клинками, когтями',
    dot: false,
    halfOnSave: false,
    commonResistance: ['skeleton', 'construct'],
    commonVulnerability: [],
    ignoreArmor: false,
    color: '#e74c3c',
  },
  piercing: {
    id: 'piercing',
    name: 'Колющий',
    nameEn: 'Piercing',
    category: 'physical',
    description: 'Урон уколами, клыками, стрелами',
    dot: false,
    halfOnSave: false,
    commonResistance: ['skeleton', 'construct'],
    commonVulnerability: [],
    ignoreArmor: false,
    color: '#e67e22',
  },
  bludgeoning: {
    id: 'bludgeoning',
    name: 'Дробящий',
    nameEn: 'Bludgeoning',
    category: 'physical',
    description: 'Урон ударами, тупыми предметами',
    dot: false,
    halfOnSave: false,
    commonResistance: ['skeleton'],
    commonVulnerability: ['construct', 'crystal'],
    ignoreArmor: false,
    color: '#95a5a6',
  },
  
  // Стихийные
  fire: {
    id: 'fire',
    name: 'Огненный',
    nameEn: 'Fire',
    category: 'elemental',
    description: 'Урон огнём, жаром',
    dot: true,
    dotName: 'Горение',
    dotDefaultDuration: 2,
    halfOnSave: true,
    saveAbility: 'DEX',
    commonResistance: ['dragon', 'elemental_fire', 'demon'],
    commonVulnerability: ['undead', 'plant', 'ice'],
    ignoreArmor: true,
    color: '#e74c3c',
  },
  cold: {
    id: 'cold',
    name: 'Ледяной',
    nameEn: 'Cold',
    category: 'elemental',
    description: 'Урон холодом, обморожением',
    dot: false,
    halfOnSave: true,
    saveAbility: 'CON',
    commonResistance: ['ice_elemental', 'white_dragon', 'undead'],
    commonVulnerability: ['plant', 'fire_elemental'],
    ignoreArmor: true,
    color: '#3498db',
  },
  lightning: {
    id: 'lightning',
    name: 'Электрический',
    nameEn: 'Lightning',
    category: 'elemental',
    description: 'Урон молнией, электричеством',
    dot: false,
    halfOnSave: true,
    saveAbility: 'DEX',
    commonResistance: ['elemental_air', 'construct'],
    commonVulnerability: ['water', 'swimmer'],
    ignoreArmor: true,
    color: '#f1c40f',
  },
  thunder: {
    id: 'thunder',
    name: 'Звуковой',
    nameEn: 'Thunder',
    category: 'elemental',
    description: 'Урон звуковой волной, громом',
    dot: false,
    halfOnSave: true,
    saveAbility: 'CON',
    commonResistance: ['construct'],
    commonVulnerability: ['crystal', 'glass'],
    ignoreArmor: true,
    color: '#9b59b6',
  },
  
  // Магические
  acid: {
    id: 'acid',
    name: 'Кислотный',
    nameEn: 'Acid',
    category: 'magical',
    description: 'Урон кислотой, разъедание',
    dot: true,
    dotName: 'Разъедание',
    dotDefaultDuration: 2,
    halfOnSave: true,
    saveAbility: 'DEX',
    commonResistance: ['ooze', 'slime'],
    commonVulnerability: ['metal', 'stone'],
    ignoreArmor: true,
    color: '#2ecc71',
  },
  poison: {
    id: 'poison',
    name: 'Ядовитый',
    nameEn: 'Poison',
    category: 'magical',
    description: 'Урон ядом, отравление',
    dot: true,
    dotName: 'Отравление',
    dotDefaultDuration: 3,
    halfOnSave: true,
    saveAbility: 'CON',
    commonResistance: ['undead', 'construct', 'ooze', 'plant'],
    commonVulnerability: [],
    ignoreArmor: true,
    color: '#27ae60',
  },
  necrotic: {
    id: 'necrotic',
    name: 'Некротический',
    nameEn: 'Necrotic',
    category: 'magical',
    description: 'Урон тлением, жизненной силой',
    dot: false,
    halfOnSave: false,
    commonResistance: ['undead'],
    commonVulnerability: ['plant', 'celestial'],
    ignoreArmor: true,
    color: '#2c3e50',
  },
  radiant: {
    id: 'radiant',
    name: 'Лучистый',
    nameEn: 'Radiant',
    category: 'magical',
    description: 'Урон святым светом',
    dot: false,
    halfOnSave: false,
    commonResistance: ['celestial'],
    commonVulnerability: ['undead', 'fiend', 'shadow'],
    ignoreArmor: true,
    color: '#f39c12',
  },
  psychic: {
    id: 'psychic',
    name: 'Психический',
    nameEn: 'Psychic',
    category: 'magical',
    description: 'Урон разумом, ментальная атака',
    dot: false,
    halfOnSave: true,
    saveAbility: 'WIS',
    commonResistance: ['construct', 'undead'],
    commonVulnerability: [],
    ignoreArmor: true,
    color: '#8e44ad',
  },
  force: {
    id: 'force',
    name: 'Силовой',
    nameEn: 'Force',
    category: 'magical',
    description: 'Чистая магическая энергия',
    dot: false,
    halfOnSave: true,
    saveAbility: 'STR',
    commonResistance: [],
    commonVulnerability: [],
    ignoreArmor: true,
    color: '#1abc9c',
  },
};

// Категории урона
export const DAMAGE_CATEGORIES = {
  physical: { name: 'Физический', icon: '⚔️' },
  elemental: { name: 'Стихийный', icon: '🌀' },
  magical: { name: 'Магический', icon: '✨' },
};

// Получить тип урона по ID
export function getDamageType(id) {
  return DAMAGE_TYPES[id] || DAMAGE_TYPES.physical;
}

// Получить все типы урона в виде массива
export function getAllDamageTypes() {
  return Object.values(DAMAGE_TYPES);
}

// Получить типы урона по категории
export function getDamageTypesByCategory(category) {
  return Object.values(DAMAGE_TYPES).filter(dt => dt.category === category);
}

// Проверяет, может ли тип урона быть DoT
export function canBeDot(damageTypeId) {
  const dt = DAMAGE_TYPES[damageTypeId];
  return dt?.dot === true;
}

// Проверяет, можно ли спастись от урона наполовину
export function canHalfOnSave(damageTypeId) {
  const dt = DAMAGE_TYPES[damageTypeId];
  return dt?.halfOnSave === true;
}

// Получить способность для спасброска
export function getSaveAbility(damageTypeId) {
  const dt = DAMAGE_TYPES[damageTypeId];
  return dt?.saveAbility || null;
}
