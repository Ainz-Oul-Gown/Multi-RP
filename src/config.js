// src/config.js — Конфигурация приложения
// Замените значения на свои после создания проекта в Supabase
import { getHitDice, calculateHpDnd } from './config/hitDice.js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
export const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';

// AI Model Configuration
export const AI_MODEL = 'xiaomi/mimo-v2.5';
export const AI_PARSER_RETRIES = 3;
export const AI_PARSER_TIMEOUT = 15000;
export const AI_NARRATOR_TIMEOUT = 30000;

// Model options for card generation (бестиарий, NPC, география)
export const CARD_GENERATION_MODELS = [
  // ── Бесплатные (рекомендуется) ──
  { id: 'google/gemma-4-31b-it:free',            name: '⭐ Gemma 4 31B (free) — рекомендуем',    provider: 'Google' },
  { id: 'minimax/minimax-m3:free',                name: 'MiniMax M3 (free) — отличный русский', provider: 'MiniMax' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)',          provider: 'NVIDIA' },
  { id: 'minimax/minimax-m2.7:free',              name: 'MiniMax M2.7 (free)',                   provider: 'MiniMax' },
  { id: 'openrouter/free',                        name: 'Auto Free (случайная free-модель)',      provider: 'OpenRouter' },
  // ── Платные (лучшее качество) ──
  { id: 'google/gemini-flash-1.5',                name: '💎 Gemini Flash 1.5 (~$0.075/1M) — лучший JSON', provider: 'Google' },
  { id: 'openai/gpt-4o-mini',                     name: '💎 GPT-4o Mini (~$0.15/1M) — отличный русский',  provider: 'OpenAI' },
  { id: 'xiaomi/mimo-v2.5',                       name: 'MiMo v2.5',                             provider: 'Xiaomi' },
];

