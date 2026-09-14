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
- Only files matching these patterns are included: src/**/*, index.html, vite.config.js, package.json
- Files matching these patterns are excluded: node_modules/**, dist/**, .git/**, .playwright-mcp/**, .ai/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  api/
    game.js
    openrouter.js
    storyline.js
    supabase.js
  config/
    damageTypes.js
    hitDice.js
  pages/
    components/
      game-chat-ui.js
    auth.js
    game.js
    lobby.js
    session-settings.js
  styles/
    game.css
    main.css
    variables.css
  utils/
    dice.js
    fogNarratives.js
    fogOfWar.js
    gameDate.js
    generationStore.js
    indexedDB.js
    npcRaceResolver.js
    supabaseFullSchema.js
    text.js
    toast.js
  config.js
  main.js
  router.js
index.html
package.json
vite.config.js
```

# Files

## File: src/config/damageTypes.js
```javascript
// src/config/damageTypes.js
// Предопределённые типы урона в стиле D&D с алгоритмическими свойствами
⋮----
/**
 * Типы урона:
 * - dot: может наносить урон каждый ход (damage over time)
 * - half_on_save: цель может получить половину урона при успешном спасброске
 * - common_resistance: часто встречается сопротивление у существ
 * - common_vulnerability: часто встречается уязвимость
 * - ignore_armor: игнорирует физическую броню
 */
⋮----
// Физические
⋮----
// Стихийные
⋮----
// Магические
⋮----
// Категории урона
⋮----
// Получить тип урона по ID
export function getDamageType(id)
⋮----
// Получить все типы урона в виде массива
export function getAllDamageTypes()
⋮----
// Получить типы урона по категории
export function getDamageTypesByCategory(category)
⋮----
// Проверяет, может ли тип урона быть DoT
export function canBeDot(damageTypeId)
⋮----
// Проверяет, можно ли спастись от урона наполовину
export function canHalfOnSave(damageTypeId)
⋮----
// Получить способность для спасброска
export function getSaveAbility(damageTypeId)
```

## File: src/config/hitDice.js
```javascript
// src/config/hitDice.js
// Система костей хитов в стиле D&D 5e
⋮----
/**
 * Кость хитов по классу
 * d6: волшебники, чародеи
 * d8: барды, жрецы, друиды, монахи, плути, колдуны
 * d10: воины, паладины, следопыты, рейнджеры
 * d12: варвары
 */
⋮----
// d6 — хилые маги
⋮----
// d8 — средние
⋮----
// d10 — крепкие
⋮----
// d12 — самые живучие
⋮----
// Среднее значение кости (половина, округлённая вверх)
⋮----
4: 3,   // d4: 2.5 → 3
6: 4,   // d6: 3.5 → 4
8: 5,   // d8: 4.5 → 5
10: 6,  // d10: 5.5 → 6
12: 7,  // d12: 6.5 → 7
20: 11, // d20: 10.5 → 11
⋮----
/**
 * Получить кость хитов по классу
 * @param {string} className - класс персонажа/существа
 * @returns {number} грани кости (6, 8, 10, 12)
 */
export function getHitDice(className)
⋮----
return CLASS_HIT_DICE[normalized] || 8; // По умолчанию d8
⋮----
/**
 * Получить среднее значение кости
 * @param {number} dieSides - грани кости
 * @returns {number} среднее (округлено вверх)
 */
export function getDieAverage(dieSides)
⋮----
/**
 * Рассчитать HP по системе D&D
 * Уровень 1: макс кости + CON mod + 10
 * Каждый следующий: среднее кости + CON mod
 * 
 * @param {number} con - значение Телосложения
 * @param {number} level - уровень
 * @param {number} dieSides - грани кости хитов
 * @returns {number} HP
 */
export function calculateHpDnd(con = 10, level = 1, dieSides = 8)
⋮----
// Уровень 1: макс кости + CON mod + 10
⋮----
// Каждый следующий уровень: среднее + CON mod
⋮----
/**
 * Получить информацию о кости хитов
 * @param {number} dieSides 
 * @returns {object} { sides, average, level1Bonus }
 */
export function getHitDiceInfo(dieSides)
⋮----
/**
 * Все доступные кости хитов
 */
```

## File: src/utils/dice.js
```javascript
// src/utils/dice.js
// Утилита для бросков кубиков в стиле D&D
⋮----
/**
 * Парсит строку кубиков формата "XdY+Z" или "XdY-Z"
 * @param {string} diceStr - строка типа "1d6", "3d4+2", "2d8-1"
 * @returns {object} { count, sides, bonus, raw }
 */
export function parseDice(diceStr)
⋮----
// Пробуем распознать просто число
⋮----
/**
 * Бросает один кубик
 * @param {number} sides - количество граней
 * @returns {number} результат броска
 */
export function rollDie(sides)
⋮----
/**
 * Бросает кубики по строке формата "XdY+Z"
 * @param {string} diceStr - строка типа "1d6", "3d4+2"
 * @returns {object} { total, rolls, bonus, raw }
 */
export function rollDice(diceStr)
⋮----
/**
 * Бросает кубики и возвращает только число (для быстрого расчёта)
 * @param {string} diceStr 
 * @returns {number}
 */
export function rollDamage(diceStr)
⋮----
/**
 * Бросает  Initiative (1d20 + модификатор)
 * @param {number} modifier - модификатор ловкости
 * @returns {object} { total, roll, modifier }
 */
export function rollInitiative(modifier = 0)
⋮----
/**
 * Бросок спасброска (1d20 + модификатор)
 * @param {number} modifier - модификатор способности
 * @returns {object} { total, roll, modifier }
 */
export function rollSave(modifier = 0)
⋮----
/**
 * Проверка попадания по КД
 * @param {number} attackBonus - бонус атаки
 * @param {number} targetAC - класс брони цели
 * @returns {object} { hit, roll, total, critical }
 */
export function rollAttack(attackBonus, targetAC)
⋮----
/**
 * Рассчитывает средний урон от кубиков (для балансировки)
 * @param {string} diceStr 
 * @returns {number}
 */
export function getAverageDamage(diceStr)
⋮----
/**
 * Рассчитывает минимальный и максимальный урон
 * @param {string} diceStr 
 * @returns {object} { min, max }
 */
export function getDamageRange(diceStr)
⋮----
/**
 * Форматирует строку кубиков для отображения
 * @param {string} diceStr 
 * @returns {string}
 */
export function formatDice(diceStr)
⋮----
/**
 * Генерирует строку кубиков на основе уровня и тира
 * @param {number} level - уровень существа
 * @param {number} tier - тир существа
 * @param {boolean} isSpecial - спецатака (больше урона)
 * @returns {string} строка типа "2d6+3"
 */
export function generateDamageDice(level, tier, isSpecial = false)
⋮----
// Базовое количество кубиков от уровня
// Level 1-10: 1 die, 11-20: 2 dice, 21-30: 3 dice, etc.
⋮----
// Грани кубика от тира
// Tier 1: d4, Tier 2: d6, Tier 3: d8, Tier 4: d10, Tier 5: d12
⋮----
// Бонус от уровня и тира
⋮----
// Сецатаки наносят больше урона
⋮----
/**
 * Все стандартные грани кубиков D&D
 */
```

## File: src/utils/generationStore.js
```javascript
// src/utils/generationStore.js — Сохранение прогресса генерации и состояния страницы
⋮----
// Save generation progress for a world
export function saveGenerationProgress(worldId, progress)
⋮----
// Load generation progress for a world
export function loadGenerationProgress(worldId)
⋮----
// Clear generation progress
export function clearGenerationProgress(worldId)
⋮----
// Save page state (active tab, open modals, etc.)
export function savePageState(state)
⋮----
// Load page state
export function loadPageState()
⋮----
// Clear page state
export function clearPageState()
```

## File: src/utils/toast.js
```javascript
// src/utils/toast.js — Система уведомлений
⋮----
function ensureContainer()
⋮----
export function showToast(message, type = 'info', duration = 4000)
⋮----
success: (msg)
error: (msg)
info: (msg)
warning: (msg)
```

## File: index.html
```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1a1a2e" />
  <meta name="description" content="Гибридный ИИ-Движок для текстовых ролевых игр" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>MultiRP AI — Текстовая RPG</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## File: src/api/storyline.js
```javascript
// src/api/storyline.js — Генератор, редактор и менеджер сюжетных линий на основе мира
⋮----
async function resolveUserSettings()
⋮----
/**
 * Загрузить полный контекст мира (география, лор, NPC, настройки) для генерации сюжета
 */
export async function loadWorldContext(worldId)
⋮----
// 1. Мир и настройки
⋮----
// 2. География (Регионы и локации)
⋮----
// 3. Файлы лора (история, религия, магия, фракции)
⋮----
// 4. Ключевые NPC и боссы
⋮----
/**
 * Сформировать системный и пользовательский промпт для LLM на основе мира
 */
function buildStorylinePrompt(worldCtx, customWishes = '', currentStoryline = null)
⋮----
/**
 * Безопасный парсинг JSON из ответа LLM
 */
function safeParseStorylineJson(rawText)
⋮----
/**
 * Сгенерировать сюжетную линию для сессии на основе мира
 */
export async function generateStorylineForSession({
  sessionId,
  worldId,
  customWishes = '',
  openrouterApiKey = null,
  model = null,
})
⋮----
// Нормализация структуры сюжета
⋮----
// Сохранение в базу данных
⋮----
/**
 * Переписать существующий сюжет с учётом замечаний/пожеланий
 */
export async function rewriteStoryline({
  sessionId,
  worldId,
  currentStoryline,
  customWishes = '',
  openrouterApiKey = null,
  model = null,
})
⋮----
/**
 * Сохранить ручные изменения сюжета (название, пролог, арки, цели)
 */
export async function updateStoryline(sessionId, storyline)
⋮----
/**
 * Удалить сюжет сессии (перевод в режим «Песочница»)
 */
export async function deleteStoryline(sessionId)
⋮----
/**
 * Переключить выполнение отдельной цели сюжета
 */
export async function toggleGoalCompletion(sessionId, storyline, arcId, goalText)
⋮----
// Если все цели выполнены, арка считается завершенной
⋮----
// Если это была активная текущая арка и есть следующая, активируем следующую
```

## File: src/pages/components/game-chat-ui.js
```javascript
// src/pages/components/game-chat-ui.js
⋮----
export function renderMessage(msg, currentUserId, currentPlayerId)
```

