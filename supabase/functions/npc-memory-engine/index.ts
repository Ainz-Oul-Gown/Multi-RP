// supabase/functions/npc-memory-engine/index.ts
// Движок Каскадной Памяти NPC: управление воспоминаниями (vivid -> medium -> belief)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

const EMBEDDING_MODEL = "baai/bge-m3";
const CHAT_MODEL = "xiaomi/mimo-v2.5";
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Каскадные лимиты
const CASCADE_LIMIT = 5;

// ============================================
// API-вызовы к OpenRouter
// ============================================

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SUPABASE_URL,
      "X-Title": "MultiRP-AI",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

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
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Chat API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// Основной обработчик
// ============================================

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

    const npc_id = sanitizeKey(parsed.npc_id);
    const player_id = sanitizeKey(parsed.player_id);
    const memory_text = cleanTextForAI(parsed.memory_text);

    console.log("npc-memory-engine input:", { npc_id, player_id, memory_text });

    if (!npc_id || !player_id || !memory_text) {
      return new Response(
        JSON.stringify({ error: "npc_id, player_id и memory_text обязательны" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Получаем API ключ
    let apiKey = sanitizeKey(FALLBACK_OPENROUTER_KEY);

    // Получаем player для нахождения user_id
    const { data: player } = await supabase
      .from("players")
      .select("user_id")
      .eq("id", player_id)
      .maybeSingle();

    if (player?.user_id) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("openrouter_key")
        .eq("id", player.user_id)
        .maybeSingle();
      if (userSettings?.openrouter_key) {
        apiKey = sanitizeKey(userSettings.openrouter_key);
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Укажите ваш OpenRouter API Key в настройках аккаунта.",
          code: "MISSING_API_KEY",
        }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ============================================
    // Задача 1: Векторизация и сохранение (Яркая память)
    // ============================================
    let embedding: number[];
    try {
      embedding = await generateEmbedding(memory_text, apiKey);
    } catch (err) {
      console.error("Embedding generation failed:", err);
      return new Response(
        JSON.stringify({ error: "Ошибка генерации эмбеддинга", details: err.message }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const { error: insertError } = await supabase.from("npc_memories").insert({
      npc_id,
      player_id,
      memory_text,
      memory_type: "vivid",
      embedding,
    });

    if (insertError) {
      console.error("Failed to insert vivid memory:", insertError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения воспоминания", details: insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    console.log("Vivid memory saved for npc:", npc_id);

    // ============================================
    // Задача 2: Логика каскада "Смещение 5-5-5"
    // ============================================

    let newBeliefCreated = false;
    let newBeliefText: string | null = null;

    // 2.1 Проверяем количество vivid воспоминаний
    const { count: vividCount, error: vividCountErr } = await supabase
      .from("npc_memories")
      .select("*", { count: "exact", head: true })
      .eq("npc_id", npc_id)
      .eq("player_id", player_id)
      .eq("memory_type", "vivid");

    if (vividCountErr) {
      console.error("Failed to count vivid memories:", vividCountErr);
    }

    // Если vivid > 5 → перемещаем самую старую в medium
    if ((vividCount ?? 0) > CASCADE_LIMIT) {
      const { data: oldestVivid } = await supabase
        .from("npc_memories")
        .select("id")
        .eq("npc_id", npc_id)
        .eq("player_id", player_id)
        .eq("memory_type", "vivid")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (oldestVivid) {
        const { error: updateError } = await supabase
          .from("npc_memories")
          .update({ memory_type: "medium" })
          .eq("id", oldestVivid.id);

        if (updateError) {
          console.error("Failed to update vivid to medium:", updateError);
        } else {
          console.log("Moved oldest vivid to medium:", oldestVivid.id);
        }
      }
    }

    // 2.2 Проверяем количество medium воспоминаний
    const { count: mediumCount, error: mediumCountErr } = await supabase
      .from("npc_memories")
      .select("*", { count: "exact", head: true })
      .eq("npc_id", npc_id)
      .eq("player_id", player_id)
      .eq("memory_type", "medium");

    if (mediumCountErr) {
      console.error("Failed to count medium memories:", mediumCountErr);
    }

    // Если medium > 5 → сжимаем 6 в 1 belief
    if ((mediumCount ?? 0) > CASCADE_LIMIT) {
      // Извлекаем текст всех 6 medium записей
      const { data: mediumMemories } = await supabase
        .from("npc_memories")
        .select("id, memory_text")
        .eq("npc_id", npc_id)
        .eq("player_id", player_id)
        .eq("memory_type", "medium")
        .order("created_at", { ascending: true })
        .limit(6);

      if (mediumMemories && mediumMemories.length === 6) {
        const memoriesText = mediumMemories.map((m, i) => `${i + 1}. ${m.memory_text}`).join("\n");

        // Вызываем LLM для сжатиения
        const compressionPrompt = `Ты психолог. Прочитай 6 воспоминаний NPC об игроке. Объедини их смысл в 1 короткое фундаментальное Убеждение (Belief) NPC об этом игроке. Верни строго 1 предложение без списков и вступлений.`;

        try {
          const beliefText = await callChatLLM(compressionPrompt, memoriesText, apiKey);
          const cleanBelief = beliefText.trim();

          // Удаляем 6 старых medium записей
          const idsToDelete = mediumMemories.map((m) => m.id);
          await supabase
            .from("npc_memories")
            .delete()
            .in("id", idsToDelete);

          // Генерируем вектор для нового убеждения
          const beliefEmbedding = await generateEmbedding(cleanBelief, apiKey);

          // Сохраняем belief
          await supabase.from("npc_memories").insert({
            npc_id,
            player_id,
            memory_text: cleanBelief,
            memory_type: "belief",
            embedding: beliefEmbedding,
          });

          newBeliefCreated = true;
          newBeliefText = cleanBelief;
          console.log("Created new belief:", cleanBelief);
        } catch (err) {
          console.error("Failed to compress medium to belief:", err);
        }
      }
    }

    // 2.3 Проверяем количество belief воспоминаний
    const { count: beliefCount, error: beliefCountErr } = await supabase
      .from("npc_memories")
      .select("*", { count: "exact", head: true })
      .eq("npc_id", npc_id)
      .eq("player_id", player_id)
      .eq("memory_type", "belief");

    if (beliefCountErr) {
      console.error("Failed to count belief memories:", beliefCountErr);
    }

    // Если belief > 5 → удаляем самое старое
    if ((beliefCount ?? 0) > CASCADE_LIMIT) {
      const { data: oldestBelief } = await supabase
        .from("npc_memories")
        .select("id")
        .eq("npc_id", npc_id)
        .eq("player_id", player_id)
        .eq("memory_type", "belief")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (oldestBelief) {
        await supabase
          .from("npc_memories")
          .delete()
          .eq("id", oldestBelief.id);
        console.log("Deleted oldest belief:", oldestBelief.id);
      }
    }

    // ============================================
    // Задача 3: Обновление Статуса (status_tags)
    // ============================================

    if (newBeliefCreated && newBeliefText) {
      // Получаем текущие status_tags NPC
      const { data: npcData } = await supabase
        .from("npcs")
        .select("status_tags")
        .eq("id", npc_id)
        .single();

      const currentTags = npcData?.status_tags ?? [];

      const statusPrompt = `Учитывая новое убеждение NPC об игроке, обнови его статус отношения. Верни массив из 1-3 коротких тегов в формате JSON: { "tags": ["друг", "наставник"] }. Допустимые примеры: Враг, Должник, Предатель, Раб, Любовь, Страх. Не пиши текст, только JSON.`;

      try {
        const tagsResponse = await callChatLLM(
          statusPrompt,
          `Текущие теги: ${JSON.stringify(currentTags)}\nНовое убеждение: ${newBeliefText}`,
          apiKey,
        );

        // Парсим JSON ответ
        const parsed = JSON.parse(tagsResponse);
        if (parsed.tags && Array.isArray(parsed.tags)) {
          await supabase
            .from("npcs")
            .update({ status_tags: parsed.tags })
            .eq("id", npc_id);
          console.log("Updated NPC status_tags:", parsed.tags);
        }
      } catch (err) {
        console.error("Failed to update status_tags:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Memory processed successfully",
        new_belief_created: newBeliefCreated,
        new_belief_text: newBeliefText,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("npc-memory-engine error:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Internal error",
        details: err.message,
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
