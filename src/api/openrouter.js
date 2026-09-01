// src/api/openrouter.js — Прямые запросы к OpenRouter (без лимитов Supabase)
import { OPENROUTER_API_KEY, AI_MODEL, CARD_GENERATION_MODELS } from '../config.js';
import { supabase, invokeFunction } from './supabase.js';
import { saveGenerationProgress, loadGenerationProgress, clearGenerationProgress } from '../utils/generationStore.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Get user settings (API key + models)
async function getUserSettings() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const { data } = await supabase
      .from('user_settings')
      .select('openrouter_key, card_model, dm_model')
      .eq('id', session.user.id)
      .maybeSingle();
    return data || {};
  }
  return {};
}

// Get API key from user settings or fallback
async function getApiKey() {
  const settings = await getUserSettings();
  return settings.openrouter_key || OPENROUTER_API_KEY;
}

// Get card generation model
async function getCardModel() {
  const settings = await getUserSettings();
  return settings.card_model || AI_MODEL;
}

// Call OpenRouter directly from frontend (no Edge Function limits)
export async function callOpenRouter(systemPrompt, userMessage, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Укажите OpenRouter API Key в настройках аккаунта');
  }

  // Use specified model or get from user settings
  const model = options.model || await getCardModel();
  
  // Determine provider based on model
  const getProvider = (modelId) => {
    if (modelId.includes('xiaomi')) return ['Xiaomi'];
    if (modelId.includes('z-ai')) return ['Z-AI'];
    if (modelId.includes('thinkingmachines')) return ['Thinking Machines'];
    if (modelId.includes('minimax')) return ['MiniMax'];
    if (modelId.includes('meta-llama')) return ['Meta'];
    if (modelId === 'openrouter/free') return []; // Auto-select
    return ['Xiaomi']; // default
  };

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: options.temperature ?? 0.7,
    provider: {
      order: getProvider(model),
      allow_fallbacks: options.allow_fallbacks ?? false,
    },
    reasoning: {
      effort: options.reasoningEffort || 'low',
    },
  };

  console.log('[callOpenRouter] Request:', {
    model: requestBody.model,
    provider: requestBody.provider,
    reasoning: requestBody.reasoning,
    userMsgLength: userMessage.length,
  });

  console.log('[callOpenRouter] Request:', {
    model: requestBody.model,
    provider: requestBody.provider,
    reasoning: requestBody.reasoning,
    userMsgLength: userMessage.length,
    systemMsgLength: systemPrompt.length,
  });

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MultiRP-AI',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[callOpenRouter] Response:', {
    provider: data.provider,
    model: data.model,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
    totalTokens: data.usage?.total_tokens,
    contentLength: data.choices?.[0]?.message?.content?.length,
  });
  return data.choices?.[0]?.message?.content || '';
}

// Count NPCs in text
export async function countNPCs(loreText) {
  const SYSTEM_PROMPT = `Подсчитай сколько NPC, существ, монстров и животных упоминается в тексте.
Ответь ТОЛЬКО одним числом (например: 22). Никакого текста, только число.`;

  const response = await callOpenRouter(SYSTEM_PROMPT, loreText);
  console.log('[countNPCs] Raw response:', response);
  const match = response.match(/\d+/);
  const count = match ? parseInt(match[0], 10) : 0;
  console.log('[countNPCs] Parsed count:', count);
  return count;
}

// Generate world geography (states and cities)
export async function generateWorldGeography(loreText, worldId, onProgress = () => {}) {
  console.log('[generateWorldGeography] Starting, loreText length:', loreText.length);
  
  const SYSTEM_PROMPT = `На основе описания мира создай географию: государства и города.
Правила:
- Если в тексте уже упоминаются государства/королевства/регионы — используй ВСЕ их (сколько бы их ни было)
- Если в тексте нет упоминаний государств — создай 3 новых государства
- Для каждого государства создай минимум 6 локаций: 1 столица (type: capital) + 5 городов/деревень/руин/достопримечательностей (type: city, village, ruins, landmark)
- Названия должны быть уникальными и соответствовать сеттингу мира
- Описания краткие, но атмосферные (1-2 предложения)
- ВСЕ названия и описания должны быть на русском языке

Верни ТОЛЬКО JSON объект:
{
  "states": [{"name": "Название государства", "description": "Описание"}],
  "locations": [{"name": "Название локации", "type": "capital|city|village|ruins|landmark", "state_name": "Название государства", "description": "Описание"}]
}`;

  onProgress({ step: 'geography_start', message: 'Генерация государств и городов...' });
  
  const response = await callOpenRouter(SYSTEM_PROMPT, loreText);
  
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      const objMatch = response.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        throw new Error('Не удалось распарсить ответ географии');
      }
    }
  }
  
  if (!parsed.states || !parsed.locations) {
    throw new Error('Некорректный формат ответа географии');
  }
  
  console.log('[generateWorldGeography] Generated:', parsed.states.length, 'states,', parsed.locations.length, 'locations');
  onProgress({ step: 'geography_done', states: parsed.states.length, locations: parsed.locations.length });
  
  return parsed;
}

