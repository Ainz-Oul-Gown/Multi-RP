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
- Only files matching these patterns are included: supabase/functions/**/*
- Files matching these patterns are excluded: node_modules/**, dist/**, .git/**, .playwright-mcp/**, .ai/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
supabase/
  functions/
    _shared/
      fog_location_generator.ts
      npc_autonomous_engine.ts
      npc_combat_ai.ts
      npc_relationship_engine.ts
      npc_world_simulator.ts
      npcRaceResolver.ts
      pet_taming_engine.ts
      skill_engine.ts
      starting_location_generator.ts
      storyProgressEvaluator.ts
      utils.ts
    assess-durability/
      index.ts
    convert-world-text/
      index.ts
    deploy-schema/
      index.ts
    generate-character/
      index.ts
    generate-character-full-test/
      index.ts
    generate-character-minimal/
      index.ts
    generate-character-no-derived/
      index.ts
    generate-loot/
      index.ts
    generate-world-npcs/
      index.ts
    manage-player/
      index.ts
    npc-memory-engine/
      index.ts
    process-rest/
      index.ts
    process-turn/
      engine/
        handlers/
          _base.ts
          attack_handler.ts
          build_handler.ts
          craft_handler.ts
          drop_handler.ts
          harvest_ambient_handler.ts
          index.ts
          loot_search_handler.ts
          move_handler.ts
          talk_handler.ts
          transfer_handler.ts
        dice.ts
        step2_engine.ts
        types.ts
      steps/
        _shared_prompts.ts
        fog_of_war_utils.ts
        npc_memory_updater.ts
        stat_allocation_utils.ts
        step1_router.ts
        step3_persistence.ts
        step4_system_truth.ts
        step5_narrator.ts
        time_utils.ts
      index.ts
      types.ts
    simulate-npc-background/
      index.ts
    test-ping/
      index.ts
```

# Files

## File: supabase/functions/assess-durability/index.ts
```typescript
// supabase/functions/assess-durability/index.ts
// Оценка износа/потери предмета после использования
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
```

## File: supabase/functions/convert-world-text/index.ts
```typescript
// supabase/functions/convert-world-text/index.ts
// Конвертирует текстовое описание мира в структурированный JSON
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
```

## File: supabase/functions/generate-character/index.ts
```typescript
// supabase/functions/generate-character/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sanitizeKey,
  cleanTextForAI,
  parseAIJson,
  validateAndFixStats,
  calculateDerivedStats,
} from "../_shared/utils.ts";
```

## File: supabase/functions/generate-character-full-test/index.ts
```typescript
// supabase/functions/generate-character-full-test/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sanitizeKey,
  cleanTextForAI,
  parseAIJson,
  validateAndFixStats,
  calculateDerivedStats,
} from "../_shared/utils.ts";
```

## File: supabase/functions/generate-character-minimal/index.ts
```typescript
// supabase/functions/generate-character-minimal/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
```

## File: supabase/functions/generate-character-no-derived/index.ts
```typescript
// supabase/functions/generate-character-no-derived/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

## File: supabase/functions/generate-world-npcs/index.ts
```typescript
// supabase/functions/generate-world-npcs/index.ts
// Только сохранение NPC в БД (генерация происходит на фронтенде)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanTextForAI } from "../_shared/utils.ts";
⋮----
// Валидация типа урона
⋮----
function cleanAttack(a: any)
⋮----
function cleanNPC(npc: any, world_id: string)
⋮----
// Validate role
⋮----
// Validate tier and level
⋮----
// Calculate special attacks count by tier
⋮----
// Clean attacks arrays
⋮----
// Validate level range
⋮----
// Combat stats
⋮----
// Hit dice (D&D system)
⋮----
// Tier & level range
⋮----
// Attacks
⋮----
// Pack/unique
⋮----
// Template reference
```

## File: supabase/functions/npc-memory-engine/index.ts
```typescript
// supabase/functions/npc-memory-engine/index.ts
// Движок Каскадной Памяти NPC: управление воспоминаниями (vivid -> medium -> belief)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI } from "../_shared/utils.ts";
⋮----
// Каскадные лимиты
⋮----
// ============================================
// API-вызовы к OpenRouter
// ============================================
⋮----
async function generateEmbedding(text: string, apiKey: string): Promise<number[]>
⋮----
async function callChatLLM(systemPrompt: string, userMessage: string, apiKey: string): Promise<string>
⋮----
// ============================================
// Основной обработчик
// ============================================
⋮----
// Получаем API ключ
⋮----
// Получаем player для нахождения user_id
⋮----
// ============================================
// Задача 1: Векторизация и сохранение (Яркая память)
// ============================================
⋮----
// ============================================
// Задача 2: Логика каскада "Смещение 5-5-5"
// ============================================
⋮----
// 2.1 Проверяем количество vivid воспоминаний
⋮----
// Если vivid > 5 → перемещаем самую старую в medium
⋮----
// 2.2 Проверяем количество medium воспоминаний
⋮----
// Если medium > 5 → сжимаем 6 в 1 belief
⋮----
// Извлекаем текст всех 6 medium записей
⋮----
// Удаляем 6 старых medium записей
⋮----
// Генерируем вектор для нового убеждения
⋮----
// Сохраняем belief
⋮----
// 2.3 Проверяем количество belief воспоминаний
⋮----
// Если belief > 5 → удаляем самое старое
⋮----
// ============================================
// Задача 3: Обновление Статуса (status_tags)
// ============================================
⋮----
// Получаем текущие status_tags NPC
⋮----
// Парсим JSON ответ
```

## File: supabase/functions/process-rest/index.ts
```typescript
// supabase/functions/process-rest/index.ts
// Обработка отдыха, восстановления HP и генерация травм через ИИ
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
```

## File: supabase/functions/simulate-npc-background/index.ts
```typescript
// supabase/functions/simulate-npc-background/index.ts
// Фоновая автономность NPC: действия главных персонажей за кадром
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
⋮----
async function callChatLLM(systemPrompt: string, userMessage: string, apiKey: string): Promise<string>
⋮----
// Получаем мир сессии
⋮----
// Получаем главных NPC мира
⋮----
// Получаем API ключ
⋮----
// Симулируем каждого главного NPC
⋮----
// Если NPC получил предмет - добавляем в инвентарь
```

## File: supabase/functions/test-ping/index.ts
```typescript
// supabase/functions/test-ping/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
```

## File: supabase/functions/_shared/fog_location_generator.ts
```typescript
// supabase/functions/_shared/fog_location_generator.ts
// Автоматическая генерация карты расстояний (location_map) и типа местности (terrain_type) через ИИ.
// Вызывается при создании стартовой локации, смене локации или входе в дикую зону.
⋮----
import { cleanTextForAI, parseAIJson } from "./utils.ts";
⋮----
export type TerrainType = "open" | "forest" | "cave" | "urban" | "building" | "mountain";
⋮----
export interface LocationMapResult {
  terrain_type: TerrainType;
  zones: string[];
  location_map: Record<string, Record<string, number>>;
}
⋮----
/** Модификаторы дальности распространения звука и видимости в зависимости от типа местности */
⋮----
open:     { audioMod: 1,  visualMod: 2 },  // открытое пространство: звук +1 тир, видимость +2 тира
forest:   { audioMod: -1, visualMod: -2 }, // густой лес: деревья глушат звук (-1) и закрывают обзор (-2)
cave:     { audioMod: 2,  visualMod: -3 }, // пещера: сильное эхо (+2 к звуку), но темнота и повороты (-3)
urban:    { audioMod: 0,  visualMod: -1 }, // городская среда: экранирующие стены (-1 к видимости)
building: { audioMod: -1, visualMod: -2 }, // внутри здания: перегородки, двери (-1 звук, -2 видимость)
mountain: { audioMod: -1, visualMod: 1 },  // горы: возвышенность увеличивает видимость (+1), скалы дробят звук (-1)
⋮----
/**
 * Промпт для генерации зон и матрицы расстояний локации через ИИ
 */
export function buildLocationMapPrompt(params: {
  locationName: string;
  locationType?: string | null;
  locationDescription?: string | null;
  isWildZone?: boolean;
}): string
⋮----
/**
 * Эвристический фоллбэк при недоступности ИИ
 */
export function buildFallbackLocationMap(name: string, type?: string | null): LocationMapResult
⋮----
/**
 * Нормализация карты расстояний, сгенерированной ИИ
 */
function normalizeLocationMap(parsed: any, fallback: LocationMapResult): LocationMapResult
⋮----
// Создаем симметричную карту
⋮----
dist = 2; // разумный дефолт (соседняя зона)
⋮----
/**
 * Генерация карты расстояний и типа местности локации через ИИ с сохранением в Supabase.
 */
export async function ensureLocationMapAndTerrain(params: {
  supabase: any;
  sessionId: string;
  locationId?: string | null;
  locationName: string;
  locationType?: string | null;
  locationDescription?: string | null;
  isWildZone?: boolean;
  openrouterApiKey?: string;
  model?: string;
}): Promise<LocationMapResult>
⋮----
// Сохраняем сгенерированные данные в сессию
⋮----
// Если это именованная локация — обновляем и locations.terrain_type
```

## File: supabase/functions/_shared/npc_relationship_engine.ts
```typescript
// supabase/functions/_shared/npc_relationship_engine.ts
// Модуль оценки отношений NPC, шкалы (-100..+100) и трёхуровневой памяти
import { cleanTextForAI, parseAIJson } from "./utils.ts";
⋮----
export type RelationshipTier =
  | "sworn_enemy" // -100..-70
  | "hostile"     // -69..-35
  | "unfriendly"  // -34..-10
  | "neutral"     // -9..+15
  | "friendly"    // +16..+50
  | "trusted"     // +51..+80
  | "devoted";    // +81..+100
⋮----
| "sworn_enemy" // -100..-70
| "hostile"     // -69..-35
| "unfriendly"  // -34..-10
| "neutral"     // -9..+15
| "friendly"    // +16..+50
| "trusted"     // +51..+80
| "devoted";    // +81..+100
⋮----
export type MemoryTier = "impression" | "regular" | "vivid" | "belief";
⋮----
export interface RelationshipInfo {
  score: number;
  tier: RelationshipTier;
  tier_label: string;
  status_tags: string[];
  interactions_count: number;
  last_interaction_at?: string;
}
⋮----
export interface EvaluatedMemoryResult {
  memory_text: string;
  vividness: number; // 1..10
  tier: MemoryTier;
  emotional_tone: string;
  relationship_delta: number; // -30..+30
  status_tags: string[];
  significance_reason: string;
}
⋮----
vividness: number; // 1..10
⋮----
relationship_delta: number; // -30..+30
⋮----
/**
 * Определение ступени отношений по числовому показателю (-100..+100)
 */
export function calculateRelationshipTier(score: number): RelationshipTier
⋮----
/**
 * Русскоязычное название ступени отношений
 */
export function getRelationshipTierLabel(tier: RelationshipTier): string
⋮----
/**
 * Определение типа воспоминания по оценке яркости
 */
export function getMemoryTierFromVividness(vividness: number): "impression" | "regular" | "vivid"
⋮----
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
}): string
⋮----
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
}): EvaluatedMemoryResult
```

## File: supabase/functions/_shared/npc_world_simulator.ts
```typescript
// supabase/functions/_shared/npc_world_simulator.ts
// Фоновый процесс симуляции жизни мира после круга ходов (Round Cycle World Progression).
// Делает ровно 1 запрос к ИИ на всех удаленных NPC, контактировавших с игроками.
⋮----
import { cleanTextForAI, parseAIJson } from "./utils.ts";
⋮----
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
⋮----
export interface NpcWorldSimulationSummary {
  simulated_count: number;
  round_number: number;
  actions: NpcWorldActionResult[];
  chronicle_message?: string;
}
⋮----
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
}): Promise<NpcWorldSimulationSummary>
⋮----
// 1. Получаем ID всех игроков в сессии
⋮----
// 2. Находим NPC, контактировавших с игроками сессии (по отношениям или воспоминаниям)
⋮----
// 3. Загружаем данные отобранных NPC
⋮----
// 4. Фильтруем: берем только живых и тех, кто НЕ находится рядом с игроком
const isCompanion = (n: any) =>
⋮----
// Проверка жизнеспособности
⋮----
// Спутники в текущем отряде путешествуют вместе с игроком — исключаем
⋮----
// Если NPC в той же локации, что и игроки — он уже в текущей сцене
⋮----
}).slice(0, 8); // Лимит до 8 NPC в 1 запрос для оптимизации токенов и фокуса
⋮----
// 5. Загружаем список доступных локаций мира для возможных перемещений
⋮----
// 6. Формируем 1 единый запрос к ИИ
⋮----
// 7. Процедурный умный fallback (если ИИ недоступен)
⋮----
// 8. Применение мутаций в БД и сохранение логов
⋮----
// А) Перемещение в новую локацию
⋮----
// Б) Повышение уровня / XP
⋮----
// В) Добавление полученного предмета в инвентарь NPC
⋮----
// Г) Обновление текущей активности
⋮----
// Д) Запись в таблицу npc_world_logs
⋮----
// Строка для общего системного сообщения
⋮----
// 9. Создаем системное сообщение в чате с хроникой жизни мира
```

## File: supabase/functions/_shared/npcRaceResolver.ts
```typescript
// supabase/functions/_shared/npcRaceResolver.ts — Интеллектуальное определение расы NPC / монстров
export function resolveNpcRace(
  npc: string | {
    name?: string;
    race?: string;
    category?: string;
    status_tags?: string[];
  },
  categoryParam: string = "",
  raceParam: string = ""
): string
```

## File: supabase/functions/_shared/storyProgressEvaluator.ts
```typescript
// supabase/functions/_shared/storyProgressEvaluator.ts — Автоматическая проверка и продвижение целей сюжета
export interface StoryArc {
  id: string;
  act: number;
  title: string;
  description: string;
  goals: string[];
  completed_goals: string[];
  key_npcs?: string[];
  key_locations?: string[];
  status: "active" | "completed" | "pending";
}
⋮----
export interface StorylineData {
  title: string;
  summary: string;
  prologue?: string;
  current_arc_index: number;
  status: "active" | "in_progress" | "completed" | "sandbox";
  arcs: StoryArc[];
  created_at?: string;
  updated_at?: string;
}
⋮----
export function evaluateStoryProgress({
  storyline,
  playerAction,
  systemFacts = [],
  narrativeText = "",
  currentLocation = "",
  nearbyNpcs = [],
}: {
  storyline: StorylineData | any;
  playerAction: string;
  systemFacts?: string[];
  narrativeText?: string;
  currentLocation?: string;
  nearbyNpcs?: Array<{ name: string }>;
}):
⋮----
// Очистка основ слов для надёжного сопоставления
const cleanStem = (w: string)
⋮----
// Проверяем ключевые именованные сущности (NPC и локации)
⋮----
// Совпадение значимых слов из цели
⋮----
// Проверка завершения всей арки
```

## File: supabase/functions/deploy-schema/index.ts
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
⋮----
// Вызываем официальный Supabase Management API без ограничений CORS
```

