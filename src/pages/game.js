// src/pages/game.js — Игровой экран (Чат + Инвентарь + Профиль)
import { supabase, subscribeToSessionMessages, subscribeToSessionPlayers, invokeFunction } from '../api/supabase.js';
import {
  getSession, getSessionPlayers, getPlayer, getPlayerInventory,
  getSessionMessages, submitAction, updatePlayer, addInventoryItem,
  removeInventoryItem, exportPlayer, downloadJSON, getCurrentTurn,
  getTurnQueue, initTurnQueue, passTurn, createPlayer,
  getCharacterCards, getNpcRelationships, getNpcMemories, getRelationshipTierLabelClient,
  getPlayerSkills, allocateStatPoints
} from '../api/game.js';
import { STATS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus, calculateInitiative, calculateArmorClass, calculateSavingThrows, getItemMeta } from '../config.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';
import {
  generateStorylineForSession,
  rewriteStoryline,
  updateStoryline,
  deleteStoryline,
  toggleGoalCompletion,
} from '../api/storyline.js';

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
  if (text.length > 4000) text = text.slice(0, 4000);
  return text;
}

import { formatGameCalendarDate } from '../utils/gameDate.js';
export { formatGameCalendarDate };

export async function renderGame(container, sessionId, user) {
  let session = null;
  let currentPlayer = null;
  let allPlayers = [];
  let messages = [];
  let activePanel = null; // 'profile' | 'inventory' | 'settings' | 'npc' | null
  let cachedNpcData = [];
  let expandedMemoryNpcId = null;
  let cachedMemories = {};
  let isSubmitting = false;
  let isMyTurn = true; // По умолчанию разрешаем ввод
  let activePlayerName = '';
  let playerSkills = [];
  let unsubMessages = null;
  let unsubPlayers = null;
  let unsubTurnQueue = null;
  let realtimeSubscribed = false;
  const instanceId = Date.now().toString(36); // unique per render call

  // ============================================
  // ТУМАН ВОЙНЫ: фильтр видимости сообщений
  // Персональные сообщения Мастера (с metadata.target_player_id)
  // видны ТОЛЬКО указанному игроку. Глобальный нарратив (без target)
  // и системные сообщения видят все.
  // ============================================
  function isMessageVisibleToCurrentPlayer(msg) {
    if (!msg) return false;

    // Системные сообщения — все
    if (msg.sender_type === 'system') return true;

    // Свои действия видит только автор
    if (msg.sender_type === 'player') {
      return msg.sender_id === user.id;
    }

    // Сообщения Мастера: проверяем target_player_id
    if (msg.sender_type === 'master') {
      const targetPlayerId = msg.metadata?.target_player_id;
      // Глобальный лог: виден всем, кроме автора действия (автор уже видит подробный личный нарратив)
      if (msg.metadata?.is_global === true) {
        if (msg.metadata?.initiator_player_id && currentPlayer && msg.metadata.initiator_player_id === currentPlayer.id) {
          return false;
        }
        return true;
      }
      if (!targetPlayerId) {
        return true;
      }
      // Персональный нарратив — только адресату
      return currentPlayer && targetPlayerId === currentPlayer.id;
    }

    // Сообщения NPC (диалоги, спутники, реплики в сцене) — видны всем игрокам
    if (msg.sender_type === 'npc') {
      return true;
    }

    return false;
  }

  async function load() {
    try {
      session = await getSession(sessionId);
      if (!session) {
        toast.error('Сессия не найдена');
        router.navigate('/');
        return;
      }
      allPlayers = await getSessionPlayers(sessionId);
      // Определяем текущего игрока для данного пользователя
      currentPlayer = user?.id ? allPlayers.find((p) => p.user_id === user.id) : null;
      if (!currentPlayer && allPlayers.length === 1 && !allPlayers[0].user_id) {
        currentPlayer = allPlayers[0];
      }
      messages = await getSessionMessages(sessionId);

      // Если персонаж уже есть, проверяем очередь ходов и загружаем навыки
      if (currentPlayer) {
        try {
          playerSkills = await getPlayerSkills(currentPlayer.id);
        } catch (skErr) {
          console.warn('Failed to load player skills:', skErr);
        }
        await checkTurnQueue();
      }
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
      activePlayerName = currentPlayer.name || 'Герой';
      updateInputState();
      return;
    }

    try {
      let currentTurn = await getCurrentTurn(sessionId);
      if (!currentTurn) {
        // Очередь пуста или нет активного хода — самоисцеление/инициализация
        currentTurn = await initTurnQueue(sessionId, allPlayers);
      }
      if (currentTurn) {
        isMyTurn = currentTurn.player_id === currentPlayer.id;
        const activeP = allPlayers.find((p) => p.id === currentTurn.player_id);
        activePlayerName = activeP ? (activeP.name || 'Герой') : 'Напарник';
      } else {
        // Нет активного хода — разрешаем ввод
        isMyTurn = true;
        activePlayerName = currentPlayer.name || 'Герой';
      }
    } catch (err) {
      console.warn('checkTurnQueue fallback:', err);
      isMyTurn = true;
      activePlayerName = currentPlayer.name || 'Герой';
    }
    updateInputState();
  }

  function subscribeRealtime() {
    if (realtimeSubscribed) return; // prevent double-subscribe
    realtimeSubscribed = true;

    unsubMessages = subscribeToSessionMessages(sessionId, (payload) => {
      if (payload.eventType === 'INSERT') {
        const msg = payload.new;
        // Добавляем в массив (для истории), но рисуем только то, что видно
        messages.push(msg);
        if (isMessageVisibleToCurrentPlayer(msg)) {
          appendMessage(msg);
        }
      }
    });

    unsubPlayers = subscribeToSessionPlayers(sessionId, async (payload) => {
      if (payload.eventType === 'INSERT') {
        const newPlayer = payload.new;
        const exists = allPlayers.some((p) => p.id === newPlayer.id);
        if (!exists) {
          allPlayers.push(newPlayer);
          toast.info(`Игрок «${newPlayer.name || 'Герой'}» присоединился к сессии!`);
          const countEl = document.getElementById('participantsCount');
          if (countEl) countEl.textContent = `Участники (${allPlayers.length})`;
          const listEl = document.getElementById('sessionPlayersList');
          if (listEl) listEl.innerHTML = renderSessionParticipants(allPlayers);
          await checkTurnQueue();
        }
      } else if (payload.eventType === 'UPDATE') {
        const idx = allPlayers.findIndex((p) => p.id === payload.new.id);
        if (idx >= 0) allPlayers[idx] = { ...allPlayers[idx], ...payload.new };
        if (currentPlayer && currentPlayer.id === payload.new.id) {
          currentPlayer = { ...currentPlayer, ...payload.new };
          updatePlayerUI();
        }
      } else if (payload.eventType === 'DELETE') {
        allPlayers = allPlayers.filter((p) => p.id !== payload.old.id);
        await checkTurnQueue();
      }
    });

    // Подписка на очередь ходов — уникальное имя канала во избежание конфликтов
    unsubTurnQueue = supabase
      .channel(`turn_queue:${sessionId}:${instanceId}`)
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

  let activeTurnEntityType = 'player';

  function handleTurnUpdate(payload) {
    if (!currentPlayer) return;

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const turn = payload.new;
      if (turn.status === 'active') {
        const wasMyTurn = isMyTurn;
        activeTurnEntityType = turn.entity_type || (turn.npc_id ? 'npc' : 'player');
        if (activeTurnEntityType === 'npc') {
          isMyTurn = false;
          activePlayerName = 'Враг / NPC';
        } else {
          isMyTurn = turn.player_id === currentPlayer.id;
          const activeP = allPlayers.find((p) => p.id === turn.player_id);
          activePlayerName = activeP ? (activeP.name || 'Герой') : 'Напарник';
        }

        // Снимаем блокировку, когда наступает наш ход
        if (!wasMyTurn && isMyTurn) {
          toast.info('Ваш ход!');
        }

        updateInputState();
      }
    }

    if (payload.eventType === 'DELETE') {
      checkTurnQueue();
    }
  }

  function updateInputState() {
    const input = document.getElementById('actionInput');
    const sendBtn = document.getElementById('sendBtn');
    const turnIndicator = document.getElementById('turnIndicator');
    const takeTurnBtn = document.getElementById('takeTurnBtn');

    const hasMultiplePlayers = allPlayers.length > 1;

    if (turnIndicator) {
      if (activeTurnEntityType === 'npc') {
        turnIndicator.innerHTML = '<span class="badge badge-error" style="display: inline-flex; align-items: center; gap: 4px;">⚔️ Ход противника / NPC</span>';
      } else if (!hasMultiplePlayers) {
        turnIndicator.innerHTML = '';
      } else if (isMyTurn) {
        turnIndicator.innerHTML = '<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;">🟢 Ваш ход</span>';
      } else {
        turnIndicator.innerHTML = `<span class="badge badge-warning" style="display: inline-flex; align-items: center; gap: 4px;">⏳ Ход: ${escapeHtml(activePlayerName || 'Напарник')}</span>`;
      }
    }

    if (takeTurnBtn) {
      takeTurnBtn.style.display = (hasMultiplePlayers && !isMyTurn) ? 'inline-flex' : 'none';
    }

    if (!input || !sendBtn) return;

    if (!isMyTurn || isSubmitting) {
      input.disabled = true;
      input.placeholder = isSubmitting
        ? 'Обработка действия...'
        : (activeTurnEntityType === 'npc' ? 'Ход противника / NPC...' : `Ожидание действий напарника (${activePlayerName || 'другой игрок'})...`);
      sendBtn.disabled = true;
    } else {
      input.disabled = false;
      input.placeholder = 'Опишите действие вашего героя...';
      sendBtn.disabled = false;
    }
  }

  function render() {
    const safeMaxHp = Math.max(1, currentPlayer?.max_hp || 1);
    const hpPercent = currentPlayer
      ? Math.max(0, Math.min(100, (currentPlayer.hp / safeMaxHp) * 100))
      : 100;
    const hpClass = hpPercent > 50 ? '' : hpPercent > 25 ? 'low' : 'critical';
    
    // Format game time
    const day = session?.game_day ?? session?.game_time?.day;
    const month = session?.game_month ?? session?.game_time?.month;
    const year = session?.game_year ?? session?.game_time?.year;
    const hour = session?.game_hour ?? session?.game_time?.hour ?? 10;
    const minute = session?.game_minute ?? session?.game_time?.minute ?? 0;
    const timeStr = formatGameCalendarDate(day, month, year, hour, minute);
    const locationStr = session?.current_wild_zone
      ? `🌲 ${session.current_wild_zone}`
      : (session?.current_location_name || '');


    container.innerHTML = `
      <div class="game-page">
        <!-- Header -->
        <header class="game-header">
          <button class="btn btn-ghost btn-icon" id="backBtn" title="Лобби">←</button>
          <div class="game-header-center">
            <span class="game-header-name">${currentPlayer?.name || 'Герой'}</span>
            <div class="hp-bar-container">
              <div class="hp-bar ${hpClass}" style="width: ${hpPercent}%"></div>
            </div>
            <span class="game-header-hp">${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}</span>
            ${timeStr ? `<span class="game-header-time">🕐 ${timeStr}</span>` : ''}
            ${locationStr ? `<span class="game-header-location">📍 ${locationStr}</span>` : ''}
          </div>
          <div class="game-header-actions">
            <button class="btn btn-ghost btn-icon" id="storyBtn" title="Сюжет">📖</button>
            <button class="btn btn-ghost btn-icon" id="profileBtn" title="Профиль">👤</button>
            <button class="btn btn-ghost btn-icon" id="inventoryBtn" title="Инвентарь">🎒</button>
            <button class="btn btn-ghost btn-icon" id="npcBtn" title="Окружение и NPC">👥</button>
            <button class="btn btn-ghost btn-icon" id="settingsBtn" title="Настройки">⚙️</button>
          </div>
        </header>

        <!-- Chat Zone -->
        <main class="game-chat" id="gameChat">
          <div class="chat-messages" id="chatMessages">
            ${messages.length
              ? messages
                  .filter(isMessageVisibleToCurrentPlayer)
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
          <div class="game-turn-bar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; font-size: var(--fs-xs); min-height: 24px;">
            <div id="turnIndicator" style="display: flex; align-items: center; gap: 0.5rem;">
              ${allPlayers.length > 1
                ? (isMyTurn
                    ? '<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;">🟢 Ваш ход</span>'
                    : `<span class="badge badge-warning" style="display: inline-flex; align-items: center; gap: 4px;">⏳ Ход: ${escapeHtml(activePlayerName || 'Напарник')}</span>`)
                : ''}
            </div>
            <button class="btn btn-ghost btn-xs" id="takeTurnBtn" style="display: ${allPlayers.length > 1 && !isMyTurn ? 'inline-flex' : 'none'}; font-size: var(--fs-xs); padding: 2px 8px;" title="Если напарник долго не отвечает, вы можете перехватить ход">
              ⏭️ Взять ход
            </button>
          </div>
          <div class="game-input-wrapper">
            <textarea
              class="game-input"
              id="actionInput"
              placeholder="${isMyTurn ? 'Опишите действие вашего героя...' : `Ожидание действий напарника (${activePlayerName || 'другой игрок'})...`}"
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

        <!-- Storyline Panel -->
        <div class="side-panel ${activePanel === 'story' ? 'open' : ''}" id="storyPanel">
          <div class="side-panel-header">
            <h2>📖 Сюжетная линия</h2>
            <button class="btn btn-ghost btn-icon" id="closeStoryBtn">✕</button>
          </div>
          <div class="side-panel-content" id="storyContent">
            ${renderStoryPanel(session?.storyline)}
          </div>
        </div>

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

        <!-- NPC Relationships Panel -->
        <div class="side-panel ${activePanel === 'npc' ? 'open' : ''}" id="npcPanel">
          <div class="side-panel-header">
            <h2>👥 Окружение и NPC</h2>
            <button class="btn btn-ghost btn-icon" id="closeNpcBtn">✕</button>
          </div>
          <div class="side-panel-content" id="npcContent">
            ${cachedNpcData.length ? renderNpcList(cachedNpcData) : '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Загрузка персонажей...</div>'}
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
      const isGlobalLog = msg.metadata?.is_global === true || msg.metadata?.type === 'global_log';
      return `
        <div class="message ${isGlobalLog ? 'message-system' : 'message-master'}">
          <div class="message-avatar">${isGlobalLog ? '📜' : '🎭'}</div>
          <div class="message-body">
            ${isGlobalLog ? '<div class="message-sender" style="font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 2px;">Общий лог комнаты</div>' : ''}
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
    if (!player) return '';
    const stats = player.stats || {};
    const safeMaxHp = Math.max(1, player.max_hp || 1);
    const hpRatio = Math.max(0, Math.min(1, (player.hp || 0) / safeMaxHp));
    const hpClass = hpRatio > 0.5 ? '' : hpRatio > 0.25 ? 'low' : 'critical';
    const hpPct = hpRatio * 100;

    const safeMaxMp = Math.max(1, player.max_mp ?? 50);
    const mpRatio = Math.max(0, Math.min(1, (player.mp ?? 50) / safeMaxMp));
    const mpPct = mpRatio * 100;

    const currentLvl = player.level || 1;
    const currentXp = player.xp || 0;
    const xpNeeded = currentLvl * 100;
    const xpPct = Math.min(100, Math.floor((currentXp / xpNeeded) * 100));

    const freeStatPoints = player.stat_points || 0;

    const statsHtml = STATS.map((stat) => {
      const baseValue = stats[stat] || 10;
      const injuryPenalty = (player.injuries || [])
        .filter(i => !i.cured_at && i.stat_penalties?.[stat])
        .reduce((sum, i) => sum + (Number(i.stat_penalties[stat]) || 0), 0);
      const displayValue = baseValue + injuryPenalty;
      const mod = Math.floor((displayValue - 10) / 2);
      return `
        <div class="stat-card" style="position: relative;">
          <div class="stat-card-label">${stat}</div>
          <div class="stat-card-value">${displayValue}</div>
          <div class="stat-card-modifier">${mod >= 0 ? '+' : ''}${mod}</div>
          ${freeStatPoints > 0 ? `
            <button class="btn btn-xs btn-primary allocate-stat-btn" data-stat="${stat}" style="margin-top: 4px; padding: 1px 8px; font-size: 11px; width: 100%;" title="Повысить ${stat} на +1 (БЕЗ лимита в 20)">+1</button>
          ` : ''}
        </div>
      `;
    }).join('');

    const derived = calculateDerivedStats(stats, player.race || 'Человек', player.inventory || [], player.race_ac_bonus);
    const initiative = derived.initiative;
    const armorClass = derived.armor_class;
    const savingThrows = derived.saving_throws;
    const savingThrowsHtml = STATS.map((stat) => {
      const baseMod = Math.floor(((stats[stat] || 10) - 10) / 2);
      const injuryPenalty = (player.injuries || [])
        .filter(i => !i.cured_at && i.stat_penalties?.[stat])
        .reduce((sum, i) => sum + (Number(i.stat_penalties[stat]) || 0), 0);
      const totalMod = baseMod + 2 + injuryPenalty;
      return `
        <div class="stat-card">
          <div class="stat-card-label">${stat}</div>
          <div class="stat-card-value">${totalMod >= 0 ? '+' : ''}${totalMod}</div>
        </div>
      `;
    }).join('');

    const activeInjuries = (player.injuries || []).filter(i => !i.cured_at);
    const injuriesHtml = activeInjuries.length ? `
      <div class="profile-section">
        <h4 class="profile-section-title">⚠️ Травмы</h4>
        ${activeInjuries.map(injury => `
          <div class="profile-injuries" style="margin-bottom: 0.5rem;">
            <div style="font-weight: 600;">${escapeHtml(injury.injury_type)}</div>
            <div style="font-size: var(--fs-sm); margin-top: 0.25rem;">${escapeHtml(injury.description || '')}</div>
            ${injury.stat_penalties && Object.keys(injury.stat_penalties).length > 0 ? `
              <div style="font-size: var(--fs-xs); margin-top: 0.25rem; color: var(--text-muted);">
                Штрафы: ${Object.entries(injury.stat_penalties).map(([k, v]) => `${k} ${Number(v) >= 0 ? '+' : ''}${Number(v)}`).join(', ')}
              </div>
            ` : ''}
            ${injury.duration_hours ? `<div style="font-size: var(--fs-xs); color: var(--text-muted);">Длительность: ${injury.duration_hours}ч</div>` : ''}
            ${injury.is_permanent ? '<div style="font-size: var(--fs-xs); font-weight: 600;">Постоянная</div>' : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="profile-card">
        <div class="profile-avatar">⚔️</div>
        <h3 class="profile-name">${escapeHtml(player?.name || 'Герой')}</h3>
        <p class="profile-meta">${escapeHtml(player?.race || '')} / ${escapeHtml(player?.class || '')}</p>

        <!-- Track 1: Уровень и Опыт -->
        <div class="profile-section" style="width: 100%; background: var(--bg-card); border-radius: var(--radius-md); padding: 10px; border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--accent-gold); font-size: var(--fs-base);">🎖️ Уровень ${currentLvl}</span>
            <span style="font-size: var(--fs-xs); color: var(--text-muted);">${currentXp} / ${xpNeeded} XP</span>
          </div>
          <div class="hp-bar-container" style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${xpPct}%; background: linear-gradient(90deg, #f59e0b, #fbbf24); border-radius: 4px;"></div>
          </div>
        </div>

        <!-- HP & MP -->
        <div class="profile-section" style="width: 100%;">
          <!-- HP Bar -->
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); font-weight: 600; margin-bottom: 2px;">
              <span>❤️ Здоровье (HP)</span>
              <span>${player.hp} / ${player.max_hp}</span>
            </div>
            <div class="hp-bar-container" style="height: 12px;">
              <div class="hp-bar ${hpClass}" style="width: ${hpPct}%"></div>
            </div>
          </div>

          <!-- MP Bar -->
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); font-weight: 600; margin-bottom: 2px;">
              <span>💙 Мана (MP)</span>
              <span>${player.mp ?? 50} / ${player.max_mp ?? 50}</span>
            </div>
            <div class="hp-bar-container" style="height: 12px; background: rgba(255,255,255,0.1);">
              <div style="height: 100%; width: ${mpPct}%; background: #3b82f6; border-radius: var(--radius-sm); transition: width 0.3s ease;"></div>
            </div>
          </div>

          <p style="text-align: center; margin-top: 0.25rem; font-size: var(--fs-sm); color: var(--accent-gold);">
            💰 ${player.money || 0} золота
          </p>
        </div>

        ${freeStatPoints > 0 ? `
          <div style="width: 100%; background: rgba(245, 158, 11, 0.15); border: 1px solid var(--accent-gold); border-radius: var(--radius-md); padding: 8px 12px; text-align: center;">
            <div style="color: var(--accent-gold); font-weight: 700; font-size: var(--fs-sm);">⭐ Свободных очков характеристик (ОХ): ${freeStatPoints}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Развитие БЕЗ ограничения в 20 (до 30, 40+). Нажмите [+1] у нужного параметра.</div>
          </div>
        ` : ''}

        <div class="profile-section" style="width: 100%;">
          <h4 class="profile-section-title">Характеристики</h4>
          <div class="stats-grid-3">
            ${statsHtml}
          </div>
        </div>

        <div class="profile-section" style="width: 100%;">
          <div class="stats-grid-3">
            <div class="stat-card">
              <div class="stat-card-label">Инициатива</div>
              <div class="stat-card-value">${initiative >= 0 ? '+' : ''}${initiative}</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">AC</div>
              <div class="stat-card-value">${armorClass}</div>
            </div>
          </div>
        </div>

        <div class="profile-section" style="width: 100%;">
          <h4 class="profile-section-title">Спасброски</h4>
          <div class="stats-grid-3">
            ${savingThrowsHtml}
          </div>
        </div>

        <!-- Track 2: Динамические навыки игрока (1..100) -->
        <div class="profile-section" style="width: 100%;">
          <h4 class="profile-section-title">🗡️ Навыки (1..100)</h4>
          ${playerSkills && playerSkills.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${playerSkills.map((s) => {
                const sLvl = s.level || 1;
                const sXp = s.xp || 0;
                const sNext = s.xp_to_next_level || (sLvl * 100);
                const sPct = Math.min(100, Math.floor((sXp / sNext) * 100));
                return `
                  <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-weight: 600; font-size: var(--fs-sm);">${escapeHtml(s.name || s.skill_key)}</span>
                      <span class="badge badge-primary" style="font-size: var(--fs-xs); font-weight: 700;">Ур. ${sLvl}</span>
                    </div>
                    <div class="hp-bar-container" style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                      <div style="height: 100%; width: ${sPct}%; background: #3b82f6; border-radius: 3px;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
                      <span>Опыт: ${sXp} / ${sNext} XP</span>
                      <span>+${sLvl}% к эффективности</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <p style="font-size: var(--fs-xs); color: var(--text-muted); line-height: 1.4;">
              Навыки открываются и растут автоматически от ваших действий в мире (рубка дерева, сбор трав, стрельба из лука, фехтование, кожевничество, скрытность).
            </p>
          `}
        </div>

        ${injuriesHtml}

        ${player.appearance ? `
          <div class="profile-section" style="width: 100%;">
            <h4 class="profile-section-title">Внешность</h4>
            <p class="profile-bio">${escapeHtml(player.appearance)}</p>
          </div>
        ` : ''}

        ${player.bio ? `
          <div class="profile-section" style="width: 100%;">
            <h4 class="profile-section-title">Биография</h4>
            <p class="profile-bio">${escapeHtml(player.bio)}</p>
          </div>
        ` : ''}
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
          ${inventory.length ? inventory.map((item) => {
            const meta = getItemMeta(item.type);
            return `
            <div class="inventory-item">
              <div class="inventory-item-info">
                <div class="inventory-item-name">${escapeHtml(item.item_name)}</div>
                <div class="inventory-item-meta">
                  <span class="badge badge-${meta.badge}">${meta.icon} ${escapeHtml(meta.label)}</span>
                  ${item.quantity > 1 ? `<span>x${item.quantity}</span>` : ''}
                </div>
              </div>
              ${item.attributes ? `
                <div class="inventory-item-stats text-muted" style="font-size: var(--fs-xs);">
                  ${Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </div>
              ` : ''}
            </div>
            `;
          }).join('') : `
            <div class="empty-state">
              <p class="text-muted">Инвентарь пуст</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderSessionParticipants(players) {
    return players.map((p) => {
      const isCurrent = currentPlayer && p.id === currentPlayer.id;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-success);"></span>
            <span style="font-size: var(--fs-sm); font-weight: ${isCurrent ? '700' : '400'};">
              ${escapeHtml(p?.name || 'Герой')}${isCurrent ? ' (Вы)' : ''}
            </span>
            <span class="text-muted" style="font-size: var(--fs-xs);">${escapeHtml(p?.race || '')}/${escapeHtml(p?.class || '')}</span>
          </div>
          <span style="font-size: var(--fs-xs); color: var(--accent-gold);">❤️ ${p?.hp || 0}/${p?.max_hp || 0}</span>
        </div>
      `;
    }).join('');
  }

  function renderSessionSettings(session) {
    return `
      <div class="session-info">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Мультиплеер и приглашения</label>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="copyInviteBtnGame" style="width: 100%;">
              🔗 Скопировать ссылку для напарника
            </button>
            <button class="btn btn-ghost btn-sm" id="copyIdBtnGame" style="width: 100%; border: 1px solid var(--border-color);">
              📋 Скопировать ID сессии
            </button>
          </div>
        </div>
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
          <label class="form-label" id="participantsCount">Участники (${allPlayers.length})</label>
          <div id="sessionPlayersList" style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem;">
            ${renderSessionParticipants(allPlayers)}
          </div>
        </div>
      </div>
    `;
  }

  function getTierColor(tier) {
    switch (tier) {
      case 'sworn_enemy': return '#ef4444';
      case 'hostile': return '#f97316';
      case 'unfriendly': return '#eab308';
      case 'neutral': return '#94a3b8';
      case 'friendly': return '#10b981';
      case 'trusted': return '#06b6d4';
      case 'devoted': return '#a855f7';
      default: return '#94a3b8';
    }
  }

  function renderNpcList(items) {
    if (!items || items.length === 0) {
      return `
        <div class="empty-state" style="padding: 2rem 1rem; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">👥</div>
          <p class="text-muted">В этой локации нет известных NPC</p>
        </div>
      `;
    }
    return `
      <div class="npc-relationships-list">
        ${items.map(renderNpcCard).join('')}
      </div>
    `;
  }

  function renderNpcCard(item) {
    const { npc, relationship } = item;
    const score = relationship.score || 0;
    const tier = relationship.tier || 'neutral';
    const tierColor = getTierColor(tier);
    const tierLabel = relationship.tier_label || getRelationshipTierLabelClient(tier);
    const isExpanded = expandedMemoryNpcId === npc.id;
    const memories = cachedMemories[npc.id] || [];

    let barLeft = '50%';
    let barWidth = '0%';
    if (score >= 0) {
      barLeft = '50%';
      barWidth = `${Math.min(50, (score / 100) * 50)}%`;
    } else {
      const widthPct = Math.min(50, (Math.abs(score) / 100) * 50);
      barLeft = `${50 - widthPct}%`;
      barWidth = `${widthPct}%`;
    }

    return `
      <div class="npc-rel-card" data-npc-id="${npc.id}">
        <div class="npc-rel-header">
          <div>
            <div class="npc-rel-name">${escapeHtml(npc.name)}</div>
            <div class="npc-rel-meta">${escapeHtml(npc.race || 'Гуманоид')} · ${escapeHtml(npc.role || 'Житель')}</div>
          </div>
          <span class="npc-tier-badge" style="background: ${tierColor}20; color: ${tierColor}; border: 1px solid ${tierColor}50;">
            ${escapeHtml(tierLabel)}
          </span>
        </div>

        <!-- Шкала отношений (-100..+100) -->
        <div class="rel-bar-wrapper">
          <div class="rel-bar-labels">
            <span>Враг (-100)</span>
            <span style="font-weight: 700; color: ${tierColor};">${score > 0 ? `+${score}` : score} / 100</span>
            <span>Предан (+100)</span>
          </div>
          <div class="rel-bar-track">
            <div class="rel-bar-center-marker"></div>
            <div class="rel-bar-fill" style="left: ${barLeft}; width: ${barWidth}; background: ${tierColor};"></div>
          </div>
        </div>

        ${relationship.status_tags?.length ? `
          <div class="npc-status-tags">
            ${relationship.status_tags.map((t) => `<span class="npc-tag">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Аккордеон воспоминаний -->
        <div class="npc-memories-wrapper" style="margin-top: 4px;">
          <button class="npc-memories-toggle" data-toggle-memories="${npc.id}">
            <span>💭 Воспоминания NPC (${memories.length})</span>
            <span>${isExpanded ? '▲' : '▼'}</span>
          </button>
          <div class="npc-memories-body" id="memories-body-${npc.id}" style="display: ${isExpanded ? 'flex' : 'none'};">
            ${renderMemoriesBody(npc.id)}
          </div>
        </div>
      </div>
    `;
  }

  function renderMemoriesBody(npcId) {
    const list = cachedMemories[npcId];
    if (list === undefined) {
      return '<div style="color: var(--text-muted); text-align: center;">Загрузка воспоминаний...</div>';
    }
    if (!list || list.length === 0) {
      return '<div style="color: var(--text-muted); font-style: italic;">Пока нет воспоминаний об общении с этим героем.</div>';
    }

    return list.map((m) => {
      const typeClass = m.memory_type || (m.vividness >= 8 ? 'vivid' : m.vividness <= 3 ? 'impression' : 'regular');
      const icon = typeClass === 'vivid' ? '🌟' : typeClass === 'belief' ? '🔮' : typeClass === 'impression' ? '💭' : '📜';
      const typeLabel = typeClass === 'vivid' ? 'Яркое' : typeClass === 'belief' ? 'Убеждение' : typeClass === 'impression' ? 'Впечатление' : 'Обычное';
      return `
        <div class="memory-item ${typeClass}">
          <div class="memory-item-header">
            <span>${icon} ${typeLabel}${m.vividness ? ` · Яркость ${m.vividness}/10` : ''}</span>
            ${m.emotional_tone ? `<span>[${escapeHtml(m.emotional_tone)}]</span>` : ''}
          </div>
          <div class="memory-item-text">«${escapeHtml(m.memory_text || m.content || '')}»</div>
          ${m.significance_reason ? `<div style="font-size: 0.68rem; color: var(--text-muted);">Причина: ${escapeHtml(m.significance_reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async function refreshNpcPanel() {
    if (!currentPlayer || !sessionId) return;
    const content = document.getElementById('npcContent');
    if (content && (!cachedNpcData || cachedNpcData.length === 0)) {
      content.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Загрузка персонажей...</div>';
    }
    try {
      cachedNpcData = await getNpcRelationships(sessionId, currentPlayer.id);
      if (content) {
        content.innerHTML = renderNpcList(cachedNpcData);
        bindNpcCardEvents();
      }
    } catch (err) {
      console.warn('Failed to load NPC relationships:', err);
      if (content) content.innerHTML = '<div style="padding: 1rem; color: var(--accent-danger);">Ошибка загрузки NPC</div>';
    }
  }

  function bindNpcCardEvents() {
    document.querySelectorAll('[data-toggle-memories]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const npcId = btn.getAttribute('data-toggle-memories');
        if (expandedMemoryNpcId === npcId) {
          expandedMemoryNpcId = null;
        } else {
          expandedMemoryNpcId = npcId;
          if (cachedMemories[npcId] === undefined) {
            try {
              const mems = await getNpcMemories(npcId, currentPlayer.id);
              cachedMemories[npcId] = mems || [];
            } catch (memErr) {
              console.warn('Failed to load NPC memories:', memErr);
              cachedMemories[npcId] = [];
            }
          }
        }
        const content = document.getElementById('npcContent');
        if (content) {
          content.innerHTML = renderNpcList(cachedNpcData);
          bindNpcCardEvents();
        }
      });
    });
  }

  function renderStoryPanel(story) {
    if (!story || !story.arcs || story.arcs.length === 0 || story.status === 'sandbox') {
      return `
        <div class="story-panel-empty" style="padding: 1.5rem 1rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🗺️</div>
          <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: #fff;">Режим свободной песочницы</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4; margin-bottom: 1.25rem;">
            У этой сессии сейчас нет сюжетных ориентиров. Вы можете сгенерировать сюжетную кампанию на основе географии, лора и NPC этого мира («лыжи, но не правило»).
          </p>
          <div style="text-align: left; margin-bottom: 1rem;">
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Пожелания к сюжету (необязательно):</label>
            <textarea id="storyWishesInput" class="input" style="width: 100%; min-height: 70px; resize: vertical; font-size: 0.85rem; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3); color: #fff;" placeholder="Например: тёмный культ, древние руины, кибер-импланты, детектив в Ривервуде..."></textarea>
          </div>
          <button class="btn btn-primary" id="generateStoryBtn" style="width: 100%;">
            ✨ Сгенерировать сюжет по миру
          </button>
        </div>
      `;
    }

    const currentArcIdx = Number(story.current_arc_index) || 0;
    const currentArc = story.arcs[currentArcIdx] || story.arcs[0];
    const completedGoals = currentArc.completed_goals || [];

    return `
      <div class="story-panel-container" style="display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0;">
        <!-- Заголовок и статус -->
        <div class="card" style="padding: 1rem; border-left: 3px solid #6366f1; background: rgba(30, 30, 46, 0.9); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Сюжетная кампания</div>
              <h3 style="font-size: 1.15rem; margin: 4px 0 6px 0; font-weight: 700; color: #fff;">${escapeHtml(story.title || 'Безымянная кампания')}</h3>
            </div>
            <span class="badge ${story.status === 'completed' ? 'badge-success' : 'badge-primary'}" style="font-size: 0.7rem;">
              ${story.status === 'completed' ? 'Завершено' : 'Активен'}
            </span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-top: 6px;">
            ${escapeHtml(story.summary || '')}
          </p>
        </div>

        <!-- Пролог / Появление в мире -->
        ${story.prologue ? `
          <details class="story-prologue-details" style="border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2);">
            <summary style="cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); outline: none;">
              🎭 Появление в мире (Пролог)
            </summary>
            <div style="margin-top: 0.5rem; font-size: 0.82rem; line-height: 1.5; color: rgba(255,255,255,0.85); white-space: pre-line; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem;">
              ${escapeHtml(story.prologue)}
            </div>
          </details>
        ` : ''}

        <!-- Активная арка (Текущая) -->
        <div class="card" style="padding: 1rem; border: 1px solid rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.05); border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #818cf8; text-transform: uppercase;">
              Текущая арка (Акт ${currentArc.act || (currentArcIdx + 1)})
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">
              Цели: ${completedGoals.length} / ${(currentArc.goals || []).length}
            </span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0 0 8px 0; color: #fff;">
            ${escapeHtml(currentArc.title || `Акт ${currentArcIdx + 1}`)}
          </h4>
          <p style="font-size: 0.85rem; line-height: 1.4; color: rgba(255,255,255,0.8); margin-bottom: 12px;">
            ${escapeHtml(currentArc.description || '')}
          </p>

          <!-- Цели арки (чеклист с кликом для переключения) -->
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Ориентиры и цели (нажмите для отметки):</div>
            ${(currentArc.goals || []).map((goal) => {
              const isDone = completedGoals.includes(goal);
              return `
                <div class="story-goal-item" data-arc-index="${currentArcIdx}" data-goal-title="${escapeHtml(goal)}" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border-radius: 6px; background: ${isDone ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.04)'}; border: 1px solid ${isDone ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.06)'}; cursor: pointer; transition: all 0.2s ease;">
                  <span style="font-size: 1rem; line-height: 1.2;">${isDone ? '✅' : '⬜'}</span>
                  <span style="font-size: 0.82rem; line-height: 1.35; ${isDone ? 'text-decoration: line-through; color: var(--text-muted);' : 'color: #fff;'}">
                    ${escapeHtml(goal)}
                  </span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Ключевые NPC и локации -->
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${(currentArc.key_npcs || []).map((npc) => `
              <span class="badge" style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3);">👤 ${escapeHtml(npc)}</span>
            `).join('')}
            ${(currentArc.key_locations || []).map((loc) => `
              <span class="badge" style="font-size: 0.7rem; background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.3);">📍 ${escapeHtml(loc)}</span>
            `).join('')}
          </div>
        </div>

        <!-- Все арки кампании (аккордеон) -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Все акты кампании:</div>
          ${(story.arcs || []).map((arc, aIdx) => {
            const isCurrent = aIdx === currentArcIdx;
            const isPast = aIdx < currentArcIdx;
            const arcDoneGoals = arc.completed_goals || [];
            return `
              <details style="border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 6px 10px; background: rgba(0,0,0,0.15);" ${isCurrent ? 'open' : ''}>
                <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; outline: none; display: flex; justify-content: space-between; align-items: center;">
                  <span style="${isCurrent ? 'color: #818cf8;' : isPast ? 'color: #4ade80;' : 'color: var(--text-muted);'}">
                    ${isPast ? '✓ ' : isCurrent ? '▶ ' : '🔒 '} Акт ${arc.act || (aIdx + 1)}: ${escapeHtml(arc.title)}
                  </span>
                  <span style="font-size: 0.7rem; color: var(--text-muted);">${arcDoneGoals.length}/${(arc.goals || []).length}</span>
                </summary>
                <div style="margin-top: 6px; font-size: 0.8rem; line-height: 1.4; color: var(--text-muted); border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 6px;">
                  <p style="margin-bottom: 6px;">${escapeHtml(arc.description)}</p>
                  <ul style="padding-left: 18px; margin: 0;">
                    ${(arc.goals || []).map((g) => `
                      <li style="${arcDoneGoals.includes(g) ? 'text-decoration: line-through;' : ''}">${escapeHtml(g)}</li>
                    `).join('')}
                  </ul>
                </div>
              </details>
            `;
          }).join('')}
        </div>

        <!-- Подсказка: Лыжи, но не правило -->
        <div style="padding: 8px 10px; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: 8px; font-size: 0.75rem; color: #fde047; line-height: 1.35;">
          💡 <strong>«Лыжи, но не правило»:</strong> ориентиры помогают миру жить вокруг вас. Вы можете исследовать любые места, крафтить, собирать ресурсы или просто отдыхать. ИИ адаптируется к вашему выбору!
        </div>

        <!-- Панель действий -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 0.5rem;">
          <button class="btn btn-secondary" id="rewriteStoryBtn" style="width: 100%; font-size: 0.85rem;">
            🔄 Переписать сюжет с ИИ
          </button>
          <div id="rewriteStoryPromptContainer" style="display: none; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2);">
            <textarea id="rewriteStoryWishes" class="input" style="width: 100%; min-height: 60px; font-size: 0.82rem; padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3); color: #fff;" placeholder="Пожелания к новому сюжету (например: добавить киберпанк, древний орден, расследование)..."></textarea>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" id="confirmRewriteStoryBtn" style="flex: 1; font-size: 0.8rem;">Переписать</button>
              <button class="btn btn-ghost" id="cancelRewriteStoryBtn" style="font-size: 0.8rem;">Отмена</button>
            </div>
          </div>

          <button class="btn btn-ghost" id="editStoryJsonBtn" style="width: 100%; font-size: 0.85rem; color: var(--text-muted);">
            ✏️ Редактировать вручную (JSON)
          </button>
          <div id="editStoryJsonContainer" style="display: none; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2);">
            <textarea id="editStoryJsonArea" class="input" style="width: 100%; min-height: 180px; font-family: monospace; font-size: 0.75rem; padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.4); color: #fff;"></textarea>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" id="saveStoryJsonBtn" style="flex: 1; font-size: 0.8rem;">Сохранить изменения</button>
              <button class="btn btn-ghost" id="cancelEditStoryJsonBtn" style="font-size: 0.8rem;">Отмена</button>
            </div>
          </div>

          <button class="btn btn-ghost" id="deleteStoryBtn" style="width: 100%; font-size: 0.85rem; color: #f87171;">
            🗑️ Удалить сюжет (в песочницу)
          </button>
        </div>
      </div>
    `;
  }

  async function refreshStoryPanel() {
    try {
      const fresh = await getSession(sessionId);
      if (fresh) session = fresh;
      const content = document.getElementById('storyContent');
      if (content) {
        content.innerHTML = renderStoryPanel(session?.storyline);
        bindStoryEvents();
      }
    } catch (e) {
      console.warn('Failed to refresh story panel:', e);
    }
  }

  function bindStoryEvents() {
    // Generate Story
    document.getElementById('generateStoryBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('generateStoryBtn');
      const wishesInput = document.getElementById('storyWishesInput');
      const wishes = wishesInput?.value?.trim() || '';
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = '⏳ Генерация сюжета...';
        }
        toast.info('ИИ создаёт сюжетную кампанию по миру...');
        const newStory = await generateStorylineForSession({
          sessionId,
          worldId: session?.world_id,
          customWishes: wishes,
        });
        session.storyline = newStory;
        toast.success('Сюжетная линия успешно создана!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('Ошибка генерации сюжета: ' + (err.message || err));
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✨ Сгенерировать сюжет по миру';
        }
      }
    });

    // Toggle Rewrite Container
    const rewriteBtn = document.getElementById('rewriteStoryBtn');
    const rewriteContainer = document.getElementById('rewriteStoryPromptContainer');
    rewriteBtn?.addEventListener('click', () => {
      if (rewriteContainer) {
        const isHidden = rewriteContainer.style.display === 'none';
        rewriteContainer.style.display = isHidden ? 'flex' : 'none';
      }
    });
    document.getElementById('cancelRewriteStoryBtn')?.addEventListener('click', () => {
      if (rewriteContainer) rewriteContainer.style.display = 'none';
    });

    // Confirm Rewrite Story
    document.getElementById('confirmRewriteStoryBtn')?.addEventListener('click', async () => {
      const wishesInput = document.getElementById('rewriteStoryWishes');
      const wishes = wishesInput?.value?.trim() || '';
      const confirmBtn = document.getElementById('confirmRewriteStoryBtn');
      try {
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '⏳ Переписываю...';
        }
        toast.info('ИИ переписывает сюжет...');
        const updated = await rewriteStoryline({
          sessionId,
          worldId: session?.world_id,
          customWishes: wishes,
          currentStoryline: session?.storyline,
        });
        session.storyline = updated;
        toast.success('Сюжет обновлен!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('Ошибка обновления сюжета: ' + (err.message || err));
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Переписать';
        }
      }
    });

    // Toggle Edit JSON Container
    const editJsonBtn = document.getElementById('editStoryJsonBtn');
    const editJsonContainer = document.getElementById('editStoryJsonContainer');
    const editJsonArea = document.getElementById('editStoryJsonArea');
    editJsonBtn?.addEventListener('click', () => {
      if (editJsonContainer) {
        const isHidden = editJsonContainer.style.display === 'none';
        editJsonContainer.style.display = isHidden ? 'flex' : 'none';
        if (isHidden && editJsonArea && session?.storyline) {
          editJsonArea.value = JSON.stringify(session.storyline, null, 2);
        }
      }
    });
    document.getElementById('cancelEditStoryJsonBtn')?.addEventListener('click', () => {
      if (editJsonContainer) editJsonContainer.style.display = 'none';
    });

    // Save Edit JSON
    document.getElementById('saveStoryJsonBtn')?.addEventListener('click', async () => {
      if (!editJsonArea) return;
      try {
        const parsed = JSON.parse(editJsonArea.value);
        await updateStoryline(sessionId, parsed);
        session.storyline = parsed;
        toast.success('Сюжет сохранён!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('Ошибка сохранения JSON: ' + (err.message || err));
      }
    });

    // Delete Story (Sandbox)
    document.getElementById('deleteStoryBtn')?.addEventListener('click', async () => {
      if (!confirm('Перейти в режим свободной песочницы и удалить текущий сюжет?')) return;
      try {
        await deleteStoryline(sessionId);
        session.storyline = null;
        toast.info('Сюжет удалён. Активен режим свободной песочницы.');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('Ошибка удаления: ' + (err.message || err));
      }
    });

    // Interactive Goal Toggle Checkbox
    document.querySelectorAll('.story-goal-item').forEach((itemEl) => {
      itemEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const arcIdx = parseInt(itemEl.dataset.arcIndex, 10);
        const goalTitle = itemEl.dataset.goalTitle;
        if (isNaN(arcIdx) || !goalTitle || !session?.storyline) return;

        try {
          const updated = await toggleGoalCompletion(sessionId, session.storyline, arcIdx, goalTitle);
          session.storyline = updated;
          await refreshStoryPanel();
        } catch (err) {
          toast.error('Ошибка переключения цели: ' + (err.message || err));
        }
      });
    });
  }

  function bindEvents() {
    // Back
    document.getElementById('backBtn')?.addEventListener('click', () => router.navigate('/'));

    // Panel toggles
    document.getElementById('storyBtn')?.addEventListener('click', () => togglePanel('story'));
    document.getElementById('profileBtn')?.addEventListener('click', () => togglePanel('profile'));
    document.getElementById('inventoryBtn')?.addEventListener('click', () => togglePanel('inventory'));
    document.getElementById('npcBtn')?.addEventListener('click', () => togglePanel('npc'));
    document.getElementById('settingsBtn')?.addEventListener('click', () => togglePanel('settings'));

    // Close panels
    document.getElementById('closeStoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeProfileBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeInventoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeNpcBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('panelOverlay')?.addEventListener('click', () => togglePanel(null));

    if (activePanel === 'story') {
      bindStoryEvents();
    }

    // Multi-player: take turn button
    document.getElementById('takeTurnBtn')?.addEventListener('click', async () => {
      try {
        toast.info('Переключение хода...');
        await passTurn(sessionId, currentPlayer.id);
        isMyTurn = true;
        activePlayerName = currentPlayer.name || 'Герой';
        updateInputState();
      } catch (err) {
        toast.error('Не удалось переключить ход: ' + err.message);
      }
    });

    // Multi-player: copy invite link & ID
    document.getElementById('copyInviteBtnGame')?.addEventListener('click', () => {
      const base = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      const url = `${window.location.origin}${base}#/session/${sessionId}`;
      navigator.clipboard.writeText(url);
      toast.success('Инвайт-ссылка скопирована!');
    });

    document.getElementById('copyIdBtnGame')?.addEventListener('click', () => {
      navigator.clipboard.writeText(sessionId);
      toast.success('ID сессии скопирован!');
    });

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
        downloadJSON(data, `${currentPlayer?.name || 'hero'}_character.json`);
        toast.success('Персонаж экспортирован!');
      } catch (err) {
        toast.error('Ошибка экспорта: ' + err.message);
      }
    });

    bindNpcCardEvents();
    bindProfileEvents();
  }

  function bindProfileEvents() {
    document.querySelectorAll('.allocate-stat-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const statName = btn.getAttribute('data-stat');
        if (!statName || !currentPlayer) return;
        try {
          toast.info(`Вкладываем 1 очко в ${statName}...`);
          const res = await allocateStatPoints(currentPlayer.id, statName, 1);
          if (res?.success) {
            toast.success(`${statName} повышена до ${res.new_value}!`);
            await refreshProfile();
          } else {
            toast.error(res?.error || 'Не удалось распределить очки');
          }
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });
  }

  async function refreshProfile() {
    if (!currentPlayer) return;
    try {
      const [freshPlayer, skills] = await Promise.all([
        getPlayer(currentPlayer.id),
        getPlayerSkills(currentPlayer.id),
      ]);
      if (freshPlayer) {
        currentPlayer = { ...currentPlayer, ...freshPlayer };
      }
      playerSkills = skills || [];
      const content = document.getElementById('profileContent');
      if (content) {
        content.innerHTML = renderProfile(currentPlayer);
        bindProfileEvents();
      }
    } catch (e) {
      console.warn('Failed to refresh profile:', e);
    }
  }

  async function refreshInventory() {
    if (!currentPlayer) return;
    try {
      const inv = await getPlayerInventory(currentPlayer.id);
      currentPlayer = { ...currentPlayer, inventory: inv || [] };
      const content = document.getElementById('inventoryContent');
      if (content) content.innerHTML = renderInventory(currentPlayer);
    } catch (e) {
      console.warn('Failed to refresh inventory:', e);
    }
  }

  async function togglePanel(panel) {
    activePanel = activePanel === panel ? null : panel;
    render();
    if (activePanel === 'inventory') {
      await refreshInventory();
    } else if (activePanel === 'npc') {
      await refreshNpcPanel();
    } else if (activePanel === 'profile') {
      await refreshProfile();
    } else if (activePanel === 'story') {
      await refreshStoryPanel();
    }
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
      const result = await submitAction(sessionId, currentPlayer.id, sanitizeAIText(text));

      if (result.status === 'clarification_needed' && result.clarification_msg) {
        toast.warning(result.clarification_msg);
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.rest_result?.is_rest) {
        const restInfo = result.rest_result;
        let restMessage = `Отдых: ${restInfo.rest_quality || 'normal'} (${restInfo.rest_duration_hours || 0}ч)`;
        if (restInfo.hp_recovery) {
          restMessage += `. Восстановлено HP: ${restInfo.hp_recovery}`;
        }
        if (restInfo.injuries?.length) {
          restMessage += `. Получены травмы: ${restInfo.injuries.map(i => i.type).join(', ')}`;
        }
        toast.info(restMessage);

        if (restInfo.new_hp !== undefined) {
          currentPlayer = { ...currentPlayer, hp: restInfo.new_hp };
        }
        if (restInfo.injuries?.length) {
          currentPlayer = {
            ...currentPlayer,
            injuries: [...(currentPlayer.injuries || []), ...restInfo.injuries],
          };
        }
      }

      if (result.hp_change) {
        currentPlayer = { ...currentPlayer, hp: (currentPlayer.hp || 0) + result.hp_change };
      }

      // Обновление времени сессии при наличии
      if (result.game_time) {
        session = {
          ...session,
          game_year: result.game_time.year,
          game_month: result.game_time.month,
          game_day: result.game_time.day,
          game_hour: result.game_time.hour,
          game_minute: result.game_time.minute,
        };
      }

      // Обновление локации при смене или генерации начальной локации
      if (result.current_location_name || result.current_wild_zone !== undefined) {
        session = {
          ...session,
          current_location_name: result.current_location_name,
          current_state_name: result.current_state_name || session?.current_state_name,
          current_location_id: result.new_location_id || session?.current_location_id,
          current_wild_zone: result.current_wild_zone !== undefined ? result.current_wild_zone : session?.current_wild_zone,
        };
      }


      // Обновление локации при смене
      if (result.location_changed) {
        try {
          const freshSession = await getSession(sessionId);
          if (freshSession) session = freshSession;
          cachedNpcData = [];
          cachedMemories = {};
        } catch (e) {
          console.warn('Failed to reload session after location change:', e);
        }
      }

      // Оповещения об изменении отношений и памяти NPC
      if (Array.isArray(result.npc_updates) && result.npc_updates.length > 0) {
        for (const update of result.npc_updates) {
          const deltaSign = update.delta > 0 ? `+${update.delta}` : `${update.delta}`;
          const toneIcon = update.delta > 0 ? '💚' : update.delta < 0 ? '💔' : '💬';
          toast.info(`${toneIcon} ${update.npc_name}: ${update.tier_label} (${update.score}/100, ${deltaSign})`);
        }
        if (activePanel === 'npc') {
          refreshNpcPanel();
        }
      }

      // Оповещения о сюжетном прогрессе (автоматическое отслеживание)
      if (result.story_progress) {
        try {
          const freshSession = await getSession(sessionId);
          if (freshSession) session = freshSession;
          if (result.story_progress.completed_goals?.length > 0) {
            toast.success(`🎯 Цель сюжета выполнена: ${result.story_progress.completed_goals.join(', ')}`);
          }
          if (result.story_progress.advanced_arc) {
            toast.success(`📜 Сюжет продвинулся к следующему акту!`);
          }
          if (activePanel === 'story') {
            await refreshStoryPanel();
          }
        } catch (e) {
          console.warn('Failed to reload session after story progress:', e);
        }
      }

      // Уведомления о спутниках, навыках и уровнях
      if (result.companion_action) {
        toast.info(`🤝 ${result.companion_action.npc_name}: ${result.companion_action.dialogue}`);
      }
      if (result.skill_progress?.leveled_up) {
        toast.success(`🔔 Навык повышен! ${result.skill_progress.name} ур. ${result.skill_progress.level}!`);
      }
      if (result.level_up) {
        toast.success(`🎉 Новый уровень ${result.level_up.new_level}! Получено +2 свободных очка характеристик (ОХ)!`);
      }

      // Обновление данных игрока, навыков и инвентаря
      try {
        const [freshPlayer, freshSkills] = await Promise.all([
          getPlayer(currentPlayer.id),
          getPlayerSkills(currentPlayer.id),
        ]);
        if (freshPlayer) {
          currentPlayer = freshPlayer;
        }
        if (freshSkills) {
          playerSkills = freshSkills;
        }
      } catch {
        await refreshInventory();
      }

      render();
    } catch (err) {
      if (err.message === 'MISSING_API_KEY') {
        toast.error('Не задан OpenRouter API Key. Откройте «⚙️ Аккаунт» в лобби и введите ключ.');
      } else {
        toast.error('Ошибка обработки: ' + err.message);
      }
    } finally {
      isSubmitting = false;
      updateInputState();
    }
  }

  function appendMessage(msg) {
    // ТУМАН ВОЙНЫ: единая функция проверки видимости
    if (!isMessageVisibleToCurrentPlayer(msg)) return;

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
      const safeMaxHp = Math.max(1, currentPlayer.max_hp || 1);
      const pct = Math.max(0, Math.min(100, ((currentPlayer.hp || 0) / safeMaxHp) * 100));
      hpBar.style.width = pct + '%';
      hpBar.className = 'hp-bar ' + (pct > 50 ? '' : pct > 25 ? 'low' : 'critical');
    }
    if (hpText && currentPlayer) {
      hpText.textContent = `${currentPlayer.hp}/${currentPlayer.max_hp}`;
    }

    // Update location and time in header without full re-render
    const locEl = document.querySelector('.game-header-location');
    const locStr = session?.current_wild_zone ? `🌲 ${session.current_wild_zone}` : (session?.current_location_name || '');

    if (locStr) {
      if (locEl) {
        locEl.textContent = `📍 ${locStr}`;
      } else {
        // Span doesn't exist yet — inject it after time span or after hp span
        const center = document.querySelector('.game-header-center');
        if (center) {
          const span = document.createElement('span');
          span.className = 'game-header-location';
          span.textContent = `📍 ${locStr}`;
          center.appendChild(span);
        }
      }
    } else if (locEl) {
      locEl.remove();
    }

    const timeEl = document.querySelector('.game-header-time');
    const day = session?.game_day ?? session?.game_time?.day;
    const month = session?.game_month ?? session?.game_time?.month;
    const year = session?.game_year ?? session?.game_time?.year;
    const hour = session?.game_hour ?? session?.game_time?.hour ?? 10;
    const minute = session?.game_minute ?? session?.game_time?.minute ?? 0;
    const timeStr = formatGameCalendarDate(day, month, year, hour, minute);
    if (timeStr && timeEl) {
      timeEl.textContent = `🕐 ${timeStr}`;
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
          const total = Object.values(stats).reduce((s, v) => s + (v || 0), 0);
          return `
            <div class="card char-select-card" data-card-id="${c.id}">
              <div class="card-header">
                <h3 style="font-weight: 700;">⚔️ ${c.name}</h3>
                <span class="badge badge-info">${c.race} / ${c.class}</span>
              </div>
              <p class="form-hint">❤️ ${c.hp}/${c.max_hp} &nbsp;•&nbsp; 💰 ${c.money} &nbsp;•&nbsp; 📊 ${total}</p>
              <p class="char-select-bio">${c.bio || 'Без биографии'}</p>
              <div class="char-select-actions">
                <button class="btn btn-primary char-select-btn" data-card-id="${c.id}">Выбрать этого героя</button>
              </div>
            </div>
          `;
        }).join('');

        // Select existing card handler - inside callback where cards is in scope
        cardsEl.querySelectorAll('.char-select-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const cardId = btn.dataset.cardId;
            try {
              const card = cards.find((c) => c.id === cardId);
              if (!card) return;

              console.log('[character-card] select card:', { cardId, name: card.name, stats: card.stats });

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
                stats: card.stats || {},
                hp: calculateHpFromStats(card.stats),
                max_hp: calculateHpFromStats(card.stats),
                money: card.money,
                ...calculateDerivedStats(card.stats, card.race || 'Человек', [], getRaceAcBonus(card.race)),
              });

              console.log('[character-card] player created:', currentPlayer.id);
              allPlayers.push(currentPlayer);
              await initTurnQueue(sessionId, allPlayers);
              await checkTurnQueue();
              toast.success(`Герой «${card.name}» выбран!`);
              render();
              subscribeRealtime();
            } catch (err) {
              console.error('[character-card] select error:', err);
              toast.error('Ошибка: ' + err.message);
            }
          });
        });
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
              <textarea class="input" id="charAppearance" rows="2" placeholder="Высокий мужчина с шрамом на левом глазу..."></textarea>
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
              <div id="statsLoading" style="display: none; text-align: center; margin-top: 0.5rem;">
                <span class="form-hint">⏳ Генерация...</span>
              </div>
              <div style="text-align: center; margin-top: 0.75rem;">
                <span class="stats-sum" id="statsSum">Сумма: <strong>60</strong> / 72</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Начать приключение</button>
          </form>
        </div>
      </div>
    `;

    // Create new character
    document.getElementById('createCharacterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const stats = {};
      STATS.forEach((stat) => {
        stats[stat] = parseInt(document.getElementById(`stat_${stat}`).value) || 10;
      });

      const requestPayload = {
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
        hp: calculateHpFromStats(stats),
        max_hp: calculateHpFromStats(stats),
        money: 50,
        initiative: calculateInitiative(stats),
        armor_class: calculateArmorClass(stats, document.getElementById('charRace').value || 'Человек', []),
        saving_throws: calculateSavingThrows(stats, 2),
      };
      console.log('[create-character] request:', requestPayload);

      try {
        currentPlayer = await createPlayer(requestPayload);

        console.log('[create-character] player created:', currentPlayer.id);
        allPlayers.push(currentPlayer);
        await initTurnQueue(sessionId, allPlayers);
        await checkTurnQueue();
        toast.success('Персонаж создан!');
        render();
        subscribeRealtime();
      } catch (err) {
        console.error('[create-character] error:', err);
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
        const requestPayload = {
            user_id: user.id,
            name: sanitizeAIText(document.getElementById('charName')?.value || ''),
            race: sanitizeAIText(document.getElementById('charRace')?.value || ''),
            class: sanitizeAIText(document.getElementById('charClass')?.value || ''),
            appearance: sanitizeAIText(document.getElementById('charAppearance')?.value || ''),
            bio: sanitizeAIText(bio),
          };
        console.log('[generate-character] request:', requestPayload);

        const response = await invokeFunction('generate-character', requestPayload);
        console.log('[generate-character] response:', response);

        if (response?.stats) {
          console.log('[generate-character] applying stats:', response.stats);
          STATS.forEach((stat) => {
            const input = document.getElementById(`stat_${stat}`);
            if (input && response.stats[stat] !== undefined) {
              input.value = response.stats[stat];
            }
          });
          updateStatsSum();
          toast.success('Статы сгенерированы!');
        } else {
          console.warn('[generate-character] response without stats:', response);
        }
      } catch (err) {
        console.error('[generate-character] error:', err);
        if (err?.data?.code === 'MISSING_API_KEY') {
          toast.error('Не задан OpenRouter API Key. Откройте «⚙️ Аккаунт» в лобби и введите ключ.');
        } else {
          const detail = err?.data?.details || err?.data?.error || err.message || 'Неизвестная ошибка';
          toast.error('Ошибка генерации: ' + detail);
        }
      } finally {
        console.log('[generate-character] finally: reset UI');
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
