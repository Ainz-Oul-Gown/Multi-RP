// supabase/functions/_shared/npc_relationship_engine.ts
// Модуль оценки отношений NPC, шкалы (-100..+100) и трёхуровневой памяти
import { cleanTextForAI, parseAIJson } from "./utils.ts";

export type RelationshipTier =
  | "sworn_enemy" // -100..-70
  | "hostile"     // -69..-35
  | "unfriendly"  // -34..-10
  | "neutral"     // -9..+15
  | "friendly"    // +16..+50
  | "trusted"     // +51..+80
  | "devoted";    // +81..+100

export type MemoryTier = "impression" | "regular" | "vivid" | "belief";

export interface RelationshipInfo {
  score: number;
  tier: RelationshipTier;
  tier_label: string;
  status_tags: string[];
  interactions_count: number;
  last_interaction_at?: string;
}

export interface EvaluatedMemoryResult {
  memory_text: string;
  vividness: number; // 1..10
  tier: MemoryTier;
  emotional_tone: string;
  relationship_delta: number; // -30..+30
  status_tags: string[];
  significance_reason: string;
}

/**
 * Определение ступени отношений по числовому показателю (-100..+100)
 */
export function calculateRelationshipTier(score: number): RelationshipTier {
  const clamped = Math.max(-100, Math.min(100, Math.round(score)));
  if (clamped <= -70) return "sworn_enemy";
  if (clamped <= -35) return "hostile";
  if (clamped <= -10) return "unfriendly";
  if (clamped <= 15) return "neutral";
  if (clamped <= 50) return "friendly";
  if (clamped <= 80) return "trusted";
  return "devoted";
}

/**
 * Русскоязычное название ступени отношений
 */
export function getRelationshipTierLabel(tier: RelationshipTier): string {
  switch (tier) {
    case "sworn_enemy": return "Заклятый враг";
    case "hostile": return "Враждебность";
    case "unfriendly": return "Неприязнь";
    case "neutral": return "Нейтралитет";
    case "friendly": return "Симпатия";
    case "trusted": return "Доверие";
    case "devoted": return "Преданность";
    default: return "Нейтралитет";
  }
}

/**
 * Определение типа воспоминания по оценке яркости
 */
export function getMemoryTierFromVividness(vividness: number): "impression" | "regular" | "vivid" {
  const v = Math.max(1, Math.min(10, Math.round(vividness)));
  if (v <= 3) return "impression";
  if (v <= 7) return "regular";
  return "vivid";
}

/**
 * Промпт для генерации субъективного воспоминания NPC и оценки яркости
 */
