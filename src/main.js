// src/main.js — Точка входа приложения
import { onAuthStateChange } from './api/supabase.js';
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

// Auth state listener — handles both initial check AND OAuth callback
// Supabase client automatically processes tokens from URL hash
onAuthStateChange((user) => {
  currentUser = user;
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  if (!user) {
    renderAuth(app);
    return;
  }

  // Define routes
  router
    .add('/', () => {
      renderLobby(app, user);
    })
    .add('/auth', () => {
      renderAuth(app);
    })
    .add('/session/:id/settings', (params) => {
      renderSessionSettings(app, params.id, user);
    })
    .add('/session/:id', (params) => {
      renderGame(app, params.id, user).then((cleanup) => {
        cleanupFn = cleanup;
      });
    });

  router.resolve();
});
