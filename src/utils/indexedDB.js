// src/utils/indexedDB.js — IndexedDB для сохранения прогресса генерации

const DB_NAME = 'MultiRP_GenerationDB';
const DB_VERSION = 2;
const STORE_NAME = 'generation_progress';
const DB_CONFIG_STORE = 'custom_db_config';

let db = null;

// Initialize DB
async function initDB() {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'worldId' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!database.objectStoreNames.contains(DB_CONFIG_STORE)) {
        database.createObjectStore(DB_CONFIG_STORE, { keyPath: 'id' });
      }
    };
  });
}

// Save generation progress
export async function saveProgress(worldId, data) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const record = {
      worldId,
      ...data,
      updatedAt: Date.now(),
    };
    
    await new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log('[IndexedDB] Progress saved for world:', worldId);
  } catch (err) {
    console.error('[IndexedDB] Save error:', err);
  }
}

// Load generation progress
export async function loadProgress(worldId) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    return await new Promise((resolve, reject) => {
      const request = store.get(worldId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Load error:', err);
    return null;
  }
}

// Delete progress
export async function deleteProgress(worldId) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.delete(worldId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Delete error:', err);
  }
}

// Get all incomplete generations
export async function getIncompleteGenerations() {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    return await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result.filter(r => r.status !== 'completed');
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Get incomplete error:', err);
    return [];
  }
}

// ============================================
// CUSTOM SUPABASE DATABASE CONFIGURATION
// ============================================

let memoryDbConfig = null;

// Save custom DB configuration to IndexedDB (and sync to localStorage)
export async function saveCustomDbConfig(config) {
  const record = {
    id: 'active_db',
    isCustom: Boolean(config.isCustom),
    url: config.url ? String(config.url).trim().replace(/\/+$/, '') : '',
    anonKey: config.anonKey ? String(config.anonKey).trim() : '',
    updatedAt: Date.now(),
  };
  memoryDbConfig = record;

  try {
    const database = await initDB();
    const tx = database.transaction(DB_CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(DB_CONFIG_STORE);
    
    await new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('multirp_custom_db', JSON.stringify(record));
      } catch {}
    }
    
    console.log('[IndexedDB] Custom DB config saved:', record.url || '(default)');
    return record;
  } catch (err) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('multirp_custom_db', JSON.stringify(record));
      } catch {}
    }
    return record;
  }
}

// Load custom DB configuration from IndexedDB (fallback to localStorage)
export async function loadCustomDbConfig() {
  try {
    const database = await initDB();
    const tx = database.transaction(DB_CONFIG_STORE, 'readonly');
    const store = tx.objectStore(DB_CONFIG_STORE);
    
    return await new Promise((resolve, reject) => {
      const request = store.get('active_db');
      request.onsuccess = () => {
        if (request.result) {
          memoryDbConfig = request.result;
          resolve(request.result);
        } else if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem('multirp_custom_db');
            const parsed = raw ? JSON.parse(raw) : null;
            memoryDbConfig = parsed;
            resolve(parsed);
          } catch {
            resolve(memoryDbConfig);
          }
        } else {
          resolve(memoryDbConfig);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('multirp_custom_db');
        if (raw) {
          memoryDbConfig = JSON.parse(raw);
          return memoryDbConfig;
        }
      } catch {}
    }
    return memoryDbConfig;
  }
}

// Clear custom DB configuration (reset to default)
export async function clearCustomDbConfig() {
  memoryDbConfig = null;
  try {
    const database = await initDB();
    const tx = database.transaction(DB_CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(DB_CONFIG_STORE);
    
    await new Promise((resolve, reject) => {
      const request = store.delete('active_db');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('multirp_custom_db');
      } catch {}
    }
    console.log('[IndexedDB] Custom DB config cleared');
  } catch (err) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('multirp_custom_db');
      } catch {}
    }
  }
}