// Model options for DM (narrator / рассказчик)
export const DM_MODELS = [
  // ── Бесплатные ──
  { id: 'google/gemma-4-31b-it:free',            name: '⭐ Gemma 4 31B (free) — топ нарратив',  provider: 'Google' },
  { id: 'minimax/minimax-m3:free',                name: 'MiniMax M3 (free) — богатый слог',      provider: 'MiniMax' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)',          provider: 'NVIDIA' },
  { id: 'minimax/minimax-m2.7:free',              name: 'MiniMax M2.7 (free)',                   provider: 'MiniMax' },
  { id: 'openrouter/free',                        name: 'Auto Free',                             provider: 'OpenRouter' },
  // ── Платные ──
  { id: 'google/gemini-flash-1.5',                name: '💎 Gemini Flash 1.5 (~$0.30/1M) — скорость+качество', provider: 'Google' },
  { id: 'openai/gpt-4o-mini',                     name: '💎 GPT-4o Mini (~$0.60/1M) — лучший нарратив',       provider: 'OpenAI' },
  { id: 'anthropic/claude-3-haiku',               name: '💎 Claude 3 Haiku (~$1.25/1M) — превосходный текст', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-5-haiku',             name: '💎 Claude 3.5 Haiku (~$4/1M) — топ качество',        provider: 'Anthropic' },
  { id: 'openai/gpt-4o',                          name: '💎 GPT-4o (~$10/1M) — максимум',                     provider: 'OpenAI' },
  { id: 'xiaomi/mimo-v2.5',                       name: 'MiMo v2.5',                                         provider: 'Xiaomi' },
];

// Model options for GPS (время и локация)
export const GPS_MODELS = [
  // ── Бесплатные (достаточно для GPS) ──
  { id: 'google/gemma-4-31b-it:free',            name: '⭐ Gemma 4 31B (free) — рекомендуем',   provider: 'Google' },
  { id: 'minimax/minimax-m3:free',                name: 'MiniMax M3 (free)',                     provider: 'MiniMax' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)',          provider: 'NVIDIA' },
  { id: 'openrouter/free',                        name: 'Auto Free',                             provider: 'OpenRouter' },
  // ── Платные (если нужна максимальная надёжность) ──
  { id: 'google/gemini-flash-1.5',                name: '💎 Gemini Flash 1.5 — надёжный JSON',     provider: 'Google' },
  { id: 'openai/gpt-4o-mini',                     name: '💎 GPT-4o Mini',                         provider: 'OpenAI' },
  { id: 'xiaomi/mimo-v2.5',                       name: 'MiMo v2.5',                             provider: 'Xiaomi' },
];

// Model options for Satellite (парсер намерений игрока)
export const SATELLITE_MODELS = [
  // ── Бесплатные ──
  { id: 'google/gemma-4-31b-it:free',            name: '⭐ Gemma 4 31B (free) — рекомендуем',   provider: 'Google' },
  { id: 'minimax/minimax-m3:free',                name: 'MiniMax M3 (free)',                     provider: 'MiniMax' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)',          provider: 'NVIDIA' },
  { id: 'openrouter/free',                        name: 'Auto Free',                             provider: 'OpenRouter' },
  // ── Платные ──
  { id: 'google/gemini-flash-1.5',                name: '💎 Gemini Flash 1.5 — идеальный JSON',   provider: 'Google' },
  { id: 'openai/gpt-4o-mini',                     name: '💎 GPT-4o Mini',                         provider: 'OpenAI' },
  { id: 'xiaomi/mimo-v2.5',                       name: 'MiMo v2.5',                             provider: 'Xiaomi' },
];

// Game Constants
export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export function calculateHpFromStats(stats = {}, level = 1, hitDie = 8) {
  const con = stats && typeof stats.CON === 'number' ? stats.CON : 10;
  // D&D система: уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
  return calculateHpDnd(con, level, hitDie);
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

export function validateAndFixStats(raw, options = {}) {
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

  if (options.forceSum72) {
    let sum = 0;
    for (const s of validStats) sum += result[s];
    const diff = 72 - sum;
    if (diff !== 0) {
      let adjustStat = 'STR';
      let maxDist = 0;
      for (const s of validStats) {
        const dist = Math.abs(result[s] - 10);
        if (dist > maxDist) {
          maxDist = dist;
          adjustStat = s;
        }
      }
      result[adjustStat] = result[adjustStat] + diff;
    }
  }

  return result;
}

export function calculateDerivedStats(stats = {}, race = 'Человек', equipment = [], raceAcBonus) {
  const safeStats = validateAndFixStats(stats);
  const initiative = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const dexMod = Math.floor(((safeStats.DEX || 10) - 10) / 2);
  const raceBonus = Number(raceAcBonus ?? 0);
  const equipmentBonus = Array.isArray(equipment)
    ? equipment.reduce((sum, item) => sum + (Number(item.ac_bonus) || 0), 0)
    : 0;
  const armorClass = 10 + dexMod + raceBonus + equipmentBonus;
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

export function getRaceAcBonus(race) {
  const map = {
    'Эльф': 0,
    'Дварф': 1,
    'Гном': 1,
    'Полурослик': 1,
    'Тифлинг': 0,
    'Драконорожденный': 0,
  };
  return Number(map[race] ?? 0);
}

export const DIFFICULTY_PRESETS = {
  easy: { label: 'Легко', modifier: 'advantage', description: 'Героям сопутствует удача, препятствия преодолеваются легко.' },
  normal: { label: 'Нормально', modifier: 'none', description: 'Сбалансированный мир со стандартными испытаниями.' },
  hard: { label: 'Хардкор', modifier: 'disadvantage', description: 'Суровый мир, где любая ошибка может стать фатальной.' },
};

export const ITEM_TYPES = [
  // Классика и Фэнтези
  'weapon', 'armor', 'shield', 'consumable', 'potion', 'food',
  'material', 'herb', 'ore', 'wood', 'gem', 'scroll',
  // Киберпанк, Научная фантастика, Постапокалипсис
  'firearm', 'energy_weapon', 'nanosuit', 'cyberware', 'implant',
  'software', 'datashard', 'gadget', 'stim', 'medicine',
  'ammo', 'energy_cell', 'scrap', 'electronics', 'chemical',
  // Общие категории
  'tool', 'quest', 'currency', 'misc'
];

export const ITEM_TYPE_META = {
  // Фэнтези
  weapon: { label: 'Оружие', icon: '⚔️', badge: 'primary' },
  armor: { label: 'Броня', icon: '🛡️', badge: 'info' },
  shield: { label: 'Щит', icon: '🛡️', badge: 'info' },
  consumable: { label: 'Расходник', icon: '🍞', badge: 'gold' },
  potion: { label: 'Зелье', icon: '🧪', badge: 'gold' },
  food: { label: 'Еда', icon: '🍖', badge: 'gold' },
  material: { label: 'Материал', icon: '📦', badge: 'secondary' },
  herb: { label: 'Растение/Трава', icon: '🌿', badge: 'success' },
  ore: { label: 'Руда/Металл', icon: '⛏️', badge: 'secondary' },
  wood: { label: 'Древесина', icon: '🪵', badge: 'secondary' },
  gem: { label: 'Самоцвет', icon: '💎', badge: 'gold' },
  scroll: { label: 'Свиток', icon: '📜', badge: 'info' },

  // Киберпанк и Sci-Fi
  firearm: { label: 'Огнестрел', icon: '🔫', badge: 'danger' },
  energy_weapon: { label: 'Энергооружие', icon: '⚡', badge: 'danger' },
  nanosuit: { label: 'Экзокостюм', icon: '🦿', badge: 'info' },
  cyberware: { label: 'Киберимплант', icon: '🦾', badge: 'primary' },
  implant: { label: 'Биоимплант', icon: '🧬', badge: 'primary' },
  software: { label: 'Программа/Софт', icon: '💾', badge: 'info' },
  datashard: { label: 'Дата-чип', icon: '💽', badge: 'info' },
  gadget: { label: 'Гаджет', icon: '📱', badge: 'primary' },
  stim: { label: 'Стимулятор', icon: '💉', badge: 'warning' },
  medicine: { label: 'Медикаменты', icon: '💊', badge: 'success' },
  ammo: { label: 'Боеприпасы', icon: '🎯', badge: 'warning' },
  energy_cell: { label: 'Энергоячейка', icon: '🔋', badge: 'gold' },
  scrap: { label: 'Металлолом', icon: '⚙️', badge: 'secondary' },
  electronics: { label: 'Электроника', icon: '🔌', badge: 'info' },
  chemical: { label: 'Химикат/Реагент', icon: '⚗️', badge: 'warning' },

  // Универсальные
  tool: { label: 'Инструмент', icon: '🔨', badge: 'secondary' },
  quest: { label: 'Квестовый', icon: '⭐', badge: 'gold' },
  currency: { label: 'Валюта', icon: '🪙', badge: 'gold' },
  misc: { label: 'Разное', icon: '🎒', badge: 'secondary' },
};

export function getItemMeta(type) {
  const normalized = (type || 'misc').toLowerCase().trim();
  return ITEM_TYPE_META[normalized] || { label: normalized, icon: '🎒', badge: 'secondary' };
}

// Routes
export const ROUTES = {
  LOBBY: '/',
  SESSION_SETTINGS: '/session/:id/settings',
  GAME: '/session/:id',
  AUTH: '/auth',
};
