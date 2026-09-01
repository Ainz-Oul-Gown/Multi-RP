// src/api/openrouter.js — Прямые запросы к OpenRouter (без лимитов Supabase)
import { OPENROUTER_API_KEY, AI_MODEL } from '../config.js';

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

import { supabase } from './supabase.js';

// Call OpenRouter directly from frontend (no Edge Function limits)
export async function callOpenRouter(systemPrompt, userMessage, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Укажите OpenRouter API Key в настройках аккаунта');
  }

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MultiRP-AI',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: options.temperature ?? 0.7,
      // No max_tokens limit - let the model generate as needed
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Count NPCs in text
export async function countNPCs(loreText) {
  const SYSTEM_PROMPT = `Подсчитай сколько NPC, существ, монстров и животных упоминается в тексте.
Ответь ТОЛЬКО одним числом (например: 22). Никакого текста, только число.`;

  const response = await callOpenRouter(SYSTEM_PROMPT, loreText);
  const match = response.match(/\d+/);
  return match ? parseInt(match[1], 10) : 0;
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

// Generate all NPCs in batches
export async function generateAllNPCs(loreText, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  
  // Step 1: Count NPCs
  onProgress({ step: 'counting', message: 'Подсчёт NPC в тексте...' });
  let totalCount = await countNPCs(loreText);
  if (totalCount === 0) {
    // Fallback
    totalCount = 10;
  }
  onProgress({ step: 'counting', total: totalCount, message: `Найдено ${totalCount} NPC` });

  // Step 2: Generate in batches
  const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
  const allNpcs = [];
  const generatedNames = new Set();

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, totalCount);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: totalCount,
      message: `Генерация NPC ${startIdx}-${endIdx} из ${totalCount}...`,
    });

    const batchNpcs = await generateNPCBatch(
      loreText,
      startIdx,
      endIdx,
      totalCount,
      Array.from(generatedNames)
    );

    if (Array.isArray(batchNpcs)) {
      for (const npc of batchNpcs) {
        const name = (npc.name || '').toLowerCase().trim();
        if (name && !generatedNames.has(name)) {
          generatedNames.add(name);
          allNpcs.push(npc);
        }
      }
    }
  }

  onProgress({ step: 'done', count: allNpcs.length, message: `Сгенерировано ${allNpcs.length} NPC` });
  return allNpcs;
}
