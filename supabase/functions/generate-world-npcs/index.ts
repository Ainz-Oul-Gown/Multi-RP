// supabase/functions/generate-world-npcs/index.ts
// Генерация NPC пакетами по 5 штук с предварительным подсчётом
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const BATCH_SIZE = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT_COUNT = `Подсчитай сколько NPC, существ, монстров и животных упоминается в тексте.
Ответь ТОЛЬКО одним числом (например: 22). Никакого текста, только число.`;

const SYSTEM_PROMPT_GENERATE = `Извлеки из текста указанных NPC и сгенерируй для них характеристики.
Оцени уровень угрозы (Tier):
- Tier 1: Статы 4-10, HP 1-15.
- Tier 2: Статы 10-14, HP 15-40.
- Tier 3: Статы 14-18, HP 40-100.
- Tier 4: Статы 18-22, HP 100-250.
- Tier 5: Статы 22-26, HP 250-500.
Верни ТОЛЬКО JSON массив: [{name: 'Имя', role: 'main' или 'secondary', race: 'Раса', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]`;

async function callChatLLM(systemPrompt: string, userMessage: string, apiKey: string, maxTokens: number = 4000): Promise<string> {
  console.log(`  📡 LLM call: max_tokens=${maxTokens}, userMsg length=${userMessage.length}`);
  const startTime = Date.now();
  
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SUPABASE_URL,
      "X-Title": "MultiRP-AI",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  });

  const elapsed = Date.now() - startTime;
  console.log(`  📡 LLM response: status=${response.status}, elapsed=${elapsed}ms`);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Chat API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function parseNPCCount(text: string): number {
  const match = text.match(/\d+/);
  return match ? parseInt(match[1], 10) : 0;
}