## File: src/utils/fogNarratives.js
```javascript
// src/utils/fogNarratives.js
// Библиотека шаблонов дистантного восприятия для системы Тумана Войны.
// Чистые строки — ноль AI-запросов, ноль токенов.
// Подстановки: {direction}, {content}, {actor}
⋮----
/**
 * Матрица нарративов: [event_type][distance_tier] → { audio: [], visual: [] }
 *
 * Distance Tiers:
 *   0 = same_room   (~0м,    в одной комнате)
 *   1 = close        (~10м,   рядом, сквозь стену)
 *   2 = nearby       (~50м,   соседняя зона)
 *   3 = district     (~200м,  другой квартал)
 *   4 = far          (~1км,   другой конец города)
 *   5 = very_far     (>1км,   другой город)
 */
⋮----
// ─── Шёпот ───────────────────────────────────────────────────────────────
⋮----
// ─── Речь ────────────────────────────────────────────────────────────────
⋮----
// ─── Крик ────────────────────────────────────────────────────────────────
⋮----
// ─── Лёгкий бой (шаги, удар кулаком, падение стула) ─────────────────────
⋮----
// ─── Средний бой (удар мечом, разбитое стекло) ──────────────────────────
⋮----
// ─── Тяжёлый бой (взрыв бочки, обвал, катапульта) ──────────────────────
⋮----
// ─── Малая магия (огонёк, искра, тихое заклинание) ──────────────────────
⋮----
// ─── Мощная магия (огненный шар, молния, призыв) ─────────────────────────
⋮----
// ─── Взрыв (здание, бочка пороха, бомба) ────────────────────────────────
⋮----
// ─── Катастрофа (обвал горы, извержение вулкана, конец света) ────────────
⋮----
/**
 * Получить случайный нарратив для дистантного восприятия.
 *
 * @param {string} eventType - тип события ('explosion', 'shout', ...)
 * @param {number} distanceTier - дистанционный тир наблюдателя (0-5)
 * @param {'audio'|'visual'} channel - канал восприятия
 * @param {object} subs - подстановки: { direction, content, actor }
 * @returns {string|null}
 */
export function getFogNarrative(eventType, distanceTier, channel = 'audio', subs =
```

## File: src/utils/gameDate.js
```javascript
// src/utils/gameDate.js — Форматирование игрового календаря и времени
export function formatGameCalendarDate(day, month, year, hour = 10, minute = 0)
```

## File: src/utils/indexedDB.js
```javascript
// src/utils/indexedDB.js — IndexedDB для сохранения прогресса генерации
⋮----
// Initialize DB
async function initDB()
⋮----
request.onerror = ()
request.onsuccess = () =>
⋮----
request.onupgradeneeded = (event) =>
⋮----
// Save generation progress
export async function saveProgress(worldId, data)
⋮----
request.onsuccess = ()
⋮----
// Load generation progress
export async function loadProgress(worldId)
⋮----
// Delete progress
export async function deleteProgress(worldId)
⋮----
// Get all incomplete generations
export async function getIncompleteGenerations()
⋮----
// ============================================
// CUSTOM SUPABASE DATABASE CONFIGURATION
// ============================================
⋮----
// Save custom DB configuration to IndexedDB (and sync to localStorage)
export async function saveCustomDbConfig(config)
⋮----
// Load custom DB configuration from IndexedDB (fallback to localStorage)
export async function loadCustomDbConfig()
⋮----
// Clear custom DB configuration (reset to default)
export async function clearCustomDbConfig()
```

## File: src/utils/npcRaceResolver.js
```javascript
// src/utils/npcRaceResolver.js — Интеллектуальное определение расы NPC / монстров
export function resolveNpcRace(npc, categoryParam = '', raceParam = '')
⋮----
// Если раса явно указана и не является ошибочным «Человек» для очевидных монстров/зверей
⋮----
// Гуманоидные NPC
⋮----
// Специфические расы монстров и созданий
⋮----
// Дефолт по категории
```

## File: src/utils/text.js
```javascript
// src/utils/text.js
⋮----
export function sanitizeAIText(raw)
⋮----
export function escapeHtml(text)
⋮----
export function formatRpText(text)
⋮----
// 1. Direct spoken speech in quotes FIRST, before any HTML attributes are added:
⋮----
// 2. Actions / physical acts / thoughts in **...** or *...*
```

## File: package.json
```json
{
  "name": "multi-rp-ai",
  "version": "2.0.0",
  "description": "Гибридный ИИ-Движок для текстовых ролевых игр (PWA)",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^3.1.4",
    "puppeteer-core": "^25.10.0",
    "vite": "^6.0.0",
    "vitest": "^3.1.4"
  }
}
```

## File: src/styles/variables.css
```css
/* src/styles/variables.css — Дизайн-система фэнтезийной таверны («Путник и Дракон») */
:root {
⋮----
/* Цветовая палитра — Теплая таверна, мореный дуб, латунь и каминное пламя */
--bg-primary: #15110e;        /* Глубокий оттенок темного дуба */
--bg-secondary: #1e1713;      /* Полированный мореный дуб */
--bg-tertiary: #281f19;       /* Деревянная обшивка стен таверны */
--bg-card: #221a14;           /* Планшет / пергамент на дубовой подложке */
--bg-input: #120e0b;          /* Углубленный темный слот в дереве */
--bg-hover: #33271f;          /* Теплый отсвет камина */
--bg-parchment: #f4ecd8;      /* Светлый состаренный пергамент */
--bg-parchment-dark: #2a2018; /* Темный пергамент для хроники */
⋮----
/* Акценты: Пламя очага, червонное золото, сургуч и целебные травы */
--accent-primary: #c85a32;    /* Теплый янтарь / каминный огонь */
⋮----
--accent-secondary: #5a3825;  /* Выделанная седельная кожа */
--accent-gold: #d4a359;       /* Чеканное античное золото */
--accent-gold-bright: #f3c87a;/* Яркий золотой отблеск */
--accent-gold-dark: #9b7235;  /* Состаренная темная бронза */
--accent-success: #388e3c;    /* Травяной изумруд / исцеление */
--accent-danger: #a93226;     /* Королевский сургуч / урон */
--accent-crimson: #8b1e1f;    /* Кровь и жизненная сила (HP) */
--accent-info: #3b7a9e;       /* Рунический синий / магическая мана */
--accent-warning: #d97706;    /* Янтарный воск */
⋮----
/* Текст: пергаментные и чернильные оттенки */
--text-primary: #f5eedc;      /* Теплый светлый пергамент */
--text-secondary: #d5c7b5;    /* Состаренная бумага */
--text-muted: #ab9c8a;        /* Древесная зола (высококонтрастный теплый оттенок) */
--text-accent: #d4a359;       /* Золотое тиснение */
--text-gold: #f3c87a;         /* Золотое свечение */
--text-dark: #1e1713;         /* Темные чернила для светлых плашек */
⋮----
/* Рамки и филигрань */
--border-color: rgba(212, 163, 89, 0.22);  /* Латунная окантовка */
⋮----
--border-accent: #d4a359;                  /* Золотая кайма */
--border-gold: rgba(212, 163, 89, 0.45);   /* Чеканное золото */
--border-wood: #3d2f25;                    /* Стык дубовых досок */
⋮----
/* Типографика */
⋮----
/* Отступы */
⋮----
/* Скругления */
⋮----
/* Тени и теплое каминное свечение */
⋮----
/* Анимации */
⋮----
/* z-index */
```

## File: src/utils/fogOfWar.js
```javascript
// src/utils/fogOfWar.js
// Система Тумана Войны (Fog of War) — матрица сенсорного восприятия.
// Ноль дополнительных AI-запросов: event_type определяется эвристикой,
// матрица видимости вычисляется на клиенте, fog-нарративы берутся из
// fogNarratives.js.
//
// Архитектура:
//   detectEventType(actionText)         → EventType
//   getEventThresholds(eventType)       → { audioTier, visualTier }
//   getDistanceTier(sourceZone, targetZone, locationMap) → 0-5
//   calcFogMatrix(params)               → FogMatrix
//   buildFogMessage(fogMatrix, targetPlayerId, ...) → string | null
⋮----
// ============================================================
// КОНСТАНТЫ
// ============================================================
⋮----
/**
 * Distance Tier — уровни расстояния между зонами
 * @readonly
 */
⋮----
SAME_ROOM:  0, // ~0м    — в одной комнате/зоне
CLOSE:      1, // ~10м   — рядом, сквозь стену
NEARBY:     2, // ~50м   — соседняя зона/здание
DISTRICT:   3, // ~200м  — другой квартал/часть леса
FAR:        4, // ~1км   — другой конец города
VERY_FAR:   5, // >1км   — другой город/регион
⋮----
/**
 * Event Type → пороги слышимости и видимости
 * audioTier:  максимальный тир, до которого слышно
 * visualTier: максимальный тир, до которого видно
 */
⋮----
/**
 * Модификаторы расстояния в зависимости от типа местности (terrain_type)
 */
⋮----
open:     { audioMod: 1,  visualMod: 2 },  // открытая поляна / поле: звук +1, видимость +2
forest:   { audioMod: -1, visualMod: -2 }, // лес / чаща: звук -1, видимость -2
cave:     { audioMod: 2,  visualMod: -3 }, // пещера: эхо +2, темнота -3
urban:    { audioMod: 0,  visualMod: -1 }, // город / улочки: видимость -1
building: { audioMod: -1, visualMod: -2 }, // здание / таверна: звук -1, видимость -2
mountain: { audioMod: -1, visualMod: 1 },  // горы: звук -1, видимость +1
⋮----
/**
 * Вычислить эффективные пороги слышимости и видимости с учётом типа местности
 * @param {string} eventType
 * @param {string|null} terrainType
 * @returns {{ audioTier: number, visualTier: number }}
 */
export function getFogThresholds(eventType = 'combat_medium', terrainType = null)
⋮----
/**
 * Кардинальные направления для дистантных описаний
 */
⋮----
// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПА СОБЫТИЯ
// ============================================================
⋮----
/**
 * Эвристически определить тип события по тексту действия игрока.
 * Возвращает одну из строк EventType.
 *
 * @param {string} actionText
 * @returns {string} eventType
 */
export function detectEventType(actionText)
⋮----
// Катастрофы
⋮----
// Взрыв
⋮----
// Мощная магия
⋮----
// Малая магия
⋮----
// Тяжёлый бой
⋮----
// Крик
⋮----
// Речь
⋮----
// Шёпот
⋮----
// Средний бой (оружие, удары)
⋮----
// Лёгкий бой
⋮----
// Дефолт — средний бой
⋮----
// ============================================================
// МАТРИЦА РАССТОЯНИЙ
// ============================================================
⋮----
/**
 * Получить тир расстояния между двумя зонами.
 * Если зоны одинаковы — SAME_ROOM (0).
 * Если одна из зон null/undefined — SAME_ROOM (игроки без зон считаются рядом).
 * Если карты нет — CLOSE (1) по умолчанию (игроки на разных шагах локации).
 *
 * @param {string|null} sourceZone  — зона источника события
 * @param {string|null} targetZone  — зона наблюдателя
 * @param {object} locationMap      — карта расстояний { zone: { zone: tier } }
 * @returns {number} Distance Tier 0-5
 */
export function getDistanceTier(sourceZone, targetZone, locationMap =
⋮----
// Одна из зон не задана → оба в основной зоне локации
⋮----
// Одна и та же зона
⋮----
// Прямое соответствие в карте
⋮----
// Обратное соответствие
⋮----
// Зоны заданы, но карты нет — считаем соседними
⋮----
// ============================================================
// FOG MATRIX
// ============================================================
⋮----
/**
 * Вычислить матрицу видимости для события.
 *
 * @param {object} params
 * @param {string} params.eventType        — тип события
 * @param {string|null} params.sourceZone  — зона игрока-инициатора
 * @param {Array} params.observers         — [{id, zone, name}] наблюдателей (другие игроки/NPC)
 * @param {object} params.locationMap      — карта расстояний
 * @param {string|null} [params.terrainType] — тип местности ('open', 'forest', 'cave' и т.д.)
 * @param {string} [params.shoutContent]   — текст крика (для подстановки)
 * @param {string} [params.actorName]      — имя инициатора (для подстановки)
 * @returns {FogMatrix}
 */
export function calcFogMatrix({
  eventType = 'combat_medium',
  terrainType = null,
  sourceZone = null,
  observers = [],
  locationMap = {},
  shoutContent = '',
  actorName = 'кто-то',
})
⋮----
// Наблюдатель ничего не воспринимает
⋮----
// Выбрать случайное направление (условно)
⋮----
// Сначала пробуем аудио (более приоритетный канал)
⋮----
// Если аудио не дало нарратива, пробуем визуальный
⋮----
// Для same_room (tier 0) — наблюдатель видит всё, нарратив строит Мастер
⋮----
// ============================================================
// УТИЛИТЫ
// ============================================================
⋮----
/**
 * Проверить, нужно ли создавать fog-сообщение для наблюдателя.
 * Возвращает готовый текст или null если событие не воспринимается.
 *
 * @param {FogMatrix} fogMatrix
 * @param {string} observerId
 * @returns {string|null}
 */
export function getFogMessage(fogMatrix, observerId)
⋮----
if (entry.sameRoom) return null;     // same_room — покрывается основным нарративом
if (!entry.narrative) return null;   // ничего не услышал
⋮----
/**
 * Извлечь текст прямой речи из действия для подстановки в {content}.
 * Ищет текст в кавычках «» или " ".
 *
 * @param {string} actionText
 * @returns {string}
 */
export function extractSpeechContent(actionText)
⋮----
/**
 * Генерировать карту расстояний по умолчанию для простой локации.
 * Все игроки без зоны считаются в основной зоне (same_room).
 * Используется как fallback если ИИ ещё не сгенерировал location_map.
 *
 * @returns {object} пустая карта {}
 */
export function getDefaultLocationMap()
```

