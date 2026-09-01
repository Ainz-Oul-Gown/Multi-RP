// supabase/functions/generate-world-npcs/index.ts
// Полная генерация NPC при создании мира на основе Матрицы Тиров
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const AI_MODEL = "xiaomi/mimo-v2.5";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Извлеки из текста всех упомянутых существ, NPC, врагов и животных.
Шаг 1: Оцени уровень угрозы (Tier) для каждого на основе контекста.
- Tier 1: Статы 4-10, HP 1-15.
- Tier 2: Статы 10-14, HP 15-40.
- Tier 3: Статы 14-18, HP 40-100.
- Tier 4: Статы 18-22, HP 100-250.
- Tier 5: Статы 22-26, HP 250-500.
Шаг 2: Сгенерируй им статы в рамках этого Тира.
Верни ТОЛЬКО JSON массив: [{name: 'Имя', role: 'main' или 'secondary', race: 'Раса', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], tier: INT, stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, hp: INT, max_hp: INT}]

ВАЖНО: Обработай ВЕСЬ переданный текст без исключения. Извлеки абсолютно КАЖДОГО упомянутого NPC, монстра и животное. Не сокращай список, выведи их всех.`;

async function callChatLLM(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
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
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(180000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Chat API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Split text into chunks by paragraphs, respecting max chunk size
function splitTextIntoChunks(text: string, maxChunkSize: number = 20000): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const raw = await req.text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Некорректный JSON в теле запроса" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const world_id = sanitizeKey(parsed.world_id);
    const lore_text = cleanTextForAI(parsed.lore_text);
    const user_id = sanitizeKey(parsed.user_id);

    console.log(`\n[generate-world-npcs] ═══════════════════════════════════════════════`);
    console.log(`[generate-world-npcs] 🐉 GENERATE WORLD NPCS START`);
    console.log(`[generate-world-npcs] ═══════════════════════════════════════════════`);
    console.log(`[generate-world-npcs] 📥 INPUT:`);
    console.log(`[generate-world-npcs]    • world_id: ${world_id}`);
    console.log(`[generate-world-npcs]    • user_id: ${user_id}`);
    console.log(`[generate-world-npcs]    • lore_text length: ${lore_text.length} chars`);

    if (!world_id || !lore_text) {
      console.error(`[generate-world-npcs] ❌ Missing required fields`);
      return new Response(
        JSON.stringify({ error: "world_id и lore_text обязательны" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Получаем API ключ
    let apiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);
    console.log(`[generate-world-npcs] 🔑 Fallback key available: ${apiKey ? "YES" : "NO"}`);

    if (user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key")
        .eq("id", user_id)
        .maybeSingle();
      if (userSettings?.openrouter_key) {
        apiKey = sanitizeKey(userSettings.openrouter_key);
        console.log(`[generate-world-npcs] 🔑 Using user key from settings`);
      }
    }

    if (!apiKey) {
      console.error(`[generate-world-npcs] ❌ No API key available`);
      return new Response(
        JSON.stringify({
          error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
          code: "MISSING_API_KEY",
        }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Вызываем LLM для генерации NPC
    console.log(`\n[generate-world-npcs] 🤖 Calling LLM to extract NPCs from lore...`);
    let npcs: any[];
    try {
      // Split large text into chunks to avoid timeouts
      const chunks = splitTextIntoChunks(lore_text, 20000);
      console.log(`[generate-world-npcs] 📄 Text split into ${chunks.length} chunk(s)`);

      // Limit to 3 chunks max to avoid resource limits
      const chunksToProcess = chunks.slice(0, 3);
      if (chunks.length > 3) {
        console.warn(`[generate-world-npcs] ⚠️ Text too large, processing first 3 chunks only (${chunks.length} total)`);
      }

      const allNpcs: any[] = [];
      for (let i = 0; i < chunksToProcess.length; i++) {
        console.log(`[generate-world-npcs] 🤖 Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
        const chunkPrompt = chunks.length > 1
          ? `${SYSTEM_PROMPT}\n\nЭто часть ${i + 1} из ${chunks.length} текста. Извлеки NPC из этой части.`
          : SYSTEM_PROMPT;
        const aiResponse = await callChatLLM(chunkPrompt, chunks[i], apiKey);
        console.log(`[generate-world-npcs] 🤖 Chunk ${i + 1} response: ${aiResponse.slice(0, 100)}...`);
        const chunkNpcs = parseAIJson(aiResponse);
        if (Array.isArray(chunkNpcs)) {
          allNpcs.push(...chunkNpcs);
        }
      }
      npcs = allNpcs;
    } catch (err) {
      console.error(`[generate-world-npcs] ❌ AI call failed:`, err);
      return new Response(
        JSON.stringify({ error: "Ошибка генерации NPC", details: err.message }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(npcs) || npcs.length === 0) {
      console.error(`[generate-world-npcs] ❌ No NPCs extracted from text`);
      return new Response(
        JSON.stringify({ error: "Не удалось извлечь NPC из текста" }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`[generate-world-npcs] ✅ Extracted ${npcs.length} NPCs`);

    // Подготавливаем данные для INSERT
    const npcsToInsert = npcs.map((npc) => ({
      world_id,
      role: npc.role === "main" ? "main" : "secondary",
      name: cleanTextForAI(npc.name),
      race: cleanTextForAI(npc.race) || "Человек",
      appearance: cleanTextForAI(npc.appearance) || "",
      background: cleanTextForAI(npc.background) || "",
      status_tags: Array.isArray(npc.status_tags) ? npc.status_tags : [],
      habits: Array.isArray(npc.habits) ? npc.habits : [],
      catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases : [],
      stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: Number(npc.hp) || 30,
      max_hp: Number(npc.max_hp) || 30,
    }));

    console.log(`\n[generate-world-npcs] 💾 Saving ${npcsToInsert.length} NPCs to DB...`);
    for (const npc of npcsToInsert) {
      console.log(`[generate-world-npcs]    • ${npc.name} (${npc.race}) - Tier: ${npc.tier || "?"}, HP: ${npc.hp}`);
    }

    // Массовый INSERT
    const { data: insertedNpcs, error: insertError } = await supabase
      .from("npcs")
      .insert(npcsToInsert)
      .select();

    if (insertError) {
      console.error(`[generate-world-npcs] ❌ Failed to insert NPCs:`, insertError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения NPC", details: insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log(`\n[generate-world-npcs] ✅ GENERATE WORLD NPCS COMPLETE`);
    console.log(`[generate-world-npcs]    • Inserted: ${insertedNpcs.length} NPCs`);
    console.log(`[generate-world-npcs] ═══════════════════════════════════════════════\n`);

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedNpcs.length,
        npcs: insertedNpcs,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-world-npcs error:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Internal error",
        details: err.message,
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