export function buildMemoryEvaluationPrompt(params: {
  npc: {
    name: string;
    race?: string;
    role?: string;
    background?: string;
    habits?: string[];
    catchphrases?: string[];
  };
  player: {
    name: string;
    race?: string;
    class?: string;
  };
  current_relationship: {
    score: number;
    tier: string;
    status_tags: string[];
  };
  action_text: string;
  action_type?: string;
  outcome_text?: string;
}): string {
  const { npc, player, current_relationship, action_text, action_type, outcome_text } = params;

  return `Ты — психологический модуль памяти персонажа ${npc.name}.
Твоя задача — сформировать глубокое, живое воспоминание от лица ${npc.name} о взаимодействии с игроком ${player.name}, оценить яркость пережитого момента и влияние на отношение к игроку.

ХАРАКТЕРИСТИКИ NPC:
- Имя: ${npc.name} (${npc.race || "Гуманоид"}, роль: ${npc.role || "Обыватель"})
- Предыстория: ${npc.background || "Обычный житель"}
- Привычки: ${(npc.habits || []).join(", ") || "нет"}
- Коронные фразы: ${(npc.catchphrases || []).join(", ") || "нет"}
- Текущие отношения с игроком: ${current_relationship.score}/100 (${current_relationship.tier}), теги: ${(current_relationship.status_tags || []).join(", ") || "нейтрал"}

ИНФОРМАЦИЯ ОБ ИГРОКЕ:
- Игрок: ${player.name} (${player.race || "Человек"}, ${player.class || "Искатель приключений"})

СОБЫТИЕ:
- Действие игрока: "${cleanTextForAI(action_text)}"
- Тип действия: ${action_type || "взаимодействие"}
- Исход / Реакция мира: "${cleanTextForAI(outcome_text || "")}"

ПРАВИЛА ОЦЕНКИ И ФОРМИРОВАНИЯ ПАМЯТИ:
1. **Субъективность (POV)**: Воспоминание (memory_text) пишется от третьего или первого лица, но СТРОГО отражает внутренние мысли, сомнения, эмоции и восприятие именно ${npc.name}. Что NPC заметил во взгляде, интонации или поведении ${player.name}? Что кольнуло или согрело душу?
2. **Яркость (vividness 1..10)**:
   - 1–3 (Впечатление): Повседневный диалог, мимолётный обмен взглядами, дежурное приветствие, рутинная фраза.
   - 4–7 (Обычное воспоминание): Конкретная сделка, полезная просьба, совместное дело, спор, проявленная вежливость или грубость.
   - 8–10 (Яркое воспоминание): Спасение жизни, угроза смерти, открытое предательство, проявление невероятного героизма или жестокости, глубоко тронувший подарок или откровение.
3. **Дельта отношений (relationship_delta от -30 до +30)**:
   - Насколько поступок сблизил или оттолкнул ${npc.name}.
   - Позитив: щедрость, помощь, защита, уважение к привычкам (+5..+25).
   - Негатив: хамство, наглость, угрозы, обман, насилие (-5..-30).
   - Нейтрально: обычный бытовой разговор (0..+2).
4. **Статус-теги (status_tags)**: 1–3 актуальных тега отношений (например: "уважает за смелость", "опасается", "считает щедрым", "в долгу").

Верни СТРОГО JSON без markdown (\`\`\`json):
{
  "memory_text": "Художественный текст воспоминания (1-3 предложения)...",
  "vividness": 6,
  "emotional_tone": "respect",
  "relationship_delta": 8,
  "status_tags": ["уважает", "считает смелым"],
  "significance_reason": "Причина, почему это запомнилось"
}`;
}

/**
 * Эвристический фоллбэк оценки памяти (если LLM недоступен)
 */
export function buildFallbackMemoryEvaluation(params: {
  npc: { name: string };
  player: { name: string };
  action_text: string;
  action_type?: string;
  outcome_text?: string;
  is_attack?: boolean;
}): EvaluatedMemoryResult {
  const { npc, player, action_text, action_type, outcome_text, is_attack } = params;
  const lowerAction = (action_text || "").toLowerCase();

  let vividness = 4;
  let delta = 2;
  let tone = "neutral";
  let tags = ["знакомый"];
  let reason = "Обычный диалог";

  if (is_attack || action_type === "attack" || lowerAction.includes("атаковать") || lowerAction.includes("ударить") || lowerAction.includes("убить")) {
    vividness = 9;
    delta = -25;
    tone = "fear_hatred";
    tags = ["враг", "опасается"];
    reason = "Нападение и угроза жизни";
  } else if (lowerAction.includes("спас") || lowerAction.includes("помог") || lowerAction.includes("защит")) {
    vividness = 8;
    delta = 20;
    tone = "gratitude";
    tags = ["благодарен", "уважает"];
    reason = "Помощь в опасный момент";
  } else if (lowerAction.includes("подарок") || lowerAction.includes("золот") || lowerAction.includes("угост")) {
    vividness = 6;
    delta = 10;
    tone = "pleased";
    tags = ["щедрый", "симпатия"];
    reason = "Щедрый жест";
  } else if (lowerAction.includes("угрож") || lowerAction.includes("оскорб") || lowerAction.includes("груб")) {
    vividness = 6;
    delta = -12;
    tone = "resentment";
    tags = ["настороже", "неприязнь"];
    reason = "Грубое обращение";
  } else if (action_text.length < 25) {
    vividness = 2;
    delta = 1;
    tone = "neutral";
    tags = ["знакомый"];
    reason = "Короткая реплика";
  }

  const tier = getMemoryTierFromVividness(vividness);
  const memory_text = `${npc.name} вспоминает общение с ${player.name}: «${action_text.slice(0, 120)}». ${outcome_text || ""}`.trim();

  return {
    memory_text,
    vividness,
    tier,
    emotional_tone: tone,
    relationship_delta: delta,
    status_tags: tags,
    significance_reason: reason,
  };
}
