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
