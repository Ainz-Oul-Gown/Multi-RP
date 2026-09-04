// src/api/storyline.js — Генератор, редактор и менеджер сюжетных линий на основе мира
import { supabase } from './supabase.js';
import { OPENROUTER_API_KEY, AI_MODEL } from '../config.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function resolveUserSettings() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const { data } = await supabase
      .from('user_settings')
      .select('openrouter_key, card_model, dm_model, satellite_model')
      .eq('id', session.user.id)
      .maybeSingle();
    return data || {};
  }
  return {};
}

/**
 * Загрузить полный контекст мира (география, лор, NPC, настройки) для генерации сюжета
 */
export async function loadWorldContext(worldId) {
  if (!worldId) return null;

  // 1. Мир и настройки
  const { data: world, error: worldErr } = await supabase
    .from('worlds')
    .select('id, name, description, settings')
    .eq('id', worldId)
    .single();

  if (worldErr || !world) {
    console.warn('[Storyline] Failed to load world:', worldErr);
    return null;
  }

  // 2. География (Регионы и локации)
  let states = [];
  try {
    const { data: statesData } = await supabase
      .from('states')
      .select('id, name, description, locations(id, name, type, description)')
      .eq('world_id', worldId);
    states = statesData || [];
  } catch (err) {
    console.warn('[Storyline] Failed to load geography:', err);
  }

  // 3. Файлы лора (история, религия, магия, фракции)
  let loreFiles = [];
  try {
    const { data: loreData } = await supabase
      .from('lore_files')
      .select('title, folder, content')
      .eq('world_id', worldId)
      .limit(8);
    loreFiles = loreData || [];
  } catch (err) {
    console.warn('[Storyline] Failed to load lore files:', err);
  }

  // 4. Ключевые NPC и боссы
  let npcs = [];
  try {
    const { data: npcData } = await supabase
      .from('npcs')
      .select('id, name, race, role, category, background, status_tags')
      .eq('world_id', worldId)
      .limit(20);
    npcs = npcData || [];
  } catch (err) {
    console.warn('[Storyline] Failed to load npcs:', err);
  }

  return {
    world,
    states,
    loreFiles,
    npcs,
  };
}

/**
 * Сформировать системный и пользовательский промпт для LLM на основе мира
 */
function buildStorylinePrompt(worldCtx, customWishes = '', currentStoryline = null) {
  const { world, states, loreFiles, npcs } = worldCtx;

  const geoSummary = states.map((s) => {
    const locNames = (s.locations || []).map((l) => `${l.name} (${l.type || 'локация'})`).join(', ');
    return `- Регион "${s.name}": ${locNames || 'нет локаций'}`;
  }).join('\n');

  const loreSummary = loreFiles.map((f) => `### ${f.title} (${f.folder || 'лор'}):\n${(f.content || '').slice(0, 350)}`).join('\n\n');

  const npcSummary = npcs.map((n) => `- ${n.name} (${n.race || 'Гуманоид'}, роль: ${n.role || 'второстепенный'}${n.category ? `, категория: ${n.category}` : ''}): ${(n.background || '').slice(0, 150)}`).join('\n');

  const systemPrompt = `Ты — ведущий игровой сценарист и архитектор нарратива настольных ролевых игр (D&D 5e / ЛитРПГ).
Твоя задача — создать захватывающую, живую сюжетную кампанию, ГЛУБОКО УКОРЕНЁННУЮ в переданном мире.

СТРОГИЕ ПРАВИЛА:
1. Используй РЕАЛЬНЫЕ названия локаций, фракций и имена NPC из переданного контекста мира. Не выдумывай чуждые локации, если они уже есть в мире.
2. Сюжет должен содержать:
   - title: Звучное, эпическое название кампании.
   - summary: Краткий синопсис общей тайны или конфликта (1-2 абзаца).
   - prologue: Вводная сцена («Появление героев в мире»). Опиши, где и в каких обстоятельствах начинается путь героев, какую начальную атмосферу и зацепку они видят прямо перед собой.
   - arcs: Массив из 3-4 последовательных арок (Акты I-IV):
     * id: "arc_1", "arc_2", "arc_3", "arc_4"
     * act: 1, 2, 3, 4
     * title: Название акта (например: "Акт I: Тени над Ривервудом")
     * description: Завязка и конфликт этого этапа сюжета
     * goals: Массив из 2-4 конкретных, достижимых целей (например: ["Осмотреть Ривервуд и расспросить торговца Гордона о ночных огнях", "Исследовать опушку леса и обнаружить источник искажения"])
     * completed_goals: []
     * key_npcs: Список имён 1-3 ключевых персонажей этого акта (из существующих в мире)
     * key_locations: Список названий 1-3 локаций этого акта (из существующих в мире)
     * status: для первой арки "active", для остальных "pending"
3. "Лыжи, но не правило": цели должны быть гибкими ориентирами, дающими игрокам свободу исследования.
4. Ответ СТРОГО в формате JSON без markdown-обёрток (\`\`\`json).`;

  let userPrompt = `МИР: "${world.name}"
ОПИСАНИЕ МИРА:
${world.description || 'Фэнтезийный мир приключений'}

ГЕОГРАФИЯ И ЛОКАЦИИ:
${geoSummary || 'Стандартные локации'}

ФАЙЛЫ ЛОРА:
${loreSummary || 'Нет записей лора'}

КЛЮЧЕВЫЕ ПЕРСОНАЖИ:
${npcSummary || 'Жители и странники'}`;

  if (currentStoryline) {
    userPrompt += `\n\nТЕКУЩИЙ СЮЖЕТ (для доработки/переписывания):\n${JSON.stringify(currentStoryline, null, 2)}`;
  }

  if (customWishes && customWishes.trim()) {
    userPrompt += `\n\nПОЖЕЛАНИЯ ИГРОКОВ К СЮЖЕТУ / ИЗМЕНЕНИЯ:\n${customWishes.trim()}`;
  }

  return { systemPrompt, userPrompt };
}

