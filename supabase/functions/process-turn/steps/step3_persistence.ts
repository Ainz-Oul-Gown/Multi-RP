// supabase/functions/process-turn/steps/step3_persistence.ts
// Шаг 3: Мутация БД (ACID Транзакция)
// Применяет все мутации из Шага 2 атомарно через RPC apply_turn_mutations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EngineOutputPayload, EngineMutation } from "../engine/types.ts";
import { cleanTextForAI } from "../../_shared/utils.ts";

// ============================================
// Типы
// ============================================
export interface PersistenceInputContext {
  session_id: string;
  engine_output: EngineOutputPayload;
}

export interface PersistenceOutputPayload {
  status: "committed" | "aborted_conflict" | "error";
  applied_mutations_count: number;
  new_game_time?: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  conflict_details?: string | null;
  enriched_system_facts: string[];
}

// ============================================
// Коды ошибок, которые RPC может вернуть
// ============================================
const CONFLICT_CODES = new Set([
  "ITEM_NOT_AVAILABLE",
  "ITEM_NOT_FOUND",
  "ITEM_NOT_AVAILABLE_FOR_TRANSFER",
  "TARGET_NOT_FOUND",
  "SESSION_NOT_FOUND",
  "INVALID_TARGET_TYPE",
  "INVALID_OWNER_TYPE",
  "UNKNOWN_MUTATION_TYPE",
  "RACE_CONDITION_CONFLICT",
]);

function isConflictError(details: string | null | undefined): boolean {
  if (!details) return false;
  for (const code of CONFLICT_CODES) {
    if (details.includes(code)) return true;
  }
  return false;
}

// ============================================
// Обогащение фактов на основе применённых мутаций
// ============================================
function enrichSystemFacts(engine_output: EngineOutputPayload, rpcResult: any): string[] {
  const facts: string[] = [...engine_output.raw_system_facts];

  for (const mutation of engine_output.mutations) {
    const m = mutation as any;
    switch (m.type) {
      case "UPDATE_HP":
        if (m.delta < 0) {
          facts.push(`${m.target_type === "npc" ? "NPC" : "Игрок"} ${m.id.slice(0, 8)} получил ${-m.delta} урона.`);
        } else if (m.delta > 0) {
          facts.push(`${m.target_type === "npc" ? "NPC" : "Игрок"} ${m.id.slice(0, 8)} восстановил ${m.delta} HP.`);
        }
        break;
      case "UPDATE_DURABILITY":
        if (m.delta < 0) {
          facts.push(`Прочность предмета ${m.item_id.slice(0, 8)} уменьшена на ${-m.delta}.`);
          if (m.set_broken) {
            facts.push(`⚠️ Предмет ${m.item_id.slice(0, 8)} сломан.`);
          }
        }
        break;
      case "DELETE_ITEM":
        facts.push(`Удалено ${m.quantity} ед. предмета ${m.item_id.slice(0, 8)}.`);
        break;
      case "INSERT_ITEM": {
        const itemName = m.item?.item_name || m.item?.name || "предмет";
        const qty = m.item?.quantity || 1;
        facts.push(`Создан предмет: "${itemName}" x${qty} (owner: ${m.owner_type}).`);
        break;
      }
      case "TRANSFER_ITEM":
        facts.push(`Передано ${m.quantity} ед. предмета ${m.item_id.slice(0, 8)} → ${m.to_type}:${m.to_id.slice(0, 8)}.`);
        break;
      case "SPAWN_STRUCTURE":
        facts.push(`Создана структура "${m.structure?.name || "?"}" в локации ${m.location_id.slice(0, 8)}.`);
        break;
      case "ADVANCE_TIME":
        facts.push(`Время сдвинулось на ${m.minutes} минут.`);
        break;
    }
  }

  if (rpcResult?.new_time) {
    const t = rpcResult.new_time;
    facts.push(`Текущее время: ${t.day}.${t.month}.${t.year} ${t.hour}:${String(t.minute).padStart(2, "0")}.`);
  }

  facts.push(`✅ Применено мутаций: ${rpcResult?.applied_count ?? engine_output.mutations.length}.`);

  return facts;
}

