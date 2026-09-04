// supabase/functions/process-turn/steps/npc_memory_updater.ts
// Автоматическая оценка взаимодействий с NPC, обновление шкалы отношений и запись воспоминаний
import {
  calculateRelationshipTier,
  getRelationshipTierLabel,
  buildMemoryEvaluationPrompt,
  buildFallbackMemoryEvaluation,
  getMemoryTierFromVividness,
  EvaluatedMemoryResult,
} from "../../_shared/npc_relationship_engine.ts";
import { cleanTextForAI, parseAIJson } from "../../_shared/utils.ts";

export interface NpcUpdateSummary {
  npc_id: string;
  npc_name: string;
  score: number;
  delta: number;
  tier: string;
  tier_label: string;
  vividness: number;
  memory_text: string;
}

export async function processNpcInteractions(params: {
  supabase: any;
  session_id: string;
  acting_player: { id: string; name: string; race?: string; class?: string };
  action_text: string;
  router_result: any;
  engine_result: any;
  narrator_output: any;
  all_npcs: any[];
  openrouter_api_key?: string;
  chat_model?: string;
}): Promise<NpcUpdateSummary[]> {
  const {
    supabase,
    acting_player,
    action_text,
    router_result,
    engine_result,
    narrator_output,
    all_npcs,
    openrouter_api_key,
    chat_model = "xiaomi/mimo-v2.5",
  } = params;

  if (!all_npcs || all_npcs.length === 0) return [];

  // 1. Определяем NPC, с которыми взаимодействовал игрок
  const interactedNpcs: any[] = [];
  const actions = router_result?.actions || [];

  for (const act of actions) {
    const targetId = act.target_entity_id;
    if (targetId) {
      const found = all_npcs.find((n) => n.id === targetId);
      if (found && !interactedNpcs.some((n) => n.id === found.id)) {
        interactedNpcs.push(found);
      }
    }
  }

  // Если цель не была указана явно через ID, проверяем упоминание имени в тексте
  const lowerAction = (action_text || "").toLowerCase();
  for (const n of all_npcs) {
    if (n.name && lowerAction.includes(n.name.toLowerCase())) {
      if (!interactedNpcs.some((item) => item.id === n.id)) {
        interactedNpcs.push(n);
      }
    }
  }

  if (interactedNpcs.length === 0) return [];

  const results: NpcUpdateSummary[] = [];

  for (const npc of interactedNpcs) {
    try {
      // 2. Получаем текущие отношения с этим игроком
      const { data: existingRel } = await supabase
        .from("npc_relationships")
        .select("*")
        .eq("npc_id", npc.id)
        .eq("player_id", acting_player.id)
        .maybeSingle();

      const currentScore = existingRel?.score ?? 0;
      const currentTier = existingRel?.tier ?? "neutral";
      const currentTags = existingRel?.status_tags ?? [];

      // 3. Оцениваем взаимодействие через LLM или fallback
      let evaluation: EvaluatedMemoryResult;
      const isAttackAction = actions.some(
        (a: any) => (a.action_type === "attack" || a.action_type === "stealth_attack") && a.target_entity_id === npc.id
      );

      const outcomeSnippet = typeof narrator_output?.players?.[acting_player.id] === "string"
        ? narrator_output.players[acting_player.id].slice(0, 300)
        : "";

      if (openrouter_api_key) {
        try {
          const prompt = buildMemoryEvaluationPrompt({
            npc: {
              name: npc.name,
              race: npc.race,
              role: npc.role,
              background: npc.background,
              habits: npc.habits,
              catchphrases: npc.catchphrases,
            },
            player: {
              name: acting_player.name,
              race: acting_player.race,
              class: acting_player.class,
            },
            current_relationship: {
              score: currentScore,
              tier: currentTier,
              status_tags: currentTags,
            },
            action_text,
            action_type: actions[0]?.action_type || "interaction",
            outcome_text: outcomeSnippet,
          });

          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouter_api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: chat_model,
              messages: [
                { role: "system", content: "Ты — модуль формирования воспоминаний NPC. Отвечай строго в формате JSON." },
                { role: "user", content: prompt },
              ],
              temperature: 0.7,
              max_tokens: 500,
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (resp.ok) {
            const data = await resp.json();
            const rawContent = data.choices?.[0]?.message?.content || "";
            const parsed = parseAIJson(rawContent);

            if (parsed && typeof parsed.memory_text === "string") {
              const vividness = Math.max(1, Math.min(10, Number(parsed.vividness) || 5));
              const delta = Math.max(-30, Math.min(30, Number(parsed.relationship_delta) || 0));
              evaluation = {
                memory_text: parsed.memory_text.trim(),
                vividness,
                tier: getMemoryTierFromVividness(vividness),
                emotional_tone: parsed.emotional_tone || "neutral",
                relationship_delta: delta,
                status_tags: Array.isArray(parsed.status_tags) ? parsed.status_tags : [],
                significance_reason: parsed.significance_reason || "",
              };
            } else {
              evaluation = buildFallbackMemoryEvaluation({
                npc: { name: npc.name },
                player: { name: acting_player.name },
                action_text,
                action_type: actions[0]?.action_type,
                outcome_text: outcomeSnippet,
                is_attack: isAttackAction,
              });
            }
          } else {
            evaluation = buildFallbackMemoryEvaluation({
              npc: { name: npc.name },
              player: { name: acting_player.name },
              action_text,
              action_type: actions[0]?.action_type,
              outcome_text: outcomeSnippet,
              is_attack: isAttackAction,
            });
          }
        } catch {
          evaluation = buildFallbackMemoryEvaluation({
            npc: { name: npc.name },
            player: { name: acting_player.name },
            action_text,
            action_type: actions[0]?.action_type,
            outcome_text: outcomeSnippet,
            is_attack: isAttackAction,
          });
        }
      } else {
        evaluation = buildFallbackMemoryEvaluation({
          npc: { name: npc.name },
          player: { name: acting_player.name },
          action_text,
          action_type: actions[0]?.action_type,
          outcome_text: outcomeSnippet,
          is_attack: isAttackAction,
        });
      }

      // 4. Сохраняем воспоминание в npc_memories
      try {
        await supabase.from("npc_memories").insert({
          npc_id: npc.id,
          player_id: acting_player.id,
          memory_text: evaluation.memory_text,
          memory_type: evaluation.tier,
          vividness: evaluation.vividness,
          emotional_tone: evaluation.emotional_tone,
          significance_reason: evaluation.significance_reason,
        });
      } catch (insertMemErr) {
        console.warn(`[npc_memory_updater] Failed to insert memory for ${npc.name}:`, insertMemErr);
      }

      // 5. Обновляем шкалу отношений в npc_relationships
      const newScore = Math.max(-100, Math.min(100, currentScore + evaluation.relationship_delta));
      const newTier = calculateRelationshipTier(newScore);
      const mergedTags = Array.from(new Set([...currentTags, ...evaluation.status_tags]));

      try {
        if (existingRel) {
          await supabase
            .from("npc_relationships")
            .update({
              score: newScore,
              tier: newTier,
              status_tags: mergedTags,
              interactions_count: (existingRel.interactions_count || 0) + 1,
              last_interaction_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingRel.id);
        } else {
          await supabase.from("npc_relationships").insert({
            npc_id: npc.id,
            player_id: acting_player.id,
            score: newScore,
            tier: newTier,
            status_tags: mergedTags,
            interactions_count: 1,
            last_interaction_at: new Date().toISOString(),
          });
        }
      } catch (relErr) {
        console.warn(`[npc_memory_updater] Failed to update relationship for ${npc.name}:`, relErr);
      }

      results.push({
        npc_id: npc.id,
        npc_name: npc.name,
        score: newScore,
        delta: evaluation.relationship_delta,
        tier: newTier,
        tier_label: getRelationshipTierLabel(newTier),
        vividness: evaluation.vividness,
        memory_text: evaluation.memory_text,
      });
    } catch (err) {
      console.warn(`[npc_memory_updater] Error processing NPC ${npc.name}:`, err);
    }
  }

  return results;
}
