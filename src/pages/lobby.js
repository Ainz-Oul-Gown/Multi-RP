// src/pages/lobby.js — Глобальное Лобби (Dashboard)
import { supabase, signOut, invokeFunction, getActiveDatabaseConfig, generateDbInviteUrl } from '../api/supabase.js';
import {
  getSessions, createSession, deleteSession, getWorlds, createWorld, updateWorld, deleteWorld,
  importWorld, exportWorld, downloadJSON,
  getUserSettings, upsertUserSettings, updateSession,
  getCharacterCards, createCharacterCard, updateCharacterCard, deleteCharacterCard,
  exportPlayer, getNpcsByWorld, updateNpc, deleteNpc, createNpc,
  updateLocation, createLocation, deleteLocation, deletePlayer
} from '../api/game.js';
import { generateAllNPCs, generateWorldGeography, saveWorldGeography, generateIntelligentNPCs, generateCreatures, canResumeGeneration, clearWorldGenerationProgress } from '../api/openrouter.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';
import { STATS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus, CARD_GENERATION_MODELS, DM_MODELS, GPS_MODELS, SATELLITE_MODELS } from '../config.js';
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

export const MASTER_AI_WORLD_PROMPT = `Ты — ведущий геймдизайнер и мастер ролевых игр (D&D 5e, Pathfinder, Dark Fantasy).
Твоя задача — взять описание вымышленного мира от пользователя и сгенерировать ПОЛНЫЙ, ВАЛИДНЫЙ JSON-файл мира для системы «Multi-RP v3.2».

ОТВЕТ ДОЛЖЕН БЫТЬ СТРОГО В ВИДЕ ЕДИНОГО JSON-ОБЪЕКТА (без разметки markdown, без вступительного и заключительного текста, только чистый валидный JSON).

### СТРУКТУРА JSON ОБЪЕКТА:
{
  "world": {
    "name": "Название мира",
    "description": "Глубокое атмосферное описание мира, эпохи и конфликтов",
    "settings": {
      "races": ["Человек", "Эльф", "Дварф", "Гном", "Зверолюд"],
      "classes": ["Воин", "Маг", "Следопыт", "Плут", "Жрец"],
      "max_level": 20,
      "storyline": {
        "title": "Основная сюжетная кампания",
        "summary": "Краткое описание глобального конфликта",
        "prologue": "Вводный текст, где и как начинаются приключения",
        "current_arc_index": 0,
        "arcs": [
          {
            "id": "arc_1",
            "act": 1,
            "title": "Акт I: Завязка",
            "description": "Первые шаги героев, исследование угроз",
            "goals": ["Цель 1", "Цель 2"],
            "key_npcs": ["Имя NPC 1", "Имя NPC 2"],
            "key_locations": ["Локация 1"]
          },
          {
            "id": "arc_2",
            "act": 2,
            "title": "Акт II: Развитие конфликта",
            "description": "Усугубление кризиса",
            "goals": ["Цель 1"],
            "key_npcs": ["Имя NPC 3"],
            "key_locations": ["Локация 2"]
          },
          {
            "id": "arc_3",
            "act": 3,
            "title": "Акт III: Кульминация",
            "description": "Решающая битва или открытое противостояние",
            "goals": ["Цель 1"],
            "key_npcs": ["Имя NPC 4"],
            "key_locations": ["Локация 3"]
          },
          {
            "id": "arc_4",
            "act": 4,
            "title": "Акт IV: Развязка и Эпилог",
            "description": "Последствия и новый баланс сил",
            "goals": ["Цель 1"],
            "key_npcs": ["Имя NPC 1"],
            "key_locations": ["Локация 1"]
          }
        ]
      }
    }
  },
  "lore_files": [
    {
      "folder": "История",
      "title": "Хроника Эпохи",
      "content": "Детальный текст лора для ИИ-мастера игры...",
      "tags": ["история", "летопись"]
    },
    {
      "folder": "Фракции",
      "title": "Орден или Гильдия",
      "content": "Описание фракции, её целей и ресурсов...",
      "tags": ["фракции", "власть"]
    }
  ],
  "geography": {
    "states": [
      {
        "name": "Название государства или региона",
        "description": "Политическое устройство, климат, культура"
      }
    ],
    "locations": [
      {
        "name": "Название локации",
        "state_name": "Точное совпадение с одним из states[].name",
        "type": "city",
        "terrain_type": "urban",
        "description": "Атмосферное описание локации",
        "zones": [
          { "id": "loc1_square", "name": "Центральная площадь", "type": "open" },
          { "id": "loc1_tavern", "name": "Таверна / Таверна-постоялый двор", "type": "closed" },
          { "id": "loc1_gates", "name": "Северные ворота", "type": "open" }
        ],
        "location_map": {
          "loc1_square": { "loc1_square": 0, "loc1_tavern": 25, "loc1_gates": 50 },
          "loc1_tavern": { "loc1_square": 25, "loc1_tavern": 0, "loc1_gates": 65 },
          "loc1_gates": { "loc1_square": 50, "loc1_tavern": 65, "loc1_gates": 0 }
        }
      }
    ]
  },
  "bestiary": {
    "npcs": [
      {
        "name": "Имя NPC или видовое название (для зверей/монстров — без личных имён)",
        "race": "Человек",
        "class": "Торговец / Воин / Маг",
        "category": "npc",
        "role": "main",
        "temperament": "Хитрый прагматик, ценящий выгоду и осторожность",
        "motivation": "Накопить состояние и защитить свою семью от гнева лорда",
        "current_mood": "calm",
        "speech_style": "Говорит неторопливо, с легкой иронией и торговыми метафорами",
        "secrets": "Тайно скупает контрабандные лунные кристаллы",
        "rumors": [
          "Поговаривают, что в подвалах старого замка видели странное свечение",
          "Стража на тракте берет двойную пошлину с чужеземцев"
        ],
        "daily_routine": "Утро: обход торговых лавок; День: встречи с поставщиками; Вечер: отдых в таверне; Ночь: пересчет выручки",
        "current_activity": "Внимательно изучает старинную карту и делает пометки",
        "description": "Крепкий мужчина средних лет в добротном шерстяном дублете...",
        "level": 3,
        "tier": 1,
        "hit_dice": 8,
        "stats": {
          "strength": 12,
          "dexterity": 14,
          "constitution": 12,
          "intelligence": 15,
          "wisdom": 14,
          "charisma": 16
        },
        "base_attacks": ["Короткий клинок (1d6+2)"],
        "special_attacks": ["Призыв наёмников", "Ослепляющий порошок"],
        "habits": ["Постоянно подбрасывает медную монетку", "Смотрит прямо в глаза собеседнику"],
        "catchphrases": ["У каждой монеты две стороны, друг мой.", "Время — самый дорогой товар."],
        "status_tags": ["Купец", "Информатор"]
      }
    ]
  }
}

### ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ К ДАННЫМ:
1. **locations[].terrain_type**: СТРОГО одно из 6 значений:
   - "urban" (город, крепость, поселение)
   - "building" (внутри здания, храма, замка)
   - "forest" (леса, рощи, чащи)
   - "cave" (пещеры, катакомбы, рудники)
   - "mountain" (горы, перевалы, скалы)
   - "open" (равнины, поля, побережья, тракты)
2. **locations[].zones и location_map**:
   - В каждой локации должно быть от 2 до 5 подзон (zones) с уникальными строковыми id.
   - location_map — СИММЕТРИЧНАЯ матрица расстояний в метрах (например, от 10 до 120м):
     location_map[A][B] === location_map[B][A], а расстояние до самой себя location_map[A][A] = 0.
3. **bestiary.npcs[].current_mood**: СТРОГО одно из:
   - "calm", "suspicious", "cheerful", "irritated", "frightened", "impressed", "mournful"
4. **bestiary.npcs[].category**: "npc" | "beast" | "monster" | "boss"
5. **bestiary.npcs[].role**: "main" | "secondary" | "tertiary"
6. **bestiary.npcs[].name**: Для разумных NPC и уникальных боссов — персональное имя ("Барон Валериан", "Верховный жрец"). Для диких зверей и рядовых монстров — ТОЛЬКО видовое имя без личных имён ("Лютый волк", "Пещерный паук", "Болотный упырь").
7. **stats**: Значения от 1 до 30 (10 — средний человек).
8. Сгенерируй богатый, живой мир: 2-3 государства, 4-6 локаций с зонами и матрицами расстояний, 6-12 детальных NPC со всеми психологическими полями, слухами и распорядком дня!

---
[ОПИШИТЕ ВАШ МИР ЗДЕСЬ]:
`;

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
        getSessions(user.id), getWorlds(user.id), getUserSettings(user.id),
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

    const dbConfig = getActiveDatabaseConfig();

    container.innerHTML = `
      <div class="page">
        <header class="lobby-header">
          <div class="lobby-header-left">
            <h1 class="lobby-title">🕯️ Зал Гильдии Приключенцев</h1>
            <span class="badge badge-gold" title="Странник">${user.email}</span>
            ${dbConfig.isCustom ? `
              <span class="badge badge-info" id="lobbyCustomDbBadge" style="cursor: pointer;" title="Пользовательская БД. Нажмите, чтобы скопировать инвайт-ссылку для друзей">
                🔌 Своя БД
              </span>
            ` : ''}
          </div>
          <div class="lobby-header-right">
            <button class="btn btn-ghost" id="accountSettingsBtn">⚙️ Настройки</button>
            <button class="btn btn-ghost" id="signOutBtn">Выйти из таверны</button>
          </div>
        </header>

        <nav class="lobby-tabs">
          <button class="lobby-tab ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions">
            📜 Сессии (${sessions.length})
          </button>
          <button class="lobby-tab ${activeTab === 'characters' ? 'active' : ''}" data-tab="characters">
            ⚔️ Персонажи (${characterCards.length})
          </button>
          <button class="lobby-tab ${activeTab === 'worlds' ? 'active' : ''}" data-tab="worlds">
            🗺️ Миры (${worlds.length})
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

          <div class="form-group" style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.25); border-radius: var(--radius-md); border: 1px solid rgba(212, 163, 89, 0.2);">
            <label class="form-label" style="font-size: var(--fs-xs);">База данных Supabase</label>
            <div style="font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 0.5rem; word-break: break-all;">
              ${dbConfig.isCustom ? `Подключена ваша БД: <code>${dbConfig.url}</code>` : 'Стандартная база данных Multi-RP'}
            </div>
            ${dbConfig.isCustom ? `
              <button type="button" class="btn btn-secondary btn-sm" id="lobbyCopyDbInviteBtn" style="width: 100%;">
                🔗 Скопировать ссылку-приглашение в эту БД
              </button>
            ` : ''}
          </div>

           <div class="form-group" style="margin-bottom: 1rem;">
             <label class="form-label">OpenRouter API Key</label>
             <div style="display: flex; gap: 0.4rem; align-items: center;">
               <input
                 class="input"
                 type="password"
                 id="openrouterKeyInput"
                 placeholder="sk-or-v1-..."
                 value="${userSettings?.openrouter_key || ''}"
                 autocomplete="off"
                 style="flex: 1;"
               />
               <button type="button" class="btn btn-secondary btn-sm" id="toggleOpenrouterKeyVisibilityBtn" title="Показать / скрыть ключ" style="padding: 0.45rem 0.65rem; white-space: nowrap;">
                 👁️
               </button>
               <button type="button" class="btn btn-secondary btn-sm" id="copyOpenrouterKeyBtn" title="Скопировать OpenRouter API Key в буфер обмена" style="padding: 0.45rem 0.75rem; white-space: nowrap;">
                 📋 Копировать
               </button>
             </div>
             <span class="form-hint">
               Ваш личный ключ для OpenRouter API.
               ${maskedKey ? `Текущий: <code>${maskedKey}</code>` : 'Не задан — игра не сможет вызывать ИИ.'}
             </span>
             <span class="form-hint" style="margin-top: 0.25rem;">
               Получите ключ на <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
             </span>
           </div>

           <div style="margin-bottom: 1.25rem; padding: 0.85rem; background: rgba(212, 163, 89, 0.08); border-radius: 8px; border: 1px solid rgba(212, 163, 89, 0.25);">
             <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--accent-gold-bright);">⚡ Быстрые пресеты связок:</div>
             <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
               <button type="button" class="btn btn-secondary btn-sm" id="presetFreeBtn" title="Все роли на качественных бесплатных моделях OpenRouter">🆓 Бесплатно ($0)</button>
               <button type="button" class="btn btn-secondary btn-sm" id="presetOptimumBtn" title="Минимум затрат (~$0.50/1000 ходов) при максимальном интеллекте парсера и нарратора">⚡ Оптимум (Топ)</button>
               <button type="button" class="btn btn-secondary btn-sm" id="presetMaxBtn" title="Премиум-качество с Claude 3.5 Haiku и GPT-4o Mini">👑 Максимум</button>
             </div>
           </div>

           <div class="form-group" style="margin-bottom: 1rem;">
             <label class="form-label">Модель для генерации карточек</label>
             <select class="input select" id="cardModelInput">
               ${CARD_GENERATION_MODELS.map(m => `<option value="${m.id}" ${userSettings?.card_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
             </select>
             <span class="form-hint">Модель для генерации NPC, географии и бестиария</span>
           </div>

            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Модель для ДМа (рассказчик)</label>
              <select class="input select" id="dmModelInput">
                ${DM_MODELS.map(m => `<option value="${m.id}" ${userSettings?.dm_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
              <span class="form-hint">Модель для narration и ответов в игре</span>
            </div>

            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Модель для GPS (время и локация)</label>
              <select class="input select" id="gpsModelInput">
                ${GPS_MODELS.map(m => `<option value="${m.id}" ${userSettings?.gps_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
              <span class="form-hint">Модель для определения времени действия и локации</span>
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label class="form-label">Модель для Сателит (намерения)</label>
              <select class="input select" id="satelliteModelInput">
                ${SATELLITE_MODELS.map(m => `<option value="${m.id}" ${userSettings?.satellite_model === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
              <span class="form-hint">Модель для анализа намерений игрока</span>
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
      <div class="modal" style="max-width: 920px; max-height: 88vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h2 class="card-title">🐉 Бестиарий: <span id="bestiaryWorldName"></span></h2>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
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

        <!-- Поиск и фильтры бестиария -->
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; align-items: center;">
          <input class="input" id="bestiarySearchInput" placeholder="🔍 Поиск по имени, расе, роли, локации, настроению, репликам..." style="flex: 1; min-width: 240px;" />
          <select class="input" id="bestiaryRoleFilter" style="width: auto; min-width: 150px;">
            <option value="all">⭐ Все роли</option>
            <option value="main">⭐ Главные (main)</option>
            <option value="secondary">○ Второстепенные (secondary)</option>
            <option value="tertiary">· Третьи (tertiary)</option>
          </select>
          <span id="bestiaryCountText" class="text-muted" style="font-size: var(--fs-xs); white-space: nowrap; margin-left: auto;"></span>
        </div>
        
        <!-- Вкладки категорий -->
        <div class="bestiary-tabs">
          <button class="bestiary-tab active" data-category="all">👥 Все</button>
          <button class="bestiary-tab" data-category="npc">🧠 NPC</button>
          <button class="bestiary-tab" data-category="beast">🐾 Звери</button>
          <button class="bestiary-tab" data-category="monster">👹 Монстры</button>
          <button class="bestiary-tab" data-category="boss">💀 Боссы</button>
        </div>
        
        <!-- Форма создания нового NPC -->
        <div id="createNpcForm" style="display: none; margin-bottom: 1rem; padding: 1.25rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-gold);">
          <h3 style="margin-bottom: 0.75rem; color: var(--accent-gold-bright);">✨ Новый персонаж / существо</h3>
          
          <div class="npc-section-title">📋 Основная информация</div>
          <div class="npc-form-grid">
            <div class="form-group">
              <label class="form-label">Имя / Вид *</label>
              <input class="input" id="new-npc-name" placeholder="Имя NPC или Вид существа" />
            </div>
            <div class="form-group">
              <label class="form-label">Раса</label>
              <input class="input" id="new-npc-race" value="Человек" placeholder="Человек, Эльф, Дварф..." />
            </div>
            <div class="form-group">
              <label class="form-label">Класс / Профессия</label>
              <input class="input" id="new-npc-class" placeholder="Воин, Кузнец, Трактирщик..." />
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
              <label class="form-label">Роль</label>
              <select class="input" id="new-npc-role">
                <option value="secondary">○ Второстепенный</option>
                <option value="main">⭐ Главный</option>
                <option value="tertiary">· Третьестепенный</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Локация</label>
              <input class="input" id="new-npc-location" placeholder="Название локации или города" />
            </div>
          </div>

          <div class="npc-section-title">⚔️ Боевые параметры и характеристики</div>
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 80px;">
              <label class="form-label">Уровень</label>
              <input class="input" type="number" id="new-npc-level" value="1" min="1" max="100" />
            </div>
            <div class="form-group" style="flex: 1; min-width: 80px;">
              <label class="form-label">HP</label>
              <input class="input" type="number" id="new-npc-hp" value="30" min="1" />
            </div>
            <div class="form-group" style="flex: 1; min-width: 80px;">
              <label class="form-label">КД (Armor)</label>
              <input class="input" type="number" id="new-npc-ac" value="10" min="1" max="40" />
            </div>
            <div class="form-group" style="flex: 1; min-width: 80px;">
              <label class="form-label">Инициатива</label>
              <input class="input" type="number" id="new-npc-init" value="0" min="-10" max="20" />
            </div>
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

          <div class="npc-section-title">🧠 Психология, Настроение и Отыгрыш</div>
          <div class="npc-form-grid">
            <div class="form-group">
              <label class="form-label">Темперамент</label>
              <input class="input" id="new-npc-temperament" placeholder="прагматик, сангвиник, холерик, осторожный..." />
            </div>
            <div class="form-group">
              <label class="form-label">Текущее настроение</label>
              <select class="input" id="new-npc-current-mood">
                <option value="calm">😌 Спокоен (calm)</option>
                <option value="suspicious">🤨 Подозрителен (suspicious)</option>
                <option value="cheerful">😄 Весел / благодушен (cheerful)</option>
                <option value="irritated">😠 Раздражён / зол (irritated)</option>
                <option value="frightened">😨 Напуган / в панике (frightened)</option>
                <option value="impressed">🤩 Впечатлён / восхищён (impressed)</option>
                <option value="mournful">😢 Печален / подавлен (mournful)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Мотивация / Личная цель</label>
              <input class="input" id="new-npc-motivation" placeholder="К чему стремится персонаж..." />
            </div>
            <div class="form-group">
              <label class="form-label">Стиль речи / Манера говорить</label>
              <input class="input" id="new-npc-speech-style" placeholder="жаргон, витиеватый аристократизм, хриплый бас..." />
            </div>
            <div class="form-group">
              <label class="form-label">Текущее занятие (сцена)</label>
              <input class="input" id="new-npc-current-activity" placeholder="Чем занят прямо сейчас в локации..." />
            </div>
            <div class="form-group">
              <label class="form-label">Распорядок дня</label>
              <input class="input" id="new-npc-daily-routine" placeholder="утром в лавке, днем на базаре, ночью спит..." />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Тайны и уязвимости (доверие >70)</label>
            <textarea class="input" id="new-npc-secrets" rows="2" placeholder="Скрытые слабости или тайны, раскрываемые только близким друзьям..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Слухи и зацепки (каждый с новой строки)</label>
            <textarea class="input" id="new-npc-rumors" rows="2" placeholder="Слух 1 о событиях в мире&#10;Слух 2 о сокровищах или заговорах"></textarea>
          </div>

          <div class="npc-section-title">📜 Внешность, Предыстория и Повадки</div>
          <div class="form-group">
            <label class="form-label">Внешность</label>
            <textarea class="input" id="new-npc-appearance" rows="2" placeholder="Описание внешности, одежды, примет..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Предыстория</label>
            <textarea class="input" id="new-npc-background" rows="2" placeholder="Предыстория персонажа..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Привычки (через запятую)</label>
            <input class="input" id="new-npc-habits" placeholder="крутит монету, поправляет воротник" />
          </div>
          <div class="form-group">
            <label class="form-label">Коронные фразы (через запятую)</label>
            <input class="input" id="new-npc-catchphrases" placeholder="Монета не пахнет, Предки ведут меня" />
          </div>
          <div class="form-group">
            <label class="form-label">Теги статуса (через запятую)</label>
            <input class="input" id="new-npc-status-tags" placeholder="торговец, наставник, стражник" />
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button class="btn btn-primary" id="saveNewNpcBtn">💾 Создать NPC</button>
            <button class="btn btn-ghost" id="cancelNewNpcBtn">Отмена</button>
          </div>
        </div>

        <div id="bestiaryContent">
          <p class="text-muted">Загрузка...</p>
        </div>
      </div>
    `;
    container.appendChild(bestiaryModal);

    // Модальное окно: География (Государства, Локации, Подзоны и Туман Войны)
    const geoModal = document.createElement('div');
    geoModal.className = 'modal-overlay';
    geoModal.id = 'geoModal';
    geoModal.innerHTML = `
      <div class="modal" style="max-width: 920px; max-height: 88vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h2 class="card-title">🗺️ География: <span id="geoWorldName"></span></h2>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="createStateBtn">+ Государство</button>
            <button class="btn btn-ghost btn-sm" id="closeGeoBtn">✕</button>
          </div>
        </div>
        
        <!-- Форма создания государства -->
        <div id="createStateForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-gold);">
          <h3 style="margin-bottom: 0.5rem; color: var(--accent-gold-bright);">🏰 Новое государство / Регион</h3>
          <div class="form-group">
            <label class="form-label">Название *</label>
            <input class="input" id="new-state-name" placeholder="Название государства" />
          </div>
          <div class="form-group">
            <label class="form-label">Описание</label>
            <textarea class="input" id="new-state-desc" rows="2" placeholder="Описание государства, климата, политики..."></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" id="saveNewStateBtn">💾 Создать</button>
            <button class="btn btn-ghost" id="cancelNewStateBtn">Отмена</button>
          </div>
        </div>
        
        <!-- Форма создания локации -->
        <div id="createCityForm" style="display: none; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-gold);">
          <h3 style="margin-bottom: 0.5rem; color: var(--accent-gold-bright);">📍 Новая локация</h3>
          <div class="npc-form-grid">
            <div class="form-group">
              <label class="form-label">Название *</label>
              <input class="input" id="new-city-name" placeholder="Название локации" />
            </div>
            <div class="form-group">
              <label class="form-label">Тип локации</label>
              <select class="input" id="new-city-type">
                <option value="city">🏘️ Город</option>
                <option value="capital">👑 Столица</option>
                <option value="village">🏡 Деревня</option>
                <option value="ruins">🏚️ Руины</option>
                <option value="landmark">⛰️ Достопримечательность</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Тип местности (Туман Войны)</label>
              <select class="input" id="new-city-terrain">
                <option value="urban">🏙️ Город / Улицы (urban)</option>
                <option value="building">🏰 Здание / Замок (building)</option>
                <option value="forest">🌲 Лес / Джунгли (forest)</option>
                <option value="cave">🕳️ Пещера / Подземелье (cave)</option>
                <option value="mountain">⛰️ Горы / Скалы (mountain)</option>
                <option value="open">🌾 Открытая равнина / Поля (open)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Государство</label>
              <select class="input" id="new-city-state"></select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Описание</label>
            <textarea class="input" id="new-city-desc" rows="2" placeholder="Атмосферное описание локации..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Стартовые подзоны (через запятую)</label>
            <input class="input" id="new-city-subzones" value="Вход, Центральная часть, Окрестности" placeholder="Вход, Рыночная площадь, Закоулки" />
            <span class="form-hint">Система автоматически сформирует подзоны и свяжет их начальной матрицей расстояний</span>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" id="saveNewCityBtn">💾 Создать локацию</button>
            <button class="btn btn-ghost" id="cancelNewCityBtn">Отмена</button>
          </div>
        </div>
        
        <div id="geoContent">
          <p class="text-muted">Загрузка географии...</p>
        </div>
      </div>
    `;
    container.appendChild(geoModal);

    // Модальное окно: Структура файла экспорта и Генератор для ИИ
    const schemaModal = document.createElement('div');
    schemaModal.className = 'modal-overlay';
    schemaModal.id = 'schemaModal';
    schemaModal.innerHTML = `
      <div class="modal" style="max-width: 950px; max-height: 88vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h2 class="card-title">ℹ️ Справка и Генератор Мира для ИИ</h2>
          <button class="btn btn-ghost btn-sm" id="closeSchemaBtn">✕</button>
        </div>
        <div class="schema-content">

          <!-- Блок прямого копирования мастер-промпта для внешней нейросети -->
          <div class="prompt-copy-card">
            <div class="prompt-copy-header">
              <div>
                <h3 style="color: var(--accent-gold-bright); margin-bottom: 2px;">🤖 Мастер-промпт для нейросетей (ChatGPT / Claude / DeepSeek)</h3>
                <p class="form-hint" style="margin: 0;">Скопируйте текст в один клик, отправьте любой нейросети вместе с описанием вашего мира — она создаст 100% валидный JSON для Multi-RP со всеми подзонами, матрицами расстояний и живой психологией NPC!</p>
              </div>
              <button class="btn btn-success btn-sm" id="copyMasterPromptBtn" style="white-space: nowrap;">📋 Скопировать промпт для ИИ</button>
            </div>
            <textarea class="prompt-textarea" id="masterPromptTextarea" rows="9" readonly></textarea>
          </div>
          
          <div class="schema-section">
            <h4>📁 Основные данные и Сюжет (Storyline)</h4>
            <ul>
              <li><strong>world.name</strong> — название сеттинга/мира</li>
              <li><strong>world.description</strong> — общее атмосферное описание эпохи</li>
              <li><strong>world.settings</strong> — расы (races[]), классы (classes[]), макс. уровень (max_level: 20)</li>
              <li><strong>world.settings.storyline</strong> — 4 сюжетных акта (act_1 .. act_4) с полями <code>title</code>, <code>description</code>, <code>key_npcs[]</code>, <code>key_locations[]</code></li>
              <li><strong>lore_files[]</strong> — файлы лора (folder, title, content, tags[])</li>
            </ul>
          </div>
          
          <div class="schema-section">
            <h4>🗺️ География и Навигация (geography)</h4>
            <ul>
              <li><strong>states[]</strong> — государства и регионы (name, description, ruler_id)</li>
              <li><strong>locations[]</strong> — города, деревни, руины:</li>
              <li style="margin-left: 1rem;"><code>name</code>, <code>type</code> (capital / city / village / ruins / landmark)</li>
              <li style="margin-left: 1rem;"><code>terrain_type</code> (<strong>urban</strong> | <strong>building</strong> | <strong>forest</strong> | <strong>cave</strong> | <strong>mountain</strong> | <strong>open</strong>) — определяет Туман Войны, обзор и модификаторы движения</li>
              <li style="margin-left: 1rem;"><code>zones[]</code> — подзоны локации (id, name, type: "open" | "closed")</li>
              <li style="margin-left: 1rem;"><code>location_map</code> — симметричная матрица расстояний в метрах между всеми подзонами: <code>location_map[A][B] === location_map[B][A]</code>, <code>location_map[A][A] = 0</code></li>
            </ul>
          </div>
          
          <div class="schema-section">
            <h4>🐉 Бестиарий, Психология и Отыгрыш (bestiary)</h4>
            <ul>
              <li><strong>npcs[]</strong> — все разумные жители и существа мира:</li>
              <li style="margin-left: 1rem;"><code>name</code> (имя для NPC и уникальных боссов; для диких зверей — только вид: "Волк", "Пещерный медведь")</li>
              <li style="margin-left: 1rem;"><code>race</code>, <code>class</code>, <code>category</code> (npc / beast / monster / boss), <code>role</code> (main / secondary / tertiary)</li>
              <li style="margin-left: 1rem;"><strong>Психология и Речь:</strong></li>
              <li style="margin-left: 2rem;"><code>temperament</code> — темперамент (прагматик, сангвиник, холерик, меланхолик, осторожный, фанатик...)</li>
              <li style="margin-left: 2rem;"><code>motivation</code> — личная скрытая или явная цель персонажа (богатство, защита семьи, власть, спасение)</li>
              <li style="margin-left: 2rem;"><code>current_mood</code> — строго одно из: <strong>calm</strong> | <strong>suspicious</strong> | <strong>cheerful</strong> | <strong>irritated</strong> | <strong>frightened</strong> | <strong>impressed</strong> | <strong>mournful</strong></li>
              <li style="margin-left: 2rem;"><code>speech_style</code> — манера речи (жаргон наёмников, витиеватый слог, хрипота, лаконичные фразы)</li>
              <li style="margin-left: 2rem;"><code>secrets</code> — тайна персонажа, раскрываемая ИИ только при доверии >70</li>
              <li style="margin-left: 2rem;"><code>rumors[]</code> — массив слухов о мире, заговорах и сокровищах</li>
              <li style="margin-left: 2rem;"><code>daily_routine</code> — распорядок дня (утро, день, вечер, ночь)</li>
              <li style="margin-left: 2rem;"><code>current_activity</code> — чем занят персонаж при встрече в локации</li>
              <li style="margin-left: 1rem;"><code>stats</code> (STR, DEX, CON, INT, WIS, CHA 1-30), <code>level</code> (1-100), <code>tier</code> (1-5), <code>hit_dice</code> (6, 8, 10, 12)</li>
              <li style="margin-left: 1rem;"><code>special_attacks[]</code>, <code>base_attacks[]</code>, <code>habits[]</code>, <code>catchphrases[]</code>, <code>status_tags[]</code></li>
            </ul>
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
          <p>Создайте новую сессию или перейдите во вкладку <strong>«Персонажи»</strong>, чтобы выбрать или настроить героя</p>
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
          const isHost = !s.worlds?.owner_id || s.worlds?.owner_id === user.id;
          const myPlayer = players.find((p) => p.user_id === user.id);
          return `
          <div class="card session-card" data-id="${s.id}">
            <div class="card-header">
              <span class="badge badge-${s.difficulty === 'easy' ? 'success' : s.difficulty === 'hard' ? 'primary' : 'info'}">
                ${s.difficulty === 'easy' ? 'Легко' : s.difficulty === 'hard' ? 'Хардкор' : 'Нормально'}
              </span>
              ${s.is_pvp_enabled ? '<span class="badge badge-gold">PvP</span>' : ''}
              ${isHost ? '<span class="badge badge-gold" style="margin-left: auto;">👑 Хост</span>' : '<span class="badge badge-info" style="margin-left: auto;">⚔️ Участник</span>'}
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
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <button class="btn btn-primary btn-sm" data-action="join" data-id="${s.id}">
                ${hasChar ? '🎮 Войти' : '⚔️ Создать героя'}
              </button>
              ${isHost ? `<button class="btn btn-secondary btn-sm" data-action="settings" data-id="${s.id}" title="Настройки сессии">⚙️</button>` : ''}
              <button class="btn btn-ghost btn-sm" data-action="invite" data-id="${s.id}" title="Копировать инвайт-ссылку">🔗</button>
              ${isHost ? `
                <button class="btn btn-ghost btn-sm" data-action="delete-session" data-id="${s.id}" title="Удалить сессию" style="margin-left: auto; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">🗑️</button>
              ` : (myPlayer ? `
                <button class="btn btn-ghost btn-sm" data-action="leave-session" data-id="${s.id}" data-player-id="${myPlayer.id}" title="Покинуть сессию" style="margin-left: auto; color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2);">🚪 Покинуть</button>
              ` : '')}
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
              <button class="btn btn-secondary btn-sm" data-action="geography" data-id="${w.id}" data-name="${w.name}">🗺️ География</button>
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
    const MOOD_OPTIONS = [
      { value: 'calm', label: '😌 Спокоен (calm)' },
      { value: 'suspicious', label: '🤨 Подозрителен (suspicious)' },
      { value: 'cheerful', label: '😄 Весел (cheerful)' },
      { value: 'irritated', label: '😠 Раздражён (irritated)' },
      { value: 'frightened', label: '😨 Напуган (frightened)' },
      { value: 'impressed', label: '🤩 Впечатлён (impressed)' },
      { value: 'mournful', label: '😢 Печален (mournful)' },
    ];

    const MOOD_LABELS = {
      calm: '😌 Спокоен',
      suspicious: '🤨 Подозрителен',
      cheerful: '😄 Весел',
      irritated: '😠 Раздражён',
      frightened: '😨 Напуган',
      impressed: '🤩 Впечатлён',
      mournful: '😢 Печален',
    };

    const TERRAIN_LABELS = {
      urban: '🏙️ Улицы / Город',
      building: '🏰 Здание / Интерьер',
      forest: '🌲 Лес / Заросли',
      cave: '🕳️ Пещера / Подземелье',
      mountain: '⛰️ Горы / Скалы',
      open: '🌾 Открытая равнина',
    };

    let cachedBestiaryNpcs = [];
    let bestiaryFilterState = {
      category: 'all',
      role: 'all',
      search: ''
    };

    function renderBestiaryList() {
      const content = document.getElementById('bestiaryContent');
      if (!content) return;

      const filtered = cachedBestiaryNpcs.filter((npc) => {
        const cat = npc.category || 'npc';
        const role = npc.role || 'secondary';
        if (bestiaryFilterState.category !== 'all' && cat !== bestiaryFilterState.category) return false;
        if (bestiaryFilterState.role !== 'all' && role !== bestiaryFilterState.role) return false;
        if (bestiaryFilterState.search) {
          const q = bestiaryFilterState.search;
          const searchTarget = [
            npc.name,
            npc.race,
            npc.class,
            npc.location_name,
            npc.temperament,
            npc.current_mood,
            npc.speech_style,
            npc.motivation,
            npc.current_activity,
            npc.secrets
          ].filter(Boolean).join(' ').toLowerCase();
          if (!searchTarget.includes(q)) return false;
        }
        return true;
      });

      const countEl = document.getElementById('bestiaryCountText');
      if (countEl) {
        countEl.textContent = `Показано: ${filtered.length} из ${cachedBestiaryNpcs.length}`;
      }

      if (!filtered.length) {
        content.innerHTML = '<p class="text-muted" style="padding: 1.5rem; text-align: center;">Ничего не найдено по заданным фильтрам.</p>';
        return;
      }

      const categoryLabels = { npc: '🧠 NPC', beast: '🐾 Зверь', monster: '👹 Монстр', boss: '💀 Босс' };
      const categoryColors = { npc: 'badge-info', beast: 'badge-success', monster: 'badge-warning', boss: 'badge-danger' };
      const roleLabels = { main: '⭐ Главный', secondary: '○ Второстепенный', tertiary: '· Третий' };
      const roleColors = { main: 'npc-role-main', secondary: 'npc-role-secondary', tertiary: 'npc-role-tertiary' };

      content.innerHTML = filtered.map((npc) => {
        const category = npc.category || 'npc';
        const role = npc.role || 'secondary';
        const level = npc.level || 1;
        const ac = npc.armor_class || 10;
        const init = npc.initiative || 0;
        const mood = npc.current_mood || 'calm';
        const hp = npc.hp || 30;
        const maxHp = npc.max_hp || hp;

        return `
          <div class="card npc-card" data-category="${category}" style="margin-bottom: 0.75rem;">
            <div class="npc-header" data-npc-toggle="${npc.id}">
              <div class="npc-header-info" style="flex-wrap: wrap; gap: 6px;">
                <span class="npc-role-badge ${roleColors[role] || 'npc-role-secondary'}">${roleLabels[role] || '○ Второстепенный'}</span>
                <strong class="npc-name" style="font-size: 1.05rem;">${npc.name}</strong>
                <span class="npc-category ${categoryColors[category]}">${categoryLabels[category]}</span>
                <span class="npc-race">${npc.race}${npc.class ? ` · ${npc.class}` : ''}</span>
                <span class="npc-combat-stats">Ур.${level} | HP ${hp}/${maxHp} | КД ${ac} | Иниц. ${init >= 0 ? '+' : ''}${init}</span>
                ${npc.location_name ? `<span class="npc-location">📍 ${npc.location_name}</span>` : ''}
                <span class="npc-mood-badge mood-${mood}">${MOOD_LABELS[mood] || '😌 Спокоен'}</span>
                ${npc.temperament ? `<span class="npc-temperament-badge">⚡ ${npc.temperament}</span>` : ''}
                
                ${npc.current_activity ? `<div class="npc-header-meta-row" style="width: 100%;"><span class="npc-subline-text" style="color: #81c784;">⏳ Занят: ${npc.current_activity}</span></div>` : ''}
                ${npc.speech_style ? `<div class="npc-header-meta-row" style="width: 100%;"><span class="npc-subline-text" style="color: #90caf9;">💬 Речь: ${npc.speech_style}</span></div>` : ''}
                ${npc.motivation ? `<div class="npc-header-meta-row" style="width: 100%;"><span class="npc-subline-text" style="color: #ffb74d;">🎯 Цель: ${npc.motivation}</span></div>` : ''}
              </div>
              <span class="npc-toggle-icon">▼</span>
            </div>
            
            <div id="npc-edit-${npc.id}" class="npc-edit-form" style="display: none;">
              
              <!-- Раздел 1: Основные данные -->
              <div class="npc-section-title">📋 Основная информация</div>
              <div class="npc-form-grid">
                <div class="form-group">
                  <label class="form-label">Имя / Вид</label>
                  <input class="input" id="npc-name-${npc.id}" value="${npc.name || ''}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Раса</label>
                  <input class="input" id="npc-race-${npc.id}" value="${npc.race || ''}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Класс / Профессия</label>
                  <input class="input" id="npc-class-${npc.id}" value="${npc.class || ''}" placeholder="Воин, Маг, Трактирщик..." />
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
                  <label class="form-label">Роль</label>
                  <select class="input" id="npc-role-${npc.id}">
                    <option value="main" ${role === 'main' ? 'selected' : ''}>⭐ Главный</option>
                    <option value="secondary" ${role === 'secondary' ? 'selected' : ''}>○ Второстепенный</option>
                    <option value="tertiary" ${role === 'tertiary' ? 'selected' : ''}>· Третьестепенный</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Локация</label>
                  <input class="input" id="npc-location-${npc.id}" value="${npc.location_name || ''}" placeholder="Город или локация" />
                </div>
              </div>

              <!-- Раздел 2: Боевые параметры и характеристики -->
              <div class="npc-section-title">⚔️ Боевые параметры и характеристики D&D</div>
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 75px;">
                  <label class="form-label">Уровень</label>
                  <input class="input" type="number" id="npc-level-${npc.id}" value="${level}" min="1" max="100" />
                </div>
                <div class="form-group" style="flex: 1; min-width: 75px;">
                  <label class="form-label">HP</label>
                  <input class="input" type="number" id="npc-hp-${npc.id}" value="${hp}" min="1" />
                </div>
                <div class="form-group" style="flex: 1; min-width: 75px;">
                  <label class="form-label">Max HP</label>
                  <input class="input" type="number" id="npc-maxhp-${npc.id}" value="${maxHp}" min="1" />
                </div>
                <div class="form-group" style="flex: 1; min-width: 75px;">
                  <label class="form-label">КД (Armor)</label>
                  <input class="input" type="number" id="npc-ac-${npc.id}" value="${ac}" min="1" max="40" />
                </div>
                <div class="form-group" style="flex: 1; min-width: 75px;">
                  <label class="form-label">Инициатива</label>
                  <input class="input" type="number" id="npc-initiative-${npc.id}" value="${init}" min="-10" max="20" />
                </div>
              </div>
              <div class="stats-grid-3" style="margin-bottom: 0.75rem;">
                ${['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(stat => `
                  <div class="stat-card">
                    <div class="stat-card-label">${stat}</div>
                    <input class="stat-card-input" type="number" id="npc-${stat.toLowerCase()}-${npc.id}" value="${npc.stats?.[stat] ?? 10}" min="1" max="30" />
                  </div>
                `).join('')}
              </div>

              <!-- Раздел 3: Психология, Настроение и Отыгрыш -->
              <div class="npc-section-title">🧠 Психология, Настроение и Отыгрыш</div>
              <div class="npc-form-grid">
                <div class="form-group">
                  <label class="form-label">Темперамент</label>
                  <input class="input" id="npc-temperament-${npc.id}" value="${npc.temperament || ''}" placeholder="холерик, сангвиник, прагматик..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Текущее настроение</label>
                  <select class="input" id="npc-mood-${npc.id}">
                    ${MOOD_OPTIONS.map(opt => `<option value="${opt.value}" ${mood === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Мотивация / Личная цель</label>
                  <input class="input" id="npc-motivation-${npc.id}" value="${npc.motivation || ''}" placeholder="К чему стремится персонаж..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Стиль речи / Манера говорить</label>
                  <input class="input" id="npc-speech-${npc.id}" value="${npc.speech_style || ''}" placeholder="жаргон, витиеватый слог, хрипота..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Текущее занятие (сцена)</label>
                  <input class="input" id="npc-activity-${npc.id}" value="${npc.current_activity || ''}" placeholder="Чем занят прямо сейчас в локации..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Распорядок дня</label>
                  <input class="input" id="npc-routine-${npc.id}" value="${npc.daily_routine || ''}" placeholder="утром в лавке, днем на площади, ночью спит..." />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Тайны и уязвимости (доверие >70)</label>
                <textarea class="input" id="npc-secrets-${npc.id}" rows="2" placeholder="Секрет или слабость, которую персонаж раскроет только близким друзьям...">${npc.secrets || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Слухи и сплетни о мире (каждый с новой строки)</label>
                <textarea class="input" id="npc-rumors-${npc.id}" rows="2" placeholder="Слух 1&#10;Слух 2">${Array.isArray(npc.rumors) ? npc.rumors.join('\n') : (npc.rumors || '')}</textarea>
              </div>

              <!-- Раздел 4: Внешность, Предыстория и Детали -->
              <div class="npc-section-title">📜 Внешность, Предыстория и Детали</div>
              <div class="form-group">
                <label class="form-label">Внешность</label>
                <textarea class="input" id="npc-appearance-${npc.id}" rows="2">${npc.appearance || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Предыстория</label>
                <textarea class="input" id="npc-background-${npc.id}" rows="2">${npc.background || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Привычки (через запятую)</label>
                <input class="input" id="npc-habits-${npc.id}" value="${Array.isArray(npc.habits) ? npc.habits.join(', ') : (npc.habits || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">Коронные фразы (через запятую)</label>
                <input class="input" id="npc-catchphrases-${npc.id}" value="${Array.isArray(npc.catchphrases) ? npc.catchphrases.join(', ') : (npc.catchphrases || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">Теги статуса (через запятую)</label>
                <input class="input" id="npc-status-tags-${npc.id}" value="${Array.isArray(npc.status_tags) ? npc.status_tags.join(', ') : (npc.status_tags || '')}" />
              </div>

              <div class="npc-actions">
                <button class="btn btn-primary" data-npc-save="${npc.id}">💾 Сохранить изменения</button>
                <button class="btn btn-secondary" data-npc-duplicate="${npc.id}">📋 Дублировать</button>
                <button class="btn btn-ghost" data-npc-delete="${npc.id}">🗑️ Удалить</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

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

      // Save NPC handler
      content.querySelectorAll('[data-npc-save]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const npcId = btn.dataset.npcSave;
          const locationName = document.getElementById(`npc-location-${npcId}`)?.value?.trim() || '';
          
          const rawRumors = document.getElementById(`npc-rumors-${npcId}`)?.value || '';
          const rumors = rawRumors.split('\n').map(s => s.trim()).filter(Boolean);

          const parseComma = (val) => (val || '').split(',').map(s => s.trim()).filter(Boolean);

          const updates = {
            name: document.getElementById(`npc-name-${npcId}`)?.value?.trim() || 'Без имени',
            race: document.getElementById(`npc-race-${npcId}`)?.value?.trim() || 'Человек',
            class: document.getElementById(`npc-class-${npcId}`)?.value?.trim() || '',
            category: document.getElementById(`npc-category-${npcId}`)?.value || 'npc',
            role: document.getElementById(`npc-role-${npcId}`)?.value || 'secondary',
            location_name: locationName,
            appearance: document.getElementById(`npc-appearance-${npcId}`)?.value?.trim() || '',
            background: document.getElementById(`npc-background-${npcId}`)?.value?.trim() || '',
            stats: {
              STR: Number(document.getElementById(`npc-str-${npcId}`)?.value) || 10,
              DEX: Number(document.getElementById(`npc-dex-${npcId}`)?.value) || 10,
              CON: Number(document.getElementById(`npc-con-${npcId}`)?.value) || 10,
              INT: Number(document.getElementById(`npc-int-${npcId}`)?.value) || 10,
              WIS: Number(document.getElementById(`npc-wis-${npcId}`)?.value) || 10,
              CHA: Number(document.getElementById(`npc-cha-${npcId}`)?.value) || 10,
            },
            level: Number(document.getElementById(`npc-level-${npcId}`)?.value) || 1,
            hp: Number(document.getElementById(`npc-hp-${npcId}`)?.value) || 30,
            max_hp: Number(document.getElementById(`npc-maxhp-${npcId}`)?.value) || 30,
            armor_class: Number(document.getElementById(`npc-ac-${npcId}`)?.value) || 10,
            initiative: Number(document.getElementById(`npc-initiative-${npcId}`)?.value) || 0,
            temperament: document.getElementById(`npc-temperament-${npcId}`)?.value?.trim() || '',
            current_mood: document.getElementById(`npc-mood-${npcId}`)?.value || 'calm',
            motivation: document.getElementById(`npc-motivation-${npcId}`)?.value?.trim() || '',
            speech_style: document.getElementById(`npc-speech-${npcId}`)?.value?.trim() || '',
            current_activity: document.getElementById(`npc-activity-${npcId}`)?.value?.trim() || '',
            daily_routine: document.getElementById(`npc-routine-${npcId}`)?.value?.trim() || '',
            secrets: document.getElementById(`npc-secrets-${npcId}`)?.value?.trim() || '',
            rumors,
            habits: parseComma(document.getElementById(`npc-habits-${npcId}`)?.value),
            catchphrases: parseComma(document.getElementById(`npc-catchphrases-${npcId}`)?.value),
            status_tags: parseComma(document.getElementById(`npc-status-tags-${npcId}`)?.value),
          };

          try {
            await updateNpc(npcId, updates);
            toast.success(`NPC «${updates.name}» успешно сохранён!`);
            const targetIdx = cachedBestiaryNpcs.findIndex(n => n.id === npcId);
            if (targetIdx !== -1) {
              cachedBestiaryNpcs[targetIdx] = { ...cachedBestiaryNpcs[targetIdx], ...updates };
              renderBestiaryList();
            }
          } catch (err) {
            toast.error('Ошибка сохранения: ' + err.message);
          }
        });
      });

      // Duplicate NPC handler
      content.querySelectorAll('[data-npc-duplicate]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const npcId = btn.dataset.npcDuplicate;
          const npc = cachedBestiaryNpcs.find(n => n.id === npcId);
          if (!npc) return;

          document.getElementById('new-npc-name').value = `${npc.name} (копия)`;
          document.getElementById('new-npc-race').value = npc.race || 'Человек';
          document.getElementById('new-npc-class').value = npc.class || '';
          document.getElementById('new-npc-category').value = npc.category || 'npc';
          document.getElementById('new-npc-role').value = npc.role || 'secondary';
          document.getElementById('new-npc-location').value = npc.location_name || '';
          document.getElementById('new-npc-level').value = npc.level || 1;
          document.getElementById('new-npc-hp').value = npc.hp || 30;
          document.getElementById('new-npc-ac').value = npc.armor_class || 10;
          document.getElementById('new-npc-init').value = npc.initiative || 0;
          document.getElementById('new-npc-str').value = npc.stats?.STR || 10;
          document.getElementById('new-npc-dex').value = npc.stats?.DEX || 10;
          document.getElementById('new-npc-con').value = npc.stats?.CON || 10;
          document.getElementById('new-npc-int').value = npc.stats?.INT || 10;
          document.getElementById('new-npc-wis').value = npc.stats?.WIS || 10;
          document.getElementById('new-npc-cha').value = npc.stats?.CHA || 10;
          document.getElementById('new-npc-temperament').value = npc.temperament || '';
          document.getElementById('new-npc-current-mood').value = npc.current_mood || 'calm';
          document.getElementById('new-npc-motivation').value = npc.motivation || '';
          document.getElementById('new-npc-speech-style').value = npc.speech_style || '';
          document.getElementById('new-npc-current-activity').value = npc.current_activity || '';
          document.getElementById('new-npc-daily-routine').value = npc.daily_routine || '';
          document.getElementById('new-npc-secrets').value = npc.secrets || '';
          document.getElementById('new-npc-rumors').value = Array.isArray(npc.rumors) ? npc.rumors.join('\n') : (npc.rumors || '');
          document.getElementById('new-npc-appearance').value = npc.appearance || '';
          document.getElementById('new-npc-background').value = npc.background || '';
          document.getElementById('new-npc-habits').value = Array.isArray(npc.habits) ? npc.habits.join(', ') : (npc.habits || '');
          document.getElementById('new-npc-catchphrases').value = Array.isArray(npc.catchphrases) ? npc.catchphrases.join(', ') : (npc.catchphrases || '');
          document.getElementById('new-npc-status-tags').value = Array.isArray(npc.status_tags) ? npc.status_tags.join(', ') : (npc.status_tags || '');

          const form = document.getElementById('createNpcForm');
          form.style.display = 'block';
          form.scrollIntoView({ behavior: 'smooth' });
          toast.info(`Данные «${npc.name}» скопированы в форму создания нового NPC`);
        });
      });

      // Delete NPC handler
      content.querySelectorAll('[data-npc-delete]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const npcId = btn.dataset.npcDelete;
          if (!confirm('Удалить этого персонажа/существо?')) return;
          try {
            await deleteNpc(npcId);
            toast.success('NPC удалён');
            cachedBestiaryNpcs = cachedBestiaryNpcs.filter(n => n.id !== npcId);
            renderBestiaryList();
          } catch (err) {
            toast.error('Ошибка удаления: ' + err.message);
          }
        });
      });
    }

    // Load bestiary for a world
    async function loadBestiary(worldId) {
      const content = document.getElementById('bestiaryContent');
      content.innerHTML = '<p class="text-muted">Загрузка NPC и существ...</p>';
      try {
        const npcs = await getNpcsByWorld(worldId);
        cachedBestiaryNpcs = npcs || [];
        if (!cachedBestiaryNpcs.length) {
          content.innerHTML = '<p class="text-muted">В этом мире пока нет NPC. Создайте первого вручную или сгенерируйте ИИ.</p>';
          const countEl = document.getElementById('bestiaryCountText');
          if (countEl) countEl.textContent = '0 существ';
          return;
        }
        renderBestiaryList();
      } catch (err) {
        content.innerHTML = `<p class="text-muted">Ошибка загрузки: ${err.message}</p>`;
      }
    }

    // Search and filter input events for bestiary
    document.getElementById('bestiarySearchInput')?.addEventListener('input', (e) => {
      bestiaryFilterState.search = e.target.value.trim().toLowerCase();
      renderBestiaryList();
    });

    document.getElementById('bestiaryRoleFilter')?.addEventListener('change', (e) => {
      bestiaryFilterState.role = e.target.value;
      renderBestiaryList();
    });

    // Bestiary Tab filtering
    container.querySelectorAll('.bestiary-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.bestiary-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        bestiaryFilterState.category = tab.dataset.category || 'all';
        renderBestiaryList();
      });
    });

    // Create NPC form toggle
    document.getElementById('createNpcBtn')?.addEventListener('click', () => {
      const form = document.getElementById('createNpcForm');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display === 'block') {
        form.scrollIntoView({ behavior: 'smooth' });
      }
    });

    document.getElementById('cancelNewNpcBtn')?.addEventListener('click', () => {
      document.getElementById('createNpcForm').style.display = 'none';
    });

    // Save new NPC
    document.getElementById('saveNewNpcBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-npc-name').value.trim();
      if (!name) {
        toast.error('Введите имя NPC или название вида');
        return;
      }

      const parseComma = (str) => (str || '').split(',').map(s => s.trim()).filter(Boolean);
      const rawRumors = document.getElementById('new-npc-rumors')?.value || '';
      const rumors = rawRumors.split('\n').map(s => s.trim()).filter(Boolean);

      const role = document.getElementById('new-npc-role').value;
      const race = document.getElementById('new-npc-race').value.trim() || 'Человек';
      const className = document.getElementById('new-npc-class')?.value?.trim() || '';
      const hp = Number(document.getElementById('new-npc-hp').value) || 30;
      const category = document.getElementById('new-npc-category')?.value || 'npc';
      const locationName = document.getElementById('new-npc-location')?.value?.trim() || '';
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

      const temperament = document.getElementById('new-npc-temperament')?.value?.trim() || '';
      const currentMood = document.getElementById('new-npc-current-mood')?.value || 'calm';
      const motivation = document.getElementById('new-npc-motivation')?.value?.trim() || '';
      const speechStyle = document.getElementById('new-npc-speech-style')?.value?.trim() || '';
      const currentActivity = document.getElementById('new-npc-current-activity')?.value?.trim() || '';
      const dailyRoutine = document.getElementById('new-npc-daily-routine')?.value?.trim() || '';
      const secrets = document.getElementById('new-npc-secrets')?.value?.trim() || '';

      const habits = parseComma(document.getElementById('new-npc-habits').value);
      const catchphrases = parseComma(document.getElementById('new-npc-catchphrases').value);
      const statusTags = parseComma(document.getElementById('new-npc-status-tags').value);

      const level = Number(document.getElementById('new-npc-level')?.value) || 1;
      const ac = Number(document.getElementById('new-npc-ac')?.value) || 10;
      const init = Number(document.getElementById('new-npc-init')?.value) || 0;

      const saveBtn = document.getElementById('saveNewNpcBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Создание...';

      try {
        await createNpc({
          world_id: currentBestiaryWorldId,
          name,
          role,
          race,
          class: className,
          category,
          location_name: locationName || null,
          hp,
          max_hp: hp,
          level,
          armor_class: ac,
          initiative: init,
          appearance,
          background,
          stats,
          temperament,
          current_mood: currentMood,
          motivation,
          speech_style: speechStyle,
          current_activity: currentActivity,
          daily_routine: dailyRoutine,
          secrets,
          rumors,
          habits,
          catchphrases,
          status_tags: statusTags,
        });
        toast.success(`Персонаж «${name}» успешно создан!`);
        document.getElementById('createNpcForm').style.display = 'none';
        document.getElementById('new-npc-name').value = '';
        document.getElementById('new-npc-appearance').value = '';
        document.getElementById('new-npc-background').value = '';
        document.getElementById('new-npc-habits').value = '';
        document.getElementById('new-npc-catchphrases').value = '';
        document.getElementById('new-npc-status-tags').value = '';
        document.getElementById('new-npc-secrets').value = '';
        document.getElementById('new-npc-rumors').value = '';
        await loadBestiary(currentBestiaryWorldId);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Создать NPC';
      }
    });

    // ===================== GEOGRAPHY =====================
    
    // Load geography
    async function loadGeography(worldId) {
      const content = document.getElementById('geoContent');
      const stateSelect = document.getElementById('new-city-state');
      content.innerHTML = '<p class="text-muted">Загрузка географии и локаций...</p>';
      
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
          content.innerHTML = '<p class="text-muted">Государства не созданы. Нажмите «+ Государство», чтобы начать.</p>';
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
                <button class="btn btn-secondary btn-sm" data-add-city="${state.id}" data-state-name="${state.name}">+ Локация</button>
                <button class="btn btn-ghost btn-sm" data-delete-state="${state.id}">🗑️</button>
                <span class="npc-toggle-icon">▼</span>
              </div>
            </div>
            <div id="state-edit-${state.id}" class="state-edit-form" style="display: none;">
              <div class="form-group">
                <label class="form-label">Название государства</label>
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
                <div class="city-item" data-city-id="${loc.id}" style="margin-bottom: 0.5rem;">
                  <div class="city-info" style="flex: 1; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
                    <span class="city-type-icon">${loc.type === 'capital' ? '👑' : loc.type === 'city' ? '🏘️' : loc.type === 'village' ? '🏡' : loc.type === 'ruins' ? '🏚️' : '⛰️'}</span>
                    <strong class="city-name">${loc.name}</strong>
                    <span class="city-type">${loc.type}</span>
                    <span class="terrain-badge terrain-${loc.terrain_type || 'open'}">${TERRAIN_LABELS[loc.terrain_type] || '🌾 Равнина'}</span>
                    <span class="zone-count-badge">🎯 ${Array.isArray(loc.zones) ? loc.zones.length : 0} подзон</span>
                    ${loc.location_map && Object.keys(loc.location_map).length ? '<span style="font-size:0.7rem; color:#81c784;">🗺️ Дистанции OK</span>' : '<span style="font-size:0.7rem; color:#e57373;">⚠️ Без матрицы</span>'}
                  </div>
                  <div class="city-actions">
                    <button class="btn btn-secondary btn-sm" data-edit-city="${loc.id}">✏️ Настроить</button>
                    <button class="btn btn-ghost btn-sm" data-delete-city="${loc.id}">🗑️</button>
                  </div>
                </div>

                <!-- Блок полного редактирования локации -->
                <div id="city-edit-${loc.id}" style="display: none; padding: 1.25rem; margin-bottom: 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-gold);">
                  <h4 style="margin-bottom: 0.75rem; color: var(--accent-gold-bright);">✏️ Настройка локации: ${loc.name}</h4>
                  <div class="npc-form-grid">
                    <div class="form-group">
                      <label class="form-label">Название *</label>
                      <input class="input" id="edit-loc-name-${loc.id}" value="${loc.name || ''}" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Тип локации</label>
                      <select class="input" id="edit-loc-type-${loc.id}">
                        <option value="city" ${loc.type === 'city' ? 'selected' : ''}>🏘️ Город</option>
                        <option value="capital" ${loc.type === 'capital' ? 'selected' : ''}>👑 Столица</option>
                        <option value="village" ${loc.type === 'village' ? 'selected' : ''}>🏡 Деревня</option>
                        <option value="ruins" ${loc.type === 'ruins' ? 'selected' : ''}>🏚️ Руины</option>
                        <option value="landmark" ${loc.type === 'landmark' ? 'selected' : ''}>⛰️ Достопримечательность</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Тип местности (Туман Войны)</label>
                      <select class="input" id="edit-loc-terrain-${loc.id}">
                        <option value="urban" ${loc.terrain_type === 'urban' ? 'selected' : ''}>🏙️ Город / Улицы (urban)</option>
                        <option value="building" ${loc.terrain_type === 'building' ? 'selected' : ''}>🏰 Здание / Замок (building)</option>
                        <option value="forest" ${loc.terrain_type === 'forest' ? 'selected' : ''}>🌲 Лес / Джунгли (forest)</option>
                        <option value="cave" ${loc.terrain_type === 'cave' ? 'selected' : ''}>🕳️ Пещера / Катакомбы (cave)</option>
                        <option value="mountain" ${loc.terrain_type === 'mountain' ? 'selected' : ''}>⛰️ Горы / Скалы (mountain)</option>
                        <option value="open" ${loc.terrain_type === 'open' ? 'selected' : ''}>🌾 Открытая равнина / Поля (open)</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Описание</label>
                    <textarea class="input" id="edit-loc-desc-${loc.id}" rows="2">${loc.description || ''}</textarea>
                  </div>
                  <div class="form-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <label class="form-label" style="margin: 0;">Подзоны локации (JSON-массив)</label>
                      <button type="button" class="btn btn-ghost btn-sm" data-helper-zones="${loc.id}">✨ Задать 3 зоны (Вход, Центр, Глубины)</button>
                    </div>
                    <textarea class="input" id="edit-loc-zones-${loc.id}" rows="4" style="font-family: var(--font-mono); font-size: 0.8rem;">${JSON.stringify(loc.zones || [], null, 2)}</textarea>
                  </div>
                  <div class="form-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <label class="form-label" style="margin: 0;">Матрица расстояний в метрах (JSON-объект)</label>
                      <button type="button" class="btn btn-ghost btn-sm" data-helper-matrix="${loc.id}">⚡ Рассчитать матрицу расстояний</button>
                    </div>
                    <textarea class="input" id="edit-loc-map-${loc.id}" rows="5" style="font-family: var(--font-mono); font-size: 0.8rem;">${JSON.stringify(loc.location_map || {}, null, 2)}</textarea>
                  </div>
                  <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                    <button class="btn btn-primary" data-save-city="${loc.id}">💾 Сохранить локацию</button>
                    <button class="btn btn-ghost" data-cancel-city="${loc.id}">✕ Отмена</button>
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

        // Edit location toggle handler
        content.querySelectorAll('[data-edit-city]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const locId = btn.dataset.editCity;
            const editBox = document.getElementById(`city-edit-${locId}`);
            if (editBox) {
              const isOpen = editBox.style.display !== 'none';
              editBox.style.display = isOpen ? 'none' : 'block';
            }
          });
        });

        // Cancel location edit
        content.querySelectorAll('[data-cancel-city]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const locId = btn.dataset.cancelCity;
            const editBox = document.getElementById(`city-edit-${locId}`);
            if (editBox) editBox.style.display = 'none';
          });
        });

        // Helper: populate default zones
        content.querySelectorAll('[data-helper-zones]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const locId = btn.dataset.helperZones;
            const textarea = document.getElementById(`edit-loc-zones-${locId}`);
            if (textarea) {
              const defaultZones = [
                { id: `zone_${locId}_entrance`, name: "Вход / Окрестности", type: "open" },
                { id: `zone_${locId}_center`, name: "Центральная часть", type: "open" },
                { id: `zone_${locId}_deep`, name: "Глубины / Закоулки", type: "closed" }
              ];
              textarea.value = JSON.stringify(defaultZones, null, 2);
              toast.info('Подзоны сформированы. Нажмите «Рассчитать матрицу», чтобы связать их.');
            }
          });
        });

        // Helper: calculate symmetric distance matrix
        content.querySelectorAll('[data-helper-matrix]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const locId = btn.dataset.helperMatrix;
            const zonesText = document.getElementById(`edit-loc-zones-${locId}`)?.value || '[]';
            const mapTextarea = document.getElementById(`edit-loc-map-${locId}`);
            try {
              const zones = JSON.parse(zonesText);
              if (!Array.isArray(zones) || !zones.length) {
                toast.warning('Сначала задайте список подзон в поле выше');
                return;
              }
              const map = {};
              zones.forEach((z1, i) => {
                map[z1.id] = {};
                zones.forEach((z2, j) => {
                  if (z1.id === z2.id) {
                    map[z1.id][z2.id] = 0;
                  } else {
                    const dist = Math.abs(i - j) * 15;
                    map[z1.id][z2.id] = dist;
                  }
                });
              });
              if (mapTextarea) {
                mapTextarea.value = JSON.stringify(map, null, 2);
                toast.success('Симметричная матрица расстояний рассчитана!');
              }
            } catch (err) {
              toast.error('Некорректный JSON подзон: ' + err.message);
            }
          });
        });

        // Save location updates
        content.querySelectorAll('[data-save-city]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const locId = btn.dataset.saveCity;
            const name = document.getElementById(`edit-loc-name-${locId}`)?.value?.trim();
            if (!name) { toast.error('Введите название локации'); return; }

            const type = document.getElementById(`edit-loc-type-${locId}`)?.value || 'city';
            const terrain_type = document.getElementById(`edit-loc-terrain-${locId}`)?.value || 'open';
            const description = document.getElementById(`edit-loc-desc-${locId}`)?.value?.trim() || '';

            let zones = [];
            try {
              const zonesRaw = document.getElementById(`edit-loc-zones-${locId}`)?.value;
              if (zonesRaw) zones = JSON.parse(zonesRaw);
            } catch { toast.error('Ошибка в JSON подзон'); return; }

            let location_map = {};
            try {
              const mapRaw = document.getElementById(`edit-loc-map-${locId}`)?.value;
              if (mapRaw) location_map = JSON.parse(mapRaw);
            } catch { toast.error('Ошибка в JSON матрицы расстояний'); return; }

            try {
              await updateLocation(locId, {
                name,
                type,
                terrain_type,
                description,
                zones,
                location_map,
              });
              toast.success(`Локация «${name}» сохранена!`);
              await loadGeography(worldId);
            } catch (err) {
              toast.error('Ошибка сохранения: ' + err.message);
            }
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
              await deleteLocation(btn.dataset.deleteCity);
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
    
    // Open geography modal from Bestiary
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
    
    document.getElementById('cancelNewCityBtn')?.addEventListener('click', () => {
      document.getElementById('createCityForm').style.display = 'none';
    });
    
    // Save new city / location
    document.getElementById('saveNewCityBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-city-name').value.trim();
      if (!name) { toast.error('Введите название локации'); return; }
      const stateId = document.getElementById('new-city-state').value;
      const type = document.getElementById('new-city-type').value;
      const terrain_type = document.getElementById('new-city-terrain')?.value || 'open';
      const description = document.getElementById('new-city-desc').value.trim();

      // Build default zones and distance matrix from subzone input
      const subzonesRaw = document.getElementById('new-city-subzones')?.value || 'Вход, Центр, Окрестности';
      const subzoneNames = subzonesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const zones = subzoneNames.map((zName, idx) => ({
        id: `zone_${Date.now()}_${idx + 1}`,
        name: zName,
        type: idx === 0 ? 'open' : (idx === subzoneNames.length - 1 ? 'closed' : 'open')
      }));

      const location_map = {};
      zones.forEach((z1, i) => {
        location_map[z1.id] = {};
        zones.forEach((z2, j) => {
          location_map[z1.id][z2.id] = (z1.id === z2.id) ? 0 : Math.abs(i - j) * 15;
        });
      });

      try {
        await createLocation({
          state_id: stateId,
          name,
          type,
          terrain_type,
          description,
          zones,
          location_map,
        });
        toast.success(`Локация «${name}» создана с ${zones.length} подзонами!`);
        document.getElementById('createCityForm').style.display = 'none';
        document.getElementById('new-city-name').value = '';
        document.getElementById('new-city-desc').value = '';
        await loadGeography(currentBestiaryWorldId);
      } catch (err) {
        toast.error('Ошибка создания локации: ' + err.message);
      }
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

    // Toggle OpenRouter Key visibility
    document.getElementById('toggleOpenrouterKeyVisibilityBtn')?.addEventListener('click', () => {
      const keyInput = document.getElementById('openrouterKeyInput');
      const toggleBtn = document.getElementById('toggleOpenrouterKeyVisibilityBtn');
      if (!keyInput) return;
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        if (toggleBtn) toggleBtn.textContent = '🙈';
      } else {
        keyInput.type = 'password';
        if (toggleBtn) toggleBtn.textContent = '👁️';
      }
    });

    // Copy OpenRouter API Key
    document.getElementById('copyOpenrouterKeyBtn')?.addEventListener('click', () => {
      const keyInput = document.getElementById('openrouterKeyInput');
      const key = keyInput?.value?.trim() || userSettings?.openrouter_key || '';
      if (!key) {
        toast.warning('Ключ OpenRouter ещё не введен');
        return;
      }
      navigator.clipboard.writeText(key);
      toast.success('OpenRouter API Key скопирован в буфер обмена!');
    });

    // Copy DB invite link from lobby
    const copyDbInviteHandler = () => {
      const currentConfig = getActiveDatabaseConfig();
      if (!currentConfig.isCustom) return;
      const inviteLink = generateDbInviteUrl(currentConfig.url, currentConfig.anonKey);
      navigator.clipboard.writeText(inviteLink);
      toast.success('Инвайт-ссылка в вашу БД скопирована! Отправьте её друзьям, чтобы играть в одной БД.');
    };

    document.getElementById('lobbyCustomDbBadge')?.addEventListener('click', copyDbInviteHandler);
    document.getElementById('lobbyCopyDbInviteBtn')?.addEventListener('click', copyDbInviteHandler);

    // Preset buttons for model selection
    document.getElementById('presetFreeBtn')?.addEventListener('click', () => {
      const card = document.getElementById('cardModelInput');
      const dm = document.getElementById('dmModelInput');
      const gps = document.getElementById('gpsModelInput');
      const sat = document.getElementById('satelliteModelInput');
      if (card) card.value = 'google/gemma-4-31b-it:free';
      if (dm) dm.value = 'minimax/minimax-m3:free';
      if (gps) gps.value = 'google/gemma-4-31b-it:free';
      if (sat) sat.value = 'google/gemma-4-31b-it:free';
      toast.info('Применен пресет: 🆓 Полностью бесплатно ($0)');
    });

    document.getElementById('presetOptimumBtn')?.addEventListener('click', () => {
      const card = document.getElementById('cardModelInput');
      const dm = document.getElementById('dmModelInput');
      const gps = document.getElementById('gpsModelInput');
      const sat = document.getElementById('satelliteModelInput');
      if (card) card.value = 'google/gemma-4-31b-it:free';
      if (dm) dm.value = 'openai/gpt-4o-mini';
      if (gps) gps.value = 'google/gemma-4-31b-it:free';
      if (sat) sat.value = 'google/gemini-flash-1.5';
      toast.info('Применен пресет: ⚡ Оптимум (~$0.50 / 1000 ходов)');
    });

    document.getElementById('presetMaxBtn')?.addEventListener('click', () => {
      const card = document.getElementById('cardModelInput');
      const dm = document.getElementById('dmModelInput');
      const gps = document.getElementById('gpsModelInput');
      const sat = document.getElementById('satelliteModelInput');
      if (card) card.value = 'openai/gpt-4o-mini';
      if (dm) dm.value = 'anthropic/claude-3-5-haiku';
      if (gps) gps.value = 'google/gemini-flash-1.5';
      if (sat) sat.value = 'google/gemini-flash-1.5';
      toast.info('Применен пресет: 👑 Максимальное качество');
    });

    // Save account settings
    document.getElementById('saveAccountSettingsBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const keyInput = document.getElementById('openrouterKeyInput');
      const cardModelSelect = document.getElementById('cardModelInput');
      const dmModelSelect = document.getElementById('dmModelInput');
      const gpsModelSelect = document.getElementById('gpsModelInput');
      const satelliteModelSelect = document.getElementById('satelliteModelInput');
      const saveBtn = document.getElementById('saveAccountSettingsBtn');
      
      const key = keyInput?.value?.trim() || '';
      const cardModel = cardModelSelect?.value || 'google/gemma-4-31b-it:free';
      const dmModel = dmModelSelect?.value || 'minimax/minimax-m3:free';
      const gpsModel = gpsModelSelect?.value || 'google/gemma-4-31b-it:free';
      const satelliteModel = satelliteModelSelect?.value || 'google/gemma-4-31b-it:free';
      
      console.log('Saving settings:', { cardModel, dmModel, gpsModel, satelliteModel });
      
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';

      try {
        await upsertUserSettings(user.id, key, { card_model: cardModel, dm_model: dmModel, gps_model: gpsModel, satellite_model: satelliteModel });
        toast.success('Настройки сохранены!');
        userSettings.card_model = cardModel;
        userSettings.dm_model = dmModel;
        userSettings.gps_model = gpsModel;
        userSettings.satellite_model = satelliteModel;
        document.getElementById('accountSettingsModal').classList.remove('open');
        loadData();
      } catch (err) {
        console.error('Save settings error:', err);
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
      const uuidMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        sessionId = uuidMatch[0];
      } else {
        const urlMatch = input.match(/session\/([a-f0-9-]+)/i);
        if (urlMatch) sessionId = urlMatch[1];
      }

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

    // Geography button (from world card)
    container.querySelectorAll('[data-action="geography"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const worldId = btn.dataset.id;
        const worldName = btn.dataset.name;
        currentBestiaryWorldId = worldId;
        updateLobbyState('currentBestiaryWorldId', worldId);
        document.getElementById('geoWorldName').textContent = worldName;
        document.getElementById('geoModal').classList.add('open');
        document.getElementById('createCityForm').style.display = 'none';
        await loadGeography(worldId);
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
        const base = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
        const url = `${window.location.origin}${base}#/session/${btn.dataset.id}`;
        navigator.clipboard.writeText(url);
        toast.success('Инвайт-ссылка скопирована!');
      });
    });
    container.querySelectorAll('[data-action="delete-session"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sessionId = btn.dataset.id;
        const targetSession = sessions.find((s) => s.id === sessionId);
        const worldName = targetSession?.worlds?.name || 'этой сессии';
        const confirmed = window.confirm(
          `Удалить игровую сессию в мире «${worldName}»?\n\n` +
          `• Вся история сообщений, ходов и прогресс партии будут безвозвратно удалены.\n` +
          `• Карточки ваших персонажей и карточка мира сохранятся в безопасности.`
        );
        if (!confirmed) return;

        try {
          toast.info('Удаление сессии...');
          await deleteSession(sessionId);
          toast.success('Сессия успешно удалена');
          sessions = await getSessions(user.id);
          render();
        } catch (err) {
          toast.error('Ошибка удаления сессии: ' + (err.message || err));
        }
      });
    });

    // Leave session (for guest participants)
    container.querySelectorAll('[data-action="leave-session"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sessionId = btn.dataset.id;
        const playerId = btn.dataset.playerId;
        const targetSession = sessions.find((s) => s.id === sessionId);
        const worldName = targetSession?.worlds?.name || 'этой сессии';
        const confirmed = window.confirm(
          `Покинуть игровую сессию в мире «${worldName}»?\n\n` +
          `• Ваш персонаж будет удален из этой партии.\n` +
          `• Сама сессия и игровой прогресс других участников останутся без изменений.\n` +
          `• Карточка вашего персонажа сохранится в безопасности во вкладке «Персонажи».`
        );
        if (!confirmed) return;

        try {
          toast.info('Выход из сессии...');
          await deletePlayer(playerId);
          toast.success('Вы успешно покинули сессию');
          sessions = await getSessions(user.id);
          render();
        } catch (err) {
          toast.error('Ошибка при выходе из сессии: ' + (err.message || err));
        }
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

    // Initialize Master AI World Prompt in Schema Modal
    const masterPromptTextarea = document.getElementById('masterPromptTextarea');
    if (masterPromptTextarea) {
      masterPromptTextarea.value = MASTER_AI_WORLD_PROMPT;
    }

    // Copy Master Prompt Button
    document.getElementById('copyMasterPromptBtn')?.addEventListener('click', async () => {
      const text = masterPromptTextarea ? masterPromptTextarea.value : MASTER_AI_WORLD_PROMPT;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else if (masterPromptTextarea) {
          masterPromptTextarea.select();
          document.execCommand('copy');
        }
        toast.success('Мастер-промпт скопирован! Отправьте его нейросети вместе с описанием вашего мира.');
      } catch (err) {
        toast.error('Не удалось скопировать в буфер: ' + err.message);
      }
    });

    // Schema info button
    container.querySelectorAll('[data-action="schema-info"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (masterPromptTextarea) {
          masterPromptTextarea.value = MASTER_AI_WORLD_PROMPT;
        }
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
        const result = await importWorld(text, user.id);
        const { stats } = result;
        
        // Build informative message about what was imported
        const parts = [];
        if (stats.stateCount) parts.push(`${stats.stateCount} гос.`);
        if (stats.locationCount) parts.push(`${stats.locationCount} лок.`);
        if (stats.npcCount) parts.push(`${stats.npcCount} NPC`);
        if (stats.loreCount) parts.push(`${stats.loreCount} файлов`);
        
        let msg = `Мир «${result.world.name}» импортирован!`;
        if (parts.length) msg += ` (${parts.join(', ')})`;
        
        if (!stats.hasGeography && !stats.hasBestiary) {
          msg += '. Географию и бестиарий можно сгенерировать в настройках мира.';
        } else if (!stats.hasGeography) {
          msg += '. Географию можно сгенерировать в настройках мира.';
        } else if (!stats.hasBestiary) {
          msg += '. Бестиарий можно дополнить в настройках мира.';
        }
        
        toast.success(msg);
        loadData();
      } catch (err) {
        toast.error('Ошибка импорта: ' + err.message);
      }
      e.target.value = '';
    });

    // Delete world
    container.querySelectorAll('[data-action="delete-world"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const worldId = btn.dataset.id;
        const targetWorld = worlds.find((w) => w.id === worldId);
        const worldName = targetWorld?.name || 'этого мира';
        const confirmed = window.confirm(
          `Удалить карточку мира «${worldName}»?\n\n` +
          `• Все данные мира (государства, локации, бестиарий NPC, файлы лора) будут безвозвратно удалены.\n` +
          `• Ваши игровые сессии (сообщения, персонажи игроков, инвентарь и прогресс) сохранятся в безопасности.`
        );
        if (!confirmed) return;
        try {
          toast.info('Удаление мира...');
          const res = await deleteWorld(worldId);
          toast.success(`Мир «${worldName}» и все его данные успешно удалены`);
          loadData();
        } catch (err) {
          toast.error('Ошибка удаления мира: ' + (err.message || err));
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
