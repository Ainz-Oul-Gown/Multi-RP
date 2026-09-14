// src/main.js — Точка входа приложения
import { onAuthStateChange, initDatabaseFromStorageOrUrl } from './api/supabase.js';
import { renderAuth } from './pages/auth.js';
import { renderLobby } from './pages/lobby.js';
import { renderSessionSettings } from './pages/session-settings.js';
import { renderGame } from './pages/game.js';
import { router } from './router.js';
import './styles/main.css';
import './styles/game.css';

const app = document.getElementById('app');
let currentUser = null;
let cleanupFn = null;

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Show loading state while Supabase resolves auth
app.innerHTML = '<div class="page page-centered"><p style="color: var(--text-muted);">Загрузка...</p></div>';

// Define routes once
router
  .add('/', () => {
    renderLobby(app, currentUser);
  })
  .add('/auth', () => {
    renderAuth(app);
  })
  .add('/session/:id/settings', (params) => {
    renderSessionSettings(app, params.id, currentUser);
  })
  .add('/session/:id', (params) => {
    renderGame(app, params.id, currentUser).then((cleanup) => {
      cleanupFn = cleanup;
    });
  });

async function bootstrap() {
  console.log('[Bootstrap] Starting...');
  // Асинхронно считываем конфигурацию БД (URL-инвайт или сохраненную в IndexedDB)
  await initDatabaseFromStorageOrUrl();
  console.log('[Bootstrap] DB config loaded, registering auth listener...');

  let isInitialAuth = true;

  // Auth state listener — handles both initial check AND OAuth callback
  onAuthStateChange((user) => {
    console.log('[Bootstrap] onAuthStateChange fired! user:', user?.id || 'null');
    // Если статус авторизации не изменился
    if (!isInitialAuth && currentUser === user) return;
    if (!isInitialAuth && currentUser && user && currentUser.id === user.id) {
      currentUser = user;
      return;
    }
    isInitialAuth = false;

    currentUser = user;
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }

    if (!user) {
      console.log('[Bootstrap] No user — rendering auth page');
      renderAuth(app);
      return;
    }

    console.log('[Bootstrap] User found — resolving router for:', window.location.hash);
    router.resolve();
  });
  console.log('[Bootstrap] Auth listener registered, waiting for callback...');
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  renderAuth(app);
});