## File: vite.config.js
```javascript
rewrite: (path)
```

## File: src/main.js
```javascript
// src/main.js — Точка входа приложения
⋮----
// Register service worker
⋮----
// Show loading state while Supabase resolves auth
⋮----
// Define routes once
⋮----
async function bootstrap()
⋮----
// Асинхронно считываем конфигурацию БД (URL-инвайт или сохраненную в IndexedDB)
⋮----
// Auth state listener — handles both initial check AND OAuth callback
⋮----
// Если статус авторизации не изменился
```

## File: src/router.js
```javascript
// src/router.js — SPA-роутер с Hash-based routing (совместим с GitHub Pages)
⋮----
class Router {
⋮----
// Обрабатываем внутренние ссылки (начинаются с /)
⋮----
add(pattern, handler)
⋮----
// Извлекаем путь из hash: #/session/123 → /session/123
_getPath()
⋮----
return hash.split('?')[0]; // Убираем query string
⋮----
resolve()
⋮----
// Fallback to lobby
⋮----
navigate(path)
```

## File: src/api/openrouter.js
```javascript
// src/api/openrouter.js — Прямые запросы к OpenRouter (без лимитов Supabase)
⋮----
// ===================== NPC STATS CALCULATION =====================
⋮----
/**
 * Calculate all derived combat stats for an NPC/creature
 * 
 * SYSTEM:
 * - Tier (1-5) = POTENTIAL — max capability, determines special attacks count
 * - Level (1-100) = CURRENT POWER — how much of potential is realized
 * - Stat sum: 50 (level 1, tier 1) to 200 (level 100, tier 5)
 * - Player starts at 72 stat sum, so creatures can be weaker or stronger
 * 
 * @param {object} stats - Raw stats {STR, DEX, CON, INT, WIS, CHA}
 * @param {string} race - Race name
 * @param {number} tier - Potential tier (1-5)
 * @param {number} level - Current level (1-100)
 * @returns {object} { level, armor_class, initiative, saving_throws, stat_sum }
 */
export function calculateNPCCombatStats(stats =
⋮----
// AC: 10 + DEX mod + race bonus (same as player)
⋮----
// Initiative: DEX modifier
⋮----
// Saving throws: stat modifier + proficiency bonus (based on level)
⋮----
// Calculate stat sum for reference
⋮----
/**
 * Calculate expected stat sum for a creature at given level/tier
 * Base 50 at level 1 tier 1, +2 per level, +10 per tier, max 200
 */
export function getExpectedStatSum(level = 1, tier = 1)
⋮----
/**
 * Calculate HP using D&D hit dice system
 * Level 1: max die + CON mod + 10
 * Each next: average die + CON mod
 */
export function calculateCreatureHp(con = 10, level = 1, tier = 1, hitDie = 8)
⋮----
/**
 * Get special attacks count by tier (Tier 1 = 1, Tier 5 = 5)
 */
export function getSpecialAttacksCount(tier = 1)
⋮----
/**
 * Get base attacks count by level (2 per 10 levels)
 */
export function getBaseAttacksCount(level = 1)
⋮----
/**
 * Очищает и нормализует атаку в формате D&D
 * @param {object} attack - сырые данные атаки
 * @param {boolean} isSpecial - спецатака (больше урона)
 * @param {number} tier - тир существа
 * @param {number} level - уровень существа
 * @returns {object} очищенная атака
 */
export function cleanAttack(attack =
⋮----
// Валидация типа урона
⋮----
// Генерация кубиков урона если не указаны
⋮----
// Валидация формата кубиков
⋮----
// DoT параметры (только для типов урона поддерживающих DoT)
⋮----
// DoT (Damage Over Time)
⋮----
// Спасбросок
⋮----
// Дополнительно
⋮----
/**
 * Генерирует атаки для существа на основе его параметров
 * @param {number} tier - тир (количество спецатак)
 * @param {number} level - уровень (количество базовых атак)
 * @param {string} category - категория существа
 * @param {string} race - раса
 * @returns {object} { special_attacks, base_attacks }
 */
export function generateAttacksForCreature(tier, level, category = 'monster', race = 'Чудовище')
⋮----
// Типы урона по умолчанию для категорий
⋮----
// Генерация спецатак
⋮----
// Генерация базовых атак
⋮----
// Get user settings (API key + models)
async function getUserSettings()
⋮----
// Get API key from user settings or fallback
async function getApiKey()
⋮----
// Get card generation model
async function getCardModel()
⋮----
// Call OpenRouter directly from frontend (no Edge Function limits)
export async function callOpenRouter(systemPrompt, userMessage, options =
⋮----
// Use specified model or get from user settings
⋮----
// Determine provider based on model
const getProvider = (modelId) =>
⋮----
if (modelId === 'openrouter/free') return []; // Auto-select
return ['Xiaomi']; // default
⋮----
// Count NPCs in text
export async function countNPCs(loreText)
⋮----
// Generate world geography (states and cities)
export async function generateWorldGeography(loreText, worldId, onProgress = () =>
⋮----
// Save geography to DB
export async function saveWorldGeography(worldId, geography)
⋮----
// Update scale_unit in world settings if provided
⋮----
// Insert states
⋮----
// Create state name -> id mapping
⋮----
// Insert locations
⋮----
// Insert subzones if present
⋮----
// Generate a batch of NPCs with geography context
export async function generateNPCBatch(loreText, startIdx, endIdx, totalCount, existingNames = [], geography = null)
⋮----
// Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) рассчитываются автоматически
// level_min/level_max: для неуникальных существ — диапазон уровней при спавне
⋮----
// Parse JSON from response
⋮----
// Try direct parse
⋮----
// Try to extract JSON from markdown
⋮----
// Try to find array
⋮----
// Generate all NPCs in batches and save to DB after each batch
export async function generateAllNPCs(loreText, worldId, geography = null, onProgress = () =>
⋮----
// Create location/state maps from geography
⋮----
// Also map by state for fallback
⋮----
// Helper to clean and save NPCs
const saveNPCs = async (npcs) =>
⋮----
// Only intelligent NPCs get a location
⋮----
// Determine role: beasts/monsters are tertiary by default
⋮----
// Calculate combat stats with level
⋮----
// Clean special_attacks and base_attacks
⋮----
// Если атаки не сгенерированы ИИ — генерируем автоматически
⋮----
// Calculate hit dice based on class (if provided)
⋮----
// Validate level range
⋮----
// Combat stats
⋮----
// Tier & level range
⋮----
// Attacks
⋮----
// Pack/unique flags
⋮----
// Step 1: Count NPCs
⋮----
// Step 2: Generate in batches and save after each
⋮----
// Add to local list for deduplication tracking
⋮----
// Save this batch to DB immediately
⋮----
// If model returned more NPCs than expected (generated all at once), adjust
⋮----
// Continue with what we have
⋮----
// Generate intelligent NPCs (category: npc) with progress saving
export async function generateIntelligentNPCs(loreText, worldId, geography = null, onProgress = () =>
⋮----
// Load saved progress
⋮----
// Count intelligent NPCs
⋮----
const intelligentCount = Math.ceil(totalCount * 0.6); // ~60% are intelligent
⋮----
// Create location/state maps
⋮----
// Save helper
⋮----
// Clean special_attacks and base_attacks
⋮----
// Если атаки не сгенерированы ИИ — генерируем автоматически
⋮----
// Calculate hit dice based on class
⋮----
// Validate level range
⋮----
// Combat stats
⋮----
// Tier & level range
⋮----
// Attacks
⋮----
// Pack/unique flags
⋮----
// Generate in batches
⋮----
// Force category to 'npc' for intelligent batch
⋮----
// Save progress after each batch (localStorage + IndexedDB)
⋮----
// Save progress before throwing
⋮----
// Mark as completed
⋮----
// Generate non-intelligent creatures (beast, monster, boss) with progress saving
export async function generateCreatures(loreText, worldId, geography = null, onProgress = () =>
⋮----
// Load saved progress
⋮----
// Count creatures
⋮----
const creatureCount = Math.ceil(totalCount * 0.4); // ~40% are creatures
⋮----
// Create state map
⋮----
// Creature generation prompt
⋮----
// Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) рассчитываются автоматически
// level_min/level_max: для неуникальных существ — диапазон уровней при спавне
⋮----
// Save helper
⋮----
// Clean special_attacks and base_attacks
⋮----
// Если атаки не сгенерированы ИИ — генерируем автоматически
⋮----
// Creatures use d8 by default (or d10 for bosses)
⋮----
// Validate level range
⋮----
location_id: null, // Creatures don't have locations
⋮----
// Combat stats
⋮----
// Tier & level range
⋮----
// Attacks
⋮----
// Pack/unique flags
⋮----
// Generate in batches
⋮----
// Save progress after each batch (localStorage + IndexedDB)
⋮----
// Save progress before throwing
⋮----
// Mark as completed
⋮----
// Check if generation can be resumed (checks both localStorage and IndexedDB)
export async function canResumeGeneration(worldId)
⋮----
// Try IndexedDB
⋮----
// Clear all generation progress for a world
export async function clearWorldGenerationProgress(worldId)
```

