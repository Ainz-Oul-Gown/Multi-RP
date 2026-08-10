// src/pages/game.js — Игровой экран (Чат + Инвентарь + Профиль)
import { supabase, subscribeToSessionMessages, subscribeToSessionPlayers } from '../api/supabase.js';
import {
  getSession, getSessionPlayers, getPlayer, getPlayerInventory,
  getSessionMessages, submitAction, updatePlayer, addInventoryItem,
  removeInventoryItem, exportPlayer, downloadJSON, getCurrentTurn, createPlayer,
  getCharacterCards
} from '../api/game.js';
import { STATS } from '../config.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';

export async function renderGame(container, sessionId, user) {
  let session = null;
  let currentPlayer = null;
  let allPlayers = [];
  let messages = [];
  let activePanel = null; // 'profile' | 'inventory' | 'settings' | null
  let isSubmitting = false;
  let isMyTurn = true; // По умолчанию разрешаем ввод
  let unsubMessages = null;
  let unsubPlayers = null;
  let unsubTurnQueue = null;

  async function load() {
    try {
      session = await getSession(sessionId);
      allPlayers = await getSessionPlayers(sessionId);
      currentPlayer = allPlayers.find((p) => p.user_id === user.id) || allPlayers[0];
      messages = await getSessionMessages(sessionId);

      // Проверяем очередь ходов при загрузке
      await checkTurnQueue();
    } catch (err) {
      toast.error('Ошибка загрузки: ' + err.message);
      router.navigate('/');
      return;
    }

    if (!currentPlayer) {
      renderCharacterCreation();
      return;
    }

    render();
    subscribeRealtime();
  }

  // ============================================
  // ОЧЕРЕДЬ ХОДОВ: проверка и подписка
  // ============================================
  async function checkTurnQueue() {
    if (!currentPlayer) return;

    // Если в сессии 1 игрок — всегда его ход
    if (allPlayers.length <= 1) {
      isMyTurn = true;
      return;
    }

    try {
      const currentTurn = await getCurrentTurn(sessionId);
      if (currentTurn) {
        isMyTurn = currentTurn.player_id === currentPlayer.id;
      } else {
        // Нет активного хода — разрешаем ввод (первый ход)
        isMyTurn = true;
      }
    } catch {
      isMyTurn = true;
    }
  }

  function subscribeRealtime() {
    unsubMessages = subscribeToSessionMessages(sessionId, (payload) => {
      if (payload.eventType === 'INSERT') {
        const msg = payload.new;
        messages.push(msg);
        // Полуслепой чат: Мастер, системные, и СОБСТВЕННЫЕ сообщения
        if (
          msg.sender_type === 'master' ||
          msg.sender_type === 'system' ||
          (msg.sender_type === 'player' && msg.sender_id === user.id)
        ) {
          appendMessage(msg);
        }
      }
    });

    unsubPlayers = subscribeToSessionPlayers(sessionId, (payload) => {
      if (payload.eventType === 'UPDATE') {
        const idx = allPlayers.findIndex((p) => p.id === payload.new.id);
        if (idx >= 0) allPlayers[idx] = { ...allPlayers[idx], ...payload.new };
        if (currentPlayer && currentPlayer.id === payload.new.id) {
          currentPlayer = { ...currentPlayer, ...payload.new };
          updatePlayerUI();
        }
      }
    });

    // Подписка на очередь ходов
    unsubTurnQueue = supabase
      .channel(`realtime:turn_queue:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'turn_queue',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          handleTurnUpdate(payload);
        }
      )
      .subscribe();
  }

  function handleTurnUpdate(payload) {
    if (!currentPlayer) return;

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const turn = payload.new;
      if (turn.status === 'active') {
        const wasMyTurn = isMyTurn;
        isMyTurn = turn.player_id === currentPlayer.id;

        // Снимаем блокировку, когда наступает наш ход
        if (!wasMyTurn && isMyTurn) {
          toast.info('Ваш ход!');
        }

        updateInputState();
      }
    }

    // Если все ходы завершены — разрешаем ввод
    if (payload.eventType === 'DELETE') {
      isMyTurn = true;
      updateInputState();
    }
  }

  function updateInputState() {
    const input = document.getElementById('actionInput');
    const sendBtn = document.getElementById('sendBtn');
    if (!input || !sendBtn) return;

    if (!isMyTurn || isSubmitting) {
      input.disabled = true;
      input.placeholder = 'Ожидание действий напарника...';
      sendBtn.disabled = true;
    } else {
      input.disabled = false;
      input.placeholder = 'Опишите действие вашего героя...';
      sendBtn.disabled = false;
    }
  }

  function render() {
    const hpPercent = currentPlayer ? (currentPlayer.hp / currentPlayer.max_hp) * 100 : 100;
    const hpClass = hpPercent > 50 ? '' : hpPercent > 25 ? 'low' : 'critical';

    container.innerHTML = `
      <div class="game-page">
        <!-- Header -->
        <header class="game-header">
          <button class="btn btn-ghost btn-icon" id="backBtn" title="Лобби">←</button>
          <div class="game-header-center">
            <span class="game-header-name">${currentPlayer?.name || 'Герой'}</span>
            <div class="hp-bar-container" style="width: 120px;">
              <div class="hp-bar ${hpClass}" style="width: ${hpPercent}%"></div>
            </div>
            <span class="game-header-hp">${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}</span>
          </div>
          <div class="game-header-actions">
            <button class="btn btn-ghost btn-icon" id="profileBtn" title="Профиль">👤</button>
            <button class="btn btn-ghost btn-icon" id="inventoryBtn" title="Инвентарь">🎒</button>
            <button class="btn btn-ghost btn-icon" id="settingsBtn" title="Настройки">⚙️</button>
          </div>
        </header>

        <!-- Chat Zone -->
        <main class="game-chat" id="gameChat">
          <div class="chat-messages" id="chatMessages">
            ${messages.length
              ? messages
                  .filter((m) =>
                    m.sender_type === 'master' ||
                    m.sender_type === 'system' ||
                    (m.sender_type === 'player' && m.sender_id === user.id)
                  )
                  .map(renderMessage)
                  .join('')
              : `
              <div class="chat-empty">
                <div class="empty-icon">📜</div>
                <p>История пока пуста. Начните действие!</p>
              </div>
            `}
          </div>
        </main>

        <!-- Input Area -->
        <footer class="game-input-area">
          <div class="game-input-wrapper">
            <textarea
              class="game-input"
              id="actionInput"
              placeholder="${isMyTurn ? 'Опишите действие вашего героя...' : 'Ожидание действий напарника...'}"
              rows="1"
              ${isSubmitting || !isMyTurn ? 'disabled' : ''}
            ></textarea>
            <button class="btn btn-primary btn-icon" id="sendBtn" ${isSubmitting || !isMyTurn ? 'disabled' : ''}>
              ${isSubmitting ? '⏳' : '▶'}
            </button>
          </div>
        </footer>

        <!-- Side Panels -->
        <div class="side-panel-overlay ${activePanel ? 'open' : ''}" id="panelOverlay"></div>

        <!-- Profile Panel -->
        <div class="side-panel ${activePanel === 'profile' ? 'open' : ''}" id="profilePanel">
          <div class="side-panel-header">
            <h2>👤 Профиль</h2>
            <button class="btn btn-ghost btn-icon" id="closeProfileBtn">✕</button>
          </div>
          <div class="side-panel-content" id="profileContent">
            ${currentPlayer ? renderProfile(currentPlayer) : ''}
          </div>
        </div>

        <!-- Inventory Panel -->
        <div class="side-panel ${activePanel === 'inventory' ? 'open' : ''}" id="inventoryPanel">
          <div class="side-panel-header">
            <h2>🎒 Инвентарь</h2>
            <button class="btn btn-ghost btn-icon" id="closeInventoryBtn">✕</button>
          </div>
          <div class="side-panel-content" id="inventoryContent">
            ${currentPlayer ? renderInventory(currentPlayer) : ''}
          </div>
        </div>

        <!-- Settings Panel -->
        <div class="side-panel ${activePanel === 'settings' ? 'open' : ''}" id="settingsPanel">
          <div class="side-panel-header">
            <h2>⚙️ Сессия</h2>
            <button class="btn btn-ghost btn-icon" id="closeSettingsBtn">✕</button>
          </div>
          <div class="side-panel-content">
            ${renderSessionSettings(session)}
          </div>
        </div>
      </div>
    `;

    bindEvents();
    scrollToBottom();
  }

  function renderMessage(msg) {
    if (msg.sender_type === 'master') {
      return `
        <div class="message message-master">
          <div class="message-avatar">🎭</div>
          <div class="message-body">
            <div class="message-text">${escapeHtml(msg.content)}</div>
          </div>
        </div>
      `;
    }

    if (msg.sender_type === 'system') {
      return `
        <div class="message message-system">
          <div class="message-text">${escapeHtml(msg.content)}</div>
        </div>
      `;
    }

    // Сообщения игроков: показываем ТОЛЬКО свои
    if (msg.sender_type === 'player') {
      if (msg.sender_id === user.id) {
        return `
          <div class="message message-self">
            <div class="message-body">
              <div class="message-text">${escapeHtml(msg.content)}</div>
            </div>
            <div class="message-avatar">⚔️</div>
          </div>
        `;
      }
      return ''; // Чужие сообщения скрыты
    }

    return '';
  }

  function renderProfile(player) {
    const statsHtml = STATS.map((stat) => `
      <div class="stat-item">
        <div class="stat-label">${stat}</div>
        <div class="stat-value">${player.stats?.[stat] || 10}</div>
        <div class="stat-modifier">${Math.floor(((player.stats?.[stat] || 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor(((player.stats?.[stat] || 10) - 10) / 2)}</div>
      </div>
    `).join('');

    return `
      <div class="profile-card">
        <div class="profile-avatar">⚔️</div>
        <h3 class="profile-name">${escapeHtml(player.name)}</h3>
        <p class="profile-meta">${escapeHtml(player.race || '')} / ${escapeHtml(player.class || '')}</p>

        <div class="profile-hp" style="margin-top: 1rem;">
          <div class="hp-bar-container">
            <div class="hp-bar ${(player.hp / player.max_hp) > 0.5 ? '' : (player.hp / player.max_hp) > 0.25 ? 'low' : 'critical'}"
                 style="width: ${(player.hp / player.max_hp) * 100}%"></div>
          </div>
          <p style="text-align: center; margin-top: 0.25rem; font-size: var(--fs-sm);">
            HP: <strong>${player.hp}</strong> / ${player.max_hp}
          </p>
        </div>

        <p style="text-align: center; margin-top: 0.5rem;">
          💰 <strong>${player.money || 0}</strong> золота
        </p>

        <div class="stats-grid" style="margin-top: 1.5rem;">
          ${statsHtml}
        </div>

        ${player.appearance ? `
          <div style="margin-top: 1.5rem;">
            <h4 class="form-label">Внешность</h4>
            <p class="text-muted" style="font-size: var(--fs-sm);">${escapeHtml(player.appearance)}</p>
          </div>
        ` : ''}

        ${player.bio ? `
          <div style="margin-top: 1rem;">
            <h4 class="form-label">Биография</h4>
            <p class="text-muted" style="font-size: var(--fs-sm);">${escapeHtml(player.bio)}</p>
          </div>
        ` : ''}

        <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" id="exportPlayerBtn">📤 Экспорт персонажа</button>
        </div>
      </div>
    `;
  }

  function renderInventory(player) {
    const inventory = player.inventory || [];
    const totalWeight = inventory.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return `
      <div class="inventory-content">
        <div class="inventory-summary">
          <span>💰 ${player.money || 0} золота</span>
          <span>📦 ${totalWeight} предметов</span>
        </div>

        <div class="inventory-list">
          ${inventory.length ? inventory.map((item) => `
            <div class="inventory-item">
              <div class="inventory-item-info">
                <div class="inventory-item-name">${escapeHtml(item.item_name)}</div>
                <div class="inventory-item-meta">
                  <span class="badge badge-${item.type === 'weapon' ? 'primary' : item.type === 'armor' ? 'info' : 'gold'}">${item.type}</span>
                  ${item.quantity > 1 ? `<span>x${item.quantity}</span>` : ''}
                </div>
              </div>
              ${item.attributes ? `
                <div class="inventory-item-stats text-muted" style="font-size: var(--fs-xs);">
                  ${Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </div>
              ` : ''}
            </div>
          `).join('') : `
            <div class="empty-state">
              <p class="text-muted">Инвентарь пуст</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderSessionSettings(session) {
    return `
      <div class="session-info">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Мир</label>
          <p>${session.worlds?.name || 'Не задан'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Сложность</label>
          <p>${session.difficulty === 'easy' ? 'Легко' : session.difficulty === 'hard' ? 'Хардкор' : 'Нормально'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">PvP</label>
          <p>${session.is_pvp_enabled ? '⚔️ Включено' : '🛡️ Выключено'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Режим</label>
          <p>${session.current_plot_stage ? `📖 Сюжет (${session.current_plot_stage})` : '🎭 Песочница'}</p>
        </div>
        <div class="form-group">
          <label class="form-label">Участники (${allPlayers.length})</label>
          <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem;">
            ${allPlayers.map((p) => `
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-success);"></span>
                <span style="font-size: var(--fs-sm);">${escapeHtml(p.name)}</span>
                <span class="text-muted" style="font-size: var(--fs-xs);">${p.race}/${p.class}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Back
    document.getElementById('backBtn')?.addEventListener('click', () => router.navigate('/'));

    // Panel toggles
    document.getElementById('profileBtn')?.addEventListener('click', () => togglePanel('profile'));
    document.getElementById('inventoryBtn')?.addEventListener('click', () => togglePanel('inventory'));
    document.getElementById('settingsBtn')?.addEventListener('click', () => togglePanel('settings'));

    // Close panels
    document.getElementById('closeProfileBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeInventoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('panelOverlay')?.addEventListener('click', () => togglePanel(null));

    // Auto-resize textarea
    const input = document.getElementById('actionInput');
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Submit action
    document.getElementById('sendBtn')?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Export player
    document.getElementById('exportPlayerBtn')?.addEventListener('click', async () => {
      if (!currentPlayer) return;
      try {
        const data = await exportPlayer(currentPlayer.id);
        downloadJSON(data, `${currentPlayer.name}_character.json`);
        toast.success('Персонаж экспортирован!');
      } catch (err) {
        toast.error('Ошибка экспорта: ' + err.message);
      }
    });
  }

  function togglePanel(panel) {
    activePanel = activePanel === panel ? null : panel;
    render();
  }

  async function handleSend() {
    if (isSubmitting || !currentPlayer || !isMyTurn) return;

    const input = document.getElementById('actionInput');
    const text = input?.value?.trim();
    if (!text) return;

    isSubmitting = true;
    input.value = '';
    input.style.height = 'auto';
    updateInputState();

    try {
      const result = await submitAction(sessionId, currentPlayer.id, text);

      if (result.error) {
        toast.error(result.error);
      }

      // Ответ Мастера придёт через Realtime subscription
    } catch (err) {
      toast.error('Ошибка обработки: ' + err.message);
    } finally {
      isSubmitting = false;
      updateInputState();
    }
  }

  function appendMessage(msg) {
    // Слепой чат: игнорируем чужие сообщения, свои — показываем
    if (msg.sender_type === 'player' && msg.sender_id !== user.id) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Remove empty state if present
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();

    const html = renderMessage(msg);
    if (!html) return;

    const div = document.createElement('div');
    div.innerHTML = html;
    chatMessages.appendChild(div.firstElementChild);
    scrollToBottom();
  }

  function updatePlayerUI() {
    if (!currentPlayer) return;
    const hpBar = document.querySelector('.hp-bar');
    const hpText = document.querySelector('.game-header-hp');
    if (hpBar && currentPlayer) {
      const pct = (currentPlayer.hp / currentPlayer.max_hp) * 100;
      hpBar.style.width = pct + '%';
      hpBar.className = 'hp-bar ' + (pct > 50 ? '' : pct > 25 ? 'low' : 'critical');
    }
    if (hpText && currentPlayer) {
      hpText.textContent = `${currentPlayer.hp}/${currentPlayer.max_hp}`;
    }
  }

  function scrollToBottom() {
    const chat = document.getElementById('gameChat');
    if (chat) {
      requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
      });
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Character creation / selection screen
  function renderCharacterCreation() {
    // Try to load existing cards
    getCharacterCards(user.id).then((cards) => {
      const cardsEl = document.getElementById('existingCardsList');
      if (cardsEl && cards.length) {
        cardsEl.innerHTML = cards.map((c) => {
          const stats = c.stats || {};
          return `
            <div class="card char-select-card" data-card-id="${c.id}">
              <div class="card-header">
                <h3 style="font-weight: 700;">⚔️ ${c.name}</h3>
                <span class="badge badge-info">${c.race} / ${c.class}</span>
              </div>
              <p class="text-muted" style="font-size: var(--fs-xs);">HP: ${c.hp}/${c.max_hp} | 💰 ${c.money}</p>
              <p class="text-muted" style="font-size: var(--fs-xs); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${c.bio || 'Без биографии'}</p>
              <button class="btn btn-primary btn-sm char-select-btn" data-card-id="${c.id}" style="margin-top: 0.5rem; width: 100%;">Выбрать этого героя</button>
            </div>
          `;
        }).join('');
      } else if (cardsEl) {
        cardsEl.innerHTML = '<p class="text-muted" style="text-align: center;">У вас пока нет карточек. Создайте нового героя ниже.</p>';
      }
    });

    container.innerHTML = `
      <div class="page page-centered">
        <div class="card" style="max-width: 600px; width: 100%;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">⚔️ Создание персонажа</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Выберите существующего героя или создайте нового</p>

          <!-- Существующие карточки -->
          <div id="existingCardsList" class="char-select-grid" style="margin-bottom: 1.5rem;">
            <p class="text-muted" style="text-align: center;">Загрузка карточек...</p>
          </div>

          <div class="auth-divider" style="margin: 1rem 0;"><span>или создайте нового</span></div>

          <!-- Создание нового -->
          <form id="createCharacterForm">
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
              <textarea class="input" id="charAppearance" rows="2" placeholder="Высокий мужчина с шрамом на левом глазу..."></textarea>
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
                    <input class="input" type="number" id="stat_${stat}" value="10" min="1" max="30" style="text-align: center;" />
                  </div>
                `).join('')}
              </div>
              <div style="text-align: center; margin-top: 0.5rem;">
                <span class="form-hint" id="statsSum">Сумма: 60 / 72</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Начать приключение</button>
          </form>
        </div>
      </div>
    `;

    // Select existing card handler
    container.querySelectorAll('.char-select-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cardId = btn.dataset.cardId;
        try {
          const card = cards.find((c) => c.id === cardId);
          if (!card) return;

          currentPlayer = await createPlayer({
            session_id: sessionId,
            user_id: user.id,
            name: card.name,
            race: card.race,
            class: card.class,
            appearance: card.appearance,
            bio: card.bio,
            personality: card.personality || {},
            power_level: card.power_level,
            stats: card.stats,
            hp: card.hp,
            max_hp: card.max_hp,
            money: card.money,
          });

          allPlayers.push(currentPlayer);
          toast.success(`Герой «${card.name}» выбран!`);
          render();
          subscribeRealtime();
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });

    // Create new character
    document.getElementById('createCharacterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const stats = {};
      STATS.forEach((stat) => {
        stats[stat] = parseInt(document.getElementById(`stat_${stat}`).value) || 10;
      });

      try {
        currentPlayer = await createPlayer({
          session_id: sessionId,
          user_id: user.id,
          name: document.getElementById('charName').value,
          race: document.getElementById('charRace').value,
          class: document.getElementById('charClass').value,
          appearance: document.getElementById('charAppearance').value,
          bio: document.getElementById('charBio').value,
          personality: { ideals: [], bonds: [], flaws: [] },
          power_level: 10,
          stats,
          hp: stats.CON * 2 + 10,
          max_hp: stats.CON * 2 + 10,
          money: 50,
        });

        allPlayers.push(currentPlayer);
        toast.success('Персонаж создан!');
        render();
        subscribeRealtime();
      } catch (err) {
        toast.error('Ошибка создания: ' + err.message);
      }
    });

    // Auto-update stats sum display
    function updateStatsSum() {
      let sum = 0;
      STATS.forEach((stat) => {
        sum += parseInt(document.getElementById(`stat_${stat}`)?.value) || 0;
      });
      const sumEl = document.getElementById('statsSum');
      if (sumEl) {
        sumEl.textContent = `Сумма: ${sum} / 72`;
        sumEl.style.color = sum === 72 ? 'var(--accent-success)' : sum > 72 ? 'var(--accent-danger)' : 'var(--text-muted)';
      }
    }

    STATS.forEach((stat) => {
      document.getElementById(`stat_${stat}`)?.addEventListener('input', updateStatsSum);
    });
    updateStatsSum();

    // Generate stats via AI
    document.getElementById('generateStatsBtn')?.addEventListener('click', async () => {
      const bio = document.getElementById('charBio')?.value?.trim();
      if (!bio) {
        toast.warning('Сначала заполните поле «Биография» — нейросеть проанализирует её для генерации статов.');
        return;
      }

      const btn = document.getElementById('generateStatsBtn');
      const loading = document.getElementById('statsLoading');
      btn.disabled = true;
      btn.textContent = '⏳ Генерация...';
      loading.style.display = 'block';

      try {
        const response = await supabase.functions.invoke('generate-character', {
          body: {
            user_id: user.id,
            name: document.getElementById('charName')?.value || '',
            race: document.getElementById('charRace')?.value || '',
            class: document.getElementById('charClass')?.value || '',
            appearance: document.getElementById('charAppearance')?.value || '',
            bio,
          },
        });

        if (response.error) throw response.error;

        const { stats } = response.data;
        if (stats) {
          STATS.forEach((stat) => {
            const input = document.getElementById(`stat_${stat}`);
            if (input && stats[stat] !== undefined) {
              input.value = stats[stat];
            }
          });
          updateStatsSum();
          toast.success('Статы сгенерированы!');
        }
      } catch (err) {
        toast.error('Ошибка генерации: ' + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ Сгенерировать нейросетью';
        loading.style.display = 'none';
      }
    });
  }

  // Cleanup on unmount
  function cleanup() {
    if (unsubMessages) unsubMessages();
    if (unsubPlayers) unsubPlayers();
    if (unsubTurnQueue) {
      supabase.removeChannel(unsubTurnQueue);
    }
  }

  await load();

  // Return cleanup function
  return cleanup;
}
