// src/api/openrouter.js — Прямые запросы к OpenRouter (без лимитов Supabase)
import { OPENROUTER_API_KEY, AI_MODEL, CARD_GENERATION_MODELS, calculateDerivedStats, getRaceAcBonus } from '../config.js';
import { DAMAGE_TYPES, getDamageType, canBeDot, canHalfOnSave, getSaveAbility } from '../config/damageTypes.js';
import { generateDamageDice, rollDice, getAverageDamage } from '../utils/dice.js';
import { getHitDice, calculateHpDnd, getDieAverage } from '../config/hitDice.js';
import { supabase, invokeFunction } from './supabase.js';
import { saveGenerationProgress, loadGenerationProgress, clearGenerationProgress } from '../utils/generationStore.js';
import { saveProgress, loadProgress, deleteProgress } from '../utils/indexedDB.js';
import { resolveNpcRace } from '../utils/npcRaceResolver.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ===================== NPC STATS CALCULATION =====================

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
export function calculateNPCCombatStats(stats = {}, race = 'Человек', tier = 1, level = 1) {
  const safeStats = {
    STR: Number.isFinite(Number(stats.STR)) ? Math.round(Number(stats.STR)) : 10,
    DEX: Number.isFinite(Number(stats.DEX)) ? Math.round(Number(stats.DEX)) : 10,
    CON: Number.isFinite(Number(stats.CON)) ? Math.round(Number(stats.CON)) : 10,
    INT: Number.isFinite(Number(stats.INT)) ? Math.round(Number(stats.INT)) : 10,
    WIS: Number.isFinite(Number(stats.WIS)) ? Math.round(Number(stats.WIS)) : 10,
    CHA: Number.isFinite(Number(stats.CHA)) ? Math.round(Number(stats.CHA)) : 10,
  };

  const dexMod = Math.floor((safeStats.DEX - 10) / 2);
  const raceBonus = getRaceAcBonus(race);
  
  // AC: 10 + DEX mod + race bonus (same as player)
  const armorClass = 10 + dexMod + raceBonus;
  
  // Initiative: DEX modifier
  const initiative = dexMod;
  
  // Saving throws: stat modifier + proficiency bonus (based on level)
  const proficiencyBonus = Math.ceil(level / 4) + 1;
  const savingThrows = {};
  for (const stat of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    const mod = Math.floor((safeStats[stat] - 10) / 2);
    savingThrows[stat] = mod + proficiencyBonus;
  }
  
  // Calculate stat sum for reference
  const stat_sum = Object.values(safeStats).reduce((a, b) => a + b, 0);
  
  return {
    level,
    armor_class: armorClass,
    initiative,
    saving_throws: savingThrows,
    stat_sum,
  };
}

/**
 * Calculate expected stat sum for a creature at given level/tier
 * Base 50 at level 1 tier 1, +2 per level, +10 per tier, max 200
 */
export function getExpectedStatSum(level = 1, tier = 1) {
  return Math.min(200, 50 + ((level - 1) * 2) + ((tier - 1) * 10));
}

/**
 * Calculate HP using D&D hit dice system
 * Level 1: max die + CON mod + 10
 * Each next: average die + CON mod
 */
export function calculateCreatureHp(con = 10, level = 1, tier = 1, hitDie = 8) {
  return calculateHpDnd(con, level, hitDie);
}

/**
 * Get special attacks count by tier (Tier 1 = 1, Tier 5 = 5)
 */
export function getSpecialAttacksCount(tier = 1) {
  return Math.max(1, Math.min(5, tier));
}

/**
 * Get base attacks count by level (2 per 10 levels)
 */
export function getBaseAttacksCount(level = 1) {
  return Math.max(2, Math.min(10, 2 + Math.floor((level - 1) / 10)));
}

/**
 * Очищает и нормализует атаку в формате D&D
 * @param {object} attack - сырые данные атаки
 * @param {boolean} isSpecial - спецатака (больше урона)
 * @param {number} tier - тир существа
 * @param {number} level - уровень существа
 * @returns {object} очищенная атака
 */
export function cleanAttack(attack = {}, isSpecial = false, tier = 1, level = 1) {
  // Валидация типа урона
  const damageTypeId = DAMAGE_TYPES[attack.damage_type] ? attack.damage_type : 'slashing';
  const damageType = DAMAGE_TYPES[damageTypeId];
  
  // Генерация кубиков урона если не указаны
  let damageDice = attack.damage_dice || attack.damage || generateDamageDice(level, tier, isSpecial);
  
  // Валидация формата кубиков
  if (!/^\d+d\d+([+-]\d+)?$/.test(damageDice)) {
    damageDice = generateDamageDice(level, tier, isSpecial);
  }
  
  // DoT параметры (только для типов урона поддерживающих DoT)
  const canDot = damageType.dot === true;
  const isDot = canDot && (attack.is_dot === true || attack.is_damage_over_time === true);
  
  return {
    name: (attack.name || (isSpecial ? 'Спецатака' : 'Атака')).slice(0, 50),
    description: (attack.description || attack.desc || '').slice(0, 200),
    damage_type: damageTypeId,
    damage_type_name: damageType.name,
    damage_dice: damageDice,
    damage_bonus: Number(attack.damage_bonus) || 0,
    is_special: isSpecial,
    // DoT (Damage Over Time)
    is_dot: isDot,
    dot_name: isDot ? (attack.dot_name || damageType.dotName || 'Урон') : null,
    dot_duration: isDot ? (Number(attack.dot_duration) || damageType.dotDefaultDuration || 2) : 0,
    dot_damage_dice: isDot ? (attack.dot_damage_dice || damageDice) : null,
    // Спасбросок
    half_on_save: damageType.halfOnSave,
    save_ability: damageType.saveAbility || null,
    // Дополнительно
    range: attack.range || (isSpecial ? '30 футов' : '5 футов'),
    effects: Array.isArray(attack.effects) ? attack.effects.slice(0, 3) : [],
  };
}