## File: src/styles/main.css
```css
/* src/styles/main.css — Глобальные стили таверны («Путник и Дракон») */
⋮----
/* Reset */
*, *::before, *::after {
⋮----
html, body {
⋮----
a {
⋮----
a:hover {
⋮----
button {
⋮----
input, textarea, select {
⋮----
img {
⋮----
/* ===================== Scrollbar ===================== */
::-webkit-scrollbar {
⋮----
::-webkit-scrollbar-track {
⋮----
::-webkit-scrollbar-thumb {
⋮----
::-webkit-scrollbar-thumb:hover {
⋮----
/* ===================== Layout ===================== */
#app {
⋮----
.page {
⋮----
.page-centered {
⋮----
/* ===================== Buttons ===================== */
.btn {
⋮----
.btn:active:not(:disabled) {
⋮----
.btn-primary {
⋮----
.btn-primary:hover:not(:disabled) {
⋮----
.btn-secondary {
⋮----
.btn-secondary:hover:not(:disabled) {
⋮----
.btn-ghost {
⋮----
.btn-ghost:hover:not(:disabled) {
⋮----
.btn-danger {
⋮----
.btn-danger:hover:not(:disabled) {
⋮----
.btn-gold {
⋮----
.btn-gold:hover:not(:disabled) {
⋮----
.btn-warning {
⋮----
.btn-warning:hover:not(:disabled) {
⋮----
.btn-success {
⋮----
.btn-success:hover:not(:disabled) {
⋮----
.btn:disabled {
⋮----
.btn-sm {
⋮----
.btn-lg {
⋮----
.btn-icon {
⋮----
/* ===================== Form Elements ===================== */
.input {
⋮----
.input:focus {
⋮----
.input::placeholder {
⋮----
textarea.input {
⋮----
select,
⋮----
select:focus,
⋮----
select option {
⋮----
select option:checked,
⋮----
code {
⋮----
.form-group {
⋮----
.form-label {
⋮----
.form-hint {
⋮----
/* ===================== Cards (Tavern Wooden Tablets) ===================== */
.card {
⋮----
.card:hover {
⋮----
.card-header {
⋮----
.card-title {
⋮----
/* ===================== Badge (Wax Seals & Brass Labels) ===================== */
.badge {
⋮----
.badge-primary {
⋮----
.badge-success {
⋮----
.badge-gold {
⋮----
.badge-info {
⋮----
.badge-secondary {
⋮----
.badge-warning {
⋮----
.badge-danger {
⋮----
/* ===================== Toggle Switch ===================== */
.toggle {
⋮----
.toggle.active {
⋮----
.toggle::after {
⋮----
.toggle.active::after {
⋮----
/* ===================== Modal (Grimoire / Ancient Ledger) ===================== */
.modal-overlay {
⋮----
.modal-overlay.open {
⋮----
.modal {
⋮----
.modal-overlay.open .modal {
⋮----
/* ===================== Toast Notifications ===================== */
.toast-container {
⋮----
.toast {
⋮----
.toast-success { border-left: 4px solid var(--accent-success); }
.toast-error { border-left: 4px solid var(--accent-danger); }
.toast-info { border-left: 4px solid var(--accent-info); }
.toast-warning { border-left: 4px solid var(--accent-gold); }
⋮----
/* ===================== Spinners & Loading ===================== */
⋮----
.spinner-inline {
⋮----
/* ===================== HP Bar (Vitality Vial) ===================== */
.hp-bar-container {
⋮----
.hp-bar {
⋮----
.hp-bar.low {
⋮----
.hp-bar.critical {
⋮----
/* ===================== Character Stats Grid (Brass Plaques) ===================== */
.stats-grid-3,
⋮----
.stat-card {
⋮----
.stat-card:hover {
⋮----
.stat-card-label {
⋮----
.stat-card-value {
⋮----
.stat-card-modifier {
⋮----
.stat-card-input {
⋮----
.stat-card-input:focus {
⋮----
.stats-sum {
⋮----
.stats-sum strong {
⋮----
/* ===================== Responsive ===================== */
⋮----
:root {
```

## File: src/config.js
```javascript
// src/config.js — Конфигурация приложения
// Замените значения на свои после создания проекта в Supabase
⋮----
// AI Model Configuration
⋮----
// Model options for card generation (бестиарий, NPC, география)
⋮----
// ── Бесплатные (рекомендуется) ──
⋮----
// ── Платные (лучшее качество) ──
⋮----
// Model options for DM (narrator / рассказчик)
⋮----
// ── Бесплатные ──
⋮----
// ── Платные ──
⋮----
// Model options for GPS (время и локация)
⋮----
// ── Бесплатные (достаточно для GPS) ──
⋮----
// ── Платные (если нужна максимальная надёжность) ──
⋮----
// Model options for Satellite (парсер намерений игрока)
⋮----
// ── Бесплатные ──
⋮----
// ── Платные ──
⋮----
// Game Constants
⋮----
export function calculateHpFromStats(stats =
⋮----
// D&D система: уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
⋮----
export function calculateInitiative(stats =
⋮----
export function calculateArmorClass(stats =
⋮----
export function calculateSavingThrows(stats =
⋮----
export function validateAndFixStats(raw, options =
⋮----
export function calculateDerivedStats(stats =
⋮----
export function getRaceAcBonus(race)
⋮----
// Классика и Фэнтези
⋮----
// Киберпанк, Научная фантастика, Постапокалипсис
⋮----
// Общие категории
⋮----
// Фэнтези
⋮----
// Киберпанк и Sci-Fi
⋮----
// Универсальные
⋮----
export function getItemMeta(type)
⋮----
// Routes
```

## File: src/utils/supabaseFullSchema.js
```javascript
// src/utils/supabaseFullSchema.js
// Полный SQL-скрипт для развёртывания MultiRP AI на новой базе данных Supabase
// Скопируйте и запустите его в Supabase SQL Editor на новом проекте.
```

## File: src/api/supabase.js
```javascript
// src/api/supabase.js — Динамический клиент Supabase (с поддержкой Bring Your Own Database)
⋮----
// Хранилище слушателей авторизации для бесшовного переключения между БД
⋮----
function bindAuthListener()
⋮----
// Запускаем слушатель для начального клиента
⋮----
/**
 * Прокси-клиент Supabase.
 * Любое обращение к supabase.from(), supabase.auth, supabase.channel()
 * автоматически адресуется к текущему активному инстансу (стандартному или кастомному).
 */
⋮----
get(_target, prop)
set(_target, prop, value)
⋮----
export function getActiveSupabaseUrl()
⋮----
export function getActiveSupabaseKey()
⋮----
export function getActiveDatabaseConfig()
⋮----
/**
 * Проверить подключение к указанной базе Supabase
 * @param {string} url
 * @param {string} anonKey
 * @param {Object} options - { onProgress?: (msg: string) => void, retries?: number, retryDelayMs?: number }
 */
export async function testDatabaseConnection(url, anonKey, options =
⋮----
// Функция проверки, является ли ошибка признаком отсутствия таблиц / обновления schema cache
const isSchemaMissingError = (err) =>
⋮----
// Если таблица отвечает штатно
⋮----
// Если таблица отсутствует в schema cache
⋮----
// Если это не последняя попытка — даём паузу на случай, если пользователь только запустил DDL
⋮----
// Если после всех попыток таблица не появилась:
// Подключение к Supabase полностью валидно, но таблицы ещё не развёрнуты
⋮----
// Реальная ошибка авторизации или сети (401, Invalid API key, network timeout и т.д.)
⋮----
/**
 * Автоматическое развёртывание SQL схемы через Supabase Management API
 * @param {string} url - Project URL или project-ref
 * @param {string} accessToken - Supabase Personal Access Token (sbp_...)
 * @param {Object} options - { onProgress?: (msg: string) => void }
 */
export async function deployDatabaseSchema(url, accessToken, options =
⋮----
// Извлекаем project ref
⋮----
// 1. Приоритет: локальный автономный прокси (/api/supabase-mgmt) — работает напрямую через Node.js без зависимости от каких-либо баз
⋮----
// Если это ответ от самого Supabase API (ошибка токена, проекта, прав и т.д.)
⋮----
// 2. Резерв: через Edge Function deploy-schema (если запущено на удалённом хостинге)
⋮----
// 3. Fallback: прямой запрос к api.supabase.com (для сред без ограничений CORS)
⋮----
/**
 * Установить активную базу данных
 * @param {Object} config - { isCustom: boolean, url: string, anonKey: string }
 */
export async function setDatabaseConfig(
⋮----
// Переподключаем слушатель auth и уведомляем подписчиков о текущем состоянии
⋮----
/**
 * Инициализация конфигурации БД при старте приложения:
 * 1. Проверяет URL на наличие инвайт-токена (?custom_db=... или ?db_url=...)
 * 2. Если нет в URL — загружает из IndexedDB
 * 3. Если нет в IndexedDB — оставляет стандартную БД
 */
export async function initDatabaseFromStorageOrUrl()
⋮----
// 1. Проверяем URL параметры (search и hash)
⋮----
// Если обнаружен инвайт в URL — сохраняем и очищаем параметр из адресной строки
⋮----
// Чистим URL от токена без перезагрузки страницы
⋮----
// 2. Если в URL ничего не было — читаем из IndexedDB
⋮----
/**
 * Создать инвайт-ссылку для подключения к этой базе данных
 */
export function generateDbInviteUrl(url = activeUrl, anonKey = activeAnonKey)
⋮----
// Безопасный вызов Edge Functions через прямой fetch
export async function invokeFunction(functionName, body)
⋮----
// Auth helpers
export async function signUp(email, password)
⋮----
export async function signIn(email, password)
⋮----
export async function signInWithGoogle()
⋮----
export async function signOut()
⋮----
export async function getCurrentUser()
⋮----
export function onAuthStateChange(callback)
⋮----
// Сразу вызываем с текущим состоянием пользователя
⋮----
// Realtime subscription helper
export function subscribeToTable(table, filter, callback, onStatus)
⋮----
// Subscribe to session chat messages
export function subscribeToSessionMessages(sessionId, callback, onStatus)
⋮----
// Subscribe to session player updates (turn tracking, HP, stats)
export function subscribeToSessionPlayers(sessionId, callback, onStatus)
⋮----
// Subscribe to session row updates (time, location, party groups, round)
export function subscribeToSession(sessionId, callback, onStatus)
⋮----
// Subscribe to session turn queue updates
export function subscribeToSessionTurnQueue(sessionId, callback, onStatus)
```

## File: src/pages/auth.js
```javascript
// src/pages/auth.js — Страница авторизации с поддержкой пользовательской БД Supabase
⋮----
export function renderAuth(container)
⋮----
function render()
⋮----
function bindEvents()
⋮----
// Модальное окно SQL Схемы
const openSqlModal = () =>
⋮----
// Модальное окно Инструкции
const openGuideModal = () =>
const closeGuideModal = () =>
⋮----
// Переключение между Входом и Регистрацией
⋮----
// Кнопка быстрого сброса БД из верхнего баннера
⋮----
// Чекбокс «Своя база данных Supabase»
⋮----
// Пользователь снял галочку -> возврат к стандартной базе
⋮----
// Раскрытие/сворачивание панели по клику на заголовок
⋮----
// Автоматическое развёртывание базы данных в 1 клик
⋮----
onProgress: (msg) =>
⋮----
// Сохраняем и подключаем
⋮----
// Сохранить и подключить кастомную БД
⋮----
// Проверить подключение
⋮----
// Скопировать инвайт-ссылку для подключения к этой БД
const copyInviteHandler = () =>
⋮----
const closeSqlModal = () =>
⋮----
async function handleGoogle()
⋮----
async function handleSubmit(e)
```

