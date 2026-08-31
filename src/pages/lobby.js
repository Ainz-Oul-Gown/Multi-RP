// src/pages/lobby.js — Глобальное Лобби (Dashboard)
import { supabase, signOut, invokeFunction } from '../api/supabase.js';
import {
  getSessions, createSession, getWorlds, createWorld,
  importWorld, exportWorld, downloadJSON,
  getUserSettings, upsertUserSettings, updateSession,
  getCharacterCards, createCharacterCard, deleteCharacterCard,
  exportPlayer, getNpcsByWorld, updateNpc, deleteNpc, createNpc
} from '../api/game.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';
import { STATS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus } from '../config.js';

function sanitizeAIText(raw) {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  text = text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u0400-\u04FF]/g, "");
  text = text.replace(/\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi, "");
  text = text.replace(/[A-Za-z0-9+\/]{20,}={0,2}/g, "");
  text = text.replace(/https?:\/\/[^\s]+/g, "");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// Persist active tab across re-renders (e.g., when returning from file picker on mobile)
const lobbyState = {
  activeTab: 'sessions',
  currentBestiaryWorldId: null,
};

export function renderLobby(container, user) {
  let { activeTab } = lobbyState;
  let sessions = [];
  let worlds = [];
  let userSettings = null;
  let characterCards = [];
  let currentBestiaryWorldId = lobbyState.currentBestiaryWorldId;

  function isTextFile(file) {
    if (file.type && file.type.startsWith('text/')) return true;
    const name = file.name.toLowerCase();
    return ['.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.yaml', '.yml', '.xml', '.csv', '.log'].some(ext => name.endsWith(ext));
  }

  async function loadData() {
    try {
      [sessions, worlds, userSettings, characterCards] = await Promise.all([
        getSessions(), getWorlds(), getUserSettings(user.id),
        getCharacterCards(user.id)
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
            <button class="btn btn-ghost" id="accountSettingsBtn">⚙️ Аккаунт</button>
            <button class="btn btn-ghost" id="signOutBtn">Выйти</button>
          </div>
        </header>

        <nav class="lobby-tabs">
          <button class="lobby-tab ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions">
            🎮 Сессии (${sessions.length})
          </button>
          <button class="lobby-tab ${activeTab === 'characters' ? 'active' : ''}" data-tab="characters">
            ⚔️ Персонажи (${characterCards.length})
          </button>
          <button class="lobby-tab ${activeTab === 'worlds' ? 'active' : ''}" data-tab="worlds">
            🌍 Миры (${worlds.length})
          </button>
        </nav>

        <main class="lobby-content" id="lobbyContent">
          ${activeTab === 'sessions' ? renderSessions() : activeTab === 'characters' ? renderCharacters() : renderWorlds()}
        </main>
      </div>

      <!-- Модальное окно: Новая сессия -->
      <div class="modal-overlay" id="newSessionModal">
        <div class="modal" style="max-width: 550px;">
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

            <!-- Сюжет (необязательно) -->
            <details class="plot-details" style="margin-bottom: 1rem;">
              <summary class="plot-summary">
                📖 Сюжетная линия <span class="form-hint">(необязательно)</span>
              </summary>
              <div class="plot-body">
                <div class="form-group" style="margin-bottom: 0.75rem;">
                  <label class="form-label">Описание сюжета</label>
                  <textarea class="input" id="sessionPlotText" rows="4"
                    placeholder="Опишите сюжетную линию: завязку, ключевых NPC, цели игроков, тайны и конфликты..."
                  ></textarea>
                  <span class="form-hint">Текст станет основой для нарратива ИИ-Мастера</span>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Или загрузите .txt файл</label>
                  <div class="file-drop-zone" id="plotFileDropZone" style="padding: 0.75rem;">
                    <p style="font-size: var(--fs-xs);">Перетащите файл или <a href="#" id="plotBrowseLink">выберите</a></p>
                  </div>
                  <div id="plotFileName" class="form-hint" style="margin-top: 0.25rem;"></div>
                  <input type="file" id="plotFileInput" accept=".txt,.md" style="display: none;" />
                </div>
              </div>
            </details>

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
              <button type="button" class="btn btn-ghost btn-sm" id="importWorldFromModalBtn" style="margin-right: auto;">📥 Импорт мира</button>
              <button type="button" class="btn btn-secondary" id="closeWorldModal">Отмена</button>
              <button type="submit" class="btn btn-primary" id="createWorldBtn">✨ Создать мир</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Модальное окно: Редактирование мира -->
      <div class="modal-overlay" id="editWorldModal">
        <div class="modal" style="max-width: 500px;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">✏️ Редактирование мира</h2>
          <form id="editWorldForm">
            <input type="hidden" id="editWorldId" />
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Название</label>
              <input class="input" id="editWorldName" required />
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Настройки (JSON)</label>
              <textarea class="input" id="editWorldSettings" rows="6"></textarea>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeEditWorldModal">Отмена</button>
              <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Скрытый input для импорта -->
      <input type="file" id="importFileInput" accept=".json" style="display: none;" />
      <input type="file" id="importCharFileInput" accept=".json" style="display: none;" />

      <!-- Модальное окно: Новый персонаж -->
      <div class="modal-overlay" id="newCharModal">
        <div class="modal" style="max-width: 500px;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">⚔️ Новый персонаж</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Создайте героя — он останется у вас и сможет участвовать в любых сессиях</p>
           <form id="newCharForm">
            <input type="hidden" id="charRaceAcBonus" value="0" />
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Имя героя *</label>
              <input class="input" id="charName" placeholder="Эльдрин" required />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
              <div class="form-group">
                <label class="form-label">Раса</label>
                <input class="input" id="charRace" placeholder="Человек" required />
              </div>
              <div class="form-group">
                <label class="form-label">Класс</label>
                <input class="input" id="charClass" placeholder="Воин" required />
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Внешность</label>
              <textarea class="input" id="charAppearance" rows="2" placeholder="Высокий мужчина с шрамом..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Биография</label>
              <textarea class="input" id="charBio" rows="3" placeholder="Родился в деревне на краю мира..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <label class="form-label" style="margin: 0;">Характеристики</label>
                <button type="button" class="btn btn-secondary btn-sm" id="generateStatsBtn">✨ AI</button>
              </div>
              <div class="stats-grid" style="grid-template-columns: repeat(6, 1fr); gap: 0.5rem;" id="statsGrid">
                ${STATS.map((stat) => `
                  <div class="form-group">
                    <label class="form-hint">${stat}</label>
                     <input class="input" type="number" id="stat_${stat}" value="10" style="text-align: center;" />
                  </div>
                `).join('')}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeCharModal">Отмена</button>
              <button type="submit" class="btn btn-primary">Создать</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Модальное окно: Редактирование персонажа -->
      <div class="modal-overlay" id="editCharModal">
        <div class="modal" style="max-width: 500px;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">✏️ Редактирование персонажа</h2>
           <form id="editCharForm">
            <input type="hidden" id="editCharRaceAcBonus" value="0" />
            <input type="hidden" id="editCharId" />
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Имя героя</label>
              <input class="input" id="editCharName" required />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
              <div class="form-group">
                <label class="form-label">Раса</label>
                <input class="input" id="editCharRace" required />
              </div>
              <div class="form-group">
                <label class="form-label">Класс</label>
                <input class="input" id="editCharClass" required />
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Внешность</label>
              <textarea class="input" id="editCharAppearance" rows="2"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Биография</label>
              <textarea class="input" id="editCharBio" rows="3"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <label class="form-label" style="margin: 0;">Характеристики</label>
                <button type="button" class="btn btn-secondary btn-sm" id="editGenerateStatsBtn">✨ AI</button>
              </div>
              <div class="stats-grid" style="grid-template-columns: repeat(6, 1fr); gap: 0.5rem;">
                ${STATS.map((stat) => `
                  <div class="form-group">
                    <label class="form-hint">${stat}</label>
                     <input class="input" type="number" id="edit_stat_${stat}" style="text-align: center;" />
                  </div>
                `).join('')}
              </div>
              <div style="text-align: center; margin-top: 0.5rem;">
                <span class="form-hint" id="editStatsSum"></span>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeEditCharModal">Отмена</button>
              <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Модальное окно: Присоединиться к сессии -->
      <div class="modal-overlay" id="joinSessionModal">
        <div class="modal" style="max-width: 450px;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">🔗 Присоединиться к сессии</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Вставьте ID или ссылку на сессию от друга</p>
          <form id="joinSessionForm">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">ID или ссылка на сессию</label>
              <input class="input" id="joinSessionInput" placeholder="abc123-def456... или https://...#/session/abc123" required />
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="closeJoinModal">Отмена</button>
              <button type="submit" class="btn btn-primary">Присоединиться</button>
            </div>
          </form>
        </div>
      </div>

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

    // Модальное окно: Бестиарий
    const bestiaryModal = document.createElement('div');
    bestiaryModal.className = 'modal-overlay';
    bestiaryModal.id = 'bestiaryModal';
    bestiaryModal.innerHTML = `
      <div class="modal" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title">🐉 Бестиарий: <span id="bestiaryWorldName"></span></h2>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="createNpcBtn">+ Создать NPC</button>
            <button class="btn btn-ghost btn-sm" id="closeBestiaryBtn">✕</button>
          </div>
        </div>
        <div id="createNpcForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
          <h3 style="margin-bottom: 0.5rem;">Новый NPC</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div class="form-group">
              <label class="form-label">Имя *</label>
              <input class="input" id="new-npc-name" placeholder="Имя NPC" />
            </div>
            <div class="form-group">
              <label class="form-label">Роль</label>
              <select class="input" id="new-npc-role">
                <option value="secondary">Второстепенный</option>
                <option value="main">Главный</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Раса</label>
              <input class="input" id="new-npc-race" value="Человек" />
            </div>
            <div class="form-group">
              <label class="form-label">HP</label>
              <input class="input" type="number" id="new-npc-hp" value="30" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Внешность</label>
            <textarea class="input" id="new-npc-appearance" rows="2" placeholder="Описание внешности..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Предыстория</label>
            <textarea class="input" id="new-npc-background" rows="2" placeholder="Предыстория NPC..."></textarea>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
            <div class="form-group">
              <label class="form-label">STR</label>
              <input class="input" type="number" id="new-npc-str" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">DEX</label>
              <input class="input" type="number" id="new-npc-dex" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">CON</label>
              <input class="input" type="number" id="new-npc-con" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">INT</label>
              <input class="input" type="number" id="new-npc-int" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">WIS</label>
              <input class="input" type="number" id="new-npc-wis" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">CHA</label>
              <input class="input" type="number" id="new-npc-cha" value="10" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Привычки (через запятую)</label>
            <input class="input" id="new-npc-habits" placeholder="читать книги, гулять по саду" />
          </div>
          <div class="form-group">
            <label class="form-label">Коронные фразы (через запятую)</label>
            <input class="input" id="new-npc-catchphrases" placeholder="Корона тяжела, Нард превыше всего" />
          </div>
          <div class="form-group">
            <label class="form-label">Теги статуса (через запятую)</label>
            <input class="input" id="new-npc-status-tags" placeholder="друг, наставник" />
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="saveNewNpcBtn">💾 Создать</button>
            <button class="btn btn-ghost btn-sm" id="cancelNewNpcBtn">Отмена</button>
          </div>
        </div>
        <div id="bestiaryContent">
          <p class="text-muted">Загрузка...</p>
        </div>
      </div>
    `;
    container.appendChild(bestiaryModal);

    bindEvents();
  }

  function renderSessions() {
    if (!sessions.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <h3>Нет активных сессий</h3>
          <p>Создайте новую сессию или подключитесь к существующей</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary btn-lg" id="newSessionBtn">+ Новая сессия</button>
            <button class="btn btn-secondary btn-lg" id="joinSessionBtn">🔗 Присоединиться</button>
          </div>
        </div>
      `;
    }

    return `
      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" id="newSessionBtn">+ Новая сессия</button>
        <button class="btn btn-secondary btn-sm" id="joinSessionBtn">🔗 Присоединиться</button>
      </div>
      <div class="card-grid">
        ${sessions.map((s) => {
          const players = s.players || [];
          const hasChar = players.some((p) => p.user_id === user.id);
          return `
          <div class="card session-card" data-id="${s.id}">
            <div class="card-header">
              <span class="badge badge-${s.difficulty === 'easy' ? 'success' : s.difficulty === 'hard' ? 'primary' : 'info'}">
                ${s.difficulty === 'easy' ? 'Легко' : s.difficulty === 'hard' ? 'Хардкор' : 'Нормально'}
              </span>
              ${s.is_pvp_enabled ? '<span class="badge badge-gold">PvP</span>' : ''}
            </div>
            <h3 class="card-title">${s.worlds?.name || 'Неизвестный мир'}</h3>
            <p class="text-muted" style="font-size: var(--fs-xs); margin-top: 0.25rem;">${s.current_plot_stage ? '📖 Сюжет' : '🎭 Песочница'}</p>
            ${players.length ? `
              <div class="session-players-preview" style="margin-top: 0.75rem;">
                <span class="form-hint">👥 ${players.length} игрок(ов):</span>
                <div class="session-player-chips">
                  ${players.map((p) => `
                    <span class="player-chip ${p.user_id === user.id ? 'player-chip-self' : ''}">
                      ${p.hp > 0 ? '💚' : '💀'} ${p.name || 'Безымянный'}
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : '<p class="text-muted" style="font-size: var(--fs-xs); margin-top: 0.5rem;">Пока нет игроков</p>'}
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-primary btn-sm" data-action="join" data-id="${s.id}">
                ${hasChar ? '🎮 Войти' : '⚔️ Создать героя'}
              </button>
              <button class="btn btn-secondary btn-sm" data-action="settings" data-id="${s.id}">⚙️</button>
              <button class="btn btn-ghost btn-sm" data-action="invite" data-id="${s.id}" title="Копировать инвайт-ссылку">🔗</button>
            </div>
          </div>
        `}).join('')}
        <div class="card session-card new-session-card" id="newSessionBtn2">
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
      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" id="newWorldBtn2">+ Новый мир</button>
      </div>
      <div class="card-grid">
        ${worlds.map((w) => `
          <div class="card world-card">
            <div class="card-header">
              <h3 class="card-title">🌍 ${w.name}</h3>
            </div>
            <pre class="world-settings-preview">${JSON.stringify(w.settings || {}, null, 2).slice(0, 200)}</pre>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" data-action="bestiary" data-id="${w.id}" data-name="${w.name}">🐉 Бестиарий</button>
              <button class="btn btn-secondary btn-sm" data-action="edit-world" data-id="${w.id}">✏️</button>
              <button class="btn btn-secondary btn-sm" data-action="export" data-id="${w.id}">📤</button>
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

  function renderCharacters() {
    if (!characterCards.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">⚔️</div>
          <h3>Нет персонажей</h3>
          <p>Создайте героя или импортируйте из файла</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary btn-lg" id="newCharBtn">+ Создать персонажа</button>
            <button class="btn btn-secondary btn-lg" id="importCharBtn">📥 Импорт .json</button>
          </div>
        </div>
      `;
    }

    return `
      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" id="newCharBtn2">+ Создать персонажа</button>
        <button class="btn btn-secondary btn-sm" id="importCharBtn2">📥 Импорт .json</button>
      </div>
      <div class="card-grid">
        ${characterCards.map((c) => {
          const stats = c.stats || {};
          const total = Object.values(stats).reduce((s, v) => s + (v || 0), 0);
          return `
          <div class="card char-card">
            <div class="card-header">
              <h3 class="card-title">⚔️ ${c.name}</h3>
            </div>
            <p class="text-muted" style="font-size: var(--fs-sm);">${c.race} / ${c.class}</p>
            <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 0.5rem;">
              ${STATS.map((s) => `
                <div class="stat-item" style="padding: 4px; text-align: center;">
                  <div class="stat-label" style="font-size: 0.6rem;">${s}</div>
                  <div class="stat-value" style="font-size: var(--fs-sm);">${stats[s] || 10}</div>
                </div>
              `).join('')}
            </div>
            <p class="form-hint" style="text-align: center; margin-top: 0.5rem;">HP: ${c.hp}/${c.max_hp} | 💰 ${c.money} | Сумма: ${total}</p>
            ${c.bio ? `<p class="text-muted" style="font-size: var(--fs-xs); margin-top: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${c.bio}</p>` : ''}
            <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" data-action="edit-char" data-id="${c.id}">✏️</button>
              <button class="btn btn-ghost btn-sm" data-action="export-char" data-id="${c.id}">📤</button>
              <button class="btn btn-ghost btn-sm" data-action="delete-char" data-id="${c.id}">🗑️</button>
            </div>
          </div>
        `}).join('')}
      </div>
    `;
  }

  function bindEvents() {
    // Load bestiary for a world
    async function loadBestiary(worldId) {
      const content = document.getElementById('bestiaryContent');
      content.innerHTML = '<p class="text-muted">Загрузка NPC...</p>';
      try {
        const npcs = await getNpcsByWorld(worldId);
        if (!npcs.length) {
          content.innerHTML = '<p class="text-muted">NPC не найдены. Создайте мир с описанием для автоматической генерации.</p>';
          return;
        }
        content.innerHTML = npcs.map((npc) => `
          <div class="card" style="margin-bottom: 0.5rem;">
            <div class="card-header" style="cursor: pointer;" data-npc-toggle="${npc.id}">
              <span class="badge ${npc.role === 'main' ? 'badge-primary' : 'badge-secondary'}">${npc.role === 'main' ? '⭐' : '○'}</span>
              <strong>${npc.name}</strong>
              <span class="text-muted">(${npc.race})</span>
            </div>
            <div id="npc-edit-${npc.id}" style="display: none; padding: 1rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <div class="form-group">
                  <label class="form-label">Имя</label>
                  <input class="input" id="npc-name-${npc.id}" value="${npc.name}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Раса</label>
                  <input class="input" id="npc-race-${npc.id}" value="${npc.race}" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Предыстория</label>
                <textarea class="input" id="npc-background-${npc.id}" rows="2">${npc.background || ''}</textarea>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
                <div class="form-group">
                  <label class="form-label">STR</label>
                  <input class="input" type="number" id="npc-str-${npc.id}" value="${npc.stats?.STR ?? 10}" />
                </div>
                <div class="form-group">
                  <label class="form-label">DEX</label>
                  <input class="input" type="number" id="npc-dex-${npc.id}" value="${npc.stats?.DEX ?? 10}" />
                </div>
                <div class="form-group">
                  <label class="form-label">CON</label>
                  <input class="input" type="number" id="npc-con-${npc.id}" value="${npc.stats?.CON ?? 10}" />
                </div>
                <div class="form-group">
                  <label class="form-label">INT</label>
                  <input class="input" type="number" id="npc-int-${npc.id}" value="${npc.stats?.INT ?? 10}" />
                </div>
                <div class="form-group">
                  <label class="form-label">WIS</label>
                  <input class="input" type="number" id="npc-wis-${npc.id}" value="${npc.stats?.WIS ?? 10}" />
                </div>
                <div class="form-group">
                  <label class="form-label">CHA</label>
                  <input class="input" type="number" id="npc-cha-${npc.id}" value="${npc.stats?.CHA ?? 10}" />
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button class="btn btn-primary btn-sm" data-npc-save="${npc.id}">💾 Сохранить</button>
                <button class="btn btn-ghost btn-sm" data-npc-delete="${npc.id}">🗑️ Удалить</button>
              </div>
            </div>
          </div>
        `).join('');

        // Toggle NPC edit form
        content.querySelectorAll('[data-npc-toggle]').forEach((header) => {
          header.addEventListener('click', () => {
            const npcId = header.dataset.npcToggle;
            const editDiv = document.getElementById(`npc-edit-${npcId}`);
            editDiv.style.display = editDiv.style.display === 'none' ? 'block' : 'none';
          });
        });

        // Save NPC
        content.querySelectorAll('[data-npc-save]').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const npcId = btn.dataset.npcSave;
            const updates = {
              name: document.getElementById(`npc-name-${npcId}`).value,
              race: document.getElementById(`npc-race-${npcId}`).value,
              background: document.getElementById(`npc-background-${npcId}`).value,
              stats: {
                STR: Number(document.getElementById(`npc-str-${npcId}`).value) || 10,
                DEX: Number(document.getElementById(`npc-dex-${npcId}`).value) || 10,
                CON: Number(document.getElementById(`npc-con-${npcId}`).value) || 10,
                INT: Number(document.getElementById(`npc-int-${npcId}`).value) || 10,
                WIS: Number(document.getElementById(`npc-wis-${npcId}`).value) || 10,
                CHA: Number(document.getElementById(`npc-cha-${npcId}`).value) || 10,
              },
            };
            try {
              await updateNpc(npcId, updates);
              toast.success('NPC обновлён!');
            } catch (err) {
              toast.error('Ошибка: ' + err.message);
            }
          });
        });

        // Delete NPC
        content.querySelectorAll('[data-npc-delete]').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const npcId = btn.dataset.npcDelete;
            if (!confirm('Удалить этого NPC?')) return;
            try {
              await deleteNpc(npcId);
              toast.success('NPC удалён');
              await loadBestiary(worldId);
            } catch (err) {
              toast.error('Ошибка: ' + err.message);
            }
          });
        });
      } catch (err) {
        content.innerHTML = `<p class="text-muted">Ошибка загрузки: ${err.message}</p>`;
      }
    }

    // Create NPC form toggle
    document.getElementById('createNpcBtn')?.addEventListener('click', () => {
      const form = document.getElementById('createNpcForm');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('cancelNewNpcBtn')?.addEventListener('click', () => {
      document.getElementById('createNpcForm').style.display = 'none';
    });

    // Save new NPC
    document.getElementById('saveNewNpcBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-npc-name').value.trim();
      if (!name) {
        toast.error('Введите имя NPC');
        return;
      }

      const role = document.getElementById('new-npc-role').value;
      const race = document.getElementById('new-npc-race').value.trim() || 'Человек';
      const hp = Number(document.getElementById('new-npc-hp').value) || 30;
      const appearance = document.getElementById('new-npc-appearance').value.trim();
      const background = document.getElementById('new-npc-background').value.trim();
      const stats = {
        STR: Number(document.getElementById('new-npc-str').value) || 10,
        DEX: Number(document.getElementById('new-npc-dex').value) || 10,
        CON: Number(document.getElementById('new-npc-con').value) || 10,
        INT: Number(document.getElementById('new-npc-int').value) || 10,
        WIS: Number(document.getElementById('new-npc-wis').value) || 10,
        CHA: Number(document.getElementById('new-npc-cha').value) || 10,
      };

      // Parse comma-separated values into arrays
      const parseArray = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
      const habits = parseArray(document.getElementById('new-npc-habits').value);
      const catchphrases = parseArray(document.getElementById('new-npc-catchphrases').value);
      const statusTags = parseArray(document.getElementById('new-npc-status-tags').value);

      const saveBtn = document.getElementById('saveNewNpcBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Создание...';

      try {
        await createNpc({
          world_id: currentBestiaryWorldId,
          name,
          role,
          race,
          hp,
          max_hp: hp,
          appearance,
          background,
          stats,
          habits,
          catchphrases,
          status_tags: statusTags,
        });
        toast.success('NPC создан!');
        document.getElementById('createNpcForm').style.display = 'none';
        // Clear form
        document.getElementById('new-npc-name').value = '';
        document.getElementById('new-npc-appearance').value = '';
        document.getElementById('new-npc-background').value = '';
        document.getElementById('new-npc-habits').value = '';
        document.getElementById('new-npc-catchphrases').value = '';
        document.getElementById('new-npc-status-tags').value = '';
        await loadBestiary(currentBestiaryWorldId);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Создать';
      }
    });

    // Tab switching
    container.querySelectorAll('.lobby-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        lobbyState.activeTab = tab.dataset.tab;
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

    // New session button (both empty state and grid card)
    const openNewSession = () => document.getElementById('newSessionModal').classList.add('open');
    document.getElementById('newSessionBtn')?.addEventListener('click', openNewSession);
    document.getElementById('newSessionBtn2')?.addEventListener('click', openNewSession);

    // Join session button
    document.getElementById('joinSessionBtn')?.addEventListener('click', () => {
      document.getElementById('joinSessionModal').classList.add('open');
    });
    document.getElementById('newSessionBtn2')?.addEventListener('click', () => {
      document.getElementById('newSessionModal').classList.add('open');
    });

    // Join session form
    document.getElementById('joinSessionForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('joinSessionInput').value.trim();
      if (!input) return;

      // Extract session ID from URL or plain text
      let sessionId = input;
      const urlMatch = input.match(/session\/([a-f0-9-]+)/i);
      if (urlMatch) sessionId = urlMatch[1];

      document.getElementById('joinSessionModal').classList.remove('open');
      router.navigate(`/session/${sessionId}`);
    });
    document.getElementById('closeJoinModal')?.addEventListener('click', () => {
      document.getElementById('joinSessionModal').classList.remove('open');
    });

    // New world button (both empty state and grid card)
    const openNewWorld = () => document.getElementById('newWorldModal').classList.add('open');
    document.getElementById('newWorldBtn')?.addEventListener('click', openNewWorld);
    document.getElementById('newWorldBtn2')?.addEventListener('click', openNewWorld);
    document.getElementById('importWorldFromModalBtn')?.addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });

    // Character card buttons
    const openNewChar = () => document.getElementById('newCharModal').classList.add('open');
    document.getElementById('newCharBtn')?.addEventListener('click', openNewChar);
    document.getElementById('newCharBtn2')?.addEventListener('click', openNewChar);

    document.getElementById('closeCharModal')?.addEventListener('click', () => {
      document.getElementById('newCharModal').classList.remove('open');
    });

    // Import character buttons
    const openImportChar = () => document.getElementById('importCharFileInput').click();
    document.getElementById('importCharBtn')?.addEventListener('click', openImportChar);
    document.getElementById('importCharBtn2')?.addEventListener('click', openImportChar);
    document.getElementById('importCharFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const card = data.character || data;
        const cardStats = card.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
        await createCharacterCard({
          owner_id: user.id,
          name: card.name || 'Безымянный',
          race: card.race || 'Человек',
          class: card.class || 'Воин',
          appearance: card.appearance || '',
          personality: card.personality || {},
          bio: card.bio || '',
          power_level: card.power_level || 10,
          stats: cardStats,
          hp: calculateHpFromStats(cardStats),
          max_hp: calculateHpFromStats(cardStats),
          ...calculateDerivedStats(cardStats, card.race || 'Человек', [], card.race_ac_bonus),
          money: card.money || 50,
        });
        toast.success(`Персонаж «${card.name || 'Безымянный'}» импортирован!`);
        loadData();
      } catch (err) {
        toast.error('Ошибка импорта: ' + err.message);
      }
    });

    // Character card actions
    container.querySelectorAll('[data-action="export-char"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const card = characterCards.find((c) => c.id === btn.dataset.id);
          if (!card) return;
          const exportData = {
            version: '2.0',
            exported_at: new Date().toISOString(),
            character: {
              name: card.name, race: card.race, class: card.class,
              appearance: card.appearance, personality: card.personality,
              bio: card.bio, power_level: card.power_level,
              stats: card.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
              hp: card.hp, max_hp: card.max_hp, money: card.money,
            },
          };
          downloadJSON(exportData, `${card.name}_character.json`);
          toast.success('Персонаж экспортирован!');
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });

    container.querySelectorAll('[data-action="delete-char"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить персонажа?')) return;
        try {
          await deleteCharacterCard(btn.dataset.id);
          toast.success('Персонаж удалён');
          loadData();
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });

    // Edit character card
    container.querySelectorAll('[data-action="edit-char"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = characterCards.find((c) => c.id === btn.dataset.id);
        if (!card) return;
        document.getElementById('editCharId').value = card.id;
        document.getElementById('editCharName').value = card.name || '';
        document.getElementById('editCharRace').value = card.race || '';
        document.getElementById('editCharClass').value = card.class || '';
        document.getElementById('editCharAppearance').value = card.appearance || '';
        document.getElementById('editCharBio').value = card.bio || '';
        const stats = card.stats || {};
        STATS.forEach((s) => {
          const el = document.getElementById(`edit_stat_${s}`);
          if (el) el.value = stats[s] || 10;
        });
        document.getElementById('editCharModal').classList.add('open');
      });
    });

    document.getElementById('closeEditCharModal')?.addEventListener('click', () => {
      document.getElementById('editCharModal').classList.remove('open');
    });

    document.getElementById('editCharForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editCharId').value;
      const stats = {};
      STATS.forEach((s) => { stats[s] = parseInt(document.getElementById(`edit_stat_${s}`)?.value) || 10; });

      const requestPayload = {
        name: document.getElementById('editCharName').value,
        race: document.getElementById('editCharRace').value,
        class: document.getElementById('editCharClass').value,
        appearance: document.getElementById('editCharAppearance').value,
        bio: document.getElementById('editCharBio').value,
        stats,
        hp: calculateHpFromStats(stats),
        max_hp: calculateHpFromStats(stats),
        race_ac_bonus: Number(document.getElementById('editCharRaceAcBonus')?.value || getRaceAcBonus(document.getElementById('editCharRace').value)),
      };
      console.log('[edit-character-card] request:', { id, ...requestPayload });

      try {
        const { updateCharacterCard } = await import('../api/game.js');
        const updated = await updateCharacterCard(id, requestPayload);
        console.log('[edit-character-card] updated:', updated);
        toast.success('Персонаж обновлён!');
        document.getElementById('editCharModal').classList.remove('open');
        loadData();
      } catch (err) {
        console.error('[edit-character-card] error:', err);
        toast.error('Ошибка: ' + err.message);
      }
    });

    // Edit modal: stats sum updater
    function updateEditStatsSum() {
      let sum = 0;
      STATS.forEach((s) => { sum += parseInt(document.getElementById(`edit_stat_${s}`)?.value) || 0; });
      const el = document.getElementById('editStatsSum');
      if (el) {
        el.textContent = `Сумма: ${sum} / 72`;
        el.style.color = sum === 72 ? 'var(--accent-success)' : sum > 72 ? 'var(--accent-danger)' : 'var(--text-muted)';
      }
    }

    STATS.forEach((s) => {
      document.getElementById(`edit_stat_${s}`)?.addEventListener('input', updateEditStatsSum);
    });
    updateEditStatsSum();

    // Edit modal: AI generate stats
    document.getElementById('editGenerateStatsBtn')?.addEventListener('click', async () => {
      const bio = document.getElementById('editCharBio')?.value?.trim();
      if (!bio) { toast.warning('Заполните биографию для генерации статов'); return; }

      const btn = document.getElementById('editGenerateStatsBtn');
      btn.disabled = true;
      btn.textContent = '⏳ ...';
      try {
        const requestPayload = {
            user_id: user.id,
            name: sanitizeAIText(document.getElementById('editCharName')?.value || ''),
            race: sanitizeAIText(document.getElementById('editCharRace')?.value || ''),
            class: sanitizeAIText(document.getElementById('editCharClass')?.value || ''),
            appearance: sanitizeAIText(document.getElementById('editCharAppearance')?.value || ''),
            bio: sanitizeAIText(bio),
          };
        console.log('[generate-character][edit] request:', requestPayload);

        const response = await invokeFunction('generate-character', requestPayload);
        console.log('[generate-character][edit] response:', response);
        if (response?.stats) {
          console.log('[generate-character][edit] applying stats:', response.stats);
          STATS.forEach((s) => {
            const el = document.getElementById(`edit_stat_${s}`);
            if (el && response.stats[s] !== undefined) el.value = response.stats[s];
          });
          updateEditStatsSum();
          toast.success('Статы сгенерированы!');
        } else {
          console.warn('[generate-character][edit] response without stats:', response);
        }
      } catch (err) {
        console.error('[generate-character][edit] error:', err);
        if (err?.data?.code === 'MISSING_API_KEY') {
          toast.error('Не задан OpenRouter API Key. Откройте «⚙️ Аккаунт» и введите ключ.');
        } else {
          const detail = err?.data?.details || err?.data?.error || err.message || 'Неизвестная ошибка';
          toast.error('Ошибка AI: ' + detail);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI';
      }
    });

    // Edit world
    container.querySelectorAll('[data-action="edit-world"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const world = worlds.find((w) => w.id === btn.dataset.id);
        if (!world) return;
        document.getElementById('editWorldId').value = world.id;
        document.getElementById('editWorldName').value = world.name || '';
        document.getElementById('editWorldSettings').value = JSON.stringify(world.settings || {}, null, 2);
        document.getElementById('editWorldModal').classList.add('open');
      });
    });

    // Bestiary button
    container.querySelectorAll('[data-action="bestiary"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const worldId = btn.dataset.id;
        const worldName = btn.dataset.name;
        currentBestiaryWorldId = worldId;
        lobbyState.currentBestiaryWorldId = worldId;
        document.getElementById('bestiaryWorldName').textContent = worldName;
        document.getElementById('bestiaryModal').classList.add('open');
        // Hide create form when opening bestiary for a new world
        document.getElementById('createNpcForm').style.display = 'none';
        await loadBestiary(worldId);
      });
    });

    // Close bestiary modal
    document.getElementById('closeBestiaryBtn')?.addEventListener('click', () => {
      document.getElementById('bestiaryModal').classList.remove('open');
    });

    document.getElementById('closeEditWorldModal')?.addEventListener('click', () => {
      document.getElementById('editWorldModal').classList.remove('open');
    });

    document.getElementById('editWorldForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editWorldId').value;
      let settings = {};
      try {
        const raw = document.getElementById('editWorldSettings').value;
        if (raw) settings = JSON.parse(raw);
      } catch { toast.error('Некорректный JSON'); return; }

      try {
        const { updateWorld } = await import('../api/game.js');
        await updateWorld(id, {
          name: document.getElementById('editWorldName').value,
          settings,
        });
        toast.success('Мир обновлён!');
        document.getElementById('editWorldModal').classList.remove('open');
        loadData();
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

    // Create character card form
    document.getElementById('newCharForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const stats = {};
      STATS.forEach((s) => { stats[s] = parseInt(document.getElementById(`stat_${s}`)?.value) || 10; });

      const requestPayload = {
        owner_id: user.id,
        name: document.getElementById('charName').value,
        race: document.getElementById('charRace').value,
        class: document.getElementById('charClass').value,
        appearance: document.getElementById('charAppearance').value,
        bio: document.getElementById('charBio').value,
        personality: { ideals: [], bonds: [], flaws: [] },
        power_level: 10,
        stats,
        hp: calculateHpFromStats(stats),
        max_hp: calculateHpFromStats(stats),
        race_ac_bonus: Number(document.getElementById('charRaceAcBonus')?.value || getRaceAcBonus(document.getElementById('charRace').value)),
        ...calculateDerivedStats(stats, document.getElementById('charRace').value || 'Человек', [], Number(document.getElementById('charRaceAcBonus')?.value || getRaceAcBonus(document.getElementById('charRace').value))),
        money: 50,
      };
      console.log('[create-character-card] request:', requestPayload);

      try {
        const card = await createCharacterCard(requestPayload);
        console.log('[create-character-card] created:', card);
        toast.success('Персонаж создан!');
        document.getElementById('newCharModal').classList.remove('open');
        loadData();
      } catch (err) {
        console.error('[create-character-card] error:', err);
        toast.error('Ошибка: ' + err.message);
      }
    });

    // Generate stats via AI (in character card modal)
    document.getElementById('generateStatsBtn')?.addEventListener('click', async () => {
      const bio = document.getElementById('charBio')?.value?.trim();
      if (!bio) { toast.warning('Заполните биографию для генерации статов'); return; }

      const btn = document.getElementById('generateStatsBtn');
      btn.disabled = true;
      btn.textContent = '⏳ ...';
      try {
        const requestPayload = {
            user_id: user.id,
            name: sanitizeAIText(document.getElementById('charName')?.value || ''),
            race: sanitizeAIText(document.getElementById('charRace')?.value || ''),
            class: sanitizeAIText(document.getElementById('charClass')?.value || ''),
            appearance: sanitizeAIText(document.getElementById('charAppearance')?.value || ''),
            bio: sanitizeAIText(bio),
          };
        console.log('[generate-character][new-card] request:', requestPayload);

        const response = await invokeFunction('generate-character', requestPayload);
        console.log('[generate-character][new-card] response:', response);
        if (response?.stats) {
          console.log('[generate-character][new-card] applying stats:', response.stats);
          STATS.forEach((s) => { const el = document.getElementById(`stat_${s}`); if (el && response.stats[s] !== undefined) el.value = response.stats[s]; });
          if (response.race_ac_bonus !== undefined) {
            const el = document.getElementById('charRaceAcBonus');
            if (el) el.value = response.race_ac_bonus;
          }
          toast.success('Статы сгенерированы!');
        } else {
          console.warn('[generate-character][new-card] response without stats:', response);
        }
      } catch (err) {
        console.error('[generate-character][new-card] error:', err);
        if (err?.data?.code === 'MISSING_API_KEY') {
          toast.error('Не задан OpenRouter API Key. Откройте «⚙️ Аккаунт» и введите ключ.');
        } else {
          const detail = err?.data?.details || err?.data?.error || err.message || 'Неизвестная ошибка';
          toast.error('Ошибка AI: ' + detail);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI';
      }
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
    let plotFile = null;

    // Plot file drop zone
    const plotFileDropZone = document.getElementById('plotFileDropZone');
    const plotFileInput = document.getElementById('plotFileInput');

    plotFileDropZone?.addEventListener('click', () => plotFileInput.click());
    document.getElementById('plotBrowseLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      plotFileInput.click();
    });
    plotFileDropZone?.addEventListener('dragover', (e) => { e.preventDefault(); plotFileDropZone.classList.add('dragover'); });
    plotFileDropZone?.addEventListener('dragleave', () => plotFileDropZone.classList.remove('dragover'));
    plotFileDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      plotFileDropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && !isTextFile(file)) {
        toast.warning(`Файл «${file.name}» пропущен (поддерживаются только текстовые файлы)`);
        return;
      }
      if (file) {
        plotFile = file;
        document.getElementById('plotFileName').textContent = `📄 ${plotFile.name}`;
      }
    });
    plotFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && !isTextFile(file)) {
        toast.warning(`Файл «${file.name}» пропущен (поддерживаются только текстовые файлы)`);
        plotFile = null;
        document.getElementById('plotFileName').textContent = 'Нет файла';
        return;
      }
      if (file) {
        plotFile = file;
        document.getElementById('plotFileName').textContent = `📄 ${plotFile.name}`;
      }
    });

    document.getElementById('newSessionForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const worldId = document.getElementById('sessionWorld').value;
      const difficulty = document.getElementById('sessionDifficulty').value;
      let plotText = document.getElementById('sessionPlotText')?.value?.trim() || '';

      // If file uploaded, read its content
      if (!plotText && plotFile) {
        try { plotText = await plotFile.text(); } catch {}
      }

      try {
        const session = await createSession({
          world_id: worldId,
          difficulty,
          is_pvp_enabled: pvpEnabled,
        });

        // Save plot to lore_files if provided
        if (plotText && plotText.length > 10) {
          const stageName = 'custom_plot';
          await supabase.from('lore_files').insert({
            world_id: worldId,
            folder: 'plot',
            title: stageName,
            content: plotText,
            tags: ['сюжет', 'custom'],
          });
          // Set session to use this plot
          await updateSession(session.id, { current_plot_stage: stageName });
        }

        toast.success('Сессия создана!');
        plotFile = null;
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
          const response = await invokeFunction('convert-world-text', {
            user_id: user.id, world_name: name, description: sanitizeAIText(description),
          });
          settings = response?.settings || {};
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

        // Generate NPCs from lore text
        createBtn.textContent = '⏳ Генерация бестиария...';
        createBtn.disabled = true;

        // Collect all lore text (description + file contents)
        let combinedLoreText = description || '';
        for (const file of pendingFiles) {
          try {
            const fileText = await file.text();
            combinedLoreText += '\n\n' + fileText;
          } catch {}
        }

        try {
          await invokeFunction('generate-world-npcs', {
            world_id: world.id,
            user_id: user.id,
            lore_text: combinedLoreText,
          });
        } catch (genErr) {
          console.error('NPC generation error:', genErr);
          toast.warning('Мир создан, но генерация бестиария не удалась: ' + (genErr.message || genErr));
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
    container.querySelectorAll('[data-action="invite"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = `${window.location.origin}/Multi-RP/#/session/${btn.dataset.id}`;
        navigator.clipboard.writeText(url);
        toast.success('Инвайт-ссылка скопирована!');
      });
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

    // Import world (from modal)
    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!isTextFile(file)) {
        toast.warning(`Файл «${file.name}» пропущен (поддерживаются только текстовые файлы)`);
        e.target.value = '';
        return;
      }
      try {
        const text = await file.text();
        await importWorld(text, user.id);
        toast.success('Мир импортирован!');
        loadData();
      } catch (err) {
        toast.error('Ошибка импорта: ' + err.message);
      }
      e.target.value = '';
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