/**
 * Генерирует атаки для существа на основе его параметров
 * @param {number} tier - тир (количество спецатак)
 * @param {number} level - уровень (количество базовых атак)
 * @param {string} category - категория существа
 * @param {string} race - раса
 * @returns {object} { special_attacks, base_attacks }
 */
export function generateAttacksForCreature(tier, level, category = 'monster', race = 'Чудовище') {
  const specialCount = getSpecialAttacksCount(tier);
  const baseCount = getBaseAttacksCount(level);
  
  // Типы урона по умолчанию для категорий
  const defaultTypes = {
    beast: ['piercing', 'slashing'],
    monster: ['bludgeoning', 'piercing', 'slashing'],
    boss: ['fire', 'cold', 'lightning', 'necrotic', 'force'],
  };
  
  const availableTypes = defaultTypes[category] || defaultTypes.monster;
  
  const specialAttacks = [];
  const baseAttacks = [];
  
  // Генерация спецатак
  for (let i = 0; i < specialCount; i++) {
    const typeIdx = i % availableTypes.length;
    specialAttacks.push({
      name: `Спецатака ${i + 1}`,
      description: 'Мощная специальная атака',
      damage_type: availableTypes[typeIdx],
      damage_dice: generateDamageDice(level, tier, true),
      is_special: true,
      is_dot: DAMAGE_TYPES[availableTypes[typeIdx]]?.dot || false,
      dot_duration: DAMAGE_TYPES[availableTypes[typeIdx]]?.dotDefaultDuration || 2,
    });
  }
  
  // Генерация базовых атак
  for (let i = 0; i < baseCount; i++) {
    const typeIdx = i % availableTypes.length;
    baseAttacks.push({
      name: `Атака ${i + 1}`,
      description: 'Базовая атака',
      damage_type: availableTypes[typeIdx],
      damage_dice: generateDamageDice(level, tier, false),
      is_special: false,
    });
  }
  
  return { special_attacks: specialAttacks, base_attacks: baseAttacks };
}

// Get user settings (API key + models)
async function getUserSettings() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const { data } = await supabase
      .from('user_settings')
      .select('openrouter_key, card_model, dm_model')
      .eq('id', session.user.id)
      .maybeSingle();
    return data || {};
  }
  return {};
}

// Get API key from user settings or fallback
async function getApiKey() {
  const settings = await getUserSettings();
  return settings.openrouter_key || OPENROUTER_API_KEY;
}

// Get card generation model
async function getCardModel() {
  const settings = await getUserSettings();
  return settings.card_model || AI_MODEL;
}

// Call OpenRouter directly from frontend (no Edge Function limits)
export async function callOpenRouter(systemPrompt, userMessage, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Укажите OpenRouter API Key в настройках аккаунта');
  }

  // Use specified model or get from user settings
  const model = options.model || await getCardModel();
  
  // Determine provider based on model
  const getProvider = (modelId) => {
    if (modelId.includes('xiaomi')) return ['Xiaomi'];
    if (modelId.includes('z-ai')) return ['Z-AI'];
    if (modelId.includes('thinkingmachines')) return ['Thinking Machines'];
    if (modelId.includes('minimax')) return ['MiniMax'];
    if (modelId.includes('meta-llama')) return ['Meta'];
    if (modelId === 'openrouter/free') return []; // Auto-select
    return ['Xiaomi']; // default
  };

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: options.temperature ?? 0.7,
    provider: {
      order: getProvider(model),
      allow_fallbacks: options.allow_fallbacks ?? false,
    },
    reasoning: {
      effort: options.reasoningEffort || 'low',
    },
  };

  console.log('[callOpenRouter] Request:', {
    model: requestBody.model,
    provider: requestBody.provider,
    reasoning: requestBody.reasoning,
    userMsgLength: userMessage.length,
  });

  console.log('[callOpenRouter] Request:', {
    model: requestBody.model,
    provider: requestBody.provider,
    reasoning: requestBody.reasoning,
    userMsgLength: userMessage.length,
    systemMsgLength: systemPrompt.length,
  });

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MultiRP-AI',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[callOpenRouter] Response:', {
    provider: data.provider,
    model: data.model,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
    totalTokens: data.usage?.total_tokens,
    contentLength: data.choices?.[0]?.message?.content?.length,
  });
  return data.choices?.[0]?.message?.content || '';
}

// Count NPCs in text
export async function countNPCs(loreText) {
  const SYSTEM_PROMPT = `Подсчитай сколько NPC, существ, монстров и животных упоминается в тексте.
Ответь ТОЛЬКО одним числом (например: 22). Никакого текста, только число.`;

  const response = await callOpenRouter(SYSTEM_PROMPT, loreText);
  console.log('[countNPCs] Raw response:', response);
  const match = response.match(/\d+/);
  const count = match ? parseInt(match[0], 10) : 0;
  console.log('[countNPCs] Parsed count:', count);
  return count;
}

// Generate world geography (states and cities)
export async function generateWorldGeography(loreText, worldId, onProgress = () => {}) {
  console.log('[generateWorldGeography] Starting, loreText length:', loreText.length);
  
  const SYSTEM_PROMPT = `На основе описания мира создай географию: государства и города.
Правила:
- Если в тексте уже упоминаются государства/королевства/регионы — используй ВСЕ их (сколько бы их ни было)
- Если в тексте нет упоминаний государств — создай 3 новых государства
- Для каждого государства создай минимум 6 локаций: 1 столица (type: capital) + 5 городов/деревень/руин/достопримечательностей (type: city, village, ruins, landmark)
- Названия должны быть уникальными и соответствовать сеттингу мира
- Описания краткие, но атмосферные (1-2 предложения)
- ВСЕ названия и описания должны быть на русском языке

Верни ТОЛЬКО JSON объект:
{
  "states": [{"name": "Название государства", "description": "Описание"}],
  "locations": [{"name": "Название локации", "type": "capital|city|village|ruins|landmark", "state_name": "Название государства", "description": "Описание"}]
}`;

  onProgress({ step: 'geography_start', message: 'Генерация государств и городов...' });
  
  const response = await callOpenRouter(SYSTEM_PROMPT, loreText);
  
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      const objMatch = response.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        throw new Error('Не удалось распарсить ответ географии');
      }
    }
  }
  
  if (!parsed.states || !parsed.locations) {
    throw new Error('Некорректный формат ответа географии');
  }
  
  console.log('[generateWorldGeography] Generated:', parsed.states.length, 'states,', parsed.locations.length, 'locations');
  onProgress({ step: 'geography_done', states: parsed.states.length, locations: parsed.locations.length });
  
  return parsed;
}

