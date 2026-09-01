// src/utils/generationStore.js — Сохранение прогресса генерации и состояния страницы

const STORAGE_PREFIX = 'multirp_gen_';
const STATE_KEY = 'multirp_state';

// Save generation progress for a world
export function saveGenerationProgress(worldId, progress) {
  try {
    const key = `${STORAGE_PREFIX}${worldId}`;
    const data = {
      ...progress,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('[genStore] Saved progress for world:', worldId, data);
  } catch (err) {
    console.error('[genStore] Save error:', err);
  }
}

// Load generation progress for a world
export function loadGenerationProgress(worldId) {
  try {
    const key = `${STORAGE_PREFIX}${worldId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[genStore] Load error:', err);
    return null;
  }
}

// Clear generation progress
export function clearGenerationProgress(worldId) {
  try {
    const key = `${STORAGE_PREFIX}${worldId}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.error('[genStore] Clear error:', err);
  }
}

// Save page state (active tab, open modals, etc.)
export function savePageState(state) {
  try {
    const data = {
      ...state,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[genStore] Save state error:', err);
  }
}

// Load page state
export function loadPageState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[genStore] Load state error:', err);
    return null;
  }
}

// Clear page state
export function clearPageState() {
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch (err) {
    console.error('[genStore] Clear state error:', err);
  }
}