// Save geography to DB
export async function saveWorldGeography(worldId, geography) {
  console.log('[saveWorldGeography] Saving geography for world:', worldId);
  
  const { supabase } = await import('./supabase.js');
  
  // Insert states
  const statesToInsert = geography.states.map(s => ({
    world_id: worldId,
    name: s.name,
    description: s.description || '',
  }));
  
  const { data: insertedStates, error: statesError } = await supabase
    .from('states')
    .insert(statesToInsert)
    .select();
  
  if (statesError) {
    console.error('[saveWorldGeography] States error:', statesError);
    throw statesError;
  }
  
  console.log('[saveWorldGeography] Saved', insertedStates.length, 'states');
  
  // Create state name -> id mapping
  const stateMap = {};
  insertedStates.forEach(s => {
    stateMap[s.name] = s.id;
  });
  
  // Insert locations
  const locationsToInsert = geography.locations.map(l => ({
    state_id: stateMap[l.state_name] || insertedStates[0]?.id,
    name: l.name,
    type: l.type || 'city',
    description: l.description || '',
  }));
  
  const { data: insertedLocations, error: locationsError } = await supabase
    .from('locations')
    .insert(locationsToInsert)
    .select();
  
  if (locationsError) {
    console.error('[saveWorldGeography] Locations error:', locationsError);
    throw locationsError;
  }
  
  console.log('[saveWorldGeography] Saved', insertedLocations.length, 'locations');
  
  return { states: insertedStates, locations: insertedLocations };
}

// Generate a batch of NPCs with geography context
export async function generateNPCBatch(loreText, startIdx, endIdx, totalCount, existingNames = [], geography = null) {
  const geographyContext = geography ? `
Доступные государства и локации мира:
${geography.states.map(s => `- ${s.name}: ${geography.locations.filter(l => l.state_name === s.name).map(l => l.name).join(', ')}`).join('\n')}

Для каждого NPC определи:
1. category: 'npc' (разумное существо), 'beast' (зверь), 'monster' (монстр), или 'boss' (босс)
2. location_name: название локации (только для category='npc')
3. state_name: название государства (для всех категорий)

Для зверей, монстров и боссов указывай только state_name (не location_name).
Для разумных NPC указывай и location_name, и state_name.` : '';

  const SYSTEM_PROMPT = `Извлеки из текста указанных NPC и сгенерируй для них характеристики.
Оцени уровень угрозы (Tier):
- Tier 1: Статы 4-10, HP 1-15.
- Tier 2: Статы 10-14, HP 15-40.
- Tier 3: Статы 14-18, HP 40-100.
- Tier 4: Статы 18-22, HP 100-250.
- Tier 5: Статы 22-26, HP 250-500.
${geographyContext}
Для каждого NPC определи категорию на основе имени, расы и описания:
- 'npc' — разумные существа (люди, эльфы, гномы, орки и т.д.), которые живут в городах
- 'beast' — животные и звери (волки, медведи, драконы, крысы и т.д.)
- 'monster' — монстры (гоблины, тролли, скелеты, демоны и т.д.)
- 'boss' — могущественные существа (короли демонов, древние драконы, лорды и т.д.)

ВАЖНО: ВСЕ тексты (имя, раса, описание внешности, предыстория, привычки, фразы) должны быть на русском языке!

Верни ТОЛЬКО JSON массив: [{name: 'Имя', role: 'main' или 'secondary', race: 'Раса', category: 'npc'|'beast'|'monster'|'boss', appearance: 'Описание внешности', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], location_name: 'Город или пусто', state_name: 'Государство', tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]`;

  const existingNpcsText = existingNames.length > 0
    ? `\n\nУже сгенерированные NPC (НЕ ДУБЛИРОВАТЬ): ${existingNames.join(', ')}`
    : '';

  const userMessage = `${loreText}${existingNpcsText}\n\nСгенерируй NPC с ${startIdx} по ${endIdx} (всего ${totalCount}). Только этих, без дубликатов.`;

  const response = await callOpenRouter(SYSTEM_PROMPT, userMessage);
  
  // Parse JSON from response
  try {
    // Try direct parse
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // Try to find array
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
    return [];
  }
}