## File: src/pages/session-settings.js
```javascript
// src/pages/session-settings.js — Экран настроек сессии (для Админа)
⋮----
function escapeHtml(text)
⋮----
export async function renderSessionSettings(container, sessionId, user)
⋮----
async function load()
⋮----
// Проверка прав: настройки кампании (сюжет, сложность, PvP) доступны только создателю мира (Хосту)
⋮----
function render()
⋮----
function bindEvents()
⋮----
// Difficulty selection
⋮----
// PvP toggle
⋮----
// AI Key Mode change
⋮----
// Change active arc
⋮----
// Generate story button
⋮----
// Toggle rewrite container
⋮----
// Confirm rewrite
⋮----
// Toggle edit JSON container
⋮----
// Save edit JSON
⋮----
// Delete story (Sandbox)
⋮----
// Simulate NPC background
⋮----
// Copy session ID
⋮----
// Copy invite link
⋮----
// Add bot
⋮----
// Kick / remove player
⋮----
// Delete session
```

## File: src/pages/lobby.js
```javascript
// src/pages/lobby.js — Глобальное Лобби (Dashboard)
⋮----
function sanitizeAIText(raw)
⋮----
// Persist active tab across re-renders (e.g., when returning from file picker on mobile)
// Persist lobby state across page reloads (mobile file picker causes page reload)
⋮----
function loadLobbyState()
⋮----
function saveLobbyState(state)
⋮----
// Helper to update lobbyState and persist
function updateLobbyState(key, value)
⋮----
export function renderLobby(container, user)
⋮----
function isTextFile(file)
⋮----
async function loadData()
⋮----
function render()
⋮----
// Модальное окно: Бестиарий
⋮----
// Модальное окно: География (Государства, Локации, Подзоны и Туман Войны)
⋮----
// Модальное окно: Структура файла экспорта и Генератор для ИИ
⋮----
function renderSessions()
⋮----
function renderWorlds()
⋮----
function renderCharacters()
⋮----
function bindEvents()
⋮----
function renderBestiaryList()
⋮----
// Toggle NPC edit form
⋮----
// Save NPC handler
⋮----
const parseComma = (val)
⋮----
// Duplicate NPC handler
⋮----
// Delete NPC handler
⋮----
// Load bestiary for a world
async function loadBestiary(worldId)
⋮----
// Search and filter input events for bestiary
⋮----
// Bestiary Tab filtering
⋮----
// Create NPC form toggle
⋮----
// Save new NPC
⋮----
// ===================== GEOGRAPHY =====================
⋮----
// Load geography
async function loadGeography(worldId)
⋮----
// Update state dropdown
⋮----
// Toggle state expand
⋮----
// Edit location toggle handler
⋮----
// Cancel location edit
⋮----
// Helper: populate default zones
⋮----
// Helper: calculate symmetric distance matrix
⋮----
// Save location updates
⋮----
// Delete state
⋮----
// Save state
⋮----
// Add city button
⋮----
// Delete city
⋮----
// Open geography modal from Bestiary
⋮----
// Create state form toggle
⋮----
// Save new state
⋮----
// Save new city / location
⋮----
// Build default zones and distance matrix from subzone input
⋮----
// Tab switching
⋮----
// Sign out
⋮----
// Account settings modal
⋮----
// Copy User ID
⋮----
// Toggle OpenRouter Key visibility
⋮----
// Copy OpenRouter API Key
⋮----
// Copy DB invite link from lobby
const copyDbInviteHandler = () =>
⋮----
// Preset buttons for model selection
⋮----
// Save account settings
⋮----
// New session button (both empty state and grid card)
const openNewSession = () =>
⋮----
// Join session button
⋮----
// Join session form
⋮----
// Extract session ID from URL or plain text
⋮----
// New world button (both empty state and grid card)
const openNewWorld = () =>
⋮----
// Character card buttons
const openNewChar = () =>
⋮----
// Import character buttons
const openImportChar = ()
⋮----
// Character card actions
⋮----
// Edit character card
⋮----
// Edit modal: stats sum updater
function updateEditStatsSum()
⋮----
// Edit modal: AI generate stats
⋮----
// Edit world
⋮----
// Bestiary button
⋮----
// Hide create form when opening bestiary for a new world
⋮----
// Check generation status
⋮----
// Geography button (from world card)
⋮----
// Check generation status and update UI
async function checkGenerationStatus(worldId)
⋮----
// Get world data to check completeness
⋮----
// Calculate progress
⋮----
// Show status bar if generation is incomplete
⋮----
// Show resume button if generation was interrupted
⋮----
// Show finish button if world is incomplete
⋮----
// Finish generation button
⋮----
// Get world lore text
⋮----
// Check what's missing
⋮----
// Generate geography if missing
⋮----
// Update geography for NPC generation
⋮----
// Check what NPCs are missing
⋮----
// Generate intelligent NPCs if missing
⋮----
// Generate creatures if missing
⋮----
// Resume generation button (in bestiary modal)
⋮----
// Get world lore text for regeneration
⋮----
// Collect lore text
⋮----
// If no description, try to get from lore files
⋮----
// Check what needs to be resumed
⋮----
// Confirm
⋮----
// Get geography
⋮----
// Resume intelligent NPCs if needed
⋮----
// Resume creatures if needed
⋮----
// Resume generation button (in world card - keep for compatibility)
⋮----
// Open bestiary modal and trigger resume
⋮----
// Close bestiary modal
⋮----
// Create character card form
⋮----
// Generate stats via AI (in character card modal)
⋮----
// Close modals
⋮----
// PVP toggle
⋮----
// Create session form
⋮----
// Plot file drop zone
⋮----
// If file uploaded, read its content
⋮----
// Save plot to lore_files if provided
⋮----
// Set session to use this plot
⋮----
// Create world form — text to JSON via AI
⋮----
// If description provided — convert via AI
⋮----
// Show preview
⋮----
// Upload lore files if any
⋮----
// Generate NPCs from lore text
⋮----
// Collect all lore text (description + file contents)
⋮----
// Skip generation if no text
⋮----
// Generate NPCs on frontend, then save to DB
⋮----
// Step 1: Generate geography (states and cities)
⋮----
// Step 2: Save geography to DB
⋮----
// Add IDs to geography for NPC generation
⋮----
// Step 3: Generate intelligent NPCs (with progress saving)
⋮----
// Step 4: Generate creatures (beasts, monsters, bosses)
⋮----
// File drop zone
⋮----
function addFiles(fileListObj)
⋮----
function renderFileList()
⋮----
// Session card actions
⋮----
// Leave session (for guest participants)
⋮----
// Export world
⋮----
// Initialize Master AI World Prompt in Schema Modal
⋮----
// Copy Master Prompt Button
⋮----
// Schema info button
⋮----
// Close schema modal
⋮----
// Import world (from modal)
⋮----
// Build informative message about what was imported
⋮----
// Delete world
⋮----
// Close modals on overlay click
⋮----
// Restore open modal after re-render (e.g., after file picker returns)
```