/**
 * Безопасный парсинг JSON из ответа LLM
 */
function safeParseStorylineJson(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('LLM did not return a valid JSON object');
  }
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(candidate);
}

/**
 * Сгенерировать сюжетную линию для сессии на основе мира
 */
export async function generateStorylineForSession({
  sessionId,
  worldId,
  customWishes = '',
  openrouterApiKey = null,
  model = null,
}) {
  const userSettings = await resolveUserSettings();
  const apiKey = openrouterApiKey || userSettings.openrouter_key || OPENROUTER_API_KEY;
  const chosenModel = model || userSettings.satellite_model || userSettings.dm_model || AI_MODEL;

  if (!apiKey) {
    throw new Error('Для генерации сюжета требуется API-ключ OpenRouter в настройках профиля');
  }

  const worldCtx = await loadWorldContext(worldId);
  if (!worldCtx) {
    throw new Error('Не удалось загрузить данные мира для генерации сюжета');
  }

  const { systemPrompt, userPrompt } = buildStorylinePrompt(worldCtx, customWishes);

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Пустой ответ от нейросети при генерации сюжета');
  }

  const parsed = safeParseStorylineJson(rawContent);

  // Нормализация структуры сюжета
  const storyline = {
    title: parsed.title || `Хроники мира ${worldCtx.world.name}`,
    summary: parsed.summary || 'Увлекательная кампания приключений.',
    prologue: parsed.prologue || 'Ваше путешествие начинается здесь.',
    current_arc_index: 0,
    status: 'in_progress',
    arcs: Array.isArray(parsed.arcs) ? parsed.arcs.map((arc, idx) => ({
      id: arc.id || `arc_${idx + 1}`,
      act: Number(arc.act) || idx + 1,
      title: arc.title || `Акт ${idx + 1}`,
      description: arc.description || '',
      goals: Array.isArray(arc.goals) ? arc.goals : [],
      completed_goals: Array.isArray(arc.completed_goals) ? arc.completed_goals : [],
      key_npcs: Array.isArray(arc.key_npcs) ? arc.key_npcs : [],
      key_locations: Array.isArray(arc.key_locations) ? arc.key_locations : [],
      status: idx === 0 ? 'active' : (arc.status || 'pending'),
    })) : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Сохранение в базу данных
  if (sessionId) {
    const firstArcTitle = storyline.arcs[0]?.title || 'Акт I';
    const { error: saveErr } = await supabase
      .from('sessions')
      .update({
        storyline,
        current_plot_stage: firstArcTitle,
      })
      .eq('id', sessionId);

    if (saveErr) {
      console.error('[Storyline] Error saving storyline to session:', saveErr);
      throw saveErr;
    }
  }

  return storyline;
}

/**
 * Переписать существующий сюжет с учётом замечаний/пожеланий
 */
