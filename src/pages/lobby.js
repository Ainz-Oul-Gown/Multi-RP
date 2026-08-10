// src/pages/lobby.js — Глобальное Лобби (Dashboard)
import { supabase, signOut } from '../api/supabase.js';
import {
  getSessions, createSession, getWorlds, createWorld,
  importWorld, exportWorld, downloadJSON,
  getUserSettings, upsertUserSettings
} from '../api/game.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';

export function renderLobby(container, user) {
  let activeTab = 'sessions';
  let sessions = [];
  let worlds = [];
  let userSettings = null;

  async function loadData() {
    try {
      [sessions, worlds, userSettings] = await Promise.all([
        getSessions(), getWorlds(), getUserSettings(user.id)
      ]);
    } catch (err) {
      toast.error('Ошибка загрузки данных: ' + err.message);
    }
    render();
  }

  function render() {
    const maskedKey = userSettings?.openrouter_key
      ? userSettings.openrouter_key.slice(0, 8) + '...' + userSettings.openrouter_key.slice(-4)
      : '';

    container.innerHTML = `
      <div class="page">
        <header class="lobby-header">
          <div class="lobby-header-left">
            <h1 class="lobby-title">⚔️ MultiRP AI</h1>
            <span class="badge badge-primary">${user.email}</span>
          </div>
          <div class="lobby-header-right">
            <button class="btn btn-ghost" id="importWorldBtn">📥 Импорт мира</button>
            <button class="btn btn-ghost" id="accountSettingsBtn">⚙️ Аккаунт</button>
            <button class="btn btn-ghost" id="signOutBtn">Выйти</button>
          </div>
        </header>

        <nav class="lobby-tabs">
          <button class="lobby-tab ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions">
            🎮 Сессии (${sessions.length})
          </button>
          <button class="lobby-tab ${activeTab === 'worlds' ? 'active' : ''}" data-tab="worlds">
            🌍 Миры (${worlds.length})
          </button>
        </nav>

        <main class="lobby-content" id="lobbyContent">
          ${activeTab === 'sessions' ? renderSessions() : renderWorlds()}
        </main>
      </div>

      <!-- Модальное окно: Новая сессия -->
      <div class="modal-overlay" id="newSessionModal">
        <div class="modal">
          <h2 class="card-title" style="margin-bottom: 1rem;">Новая сессия</h2>
          <form id="newSessionForm">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Мир (Сеттинг)</label>
              <select class="input select" id="sessionWorld" required>
                <option value="">Выберите мир...</option>
                ${worlds.map((w) => `<option value="${w.id}">${w.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Сложность</label>
              <select class="input select" id="sessionDifficulty">
                <option value="normal" selected>Нормально</option>
                <option value="easy">Легко (Преимущество)</option>
                <option value="hard">Хардкор (Помеха)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 1rem; flex-direction: row; align-items: center; gap: 0.75rem;">
              <label class="form-label">PvP</label>
              <div class="toggle" id="pvpToggle"></div>
              <span class="form-hint" id="pvpLabel">Выкл</span>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeModal">Отмена</button>
              <button type="submit" class="btn btn-primary">Создать</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Модальное окно: Новый мир -->
      <div class="modal-overlay" id="newWorldModal">
        <div class="modal" style="max-width: 600px;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">🌍 Новый мир</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Опишите мир текстом — нейросеть автоматически создаст настройки (расы, классы, локации и т.д.)</p>
          <form id="newWorldForm">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Название мира *</label>
              <input class="input" id="worldName" placeholder="World of Eteria" required />
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Описание мира</label>
              <textarea class="input" id="worldDescription" rows="5"
                placeholder="Мрачное фэнтези-средневековье. Доступные расы: люди, эльфы, гномы, орки. Классы: воин, маг, плут, жрец. Мир разделён на 3 крупных королевства, между которыми идёт война. Магия редка и опасна..."
              ></textarea>
              <span class="form-hint">Опишите расы, классы, атмосферу, локации, фракции, правила — что угодно</span>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Файлы лора (необязательно)</label>
              <div class="file-drop-zone" id="fileDropZone">
                <div class="file-drop-icon">📁</div>
                <p>Перетащите файлы .txt, .md или .json<br/>или <a href="#" id="browseFilesLink">выберите файлы</a></p>
              </div>
              <div class="file-list" id="fileList"></div>
              <input type="file" id="worldFileInput" multiple accept=".txt,.md,.json" style="display: none;" />
            </div>
            <div id="aiSettingsPreview" style="display: none; margin-bottom: 1rem;">
              <label class="form-label">AI создал настройки:</label>
              <pre class="world-settings-preview" id="aiSettingsOutput"></pre>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeWorldModal">Отмена</button>
              <button type="submit" class="btn btn-primary" id="createWorldBtn">✨ Создать мир</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Скрытый input для импорта -->
      <input type="file" id="importFileInput" accept=".json" style="display: none;" />

      <!-- Модальное окно: Настройки аккаунта -->
      <div class="modal-overlay" id="accountSettingsModal">
        <div class="modal">
          <h2 class="card-title" style="margin-bottom: 1rem;">⚙️ Настройки аккаунта</h2>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">ID аккаунта</label>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <code class="invite-code" style="flex: 1; font-size: var(--fs-xs);">${user.id}</code>
              <button class="btn btn-secondary btn-sm" id="copyUserIdBtn">📋</button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label">Email</label>
            <input class="input" value="${user.email}" disabled style="opacity: 0.6;" />
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">OpenRouter API Key</label>
            <input
              class="input"
              type="password"
              id="openrouterKeyInput"
              placeholder="sk-or-v1-..."
              value="${userSettings?.openrouter_key || ''}"
              autocomplete="off"
            />
            <span class="form-hint">
              Ваш личный ключ для OpenRouter API.
              ${maskedKey ? `Текущий: <code>${maskedKey}</code>` : 'Не задан — игра не сможет вызывать ИИ.'}
            </span>
            <span class="form-hint" style="margin-top: 0.25rem;">
              Получите ключ на <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
            </span>
          </div>

          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="closeAccountModal">Отмена</button>
            <button class="btn btn-primary" id="saveAccountSettingsBtn">Сохранить</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderSessions() {
    if (!sessions.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <h3>Нет активных сессий</h3>
          <p>Создайте новую сессию или подключитесь к существующей</p>
          <button class="btn btn-primary btn-lg" id="newSessionBtn">+ Новая сессия</button>
        </div>
      `;
    }

    return `
      <div class="card-grid">
        ${sessions.map((s) => `
          <div class="card session-card" data-id="${s.id}">
            <div class="card-header">
              <span class="badge badge-${s.difficulty === 'easy' ? 'success' : s.difficulty === 'hard' ? 'primary' : 'info'}">
                ${s.difficulty === 'easy' ? 'Легко' : s.difficulty === 'hard' ? 'Хардкор' : 'Нормально'}
              </span>
              ${s.is_pvp_enabled ? '<span class="badge badge-gold">PvP</span>' : ''}
            </div>
            <h3 class="card-title">${s.worlds?.name || 'Неизвестный мир'}</h3>
            <p class="text-muted" style="margin-top: 0.5rem;">${s.current_plot_stage ? `Акт: ${s.current_plot_stage}` : 'Песочница'}</p>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-primary btn-sm" data-action="join" data-id="${s.id}">Войти</button>
              <button class="btn btn-secondary btn-sm" data-action="settings" data-id="${s.id}">⚙️</button>
            </div>
          </div>
        `).join('')}
        <div class="card session-card new-session-card" id="newSessionBtn">
          <div class="empty-state" style="padding: 2rem;">
            <div class="empty-icon">+</div>
            <p>Новая сессия</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderWorlds() {
    return `
      <div class="card-grid">
        ${worlds.map((w) => `
          <div class="card world-card">
            <div class="card-header">
              <h3 class="card-title">🌍 ${w.name}</h3>
            </div>
            <pre class="world-settings-preview">${JSON.stringify(w.settings || {}, null, 2).slice(0, 200)}</pre>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" data-action="export" data-id="${w.id}">📤 Экспорт</button>
              <button class="btn btn-ghost btn-sm" data-action="delete-world" data-id="${w.id}">🗑️</button>
            </div>
          </div>
        `).join('')}
        <div class="card world-card new-world-card" id="newWorldBtn">
          <div class="empty-state" style="padding: 2rem;">
            <div class="empty-icon">+</div>
            <p>Новый мир</p>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Tab switching
    container.querySelectorAll('.lobby-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render();
      });
    });

    // Sign out
    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
      await signOut();
    });

    // Account settings modal
    document.getElementById('accountSettingsBtn')?.addEventListener('click', () => {
      document.getElementById('accountSettingsModal').classList.add('open');
    });
    document.getElementById('closeAccountModal')?.addEventListener('click', () => {
      document.getElementById('accountSettingsModal').classList.remove('open');
    });

    // Copy User ID
    document.getElementById('copyUserIdBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(user.id);
      toast.success('ID скопирован!');
    });

    // Save account settings
    document.getElementById('saveAccountSettingsBtn')?.addEventListener('click', async () => {
      const key = document.getElementById('openrouterKeyInput').value.trim();
      const saveBtn = document.getElementById('saveAccountSettingsBtn');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';

      try {
        await upsertUserSettings(user.id, key);
        toast.success('Настройки сохранены!');
        document.getElementById('accountSettingsModal').classList.remove('open');
        loadData();
      } catch (err) {
        toast.error('Ошибка сохранения: ' + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
    });

    // New session button
    document.getElementById('newSessionBtn')?.addEventListener('click', () => {
      document.getElementById('newSessionModal').classList.add('open');
    });

    // New world button
    document.getElementById('newWorldBtn')?.addEventListener('click', () => {
      document.getElementById('newWorldModal').classList.add('open');
    });

    // Close modals
    document.getElementById('closeModal')?.addEventListener('click', () => {
      document.getElementById('newSessionModal').classList.remove('open');
    });
    document.getElementById('closeWorldModal')?.addEventListener('click', () => {
      document.getElementById('newWorldModal').classList.remove('open');
    });

    // PVP toggle
    let pvpEnabled = false;
    const pvpToggle = document.getElementById('pvpToggle');
    pvpToggle?.addEventListener('click', () => {
      pvpEnabled = !pvpEnabled;
      pvpToggle.classList.toggle('active', pvpEnabled);
      document.getElementById('pvpLabel').textContent = pvpEnabled ? 'Вкл' : 'Выкл';
    });

    // Create session form
    document.getElementById('newSessionForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const worldId = document.getElementById('sessionWorld').value;
      const difficulty = document.getElementById('sessionDifficulty').value;

      try {
        const session = await createSession({
          world_id: worldId,
          difficulty,
          is_pvp_enabled: pvpEnabled,
        });
        toast.success('Сессия создана!');
        document.getElementById('newSessionModal').classList.remove('open');
        router.navigate(`/session/${session.id}`);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

    // Create world form — text to JSON via AI
    let pendingFiles = [];

    document.getElementById('newWorldForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('worldName').value.trim();
      const description = document.getElementById('worldDescription').value.trim();
      const createBtn = document.getElementById('createWorldBtn');

      if (!name) { toast.error('Укажите название мира'); return; }

      createBtn.disabled = true;
      createBtn.textContent = '⏳ Нейросеть анализирует мир...';

      let settings = {};

      // If description provided — convert via AI
      if (description) {
        try {
          const { data, error } = await supabase.functions.invoke('convert-world-text', {
            body: { user_id: user.id, world_name: name, description },
          });
          if (error) throw error;
          settings = data.settings || {};
          // Show preview
          document.getElementById('aiSettingsPreview').style.display = 'block';
          document.getElementById('aiSettingsOutput').textContent = JSON.stringify(settings, null, 2);
        } catch (err) {
          toast.error('Ошибка AI: ' + (err.message || err));
          createBtn.disabled = false;
          createBtn.textContent = '✨ Создать мир';
          return;
        }
      }

      try {
        const world = await createWorld({ owner_id: user.id, name, settings });

        // Upload lore files if any
        if (pendingFiles.length) {
          const loreFiles = [];
          for (const file of pendingFiles) {
            const content = await file.text();
            loreFiles.push({
              world_id: world.id,
              folder: 'imported',
              title: file.name.replace(/\.[^.]+$/, ''),
              content,
              tags: [],
            });
          }
          const { error: loreErr } = await supabase.from('lore_files').insert(loreFiles);
          if (loreErr) console.error('Lore upload error:', loreErr);
        }

        toast.success(`Мир «${name}» создан! ${pendingFiles.length ? `+ ${pendingFiles.length} файл(ов) лора` : ''}`);
        document.getElementById('newWorldModal').classList.remove('open');
        pendingFiles = [];
        loadData();
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = '✨ Создать мир';
      }
    });

    // File drop zone
    const fileDropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('worldFileInput');

    fileDropZone?.addEventListener('click', () => fileInput.click());
    document.getElementById('browseFilesLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });

    fileDropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });
    fileDropZone?.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('dragover');
    });
    fileDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });

    fileInput?.addEventListener('change', (e) => {
      addFiles(e.target.files);
      fileInput.value = '';
    });

    function addFiles(fileListObj) {
      for (const file of fileListObj) {
        if (['.txt', '.md', '.json'].some(ext => file.name.endsWith(ext))) {
          pendingFiles.push(file);
        } else {
          toast.warning(`Файл «${file.name}» пропущен (поддерживаются .txt, .md, .json)`);
        }
      }
      renderFileList();
    }

    function renderFileList() {
      const el = document.getElementById('fileList');
      if (!el) return;
      el.innerHTML = pendingFiles.map((f, i) => `
        <div class="file-item">
          <span>📄 ${f.name} <span class="text-muted">(${(f.size / 1024).toFixed(1)} KB)</span></span>
          <button type="button" class="btn btn-ghost btn-sm" data-file-idx="${i}">✕</button>
        </div>
      `).join('');
      el.querySelectorAll('[data-file-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pendingFiles.splice(parseInt(btn.dataset.fileIdx), 1);
          renderFileList();
        });
      });
    }

    // Session card actions
    container.querySelectorAll('[data-action="join"]').forEach((btn) => {
      btn.addEventListener('click', () => router.navigate(`/session/${btn.dataset.id}`));
    });
    container.querySelectorAll('[data-action="settings"]').forEach((btn) => {
      btn.addEventListener('click', () => router.navigate(`/session/${btn.dataset.id}/settings`));
    });

    // Export world
    container.querySelectorAll('[data-action="export"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await exportWorld(btn.dataset.id);
          const world = worlds.find((w) => w.id === btn.dataset.id);
          downloadJSON(data, `${world?.name || 'world'}_export.json`);
          toast.success('Мир экспортирован!');
        } catch (err) {
          toast.error('Ошибка экспорта: ' + err.message);
        }
      });
    });

    // Import world
    document.getElementById('importWorldBtn')?.addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importWorld(text, user.id);
        toast.success('Мир импортирован!');
        loadData();
      } catch (err) {
        toast.error('Ошибка импорта: ' + err.message);
      }
    });

    // Delete world
    container.querySelectorAll('[data-action="delete-world"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить мир и все связанные данные?')) return;
        try {
          const { deleteWorld } = await import('../api/game.js');
          await deleteWorld(btn.dataset.id);
          toast.success('Мир удалён');
          loadData();
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });

    // Close modals on overlay click
    container.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  }

  loadData();
}