// Save geography to DB
export async function saveWorldGeography(worldId, geography) {
  console.log('[saveWorldGeography] Saving geography for world:', worldId);
  
  
  // Insert states
  const statesToInsert = geography.states.map(s => ({
    world_id: worldId,
    name: s.name,
    description: s.description || '',
  }));
  
  const { data: insertedStates, error: statesError } = await supabase
    .from('states')
    .insert(statesToInsert)
    .select();
  
  if (statesError) {
    console.error('[saveWorldGeography] States error:', statesError);
    throw statesError;
  }
  
  console.log('[saveWorldGeography] Saved', insertedStates.length, 'states');
  
  // Create state name -> id mapping
  const stateMap = {};
  insertedStates.forEach(s => {
    stateMap[s.name] = s.id;
  });
  
  // Insert locations
  const locationsToInsert = geography.locations.map(l => ({
    state_id: stateMap[l.state_name] || insertedStates[0]?.id,
    name: l.name,
    type: l.type || 'city',
    description: l.description || '',
  }));
  
  const { data: insertedLocations, error: locationsError } = await supabase
    .from('locations')
    .insert(locationsToInsert)
    .select();
  
  if (locationsError) {
    console.error('[saveWorldGeography] Locations error:', locationsError);
    throw locationsError;
  }
  
  console.log('[saveWorldGeography] Saved', insertedLocations.length, 'locations');
  
  return { states: insertedStates, locations: insertedLocations };
}

// Generate a batch of NPCs with geography context
export async function generateNPCBatch(loreText, startIdx, endIdx, totalCount, existingNames = [], geography = null) {
  const geographyContext = geography ? `
Доступные государства и локации мира:
${geography.states.map(s => `- ${s.name}: ${geography.locations.filter(l => l.state_name === s.name).map(l => l.name).join(', ')}`).join('\n')}

Для каждого NPC определи:
1. category: 'npc' (разумное существо), 'beast' (зверь), 'monster' (монстр), или 'boss' (босс)
2. location_name: название локации (только для category='npc')
3. state_name: название государства (для всех категорий)

Для зверей, монстров и боссов указывай только state_name (не location_name).
Для разумных NPC указывай и location_name, и state_name.` : '';

  const SYSTEM_PROMPT = `Извлеки из текста указанных NPC и сгенерируй для них характеристики.

## СИСТЕМА ПОТЕНЦИАЛА И УРОВНЯ
TIER (1-5) = ПОТЕНЦИАЛ существа (максимальные возможности):
- Tier 1: Слабые существа (крысы, слизни, гоблины)
- Tier 2: Обычные существа (волки, орки, тролли)
- Tier 3: Сильные существа (огры, демоны, молодые драконы)
- Tier 4: Элитные существа (древние драконы, вампиры, лорды)
- Tier 5: Легендарные существа (божества, титаны, древнейшие драконы)

LEVEL (1-100) = ТЕКУЩАЯ СИЛА (насколько раскрыт потенциал):
- Детеныш дракона: Tier 5, но Level 1 (слаб, но имеет потенциал)
- Взрослый дракон: Tier 5, Level 80 (могуществен)
- Существо может быть любого уровня в пределах своего Tier

## ДИАПАЗОНЫ УРОВНЕЙ ПО ВИДАМ
Примеры для шаблонов:
- Слизь: 1-10 ур
- Волк: 5-15 ур
- Орк: 10-25 ур
- Тролль: 15-35 ур
- Дракон: 50-100 ур
- Демон: 30-80 ур

## ХАРАКТЕРИСТИКИ
Сумма статов (STR+DEX+CON+INT+WIS+CHA):
- Уровень 1, Tier 1: ~50 (слабее игрока)
- Уровень 100, Tier 5: ~200 (значительно сильнее игрока)
- Игрок начинает с 72

Спецатаки: 1 на каждый Tier (Tier 1 = 1 спецатака, Tier 5 = 5 спецатак)
Базовые атаки: 2-3 на каждые 10 уровней (level 1-10 = 2, level 11-20 = 3, и т.д.)

## КОСТЬ ХИТОВ (HIT DICE) — D&D система
Определяет HP: Уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
- d6 (4 среднее): волшебник, чародей, маг
- d8 (5 среднее): бард, жрец, друид, монах, плут, шаман
- d10 (6 среднее): воин, паладин, следопыт, наемник, рыцарь
- d12 (7 среднее): варвар, берсерк
Для зверей/монстров: d8 по умолчанию, d10 для боссов

## ДИАПАЗОН УРОВНЕЙ (для неуникальных существ)
Если существо НЕ уникально (is_unique: false), укажи диапазон уровней:
- level_min: минимальный уровень при спавне
- level_max: максимальный уровень при спавне
- level: конкретный уровень (для уникальных) или среднее значение

Примеры:
- Слизь: 1-10 ур
- Волк: 5-15 ур
- Орк: 10-25 ур
- Тролль: 15-35 ур
- Дракон: 50-100 ур

При спавне в игре уровень выбирается случайно из диапазона [level_min, level_max].

## ТИПЫ ПЕРСОНАЖЕЙ (ROLE)
- 'main' — главные персонажи (протагонисты, антагонисты, ключевые фигуры)
- 'secondary' — второстепенные (спутники, торговцы, стражники)
- 'tertiary' — третьестепенные (звери, монстры, рядовые враги)

## КАТЕГОРИИ
- 'npc' — разумные существа (люди, эльфы, гномы, орки), role: main/secondary
- 'beast' — животные/звери (волки, медведи, драконы), role: tertiary
- 'monster' — монстры (гоблины, тролли, скелеты), role: tertiary
- 'boss' — могущественные (короли демонов, древние драконы), role: main/secondary

## ПРАВИЛА ИМЕНОВАНИЯ
ГЛАВНОЕ ПРАВИЛО: Зверям и монстрам имя НЕ ДАВАТЬ!
- Только название вида: "Волк", "Гоблин", "Дракон", "Скелет"
- Имя даётся ТОЛЬКО: NPC-людям/эльфам/гномам (всегда) и уникальным боссам (is_unique: true)
- Стаям (is_pack: true) имя не дают — это группа существ

## АТАКИ (D&D система)
У каждой атаки есть:
- name: название атаки
- description: описание для ДМ
- damage_type: тип урона (slashing/piercing/bludgeoning/fire/cold/lightning/thunder/acid/poison/necrotic/radiant/psychic/force)
- damage_dice: кубики урона (1d6, 2d8+3, 3d4, etc.)
- is_dot: true если урон каждый ход (fire/acid/poison)
- dot_duration: длительность в ходах (2-5)
- half_on_save: можно спастись наполовину
- save_ability: способность спасброска (DEX/CON/WIS)

Спецатаки (special_attacks): 1 на каждый Tier (Tier 5 = 5 спецатак)
Базовые атаки (base_attacks): 2 на уровни 1-10, +1 за каждые 10 уровней

Типы урона:
- slashing (режущий), piercing (колющий), bludgeoning (дробящий) — физические
- fire (огонь) — DoT 2-3 хода
- cold (холод) — замедление
- lightning (молния) — DEX спасбросок
- acid (кислота) — DoT 2 хода
- poison (яд) — DoT 3 хода, CON спасбросок
- necrotic (некроз) — вампиризм
- radiant (свет) — силён против нежити
- psychic (психический) — WIS спасбросок
- force (силовой) — игнорирует броню

${geographyContext}

ВАЖНО: ВСЕ тексты (имя/вид, раса, описание внешности, предыстория, привычки, фразы) на русском языке!

Верни ТОЛЬКО JSON массив: [{name: 'Имя или вид', class: 'Класс (воин/маг/жрец/etc)', role: 'main'|'secondary'|'tertiary', race: 'Раса', category: 'npc'|'beast'|'monster'|'boss', appearance: 'Описание внешности', background: 'Предыстория', habits: ['привычка'], catchphrases: ['фраза'], location_name: 'Город или пусто', state_name: 'Государство', tier: INT (1-5), level: INT (1-100), level_min: INT, level_max: INT, hit_dice: INT (6|8|10|12), stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, special_attacks: [{name: 'Название', description: 'Описание для ДМ', damage_type: 'fire|poison|slashing|etc', damage_dice: '1d6', is_dot: BOOLEAN, dot_duration: INT}], base_attacks: [{name: 'Название', description: 'Описание', damage_type: 'slashing|piercing|etc', damage_dice: '1d6'}], is_pack: BOOLEAN, is_unique: BOOLEAN}]`;
// Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) рассчитываются автоматически
// level_min/level_max: для неуникальных существ — диапазон уровней при спавне

  const existingNpcsText = existingNames.length > 0
    ? `\n\nУже сгенерированные NPC (НЕ ДУБЛИРОВАТЬ): ${existingNames.join(', ')}`
    : '';

  const userMessage = `${loreText}${existingNpcsText}\n\nСгенерируй NPC с ${startIdx} по ${endIdx} (всего ${totalCount}). Только этих, без дубликатов.`;

  const response = await callOpenRouter(SYSTEM_PROMPT, userMessage);
  
  // Parse JSON from response
  try {
    // Try direct parse
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // Try to find array
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
    return [];
  }
}

