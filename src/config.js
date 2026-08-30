// src/config.js — Конфигурация приложения
// Замените значения на свои после создания проекта в Supabase

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
export const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';

// AI Model Configuration
export const AI_MODEL = 'openrouter/xiaomi/mimo-v2.5';
export const AI_PARSER_RETRIES = 3;
export const AI_PARSER_TIMEOUT = 15000;
export const AI_NARRATOR_TIMEOUT = 30000;

// Game Constants
export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export function calculateHpFromStats(stats = {}) {
  const con = stats && typeof stats.CON === 'number' ? stats.CON : 10;
  return con * 2 + 10;
}

export function calculateInitiative(stats = {}) {
  const dex = stats && typeof stats.DEX === 'number' ? stats.DEX : 10;
  return Math.floor((dex - 10) / 2);
}

export function calculateArmorClass(stats = {}, race = 'Человек', equipment = []) {
  const dex = stats && typeof stats.DEX === 'number' ? stats.DEX : 10;
  const dexMod = Math.floor((dex - 10) / 2);

  const raceBonusMap = {
    'Эльф': 0,
    'Дварф': 1,
    'Гном': 1,
    'Полурослик': 1,
    'Тифлинг': 0,
    'Драконорожденный': 0,
  };

  const equipmentBonus = Array.isArray(equipment)
    ? equipment.reduce((sum, item) => sum + (Number(item.ac_bonus) || 0), 0)
    : 0;

  const baseAC = 10;
  const raceBonus = Number(raceBonusMap[race] || 0);
  return baseAC + dexMod + raceBonus + equipmentBonus;
}

export function calculateSavingThrows(stats = {}, proficiencyBonus = 2) {
  const result = {};

  const statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  for (const stat of statKeys) {
    const value = stats && typeof stats[stat] === 'number' ? stats[stat] : 10;
    const mod = Math.floor((value - 10) / 2);
    result[stat] = mod + proficiencyBonus;
  }

  return result;
}

export function calculateDerivedStats(stats = {}, race = 'Человек', equipment = []) {
  const safeStats = validateAndFixStats(stats);
  const initiative = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const dexMod = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const raceBonusMap = {
    'Эльф': 0,
    'Дварф': 1,
    'Гном': 1,
    'Полурослик': 1,
    'Тифлинг': 0,
    'Драконорожденный': 0,
  };
  const equipmentBonus = Array.isArray(equipment)
    ? equipment.reduce((sum, item) => sum + (Number(item.ac_bonus) || 0), 0)
    : 0;
  const armorClass = 10 + dexMod + Number(raceBonusMap[race] || 0) + equipmentBonus;
  const savingThrows = {};
  for (const s of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    const mod = Math.floor(((safeStats[s] || 10) - 10) / 2);
    savingThrows[s] = mod + 2;
  }
  return {
    stats: safeStats,
    initiative,
    armor_class: armorClass,
    saving_throws: savingThrows,
  };
}

function validateAndFixStats(raw) {
  const result = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };

  const validStats = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  for (const s of validStats) {
    const rawValue = raw?.[s];
    const num = Number(rawValue);
    const val = Number.isFinite(num) ? Math.round(num) : 10;
    result[s] = val;
  }

  return result;
}

export const DIFFICULTY_PRESETS = {
  easy: { label: 'Легко', modifier: 'advantage', description: 'Героям сопутствует удача, препятствия преодолеваются легко.' },
  normal: { label: 'Нормально', modifier: 'none', description: 'Сбалансированный мир со стандартными испытаниями.' },
  hard: { label: 'Хардкор', modifier: 'disadvantage', description: 'Суровый мир, где любая ошибка может стать фатальной.' },
};

export const ITEM_TYPES = ['weapon', 'armor', 'consumable', 'misc'];

// Routes
export const ROUTES = {
  LOBBY: '/',
  SESSION_SETTINGS: '/session/:id/settings',
  GAME: '/session/:id',
  AUTH: '/auth',
};
