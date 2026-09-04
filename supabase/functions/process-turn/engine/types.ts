// supabase/functions/process-turn/engine/types.ts
// Типы для Шага 2: Математическое Ядро (D&D Engine)

import { RouterOutputPayload, RouterAction } from "../types.ts";

// ============================================
// Снимок игрока для движка
// ============================================
export interface EnginePlayer {
  id: string;
  name: string;
  stats: Record<string, number>; // STR, DEX, CON, INT, WIS, CHA
  hp: number;
  max_hp: number;
  armor_class: number;
  initiative: number;
  level: number;
  inventory: EngineInventoryItem[];
  injuries: EngineInjury[];
  skills?: Record<string, { level: number; effects: Record<string, number> }>;
}

export interface EngineInventoryItem {
  id: string;
  item_name: string;
  type: string; // weapon, armor, consumable, tool, material, misc
  quantity: number;
  durability?: number | null;
  condition?: string | null;
  attributes?: Record<string, any> | null; // может содержать damage_dice
}

export interface EngineInjury {
  stat_penalties?: Record<string, number>;
  duration_hours?: number;
}

// ============================================
// Снимок NPC для движка
// ============================================
export interface EngineNpc {
  id: string;
  name: string;
  race: string;
  hp: number;
  max_hp: number;
  armor_class: number;
  level: number;
  stats: Record<string, number>;
  is_hostile: boolean;
  is_alive: boolean;
}

export interface EngineLocationItem {
  id: string;
  item_name: string;
  type: string;
  quantity: number;
}

// ============================================
// Цели
// ============================================
export interface EngineTargets {
  players: Map<string, EnginePlayer>;
  npcs: Map<string, EngineNpc>;
  location_items: Map<string, EngineLocationItem>;
}

// ============================================
// Снимок сессии
// ============================================
export interface EngineSession {
  id: string;
  difficulty: "easy" | "normal" | "hard";
  is_pvp_enabled: boolean;
  game_year: number;
  game_month: number;
  game_day: number;
  game_hour: number;
  game_minute: number;
  current_location_id: string | null;
}

// ============================================
// Входной контекст движка
// ============================================
export interface EngineInputContext {
  router_output: RouterOutputPayload;
  session: EngineSession;
  acting_player: EnginePlayer;
  targets: EngineTargets;
}

// ============================================
// Атомарные мутации (для Шага 3 — DB Transaction)
// ============================================
export type EngineMutation =
  | { type: "UPDATE_HP"; target_type: "player" | "npc"; id: string; delta: number }
  | { type: "UPDATE_DURABILITY"; item_id: string; delta: number; set_broken?: boolean }
  | { type: "DELETE_ITEM"; item_id: string; quantity: number }
  | { type: "INSERT_ITEM"; owner_id: string; owner_type: "player" | "npc" | "location"; item: any }
  | { type: "TRANSFER_ITEM"; item_id: string; from_id: string; to_id: string; from_type: "player" | "npc" | "location"; to_type: "player" | "npc" | "location"; quantity: number }
  | { type: "SPAWN_STRUCTURE"; location_id: string; structure: any }
  | { type: "ADVANCE_TIME"; minutes: number };

// ============================================
// Результат одного действия
// ============================================
export interface ActionResult {
  action_type: string;
  success: boolean;
  blocked?: boolean;
  block_reason?: string;
  dice_roll?: {
    d20: number;
    modifier: number;
    total: number;
    target_dc: number;
    is_crit?: boolean;
    is_fumble?: boolean;
    success?: boolean;
  };
  damage_dealt?: number;
  details: string;
}

// ============================================
// Энкаунтер
// ============================================
export interface EncounterTriggered {
  triggered: boolean;
  tier?: number;
  creature_name?: string;
}

// ============================================
// Выход движка
// ============================================
export interface EngineOutputPayload {
  success: boolean;
  action_results: ActionResult[];
  mutations: EngineMutation[];
  encounter_triggered: EncounterTriggered;
  raw_system_facts: string[];
  system_facts?: string[];
}

// ============================================
// Интерфейс обработчика действия (Command Pattern)
// ============================================
export interface ActionHandler {
  /**
   * Тип действия, который обрабатывает хендлер
   */
  readonly action_type: string;

  /**
   * Обрабатывает действие и возвращает результат + мутации
   */
  handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult;
}

export interface ActionHandlerResult {
  result: ActionResult;
  mutations: EngineMutation[];
  system_facts: string[];
}
