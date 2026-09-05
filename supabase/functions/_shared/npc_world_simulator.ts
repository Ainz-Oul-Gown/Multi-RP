// supabase/functions/_shared/npc_world_simulator.ts
// Фоновый процесс симуляции жизни мира после круга ходов (Round Cycle World Progression).
// Делает ровно 1 запрос к ИИ на всех удаленных NPC, контактировавших с игроками.

import { cleanTextForAI, parseAIJson } from "./utils.ts";

export interface NpcWorldActionResult {
  npc_id: string;
  npc_name: string;
  action_type: "travel" | "hunt_combat" | "trade_craft" | "train" | "quest" | "rest";
  new_location_id: string | null;
  new_location_name?: string | null;
  level_delta: number;
  xp_gained: number;
  obtained_item: string | null;
  item_type?: string | null;
  narrative_log: string;
}

export interface NpcWorldSimulationSummary {
  simulated_count: number;
  round_number: number;
  actions: NpcWorldActionResult[];
  chronicle_message?: string;
}

/**
 * Проверка и выполнение фоновой симуляции мира после круга ходов.
 */
export async function executeRoundCycleNpcSimulation(params: {
  supabase: any;
  sessionId: string;
  roundNumber: number;
  currentLocationId?: string | null;
  worldId?: string | null;
  loreContext?: string;
  storyline?: any;
  openrouterApiKey?: string;
  model?: string;
}): Promise<NpcWorldSimulationSummary> {
  const {
    supabase,
    sessionId,
    roundNumber,
    currentLocationId,
    worldId,
    loreContext = "",
    storyline,
    openrouterApiKey,
    model = "xiaomi/mimo-v2.5",
  } = params;

  console.log(`[npc_world_simulator] 🌍 Starting round ${roundNumber} simulation for session ${sessionId}...`);

  // 1. Получаем ID всех игроков в сессии
  const { data: players, error: plErr } = await supabase
    .from("players")
    .select("id, name, current_zone")
    .eq("session_id", sessionId);

  if (plErr || !players || players.length === 0) {
    console.log("[npc_world_simulator] No players in session, skipping simulation.");
    return { simulated_count: 0, round_number: roundNumber, actions: [] };
  }

  const playerIds = players.map((p: any) => p.id);

  // 2. Находим NPC, контактировавших с игроками сессии (по отношениям или воспоминаниям)
  const contactedNpcIds = new Set<string>();

  try {
    const { data: rels } = await supabase
      .from("npc_relationships")
      .select("npc_id, score, interactions_count")
      .in("player_id", playerIds);

    if (rels) {
      for (const r of rels) {
        if (r.npc_id && (r.interactions_count > 0 || r.score !== 0)) {
          contactedNpcIds.add(r.npc_id);
        }
      }
    }
  } catch (relErr) {
    console.warn("[npc_world_simulator] Relationships query failed:", relErr);
  }

  try {
    const { data: mems } = await supabase
      .from("npc_memories")
      .select("npc_id")
      .in("player_id", playerIds)
      .limit(30);

    if (mems) {
      for (const m of mems) {
        if (m.npc_id) contactedNpcIds.add(m.npc_id);
      }
    }
  } catch (memErr) {
    console.warn("[npc_world_simulator] Memories query failed:", memErr);
  }

  if (contactedNpcIds.size === 0) {
    console.log("[npc_world_simulator] No contacted NPCs found for this session.");
    return { simulated_count: 0, round_number: roundNumber, actions: [] };
  }

  // 3. Загружаем данные отобранных NPC
  const { data: npcsData, error: npcErr } = await supabase
    .from("npcs")
    .select("id, name, race, class, level, hp, max_hp, role, location_id, status_tags, temperament, motivation, current_activity, locations(name)")
    .in("id", Array.from(contactedNpcIds));

  if (npcErr || !npcsData || npcsData.length === 0) {
    return { simulated_count: 0, round_number: roundNumber, actions: [] };
  }

  // 4. Фильтруем: берем только живых и тех, кто НЕ находится рядом с игроком
  const isCompanion = (n: any) => {
    const role = (n.role || "").toLowerCase();
    const tags = Array.isArray(n.status_tags) ? n.status_tags.map((t: string) => String(t).toLowerCase()) : [];
    return role === "companion" || tags.some((t: string) => ["companion", "спутник", "в_отряде", "питомец", "приручен"].includes(t));
  };

  const distantNpcs = npcsData.filter((n: any) => {
    // Проверка жизнеспособности
    if (n.hp !== null && n.hp <= 0) return false;
    // Спутники в текущем отряде путешествуют вместе с игроком — исключаем
    if (isCompanion(n)) return false;
    // Если NPC в той же локации, что и игроки — он уже в текущей сцене
    if (currentLocationId && n.location_id === currentLocationId) return false;
    return true;
  }).slice(0, 8); // Лимит до 8 NPC в 1 запрос для оптимизации токенов и фокуса

  if (distantNpcs.length === 0) {
    console.log("[npc_world_simulator] All contacted NPCs are either companions or in the same location.");
    return { simulated_count: 0, round_number: roundNumber, actions: [] };
  }

  console.log(`[npc_world_simulator] 🎯 Found ${distantNpcs.length} distant contacted NPC(s) to simulate:`, distantNpcs.map((n: any) => n.name).join(", "));

  // 5. Загружаем список доступных локаций мира для возможных перемещений
  let availableLocations: Array<{ id: string; name: string; type: string }> = [];
  if (worldId) {
    try {
      const { data: locs } = await supabase
        .from("locations")
        .select("id, name, type")
        .eq("world_id", worldId)
        .limit(20);
      if (locs) availableLocations = locs;
    } catch (locErr) {
      console.warn("[npc_world_simulator] Locations query failed:", locErr);
    }
  }

  // 6. Формируем 1 единый запрос к ИИ
  let simulationActions: NpcWorldActionResult[] = [];

  if (openrouterApiKey) {
    try {
      const npcListText = distantNpcs.map((n: any) => {
        const locName = n.locations?.name || "В пути / окрестности";
        return `• ID: "${n.id}", Имя: "${n.name}", Раса: ${n.race || "Человек"}, Класс/роль: ${n.class || n.role || "Обыватель"}, Ур.${n.level || 1}, Текущая локация: "${locName}", Темперамент: ${n.temperament || "прагматик"}, Мотивация: "${n.motivation || "дела и заработок"}", Последнее дело: "${n.current_activity || "повседневные хлопоты"}"`;
      }).join("\n");

      const locListText = availableLocations.length > 0
        ? availableLocations.map((l: any) => `  - ID: "${l.id}", Название: "${l.name}" (${l.type})`).join("\n")
        : "  (Локации не определены, персонаж может перемещаться условно без смены ID)";

      const systemPrompt = `Ты — Движок Жизни Мира (Living World Engine) в ЛитРПГ/D&D игре.
Твоя задача — смоделировать за 1 шаг развитие мира: что сделали персонажи (NPC), пока герои были заняты своими делами за прошедший круг событий.

ПРАВИЛА:
1. Мир не стоит на месте. Персонажи преследуют свои цели: ремесленники мастерят и продают, охотники и бойцы добывают трофеи и растут в уровне, торговцы и путешественники отправляются в путь в другие города.
2. Для каждого персонажа определи его действие, подходящее под его класс, темперамент и мотивацию.
3. Если персонаж отправился в путешествие — выбери new_location_id СТРОГО из списка доступных локаций (или null, если остался на месте).
4. Если персонаж тренировался, охотился или дрался — level_delta может быть 1 (или 0).
5. Если создал или добыл полезную вещь — укажи obtained_item (короткое название предмета) и item_type (material, consumable, weapon, misc) или null.
6. narrative_log: живое описание действия в 1-2 предложениях от третьего лица на русском языке (например: "Бран отправился с караваном в Ривервуд за свежей партией медовухи, отбившись от стаи волков").

Отвечай СТРОГО валидным JSON без markdown-обёрток (\`\`\`json):
{
  "npc_actions": [
    {
      "npc_id": "uuid",
      "action_type": "travel" | "hunt_combat" | "trade_craft" | "train" | "quest" | "rest",
      "new_location_id": "uuid или null",
      "level_delta": 0 или 1,
      "xp_gained": 30,
      "obtained_item": "Название предмета или null",
      "item_type": "material" | "consumable" | "weapon" | "misc" | null,
      "narrative_log": "Текст действия"
    }
  ]
}`;

      const userMessage = `ЛОКАЦИИ МИРА:\n${locListText}\n\nПЕРСОНАЖИ:\n${npcListText}\n\n${loreContext ? `КОНТЕКСТ МИРА:\n${loreContext.slice(0, 400)}\n\n` : ""}Смоделируй действия каждого персонажа. Верни JSON.`;

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.6,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseAIJson(content);
          if (parsed && Array.isArray(parsed.npc_actions)) {
            for (const act of parsed.npc_actions) {
              const matchedNpc = distantNpcs.find((n: any) => n.id === act.npc_id);
              if (matchedNpc) {
                const matchedLoc = availableLocations.find((l: any) => l.id === act.new_location_id);
                simulationActions.push({
                  npc_id: matchedNpc.id,
                  npc_name: matchedNpc.name,
                  action_type: act.action_type || "trade_craft",
                  new_location_id: matchedLoc ? matchedLoc.id : null,
                  new_location_name: matchedLoc ? matchedLoc.name : null,
                  level_delta: Math.max(0, Math.min(2, Number(act.level_delta) || 0)),
                  xp_gained: Math.max(0, Math.min(200, Number(act.xp_gained) || 0)),
                  obtained_item: act.obtained_item && String(act.obtained_item) !== "null" ? String(act.obtained_item).trim() : null,
                  item_type: act.item_type || "misc",
                  narrative_log: act.narrative_log || `${matchedNpc.name} завершил свои дела.`,
                });
              }
            }
          }
        }
      }
    } catch (llmErr) {
      console.warn("[npc_world_simulator] AI call failed, using procedural fallback:", llmErr);
    }
  }

  // 7. Процедурный умный fallback (если ИИ недоступен)
  if (simulationActions.length === 0) {
    for (const npc of distantNpcs) {
      const isCombatant = ["воин", "страж", "рыцарь", "охотник", "разбойник"].some((c) => (npc.class || npc.role || "").toLowerCase().includes(c));
      const narrative = isCombatant
        ? `${npc.name} тренировался и патрулировал окрестности, поддерживая бдительность.`
        : `${npc.name} занимался торговлей и завершил повседневные хозяйственные дела.`;
      simulationActions.push({
        npc_id: npc.id,
        npc_name: npc.name,
        action_type: isCombatant ? "train" : "trade_craft",
        new_location_id: null,
        level_delta: 0,
        xp_gained: 20,
        obtained_item: null,
        narrative_log: narrative,
      });
    }
  }

  // 8. Применение мутаций в БД и сохранение логов
  const chronicleLines: string[] = [];

  for (const action of simulationActions) {
    const npc = distantNpcs.find((n: any) => n.id === action.npc_id);
    if (!npc) continue;

    const oldLocationId = npc.location_id;

    // А) Перемещение в новую локацию
    if (action.new_location_id && action.new_location_id !== oldLocationId) {
      try {
        await supabase
          .from("npcs")
          .update({ location_id: action.new_location_id })
          .eq("id", npc.id);
        console.log(`[npc_world_simulator] 🏃 ${npc.name} relocated to location ${action.new_location_id}`);
      } catch (locErr) {
        console.warn(`[npc_world_simulator] Relocation failed for ${npc.name}:`, locErr);
      }
    }

    // Б) Повышение уровня / XP
    if (action.level_delta > 0) {
      const newLevel = (npc.level || 1) + action.level_delta;
      const newMaxHp = (npc.max_hp || 30) + (action.level_delta * 5);
      const newHp = Math.min(newMaxHp, (npc.hp || 30) + (action.level_delta * 5));
      try {
        await supabase
          .from("npcs")
          .update({ level: newLevel, max_hp: newMaxHp, hp: newHp })
          .eq("id", npc.id);
        console.log(`[npc_world_simulator] 🎖️ ${npc.name} leveled up: ${npc.level} -> ${newLevel}`);
      } catch (lvlErr) {
        console.warn(`[npc_world_simulator] Level update failed for ${npc.name}:`, lvlErr);
      }
    }

    // В) Добавление полученного предмета в инвентарь NPC
    if (action.obtained_item) {
      try {
        await supabase.rpc("add_item_to_inventory", {
          p_npc_id: npc.id,
          p_item_name: action.obtained_item,
          p_quantity: 1,
          p_type: action.item_type || "misc",
          p_attributes: { acquired_during_round: roundNumber, activity: action.action_type },
        });
        console.log(`[npc_world_simulator] 🎒 ${npc.name} obtained item: "${action.obtained_item}"`);
      } catch (itemErr) {
        console.warn(`[npc_world_simulator] Item insert failed for ${npc.name}:`, itemErr);
      }
    }

    // Г) Обновление текущей активности
    try {
      await supabase
        .from("npcs")
        .update({
          current_activity: action.narrative_log,
          last_activity_time: new Date().toISOString(),
        })
        .eq("id", npc.id);
    } catch (actErr) {
      console.warn(`[npc_world_simulator] Activity update failed for ${npc.name}:`, actErr);
    }

    // Д) Запись в таблицу npc_world_logs
    try {
      await supabase.from("npc_world_logs").insert({
        session_id: sessionId,
        round_number: roundNumber,
        npc_id: npc.id,
        npc_name: npc.name,
        action_type: action.action_type,
        description: action.narrative_log,
        location_from_id: oldLocationId || null,
        location_to_id: action.new_location_id || oldLocationId || null,
        level_gained: action.level_delta,
        item_gained: action.obtained_item || null,
      });
    } catch (logErr) {
      console.warn(`[npc_world_simulator] npc_world_logs insert failed for ${npc.name}:`, logErr);
    }

    // Строка для общего системного сообщения
    let suffix = "";
    if (action.level_delta > 0) suffix += ` 🎖️[+${action.level_delta} ур.]`;
    if (action.obtained_item) suffix += ` 🎒[+${action.obtained_item}]`;
    if (action.new_location_name) suffix += ` 📍[в путь: ${action.new_location_name}]`;

    chronicleLines.push(`• **${npc.name}**: ${action.narrative_log}${suffix}`);
  }

  // 9. Создаем системное сообщение в чате с хроникой жизни мира
  let chronicleMessage = "";
  if (chronicleLines.length > 0) {
    chronicleMessage = `🌍 **[Хроника мира | Раунд ${roundNumber}]**\n` + chronicleLines.join("\n");
    try {
      await supabase.from("messages").insert({
        session_id: sessionId,
        sender_type: "system",
        sender_name: "Хроника мира",
        content: chronicleMessage,
        metadata: {
          type: "world_cycle_log",
          round_number: roundNumber,
          simulated_npc_count: simulationActions.length,
          is_global: true,
        },
      });
      console.log(`[npc_world_simulator] 📢 Broadcasted world chronicle for round ${roundNumber}`);
    } catch (msgErr) {
      console.warn("[npc_world_simulator] Failed to post chronicle message:", msgErr);
    }
  }

  return {
    simulated_count: simulationActions.length,
    round_number: roundNumber,
    actions: simulationActions,
    chronicle_message: chronicleMessage,
  };
}
