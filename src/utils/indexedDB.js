// src/utils/indexedDB.js — IndexedDB для сохранения прогресса генерации

const DB_NAME = 'MultiRP_GenerationDB';
const DB_VERSION = 1;
const STORE_NAME = 'generation_progress';

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
