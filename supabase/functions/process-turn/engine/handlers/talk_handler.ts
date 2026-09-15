// supabase/functions/process-turn/engine/handlers/talk_handler.ts
// Обработчик разговора / социального взаимодействия

import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext } from "../types.ts";
import { RouterAction } from "../../types.ts";

export class TalkHandler extends BaseActionHandler {
  readonly action_type = "talk";

  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult {
    const player = context.acting_player;
    const rawText = (context as any)?.raw_action_text || (action as any)?.speech || "";
    const rawLower = rawText.toLowerCase();
    const hint = (((action as any).target_entity_name || (action as any).target_name || action.target_item_name || "") as string).toLowerCase().trim();

    // 1. ПРИОРИТЕТ: Проверяем, обращается ли игрок по имени к другому игроку сессии (в тексте или в hint)
    let targetPlayer: any = null;
    for (const [id, p] of context.targets.players.entries()) {
      if (id !== player.id && p.name) {
        const pNameLower = p.name.trim().toLowerCase();
        const nameRegex = new RegExp(`(^|[\\s,."«*!?])${pNameLower}[а-я]*([\\s,."»*!?]|$)`, 'i');
        if (
          nameRegex.test(rawLower) ||
          rawLower.includes(pNameLower) ||
          (hint && (pNameLower.includes(hint) || hint.includes(pNameLower)))
        ) {
          targetPlayer = p;
          break;
        }
      }
    }

    // 2. Если по тексту/hint не нашли, проверяем target_entity_id среди игроков
    if (!targetPlayer && action.target_entity_id) {
      targetPlayer = this.findPlayerById(context, action.target_entity_id);
    }

    // 3. Если это диалог с другим живым игроком — НИКОГДА не ищем NPC и не бросаем кубики!
    if (targetPlayer) {
      const speechMatch = rawText.match(/[«"]([^»"]{1,120})[»"]/);
      const speechContent = speechMatch ? speechMatch[1] : rawText.trim();
      const fact = speechContent
        ? `${player.name} обращается к ${targetPlayer.name}: «${speechContent}».`
        : `${player.name} обращается к ${targetPlayer.name}.`;

      return {
        result: {
          action_type: this.action_type,
          success: true,
          target_entity_id: targetPlayer.id,
          target_type: "player",
          target_id: targetPlayer.id,
          details: `Обращение к игроку ${targetPlayer.name}`,
        } as any,
        mutations: [],
        system_facts: [fact],
      };
    }

    // 4. Только если цель точно не живой игрок — ищем NPC

    // УРОВЕНЬ 1: По UUID из роутера
    let targetNpc = this.findNpcById(context, action.target_entity_id || "");

    // УРОВЕНЬ 2: По имени (hint из AI-роутера / классификатора)
    if (!targetNpc) {
      const hint = (
        (action as any).target_entity_name ||
        (action as any).target_name ||
        action.target_item_name || ""
      ).toLowerCase().trim();

      if (hint) {
        for (const [_id, n] of context.targets.npcs.entries()) {
          const nLower = n.name.toLowerCase();
          if (nLower.includes(hint) || hint.includes(nLower)) {
            targetNpc = n;
            break;
          }
        }
      }
    }

    // УРОВЕНЬ 3: По профессии/роли — ищем ключевые слова из реплики игрока
    // в полях background и name каждого NPC (данные приходят из БД)
    if (!targetNpc) {
      // Берём существительные из реплики (слова длиннее 3 букв, не частицы)
      const stopWords = new Set(["что", "как", "где", "кто", "его", "ему", "свой", "мне", "меня", "нас", "вас", "это", "она", "они", "оно", "тот", "эта", "эти"]);
      const keywords = rawLower
        .split(/[\s,.!?«»"']+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      if (keywords.length > 0) {
        let bestMatch: any = null;
        let bestScore = 0;

        for (const [_id, n] of context.targets.npcs.entries()) {
          if (n.is_hostile) continue; // не ищем среди врагов

          // Поля для поиска: background содержит профессиональное описание
          const searchText = [
            n.name || "",
            n.background || "",
            n.appearance || "",
            n.category || "",
          ].join(" ").toLowerCase();

          // Считаем сколько ключевых слов из реплики попало в описание NPC
          const score = keywords.filter(w => searchText.includes(w)).length;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = n;
          }
        }

        // Берём только если хоть одно ключевое слово совпало
        if (bestScore > 0) {
          targetNpc = bestMatch;
        }
      }
    }

    // УРОВЕНЬ 4: Ближайший дружественный NPC рядом
    if (!targetNpc) {
      const friendlyNpcs = Array.from(context.targets.npcs.values()).filter(
        (n: any) => !n.is_hostile && n.is_alive !== false
      );
      if (friendlyNpcs.length > 0) {
        targetNpc = friendlyNpcs[0];
      }
    }

    // Если рядом вообще нет NPC (одиночество в дикой зоне) — речь звучит вслух в окружающий мир
    if (!targetNpc) {
      const speechMatch = rawText.match(/[«"]([^»"]{1,120})[»"]/);
      const speechContent = speechMatch ? speechMatch[1] : rawText.trim();
      return {
        result: {
          action_type: this.action_type,
          success: true,
          details: "Слова сказаны вслух в окружающее пространство",
        },
        mutations: [],
        system_facts: [
          speechContent
            ? `${player.name} произносит вслух: «${speechContent}», но поблизости нет ни души, кто мог бы откликнуться.`
            : `${player.name} подает голос в пустоту, но вокруг лишь тишина.`
        ],
      };
    }

    // ============================================
    // Диалог с NPC: insight (WIS) или persuasion (CHA)
    // ============================================
    // Если проверка характеристик не требуется (stat_to_check === "none" или DC <= 0) — обычный диалог успешен без кубиков
    if (action.stat_to_check === "none" || (action.ai_custom_dc !== null && action.ai_custom_dc !== undefined && action.ai_custom_dc <= 0)) {
      return {
        result: {
          action_type: this.action_type,
          success: true,
          target_entity_id: targetNpc.id,
          target_type: "npc",
          target_id: targetNpc.id,
          details: `Разговор с ${targetNpc.name}`,
        } as any,
        mutations: [],
        system_facts: [
          `${player.name} обращается, чтобы поговорить с ${targetNpc.name}.`,
        ],
      };
    }

    const stat = action.stat_to_check || "insight";
    const statMod = this.getStatToCheckMod(player, stat);
    const proficiency = this.getProficiency(player);
    const targetDc = action.ai_custom_dc || 12;

    const advantage = context.session.difficulty === "easy";
    const disadvantage = context.session.difficulty === "hard";
    const roll = this.performCheck(statMod, targetDc, proficiency, advantage, disadvantage);

    const systemFacts: string[] = [
      `${player.name} попытался поговорить с ${targetNpc.name} (${roll.total} vs DC=${targetDc}).`,
    ];

    if (!roll.success) {
      return {
        result: {
          action_type: this.action_type,
          success: false,
          dice_roll: roll,
          target_entity_id: targetNpc.id,
          target_type: "npc",
          target_id: targetNpc.id,
          details: `${targetNpc.name} не в настроении для разговора`,
        } as any,
        mutations: [],
        system_facts: systemFacts,
      };
    }

    return {
      result: {
        action_type: this.action_type,
        success: true,
        dice_roll: roll,
        target_entity_id: targetNpc.id,
        target_type: "npc",
        target_id: targetNpc.id,
        details: `Успешный разговор с ${targetNpc.name}`,
      } as any,
      mutations: [],
      system_facts: systemFacts,
    };
  }
}