## File: src/styles/game.css
```css
/* src/styles/game.css — Атмосферные стили таверны («Путник и Дракон») */
⋮----
/* ===================== Auth Page (Вход в таверну) ===================== */
.auth-page {
⋮----
.auth-container {
⋮----
.auth-container::before {
⋮----
.auth-header {
⋮----
.auth-logo {
⋮----
.auth-title {
⋮----
.auth-subtitle {
⋮----
.auth-form {
⋮----
.auth-toggle {
⋮----
.auth-toggle a {
⋮----
/* ===================== Google Button ===================== */
.btn-google {
⋮----
.btn-google:hover {
⋮----
.btn-google:active {
⋮----
.btn-google:disabled {
⋮----
.google-icon {
⋮----
.auth-divider {
⋮----
.auth-divider::before,
⋮----
/* Custom Supabase DB Banner & Actions */
.custom-db-banner {
⋮----
.custom-db-banner-top {
⋮----
.custom-db-banner-info {
⋮----
.custom-db-banner-host {
⋮----
.custom-db-banner-actions {
⋮----
.custom-db-banner-actions .btn {
⋮----
.custom-db-actions-grid {
⋮----
.custom-db-actions-grid .btn {
⋮----
/* ===================== Lobby (Зал Гильдии и Доска Заказов) ===================== */
.lobby-header {
⋮----
.lobby-header-left {
⋮----
.lobby-header-right {
⋮----
.lobby-title {
⋮----
.lobby-tabs {
⋮----
.lobby-tab {
⋮----
.lobby-tab:hover {
⋮----
.lobby-tab.active {
⋮----
.lobby-content {
⋮----
/* Card Grid (Доска объявлений) */
.card-grid {
⋮----
/* Empty State */
.empty-state {
⋮----
.empty-icon {
⋮----
.empty-state h3 {
⋮----
.empty-state p {
⋮----
/* World Settings Preview */
.world-settings-preview {
⋮----
/* ===================== Difficulty Options ===================== */
.difficulty-options {
⋮----
.difficulty-option {
⋮----
.difficulty-option:hover {
⋮----
.difficulty-option.selected {
⋮----
.difficulty-label {
⋮----
.difficulty-desc {
⋮----
/* Invite Code */
.invite-code-container {
⋮----
.invite-code {
⋮----
/* Lore List */
.lore-list {
⋮----
.lore-item {
⋮----
/* Player Row */
.player-row {
⋮----
.player-info {
⋮----
.player-info strong {
⋮----
.player-stats {
⋮----
/* ===================== Game Screen (Походная Панель) ===================== */
.game-page {
⋮----
.game-header {
⋮----
.game-header-top {
⋮----
.game-header-center,
⋮----
.game-header-name {
⋮----
/* HP Vial (Склянка жизненной силы) */
.hp-bar-container {
⋮----
.hp-bar {
⋮----
.hp-bar.low {
⋮----
.hp-bar.critical {
⋮----
.game-header-hp {
⋮----
.game-header-actions {
⋮----
.game-header-actions .btn-icon {
⋮----
.game-header-actions .btn-icon svg {
⋮----
.game-header-actions .btn-icon:hover {
⋮----
.game-header-actions .btn-icon:hover svg {
⋮----
.game-header-actions .btn-icon:active {
⋮----
/* Dedicated Sub-bar for Location & Time (Компас и Часы) */
.game-status-bar {
⋮----
.game-header-location {
⋮----
.game-header-time {
⋮----
.game-header-location svg,
⋮----
/* ===================== Chat Area (Хроника приключений) ===================== */
.game-chat {
⋮----
.chat-messages {
⋮----
.chat-empty {
⋮----
/* Messages */
.message {
⋮----
.message-avatar {
⋮----
.message-master .message-avatar {
⋮----
.message-player .message-avatar {
⋮----
.message-body {
⋮----
.message-sender {
⋮----
.message-master .message-sender {
⋮----
.message-player .message-sender {
⋮----
/* Master message (Пергаментная летопись) */
.message-master .message-text {
⋮----
/* DM Typing Indicator Animation */
.typing-indicator-bubble {
⋮----
.typing-indicator-bubble .message-text {
⋮----
.typing-dots {
⋮----
.typing-dots span {
⋮----
.typing-dots span:nth-child(1) {
⋮----
.typing-dots span:nth-child(2) {
⋮----
.typing-dots span:nth-child(3) {
⋮----
/* System message (Слухи таверны) */
.message-system {
⋮----
.message-system .message-text {
⋮----
/* Self message (Кожаный путевой дневник) */
.message-self {
⋮----
.message-self .message-avatar {
⋮----
.message-self .message-body {
⋮----
.message-self .message-text {
⋮----
/* ===================== Input Area (Очаг действий) ===================== */
.game-input-area {
⋮----
.game-input-wrapper {
⋮----
.game-input {
⋮----
.game-input:focus {
⋮----
.game-input::placeholder {
⋮----
.game-input:disabled {
⋮----
/* ===================== Side Panels (Фолианты и Гримуары) ===================== */
.side-panel-overlay {
⋮----
.side-panel-overlay.open {
⋮----
.side-panel {
⋮----
.side-panel.open {
⋮----
.side-panel-header {
⋮----
.side-panel-header h2 {
⋮----
.side-panel-content {
⋮----
/* Profile (Компактная грамота героя) */
#profilePanel .side-panel-content {
⋮----
.profile-card {
⋮----
.profile-card .hp-bar-container,
⋮----
/* Компактный заголовок: имя и уровень слева, аватарка справа */
.profile-header-compact {
⋮----
.profile-header-info {
⋮----
.profile-name-row {
⋮----
.profile-header-compact .profile-name {
⋮----
.profile-lvl-badge {
⋮----
.profile-sub-row {
⋮----
.profile-meta-tag {
⋮----
.profile-meta-separator {
⋮----
.profile-money-chip {
⋮----
.profile-xp-block {
⋮----
.profile-xp-labels {
⋮----
.profile-bar-track {
⋮----
.profile-bar-track .hp-bar {
⋮----
.profile-bar-track.xp-track {
⋮----
.profile-bar-fill.xp-fill {
⋮----
.profile-bar-fill.mp-fill {
⋮----
.profile-header-compact .profile-avatar {
⋮----
/* Vitals & Combat */
.profile-vitals-group {
⋮----
.vital-bar-item {
⋮----
.vital-bar-labels {
⋮----
.vital-label-hp { color: #4ade80; }
.vital-label-mp { color: #60a5fa; }
.vital-val { color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; }
⋮----
.profile-combat-row {
⋮----
.combat-stat-pill {
⋮----
.combat-stat-icon { font-size: 0.85rem; }
.combat-stat-label { font-size: 11px; color: var(--text-muted); flex: 1; }
.combat-stat-value { font-size: 0.95rem; font-weight: 700; font-family: var(--font-mono); color: var(--accent-gold); }
⋮----
.profile-free-points-banner {
⋮----
.profile-section {
⋮----
.profile-section-title {
⋮----
.profile-card .stats-grid-3 {
⋮----
.profile-card .stat-card {
⋮----
.profile-card .stat-card-label {
⋮----
.profile-card .stat-card-value {
⋮----
.profile-card .stat-card-modifier {
⋮----
.profile-bio {
⋮----
.profile-injuries {
⋮----
/* Stats Grid */
.stats-grid {
⋮----
.stat-item {
⋮----
.stat-label {
⋮----
.stat-value {
⋮----
.stat-modifier {
⋮----
/* Inventory (Вещмешок авантюриста) */
.inventory-summary {
⋮----
.inventory-list {
⋮----
.inventory-item {
⋮----
.inventory-item:hover {
⋮----
.inventory-item-name {
⋮----
.inventory-item-meta {
⋮----
/* ===================== NPC Bestiary (Бестиарий и Жители) ===================== */
.npc-card {
⋮----
.npc-header {
⋮----
.npc-header:hover {
⋮----
.npc-header-info {
⋮----
.npc-role-badge {
⋮----
.npc-role-main {
⋮----
.npc-role-secondary {
⋮----
.npc-role-tertiary {
⋮----
.npc-combat-stats {
⋮----
.npc-name {
⋮----
.npc-race {
⋮----
.npc-category {
⋮----
.npc-location {
⋮----
.npc-toggle-icon {
⋮----
.npc-card.open .npc-toggle-icon {
⋮----
/* Bestiary Tabs */
.bestiary-tabs {
⋮----
.bestiary-tabs::-webkit-scrollbar {
⋮----
.bestiary-tab {
⋮----
.bestiary-tab:hover {
⋮----
.bestiary-tab.active {
⋮----
/* State Cards */
.state-card {
⋮----
.state-header {
⋮----
.state-header:hover {
⋮----
.state-header-info {
⋮----
.state-name {
⋮----
.state-locations-count {
⋮----
.state-actions {
⋮----
.state-edit-form {
⋮----
.cities-list {
⋮----
.city-item {
⋮----
.city-item:hover {
⋮----
.city-info {
⋮----
.city-type-icon {
⋮----
.city-name {
⋮----
.city-type {
⋮----
.city-actions {
⋮----
.state-card.open .npc-toggle-icon {
⋮----
/* Generation Status */
.gen-status {
⋮----
.gen-status-header {
⋮----
.gen-status-text {
⋮----
.gen-status-progress {
⋮----
.gen-progress-bar {
⋮----
.gen-progress-fill {
⋮----
/* Schema Modal */
.schema-content {
⋮----
.schema-section {
⋮----
.schema-section:last-child {
⋮----
.schema-section h4 {
⋮----
.schema-section ul {
⋮----
.schema-section li {
⋮----
.schema-section li strong {
⋮----
.code-example {
⋮----
.npc-edit-form {
⋮----
.npc-form-grid {
⋮----
.npc-actions {
⋮----
.npc-actions .btn {
⋮----
#createNpcForm {
⋮----
.npc-section-title {
⋮----
.npc-header-meta-row {
⋮----
.npc-mood-badge {
.npc-mood-badge.mood-calm { background: rgba(46, 125, 50, 0.25); color: #81c784; border: 1px solid rgba(76, 175, 80, 0.4); }
.npc-mood-badge.mood-suspicious { background: rgba(230, 81, 0, 0.25); color: #ffb74d; border: 1px solid rgba(255, 152, 0, 0.4); }
.npc-mood-badge.mood-cheerful { background: rgba(249, 168, 37, 0.25); color: #fff176; border: 1px solid rgba(253, 216, 53, 0.4); }
.npc-mood-badge.mood-irritated { background: rgba(198, 40, 40, 0.25); color: #ef9a9a; border: 1px solid rgba(244, 67, 54, 0.4); }
.npc-mood-badge.mood-frightened { background: rgba(106, 27, 154, 0.25); color: #ce93d8; border: 1px solid rgba(171, 71, 188, 0.4); }
.npc-mood-badge.mood-impressed { background: rgba(2, 136, 209, 0.25); color: #81d4fa; border: 1px solid rgba(3, 169, 244, 0.4); }
.npc-mood-badge.mood-mournful { background: rgba(55, 71, 79, 0.35); color: #b0bec5; border: 1px solid rgba(120, 144, 156, 0.4); }
⋮----
.npc-temperament-badge {
⋮----
.npc-subline-text {
⋮----
.terrain-badge {
.terrain-badge.terrain-urban { background: rgba(96, 125, 139, 0.25); color: #b0bec5; border: 1px solid rgba(96, 125, 139, 0.4); }
.terrain-badge.terrain-building { background: rgba(141, 110, 99, 0.25); color: #d7ccc8; border: 1px solid rgba(141, 110, 99, 0.4); }
.terrain-badge.terrain-forest { background: rgba(46, 125, 50, 0.25); color: #a5d6a7; border: 1px solid rgba(76, 175, 80, 0.4); }
.terrain-badge.terrain-cave { background: rgba(62, 39, 35, 0.4); color: #bcaaa4; border: 1px solid rgba(109, 76, 65, 0.5); }
.terrain-badge.terrain-mountain { background: rgba(55, 71, 79, 0.3); color: #cfd8dc; border: 1px solid rgba(120, 144, 156, 0.4); }
.terrain-badge.terrain-open { background: rgba(255, 179, 0, 0.2); color: #ffe082; border: 1px solid rgba(255, 193, 7, 0.4); }
⋮----
.zone-count-badge {
⋮----
.prompt-copy-card {
⋮----
.prompt-copy-header {
⋮----
.prompt-textarea {
⋮----
.session-players-preview {
⋮----
.session-player-chips {
⋮----
.player-chip {
⋮----
.player-chip:hover {
⋮----
.player-chip-self {
⋮----
/* Character Select Grid */
.char-select-grid {
⋮----
.char-select-card {
⋮----
.char-select-card:hover {
⋮----
.char-select-card .card-header {
⋮----
.char-select-bio {
⋮----
.char-select-actions {
⋮----
/* File Drop Zone (Сюжетный свиток) */
.plot-details {
⋮----
.plot-summary {
⋮----
.plot-summary:hover {
⋮----
.plot-summary::marker {
⋮----
.plot-body {
⋮----
.file-drop-zone {
⋮----
.file-drop-zone:hover,
⋮----
.file-drop-icon {
⋮----
.file-drop-zone p {
⋮----
.file-list {
⋮----
.file-item {
⋮----
/* ===================== NPC Relationships & Memories Panel ===================== */
.npc-rel-card {
⋮----
.npc-rel-card:hover {
⋮----
.npc-rel-header {
⋮----
.npc-rel-name {
⋮----
.npc-rel-meta {
⋮----
.npc-tier-badge {
⋮----
.rel-bar-wrapper {
⋮----
.rel-bar-labels {
⋮----
.rel-bar-track {
⋮----
.rel-bar-center-marker {
⋮----
.rel-bar-fill {
⋮----
.npc-status-tags {
⋮----
.npc-tag {
⋮----
.npc-memories-toggle {
⋮----
.npc-memories-toggle:hover {
⋮----
.npc-memories-body {
⋮----
.memory-item {
⋮----
.memory-item.vivid {
⋮----
.memory-item.belief {
⋮----
.memory-item.impression {
⋮----
.memory-item-header {
⋮----
.memory-item-text {
⋮----
/* ===================== Responsive (Mobile & Tablet) ===================== */
⋮----
.lobby-tabs::-webkit-scrollbar {
⋮----
/* Side Panel Mobile */
⋮----
.side-panel-header .btn-icon {
⋮----
/* Stats Grid Mobile */
⋮----
/* Game Header Mobile (768px) */
⋮----
/* Auth Mobile */
⋮----
.profile-avatar {
⋮----
.profile-name {
⋮----
.lobby-header-left .badge {
⋮----
.lobby-header-right .btn {
⋮----
/* Game header compact (<=480px) */
⋮----
/* Chat messages tighter */
⋮----
.message-text {
⋮----
/* Input compact & safe area */
⋮----
.game-input-wrapper .btn-primary {
⋮----
/* Character creation */
⋮----
/* NPC Cards Small Mobile */
⋮----
/* Bestiary Tabs Mobile */
⋮----
/* State Cards Mobile */
⋮----
.state-actions .btn {
⋮----
/* Roleplay Notation Styling */
.rp-speech {
⋮----
.rp-action {
⋮----
/* Busy State Banner */
.busy-state-banner {
⋮----
.busy-state-info {
⋮----
.busy-icon {
⋮----
.busy-text {
⋮----
.busy-text strong {
⋮----
.busy-text small {
⋮----
/* ===================================================
   INTERACTIVE WORLD MAP & RADAR
   =================================================== */
⋮----
#mapPanel.map-wide {
⋮----
#mapPanel.map-fullscreen {
⋮----
.map-panel-content {
⋮----
.map-toolbar {
⋮----
.map-controls-group {
⋮----
.map-status-info {
⋮----
.map-viewport {
⋮----
.map-viewport:active {
⋮----
.map-stage {
⋮----
/* Coordinate axes & grid */
.map-grid-svg {
⋮----
/* Markers (SVG <g>) */
.map-marker {
⋮----
.map-marker:hover {
⋮----
.map-marker-pin {
⋮----
.map-marker-label {
⋮----
/* Player Beacon */
.map-player-beacon {
⋮----
.map-player-dot {
⋮----
.map-player-dot::after {
⋮----
.map-party-dot {
⋮----
.map-info-popup {
⋮----
/* ============================================================
   MAP — Semantic Zoom & Border Styles (Migration 038)
   ============================================================ */
⋮----
/* State border polygon (SVG, filled via JS fill attribute) */
.map-state-polygon {
⋮----
/* State label (SVG text) */
.map-state-label-text {
⋮----
/* Wild zone label */
.map-wildzone-label {
⋮----
/* Location border (SVG) — hidden by default, shown when zoomed in */
.map-loc-border,
⋮----
/* Subzone HTML marker */
.map-subzone-marker {
.map-subzone-dot {
⋮----
/* ── SEMANTIC ZOOM LEVELS ────────────────────────────────── */
⋮----
/* GLOBAL (< 30%): only state borders + capitals */
.map-zoom-far .map-marker[data-type]:not([data-type="capital"]) {
.map-zoom-far .map-loc-border,
.map-zoom-far .map-state-label-text {
⋮----
/* REGIONAL (30% – 90%): cities visible, state names fade */
.map-zoom-mid .map-state-label-text {
.map-zoom-mid .map-subzone-marker,
.map-zoom-mid .map-loc-border {
⋮----
/* LOCAL (> 90%): all details visible, state borders fade */
.map-zoom-close .map-state-polygon {
.map-zoom-close .map-state-label-text {
.map-zoom-close .map-loc-border,
⋮----
/* MICRO (> 250%): Hide massive global geometries (grid, state borders, outer city dashed borders)
   to eliminate millions of dashes and 12-million-pixel line rasterization from freezing mobile GPU */
.map-zoom-micro .map-grid-lines {
.map-zoom-micro .map-state-borders {
.map-zoom-micro .map-state-labels {
.map-zoom-micro .map-wildzone-layer {
.map-zoom-micro .map-loc-border {
.map-zoom-micro .map-subzone-border,
.map-zoom-micro .map-marker-pin {
.map-zoom-micro .map-marker-label {
⋮----
.map-zoom-micro .map-marker {
⋮----
/* Scale handled by JS attribute */
⋮----
/* Scale applied via JS attribute */
⋮----
/* Also add non-scaling-stroke to SVG elements */
svg.map-grid-svg polygon, svg.map-grid-svg circle, svg.map-grid-svg line, svg.map-grid-svg path {
```