// Generate all NPCs in batches and save to DB after each batch
export async function generateAllNPCs(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  console.log('[generateAllNPCs] Starting, loreText length:', loreText.length, 'worldId:', worldId);
  
  // Create location/state maps from geography
  const locationMap = {};
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
    geography.locations.forEach(l => {
      locationMap[l.name] = l.id;
      // Also map by state for fallback
      if (!stateMap[l.state_name] && l.state_id) {
        stateMap[l.state_name] = l.state_id;
      }
    });
  }
  
  // Helper to clean and save NPCs
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    
    const cleanedNpcs = npcs.map(npc => {
      const category = ['npc', 'beast', 'monster', 'boss'].includes(npc.category) ? npc.category : 'npc';
      // Only intelligent NPCs get a location
      const location_id = (category === 'npc' && npc.location_name) ? (locationMap[npc.location_name] || null) : null;
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      
      // Determine role: beasts/monsters are tertiary by default
      let role = npc.role;
      if (category === 'beast' || category === 'monster') {
        role = 'tertiary';
      } else if (role !== 'main' && role !== 'secondary') {
        role = 'secondary';
      }
      
      // Calculate combat stats with level
      const tier = Number(npc.tier) || 1;
      const level = Number(npc.level) || Math.max(1, Math.min(100, tier * 10 + Math.floor(Math.random() * 20)));
      const combatStats = calculateNPCCombatStats(npc.stats, npc.race, tier, level);
      
      // Clean special_attacks and base_attacks
      const specialAttacks = Array.isArray(npc.special_attacks) 
        ? npc.special_attacks.slice(0, getSpecialAttacksCount(tier)).map(a => cleanAttack(a, true, tier, level))
        : [];
      const baseAttacks = Array.isArray(npc.base_attacks)
        ? npc.base_attacks.slice(0, getBaseAttacksCount(level)).map(a => cleanAttack(a, false, tier, level))
        : [];
      
      // Если атаки не сгенерированы ИИ — генерируем автоматически
      if (specialAttacks.length === 0 && baseAttacks.length === 0) {
        const generated = generateAttacksForCreature(tier, level, category, npc.race);
        specialAttacks.push(...generated.special_attacks);
        baseAttacks.push(...generated.base_attacks);
      }
      
      // Calculate hit dice based on class (if provided)
      const hitDie = npc.hit_dice || getHitDice(npc.class) || 8;
      
      // Validate level range
      const levelMin = Math.max(1, Math.min(100, Number(npc.level_min) || level));
      const levelMax = Math.max(levelMin, Math.min(100, Number(npc.level_max) || level));
      
      return {
        world_id: worldId,
        role,
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: resolveNpcRace(npc).slice(0, 50),
        category,
        class: (npc.class || '').slice(0, 50),
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10).map(String) : [],
        catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10).map(String) : [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        max_hp: Number(npc.max_hp) || Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        location_id,
        state_id,
        // Combat stats
        level,
        armor_class: combatStats.armor_class,
        initiative: combatStats.initiative,
        saving_throws: combatStats.saving_throws,
        hit_dice: hitDie,
        // Tier & level range
        tier,
        level_min: levelMin,
        level_max: levelMax,
        // Attacks
        special_attacks: specialAttacks,
        base_attacks: baseAttacks,
        // Pack/unique flags
        is_pack_instance: npc.is_pack === true,
        pack_size: npc.is_pack ? (npc.pack_size || 2 + Math.floor(Math.random() * 5)) : 1,
        is_unique: npc.is_unique === true,
      };
    });

    console.log(`[saveNPCs] Saving ${cleanedNpcs.length} NPCs to DB...`);
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      console.log(`[saveNPCs] Saved ${result.count} NPCs`);
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Step 1: Count NPCs
  onProgress({ step: 'counting', message: 'Подсчёт NPC в тексте...' });
  let totalCount = await countNPCs(loreText);
  console.log('[generateAllNPCs] Count result:', totalCount);
  
  if (totalCount === 0) {
    totalCount = 10;
    console.log('[generateAllNPCs] Using fallback count:', totalCount);
  }
  onProgress({ step: 'counting', total: totalCount, message: `Найдено ${totalCount} NPC` });

  // Step 2: Generate in batches and save after each
  const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
  const allNpcs = [];
  const generatedNames = new Set();
  let totalSaved = 0;

  console.log('[generateAllNPCs] Will generate in', totalBatches, 'batches');

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, totalCount);
    
    console.log(`[generateAllNPCs] Batch ${batchNum + 1}/${totalBatches}: NPCs ${startIdx}-${endIdx}`);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: totalCount,
      message: `Генерация NPC ${startIdx}-${endIdx} из ${totalCount}...`,
    });

    try {
      const batchNpcs = await generateNPCBatch(
        loreText,
        startIdx,
        endIdx,
        totalCount,
        Array.from(generatedNames),
        geography
      );

      console.log(`[generateAllNPCs] Batch ${batchNum + 1} result:`, Array.isArray(batchNpcs) ? batchNpcs.length : 'not array', 'NPCs');

      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        // Add to local list for deduplication tracking
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }

        // Save this batch to DB immediately
        if (newNpcs.length > 0) {
          onProgress({
            step: 'saving',
            message: `Сохранение ${newNpcs.length} NPC в БД...`,
          });
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          console.log(`[generateAllNPCs] Total saved so far: ${totalSaved}`);
        }

        // If model returned more NPCs than expected (generated all at once), adjust
        if (batchNpcs.length >= totalCount) {
          console.log('[generateAllNPCs] Model returned all NPCs at once, stopping batches');
          break;
        }
      }
    } catch (batchErr) {
      console.error(`[generateAllNPCs] Batch ${batchNum + 1} failed:`, batchErr);
      // Continue with what we have
      if (allNpcs.length > 0) {
        break;
      }
      throw batchErr;
    }
  }

  console.log('[generateAllNPCs] Done. Total unique NPCs:', allNpcs.length, 'saved to DB:', totalSaved);
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Сгенерировано ${allNpcs.length}, сохранено ${totalSaved} NPC` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Generate intelligent NPCs (category: npc) with progress saving
export async function generateIntelligentNPCs(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 5;
  const STORAGE_KEY = `intelligent_npcs`;
  
  console.log('[generateIntelligentNPCs] Starting');
  
  // Load saved progress
  const progress = loadGenerationProgress(worldId) || {};
  const savedIntelligent = progress[STORAGE_KEY] || { generatedNames: [], totalSaved: 0, completed: false };
  
  if (savedIntelligent.completed) {
    console.log('[generateIntelligentNPCs] Already completed');
    onProgress({ step: 'done', message: 'Уже сгенерировано ранее', saved: savedIntelligent.totalSaved });
    return { npcs: [], saved: savedIntelligent.totalSaved, alreadyCompleted: true };
  }
  
  const generatedNames = new Set(savedIntelligent.generatedNames || []);
  let totalSaved = savedIntelligent.totalSaved || 0;
  
  // Count intelligent NPCs
  onProgress({ step: 'counting', message: 'Подсчёт разумных NPC...' });
  const totalCount = await countNPCs(loreText);
  const intelligentCount = Math.ceil(totalCount * 0.6); // ~60% are intelligent
  
  onProgress({ step: 'counting', total: intelligentCount, message: `Найдено ${intelligentCount} разумных NPC` });
  
  // Create location/state maps
  const locationMap = {};
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
    geography.locations.forEach(l => {
      locationMap[l.name] = l.id;
      if (!stateMap[l.state_name] && l.state_id) {
        stateMap[l.state_name] = l.state_id;
      }
    });
  }
  
  // Save helper
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    const cleanedNpcs = npcs.map(npc => {
      const location_id = npc.location_name ? (locationMap[npc.location_name] || null) : null;
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      const tier = Number(npc.tier) || 1;
      const level = Number(npc.level) || Math.max(1, Math.min(100, tier * 10 + Math.floor(Math.random() * 20)));
      const combatStats = calculateNPCCombatStats(npc.stats, npc.race, tier, level);
      
      // Clean special_attacks and base_attacks
      const specialAttacks = Array.isArray(npc.special_attacks) 
        ? npc.special_attacks.slice(0, getSpecialAttacksCount(tier)).map(a => cleanAttack(a, true, tier, level))
        : [];
      const baseAttacks = Array.isArray(npc.base_attacks)
        ? npc.base_attacks.slice(0, getBaseAttacksCount(level)).map(a => cleanAttack(a, false, tier, level))
        : [];
      
      // Если атаки не сгенерированы ИИ — генерируем автоматически
      if (specialAttacks.length === 0 && baseAttacks.length === 0) {
        const generated = generateAttacksForCreature(tier, level, 'npc', npc.race);
        specialAttacks.push(...generated.special_attacks);
        baseAttacks.push(...generated.base_attacks);
      }
      
      // Calculate hit dice based on class
      const hitDie = npc.hit_dice || getHitDice(npc.class) || 8;
      
      // Validate level range
      const levelMin = Math.max(1, Math.min(100, Number(npc.level_min) || level));
      const levelMax = Math.max(levelMin, Math.min(100, Number(npc.level_max) || level));
      
      return {
        world_id: worldId,
        role: npc.role === 'main' ? 'main' : 'secondary',
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: resolveNpcRace(npc).slice(0, 50),
        category: 'npc',
        class: (npc.class || '').slice(0, 50),
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: Array.isArray(npc.habits) ? npc.habits.slice(0, 10).map(String) : [],
        catchphrases: Array.isArray(npc.catchphrases) ? npc.catchphrases.slice(0, 10).map(String) : [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        max_hp: Number(npc.max_hp) || Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        location_id,
        state_id,
        // Combat stats
        level,
        armor_class: combatStats.armor_class,
        initiative: combatStats.initiative,
        saving_throws: combatStats.saving_throws,
        hit_dice: hitDie,
        // Tier & level range
        tier,
        level_min: levelMin,
        level_max: levelMax,
        // Attacks
        special_attacks: specialAttacks,
        base_attacks: baseAttacks,
        // Pack/unique flags
        is_pack_instance: false,
        pack_size: 1,
        is_unique: npc.is_unique === true,
      };
    });
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Generate in batches
  const totalBatches = Math.ceil(intelligentCount / BATCH_SIZE);
  const allNpcs = [];
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, intelligentCount);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: intelligentCount,
      message: `Генерация разумных NPC ${startIdx}-${endIdx} из ${intelligentCount}...`,
    });
    
    try {
      const batchNpcs = await generateNPCBatch(
        loreText, startIdx, endIdx, intelligentCount,
        Array.from(generatedNames), geography
      );
      
      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            // Force category to 'npc' for intelligent batch
            npc.category = 'npc';
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }
        
        if (newNpcs.length > 0) {
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          
          // Save progress after each batch (localStorage + IndexedDB)
          const progressData = {
            [STORAGE_KEY]: {
              generatedNames: Array.from(generatedNames),
              totalSaved,
              completed: false,
            }
          };
          saveGenerationProgress(worldId, progressData);
          await saveProgress(worldId, { type: 'intelligent', ...progressData[STORAGE_KEY] });
        }
        
        if (batchNpcs.length >= intelligentCount) break;
      }
    } catch (batchErr) {
      console.error(`[generateIntelligentNPCs] Batch ${batchNum + 1} failed:`, batchErr);
      // Save progress before throwing
      const progressData = {
        [STORAGE_KEY]: {
          generatedNames: Array.from(generatedNames),
          totalSaved,
          completed: false,
        }
      };
      saveGenerationProgress(worldId, progressData);
      await saveProgress(worldId, { type: 'intelligent', ...progressData[STORAGE_KEY] });
      if (allNpcs.length > 0) break;
      throw batchErr;
    }
  }
  
  // Mark as completed
  const finalData = {
    [STORAGE_KEY]: {
      generatedNames: Array.from(generatedNames),
      totalSaved,
      completed: true,
    }
  };
  saveGenerationProgress(worldId, finalData);
  await saveProgress(worldId, { type: 'intelligent', ...finalData[STORAGE_KEY] });
  
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Разумные NPC сгенерировано: ${allNpcs.length}` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Generate non-intelligent creatures (beast, monster, boss) with progress saving
export async function generateCreatures(loreText, worldId, geography = null, onProgress = () => {}) {
  const BATCH_SIZE = 3;
  const STORAGE_KEY = `creatures`;
  
  console.log('[generateCreatures] Starting');
  
  // Load saved progress
  const progress = loadGenerationProgress(worldId) || {};
  const savedCreatures = progress[STORAGE_KEY] || { generatedNames: [], totalSaved: 0, completed: false };
  
  if (savedCreatures.completed) {
    console.log('[generateCreatures] Already completed');
    onProgress({ step: 'done', message: 'Уже сгенерировано ранее', saved: savedCreatures.totalSaved });
    return { npcs: [], saved: savedCreatures.totalSaved, alreadyCompleted: true };
  }
  
  const generatedNames = new Set(savedCreatures.generatedNames || []);
  let totalSaved = savedCreatures.totalSaved || 0;
  
  // Count creatures
  onProgress({ step: 'counting', message: 'Подсчёт существ...' });
  const totalCount = await countNPCs(loreText);
  const creatureCount = Math.ceil(totalCount * 0.4); // ~40% are creatures
  
  onProgress({ step: 'counting', total: creatureCount, message: `Найдено ${creatureCount} существ` });
  
  // Create state map
  const stateMap = {};
  if (geography) {
    geography.states.forEach(s => stateMap[s.name] = s.id);
  }
  
  // Creature generation prompt
  const creaturePrompt = `На основе описания мира создай существ (звери, монстры, боссы).

## СИСТЕМА ПОТЕНЦИАЛА И УРОВНЯ
TIER (1-5) = ПОТЕНЦИАЛ существа (максимальные возможности, количество спецатак):
- Tier 1: Слабые существа — крысы, слизни, гоблины (1 спецатака)
- Tier 2: Обычные существа — волки, орки, тролли (2 спецатаки)
- Tier 3: Сильные существа — огры, демоны, молодые драконы (3 спецатаки)
- Tier 4: Элитные существа — древние драконы, вампиры, лорды (4 спецатаки)
- Tier 5: Легендарные существа — божества, титаны, древнейшие драконы (5 спецатак)

LEVEL (1-100) = ТЕКУЩАЯ СИЛА (насколько раскрыт потенциал):
- Детеныш дракона: Tier 5, Level 1 (слаб, но имеет потенциал и 5 спецатак)
- Взрослый дракон: Tier 5, Level 80 (могуществен)

## ДИАПАЗОНЫ УРОВНЕЙ ПО ВИДАМ (ВАЖНО!)
Каждый вид имеет свой диапазон уровней:
- Слизь: 1-10 ур
- Крыса: 1-5 ур
- Волк: 5-15 ур
- Медведь: 10-25 ур
- Орк: 10-25 ур
- Гоблин: 1-15 ур
- Тролль: 15-35 ур
- Огр: 20-40 ур
- Демон: 30-80 ур
- Дракон: 50-100 ур
- Вампир: 25-60 ур
- Скелет: 1-10 ур
- Зомби: 1-8 ур
- Паук: 3-20 ур

## ХАРАКТЕРИСТИКИ
Спецатаки: 1 на каждый Tier (Tier 1 = 1, Tier 5 = 5)
Базовые атаки: 2 на уровни 1-10, +1 за каждые 10 уровней

## КОСТЬ ХИТОВ (HIT DICE)
HP: Уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
- d8 (5 среднее): звери, монстры (по умолчанию)
- d10 (6 среднее): боссы, сильные существа

## КАТЕГОРИИ
- 'beast' — животные/звери (волки, медведи, драконы, крысы)
- 'monster' — монстры (гоблины, тролли, скелеты, демоны)
- 'boss' — могущественные (короли демонов, древние драконы)

## ПРАВИЛА ИМЕНОВАНИЯ
ГЛАВНОЕ ПРАВИЛО: Зверям и монстрам имя НЕ ДАВАТЬ!
- Только название вида: "Волк", "Гоблин", "Дракон", "Скелет"
- Имя даётся ТОЛЬКО уникальным боссам (is_unique: true)
- Стаям (is_pack: true) имя не дают — это группа существ

## СТАИ И УНИКАЛЬНОСТЬ
- is_pack: true — существо ходит стаей (2-10 особей), например волки, гоблины
- is_pack: false, is_unique: false — одиночное существо
- is_unique: true — единственный экземпляр (получает имя!), например "Дракон Пепла"

## АТАКИ (D&D система)
У каждой атаки есть:
- name: название атаки
- description: описание для ДМ
- damage_type: тип урона (slashing/piercing/bludgeoning/fire/cold/lightning/thunder/acid/poison/necrotic/radiant/psychic/force)
- damage_dice: кубики урона (1d6, 2d8+3, 3d4, etc.)
- is_dot: true если урон каждый ход (fire/acid/poison)
- dot_duration: длительность в ходах (2-5)

Типы урона:
- slashing (режущий), piercing (колющий), bludgeoning (дробящий) — физические
- fire (огонь) — DoT 2-3 хода, DEX спасбросок
- cold (холод) — CON спасбросок
- lightning (молния) — DEX спасбросок
- acid (кислота) — DoT 2 хода, DEX спасбросок
- poison (яд) — DoT 3 хода, CON спасбросок
- necrotic (некроз) — вампиризм
- radiant (свет) — силён против нежити
- psychic (психический) — WIS спасбросок
- force (силовой) — игнорирует броню

${geography ? `Доступные государства:\n${geography.states.map(s => `- ${s.name}`).join('\n')}` : ''}

ВАЖНО: ВСЕ тексты (вид, раса, описание внешности, предыстория) на русском языке!

Верни ТОЛЬКО JSON массив: [{name: 'Название вида', race: 'Раса', category: 'beast'|'monster'|'boss', appearance: 'Описание внешности', background: 'Предыстория', state_name: 'Государство', tier: INT (1-5), level: INT (1-100), level_min: INT, level_max: INT, hit_dice: INT (8|10), stats: {STR: INT, DEX: INT, CON: INT, INT: INT, WIS: INT, CHA: INT}, special_attacks: [{name: 'Название', description: 'Описание для ДМ', damage_type: 'fire|poison|slashing|etc', damage_dice: '1d6', is_dot: BOOLEAN, dot_duration: INT}], base_attacks: [{name: 'Название', description: 'Описание', damage_type: 'slashing|piercing|etc', damage_dice: '1d6'}], is_pack: BOOLEAN, is_unique: BOOLEAN}]`;
// Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) рассчитываются автоматически
// level_min/level_max: для неуникальных существ — диапазон уровней при спавне
  
  // Save helper
  const saveNPCs = async (npcs) => {
    if (!npcs || npcs.length === 0) return 0;
    const cleanedNpcs = npcs.map(npc => {
      const state_id = npc.state_name ? (stateMap[npc.state_name] || null) : null;
      const category = ['beast', 'monster', 'boss'].includes(npc.category) ? npc.category : 'monster';
      const tier = Number(npc.tier) || 1;
      const level = Number(npc.level) || Math.max(1, Math.min(100, tier * 10));
      const combatStats = calculateNPCCombatStats(npc.stats, npc.race, tier, level);
      
      // Clean special_attacks and base_attacks
      const specialAttacks = Array.isArray(npc.special_attacks) 
        ? npc.special_attacks.slice(0, getSpecialAttacksCount(tier)).map(a => cleanAttack(a, true, tier, level))
        : [];
      const baseAttacks = Array.isArray(npc.base_attacks)
        ? npc.base_attacks.slice(0, getBaseAttacksCount(level)).map(a => cleanAttack(a, false, tier, level))
        : [];
      
      // Если атаки не сгенерированы ИИ — генерируем автоматически
      if (specialAttacks.length === 0 && baseAttacks.length === 0) {
        const generated = generateAttacksForCreature(tier, level, category, npc.race);
        specialAttacks.push(...generated.special_attacks);
        baseAttacks.push(...generated.base_attacks);
      }
      
      // Creatures use d8 by default (or d10 for bosses)
      const hitDie = npc.hit_dice || (category === 'boss' ? 10 : 8);
      
      // Validate level range
      const levelMin = Math.max(1, Math.min(100, Number(npc.level_min) || level));
      const levelMax = Math.max(levelMin, Math.min(100, Number(npc.level_max) || level));
      
      return {
        world_id: worldId,
        role: 'tertiary',
        name: (npc.name || 'Безымянный').slice(0, 100),
        race: resolveNpcRace(npc).slice(0, 50),
        category,
        class: (npc.class || '').slice(0, 50),
        appearance: (npc.appearance || '').slice(0, 500),
        background: (npc.background || '').slice(0, 1000),
        status_tags: Array.isArray(npc.status_tags) ? npc.status_tags.slice(0, 10).map(String) : [],
        habits: [],
        catchphrases: [],
        stats: npc.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        max_hp: Number(npc.max_hp) || Number(npc.hp) || calculateCreatureHp(Number(npc.stats?.CON) || 10, level, tier, hitDie),
        location_id: null, // Creatures don't have locations
        state_id,
        // Combat stats
        level,
        armor_class: combatStats.armor_class,
        initiative: combatStats.initiative,
        saving_throws: combatStats.saving_throws,
        hit_dice: hitDie,
        // Tier & level range
        tier,
        level_min: levelMin,
        level_max: levelMax,
        // Attacks
        special_attacks: specialAttacks,
        base_attacks: baseAttacks,
        // Pack/unique flags
        is_pack_instance: npc.is_pack === true,
        pack_size: npc.is_pack ? (npc.pack_size || 2 + Math.floor(Math.random() * 5)) : 1,
        is_unique: npc.is_unique === true,
      };
    });
    
    try {
      const result = await invokeFunction('generate-world-npcs', {
        world_id: worldId,
        npcs: cleanedNpcs,
      });
      return result.count || 0;
    } catch (err) {
      console.error('[saveNPCs] Failed:', err);
      throw err;
    }
  };
  
  // Generate in batches
  const totalBatches = Math.ceil(creatureCount / BATCH_SIZE);
  const allNpcs = [];
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const startIdx = batchNum * BATCH_SIZE + 1;
    const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, creatureCount);
    
    onProgress({
      step: 'generating',
      batch: batchNum + 1,
      totalBatches,
      current: endIdx,
      total: creatureCount,
      message: `Генерация существ ${startIdx}-${endIdx} из ${creatureCount}...`,
    });
    
    try {
      const userMessage = `${loreText}\n\nСгенерируй существ (звери, монстры, боссы) с ${startIdx} по ${endIdx} (всего ${creatureCount}). Только этих, без дубликатов. Уже сгенерированные: ${Array.from(generatedNames).join(', ')}`;
      
      const response = await callOpenRouter(creaturePrompt, userMessage);
      
      let batchNpcs;
      try {
        batchNpcs = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          batchNpcs = JSON.parse(jsonMatch[1]);
        } else {
          const arrayMatch = response.match(/\[[\s\S]*\]/);
          batchNpcs = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
        }
      }
      
      if (Array.isArray(batchNpcs) && batchNpcs.length > 0) {
        const newNpcs = [];
        for (const npc of batchNpcs) {
          const name = (npc.name || '').toLowerCase().trim();
          if (name && !generatedNames.has(name)) {
            generatedNames.add(name);
            allNpcs.push(npc);
            newNpcs.push(npc);
          }
        }
        
        if (newNpcs.length > 0) {
          const saved = await saveNPCs(newNpcs);
          totalSaved += saved;
          
          // Save progress after each batch (localStorage + IndexedDB)
          const progressData = {
            [STORAGE_KEY]: {
              generatedNames: Array.from(generatedNames),
              totalSaved,
              completed: false,
            }
          };
          saveGenerationProgress(worldId, progressData);
          await saveProgress(worldId, { type: 'creatures', ...progressData[STORAGE_KEY] });
        }
        
        if (batchNpcs.length >= creatureCount) break;
      }
    } catch (batchErr) {
      console.error(`[generateCreatures] Batch ${batchNum + 1} failed:`, batchErr);
      // Save progress before throwing
      const progressData = {
        [STORAGE_KEY]: {
          generatedNames: Array.from(generatedNames),
          totalSaved,
          completed: false,
        }
      };
      saveGenerationProgress(worldId, progressData);
      await saveProgress(worldId, { type: 'creatures', ...progressData[STORAGE_KEY] });
      if (allNpcs.length > 0) break;
      throw batchErr;
    }
  }
  
  // Mark as completed
  const finalData = {
    [STORAGE_KEY]: {
      generatedNames: Array.from(generatedNames),
      totalSaved,
      completed: true,
    }
  };
  saveGenerationProgress(worldId, finalData);
  await saveProgress(worldId, { type: 'creatures', ...finalData[STORAGE_KEY] });
  
  onProgress({ step: 'done', count: allNpcs.length, saved: totalSaved, message: `Существа сгенерированы: ${allNpcs.length}` });
  return { npcs: allNpcs, saved: totalSaved };
}

// Check if generation can be resumed (checks both localStorage and IndexedDB)
export async function canResumeGeneration(worldId) {
  const progress = loadGenerationProgress(worldId);
  if (!progress) {
    // Try IndexedDB
    const dbProgress = await loadProgress(worldId);
    if (dbProgress) {
      return {
        intelligent: dbProgress.type === 'intelligent' && !dbProgress.completed,
        creatures: dbProgress.type === 'creatures' && !dbProgress.completed,
      };
    }
    return { intelligent: false, creatures: false };
  }
  
  return {
    intelligent: progress.intelligent_npcs && !progress.intelligent_npcs.completed,
    creatures: progress.creatures && !progress.creatures.completed,
  };
}

// Clear all generation progress for a world
export async function clearWorldGenerationProgress(worldId) {
  clearGenerationProgress(worldId);
  await deleteProgress(worldId);
}
