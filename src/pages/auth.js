// src/pages/auth.js — Страница авторизации
import { signIn, signUp, signInWithGoogle } from '../api/supabase.js';
import { toast } from '../utils/toast.js';

export function renderAuth(container) {
  let isLogin = true;

  function render() {
    container.innerHTML = `
      <div class="page page-centered">
        <div class="auth-container">
          <div class="auth-header">
            <div class="auth-logo">⚔️</div>
            <h1 class="auth-title">MultiRP AI</h1>
            <p class="auth-subtitle">Гибридный ИИ-Движок для текстовых RPG</p>
          </div>

          <button class="btn btn-google btn-lg" id="googleBtn" style="width: 100%;">
            <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Войти через Google
          </button>

          <div class="auth-divider">
            <span>или</span>
          </div>

          <form class="auth-form" id="authForm">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="input" id="authEmail" placeholder="your@email.com" required />
            </div>

            <div class="form-group">
              <label class="form-label">Пароль</label>
              <input type="password" class="input" id="authPassword" placeholder="Минимум 6 символов" required minlength="6" />
            </div>

            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;" id="authSubmit">
              ${isLogin ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          <p class="auth-toggle">
            ${isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            <a href="#" id="authToggle">${isLogin ? 'Зарегистрироваться' : 'Войти'}</a>
          </p>
        </div>
      </div>
    `;

    document.getElementById('authToggle').addEventListener('click', (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      render();
    });

    document.getElementById('authForm').addEventListener('submit', handleSubmit);
    document.getElementById('googleBtn').addEventListener('click', handleGoogle);
  }

  async function handleGoogle() {
    const btn = document.getElementById('googleBtn');
    btn.disabled = true;
    btn.textContent = 'Перенаправление...';
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.error(err.message || 'Ошибка Google-авторизации');
      btn.disabled = false;
      btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Войти через Google`;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const submitBtn = document.getElementById('authSubmit');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Загрузка...';

    try {
      if (isLogin) {
        await signIn(email, password);
        toast.success('Добро пожаловать!');
      } else {
        await signUp(email, password);
        toast.success('Аккаунт создан! Проверьте почту для подтверждения.');
      }
    } catch (err) {
      toast.error(err.message || 'Ошибка авторизации');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? 'Войти' : 'Создать аккаунт';
    }
  }

  render();
}