## File: src/api/game.js
```javascript
// src/api/game.js — API-методы для игровой логики
⋮----
// ===================== WORLDS =====================
⋮----
export async function getWorlds(ownerId = null)
⋮----
export async function getWorld(id)
⋮----
export async function createWorld(world)
⋮----
export async function updateWorld(id, updates)
⋮----
export async function deleteWorld(id)
⋮----
// ===================== LORE FILES =====================
⋮----
export async function getLoreFiles(worldId, folder = null)
⋮----
export async function getLoreFilesByFolder(worldId)
⋮----
export async function createLoreFile(file)
⋮----
export async function updateLoreFile(id, updates)
⋮----
export async function deleteLoreFile(id)
⋮----
// ===================== SESSIONS =====================
⋮----
export async function getSessions(userId = null)
⋮----
// 1. Получаем сессии, в которых пользователь участвует как игрок
⋮----
// 2. Получаем миры пользователя (сессии, которые созданы на базе его миров)
⋮----
// Если нет ни персонажей в сессиях, ни собственных миров — сессий у пользователя нет
⋮----
// Параллельно забираем миры (включая owner_id для проверки прав) и всех участников всех сессий за 2 запроса
⋮----
export async function getSession(id)
⋮----
export function extractMissingColumn(error)
⋮----
// PostgREST: could not find the 'xyz' column of 'table' in the schema cache
⋮----
// PostgreSQL: column "xyz" of relation "table" does not exist
⋮----
// PostgREST alternate: column 'xyz' does not exist
⋮----
export async function createSession(session)
⋮----
export async function updateSession(id, updates)
⋮----
export async function deleteSession(id)
⋮----
// Fallback: direct DELETE query with RLS cascade
⋮----
// ===================== PLAYERS =====================
⋮----
export async function getSessionPlayers(sessionId)
⋮----
export async function getPlayer(id)
⋮----
export async function createPlayer(player)
⋮----
// race_ac_bonus is derived from race and not needed in the database table
⋮----
export async function updatePlayer(id, updates)
⋮----
export async function deletePlayer(id)
⋮----
export async function removeSessionPlayer(sessionId, playerId)
⋮----
// 1. Попытка через хранимую процедуру в БД (RPC)
⋮----
// 2. Попытка через Edge Function manage-player (сервисный ключ обходит ограничения RLS)
⋮----
// 3. Прямое удаление на клиенте
// Связанные таблицы (turn_queue, inventory и т.д.) удалятся автоматически благодаря ON DELETE CASCADE в базе данных.
⋮----
// ===================== FOG OF WAR =====================
⋮----
/**
 * Обновить текущую подзону игрока (для системы тумана войны).
 * Вызывается при смене зоны в рамках текущей локации.
 * @param {string} playerId
 * @param {string|null} zone - название подзоны, например "tavern_kitchen". null = основная зона.
 */
export async function updatePlayerZone(playerId, zone)
⋮----
/**
 * Сохранить сгенерированную ИИ карту расстояний между зонами локации.
 * @param {string} sessionId
 * @param {object} locationMap - { "zone_a": { "zone_b": 2 }, ... }
 */
export async function updateLocationMap(sessionId, locationMap)
⋮----
/**
 * Загрузить всех игроков сессии с их зонами (облегчённый запрос для fog matrix).
 * @param {string} sessionId
 * @returns {Array<{id, name, user_id, current_zone}>}
 */
export async function getSessionPlayersWithZones(sessionId)
⋮----
// ===================== INVENTORY =====================
⋮----
export async function getPlayerInventory(playerId)
⋮----
export async function addInventoryItem(item)
⋮----
export async function updateInventoryItem(id, updates)
⋮----
export async function removeInventoryItem(id)
⋮----
// ===================== MESSAGES =====================
⋮----
export async function getSessionMessages(sessionId, limit = 100)
⋮----
// Сортируем в хронологическом порядке от старых к новым для правильного отображения в чате
⋮----
export async function sendMessage(message)
⋮----
// ===================== TURN MANAGEMENT =====================
⋮----
export async function getCurrentTurn(sessionId)
⋮----
export async function getTurnQueue(sessionId)
⋮----
export async function initTurnQueue(sessionId, players = [])
⋮----
// 1. Получаем существующую очередь для сессии
⋮----
// 2. Если очереди ещё нет — создаём для каждого игрока по порядку входа в мир (created_at ASC)
⋮----
// 3. Проверяем, есть ли игроки, которых ещё нет в очереди (зашли позже)
⋮----
// 4. Проверяем активный ход
⋮----
// Если активного хода нет, но есть ожидающие — активируем первый waiting по порядку входа (created_at ASC)
⋮----
// Если все ходы завершены (completed) — перезапускаем раунд по порядку входа (created_at ASC)
⋮----
export async function passTurn(sessionId, targetPlayerId)
⋮----
// Переводим все активные ходы в waiting
⋮----
// Активируем ход целевого игрока
⋮----
// Если у целевого игрока ещё не было записи в turn_queue, создаём её
⋮----
export async function submitAction(sessionId, playerId, actionText)
⋮----
// ===================== CHARACTER CARDS =====================
⋮----
export async function getCharacterCards(userId)
⋮----
export async function getCharacterCard(id)
⋮----
export async function createCharacterCard(card)
⋮----
export async function updateCharacterCard(id, updates)
⋮----
export async function deleteCharacterCard(id)
⋮----
// ===================== USER SETTINGS =====================
⋮----
export async function getUserSettings(userId)
⋮----
export async function upsertUserSettings(userId, openrouterKey, models =
⋮----
// ===================== IMPORT / EXPORT =====================
⋮----
export async function exportWorld(worldId)
⋮----
// Get states with locations and subzones
⋮----
// Get NPCs with location info
⋮----
// Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) исключаены — рассчитываются автоматически
⋮----
// Для неуникальных существ — диапазон уровней при спавне
⋮----
export function downloadJSON(data, filename)
⋮----
// Get schema info for display
// Get schema info for display
export function getWorldSchema()
⋮----
// Расчётные поля (не включаются в экспорт): hp, max_hp, armor_class, initiative, saving_throws
⋮----
// Критерии ИИ для генерации
⋮----
function formatSecretsForDb(secrets)
⋮----
function formatSpeechStyleForDb(speech)
⋮----
function formatDailyRoutineForDb(routine)
⋮----
export async function importWorld(jsonData, ownerId)
⋮----
// Validate schema
⋮----
// Import lore files
⋮----
// Import geography (states + locations + subzones)
const locationIdMap = {}; // old ID -> new ID
const locationNameMap = {}; // name -> new ID (for JSON without IDs)
const stateIdMap = {}; // old ID -> new ID
const stateNameMap = {}; // name -> new ID (for JSON without IDs)
const subzoneIdMap = {}; // old subzone ID -> new subzone ID
const subzoneNameMap = {}; // subzone name -> new subzone ID
⋮----
// Import locations for this state
⋮----
// Map old location IDs to new ones and insert subzones
⋮----
// Import subzones for this location if provided
⋮----
// Import NPCs
⋮----
// Build name-based lookups for locations and states from DB
⋮----
// Fetch all states for this world to build name lookup
⋮----
// Fetch all locations for this world (via states)
⋮----
// Resolve location_id: can be UUID (from export) or name (manual JSON)
⋮----
// Try UUID mapping first (from export)
⋮----
// Try name mapping from imported locations
⋮----
// Fallback: search all locations in DB by name
⋮----
// Resolve state_id: can be UUID (from export) or name (manual JSON)
⋮----
// Try UUID mapping first (from export)
⋮----
// Try name mapping from imported states
⋮----
// Fallback: search all states in DB by name
⋮----
// Расчётные поля
⋮----
// HP: уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
⋮----
// AC: 10 + DEX mod + расовый бонус
⋮----
// Initiative: DEX mod
⋮----
// Saving throws: stat mod + proficiency bonus
⋮----
// Расчётные поля
⋮----
// Новые поля психологии и отыгрыша NPC
⋮----
// Combat fields
⋮----
// ===================== NPC BESTIARY =====================
⋮----
export async function getNpcsByWorld(worldId)
⋮----
// Flatten location name for easier access
⋮----
export async function getNpc(id)
⋮----
export async function createNpc(npc)
⋮----
export async function updateNpc(id, updates)
⋮----
// Resolve location_name to location_id if provided
⋮----
export async function deleteNpc(id)
⋮----
export async function updateLocation(id, updates)
⋮----
export async function createLocation(location)
⋮----
export async function deleteLocation(id)
⋮----
export async function exportPlayer(playerId)
⋮----
// ===================== NPC RELATIONSHIPS & MEMORIES =====================
⋮----
export function getRelationshipTierLabelClient(tier)
⋮----
export async function getNpcRelationships(sessionId, playerId)
⋮----
// Получаем сессию чтобы узнать current_location_id
⋮----
// Получаем NPC в локации
⋮----
// Получаем сохраненные отношения для этих NPC и текущего игрока
⋮----
export async function getNpcMemories(npcId, playerId)
⋮----
// ===================== PLAYER SKILLS & STAT ALLOCATION =====================
⋮----
export async function getPlayerSkills(playerId)
⋮----
export async function allocateStatPoints(playerId, statName, points = 1)
⋮----
export async function getWorldMapData(worldId)
```

