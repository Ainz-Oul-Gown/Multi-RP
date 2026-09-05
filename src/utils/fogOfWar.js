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

import { getFogNarrative } from './fogNarratives.js';

// ============================================================
// КОНСТАНТЫ
// ============================================================

/**
 * Distance Tier — уровни расстояния между зонами
 * @readonly
 */
export const DISTANCE_TIER = {
  SAME_ROOM:  0, // ~0м    — в одной комнате/зоне
  CLOSE:      1, // ~10м   — рядом, сквозь стену
  NEARBY:     2, // ~50м   — соседняя зона/здание
  DISTRICT:   3, // ~200м  — другой квартал/часть леса
  FAR:        4, // ~1км   — другой конец города
  VERY_FAR:   5, // >1км   — другой город/регион
};

/**
 * Event Type → пороги слышимости и видимости
 * audioTier:  максимальный тир, до которого слышно
 * visualTier: максимальный тир, до которого видно
 */
export const EVENT_THRESHOLDS = {
  whisper:       { audioTier: 0, visualTier: 0 },
  speech:        { audioTier: 2, visualTier: 1 },
  shout:         { audioTier: 2, visualTier: 1 },
  combat_light:  { audioTier: 1, visualTier: 1 },
  combat_medium: { audioTier: 2, visualTier: 1 },
  combat_heavy:  { audioTier: 3, visualTier: 2 },
  magic_minor:   { audioTier: 1, visualTier: 2 },
  magic_major:   { audioTier: 3, visualTier: 3 },
  explosion:     { audioTier: 4, visualTier: 4 },
  cataclysm:     { audioTier: 5, visualTier: 5 },
};

/**
 * Кардинальные направления для дистантных описаний
 */
const DIRECTIONS = ['севере', 'юге', 'востоке', 'западе', 'северо-востоке', 'северо-западе', 'юго-востоке', 'юго-западе'];

// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПА СОБЫТИЯ
// ============================================================

/**
 * Эвристически определить тип события по тексту действия игрока.
 * Возвращает одну из строк EventType.
 *
 * @param {string} actionText
 * @returns {string} eventType
 */
export function detectEventType(actionText) {
  if (!actionText) return 'combat_medium';
  const t = actionText.toLowerCase();

  // Катастрофы
  if (/взрыв.{0,20}(здани|горы|вулкан|всё|всё|замк)|обвал горы|извержен|землетрясен/.test(t))
    return 'cataclysm';

  // Взрыв
  if (/взрыв|взрываю|взорвал|бомб|порох|пиротехник|взрыва|фугас/.test(t))
    return 'explosion';

  // Мощная магия
  if (/огненн.{0,10}(шар|луч|волн)|молни|гром|призыв.{0,15}(демон|дух|существ)|заклинан.{0,15}(мощн|силь|смертельн)|телекинез|левитац|стена.{0,10}(огн|льда|камн)/.test(t))
    return 'magic_major';

  // Малая магия
  if (/магич|заклинани|огонёк|искр|чары|руны|свет.{0,10}(магич|волшебн)|исцелени|зелье/.test(t))
    return 'magic_minor';

  // Тяжёлый бой
  if (/(разбиваю|разруша|обрушива|ломаю|сноса).{0,20}(стен|дверь|ворот|колонн|бочк)|обвал|таран|катапульт|взрыв.{0,10}бочк/.test(t))
    return 'combat_heavy';

  // Крик
  if (/\bкричу\b|\bкрикнул\b|\bвоскрицаю\b|\bзову\b|\bзакричал\b|"[^"]{0,80}"/.test(t))
    return 'shout';

  // Речь
  if (/говорю|спрашиваю|отвечаю|скажу|произношу|обращаюсь/.test(t))
    return 'speech';

  // Шёпот
  if (/шепчу|шёпотом|тихо|на ухо/.test(t))
    return 'whisper';

  // Средний бой (оружие, удары)
  if (/(атакую|бью|удар|рублю|колю|стреляю|бросаю|кидаю).{0,30}(мечом|топором|копьём|молотом|кинжалом|стрел|копь|ножом|кулак)/.test(t) ||
      /наношу удар|контратак|парирую|блокирую/.test(t))
    return 'combat_medium';

  // Лёгкий бой
  if (/атакую|бью|удар|пинаю|толкаю|дерусь/.test(t))
    return 'combat_light';

  // Дефолт — средний бой
  return 'combat_medium';
}

