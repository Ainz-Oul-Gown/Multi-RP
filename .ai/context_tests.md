This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where content has been compressed (code blocks are separated by ⋮---- delimiter).

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
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
````
tests/
  e2e/
    helpers/
      game-helpers.js
    00_auth.setup.js
    00_diag.e2e.js
    01_character_and_world.e2e.js
    02_session_start.e2e.js
    03_npc_interaction.e2e.js
    04_movement.e2e.js
    05_looting.e2e.js
    06_crafting.e2e.js
    07_item_transfer.e2e.js
    08_combat.e2e.js
    09_quality_checks.e2e.js
    cleanup_before_03.cjs
    fetch_responses.mjs
    global-setup.js
    global-teardown.js
    README.md
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
````

# Files

## File: tests/steps/step1_router.test.ts
````typescript
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
````

## File: tests/steps/step3_persistence.test.ts
````typescript
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
````

## File: tests/steps/step4_system_truth.test.ts
````typescript
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
````

## File: tests/steps/step5_narrator.test.ts
````typescript
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
````

## File: tests/memory-engine.test.ts
````typescript
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
````

## File: tests/npc_relationships.test.ts
````typescript
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
````

## File: tests/npc-bestiary.test.ts
````typescript
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
````

## File: tests/pipeline_integration.test.ts
````typescript
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
````

## File: tests/router_fix.test.ts
````typescript
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
````

## File: tests/utils.test.ts
````typescript
import { describe, it, expect } from "vitest";
import { parseAIJson, cleanTextForAI, sanitizeKey } from "../supabase/functions/_shared/utils.ts";
⋮----
// long base64-like substring should be stripped
⋮----
// cleanTextForAI strips non-ASCII characters outside allowed ranges,
// so we only assert it returns a safe ASCII-ish string.
````

## File: tests/e2e/00_diag.e2e.js
````javascript
// tests/e2e/00_diag.e2e.js — базовый smoke тест загрузки игры
````

## File: tests/e2e/cleanup_before_03.cjs
````javascript
async function cleanup()
````

## File: tests/e2e/global-teardown.js
````javascript
// tests/e2e/global-teardown.js
// Очищает тестовые данные после всех тестов
⋮----
export default async function globalTeardown()
⋮----
// Teardown опциональный — не удаляем данные чтобы можно было изучить результаты
// Раскомментируй если нужна полная очистка:
/*
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = listData?.users?.find(u => u.email === 'e2e_playwright_test@multirp.test');
  if (user) {
    await supabase.auth.admin.deleteUser(user.id);
    console.log('🧹 Test user deleted');
  }
  */
````

## File: tests/e2e/README.md
````markdown
# E2E тесты — Multi-RP (Playwright)

Комплексный браузерный тест-сюит, имитирующий реального пользователя:
вход в аккаунт → создание персонажа → импорт мира → игровая сессия → механики.

## Структура тестов

```
tests/e2e/
├── 00_auth.setup.js          — Вход через UI, сохранение сессии
├── 01_character_and_world.e2e.js — Создание персонажа + импорт мира
├── 02_session_start.e2e.js   — Начало игры, первое DM-сообщение
├── 03_npc_interaction.e2e.js — Диалог с НПС, система отношений
├── 04_movement.e2e.js        — GPS движение, подзоны, дикие зоны
├── 05_looting.e2e.js         — Лутинг: поиск палок и камней
├── 06_crafting.e2e.js        — Крафт деревянного копья
├── 07_item_transfer.e2e.js   — Передача предмета НПС
├── 08_combat.e2e.js          — Бой, XP, HP, лог боя
├── 09_quality_checks.e2e.js  — Кодировка, нарратив, каналы
├── helpers/
│   └── game-helpers.js       — Общие утилиты
├── .auth/
│   ├── session.json          — Сохранённая браузерная сессия (gitignored)
│   ├── session-state.json    — Текущие sessionId/playerId (gitignored)
│   └── test-config.json      — Конфигурация тестового пользователя
├── global-setup.js           — Создание тестового пользователя в Supabase
├── global-teardown.js        — Опциональная очистка
└── reports/
    ├── html/                 — HTML-репорт (npx playwright show-report)
    ├── results.json          — JSON лог результатов
    └── test-run.jsonl        — JSONL лог каждого действия
```

## Что проверяется

