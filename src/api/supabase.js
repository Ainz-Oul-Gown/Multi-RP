// src/api/supabase.js — Динамический клиент Supabase (с поддержкой Bring Your Own Database)
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { saveCustomDbConfig, loadCustomDbConfig, clearCustomDbConfig } from '../utils/indexedDB.js';

let activeUrl = SUPABASE_URL;
let activeAnonKey = SUPABASE_ANON_KEY;
let activeIsCustom = false;
let activeClient = createClient(activeUrl, activeAnonKey);

// Хранилище слушателей авторизации для бесшовного переключения между БД
const authStateCallbacks = new Set();
let activeAuthSubscription = null;

function bindAuthListener() {
  if (activeAuthSubscription?.subscription?.unsubscribe) {
    try {
      activeAuthSubscription.subscription.unsubscribe();
    } catch {}
  }

  const { data } = activeClient.auth.onAuthStateChange((_event, session) => {
    const user = session?.user || null;
    for (const cb of authStateCallbacks) {
      try { cb(user); } catch (e) { console.error('Auth listener error:', e); }
    }
  });
  activeAuthSubscription = data;
}

// Запускаем слушатель для начального клиента
bindAuthListener();

/**
 * Прокси-клиент Supabase.
 * Любое обращение к supabase.from(), supabase.auth, supabase.channel()
 * автоматически адресуется к текущему активному инстансу (стандартному или кастомному).
 */
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const val = activeClient[prop];
    if (typeof val === 'function') {
      return val.bind(activeClient);
    }
    return val;
  },
  set(_target, prop, value) {
    activeClient[prop] = value;
    return true;
  },
});

export function getActiveSupabaseUrl() {
  return activeUrl;
}

export function getActiveSupabaseKey() {
  return activeAnonKey;
}

export function getActiveDatabaseConfig() {
  return {
    isCustom: activeIsCustom,
    url: activeUrl,
    anonKey: activeAnonKey,
    defaultUrl: SUPABASE_URL,
    defaultKey: SUPABASE_ANON_KEY,
  };
}

/**
 * Проверить подключение к указанной базе Supabase
 */
export async function testDatabaseConnection(url, anonKey) {
  try {
    const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
    const cleanKey = String(anonKey || '').trim();
    if (!cleanUrl || !cleanKey) {
      return { success: false, error: 'URL и Anon Key обязательны' };
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return { success: false, error: 'URL должен начинаться с https:// или http://' };
    }

    const testClient = createClient(cleanUrl, cleanKey);
    // Делаем легкий запрос к REST API Supabase
    const { error } = await testClient.from('worlds').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // Если таблицы worlds еще нет — это нормально для чистой БД, проверяем доступность auth
      if (error.message && error.message.includes('relation "worlds" does not exist')) {
        return { success: true, emptySchema: true };
      }
      return { success: false, error: error.message || 'Ошибка подключения к базе' };
    }
    return { success: true, emptySchema: false };
  } catch (err) {
    return { success: false, error: err.message || 'Не удалось связаться с сервером' };
  }
}

/**
 * Установить активную базу данных
 * @param {Object} config - { isCustom: boolean, url: string, anonKey: string }
 */
export async function setDatabaseConfig({ isCustom, url, anonKey }) {
  if (isCustom && url && anonKey) {
    const cleanUrl = String(url).trim().replace(/\/+$/, '');
    const cleanKey = String(anonKey).trim();

    activeUrl = cleanUrl;
    activeAnonKey = cleanKey;
    activeIsCustom = true;
    activeClient = createClient(activeUrl, activeAnonKey);

    await saveCustomDbConfig({ isCustom: true, url: cleanUrl, anonKey: cleanKey });
    console.log('[Supabase] Switched to custom database:', cleanUrl);
  } else {
    activeUrl = SUPABASE_URL;
    activeAnonKey = SUPABASE_ANON_KEY;
    activeIsCustom = false;
    activeClient = createClient(activeUrl, activeAnonKey);

    await clearCustomDbConfig();
    console.log('[Supabase] Switched to default database:', SUPABASE_URL);
  }

  // Переподключаем слушатель auth и уведомляем подписчиков о текущем состоянии
  bindAuthListener();
  try {
    const { data: { user } } = await activeClient.auth.getUser();
    for (const cb of authStateCallbacks) {
      try { cb(user || null); } catch {}
    }
  } catch {
    for (const cb of authStateCallbacks) {
      try { cb(null); } catch {}
    }
  }

  return getActiveDatabaseConfig();
}

