// src/api/openrouter.js — Прямые запросы к OpenRouter (без лимитов Supabase)
import { OPENROUTER_API_KEY, AI_MODEL } from '../config.js';
import { supabase, invokeFunction } from './supabase.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Get API key from user settings or fallback
async function getApiKey() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const { data } = await supabase
      .from('user_settings')
      .select('openrouter_key')
      .eq('id', session.user.id)
      .maybeSingle();
    if (data?.openrouter_key) return data.openrouter_key;
  }
  return OPENROUTER_API_KEY;
}

// Call OpenRouter directly from frontend (no Edge Function limits)
export async function callOpenRouter(systemPrompt, userMessage, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Укажите OpenRouter API Key в настройках аккаунта');
  }

  const requestBody = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: options.temperature ?? 0.7,
    // Force Xiaomi provider for faster/more reliable responses
    provider: {
      order: ['Xiaomi'],
      allow_fallbacks: false,
    },
    // Control reasoning: low effort = faster thinking
    reasoning: {
      effort: 'low',
    },
    // No max_tokens limit - let the model generate as needed
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

// Generate a batch of NPCs
export async function generateNPCBatch(loreText, startIdx, endIdx, totalCount, existingNames = []) {
  const SYSTEM_PROMPT = `Извлеки из текста указанных NPC и сгенерируй для них характеристики.
Оцени уровень угрозы (Tier):
- Tier 1: Статы 4-10, HP 1-15.
- Tier 2: Статы 10-14, HP 15-40.
- Tier 3: Статы 14-18, HP 40-100.
- Tier 4: Статы 18-22, HP 100-250.
- Tier 5: Статы 22-26, HP 250-500.
Верни ТОЛЬКО JSON массив: [{name: 'Имя', role: 'main' или 'secondary', race: 'Раса', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]`;

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
export async function generateAllNPCs(loreText, worldId, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  console.log('[generateAllNPCs] Starting, loreText length:', loreText.length, 'worldId:', worldId);
  
  // Helper to clean and save NPCs
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    
    const cleanedNpcs = npcs.map(npc => ({
      world_id: worldId,
      role: npc.role === 'main' ? 'main' : 'secondary',
      name: (npc.name || 'Безымянный').slice(0, 100),
      race: (npc.race || 'Человек').slice(0, 50),
      appearance: (npc.appearance || '').slice(0, 500),
      background: (npc.background || '').slice(0, 1000),
      status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
      habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10).map(String) : [],
      catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10).map(String) : [],
      stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: Number(npc.hp) || 30,
      max_hp: Number(npc.max_hp) || 30,
    }));

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
        Array.from(generatedNames)
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
