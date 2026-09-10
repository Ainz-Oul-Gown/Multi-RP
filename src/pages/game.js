// src/pages/game.js вЂ” РРіСЂРѕРІРѕР№ СЌРєСЂР°РЅ (Р§Р°С‚ + РРЅРІРµРЅС‚Р°СЂСЊ + РџСЂРѕС„РёР»СЊ)
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
  let isMyTurn = true; // РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ СЂР°Р·СЂРµС€Р°РµРј РІРІРѕРґ
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
  // РўРЈРњРђРќ Р’РћР™РќР«: С„РёР»СЊС‚СЂ РІРёРґРёРјРѕСЃС‚Рё СЃРѕРѕР±С‰РµРЅРёР№
  // РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ РњР°СЃС‚РµСЂР° (СЃ metadata.target_player_id)
  // РІРёРґРЅС‹ РўРћР›Р¬РљРћ СѓРєР°Р·Р°РЅРЅРѕРјСѓ РёРіСЂРѕРєСѓ. Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ РЅР°СЂСЂР°С‚РёРІ (Р±РµР· target)
  // Рё СЃРёСЃС‚РµРјРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ РІРёРґСЏС‚ РІСЃРµ.
  // fog_perception вЂ” РІРёРґРёС‚ С‚РѕР»СЊРєРѕ Р°РґСЂРµСЃР°С‚ (РґСЂСѓРіРѕР№ РёРіСЂРѕРє-РЅР°Р±Р»СЋРґР°С‚РµР»СЊ)
  // ============================================
  function isMessageVisibleToCurrentPlayer(msg) {
    if (!msg) return false;

    // РЎРёСЃС‚РµРјРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ вЂ” РІСЃРµ
    if (msg.sender_type === 'system') return true;

    // РЎРІРѕРё РґРµР№СЃС‚РІРёСЏ РІРёРґРёС‚ С‚РѕР»СЊРєРѕ Р°РІС‚РѕСЂ (РїСЂРѕРІРµСЂСЏРµРј РєР°Рє auth user.id, С‚Р°Рє Рё player.id)
    if (msg.sender_type === 'player') {
      const myUserId = user?.id;
      const myPlayerId = currentPlayer?.id;
      return (myUserId && msg.sender_id === myUserId) || (myPlayerId && msg.sender_id === myPlayerId);
    }

    // РЎРѕРѕР±С‰РµРЅРёСЏ РњР°СЃС‚РµСЂР°: РїСЂРѕРІРµСЂСЏРµРј target_player_id
    if (msg.sender_type === 'master') {
      const targetPlayerId = msg.metadata?.target_player_id;
      // Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ Р»РѕРі: РІРёРґРµРЅ РёРіСЂРѕРєР°Рј РІ С‚РѕР№ Р¶Рµ Р·РѕРЅРµ, РєСЂРѕРјРµ Р°РІС‚РѕСЂР° РґРµР№СЃС‚РІРёСЏ (Р°РІС‚РѕСЂ СѓР¶Рµ РІРёРґРёС‚ Р»РёС‡РЅС‹Р№ РЅР°СЂСЂР°С‚РёРІ)
      // РРіСЂРѕРєРё РІ РґСЂСѓРіРёС… Р·РѕРЅР°С… РЅРµ РІРёРґСЏС‚ РґРµС‚Р°Р»Рё С‡СѓР¶РёС… РґРµР№СЃС‚РІРёР№ вЂ” СЃРѕР±С‹С‚РёСЏ РґРѕС…РѕРґСЏС‚ С‚РѕР»СЊРєРѕ С‡РµСЂРµР· fog_perception
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
      // Fog-СЃРѕРѕР±С‰РµРЅРёРµ: РІРёРґРёС‚ РўРћР›Р¬РљРћ Р°РґСЂРµСЃР°С‚
      if (msg.metadata?.fog_filtered === true) {
        return currentPlayer && targetPlayerId === currentPlayer.id;
      }
      if (!targetPlayerId) {
        return true;
      }
      // РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РЅР°СЂСЂР°С‚РёРІ вЂ” С‚РѕР»СЊРєРѕ Р°РґСЂРµСЃР°С‚Сѓ
      return currentPlayer && targetPlayerId === currentPlayer.id;
    }

    // РЎРѕРѕР±С‰РµРЅРёСЏ NPC (РґРёР°Р»РѕРіРё, СЃРїСѓС‚РЅРёРєРё, СЂРµРїР»РёРєРё РІ СЃС†РµРЅРµ) вЂ” РІРёРґРЅС‹ РІСЃРµРј РёРіСЂРѕРєР°Рј
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
        toast.error('РЎРµСЃСЃРёСЏ РЅРµ РЅР°Р№РґРµРЅР°');
        router.navigate('/');
        return;
      }
      allPlayers = await getSessionPlayers(sessionId);
      if (isCancelled) return;

      // РћРїСЂРµРґРµР»СЏРµРј С‚РµРєСѓС‰РµРіРѕ РёРіСЂРѕРєР° РґР»СЏ РґР°РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (СЃ fallback РЅР° getUser)
      const currentUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
      currentPlayer = currentUserId ? allPlayers.find((p) => p.user_id === currentUserId) : null;
      if (!currentPlayer && allPlayers.length === 1 && !allPlayers[0].user_id) {
        currentPlayer = allPlayers[0];
      }
      messages = await getSessionMessages(sessionId);
      if (isCancelled) return;

      // Р•СЃР»Рё РїРµСЂСЃРѕРЅР°Р¶ СѓР¶Рµ РµСЃС‚СЊ, РїСЂРѕРІРµСЂСЏРµРј РѕС‡РµСЂРµРґСЊ С…РѕРґРѕРІ Рё Р·Р°РіСЂСѓР¶Р°РµРј РЅР°РІС‹РєРё
      if (currentPlayer) {
        try {
          playerSkills = await getPlayerSkills(currentPlayer.id);
        } catch (skErr) {
          console.warn('Failed to load player skills:', skErr);
        }
        await checkTurnQueue();
      }

      // РџСЂРµРґР·Р°РіСЂСѓР·РєР° РґР°РЅРЅС‹С… РєР°СЂС‚С‹ РјРёСЂР°
      if (session?.world_id) {
        getWorldMapData(session.world_id)
          .then((data) => { cachedWorldMapData = data; })
          .catch((err) => console.warn('World map preload warning:', err));
      }
    } catch (err) {
      if (isCancelled) return;
      toast.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё: ' + err.message);
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
  // РћР§Р•Р Р•Р”Р¬ РҐРћР”РћР’: РїСЂРѕРІРµСЂРєР° Рё РїРѕРґРїРёСЃРєР°
  // ============================================
  async function checkTurnQueue() {
    if (!currentPlayer) return;

    // Р•СЃР»Рё РІ СЃРµСЃСЃРёРё 1 РёРіСЂРѕРє вЂ” РІСЃРµРіРґР° РµРіРѕ С…РѕРґ
    if (allPlayers.length <= 1) {
      isMyTurn = true;
      activePlayerName = currentPlayer.name || 'Р“РµСЂРѕР№';
      updateInputState();
      return;
    }

    try {
      let currentTurn = await getCurrentTurn(sessionId);
      if (!currentTurn) {
        // РћС‡РµСЂРµРґСЊ РїСѓСЃС‚Р° РёР»Рё РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ С…РѕРґР° вЂ” СЃР°РјРѕРёСЃС†РµР»РµРЅРёРµ/РёРЅРёС†РёР°Р»РёР·Р°С†РёСЏ
        currentTurn = await initTurnQueue(sessionId, allPlayers);
      }
      if (currentTurn) {
        activeTurnEntityType = currentTurn.entity_type || (currentTurn.npc_id ? 'npc' : 'player');
        if (activeTurnEntityType === 'npc') {
          isMyTurn = false;
          activePlayerName = 'Р’СЂР°Рі / NPC';
        } else {
          isMyTurn = currentTurn.player_id === currentPlayer.id;
          const activeP = allPlayers.find((p) => p.id === currentTurn.player_id);
          activePlayerName = activeP ? (activeP.name || 'Р“РµСЂРѕР№') : 'РќР°РїР°СЂРЅРёРє';
        }
      } else {
        // РќРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ С…РѕРґР° вЂ” СЂР°Р·СЂРµС€Р°РµРј РІРІРѕРґ
        isMyTurn = true;
        activePlayerName = currentPlayer.name || 'Р“РµСЂРѕР№';
      }
    } catch (err) {
      console.warn('checkTurnQueue fallback:', err);
      isMyTurn = true;
      activePlayerName = currentPlayer.name || 'Р“РµСЂРѕР№';
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

        // Р•СЃР»Рё РїСЂРёС€Р»Рѕ СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ РњР°СЃС‚РµСЂР° РёР»Рё NPC, СЃСЂР°Р·Сѓ СЃРєСЂС‹РІР°РµРј РёРЅРґРёРєР°С‚РѕСЂ РіРµРЅРµСЂР°С†РёРё
        if (msg.sender_type === 'master' || msg.sender_type === 'npc') {
          removeDmTypingIndicator();
        }

        // РњРіРЅРѕРІРµРЅРЅР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РёРіСЂРѕРІРѕРіРѕ РІСЂРµРјРµРЅРё РёР· РјРµС‚Р°РґР°РЅРЅС‹С… РІС…РѕРґСЏС‰РµРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ
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
          // Р¤РѕРЅРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ СЃРµСЃСЃРёРё РЅР° СЃР»СѓС‡Р°Р№ РёР·РјРµРЅРµРЅРёР№ РІ Р‘Р”
          getSession(sessionId).then((fresh) => {
            if (fresh) {
              session = fresh;
              updatePlayerUI();
            }
          }).catch(() => {});
        }

        // Р•СЃР»Рё СЌС‚Рѕ СЃРѕРѕР±С‰РµРЅРёРµ РёРіСЂРѕРєР°, РїСЂРѕРІРµСЂСЏРµРј, РЅРµ Р±С‹Р»Рѕ Р»Рё РѕРЅРѕ СѓР¶Рµ РѕС‚РѕР±СЂР°Р¶РµРЅРѕ РѕРїС‚РёРјРёСЃС‚РёС‡РЅРѕ
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

        // Р—Р°С‰РёС‚Р° РѕС‚ РґСѓР±Р»РёСЂРѕРІР°РЅРёСЏ СЃРѕРѕР±С‰РµРЅРёР№ РІ РјР°СЃСЃРёРІРµ РёСЃС‚РѕСЂРёРё
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
          toast.info(`РРіСЂРѕРє В«${newPlayer.name || 'Р“РµСЂРѕР№'}В» РїСЂРёСЃРѕРµРґРёРЅРёР»СЃСЏ Рє СЃРµСЃСЃРёРё!`);
          const countEl = document.getElementById('participantsCount');
          if (countEl) countEl.textContent = `РЈС‡Р°СЃС‚РЅРёРєРё (${allPlayers.length})`;
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
          if (countEl) countEl.textContent = `РЈС‡Р°СЃС‚РЅРёРєРё (${allPlayers.length})`;
          const listEl = document.getElementById('sessionPlayersList');
          if (listEl) listEl.innerHTML = renderSessionParticipants(allPlayers);
          bindParticipantEvents();

          if (currentPlayer && currentPlayer.id === deletedId) {
            toast.warning('Р’С‹ Р±С‹Р»Рё РёСЃРєР»СЋС‡РµРЅС‹ РёР· СЃРµСЃСЃРёРё');
            router.navigate('/');
            return;
          }
          await checkTurnQueue();
        }
      }
    });

    // РџРѕРґРїРёСЃРєР° РЅР° РёР·РјРµРЅРµРЅРёРµ РїР°СЂР°РјРµС‚СЂРѕРІ СЃРµСЃСЃРёРё (РІСЂРµРјСЏ, РєР°Р»РµРЅРґР°СЂСЊ, Р»РѕРєР°С†РёСЏ, РѕС‚СЂСЏРґС‹)
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

    // РџРѕРґРїРёСЃРєР° РЅР° РѕС‡РµСЂРµРґСЊ С…РѕРґРѕРІ
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
          activePlayerName = 'Р’СЂР°Рі / NPC';
        } else {
          isMyTurn = turn.player_id === currentPlayer.id;
          const activeP = allPlayers.find((p) => p.id === turn.player_id);
          activePlayerName = activeP ? (activeP.name || 'Р“РµСЂРѕР№') : 'РќР°РїР°СЂРЅРёРє';
        }

        // РЎРЅРёРјР°РµРј Р±Р»РѕРєРёСЂРѕРІРєСѓ, РєРѕРіРґР° РЅР°СЃС‚СѓРїР°РµС‚ РЅР°С€ С…РѕРґ
        if (!wasMyTurn && isMyTurn) {
          toast.info('Р’Р°С€ С…РѕРґ!');
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
        turnIndicator.innerHTML = '<span class="badge badge-error" style="display: inline-flex; align-items: center; gap: 4px;">вљ”пёЏ РҐРѕРґ РїСЂРѕС‚РёРІРЅРёРєР° / NPC</span>';
      } else if (!hasMultiplePlayers) {
        turnIndicator.innerHTML = '';
      } else if (isMyTurn) {
        turnIndicator.innerHTML = '<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;">рџџў Р’Р°С€ С…РѕРґ</span>';
      } else {
        turnIndicator.innerHTML = `<span class="badge badge-warning" style="display: inline-flex; align-items: center; gap: 4px;">вЏі РҐРѕРґ: ${escapeHtml(activePlayerName || 'РќР°РїР°СЂРЅРёРє')}</span>`;
      }
    }

    if (takeTurnBtn) {
      takeTurnBtn.style.display = (hasMultiplePlayers && !isMyTurn) ? 'inline-flex' : 'none';
    }

    if (!input || !sendBtn) return;

    if (!isMyTurn || isSubmitting) {
      input.disabled = true;
      input.placeholder = isSubmitting
        ? 'РћР±СЂР°Р±РѕС‚РєР° РґРµР№СЃС‚РІРёСЏ...'
        : (activeTurnEntityType === 'npc' ? 'РҐРѕРґ РїСЂРѕС‚РёРІРЅРёРєР° / NPC...' : `РћР¶РёРґР°РЅРёРµ РґРµР№СЃС‚РІРёР№ РЅР°РїР°СЂРЅРёРєР° (${activePlayerName || 'РґСЂСѓРіРѕР№ РёРіСЂРѕРє'})...`);
      sendBtn.disabled = true;
    } else {
      input.disabled = false;
      input.placeholder = 'РћРїРёС€РёС‚Рµ РґРµР№СЃС‚РІРёРµ РІР°С€РµРіРѕ РіРµСЂРѕСЏ...';
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
      ? `рџЊІ ${session.current_wild_zone}`
      : (session?.current_location_name || '');


    container.innerHTML = `
      <div class="game-page">
        <!-- Header -->
        <header class="game-header">
          <div class="game-header-top">
            <button class="btn btn-ghost btn-icon" id="backBtn" title="Р’ Р»РѕР±Р±Рё" aria-label="Р’РµСЂРЅСѓС‚СЊСЃСЏ РІ Р»РѕР±Р±Рё">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div class="game-header-center game-header-hero">
              <span class="game-header-name" title="${currentPlayer?.name || 'Р“РµСЂРѕР№'}">${currentPlayer?.name || 'Р“РµСЂРѕР№'}</span>
              <div class="hp-bar-container" title="HP: ${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}">
                <div class="hp-bar ${hpClass}" style="width: ${hpPercent}%"></div>
              </div>
              <span class="game-header-hp">${currentPlayer?.hp || 0}/${currentPlayer?.max_hp || 0}</span>
            </div>
            <div class="game-header-actions">
              <button class="btn btn-ghost btn-icon" id="storyBtn" title="РЎСЋР¶РµС‚" aria-label="РЎСЋР¶РµС‚">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="profileBtn" title="РџСЂРѕС„РёР»СЊ РіРµСЂРѕСЏ" aria-label="РџСЂРѕС„РёР»СЊ">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="inventoryBtn" title="РРЅРІРµРЅС‚Р°СЂСЊ" aria-label="РРЅРІРµРЅС‚Р°СЂСЊ">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="npcBtn" title="NPC Рё РћРєСЂСѓР¶РµРЅРёРµ" aria-label="РћРєСЂСѓР¶РµРЅРёРµ Рё NPC">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="mapBtn" title="РљР°СЂС‚Р° Рё Р Р°РґР°СЂ" aria-label="РљР°СЂС‚Р°">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon" id="settingsBtn" title="РќР°СЃС‚СЂРѕР№РєРё" aria-label="РќР°СЃС‚СЂРѕР№РєРё">
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
                <div class="empty-icon">рџ“њ</div>
                <p>РСЃС‚РѕСЂРёСЏ РїРѕРєР° РїСѓСЃС‚Р°. РќР°С‡РЅРёС‚Рµ РґРµР№СЃС‚РІРёРµ!</p>
              </div>
            `}
            ${isSubmitting ? `
              <div id="dmTypingIndicator" class="message message-master typing-indicator-bubble">
                <div class="message-avatar">рџЋ­</div>
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

        <!-- Busy State Banner (Р•СЃР»Рё РїРµСЂСЃРѕРЅР°Р¶ Р·Р°РЅСЏС‚ РґР»РёС‚РµР»СЊРЅС‹Рј РґРµР№СЃС‚РІРёРµРј) -->
        <div id="busyStateBanner" class="busy-state-banner" style="display: ${currentPlayer?.is_busy ? 'flex' : 'none'};">
          <div class="busy-state-info">
            <span class="busy-icon">вЏі</span>
            <div class="busy-text">
              <strong>${escapeHtml(currentPlayer?.busy_activity || 'Р”Р»РёС‚РµР»СЊРЅРѕРµ Р·Р°РЅСЏС‚РёРµ')}</strong>
              <small>РћСЃС‚Р°Р»РѕСЃСЊ: <span id="busyMinutesLeft">${currentPlayer?.busy_remaining_minutes || 0}</span> РјРёРЅ.</small>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="interruptBusyBtn" title="РџСЂРµСЂРІР°С‚СЊ Рё Р·Р°Р±СЂР°С‚СЊ РЅР°РєРѕРїР»РµРЅРЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚">
            вЏ№пёЏ РџСЂРµСЂРІР°С‚СЊ
          </button>
        </div>

        <!-- Input Area -->
        <footer class="game-input-area">
          <div class="game-turn-bar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; font-size: var(--fs-xs); min-height: 24px;">
            <div id="turnIndicator" style="display: flex; align-items: center; gap: 0.5rem;">
              ${allPlayers.length > 1
                ? (isMyTurn
                    ? '<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;">рџџў Р’Р°С€ С…РѕРґ</span>'
                    : `<span class="badge badge-warning" style="display: inline-flex; align-items: center; gap: 4px;">вЏі РҐРѕРґ: ${escapeHtml(activePlayerName || 'РќР°РїР°СЂРЅРёРє')}</span>`)
                : ''}
            </div>
            <button class="btn btn-ghost btn-xs" id="takeTurnBtn" style="display: ${allPlayers.length > 1 && !isMyTurn ? 'inline-flex' : 'none'}; font-size: var(--fs-xs); padding: 2px 8px;" title="Р•СЃР»Рё РЅР°РїР°СЂРЅРёРє РґРѕР»РіРѕ РЅРµ РѕС‚РІРµС‡Р°РµС‚, РІС‹ РјРѕР¶РµС‚Рµ РїРµСЂРµС…РІР°С‚РёС‚СЊ С…РѕРґ">
              вЏ­пёЏ Р’Р·СЏС‚СЊ С…РѕРґ
            </button>
          </div>
          <div class="game-input-wrapper">
            <textarea
              class="game-input"
              id="actionInput"
              placeholder="${isMyTurn ? 'РћРїРёС€РёС‚Рµ РґРµР№СЃС‚РІРёРµ РІР°С€РµРіРѕ РіРµСЂРѕСЏ...' : `РћР¶РёРґР°РЅРёРµ РґРµР№СЃС‚РІРёР№ РЅР°РїР°СЂРЅРёРєР° (${activePlayerName || 'РґСЂСѓРіРѕР№ РёРіСЂРѕРє'})...`}"
              rows="1"
              ${isSubmitting || !isMyTurn ? 'disabled' : ''}
            ></textarea>
            <button class="btn btn-primary btn-icon" id="sendBtn" ${isSubmitting || !isMyTurn ? 'disabled' : ''}>
              ${isSubmitting ? 'вЏі' : 'в–¶'}
            </button>
          </div>
        </footer>

        <!-- Side Panels -->
        <div class="side-panel-overlay ${activePanel ? 'open' : ''}" id="panelOverlay"></div>

        <!-- Storyline Panel -->
        <div class="side-panel ${activePanel === 'story' ? 'open' : ''}" id="storyPanel">
          <div class="side-panel-header">
            <h2>рџ“– РЎСЋР¶РµС‚РЅР°СЏ Р»РёРЅРёСЏ</h2>
            <button class="btn btn-ghost btn-icon" id="closeStoryBtn">вњ•</button>
          </div>
          <div class="side-panel-content" id="storyContent">
            ${renderStoryPanel(session?.storyline)}
          </div>
        </div>

        <!-- Profile Panel -->
        <div class="side-panel ${activePanel === 'profile' ? 'open' : ''}" id="profilePanel">
          <div class="side-panel-header">
            <h2>рџ‘¤ РџСЂРѕС„РёР»СЊ</h2>
            <button class="btn btn-ghost btn-icon" id="closeProfileBtn">вњ•</button>
          </div>
          <div class="side-panel-content" id="profileContent">
            ${currentPlayer ? renderProfile(currentPlayer) : ''}
          </div>
        </div>

        <!-- Inventory Panel -->
        <div class="side-panel ${activePanel === 'inventory' ? 'open' : ''}" id="inventoryPanel">
          <div class="side-panel-header">
            <h2>рџЋ’ РРЅРІРµРЅС‚Р°СЂСЊ</h2>
            <button class="btn btn-ghost btn-icon" id="closeInventoryBtn">вњ•</button>
          </div>
          <div class="side-panel-content" id="inventoryContent">
            ${currentPlayer ? renderInventory(currentPlayer) : ''}
          </div>
        </div>

        <!-- NPC Relationships Panel -->
        <div class="side-panel ${activePanel === 'npc' ? 'open' : ''}" id="npcPanel">
          <div class="side-panel-header">
            <h2>рџ‘Ґ РћРєСЂСѓР¶РµРЅРёРµ Рё NPC</h2>
            <button class="btn btn-ghost btn-icon" id="closeNpcBtn">вњ•</button>
          </div>
          <div class="side-panel-content" id="npcContent">
            ${cachedNpcData.length ? renderNpcList(cachedNpcData) : '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Р—Р°РіСЂСѓР·РєР° РїРµСЂСЃРѕРЅР°Р¶РµР№...</div>'}
          </div>
        </div>

        <!-- Map & Radar Panel -->
        <div class="side-panel ${activePanel === 'map' ? 'open' : ''} ${isMapWide ? 'map-wide' : ''} ${isMapFullscreen ? 'map-fullscreen' : ''}" id="mapPanel">
          <div class="side-panel-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2>рџ—єпёЏ РљР°СЂС‚Р° РјРёСЂР°</h2>
              <span id="mapScaleBadge" class="badge badge-info" style="font-size: 0.65rem;">${escapeHtml(session?.scale_unit || 'РєРёР»РѕРјРµС‚СЂС‹')}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="btn btn-ghost btn-icon" id="toggleMapWideBtn" title="РЁРёСЂРѕРєРёР№ СЂРµР¶РёРј / РѕР±С‹С‡РЅС‹Р№" aria-label="РЁРёСЂРµ" style="font-size: 0.85rem;">
                ${isMapWide ? 'в—Ђв–¶' : 'в–¶в—Ђ'}
              </button>
              <button class="btn btn-ghost btn-icon" id="toggleMapFullscreenBtn" title="Р’Рѕ РІРµСЃСЊ СЌРєСЂР°РЅ" aria-label="Р’Рѕ РІРµСЃСЊ СЌРєСЂР°РЅ" style="font-size: 0.85rem;">
                ${isMapFullscreen ? 'рџ——' : 'в›¶'}
              </button>
              <button class="btn btn-ghost btn-icon" id="closeMapBtn" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
            </div>
          </div>
          <div class="side-panel-content map-panel-content" id="mapContent">
            <!-- Toolbar -->
            <div class="map-toolbar">
              <div class="map-status-info">
                <span>рџ“Ќ <strong>(${currentPlayer?.pos_x ?? 0}, ${currentPlayer?.pos_y ?? 0})</strong></span>
                <span id="mapZoomLevelText" style="color: var(--accent-gold); font-weight: 600;">100%</span>
              </div>
              <div class="map-controls-group">
                <button class="btn btn-ghost btn-xs" id="mapRecenterBtn" title="РћС‚С†РµРЅС‚СЂРѕРІР°С‚СЊ РЅР° РјРѕС‘Рј РіРµСЂРѕРµ">рџЋЇ РЇ</button>
                <button class="btn btn-ghost btn-xs" id="mapFitWorldBtn" title="РџРѕРєР°Р·Р°С‚СЊ РІРµСЃСЊ РјРёСЂ">рџЊђ РњРёСЂ</button>
                <button class="btn btn-ghost btn-xs" id="mapZoomInBtn" title="РџСЂРёР±Р»РёР·РёС‚СЊ">вћ•</button>
                <button class="btn btn-ghost btn-xs" id="mapZoomOutBtn" title="РћС‚РґР°Р»РёС‚СЊ">вћ–</button>
                <button class="btn btn-ghost btn-xs" id="mapToggleLabelsBtn" title="РџРѕРєР°Р·Р°С‚СЊ/СЃРєСЂС‹С‚СЊ РЅР°Р·РІР°РЅРёСЏ">${showMapLabels ? 'рџЏ·пёЏ Р’РєР»' : 'рџЏ·пёЏ Р’С‹РєР»'}</button>
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
              <span>рџ–±пёЏ РЎРєСЂРѕР»Р» / рџ¤Џ Р©РёРїРѕРє: Р—СѓРј вЂў вњ‹ РЎРІР°Р№Рї: РЎРґРІРёРі</span>
              <span>рџџў Р’С‹ вЂў рџ”µ РќР°РїР°СЂРЅРёРєРё вЂў рџЏ° Р“РѕСЂРѕРґР°</span>
            </div>
          </div>
        </div>

        <!-- Settings Panel -->
        <div class="side-panel ${activePanel === 'settings' ? 'open' : ''}" id="settingsPanel">
          <div class="side-panel-header">
            <h2>вљ™пёЏ РЎРµСЃСЃРёСЏ</h2>
            <button class="btn btn-ghost btn-icon" id="closeSettingsBtn">вњ•</button>
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
            <button class="btn btn-xs btn-primary allocate-stat-btn" data-stat="${stat}" style="margin-top: 4px; padding: 1px 8px; font-size: 11px; width: 100%;" title="РџРѕРІС‹СЃРёС‚СЊ ${stat} РЅР° +1 (Р‘Р•Р— Р»РёРјРёС‚Р° РІ 20)">+1</button>
          ` : ''}
        </div>
      `;
    }).join('');

    const derived = calculateDerivedStats(stats, player.race || 'Р§РµР»РѕРІРµРє', player.inventory || [], player.race_ac_bonus);
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
        <h4 class="profile-section-title">вљ пёЏ РўСЂР°РІРјС‹</h4>
        ${activeInjuries.map(injury => `
          <div class="profile-injuries" style="margin-bottom: 0.5rem;">
            <div style="font-weight: 600;">${escapeHtml(injury.injury_type)}</div>
            <div style="font-size: var(--fs-sm); margin-top: 0.25rem;">${escapeHtml(injury.description || '')}</div>
            ${injury.stat_penalties && Object.keys(injury.stat_penalties).length > 0 ? `
              <div style="font-size: var(--fs-xs); margin-top: 0.25rem; color: var(--text-muted);">
                РЁС‚СЂР°С„С‹: ${Object.entries(injury.stat_penalties).map(([k, v]) => `${k} ${Number(v) >= 0 ? '+' : ''}${Number(v)}`).join(', ')}
              </div>
            ` : ''}
            ${injury.duration_hours ? `<div style="font-size: var(--fs-xs); color: var(--text-muted);">Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ: ${injury.duration_hours}С‡</div>` : ''}
            ${injury.is_permanent ? '<div style="font-size: var(--fs-xs); font-weight: 600;">РџРѕСЃС‚РѕСЏРЅРЅР°СЏ</div>' : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="profile-card">
        <!-- РљРѕРјРїР°РєС‚РЅС‹Р№ Р·Р°РіРѕР»РѕРІРѕРє: СЃР»РµРІР° РёРјСЏ, СѓСЂРѕРІРµРЅСЊ, РјРµС‚Р°, РѕРїС‹С‚; СЃРїСЂР°РІР° Р°РІР°С‚Р°СЂРєР° -->
        <div class="profile-header-compact">
          <div class="profile-header-info">
            <div class="profile-name-row">
              <h3 class="profile-name">${escapeHtml(player?.name || 'Р“РµСЂРѕР№')}</h3>
              <span class="profile-lvl-badge">рџЋ–пёЏ РЈСЂ. ${currentLvl}</span>
            </div>
            <div class="profile-sub-row">
              <span class="profile-meta-tag">${escapeHtml(player?.race || 'Р§РµР»РѕРІРµРє')}</span>
              <span class="profile-meta-separator">вЂў</span>
              <span class="profile-meta-tag">${escapeHtml(player?.class || 'Р’РѕРёРЅ')}</span>
              <span class="profile-meta-separator">вЂў</span>
              <span class="profile-money-chip">рџ’° ${player.money || 0} Р·.</span>
            </div>
            <!-- РљРѕРјРїР°РєС‚РЅР°СЏ РїРѕР»РѕСЃР° РѕРїС‹С‚Р° -->
            <div class="profile-xp-block">
              <div class="profile-xp-labels">
                <span>РћРїС‹С‚</span>
                <span>${currentXp} / ${xpNeeded} XP</span>
              </div>
              <div class="profile-bar-track xp-track">
                <div class="profile-bar-fill xp-fill" style="width: ${xpPct}%;"></div>
              </div>
            </div>
          </div>
          <div class="profile-avatar">вљ”пёЏ</div>
        </div>

        <!-- HP & MP (РЅР° РІСЃСЋ С€РёСЂРёРЅСѓ, РґРѕС…РѕРґСЏС‚ РґРѕ РїСЂР°РІРѕРіРѕ РєСЂР°СЏ) -->
        <div class="profile-vitals-group">
          <!-- HP Bar -->
          <div class="vital-bar-item">
            <div class="vital-bar-labels">
              <span class="vital-label-hp">вќ¤пёЏ Р—РґРѕСЂРѕРІСЊРµ (HP)</span>
              <span class="vital-val">${player.hp} / ${player.max_hp}</span>
            </div>
            <div class="profile-bar-track hp-track">
              <div class="hp-bar ${hpClass}" style="width: ${hpPct}%;"></div>
            </div>
          </div>

          <!-- MP Bar -->
          <div class="vital-bar-item">
            <div class="vital-bar-labels">
              <span class="vital-label-mp">рџ’™ РњР°РЅР° (MP)</span>
              <span class="vital-val">${player.mp ?? 50} / ${player.max_mp ?? 50}</span>
            </div>
            <div class="profile-bar-track mp-track">
              <div class="profile-bar-fill mp-fill" style="width: ${mpPct}%;"></div>
            </div>
          </div>
        </div>

        <!-- Р‘РѕРµРІС‹Рµ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё (AC Рё РРЅРёС†РёР°С‚РёРІР° РєРѕРјРїР°РєС‚РЅРѕ РІ РѕРґРЅСѓ СЃС‚СЂРѕРєСѓ) -->
        <div class="profile-combat-row">
          <div class="combat-stat-pill">
            <span class="combat-stat-icon">рџ›ЎпёЏ</span>
            <span class="combat-stat-label">РљР»Р°СЃСЃ Р±СЂРѕРЅРё (AC)</span>
            <span class="combat-stat-value">${armorClass}</span>
          </div>
          <div class="combat-stat-pill">
            <span class="combat-stat-icon">вљЎ</span>
            <span class="combat-stat-label">РРЅРёС†РёР°С‚РёРІР°</span>
            <span class="combat-stat-value">${initiative >= 0 ? '+' : ''}${initiative}</span>
          </div>
        </div>

        ${freeStatPoints > 0 ? `
          <div class="profile-free-points-banner">
            <span>в­ђ РЎРІРѕР±РѕРґРЅС‹С… РѕС‡РєРѕРІ (РћРҐ): <strong>${freeStatPoints}</strong></span>
            <span style="font-size: 10px; opacity: 0.85;">(РЅР°Р¶РјРёС‚Рµ +1 Сѓ РЅСѓР¶РЅРѕРіРѕ РїР°СЂР°РјРµС‚СЂР°)</span>
          </div>
        ` : ''}

        <!-- РҐР°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё -->
        <div class="profile-section">
          <h4 class="profile-section-title">РҐР°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё</h4>
          <div class="stats-grid-3">
            ${statsHtml}
          </div>
        </div>

        <!-- РЎРїР°СЃР±СЂРѕСЃРєРё -->
        <div class="profile-section">
          <h4 class="profile-section-title">РЎРїР°СЃР±СЂРѕСЃРєРё</h4>
          <div class="stats-grid-3">
            ${savingThrowsHtml}
          </div>
        </div>

        <!-- РќР°РІС‹РєРё -->
        <div class="profile-section">
          <h4 class="profile-section-title">рџ—ЎпёЏ РќР°РІС‹РєРё (1..100)</h4>
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
                      <span class="badge badge-primary" style="font-size: 10px; font-weight: 700; padding: 1px 5px;">РЈСЂ. ${sLvl}</span>
                    </div>
                    <div class="profile-bar-track" style="height: 4px; margin-bottom: 2px;">
                      <div class="profile-bar-fill" style="width: ${sPct}%; background: #3b82f6; height: 100%; border-radius: var(--radius-full);"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
                      <span>${sXp} / ${sNext} XP</span>
                      <span>+${sLvl}% Рє СЌС„С„.</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <p style="font-size: 11px; color: var(--text-muted); line-height: 1.35; margin: 0;">
              РќР°РІС‹РєРё СЂР°СЃС‚СѓС‚ РѕС‚ РІР°С€РёС… РґРµР№СЃС‚РІРёР№ РІ РјРёСЂРµ (РєСЂР°С„С‚, СЃР±РѕСЂ С‚СЂР°РІ, Р±РѕР№, СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ).
            </p>
          `}
        </div>

        ${injuriesHtml}

        ${player.appearance ? `
          <div class="profile-section">
            <h4 class="profile-section-title">Р’РЅРµС€РЅРѕСЃС‚СЊ</h4>
            <p class="profile-bio">${escapeHtml(player.appearance)}</p>
          </div>
        ` : ''}

        ${player.bio ? `
          <div class="profile-section">
            <h4 class="profile-section-title">Р‘РёРѕРіСЂР°С„РёСЏ</h4>
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
          <span>рџ’° ${player.money || 0} Р·РѕР»РѕС‚Р°</span>
          <span>рџ“¦ ${totalWeight} РїСЂРµРґРјРµС‚РѕРІ</span>
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
              <p class="text-muted">РРЅРІРµРЅС‚Р°СЂСЊ РїСѓСЃС‚</p>
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
              ${escapeHtml(p?.name || 'Р“РµСЂРѕР№')}${isCurrent ? ' (Р’С‹)' : ''}
            </span>
            <span class="text-muted" style="font-size: var(--fs-xs);">${escapeHtml(p?.race || '')}/${escapeHtml(p?.class || '')}</span>
            ${isInParty ? `<span class="badge" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35);">рџ¤ќ Р’ РѕС‚СЂСЏРґРµ</span>` : ''}
            ${p?.current_zone ? `<span style="font-size: 10px; color: var(--text-muted); opacity: 0.85;">[${escapeHtml(p.current_zone)}]</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
            <span style="font-size: var(--fs-xs); color: var(--accent-gold);">вќ¤пёЏ ${p?.hp || 0}/${p?.max_hp || 0}</span>
            ${isCreator && !isCurrent ? `
              <button class="btn btn-danger btn-xs remove-participant-btn" data-player-id="${p.id}" data-player-name="${escapeHtml(p?.name || 'РРіСЂРѕРє')}" style="padding: 1px 6px; font-size: 10px; line-height: 1.2;" title="РЈРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° РёР· СЃРµСЃСЃРёРё">вќЊ</button>
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
          <label class="form-label">РњСѓР»СЊС‚РёРїР»РµРµСЂ Рё РїСЂРёРіР»Р°С€РµРЅРёСЏ</label>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary btn-sm" id="copyInviteBtnGame" style="width: 100%;">
              рџ”— РЎРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ РґР»СЏ РЅР°РїР°СЂРЅРёРєР°
            </button>
            <button class="btn btn-ghost btn-sm" id="copyIdBtnGame" style="width: 100%; border: 1px solid var(--border-color);">
              рџ“‹ РЎРєРѕРїРёСЂРѕРІР°С‚СЊ ID СЃРµСЃСЃРёРё
            </button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">РњРёСЂ</label>
          <p>${session.worlds?.name || 'РќРµ Р·Р°РґР°РЅ'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">РЎР»РѕР¶РЅРѕСЃС‚СЊ</label>
          <p>${session.difficulty === 'easy' ? 'Р›РµРіРєРѕ' : session.difficulty === 'hard' ? 'РҐР°СЂРґРєРѕСЂ' : 'РќРѕСЂРјР°Р»СЊРЅРѕ'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">PvP</label>
          <p>${session.is_pvp_enabled ? 'вљ”пёЏ Р’РєР»СЋС‡РµРЅРѕ' : 'рџ›ЎпёЏ Р’С‹РєР»СЋС‡РµРЅРѕ'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Р РµР¶РёРј</label>
          <p>${session.current_plot_stage ? `рџ“– РЎСЋР¶РµС‚ (${session.current_plot_stage})` : 'рџЋ­ РџРµСЃРѕС‡РЅРёС†Р°'}</p>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">РћРїР»Р°С‚Р° Рё РјРѕРґРµР»Рё РР</label>
          <p style="font-size: var(--fs-xs); color: var(--accent-gold);">
            ${session.ai_key_mode === 'individual' 
              ? 'рџ‘¤ РЈ РєР°Р¶РґРѕРіРѕ РёРіСЂРѕРєР° СЃРІРѕР№ РєР»СЋС‡' 
              : 'рџ‘‘ РћР±С‰РёР№ РєР»СЋС‡ Рё РјРѕРґРµР»Рё РҐРѕСЃС‚Р°'}
          </p>
        </div>
        <div class="form-group">
          <label class="form-label" id="participantsCount">РЈС‡Р°СЃС‚РЅРёРєРё (${allPlayers.length})</label>
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
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">рџ‘Ґ</div>
          <p class="text-muted">Р’ СЌС‚РѕР№ Р»РѕРєР°С†РёРё РЅРµС‚ РёР·РІРµСЃС‚РЅС‹С… NPC</p>
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
            <div class="npc-rel-meta">${escapeHtml(npc.race || 'Р“СѓРјР°РЅРѕРёРґ')} В· ${escapeHtml(npc.role || 'Р–РёС‚РµР»СЊ')}</div>
          </div>
          <span class="npc-tier-badge" style="background: ${tierColor}20; color: ${tierColor}; border: 1px solid ${tierColor}50;">
            ${escapeHtml(tierLabel)}
          </span>
        </div>

        <!-- РЁРєР°Р»Р° РѕС‚РЅРѕС€РµРЅРёР№ (-100..+100) -->
        <div class="rel-bar-wrapper">
          <div class="rel-bar-labels">
            <span>Р’СЂР°Рі (-100)</span>
            <span style="font-weight: 700; color: ${tierColor};">${score > 0 ? `+${score}` : score} / 100</span>
            <span>РџСЂРµРґР°РЅ (+100)</span>
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
            ${npc.current_activity ? `<div style="color: #c084fc; margin-bottom: 2px;">рџ“Ќ <strong>Р—Р°РЅСЏС‚:</strong> ${escapeHtml(npc.current_activity)}</div>` : ''}
            <div style="color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap;">
              ${npc.current_mood ? `<span>РќР°СЃС‚СЂРѕРµРЅРёРµ: <strong style="color: var(--text-secondary);">${escapeHtml(npc.current_mood)}</strong></span>` : ''}
              ${npc.temperament ? `<span>РўРµРјРїРµСЂР°РјРµРЅС‚: <strong style="color: var(--text-secondary);">${escapeHtml(npc.temperament)}</strong></span>` : ''}
            </div>
          </div>
        ` : ''}

        <!-- РђРєРєРѕСЂРґРµРѕРЅ РІРѕСЃРїРѕРјРёРЅР°РЅРёР№ -->
        <div class="npc-memories-wrapper" style="margin-top: 4px;">
          <button class="npc-memories-toggle" data-toggle-memories="${npc.id}">
            <span>рџ’­ Р’РѕСЃРїРѕРјРёРЅР°РЅРёСЏ NPC (${memories.length})</span>
            <span>${isExpanded ? 'в–І' : 'в–ј'}</span>
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
      return '<div style="color: var(--text-muted); text-align: center;">Р—Р°РіСЂСѓР·РєР° РІРѕСЃРїРѕРјРёРЅР°РЅРёР№...</div>';
    }
    if (!list || list.length === 0) {
      return '<div style="color: var(--text-muted); font-style: italic;">РџРѕРєР° РЅРµС‚ РІРѕСЃРїРѕРјРёРЅР°РЅРёР№ РѕР± РѕР±С‰РµРЅРёРё СЃ СЌС‚РёРј РіРµСЂРѕРµРј.</div>';
    }

    return list.map((m) => {
      const typeClass = m.memory_type || (m.vividness >= 8 ? 'vivid' : m.vividness <= 3 ? 'impression' : 'regular');
      const icon = typeClass === 'vivid' ? 'рџЊџ' : typeClass === 'belief' ? 'рџ”®' : typeClass === 'impression' ? 'рџ’­' : 'рџ“њ';
      const typeLabel = typeClass === 'vivid' ? 'РЇСЂРєРѕРµ' : typeClass === 'belief' ? 'РЈР±РµР¶РґРµРЅРёРµ' : typeClass === 'impression' ? 'Р’РїРµС‡Р°С‚Р»РµРЅРёРµ' : 'РћР±С‹С‡РЅРѕРµ';
      return `
        <div class="memory-item ${typeClass}">
          <div class="memory-item-header">
            <span>${icon} ${typeLabel}${m.vividness ? ` В· РЇСЂРєРѕСЃС‚СЊ ${m.vividness}/10` : ''}</span>
            ${m.emotional_tone ? `<span>[${escapeHtml(m.emotional_tone)}]</span>` : ''}
          </div>
          <div class="memory-item-text">В«${escapeHtml(m.memory_text || m.content || '')}В»</div>
          ${m.significance_reason ? `<div style="font-size: 0.68rem; color: var(--text-muted);">РџСЂРёС‡РёРЅР°: ${escapeHtml(m.significance_reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async function refreshNpcPanel() {
    if (!currentPlayer || !sessionId) return;
    const content = document.getElementById('npcContent');
    if (content && (!cachedNpcData || cachedNpcData.length === 0)) {
      content.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Р—Р°РіСЂСѓР·РєР° РїРµСЂСЃРѕРЅР°Р¶РµР№...</div>';
    }
    try {
      cachedNpcData = await getNpcRelationships(sessionId, currentPlayer.id);
      if (content) {
        content.innerHTML = renderNpcList(cachedNpcData);
        bindNpcCardEvents();
      }
    } catch (err) {
      console.warn('Failed to load NPC relationships:', err);
      if (content) content.innerHTML = '<div style="padding: 1rem; color: var(--accent-danger);">РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё NPC</div>';
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
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">рџ—єпёЏ</div>
          <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: #fff;">Р РµР¶РёРј СЃРІРѕР±РѕРґРЅРѕР№ РїРµСЃРѕС‡РЅРёС†С‹</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4; margin-bottom: 1.25rem;">
            РЈ СЌС‚РѕР№ СЃРµСЃСЃРёРё СЃРµР№С‡Р°СЃ РЅРµС‚ СЃСЋР¶РµС‚РЅС‹С… РѕСЂРёРµРЅС‚РёСЂРѕРІ. Р’С‹ РјРѕР¶РµС‚Рµ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃСЋР¶РµС‚РЅСѓСЋ РєР°РјРїР°РЅРёСЋ РЅР° РѕСЃРЅРѕРІРµ РіРµРѕРіСЂР°С„РёРё, Р»РѕСЂР° Рё NPC СЌС‚РѕРіРѕ РјРёСЂР° (В«Р»С‹Р¶Рё, РЅРѕ РЅРµ РїСЂР°РІРёР»РѕВ»).
          </p>
          <div style="text-align: left; margin-bottom: 1rem;">
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">РџРѕР¶РµР»Р°РЅРёСЏ Рє СЃСЋР¶РµС‚Сѓ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ):</label>
            <textarea id="storyWishesInput" class="input" style="width: 100%; min-height: 70px; resize: vertical; font-size: 0.85rem; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3); color: #fff;" placeholder="РќР°РїСЂРёРјРµСЂ: С‚С‘РјРЅС‹Р№ РєСѓР»СЊС‚, РґСЂРµРІРЅРёРµ СЂСѓРёРЅС‹, РєРёР±РµСЂ-РёРјРїР»Р°РЅС‚С‹, РґРµС‚РµРєС‚РёРІ РІ Р РёРІРµСЂРІСѓРґРµ..."></textarea>
          </div>
          <button class="btn btn-primary" id="generateStoryBtn" style="width: 100%;">
            вњЁ РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃСЋР¶РµС‚ РїРѕ РјРёСЂСѓ
          </button>
        </div>
      `;
    }

    const currentArcIdx = Number(story.current_arc_index) || 0;
    const currentArc = story.arcs[currentArcIdx] || story.arcs[0];
    const completedGoals = currentArc.completed_goals || [];

    return `
      <div class="story-panel-container" style="display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0;">
        <!-- Р—Р°РіРѕР»РѕРІРѕРє Рё СЃС‚Р°С‚СѓСЃ -->
        <div class="card" style="padding: 1rem; border-left: 3px solid #6366f1; background: rgba(30, 30, 46, 0.9); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">РЎСЋР¶РµС‚РЅР°СЏ РєР°РјРїР°РЅРёСЏ</div>
              <h3 style="font-size: 1.15rem; margin: 4px 0 6px 0; font-weight: 700; color: #fff;">${escapeHtml(story.title || 'Р‘РµР·С‹РјСЏРЅРЅР°СЏ РєР°РјРїР°РЅРёСЏ')}</h3>
            </div>
            <span class="badge ${story.status === 'completed' ? 'badge-success' : 'badge-primary'}" style="font-size: 0.7rem;">
              ${story.status === 'completed' ? 'Р—Р°РІРµСЂС€РµРЅРѕ' : 'РђРєС‚РёРІРµРЅ'}
            </span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-top: 6px;">
            ${escapeHtml(story.summary || '')}
          </p>
        </div>

        <!-- РџСЂРѕР»РѕРі / РџРѕСЏРІР»РµРЅРёРµ РІ РјРёСЂРµ -->
        ${story.prologue ? `
          <details class="story-prologue-details" style="border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2);">
            <summary style="cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); outline: none;">
              рџЋ­ РџРѕСЏРІР»РµРЅРёРµ РІ РјРёСЂРµ (РџСЂРѕР»РѕРі)
            </summary>
            <div style="margin-top: 0.5rem; font-size: 0.82rem; line-height: 1.5; color: rgba(255,255,255,0.85); white-space: pre-line; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem;">
              ${escapeHtml(story.prologue)}
            </div>
          </details>
        ` : ''}

        <!-- РђРєС‚РёРІРЅР°СЏ Р°СЂРєР° (РўРµРєСѓС‰Р°СЏ) -->
        <div class="card" style="padding: 1rem; border: 1px solid rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.05); border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #818cf8; text-transform: uppercase;">
              РўРµРєСѓС‰Р°СЏ Р°СЂРєР° (РђРєС‚ ${currentArc.act || (currentArcIdx + 1)})
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">
              Р¦РµР»Рё: ${completedGoals.length} / ${(currentArc.goals || []).length}
            </span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0 0 8px 0; color: #fff;">
            ${escapeHtml(currentArc.title || `РђРєС‚ ${currentArcIdx + 1}`)}
          </h4>
          <p style="font-size: 0.85rem; line-height: 1.4; color: rgba(255,255,255,0.8); margin-bottom: 12px;">
            ${escapeHtml(currentArc.description || '')}
          </p>

          <!-- Р¦РµР»Рё Р°СЂРєРё (С‡РµРєР»РёСЃС‚ СЃ РєР»РёРєРѕРј РґР»СЏ РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ) -->
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">РћСЂРёРµРЅС‚РёСЂС‹ Рё С†РµР»Рё (РЅР°Р¶РјРёС‚Рµ РґР»СЏ РѕС‚РјРµС‚РєРё):</div>
            ${(currentArc.goals || []).map((goal) => {
              const isDone = completedGoals.includes(goal);
              return `
                <div class="story-goal-item" data-arc-index="${currentArcIdx}" data-goal-title="${escapeHtml(goal)}" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border-radius: 6px; background: ${isDone ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.04)'}; border: 1px solid ${isDone ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.06)'}; cursor: pointer; transition: all 0.2s ease;">
                  <span style="font-size: 1rem; line-height: 1.2;">${isDone ? 'вњ…' : 'в¬њ'}</span>
                  <span style="font-size: 0.82rem; line-height: 1.35; ${isDone ? 'text-decoration: line-through; color: var(--text-muted);' : 'color: #fff;'}">
                    ${escapeHtml(goal)}
                  </span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- РљР»СЋС‡РµРІС‹Рµ NPC Рё Р»РѕРєР°С†РёРё -->
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${(currentArc.key_npcs || []).map((npc) => `
              <span class="badge" style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3);">рџ‘¤ ${escapeHtml(npc)}</span>
            `).join('')}
            ${(currentArc.key_locations || []).map((loc) => `
              <span class="badge" style="font-size: 0.7rem; background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.3);">рџ“Ќ ${escapeHtml(loc)}</span>
            `).join('')}
          </div>
        </div>

        <!-- Р’СЃРµ Р°СЂРєРё РєР°РјРїР°РЅРёРё (Р°РєРєРѕСЂРґРµРѕРЅ) -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Р’СЃРµ Р°РєС‚С‹ РєР°РјРїР°РЅРёРё:</div>
          ${(story.arcs || []).map((arc, aIdx) => {
            const isCurrent = aIdx === currentArcIdx;
            const isPast = aIdx < currentArcIdx;
            const arcDoneGoals = arc.completed_goals || [];
            return `
              <details style="border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 6px 10px; background: rgba(0,0,0,0.15);" ${isCurrent ? 'open' : ''}>
                <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; outline: none; display: flex; justify-content: space-between; align-items: center;">
                  <span style="${isCurrent ? 'color: #818cf8;' : isPast ? 'color: #4ade80;' : 'color: var(--text-muted);'}">
                    ${isPast ? 'вњ“ ' : isCurrent ? 'в–¶ ' : 'рџ”’ '} РђРєС‚ ${arc.act || (aIdx + 1)}: ${escapeHtml(arc.title)}
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

        <!-- РџРѕРґСЃРєР°Р·РєР°: Р›С‹Р¶Рё, РЅРѕ РЅРµ РїСЂР°РІРёР»Рѕ -->
        <div style="padding: 8px 10px; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: 8px; font-size: 0.75rem; color: #fde047; line-height: 1.35;">
          рџ’Ў <strong>В«Р›С‹Р¶Рё, РЅРѕ РЅРµ РїСЂР°РІРёР»РѕВ»:</strong> РѕСЂРёРµРЅС‚РёСЂС‹ РїРѕРјРѕРіР°СЋС‚ РјРёСЂСѓ Р¶РёС‚СЊ РІРѕРєСЂСѓРі РІР°СЃ. Р’С‹ РјРѕР¶РµС‚Рµ РёСЃСЃР»РµРґРѕРІР°С‚СЊ Р»СЋР±С‹Рµ РјРµСЃС‚Р°, РєСЂР°С„С‚РёС‚СЊ, СЃРѕР±РёСЂР°С‚СЊ СЂРµСЃСѓСЂСЃС‹ РёР»Рё РїСЂРѕСЃС‚Рѕ РѕС‚РґС‹С…Р°С‚СЊ. РР Р°РґР°РїС‚РёСЂСѓРµС‚СЃСЏ Рє РІР°С€РµРјСѓ РІС‹Р±РѕСЂСѓ!
        </div>

        <!-- РџР°РЅРµР»СЊ РґРµР№СЃС‚РІРёР№ -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 0.5rem;">
          <button class="btn btn-secondary" id="rewriteStoryBtn" style="width: 100%; font-size: 0.85rem;">
            рџ”„ РџРµСЂРµРїРёСЃР°С‚СЊ СЃСЋР¶РµС‚ СЃ РР
          </button>
          <div id="rewriteStoryPromptContainer" style="display: none; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2);">
            <textarea id="rewriteStoryWishes" class="input" style="width: 100%; min-height: 60px; font-size: 0.82rem; padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3); color: #fff;" placeholder="РџРѕР¶РµР»Р°РЅРёСЏ Рє РЅРѕРІРѕРјСѓ СЃСЋР¶РµС‚Сѓ (РЅР°РїСЂРёРјРµСЂ: РґРѕР±Р°РІРёС‚СЊ РєРёР±РµСЂРїР°РЅРє, РґСЂРµРІРЅРёР№ РѕСЂРґРµРЅ, СЂР°СЃСЃР»РµРґРѕРІР°РЅРёРµ)..."></textarea>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" id="confirmRewriteStoryBtn" style="flex: 1; font-size: 0.8rem;">РџРµСЂРµРїРёСЃР°С‚СЊ</button>
              <button class="btn btn-ghost" id="cancelRewriteStoryBtn" style="font-size: 0.8rem;">РћС‚РјРµРЅР°</button>
            </div>
          </div>

          <button class="btn btn-ghost" id="editStoryJsonBtn" style="width: 100%; font-size: 0.85rem; color: var(--text-muted);">
            вњЏпёЏ Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РІСЂСѓС‡РЅСѓСЋ (JSON)
          </button>
          <div id="editStoryJsonContainer" style="display: none; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2);">
            <textarea id="editStoryJsonArea" class="input" style="width: 100%; min-height: 180px; font-family: monospace; font-size: 0.75rem; padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.4); color: #fff;"></textarea>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" id="saveStoryJsonBtn" style="flex: 1; font-size: 0.8rem;">РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ</button>
              <button class="btn btn-ghost" id="cancelEditStoryJsonBtn" style="font-size: 0.8rem;">РћС‚РјРµРЅР°</button>
            </div>
          </div>

          <button class="btn btn-ghost" id="deleteStoryBtn" style="width: 100%; font-size: 0.85rem; color: #f87171;">
            рџ—‘пёЏ РЈРґР°Р»РёС‚СЊ СЃСЋР¶РµС‚ (РІ РїРµСЃРѕС‡РЅРёС†Сѓ)
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
          btn.textContent = 'вЏі Р“РµРЅРµСЂР°С†РёСЏ СЃСЋР¶РµС‚Р°...';
        }
        toast.info('РР СЃРѕР·РґР°С‘С‚ СЃСЋР¶РµС‚РЅСѓСЋ РєР°РјРїР°РЅРёСЋ РїРѕ РјРёСЂСѓ...');
        const newStory = await generateStorylineForSession({
          sessionId,
          worldId: session?.world_id,
          customWishes: wishes,
        });
        session.storyline = newStory;
        toast.success('РЎСЋР¶РµС‚РЅР°СЏ Р»РёРЅРёСЏ СѓСЃРїРµС€РЅРѕ СЃРѕР·РґР°РЅР°!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё СЃСЋР¶РµС‚Р°: ' + (err.message || err));
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'вњЁ РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃСЋР¶РµС‚ РїРѕ РјРёСЂСѓ';
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
          confirmBtn.textContent = 'вЏі РџРµСЂРµРїРёСЃС‹РІР°СЋ...';
        }
        toast.info('РР РїРµСЂРµРїРёСЃС‹РІР°РµС‚ СЃСЋР¶РµС‚...');
        const updated = await rewriteStoryline({
          sessionId,
          worldId: session?.world_id,
          customWishes: wishes,
          currentStoryline: session?.storyline,
        });
        session.storyline = updated;
        toast.success('РЎСЋР¶РµС‚ РѕР±РЅРѕРІР»РµРЅ!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ СЃСЋР¶РµС‚Р°: ' + (err.message || err));
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'РџРµСЂРµРїРёСЃР°С‚СЊ';
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
        toast.success('РЎСЋР¶РµС‚ СЃРѕС…СЂР°РЅС‘РЅ!');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ JSON: ' + (err.message || err));
      }
    });

    // Delete Story (Sandbox)
    document.getElementById('deleteStoryBtn')?.addEventListener('click', async () => {
      if (!confirm('РџРµСЂРµР№С‚Рё РІ СЂРµР¶РёРј СЃРІРѕР±РѕРґРЅРѕР№ РїРµСЃРѕС‡РЅРёС†С‹ Рё СѓРґР°Р»РёС‚СЊ С‚РµРєСѓС‰РёР№ СЃСЋР¶РµС‚?')) return;
      try {
        await deleteStoryline(sessionId);
        session.storyline = null;
        toast.info('РЎСЋР¶РµС‚ СѓРґР°Р»С‘РЅ. РђРєС‚РёРІРµРЅ СЂРµР¶РёРј СЃРІРѕР±РѕРґРЅРѕР№ РїРµСЃРѕС‡РЅРёС†С‹.');
        await refreshStoryPanel();
      } catch (err) {
        toast.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ: ' + (err.message || err));
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
          toast.error('РћС€РёР±РєР° РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ С†РµР»Рё: ' + (err.message || err));
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
        toast.info('РџСЂРµСЂС‹РІР°РЅРёРµ РґРµСЏС‚РµР»СЊРЅРѕСЃС‚Рё...');
        const { data, error } = await supabase.rpc('interrupt_busy_activity', {
          p_player_id: currentPlayer.id,
        });
        if (error) {
          toast.error('РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРµСЂРІР°С‚СЊ: ' + error.message);
          return;
        }
        toast.success(`Р”РµСЏС‚РµР»СЊРЅРѕСЃС‚СЊ "${data.interrupted_activity || 'Р—Р°РЅСЏС‚РёРµ'}" РїСЂРµСЂРІР°РЅР°. РџСЂРѕС€Р»Рѕ РІСЂРµРјРµРЅРё: ${data.time_spent_minutes || 0} РјРёРЅ.`);
        currentPlayer.is_busy = false;
        currentPlayer.busy_activity = null;
        currentPlayer.busy_remaining_minutes = 0;
        const banner = document.getElementById('busyStateBanner');
        if (banner) banner.style.display = 'none';
        updateInputState();
      } catch (err) {
        toast.error('РћС€РёР±РєР°: ' + err.message);
      }
    });

    // Multi-player: take turn button
    document.getElementById('takeTurnBtn')?.addEventListener('click', async () => {
      try {
        toast.info('РџРµСЂРµРєР»СЋС‡РµРЅРёРµ С…РѕРґР°...');
        await passTurn(sessionId, currentPlayer.id);
        isMyTurn = true;
        activePlayerName = currentPlayer.name || 'Р“РµСЂРѕР№';
        updateInputState();
      } catch (err) {
        toast.error('РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРєР»СЋС‡РёС‚СЊ С…РѕРґ: ' + err.message);
      }
    });

    // Multi-player: copy invite link & ID
    document.getElementById('copyInviteBtnGame')?.addEventListener('click', () => {
      const base = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      const url = `${window.location.origin}${base}#/session/${sessionId}`;
      navigator.clipboard.writeText(url);
      toast.success('РРЅРІР°Р№С‚-СЃСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°!');
    });

    document.getElementById('copyIdBtnGame')?.addEventListener('click', () => {
      navigator.clipboard.writeText(sessionId);
      toast.success('ID СЃРµСЃСЃРёРё СЃРєРѕРїРёСЂРѕРІР°РЅ!');
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
        toast.success('РџРµСЂСЃРѕРЅР°Р¶ СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°РЅ!');
      } catch (err) {
        toast.error('РћС€РёР±РєР° СЌРєСЃРїРѕСЂС‚Р°: ' + err.message);
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
        const playerName = btn.dataset.playerName || 'РРіСЂРѕРє';
        if (!playerId) return;

        if (!window.confirm(`РЈРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° В«${playerName}В» РёР· СЌС‚РѕР№ СЃРµСЃСЃРёРё?`)) return;

        try {
          btn.disabled = true;
          await removeSessionPlayer(sessionId, playerId);
          toast.success(`РЈС‡Р°СЃС‚РЅРёРє В«${playerName}В» СѓРґР°Р»РµРЅ РёР· СЃРµСЃСЃРёРё`);
          allPlayers = allPlayers.filter((p) => p.id !== playerId);
          const countEl = document.getElementById('participantsCount');
          if (countEl) countEl.textContent = `РЈС‡Р°СЃС‚РЅРёРєРё (${allPlayers.length})`;
          const listEl = document.getElementById('sessionPlayersList');
          if (listEl) listEl.innerHTML = renderSessionParticipants(allPlayers);
          bindParticipantEvents();
          await checkTurnQueue();
        } catch (err) {
          toast.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ СѓС‡Р°СЃС‚РЅРёРєР°: ' + (err.message || err));
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
          toast.info(`Р’РєР»Р°РґС‹РІР°РµРј 1 РѕС‡РєРѕ РІ ${statName}...`);
          const res = await allocateStatPoints(currentPlayer.id, statName, 1);
          if (res?.success) {
            toast.success(`${statName} РїРѕРІС‹С€РµРЅР° РґРѕ ${res.new_value}!`);
            await refreshProfile();
          } else {
            toast.error(res?.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїСЂРµРґРµР»РёС‚СЊ РѕС‡РєРё');
          }
        } catch (err) {
          toast.error('РћС€РёР±РєР°: ' + err.message);
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
  // РРќРўР•Р РђРљРўРР’РќРђРЇ РљРђР РўРђ РњРР Рђ
  // ============================================
  function getCoordScale() {
    const unit = (session?.scale_unit || 'РєРёР»РѕРјРµС‚СЂС‹').toLowerCase();
    const isKm = unit.startsWith('РєРёР»') || unit.startsWith('km') || unit === 'РєРј';
    return isKm ? 0.35 : 1.5;
  }

  function applyMapTransform() {
    const stage = document.getElementById('mapStage');
    if (stage) {
      stage.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
      
      stage.classList.remove('map-zoom-far', 'map-zoom-mid', 'map-zoom-close');
      if (mapZoom < 0.3) stage.classList.add('map-zoom-far');
      else if (mapZoom < 0.9) stage.classList.add('map-zoom-mid');
      else stage.classList.add('map-zoom-close');
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
    const py = (currentPlayer?.pos_y ?? 0) * scale;

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
    const allY = locations.map(l => (l.pos_y ?? 0) * scale);
    allX.push((currentPlayer?.pos_x ?? 0) * scale);
    allY.push((currentPlayer?.pos_y ?? 0) * scale);

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

    const newZoom = Math.max(0.05, Math.min(5.0, mapZoom * factor));
    mapPanX = Math.round(cx - stageX * newZoom);
    mapPanY = Math.round(cy - stageY * newZoom);
    mapZoom = newZoom;
    applyMapTransform();
  }

function renderMapElements() {
    const gridSvg = document.getElementById('mapGridSvg');
    const locLayer = document.getElementById('mapLocationsLayer');
    const plLayer = document.getElementById('mapPlayersLayer');
    if (!gridSvg || !locLayer || !plLayer) return;

    const scale = getCoordScale();
    const locations = cachedWorldMapData?.locations || [];

    // 1. Calculate dynamic Grid Size (bounding box)
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    if (locations.length > 0) {
      minX = Math.min(...locations.map(l => (l.pos_x ?? 0) * scale));
      maxX = Math.max(...locations.map(l => (l.pos_x ?? 0) * scale));
      minY = Math.min(...locations.map(l => (l.pos_y ?? 0) * scale));
      maxY = Math.max(...locations.map(l => (l.pos_y ?? 0) * scale));
    }
    const currentPx = (currentPlayer?.pos_x ?? 0) * scale;
    const currentPy = (currentPlayer?.pos_y ?? 0) * scale;
    minX = Math.min(minX, currentPx);
    maxX = Math.max(maxX, currentPx);
    minY = Math.min(minY, currentPy);
    maxY = Math.max(maxY, currentPy);

    const padding = 2000 * scale; // Extra padding
    const boundW = Math.max(Math.abs(minX - padding), Math.abs(maxX + padding));
    const boundH = Math.max(Math.abs(minY - padding), Math.abs(maxY + padding));
    const gridSize = Math.max(boundW, boundH, 4000 * scale); // At least 4000

    // Grid lines
    let gridLines = '';
    const step = 500 * scale;
    for (let x = -gridSize; x <= gridSize; x += step) {
      gridLines += `<line x1="${x}" y1="${-gridSize}" x2="${x}" y2="${gridSize}" stroke="rgba(34, 197, 94, 0.08)" stroke-width="1" />`;
    }
    for (let y = -gridSize; y <= gridSize; y += step) {
      gridLines += `<line x1="${-gridSize}" y1="${y}" x2="${gridSize}" y2="${y}" stroke="rgba(34, 197, 94, 0.08)" stroke-width="1" />`;
    }

    // State Colors
    const stateColors = {};
    const getStateColor = (stateId) => {
      if (!stateColors[stateId]) {
        // Generate stable pseudo-random color based on stateId string
        let hash = 0;
        for (let i = 0; i < stateId.length; i++) hash = stateId.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        stateColors[stateId] = `hsla(${hue}, 70%, 50%, 0.15)`;
      }
      return stateColors[stateId];
    };

    // Build SVG boundaries (States and Locations)
    let svgBorders = '';
    
    // Group locations by state
    const stateGroups = {};
    locations.forEach(loc => {
      if (loc.state_id) {
        if (!stateGroups[loc.state_id]) stateGroups[loc.state_id] = { name: loc.state_name, points: [] };
        stateGroups[loc.state_id].points.push({ x: (loc.pos_x ?? 0) * scale, y: (loc.pos_y ?? 0) * scale });
      }

      // Draw Location border if requested
      const lx = (loc.pos_x ?? 0) * scale;
      const ly = (loc.pos_y ?? 0) * scale;
      const r = (loc.bounds_data?.radius || 150) * scale;
      if (loc.bounds_shape === 'circle') {
        svgBorders += `<circle cx="${lx}" cy="${ly}" r="${r}" fill="rgba(59, 130, 246, 0.05)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1" stroke-dasharray="4,4" class="map-svg-loc-border" />`;
      }
      
      // Draw subzones if they exist
      if (loc.subzones) {
        loc.subzones.forEach(sz => {
          const szx = (sz.pos_x ?? 0) * scale;
          const szy = (sz.pos_y ?? 0) * scale;
          const szr = (sz.radius || 20) * scale;
          svgBorders += `<circle cx="${szx}" cy="${szy}" r="${szr}" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.5" stroke-dasharray="2,2" class="map-svg-subzone-border" />`;
        });
      }
    });

    // Draw state borders
    Object.keys(stateGroups).forEach(stId => {
      const g = stateGroups[stId];
      if (g.points.length === 0) return;
      const sMinX = Math.min(...g.points.map(p => p.x));
      const sMaxX = Math.max(...g.points.map(p => p.x));
      const sMinY = Math.min(...g.points.map(p => p.y));
      const sMaxY = Math.max(...g.points.map(p => p.y));
      const cx = (sMinX + sMaxX) / 2;
      const cy = (sMinY + sMaxY) / 2;
      const r = Math.max(Math.sqrt(Math.pow(sMaxX - sMinX, 2) + Math.pow(sMaxY - sMinY, 2)) / 2 + (200 * scale), 300 * scale);
      
      const color = getStateColor(stId);
      svgBorders += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${color.replace('0.15', '0.5')}" stroke-width="2" stroke-dasharray="10,5" class="map-svg-state-border" />`;
      svgBorders += `<text x="${cx}" y="${cy}" class="map-svg-state-label" fill="rgba(255,255,255,0.8)" font-size="${120 * scale}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" style="pointer-events:none; text-shadow: 0px 4px 10px rgba(0,0,0,0.8);">${escapeHtml(g.name)}</text>`;
    });

    // Add current wild zone indication (dynamic)
    if (session?.current_wild_zone) {
      svgBorders += `<circle cx="${currentPx}" cy="${currentPy}" r="${400 * scale}" fill="rgba(16, 185, 129, 0.1)" stroke="rgba(16, 185, 129, 0.4)" stroke-width="2" stroke-dasharray="8,8" />`;
      svgBorders += `<text x="${currentPx}" y="${currentPy - (420 * scale)}" fill="#10b981" font-size="${30 * scale}" font-weight="bold" text-anchor="middle" style="text-shadow: 0 2px 4px rgba(0,0,0,0.8); pointer-events:none;">${escapeHtml(session.current_wild_zone)}</text>`;
    }

    gridSvg.setAttribute('width', `${gridSize * 2}`);
    gridSvg.setAttribute('height', `${gridSize * 2}`);
    gridSvg.style.left = `${-gridSize}px`;
    gridSvg.style.top = `${-gridSize}px`;
    gridSvg.innerHTML = `
      <g transform="translate(${gridSize}, ${gridSize})">
        ${gridLines}
        ${svgBorders}
        <line x1="${-gridSize}" y1="0" x2="${gridSize}" y2="0" stroke="rgba(212, 163, 89, 0.35)" stroke-width="1.5" stroke-dasharray="4,4" />
        <line x1="0" y1="${-gridSize}" x2="0" y2="${gridSize}" stroke="rgba(212, 163, 89, 0.35)" stroke-width="1.5" stroke-dasharray="4,4" />
        <circle cx="0" cy="0" r="4" fill="#d4a359" />
        <text x="8" y="-8" fill="rgba(212, 163, 89, 0.75)" font-size="11" font-family="monospace">Р¦РµРЅС‚СЂ РњРёСЂР° (0, 0)</text>
      </g>
    `;

    // 2. Locations
    locLayer.innerHTML = locations.map((loc) => {
      const lx = (loc.pos_x ?? 0) * scale;
      const ly = (loc.pos_y ?? 0) * scale;

      let icon = 'рџЏ›';
      let pinBg = '#3b82f6';
      
      const isWild = loc.type === 'landmark' || loc.type === 'ruins' || loc.danger_level === 'deadly' || loc.danger_level === 'extreme';
      
      if (isWild) {
        icon = 'рџЊІ';
        pinBg = '#10b981';
      }
      if (loc.danger_level === 'deadly' || loc.danger_level === 'extreme') {
        icon = 'рџ’Ђ';
        pinBg = '#ef4444';
      } else if (loc.danger_level === 'hard') {
        icon = 'вљ”пёЏ';
        pinBg = '#f59e0b';
      } else if (loc.type === 'capital') {
        icon = 'рџ‘‘';
        pinBg = '#8b5cf6';
      } else if (loc.type === 'dungeon') {
        icon = 'в›©пёЏ';
        pinBg = '#e11d48';
      }

      let subzonesHtml = '';
      if (loc.subzones && loc.subzones.length > 0) {
        subzonesHtml = loc.subzones.map(sz => {
          const szx = (sz.pos_x ?? 0) * scale;
          const szy = (sz.pos_y ?? 0) * scale;
          return `
            <div class="map-subzone-marker" style="left: ${szx}px; top: ${szy}px;" title="${escapeHtml(sz.name)}">
              <div class="map-subzone-dot"></div>
              <span class="map-marker-label" style="display: ${showMapLabels ? 'block' : 'none'}; font-size: 10px; padding: 2px 4px;">${escapeHtml(sz.name)}</span>
            </div>
          `;
        }).join('');
      }

      return `
        <div class="map-marker" data-type="${escapeHtml(loc.type)}" data-loc-id="${escapeHtml(loc.id)}" style="left: ${lx}px; top: ${ly}px;" title="${escapeHtml(loc.name)} (${loc.pos_x}, ${loc.pos_y})">
          <div class="map-marker-pin" style="background: ${pinBg};">${icon}</div>
          <span class="map-marker-label" style="display: ${showMapLabels ? 'block' : 'none'};">${escapeHtml(loc.name)}</span>
        </div>
        ${subzonesHtml}
      `;
    }).join('');

    locLayer.querySelectorAll('.map-marker').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const locId = el.dataset.locId;
        const loc = locations.find(l => l.id === locId);
        if (!loc) return;
        showLocationPopup(loc);
      });
    });

    // 3. Players
    const otherPlayersHtml = (allPlayers || [])
      .filter(p => p.id !== currentPlayer?.id)
      .map(p => {
        const px = (p.pos_x ?? 0) * scale;
        const py = (p.pos_y ?? 0) * scale;
        return `
          <div class="map-player-beacon" style="left: ${px}px; top: ${py}px;" title="${escapeHtml(p.name || 'РРіСЂРѕРє')} (${p.pos_x ?? 0}, ${p.pos_y ?? 0})">
            <div class="map-party-dot"></div>
            <span class="map-marker-label" style="background: rgba(14, 38, 64, 0.9); color: #7dd3fc;">${escapeHtml(p.name || 'РРіСЂРѕРє')}</span>
          </div>
        `;
      }).join('');

    plLayer.innerHTML = `
      ${otherPlayersHtml}
      <div class="map-player-beacon" style="left: ${currentPx}px; top: ${currentPy}px;" title="Р’С‹: (${currentPlayer?.pos_x ?? 0}, ${currentPlayer?.pos_y ?? 0})">
        <div class="map-player-dot"></div>
        <span class="map-marker-label" style="background: rgba(10, 40, 20, 0.95); color: #4ade80; font-weight: 700;">рџ“Ќ Р’С‹ (${currentPlayer?.name || 'Р“РµСЂРѕР№'})</span>
      </div>
    `;
  }

  function showLocationPopup(loc) {
    const popup = document.getElementById('mapLocationPopup');
    if (!popup) return;

    const subzonesList = (loc.subzones || []).map(sz => `
      <span class="badge badge-info" style="font-size: 0.65rem;">
        ${escapeHtml(sz.name)} (R:${sz.radius || 10})
      </span>
    `).join(' ') || '<span style="color: var(--text-muted); font-size: 0.75rem;">РќРµС‚ СЃР°Р±Р·РѕРЅ</span>';

    const dx = (loc.pos_x ?? 0) - (currentPlayer?.pos_x ?? 0);
    const dy = (loc.pos_y ?? 0) - (currentPlayer?.pos_y ?? 0);
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const unit = session?.scale_unit || 'РєРј';

    popup.style.display = 'flex';
    popup.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(212, 163, 89, 0.3); padding-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <strong style="color: var(--accent-gold); font-size: var(--fs-md);">${escapeHtml(loc.name)}</strong>
          <span class="badge ${loc.danger_level === 'deadly' || loc.danger_level === 'extreme' ? 'badge-danger' : loc.danger_level === 'hard' ? 'badge-warning' : 'badge-success'}" style="font-size: 0.65rem;">
            ${escapeHtml(loc.danger_level || 'normal')}
          </span>
        </div>
        <button class="btn btn-ghost btn-icon btn-xs" id="closeLocPopupBtn" style="font-size: 0.75rem; width: 22px; height: 22px;">вњ•</button>
      </div>
      <div style="font-size: var(--fs-xs); color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 2px;">
        <span>РљРѕРѕСЂРґРёРЅР°С‚С‹: <strong>[${loc.pos_x ?? 0}, ${loc.pos_y ?? 0}]</strong></span>
        <span>Р”РёСЃС‚Р°РЅС†РёСЏ: <strong style="color: #38bdf8;">${dist} ${escapeHtml(unit)}</strong></span>
      </div>
      ${loc.description ? `<p style="font-size: var(--fs-xs); color: var(--text-main); margin: 3px 0; line-height: 1.3;">${escapeHtml(loc.description)}</p>` : ''}
      <div style="margin-top: 4px;">
        <small style="color: var(--text-muted); display: block; margin-bottom: 2px;">РЎР°Р±Р·РѕРЅС‹:</small>
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
      if (btn) btn.textContent = showMapLabels ? 'рџЏ·пёЏ Р’РєР»' : 'рџЏ·пёЏ Р’С‹РєР»';
      document.querySelectorAll('.map-marker-label').forEach((el) => {
        el.style.display = showMapLabels ? 'block' : 'none';
      });
    });

    document.getElementById('toggleMapWideBtn')?.addEventListener('click', () => {
      isMapWide = !isMapWide;
      const panel = document.getElementById('mapPanel');
      if (panel) panel.classList.toggle('map-wide', isMapWide);
      const btn = document.getElementById('toggleMapWideBtn');
      if (btn) btn.textContent = isMapWide ? 'в—Ђв–¶' : 'в–¶в—Ђ';
      setTimeout(recenterMapOnPlayer, 100);
    });

    document.getElementById('toggleMapFullscreenBtn')?.addEventListener('click', () => {
      isMapFullscreen = !isMapFullscreen;
      const panel = document.getElementById('mapPanel');
      if (panel) panel.classList.toggle('map-fullscreen', isMapFullscreen);
      const btn = document.getElementById('toggleMapFullscreenBtn');
      if (btn) btn.textContent = isMapFullscreen ? 'рџ——' : 'в›¶';
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

    // 1. РњРіРЅРѕРІРµРЅРЅРѕ РѕС‚РѕР±СЂР°Р¶Р°РµРј СЃРѕРѕР±С‰РµРЅРёРµ РёРіСЂРѕРєР° РІ С‡Р°С‚Рµ
    const tempMsgId = 'temp-' + Date.now();
    const optimisticPlayerMsg = {
      id: tempMsgId,
      session_id: sessionId,
      sender_type: 'player',
      sender_id: user?.id || currentPlayer?.id,
      sender_name: currentPlayer?.name || 'Р“РµСЂРѕР№',
      content: text,
      created_at: new Date().toISOString(),
    };
    messages.push(optimisticPlayerMsg);
    appendMessage(optimisticPlayerMsg);

    // 2. РЎСЂР°Р·Сѓ Р·Р°РїСѓСЃРєР°РµРј Р°РЅРёРјР°С†РёСЋ РіРµРЅРµСЂР°С†РёРё РѕС‚РІРµС‚Р° РІ РѕР±Р»Р°С‡РєРµ Р”Рњ
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
        let restMessage = `РћС‚РґС‹С…: ${restInfo.rest_quality || 'normal'} (${restInfo.rest_duration_hours || 0}С‡)`;
        if (restInfo.hp_recovery) {
          restMessage += `. Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ HP: ${restInfo.hp_recovery}`;
        }
        if (restInfo.injuries?.length) {
          restMessage += `. РџРѕР»СѓС‡РµРЅС‹ С‚СЂР°РІРјС‹: ${restInfo.injuries.map(i => i.type).join(', ')}`;
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

      // РћР±РЅРѕРІР»РµРЅРёРµ РІСЂРµРјРµРЅРё СЃРµСЃСЃРёРё РїСЂРё РЅР°Р»РёС‡РёРё
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

      // РћР±РЅРѕРІР»РµРЅРёРµ Р»РѕРєР°С†РёРё РїСЂРё СЃРјРµРЅРµ РёР»Рё РіРµРЅРµСЂР°С†РёРё РЅР°С‡Р°Р»СЊРЅРѕР№ Р»РѕРєР°С†РёРё
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


      // РћР±РЅРѕРІР»РµРЅРёРµ Р»РѕРєР°С†РёРё РїСЂРё СЃРјРµРЅРµ
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

      // РћРїРѕРІРµС‰РµРЅРёСЏ РѕР± РёР·РјРµРЅРµРЅРёРё РѕС‚РЅРѕС€РµРЅРёР№ Рё РїР°РјСЏС‚Рё NPC
      if (Array.isArray(result.npc_updates) && result.npc_updates.length > 0) {
        for (const update of result.npc_updates) {
          const deltaSign = update.delta > 0 ? `+${update.delta}` : `${update.delta}`;
          const toneIcon = update.delta > 0 ? 'рџ’љ' : update.delta < 0 ? 'рџ’”' : 'рџ’¬';
          toast.info(`${toneIcon} ${update.npc_name}: ${update.tier_label} (${update.score}/100, ${deltaSign})`);
        }
        if (activePanel === 'npc') {
          refreshNpcPanel();
        }
      }

      // РћРїРѕРІРµС‰РµРЅРёСЏ Рѕ СЃСЋР¶РµС‚РЅРѕРј РїСЂРѕРіСЂРµСЃСЃРµ (Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ РѕС‚СЃР»РµР¶РёРІР°РЅРёРµ)
      if (result.story_progress) {
        try {
          const freshSession = await getSession(sessionId);
          if (freshSession) session = freshSession;
          if (result.story_progress.completed_goals?.length > 0) {
            toast.success(`рџЋЇ Р¦РµР»СЊ СЃСЋР¶РµС‚Р° РІС‹РїРѕР»РЅРµРЅР°: ${result.story_progress.completed_goals.join(', ')}`);
          }
          if (result.story_progress.advanced_arc) {
            toast.success(`рџ“њ РЎСЋР¶РµС‚ РїСЂРѕРґРІРёРЅСѓР»СЃСЏ Рє СЃР»РµРґСѓСЋС‰РµРјСѓ Р°РєС‚Сѓ!`);
          }
          if (activePanel === 'story') {
            await refreshStoryPanel();
          }
        } catch (e) {
          console.warn('Failed to reload session after story progress:', e);
        }
      }

      // РЈРІРµРґРѕРјР»РµРЅРёСЏ Рѕ СЃРїСѓС‚РЅРёРєР°С…, РЅР°РІС‹РєР°С… Рё СѓСЂРѕРІРЅСЏС…
      if (result.companion_action) {
        toast.info(`рџ¤ќ ${result.companion_action.npc_name}: ${result.companion_action.dialogue}`);
      }
      if (result.skill_progress?.leveled_up) {
        toast.success(`рџ”” РќР°РІС‹Рє РїРѕРІС‹С€РµРЅ! ${result.skill_progress.name} СѓСЂ. ${result.skill_progress.level}!`);
      }
      if (result.level_up) {
        toast.success(`рџЋ‰ РќРѕРІС‹Р№ СѓСЂРѕРІРµРЅСЊ ${result.level_up.new_level}! РџРѕР»СѓС‡РµРЅРѕ +2 СЃРІРѕР±РѕРґРЅС‹С… РѕС‡РєР° С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРє (РћРҐ)!`);
      }

      // РћР±РЅРѕРІР»РµРЅРёРµ РґР°РЅРЅС‹С… РёРіСЂРѕРєР°, РЅР°РІС‹РєРѕРІ Рё РёРЅРІРµРЅС‚Р°СЂСЏ
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
        toast.error('РќРµ Р·Р°РґР°РЅ OpenRouter API Key. РћС‚РєСЂРѕР№С‚Рµ В«вљ™пёЏ РђРєРєР°СѓРЅС‚В» РІ Р»РѕР±Р±Рё Рё РІРІРµРґРёС‚Рµ РєР»СЋС‡.');
      } else {
        toast.error('РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё: ' + err.message);
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
      <div class="message-avatar">рџЋ­</div>
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
    // РўРЈРњРђРќ Р’РћР™РќР«: РµРґРёРЅР°СЏ С„СѓРЅРєС†РёСЏ РїСЂРѕРІРµСЂРєРё РІРёРґРёРјРѕСЃС‚Рё
    if (!isMessageVisibleToCurrentPlayer(msg)) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Р—Р°С‰РёС‚Р° РѕС‚ РґСѓР±Р»РёРєР°С‚РѕРІ РІ DOM
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
    const locStr = session?.current_wild_zone ? `рџЊІ ${session.current_wild_zone}` : (session?.current_location_name || '');

    if (locStr) {
      if (locEl) {
        const textSpan = locEl.querySelector('span');
        if (textSpan) {
          textSpan.textContent = locStr;
        } else {
          locEl.textContent = `рџ“Ќ ${locStr}`;
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
          timeEl.textContent = `рџ•ђ ${timeStr}`;
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
          <h2 class="card-title" style="margin-bottom: 0.5rem;">вљ”пёЏ РЎРѕР·РґР°РЅРёРµ РїРµСЂСЃРѕРЅР°Р¶Р°</h2>
          <p class="form-hint" style="margin-bottom: 1rem;">Р’С‹Р±РµСЂРёС‚Рµ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ РіРµСЂРѕСЏ РёР»Рё СЃРѕР·РґР°Р№С‚Рµ РЅРѕРІРѕРіРѕ</p>

          <!-- Р’С‹Р±РѕСЂ С‚РѕС‡РєРё СЃРїР°РІРЅР° РІ РјСѓР»СЊС‚РёРїР»РµРµСЂРµ -->
          ${allPlayers.length > 1 ? `
            <div class="spawn-selection-box" style="margin-bottom: 1.25rem; padding: 0.85rem; background: rgba(30, 24, 20, 0.6); border: 1px solid var(--border); border-radius: var(--radius-md);">
              <label class="form-label" style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem;">
                рџ“Ќ Р’С‹Р±РµСЂРёС‚Рµ, СЂСЏРґРѕРј СЃ РєРµРј РїРѕСЏРІРёС‚СЊСЃСЏ:
              </label>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;" id="spawnChoicesContainer">
                ${allPlayers.map((p, idx) => {
                  const pLoc = `${session?.current_wild_zone ? 'рџЊІ ' + session.current_wild_zone : (session?.current_location_name || 'Р›РѕРєР°С†РёСЏ')}${p.current_zone ? ` вЂў рџ“Ќ ${p.current_zone}` : ' вЂў РћСЃРЅРѕРІРЅР°СЏ Р·РѕРЅР°'}`;
                  return `
                    <label class="spawn-radio-card" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid ${idx === 0 ? 'var(--primary)' : 'var(--border)'}; border-radius: var(--radius-sm); cursor: pointer; background: rgba(0,0,0,0.25);">
                      <input type="radio" name="spawnTargetPlayerId" value="${p.id}" ${idx === 0 ? 'checked' : ''} />
                      <div style="flex: 1;">
                        <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                          вљ”пёЏ ${escapeHtml(p.name)}
                          <span class="badge badge-info" style="font-size: 0.7rem;">${escapeHtml(p.race || 'Р“РµСЂРѕР№')} / ${escapeHtml(p.class || '')}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                          рџ“Ќ ${escapeHtml(pLoc)}
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
                рџ“Ќ Р’С‹ РїРѕСЏРІРёС‚РµСЃСЊ СЂСЏРґРѕРј СЃ РіРµСЂРѕРµРј <strong>${escapeHtml(allPlayers[0].name)}</strong> (${escapeHtml(allPlayers[0].race || 'Р“РµСЂРѕР№')} / ${escapeHtml(allPlayers[0].class || '')}):
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                рџ“Ќ ${escapeHtml(`${session?.current_wild_zone ? 'рџЊІ ' + session.current_wild_zone : (session?.current_location_name || 'Р›РѕРєР°С†РёСЏ')}${allPlayers[0].current_zone ? ` вЂў ${allPlayers[0].current_zone}` : ' вЂў РћСЃРЅРѕРІРЅР°СЏ Р·РѕРЅР°'}`)}
              </div>
            </div>
          ` : '')}

          <!-- РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РєР°СЂС‚РѕС‡РєРё -->
          <div id="existingCardsList" class="char-select-grid" style="margin-bottom: 1.5rem;">
            <p class="text-muted" style="text-align: center;">Р—Р°РіСЂСѓР·РєР° РєР°СЂС‚РѕС‡РµРє...</p>
          </div>

          <div class="auth-divider" style="margin: 1rem 0;"><span>РёР»Рё СЃРѕР·РґР°Р№С‚Рµ РЅРѕРІРѕРіРѕ</span></div>

          <!-- РЎРѕР·РґР°РЅРёРµ РЅРѕРІРѕРіРѕ -->
           <form id="createCharacterForm">
            <input type="hidden" id="charRaceAcBonus" value="0" />
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">РРјСЏ РіРµСЂРѕСЏ *</label>
              <input class="input" id="charName" placeholder="Р­Р»СЊРґСЂРёРЅ" required />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
              <div class="form-group">
                <label class="form-label">Р Р°СЃР°</label>
                <input class="input" id="charRace" placeholder="Р§РµР»РѕРІРµРє" required />
              </div>
              <div class="form-group">
                <label class="form-label">РљР»Р°СЃСЃ</label>
                <input class="input" id="charClass" placeholder="Р’РѕРёРЅ" required />
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Р’РЅРµС€РЅРѕСЃС‚СЊ</label>
              <textarea class="input" id="charAppearance" rows="2" placeholder="Р’С‹СЃРѕРєРёР№ РјСѓР¶С‡РёРЅР° СЃ С€СЂР°РјРѕРј РЅР° Р»РµРІРѕРј РіР»Р°Р·Сѓ..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label">Р‘РёРѕРіСЂР°С„РёСЏ</label>
              <textarea class="input" id="charBio" rows="3" placeholder="Р РѕРґРёР»СЃСЏ РІ РґРµСЂРµРІРЅРµ РЅР° РєСЂР°СЋ РјРёСЂР°..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <label class="form-label" style="margin: 0;">РҐР°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё</label>
                <button type="button" class="btn btn-secondary btn-sm" id="generateStatsBtn">вњЁ AI</button>
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
                <span class="form-hint">вЏі Р“РµРЅРµСЂР°С†РёСЏ...</span>
              </div>
              <div style="text-align: center; margin-top: 0.75rem;">
                <span class="stats-sum" id="statsSum">РЎСѓРјРјР°: <strong>60</strong> / 72</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">РќР°С‡Р°С‚СЊ РїСЂРёРєР»СЋС‡РµРЅРёРµ</button>
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
                  <h3 style="font-weight: 700;">вљ”пёЏ ${c.name}</h3>
                  <span class="badge badge-info">${c.race} / ${c.class}</span>
                </div>
                <p class="form-hint">вќ¤пёЏ ${c.hp}/${c.max_hp} &nbsp;вЂў&nbsp; рџ’° ${c.money} &nbsp;вЂў&nbsp; рџ“Љ ${total}</p>
                <p class="char-select-bio">${c.bio || 'Р‘РµР· Р±РёРѕРіСЂР°С„РёРё'}</p>
                <div class="char-select-actions">
                  <button class="btn btn-primary char-select-btn" data-card-id="${c.id}">Р’С‹Р±СЂР°С‚СЊ СЌС‚РѕРіРѕ РіРµСЂРѕСЏ</button>
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
              btn.textContent = 'вЏі Р’С‹Р±РѕСЂ РіРµСЂРѕСЏ...';

              try {
                // Р—Р°С‰РёС‚Р° РѕС‚ Р·Р°РґРІРѕРµРЅРёСЏ: РїСЂРѕРІРµСЂСЏРµРј, РЅРµ Р±С‹Р» Р»Рё РїРµСЂСЃРѕРЅР°Р¶ СѓР¶Рµ СЃРѕР·РґР°РЅ (РІ РґСЂСѓРіРѕР№ РІРєР»Р°РґРєРµ РёР»Рё РіРѕРЅРєРµ Р·Р°РїСЂРѕСЃРѕРІ)
                const activeUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
                const freshPlayers = await getSessionPlayers(sessionId);
                const existingPlayer = activeUserId ? freshPlayers.find((p) => p.user_id === activeUserId) : null;
                if (existingPlayer) {
                  currentPlayer = existingPlayer;
                  allPlayers = freshPlayers;
                  toast.info(`РџРµСЂСЃРѕРЅР°Р¶ В«${existingPlayer.name}В» СѓР¶Рµ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ РёРіСЂРµ!`);
                  render();
                  subscribeRealtime();
                  return;
                }

                console.log('[character-card] select card:', { cardId, name: card.name, stats: card.stats });

                const cardRace = card.race || 'Р§РµР»РѕРІРµРє';
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
                    const nearText = spawnTarget.targetName ? `СЂСЏРґРѕРј СЃ РіРµСЂРѕРµРј ${spawnTarget.targetName}` : 'РІ Р»РѕРєР°С†РёРё';
                    await supabase.from('messages').insert({
                      session_id: sessionId,
                      sender_type: 'system',
                      sender_name: 'РЎРёСЃС‚РµРјР°',
                      content: `рџ‘‹ Р’ РїРѕР»Рµ Р·СЂРµРЅРёСЏ РїРѕСЏРІР»СЏРµС‚СЃСЏ СЃС‚СЂР°РЅРЅРёРє: ${currentPlayer.name} (${currentPlayer.race} ${currentPlayer.class}), Р·Р°РјРµС‡РµРЅРЅС‹Р№ ${nearText}. Р’С‹ РµС‰С‘ РЅРµ Р·РЅР°РєРѕРјС‹ СЃ РЅРёРј.`,
                    });
                  } catch (annErr) {
                    console.warn('Failed to announce join:', annErr);
                  }
                }
                allPlayers.push(currentPlayer);
                await initTurnQueue(sessionId, allPlayers);
                await checkTurnQueue();
                toast.success(`Р“РµСЂРѕР№ В«${card.name}В» РІС‹Р±СЂР°РЅ!`);
                render();
                subscribeRealtime();
              } catch (err) {
                console.error('[character-card] select error:', err);
                toast.error('РћС€РёР±РєР°: ' + err.message);
                isSelectingCharacter = false;
                cardsEl.querySelectorAll('.char-select-btn').forEach((b) => {
                  b.disabled = false;
                  b.style.opacity = '1';
                });
                btn.textContent = 'Р’С‹Р±СЂР°С‚СЊ СЌС‚РѕРіРѕ РіРµСЂРѕСЏ';
              }
            });
          });
        } else {
          cardsEl.innerHTML = '<p class="text-muted" style="text-align: center;">РЈ РІР°СЃ РїРѕРєР° РЅРµС‚ РєР°СЂС‚РѕС‡РµРє. РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІРѕРіРѕ РіРµСЂРѕСЏ РЅРёР¶Рµ.</p>';
        }
      }
    } catch (err) {
      console.warn('[character-creation] Failed to load cards:', err);
      const cardsEl = document.getElementById('existingCardsList');
      if (cardsEl) {
        cardsEl.innerHTML = '<p class="text-muted" style="text-align: center;">РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ РєР°СЂС‚РѕС‡РєРё. РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІРѕРіРѕ РіРµСЂРѕСЏ РЅРёР¶Рµ.</p>';
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
        submitBtn.textContent = 'вЏі РЎРѕР·РґР°РЅРёРµ РіРµСЂРѕСЏ...';
      }

      try {
        const activeUserId = user?.id || (await supabase.auth.getUser().catch(() => null))?.data?.user?.id;
        const freshPlayers = await getSessionPlayers(sessionId);
        const existingPlayer = activeUserId ? freshPlayers.find((p) => p.user_id === activeUserId) : null;
        if (existingPlayer) {
          currentPlayer = existingPlayer;
          allPlayers = freshPlayers;
          toast.info(`РџРµСЂСЃРѕРЅР°Р¶ В«${existingPlayer.name}В» СѓР¶Рµ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ РёРіСЂРµ!`);
          render();
          subscribeRealtime();
          return;
        }

        const stats = {};
        STATS.forEach((stat) => {
          stats[stat] = parseInt(document.getElementById(`stat_${stat}`).value) || 10;
        });

        const charRace = document.getElementById('charRace').value || 'Р§РµР»РѕРІРµРє';
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
            const nearText = spawnTarget.targetName ? `СЂСЏРґРѕРј СЃ РіРµСЂРѕРµРј ${spawnTarget.targetName}` : 'РІ Р»РѕРєР°С†РёРё';
            await supabase.from('messages').insert({
              session_id: sessionId,
              sender_type: 'system',
              sender_name: 'РЎРёСЃС‚РµРјР°',
              content: `рџ‘‹ Р’ РїРѕР»Рµ Р·СЂРµРЅРёСЏ РїРѕСЏРІР»СЏРµС‚СЃСЏ СЃС‚СЂР°РЅРЅРёРє: ${currentPlayer.name} (${currentPlayer.race} ${currentPlayer.class}), Р·Р°РјРµС‡РµРЅРЅС‹Р№ ${nearText}. Р’С‹ РµС‰С‘ РЅРµ Р·РЅР°РєРѕРјС‹ СЃ РЅРёРј.`,
            });
          } catch (annErr) {
            console.warn('Failed to announce join:', annErr);
          }
        }
        allPlayers.push(currentPlayer);
        await initTurnQueue(sessionId, allPlayers);
        await checkTurnQueue();
        toast.success('РџРµСЂСЃРѕРЅР°Р¶ СЃРѕР·РґР°РЅ!');
        render();
        subscribeRealtime();
      } catch (err) {
        console.error('[create-character] error:', err);
        toast.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ: ' + err.message);
        isSelectingCharacter = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'РќР°С‡Р°С‚СЊ РїСЂРёРєР»СЋС‡РµРЅРёРµ';
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
        sumEl.textContent = `РЎСѓРјРјР°: ${sum} / 72`;
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
        toast.warning('РЎРЅР°С‡Р°Р»Р° Р·Р°РїРѕР»РЅРёС‚Рµ РїРѕР»Рµ В«Р‘РёРѕРіСЂР°С„РёСЏВ» вЂ” РЅРµР№СЂРѕСЃРµС‚СЊ РїСЂРѕР°РЅР°Р»РёР·РёСЂСѓРµС‚ РµС‘ РґР»СЏ РіРµРЅРµСЂР°С†РёРё СЃС‚Р°С‚РѕРІ.');
        return;
      }

      const btn = document.getElementById('generateStatsBtn');
      const loading = document.getElementById('statsLoading');
      btn.disabled = true;
      btn.textContent = 'вЏі Р“РµРЅРµСЂР°С†РёСЏ...';
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
          toast.success('РЎС‚Р°С‚С‹ СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅС‹!');
        } else {
          console.warn('[generate-character] response without stats:', response);
        }
      } catch (err) {
        console.error('[generate-character] error:', err);
        if (err?.data?.code === 'MISSING_API_KEY') {
          toast.error('РќРµ Р·Р°РґР°РЅ OpenRouter API Key. РћС‚РєСЂРѕР№С‚Рµ В«вљ™пёЏ РђРєРєР°СѓРЅС‚В» РІ Р»РѕР±Р±Рё Рё РІРІРµРґРёС‚Рµ РєР»СЋС‡.');
        } else {
          const detail = err?.data?.details || err?.data?.error || err.message || 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°';
          toast.error('РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё: ' + detail);
        }
      } finally {
        console.log('[generate-character] finally: reset UI');
        btn.disabled = false;
        btn.textContent = 'вњЁ РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РЅРµР№СЂРѕСЃРµС‚СЊСЋ';
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
