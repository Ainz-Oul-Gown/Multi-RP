This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where content has been compressed (code blocks are separated by ⋮---- delimiter), security check has been disabled.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: tests/**/*
- Files matching these patterns are excluded: node_modules/**, dist/**, .git/**, .playwright-mcp/**, .ai/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
tests/
  steps/
    step1_router.test.ts
    step2_engine.test.ts
    step3_persistence.test.ts
    step4_system_truth.test.ts
    step5_narrator.test.ts
  account_isolation.test.ts
  chat_loading_and_character_join.test.ts
  custom_db.test.ts
  drop_and_companion.test.ts
  gameplay_narrative_and_ambient.test.ts
  memory-engine.test.ts
  multiplayer_spawn_and_fog.test.ts
  multiplayer_turn_queue.test.ts
  npc_combat_and_life.test.ts
  npc_relationships.test.ts
  npc_world_simulator.test.ts
  npc-bestiary.test.ts
  party_system_and_rp_notation.test.ts
  pet_taming.test.ts
  physical_space_and_time.test.ts
  pipeline_integration.test.ts
  player_interaction_and_tavern_exit.test.ts
  remove_session_player.test.ts
  router_fix.test.ts
  session_deletion.test.ts
  skills_and_leveling.test.ts
  starting_location.test.ts
  stats.test.ts
  story_and_race.test.ts
  utils.test.ts
  wild_zone_and_search.test.ts
  world_deletion.test.ts
  world_geography.test.ts
  world_map_interactive.test.ts
```

# Files

## File: tests/memory-engine.test.ts
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// Мокаем все зависимости до импорта модуля
⋮----
// Мокаем все импорты модуля
⋮----
// Мокаем fetch
⋮----
// Мокаем Deno.env
⋮----
// Хелпер для создания цепочки моков Supabase
function createSupabaseChain(returnValue: any)
⋮----
// Для await цепочки - возвращаем промис
⋮----
get()
⋮----
// Настраиваем мок для from()
⋮----
.mockReturnValueOnce(playerChain) // players
.mockReturnValueOnce(settingsChain) // user_settings
.mockReturnValueOnce(insertChain) // npc_memories insert
.mockReturnValueOnce(countVividChain) // npc_memories count vivid
.mockReturnValueOnce(countMediumChain) // npc_memories count medium
.mockReturnValueOnce(countBeliefChain); // npc_memories count belief
⋮----
// Мокаем успешный ответ от embeddings API
⋮----
// Динамически импортируем модуль (он зарегистрирует serve)
⋮----
// Получаем зарегистрированный serve handler
⋮----
// Создаем тестовый запрос
⋮----
// Проверяем что вызывался fetch к embeddings
⋮----
// Проверяем что вызывался insert со статусом vivid
⋮----
// Настраиваем мок для from()
⋮----
.mockReturnValueOnce(playerChain) // players
.mockReturnValueOnce(settingsChain) // user_settings
.mockReturnValueOnce(insertChain) // npc_memories insert
.mockReturnValueOnce(countVividChain) // npc_memories count vivid
.mockReturnValueOnce(oldestVividChain) // oldest vivid
.mockReturnValueOnce(updateChain) // update to medium
.mockReturnValueOnce(countMediumChain) // npc_memories count medium
.mockReturnValueOnce(countBeliefChain); // npc_memories count belief
⋮----
// Мокаем успешный ответ от embeddings API
⋮----
// Проверяем что вызывался update для перемещения в medium
⋮----
// Настраиваем мок для from()
⋮----
.mockReturnValueOnce(playerChain) // players
.mockReturnValueOnce(settingsChain) // user_settings
.mockReturnValueOnce(insertVividChain) // npc_memories insert vivid
.mockReturnValueOnce(countVividChain) // npc_memories count vivid
.mockReturnValueOnce(countMediumChain) // npc_memories count medium
.mockReturnValueOnce(mediumMemoriesChain) // get 6 medium memories
.mockReturnValueOnce(deleteChain) // delete 6 medium
.mockReturnValueOnce(insertBeliefChain) // insert belief
.mockReturnValueOnce(countBeliefChain) // npc_memories count belief
.mockReturnValueOnce(npcDataChain) // get npc status_tags
.mockReturnValueOnce(updateTagsChain); // update status_tags
⋮----
// Мокаем успешный ответ от embeddings API для первого воспоминания
⋮----
// Мокаем вызов LLM для сжатия (chat/completions)
⋮----
// Мокаем генерацию эмбеддинга для belief
⋮----
// Мокаем вызов LLM для обновления тегов (chat/completions)
⋮----
// Проверяем что вызывались два fetch-запроса к chat/completions
⋮----
// Проверяем что произошло удаление 6 записей
⋮----
// Проверяем что вставился belief
⋮----
// Проверяем что обновились status_tags
```

## File: tests/utils.test.ts
```typescript
import { describe, it, expect } from "vitest";
import { parseAIJson, cleanTextForAI, sanitizeKey } from "../supabase/functions/_shared/utils.ts";
⋮----
// long base64-like substring should be stripped
⋮----
// cleanTextForAI strips non-ASCII characters outside allowed ranges,
// so we only assert it returns a safe ASCII-ish string.
```

## File: tests/steps/step3_persistence.test.ts
```typescript
// tests/steps/step3_persistence.test.ts
// Тесты для Шага 3: ACID Транзакция (Persistence)
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// Мокаем Deno до импорта модуля
⋮----
// Мокаем Supabase
⋮----
import { applyTurnMutations, PersistenceInputContext } from "../../supabase/functions/process-turn/steps/step3_persistence.ts";
import { EngineOutputPayload } from "../../supabase/functions/process-turn/engine/types.ts";
⋮----
function makeEngineOutput(mutations: any[] = [], facts: string[] = []): EngineOutputPayload
⋮----
// ============================================
// Базовые случаи
// ============================================
⋮----
// ============================================
// Race Condition / Conflict
// ============================================
⋮----
// ============================================
// Ошибка применения
// ============================================
⋮----
// ============================================
// Каскадный пересчёт времени
// ============================================
⋮----
// 23:50 + 20 минут = 00:10 следующего дня
⋮----
{ type: "ADVANCE_TIME", minutes: 60 * 24 * 30 * 6 + 60 }, // 6 месяцев + 1 час
⋮----
// ============================================
// Обогащение фактов
// ============================================
⋮----
// ============================================
// Откат при ошибке: мутации не применяются частично
// ============================================
⋮----
{ type: "DELETE_ITEM", item_id: "item-2", quantity: 1 }, // Этот упадёт
⋮----
// RPC: атомарный откат всей транзакции
⋮----
// Несмотря на то, что первая мутация могла бы пройти,
// весь batch откатывается
⋮----
// ============================================
// TRANSFER_ITEM
// ============================================
⋮----
// ============================================
// SPAWN_STRUCTURE
// ============================================
⋮----
// ============================================
// Fallback при пустом data
// ============================================
```

## File: tests/steps/step4_system_truth.test.ts
```typescript
// tests/steps/step4_system_truth.test.ts
// Тесты для Шага 4: System Truth Compiler
⋮----
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// Мокаем Deno и Supabase
⋮----
import { compileSystemTruth, SystemTruthInputContext } from "../../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { EngineOutputPayload } from "../../supabase/functions/process-turn/engine/types.ts";
⋮----
// ============================================
// Утилиты
// ============================================
function makePlayers()
⋮----
function makeNpcs()
⋮----
function makeBaseContext(overrides: Partial<SystemTruthInputContext> =
⋮----
// ============================================
// ТЕСТЫ
// ============================================
⋮----
// ============================================
// Тест 1: Асимметричная скрытная атака
// ============================================
⋮----
// Атакующий (p1) видит свои броски
⋮----
// Жертва (p2) НЕ должна видеть "Элария" или "p1"
⋮----
// Жертва должна получить урон
⋮----
// В фактах жертвы должно быть "Источник урона неизвестен" или подобное
⋮----
// ============================================
// Тест 2: Открытый бой — оба игрока видят
// ============================================
⋮----
// Жертва (p2) ДОЛЖНА видеть имя атакующего
⋮----
// ============================================
// Тест 3: Race Condition / Отмена хода
// ============================================
⋮----
// ============================================
// Тест 4: Lazy Loading памяти NPC
// ============================================
⋮----
target_entity_id: "npc-2", // Торговец Лиор
⋮----
// Активный NPC (npc-2) должен иметь память
⋮----
// НЕактивный NPC (npc-1) НЕ должен иметь память
⋮----
// Rpc вызвался ровно один раз (для активного NPC)
⋮----
// ============================================
// Тест 5: Глобальные события (смена времени, структура, энкаунтер)
// ============================================
⋮----
time_passed_minutes: 30, // переход через полночь
⋮----
// Смена времени → "Наступил(а) ..."
⋮----
// Структура
⋮----
// Энкаунтер
⋮----
// environment.time должен быть обновлён
expect(result.environment.time.hour).toBe(0); // 23:50 + 30 мин = 00:20, но мы проверим только что час другой
⋮----
// ============================================
// Тест 6: Inventory delta (added/removed/damaged)
// ============================================
⋮----
// ============================================
// Тест 7: Fallback памяти NPC (если vector search пуст)
// ============================================
⋮----
// ============================================
// Тест 8: turn_status = "impossible" когда все экшены заблокированы
// ============================================
```

## File: tests/steps/step5_narrator.test.ts
```typescript
// tests/steps/step5_narrator.test.ts
// Тесты для Шага 5: AI Narrator (с LLM-моком и Fallback)
⋮----
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
import { generateNarrative, buildFallbackNarrative } from "../../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SystemTruthDto } from "../../supabase/functions/process-turn/steps/step4_system_truth.ts";
⋮----
function makeBaseTruth(): SystemTruthDto
⋮----
function mockNarratorJson(payload: any)
⋮----
// Жертва (p2) НЕ должна видеть имя атакующего
⋮----
// Должен присутствовать HP-блок
⋮----
players: { p1: "текст для p1" }, // p2 пропущен
⋮----
// p1 — из ответа LLM
⋮----
// p2 — заглушка, т.к. LLM не вернул
```

## File: tests/account_isolation.test.ts
```typescript
// tests/account_isolation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorlds, getSessions, deletePlayer } from '../src/api/game.js';
⋮----
// batch query for players in sessions
⋮----
// batch query for worlds details
```

## File: tests/drop_and_companion.test.ts
```typescript
import { describe, it, expect } from "vitest";
import { DropHandler } from "../supabase/functions/process-turn/engine/handlers/drop_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { handleCompanionInSceneAction } from "../supabase/functions/_shared/npc_autonomous_engine.ts";
```

## File: tests/gameplay_narrative_and_ambient.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
⋮----
import { HarvestAmbientHandler, isAbstractObservation, resolveHarvestedItem } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";
import { SearchHandler } from "../supabase/functions/process-turn/engine/handlers/loot_search_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
⋮----
// Игрок проверяет следы у тракта
⋮----
// КРИТИЧНО: никаких мутаций INSERT_ITEM для следов!
```

## File: tests/npc_relationships.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
import {
  calculateRelationshipTier,
  getRelationshipTierLabel,
  getMemoryTierFromVividness,
  buildMemoryEvaluationPrompt,
  buildFallbackMemoryEvaluation,
} from "../supabase/functions/_shared/npc_relationship_engine.ts";
import { processNpcInteractions } from "../supabase/functions/process-turn/steps/npc_memory_updater.ts";
⋮----
// Clamping
⋮----
// Clamping
```

## File: tests/npc_world_simulator.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
⋮----
// Мокаем Deno и https импорты для совместимости с node/vitest
⋮----
import { executeRoundCycleNpcSimulation } from "../supabase/functions/_shared/npc_world_simulator.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { generateNarrative } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
⋮----
location_id: mockLocationId, // В ТОЙ ЖЕ ЛОКАЦИИ!
⋮----
role: "companion", // СПУТНИК!
⋮----
location_id: "loc-mountains", // ДАЛЕКО!
⋮----
// Вызываем фоновую симуляцию раунда
⋮----
openrouterApiKey: "", // Без ключа сработает умный процедурный движок
⋮----
// Из 3 NPC только Торин должен быть смоделирован
⋮----
// Проверяем, что в SystemTruth npc_context содержит психологические поля
⋮----
// Проверяем промпт нарратора
⋮----
// @ts-ignore
```

## File: tests/player_interaction_and_tavern_exit.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
⋮----
import { TalkHandler } from "../supabase/functions/process-turn/engine/handlers/talk_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { buildGpsPrompt } from "../supabase/functions/process-turn/steps/_shared_prompts.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
```

## File: tests/router_fix.test.ts
```typescript
// tests/router_fix.test.ts
// Тесты проверки исправления бага ложного "Your request is too vague"
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
import { parseAIJson } from "../supabase/functions/_shared/utils.ts";
import { RouterInputContext } from "../supabase/functions/process-turn/types.ts";
⋮----
function createTestContext(actionText: string): RouterInputContext
⋮----
function mockOpenRouterResponse(content: string)
```

## File: tests/session_deletion.test.ts
```typescript
// tests/session_deletion.test.ts
import { describe, it, expect, vi } from 'vitest';
import { deleteSession } from '../src/api/game.js';
```

## File: tests/story_and_race.test.ts
```typescript
// tests/story_and_race.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNpcRace } from '../src/utils/npcRaceResolver.js';
import { evaluateStoryProgress } from '../supabase/functions/_shared/storyProgressEvaluator.ts';
```

## File: tests/world_deletion.test.ts
```typescript
// tests/world_deletion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteWorld, createSession, getSessions } from '../src/api/game.js';
```

## File: tests/world_geography.test.ts
```typescript
import { describe, it, expect } from "vitest";
⋮----
// ============================================
// Unit tests for Migration 006: World Geography & NPC Matrix
// ============================================
⋮----
const calculateModifier = (stat: number)
⋮----
const cosineSimilarity = (a: number[], b: number[]) =>
⋮----
const isValid = (item:
⋮----
// When world is deleted, all its states should be deleted
⋮----
// When state is deleted, all its locations should be deleted
⋮----
// When npc is deleted, ruler_id should be set to null
⋮----
// When npc is deleted, all its memories should be deleted
⋮----
// Check symmetry
⋮----
function formatSecretsForDb(secrets: any)
⋮----
function formatSpeechStyleForDb(speech: any)
⋮----
function formatDailyRoutineForDb(routine: any)
```

## File: tests/world_map_interactive.test.ts
```typescript
// tests/world_map_interactive.test.ts
import { describe, it, expect } from "vitest";
⋮----
function getCoordScale(scaleUnit: string): number
⋮----
function calculatePanToCenter(targetX: number, targetY: number, zoom: number, coordScale: number, viewportW: number, viewportH: number)
⋮----
function calculateFitWorld(locations:
```

## File: tests/steps/step1_router.test.ts
```typescript
// tests/steps/step1_router.test.ts
// Тесты для AI-Маршрутизатора (Шаг 1)
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// Мокаем _shared/utils.ts
⋮----
import { parseAIJson } from "../../supabase/functions/_shared/utils.ts";
import { RouterInputContext } from "../../supabase/functions/process-turn/types.ts";
⋮----
// Мокаем fetch
⋮----
// Тестовый контекст
function createTestContext(): RouterInputContext
⋮----
function mockOpenRouterResponse(content: string)
⋮----
// Каждый retry должен получать тот же "not a json" ответ
⋮----
// Передаём плоский объект без input.player и с ключом внутри
```

## File: tests/multiplayer_spawn_and_fog.test.ts
```typescript
// tests/multiplayer_spawn_and_fog.test.ts
import { describe, it, expect } from "vitest";
import {
  TERRAIN_MODIFIERS,
  buildFallbackLocationMap,
} from "../supabase/functions/_shared/fog_location_generator.ts";
⋮----
function resolveSpawnTarget(players: any[], selectedPlayerId?: string)
⋮----
// Выбираем появиться рядом с Вором Локи в Погребе
⋮----
// Выбираем появиться рядом с Магом Эльдаром в Башне
⋮----
// Игрок 1 перемещается в погреб
⋮----
function getDistanceTier(src: string | null, tgt: string | null, map: any): number
⋮----
// Оба в Главном зале
⋮----
// Игроки в разных зонах
⋮----
// Пещера усиливает звук (+2 к звуку)
⋮----
// Густой лес приглушает звук (-1)
⋮----
// Здание экранирует звук (-1)
```

## File: tests/multiplayer_turn_queue.test.ts
```typescript
// tests/multiplayer_turn_queue.test.ts
// Тесты для многопользовательского режима: очередь ходов, ротация раундов, подключение игроков и туман войны
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// ============================================
// Мокаем Supabase Client через vi.hoisted
// ============================================
⋮----
const executeUpdate = () =>
⋮----
import { initTurnQueue, getCurrentTurn, getTurnQueue, passTurn } from "../src/api/game.js";
⋮----
// player-2 вошел в 10:00 (раньше), но имеет низкую инициативу
// player-1 вошел в 10:05 (позже), но имеет высокую инициативу
⋮----
// Первым должен ходить Леголас, так как он вошел раньше (10:00 < 10:05)
⋮----
// Активного хода нет. В очереди два ожидающих хода
⋮----
// Должен активироваться t1, так как его created_at раньше
⋮----
// Эмуляция функции isMessageVisibleToCurrentPlayer из game.js
function isMessageVisibleToCurrentPlayer(msg: any, currentUserId: string, currentPlayerId: string): boolean
```

## File: tests/npc-bestiary.test.ts
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// ============================================
// Unit tests for NPC Bestiary & Generation
// ============================================
⋮----
// Мокаем Supabase клиент
⋮----
// Мокаем supabase.js для api/game.js
⋮----
// Мокаем fetch
⋮----
// Мокаем Deno.env
⋮----
// Хелпер для создания цепочки моков Supabase
function createSupabaseChain(returnValue: any)
⋮----
get()
⋮----
// Мокаем insert NPC
⋮----
// Нужен только один мок на insert в таблицу npcs
⋮----
mockSupabaseFrom.mockReset(); // <--- СБРАСЫВАЕТ ОЧЕРЕДЬ once-значений!
⋮----
// Мокаем получение сессии
⋮----
// Мокаем получение главных NPC
⋮----
// Мокаем user_settings
⋮----
.mockReturnValueOnce(sessionChain) // sessions
.mockReturnValueOnce(npcsChain) // npcs
.mockReturnValueOnce(settingsChain); // user_settings
⋮----
// Мокаем ответ LLM с предметом
⋮----
// Мокаем rpc add_item_to_inventory
⋮----
// Проверяем что вызывался fetch к chat/completions
⋮----
// Проверяем что вызывался rpc add_item_to_inventory
⋮----
// Мокаем получение сессии
⋮----
// Мокаем получение главных NPC
⋮----
// Мокаем user_settings
⋮----
.mockReturnValueOnce(sessionChain) // sessions
.mockReturnValueOnce(npcsChain) // npcs
.mockReturnValueOnce(settingsChain); // user_settings
⋮----
// Мокаем ответ LLM без предмета
⋮----
// Проверяем что rpc add_item_to_inventory НЕ вызывался
⋮----
// Мокаем получение мира
⋮----
// Мокаем получение lore_files
⋮----
// Мокаем получение folders
⋮----
// Мокаем получение states
⋮----
// Мокаем получение npcs
⋮----
.mockReturnValueOnce(worldChain) // worlds
.mockReturnValueOnce(loreChain) // lore_files
.mockReturnValueOnce(foldersChain) // lore_files folders
.mockReturnValueOnce(statesChain) // states
.mockReturnValueOnce(npcsChain); // npcs
```

## File: tests/physical_space_and_time.test.ts
```typescript
// tests/physical_space_and_time.test.ts
// Тесты для нового функционала: физическое пространство, координаты (X,Y),
// статус длительной занятости (Busy State) и учет сложности/скрытности при энкаунтерах.
⋮----
import { describe, it, expect } from "vitest";
import { executeEngine } from "../supabase/functions/process-turn/engine/step2_engine.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
import { buildUserMessage } from "../supabase/functions/process-turn/steps/step1_router.ts";
⋮----
function createMockPlayer(overrides =
⋮----
function createMockContext(overrides =
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
duration_minutes: 20160, // 2 недели
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// Subzones must have relative coordinates and radius
```

## File: tests/pipeline_integration.test.ts
```typescript
// tests/pipeline_integration.test.ts
// Сквозной интеграционный тест всего 5-шагового конвейера process-turn.
// Проверяет: от строки "Бью орка мечом" до сохранения сообщений с мутациями.
⋮----
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
// Mocked Supabase client
⋮----
// Helper: создаёт цепочку thenable
function makeChain(result: any)
⋮----
// Mock fetch для OpenRouter (Шаг 1 + Шаг 5)
⋮----
import { executeEngine } from "../supabase/functions/process-turn/engine/step2_engine.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { generateNarrative, buildFallbackNarrative } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SystemTruthDto } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
import { RouterOutputPayload } from "../supabase/functions/process-turn/types.ts";
⋮----
// ============================================
// MOCK: Шаг 5 (Narrator LLM) — только narrator, т.к. Router+Engine мы вызываем напрямую
// ============================================
⋮----
// ============================================
// Шаг 1: Router — эмулируем успешный парсинг
// (для теста мы пропускаем HTTP-вызов и создаём RouterOutput напрямую)
// ============================================
⋮----
// ============================================
// Шаг 2: Engine
// ============================================
⋮----
Math.random = () => 0.99; // гарантируем попадание (d20 = 20)
⋮----
// Проверки Шага 2
⋮----
// ============================================
// Шаг 3: Persistence (mock RPC via DI)
// ============================================
⋮----
// ============================================
// Шаг 4: System Truth
// ============================================
⋮----
// ============================================
// Шаг 5: Narrator
// ============================================
⋮----
// ============================================
// Финальные проверки
// ============================================
⋮----
// Mock persistence
⋮----
// Force LLM failure
⋮----
// Fallback должен содержать какую-то информацию
⋮----
// Engine может не создать мутаций в этом сценарии (transfer с pvp) — подменим
// на минимальный конфликтный сценарий через прямую подмену engine_output
⋮----
// Mock persistence: aborted_conflict via DI
```

## File: tests/remove_session_player.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { removeSessionPlayer } from "../src/api/game.js";
```

## File: tests/starting_location.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
import {
  buildStartingLocationPrompt,
  buildFallbackStartingLocation,
  ensureStartingLocation,
} from "../supabase/functions/_shared/starting_location_generator.ts";
import { formatGameCalendarDate } from "../src/utils/gameDate.js";
⋮----
// No API key -> should use fallback generator safely
⋮----
// Verify states insert
⋮----
// Verify locations insert
⋮----
// Verify npcs insert
⋮----
// Verify session updated with location and time
⋮----
// CRITICAL: Ensure NO new location was inserted into the database!
⋮----
// Session current_location_id must be updated to the existing location
```

## File: tests/chat_loading_and_character_join.test.ts
```typescript
import { describe, it, expect, vi } from 'vitest';
⋮----
// Simulate Supabase returning messages ordered created_at DESC
⋮----
// Our sorting logic
⋮----
const newIncoming = { id: 'm-2', content: 'Как дела?' }; // duplicate
⋮----
class MockRouter
⋮----
add(pattern: string, handler: any)
⋮----
// If existing player found, we do NOT call createPlayer, avoiding logic duplication
⋮----
// 1. User sends message -> optimistic message added
⋮----
// 2. Realtime broadcast arrives with confirmed DB message
⋮----
// Must be reconciled without duplicate
⋮----
const removeDmTypingIndicator = () =>
```

## File: tests/party_system_and_rp_notation.test.ts
```typescript
import { describe, it, expect, vi } from "vitest";
⋮----
import { formatRpText, escapeHtml } from "../src/pages/game.js";
import { buildRouterSystemPrompt, buildUserMessage, buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { buildNarratorSystemPrompt } from "../supabase/functions/process-turn/steps/step5_narrator.ts";
import { SUPABASE_FULL_SCHEMA_SQL } from "../src/utils/supabaseFullSchema.js";
import { TalkHandler } from "../supabase/functions/process-turn/engine/handlers/talk_handler.ts";
⋮----
// Action/thought in asterisks should have rp-action class
⋮----
// Spoken speech in quotes should have rp-speech class with «...»
⋮----
// Narrative thought/description should remain intact
⋮----
function arePlayersInSameParty(playerA: any, playerB: any, sess: any): boolean
⋮----
// Synchronous movement logic: only fellows who are in the same starting zone move together
⋮----
// Move fellows
⋮----
// p3 stays in "зал"
⋮----
// Even if router erroneously set target_entity_id to npc-bran:
⋮----
target_entity_id: "npc-bran", // Router mistake
⋮----
// Should override and target player Ирис!
```

## File: tests/stats.test.ts
```typescript
import { describe, it, expect } from "vitest";
import { validateAndFixStats } from "../supabase/functions/_shared/utils.ts";
import { calculateHpFromStats, calculateInitiative, calculateArmorClass, calculateSavingThrows, calculateDerivedStats, getRaceAcBonus, validateAndFixStats as validateAndFixStatsFrontend } from "../src/config.js";
import { extractMissingColumn } from "../src/api/game.js";
⋮----
// D&D 5e: HP на уровне 1 = max hit die + CON mod + 10
// По умолчанию d8: max=8, base=10
// CON 10 (mod=0): 8 + 0 + 10 = 18
// CON 14 (mod=+2): 8 + 2 + 10 = 20
// CON 8 (mod=-1): 8 + (-1) + 10 = 17
⋮----
// CON 10 (default) → 18
⋮----
expect(dwarf.armor_class).toBe(11); // 10 base + 0 dex + 1 dwarf
⋮----
expect(gnome.armor_class).toBe(13); // 10 base + 2 dex + 1 gnome
⋮----
expect(elf.armor_class).toBe(12); // 10 base + 2 dex + 0 elf
⋮----
expect(customElf.armor_class).toBe(12); // 10 base + 0 dex + 2 custom
```

## File: tests/steps/step2_engine.test.ts
```typescript
// tests/steps/step2_engine.test.ts
// Тесты для Шага 2: Математическое Ядро (D&D Engine)
import { describe, it, expect, vi, beforeEach } from "vitest";
⋮----
import { EngineInputContext } from "../../supabase/functions/process-turn/engine/types.ts";
import { RouterOutputPayload } from "../../supabase/functions/process-turn/types.ts";
import { executeEngine } from "../../supabase/functions/process-turn/engine/step2_engine.ts";
import {
  rollD20, rollD100, rollD20Advantage, rollD20Disadvantage,
  getStatModifier, getProficiencyBonus, performAttackRoll,
  rollDamage, parseDiceString,
} from "../../supabase/functions/process-turn/engine/dice.ts";
⋮----
// ============================================
// Утилиты для тестов
// ============================================
function makePlayer(overrides: Partial<any> =
⋮----
function makeNpc(overrides: Partial<any> =
⋮----
function makeContext(overrides: Partial<EngineInputContext> =
⋮----
function makeRouterOutput(actions: any[], opts: Partial<RouterOutputPayload> =
⋮----
// ============================================
// ТЕСТЫ: Кубики (dice.ts)
// ============================================
⋮----
// Тестируем логику crit/fumble без мока Math.random (ненадёжен в Vitest)
// Создаём 1000 бросков и считаем статистику
⋮----
// crit и fumble должны быть ~5% каждый (1/20)
⋮----
// При DC=50 и mod=0 — успехи только от crit (~5%)
⋮----
// Используем [5, 18] через прямое присваивание
⋮----
// Реальный вызов: 2 броска d20 в диапазоне 1-20
⋮----
// ============================================
// ТЕСТЫ: Attack Handler
// ============================================
⋮----
ai_custom_dc: 1, // низкий DC = гарантированный успех
⋮----
// Должна быть мутация UPDATE_HP
⋮----
expect((updateHp as any).delta).toBeLessThan(0); // отрицательный урон
⋮----
// Мокаем Math.random так, чтобы d20 = 11 (Math.floor(0.5 * 20) + 1 = 11), но DC=100 → промах гарантирован
⋮----
ai_custom_dc: 100, // невозможно попасть (11+мод < 100)
⋮----
// Мокаем Math.random чтобы гарантировать попадание (d20 = 20)
const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9999); // → d20=20
⋮----
// ============================================
// ТЕСТЫ: Craft Handler
// ============================================
⋮----
{ id: "item-wood", quantity: 100 }, // нужно 100, есть 5
⋮----
// Мокаем Math.random чтобы гарантировать успех проверки (d20 = 20)
⋮----
ai_custom_dc: 1, // гарантированный успех
⋮----
// DELETE_ITEM для материалов
⋮----
// INSERT_ITEM для нового предмета
⋮----
ai_custom_dc: 100, // гарантированный провал
⋮----
// 50% от 4 = 2
⋮----
// Нет INSERT_ITEM при провале
⋮----
// ============================================
// ТЕСТЫ: Transfer Handler
// ============================================
⋮----
// ============================================
// ТЕСТЫ: Encounter (d100)
// ============================================
⋮----
Math.random = () => 0.001; // d100 = 1 → < 5/10/15 → триггернется на любой сложности
⋮----
Math.random = () => 0.5; // d100 = 50 → > 5/10/15
⋮----
// ============================================
// ТЕСТЫ: Оркестратор
// ============================================
⋮----
// ============================================
// ТЕСТЫ: Move Handler
// ============================================
⋮----
// Мокаем Math.random чтобы d20 = 20 (гарантированный успех)
⋮----
// Мокаем Math.random чтобы d20 = 1 (fumble, гарантированный провал)
⋮----
// Мокаем 2 броска d20: первый 0.05 (d20=2), второй 0.95 (d20=20)
⋮----
.mockReturnValueOnce(0.05) // d20=2
.mockReturnValueOnce(0.95) // d20=20 (преимущество выбирает 20)
⋮----
// Мокаем 2 броска: первый 0.95 (d20=20), второй 0.05 (d20=2)
⋮----
.mockReturnValueOnce(0.95) // d20=20
.mockReturnValueOnce(0.05) // d20=2 (помеха выбирает 2)
```

## File: tests/custom_db.test.ts
```typescript
// tests/custom_db.test.ts
// Тесты для пользовательской БД Supabase (Bring Your Own Database)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getActiveDatabaseConfig,
  setDatabaseConfig,
  generateDbInviteUrl,
  testDatabaseConnection,
  deployDatabaseSchema,
} from '../src/api/supabase.js';
import { saveCustomDbConfig, loadCustomDbConfig, clearCustomDbConfig } from '../src/utils/indexedDB.js';
```

## File: tests/npc_combat_and_life.test.ts
```typescript
// tests/npc_combat_and_life.test.ts
// Тесты для автономности NPC (спутники, экспедиции) и пошагового боя D&D
import { describe, it, expect, vi } from "vitest";
import {
  buildFallbackNpcDecision,
  executeNpcAttack,
  executeCompanionAttack,
  BattlefieldPlayer,
} from "../supabase/functions/_shared/npc_combat_ai.ts";
import {
  gameTimeToMinutes,
  handleCompanionInSceneAction,
  resolveNpcBackgroundActivities,
  handleCompanionInvitation,
  checkNpcProactiveCompanionOffer,
  generateCompanionDialogue,
  generateProceduralCompanionDialogue,
} from "../supabase/functions/_shared/npc_autonomous_engine.ts";
⋮----
expect(m2 - m1).toBe(150); // 2 часа 30 минут = 150 минут
⋮----
targetMob: { ...mockWolfMob, hp: 5 }, // низкое HP, чтобы проверить уничтожение
```

## File: tests/pet_taming.test.ts
```typescript
// tests/pet_taming.test.ts
// Тесты для интеллектуальной системы приручения питомцев (звери и монстры)
import { describe, it, expect, vi } from "vitest";
import {
  getCreatureDiet,
  evaluateFoodSuitability,
  generatePetNickname,
  evaluatePetTamingAttempt,
  evaluatePetLoyaltyCheck,
  awardPetCombatXp,
} from "../supabase/functions/_shared/pet_taming_engine.ts";
⋮----
// Волк и сырое мясо
⋮----
// Волк и яблоко (отказ!)
⋮----
// Олень и трава
⋮----
// Олень и сырое мясо (испуг!)
⋮----
// Грифон и кристалл маны
⋮----
const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.6); // d20 = 13
⋮----
harm_done_delta: -30, // критический урон отношениям (10 - 30 = -20)
⋮----
// +50 XP переваливает за 100 XP (нужно 100 на 1 уровне)
⋮----
expect(res.xp).toBe(10); // 110 - 100 = 10
```

## File: tests/wild_zone_and_search.test.ts
```typescript
import { describe, it, expect } from "vitest";
import { SearchHandler, LootSearchHandler } from "../supabase/functions/process-turn/engine/handlers/loot_search_handler.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
⋮----
// Case 1: target_item_name is "находка"
⋮----
expect(res1.mutations).toHaveLength(0); // NO INSERT_ITEM for dummy "находка"!
⋮----
// Case 2: target_item_name is null / empty
⋮----
const isCompanionNpc = (n: any) =>
```

## File: tests/skills_and_leveling.test.ts
```typescript
// tests/skills_and_leveling.test.ts
// Тесты для системы динамических навыков (1..100) и прокачки характеристик без ограничения в 20
import { describe, it, expect, vi } from "vitest";
import {
  detectSkillFromAction,
  calculateSkillBonuses,
  resolveWeaponSkill,
  CANONICAL_SKILLS,
} from "../supabase/functions/_shared/skill_engine.ts";
import { AttackHandler } from "../supabase/functions/process-turn/engine/handlers/attack_handler.ts";
import { HarvestAmbientHandler } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";
import { getItemMeta, ITEM_TYPES } from "../src/config.js";
⋮----
// Начальный уровень 1
⋮----
// Средний уровень 20
⋮----
// Максимальный уровень 100
⋮----
// Собирательство на 50 уровне
⋮----
const conMod = Math.floor((con - 10) / 2); // +4
const hitDieAvg = 5; // d8 average
const hpGain = Math.max(1, hitDieAvg + conMod); // 9 HP за уровень
⋮----
const maxMp = int * 2 + level * 5; // 32 + 25 = 57 MP
⋮----
// На 10 уровне с INT 24
⋮----
const highMaxMp = highInt * 2 + highLvl * 5; // 48 + 50 = 98 MP
⋮----
// Проверяем факт применения бонуса навыка в логах системы (+50% урона)
⋮----
// Проверяем факт нанесения урона
⋮----
ai_custom_dc: 5, // лёгкий DC для гарантированного успеха
⋮----
const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.7); // d20 = 15
⋮----
// 1. Сбор ягод (Fantasy)
⋮----
// 2. Сбор металлолома / электроники (Cyberpunk / Sci-Fi)
⋮----
// 3. Сбор стимулятора
⋮----
// Fantasy
⋮----
// Sci-Fi / Cyberpunk
⋮----
// Fallback for unknown type
```