## File: supabase/functions/generate-loot/index.ts
```typescript
// supabase/functions/generate-loot/index.ts
// Генерация лута, построек или предметов через отдельную нейросеть
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
```

## File: supabase/functions/manage-player/index.ts
```typescript
// supabase/functions/manage-player/index.ts
// Управление игроками в сессии (удаление/исключение участников Создателем сессии)
// Работает с SUPABASE_SERVICE_ROLE_KEY, проверяя права вызывающего пользователя.
⋮----
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
⋮----
// Авторизация инициатора по переданному токену
⋮----
// 1. Проверяем существование сессии и определяем создателя мира
⋮----
// 2. Находим целевого игрока в сессии
⋮----
// 3. Проверка прав: инициатор должен быть создателем мира или самим игроком
⋮----
// 4. Каскадное удаление данных игрока через adminClient (bypasses RLS)
⋮----
// 5. Системное сообщение в сессию
```

## File: supabase/functions/process-turn/engine/handlers/drop_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/drop_handler.ts
// Обработчик выбрасывания/избавления от предметов из инвентаря
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class DropHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// Определяем количество для сброса
⋮----
// Ищем предмет в инвентаре игрока
⋮----
// Поиск по точному совпадению или подстроке
⋮----
// Нечёткий поиск по корням слов (учитывая падежные окончания русского языка)
const cleanStem = (w: string)
```

## File: supabase/functions/process-turn/engine/dice.ts
```typescript
// supabase/functions/process-turn/engine/dice.ts
// Чистые D&D кубики для Deno/Edge runtime
// TypeScript-портировано из src/utils/dice.js
⋮----
// ============================================
// Базовые броски
// ============================================
⋮----
/**
 * Бросок кубика с N гранями (dN), 1..N
 */
export function rollDie(sides: number): number
⋮----
/**
 * Бросок d20 (1-20)
 */
export function rollD20(): number
⋮----
/**
 * Бросок d100 (1-100)
 */
export function rollD100(): number
⋮----
/**
 * Бросок с преимуществом (advantage): бросаем 2d20, берём большее
 */
export function rollD20Advantage():
⋮----
/**
 * Бросок с помехой (disadvantage): бросаем 2d20, берём меньшее
 */
export function rollD20Disadvantage():
⋮----
// ============================================
// Модификаторы характеристик
// ============================================
⋮----
/**
 * Модификатор характеристики D&D: floor((STAT - 10) / 2)
 */
export function getStatModifier(statValue: number): number
⋮----
/**
 * Бонус proficiency (D&D правило: ceil(level / 4) + 1)
 */
export function getProficiencyBonus(level: number): number
⋮----
// ============================================
// Парсинг и бросок дайсов урона
// ============================================
⋮----
/**
 * Парсит строку типа "1d8+2" или "2d6" или "1d4-1" в объект
 */
export function parseDiceString(diceStr: string):
⋮----
// Поддержка: 1d8, 1d8+2, 1d8-1, 2d6+3
⋮----
/**
 * Бросает урон по строке типа "1d8+2"
 */
export function rollDamage(diceStr: string):
⋮----
/**
 * Генерирует строку дайсов урона по уровню и тиру
 */
export function generateDamageDice(level: number, tier: number = 1, isSpecial: boolean = false): string
⋮----
// Базовые кубики по уровню
⋮----
// ============================================
// Проверка попадания (Attack Roll)
// ============================================
⋮----
export interface AttackRollResult {
  rolls: number[];
  chosen: number;
  modifier: number;
  total: number;
  target_dc: number;
  success: boolean;
  is_crit: boolean;
  is_fumble: boolean;
}
⋮----
export interface AttackRollOptions {
  target_dc: number;
  stat_modifier: number;
  proficiency_bonus?: number;
  advantage?: boolean;
  disadvantage?: boolean;
}
⋮----
/**
 * Бросок атаки против DC (AC цели или кастомный DC)
 */
export function performAttackRoll(opts: AttackRollOptions): AttackRollResult
⋮----
// Крит = автоуспех, фамбл = автопровал
⋮----
// ============================================
// Спасброски (Saving Throws)
// ============================================
⋮----
/**
 * Бросок спасброска
 */
export function performSavingThrow(
  stat_modifier: number,
  dc: number,
  proficiency_bonus: number = 0
):
⋮----
// ============================================
// Утилиты
// ============================================
⋮----
/**
 * Бросок N костей с M гранями
 */
export function rollDice(count: number, sides: number): number[]
⋮----
/**
 * Сумма бросков
 */
export function sumRolls(rolls: number[]): number
⋮----
/**
 * Среднее дайса для D&D (1d6=3.5, 1d8=4.5, etc.)
 */
export function getDieAverage(sides: number): number
```

## File: supabase/functions/process-turn/steps/fog_of_war_utils.ts
```typescript
// supabase/functions/process-turn/steps/fog_of_war_utils.ts
⋮----
import { TERRAIN_MODIFIERS } from "../../_shared/fog_location_generator.ts";
⋮----
/** Distance Tier — уровни расстояния */
⋮----
/** Пороги слышимости/видимости по типу события */
⋮----
/** Шаблоны дистантного восприятия */
⋮----
export function fogPickNarrative(eventType: string, tier: number, content: string): string | null
⋮----
/**
 * Расчёт эффективных порогов слышимости и видимости с учётом типа местности (terrain_type).
 */
export function fogGetEffectiveThresholds(eventType: string, terrainType?: string | null):
⋮----
export function fogGetDistanceTier(sourceZone: string | null, targetZone: string | null, locationMap: Record<string, Record<string, number>>): number
⋮----
return DISTANCE_TIER.CLOSE; // разные зоны, карты нет → считаем соседними
⋮----
export function fogExtractSpeech(actionText: string): string
```

## File: supabase/functions/process-turn/steps/npc_memory_updater.ts
```typescript
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
⋮----
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
⋮----
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
}): Promise<NpcUpdateSummary[]>
⋮----
// 1. Определяем NPC, с которыми взаимодействовал игрок
⋮----
// Если цель не была указана явно через ID, проверяем упоминание имени в тексте
⋮----
// 2. Получаем текущие отношения с этим игроком
⋮----
// 3. Оцениваем взаимодействие через LLM или fallback
⋮----
// 4. Сохраняем воспоминание в npc_memories
⋮----
// 5. Обновляем шкалу отношений в npc_relationships
```

## File: supabase/functions/process-turn/steps/stat_allocation_utils.ts
```typescript
// supabase/functions/process-turn/steps/stat_allocation_utils.ts
⋮----
/**
 * Парсинг намерения прокачки характеристик из текста чата
 */
export function parseStatAllocationIntent(text: string):
⋮----
// Шаблон 1: глагол + количество + характеристика
// "вкладываю 2 очка в силу", "качаю ловкость +1", "добавь 2 в выносливость", "повысь мудрость на 1"
⋮----
// Шаблон 2: характеристика + количество ("ловкость +1", "сила 2", "интеллект +2")
⋮----
// Шаблон 3: +N характеристика ("+1 сила", "+2 выносливость")
⋮----
// Шаблон 4: глагол + характеристика без цифр ("качаю силу", "повысь ловкость" -> 1 очко)
```

## File: supabase/functions/process-turn/steps/step3_persistence.ts
```typescript
// supabase/functions/process-turn/steps/step3_persistence.ts
// Шаг 3: Мутация БД (ACID Транзакция)
// Применяет все мутации из Шага 2 атомарно через RPC apply_turn_mutations.
⋮----
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EngineOutputPayload, EngineMutation } from "../engine/types.ts";
import { cleanTextForAI } from "../../_shared/utils.ts";
⋮----
// ============================================
// Типы
// ============================================
export interface PersistenceInputContext {
  session_id: string;
  engine_output: EngineOutputPayload;
}
⋮----
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
⋮----
// ============================================
// Коды ошибок, которые RPC может вернуть
// ============================================
⋮----
function isConflictError(details: string | null | undefined): boolean
⋮----
// ============================================
// Обогащение фактов на основе применённых мутаций
// ============================================
function enrichSystemFacts(engine_output: EngineOutputPayload, rpcResult: any): string[]
⋮----
// ============================================
// Lazy Supabase client
// ============================================
⋮----
function getSupabase()
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// ============================================
// Главная функция Шага 3
// ============================================
export async function applyTurnMutations(context: PersistenceInputContext, supabaseOverride?: any): Promise<PersistenceOutputPayload>
⋮----
// ============================================
// Если мутаций нет — сразу "committed"
// ============================================
⋮----
// ============================================
// Вызов RPC
// ============================================
⋮----
// ============================================
// Проверяем data.success (RPC может вернуть структуру ошибки)
// ============================================
⋮----
// Успех
⋮----
// Fallback: пустой ответ
```

## File: supabase/functions/process-turn/steps/time_utils.ts
```typescript
// supabase/functions/process-turn/steps/time_utils.ts
⋮----
/**
 * Утилиты времени (для fallback в GPS, если Шаг 1.6 не вызывается)
 */
export function advanceTime(base:
```

## File: supabase/functions/_shared/pet_taming_engine.ts
```typescript
// supabase/functions/_shared/pet_taming_engine.ts
// Интеллектуальная система приручения питомцев (звери и монстры)
// Эволюция: tertiary -> secondary -> main, звериные воспоминания, верность, бунт/побег и прокачка
⋮----
export interface PetTamingAttemptParams {
  supabase: any;
  acting_player: {
    id: string;
    name: string;
    stats?: { STR?: number; DEX?: number; CON?: number; INT?: number; WIS?: number; CHA?: number };
    skills?: Record<string, { level: number; effects: Record<string, number> }>;
  };
  target_creature: {
    id: string;
    name: string;
    category?: string; // 'beast' | 'monster' | 'npc'
    race?: string;
    role?: string; // 'tertiary' | 'secondary' | 'main'
    level?: number;
    hp?: number;
    max_hp?: number;
    armor_class?: number;
    is_hostile?: boolean;
    status_tags?: string[];
    stats?: Record<string, number>;
  };
  action_text: string;
  offered_item_name?: string;
}
⋮----
category?: string; // 'beast' | 'monster' | 'npc'
⋮----
role?: string; // 'tertiary' | 'secondary' | 'main'
⋮----
export interface PetTamingResult {
  is_taming_action: boolean;
  success: boolean;
  relationship_delta: number;
  new_score: number;
  new_tier: string;
  new_role: "tertiary" | "secondary" | "main";
  assigned_pet_name?: string;
  narrative_feedback: string;
  beast_memory?: string;
  status_tags: string[];
  became_hostile?: boolean;
  ran_away?: boolean;
}
⋮----
/**
 * Определяет предпочтительную пищу существа по его названию, расе и категории
 */
export function getCreatureDiet(name: string, category = "beast", race = ""): "carnivore" | "herbivore" | "magical" | "omnivore"
⋮----
// Магические существа / монстры
⋮----
// Травоядные
⋮----
// Всеядные
⋮----
// Хищники по умолчанию для диких зверей (волк, лиса, рысь и т.д.)
⋮----
/**
 * Проверяет, подходит ли предложенный предмет/еда диете существа
 */
export function evaluateFoodSuitability(diet: "carnivore" | "herbivore" | "magical" | "omnivore", foodName: string):
⋮----
/**
 * Генерирует благозвучную кличку питомца по виду и повадкам
 */
export function generatePetNickname(creatureName: string): string
⋮----
/**
 * Интеллектуальная обработка попытки приручения зверя или монстра
 */
export async function evaluatePetTamingAttempt(params: PetTamingAttemptParams): Promise<PetTamingResult | null>
⋮----
// 1. Проверяем диету и пригодность подношения
⋮----
// 2. Рассчитываем D&D сложность (DC)
⋮----
// Если зверь в бою и враждебен — сложнее
⋮----
// Если зверь ранен и игрок лечит/перевязывает его — огромный плюс к успеху
⋮----
// 3. Бросок игрока (WIS или CHA + навык дрессировки)
⋮----
// 4. Загружаем или создаём запись отношений в npc_relationships
⋮----
// Неудача
⋮----
// 5. Вычисляем новый тир и статус роли (tertiary -> secondary -> main)
⋮----
newRole = "main"; // ПОЛНОЦЕННЫЙ ГЛАВНЫЙ СПУТНИК!
⋮----
newRole = "secondary"; // ВТОРОСТЕПЕННЫЙ ПЕРСОНАЖ С ИМЕНЕМ!
⋮----
// Если зверь перешел в secondary или main — присваиваем красивую кличку
⋮----
// 6. Обновляем статус-теги существа
⋮----
// 7. Сохраняем в базу данных
⋮----
// Записываем звериное воспоминание в npc_memories
⋮----
/**
 * Проверка верности питомца при жестоком или пренебрежительном отношении игрока
 */
export async function evaluatePetLoyaltyCheck(params: {
  supabase: any;
  pet: any;
  player_id: string;
  harm_done_delta: number;
}): Promise<
⋮----
/**
 * Прокачка уровня питомца (1..100) за боевой опыт
 */
export function awardPetCombatXp(pet: any, xpGained: number):
⋮----
const hpGain = Math.max(2, 6 + conMod); // d8 кость хитов для зверя
```

## File: supabase/functions/_shared/skill_engine.ts
```typescript
// supabase/functions/_shared/skill_engine.ts
// Система динамических навыков игрока (1..100)
// Канонический реестр, нормализация алиасов без дублей, расчёт бонусов
⋮----
export interface SkillDefinition {
  key: string;
  name: string;
  description: string;
  statAffinity: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
}
⋮----
// ============================================
// Нормализатор синонимов (защита от дубликатов)
// ============================================
⋮----
// Кожевничество
⋮----
// Собирательство
⋮----
// Шахтёрское / горное дело
⋮----
// Строительство
⋮----
// Приручение и дрессировка
⋮----
// Алхимия
⋮----
// Мечи
⋮----
// Кинжалы и ножи
⋮----
// Топоры
⋮----
// Древковое оружие
⋮----
// Рукопашный бой
⋮----
// Стрельба
⋮----
// Кузнечное дело
⋮----
// Скрытность
⋮----
// Дипломатия
⋮----
// Медицина
⋮----
/**
 * Нормализует произвольную строку в канонический skill_key
 */
export function normalizeSkillKey(raw: string): string
⋮----
/**
 * Определяет боевой навык по экипированному оружию и тексту действия
 */
export function resolveWeaponSkill(weapon: any, actionText = ""):
⋮----
/**
 * Автоматически определяет, какой навык развивает действие игрока
 */
export function detectSkillFromAction(params: {
  action_type: string;
  action_text?: string;
  used_item_name?: string;
  skill_hint?: string;
}):
⋮----
// Приручение и взаимодействие с животными
⋮----
// Боевые действия и оружие
⋮----
// Шахтёрское дело (руда, жила, кирка, камень)
⋮----
// Строительство
⋮----
// Алхимия
⋮----
// Собирательство (природа, лес, ягоды, хворост)
⋮----
/**
 * Рассчитывает процентные и числовые бонусы от уровня навыка (1..100)
 */
export function calculateSkillBonuses(skillKey: string, level: number): Record<string, number>
⋮----
damage_bonus_pct: Math.floor(safeLvl * 0.5), // До +50% урона на 100 уровне
attack_bonus: Math.floor(safeLvl / 10),     // +1 к попаданию за каждые 10 уровней
⋮----
crit_chance_bonus_pct: Math.min(25, Math.floor(safeLvl * 0.25)), // до +25% крита
⋮----
damage_bonus_pct: Math.floor(safeLvl * 0.6), // Мощный урон до +60%
⋮----
find_chance_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)), // До +60% шанса
time_reduction_pct: Math.min(50, Math.floor(safeLvl * 0.5)),    // До -50% времени поиска
⋮----
taming_bonus_pct: Math.min(60, Math.floor(safeLvl * 0.6)), // До +60% к шансу приручения
⋮----
stealth_check_bonus: Math.floor(safeLvl / 5), // До +20 к проверке скрытности
⋮----
discount_pct: Math.min(30, Math.floor(safeLvl * 0.3)), // До -30% цен в лавках
⋮----
// Универсальный фоллбэк для любых динамически генерируемых навыков
```

## File: supabase/functions/process-turn/engine/handlers/build_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/build_handler.ts
// Обработчик постройки структур (build_structure)
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class BuildHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// ============================================
// Проверка наличия материалов
// ============================================
⋮----
// ============================================
// Бросок против DC
// ============================================
⋮----
// Провал: 30% материалов испорчено
⋮----
// ============================================
// Успех: списать материалы + создать структуру
// ============================================
```

