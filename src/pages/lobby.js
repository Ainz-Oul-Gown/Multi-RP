// src/pages/lobby.js — Глобальное Лобби (Dashboard)
import { supabase, signOut, invokeFunction } from '../api/supabase.js';
import {
  getSessions, createSession, getWorlds, createWorld,
  importWorld, exportWorld, downloadJSON,
  getUserSettings, upsertUserSettings, updateSession,
  getCharacterCards, createCharacterCard, deleteCharacterCard,
  exportPlayer, getNpcsByWorld, updateNpc, deleteNpc, createNpc
} from '../api/game.js';
import { generateAllNPCs, generateWorldGeography, saveWorldGeography, generateIntelligentNPCs, generateCreatures, canResumeGeneration, clearWorldGenerationProgress } from '../api/openrouter.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';
import { STATS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus, CARD_GENERATION_MODELS, DM_MODELS } from '../config.js';
import { savePageState, loadPageState } from '../utils/generationStore.js';

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
// Persist lobby state across page reloads (mobile file picker causes page reload)
const LOBBY_STATE_KEY = 'lobbyState';

function loadLobbyState() {
  try {
    const saved = sessionStorage.getItem(LOBBY_STATE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { activeTab: 'sessions', currentBestiaryWorldId: null, openModal: null };
}

function saveLobbyState(state) {
  try {
    sessionStorage.setItem(LOBBY_STATE_KEY, JSON.stringify(state));
  } catch {}
}

// Helper to update lobbyState and persist
function updateLobbyState(key, value) {
  lobbyState[key] = value;
  saveLobbyState(lobbyState);
}

const lobbyState = loadLobbyState();

export function renderLobby(container, user) {
  let { activeTab, openModal } = lobbyState;
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
        <div class="modal" style="max-width: 520px;">
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
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <label class="form-label" style="margin: 0;">Характеристики</label>
                <button type="button" class="btn btn-secondary btn-sm" id="generateStatsBtn">✨ AI</button>
              </div>
              <div class="stats-grid-6" id="statsGrid">
                ${STATS.map((stat) => `
                  <div class="stat-card">
                    <div class="stat-card-label">${stat}</div>
                    <input class="stat-card-input" type="number" id="stat_${stat}" value="10" min="1" max="30" />
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
        <div class="modal" style="max-width: 520px;">
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
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <label class="form-label" style="margin: 0;">Характеристики</label>
                <button type="button" class="btn btn-secondary btn-sm" id="editGenerateStatsBtn">✨ AI</button>
              </div>
              <div class="stats-grid-6">
                ${STATS.map((stat) => `
                  <div class="stat-card">
                    <div class="stat-card-label">${stat}</div>
                    <input class="stat-card-input" type="number" id="edit_stat_${stat}" min="1" max="30" />
                  </div>
                `).join('')}
              </div>
              <div style="text-align: center; margin-top: 0.75rem;">
                <span class="stats-sum" id="editStatsSum">Сумма: <strong>0</strong></span>
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

           <div class="form-group" style="margin-bottom: 1rem;">
             <label class="form-label">Модель для генерации карточек</label>
             <select class="input" id="cardModelInput">
               ${CARD_GENERATION_MODELS.map(m => `<option value="${m.id}" ${userSettings?.card_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
             </select>
             <span class="form-hint">Модель для генерации NPC, географии и бестиария</span>
           </div>

           <div class="form-group" style="margin-bottom: 1.5rem;">
             <label class="form-label">Модель для ДМа (рассказчик)</label>
             <select class="input" id="dmModelInput">
               ${DM_MODELS.map(m => `<option value="${m.id}" ${userSettings?.dm_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
             </select>
             <span class="form-hint">Модель для  narration и ответов в игре</span>
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
      <div class="modal" style="max-width: 700px; max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title">🐉 Бестиарий: <span id="bestiaryWorldName"></span></h2>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm" id="openGeoBtn">🗺️ География</button>
            <button class="btn btn-warning btn-sm" id="resumeGenBtn" style="display: none;">⏳ Продолжить</button>
            <button class="btn btn-success btn-sm" id="finishGenBtn" style="display: none;">✨ Дополнить мир</button>
            <button class="btn btn-primary btn-sm" id="createNpcBtn">+ Создать NPC</button>
            <button class="btn btn-ghost btn-sm" id="closeBestiaryBtn">✕</button>
          </div>
        </div>
        
        <!-- Статус генерации -->
        <div id="genStatus" class="gen-status" style="display: none; margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px;">
          <div class="gen-status-header">
            <span class="gen-status-text" id="genStatusText">Статус генерации</span>
            <span class="gen-status-progress" id="genStatusProgress">0%</span>
          </div>
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" id="genProgressFill" style="width: 0%"></div>
          </div>
        </div>
        
        <!-- Вкладки категорий -->
        <div class="bestiary-tabs">
          <button class="bestiary-tab active" data-category="all">👥 Все</button>
          <button class="bestiary-tab" data-category="npc">🧠 NPC</button>
          <button class="bestiary-tab" data-category="beast">🐾 Звери</button>
          <button class="bestiary-tab" data-category="monster">👹 Монстры</button>
          <button class="bestiary-tab" data-category="boss">💀 Боссы</button>
        </div>
        
        <div id="createNpcForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
          <h3 style="margin-bottom: 0.5rem;">Новый NPC</h3>
          <div class="npc-form-grid">
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
            <div class="form-group">
              <label class="form-label">Категория</label>
              <select class="input" id="new-npc-category">
                <option value="npc">🧠 NPC (разумное)</option>
                <option value="beast">🐾 Зверь</option>
                <option value="monster">👹 Монстр</option>
                <option value="boss">💀 Босс</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Локация</label>
              <input class="input" id="new-npc-location" placeholder="Название города" />
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
          <div class="stats-grid-3" style="margin-bottom: 0.75rem;">
            <div class="stat-card">
              <div class="stat-card-label">STR</div>
              <input class="stat-card-input" type="number" id="new-npc-str" value="10" min="1" max="30" />
            </div>
            <div class="stat-card">
              <div class="stat-card-label">DEX</div>
              <input class="stat-card-input" type="number" id="new-npc-dex" value="10" min="1" max="30" />
            </div>
            <div class="stat-card">
              <div class="stat-card-label">CON</div>
              <input class="stat-card-input" type="number" id="new-npc-con" value="10" min="1" max="30" />
            </div>
            <div class="stat-card">
              <div class="stat-card-label">INT</div>
              <input class="stat-card-input" type="number" id="new-npc-int" value="10" min="1" max="30" />
            </div>
            <div class="stat-card">
              <div class="stat-card-label">WIS</div>
              <input class="stat-card-input" type="number" id="new-npc-wis" value="10" min="1" max="30" />
            </div>
            <div class="stat-card">
              <div class="stat-card-label">CHA</div>
              <input class="stat-card-input" type="number" id="new-npc-cha" value="10" min="1" max="30" />
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
            <button class="btn btn-primary" id="saveNewNpcBtn">💾 Создать</button>
            <button class="btn btn-ghost" id="cancelNewNpcBtn">Отмена</button>
          </div>
        </div>
        <div id="bestiaryContent">
          <p class="text-muted">Загрузка...</p>
        </div>
      </div>
    `;
    container.appendChild(bestiaryModal);

    // Модальное окно: География (Государства и Города)
    const geoModal = document.createElement('div');
    geoModal.className = 'modal-overlay';
    geoModal.id = 'geoModal';
    geoModal.innerHTML = `
      <div class="modal" style="max-width: 700px; max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title">🗺️ География: <span id="geoWorldName"></span></h2>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="createStateBtn">+ Государство</button>
            <button class="btn btn-ghost btn-sm" id="closeGeoBtn">✕</button>
          </div>
        </div>
        
        <!-- Форма создания государства -->
        <div id="createStateForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
          <h3 style="margin-bottom: 0.5rem;">Новое государство</h3>
          <div class="form-group">
            <label class="form-label">Название *</label>
            <input class="input" id="new-state-name" placeholder="Название государства" />
          </div>
          <div class="form-group">
            <label class="form-label">Описание</label>
            <textarea class="input" id="new-state-desc" rows="2" placeholder="Описание государства..."></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" id="saveNewStateBtn">💾 Создать</button>
            <button class="btn btn-ghost" id="cancelNewStateBtn">Отмена</button>
          </div>
        </div>
        
        <!-- Форма создания города -->
        <div id="createCityForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
          <h3 style="margin-bottom: 0.5rem;">Новая локация</h3>
          <div class="npc-form-grid">
            <div class="form-group">
              <label class="form-label">Название *</label>
              <input class="input" id="new-city-name" placeholder="Название локации" />
            </div>
            <div class="form-group">
              <label class="form-label">Тип</label>
              <select class="input" id="new-city-type">
                <option value="city">🏘️ Город</option>
                <option value="capital">👑 Столица</option>
                <option value="village">🏡 Деревня</option>
                <option value="ruins">🏚️ Руины</option>
                <option value="landmark">⛰️ Достопримечательность</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Государство</label>
            <select class="input" id="new-city-state"></select>
          </div>
          <div class="form-group">
            <label class="form-label">Описание</label>
            <textarea class="input" id="new-city-desc" rows="2" placeholder="Описание локации..."></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" id="saveNewCityBtn">💾 Создать</button>
            <button class="btn btn-ghost" id="cancelNewCityBtn">Отмена</button>
          </div>
        </div>
        
        <div id="geoContent">
          <p class="text-muted">Загрузка географии...</p>
        </div>
      </div>
    `;
    container.appendChild(geoModal);

    // Модальное окно: Структура файла экспорта
    const schemaModal = document.createElement('div');
    schemaModal.className = 'modal-overlay';
    schemaModal.id = 'schemaModal';
    schemaModal.innerHTML = `
      <div class="modal" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title">ℹ️ Структура файла экспорта</h2>
          <button class="btn btn-ghost btn-sm" id="closeSchemaBtn">✕</button>
        </div>
        <div class="schema-content">
          <p class="form-hint" style="margin-bottom: 1rem;">Файл экспорта мира содержит все данные для полного восстановления:</p>
          <div class="schema-section">
            <h4>📁 Основные данные</h4>
            <ul>
              <li><strong>world</strong> — название, настройки, описание</li>
              <li><strong>lore_files</strong> — файлы лора (папка, заголовок, содержимое, теги)</li>
              <li><strong>folders</strong> — структура папок</li>
            </ul>
          </div>
          <div class="schema-section">
            <h4>🗺️ География (geography)</h4>
            <ul>
              <li><strong>states[]</strong> — государства</li>
              <li style="margin-left: 1rem;">name, description, ruler_id</li>
              <li><strong>locations[]</strong> — локации</li>
              <li style="margin-left: 1rem;">name (название), type (capital/city/village/ruins/landmark), description</li>
            </ul>
          </div>
          <div class="schema-section">
            <h4>🐉 Бестиарий (bestiary)</h4>
            <ul>
              <li><strong>npcs[]</strong> — все NPC и существа</li>
              <li style="margin-left: 1rem;">name (имя), race (раса), category (npc/beast/monster/boss)</li>
              <li style="margin-left: 1rem;">role (main/secondary), appearance (внешность), background (предыстория)</li>
              <li style="margin-left: 1rem;">stats (STR/DEX/CON/INT/WIS/CHA), hp, max_hp</li>
              <li style="margin-left: 1rem;">status_tags[], habits[], catchphrases[]</li>
              <li style="margin-left: 1rem;">location_id, state_id — привязка к географии</li>
            </ul>
          </div>
          <div class="schema-section">
            <h4>📋 Пример JSON</h4>
            <pre class="code-example">{
  "version": "3.0",
  "world": { "name": "...", "settings": {} },
  "geography": {
    "states": [{
      "name": "Королевство",
      "locations": [
        { "name": "Столица", "type": "capital" }
      ]
    }]
  },
  "bestiary": {
    "npcs": [{
      "name": "Король",
      "category": "npc",
      "stats": {"STR": 14, "DEX": 10, ...}
    }]
  }
}</pre>
          </div>
        </div>
      </div>
    `;
    container.appendChild(schemaModal);

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
        ${worlds.map((w) => {
          const genStatus = canResumeGeneration(w.id);
          const canResume = genStatus.intelligent || genStatus.creatures;
          return `
          <div class="card world-card">
            <div class="card-header">
              <h3 class="card-title">🌍 ${w.name}</h3>
            </div>
            <pre class="world-settings-preview">${JSON.stringify(w.settings || {}, null, 2).slice(0, 200)}</pre>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" data-action="bestiary" data-id="${w.id}" data-name="${w.name}">🐉 Бестиарий</button>
              ${canResume ? `<button class="btn btn-primary btn-sm" data-action="resume-gen" data-id="${w.id}" data-name="${w.name}">⏳ Продолжить</button>` : ''}
              <button class="btn btn-secondary btn-sm" data-action="edit-world" data-id="${w.id}">✏️</button>
              <button class="btn btn-secondary btn-sm" data-action="export" data-id="${w.id}">📤</button>
              <button class="btn btn-ghost btn-sm" data-action="schema-info" data-id="${w.id}" title="Структура файла экспорта">ℹ️</button>
              <button class="btn btn-ghost btn-sm" data-action="delete-world" data-id="${w.id}">🗑️</button>
            </div>
          </div>
        `}).join('')}
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
            <div class="stats-grid-3" style="margin-top: 0.75rem;">
              ${STATS.map((s) => `
                <div class="stat-card">
                  <div class="stat-card-label">${s}</div>
                  <div class="stat-card-value">${stats[s] || 10}</div>
                </div>
              `).join('')}
            </div>
            <p class="form-hint" style="text-align: center; margin-top: 0.75rem; font-size: var(--fs-sm);">
              ❤️ ${c.hp}/${c.max_hp} &nbsp;•&nbsp; 💰 ${c.money} &nbsp;•&nbsp; 📊 ${total}
            </p>
            ${c.bio ? `<p class="char-select-bio" style="margin-top: 0.5rem;">${c.bio}</p>` : ''}
            <div style="margin-top: auto; padding-top: 0.75rem; display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" data-action="edit-char" data-id="${c.id}">✏️ Изменить</button>
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
        content.innerHTML = npcs.map((npc) => {
          const categoryLabels = { npc: '🧠 NPC', beast: '🐾 Зверь', monster: '👹 Монстр', boss: '💀 Босс' };
          const categoryColors = { npc: 'badge-info', beast: 'badge-success', monster: 'badge-warning', boss: 'badge-danger' };
          const category = npc.category || 'npc';
          return `
          <div class="card npc-card" data-category="${category}" style="margin-bottom: 0.75rem;">
            <div class="npc-header" data-npc-toggle="${npc.id}">
              <div class="npc-header-info">
                <span class="npc-role-badge ${npc.role === 'main' ? 'npc-role-main' : 'npc-role-secondary'}">${npc.role === 'main' ? '⭐ Главный' : '○ Второстепенный'}</span>
                <strong class="npc-name">${npc.name}</strong>
                <span class="npc-category ${categoryColors[category]}">${categoryLabels[category]}</span>
                <span class="npc-race">${npc.race}</span>
                ${npc.location_name ? `<span class="npc-location">📍 ${npc.location_name}</span>` : ''}
              </div>
              <span class="npc-toggle-icon">▼</span>
            </div>
            <div id="npc-edit-${npc.id}" class="npc-edit-form" style="display: none;">
              <div class="npc-form-grid">
                <div class="form-group">
                  <label class="form-label">Имя</label>
                  <input class="input" id="npc-name-${npc.id}" value="${npc.name}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Раса</label>
                  <input class="input" id="npc-race-${npc.id}" value="${npc.race}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Категория</label>
                  <select class="input" id="npc-category-${npc.id}">
                    <option value="npc" ${category === 'npc' ? 'selected' : ''}>🧠 NPC (разумное)</option>
                    <option value="beast" ${category === 'beast' ? 'selected' : ''}>🐾 Зверь</option>
                    <option value="monster" ${category === 'monster' ? 'selected' : ''}>👹 Монстр</option>
                    <option value="boss" ${category === 'boss' ? 'selected' : ''}>💀 Босс</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Локация</label>
                  <input class="input" id="npc-location-${npc.id}" value="${npc.location_name || ''}" placeholder="Город или пусто" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Внешность</label>
                <textarea class="input" id="npc-appearance-${npc.id}" rows="2">${npc.appearance || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Предыстория</label>
                <textarea class="input" id="npc-background-${npc.id}" rows="2">${npc.background || ''}</textarea>
              </div>
              <div class="stats-grid-3">
                ${['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(stat => `
                  <div class="stat-card">
                    <div class="stat-card-label">${stat}</div>
                    <input class="stat-card-input" type="number" id="npc-${stat.toLowerCase()}-${npc.id}" value="${npc.stats?.[stat] ?? 10}" min="1" max="30" />
                  </div>
                `).join('')}
              </div>
              <div class="npc-actions">
                <button class="btn btn-primary" data-npc-save="${npc.id}">💾 Сохранить</button>
                <button class="btn btn-ghost" data-npc-delete="${npc.id}">🗑️ Удалить</button>
              </div>
            </div>
          </div>
        `}).join('');

        // Toggle NPC edit form
        content.querySelectorAll('[data-npc-toggle]').forEach((header) => {
          header.addEventListener('click', () => {
            const npcId = header.dataset.npcToggle;
            const editDiv = document.getElementById(`npc-edit-${npcId}`);
            const card = header.closest('.npc-card');
            const isOpen = editDiv.style.display !== 'none';
            editDiv.style.display = isOpen ? 'none' : 'block';
            card.classList.toggle('open', !isOpen);
          });
        });

        // Save NPC
        content.querySelectorAll('[data-npc-save]').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const npcId = btn.dataset.npcSave;
            const locationName = document.getElementById(`npc-location-${npcId}`)?.value || '';
            const updates = {
              name: document.getElementById(`npc-name-${npcId}`).value,
              race: document.getElementById(`npc-race-${npcId}`).value,
              category: document.getElementById(`npc-category-${npcId}`).value || 'npc',
              appearance: document.getElementById(`npc-appearance-${npcId}`).value,
              background: document.getElementById(`npc-background-${npcId}`).value,
              location_name: locationName,
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

    // ===================== GEOGRAPHY =====================
    
    // Load geography
    async function loadGeography(worldId) {
      const content = document.getElementById('geoContent');
      const stateSelect = document.getElementById('new-city-state');
      content.innerHTML = '<p class="text-muted">Загрузка географии...</p>';
      
      try {
        const { data: states, error: statesError } = await supabase
          .from('states')
          .select('*, locations(*)')
          .eq('world_id', worldId)
          .order('name');
        
        if (statesError) throw statesError;
        
        // Update state dropdown
        stateSelect.innerHTML = states.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        if (!states.length) {
          content.innerHTML = '<p class="text-muted">Государства не созданы. Создайте новое или сгенерируйте при создании мира.</p>';
          return;
        }
        
        content.innerHTML = states.map(state => `
          <div class="card state-card" style="margin-bottom: 1rem;">
            <div class="state-header" data-state-toggle="${state.id}">
              <div class="state-header-info">
                <strong class="state-name">🏰 ${state.name}</strong>
                <span class="state-locations-count">${state.locations?.length || 0} локаций</span>
              </div>
              <div class="state-actions">
                <button class="btn btn-secondary btn-sm" data-add-city="${state.id}" data-state-name="${state.name}">+ Город</button>
                <button class="btn btn-ghost btn-sm" data-delete-state="${state.id}">🗑️</button>
                <span class="npc-toggle-icon">▼</span>
              </div>
            </div>
            <div id="state-edit-${state.id}" class="state-edit-form" style="display: none;">
              <div class="form-group">
                <label class="form-label">Название</label>
                <input class="input" id="state-name-${state.id}" value="${state.name}" />
              </div>
              <div class="form-group">
                <label class="form-label">Описание</label>
                <textarea class="input" id="state-desc-${state.id}" rows="2">${state.description || ''}</textarea>
              </div>
              <button class="btn btn-primary btn-sm" data-save-state="${state.id}">💾 Сохранить</button>
            </div>
            <div id="cities-${state.id}" class="cities-list" style="display: none;">
              ${state.locations?.map(loc => `
                <div class="city-item" data-city-id="${loc.id}">
                  <div class="city-info">
                    <span class="city-type-icon">${loc.type === 'capital' ? '👑' : loc.type === 'city' ? '🏘️' : loc.type === 'village' ? '🏡' : loc.type === 'ruins' ? '🏚️' : '⛰️'}</span>
                    <span class="city-name">${loc.name}</span>
                    <span class="city-type">${loc.type}</span>
                  </div>
                  <div class="city-actions">
                    <button class="btn btn-ghost btn-sm" data-edit-city="${loc.id}" data-city-name="${loc.name}" data-city-type="${loc.type}" data-city-desc="${(loc.description || '').replace(/"/g, '&quot;')}">✏️</button>
                    <button class="btn btn-ghost btn-sm" data-delete-city="${loc.id}">🗑️</button>
                  </div>
                </div>
              `).join('') || '<p class="text-muted">Нет локаций</p>'}
            </div>
          </div>
        `).join('');
        
        // Toggle state expand
        content.querySelectorAll('[data-state-toggle]').forEach(header => {
          header.addEventListener('click', () => {
            const stateId = header.dataset.stateToggle;
            const citiesDiv = document.getElementById(`cities-${stateId}`);
            const editDiv = document.getElementById(`state-edit-${stateId}`);
            const isOpen = citiesDiv.style.display !== 'none';
            citiesDiv.style.display = isOpen ? 'none' : 'block';
            editDiv.style.display = isOpen ? 'none' : 'block';
            header.closest('.state-card').classList.toggle('open', !isOpen);
          });
        });
        
        // Delete state
        content.querySelectorAll('[data-delete-state]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Удалить государство и все его локации?')) return;
            try {
              await supabase.from('states').delete().eq('id', btn.dataset.deleteState);
              toast.success('Государство удалено');
              await loadGeography(worldId);
            } catch (err) {
              toast.error('Ошибка: ' + err.message);
            }
          });
        });
        
        // Save state
        content.querySelectorAll('[data-save-state]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const stateId = btn.dataset.saveState;
            try {
              await supabase.from('states').update({
                name: document.getElementById(`state-name-${stateId}`).value,
                description: document.getElementById(`state-desc-${stateId}`).value,
              }).eq('id', stateId);
              toast.success('Государство обновлено');
              await loadGeography(worldId);
            } catch (err) {
              toast.error('Ошибка: ' + err.message);
            }
          });
        });
        
        // Add city button
        content.querySelectorAll('[data-add-city]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('new-city-state').value = btn.dataset.addCity;
            document.getElementById('createCityForm').style.display = 'block';
            document.getElementById('createCityForm').scrollIntoView({ behavior: 'smooth' });
          });
        });
        
        // Delete city
        content.querySelectorAll('[data-delete-city]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Удалить эту локацию?')) return;
            try {
              await supabase.from('locations').delete().eq('id', btn.dataset.deleteCity);
              toast.success('Локация удалена');
              await loadGeography(worldId);
            } catch (err) {
              toast.error('Ошибка: ' + err.message);
            }
          });
        });
        
      } catch (err) {
        content.innerHTML = `<p class="text-muted">Ошибка загрузки: ${err.message}</p>`;
      }
    }
    
    // Open geography modal
    document.getElementById('openGeoBtn')?.addEventListener('click', () => {
      document.getElementById('geoModal').classList.add('open');
      document.getElementById('geoWorldName').textContent = document.getElementById('bestiaryWorldName').textContent;
      loadGeography(currentBestiaryWorldId);
    });
    
    document.getElementById('closeGeoBtn')?.addEventListener('click', () => {
      document.getElementById('geoModal').classList.remove('open');
    });
    
    // Create state form toggle
    document.getElementById('createStateBtn')?.addEventListener('click', () => {
      const form = document.getElementById('createStateForm');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    
    document.getElementById('cancelNewStateBtn')?.addEventListener('click', () => {
      document.getElementById('createStateForm').style.display = 'none';
    });
    
    // Save new state
    document.getElementById('saveNewStateBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-state-name').value.trim();
      if (!name) { toast.error('Введите название'); return; }
      try {
        await supabase.from('states').insert({
          world_id: currentBestiaryWorldId,
          name,
          description: document.getElementById('new-state-desc').value.trim(),
        });
        toast.success('Государство создано!');
        document.getElementById('createStateForm').style.display = 'none';
        document.getElementById('new-state-name').value = '';
        document.getElementById('new-state-desc').value = '';
        await loadGeography(currentBestiaryWorldId);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });
    
    // Create city form toggle
    document.getElementById('createCityForm')?.addEventListener('click', (e) => {
      if (e.target.id === 'createCityForm') return;
    });
    
    document.getElementById('cancelNewCityBtn')?.addEventListener('click', () => {
      document.getElementById('createCityForm').style.display = 'none';
    });
    
    // Save new city
    document.getElementById('saveNewCityBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-city-name').value.trim();
      if (!name) { toast.error('Введите название'); return; }
      try {
        await supabase.from('locations').insert({
          state_id: document.getElementById('new-city-state').value,
          name,
          type: document.getElementById('new-city-type').value,
          description: document.getElementById('new-city-desc').value.trim(),
        });
        toast.success('Локация создана!');
        document.getElementById('createCityForm').style.display = 'none';
        document.getElementById('new-city-name').value = '';
        document.getElementById('new-city-desc').value = '';
        await loadGeography(currentBestiaryWorldId);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

    // ===================== BESTIARY TABS =====================
    
    // Tab filtering
    container.querySelectorAll('.bestiary-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.bestiary-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const category = tab.dataset.category;
        container.querySelectorAll('.npc-card').forEach(card => {
          if (category === 'all' || card.dataset.category === category) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    // Tab switching
    container.querySelectorAll('.lobby-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        updateLobbyState('activeTab', tab.dataset.tab);
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
      const cardModel = document.getElementById('cardModelInput').value;
      const dmModel = document.getElementById('dmModelInput').value;
      const saveBtn = document.getElementById('saveAccountSettingsBtn');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';

      try {
        await upsertUserSettings(user.id, key, { card_model: cardModel, dm_model: dmModel });
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
    const openNewSession = () => {
      document.getElementById('newSessionModal').classList.add('open');
      updateLobbyState('openModal', 'newSessionModal');
    };
    document.getElementById('newSessionBtn')?.addEventListener('click', openNewSession);
    document.getElementById('newSessionBtn2')?.addEventListener('click', openNewSession);

    // Join session button
    document.getElementById('joinSessionBtn')?.addEventListener('click', () => {
      document.getElementById('joinSessionModal').classList.add('open');
      updateLobbyState('openModal', 'joinSessionModal');
    });
    document.getElementById('newSessionBtn2')?.addEventListener('click', () => {
      document.getElementById('newSessionModal').classList.add('open');
      updateLobbyState('openModal', 'newSessionModal');
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
    const openNewWorld = () => {
      document.getElementById('newWorldModal').classList.add('open');
      updateLobbyState('openModal', 'newWorldModal');
    };
    document.getElementById('newWorldBtn')?.addEventListener('click', openNewWorld);
    document.getElementById('newWorldBtn2')?.addEventListener('click', openNewWorld);
    document.getElementById('importWorldFromModalBtn')?.addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });

    // Character card buttons
    const openNewChar = () => {
      document.getElementById('newCharModal').classList.add('open');
      updateLobbyState('openModal', 'newCharModal');
    };
    document.getElementById('newCharBtn')?.addEventListener('click', openNewChar);
    document.getElementById('newCharBtn2')?.addEventListener('click', openNewChar);

    document.getElementById('closeCharModal')?.addEventListener('click', () => {
      document.getElementById('newCharModal').classList.remove('open');
      updateLobbyState('openModal', null);
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
        updateLobbyState('openModal', 'editCharModal');
      });
    });

    document.getElementById('closeEditCharModal')?.addEventListener('click', () => {
      document.getElementById('editCharModal').classList.remove('open');
      updateLobbyState('openModal', null);
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
        updateLobbyState('openModal', 'editWorldModal');
      });
    });

    // Bestiary button
    container.querySelectorAll('[data-action="bestiary"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const worldId = btn.dataset.id;
        const worldName = btn.dataset.name;
        currentBestiaryWorldId = worldId;
        updateLobbyState('currentBestiaryWorldId', worldId);
        document.getElementById('bestiaryWorldName').textContent = worldName;
        document.getElementById('bestiaryModal').classList.add('open');
        // Hide create form when opening bestiary for a new world
        document.getElementById('createNpcForm').style.display = 'none';
        
        // Check generation status
        await checkGenerationStatus(worldId);
        
        await loadBestiary(worldId);
      });
    });

    // Check generation status and update UI
    async function checkGenerationStatus(worldId) {
      const status = canResumeGeneration(worldId);
      const resumeBtn = document.getElementById('resumeGenBtn');
      const finishBtn = document.getElementById('finishGenBtn');
      const genStatus = document.getElementById('genStatus');
      
      // Get world data to check completeness
      const { data: states } = await supabase
        .from('states')
        .select('id')
        .eq('world_id', worldId);
      
      const { data: npcs } = await supabase
        .from('npcs')
        .select('id, category')
        .eq('world_id', worldId);
      
      const hasLocations = states && states.length > 0;
      const hasNpcs = npcs && npcs.length > 0;
      const intelligentNpcs = npcs?.filter(n => n.category === 'npc').length || 0;
      const creatures = npcs?.filter(n => ['beast', 'monster', 'boss'].includes(n.category)).length || 0;
      
      // Calculate progress
      let progress = 0;
      if (hasLocations) progress += 30;
      if (intelligentNpcs > 0) progress += Math.min(35, intelligentNpcs * 3);
      if (creatures > 0) progress += Math.min(35, creatures * 3);
      progress = Math.min(100, progress);
      
      // Show status bar if generation is incomplete
      if (progress < 100 || status.intelligent || status.creatures) {
        genStatus.style.display = '';
        document.getElementById('genStatusText').textContent = 
          `Локации: ${states?.length || 0} | 🧠 ${intelligentNpcs} | 🐾👹💀 ${creatures}`;
        document.getElementById('genStatusProgress').textContent = `${progress}%`;
        document.getElementById('genProgressFill').style.width = `${progress}%`;
      } else {
        genStatus.style.display = 'none';
      }
      
      // Show resume button if generation was interrupted
      if (status.intelligent || status.creatures) {
        resumeBtn.style.display = '';
      } else {
        resumeBtn.style.display = 'none';
      }
      
      // Show finish button if world is incomplete
      if (progress < 100 || !hasLocations || !hasNpcs) {
        finishBtn.style.display = '';
      } else {
        finishBtn.style.display = 'none';
      }
    }

    // Finish generation button
    document.getElementById('finishGenBtn')?.addEventListener('click', async () => {
      const worldId = currentBestiaryWorldId;
      if (!worldId) return;
      
      if (!confirm('Дополнить мир? Будут сгенерированы недостающие локации и NPC.')) return;
      
      // Get world lore text
      const world = worlds.find(w => w.id === worldId);
      let combinedLoreText = world?.description || world?.settings?.description || '';
      
      if (!combinedLoreText.trim()) {
        const { data: loreFiles } = await supabase
          .from('lore_files')
          .select('content')
          .eq('world_id', worldId);
        if (loreFiles?.length) {
          combinedLoreText = loreFiles.map(f => f.content).join('\n\n');
        }
      }
      
      if (!combinedLoreText.trim()) {
        toast.error('Нет текста для генерации. Добавьте описание мира.');
        return;
      }
      
      const finishBtn = document.getElementById('finishGenBtn');
      finishBtn.disabled = true;
      finishBtn.textContent = '⏳ Генерация...';
      
      try {
        // Check what's missing
        const { data: states } = await supabase
          .from('states')
          .select('*, locations(*)')
          .eq('world_id', worldId);
        
        const hasLocations = states && states.length > 0 && 
          states.some(s => s.locations && s.locations.length >= 6);
        
        // Generate geography if missing
        if (!hasLocations) {
          toast.info('Генерация географии...');
          const geography = await generateWorldGeography(combinedLoreText, worldId);
          const savedGeo = await saveWorldGeography(worldId, geography);
          
          // Update geography for NPC generation
          var geographyWithIds = {
            states: savedGeo.states.map(s => ({ id: s.id, name: s.name })),
            locations: savedGeo.locations.map(l => ({
              id: l.id,
              name: l.name,
              state_name: savedGeo.states.find(s => s.id === l.state_id)?.name || '',
              state_id: l.state_id,
            })),
          };
        } else {
          var geographyWithIds = {
            states: states.map(s => ({ id: s.id, name: s.name })),
            locations: states.flatMap(s => s.locations?.map(l => ({
              id: l.id,
              name: l.name,
              state_name: s.name,
              state_id: s.id,
            })) || []),
          };
        }
        
        // Check what NPCs are missing
        const { data: existingNpcs } = await supabase
          .from('npcs')
          .select('category')
          .eq('world_id', worldId);
        
        const intelligentCount = existingNpcs?.filter(n => n.category === 'npc').length || 0;
        const creatureCount = existingNpcs?.filter(n => ['beast', 'monster', 'boss'].includes(n.category)).length || 0;
        
        // Generate intelligent NPCs if missing
        if (intelligentCount < 5) {
          toast.info('Генерация разумных NPC...');
          await generateIntelligentNPCs(combinedLoreText, worldId, geographyWithIds);
        }
        
        // Generate creatures if missing
        if (creatureCount < 3) {
          toast.info('Генерация существ...');
          await generateCreatures(combinedLoreText, worldId, geographyWithIds);
        }
        
        toast.success('Мир дополнен!');
        await checkGenerationStatus(worldId);
        await loadBestiary(worldId);
      } catch (err) {
        console.error('[finish-gen] Error:', err);
        toast.error('Ошибка: ' + err.message);
      } finally {
        finishBtn.disabled = false;
        finishBtn.textContent = '✨ Дополнить мир';
      }
    });

    // Resume generation button (in bestiary modal)
    document.getElementById('resumeGenBtn')?.addEventListener('click', async () => {
      const worldId = currentBestiaryWorldId;
      if (!worldId) return;
      
      // Get world lore text for regeneration
      const world = worlds.find(w => w.id === worldId);
      if (!world) return;
      
      // Collect lore text
      let combinedLoreText = world.description || world.settings?.description || '';
      
      // If no description, try to get from lore files
      if (!combinedLoreText.trim()) {
        const { data: loreFiles } = await supabase
          .from('lore_files')
          .select('content')
          .eq('world_id', worldId);
        if (loreFiles?.length) {
          combinedLoreText = loreFiles.map(f => f.content).join('\n\n');
        }
      }
      
      if (!combinedLoreText.trim()) {
        toast.error('Нет текста для генерации. Добавьте описание мира.');
        return;
      }
      
      // Check what needs to be resumed
      const status = canResumeGeneration(worldId);
      
      if (!status.intelligent && !status.creatures) {
        toast.info('Генерация уже завершена или не начата');
        return;
      }
      
      // Confirm
      if (!confirm('Продолжить генерацию бестиария?')) return;
      
      // Get geography
      const { data: states } = await supabase
        .from('states')
        .select('*, locations(*)')
        .eq('world_id', worldId);
      
      const geographyWithIds = {
        states: states?.map(s => ({ id: s.id, name: s.name })) || [],
        locations: states?.flatMap(s => s.locations?.map(l => ({
          id: l.id,
          name: l.name,
          state_name: s.name,
          state_id: s.id,
        })) || []) || [],
      };
      
      const resumeBtn = document.getElementById('resumeGenBtn');
      resumeBtn.disabled = true;
      resumeBtn.textContent = '⏳ Генерация...';
      
      try {
        // Resume intelligent NPCs if needed
        if (status.intelligent) {
          toast.info('Продолжаем генерацию разумных NPC...');
          await generateIntelligentNPCs(combinedLoreText, worldId, geographyWithIds, (progress) => {
            if (progress.step === 'generating') {
              resumeBtn.textContent = `⏳ Разумные ${progress.current}/${progress.total}`;
            }
          });
        }
        
        // Resume creatures if needed
        if (status.creatures) {
          toast.info('Продолжаем генерацию существ...');
          await generateCreatures(combinedLoreText, worldId, geographyWithIds, (progress) => {
            if (progress.step === 'generating') {
              resumeBtn.textContent = `⏳ Существа ${progress.current}/${progress.total}`;
            }
          });
        }
        
        toast.success('Генерация завершена!');
        resumeBtn.style.display = 'none';
        await loadBestiary(worldId);
      } catch (err) {
        console.error('[resume-gen] Error:', err);
        toast.error('Ошибка: ' + err.message + '. Можно продолжить позже.');
      } finally {
        resumeBtn.disabled = false;
        resumeBtn.textContent = '⏳ Продолжить';
      }
    });

    // Resume generation button (in world card - keep for compatibility)
    container.querySelectorAll('[data-action="resume-gen"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const worldId = btn.dataset.id;
        const worldName = btn.dataset.name;
        // Open bestiary modal and trigger resume
        currentBestiaryWorldId = worldId;
        updateLobbyState('currentBestiaryWorldId', worldId);
        document.getElementById('bestiaryWorldName').textContent = worldName;
        document.getElementById('bestiaryModal').classList.add('open');
        document.getElementById('createNpcForm').style.display = 'none';
        
        const status = canResumeGeneration(worldId);
        const resumeBtn = document.getElementById('resumeGenBtn');
        if (status.intelligent || status.creatures) {
          resumeBtn.style.display = '';
        } else {
          resumeBtn.style.display = 'none';
        }
        
        await loadBestiary(worldId);
      });
    });

    // Close bestiary modal
    document.getElementById('closeBestiaryBtn')?.addEventListener('click', () => {
      document.getElementById('bestiaryModal').classList.remove('open');
      updateLobbyState('openModal', null);
    });

    document.getElementById('closeEditWorldModal')?.addEventListener('click', () => {
      document.getElementById('editWorldModal').classList.remove('open');
      updateLobbyState('openModal', null);
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
      updateLobbyState('openModal', null);
    });
    document.getElementById('closeWorldModal')?.addEventListener('click', () => {
      document.getElementById('newWorldModal').classList.remove('open');
      updateLobbyState('openModal', null);
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
        console.log('[create-world] Description length:', combinedLoreText.length);
        
        for (const file of pendingFiles) {
          try {
            const fileText = await file.text();
            combinedLoreText += '\n\n' + fileText;
            console.log(`[create-world] Added file: ${file.name}, length: ${fileText.length}`);
          } catch (err) {
            console.error('[create-world] Error reading file:', err);
          }
        }

        console.log('[create-world] Total combinedLoreText length:', combinedLoreText.length);
        
        // Skip generation if no text
        if (!combinedLoreText.trim()) {
          toast.warning('Нет текста для генерации NPC. Добавьте описание или файлы.');
          createBtn.disabled = false;
          createBtn.textContent = '✨ Создать мир';
          return;
        }

        // Generate NPCs on frontend, then save to DB
        try {
          createBtn.textContent = '⏳ Генерация географии...';
          toast.info('Создаём государства и города...');

          // Step 1: Generate geography (states and cities)
          const geography = await generateWorldGeography(combinedLoreText, world.id, (progress) => {
            if (progress.step === 'geography_start') {
              createBtn.textContent = '⏳ Государства и города...';
            }
          });

          console.log('[create-world] Geography generated:', geography.states.length, 'states,', geography.locations.length, 'locations');

          // Step 2: Save geography to DB
          createBtn.textContent = '⏳ Сохранение географии...';
          const savedGeo = await saveWorldGeography(world.id, geography);
          console.log('[create-world] Geography saved:', savedGeo.states.length, 'states,', savedGeo.locations.length, 'locations');

          // Add IDs to geography for NPC generation
          const geographyWithIds = {
            states: savedGeo.states.map(s => ({ ...s, id: s.id })),
            locations: savedGeo.locations.map(l => ({
              ...l,
              id: l.id,
              state_name: savedGeo.states.find(s => s.id === l.state_id)?.name || '',
            })),
          };

          // Step 3: Generate intelligent NPCs (with progress saving)
          createBtn.textContent = '⏳ Генерация разумных NPC...';
          toast.info('Генерация разумных существ...');
          
          const intelligentResult = await generateIntelligentNPCs(combinedLoreText, world.id, geographyWithIds, (progress) => {
            if (progress.step === 'counting') {
              createBtn.textContent = `⏳ Найдено ${progress.total || '?'} разумных...`;
            } else if (progress.step === 'generating') {
              createBtn.textContent = `⏳ Разумные ${progress.current}/${progress.total}...`;
            } else if (progress.step === 'saving') {
              createBtn.textContent = `⏳ Сохранение...`;
            }
          });

          console.log(`[create-world] Intelligent NPCs: ${intelligentResult.npcs.length}, saved ${intelligentResult.saved}`);

          // Step 4: Generate creatures (beasts, monsters, bosses)
          createBtn.textContent = '⏳ Генерация существ...';
          toast.info('Генерация зверей, монстров и боссов...');
          
          const creatureResult = await generateCreatures(combinedLoreText, world.id, geographyWithIds, (progress) => {
            if (progress.step === 'counting') {
              createBtn.textContent = `⏳ Найдено ${progress.total || '?'} существ...`;
            } else if (progress.step === 'generating') {
              createBtn.textContent = `⏳ Существа ${progress.current}/${progress.total}...`;
            } else if (progress.step === 'saving') {
              createBtn.textContent = `⏳ Сохранение...`;
            }
          });

          console.log(`[create-world] Creatures: ${creatureResult.npcs.length}, saved ${creatureResult.saved}`);

          const totalNpcs = intelligentResult.saved + creatureResult.saved;
          if (totalNpcs > 0) {
            toast.success(`Бестиарий создан: ${totalNpcs} существ (🧠 ${intelligentResult.saved} + 🐾👹💀 ${creatureResult.saved})`);
          } else {
            toast.warning('NPC не сгенерированы');
          }
        } catch (genErr) {
          console.error('NPC generation error:', genErr);
          toast.warning('Мир создан, но генерация бестиария не удалась: ' + (genErr.message || genErr) + '. Можно продолжить в карточке мира.');
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

    // Schema info button
    container.querySelectorAll('[data-action="schema-info"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('schemaModal').classList.add('open');
      });
    });

    // Close schema modal
    document.getElementById('closeSchemaBtn')?.addEventListener('click', () => {
      document.getElementById('schemaModal').classList.remove('open');
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
        if (e.target === overlay) {
          overlay.classList.remove('open');
          updateLobbyState('openModal', null);
        }
      });
    });
  }

  // Restore open modal after re-render (e.g., after file picker returns)
  if (openModal) {
    const modal = document.getElementById(openModal);
    if (modal) modal.classList.add('open');
  }

  loadData();
}
