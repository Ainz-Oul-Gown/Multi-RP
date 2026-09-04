// src/pages/session-settings.js — Экран настроек сессии (для Админа)
import { supabase, invokeFunction } from '../api/supabase.js';
import {
  getSession, updateSession, getSessionPlayers, createPlayer,
  getWorlds, getLoreFiles
} from '../api/game.js';
import { STATS, DIFFICULTY_PRESETS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus } from '../config.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';
import {
  generateStorylineForSession,
  rewriteStoryline,
  updateStoryline,
  deleteStoryline,
} from '../api/storyline.js';

export async function renderSessionSettings(container, sessionId, user) {
  let session = null;
  let players = [];
  let loreFiles = [];

  async function load() {
    try {
      session = await getSession(sessionId);
      if (session.world_id) {
        loreFiles = await getLoreFiles(session.world_id);
      }
      players = await getSessionPlayers(sessionId);
    } catch (err) {
      toast.error('Ошибка загрузки: ' + err.message);
      router.navigate('/');
      return;
    }
    render();
  }

  function render() {
    if (!session) return;

    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
    const inviteUrl = `${window.location.origin}${basePath}#/session/${sessionId}`;

    container.innerHTML = `
      <div class="page">
        <header class="session-header">
          <button class="btn btn-ghost" id="backBtn">← Назад</button>
          <h1 class="session-header-title">⚙️ Настройки сессии</h1>
          <button class="btn btn-primary" id="startGameBtn">🎮 В игру</button>
        </header>

        <div class="session-settings-content">
          <!-- Настройки мира -->
          <section class="card">
            <h2 class="card-title">🌍 Мир / Сеттинг</h2>
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Выбранный мир</label>
              <p style="font-size: var(--fs-lg); font-weight: 600; color: var(--accent-gold);">
                ${session.worlds?.name || 'Не привязан'}
              </p>
            </div>
          </section>

          <!-- Сложность -->
          <section class="card">
            <h2 class="card-title">🎯 Сложность</h2>
            <div class="difficulty-options" style="margin-top: 1rem;">
              ${Object.entries(DIFFICULTY_PRESETS).map(([key, val]) => `
                <div class="difficulty-option ${session.difficulty === key ? 'selected' : ''}" data-difficulty="${key}">
                  <div class="difficulty-label">${val.label}</div>
                  <div class="difficulty-desc">${val.description}</div>
                </div>
              `).join('')}
            </div>
          </section>

          <!-- PvP -->
          <section class="card">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <h2 class="card-title">⚔️ PvP</h2>
                <p class="form-hint">Разрешить урон по союзникам</p>
              </div>
              <div class="toggle ${session.is_pvp_enabled ? 'active' : ''}" id="pvpToggle"></div>
            </div>
          </section>

          <!-- Управление сюжетом -->
          <section class="card">
            <h2 class="card-title">📖 Управление сюжетной линией</h2>
            <p class="form-hint" style="margin-top: 0.5rem;">
              «Лыжи, но не правило»: сюжет адаптируется к миру и действиям игроков, сохраняя свободу песочницы.
            </p>

            ${session.storyline && session.storyline.arcs?.length ? `
              <div style="margin-top: 1rem; padding: 0.75rem; border-radius: 8px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #fff; font-size: 1rem;">${session.storyline.title || 'Сюжетная кампания'}</strong>
                  <span class="badge ${session.storyline.status === 'completed' ? 'badge-success' : 'badge-primary'}">
                    ${session.storyline.status === 'completed' ? 'Завершено' : 'Активен'}
                  </span>
                </div>
                <p style="font-size: var(--fs-sm); color: var(--text-muted); margin-top: 4px;">
                  ${session.storyline.summary || ''}
                </p>
                ${session.storyline.prologue ? `
                  <div style="margin-top: 8px; font-size: var(--fs-xs); color: rgba(255,255,255,0.7); background: rgba(0,0,0,0.2); padding: 6px; border-radius: 6px;">
                    <strong>Пролог:</strong> ${(session.storyline.prologue).slice(0, 160)}...
                  </div>
                ` : ''}
              </div>

              <div class="form-group" style="margin-top: 1rem;">
                <label class="form-label">Текущая активная арка</label>
                <select class="input select" id="plotStageSelect">
                  ${session.storyline.arcs.map((arc, idx) => `
                    <option value="${idx}" ${session.storyline.current_arc_index === idx ? 'selected' : ''}>
                      Акт ${arc.act || (idx + 1)}: ${arc.title} (${(arc.completed_goals || []).length}/${(arc.goals || []).length} целей)
                    </option>
                  `).join('')}
                </select>
              </div>

              <div style="display: flex; gap: 8px; margin-top: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" id="rewriteStoryBtn">🔄 Переписать с ИИ</button>
                <button class="btn btn-ghost btn-sm" id="editStoryJsonBtn">✏️ Редактировать JSON</button>
                <button class="btn btn-ghost btn-sm" id="deleteStoryBtn" style="color: var(--accent-danger);">🗑️ Удалить (Песочница)</button>
              </div>

              <div id="rewriteStoryPromptContainer" style="display: none; flex-direction: column; gap: 6px; margin-top: 8px; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.25);">
                <textarea id="rewriteStoryWishes" class="input" style="width: 100%; min-height: 60px; font-size: var(--fs-sm);" placeholder="Пожелания к сюжету (киберпанк, культ, детектив)..."></textarea>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-primary btn-sm" id="confirmRewriteStoryBtn">Переписать</button>
                  <button class="btn btn-ghost btn-sm" id="cancelRewriteStoryBtn">Отмена</button>
                </div>
              </div>

              <div id="editStoryJsonContainer" style="display: none; flex-direction: column; gap: 6px; margin-top: 8px; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.25);">
                <textarea id="editStoryJsonArea" class="input" style="width: 100%; min-height: 160px; font-family: monospace; font-size: var(--fs-xs);"></textarea>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-primary btn-sm" id="saveStoryJsonBtn">Сохранить</button>
                  <button class="btn btn-ghost btn-sm" id="cancelEditStoryJsonBtn">Отмена</button>
                </div>
              </div>
            ` : `
              <div style="margin-top: 1rem; padding: 1rem; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); text-align: center;">
                <p style="color: var(--text-muted); font-size: var(--fs-sm); margin-bottom: 0.75rem;">
                  Сюжет не сгенерирован. Сессия находится в режиме свободной песочницы.
                </p>
                <div style="text-align: left; margin-bottom: 0.75rem;">
                  <label class="form-label" style="font-size: var(--fs-xs);">Пожелания к сюжетной линии (необязательно):</label>
                  <textarea id="genStoryWishes" class="input" style="width: 100%; min-height: 60px; font-size: var(--fs-sm);" placeholder="Например: поиски древней реликвии, кибер-технологии, чума в Ривервуде..."></textarea>
                </div>
                <button class="btn btn-primary btn-sm" id="generateStoryBtn" style="width: 100%;">
                  ✨ Сгенерировать сюжетную кампанию по миру
                </button>
              </div>
            `}
            ${loreFiles.length ? `
              <div class="form-group" style="margin-top: 1rem;">
                <label class="form-label">Доступные файлы лора (${loreFiles.length})</label>
                <div class="lore-list">
                  ${loreFiles.map((f) => `
                    <div class="lore-item">
                      <span class="badge badge-info">${f.folder}</span>
                      <span>${f.title}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </section>

          <!-- Симуляция NPC -->
          <section class="card">
            <h2 class="card-title">🐉 Симуляция NPC</h2>
            <p class="form-hint" style="margin-top: 0.5rem;">
              Промотайте время, чтобы главные NPC совершили действия за кадром
            </p>
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Количество дней</label>
              <input class="input" type="number" id="npcSimDays" value="1" min="1" max="30" />
            </div>
            <button class="btn btn-secondary btn-sm" id="simulateNpcBtn" style="margin-top: 0.5rem;">
              ⏳ Симулировать жизнь NPC (Фон)
            </button>
          </section>

          <!-- Игроки в сессии -->
          <section class="card">
            <h2 class="card-title">👥 Игроки (${players.length})</h2>
            <div class="players-list" style="margin-top: 1rem;">
              ${players.length ? players.map((p) => `
                <div class="player-row">
                  <div class="player-info">
                    <strong>${p?.name || 'Игрок'}</strong>
                    <span class="text-muted" style="font-size: var(--fs-sm);">${p?.race || ''} / ${p?.class || ''}</span>
                  </div>
                  <div class="player-stats">
                    <span class="badge badge-success">❤️ ${p.hp}/${p.max_hp}</span>
                    <span class="badge badge-gold">💰 ${p.money}</span>
                  </div>
                </div>
              `).join('') : '<p class="text-muted">Пока нет игроков. Пригласите по ID сессии.</p>'}
            </div>
          </section>

          <!-- Приглашение -->
          <section class="card">
            <h2 class="card-title">🔗 Приглашение</h2>
            <p class="form-hint" style="margin-top: 0.5rem;">Отправьте эту ссылку друзьям — они присоединятся одной кнопкой</p>
            <div class="invite-code-container" style="margin-top: 1rem;">
              <code class="invite-code" style="flex: 1; font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis;">${inviteUrl}</code>
              <button class="btn btn-secondary btn-sm" id="copyInviteBtn">📋 Копировать</button>
            </div>
            <p class="form-hint" style="margin-top: 0.75rem;">ID сессии (для ручного ввода):</p>
            <div class="invite-code-container" style="margin-top: 0.5rem;">
              <code class="invite-code" style="flex: 1; font-size: var(--fs-xs);">${sessionId}</code>
              <button class="btn btn-ghost btn-sm" id="copyIdBtn">📋</button>
            </div>
            <button class="btn btn-primary btn-sm" id="addBotBtn" style="margin-top: 1rem;">🤖 Добавить NPC-бота</button>
          </section>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => router.navigate('/'));
    document.getElementById('startGameBtn')?.addEventListener('click', () => router.navigate(`/session/${sessionId}`));

    // Difficulty selection
    container.querySelectorAll('.difficulty-option').forEach((opt) => {
      opt.addEventListener('click', async () => {
        const difficulty = opt.dataset.difficulty;
        try {
          await updateSession(sessionId, { difficulty });
          session.difficulty = difficulty;
          render();
          toast.success(`Сложность: ${DIFFICULTY_PRESETS[difficulty].label}`);
        } catch (err) {
          toast.error('Ошибка: ' + err.message);
        }
      });
    });

    // PvP toggle
    document.getElementById('pvpToggle')?.addEventListener('click', async () => {
      try {
        const newPvp = !session.is_pvp_enabled;
        await updateSession(sessionId, { is_pvp_enabled: newPvp });
        session.is_pvp_enabled = newPvp;
        render();
        toast.success(`PvP: ${newPvp ? 'Включено' : 'Выключено'}`);
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });

    // Change active arc
    document.getElementById('plotStageSelect')?.addEventListener('change', async (e) => {
      try {
        const arcIdx = parseInt(e.target.value, 10);
        if (!session.storyline || isNaN(arcIdx)) return;
        session.storyline.current_arc_index = arcIdx;
        const currentStageTitle = session.storyline.arcs?.[arcIdx]?.title || `Акт ${arcIdx + 1}`;
        await updateStoryline(sessionId, session.storyline);
        await updateSession(sessionId, { current_plot_stage: currentStageTitle });
        session.current_plot_stage = currentStageTitle;
        toast.success(`Активна арка: ${currentStageTitle}`);
        render();
      } catch (err) {
        toast.error('Ошибка смены арки: ' + (err.message || err));
      }
    });

    // Generate story button
    document.getElementById('generateStoryBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('generateStoryBtn');
      const wishes = document.getElementById('genStoryWishes')?.value?.trim() || '';
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = '⏳ Генерация сюжета...';
        }
        toast.info('ИИ создаёт сюжетную кампанию по миру...');
        const newStory = await generateStorylineForSession({
          sessionId,
          worldId: session.world_id,
          customWishes: wishes,
        });
        session.storyline = newStory;
        toast.success('Сюжет создан!');
        render();
      } catch (err) {
        toast.error('Ошибка генерации: ' + (err.message || err));
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✨ Сгенерировать сюжетную кампанию по миру';
        }
      }
    });

    // Toggle rewrite container
    const rewriteBtn = document.getElementById('rewriteStoryBtn');
    const rewriteContainer = document.getElementById('rewriteStoryPromptContainer');
    rewriteBtn?.addEventListener('click', () => {
      if (rewriteContainer) {
        rewriteContainer.style.display = rewriteContainer.style.display === 'none' ? 'flex' : 'none';
      }
    });
    document.getElementById('cancelRewriteStoryBtn')?.addEventListener('click', () => {
      if (rewriteContainer) rewriteContainer.style.display = 'none';
    });

    // Confirm rewrite
    document.getElementById('confirmRewriteStoryBtn')?.addEventListener('click', async () => {
      const wishes = document.getElementById('rewriteStoryWishes')?.value?.trim() || '';
      const confirmBtn = document.getElementById('confirmRewriteStoryBtn');
      try {
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '⏳ Переписываю...';
        }
        toast.info('ИИ переписывает сюжет...');
        const updated = await rewriteStoryline({
          sessionId,
          worldId: session.world_id,
          customWishes: wishes,
          currentStoryline: session.storyline,
        });
        session.storyline = updated;
        toast.success('Сюжет обновлен!');
        render();
      } catch (err) {
        toast.error('Ошибка обновления сюжета: ' + (err.message || err));
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Переписать';
        }
      }
    });

    // Toggle edit JSON container
    const editJsonBtn = document.getElementById('editStoryJsonBtn');
    const editJsonContainer = document.getElementById('editStoryJsonContainer');
    const editJsonArea = document.getElementById('editStoryJsonArea');
    editJsonBtn?.addEventListener('click', () => {
      if (editJsonContainer) {
        const isHidden = editJsonContainer.style.display === 'none';
        editJsonContainer.style.display = isHidden ? 'flex' : 'none';
        if (isHidden && editJsonArea && session.storyline) {
          editJsonArea.value = JSON.stringify(session.storyline, null, 2);
        }
      }
    });
    document.getElementById('cancelEditStoryJsonBtn')?.addEventListener('click', () => {
      if (editJsonContainer) editJsonContainer.style.display = 'none';
    });

    // Save edit JSON
    document.getElementById('saveStoryJsonBtn')?.addEventListener('click', async () => {
      if (!editJsonArea) return;
      try {
        const parsed = JSON.parse(editJsonArea.value);
        await updateStoryline(sessionId, parsed);
        session.storyline = parsed;
        toast.success('Сюжет сохранён!');
        render();
      } catch (err) {
        toast.error('Ошибка сохранения JSON: ' + (err.message || err));
      }
    });

    // Delete story (Sandbox)
    document.getElementById('deleteStoryBtn')?.addEventListener('click', async () => {
      if (!confirm('Перейти в режим свободной песочницы и удалить текущий сюжет?')) return;
      try {
        await deleteStoryline(sessionId);
        session.storyline = null;
        toast.info('Сюжет удалён. Активен режим свободной песочницы.');
        render();
      } catch (err) {
        toast.error('Ошибка удаления: ' + (err.message || err));
      }
    });

    // Simulate NPC background
    document.getElementById('simulateNpcBtn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const daysInput = document.getElementById('npcSimDays');
      const days = parseInt(daysInput?.value) || 1;

      btn.textContent = '⏳ Симуляция...';
      btn.disabled = true;

      try {
        const result = await invokeFunction('simulate-npc-background', {
          session_id: sessionId,
          days_passed: days,
          user_id: user.id,
        });

        if (result && result.actions_count !== undefined) {
          toast.success(`События сгенерированы. NPC совершили действия (${result.actions_count})`);
        } else {
          toast.success('Симуляция завершена');
        }
      } catch (err) {
        toast.error('Ошибка симуляции: ' + (err.message || err));
      } finally {
        btn.textContent = '⏳ Симулировать жизнь NPC (Фон)';
        btn.disabled = false;
      }
    });

    // Copy session ID
    document.getElementById('copyIdBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(sessionId);
      toast.success('ID скопирован!');
    });

    // Copy invite link
    document.getElementById('copyInviteBtn')?.addEventListener('click', () => {
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      const url = `${window.location.origin}${basePath}#/session/${sessionId}`;
      navigator.clipboard.writeText(url);
      toast.success('Инвайт-ссылка скопирована!');
    });

    // Add bot
    document.getElementById('addBotBtn')?.addEventListener('click', async () => {
      try {
        const botName = 'NPC_' + Math.random().toString(36).slice(2, 6);
        await createPlayer({
          session_id: sessionId,
          user_id: null,
          name: botName,
          race: 'Человек',
          class: 'Гражданин',
          appearance: 'Обычный житель',
          personality: { ideals: [], flaws: [] },
          bio: 'NPC-персонаж, управляемый ИИ',
          power_level: 10,
          stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
          hp: calculateHpFromStats({ CON: 10 }),
          max_hp: calculateHpFromStats({ CON: 10 }),
          ...calculateDerivedStats({ CON: 10 }, 'Человек', [], getRaceAcBonus('Человек')),
          money: 0,
        });
        toast.success(`Бот ${botName} добавлен!`);
        load();
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
      }
    });
  }

  await load();
}