## File: src/pages/game.js
```javascript
// src/pages/game.js — Игровой экран (Чат + Инвентарь + Профиль)
⋮----
export async function renderGame(container, sessionId, user)
⋮----
let activePanel = null; // 'profile' | 'inventory' | 'settings' | 'npc' | null
⋮----
let isMyTurn = true; // По умолчанию разрешаем ввод
⋮----
const instanceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); // unique per render call
⋮----
// ============================================
// ТУМАН ВОЙНЫ: фильтр видимости сообщений
// Персональные сообщения Мастера (с metadata.target_player_id)
// видны ТОЛЬКО указанному игроку. Глобальный нарратив (без target)
// и системные сообщения видят все.
// fog_perception — видит только адресат (другой игрок-наблюдатель)
// ============================================
function isMessageVisibleToCurrentPlayer(msg)
⋮----
// Системные сообщения — все
⋮----
// Свои действия видит только автор (проверяем как auth user.id, так и player.id)
⋮----
// Сообщения Мастера: проверяем target_player_id
⋮----
// Глобальный лог: виден игрокам в той же зоне, кроме автора действия (автор уже видит личный нарратив)
// Игроки в других зонах не видят детали чужих действий — события доходят только через fog_perception
⋮----
// Fog-сообщение: видит ТОЛЬКО адресат
⋮----
// Персональный нарратив — только адресату
⋮----
// Сообщения NPC (диалоги, спутники, реплики в сцене) — видны всем игрокам
⋮----
async function load()
⋮----
// Определяем текущего игрока для данного пользователя (с fallback на getUser)
⋮----
// Если персонаж уже есть, проверяем очередь ходов и загружаем навыки
⋮----
// Предзагрузка данных карты мира
⋮----
// ============================================
// ОЧЕРЕДЬ ХОДОВ: проверка и подписка
// ============================================
async function checkTurnQueue()
⋮----
// Если в сессии 1 игрок — всегда его ход
⋮----
// Очередь пуста или нет активного хода — самоисцеление/инициализация
⋮----
// Нет активного хода — разрешаем ввод
⋮----
function subscribeRealtime()
⋮----
if (realtimeSubscribed) return; // prevent double-subscribe
⋮----
// Если пришло сообщение от Мастера или NPC, сразу скрываем индикатор генерации
⋮----
// Мгновенная синхронизация игрового времени из метаданных входящего сообщения
⋮----
// Фоновое обновление сессии на случай изменений в БД
⋮----
// Если это сообщение игрока, проверяем, не было ли оно уже отображено оптимистично
⋮----
// Защита от дублирования сообщений в массиве истории
⋮----
// Подписка на изменение параметров сессии (время, календарь, локация, отряды)
⋮----
// Подписка на очередь ходов
⋮----
function handleTurnUpdate(payload)
⋮----
// Снимаем блокировку, когда наступает наш ход
⋮----
function updateInputState()
⋮----
function render()
⋮----
// Format game time
⋮----
function renderProfile(player)
⋮----
function renderInventory(player)
⋮----
function renderSessionParticipants(players)
⋮----
function renderSessionSettings(session)
⋮----
function getTierColor(tier)
⋮----
function renderNpcList(items)
⋮----
function renderNpcCard(item)
⋮----
function renderMemoriesBody(npcId)
⋮----
async function refreshNpcPanel()
⋮----
function bindNpcCardEvents()
⋮----
function renderStoryPanel(story)
⋮----
async function refreshStoryPanel()
⋮----
function bindStoryEvents()
⋮----
// Generate Story
⋮----
// Toggle Rewrite Container
⋮----
// Confirm Rewrite Story
⋮----
// Toggle Edit JSON Container
⋮----
// Save Edit JSON
⋮----
// Delete Story (Sandbox)
⋮----
// Interactive Goal Toggle Checkbox
⋮----
function bindEvents()
⋮----
// Back
⋮----
// Panel toggles
⋮----
// Close panels
⋮----
// Busy state: interrupt long term activity
⋮----
// Multi-player: take turn button
⋮----
// Multi-player: copy invite link & ID
⋮----
// Auto-resize textarea
⋮----
// Submit action
⋮----
// Toggle Rewrite Container
⋮----
// Confirm Rewrite Story
⋮----
// Toggle Edit JSON Container
⋮----
// Save Edit JSON
⋮----
// Delete Story (Sandbox)
⋮----
// Interactive Goal Toggle Checkbox
⋮----
// Back
⋮----
// Panel toggles
⋮----
// Close panels
⋮----
// Busy state: interrupt long term activity
⋮----
// Multi-player: take turn button
⋮----
// Multi-player: copy invite link & ID
⋮----
// Auto-resize textarea
⋮----
// Submit action
⋮----
// Export player
⋮----
function bindParticipantEvents()
⋮----
function bindProfileEvents()
⋮----
async function refreshProfile()
⋮----
async function refreshInventory()
⋮----
// ============================================
// ИНТЕРАКТИВНАЯ КАРТА МИРА
// ============================================
⋮----
function updateViewportDimensions()
⋮----
function getCoordScale()
⋮----
function applyMapTransform(forceScaleUpdate = false)
⋮----
// Manage zoom classes only when zoom tier changes
⋮----
// Fix for Blink/Safari SVG CSS transform-origin bugs:
// Apply scale directly as an SVG attribute to elements that need it
// Using cached arrays eliminates the massive querySelector lag during zoom/pan!
⋮----
// We remove the blurry CSS transform from stage entirely
⋮----
// And apply pure vector scaling and panning via SVG viewBox!
⋮----
function recenterMapOnPlayer()
⋮----
function fitWorldMap()
⋮----
function zoomMapStep(factor, pivotX = null, pivotY = null)
⋮----
// ============================================================
// MAP RENDERING HELPERS
// ============================================================
⋮----
/** Deterministic color from state id (stable across renders) */
function getStateMapColor(state)
⋮----
/** Convex Hull (Andrew's Monotone Chain) — returns ordered vertices */
function computeConvexHull(pts)
⋮----
const cross = (O, A, B)
⋮----
/** Inflate polygon vertices outward from centroid by padding units */
function inflateHull(hull, padding)
⋮----
/** Centroid of a polygon */
function polygonCentroid(pts)
⋮----
// ============================================================
// MAIN MAP RENDER
// ============================================================
function renderMapElements()
⋮----
// ── 1. Bounding box for dynamic grid size ──────────────────
⋮----
// ── 2. Rebuild SVG using DOM API (fixes encoding issues) ───
⋮----
// Clear and create root group
⋮----
// NO translate needed! The SVG viewBox handles the coordinate system natively.
⋮----
// ── 3. Grid lines ──────────────────────────────────────────
⋮----
// Axis lines
⋮----
// ── 4. State polygon borders ───────────────────────────────
⋮----
// State labels layer (drawn on top of fills)
⋮----
const fillColor = color + '30'; // 19% opacity
const strokeColor = color + 'bb'; // 73% opacity
⋮----
// State label at centroid of main ring
⋮----
// Explicit circle
⋮----
// label
⋮----
return; // done for this state
⋮----
// Fallback: compute convex hull from city coords, inflate by 350 units
⋮----
// Draw polygon
⋮----
// State label at centroid
⋮----
// ── 5. Location borders (small circles) ───────────────────
⋮----
// Subzone borders (only on close zoom, managed by CSS .map-zoom-close)
⋮----
// Wild zone ring around player
⋮----
// Origin dot + label
⋮----
// ── 6. SVG Markers for locations (no blur on iOS) ─────────────────────────
⋮----
// Subzones
⋮----
// City Marker
⋮----
pinCirc.setAttribute('cy', '-11'); // Center of pin
⋮----
iconText.setAttribute('y', '-10'); // text center
⋮----
// ── 7. Player markers (SVG) ─────────────────────────────────────
⋮----
// Current player
⋮----
// State labels drawn AFTER markers so state names appear ON TOP of capital markers
⋮----
// Cache markers to prevent lag during zoom/pan
⋮----
// Note: .map-state-label-text is intentionally EXCLUDED so state labels zoom naturally with the terrain!
⋮----
// Reset render cache so newly rendered DOM gets fresh scale applied
⋮----
// Apply transform synchronously so viewBox is ready immediately
⋮----
function showLocationPopup(loc)
⋮----
function initMapInteractions()
⋮----
function getDistance(p1, p2)
⋮----
function getMidpoint(p1, p2)
⋮----
function scheduleMapTransform()
⋮----
const handlePointerEnd = (e) =>
⋮----
function bindMapToolbarEvents()
⋮----
async function refreshMapPanel()
⋮----
// Attach ResizeObserver to mapViewport to handle slide-in transitions cleanly
⋮----
async function togglePanel(panel)
⋮----
async function handleSend()
⋮----
// 1. Мгновенно отображаем сообщение игрока в чате
⋮----
// 2. Сразу запускаем анимацию генерации ответа в облачке ДМ
⋮----
// Обновление времени сессии при наличии
⋮----
// Обновление локации при смене или генерации начальной локации
⋮----
// Обновление локации при смене
⋮----
// Оповещения об изменении отношений и памяти NPC
⋮----
// Оповещения о сюжетном прогрессе (автоматическое отслеживание)
⋮----
// Уведомления о спутниках, навыках и уровнях
⋮----
// Обновление данных игрока, навыков и инвентаря
⋮----
function showDmTypingIndicator()
⋮----
// Remove empty state if present
⋮----
function removeDmTypingIndicator()
⋮----
function appendMessage(msg)
⋮----
// ТУМАН ВОЙНЫ: единая функция проверки видимости
⋮----
// Защита от дубликатов в DOM
⋮----
// Remove empty state if present
⋮----
function updatePlayerUI()
⋮----
// Update location and time in header without full re-render
⋮----
function scrollToBottom()
⋮----
function escapeHtml(text)
⋮----
// Character creation / selection screen
async function renderCharacterCreation()
⋮----
function getSelectedSpawnTarget()
⋮----
// Load existing cards after DOM elements are created
⋮----
// Защита от задвоения: проверяем, не был ли персонаж уже создан (в другой вкладке или гонке запросов)
⋮----
// Create new character
⋮----
// Auto-update stats sum display
function updateStatsSum()
⋮----
// Generate stats via AI
⋮----
function handleVisibilityChange()
⋮----
function handleOnline()
⋮----
// Cleanup on unmount
function cleanup()
⋮----
// Return cleanup function
```