/**
 * Инициализация конфигурации БД при старте приложения:
 * 1. Проверяет URL на наличие инвайт-токена (?custom_db=... или ?db_url=...)
 * 2. Если нет в URL — загружает из IndexedDB
 * 3. Если нет в IndexedDB — оставляет стандартную БД
 */
export async function initDatabaseFromStorageOrUrl() {
  let detectedConfig = null;

  // 1. Проверяем URL параметры (search и hash)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    let token = searchParams.get('custom_db');

    if (!token && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      const hashParams = new URLSearchParams(hashQuery);
      token = hashParams.get('custom_db');
    }

    if (token) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(token)));
        if (decoded?.u && decoded?.k) {
          detectedConfig = {
            isCustom: true,
            url: decoded.u,
            anonKey: decoded.k,
            fromInvite: true,
          };
        }
      } catch (tokenErr) {
        console.warn('Failed to parse custom_db invite token:', tokenErr);
      }
    } else {
      const directUrl = searchParams.get('db_url');
      const directKey = searchParams.get('db_key');
      if (directUrl && directKey) {
        detectedConfig = {
          isCustom: true,
          url: directUrl,
          anonKey: directKey,
          fromInvite: true,
        };
      }
    }
  } catch (err) {
    console.warn('Error checking URL for custom DB params:', err);
  }

  // Если обнаружен инвайт в URL — сохраняем и очищаем параметр из адресной строки
  if (detectedConfig && detectedConfig.url && detectedConfig.anonKey) {
    await setDatabaseConfig({
      isCustom: true,
      url: detectedConfig.url,
      anonKey: detectedConfig.anonKey,
    });
    // Чистим URL от токена без перезагрузки страницы
    try {
      const cleanUrl = window.location.href
        .replace(/[?&]custom_db=[^&#]*/g, '')
        .replace(/[?&]db_url=[^&#]*/g, '')
        .replace(/[?&]db_key=[^&#]*/g, '')
        .replace(/\?&/, '?')
        .replace(/\?$/, '');
      window.history.replaceState({}, document.title, cleanUrl);
    } catch {}

    return { ...detectedConfig, active: true };
  }

  // 2. Если в URL ничего не было — читаем из IndexedDB
  try {
    const saved = await loadCustomDbConfig();
    if (saved && saved.isCustom && saved.url && saved.anonKey) {
      activeUrl = saved.url;
      activeAnonKey = saved.anonKey;
      activeIsCustom = true;
      activeClient = createClient(activeUrl, activeAnonKey);
      bindAuthListener();
      console.log('[Supabase] Loaded custom DB config from IndexedDB:', activeUrl);
      return { isCustom: true, url: activeUrl, anonKey: activeAnonKey, fromInvite: false };
    }
  } catch (idbErr) {
    console.warn('[Supabase] Failed to load config from IndexedDB:', idbErr);
  }

  return { isCustom: false, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, fromInvite: false };
}

/**
 * Создать инвайт-ссылку для подключения к этой базе данных
 */
export function generateDbInviteUrl(url = activeUrl, anonKey = activeAnonKey) {
  const token = typeof btoa === 'function'
    ? btoa(JSON.stringify({ u: url, k: anonKey }))
    : Buffer.from(JSON.stringify({ u: url, k: anonKey })).toString('base64');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const basePath = typeof window !== 'undefined'
    ? (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/')
    : '/';
  return `${origin}${basePath}#/auth?custom_db=${encodeURIComponent(token)}`;
}

// Безопасный вызов Edge Functions через прямой fetch
export async function invokeFunction(functionName, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const payload = JSON.stringify(body ?? {});
  const res = await fetch(`${getActiveSupabaseUrl()}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: payload,
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Auth helpers
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/'),
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export function onAuthStateChange(callback) {
  authStateCallbacks.add(callback);
  // Сразу вызываем с текущим состоянием пользователя
  activeClient.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user || null);
  }).catch(() => callback(null));

  return () => {
    authStateCallbacks.delete(callback);
  };
}

// Realtime subscription helper
export function subscribeToTable(table, filter, callback) {
  const cleanFilter = filter ? filter.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
  const channelId = `realtime:${table}:${cleanFilter}:${Math.random().toString(36).slice(2, 7)}`;

  const channel = supabase
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, callback)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// Subscribe to session chat messages
export function subscribeToSessionMessages(sessionId, callback) {
  return subscribeToTable(
    'messages',
    `session_id=eq.${sessionId}`,
    (payload) => callback(payload)
  );
}

// Subscribe to session player updates (turn tracking)
export function subscribeToSessionPlayers(sessionId, callback) {
  return subscribeToTable(
    'players',
    `session_id=eq.${sessionId}`,
    (payload) => callback(payload)
  );
}
