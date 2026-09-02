// supabase/functions/process-turn/engine/handlers/index.ts
// Реестр всех хендлеров действий (Command Pattern)

import { ActionHandler } from "../types.ts";
import { AttackHandler, StealthAttackHandler } from "./attack_handler.ts";
import { HarvestAmbientHandler } from "./harvest_ambient_handler.ts";
import { CraftHandler, CraftCustomHandler } from "./craft_handler.ts";
import { BuildHandler } from "./build_handler.ts";
import { TransferHandler } from "./transfer_handler.ts";
import { TalkHandler } from "./talk_handler.ts";
import { LootSearchHandler, SearchHandler } from "./loot_search_handler.ts";
import { MoveHandler } from "./move_handler.ts";

/**
 * Маппинг action_type → хендлер
 */
const HANDLERS: Map<string, ActionHandler> = new Map();

function register(handler: ActionHandler) {
  HANDLERS.set(handler.action_type, handler);
}

register(new AttackHandler());
register(new StealthAttackHandler());
register(new HarvestAmbientHandler());
register(new CraftHandler());
register(new CraftCustomHandler());
register(new BuildHandler());
register(new TransferHandler());
register(new TalkHandler());
register(new LootSearchHandler());
register(new SearchHandler());
register(new MoveHandler());

/**
 * Получить хендлер для действия
 */
export function getHandler(actionType: string): ActionHandler | null {
  return HANDLERS.get(actionType) || null;
}

/**
 * Получить все зарегистрированные типы
 */
export function getRegisteredActionTypes(): string[] {
  return Array.from(HANDLERS.keys());
}