function cleanNPC(npc: any, world_id: string) {
  return {
    world_id,
    role: npc.role === "main" ? "main" : "secondary",
    name: cleanTextForAI(npc.name) || "Безымянный",
    race: cleanTextForAI(npc.race) || "Человек",
    appearance: cleanTextForAI(npc.appearance) || "",
    background: cleanTextForAI(npc.background) || "",
    status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10) : [],
    habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10) : [],
    catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10) : [],
    stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: Number(npc.hp) || 30,
    max_hp: Number(npc.max_hp) || 30,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[generate-world-npcs:${requestId}] ═══════════════════════════════════════`);
  console.log(`[generate-world-npcs:${requestId}] 🐉 NPC GENERATION START`);
  console.log(`[generate-world-npcs:${requestId}] ═══════════════════════════════════════`);

  try {
    const raw = await req.text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Некорректный JSON" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const world_id = sanitizeKey(parsed.world_id);
    const lore_text = cleanTextForAI(parsed.lore_text);
    const user_id = sanitizeKey(parsed.user_id);

    console.log(`[generate-world-npcs:${requestId}] 📥 INPUT:`);
    console.log(`[generate-world-npcs:${requestId}]    • world_id: ${world_id}`);
    console.log(`[generate-world-npcs:${requestId}]    • user_id: ${user_id}`);
    console.log(`[generate-world-npcs:${requestId}]    • lore_text: ${lore_text.length} chars`);

    if (!world_id || !lore_text) {
      return new Response(
        JSON.stringify({ error: "world_id и lore_text обязательны" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Получаем API ключ
    let apiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    if (user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key")
        .eq("id", user_id)
        .maybeSingle();
      if (userSettings?.openrouter_key) {
        apiKey = sanitizeKey(userSettings.openrouter_key);
        console.log(`[generate-world-npcs:${requestId}] 🔑 Using user key`);
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Укажите OpenRouter API Key", code: "MISSING_API_KEY" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ШАГ 1: Подсчёт количества NPC
    console.log(`\n[generate-world-npcs:${requestId}] 📊 STEP 1: Counting NPCs...`);
    let totalCount = 0;
    try {
      const countResponse = await callChatLLM(SYSTEM_PROMPT_COUNT, lore_text, apiKey, 100);
      console.log(`[generate-world-npcs:${requestId}] 📊 Raw count response: "${countResponse.trim()}"`);
      totalCount = parseNPCCount(countResponse);
      console.log(`[generate-world-npcs:${requestId}] 📊 Total NPCs detected: ${totalCount}`);
    } catch (err) {
      console.error(`[generate-world-npcs:${requestId}] ❌ Count failed:`, err);
      return new Response(
        JSON.stringify({ error: "Ошибка подсчёта NPC", details: err.message }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (totalCount === 0) {
      return new Response(
        JSON.stringify({ error: "NPC не найдены в тексте" }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ШАГ 2: Генерация пакетами по BATCH_SIZE
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
    console.log(`\n[generate-world-npcs:${requestId}] 🔄 STEP 2: Generating ${totalCount} NPCs in ${totalBatches} batches of ${BATCH_SIZE}`);

    const allNpcs: any[] = [];
    const generatedNames = new Set<string>();

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const startIdx = batchNum * BATCH_SIZE + 1;
      const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, totalCount);
      
      console.log(`\n[generate-world-npcs:${requestId}] 📦 Batch ${batchNum + 1}/${totalBatches} (NPCs ${startIdx}-${endIdx}):`);

      // Формируем контекст: уже сгенерированные NPC + запрос на следующие
      const existingNpcsText = allNpcs.length > 0
        ? `\n\nУже сгенерированные NPC (НЕ ДУБЛИРОВАТЬ): ${allNpcs.map(n => n.name).join(', ')}`
        : '';

      const batchUserMessage = `${lore_text}${existingNpcsText}\n\nСгенерируй NPC с ${startIdx} по ${endIdx} (всего ${totalCount}). Только этих, без дубликатов.`;

      try {
        const aiResponse = await callChatLLM(SYSTEM_PROMPT_GENERATE, batchUserMessage, apiKey, 3000);
        console.log(`[generate-world-npcs:${requestId}] 📦 Batch ${batchNum + 1} raw: ${aiResponse.slice(0, 150)}...`);
        
        const batchNpcs = parseAIJson(aiResponse);
        if (Array.isArray(batchNpcs)) {
          // Фильтруем дубликаты по имени
          for (const npc of batchNpcs) {
            const name = (npc.name || '').toLowerCase().trim();
            if (name && !generatedNames.has(name)) {
              generatedNames.add(name);
              allNpcs.push(npc);
            }
          }
          console.log(`[generate-world-npcs:${requestId}] 📦 Batch ${batchNum + 1}: got ${batchNpcs.length} NPCs (unique: ${allNpcs.length} total)`);
        } else {
          console.warn(`[generate-world-npcs:${requestId}] 📦 Batch ${batchNum + 1}: no valid array in response`);
        }
      } catch (err) {
        console.error(`[generate-world-npcs:${requestId}] 📦 Batch ${batchNum + 1} failed:`, err);
        // Продолжаем с тем, что есть
        if (allNpcs.length > 0) {
          console.log(`[generate-world-npcs:${requestId}] ⚠️ Continuing with ${allNpcs.length} NPCs generated so far`);
          break;
        }
        return new Response(
          JSON.stringify({ error: "Ошибка генерации NPC", details: err.message }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    }

    if (allNpcs.length === 0) {
      return new Response(
        JSON.stringify({ error: "Не удалось сгенерировать NPC" }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`\n[generate-world-npcs:${requestId}] ✅ Generated ${allNpcs.length} unique NPCs`);

    // ШАГ 3: Сохранение в БД
    console.log(`\n[generate-world-npcs:${requestId}] 💾 STEP 3: Saving to DB...`);
    const npcsToInsert = allNpcs.map(npc => cleanNPC(npc, world_id));
    
    for (const npc of npcsToInsert) {
      console.log(`[generate-world-npcs:${requestId}]    • ${npc.name} (${npc.race}) - HP: ${npc.hp}`);
    }

    const { data: insertedNpcs, error: insertError } = await supabase
      .from("npcs")
      .insert(npcsToInsert)
      .select();

    if (insertError) {
      console.error(`[generate-world-npcs:${requestId}] ❌ DB insert failed:`, insertError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения", details: insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`\n[generate-world-npcs:${requestId}] ═══════════════════════════════════════`);
    console.log(`[generate-world-npcs:${requestId}] ✅ COMPLETE: ${insertedNpcs.length} NPCs saved`);
    console.log(`[generate-world-npcs:${requestId}] ═══════════════════════════════════════\n`);

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedNpcs.length,
        total_expected: totalCount,
        batches: totalBatches,
        npcs: insertedNpcs,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[generate-world-npcs:${requestId}] ❌ FATAL:`, err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