// ============================================
// Lazy Supabase client
// ============================================
let _supabase: any = null;

function getSupabase() {
  if (_supabase) return _supabase;
  // @ts-ignore
  const supabaseUrl = (typeof Deno !== "undefined" ? Deno.env.get("SUPABASE_URL") : null) ?? process.env?.SUPABASE_URL ?? "https://test.supabase.co";
  // @ts-ignore
  const supabaseKey = (typeof Deno !== "undefined" ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") : null) ?? process.env?.SUPABASE_SERVICE_ROLE_KEY ?? "test-key";
  _supabase = createClient(supabaseUrl, supabaseKey);
  return _supabase;
}

// ============================================
// Главная функция Шага 3
// ============================================
export async function applyTurnMutations(context: PersistenceInputContext, supabaseOverride?: any): Promise<PersistenceOutputPayload> {
  const { session_id, engine_output } = context;

  // ============================================
  // Если мутаций нет — сразу "committed"
  // ============================================
  if (!engine_output.mutations || engine_output.mutations.length === 0) {
    return {
      status: "committed",
      applied_mutations_count: 0,
      enriched_system_facts: [
        ...engine_output.raw_system_facts,
        "Нет мутаций для применения.",
      ],
    };
  }

  const supabase = supabaseOverride || getSupabase();

  try {
    console.log(`[step3_persistence] Applying ${engine_output.mutations.length} mutations to session ${session_id}...`);

    // ============================================
    // Вызов RPC
    // ============================================
    const { data, error } = await supabase.rpc("apply_turn_mutations", {
      p_mutations: engine_output.mutations,
      p_session_id: session_id,
    });

    if (error) {
      console.error(`[step3_persistence] RPC error:`, error);

      if (isConflictError(error.message)) {
        return {
          status: "aborted_conflict",
          applied_mutations_count: 0,
          conflict_details: error.message,
          enriched_system_facts: [
            "Действие отменено: предмет был перемещён или уничтожен до завершения действия (race condition).",
            ...engine_output.raw_system_facts,
          ],
        };
      }

      return {
        status: "error",
        applied_mutations_count: 0,
        conflict_details: error.message,
        enriched_system_facts: [
          `Системная ошибка при применении мутаций: ${error.message}`,
          ...engine_output.raw_system_facts,
        ],
      };
    }

    // ============================================
    // Проверяем data.success (RPC может вернуть структуру ошибки)
    // ============================================
    if (data && typeof data === "object") {
      if (data.success === false) {
        const details = data.details || "Unknown error";
        console.warn(`[step3_persistence] RPC returned error: ${details}`);

        if (isConflictError(details)) {
          return {
            status: "aborted_conflict",
            applied_mutations_count: 0,
            conflict_details: details,
            enriched_system_facts: [
              "Действие отменено: race condition или отсутствие ресурсов.",
              ...engine_output.raw_system_facts,
            ],
          };
        }

        return {
          status: "error",
          applied_mutations_count: 0,
          conflict_details: details,
          enriched_system_facts: [
            `Системная ошибка: ${details}`,
            ...engine_output.raw_system_facts,
          ],
        };
      }

      // Успех
      const enriched = enrichSystemFacts(engine_output, data);
      console.log(`[step3_persistence] ✅ Committed ${data.applied_count} mutations`);

      return {
        status: "committed",
        applied_mutations_count: data.applied_count || 0,
        new_game_time: data.new_time,
        enriched_system_facts: enriched,
      };
    }

    // Fallback: пустой ответ
    return {
      status: "committed",
      applied_mutations_count: engine_output.mutations.length,
      enriched_system_facts: engine_output.raw_system_facts,
    };

  } catch (err) {
    console.error(`[step3_persistence] Exception:`, err);
    const message = err instanceof Error ? err.message : String(err);

    if (isConflictError(message)) {
      return {
        status: "aborted_conflict",
        applied_mutations_count: 0,
        conflict_details: message,
        enriched_system_facts: [
          "Действие отменено: race condition.",
          ...engine_output.raw_system_facts,
        ],
      };
    }

    throw new Error(`Step 3 persistence failed: ${message}`);
  }
}

