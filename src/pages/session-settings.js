// src/pages/session-settings.js — Экран настроек сессии (для Админа)
import { supabase, invokeFunction } from '../api/supabase.js';
import {
  getSession, updateSession, getSessionPlayers, createPlayer,
  getWorlds, getLoreFiles
} from '../api/game.js';
import { STATS, DIFFICULTY_PRESETS, calculateHpFromStats, calculateDerivedStats, getRaceAcBonus } from '../config.js';
import { toast } from '../utils/toast.js';
import { router } from '../router.js';

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
            <h2 class="card-title">📖 Управление сюжетом</h2>
            <p class="form-hint" style="margin-top: 0.5rem;">
              Если этап не выбран — активен режим «Песочница» (свободная игра без сюжетных зацепок)
            </p>
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Текущий Акт сюжета</label>
              <select class="input select" id="plotStage">
                <option value="">🎭 Песочница (без сюжета)</option>
                <option value="act_1" ${session.current_plot_stage === 'act_1' ? 'selected' : ''}>Акт I — Завязка</option>
                <option value="act_2" ${session.current_plot_stage === 'act_2' ? 'selected' : ''}>Акт II — Развитие</option>
                <option value="act_3" ${session.current_plot_stage === 'act_3' ? 'selected' : ''}>Акт III — Кульминация</option>
                <option value="act_4" ${session.current_plot_stage === 'act_4' ? 'selected' : ''}>Акт IV — Развязка</option>
              </select>
            </div>
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
                    <strong>${p.name}</strong>
                    <span class="text-muted" style="font-size: var(--fs-sm);">${p.race} / ${p.class}</span>
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

    // Plot stage
    document.getElementById('plotStage')?.addEventListener('change', async (e) => {
      try {
        const stage = e.target.value || null;
        await updateSession(sessionId, { current_plot_stage: stage });
        session.current_plot_stage = stage;
        toast.success(stage ? `Акт: ${stage}` : 'Режим: Песочница');
      } catch (err) {
        toast.error('Ошибка: ' + err.message);
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