// Generate all NPCs in batches and save to DB after each batch
export async function generateAllNPCs(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  console.log('[generateAllNPCs] Starting, loreText length:', loreText.length, 'worldId:', worldId);
  
  // Create location/state maps from geography
  const locationMap = {};
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
    geography.locations.forEach(l => {
      locationMap[l.name] = l.id;
      // Also map by state for fallback
      if (!stateMap[l.state_name] && l.state_id) {
        stateMap[l.state_name] = l.state_id;
      }
    });
  }
  
  // Helper to clean and save NPCs
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    
    const cleanedNpcs = npcs.map(npc => {
      const category = ['npc', 'beast', 'monster', 'boss'].includes(npc.category) ? npc.category : 'npc';
      // Only intelligent NPCs get a location
      const location_id = (category === 'npc' && npc.location_name) ? (locationMap[npc.location_name] || null) : null;
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      
      return {
        world_id: worldId,
        role: npc.role === 'main' ? 'main' : 'secondary',
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: (npc.race || 'Человек').slice(0, 50),
        category,
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10).map(String) : [],
        catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10).map(String) : [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || 30,
        max_hp: Number(npc.max_hp) || 30,
        location_id,
        state_id,
      };
    });

    console.log(`[saveNPCs] Saving ${cleanedNpcs.length} NPCs to DB...`);
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      console.log(`[saveNPCs] Saved ${result.count} NPCs`);
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Step 1: Count NPCs
  onProgress({ step: 'counting', message: 'Подсчёт NPC в тексте...' });
  let totalCount = await countNPCs(loreText);
  console.log('[generateAllNPCs] Count result:', totalCount);
  
  if (totalCount === 0) {
    totalCount = 10;
    console.log('[generateAllNPCs] Using fallback count:', totalCount);
  }
  onProgress({ step: 'counting', total: totalCount, message: `Найдено ${totalCount} NPC` });

  // Step 2: Generate in batches and save after each
  const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
  const allNpcs = [];
  const generatedNames = new Set();
  let totalSaved = 0;

  console.log('[generateAllNPCs] Will generate in', totalBatches, 'batches');

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, totalCount);
    
    console.log(`[generateAllNPCs] Batch ${batchNum + 1}/${totalBatches}: NPCs ${startIdx}-${endIdx}`);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: totalCount,
      message: `Генерация NPC ${startIdx}-${endIdx} из ${totalCount}...`,
    });

    try {
      const batchNpcs = await generateNPCBatch(
        loreText,
        startIdx,
        endIdx,
        totalCount,
        Array.from(generatedNames),
        geography
      );

      console.log(`[generateAllNPCs] Batch ${batchNum + 1} result:`, Array.isArray(batchNpcs) ? batchNpcs.length : 'not array', 'NPCs');

      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        // Add to local list for deduplication tracking
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }

        // Save this batch to DB immediately
        if (newNpcs.length > 0) {
          onProgress({
            step: 'saving',
            message: `Сохранение ${newNpcs.length} NPC в БД...`,
          });
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          console.log(`[generateAllNPCs] Total saved so far: ${totalSaved}`);
        }

        // If model returned more NPCs than expected (generated all at once), adjust
        if (batchNpcs.length >= totalCount) {
          console.log('[generateAllNPCs] Model returned all NPCs at once, stopping batches');
          break;
        }
      }
    } catch (batchErr) {
      console.error(`[generateAllNPCs] Batch ${batchNum + 1} failed:`, batchErr);
      // Continue with what we have
      if (allNpcs.length > 0) {
        break;
      }
      throw batchErr;
    }
  }

  console.log('[generateAllNPCs] Done. Total unique NPCs:', allNpcs.length, 'saved to DB:', totalSaved);
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Сгенерировано ${allNpcs.length}, сохранено ${totalSaved} NPC` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Generate intelligent NPCs (category: npc) with progress saving
export async function generateIntelligentNPCs(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  const STORAGE_KEY = `intelligent_npcs`;
  
  console.log('[generateIntelligentNPCs] Starting');
  
  // Load saved progress
  const progress = loadGenerationProgress(worldId) || {};
  const savedIntelligent = progress[STORAGE_KEY] || { generatedNames: [], totalSaved: 0, completed: false };
  
  if (savedIntelligent.completed) {
    console.log('[generateIntelligentNPCs] Already completed');
    onProgress({ step: 'done', message: 'Уже сгенерировано ранее', saved: savedIntelligent.totalSaved });
    return { npcs: [], saved: savedIntelligent.totalSaved, alreadyCompleted: true };
  }
  
  const generatedNames = new Set(savedIntelligent.generatedNames || []);
  let totalSaved = savedIntelligent.totalSaved || 0;
  
  // Count intelligent NPCs
  onProgress({ step: 'counting', message: 'Подсчёт разумных NPC...' });
  const totalCount = await countNPCs(loreText);
  const intelligentCount = Math.ceil(totalCount * 0.6); // ~60% are intelligent
  
  onProgress({ step: 'counting', total: intelligentCount, message: `Найдено ${intelligentCount} разумных NPC` });
  
  // Create location/state maps
  const locationMap = {};
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
    geography.locations.forEach(l => {
      locationMap[l.name] = l.id;
      if (!stateMap[l.state_name] && l.state_id) {
        stateMap[l.state_name] = l.state_id;
      }
    });
  }
  
  // Save helper
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    const cleanedNpcs = npcs.map(npc => {
      const location_id = npc.location_name ? (locationMap[npc.location_name] || null) : null;
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      return {
        world_id: worldId,
        role: npc.role === 'main' ? 'main' : 'secondary',
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: (npc.race || 'Человек').slice(0, 50),
        category: 'npc',
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10).map(String) : [],
        catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10).map(String) : [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || 30,
        max_hp: Number(npc.max_hp) || 30,
        location_id,
        state_id,
      };
    });
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Generate in batches
  const totalBatches = Math.ceil(intelligentCount / BATCH_SIZE);
  const allNpcs = [];
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, intelligentCount);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: intelligentCount,
      message: `Генерация разумных NPC ${startIdx}-${endIdx} из ${intelligentCount}...`,
    });
    
    try {
      const batchNpcs = await generateNPCBatch(
        loreText, startIdx, endIdx, intelligentCount,
        Array.from(generatedNames), geography
      );
      
      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            // Force category to 'npc' for intelligent batch
            npc.category = 'npc';
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }
        
        if (newNpcs.length > 0) {
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          
          // Save progress after each batch
          saveGenerationProgress(worldId, {
            [STORAGE_KEY]: {
              generatedNames: Array.from(generatedNames),
              totalSaved,
              completed: false,
            }
          });
        }
        
        if (batchNpcs.length >= intelligentCount) break;
      }
    } catch (batchErr) {
      console.error(`[generateIntelligentNPCs] Batch ${batchNum + 1} failed:`, batchErr);
      // Save progress before throwing
      saveGenerationProgress(worldId, {
        [STORAGE_KEY]: {
          generatedNames: Array.from(generatedNames),
          totalSaved,
          completed: false,
        }
      });
      if (allNpcs.length > 0) break;
      throw batchErr;
    }
  }
  
  // Mark as completed
  saveGenerationProgress(worldId, {
    [STORAGE_KEY]: {
      generatedNames: Array.from(generatedNames),
      totalSaved,
      completed: true,
    }
  });
  
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Разумные NPC сгенерировано: ${allNpcs.length}` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Generate non-intelligent creatures (beast, monster, boss) with progress saving
export async function generateCreatures(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 3;
  const STORAGE_KEY = `creatures`;
  
  console.log('[generateCreatures] Starting');
  
  // Load saved progress
  const progress = loadGenerationProgress(worldId) || {};
  const savedCreatures = progress[STORAGE_KEY] || { generatedNames: [], totalSaved: 0, completed: false };
  
  if (savedCreatures.completed) {
    console.log('[generateCreatures] Already completed');
    onProgress({ step: 'done', message: 'Уже сгенерировано ранее', saved: savedCreatures.totalSaved });
    return { npcs: [], saved: savedCreatures.totalSaved, alreadyCompleted: true };
  }
  
  const generatedNames = new Set(savedCreatures.generatedNames || []);
  let totalSaved = savedCreatures.totalSaved || 0;
  
  // Count creatures
  onProgress({ step: 'counting', message: 'Подсчёт существ...' });
  const totalCount = await countNPCs(loreText);
  const creatureCount = Math.ceil(totalCount * 0.4); // ~40% are creatures
  
  onProgress({ step: 'counting', total: creatureCount, message: `Найдено ${creatureCount} существ` });
  
  // Create state map
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
  }
  
  // Creature generation prompt
  const creaturePrompt = `На основе описания мира создай существ (звери, монстры, боссы).
Определи категорию на основе имени, расы и описания:
- 'beast' — животные и звери (волки, медведи, драконы, крысы)
- 'monster' — монстры (гоблины, тролли, скелеты, демон)
- 'boss' — могущественные существа (короли демонов, древние драконы, лордов)

${geography ? `Доступные государства:\n${geography.states.map(s => `- ${s.name}`).join('\n')}` : ''}

ВАЖНО: ВСЕ тексты (имя, раса, описание внешности, предыстория) должны быть на русском языке!

Верни ТОЛЬКО JSON массив: [{name: 'Имя', race: 'Раса', category: 'beast'|'monster'|'boss', appearance: 'Описание внешности', background: 'Предыстория', state_name: 'Государство', tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]`;
  
  // Save helper
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    const cleanedNpcs = npcs.map(npc => {
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      return {
        world_id: worldId,
        role: 'secondary',
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: (npc.race || 'Человек').slice(0, 50),
        category: ['beast', 'monster', 'boss'].includes(npc.category) ? npc.category : 'monster',
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: [],
        catchphrases: [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || 30,
        max_hp: Number(npc.max_hp) || 30,
        location_id: null, // Creatures don't have locations
        state_id,
      };
    });
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Generate in batches
  const totalBatches = Math.ceil(creatureCount / BATCH_SIZE);
  const allNpcs = [];
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, creatureCount);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: creatureCount,
      message: `Генерация существ ${startIdx}-${endIdx} из ${creatureCount}...`,
    });
    
    try {
      const userMessage = `${loreText}\n\nСгенерируй существ (звери, монстры, боссы) с ${startIdx} по ${endIdx} (всего ${creatureCount}). Только этих, без дубликатов. Уже сгенерированные: ${Array.from(generatedNames).join(', ')}`;
      
      const response = await callOpenRouter(creaturePrompt, userMessage);
      
      let batchNpcs;
      try {
        batchNpcs = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          batchNpcs = JSON.parse(jsonMatch[1]);
        } else {
          const arrayMatch = response.match(/\[[\s\S]*\]/);
          batchNpcs = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
        }
      }
      
      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }
        
        if (newNpcs.length > 0) {
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          
          // Save progress after each batch
          saveGenerationProgress(worldId, {
            [STORAGE_KEY]: {
              generatedNames: Array.from(generatedNames),
              totalSaved,
              completed: false,
            }
          });
        }
        
        if (batchNpcs.length >= creatureCount) break;
      }
    } catch (batchErr) {
      console.error(`[generateCreatures] Batch ${batchNum + 1} failed:`, batchErr);
      // Save progress before throwing
      saveGenerationProgress(worldId, {
        [STORAGE_KEY]: {
          generatedNames: Array.from(generatedNames),
          totalSaved,
          completed: false,
        }
      });
      if (allNpcs.length > 0) break;
      throw batchErr;
    }
  }
  
  // Mark as completed
  saveGenerationProgress(worldId, {
    [STORAGE_KEY]: {
      generatedNames: Array.from(generatedNames),
      totalSaved,
      completed: true,
    }
  });
  
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Существа сгенерированы: ${allNpcs.length}` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Check if generation can be resumed
export function canResumeGeneration(worldId) {
  const progress = loadGenerationProgress(worldId);
  if (!progress) return { intelligent: false, creatures: false };
  
  return {
    intelligent: progress.intelligent_npcs && !progress.intelligent_npcs.completed,
    creatures: progress.creatures && !progress.creatures.completed,
  };
}

// Clear all generation progress for a world
export function clearWorldGenerationProgress(worldId) {
  clearGenerationProgress(worldId);
}