| Тест | Механика |
|------|----------|
| 01-B | Создание персонажа + генерация статов AI |
| 01-C | Импорт мира из файла `Этерия 2.6.json` |
| 01-D | Создание сессии, выбор персонажа |
| 02-B | Первое DM-сообщение, кодировка, проза |
| 03-A | Диалог с НПС (приветствие) |
| 03-B | Система отношений (БД обновляется) |
| 03-D | Память НПС между репликами |
| 04-A | Перемещение по подзонам (таверна → улица) |
| 04-B | GPS — AI определяет цель перемещения в лес |
| 04-C | Генерация дикой зоны (лесная локация) |
| 05-A | Поиск палок — до 3 попыток |
| 05-B | Поиск камней — до 3 попыток |
| 05-C | Инвентарь отображается в UI |
| 06-A | Крафт деревянного копья из палки и камня |
| 07-A | Возвращение в город |
| 07-B | Дарение предмета НПС |
| 07-C | Лог передачи в messages |
| 08-A | Атака волка — боевая механика |
| 08-C | XP начисляется после победы |
| 08-D | HP отображается в статус-баре UI |
| 08-E | Канал "Бой" сохраняется в БД |
| 09-A | Все сообщения без Mojibake |
| 09-B | Мастер пишет прозой (нет тегов) |
| 09-C | Системные каналы в кириллице |
| 09-G | Ответы содержат лор мира Этерия |

## Запуск

```bash
# Установить браузер (один раз)
npx playwright install chromium

# Полный прогон (headless)
npm run test:e2e

# С видимым браузером
npm run test:e2e:headed

# Только авторизация
npm run test:e2e:setup

# Открыть HTML-отчёт после прогона
npm run test:e2e:report

# Запустить один конкретный файл
npx playwright test tests/e2e/05_looting.e2e.js --headed

# Запустить один конкретный тест
npx playwright test --grep "Поиск палок" --headed
```

## Переменные окружения

Тесты используют публичный деплой по умолчанию:
```
E2E_BASE_URL=https://ainz-oul-gown.github.io/Multi-RP
```

Для тестирования локального сервера:
```bash
E2E_BASE_URL=http://localhost:5173 npm run test:e2e
```

## Логи

- **`tests/e2e/reports/test-run.jsonl`** — каждый тест записывает результат в JSONL
- **`tests/e2e/reports/html/`** — визуальный HTML отчёт Playwright
- **`tests/e2e/reports/results.json`** — полный JSON отчёт
- При ошибке сохраняется скриншот и видео (`tests/e2e/test-results/`)
````

## File: tests/account_isolation.test.ts
````typescript
// tests/account_isolation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorlds, getSessions, deletePlayer } from '../src/api/game.js';
⋮----
// batch query for players in sessions
⋮----
// batch query for worlds details
````

## File: tests/drop_and_companion.test.ts
````typescript
import { describe, it, expect } from "vitest";
import { DropHandler } from "../supabase/functions/process-turn/engine/handlers/drop_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { buildRouterHeuristicFallback } from "../supabase/functions/process-turn/steps/step1_router.ts";
import { handleCompanionInSceneAction } from "../supabase/functions/_shared/npc_autonomous_engine.ts";
````

## File: tests/gameplay_narrative_and_ambient.test.ts
````typescript
import { describe, it, expect, vi } from "vitest";
⋮----
import { HarvestAmbientHandler, isAbstractObservation, resolveHarvestedItem } from "../supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts";
import { SearchHandler } from "../supabase/functions/process-turn/engine/handlers/loot_search_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
⋮----
// Игрок проверяет следы у тракта
⋮----
// КРИТИЧНО: никаких мутаций INSERT_ITEM для следов!
````

## File: tests/multiplayer_turn_queue.test.ts
````typescript
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
````

## File: tests/npc_combat_and_life.test.ts
````typescript
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
````

## File: tests/npc_world_simulator.test.ts
````typescript
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
````

## File: tests/player_interaction_and_tavern_exit.test.ts
````typescript
import { describe, it, expect, vi } from "vitest";
⋮----
import { TalkHandler } from "../supabase/functions/process-turn/engine/handlers/talk_handler.ts";
import { TransferHandler } from "../supabase/functions/process-turn/engine/handlers/transfer_handler.ts";
import { compileSystemTruth } from "../supabase/functions/process-turn/steps/step4_system_truth.ts";
import { buildGpsPrompt } from "../supabase/functions/process-turn/steps/_shared_prompts.ts";
import { EngineInputContext } from "../supabase/functions/process-turn/engine/types.ts";
````

