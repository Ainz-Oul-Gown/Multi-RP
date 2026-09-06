// src/api/supabase.js — Динамический клиент Supabase (с поддержкой Bring Your Own Database)
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { saveCustomDbConfig, loadCustomDbConfig, clearCustomDbConfig } from '../utils/indexedDB.js';
import { SUPABASE_FULL_SCHEMA_SQL } from '../utils/supabaseFullSchema.js';

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
 * @param {string} url
 * @param {string} anonKey
 * @param {Object} options - { onProgress?: (msg: string) => void, retries?: number, retryDelayMs?: number }
 */
export async function testDatabaseConnection(url, anonKey, options = {}) {
  const { onProgress = null, retries = 3, retryDelayMs = 1500 } = options;
  try {
    const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
    const cleanKey = String(anonKey || '').trim();
    if (!cleanUrl || !cleanKey) {
      return { success: false, error: 'URL и Anon Key обязательны' };
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return { success: false, error: 'URL должен начинаться с https:// или http://' };
    }

    onProgress?.('Проверка подключения к серверу Supabase...');

    const testClient = createClient(cleanUrl, cleanKey);

    // Функция проверки, является ли ошибка признаком отсутствия таблиц / обновления schema cache
    const isSchemaMissingError = (err) => {
      if (!err) return false;
      const msg = String(err.message || '').toLowerCase();
      const code = String(err.code || '');
      return (
        msg.includes('could not find the table') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        code === 'PGRST205' ||
        code === 'PGRST204'
      );
    };

    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      if (attempt > 1) {
        onProgress?.(`Ожидание обновления кэша схемы PostgREST (попытка ${attempt}/${retries})...`);
      } else {
        onProgress?.('Проверка готовности таблиц в базе данных...');
      }

      const { error } = await testClient.from('worlds').select('id').limit(1);

      // Если таблица отвечает штатно
      if (!error || error.code === 'PGRST116') {
        return {
          success: true,
          emptySchema: false,
          message: 'Связь с базой данных установлена, таблицы готовы!',
        };
      }

      // Если таблица отсутствует в schema cache
      if (isSchemaMissingError(error)) {
        // Если это не последняя попытка — даём паузу на случай, если пользователь только запустил DDL
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }

        // Если после всех попыток таблица не появилась:
        // Подключение к Supabase полностью валидно, но таблицы ещё не развёрнуты
        return {
          success: true,
          emptySchema: true,
          message: 'Подключение к Supabase успешно, но таблицы ещё не созданы. Скопируйте и выполните SQL-схему.',
        };
      }

      // Реальная ошибка авторизации или сети (401, Invalid API key, network timeout и т.д.)
      return {
        success: false,
        error: error.message || 'Ошибка подключения к базе',
        details: error,
      };
    }

    return {
      success: true,
      emptySchema: true,
      message: 'Подключение к Supabase успешно, но схема базы ещё не готова.',
    };
  } catch (err) {
    return { success: false, error: err.message || 'Не удалось связаться с сервером' };
  }
}

/**
 * Автоматическое развёртывание SQL схемы через Supabase Management API
 * @param {string} url - Project URL или project-ref
 * @param {string} accessToken - Supabase Personal Access Token (sbp_...)
 * @param {Object} options - { onProgress?: (msg: string) => void }
 */