## File: supabase/functions/process-turn/engine/handlers/index.ts
```typescript
// supabase/functions/process-turn/engine/handlers/index.ts
// Реестр всех хендлеров действий (Command Pattern)
⋮----
import { ActionHandler } from "../types.ts";
import { AttackHandler, StealthAttackHandler } from "./attack_handler.ts";
import { HarvestAmbientHandler } from "./harvest_ambient_handler.ts";
import { CraftHandler, CraftCustomHandler } from "./craft_handler.ts";
import { BuildHandler } from "./build_handler.ts";
import { TransferHandler } from "./transfer_handler.ts";
import { TalkHandler } from "./talk_handler.ts";
import { LootSearchHandler, SearchHandler } from "./loot_search_handler.ts";
import { MoveHandler } from "./move_handler.ts";
import { DropHandler } from "./drop_handler.ts";
⋮----
/**
 * Маппинг action_type → хендлер
 */
⋮----
function register(handler: ActionHandler)
⋮----
/**
 * Получить хендлер для действия
 */
export function getHandler(actionType: string): ActionHandler | null
⋮----
/**
 * Получить все зарегистрированные типы
 */
export function getRegisteredActionTypes(): string[]
```

## File: supabase/functions/_shared/utils.ts
```typescript
// supabase/functions/_shared/utils.ts
// Общие чистые утилиты для Edge Functions
⋮----
export function sanitizeKey(raw: string): string
⋮----
export function cleanTextForAI(raw: string | null | undefined, maxLength: number = 4000): string
⋮----
export type StatKey = typeof VALID_STATS[number];
export type StatsRecord = Record<StatKey, number>;
⋮----
export function parseAIJson(text: string): any
⋮----
// Try direct parse, then unwrap if it's a stats wrapper
⋮----
// Scan for all JSON objects by tracking brace depth
⋮----
// If brace scanning found nothing, fallback to greedy regex
⋮----
// First pass: prioritize objects containing stat keys directly
⋮----
// If it's a wrapper, check nested objects for stats
⋮----
// Second pass: return first parseable candidate
⋮----
export function validateAndFixStats(raw: any, options:
⋮----
export function getRaceAcBonus(race: string = 'Человек'): number
⋮----
export function calculateDerivedStats(stats: any =
```

## File: supabase/functions/process-turn/engine/handlers/_base.ts
```typescript
// supabase/functions/process-turn/engine/handlers/_base.ts
// Базовый класс для хендлеров действий
⋮----
import { ActionHandler, ActionHandlerResult, EngineInputContext, ActionResult, EngineMutation, EnginePlayer, EngineNpc } from "../types.ts";
import { RouterAction, ImproperToolUsage, StatToCheck } from "../../types.ts";
import { getStatModifier, getProficiencyBonus, performAttackRoll, rollDamage, parseDiceString, rollD100 } from "../dice.ts";
⋮----
/**
 * Базовый хендлер с утилитами
 */
export abstract class BaseActionHandler implements ActionHandler {
⋮----
abstract handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult;
⋮----
// ============================================
// Утилиты
// ============================================
⋮----
protected getStatMod(player: EnginePlayer, statName: string, injuryMod: number = 0): number
⋮----
protected getProficiency(player: EnginePlayer): number
⋮----
protected getStatToCheckMod(player: EnginePlayer, stat: StatToCheck, injuryPenalties: Record<string, number> =
⋮----
// Маппинг StatToCheck → стат игрока
⋮----
stealth: "DEX", // скрытность = DEX
survival: "WIS", // выживание = WIS
⋮----
none: "STR", // fallback
⋮----
protected findItemById(player: EnginePlayer, itemId: string): EnginePlayer["inventory"][0] | null
⋮----
protected findNpcById(context: EngineInputContext, npcId: string): EngineNpc | null
⋮----
protected findPlayerById(context: EngineInputContext, playerId: string): EnginePlayer | null
⋮----
/**
   * Парсит дайсы урона из атрибутов предмета или возвращает дефолт
   */
protected getWeaponDamage(item: EnginePlayer["inventory"][0] | null, defaultDice: string = "1d4"): string
⋮----
/**
   * Создаёт мутацию UPDATE_DURABILITY для improper_tool_usage
   */
protected buildDurabilityMutation(item: EnginePlayer["inventory"][0], usage: ImproperToolUsage): EngineMutation | null
⋮----
/**
   * Выполняет бросок атаки/проверки
   */
protected performCheck(
    statMod: number,
    targetDc: number,
    proficiency: number,
    advantage: boolean = false,
    disadvantage: boolean = false
):
⋮----
// В D&D 5e натуральная 1 на проверке характеристик/навыков НЕ является автопровалом: проверяется total >= target_dc
```