// ============================================================
// МАТРИЦА РАССТОЯНИЙ
// ============================================================

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
export function getDistanceTier(sourceZone, targetZone, locationMap = {}) {
  // Одна из зон не задана → оба в основной зоне локации
  if (!sourceZone || !targetZone) return DISTANCE_TIER.SAME_ROOM;
  // Одна и та же зона
  if (sourceZone === targetZone) return DISTANCE_TIER.SAME_ROOM;

  // Прямое соответствие в карте
  const direct = locationMap[sourceZone]?.[targetZone];
  if (direct !== undefined) return Number(direct);

  // Обратное соответствие
  const reverse = locationMap[targetZone]?.[sourceZone];
  if (reverse !== undefined) return Number(reverse);

  // Зоны заданы, но карты нет — считаем соседними
  return DISTANCE_TIER.CLOSE;
}

// ============================================================
// FOG MATRIX
// ============================================================

/**
 * Вычислить матрицу видимости для события.
 *
 * @param {object} params
 * @param {string} params.eventType        — тип события
 * @param {string|null} params.sourceZone  — зона игрока-инициатора
 * @param {Array} params.observers         — [{id, zone, name}] наблюдателей (другие игроки/NPC)
 * @param {object} params.locationMap      — карта расстояний
 * @param {string} [params.shoutContent]   — текст крика (для подстановки)
 * @param {string} [params.actorName]      — имя инициатора (для подстановки)
 * @returns {FogMatrix}
 */
export function calcFogMatrix({
  eventType = 'combat_medium',
  sourceZone = null,
  observers = [],
  locationMap = {},
  shoutContent = '',
  actorName = 'кто-то',
}) {
  const thresholds = EVENT_THRESHOLDS[eventType] || EVENT_THRESHOLDS.combat_medium;
  const results = {};

  for (const obs of observers) {
    const tier = getDistanceTier(sourceZone, obs.zone || null, locationMap);
    const hears  = tier <= thresholds.audioTier;
    const sees   = tier <= thresholds.visualTier;

    if (!hears && !sees) {
      // Наблюдатель ничего не воспринимает
      results[obs.id] = { tier, hears: false, sees: false, narrative: null };
      continue;
    }

    // Выбрать случайное направление (условно)
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const subs = { direction, content: shoutContent, actor: actorName };

    // Сначала пробуем аудио (более приоритетный канал)
    let narrative = null;
    if (hears) {
      narrative = getFogNarrative(eventType, tier, 'audio', subs);
    }
    // Если аудио не дало нарратива, пробуем визуальный
    if (!narrative && sees) {
      narrative = getFogNarrative(eventType, tier, 'visual', subs);
    }

    // Для same_room (tier 0) — наблюдатель видит всё, нарратив строит Мастер
    if (tier === DISTANCE_TIER.SAME_ROOM) {
      results[obs.id] = { tier, hears: true, sees: true, narrative: null, sameRoom: true };
      continue;
    }

    results[obs.id] = { tier, hears, sees, narrative };
  }

  return {
    eventType,
    sourceZone,
    thresholds,
    observers: results,
  };
}

// ============================================================
// УТИЛИТЫ
// ============================================================

/**
 * Проверить, нужно ли создавать fog-сообщение для наблюдателя.
 * Возвращает готовый текст или null если событие не воспринимается.
 *
 * @param {FogMatrix} fogMatrix
 * @param {string} observerId
 * @returns {string|null}
 */
export function getFogMessage(fogMatrix, observerId) {
  const entry = fogMatrix?.observers?.[observerId];
  if (!entry) return null;
  if (entry.sameRoom) return null;     // same_room — покрывается основным нарративом
  if (!entry.narrative) return null;   // ничего не услышал
  return entry.narrative;
}

/**
 * Извлечь текст прямой речи из действия для подстановки в {content}.
 * Ищет текст в кавычках «» или " ".
 *
 * @param {string} actionText
 * @returns {string}
 */
export function extractSpeechContent(actionText) {
  const match = actionText?.match(/[«"„]([^»"]{1,120})[»"]/);
  return match ? match[1] : '';
}

/**
 * Генерировать карту расстояний по умолчанию для простой локации.
 * Все игроки без зоны считаются в основной зоне (same_room).
 * Используется как fallback если ИИ ещё не сгенерировал location_map.
 *
 * @returns {object} пустая карта {}
 */
export function getDefaultLocationMap() {
  return {};
}
