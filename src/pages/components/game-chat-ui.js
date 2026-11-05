// src/pages/components/game-chat-ui.js
import { escapeHtml, formatRpText } from '../../utils/text.js';

export function renderChoicesBlock(choices = []) {
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const validChoices = choices
    .filter(c => typeof c === 'string' && c.trim().length > 0)
    .slice(0, 4);
  if (validChoices.length === 0) return '';

  return `
    <div class="master-choices-box">
      <div class="master-choices-header">
        <span class="master-choices-icon">⚡</span>
        <span>Выберите решение или напишите свой вариант ниже:</span>
      </div>
      <div class="master-choices-list">
        ${validChoices.map((choice, idx) => {
          const safeChoice = escapeHtml(choice.trim());
          return `
            <div class="choice-action-row">
              <button type="button" class="choice-action-btn" data-choice-action="${safeChoice}">
                <span class="choice-action-num">${idx + 1}</span>
                <span class="choice-action-text">${safeChoice}</span>
              </button>
              <button type="button" class="choice-edit-btn" data-choice-edit="${safeChoice}" title="Изменить действие перед отправкой" aria-label="Изменить действие">
                ✏️
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function renderTurnBadgesBlock(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return '';
  let badges = [];

  if (Array.isArray(metadata.turn_badges) && metadata.turn_badges.length > 0) {
    badges = metadata.turn_badges;
  } else {
    if (metadata.hp_status && typeof metadata.hp_status.delta === 'number' && metadata.hp_status.delta !== 0) {
      const d = metadata.hp_status.delta;
      badges.push({
        icon: d > 0 ? '💚' : '🩸',
        label: `${d > 0 ? `+${d}` : d} HP (${metadata.hp_status.current_hp}/${metadata.hp_status.max_hp})`,
        tone: d > 0 ? 'success' : 'danger',
      });
    }
    if (metadata.inventory_delta) {
      for (const gained of metadata.inventory_delta.gained || []) {
        badges.push({ icon: '🎒', label: `+${gained}`, tone: 'success' });
      }
      for (const lost of metadata.inventory_delta.lost || []) {
        badges.push({ icon: '📦', label: `-${lost}`, tone: 'muted' });
      }
    }
  }

  if (badges.length === 0) return '';

  const toneStyles = {
    gold: 'background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(245, 158, 11, 0.45); color: #fbbf24;',
    success: 'background: rgba(16, 185, 129, 0.14); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7;',
    danger: 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5;',
    info: 'background: rgba(139, 92, 246, 0.14); border: 1px solid rgba(139, 92, 246, 0.35); color: #c4b5fd;',
    muted: 'background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.25); color: #cbd5e1;',
  };

  return `
    <div class="master-turn-badges" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 0.65rem;">
      ${badges.slice(0, 6).map(b => {
        const style = toneStyles[b.tone] || toneStyles.info;
        return `
          <span class="turn-outcome-badge" style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 6px; font-size: 0.76rem; font-weight: 500; line-height: 1.3; ${style}">
            <span>${escapeHtml(b.icon || '🎲')}</span>
            <span>${escapeHtml(b.label || '')}</span>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

export function renderMessage(msg, currentUserId, currentPlayerId, options = {}) {
  const safeMsgId = escapeHtml(msg.id || '');
  if (msg.sender_type === 'master') {
    const isGlobalLog = msg.metadata?.is_global === true || msg.metadata?.type === 'global_log';
    const isFogMsg    = msg.metadata?.fog_filtered === true || msg.metadata?.type === 'fog_perception';

    if (isFogMsg) {
      return `
        <div class="message message-fog" data-message-id="${safeMsgId}" style="
          display: flex; gap: 0.75rem; align-items: flex-start;
          padding: 0.6rem 0.8rem;
          background: linear-gradient(135deg, rgba(30,23,19,0.7) 0%, rgba(20,15,12,0.8) 100%);
          border-left: 3px solid rgba(180,140,80,0.3);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          margin: 2px 0;
          opacity: 0.85;
        ">
          <div style="font-size: 1rem; flex-shrink: 0; opacity: 0.6;">🌫️</div>
          <div style="font-style: italic; color: var(--text-muted); font-size: var(--fs-sm); line-height: 1.5;">${formatRpText(msg.content)}</div>
        </div>
      `;
    }

    const showChoices = !isGlobalLog && (options.isLatestMasterMsg === true || (options.isLatestMasterMsg === undefined && Array.isArray(msg.metadata?.choices) && msg.metadata.choices.length > 0));
    const effectiveChoices = showChoices
      ? ((Array.isArray(msg.metadata?.choices) && msg.metadata.choices.length > 0)
          ? msg.metadata.choices
          : (options.fallbackChoices || []))
      : [];
    const badgesHtml = !isGlobalLog ? renderTurnBadgesBlock(msg.metadata) : '';

    return `
      <div class="message ${isGlobalLog ? 'message-system' : 'message-master'}" data-message-id="${safeMsgId}">
        <div class="message-avatar">${isGlobalLog ? '📜' : '🎭'}</div>
        <div class="message-body">
          ${isGlobalLog ? '<div class="message-sender" style="font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 2px;">Событие мира</div>' : ''}
          <div class="message-text">${formatRpText(msg.content)}</div>
          ${badgesHtml}
          ${showChoices ? renderChoicesBlock(effectiveChoices) : ''}
        </div>
      </div>
    `;
  }

  if (msg.sender_type === 'system') {
    if (msg.metadata?.type === 'world_cycle_log') {
      const roundNum = msg.metadata.round_number || '';
      const rawLines = (msg.content || '').split('\n').map(l => l.trim()).filter(Boolean);
      const header = rawLines[0] || `Хроника мира | Цикл ${roundNum}`;
      const items = rawLines.slice(1);
      return `
        <div class="message message-world-chronicle" data-message-id="${safeMsgId}" style="
          padding: 0.85rem 1.1rem;
          margin: 0.6rem 0;
          background: linear-gradient(135deg, rgba(20, 24, 34, 0.95) 0%, rgba(12, 16, 26, 0.98) 100%);
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-left: 4px solid #f59e0b;
          border-radius: var(--radius-sm);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        ">
          <div style="font-size: 0.88rem; font-weight: 700; color: #fbbf24; margin-bottom: 0.45rem; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.1rem;">🌍</span>
            <span>${escapeHtml(header.replace(/^[🌍*#\s]+/, ''))}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: var(--fs-sm); line-height: 1.5; color: #e2e8f0;">
            ${items.length > 0
              ? items.map(it => `<div style="padding-left: 6px; border-left: 2px solid rgba(245, 158, 11, 0.25);">${formatRpText(it.replace(/^[📜*\-\s]+/, ''))}</div>`).join('')
              : `<div style="color: var(--text-muted); font-style: italic;">В мире пока ничего не произошло.</div>`
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="message message-system" data-message-id="${safeMsgId}">
        <div class="message-text">${formatRpText(msg.content)}</div>
      </div>
    `;
  }

  if (msg.sender_type === 'npc') {
    const npcName = msg.sender_name || 'Неизвестный';
    const isCompanion = msg.metadata?.is_companion === true;
    return `
      <div class="message message-npc" data-message-id="${safeMsgId}" style="
        display: flex; gap: 0.75rem; align-items: flex-start;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, rgba(28, 22, 40, 0.85) 0%, rgba(18, 15, 28, 0.95) 100%);
        border-left: 3px solid ${isCompanion ? '#10b981' : '#8b5cf6'};
        border-radius: 0 var(--radius-md) var(--radius-md) 0;
        margin: 4px 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      ">
        <div class="message-avatar" style="font-size: 1.25rem; flex-shrink: 0; background: ${isCompanion ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)'}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid ${isCompanion ? 'rgba(16, 185, 129, 0.3)' : 'rgba(139, 92, 246, 0.3)'};">
          ${isCompanion ? '🤝' : '🗣️'}
        </div>
        <div class="message-body" style="flex: 1;">
          <div class="message-sender" style="font-size: var(--fs-xs); font-weight: 600; color: ${isCompanion ? '#34d399' : '#a78bfa'}; margin-bottom: 3px; display: flex; align-items: center; gap: 6px;">
            <span>${escapeHtml(npcName)}</span>
            ${isCompanion ? '<span style="font-size: 0.7rem; padding: 1px 5px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #6ee7b7;">Спутник</span>' : ''}
          </div>
          <div class="message-text" style="color: var(--text-primary); font-size: var(--fs-sm); line-height: 1.5;">${formatRpText(msg.content)}</div>
        </div>
      </div>
    `;
  }

  if (msg.sender_type === 'player') {
    const isMine = (currentUserId && msg.sender_id === currentUserId) || (currentPlayerId && msg.sender_id === currentPlayerId);
    if (isMine) {
      return `
        <div class="message message-self" data-message-id="${safeMsgId}">
          <div class="message-body">
            <div class="message-text">${formatRpText(msg.content)}</div>
          </div>
          <div class="message-avatar">Вы</div>
        </div>
      `;
    }
    return `
      <div class="message message-other" data-message-id="${safeMsgId}">
        <div class="message-avatar">👤</div>
        <div class="message-body">
          <div class="message-sender">${escapeHtml(msg.sender_name || 'Игрок')}</div>
          <div class="message-text">${formatRpText(msg.content)}</div>
        </div>
      </div>
    `;
  }

  return '';
}