## File: supabase/functions/process-turn/engine/handlers/craft_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/craft_handler.ts
// Обработчик крафта (recipe + custom)
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation, EngineInventoryItem } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class CraftHandler extends BaseActionHandler {
⋮----
override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
/**
   * Общая логика для craft_recipe и craft_custom
   */
private handleCraft(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// ============================================
// Проверка наличия материалов
// ============================================
⋮----
// Строим Map инвентаря для быстрого поиска
⋮----
// Проверяем что все материалы есть в инвентаре
⋮----
// ============================================
// Бросок против DC
// ============================================
⋮----
// Провал: списываем 50% материалов как испорченные
⋮----
// ============================================
// Успех: списываем все материалы + создаём предмет
// ============================================
⋮----
/**
 * CraftCustomHandler — крафт по кастомному чертежу (dynamic_blueprint обязателен)
 */
export class CraftCustomHandler extends CraftHandler {
```

## File: supabase/functions/_shared/starting_location_generator.ts
```typescript
// supabase/functions/_shared/starting_location_generator.ts
// Генератор стартовой локации на основе карточки персонажа и первого сообщения
import { cleanTextForAI, parseAIJson } from "./utils.ts";
import { resolveNpcRace } from "./npcRaceResolver.ts";
⋮----
export interface SubzoneInfo {
  id: string;
  name: string;
  description?: string;
  pos_x?: number;
  pos_y?: number;
  radius?: number;
}
⋮----
export interface AvailableLocationInfo {
  id: string;
  name: string;
  type: string;
  description?: string;
  state_name?: string;
  pos_x?: number;
  pos_y?: number;
  subzones?: SubzoneInfo[];
}
⋮----
export interface StartingLocationResult {
  is_new_location: boolean;
  location_id: string;
  location_name: string;
  location_type: string;
  state_name: string;
  pos_x?: number;
  pos_y?: number;
  subzone_id?: string | null;
  subzone_name?: string | null;
  weather: string;
  atmosphere: {
    sounds: string[];
    visuals: string[];
  };
  game_time: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  initial_npcs: Array<{
    id: string;
    name: string;
    race: string;
    role: string;
    status_tags: string[];
    background?: string;
  }>;
}
⋮----
/**
 * Промпт для генерации стартовой локации под персонажа и его вводную реплику
 */
export function buildStartingLocationPrompt(params: {
  player: {
    name: string;
    race?: string;
    class?: string;
    appearance?: string;
    personality?: string;
    bio?: string;
  };
  action_text: string;
  world_name?: string;
  lore_context?: string;
  available_locations?: AvailableLocationInfo[];
}): string
⋮----
/**
 * Эвристический фоллбэк генерации стартовой локации (если AI недоступен)
 */
export function buildFallbackStartingLocation(
  paramsOrPlayer: any,
  actionTextOpt?: string,
  availableLocationsOpt?: AvailableLocationInfo[]
):
⋮----
// Если переданы существующие локации из БД — выбираем наиболее подходящую из них
⋮----
// Выбираем подзону внутри локации
⋮----
// Если игрок явно упомянул ночь
⋮----
/**
 * Обеспечивает наличие стартовой локации для сессии.
 * Если у сессии нет локации или это самый первый ход — генерирует её.
 */
export async function ensureStartingLocation(params: {
  supabase: any;
  session: any;
  player: {
    id: string;
    name: string;
    race?: string;
    class?: string;
    appearance?: string;
    personality?: string;
    bio?: string;
  };
  action_text: string;
  is_first_turn: boolean;
  lore_context?: string;
  available_locations?: AvailableLocationInfo[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<StartingLocationResult | null>
⋮----
// Если локация уже есть и это не первый ход сессии — возвращаем метаданные существующей локации
⋮----
} catch { /* ignore */ }
⋮----
// 1. Генерируем данные локации (через LLM или fallback)
⋮----
// 2. Проверяем, есть ли совпадение со списком существующих локаций в БД
⋮----
// Используем существующую локацию из БД! НЕ ДУБЛИРУЕМ её создание!
⋮----
// Определяем подзону
⋮----
// Загружаем существующих NPC этой локации
⋮----
// Существующих локаций в БД не найдено (пустой мир) — создаём государство и стартовую локацию
⋮----
locPosX = Math.floor(Math.random() * 401) - 200; // -200..200
locPosY = Math.floor(Math.random() * 401) - 200; // -200..200
⋮----
// Спавним стартовых NPC (если локация только что создана или у неё нет NPC)
⋮----
// Обновляем сессию: текущая локация и игровая дата/время
```

## File: supabase/functions/process-turn/engine/handlers/move_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/move_handler.ts
// Хендлер перемещения: «Бегу в укрытие», «Иду к озеру», «Отступаю назад».
// Если DC указан — выполняется проверка (например преодоление препятствия).
// Без DC — это свободное перемещение, всегда успешное (время/локация уже учтены в GPS).
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, ActionResult, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class MoveHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// ============================================
// Если есть DC — это проверка (например преодоление сложного участка)
// ============================================
⋮----
// ============================================
// Свободное перемещение без проверки (DC = null или 0)
// ============================================
```

## File: supabase/functions/process-turn/engine/handlers/transfer_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/transfer_handler.ts
// Обработчик передачи предметов между владельцами
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class TransferHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// Резолв предмета по ID или названию
⋮----
// Резолв получателя по ID или имени
⋮----
// Если всё ещё нет targetId, но рядом есть ровно один мирный NPC — передаём ему
⋮----
// Если рядом есть ровно один сопартиец (кроме действующего игрока) — передаём ему
⋮----
// ============================================
// Определяем тип получателя (player/npc/location)
// ============================================
⋮----
// ============================================
// Мутация TRANSFER_ITEM (без кубиков)
// ============================================
```

## File: supabase/functions/process-turn/engine/step2_engine.ts
```typescript
// supabase/functions/process-turn/engine/step2_engine.ts
// Шаг 2: Математическое Ядро (D&D Engine)
// Оркестратор: прогоняет actions через хендлеры, считает энкаунтеры, агрегирует мутации.
⋮----
import {
  EngineInputContext,
  EngineOutputPayload,
  ActionResult,
  EngineMutation,
  EncounterTriggered,
  ActionHandlerResult,
} from "./types.ts";
import { RouterOutputPayload, RouterAction } from "../types.ts";
import { getHandler, getRegisteredActionTypes } from "./handlers/index.ts";
import { rollD100 } from "./dice.ts";
⋮----
// ============================================
// Пороги энкаунтеров по сложности (d100)
// ============================================
⋮----
easy: 5,   // < 5%
normal: 10, // < 10%
hard: 15,   // < 15%
⋮----
function getEncounterTier(d100roll: number):
⋮----
// ============================================
// Обработка одного действия
// ============================================
function processAction(
  action: RouterAction,
  context: EngineInputContext
): ActionHandlerResult
⋮----
// ============================================
// Генерация энкаунтера (d100)
// ============================================
function rollEncounter(difficulty: "easy" | "normal" | "hard"): EncounterTriggered
⋮----
// ============================================
// Главный фасад движка
// ============================================
export function executeEngine(context: EngineInputContext): EngineOutputPayload
⋮----
// Если роутер пометил действие как impossible — сразу выход
⋮----
// ============================================
// Прогон всех действий через хендлеры
// ============================================
⋮----
// ============================================
// Длительное действие (Busy State)
// ============================================
⋮----
// ============================================
// ADVANCE_TIME
// ============================================
⋮----
// ============================================
// Случайный энкаунтер (с учетом сложности сессии, времени и скрытности)
// ============================================
⋮----
// Базовый порог по сложности сессии ('easy' = 5, 'normal' = 10, 'hard' = 15)
```

## File: supabase/functions/process-turn/engine/types.ts
```typescript
// supabase/functions/process-turn/engine/types.ts
// Типы для Шага 2: Математическое Ядро (D&D Engine)
⋮----
import { RouterOutputPayload, RouterAction } from "../types.ts";
⋮----
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
⋮----
stats: Record<string, number>; // STR, DEX, CON, INT, WIS, CHA
⋮----
export interface EngineInventoryItem {
  id: string;
  item_name: string;
  type: string; // weapon, armor, consumable, tool, material, misc
  quantity: number;
  durability?: number | null;
  condition?: string | null;
  attributes?: Record<string, any> | null; // может содержать damage_dice
}
⋮----
type: string; // weapon, armor, consumable, tool, material, misc
⋮----
attributes?: Record<string, any> | null; // может содержать damage_dice
⋮----
export interface EngineInjury {
  stat_penalties?: Record<string, number>;
  duration_hours?: number;
}
⋮----
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
⋮----
export interface EngineLocationItem {
  id: string;
  item_name: string;
  type: string;
  quantity: number;
}
⋮----
// ============================================
// Цели
// ============================================
export interface EngineTargets {
  players: Map<string, EnginePlayer>;
  npcs: Map<string, EngineNpc>;
  location_items: Map<string, EngineLocationItem>;
}
⋮----
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
⋮----
// ============================================
// Входной контекст движка
// ============================================
export interface EngineInputContext {
  router_output: RouterOutputPayload;
  session: EngineSession;
  acting_player: EnginePlayer;
  targets: EngineTargets;
}
⋮----
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
  | { type: "ADVANCE_TIME"; minutes: number }
  | { type: "SET_PLAYER_BUSY"; player_id: string; activity: string; minutes: number; reward_preview?: string }
  | { type: "UPDATE_ENTITY_COORDS"; entity_type: "player" | "npc"; id: string; pos_x: number; pos_y: number }
  | { type: "SET_PLAYER_SUBZONE"; player_id: string; subzone_id: string | null };
⋮----
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
⋮----
// ============================================
// Энкаунтер
// ============================================
export interface EncounterTriggered {
  triggered: boolean;
  tier?: number;
  creature_name?: string;
}
⋮----
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
⋮----
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
⋮----
/**
   * Тип действия, который обрабатывает хендлер
   */
⋮----
/**
   * Обрабатывает действие и возвращает результат + мутации
   */
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult;
⋮----
export interface ActionHandlerResult {
  result: ActionResult;
  mutations: EngineMutation[];
  system_facts: string[];
}
```

## File: supabase/functions/process-turn/steps/_shared_prompts.ts
```typescript
// supabase/functions/process-turn/steps/_shared_prompts.ts
// Промпты для Сателит (Шаг 1) и GPS (Шаг 1.6), вынесенные из index.ts
⋮----
export function buildSatellitePrompt(params: {
  playerName: string;
  playerRace: string;
  playerClass: string;
  currentLocation: string | null;
  currentState: string | null;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentHour: number;
  currentMinute: number;
  recentMessages: string[];
}): string
⋮----
export function buildGpsPrompt(params: {
  playerName: string;
  actionText: string;
  intentType: string;
  intentDescription: string;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentHour: number;
  currentMinute: number;
  currentLocation: string | null;
  currentState: string | null;
  currentWildZone?: string | null;
  wantsLocationChange: boolean;
  locationChangeDescription: string;
  availableLocations: { id?: string; name: string; type?: string; state_name?: string }[];
  availableSubzones?: string[]; // подзоны текущей локации для AI zone matching
}): string
⋮----
availableSubzones?: string[]; // подзоны текущей локации для AI zone matching
```

## File: supabase/functions/_shared/npc_combat_ai.ts
```typescript
// supabase/functions/_shared/npc_combat_ai.ts
// Пошаговый боевой ИИ для NPC: тактический выбор навыка (спецатака vs базовая атака), D&D броски и расчёт урона
⋮----
import { parseAIJson, cleanTextForAI } from "./utils.ts";
⋮----
export interface NpcAttackDefinition {
  name: string;
  description?: string;
  damage_type?: string;
  damage_dice: string;
  is_special?: boolean;
}
⋮----
export interface BattlefieldPlayer {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
  armor_class: number;
  class?: string;
}
⋮----
export interface NpcTacticalDecision {
  action_type: "special_attack" | "base_attack" | "basic_attack";
  attack_name: string;
  damage_dice: string;
  damage_type: string;
  target_player_id: string;
  target_player_name: string;
  tactical_reason: string;
}
⋮----
export interface NpcAttackResult {
  npc_id: string;
  npc_name: string;
  target_player_id: string;
  target_player_name: string;
  attack_name: string;
  damage_type: string;
  d20: number;
  total_attack: number;
  target_ac: number;
  is_hit: boolean;
  is_crit: boolean;
  damage: number;
  log_message: string;
  mutation: {
    type: "UPDATE_HP";
    target_type: "player";
    id: string;
    delta: number;
  };
}
⋮----
function getStatMod(statValue: number): number
⋮----
function getProficiencyBonus(level: number): number
⋮----
function rollD20(): number
⋮----
function rollDice(diceStr: string): number
⋮----
/**
 * Тактический фоллбэк выбора атаки NPC (без LLM):
 * Не просто бьет самую слабую цель, а взвешивает угрозу (высокий урон / маг / танк / случайность).
 */
export function buildFallbackNpcDecision(params: {
  npc: any;
  players: BattlefieldPlayer[];
}): NpcTacticalDecision
⋮----
// Умный выбор цели вместо чистого слабейшего:
// 40% вероятность атаковать активную угрозу (мага/стрелка), 40% ближайшего/наиболее раненого, 20% случайного игрока
⋮----
// Приоритет магов / стрелков / опасных классов
⋮----
// Добивание уязвимого
⋮----
// Случайная цель в суматохе боя
⋮----
/**
 * ИИ-выбор тактического действия NPC на его ходу.
 * Использует надежные Free LLM модели с тактическим промптом, учитывающим характер существа,
 * угрозы на поле боя, защиту союзников и тактические хитрости.
 */
export async function decideNpcCombatAction(params: {
  npc: any;
  players: BattlefieldPlayer[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<NpcTacticalDecision>
⋮----
/**
 * Исполняет атаку NPC по правилам D&D: d20 + мод против AC игрока, урон, криты
 */
export function executeNpcAttack(params: {
  npc: any;
  targetPlayer: BattlefieldPlayer;
  decision: NpcTacticalDecision;
}): NpcAttackResult
⋮----
// Используем лучший модификатор (STR или DEX)
⋮----
export interface CompanionAttackResult {
  companion_id: string;
  companion_name: string;
  target_mob_id: string;
  target_mob_name: string;
  attack_name: string;
  d20: number;
  total_attack: number;
  target_ac: number;
  is_hit: boolean;
  is_crit: boolean;
  damage: number;
  remaining_mob_hp: number;
  is_mob_defeated: boolean;
  log_message: string;
}
⋮----
/**
 * Исполняет атаку спутника по враждебному мобу (например, волку) по правилам D&D:
 * бросок d20 + мод характеристики + бонус мастерства vs КД моба, расчёт урона и победы над врагом.
 */
export function executeCompanionAttack(params: {
  companion: any;
  targetMob: { id: string; name: string; hp: number; max_hp?: number; armor_class?: number };
  attackName?: string;
  damageDice?: string;
}): CompanionAttackResult
```

## File: supabase/functions/process-turn/engine/handlers/attack_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/attack_handler.ts
// Обработчик атаки (и stealth_attack)
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollDamage } from "../dice.ts";
import { resolveWeaponSkill } from "../../../_shared/skill_engine.ts";
⋮----
export class AttackHandler extends BaseActionHandler {
⋮----
override handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// ============================================
// PvP проверка
// ============================================
⋮----
// Цель — другой игрок
⋮----
// ============================================
// Модификаторы (с учётом травм)
// ============================================
⋮----
// STR-мод для melee, DEX для ranged (упрощение: STR)
⋮----
// Преимущество/помеха по сложности сессии
⋮----
// DC: AC цели (или кастомный)
⋮----
// Определение оружия и соответствующего боевого навыка игрока (мечи, кинжалы, топоры, копья, луки, кулаки, магия)
⋮----
// Дополнительный шанс крита для кинжалов/высоких боевых навыков (крит при d20 >= 19)
⋮----
// ============================================
// Improper tool usage: штраф прочности
// ============================================
⋮----
// ============================================
// Попадание: расчёт урона
// ============================================
⋮----
// Крит: удваиваем кубики урона
⋮----
// Применяем растущий бонус навыка к урону (1..100)
⋮----
// Мутация HP цели
⋮----
/**
 * Stealth Attack — атака из скрытности (преимущество + бонусный урон)
 */
export class StealthAttackHandler extends AttackHandler {
⋮----
// Выполняем базовую атаку, но форсируем преимущество
⋮----
// Бонус +1d6 к урону за скрытность
⋮----
const bonusDmg = 6; // 1d6 = 6 в среднем
```

## File: supabase/functions/process-turn/engine/handlers/loot_search_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/loot_search_handler.ts
// Обработчик лута/обыска
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollD100 } from "../dice.ts";
⋮----
export class LootSearchHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// Нельзя лутать живого врага (без флага "is_alive = false" — нельзя)
⋮----
// ============================================
// Бросок: investigation
// ============================================
⋮----
// ============================================
// Успех: генерируем 1-3 предмета (упрощённо — 1 предмет из target_name)
// ============================================
⋮----
/**
 * SearchHandler — обыск локации (без цели-NPC)
 */
export class SearchHandler extends BaseActionHandler {
⋮----
// Игрок внимательно осматривал/обыскивал местность без конкретного предмета или исследовал следы/улики —
// фиксируем успех внимательности как факт восприятия без захламления инвентаря пустышками
```

## File: supabase/functions/process-turn/engine/handlers/talk_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/talk_handler.ts
// Обработчик разговора / социального взаимодействия
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext } from "../types.ts";
import { RouterAction } from "../../types.ts";
⋮----
export class TalkHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// 1. ПРИОРИТЕТ: Проверяем, обращается ли игрок по имени к другому игроку сессии (в тексте или в hint)
⋮----
// 2. Если по тексту/hint не нашли, проверяем target_entity_id среди игроков
⋮----
// 3. Если это диалог с другим живым игроком — НИКОГДА не ищем NPC и не бросаем кубики!
⋮----
// 4. Только если цель точно не живой игрок — ищем NPC
⋮----
// Резолв по подсказке имени среди NPC
⋮----
// ============================================
// Диалог с NPC: insight (WIS) или persuasion (CHA)
// ============================================
```

## File: supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts
```typescript
// supabase/functions/process-turn/engine/handlers/harvest_ambient_handler.ts
// Обработчик сбора ресурсов из окружающей среды
⋮----
import { BaseActionHandler } from "./_base.ts";
import { ActionHandlerResult, EngineInputContext, EngineMutation } from "../types.ts";
import { RouterAction } from "../../types.ts";
import { rollD100 } from "../dice.ts";
⋮----
export function isAbstractObservation(name?: string | null): boolean
⋮----
export function resolveHarvestedItem(
  rawTargetName?: string | null,
  actionText?: string
):
⋮----
// Признаки реальных собираемых физических ресурсов
⋮----
// Извлечение из текста действия игрока (фэнтези и природа)
⋮----
// Киберпанк / Sci-Fi / Постапокалипсис (свалка, город, технологии)
⋮----
export class HarvestAmbientHandler extends BaseActionHandler {
⋮----
handle(action: RouterAction, context: EngineInputContext): ActionHandlerResult
⋮----
// ============================================
// Модификатор (survival = WIS) + бонус навыка собирательства/шахтёрства
// ============================================
⋮----
// DC: из AI (обычно 10-15 для лёгкого сбора, 25-40 для сложного)
⋮----
// ============================================
// Improper tool usage: всегда применяем (если есть)
// ============================================
⋮----
// Если действие оказалось наблюдением/следами, а не сбором физических предметов
⋮----
// ============================================
// Успех: INSERT_ITEM
// ============================================
// Бросок d100 для базового количества (1-3 единиц)
let quantity = Math.min(3, Math.max(1, Math.ceil(rollD100() / 33.33))); // 1, 2 или 3
⋮----
// Бонус шанса находок от навыка Собирательства (до +60% на 100 ур.)
```

## File: supabase/functions/_shared/npc_autonomous_engine.ts
```typescript
// supabase/functions/_shared/npc_autonomous_engine.ts
// Автономность NPC: инициатива спутников в текущей сцене и долгосрочные экспедиции
// Оптимизировано по токенам (0 токенов в обычные ходы благодаря Event-driven Lazy Simulation)
⋮----
export interface GameTimePoint {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}
⋮----
export function gameTimeToMinutes(t: GameTimePoint): number
⋮----
import { parseAIJson } from "./utils.ts";
⋮----
/**
 * Инициатива спутника в текущей сцене:
 * Спутник (член отряда) анализирует действие игрока через быструю Free LLM.
 * Он понимает контекст (даже неочевидные или рискованные замыслы игрока),
 * активно предлагает помощь, прикрывает, ищет ресурсы или комментирует происходящее.
 */
export async function handleCompanionInSceneAction(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  location_npcs: any[];
  session_id: string;
  openrouter_api_key?: string;
  model?: string;
}): Promise<
⋮----
// Ищем живого спутника из отряда
⋮----
// 1. Попытка через Free LLM: анализируем намерение игрока и даем живую инициативу спутнику
⋮----
// 2. Процедурный умный fallback (если LLM недоступна или нет сети)
⋮----
/**
 * Обработка приглашения NPC в спутники / путешествие / отряд.
 * Срабатывает при высоком уровне отношений (friendly, trusted, devoted или score >= 20).
 */
export type CompanionDialogueType = "invitation_accepted" | "invitation_rejected" | "proactive_offer";
⋮----
/**
 * Процедурный генератор реплик спутников по архетипам, привычкам и коронным фразам (Offline / Fallback).
 * Обеспечивает уникальный голос для каждого класса и характера без шаблонности.
 */
export function generateProceduralCompanionDialogue(params: {
  npc: any;
  player_name: string;
  relationship: { score: number; tier: string };
  type: CompanionDialogueType;
}): string
⋮----
// Префикс привычки/действия персонажа
⋮----
// Коронная фраза (если есть)
⋮----
// Определение архетипа
⋮----
// 1) Питомец / Зверь
⋮----
// 2) Воин / Наёмник / Дворф
⋮----
// 3) Маг / Эльф / Учёный
⋮----
// 4) Плут / Следопыт / Охотник
⋮----
// 5) Жрец / Целитель / Монах
⋮----
// 6) Общий странник / искатель приключений (Default)
⋮----
// invitation_rejected
⋮----
/**
 * Генерирует диалог спутника: приоритетно через OpenRouter LLM, с откатом к процедурному движку.
 */
export async function generateCompanionDialogue(params: {
  npc: any;
  player_name: string;
  relationship: { score: number; tier: string };
  type: CompanionDialogueType;
  openrouter_api_key?: string;
  model?: string;
}): Promise<string>
⋮----
/**
 * Обработка приглашения NPC в спутники / путешествие / отряд.
 * Срабатывает при высоком уровне отношений (friendly, trusted, devoted или score >= 20).
 */
export async function handleCompanionInvitation(params: {
  supabase: any;
  player_action_text: string;
  acting_player_name: string;
  acting_player_id: string;
  location_npcs: any[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<
⋮----
// Ищем дружелюбного живого NPC
⋮----
// Проверяем отношения с игроком в npc_relationships
⋮----
// NPC соглашается стать спутником и присоединиться к отряду!
⋮----
/**
 * Проактивная инициатива NPC: NPC САМ предлагает отправиться в путешествие с игроком,
 * если уровень доверия и симпатии высок (score >= 25 или friendly/trusted/devoted),
 * а NPC ещё не состоит в отряде.
 */
export async function checkNpcProactiveCompanionOffer(params: {
  supabase: any;
  acting_player_name: string;
  acting_player_id: string;
  location_npcs: any[];
  openrouter_api_key?: string;
  model?: string;
}): Promise<
⋮----
// Ищем дружелюбного живого NPC, который ещё не спутник
⋮----
// Проверяем отношения
⋮----
// Фиксируем флаг, чтобы не спамить предложением каждый ход
⋮----
/**
 * Разрешает долгосрочные экспедиции NPC за кадром (Lazy Resolution по календарю).
 * Срабатывает, когда игровое время дошло до activity_ends_game_time.
 * Тратит 0 токенов во время обычных ходов!
 */
export async function resolveNpcBackgroundActivities(params: {
  supabase: any;
  world_id: string;
  current_game_time: GameTimePoint;
}): Promise<Array<
⋮----
// Находим NPC мира, у которых есть незавершённая деятельность
⋮----
// Если срок экспедиции ещё не подошёл — пропускаем (0 токенов, 0 лишних действий)
⋮----
// Время экспедиции завершилось! Начисляем результаты
⋮----
const xpGained = daysDuration * 50; // 50 XP за день охоты/тренировки
⋮----
// Добавляем трофеи в инвентарь NPC
⋮----
// Записываем воспоминание NPC о походе
⋮----
// Обновляем NPC: очищаем деятельность, сохраняем уровень, статы и возвращаем в локацию
⋮----
// Авто-распределение статов в зависимости от расы/роли
```

## File: supabase/functions/process-turn/types.ts
```typescript
// supabase/functions/process-turn/types.ts
// Общие типы для пайплайна process-turn
// Паттерн: AI Router -> Game Engine -> DB Transaction -> System Truth -> AI Narrator
⋮----
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
⋮----
export interface NearbyNpc {
  id: string;
  name: string;
  race: string;
  is_hostile: boolean;
  hp: number;
  max_hp: number;
  distance_meters: number;
}
⋮----
export interface NearbyPlayer {
  id: string;
  name: string;
  race?: string;
  class?: string;
  level?: number;
  hp?: number;
  max_hp?: number;
  current_zone?: string | null;
}
⋮----
export interface WeatherInfo {
  description: string;
  temperature: number;
  is_raining: boolean;
  is_night: boolean;
  wind_speed: number;
}
⋮----
export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}
⋮----
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
⋮----
export interface RouterInputContext {
  // Текст игрока
  player_action_text: string;

  // Недавняя история чата для контекста (кто кому что сказал)
  recent_history?: string;

  // Снимок игрока
  player: PlayerSnapshot;

  // Инвентарь (строгие ID)
  inventory: InventoryItem[];

  // NPC рядом
  nearby_npcs: NearbyNpc[];

  // Другие игроки рядом (сопартийцы в сессии)
  nearby_players?: NearbyPlayer[];

  // Погода
  weather: WeatherInfo;

  // Игровое время
  game_time: GameTime;

  // Текущая локация
  current_location_id: string | null;
  current_location_name: string | null;

  // Сюжетная линия (ориентиры)
  storyline?: any;
}
⋮----
// Текст игрока
⋮----
// Недавняя история чата для контекста (кто кому что сказал)
⋮----
// Снимок игрока
⋮----
// Инвентарь (строгие ID)
⋮----
// NPC рядом
⋮----
// Другие игроки рядом (сопартийцы в сессии)
⋮----
// Погода
⋮----
// Игровое время
⋮----
// Текущая локация
⋮----
// Сюжетная линия (ориентиры)
⋮----
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
  | "drop"
  | "talk"
  | "search"
  | "harvest_ambient";
⋮----
export type StatToCheck =
  | "strength"
  | "dexterity"
  | "stealth"
  | "survival"
  | "investigation"
  | "insight"
  | "none";
⋮----
export interface ImproperToolUsage {
  is_improper: boolean;
  durability_penalty: number;
  stat_penalty: "damage" | null;
  reason: string;
}
⋮----
export interface TargetCoords {
  x: number;
  y: number;
}
⋮----
export interface RouterAction {
  action_type: ActionType;
  target_entity_id: string | null;
  target_name?: string | null;
  target_item_name: string | null;
  item_type?: string | null;
  used_item_id: string | null;
  consumed_materials: Array<{ id: string; quantity: number }> | null;
  stat_to_check: StatToCheck;
  ai_custom_dc: number | null;
  improper_tool_usage: ImproperToolUsage | null;
  dynamic_blueprint?: any | null;
  raw_action_text?: string | null;
  target_coords?: TargetCoords | null;
  target_subzone_id?: string | null;
  speed_modifier?: number | null;
  stealth_factor?: number | null;
}
⋮----
export interface EncounterIntent {
  type: "targeted" | "random" | "none";
  target_name: string | null;
}
⋮----
export interface Atmosphere {
  sounds: string[];
  visuals: string[];
}
⋮----
export type RouterStatus = "success" | "clarification_needed" | "impossible";
⋮----
export interface LongTermActivity {
  is_long_term: boolean;
  activity_name: string;
  duration_minutes: number;
  reward_preview?: string;
}
⋮----
export interface RouterOutputPayload {
  status: RouterStatus;
  clarification_msg: string | null;
  actions: RouterAction[];
  encounter_intent: EncounterIntent;
  time_estimate_minutes: number;
  atmosphere: Atmosphere;
  skill_hint?: string | null;
  event_type?: string | null;
  long_term_activity?: LongTermActivity | null;
}
⋮----
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
⋮----
hidden_from_others: boolean; // Туман войны
⋮----
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
⋮----
// Глобальные факты (видны всем)
⋮----
// Персональные факты по игрокам
⋮----
// Кто что получил (для тумана войны)
⋮----
// Теги атмосферы
⋮----
// ============================================
// Результат обработки Шага 5 (AI-Рассказчик)
// ============================================
export interface NarratorOutput {
  global_log: string | null;
  personal_narratives: Record<string, string>;
}
```

## File: supabase/functions/process-turn/steps/step4_system_truth.ts
```typescript
// supabase/functions/process-turn/steps/step4_system_truth.ts
// Шаг 4: Сборка Системной Истины (System Truth Compiler)
//
// Принимает:
//   - EngineOutputPayload (Шаг 2: кубики и проверки)
//   - PersistenceOutputPayload (Шаг 3: подтверждено БД)
//   - session, location, players, npcs, items
//
// Назначение:
//   1. Скомпилировать строгий SystemTruthDto для Шага 5 (LLM-нарратор).
//   2. Разделить события по персональным корзинам видимости (Туман Войны / Anti-Metagaming).
//   3. Подтянуть RAG-память NPC (match_npc_memories) только для тех NPC, с которыми игрок взаимодействовал.
⋮----
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EngineOutputPayload, EngineMutation } from "../engine/types.ts";
import {
  calculateRelationshipTier,
  getRelationshipTierLabel,
  RelationshipTier,
} from "../../_shared/npc_relationship_engine.ts";
⋮----
// ============================================
// Типы
// ============================================
⋮----
export interface PlayerKnowledge {
  player_id: string;
  player_name?: string;
  player_race?: string;
  player_class?: string;
  is_acting_player?: boolean;
  knowledge: string[]; // Только то, что видит ЭТОТ игрок
  hp_status: {
    current: number;
    max: number;
    delta: number;
  };
  inventory_delta: {
    added: string[];
    removed: string[];
    damaged: string[];
  };
}
⋮----
knowledge: string[]; // Только то, что видит ЭТОТ игрок
⋮----
export interface NpcContextSummary {
  npc_id: string;
  name: string;
  race?: string;
  role?: string;
  appearance?: string | null;
  background?: string | null;
  habits?: string | null;
  catchphrases?: string[];
  current_activity?: string | null;
  status_tags?: string[];
  temperament?: string | null;
  motivation?: string | null;
  current_mood?: string | null;
  secrets?: string | null;
  rumors?: string[] | null;
  speech_style?: string | null;
  daily_routine?: string | null;
  relationship_score?: number;
  relationship_tier?: string;
  relationship_tier_label?: string;
  relevant_memories: string[];
  vivid_memories?: string[];
  regular_memories?: string[];
  impressions?: string[];
}
⋮----
export interface SystemTruthDto {
  session_id: string;
  turn_status: "success" | "conflict" | "impossible";
  environment: {
    location_name: string;
    weather: string | null;
    time: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    };
    time_passed_minutes: number;
    atmosphere: {
      sounds: string[];
      visuals: string[];
    };
  };
  global_events: string[];
  player_truths: Record<string, PlayerKnowledge>;
  present_npcs?: Array<{
    id: string;
    name: string;
    race?: string;
    role?: string;
    category?: string;
    status_tags?: string[];
    is_hostile?: boolean;
    appearance?: string | null;
    current_activity?: string | null;
    catchphrases?: string[];
    temperament?: string | null;
    current_mood?: string | null;
    speech_style?: string | null;
  }>;
  npc_context: Record<string, NpcContextSummary>;
  encounter_alert: {
    spawned: boolean;
    tier?: number;
    creature_name?: string;
  } | null;
  storyline?: {
    title: string;
    prologue?: string;
    current_arc?: {
      act: number;
      title: string;
      description: string;
      goals: string[];
      completed_goals: string[];
      key_npcs?: string[];
      key_locations?: string[];
    } | null;
  } | null;
}
⋮----
export interface SystemTruthInputContext {
  session_id: string;
  acting_player_id: string;
  engine_output: EngineOutputPayload;
  persistence_output: {
    status: "committed" | "aborted_conflict" | "error";
    applied_mutations_count: number;
    new_game_time?: { year: number; month: number; day: number; hour: number; minute: number };
    conflict_details?: string | null;
    enriched_system_facts: string[];
  };
  // Состояние мира
  session: {
    game_year: number;
    game_month: number;
    game_day: number;
    game_hour: number;
    game_minute: number;
    current_location_id: string;
  };
  location: { name: string; weather: string | null };
  // Все игроки в комнате
  players: Array<{
    id: string;
    name: string;
    hp: number;
    max_hp: number;
    inventory: Array<{ id: string; item_name: string; quantity: number; durability?: number | null; condition?: string | null }>;
  }>;
  // Все NPC в комнате
  npcs: Array<{
    id: string;
    name: string;
    race?: string;
    role?: string;
    category?: string;
    status_tags?: string[];
    is_alive?: boolean;
    is_hostile?: boolean;
    appearance?: string | null;
    background?: string | null;
    habits?: string | null;
    catchphrases?: string[];
    current_activity?: string | null;
    temperament?: string | null;
    motivation?: string | null;
    current_mood?: string | null;
    secrets?: string | null;
    rumors?: string[] | null;
    speech_style?: string | null;
    daily_routine?: string | null;
  }>;
  // Атмосфера
  atmosphere: { sounds: string[]; visuals: string[] };
  // Сколько минут прошло (для time_passed_minutes)
  time_passed_minutes: number;
  // Случайный энкаунтер
  encounter_alert: { spawned: boolean; tier?: number; creature_name?: string } | null;
  // Сюжетная линия сессии
  storyline?: any;
}
⋮----
// Состояние мира
⋮----
// Все игроки в комнате
⋮----
// Все NPC в комнате
⋮----
// Атмосфера
⋮----
// Сколько минут прошло (для time_passed_minutes)
⋮----
// Случайный энкаунтер
⋮----
// Сюжетная линия сессии
⋮----
// ============================================
// Lazy Supabase client
// ============================================
⋮----
function getSupabase()
⋮----
// @ts-ignore
⋮----
// @ts-ignore
⋮----
// ============================================
// Утилиты: работа с временем
// ============================================
function minutesToTimeParts(baseHour: number, baseMinute: number, baseDay: number, baseMonth: number, baseYear: number, addMinutes: number)
⋮----
function timeOfDayRu(hour: number): string
⋮----
// ============================================
// Парсинг мутаций → human-readable события
// ============================================
function getDamageFromHpUpdate(m: any): number
⋮----
// delta отрицательный — значит это урон
⋮----
function getActionDisplayName(action: any): string
⋮----
function getActionSkillLabel(actionType: string, statToCheck?: string): string
⋮----
// ============================================
// Главная функция Шага 4
// ============================================
export async function compileSystemTruth(context: SystemTruthInputContext): Promise<SystemTruthDto>
⋮----
// ============================================
// 1. Определяем turn_status
// ============================================
// Приоритет: conflict > impossible > success
// (race condition важнее: даже если действие могло бы быть impossible, транзакция провалилась)
⋮----
// ============================================
// 2. Считаем время
// ============================================
⋮----
// ============================================
// 3. Собираем global_events (видны ВСЕМ в комнате)
// ============================================
⋮----
// Смена времени суток
⋮----
// Спавн структур
⋮----
// Бросок встречи был, но не сработал (если был)
// (это не global event — это личный факт, но мы можем логировать)
⋮----
// ============================================
// 4. Считаем HP и инвентарь для каждого игрока
// ============================================
⋮----
// ============================================
// HP delta
// ============================================
⋮----
// ============================================
// Inventory delta
// ============================================
⋮----
// ============================================
// Knowledge (факты для этого игрока)
// ============================================
⋮----
// Конфликт транзакции — критичный факт
⋮----
// Если этот игрок — инициатор, видит свои броски и DC
⋮----
// Успех
⋮----
// Этот игрок — НЕ инициатор. Нужно определить его знания.
⋮----
// 1. Проверяем, был ли этот игрок прямой целью действий
⋮----
// Проверяем получение предметов через TRANSFER_ITEM
⋮----
// Атака и урон
⋮----
// Передача предметов
⋮----
// Разговор / обращение
⋮----
// Другие прямые взаимодействия
⋮----
// 2. Если игрок не был прямой целью, но находится рядом как свидетель (bystander)
⋮----
// Обычное действие сопартийца рядом
⋮----
// ============================================
// 5. NPC context (Lazy RAG)
// ============================================
⋮----
// Находим NPC, с которыми взаимодействовал инициатор
⋮----
// action.target_entity_id может быть id NPC
⋮----
// talk-действия требуют памяти только если цель — NPC (а не живой игрок!)
⋮----
// Подтягиваем память и отношения только для активных NPC
⋮----
// 1) Отношения NPC с игроком
⋮----
// ignore if table not yet migrated or in test mocks
⋮----
// 2) Векторный поиск воспоминаний (Lazy RAG)
⋮----
// ignore
⋮----
// Fallback: последние 3 воспоминания по created_at DESC
⋮----
// ignore
⋮----
// 3) Разделение по уровням памяти (vivid, regular, impression)
⋮----
// ignore
⋮----
// ============================================
// 6. Финальный DTO
// ============================================
```

## File: supabase/functions/process-turn/steps/step5_narrator.ts
```typescript
// supabase/functions/process-turn/steps/step5_narrator.ts
// Шаг 5: AI-Рассказчик (Dungeon Master)
//
// Главный запрет: Категорически запрещено придумывать новый урон, предметы,
// смертельные исходы или события, которых нет в объекте player_truths[id].knowledge.
⋮----
import { SystemTruthDto } from "./step4_system_truth.ts";
⋮----
export interface NarratorOutputPayload {
  players: Record<string, string>; // player_id -> индивидуальный художественный текст
  global_narrative: string;        // Общий лог комнаты
}
⋮----
players: Record<string, string>; // player_id -> индивидуальный художественный текст
global_narrative: string;        // Общий лог комнаты
⋮----
export interface NarratorInputContext {
  system_truth: SystemTruthDto;
  action_text: string;
  player_name: string;
  player_race: string;
  player_class: string;
  lore_context: string;
  recent_history: string[]; // последние 6 сообщений для контекста ДМ
  openrouter_api_key: string;
  dm_model: string;
}
⋮----
recent_history: string[]; // последние 6 сообщений для контекста ДМ
⋮----
// ============================================
// Промпт для LLM
// ============================================
export function buildNarratorSystemPrompt(
  playerName: string,
  playerRace: string,
  playerClass: string,
  loreContext: string,
  storyline?: any
): string
⋮----
// ============================================
// Безопасный парсинг JSON
// ============================================
function safeParseJson(text: string): any | null
⋮----
// Убираем markdown-блоки
⋮----
// Ищем первую { и последнюю }
⋮----
// Попробуем починить частые ошибки
⋮----
// ============================================
// Fallback-нарратор (если LLM упал)
// ============================================
export function buildFallbackNarrative(systemTruth: SystemTruthDto): NarratorOutputPayload
⋮----
// Атмосфера (художественно)
⋮----
// Факты хода
⋮----
// HP изменение (только если было)
⋮----
// Предметы (художественно)
⋮----
// ============================================
// Преобразование SystemTruthDto в чистый нарративный контекст
// ============================================
export function buildNarratorContext(system_truth: SystemTruthDto, action_text: string, recent_history?: string[]): string
⋮----
// Предыстория — последние ходы (если есть)
⋮----
// ============================================
// Главная функция Шага 5
// ============================================
export async function generateNarrative(context: NarratorInputContext): Promise<NarratorOutputPayload>
⋮----
const cleanNarrativeText = (raw: string): string =>
⋮----
// Валидация: проверяем, что все players из SystemTruthDto присутствуют и очищены от псевдо-тегов
```

## File: supabase/functions/process-turn/steps/step1_router.ts
```typescript
// supabase/functions/process-turn/steps/step1_router.ts
// Шаг 1: AI-Маршрутизатор (AI Router)
// Лёгкий вызов LLM (satellite_model) для парсинга намерений игрока в строгий JSON.
// ИИ выступает "вышибалой" — отсекает абсурд и помечает нецелевое использование предметов.
⋮----
import { RouterInputContext, RouterOutputPayload, RouterAction, Atmosphere } from "../types.ts";
import { parseAIJson, cleanTextForAI } from "../../_shared/utils.ts";
⋮----
// ============================================
// Системный промпт
// ============================================
export function buildRouterSystemPrompt(): string
⋮----
// ============================================
// Сборка userMessage из контекста
// ============================================
export function buildUserMessage(input: any): string
⋮----
// ============================================
// Валидация ответа LLM
// ============================================
function validateRouterOutput(parsed: any): asserts parsed is RouterOutputPayload
⋮----
// Проверка status
⋮----
// Проверка actions
⋮----
// Проверка encounter_intent
⋮----
// Проверка time_estimate_minutes
⋮----
// Проверка atmosphere
⋮----
// ============================================
// Нормализация: заполнение дефолтных значений
// ============================================
function normalizeRouterOutput(parsed: any): RouterOutputPayload
⋮----
// Если есть harvest_ambient, убираем избыточный/ложный search (например, если модель выдала и сбор, и поиск)
⋮----
// ============================================
// Главная функция Шага 1
// ============================================
export async function parsePlayerIntent(
  input: RouterInputContext | any,
  apiKey?: string,
  model: string = DEFAULT_MODEL,
  retries: number = 3
): Promise<RouterOutputPayload>
⋮----
// Fallback: если модель не поддерживает response_format (HTTP 400), пробуем без него
⋮----
// Парсинг JSON
⋮----
// Защита от ложного clarification_needed:
// Если ввод игрока — это осмысленный ролевой запрос (описание появления, осмотр, путешествие),
// а нейросеть ошибочно вернула clarification_needed — автоматически конвертируем в success!
⋮----
// Валидация структуры
⋮----
// Нормализация дефолтных значений
⋮----
// Экспоненциальная задержка
⋮----
/**
 * Эвристический парсер действий на случай сбоя API OpenRouter
 */
export function buildRouterHeuristicFallback(input: RouterInputContext): RouterOutputPayload
⋮----
// 1. Выбрасывание предметов (drop) — выполняется гарантированно и без бросков кубиков
⋮----
const cleanStem = (w: string)
⋮----
// 2. Передача предмета другому персонажу / игроку / NPC (transfer)
⋮----
// Сначала ищем среди живых игроков!
⋮----
// 3. Разговор / обращение / вопрос / предложение (talk)
⋮----
// ВЫСШИЙ ПРИОРИТЕТ: живые игроки!
```

## File: supabase/functions/process-turn/index.ts
```typescript
// supabase/functions/process-turn/index.ts
// 5-РЎв‚¬Р В°Р С–Р С•Р Р†РЎвЂ№Р в„– Р С”Р С•Р Р…Р Р†Р ВµР в„–Р ВµРЎР‚ process-turn: Router РІвЂ вЂ™ Engine РІвЂ вЂ™ Persistence РІвЂ вЂ™ SystemTruth РІвЂ вЂ™ Narrator
//
// Р РЃР В°Р С–Р С‘:
//   1. AI Router  (step1_router.ts)        РІР‚вЂќ Р С—Р В°РЎР‚РЎРѓР С‘Р Р…Р С– Р Р…Р В°Р СР ВµРЎР‚Р ВµР Р…Р С‘Р в„– Р С‘Р С–РЎР‚Р С•Р С”Р В° РІвЂ вЂ™ JSON actions
//   2. Game Engine (engine/step2_engine.ts) РІР‚вЂќ Р В±РЎР‚Р С•РЎРѓР С”Р С‘ Р С”РЎС“Р В±Р С‘Р С”Р С•Р Р†, Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р С‘, Р СРЎС“РЎвЂљР В°РЎвЂ Р С‘Р С‘
//   3. Persistence (step3_persistence.ts)   РІР‚вЂќ Р В°РЎвЂљР С•Р СР В°РЎР‚Р Р…Р С•Р Вµ Р С—РЎР‚Р С‘Р СР ВµР Р…Р ВµР Р…Р С‘Р Вµ Р СРЎС“РЎвЂљР В°РЎвЂ Р С‘Р в„– РЎвЂЎР ВµРЎР‚Р ВµР В· RPC
//   4. System Truth (step4_system_truth.ts) РІР‚вЂќ Р СћРЎС“Р СР В°Р Р… Р вЂ™Р С•Р в„–Р Р…РЎвЂ№, РЎР‚Р В°Р В·Р Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р Р†Р С‘Р Т‘Р С‘Р СР С•РЎРѓРЎвЂљР С‘, RAG
//   5. Narrator  (step5_narrator.ts)        РІР‚вЂќ LLM-Р Р…Р В°РЎР‚РЎР‚Р В°РЎвЂљР С•РЎР‚ (Р С‘Р В»Р С‘ fallback)
⋮----
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeKey, cleanTextForAI, parseAIJson } from "../_shared/utils.ts";
import { parsePlayerIntent, buildRouterHeuristicFallback } from "./steps/step1_router.ts";
import { executeEngine } from "./engine/step2_engine.ts";
⋮----
import { applyTurnMutations } from "./steps/step3_persistence.ts";
import { compileSystemTruth } from "./steps/step4_system_truth.ts";
import { generateNarrative, buildFallbackNarrative } from "./steps/step5_narrator.ts";
import { processNpcInteractions } from "./steps/npc_memory_updater.ts";
import { ensureStartingLocation } from "../_shared/starting_location_generator.ts";
import { detectSkillFromAction, calculateSkillBonuses } from "../_shared/skill_engine.ts";
import { handleCompanionInSceneAction, resolveNpcBackgroundActivities, handleCompanionInvitation, checkNpcProactiveCompanionOffer } from "../_shared/npc_autonomous_engine.ts";
import { decideNpcCombatAction, executeNpcAttack, executeCompanionAttack } from "../_shared/npc_combat_ai.ts";
import { evaluatePetTamingAttempt, evaluatePetLoyaltyCheck, awardPetCombatXp } from "../_shared/pet_taming_engine.ts";
import { buildSatellitePrompt, buildGpsPrompt } from "./steps/_shared_prompts.ts";
import { RouterInputContext } from "./types.ts";
import { evaluateStoryProgress } from "../_shared/storyProgressEvaluator.ts";
import { ensureLocationMapAndTerrain, TERRAIN_MODIFIERS, TerrainType } from "../_shared/fog_location_generator.ts";
import { executeRoundCycleNpcSimulation } from "../_shared/npc_world_simulator.ts";
import { parseStatAllocationIntent } from "./steps/stat_allocation_utils.ts";
import { advanceTime } from "./steps/time_utils.ts";
⋮----
import { DISTANCE_TIER, fogPickNarrative, fogGetEffectiveThresholds, fogGetDistanceTier, fogExtractSpeech } from "./steps/fog_of_war_utils.ts";
⋮----
function getPlayerPartyId(p: any, session: any): string | null
⋮----
function arePlayersInSameParty(p1: any, p2: any, session: any): boolean
⋮----
// ============================================
// AI API call
// ============================================
async function callAI(systemPrompt: string, userMessage: string, apiKey: string, retries = 3, model?: string): Promise<string>
⋮----
continue; // retry
⋮----
// OpenRouter sometimes returns null/empty content РІР‚вЂќ treat as transient error, retry
⋮----
// ============================================
⋮----
// ============================================
// Main Handler РІР‚вЂќ 5-РЎв‚¬Р В°Р С–Р С•Р Р†РЎвЂ№Р в„– Р С”Р С•Р Р…Р Р†Р ВµР в„–Р ВµРЎР‚
// ============================================
⋮----
// ============================================
// LOAD CONTEXT
// ============================================
⋮----
// Resolve API key + models:
// Р СџР С•Р Т‘Р Т‘Р ВµРЎР‚Р В¶Р С”Р В° РЎР‚Р ВµР В¶Р С‘Р СР В° Р С•Р В±РЎвЂ°Р ВµР С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В° РЎвЂ¦Р С•РЎРѓРЎвЂљР В° (ai_key_mode: 'host' | 'individual')
// Р СџР С• РЎС“Р СР С•Р В»РЎвЂЎР В°Р Р…Р С‘РЎР‹ 'host': РЎвЂ¦Р С•Р Т‘РЎвЂ№ Р Р†РЎРѓР ВµРЎвЂ¦ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“РЎР‹РЎвЂљ Р С”Р В»РЎР‹РЎвЂЎ Р С‘ Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘/Р СР С‘РЎР‚Р В°,
// Р ВµРЎРѓР В»Р С‘ Р Р…Р Вµ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р… РЎР‚Р ВµР В¶Р С‘Р С 'individual' (Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– РЎРѓР С• РЎРѓР Р†Р С•Р С‘Р С).
⋮----
// 1. Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” РЎвЂљР ВµР С”РЎС“РЎвЂ°Р ВµР С–Р С• Р С‘Р С–РЎР‚Р С•Р С”Р В° (Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ)
⋮----
// 2. Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” РЎвЂ¦Р С•РЎРѓРЎвЂљР В° (РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ Р СР С‘РЎР‚Р В°/РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘)
⋮----
// 3. Р вЂ™РЎвЂ№Р В±Р С•РЎР‚ Р С‘РЎРѓРЎвЂљР С•РЎвЂЎР Р…Р С‘Р С”Р В° Р С”Р В»РЎР‹РЎвЂЎР В° Р С‘ Р СР С•Р Т‘Р ВµР В»Р ВµР в„– Р Р† Р В·Р В°Р Р†Р С‘РЎРѓР С‘Р СР С•РЎРѓРЎвЂљР С‘ Р С•РЎвЂљ ai_key_mode
⋮----
// Р СџРЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљ Р ТђР С•РЎРѓРЎвЂљР В°: РЎРѓР Р…Р В°РЎвЂЎР В°Р В»Р В° Р С”Р В»РЎР‹РЎвЂЎ Р С‘ Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
⋮----
// Р В Р ВµР В¶Р С‘Р С 'individual': Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р С‘Р С–РЎР‚Р С•Р С” Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµРЎвЂљ РЎРѓР Р†Р С•Р в„– Р С”Р В»РЎР‹РЎвЂЎ; Р ВµРЎРѓР В»Р С‘ РЎС“ Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ Р С”Р В»РЎР‹РЎвЂЎР В° РІР‚вЂќ РЎвЂћР С•Р В»Р В»Р В±РЎРЊР С” Р Р…Р В° Р С”Р В»РЎР‹РЎвЂЎ РЎвЂ¦Р С•РЎРѓРЎвЂљР В°
⋮----
// Load location, available locations, lore
⋮----
// Wild zone РІР‚вЂќ Р С—РЎР‚Р С‘РЎР‚Р С•Р Т‘Р Р…Р В°РЎРЏ Р В·Р С•Р Р…Р В° Р Р†Р Р…Р Вµ Р С‘Р СР ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р в„– (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—Р С•Р В»Р Вµ)
⋮----
// Player is in open world / wild zone РІР‚вЂќ use currentWildZone as location name
⋮----
.limit(20) // было 10;
⋮----
${cleanTextForAI(f.content).slice(0, 2000)}`) // было 600
⋮----
// Load all players in session (for router, engine and system truth context)
⋮----
// Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р С‘Р В· Р С”РЎРЊРЎв‚¬Р В° РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘ (Р В·Р В°Р С—Р С•Р В»Р Р…РЎРЏР ВµРЎвЂљРЎРѓРЎРЏ Р С—РЎР‚Р С‘ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘Р С‘/РЎРѓР СР ВµР Р…Р Вµ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘)
⋮----
// Load all NPCs in current location (for router, engine and system truth context)
⋮----
// Derive is_alive from hp (column might not exist yet in all environments)
⋮----
const isCompanionNpc = (n: any) =>
⋮----
// Р вЂўРЎРѓР В»Р С‘ Р С‘Р С–РЎР‚Р С•Р С” Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљРЎРѓРЎРЏ Р Р† Р Т‘Р С‘Р С”Р С•Р в„– Р В·Р С•Р Р…Р Вµ (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—РЎС“РЎРѓРЎвЂљР С•РЎв‚¬РЎРЉ), Р С–Р С•РЎР‚Р С•Р Т‘РЎРѓР С”Р С‘Р Вµ NPC (РЎвЂљР С•РЎР‚Р С–Р С•Р Р†РЎвЂ РЎвЂ№, Р В¶Р С‘РЎвЂљР ВµР В»Р С‘) Р С•РЎРѓРЎвЂљР В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р† Р С–Р С•РЎР‚Р С•Р Т‘Р Вµ!
// Р вЂ™ РЎРѓРЎвЂ Р ВµР Р…Р Вµ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р С Р С—РЎР‚Р С‘РЎРѓРЎС“РЎвЂљРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂљ Р СћР С›Р вЂєР В¬Р С™Р С› РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С‘/Р С—Р С‘РЎвЂљР С•Р СРЎвЂ РЎвЂ№ Р С‘Р В»Р С‘ Р Т‘Р С‘Р С”Р С‘Р Вµ Р Р†РЎР‚Р В°Р С–Р С‘/РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†Р В°.
⋮----
// Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С, Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В»Р С‘ РЎРЊРЎвЂљР С• РЎвЂ¦Р С•Р Т‘ Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘ (Р Р…Р ВµРЎвЂљ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р в„– Р С‘Р С–РЎР‚Р С•Р С”Р В° Р С‘Р В»Р С‘ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р Вµ Р В·Р В°Р Т‘Р В°Р Р…Р В°)
⋮----
// Р вЂўРЎРѓР В»Р С‘ Р С”Р В°РЎР‚РЎвЂљР В° РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р С‘Р В»Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р ВµРЎвЂ°РЎвЂ Р Р…Р Вµ РЎРѓР С•Р В·Р Т‘Р В°Р Р…РЎвЂ№ РІР‚вЂќ Р С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
⋮----
// ============================================
// Р В§Р В°РЎвЂљ: РЎР‚Р В°РЎРѓР С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р С•РЎвЂЎР С”Р С•Р Р† РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”
// ============================================
⋮----
// ============================================
// Р РЃР С’Р вЂњ 1: AI Router (parsePlayerIntent)
// ============================================
⋮----
// Р СџР С•Р Т‘Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С‘РЎРѓРЎвЂљР С•РЎР‚Р С‘РЎР‹ Р Т‘Р В»РЎРЏ Р С”Р С•Р Р…РЎвЂљР ВµР С”РЎРѓРЎвЂљР В° Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ РЎРѓ NPC/Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘
⋮----
lore_context: loreContext.slice(0, 1500), // FIX 7: world context for router
⋮----
// Apply GPS time/location (still here, as it's pre-engine)
⋮----
// Р вЂќР ВµРЎвЂљР ВµР С”РЎвЂљР С•РЎР‚ Р Р…Р В°Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р С‘Р В»Р С‘ Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘Р В° Р С‘Р В· Р С—Р С•Р СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ
⋮----
// Р СџР ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р Р† Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“ (Р В»Р ВµРЎРѓ, Р С—Р ВµРЎвЂ°Р ВµРЎР‚Р В°, Р С—Р С•Р В»Р Вµ, РЎвЂљРЎР‚Р В°Р С”РЎвЂљ)
⋮----
// Р СџР ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р Р† Р С‘Р СР ВµР Р…Р С•Р Р†Р В°Р Р…Р Р…РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
⋮----
new_wild_zone = null; // Р С•РЎвЂЎР С‘РЎвЂ°Р В°Р ВµР С Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“
⋮----
} catch (e) { /* ignore GPS errors, game continues */ }
⋮----
// Р вЂќР ВµРЎвЂљР ВµРЎР‚Р СР С‘Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р В°РЎРЏ Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ: Р Р†РЎвЂ№РЎвЂ¦Р С•Р Т‘ Р С‘Р В· Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ/РЎвЂљР В°Р Р†Р ВµРЎР‚Р Р…РЎвЂ№ Р Р…Р В°РЎР‚РЎС“Р В¶РЎС“, Р ВµРЎРѓР В»Р С‘ GPS Р Р…Р Вµ Р С—Р ВµРЎР‚Р ВµР С”Р В»РЎР‹РЎвЂЎР С‘Р В» Р В·Р С•Р Р…РЎС“
⋮----
// ============================================
// Р Р€Р СџР В Р С’Р вЂ™Р вЂєР вЂўР СњР ВР вЂў Р С›Р СћР В Р Р‡Р вЂќР С›Р Сљ Р В Р РЋР С›Р СџР С›Р РЋР СћР С’Р вЂ™Р вЂєР вЂўР СњР ВР вЂў Р ВР вЂњР В Р С›Р С™Р С›Р вЂ™ (Party & Player Resolution)
// ============================================
⋮----
// Р вЂќР ВµРЎвЂљР ВµРЎР‚Р СР С‘Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С•Р Вµ РЎРѓР С•Р С—Р С•РЎРѓРЎвЂљР В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ РЎвЂ Р ВµР В»Р С‘ РЎРѓ Р В¶Р С‘Р Р†РЎвЂ№Р СР С‘ Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘ Р С—Р С• Р С‘Р СР ВµР Р…Р С‘ Р Р† РЎвЂљР ВµР С”РЎРѓРЎвЂљР Вµ
⋮----
// ============================================
// Р РЃР С’Р вЂњ 2: Game Engine
// ============================================
⋮----
// Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р…Р В°Р Р†РЎвЂ№Р С”Р С•Р Р† Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Т‘Р В»РЎРЏ Р СР В°РЎвЂљР ВµР СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘РЎвЂ¦ Р В±Р С•Р Р…РЎС“РЎРѓР С•Р Р† Р Т‘Р Р†Р С‘Р В¶Р С”Р В° (РЎС“РЎР‚Р С•Р Р…, Р С—Р С•Р С—Р В°Р Т‘Р В°Р Р…Р С‘Р Вµ, РЎРѓР В±Р С•РЎР‚, Р Р†РЎР‚Р ВµР СРЎРЏ)
⋮----
// Р РЋР С•Р С”РЎР‚Р В°РЎвЂ°Р ВµР Р…Р С‘Р Вµ Р Р†РЎР‚Р ВµР СР ВµР Р…Р С‘ Р Р…Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ Р С•РЎвЂљ Р Р…Р В°Р Р†РЎвЂ№Р С”Р С•Р Р† (РЎРѓР С•Р В±Р С‘РЎР‚Р В°РЎвЂљР ВµР В»РЎРЉРЎРѓРЎвЂљР Р†Р С•, Р Р†РЎвЂ№Р В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ, Р С–Р С•РЎР‚Р Р…Р С•Р Вµ Р Т‘Р ВµР В»Р С• Р С‘ РЎвЂљ.Р Т‘.)
⋮----
// ============================================
// Р РЃР С’Р вЂњ 3: DB Persistence
// ============================================
⋮----
// Apply time advance to session
⋮----
current_wild_zone: null, // Р Р†Р ВµРЎР‚Р Р…РЎС“Р В»Р С‘РЎРѓРЎРЉ Р Р† Р С‘Р СР ВµР Р…Р С•Р Р†Р В°Р Р…Р Р…РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
⋮----
// Р ВР С–РЎР‚Р С•Р С”Р С‘ Р Т‘Р Р†Р С‘Р С–Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ: РЎРѓР В±РЎР‚Р В°РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С—Р С•Р Т‘Р В·Р С•Р Р…РЎС“ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎРѓРЎвЂљР С‘Р Р†РЎв‚¬Р ВµР С–Р С•РЎРѓРЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В°
⋮----
// Р В§Р В»Р ВµР Р…РЎвЂ№ Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В°, Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘Р Р†РЎв‚¬Р С‘Р ВµРЎРѓРЎРЏ Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р В·Р С•Р Р…Р Вµ/Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘, Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ!
⋮----
// Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В»РЎРЏ Р Р…Р С•Р Р†Р С•Р в„– Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
⋮----
// Р РЋР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С‘ Р С‘ РЎвЂЎР В»Р ВµР Р…РЎвЂ№ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В° Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р С Р Р† Р Р…Р С•Р Р†РЎС“РЎР‹ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹
⋮----
// Р ВР С–РЎР‚Р С•Р С”Р С‘ Р Т‘Р Р†Р С‘Р С–Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ: РЎРѓР В±РЎР‚Р В°РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С—Р С•Р Т‘Р В·Р С•Р Р…РЎС“ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎРѓРЎвЂљР С‘Р Р†РЎв‚¬Р ВµР С–Р С•РЎРѓРЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В°
⋮----
// Р В§Р В»Р ВµР Р…РЎвЂ№ Р С•РЎвЂљРЎР‚РЎРЏР Т‘Р В° Р С—Р ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂљ Р Р† Р Т‘Р С‘Р С”РЎС“РЎР‹ Р В·Р С•Р Р…РЎС“ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ
⋮----
// Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљРЎС“ РЎР‚Р В°РЎРѓРЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р в„– Р В·Р С•Р Р… Р С‘ РЎвЂљР С‘Р С— Р СР ВµРЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В»РЎРЏ Р Т‘Р С‘Р С”Р С•Р в„– Р В·Р С•Р Р…РЎвЂ№ РЎвЂЎР ВµРЎР‚Р ВµР В· Р ВР В
⋮----
// Р С›РЎвЂљРЎРѓР В»Р ВµР В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ Р С—Р ВµРЎР‚Р ВµР СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Р†Р Р…РЎС“РЎвЂљРЎР‚Р С‘ Р С—Р С•Р Т‘Р В·Р С•Р Р… Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ (Р Т‘Р В»РЎРЏ Р СћРЎС“Р СР В°Р Р…Р В° Р вЂ™Р С•Р в„–Р Р…РЎвЂ№ / Р В­РЎвЂ¦Р В° Р вЂ™Р С•Р в„–Р Р…РЎвЂ№)
// Отслеживание перемещения игрока внутри подзон локации (AI GPS + regex fallback)
⋮----
// 1. AI GPS результат (приоритет)
⋮----
// 2. Улучшенный regex fallback
⋮----
// ============================================
// Р С’Р вЂ™Р СћР С›Р СњР С›Р СљР СњР В«Р вЂў Р В­Р С™Р РЋР СџР вЂўР вЂќР ВР В¦Р ВР В NPC (0 РЎвЂљР С•Р С”Р ВµР Р…Р С•Р Р†, Lazy Calendar Simulation)
// ============================================
⋮----
// ============================================
// Р ВР СњР ВР В¦Р ВР С’Р СћР ВР вЂ™Р С’ Р РЋР СџР Р€Р СћР СњР ВР С™Р С›Р вЂ™ Р вЂ™ Р СћР вЂўР С™Р Р€Р В©Р вЂўР в„ў Р РЋР В¦Р вЂўР СњР вЂў (Р СљР С‘РЎР‚Р Р…РЎвЂ№Р Вµ Р С‘ РЎР‚Р С•Р В»Р ВµР Р†РЎвЂ№Р Вµ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ)
// ============================================
⋮----
// ============================================
// Р вЂќР ВР СњР С’Р СљР ВР В§Р вЂўР РЋР С™Р ВР вЂў Р СњР С’Р вЂ™Р В«Р С™Р В Р ВР вЂњР В Р С›Р С™Р С’ (1..100)
// ============================================
⋮----
// ============================================
// Р СџР В Р С›Р С™Р С’Р В§Р С™Р С’ Р Р€Р В Р С›Р вЂ™Р СњР Р‡ Р СџР вЂўР В Р РЋР С›Р СњР С’Р вЂ“Р С’ (1..100, +2 Р С›Р Тђ, HP/MP)
// ============================================
⋮----
// ============================================
// Р РЃР С’Р вЂњ 4: System Truth Compiler
// ============================================
⋮----
// ============================================
// Р РЃР С’Р вЂњ 5: Narrator
// ============================================
⋮----
// ============================================
// SAVE: messages + turn_queue
// ============================================
⋮----
// 1) Player action
⋮----
// 2) Master narratives РІР‚вЂќ Р С—Р С• Р С•Р Т‘Р Р…Р С•Р СРЎС“ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎР‹ Р Р…Р В° Р С‘Р С–РЎР‚Р С•Р С”Р В°
⋮----
// 3) Global log (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—РЎР‚Р С‘ Р Р…Р В°Р В»Р С‘РЎвЂЎР С‘Р С‘ > 1 Р С‘Р С–РЎР‚Р С•Р С”Р В°, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р Р† РЎРѓР С•Р В»Р С• Р Р…Р Вµ Р Т‘РЎС“Р В±Р В»Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р…Р В°РЎР‚РЎР‚Р В°РЎвЂљР С‘Р Р†)
⋮----
// 3.5) Р СћР Р€Р СљР С’Р Сњ Р вЂ™Р С›Р в„ўР СњР В« РІР‚вЂќ fog-РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ Р Т‘Р В»РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р Р† Р Т‘РЎР‚РЎС“Р С–Р С‘РЎвЂ¦ Р В·Р С•Р Р…Р В°РЎвЂ¦
// Р В Р В°Р В±Р С•РЎвЂљР В°Р ВµРЎвЂљ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—РЎР‚Р С‘ Р Р…Р В°Р В»Р С‘РЎвЂЎР С‘Р С‘ Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С‘РЎвЂ¦ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
⋮----
// AI Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»РЎРЏР ВµРЎвЂљ event_type Р Р† Router РІР‚вЂќ Р Р…Р С‘Р С”Р В°Р С”Р С‘РЎвЂ¦ regex-РЎРЊР Р†РЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”!
⋮----
// Р СњР В°Р В±Р В»РЎР‹Р Т‘Р В°РЎвЂљР ВµР В»Р С‘ = Р Р†РЎРѓР Вµ Р С‘Р С–РЎР‚Р С•Р С”Р С‘, Р С”РЎР‚Р С•Р СР Вµ Р В°Р Р†РЎвЂљР С•РЎР‚Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ
⋮----
// same_room (tier 0) РІР‚вЂќ РЎРЊРЎвЂљР С•РЎвЂљ Р С‘Р С–РЎР‚Р С•Р С” РЎС“Р В¶Р Вµ Р Р…Р В°РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљРЎРѓРЎРЏ Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р В·Р С•Р Р…Р Вµ/Р С”Р С•Р СР Р…Р В°РЎвЂљР Вµ
⋮----
if (!hears && !sees) continue; // РЎРѓР В»Р С‘РЎв‚¬Р С”Р С•Р С Р Т‘Р В°Р В»Р ВµР С”Р С• РІР‚вЂќ Р Р…Р С‘РЎвЂЎР ВµР С–Р С• Р Р…Р Вµ Р Т‘Р С•РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљ
⋮----
// 4) Companion action message
⋮----
// 5) Expedition events messages
⋮----
// 6) Skill level up notification
⋮----
// 7) Player level up notification
⋮----
// 7.1) Storyline Progress Evaluation (Р В°Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С•Р Вµ Р С•РЎвЂљРЎРѓР В»Р ВµР В¶Р С‘Р Р†Р В°Р Р…Р С‘Р Вµ РЎвЂ Р ВµР В»Р ВµР в„– Р В°РЎР‚Р С”Р С‘)
⋮----
// 8) NPC Relationships & Memories update
⋮----
// 9) Companion Invitation & Pet Taming interactions
⋮----
// 10) Pet Taming interaction (Р С‘Р Р…РЎвЂљР ВµР В»Р В»Р ВµР С”РЎвЂљРЎС“Р В°Р В»РЎРЉР Р…Р С•Р Вµ Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р В·Р Р†Р ВµРЎР‚РЎРЏ/Р СР С•Р Р…РЎРѓРЎвЂљРЎР‚Р В°)
⋮----
// 11) Proactive Companion Offer (NPC РЎРѓР В°Р С Р С—РЎР‚Р ВµР Т‘Р В»Р В°Р С–Р В°Р ВµРЎвЂљ Р С—Р С•Р в„–РЎвЂљР С‘ Р Р† Р С—РЎС“РЎвЂљРЎРЉ Р С—РЎР‚Р С‘ Р Р†РЎвЂ№РЎРѓР С•Р С”Р С•Р С Р Т‘Р С•Р Р†Р ВµРЎР‚Р С‘Р С‘)
⋮----
// ============================================
// D&D Р вЂР С›Р вЂўР вЂ™Р С’Р Р‡ Р С›Р В§Р вЂўР В Р вЂўР вЂќР В¬ Р ТђР С›Р вЂќР С›Р вЂ™ (TURN QUEUE Р РЋ Р ВР СњР ВР В¦Р ВР С’Р СћР ВР вЂ™Р С›Р в„ў NPC, Р РЋР СџР Р€Р СћР СњР ВР С™Р С›Р вЂ™ Р В Р СџР ВР СћР С›Р СљР В¦Р вЂўР вЂ™)
// ============================================
⋮----
// Р СџР С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР В°Р ВµР С Р С” Р В±Р С•РЎР‹ Р Р†РЎР‚Р В°Р В¶Р Т‘Р ВµР В±Р Р…РЎвЂ№РЎвЂ¦ NPC РЎРѓ Р В±РЎР‚Р С•РЎРѓР С”Р С•Р С Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†РЎвЂ№
⋮----
// Р СџР С•Р Т‘Р С”Р В»РЎР‹РЎвЂЎР В°Р ВµР С Р С” Р В±Р С•РЎР‹ РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С•Р Р† Р С‘ Р С—РЎР‚Р С‘РЎР‚РЎС“РЎвЂЎР ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р С—Р С‘РЎвЂљР С•Р СРЎвЂ Р ВµР Р† Р С‘Р С–РЎР‚Р С•Р С”Р В°
⋮----
// Р С›РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ Р ВµРЎвЂ°РЎвЂ Р Р…Р ВµРЎвЂљ РІР‚вЂќ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂР С Р Т‘Р В»РЎРЏ Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р† РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘
⋮----
// Р РЋР С•РЎР‚РЎвЂљР С‘РЎР‚РЎС“Р ВµР С Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р†: Р Р† Р В±Р С•РЎР‹ Р С—Р С• Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†Р Вµ, Р Р† Р СР С‘РЎР‚Р Р…Р С•Р С РЎР‚Р ВµР В¶Р С‘Р СР Вµ РІР‚вЂќ РЎРѓРЎвЂљРЎР‚Р С•Р С–Р С• Р С—Р С• Р С—Р С•РЎР‚РЎРЏР Т‘Р С”РЎС“ Р Р†РЎвЂ¦Р С•Р Т‘Р В° Р Р† Р СР С‘РЎР‚ (created_at ASC)
⋮----
// Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С‘Р С–РЎР‚Р С•Р С”Р С•Р Р†, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№РЎвЂ¦ Р ВµРЎвЂ°РЎвЂ Р Р…Р ВµРЎвЂљ Р Р† Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ (Р Р† Р С—Р С•РЎР‚РЎРЏР Т‘Р С”Р Вµ Р С‘РЎвЂ¦ Р Р†РЎвЂ¦Р С•Р Т‘Р В° created_at ASC)
⋮----
// Р вЂ”Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р В°Р ВµР С РЎвЂљР ВµР С”РЎС“РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ Р С‘Р С–РЎР‚Р С•Р С”Р В°
⋮----
// Р ВРЎвЂ°Р ВµР С РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ РЎРѓР С• РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓР С•Р С 'waiting'
// Р СџРЎР‚Р С‘ isCombat = false РЎвЂ¦Р С•Р Т‘РЎвЂ№ Р С—Р ВµРЎР‚Р ВµР Т‘Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ РЎРѓРЎвЂљРЎР‚Р С•Р С–Р С• Р С—Р С• Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ Р Р†РЎвЂ¦Р С•Р Т‘Р В° Р Р† Р СР С‘РЎР‚ (created_at ASC) Р С•РЎвЂљ Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С‘Р С–РЎР‚Р С•Р С”Р В° Р Т‘РЎР‚РЎС“Р С–Р С•Р СРЎС“.
// Р СџРЎР‚Р С‘ isCombat = true РЎвЂ¦Р С•Р Т‘РЎвЂ№ РЎС“Р С—Р С•РЎР‚РЎРЏР Т‘Р С•РЎвЂЎР ВµР Р…РЎвЂ№ Р С—Р С• Р В±Р С•Р ВµР Р†Р С•Р в„– Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С‘Р Р†Р Вµ (initiative DESC, created_at ASC).
⋮----
// Р вЂўРЎРѓР В»Р С‘ РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘ Р С—РЎР‚Р С‘Р Р…Р В°Р Т‘Р В»Р ВµР В¶Р С‘РЎвЂљ NPC РІР‚вЂќ Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…РЎРЏР ВµР С Р В±Р С•Р ВµР Р†РЎвЂ№Р Вµ РЎвЂ¦Р С•Р Т‘РЎвЂ№ NPC
⋮----
// Р ТђР С›Р вЂќ Р РЋР СџР Р€Р СћР СњР ВР С™Р С’ / Р СџР ВР СћР С›Р СљР В¦Р С’: Р В°РЎвЂљР В°Р С”РЎС“Р ВµРЎвЂљ Р Р†РЎР‚Р В°Р В¶Р Т‘Р ВµР В±Р Р…Р С•Р С–Р С• Р СР С•Р В±Р В° (Р Р…Р В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚, Р Р†Р С•Р В»Р С”Р В°) Р Р† Р С—Р С•Р СР С•РЎвЂ°РЎРЉ Р С‘Р С–РЎР‚Р С•Р С”РЎС“!
⋮----
// Р вЂР С•Р Р…РЎС“РЎРѓ Р С” Р С•РЎвЂљР Р…Р С•РЎв‚¬Р ВµР Р…Р С‘РЎРЏР С РЎРѓР С• РЎРѓР С—РЎС“РЎвЂљР Р…Р С‘Р С”Р С•Р С Р В·Р В° Р С—Р С•Р СР С•РЎвЂ°РЎРЉ Р Р† Р В±Р С•РЎР‹ (+1)
⋮----
} catch (e) { /* ignore */ }
⋮----
// Р СџРЎР‚Р С•Р С”Р В°РЎвЂЎР С”Р В° РЎС“РЎР‚Р С•Р Р†Р Р…РЎРЏ Р С—Р С‘РЎвЂљР С•Р СРЎвЂ Р В° Р В·Р В° РЎС“РЎвЂЎР В°РЎРѓРЎвЂљР С‘Р Вµ Р Р† Р В±Р С•РЎР‹ (1..100)
⋮----
// Р ТђР С›Р вЂќ Р вЂ™Р В Р С’Р вЂ“Р вЂќР вЂўР вЂР СњР С›Р вЂњР С› NPC (Р В°РЎвЂљР В°Р С”Р В° Р С‘Р С–РЎР‚Р С•Р С”Р В°)
⋮----
// Р СџР С•Р СР ВµРЎвЂЎР В°Р ВµР С РЎвЂ¦Р С•Р Т‘ NPC Р С”Р В°Р С” Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…Р Р…РЎвЂ№Р в„–
⋮----
// Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– РЎвЂ¦Р С•Р Т‘
⋮----
// Р В Р В°РЎС“Р Р…Р Т‘ Р В·Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р ВµР Р…! Р СџР ВµРЎР‚Р ВµР В·Р В°Р С—РЎС“РЎРѓР С”Р В°Р ВµР С Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘РЎРЉ
⋮----
// ============================================
// Р В¤Р С›Р СњР С›Р вЂ™Р В«Р в„ў Р СџР В Р С›Р В¦Р вЂўР РЋР РЋ Р РЋР ВР СљР Р€Р вЂєР Р‡Р В¦Р ВР В Р вЂ“Р ВР вЂ”Р СњР В Р СљР ВР В Р С’ Р СџР С›Р РЋР вЂєР вЂў Р С™Р В Р Р€Р вЂњР С’ Р ТђР С›Р вЂќР С›Р вЂ™
// (Р В Р С•Р Р†Р Р…Р С• 1 Р В·Р В°Р С—РЎР‚Р С•РЎРѓ Р С” Р ВР В Р Р…Р В° Р Р†РЎРѓР ВµРЎвЂ¦ РЎС“Р Т‘Р В°Р В»Р ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ NPC, Р С”Р С•Р Р…РЎвЂљР В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р†РЎв‚¬Р С‘РЎвЂ¦ РЎРѓ Р С‘Р С–РЎР‚Р С•Р С”Р В°Р СР С‘)
// ============================================
```
