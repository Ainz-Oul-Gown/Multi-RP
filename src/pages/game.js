// src/pages/game.js — Игровой экран (Чат + Инвентарь + Профиль)
import {
  supabase,
  subscribeToSessionMessages,
  subscribeToSessionPlayers,
  subscribeToSession,
  subscribeToSessionTurnQueue,
  invokeFunction
} from '../api/supabase.js';
import {
  getSession, getSessionPlayers, getPlayer, getPlayerInventory,
  getSessionMessages, submitAction, updatePlayer, addInventoryItem,
  removeInventoryItem, exportPlayer, downloadJSON, getCurrentTurn,
  getTurnQueue, initTurnQueue, passTurn, createPlayer,
  getCharacterCards, getNpcRelationships, getNpcMemories, getRelationshipTierLabelClient,
  getPlayerSkills, allocateStatPoints,
  updatePlayerZone, updateLocationMap, getSessionPlayersWithZones,
  removeSessionPlayer, getWorldMapData
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
import { renderMessage } from './components/game-chat-ui.js';

import { sanitizeAIText, escapeHtml, formatRpText } from '../utils/text.js';
import { formatGameCalendarDate } from '../utils/gameDate.js';
export { formatGameCalendarDate, escapeHtml, formatRpText };

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
  let unsubSession = null;
  let realtimeSubscribed = false;
  let isInitialRender = true;
  let isCancelled = false;
  let isSelectingCharacter = false;
  let cachedWorldMapData = null;
  let mapZoom = 0.5;
  let mapPanX = 0;
  let mapPanY = 0;
  let isMapWide = false;
  let isMapFullscreen = false;
  let showMapLabels = true;
  let mapHasBeenCentered = false;
  const instanceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); // unique per render call

  // ============================================
  // ТУМАН ВОЙНЫ: фильтр видимости сообщений
  // Персональные сообщения Мастера (с metadata.target_player_id)
  // видны ТОЛЬКО указанному игроку. Глобальный нарратив (без target)
  // и системные сообщения видят все.
  // fog_perception — видит только адресат (другой игрок-наблюдатель)
  // ============================================
  function isMessageVisibleToCurrentPlayer(msg) {
    if (!msg) return false;

    // Системные сообщения — все
    if (msg.sender_type === 'system') return true;

    // Свои действия видит только автор (проверяем как auth user.id, так и player.id)
    if (msg.sender_type === 'player') {
      const myUserId = user?.id;
      const myPlayerId = currentPlayer?.id;
      return (myUserId && msg.sender_id === myUserId) || (myPlayerId && msg.sender_id === myPlayerId);
    }

    // Сообщения Мастера: проверяем target_player_id
    if (msg.sender_type === 'master') {
      const targetPlayerId = msg.metadata?.target_player_id;
      // Глобальный лог: виден игрокам в той же зоне, кроме автора действия (автор уже видит личный нарратив)
      // Игроки в других зонах не видят детали чужих действий — события доходят только через fog_perception
      if (msg.metadata?.is_global === true) {
        if (msg.metadata?.initiator_player_id && currentPlayer && msg.metadata.initiator_player_id === currentPlayer.id) {
          return false;
        }
        const initiatorZone = msg.metadata?.initiator_zone;
        const currentZone = currentPlayer?.current_zone;
        if (initiatorZone && currentZone && initiatorZone !== currentZone) {
          return false;
        }
        return true;
      }
      // Fog-сообщение: видит ТОЛЬКО адресат
      if (msg.metadata?.fog_filtered === true) {
        return currentPlayer && targetPlayerId === currentPlayer.id;
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
    if (isCancelled) return;
    try {
      session = await getSession(sessionId);
      if (isCancelled) return;
      if (!session) {
        toast.error('Сессия не найдена');
        router.navigate('/');
        return;
      }
      allPlayers = await getSessionPlayers(sessionId);
      if (isCancelled) return;

      // Определяем текущего игрока для данного пользователя (с fallback на getUser)
      const currentUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
      currentPlayer = currentUserId ? allPlayers.find((p) => p.user_id === currentUserId) : null;
      if (!currentPlayer && allPlayers.length === 1 && !allPlayers[0].user_id) {
        currentPlayer = allPlayers[0];
      }
      messages = await getSessionMessages(sessionId);
      if (isCancelled) return;

      // Если персонаж уже есть, проверяем очередь ходов и загружаем навыки
      if (currentPlayer) {
        try {
          playerSkills = await getPlayerSkills(currentPlayer.id);
        } catch (skErr) {
          console.warn('Failed to load player skills:', skErr);
        }
        await checkTurnQueue();
      }

      // Предзагрузка данных карты мира
      if (session?.world_id) {
        getWorldMapData(session.world_id)
          .then((data) => { cachedWorldMapData = data; })
          .catch((err) => console.warn('World map preload warning:', err));
      }
    } catch (err) {
      if (isCancelled) return;
      toast.error('Ошибка загрузки: ' + err.message);
      router.navigate('/');
      return;
    }

    if (isCancelled) return;
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
        activeTurnEntityType = currentTurn.entity_type || (currentTurn.npc_id ? 'npc' : 'player');
        if (activeTurnEntityType === 'npc') {
          isMyTurn = false;
          activePlayerName = 'Враг / NPC';
        } else {
          isMyTurn = currentTurn.player_id === currentPlayer.id;
          const activeP = allPlayers.find((p) => p.id === currentTurn.player_id);
          activePlayerName = activeP ? (activeP.name || 'Герой') : 'Напарник';
        }
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
        if (!msg) return;

        // Если пришло сообщение от Мастера или NPC, сразу скрываем индикатор генерации
        if (msg.sender_type === 'master' || msg.sender_type === 'npc') {
          removeDmTypingIndicator();
        }

        // Мгновенная синхронизация игрового времени из метаданных входящего сообщения
        if (msg.metadata?.game_time) {
          const gt = msg.metadata.game_time;
          session = {
            ...session,
            game_year: gt.year ?? session?.game_year,
            game_month: gt.month ?? session?.game_month,
            game_day: gt.day ?? session?.game_day,
            game_hour: gt.hour ?? session?.game_hour,
            game_minute: gt.minute ?? session?.game_minute,
          };
          updatePlayerUI();
        } else if (msg.sender_type === 'master' || msg.sender_type === 'system') {
          // Фоновое обновление сессии на случай изменений в БД
          getSession(sessionId).then((fresh) => {
            if (fresh) {
              session = fresh;
              updatePlayerUI();
            }
          }).catch(() => {});
        }

        // Если это сообщение игрока, проверяем, не было ли оно уже отображено оптимистично
        if (msg.sender_type === 'player') {
          const tempIdx = messages.findIndex((m) => m.id && String(m.id).startsWith('temp-') && m.content === msg.content);
          if (tempIdx !== -1) {
            const oldTempId = messages[tempIdx].id;
            messages[tempIdx] = msg;
            const tempEl = document.querySelector(`[data-message-id="${oldTempId}"]`);
            if (tempEl) {
              tempEl.setAttribute('data-message-id', msg.id);
            }
            return;
          }
        }

        // Защита от дублирования сообщений в массиве истории
        if (msg.id && messages.some((m) => m.id === msg.id)) {
          return;
        }
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
        const deletedId = payload.old?.id;
        if (deletedId) {
          allPlayers = allPlayers.filter((p) => p.id !== deletedId);
          const countEl = document.getElementById('participantsCount');
          if (countEl) countEl.textContent = `Участники (${allPlayers.length})`;
          const listEl = document.getElementById('sessionPlayersList');
          if (listEl) listEl.innerHTML = renderSessionParticipants(allPlayers);
          bindParticipantEvents();

          if (currentPlayer && currentPlayer.id === deletedId) {
            toast.warning('Вы были исключены из сессии');
            router.navigate('/');
            return;
          }
          await checkTurnQueue();
        }
      }
    });

    // Подписка на изменение параметров сессии (время, календарь, локация, отряды)
    unsubSession = subscribeToSession(sessionId, async (payload) => {
      if (payload.eventType === 'UPDATE' && payload.new) {
        const updated = payload.new;
        const locChanged = updated.current_location_id !== session?.current_location_id ||
                           updated.current_wild_zone !== session?.current_wild_zone;

        session = {
          ...session,
          ...updated,
        };

        if (locChanged) {
          try {
            const fresh = await getSession(sessionId);
            if (fresh) session = fresh;
          } catch (e) {
            console.warn('Failed to reload session on location change:', e);
          }
        }

        updatePlayerUI();
      }
    });

    // Подписка на очередь ходов
    unsubTurnQueue = subscribeToSessionTurnQueue(sessionId, (payload) => {
      handleTurnUpdate(payload);
    });
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
      } else if (turn.status === 'completed') {
        checkTurnQueue();
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
    const chatEl = document.getElementById('gameChat');
    const wasNearBottom = chatEl ? (chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80) : true;
    const prevScrollTop = chatEl ? chatEl.scrollTop : null;

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
          <div class="game-header-top">
            <button class="btn btn-ghost btn-icon" id="backBtn" title="В лобби" aria-label="Вернуться в лобби">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div class="game-header-center game-header-hero">
              <span class="game-header-name" title="${currentPlayer?.name || 'Герой'}">${currentPlayer?.name || 'Герой'}</span>
              <div class="hp-bar-container" title="HP: ${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}">
                <div class="hp-bar ${hpClass}" style="width: ${hpPercent}%"></div>
              </div>
              <span class="game-header-hp">${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}</span>
            </div>
            <div class="game-header-actions">
              <button class="btn btn-ghost btn-icon" id="storyBtn" title="Сюжет" aria-label="Сюжет">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="profileBtn" title="Профиль героя" aria-label="Профиль">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="inventoryBtn" title="Инвентарь" aria-label="Инвентарь">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="npcBtn" title="NPC и Окружение" aria-label="Окружение и NPC">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="mapBtn" title="Карта и Радар" aria-label="Карта">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="settingsBtn" title="Настройки" aria-label="Настройки">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>
          </div>
          <div class="game-status-bar" id="gameStatusBar">
            <span class="game-header-location" title="${locationStr || ''}" ${!locationStr ? 'style="display:none;"' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${locationStr || ''}</span>
            </span>
            <span class="game-header-time" title="${timeStr || ''}" ${!timeStr ? 'style="display:none;"' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${timeStr || ''}</span>
            </span>
          </div>
        </header>

        <!-- Chat Zone -->
        <main class="game-chat" id="gameChat">
          <div class="chat-messages" id="chatMessages">
            ${messages.length
              ? messages
                  .filter(isMessageVisibleToCurrentPlayer)
                  .map(msg => renderMessage(msg, user?.id, currentPlayer?.id))
                  .join('')
              : `
              <div class="chat-empty">
                <div class="empty-icon">📜</div>
                <p>История пока пуста. Начните действие!</p>
              </div>
            `}
            ${isSubmitting ? `
              <div id="dmTypingIndicator" class="message message-master typing-indicator-bubble">
                <div class="message-avatar">🎭</div>
                <div class="message-body">
                  <div class="message-text">
                    <div class="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        </main>

        <!-- Busy State Banner (Если персонаж занят длительным действием) -->
        <div id="busyStateBanner" class="busy-state-banner" style="display: ${currentPlayer?.is_busy ? 'flex' : 'none'};">
          <div class="busy-state-info">
            <span class="busy-icon">⏳</span>
            <div class="busy-text">
              <strong>${escapeHtml(currentPlayer?.busy_activity || 'Длительное занятие')}</strong>
              <small>Осталось: <span id="busyMinutesLeft">${currentPlayer?.busy_remaining_minutes || 0}</span> мин.</small>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="interruptBusyBtn" title="Прервать и забрать накопленный результат">
            ⏹️ Прервать
          </button>
        </div>

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

        <!-- Map & Radar Panel -->
        <div class="side-panel ${activePanel === 'map' ? 'open' : ''} ${isMapWide ? 'map-wide' : ''} ${isMapFullscreen ? 'map-fullscreen' : ''}" id="mapPanel">
          <div class="side-panel-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2>🗺️ Карта мира</h2>
              <span id="mapScaleBadge" class="badge badge-info" style="font-size: 0.65rem;">${escapeHtml(session?.scale_unit || 'километры')}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="btn btn-ghost btn-icon" id="toggleMapWideBtn" title="Широкий режим / обычный" aria-label="Шире" style="font-size: 0.85rem;">
                ${isMapWide ? '◀▶' : '▶◀'}
              </button>
              <button class="btn btn-ghost btn-icon" id="toggleMapFullscreenBtn" title="Во весь экран" aria-label="Во весь экран" style="font-size: 0.85rem;">
                ${isMapFullscreen ? '🗗' : '⛶'}
              </button>
              <button class="btn btn-ghost btn-icon" id="closeMapBtn" title="Закрыть">✕</button>
            </div>
          </div>
          <div class="side-panel-content map-panel-content" id="mapContent">
            <!-- Toolbar -->
            <div class="map-toolbar">
              <div class="map-status-info">
                <span>📍 <strong>(${currentPlayer?.pos_x ?? 0}, ${currentPlayer?.pos_y ?? 0})</strong></span>
                <span id="mapZoomLevelText" style="color: var(--accent-gold); font-weight: 600;">100%</span>
              </div>
              <div class="map-controls-group">
                <button class="btn btn-ghost btn-xs" id="mapRecenterBtn" title="Отцентровать на моём герое">🎯 Я</button>
                <button class="btn btn-ghost btn-xs" id="mapFitWorldBtn" title="Показать весь мир">🌐 Мир</button>
                <button class="btn btn-ghost btn-xs" id="mapZoomInBtn" title="Приблизить">➕</button>
                <button class="btn btn-ghost btn-xs" id="mapZoomOutBtn" title="Отдалить">➖</button>
                <button class="btn btn-ghost btn-xs" id="mapToggleLabelsBtn" title="Показать/скрыть названия">${showMapLabels ? '🏷️ Вкл' : '🏷️ Выкл'}</button>
              </div>
            </div>

            <!-- Viewport -->
            <div class="map-viewport" id="mapViewport">
              <div class="map-stage" id="mapStage">
                <!-- SVG Grid layer -->
                <svg id="mapGridSvg" class="map-grid-svg"></svg>
                <!-- Locations markers layer -->
                <div id="mapLocationsLayer"></div>
                <!-- Players layer -->
                <div id="mapPlayersLayer"></div>
              </div>

              <!-- Floating Info Card (when location clicked) -->
              <div id="mapLocationPopup" class="map-info-popup" style="display: none;"></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-xs); color: var(--text-muted); padding: 0 4px;">
              <span>🖱️ Скролл / 🤏 Щипок: Зум • ✋ Свайп: Сдвиг</span>
              <span>🟢 Вы • 🔵 Напарники • 🏰 Города</span>
            </div>
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
    if (isInitialRender) {
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 150);
      isInitialRender = false;
    } else if (wasNearBottom) {
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
    } else if (prevScrollTop !== null) {
      const newChat = document.getElementById('gameChat');
      if (newChat) {
        newChat.scrollTop = prevScrollTop;
      }
    }
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
        <!-- Компактный заголовок: слева имя, уровень, мета, опыт; справа аватарка -->
        <div class="profile-header-compact">
          <div class="profile-header-info">
            <div class="profile-name-row">
              <h3 class="profile-name">${escapeHtml(player?.name || 'Герой')}</h3>
              <span class="profile-lvl-badge">🎖️ Ур. ${currentLvl}</span>
            </div>
            <div class="profile-sub-row">
              <span class="profile-meta-tag">${escapeHtml(player?.race || 'Человек')}</span>
              <span class="profile-meta-separator">•</span>
              <span class="profile-meta-tag">${escapeHtml(player?.class || 'Воин')}</span>
              <span class="profile-meta-separator">•</span>
              <span class="profile-money-chip">💰 ${player.money || 0} з.</span>
            </div>
            <!-- Компактная полоса опыта -->
            <div class="profile-xp-block">
              <div class="profile-xp-labels">
                <span>Опыт</span>
                <span>${currentXp} / ${xpNeeded} XP</span>
              </div>
              <div class="profile-bar-track xp-track">
                <div class="profile-bar-fill xp-fill" style="width: ${xpPct}%;"></div>
              </div>
            </div>
          </div>
          <div class="profile-avatar">⚔️</div>
        </div>

        <!-- HP & MP (на всю ширину, доходят до правого края) -->
        <div class="profile-vitals-group">
          <!-- HP Bar -->
          <div class="vital-bar-item">
            <div class="vital-bar-labels">
              <span class="vital-label-hp">❤️ Здоровье (HP)</span>
              <span class="vital-val">${player.hp} / ${player.max_hp}</span>
            </div>
            <div class="profile-bar-track hp-track">
              <div class="hp-bar ${hpClass}" style="width: ${hpPct}%;"></div>
            </div>
          </div>

          <!-- MP Bar -->
          <div class="vital-bar-item">
            <div class="vital-bar-labels">
              <span class="vital-label-mp">💙 Мана (MP)</span>
              <span class="vital-val">${player.mp ?? 50} / ${player.max_mp ?? 50}</span>
            </div>
            <div class="profile-bar-track mp-track">
              <div class="profile-bar-fill mp-fill" style="width: ${mpPct}%;"></div>
            </div>
          </div>
        </div>

        <!-- Боевые характеристики (AC и Инициатива компактно в одну строку) -->
        <div class="profile-combat-row">
          <div class="combat-stat-pill">
            <span class="combat-stat-icon">🛡️</span>
            <span class="combat-stat-label">Класс брони (AC)</span>
            <span class="combat-stat-value">${armorClass}</span>
          </div>
          <div class="combat-stat-pill">
            <span class="combat-stat-icon">⚡</span>
            <span class="combat-stat-label">Инициатива</span>
            <span class="combat-stat-value">${initiative >= 0 ? '+' : ''}${initiative}</span>
          </div>
        </div>

        ${freeStatPoints > 0 ? `
          <div class="profile-free-points-banner">
            <span>⭐ Свободных очков (ОХ): <strong>${freeStatPoints}</strong></span>
            <span style="font-size: 10px; opacity: 0.85;">(нажмите +1 у нужного параметра)</span>
          </div>
        ` : ''}

        <!-- Характеристики -->
        <div class="profile-section">
          <h4 class="profile-section-title">Характеристики</h4>
          <div class="stats-grid-3">
            ${statsHtml}
          </div>
        </div>

        <!-- Спасброски -->
        <div class="profile-section">
          <h4 class="profile-section-title">Спасброски</h4>
          <div class="stats-grid-3">
            ${savingThrowsHtml}
          </div>
        </div>

        <!-- Навыки -->
        <div class="profile-section">
          <h4 class="profile-section-title">🗡️ Навыки (1..100)</h4>
          ${playerSkills && playerSkills.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${playerSkills.map((s) => {
                const sLvl = s.level || 1;
                const sXp = s.xp || 0;
                const sNext = s.xp_to_next_level || (sLvl * 100);
                const sPct = Math.min(100, Math.floor((sXp / sNext) * 100));
                return `
                  <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 5px 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                      <span style="font-weight: 600; font-size: var(--fs-xs);">${escapeHtml(s.name || s.skill_key)}</span>
                      <span class="badge badge-primary" style="font-size: 10px; font-weight: 700; padding: 1px 5px;">Ур. ${sLvl}</span>
                    </div>
                    <div class="profile-bar-track" style="height: 4px; margin-bottom: 2px;">
                      <div class="profile-bar-fill" style="width: ${sPct}%; background: #3b82f6; height: 100%; border-radius: var(--radius-full);"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
                      <span>${sXp} / ${sNext} XP</span>
                      <span>+${sLvl}% к эфф.</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <p style="font-size: 11px; color: var(--text-muted); line-height: 1.35; margin: 0;">
              Навыки растут от ваших действий в мире (крафт, сбор трав, бой, скрытность).
            </p>
          `}
        </div>

        ${injuriesHtml}

        ${player.appearance ? `
          <div class="profile-section">
            <h4 class="profile-section-title">Внешность</h4>
            <p class="profile-bio">${escapeHtml(player.appearance)}</p>
          </div>
        ` : ''}

        ${player.bio ? `
          <div class="profile-section">
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
    const isCreator = Boolean(user?.id && (!session?.worlds?.owner_id || session.worlds.owner_id === user.id));
    return players.map((p) => {
      const isCurrent = currentPlayer && p.id === currentPlayer.id;
      const isInParty = Boolean(
        p?.party_id ||
        (Array.isArray(session?.party_groups) && session.party_groups.some((g) => Array.isArray(g.members) && g.members.includes(p.id)))
      );
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-success); flex-shrink: 0;"></span>
            <span style="font-size: var(--fs-sm); font-weight: ${isCurrent ? '700' : '400'};">
              ${escapeHtml(p?.name || 'Герой')}${isCurrent ? ' (Вы)' : ''}
            </span>
            <span class="text-muted" style="font-size: var(--fs-xs);">${escapeHtml(p?.race || '')}/${escapeHtml(p?.class || '')}</span>
            ${isInParty ? `<span class="badge" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35);">🤝 В отряде</span>` : ''}
            ${p?.current_zone ? `<span style="font-size: 10px; color: var(--text-muted); opacity: 0.85;">[${escapeHtml(p.current_zone)}]</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
            <span style="font-size: var(--fs-xs); color: var(--accent-gold);">❤️ ${p?.hp || 0}/${p?.max_hp || 0}</span>
            ${isCreator && !isCurrent ? `
              <button class="btn btn-danger btn-xs remove-participant-btn" data-player-id="${p.id}" data-player-name="${escapeHtml(p?.name || 'Игрок')}" style="padding: 1px 6px; font-size: 10px; line-height: 1.2;" title="Удалить участника из сессии">❌</button>
            ` : ''}
          </div>
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
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Оплата и модели ИИ</label>
          <p style="font-size: var(--fs-xs); color: var(--accent-gold);">
            ${session.ai_key_mode === 'individual' 
              ? '👤 У каждого игрока свой ключ' 
              : '👑 Общий ключ и модели Хоста'}
          </p>
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

        ${(npc.current_activity || npc.current_mood || npc.temperament) ? `
          <div class="npc-personality-info" style="margin: 6px 0; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 0.72rem; line-height: 1.4; border: 1px solid rgba(255,255,255,0.06);">
            ${npc.current_activity ? `<div style="color: #c084fc; margin-bottom: 2px;">📍 <strong>Занят:</strong> ${escapeHtml(npc.current_activity)}</div>` : ''}
            <div style="color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap;">
              ${npc.current_mood ? `<span>Настроение: <strong style="color: var(--text-secondary);">${escapeHtml(npc.current_mood)}</strong></span>` : ''}
              ${npc.temperament ? `<span>Темперамент: <strong style="color: var(--text-secondary);">${escapeHtml(npc.temperament)}</strong></span>` : ''}
            </div>
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
    document.getElementById('mapBtn')?.addEventListener('click', () => togglePanel('map'));
    document.getElementById('settingsBtn')?.addEventListener('click', () => togglePanel('settings'));

    // Close panels
    document.getElementById('closeStoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeProfileBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeInventoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeNpcBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeMapBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('panelOverlay')?.addEventListener('click', () => togglePanel(null));

    if (activePanel === 'story') {
      bindStoryEvents();
    }
    if (activePanel === 'map') {
      refreshMapPanel();
    }

    // Busy state: interrupt long term activity
    document.getElementById('interruptBusyBtn')?.addEventListener('click', async () => {
      if (!currentPlayer?.is_busy) return;
      try {
        toast.info('Прерывание деятельности...');
        const { data, error } = await supabase.rpc('interrupt_busy_activity', {
          p_player_id: currentPlayer.id,
        });
        if (error) {
          toast.error('Не удалось прервать: ' + error.message);
          return;
        }
        toast.success(`Деятельность "${data.interrupted_activity || 'Занятие'}" прервана. Прошло времени: ${data.time_spent_minutes || 0} мин.`);
        currentPlayer.is_busy = false;
        currentPlayer.busy_activity = null;
        currentPlayer.busy_remaining_minutes = 0;
        const banner = document.getElementById('busyStateBanner');
        if (banner) banner.style.display = 'none';
        updateInputState();
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

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
    document.getElementById('mapBtn')?.addEventListener('click', () => togglePanel('map'));
    document.getElementById('settingsBtn')?.addEventListener('click', () => togglePanel('settings'));

    // Close panels
    document.getElementById('closeStoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeProfileBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeInventoryBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeNpcBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeMapBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => togglePanel(null));
    document.getElementById('panelOverlay')?.addEventListener('click', () => togglePanel(null));

    if (activePanel === 'story') {
      bindStoryEvents();
    }
    if (activePanel === 'map') {
      refreshMapPanel();
    }

    // Busy state: interrupt long term activity
    document.getElementById('interruptBusyBtn')?.addEventListener('click', async () => {
      if (!currentPlayer?.is_busy) return;
      try {
        toast.info('Прерывание деятельности...');
        const { data, error } = await supabase.rpc('interrupt_busy_activity', {
          p_player_id: currentPlayer.id,
        });
        if (error) {
          toast.error('Не удалось прервать: ' + error.message);
          return;
        }
        toast.success(`Деятельность "${data.interrupted_activity || 'Занятие'}" прервана. Прошло времени: ${data.time_spent_minutes || 0} мин.`);
        currentPlayer.is_busy = false;
        currentPlayer.busy_activity = null;
        currentPlayer.busy_remaining_minutes = 0;
        const banner = document.getElementById('busyStateBanner');
        if (banner) banner.style.display = 'none';
        updateInputState();
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

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
    bindParticipantEvents();
  }

  function bindParticipantEvents() {
    document.querySelectorAll('.remove-participant-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.playerId;
        const playerName = btn.dataset.playerName || 'Игрок';
        if (!playerId) return;

        if (!window.confirm(`Удалить участника «${playerName}» из этой сессии?`)) return;

        try {
          btn.disabled = true;
          await removeSessionPlayer(sessionId, playerId);
          toast.success(`Участник «${playerName}» удален из сессии`);
          allPlayers = allPlayers.filter((p) => p.id !== playerId);
          const countEl = document.getElementById('participantsCount');
          if (countEl) countEl.textContent = `Участники (${allPlayers.length})`;
          const listEl = document.getElementById('sessionPlayersList');
          if (listEl) listEl.innerHTML = renderSessionParticipants(allPlayers);
          bindParticipantEvents();
          await checkTurnQueue();
        } catch (err) {
          toast.error('Ошибка удаления участника: ' + (err.message || err));
          btn.disabled = false;
        }
      });
    });
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

  // ============================================
  // ИНТЕРАКТИВНАЯ КАРТА МИРА
  // ============================================
  function getCoordScale() {
    const unit = (session?.scale_unit || 'километры').toLowerCase();
    const isKm = unit.startsWith('кил') || unit.startsWith('km') || unit === 'км';
    return isKm ? 0.35 : 1.5;
  }

  function applyMapTransform() {
    const stage = document.getElementById('mapStage');
    if (stage) {
      stage.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
      
      stage.classList.remove('map-zoom-far', 'map-zoom-mid', 'map-zoom-close', 'map-zoom-micro');
      if (mapZoom < 0.3) stage.classList.add('map-zoom-far');
      else if (mapZoom < 0.9) stage.classList.add('map-zoom-mid');
      else if (mapZoom < 2.5) stage.classList.add('map-zoom-close');
      else stage.classList.add('map-zoom-micro');
    }
    const zoomText = document.getElementById('mapZoomLevelText');
    if (zoomText) {
      zoomText.textContent = `${Math.round(mapZoom * 100)}%`;
    }
  }


  function recenterMapOnPlayer() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const vw = rect.width || 340;
    const vh = rect.height || 400;

    const scale = getCoordScale();
    const px = (currentPlayer?.pos_x ?? 0) * scale;
    const py = -(currentPlayer?.pos_y ?? 0) * scale;

    mapPanX = Math.round(vw / 2 - px * mapZoom);
    mapPanY = Math.round(vh / 2 - py * mapZoom);
    applyMapTransform();
  }

  function fitWorldMap() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const vw = rect.width || 340;
    const vh = rect.height || 400;

    const scale = getCoordScale();
    const locations = cachedWorldMapData?.locations || [];
    const allX = locations.map(l => (l.pos_x ?? 0) * scale);
    const allY = locations.map(l => -(l.pos_y ?? 0) * scale);
    allX.push((currentPlayer?.pos_x ?? 0) * scale);
    allY.push(-(currentPlayer?.pos_y ?? 0) * scale);

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const spanW = Math.max(200, maxX - minX + 120);
    const spanH = Math.max(200, maxY - minY + 120);

    const fitZoom = Math.max(0.06, Math.min(2.0, Math.min((vw * 0.9) / spanW, (vh * 0.9) / spanH)));
    mapZoom = fitZoom;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    mapPanX = Math.round(vw / 2 - midX * mapZoom);
    mapPanY = Math.round(vh / 2 - midY * mapZoom);
    applyMapTransform();
  }

  function zoomMapStep(factor, pivotX = null, pivotY = null) {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cx = pivotX !== null ? pivotX : (rect.width / 2);
    const cy = pivotY !== null ? pivotY : (rect.height / 2);

    const stageX = (cx - mapPanX) / mapZoom;
    const stageY = (cy - mapPanY) / mapZoom;

    const newZoom = Math.max(0.05, Math.min(250.0, mapZoom * factor));
    mapPanX = Math.round(cx - stageX * newZoom);
    mapPanY = Math.round(cy - stageY * newZoom);
    mapZoom = newZoom;
    applyMapTransform();
  }

  // ============================================================
  // MAP RENDERING HELPERS
  // ============================================================

  /** Deterministic color from state id (stable across renders) */
  function getStateMapColor(state) {
    if (state.map_color) return state.map_color;
    const PALETTE = [
      '#f472b6','#60a5fa','#a3e635','#34d399',
      '#fb923c','#c084fc','#fde68a','#6ee7b7',
      '#a78bfa','#fca5a5','#67e8f9','#86efac',
    ];
    let hash = 0;
    const id = state.id || state.name || '';
    for (let i = 0; i < id.length; i++) hash = (id.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    return PALETTE[Math.abs(hash) % PALETTE.length];
  }

  /** Convex Hull (Andrew's Monotone Chain) — returns ordered vertices */
  function computeConvexHull(pts) {
    if (pts.length < 3) return [...pts];
    const sorted = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  /** Inflate polygon vertices outward from centroid by padding units */
  function inflateHull(hull, padding) {
    if (hull.length === 0) return hull;
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
    return hull.map(p => {
      const dx = p.x - cx, dy = p.y - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
    });
  }

  /** Centroid of a polygon */
  function polygonCentroid(pts) {
    if (!pts.length) return { x: 0, y: 0 };
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }

  // ============================================================
  // MAIN MAP RENDER
  // ============================================================
  function renderMapElements() {
    const gridSvg = document.getElementById('mapGridSvg');
    const locLayer = document.getElementById('mapLocationsLayer');
    const plLayer = document.getElementById('mapPlayersLayer');
    if (!gridSvg || !locLayer || !plLayer) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const scale = getCoordScale();
    const locations = cachedWorldMapData?.locations || [];
    const states = cachedWorldMapData?.states || [];

    // ── 1. Bounding box for dynamic grid size ──────────────────
    const allPts = locations.map(l => ({ x: (l.pos_x ?? 0) * scale, y: -(l.pos_y ?? 0) * scale }));
    const playerPt = { x: (currentPlayer?.pos_x ?? 0) * scale, y: -(currentPlayer?.pos_y ?? 0) * scale };
    allPts.push(playerPt);

    const allX = allPts.map(p => p.x), allY = allPts.map(p => p.y);
    const pad = 1800 * scale;
    const gridSize = Math.max(
      Math.max(Math.abs(Math.min(...allX) - pad), Math.abs(Math.max(...allX) + pad)),
      Math.max(Math.abs(Math.min(...allY) - pad), Math.abs(Math.max(...allY) + pad)),
      3000 * scale
    );

    // ── 2. Rebuild SVG using DOM API (fixes encoding issues) ───
    gridSvg.setAttribute('width', String(gridSize * 2));
    gridSvg.setAttribute('height', String(gridSize * 2));
    gridSvg.style.left = `${-gridSize}px`;
    gridSvg.style.top = `${-gridSize}px`;

    // Clear and create root group
    while (gridSvg.firstChild) gridSvg.removeChild(gridSvg.firstChild);
    const rootG = document.createElementNS(SVG_NS, 'g');
    rootG.setAttribute('transform', `translate(${gridSize},${gridSize})`);
    gridSvg.appendChild(rootG);

    // ── 3. Grid lines ──────────────────────────────────────────
    const gridG = document.createElementNS(SVG_NS, 'g');
    gridG.setAttribute('class', 'map-grid-lines');
    const step = 500 * scale;
    for (let x = -gridSize; x <= gridSize; x += step) {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', x); l.setAttribute('y1', -gridSize);
      l.setAttribute('x2', x); l.setAttribute('y2', gridSize);
      l.setAttribute('stroke', 'rgba(34,197,94,0.08)'); l.setAttribute('stroke-width', '1');
      gridG.appendChild(l);
    }
    for (let y = -gridSize; y <= gridSize; y += step) {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', -gridSize); l.setAttribute('y1', y);
      l.setAttribute('x2', gridSize); l.setAttribute('y2', y);
      l.setAttribute('stroke', 'rgba(34,197,94,0.08)'); l.setAttribute('stroke-width', '1');
      gridG.appendChild(l);
    }
    // Axis lines
    const axes = [['x', -gridSize, 0, gridSize, 0], ['y', 0, -gridSize, 0, gridSize]];
    for (const axis of axes) {
      const x1 = axis[1], y1 = axis[2], x2 = axis[3], y2 = axis[4];
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', 'rgba(212,163,89,0.35)'); l.setAttribute('stroke-width', '1.5');
      l.setAttribute('stroke-dasharray', '4,4');
      gridG.appendChild(l);
    }
    rootG.appendChild(gridG);

    // ── 4. State polygon borders ───────────────────────────────
    const bordersG = document.createElementNS(SVG_NS, 'g');
    bordersG.setAttribute('class', 'map-state-borders');

    // State labels layer (drawn on top of fills)
    const labelsG = document.createElementNS(SVG_NS, 'g');
    labelsG.setAttribute('class', 'map-state-labels');

    states.forEach(state => {
      const color = getStateMapColor(state);
      const fillColor = color + '30'; // 19% opacity
      const strokeColor = color + 'bb'; // 73% opacity

      let hullPts = [];

      if (state.border_shape === 'polygon' && state.border_data?.points?.length >= 3) {
        // Use explicit vertices from DB (set by migration from Этерия 2.6.json)
        hullPts = state.border_data.points.map(p => ({ x: p.x * scale, y: -p.y * scale }));
      } else if (state.border_shape === 'circle' && state.border_data?.radius) {
        // Explicit circle
        const cx = (state.border_data.center_x ?? 0) * scale;
        const cy = -(state.border_data.center_y ?? 0) * scale;
        const r = state.border_data.radius * scale;
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
        circle.setAttribute('fill', fillColor); circle.setAttribute('stroke', strokeColor);
        circle.setAttribute('stroke-width', '2'); circle.setAttribute('stroke-dasharray', '10,5');
        bordersG.appendChild(circle);
        // label
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', cx); t.setAttribute('y', cy);
        t.setAttribute('class', 'map-state-label-text');
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
        t.textContent = state.name;
        labelsG.appendChild(t);
        return; // done for this state
      } else {
        // Fallback: compute convex hull from city coords, inflate by 350 units
        const stateLocs = (state.locations || []).filter(
          l => typeof l.pos_x === 'number' && typeof l.pos_y === 'number'
        );
        if (stateLocs.length === 0) return;
        const rawPts = stateLocs.map(l => ({ x: l.pos_x * scale, y: -(l.pos_y) * scale }));
        const hull = computeConvexHull(rawPts);
        hullPts = inflateHull(hull, 350 * scale);
      }

      if (hullPts.length < 3) return;

      // Draw polygon
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', hullPts.map(p => `${p.x},${p.y}`).join(' '));
      polygon.setAttribute('fill', fillColor);
      polygon.setAttribute('stroke', strokeColor);
      polygon.setAttribute('stroke-width', '2');
      polygon.setAttribute('stroke-dasharray', '10,5');
      polygon.setAttribute('class', 'map-state-polygon');
      bordersG.appendChild(polygon);

      // State label at centroid
      const centroid = polygonCentroid(hullPts);
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', centroid.x); t.setAttribute('y', centroid.y);
      t.setAttribute('class', 'map-state-label-text');
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.textContent = state.name;
      labelsG.appendChild(t);
    });

    rootG.appendChild(bordersG);

    // ── 5. Location borders (small circles) ───────────────────
    const locBordersG = document.createElementNS(SVG_NS, 'g');
    locBordersG.setAttribute('class', 'map-loc-borders');
    locations.forEach(loc => {
      const lx = (loc.pos_x ?? 0) * scale;
      const ly = -(loc.pos_y ?? 0) * scale;
      if (loc.bounds_shape === 'circle' && loc.bounds_data?.radius) {
        const r = loc.bounds_data.radius * scale;
        
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', lx); c.setAttribute('cy', ly); c.setAttribute('r', r);
        c.setAttribute('fill', 'rgba(255,255,255,0.04)');
        c.setAttribute('stroke', 'rgba(255,255,255,0.18)');
        c.setAttribute('stroke-width', '1'); c.setAttribute('stroke-dasharray', '4,4');
        c.setAttribute('class', 'map-loc-border');
        locBordersG.appendChild(c);
      } else if (loc.bounds_shape === 'polygon' && loc.bounds_data?.points?.length >= 3) {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', loc.bounds_data.points.map(p => `${p.x * scale},${-p.y * scale}`).join(' '));
        poly.setAttribute('fill', 'rgba(255,255,255,0.04)');
        poly.setAttribute('stroke', 'rgba(255,255,255,0.18)');
        poly.setAttribute('stroke-width', '1'); poly.setAttribute('stroke-dasharray', '4,4');
        poly.setAttribute('class', 'map-loc-border');
        locBordersG.appendChild(poly);
      }
      // Subzone borders (only on close zoom, managed by CSS .map-zoom-close)
      if (loc.subzones) {
        loc.subzones.forEach(sz => {
          const szr = (sz.radius || 0) * scale;
          
          const sc = document.createElementNS(SVG_NS, 'circle');
          sc.setAttribute('cx', (sz.pos_x ?? 0) * scale);
          sc.setAttribute('cy', -(sz.pos_y ?? 0) * scale);
          sc.setAttribute('r', szr);
          sc.setAttribute('fill', 'rgba(255,255,255,0.03)');
          sc.setAttribute('stroke', 'rgba(255,255,255,0.12)');
          sc.setAttribute('stroke-width', '0.5');
          sc.setAttribute('class', 'map-subzone-border');
          locBordersG.appendChild(sc);
        });
      }
    });
    rootG.appendChild(locBordersG);

    // Wild zone ring around player
    if (session?.current_wild_zone) {
      const wg = document.createElementNS(SVG_NS, 'g');
      const wc = document.createElementNS(SVG_NS, 'circle');
      wc.setAttribute('cx', playerPt.x); wc.setAttribute('cy', playerPt.y);
      wc.setAttribute('r', 400 * scale);
      wc.setAttribute('fill', 'rgba(16,185,129,0.08)');
      wc.setAttribute('stroke', 'rgba(16,185,129,0.4)');
      wc.setAttribute('stroke-width', '2'); wc.setAttribute('stroke-dasharray', '8,8');
      const wt = document.createElementNS(SVG_NS, 'text');
      wt.setAttribute('x', playerPt.x);
      wt.setAttribute('y', playerPt.y - 420 * scale);
      wt.setAttribute('fill', '#10b981');
      wt.setAttribute('text-anchor', 'middle');
      wt.setAttribute('class', 'map-wildzone-label');
      wt.textContent = session.current_wild_zone;
      wg.appendChild(wc); wg.appendChild(wt);
      rootG.appendChild(wg);
    }

    // State labels drawn last (above fills)
    rootG.appendChild(labelsG);

    // Origin dot + label
    const originDot = document.createElementNS(SVG_NS, 'circle');
    originDot.setAttribute('cx', '0'); originDot.setAttribute('cy', '0'); originDot.setAttribute('r', '4');
    originDot.setAttribute('fill', '#d4a359');
    rootG.appendChild(originDot);

    // ── 6. HTML Markers for locations ─────────────────────────
    locLayer.innerHTML = locations.map(loc => {
      const lx = (loc.pos_x ?? 0) * scale;
      const ly = -(loc.pos_y ?? 0) * scale;

      let icon = '🏛', pinBg = '#3b82f6';
      if (loc.danger_level === 'lethal' || loc.danger_level === 'deadly') { icon = '💀'; pinBg = '#ef4444'; }
      else if (loc.danger_level === 'danger' || loc.danger_level === 'hard') { icon = '⚔️'; pinBg = '#f59e0b'; }
      else if (loc.type === 'capital') { icon = '👑'; pinBg = '#8b5cf6'; }
      else if (loc.type === 'ruins') { icon = '🪨'; pinBg = '#78716c'; }
      else if (loc.type === 'landmark' || loc.type === 'wilderness') { icon = '🌲'; pinBg = '#10b981'; }
      else if (loc.type === 'dungeon') { icon = '⛩️'; pinBg = '#e11d48'; }
      else if (loc.type === 'village') { icon = '🏘️'; pinBg = '#22c55e'; }

      // subzone markers (close zoom only, hidden via CSS)
      const subHTML = (loc.subzones || []).map(sz => {
        const szx = (sz.pos_x ?? 0) * scale;
        const szy = -(sz.pos_y ?? 0) * scale;
        return `<div class="map-subzone-marker" style="left:${szx}px;top:${szy}px" title="${escapeHtml(sz.name)}">
          <div class="map-subzone-dot"></div>
          <span class="map-marker-label" style="font-size:9px;display:${showMapLabels ? 'block' : 'none'}">${escapeHtml(sz.name)}</span>
        </div>`;
      }).join('');

      return `<div class="map-marker" data-type="${escapeHtml(loc.type)}" data-loc-id="${escapeHtml(loc.id)}"
          style="left:${lx}px;top:${ly}px" title="${escapeHtml(loc.name)} (${loc.pos_x},${loc.pos_y})">
          <div class="map-marker-pin" style="background:${pinBg}">${icon}</div>
          <span class="map-marker-label" style="display:${showMapLabels ? 'block' : 'none'}">${escapeHtml(loc.name)}</span>
        </div>${subHTML}`;
    }).join('');

    locLayer.querySelectorAll('.map-marker').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const loc = locations.find(l => l.id === el.dataset.locId);
        if (loc) showLocationPopup(loc);
      });
    });

    // ── 7. Player markers ─────────────────────────────────────
    const othersHtml = (allPlayers || []).filter(p => p.id !== currentPlayer?.id).map(p => {
      const px = (p.pos_x ?? 0) * scale, py = -(p.pos_y ?? 0) * scale;
      return `<div class="map-player-beacon" style="left:${px}px;top:${py}px" title="${escapeHtml(p.name||'Игрок')}">
        <div class="map-party-dot"></div>
        <span class="map-marker-label" style="background:rgba(14,38,64,0.9);color:#7dd3fc">${escapeHtml(p.name||'Игрок')}</span>
      </div>`;
    }).join('');

    plLayer.innerHTML = `${othersHtml}
      <div class="map-player-beacon" style="left:${playerPt.x}px;top:${playerPt.y}px" title="Вы (${currentPlayer?.pos_x??0}, ${currentPlayer?.pos_y??0})">
        <div class="map-player-dot"></div>
        <span class="map-marker-label" style="background:rgba(10,40,20,0.95);color:#4ade80;font-weight:700">📍 Вы (${currentPlayer?.name||'Герой'})</span>
      </div>`;
  }


  function showLocationPopup(loc) {
    const popup = document.getElementById('mapLocationPopup');
    if (!popup) return;

    const subzonesList = (loc.subzones || []).map(sz => `
      <span class="badge badge-info" style="font-size: 0.65rem;">
        ${escapeHtml(sz.name)} (R:${sz.radius || 10})
      </span>
    `).join(' ') || '<span style="color: var(--text-muted); font-size: 0.75rem;">Нет сабзон</span>';

    const dx = (loc.pos_x ?? 0) - (currentPlayer?.pos_x ?? 0);
    const dy = (loc.pos_y ?? 0) - (currentPlayer?.pos_y ?? 0);
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const unit = session?.scale_unit || 'км';

    popup.style.display = 'flex';
    popup.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(212, 163, 89, 0.3); padding-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <strong style="color: var(--accent-gold); font-size: var(--fs-md);">${escapeHtml(loc.name)}</strong>
          <span class="badge ${loc.danger_level === 'deadly' || loc.danger_level === 'extreme' ? 'badge-danger' : loc.danger_level === 'hard' ? 'badge-warning' : 'badge-success'}" style="font-size: 0.65rem;">
            ${escapeHtml(loc.danger_level || 'normal')}
          </span>
        </div>
        <button class="btn btn-ghost btn-icon btn-xs" id="closeLocPopupBtn" style="font-size: 0.75rem; width: 22px; height: 22px;">✕</button>
      </div>
      <div style="font-size: var(--fs-xs); color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 2px;">
        <span>Координаты: <strong>[${loc.pos_x ?? 0}, ${loc.pos_y ?? 0}]</strong></span>
        <span>Дистанция: <strong style="color: #38bdf8;">${dist} ${escapeHtml(unit)}</strong></span>
      </div>
      ${loc.description ? `<p style="font-size: var(--fs-xs); color: var(--text-main); margin: 3px 0; line-height: 1.3;">${escapeHtml(loc.description)}</p>` : ''}
      <div style="margin-top: 4px;">
        <small style="color: var(--text-muted); display: block; margin-bottom: 2px;">Сабзоны:</small>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${subzonesList}
        </div>
      </div>
    `;

    document.getElementById('closeLocPopupBtn')?.addEventListener('click', () => {
      popup.style.display = 'none';
    });
  }

  function initMapInteractions() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport || viewport.dataset.interactionsBound === 'true') return;
    viewport.dataset.interactionsBound = 'true';

    const activePointers = new Map();
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialPinchDist = null;
    let initialPinchZoom = mapZoom;

    function getDistance(p1, p2) {
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getMidpoint(p1, p2) {
      const rect = viewport.getBoundingClientRect();
      return {
        x: (p1.clientX + p2.clientX) / 2 - rect.left,
        y: (p1.clientY + p2.clientY) / 2 - rect.top,
      };
    }

    viewport.addEventListener('pointerdown', (e) => {
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {}
      activePointers.set(e.pointerId, e);

      const popup = document.getElementById('mapLocationPopup');
      if (popup && e.target === viewport) {
        popup.style.display = 'none';
      }

      if (activePointers.size === 1) {
        isDragging = true;
        dragStartX = e.clientX - mapPanX;
        dragStartY = e.clientY - mapPanY;
      } else if (activePointers.size === 2) {
        isDragging = false;
        const [p1, p2] = Array.from(activePointers.values());
        initialPinchDist = getDistance(p1, p2);
        initialPinchZoom = mapZoom;
      }
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, e);

      if (activePointers.size === 1 && isDragging) {
        mapPanX = Math.round(e.clientX - dragStartX);
        mapPanY = Math.round(e.clientY - dragStartY);
        applyMapTransform();
      } else if (activePointers.size === 2 && initialPinchDist) {
        const [p1, p2] = Array.from(activePointers.values());
        const currentDist = getDistance(p1, p2);
        if (currentDist > 0) {
          const factor = currentDist / initialPinchDist;
          const mid = getMidpoint(p1, p2);

          const stageX = (mid.x - mapPanX) / mapZoom;
          const stageY = (mid.y - mapPanY) / mapZoom;

          const newZoom = Math.max(0.05, Math.min(5.0, initialPinchZoom * factor));
          mapPanX = Math.round(mid.x - stageX * newZoom);
          mapPanY = Math.round(mid.y - stageY * newZoom);
          mapZoom = newZoom;
          applyMapTransform();
        }
      }
    });

    const handlePointerEnd = (e) => {
      activePointers.delete(e.pointerId);
      try {
        if (viewport.hasPointerCapture(e.pointerId)) {
          viewport.releasePointerCapture(e.pointerId);
        }
      } catch {}

      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        isDragging = true;
        dragStartX = remaining.clientX - mapPanX;
        dragStartY = remaining.clientY - mapPanY;
        initialPinchDist = null;
      } else if (activePointers.size === 0) {
        isDragging = false;
        initialPinchDist = null;
      }
    };

    viewport.addEventListener('pointerup', handlePointerEnd);
    viewport.addEventListener('pointercancel', handlePointerEnd);

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      zoomMapStep(factor, mouseX, mouseY);
    }, { passive: false });
  }

  function bindMapToolbarEvents() {
    document.getElementById('mapZoomInBtn')?.addEventListener('click', () => zoomMapStep(1.3));
    document.getElementById('mapZoomOutBtn')?.addEventListener('click', () => zoomMapStep(0.77));
    document.getElementById('mapRecenterBtn')?.addEventListener('click', () => recenterMapOnPlayer());
    document.getElementById('mapFitWorldBtn')?.addEventListener('click', () => fitWorldMap());

    document.getElementById('mapToggleLabelsBtn')?.addEventListener('click', () => {
      showMapLabels = !showMapLabels;
      const btn = document.getElementById('mapToggleLabelsBtn');
      if (btn) btn.textContent = showMapLabels ? '🏷️ Вкл' : '🏷️ Выкл';
      document.querySelectorAll('.map-marker-label').forEach((el) => {
        el.style.display = showMapLabels ? 'block' : 'none';
      });
    });

    document.getElementById('toggleMapWideBtn')?.addEventListener('click', () => {
      isMapWide = !isMapWide;
      const panel = document.getElementById('mapPanel');
      if (panel) panel.classList.toggle('map-wide', isMapWide);
      const btn = document.getElementById('toggleMapWideBtn');
      if (btn) btn.textContent = isMapWide ? '◀▶' : '▶◀';
      setTimeout(recenterMapOnPlayer, 100);
    });

    document.getElementById('toggleMapFullscreenBtn')?.addEventListener('click', () => {
      isMapFullscreen = !isMapFullscreen;
      const panel = document.getElementById('mapPanel');
      if (panel) panel.classList.toggle('map-fullscreen', isMapFullscreen);
      const btn = document.getElementById('toggleMapFullscreenBtn');
      if (btn) btn.textContent = isMapFullscreen ? '🗗' : '⛶';
      setTimeout(recenterMapOnPlayer, 100);
    });
  }

  async function refreshMapPanel() {
    if (!cachedWorldMapData && session?.world_id) {
      try {
        cachedWorldMapData = await getWorldMapData(session.world_id);
      } catch (err) {
        console.warn('Failed to load world map data:', err);
      }
    }

    renderMapElements();
    initMapInteractions();
    bindMapToolbarEvents();

    if (!mapHasBeenCentered) {
      setTimeout(() => {
        recenterMapOnPlayer();
        mapHasBeenCentered = true;
      }, 60);
    } else {
      applyMapTransform();
    }
  }

  const PANEL_IDS = ['story', 'profile', 'inventory', 'npc', 'map', 'settings'];

  async function togglePanel(panel) {
    activePanel = activePanel === panel ? null : panel;

    const overlay = document.getElementById('panelOverlay');
    if (overlay) {
      overlay.classList.toggle('open', !!activePanel);
    }

    PANEL_IDS.forEach((id) => {
      const panelEl = document.getElementById(id + 'Panel');
      if (panelEl) {
        panelEl.classList.toggle('open', activePanel === id);
      }
    });

    if (activePanel === 'inventory') {
      await refreshInventory();
    } else if (activePanel === 'npc') {
      await refreshNpcPanel();
    } else if (activePanel === 'profile') {
      await refreshProfile();
    } else if (activePanel === 'story') {
      await refreshStoryPanel();
    } else if (activePanel === 'map') {
      await refreshMapPanel();
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

    // 1. Мгновенно отображаем сообщение игрока в чате
    const tempMsgId = 'temp-' + Date.now();
    const optimisticPlayerMsg = {
      id: tempMsgId,
      session_id: sessionId,
      sender_type: 'player',
      sender_id: user?.id || currentPlayer?.id,
      sender_name: currentPlayer?.name || 'Герой',
      content: text,
      created_at: new Date().toISOString(),
    };
    messages.push(optimisticPlayerMsg);
    appendMessage(optimisticPlayerMsg);

    // 2. Сразу запускаем анимацию генерации ответа в облачке ДМ
    showDmTypingIndicator();

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
        updatePlayerUI();
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
        updatePlayerUI();
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
      removeDmTypingIndicator();
      isSubmitting = false;
      updateInputState();
    }
  }

  function showDmTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    if (document.getElementById('dmTypingIndicator')) return;

    // Remove empty state if present
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();

    const indicator = document.createElement('div');
    indicator.id = 'dmTypingIndicator';
    indicator.className = 'message message-master typing-indicator-bubble';
    indicator.innerHTML = `
      <div class="message-avatar">🎭</div>
      <div class="message-body">
        <div class="message-text">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(indicator);
    scrollToBottom();
  }

  function removeDmTypingIndicator() {
    const indicator = document.getElementById('dmTypingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  function appendMessage(msg) {
    // ТУМАН ВОЙНЫ: единая функция проверки видимости
    if (!isMessageVisibleToCurrentPlayer(msg)) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Защита от дубликатов в DOM
    if (msg.id && chatMessages.querySelector(`[data-message-id="${msg.id}"]`)) {
      return;
    }

    if (msg.sender_type === 'master' || msg.sender_type === 'npc') {
      removeDmTypingIndicator();
    }

    // Remove empty state if present
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();

    const html = renderMessage(msg, user?.id, currentPlayer?.id);
    if (!html) return;

    const div = document.createElement('div');
    div.innerHTML = html;
    const newEl = div.firstElementChild;

    const typingIndicator = document.getElementById('dmTypingIndicator');
    if (typingIndicator && typingIndicator.parentNode === chatMessages) {
      chatMessages.insertBefore(newEl, typingIndicator);
    } else {
      chatMessages.appendChild(newEl);
    }
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
        const textSpan = locEl.querySelector('span');
        if (textSpan) {
          textSpan.textContent = locStr;
        } else {
          locEl.textContent = `📍 ${locStr}`;
        }
        locEl.title = locStr;
        locEl.style.display = '';
      } else {
        const statusBar = document.querySelector('.game-status-bar') || document.querySelector('.game-header-center');
        if (statusBar) {
          const span = document.createElement('span');
          span.className = 'game-header-location';
          span.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${escapeHtml(locStr)}</span>`;
          span.title = locStr;
          statusBar.prepend(span);
        }
      }
    } else if (locEl) {
      locEl.style.display = 'none';
    }

    const timeEl = document.querySelector('.game-header-time');
    const day = session?.game_day ?? session?.game_time?.day ?? 14;
    const month = session?.game_month ?? session?.game_time?.month ?? 5;
    const year = session?.game_year ?? session?.game_time?.year ?? 1248;
    const hour = session?.game_hour ?? session?.game_time?.hour ?? 10;
    const minute = session?.game_minute ?? session?.game_time?.minute ?? 0;
    const timeStr = formatGameCalendarDate(day, month, year, hour, minute);
    if (timeStr) {
      if (timeEl) {
        const textSpan = timeEl.querySelector('span');
        if (textSpan) {
          textSpan.textContent = timeStr;
        } else {
          timeEl.textContent = `🕐 ${timeStr}`;
        }
        timeEl.title = timeStr;
        timeEl.style.display = '';
      } else {
        const statusBar = document.querySelector('.game-status-bar') || document.querySelector('.game-header-center');
        if (statusBar) {
          const span = document.createElement('span');
          span.className = 'game-header-time';
          span.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeStr)}</span>`;
          span.title = timeStr;
          statusBar.appendChild(span);
        }
      }
    } else if (timeEl) {
      timeEl.style.display = 'none';
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
  async function renderCharacterCreation() {
    container.innerHTML = `
      <div class="page page-centered">
        <div class="card" style="max-width: 600px; width: 100%;">
          <h2 class="card-title" style="margin-bottom: 0.5rem;">⚔️ Создание персонажа</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Выберите существующего героя или создайте нового</p>

          <!-- Выбор точки спавна в мультиплеере -->
          ${allPlayers.length > 1 ? `
            <div class="spawn-selection-box" style="margin-bottom: 1.25rem; padding: 0.85rem; background: rgba(30, 24, 20, 0.6); border: 1px solid var(--border); border-radius: var(--radius-md);">
              <label class="form-label" style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem;">
                📍 Выберите, рядом с кем появиться:
              </label>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;" id="spawnChoicesContainer">
                ${allPlayers.map((p, idx) => {
                  const pLoc = `${session?.current_wild_zone ? '🌲 ' + session.current_wild_zone : (session?.current_location_name || 'Локация')}${p.current_zone ? ` • 📍 ${p.current_zone}` : ' • Основная зона'}`;
                  return `
                    <label class="spawn-radio-card" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid ${idx === 0 ? 'var(--primary)' : 'var(--border)'}; border-radius: var(--radius-sm); cursor: pointer; background: rgba(0,0,0,0.25);">
                      <input type="radio" name="spawnTargetPlayerId" value="${p.id}" ${idx === 0 ? 'checked' : ''} />
                      <div style="flex: 1;">
                        <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                          ⚔️ ${escapeHtml(p.name)}
                          <span class="badge badge-info" style="font-size: 0.7rem;">${escapeHtml(p.race || 'Герой')} / ${escapeHtml(p.class || '')}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                          📍 ${escapeHtml(pLoc)}
                        </div>
                      </div>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          ` : (allPlayers.length === 1 ? `
            <div class="spawn-info-box" style="margin-bottom: 1.25rem; padding: 0.75rem; background: rgba(30, 24, 20, 0.5); border-left: 3px solid var(--primary); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
              <div style="font-size: 0.85rem; color: var(--text-main);">
                📍 Вы появитесь рядом с героем <strong>${escapeHtml(allPlayers[0].name)}</strong> (${escapeHtml(allPlayers[0].race || 'Герой')} / ${escapeHtml(allPlayers[0].class || '')}):
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                📍 ${escapeHtml(`${session?.current_wild_zone ? '🌲 ' + session.current_wild_zone : (session?.current_location_name || 'Локация')}${allPlayers[0].current_zone ? ` • ${allPlayers[0].current_zone}` : ' • Основная зона'}`)}
              </div>
            </div>
          ` : '')}

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

    function getSelectedSpawnTarget() {
      if (!allPlayers.length) return { zone: null, targetName: null };
      if (allPlayers.length === 1) return { zone: allPlayers[0].current_zone || null, targetName: allPlayers[0].name };
      const checkedRadio = document.querySelector('input[name="spawnTargetPlayerId"]:checked');
      if (checkedRadio) {
        const targetPlayer = allPlayers.find((p) => p.id === checkedRadio.value);
        if (targetPlayer) {
          return { zone: targetPlayer.current_zone || null, targetName: targetPlayer.name };
        }
      }
      return { zone: allPlayers[0]?.current_zone || null, targetName: allPlayers[0]?.name || null };
    }

    document.querySelectorAll('input[name="spawnTargetPlayerId"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.spawn-radio-card').forEach((card) => {
          card.style.borderColor = 'var(--border)';
        });
        const parent = radio.closest('.spawn-radio-card');
        if (parent) parent.style.borderColor = 'var(--primary)';
      });
    });

    // Load existing cards after DOM elements are created
    try {
      const cards = await getCharacterCards(user.id);
      const cardsEl = document.getElementById('existingCardsList');
      if (cardsEl) {
        if (cards && cards.length > 0) {
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

          cardsEl.querySelectorAll('.char-select-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              if (isSelectingCharacter) return;
              const cardId = btn.dataset.cardId;
              const card = cards.find((c) => c.id === cardId);
              if (!card) return;

              isSelectingCharacter = true;
              cardsEl.querySelectorAll('.char-select-btn').forEach((b) => {
                b.disabled = true;
                b.style.opacity = '0.6';
              });
              btn.textContent = '⏳ Выбор героя...';

              try {
                // Защита от задвоения: проверяем, не был ли персонаж уже создан (в другой вкладке или гонке запросов)
                const activeUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
                const freshPlayers = await getSessionPlayers(sessionId);
                const existingPlayer = activeUserId ? freshPlayers.find((p) => p.user_id === activeUserId) : null;
                if (existingPlayer) {
                  currentPlayer = existingPlayer;
                  allPlayers = freshPlayers;
                  toast.info(`Персонаж «${existingPlayer.name}» уже участвует в игре!`);
                  render();
                  subscribeRealtime();
                  return;
                }

                console.log('[character-card] select card:', { cardId, name: card.name, stats: card.stats });

                const cardRace = card.race || 'Человек';
                const cardRaceAcBonus = Number(card.race_ac_bonus ?? getRaceAcBonus(cardRace));
                const spawnTarget = getSelectedSpawnTarget();
                currentPlayer = await createPlayer({
                  session_id: sessionId,
                  user_id: activeUserId || user.id,
                  name: card.name,
                  race: cardRace,
                  class: card.class,
                  appearance: card.appearance,
                  bio: card.bio,
                  personality: card.personality || {},
                  power_level: card.power_level || 10,
                  level: 1,
                  xp: 0,
                  stats: card.stats || {},
                  stat_points: 0,
                  hp: card.hp || calculateHpFromStats(card.stats),
                  max_hp: card.max_hp || calculateHpFromStats(card.stats),
                  mp: 50,
                  max_mp: 50,
                  money: card.money || 50,
                  current_zone: spawnTarget.zone,
                  ...calculateDerivedStats(card.stats, cardRace, [], cardRaceAcBonus),
                });

                console.log('[character-card] player created:', currentPlayer.id);
                if (allPlayers.length > 0) {
                  try {
                    const nearText = spawnTarget.targetName ? `рядом с героем ${spawnTarget.targetName}` : 'в локации';
                    await supabase.from('messages').insert({
                      session_id: sessionId,
                      sender_type: 'system',
                      sender_name: 'Система',
                      content: `👋 В поле зрения появляется странник: ${currentPlayer.name} (${currentPlayer.race} ${currentPlayer.class}), замеченный ${nearText}. Вы ещё не знакомы с ним.`,
                    });
                  } catch (annErr) {
                    console.warn('Failed to announce join:', annErr);
                  }
                }
                allPlayers.push(currentPlayer);
                await initTurnQueue(sessionId, allPlayers);
                await checkTurnQueue();
                toast.success(`Герой «${card.name}» выбран!`);
                render();
                subscribeRealtime();
              } catch (err) {
                console.error('[character-card] select error:', err);
                toast.error('Ошибка: ' + err.message);
                isSelectingCharacter = false;
                cardsEl.querySelectorAll('.char-select-btn').forEach((b) => {
                  b.disabled = false;
                  b.style.opacity = '1';
                });
                btn.textContent = 'Выбрать этого героя';
              }
            });
          });
        } else {
          cardsEl.innerHTML = '<p class="text-muted" style="text-align: center;">У вас пока нет карточек. Создайте нового героя ниже.</p>';
        }
      }
    } catch (err) {
      console.warn('[character-creation] Failed to load cards:', err);
      const cardsEl = document.getElementById('existingCardsList');
      if (cardsEl) {
        cardsEl.innerHTML = '<p class="text-muted" style="text-align: center;">Не удалось загрузить сохранённые карточки. Создайте нового героя ниже.</p>';
      }
    }

    // Create new character
    document.getElementById('createCharacterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSelectingCharacter) return;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      isSelectingCharacter = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Создание героя...';
      }

      try {
        const activeUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
        const freshPlayers = await getSessionPlayers(sessionId);
        const existingPlayer = activeUserId ? freshPlayers.find((p) => p.user_id === activeUserId) : null;
        if (existingPlayer) {
          currentPlayer = existingPlayer;
          allPlayers = freshPlayers;
          toast.info(`Персонаж «${existingPlayer.name}» уже участвует в игре!`);
          render();
          subscribeRealtime();
          return;
        }

        const stats = {};
        STATS.forEach((stat) => {
          stats[stat] = parseInt(document.getElementById(`stat_${stat}`).value) || 10;
        });

        const charRace = document.getElementById('charRace').value || 'Человек';
        const raceAcBonus = getRaceAcBonus(charRace);
        const derived = calculateDerivedStats(stats, charRace, [], raceAcBonus);
        const spawnTarget = getSelectedSpawnTarget();
        const requestPayload = {
          session_id: sessionId,
          user_id: activeUserId || user.id,
          name: document.getElementById('charName').value,
          race: charRace,
          class: document.getElementById('charClass').value,
          appearance: document.getElementById('charAppearance').value,
          bio: document.getElementById('charBio').value,
          personality: { ideals: [], bonds: [], flaws: [] },
          power_level: 10,
          level: 1,
          xp: 0,
          stats,
          stat_points: 0,
          hp: calculateHpFromStats(stats),
          max_hp: calculateHpFromStats(stats),
          mp: 50,
          max_mp: 50,
          money: 50,
          current_zone: spawnTarget.zone,
          ...derived,
        };
        console.log('[create-character] request:', requestPayload);

        currentPlayer = await createPlayer(requestPayload);

        console.log('[create-character] player created:', currentPlayer.id);
        if (allPlayers.length > 0) {
          try {
            const nearText = spawnTarget.targetName ? `рядом с героем ${spawnTarget.targetName}` : 'в локации';
            await supabase.from('messages').insert({
              session_id: sessionId,
              sender_type: 'system',
              sender_name: 'Система',
              content: `👋 В поле зрения появляется странник: ${currentPlayer.name} (${currentPlayer.race} ${currentPlayer.class}), замеченный ${nearText}. Вы ещё не знакомы с ним.`,
            });
          } catch (annErr) {
            console.warn('Failed to announce join:', annErr);
          }
        }
        allPlayers.push(currentPlayer);
        await initTurnQueue(sessionId, allPlayers);
        await checkTurnQueue();
        toast.success('Персонаж создан!');
        render();
        subscribeRealtime();
      } catch (err) {
        console.error('[create-character] error:', err);
        toast.error('Ошибка создания: ' + err.message);
        isSelectingCharacter = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Начать приключение';
        }
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

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && !isCancelled && sessionId) {
      getSession(sessionId).then((fresh) => {
        if (fresh) {
          session = fresh;
          updatePlayerUI();
        }
      }).catch(() => {});
      checkTurnQueue();
    }
  }

  function handleOnline() {
    if (!isCancelled && sessionId) {
      getSession(sessionId).then((fresh) => {
        if (fresh) {
          session = fresh;
          updatePlayerUI();
        }
      }).catch(() => {});
      checkTurnQueue();
    }
  }

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Cleanup on unmount
  function cleanup() {
    isCancelled = true;
    removeDmTypingIndicator();
    if (unsubMessages) unsubMessages();
    if (unsubPlayers) unsubPlayers();
    if (unsubSession) unsubSession();
    if (unsubTurnQueue) unsubTurnQueue();
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  await load();

  // Return cleanup function
  return cleanup;
}