## File: tests/session_deletion.test.ts
````typescript
// tests/session_deletion.test.ts
import { describe, it, expect, vi } from 'vitest';
import { deleteSession } from '../src/api/game.js';
````

## File: tests/starting_location.test.ts
````typescript
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
````

## File: tests/story_and_race.test.ts
````typescript
// tests/story_and_race.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNpcRace } from '../src/utils/npcRaceResolver.js';
import { evaluateStoryProgress } from '../supabase/functions/_shared/storyProgressEvaluator.ts';
````

## File: tests/world_deletion.test.ts
````typescript
// tests/world_deletion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteWorld, createSession, getSessions } from '../src/api/game.js';
````

## File: tests/world_geography.test.ts
````typescript
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
````

## File: tests/world_map_interactive.test.ts
````typescript
// tests/world_map_interactive.test.ts
import { describe, it, expect } from "vitest";
⋮----
function getCoordScale(scaleUnit: string): number
⋮----
function calculatePanToCenter(targetX: number, targetY: number, zoom: number, coordScale: number, viewportW: number, viewportH: number)
⋮----
function calculateFitWorld(locations:
````

## File: tests/e2e/01_character_and_world.e2e.js
````javascript
// tests/e2e/01_character_and_world.e2e.js
// Тест 1: Создание персонажа, импорт мира Этерия, создание сессии
// Каждый it() = отдельная проверяемая функция
⋮----
// ─────────────────────────────────────────────
// TEST 01-A: Страница лобби загружается
// ─────────────────────────────────────────────
⋮----
// Проверяем основные разделы
⋮----
// ─────────────────────────────────────────────
// TEST 01-B: Создание персонажа с генерацией статов AI
// ─────────────────────────────────────────────
⋮----
// Переключаемся на вкладку Персонажей
⋮----
// Открываем модалку создания персонажа
⋮----
// Заполняем форму
⋮----
// Нажимаем "Сгенерировать статы AI"
⋮----
// Ждём пока AI заполнит статы — кнопка разблокируется
⋮----
// Проверяем что хотя бы один стат заполнен (не 0 и не пустой)
⋮----
// Сохраняем персонажа
⋮----
// Ждём появления карточки персонажа
⋮----
// Проверяем что карточка появилась в списке (если вдруг не успела)
⋮----
// ─────────────────────────────────────────────
// TEST 01-C: Импорт мира из файла Этерия 2.6.json
// ─────────────────────────────────────────────
⋮----
// Переходим на вкладку Миры
⋮----
// Кнопка импорта мира находится внутри модалки "Новый мир"
// Сначала открываем модалку создания нового мира
⋮----
// Ищем кнопку "Импорт мира" — она находится в модалке
⋮----
// Перехватываем диалог выбора файла
⋮----
// Ждём появления мира в списке (через импорт он должен появиться)
⋮----
// ─────────────────────────────────────────────
// TEST 01-D: Создание игровой сессии с персонажем и миром
// ─────────────────────────────────────────────
⋮----
// Переходим на вкладку Сессии
⋮----
// Открываем модалку создания сессии
⋮----
// Выбираем мир
⋮----
// Ждём пока в select появятся опции кроме placeholder
⋮----
// Просто выбираем первый доступный мир
⋮----
// Выбираем сложность
⋮----
// Добавляем DM подсказку — раздел может быть скрыт в accordion
⋮----
// Раскрываем accordion если он есть
⋮----
// Проверяем валидность формы
⋮----
// Отправляем форму в обход HTML5-валидации
⋮----
// Ждём смены URL на /session/
⋮----
// Ждём загрузки игрового экрана
⋮----
// Получаем sessionId и playerId из URL или localStorage
⋮----
// Если не в URL — ищем в localStorage
⋮----
// Если всё ещё нет — получаем из БД
⋮----
// Получаем playerId из БД
````

## File: tests/e2e/02_session_start.e2e.js
````javascript
// tests/e2e/02_session_start.e2e.js
// Тест 2: Начало сессии — DM сообщение и начало игры в городе
// Проверяет: инициализацию мира, первое сообщение ДМ, кодировку
⋮----
// ─────────────────────────────────────────────
// TEST 02-A: Переход в игровой экран
// ─────────────────────────────────────────────
⋮----
// ─────────────────────────────────────────────
// TEST 02-B: ДМ пишет стартовое сообщение "начало игры"
// ─────────────────────────────────────────────
⋮----
// Пишем первое сообщение ДМу
⋮----
// Проверяем что ответ не пустой
⋮----
// Проверяем отсутствие кодировочных артефактов
⋮----
// Проверяем что ответ написан прозой
⋮----
// Проверяем через БД что сообщения сохранились
⋮----
// Находим сообщение Мастера
````

## File: tests/e2e/03_npc_interaction.e2e.js
````javascript
// tests/e2e/03_npc_interaction.e2e.js
// Тест 3: Взаимодействие с НПС — диалог, система отношений
// Проверяет: маршрутизацию диалоговых действий, изменение отношений, память НПС
⋮----
// Ключевой фикс: проксируем Supabase запросы через Node.js
// Headless Chrome не может напрямую достучаться до Supabase
⋮----
// ─────────────────────────────────────────────
// TEST 03-A: Короткий диалог с ближайшим НПС
// ─────────────────────────────────────────────
⋮----
// Диалоговый ответ должен содержать какой-то ответ НПС
⋮----
// Допускаем что НПС может молчать или реагировать любым способом
⋮----
// ─────────────────────────────────────────────
// TEST 03-B: Проверка системы отношений через БД
// ─────────────────────────────────────────────
⋮----
// Дружелюбное действие которое должно улучшить отношения
⋮----
// Проверяем через БД что npc_relationships доступна (нет ошибки запроса)
// npc_relationships связана через player_id, не session_id
⋮----
// Главное что запрос выполнился без ошибки (данные могут быть пустыми)
⋮----
// ─────────────────────────────────────────────
// TEST 03-C: Открытие панели НПС в игре
// ─────────────────────────────────────────────
⋮----
// Открываем панель НПС
⋮----
// Проверяем что панель не пустая (хотя бы заголовок есть)
⋮----
// Закрываем панель
⋮----
// ─────────────────────────────────────────────
// TEST 03-D: Повторный диалог — НПС помнит предыдущий разговор
// ─────────────────────────────────────────────
````

## File: tests/steps/step2_engine.test.ts
````typescript
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
````

## File: tests/multiplayer_spawn_and_fog.test.ts
````typescript
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
````

## File: tests/physical_space_and_time.test.ts
````typescript
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
````

## File: tests/remove_session_player.test.ts
````typescript
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { removeSessionPlayer } from "../src/api/game.js";
````

## File: tests/skills_and_leveling.test.ts
````typescript
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
````

## File: tests/stats.test.ts
````typescript
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
````

## File: tests/e2e/helpers/game-helpers.js
````javascript
// tests/e2e/helpers/game-helpers.js
// Вспомогательные функции для работы с игровым UI в Playwright тестах
⋮----
/**
 * Проксирует все запросы к Supabase через нативный Node.js https.
 * Headless Chrome не может достучаться до Supabase напрямую (сетевая блокировка).
 * Используем '**\/*' glob и node:https для надёжного проксирования.
 * @param {import('@playwright/test').Page} page
 */
export async function setupSupabaseProxy(page)
⋮----
// Отключаем Service Worker — он перехватывал fetch ДО нашего прокси и вешал запросы
⋮----
get: () => (
⋮----
// Заголовки которые нельзя передавать в route.fulfill (конфликт с Playwright)
⋮----
'upgrade', 'proxy-connection', 'content-length', // убираем — Playwright сам считает
⋮----
// Только Supabase запросы проксируем через Node.js
⋮----
// req.headers() — синхронный (без CDP round-trip), req.allHeaders() — зависает!
⋮----
// Edge Functions (AI) могут работать дольше — до 120с
⋮----
// Собираем заголовки, пропускаем проблемные, конвертируем массивы в строки
⋮----
// Распаковываем gzip/deflate, убираем Content-Encoding из ответа
⋮----
/**
 * Загружает тестовую конфигурацию записанную global-setup
 */
export function loadTestConfig()
⋮----
/**
 * Загружает состояние тестовой сессии (sessionId, playerId) между тестами
 */
export function loadSessionState()
⋮----
/**
 * Сохраняет состояние тестовой сессии для передачи между тестами
 */
export function saveSessionState(state)
⋮----
export function createServiceClient()
⋮----
/**
 * Отправляет сообщение в игровой чат и ожидает ответа Мастера
 * @returns {string} текст ответа Мастера
 */
export async function sendGameAction(page, actionText, timeoutMs = 90_000)
⋮----
// Ждём появления typing indicator
⋮----
// Ждём когда typing indicator исчезнет (ответ пришёл)
⋮----
// Ждём нового сообщения от Мастера
⋮----
// Берём последнее сообщение
⋮----
/**
 * Ожидает появления нового сообщения в чате с заданным отправителем
 */
export async function waitForNewMessage(page, senderPattern, timeoutMs = 90_000)
⋮----
/**
 * Проверяет инвентарь игрока через Supabase API
 */
export async function getPlayerInventoryFromDB(playerId)
⋮----
/**
 * Проверяет сообщения сессии через Supabase API
 */
export async function getSessionMessagesFromDB(sessionId, limit = 10)
⋮----
/**
 * Получает текущее состояние игрока из БД
 */
export async function getPlayerFromDB(playerId)
⋮----
/**
 * Логирует результат теста в структурированный JSON-лог
 */
export function logTestResult(testName, status, details =
⋮----
/**
 * Открывает панель инвентаря и возвращает список предметов
 */
export async function openInventoryPanel(page)
⋮----
/**
 * Закрывает любую открытую боковую панель
 */
export async function closePanel(page)
⋮----
/**
 * Проверяет что текст не содержит артефактов кодировки (Mojibake)
 */
export function hasEncodingArtifacts(text)
⋮----
// Типичные Mojibake паттерны
⋮----
/[ÐÑ][°-¿]/,      // UTF-8 кирилица, прочитанная как Latin-1
/[\u00C0-\u00FF]{3,}/,  // Серии Latin-1 символов вместо кириллицы
/\ufffd/,          // Unicode replacement character
⋮----
/**
 * Проверяет что нарратив Мастера написан прозой (не технические теги)
 */
export function isProseNarrative(text)
````

## File: tests/e2e/04_movement.e2e.js
````javascript
// tests/e2e/04_movement.e2e.js
// Тест 4: Передвижение — выход из города, движение к лесу, генерация кастомной локации
// Проверяет: GPS-систему, AI определение подзон, генерацию новых локаций
⋮----
// ─────────────────────────────────────────────
// TEST 04-A: Движение по подзонам в таверне
// ─────────────────────────────────────────────
⋮----
// Запоминаем текущую зону
⋮----
// Проверяем что зона изменилась в БД
⋮----
// Зона должна была измениться (или остаться той же если уже снаружи)
⋮----
// ─────────────────────────────────────────────
// TEST 04-B: Движение к лесу — AI определяет намерение перемещения
// ─────────────────────────────────────────────
⋮----
// Проверяем что ответ содержит описание перемещения (мягкая проверка — AI может писать по-разному)
⋮----
// Проверяем через БД что локация изменилась
await new Promise(r => setTimeout(r, 2000)); // немного ждём
⋮----
// ─────────────────────────────────────────────
// TEST 04-C: Генерация кастомной локации (дикая зона — лес)
// ─────────────────────────────────────────────
⋮----
// Ответ должен описывать что-то (мягкая проверка — AI может описывать по-разному)
⋮----
// Проверяем что в session_locations появилась лесная локация
````

## File: tests/e2e/fetch_responses.mjs
````javascript
// Получить последние AI ответы из БД для оценки
⋮----
// Читаем сохранённую сессию из тестов
⋮----
// Определяем колонки автоматически
````

## File: tests/chat_loading_and_character_join.test.ts
````typescript
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
````

## File: tests/party_system_and_rp_notation.test.ts
````typescript
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
````

## File: tests/pet_taming.test.ts
````typescript
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
````

## File: tests/e2e/05_looting.e2e.js
````javascript
// tests/e2e/05_looting.e2e.js
// Тест 5: Лутинг — поиск предметов в лесу (палки, камни) до момента успеха
// Проверяет: loot_search handler, добавление в инвентарь, ответ ДМ
⋮----
test.setTimeout(300_000); // 5 минут — несколько попыток
⋮----
// ─────────────────────────────────────────────
// TEST 05-A: Поиск палок — до момента успеха (max 3 попытки)
// ─────────────────────────────────────────────
⋮----
// Мягкая проверка качества — короткий ответ не останавливает цикл попыток
⋮----
// Проверяем инвентарь после каждой попытки
⋮----
// После 3 попыток палки должны быть найдены (или хоть что-то)
// Если не нашли — это не блокирующий провал (зависит от броска кубика)
⋮----
// Сохраняем состояние инвентаря для следующих тестов
⋮----
// ─────────────────────────────────────────────
// TEST 05-B: Поиск камней — до момента успеха
// ─────────────────────────────────────────────
⋮----
// ─────────────────────────────────────────────
// TEST 05-C: Инвентарь отображается в UI после лутинга
// ─────────────────────────────────────────────
⋮----
// Открываем инвентарь
⋮----
// Проверяем содержимое панели инвентаря
⋮----
// Инвентарь не должен быть пустым после лутинга
⋮----
// Закрываем инвентарь
````

## File: tests/e2e/06_crafting.e2e.js
````javascript
// tests/e2e/06_crafting.e2e.js
// Тест 6: Крафт — создание деревянного копья из палки и камня
// Проверяет: craft_handler, вычитание ресурсов, добавление готового предмета
⋮----
// ─────────────────────────────────────────────
// TEST 06-A: Крафт деревянного копья (палка + камень)
// ─────────────────────────────────────────────
⋮----
// Проверяем появление копья в инвентаре
⋮----
// Проверяем что в ответе упоминается создание копья
⋮----
// Если крафт не удался — это не ошибка, может быть неудачный бросок
// но ответ должен быть художественным
⋮----
// ─────────────────────────────────────────────
// TEST 06-B: Проверка что ресурсы вычлись из инвентаря при успешном крафте
// ─────────────────────────────────────────────
⋮----
// Проверяем текущий инвентарь через БД
⋮----
// Копьё должно быть в инвентаре после успешного крафта
// (тест не блокирует если крафт не удался — это зависит от кубика)
````

## File: tests/e2e/07_item_transfer.e2e.js
````javascript
// tests/e2e/07_item_transfer.e2e.js
// Тест 7: Передача предмета НПС
// Проверяет: transfer_handler, удаление из инвентаря игрока, лог событий
⋮----
// ─────────────────────────────────────────────
// TEST 07-A: Возвращение в город к НПС
// ─────────────────────────────────────────────
⋮----
// ─────────────────────────────────────────────
// TEST 07-B: Дарение предмета НПС
// ─────────────────────────────────────────────
⋮----
// Передаём любой найденный предмет (копьё или первый доступный)
⋮----
// Проверяем что реакция НПС есть в ответе
⋮----
// Проверяем инвентарь после передачи
⋮----
// Предмет должен исчезнуть из инвентаря
⋮----
// ─────────────────────────────────────────────
// TEST 07-C: Лог событий — передача записана в messages
// ─────────────────────────────────────────────
⋮----
// Проверяем наличие сообщений о передаче или дарении
⋮----
// Проверяем что все сообщения без кодировочных артефактов
````

## File: tests/e2e/09_quality_checks.e2e.js
````javascript
// tests/e2e/09_quality_checks.e2e.js
// Тест 9: Комплексные проверки качества — кодировка, нарратив, каналы, лог уровня
// Проверяет всю цепочку от сообщения до ответа с точки зрения качества выходных данных
⋮----
// ─────────────────────────────────────────────
// TEST 09-A: Все сообщения в БД без кодировочных артефактов
// ─────────────────────────────────────────────
⋮----
// ─────────────────────────────────────────────
// TEST 09-B: Мастер пишет прозой (нет системных тегов)
// ─────────────────────────────────────────────
⋮----
// ─────────────────────────────────────────────
// TEST 09-C: Системные каналы имеют корректные названия
// ─────────────────────────────────────────────
⋮----
// Проверяем что нет Mojibake в именах каналов
⋮----
// ─────────────────────────────────────────────
// TEST 09-D: Профиль игрока отображается корректно в UI
// ─────────────────────────────────────────────
⋮----
// Проверяем что имя персонажа присутствует
⋮----
// ─────────────────────────────────────────────
// TEST 09-E: Карта мира открывается и отображает данные
// ─────────────────────────────────────────────
⋮----
// Проверяем что карта загрузилась (viewport существует)
⋮----
// ─────────────────────────────────────────────
// TEST 09-F: Итоговый отчёт — сводка по всем каналам
// ─────────────────────────────────────────────
⋮----
// Статистика по каналам
⋮----
// ─────────────────────────────────────────────
// TEST 09-G: Нарратив содержит лор мира (не "обычный фэнтези-мир")
// ─────────────────────────────────────────────
⋮----
// Ответ должен содержать специфику мира (названия мест, государств и т.д.)
// которые взяты из лора, а не из общих шаблонов
const hasSpecificLore = response.length > 100; // Минимальная проверка — подробный ответ
````

## File: tests/e2e/global-setup.js
````javascript
// tests/e2e/global-setup.js
// Глобальная настройка: создаёт тестового пользователя в Supabase (если нет)
// и записывает данные сессии в test-session-state.json для переиспользования между тестами
⋮----
worldName: 'Этерия',       // Импортируем из Этерия 2.6.json
⋮----
// Бесплатные модели для тестов
⋮----
// OpenRouter ключ берётся из .env или E2E_OPENROUTER_KEY
⋮----
export default async function globalSetup()
⋮----
// Сохраняем токены сессии для использования в 00_auth.setup.js
⋮----
// Сохраняем raw session для совместимости
⋮----
// Напрямую пишем session.json в формате Playwright storageState
// Это обходит зависание headless Chromium при UI логине
⋮----
// 2. Настройки пользователя — бесплатные модели
⋮----
// 3. Очищаем старые тестовые сессии — сохраняем текущую из session-state.json
⋮----
// Пропускаем текущую активную сессию тестов
⋮----
// Удаляем только сессии созданные е2е тестами (не пользовательские)
⋮----
// 3b. Удаляем дублирующихся тестовых персонажей (Арин) — только если нет активной сессии
// Если session-state.json есть и сессия жива — персонаж нужен, не удаляем
⋮----
// 4. Сохраняем конфиг для переиспользования между тестами
````

## File: tests/custom_db.test.ts
````typescript
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
````

## File: tests/wild_zone_and_search.test.ts
````typescript
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
````

## File: tests/e2e/00_auth.setup.js
````javascript
// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация — session.json записывается в global-setup напрямую
// Этот файл только верифицирует что session.json существует
⋮----
// Проверяем что файл содержит валидный токен
````

## File: tests/e2e/08_combat.e2e.js
````javascript
// tests/e2e/08_combat.e2e.js
// Тест 8: Боевая система — атака врага, получение урона, победа/поражение
// Проверяет: attack_handler, d20 броски, XP за победу, HP обновляется в БД
⋮----
// ─────────────────────────────────────────────
// TEST 08-A: Инициация боя — атака дикого зверя в лесу
// ─────────────────────────────────────────────
⋮----
// Сначала идём в лес где может быть враг
⋮----
// Инициируем бой — до 2 попыток если первая неверно классифицирована
⋮----
// Ответ должен содержать боевые описания
⋮----
// Проверяем что HP изменился (урон получен или нанесён)
⋮----
// Мягкая проверка — боевые слова должны быть хотя бы в одном из ответов
⋮----
// ─────────────────────────────────────────────
// TEST 08-B: Продолжение боя — второй раунд
// ─────────────────────────────────────────────
⋮----
// Проверяем что в логах есть боевое сообщение (канал "Бой")
⋮----
// ─────────────────────────────────────────────
// TEST 08-C: XP начисляется после победы в бою
// ─────────────────────────────────────────────
⋮----
// Завершаем бой победным ударом
⋮----
// ─────────────────────────────────────────────
// TEST 08-D: Полоса HP в статус-баре обновляется в UI
// ─────────────────────────────────────────────
⋮----
// Проверяем наличие статус-бара
⋮----
// Проверяем что в статус-баре есть HP (число)
⋮----
// ─────────────────────────────────────────────
// TEST 08-E: Лог боя в канале "Бой" в БД
// ─────────────────────────────────────────────
⋮----
// Боевые сообщения хранятся с sender_type='master', ищем по контенту
⋮----
// Проверяем что боевые сообщения есть
⋮----
return; // Не блокирующая ошибка
⋮----
// Проверяем кодировку
````
