// supabase/functions/process-turn/types.ts
// Общие типы для пайплайна process-turn
// Паттерн: AI Router -> Game Engine -> DB Transaction -> System Truth -> AI Narrator

// ============================================
// Входной контекст для AI-Маршрутизатора (Шаг 1)
// ============================================
export interface InventoryItem {
  id: string;
  item_name: string;
  item_type: "weapon" | "armor" | "consumable" | "tool" | "material" | "misc";
  quantity: number;
  condition: number | null;
  durability: number | null;
  description?: string;
}

export interface NearbyNpc {
  id: string;
  name: string;
  race: string;
  is_hostile: boolean;
  hp: number;
  max_hp: number;
  distance_meters: number;
}

export interface WeatherInfo {
  description: string;
  temperature: number;
  is_raining: boolean;
  is_night: boolean;
  wind_speed: number;
}

export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hp: number;
  max_hp: number;
  stats: {
    STR: number;
    DEX: number;
    CON: number;
    INT: number;
    WIS: number;
    CHA: number;
  };
  location_name: string | null;
  state_name: string | null;
}

export interface RouterInputContext {
  // Текст игрока
  player_action_text: string;

  // Снимок игрока
  player: PlayerSnapshot;

  // Инвентарь (строгие ID)
  inventory: InventoryItem[];

  // NPC рядом
  nearby_npcs: NearbyNpc[];

  // Погода
  weather: WeatherInfo;

  // Игровое время
  game_time: GameTime;

  // Текущая локация
  current_location_id: string | null;
  current_location_name: string | null;
}

// ============================================
// Выход AI-Маршрутизатора (Шаг 1)
// ============================================
export type ActionType =
  | "attack"
  | "stealth_attack"
  | "move"
  | "loot"
  | "craft_recipe"
  | "craft_custom"
  | "transfer"
  | "talk"
  | "search"
  | "harvest_ambient";

export type StatToCheck =
  | "strength"
  | "dexterity"
  | "stealth"
  | "survival"
  | "investigation"
  | "insight"
  | "none";

export interface ImproperToolUsage {
  is_improper: boolean;
  durability_penalty: number;
  stat_penalty: "damage" | null;
  reason: string;
}

export interface RouterAction {
  action_type: ActionType;
  target_entity_id: string | null;
  target_item_name: string | null;
  item_type?: string | null;
  used_item_id: string | null;
  consumed_materials: Array<{ id: string; quantity: number }> | null;
  stat_to_check: StatToCheck;
  ai_custom_dc: number | null;
  improper_tool_usage: ImproperToolUsage | null;
  dynamic_blueprint?: any | null;
  raw_action_text?: string | null;
}

export interface EncounterIntent {
  type: "targeted" | "random" | "none";
  target_name: string | null;
}

export interface Atmosphere {
  sounds: string[];
  visuals: string[];
}

export type RouterStatus = "success" | "clarification_needed" | "impossible";

export interface RouterOutputPayload {
  status: RouterStatus;
  clarification_msg: string | null;
  actions: RouterAction[];
  encounter_intent: EncounterIntent;
  time_estimate_minutes: number;
  atmosphere: Atmosphere;
  skill_hint?: string | null;
}

// ============================================
// Внутренний системный лог (Шаг 4)
// ============================================
export interface SystemFact {
  fact_type: "attack_hit" | "attack_miss" | "item_consumed" | "item_gained" | "location_changed" | "damage_received" | "roll_success" | "roll_fail" | "npc_interaction" | "movement";
  actor_id: string;
  target_id: string | null;
  value: number | null;
  text: string;
  hidden_from_others: boolean; // Туман войны
}

export interface SystemTruthDto {
  // Глобальные факты (видны всем)
  global_facts: SystemFact[];
  // Персональные факты по игрокам
  personal_facts: Record<string, SystemFact[]>;
  // Кто что получил (для тумана войны)
  damage_log: Record<string, number>;
  loot_log: Record<string, string[]>;
  // Теги атмосферы
  atmosphere: Atmosphere;
}

// ============================================
// Результат обработки Шага 5 (AI-Рассказчик)
// ============================================
export interface NarratorOutput {
  global_log: string | null;
  personal_narratives: Record<string, string>;
}