export async function deployDatabaseSchema(url, accessToken, options = {}) {
  const { onProgress = null } = options;
  const cleanUrl = String(url || '').trim();
  const cleanToken = String(accessToken || '').trim();

  if (!cleanUrl) {
    return { success: false, error: 'Укажите Project URL' };
  }
  if (!cleanToken) {
    return { success: false, error: 'Укажите Supabase Access Token (начинается с sbp_)' };
  }

  // Извлекаем project ref
  let projectRef = cleanUrl;
  const match = cleanUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  if (match && match[1]) {
    projectRef = match[1];
  } else {
    projectRef = cleanUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }

  onProgress?.('Подключение к Supabase Management API...');

  try {
    onProgress?.('Развёртывание таблиц, триггеров и правил безопасности...');

    let res = null;
    let lastError = null;

    // 1. Приоритет: локальный автономный прокси (/api/supabase-mgmt) — работает напрямую через Node.js без зависимости от каких-либо баз
    if (typeof window !== 'undefined') {
      try {
        const proxyRes = await fetch(`/api/supabase-mgmt/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: SUPABASE_FULL_SCHEMA_SQL }),
        });

        if (proxyRes.ok) {
          res = proxyRes;
        } else {
          const proxyData = await proxyRes.json().catch(() => null);
          // Если это ответ от самого Supabase API (ошибка токена, проекта, прав и т.д.)
          if (proxyData && (proxyData.message || proxyData.error)) {
            return { success: false, error: `Ошибка Supabase API: ${proxyData.message || proxyData.error}` };
          }
          lastError = new Error(proxyData?.error || `Proxy HTTP ${proxyRes.status}`);
        }
      } catch (proxyErr) {
        lastError = proxyErr;
      }
    }

    // 2. Резерв: через Edge Function deploy-schema (если запущено на удалённом хостинге)
    if (!res) {
      try {
        const edgeUrl = `${SUPABASE_URL}/functions/v1/deploy-schema`;
        const edgeRes = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectRef,
            accessToken: cleanToken,
            query: SUPABASE_FULL_SCHEMA_SQL,
          }),
        });

        const edgeData = await edgeRes.json().catch(() => null);

        if (edgeRes.ok) {
          res = edgeRes;
        } else {
          const errMsg = edgeData?.error || edgeData?.message || `HTTP ${edgeRes.status}`;
          if (edgeRes.status === 400 || edgeRes.status === 401 || edgeRes.status === 404) {
            return { success: false, error: `Ошибка Supabase API: ${errMsg}` };
          }
          lastError = new Error(errMsg);
        }
      } catch (edgeErr) {
        lastError = edgeErr;
      }
    }

    // 3. Fallback: прямой запрос к api.supabase.com (для сред без ограничений CORS)
    if (!res) {
      try {
        const directRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: SUPABASE_FULL_SCHEMA_SQL }),
        });

        const directData = await directRes.json().catch(() => null);

        if (directRes.ok) {
          res = directRes;
        } else {
          const errMsg = directData?.message || directData?.error || `HTTP ${directRes.status}`;
          return { success: false, error: `Ошибка Supabase API: ${errMsg}` };
        }
      } catch (directErr) {
        lastError = directErr;
      }
    }

    if (!res) {
      return {
        success: false,
        error: `Не удалось связаться с API: ${lastError?.message || 'CORS / Network Error'}. Воспользуйтесь кнопкой «📋 SQL» для ручной вставки в Supabase SQL Editor.`,
      };
    }

    onProgress?.('Проверка готовности созданной схемы базы данных...');
    return {
      success: true,
      message: 'Все таблицы, триггеры и политики безопасности успешно развёрнуты!',
    };
  } catch (err) {
    return {
      success: false,
      error: `Ошибка развёртывания базы данных: ${err.message || err}`,
    };
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
export function subscribeToTable(table, filter, callback, onStatus) {
  const cleanFilter = filter ? filter.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
  const channelId = `realtime:${table}:${cleanFilter}:${Math.random().toString(36).slice(2, 7)}`;

  const channel = supabase
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
      try {
        callback(payload);
      } catch (err) {
        console.error(`[Realtime] Error in ${table} handler:`, err);
      }
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] ✅ Subscribed: ${table} (${cleanFilter})`);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`[Realtime] ⚠️ Channel error on ${table} (${cleanFilter}):`, err);
      } else if (status === 'TIMED_OUT') {
        console.warn(`[Realtime] ⏱️ Timeout on ${table} (${cleanFilter})`);
      } else if (status === 'CLOSED') {
        console.log(`[Realtime] 🔌 Channel closed for ${table} (${cleanFilter})`);
      }
      if (onStatus) onStatus(status, err);
    });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {
      console.warn(`[Realtime] Error removing channel ${channelId}:`, e);
    }
  };
}

// Subscribe to session chat messages
export function subscribeToSessionMessages(sessionId, callback, onStatus) {
  return subscribeToTable(
    'messages',
    `session_id=eq.${sessionId}`,
    callback,
    onStatus
  );
}

// Subscribe to session player updates (turn tracking, HP, stats)
export function subscribeToSessionPlayers(sessionId, callback, onStatus) {
  return subscribeToTable(
    'players',
    `session_id=eq.${sessionId}`,
    callback,
    onStatus
  );
}

// Subscribe to session row updates (time, location, party groups, round)
export function subscribeToSession(sessionId, callback, onStatus) {
  return subscribeToTable(
    'sessions',
    `id=eq.${sessionId}`,
    callback,
    onStatus
  );
}

// Subscribe to session turn queue updates
export function subscribeToSessionTurnQueue(sessionId, callback, onStatus) {
  return subscribeToTable(
    'turn_queue',
    `session_id=eq.${sessionId}`,
    callback,
    onStatus
  );
}