export async function rewriteStoryline({
  sessionId,
  worldId,
  currentStoryline,
  customWishes = '',
  openrouterApiKey = null,
  model = null,
}) {
  const userSettings = await resolveUserSettings();
  const apiKey = openrouterApiKey || userSettings.openrouter_key || OPENROUTER_API_KEY;
  const chosenModel = model || userSettings.satellite_model || userSettings.dm_model || AI_MODEL;

  if (!apiKey) {
    throw new Error('Требуется API-ключ OpenRouter');
  }

  const worldCtx = await loadWorldContext(worldId);
  if (!worldCtx) {
    throw new Error('Не удалось загрузить мир');
  }

  const { systemPrompt, userPrompt } = buildStorylinePrompt(worldCtx, customWishes, currentStoryline);

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 2500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content;
  const parsed = safeParseStorylineJson(rawContent);

  const storyline = {
    title: parsed.title || currentStoryline?.title || `Хроники мира ${worldCtx.world.name}`,
    summary: parsed.summary || currentStoryline?.summary || '',
    prologue: parsed.prologue || currentStoryline?.prologue || '',
    current_arc_index: 0,
    status: 'in_progress',
    arcs: Array.isArray(parsed.arcs) ? parsed.arcs.map((arc, idx) => ({
      id: arc.id || `arc_${idx + 1}`,
      act: Number(arc.act) || idx + 1,
      title: arc.title || `Акт ${idx + 1}`,
      description: arc.description || '',
      goals: Array.isArray(arc.goals) ? arc.goals : [],
      completed_goals: [],
      key_npcs: Array.isArray(arc.key_npcs) ? arc.key_npcs : [],
      key_locations: Array.isArray(arc.key_locations) ? arc.key_locations : [],
      status: idx === 0 ? 'active' : 'pending',
    })) : [],
    created_at: currentStoryline?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (sessionId) {
    const firstArcTitle = storyline.arcs[0]?.title || 'Акт I';
    await supabase
      .from('sessions')
      .update({
        storyline,
        current_plot_stage: firstArcTitle,
      })
      .eq('id', sessionId);
  }

  return storyline;
}

/**
 * Сохранить ручные изменения сюжета (название, пролог, арки, цели)
 */
export async function updateStoryline(sessionId, storyline) {
  if (!sessionId || !storyline) return;
  storyline.updated_at = new Date().toISOString();

  const currentArc = storyline.arcs?.[storyline.current_arc_index || 0];
  const plotStage = currentArc?.title || 'Сюжет';

  const { error } = await supabase
    .from('sessions')
    .update({
      storyline,
      current_plot_stage: plotStage,
    })
    .eq('id', sessionId);

  if (error) {
    console.error('[Storyline] Error updating storyline:', error);
    throw error;
  }

  return storyline;
}

/**
 * Удалить сюжет сессии (перевод в режим «Песочница»)
 */
export async function deleteStoryline(sessionId) {
  if (!sessionId) return;
  const { error } = await supabase
    .from('sessions')
    .update({
      storyline: null,
      current_plot_stage: null,
    })
    .eq('id', sessionId);

  if (error) {
    console.error('[Storyline] Error deleting storyline:', error);
    throw error;
  }
}

/**
 * Переключить выполнение отдельной цели сюжета
 */
export async function toggleGoalCompletion(sessionId, storyline, arcId, goalText) {
  if (!storyline || !Array.isArray(storyline.arcs)) return storyline;

  const arc = storyline.arcs.find((a) => a.id === arcId);
  if (!arc) return storyline;

  if (!Array.isArray(arc.completed_goals)) {
    arc.completed_goals = [];
  }

  const idx = arc.completed_goals.indexOf(goalText);
  if (idx >= 0) {
    arc.completed_goals.splice(idx, 1);
  } else {
    arc.completed_goals.push(goalText);
  }

  // Если все цели выполнены, арка считается завершенной
  const allCompleted = arc.goals.length > 0 && arc.goals.every((g) => arc.completed_goals.includes(g));
  if (allCompleted) {
    arc.status = 'completed';
    // Если это была активная текущая арка и есть следующая, активируем следующую
    const currIdx = storyline.current_arc_index || 0;
    if (storyline.arcs[currIdx]?.id === arcId && currIdx + 1 < storyline.arcs.length) {
      storyline.current_arc_index = currIdx + 1;
      storyline.arcs[currIdx + 1].status = 'active';
    }
  }

  await updateStoryline(sessionId, storyline);
  return storyline;
}
