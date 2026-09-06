// src/pages/auth.js — Страница авторизации с поддержкой пользовательской БД Supabase
import {
  signIn, signUp, signInWithGoogle,
  getActiveDatabaseConfig, setDatabaseConfig,
  testDatabaseConnection, generateDbInviteUrl,
} from '../api/supabase.js';
import { SUPABASE_FULL_SCHEMA_SQL } from '../utils/supabaseFullSchema.js';
import { toast } from '../utils/toast.js';

export function renderAuth(container) {
  let isLogin = true;
  let isCustomDbOpen = false;
  let isTestingDb = false;

  function render() {
    const dbConfig = getActiveDatabaseConfig();
    if (dbConfig.isCustom) {
      isCustomDbOpen = true;
    }

    let hostname = '';
    try {
      hostname = new URL(dbConfig.url).hostname;
    } catch {
      hostname = dbConfig.url;
    }

    container.innerHTML = `
      <div class="page page-centered" style="padding: 1.5rem 1rem;">
        <div class="auth-container" style="max-width: 480px;">
          <div class="auth-header">
            <div class="auth-logo">🕯️</div>
            <h1 class="auth-title">Таверна «Путник и Дракон»</h1>
            <p class="auth-subtitle">Приют искателей приключений и текстовых RPG</p>
          </div>

          ${dbConfig.isCustom ? `
            <div style="margin-bottom: 1.25rem; padding: 0.75rem 1rem; border-radius: var(--radius-md); background: rgba(212, 163, 89, 0.12); border: 1px solid var(--accent-gold); display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
              <div>
                <span class="badge badge-gold" style="margin-bottom: 4px;">🔌 Пользовательская БД</span>
                <div style="font-size: var(--fs-xs); color: #fff; word-break: break-all;">
                  Сервер: <strong>${hostname}</strong>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" id="authCopyInviteBtn" title="Скопировать ссылку для приглашения друга в эту БД">
                🔗 Пригласить в БД
              </button>
            </div>
          ` : ''}

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
            <span>или email</span>
          </div>

          <form class="auth-form" id="authForm">
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Email</label>
              <input type="email" class="input" id="authEmail" placeholder="your@email.com" required />
            </div>

            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Пароль</label>
              <input type="password" class="input" id="authPassword" placeholder="Минимум 6 символов" required minlength="6" />
            </div>

            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;" id="authSubmit">
              ${isLogin ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          <p class="auth-toggle" style="margin-top: 1rem; text-align: center;">
            ${isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            <a href="#" id="authToggle">${isLogin ? 'Зарегистрироваться' : 'Войти'}</a>
          </p>

          <!-- Секция: Подключение своей БД Supabase -->
          <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(212, 163, 89, 0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" id="customDbToggleHeader">
              <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-family: var(--font-heading); font-size: var(--fs-sm); color: var(--accent-gold); user-select: none;">
                <input type="checkbox" id="customDbCheckbox" ${dbConfig.isCustom ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--accent-gold); cursor: pointer;" />
                <span>🔌 Своя база данных Supabase</span>
              </label>
              <span style="font-size: var(--fs-xs); color: var(--text-muted);" id="customDbChevron">${isCustomDbOpen ? '▲' : '▼'}</span>
            </div>

            <div id="customDbPanel" style="display: ${isCustomDbOpen ? 'block' : 'none'}; margin-top: 1rem; padding: 1rem; background: rgba(0, 0, 0, 0.35); border-radius: var(--radius-md); border: 1px solid rgba(212, 163, 89, 0.25);">
              <p class="form-hint" style="margin-bottom: 0.75rem;">
                Подключите собственный проект Supabase. Все персонажи, миры и сессии будут сохраняться в вашей изолированной БД. Настройки сохраняются в <strong>IndexedDB</strong>.
              </p>

              <div class="form-group" style="margin-bottom: 0.75rem;">
                <label class="form-label" style="font-size: var(--fs-xs);">Project URL *</label>
                <input class="input" id="customDbUrlInput" placeholder="https://abcdefghijkl.supabase.co" value="${dbConfig.isCustom ? dbConfig.url : ''}" style="font-size: var(--fs-xs);" />
              </div>

              <div class="form-group" style="margin-bottom: 0.75rem;">
                <label class="form-label" style="font-size: var(--fs-xs);">Anon API Key *</label>
                <input class="input" id="customDbKeyInput" type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${dbConfig.isCustom ? dbConfig.anonKey : ''}" style="font-size: var(--fs-xs);" />
              </div>

              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem;">
                <button type="button" class="btn btn-primary btn-sm" id="saveCustomDbBtn" style="flex: 1; min-width: 130px;">
                  💾 Подключить
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="testCustomDbBtn" ${isTestingDb ? 'disabled' : ''}>
                  ⚡ Проверить
                </button>
                <button type="button" class="btn btn-ghost btn-sm" id="copySchemaBtn" title="Скопировать SQL для создания таблиц в Supabase">
                  📋 Схема SQL
                </button>
              </div>

              ${dbConfig.isCustom ? `
                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed rgba(212, 163, 89, 0.2); display: flex; justify-content: space-between; align-items: center;">
                  <span class="form-hint">Пригласить друга в эту БД:</span>
                  <button type="button" class="btn btn-secondary btn-sm" id="copyInviteLinkBtn2">
                    🔗 Ссылка для друзей
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

        </div>
      </div>

      <!-- Модальное окно: SQL Схема для новой БД Supabase -->
      <div class="modal-overlay" id="authSchemaModal">
        <div class="modal" style="max-width: 750px; max-height: 85vh; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h2 class="card-title" style="font-size: var(--fs-lg); margin: 0;">📋 SQL-схема для вашей БД Supabase</h2>
            <button class="btn btn-ghost btn-sm" id="closeAuthSchemaModal">✕</button>
          </div>
          <p class="form-hint" style="margin-bottom: 0.75rem;">
            Вставьте этот скрипт в <strong>SQL Editor</strong> на сайте Supabase (раздел SQL Editor → New query → Run), чтобы развернуть все таблицы, индексы и правила безопасности Multi-RP:
          </p>
          <textarea id="authSqlTextarea" class="input" style="flex: 1; min-height: 320px; font-family: monospace; font-size: var(--fs-xs); line-height: 1.4; resize: none;" readonly></textarea>
          <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="closeAuthSchemaModal2">Закрыть</button>
            <button type="button" class="btn btn-primary btn-sm" id="copyAuthSqlBtn">📋 Скопировать весь SQL</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Переключение между Входом и Регистрацией
    document.getElementById('authToggle')?.addEventListener('click', (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      render();
    });

    document.getElementById('authForm')?.addEventListener('submit', handleSubmit);
    document.getElementById('googleBtn')?.addEventListener('click', handleGoogle);

    // Чекбокс «Своя база данных Supabase»
    const checkbox = document.getElementById('customDbCheckbox');
    checkbox?.addEventListener('change', async (e) => {
      if (e.target.checked) {
        isCustomDbOpen = true;
        document.getElementById('customDbPanel').style.display = 'block';
        document.getElementById('customDbChevron').textContent = '▲';
      } else {
        // Пользователь снял галочку -> возврат к стандартной базе
        isCustomDbOpen = false;
        try {
          await setDatabaseConfig({ isCustom: false });
          toast.info('Возврат к стандартной базе данных');
          render();
        } catch (err) {
          toast.error('Ошибка переключения базы: ' + err.message);
        }
      }
    });

    // Раскрытие/сворачивание панели по клику на заголовок
    document.getElementById('customDbToggleHeader')?.addEventListener('click', (e) => {
      if (e.target.id === 'customDbCheckbox') return;
      isCustomDbOpen = !isCustomDbOpen;
      const panel = document.getElementById('customDbPanel');
      if (panel) {
        panel.style.display = isCustomDbOpen ? 'block' : 'none';
      }
      const chevron = document.getElementById('customDbChevron');
      if (chevron) {
        chevron.textContent = isCustomDbOpen ? '▲' : '▼';
      }
    });

    // Сохранить и подключить кастомную БД
    document.getElementById('saveCustomDbBtn')?.addEventListener('click', async () => {
      const urlInput = document.getElementById('customDbUrlInput')?.value?.trim();
      const keyInput = document.getElementById('customDbKeyInput')?.value?.trim();

      if (!urlInput || !keyInput) {
        toast.error('Пожалуйста, укажите Project URL и Anon Key');
        return;
      }

      if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
        toast.error('URL должен начинаться с https://');
        return;
      }

      try {
        toast.info('Проверка и сохранение подключения...');
        const check = await testDatabaseConnection(urlInput, keyInput);
        if (!check.success) {
          toast.error('Не удалось подключиться: ' + check.error);
          return;
        }

        await setDatabaseConfig({ isCustom: true, url: urlInput, anonKey: keyInput });
        toast.success('Подключение к вашей базе данных успешно настроено!');
        render();
      } catch (err) {
        toast.error('Ошибка сохранения БД: ' + (err.message || err));
      }
    });

    // Проверить подключение
    document.getElementById('testCustomDbBtn')?.addEventListener('click', async () => {
      const urlInput = document.getElementById('customDbUrlInput')?.value?.trim();
      const keyInput = document.getElementById('customDbKeyInput')?.value?.trim();

      if (!urlInput || !keyInput) {
        toast.error('Введите URL и Anon Key для проверки');
        return;
      }

      const btn = document.getElementById('testCustomDbBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Проверка...';

      try {
        const res = await testDatabaseConnection(urlInput, keyInput);
        if (res.success) {
          if (res.emptySchema) {
            toast.info('Сервер доступен! Таблицы ещё не созданы. Скопируйте схему SQL.');
          } else {
            toast.success('Связь с базой данных успешно установлена!');
          }
        } else {
          toast.error('Ошибка подключения: ' + res.error);
        }
      } catch (err) {
        toast.error('Ошибка проверки: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Проверить';
      }
    });

    // Скопировать инвайт-ссылку для подключения к этой БД
    const copyInviteHandler = () => {
      const dbConfig = getActiveDatabaseConfig();
      if (!dbConfig.isCustom) {
        toast.info('Инвайт-ссылка доступна при активной пользовательской БД');
        return;
      }
      const url = generateDbInviteUrl(dbConfig.url, dbConfig.anonKey);
      navigator.clipboard.writeText(url);
      toast.success('Инвайт-ссылка в вашу БД скопирована! Отправьте её другу для совместной игры.');
    };

    document.getElementById('authCopyInviteBtn')?.addEventListener('click', copyInviteHandler);
    document.getElementById('copyInviteLinkBtn2')?.addEventListener('click', copyInviteHandler);

    // Модальное окно SQL Схемы
    const openSqlModal = () => {
      const modal = document.getElementById('authSchemaModal');
      const textarea = document.getElementById('authSqlTextarea');
      if (textarea) textarea.value = SUPABASE_FULL_SCHEMA_SQL;
      if (modal) modal.classList.add('open');
    };

    document.getElementById('copySchemaBtn')?.addEventListener('click', openSqlModal);

    const closeSqlModal = () => {
      document.getElementById('authSchemaModal')?.classList.remove('open');
    };
    document.getElementById('closeAuthSchemaModal')?.addEventListener('click', closeSqlModal);
    document.getElementById('closeAuthSchemaModal2')?.addEventListener('click', closeSqlModal);

    document.getElementById('copyAuthSqlBtn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(SUPABASE_FULL_SCHEMA_SQL);
        toast.success('SQL-скрипт скопирован в буфер обмена! Вставьте его в Supabase SQL Editor.');
      } catch (err) {
        toast.error('Не удалось скопировать: ' + err.message);
      }
    });
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
        toast.success('Добро пожаловать в таверну!');
      } else {
        await signUp(email, password);
        toast.success('Аккаунт создан! Проверьте почту для подтверждения или войдите.');
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
