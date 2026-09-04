// supabase/functions/process-turn/steps/_shared_prompts.ts
// Промпты для Сателит (Шаг 1) и GPS (Шаг 1.6), вынесенные из index.ts

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
}): string {
  const timeStr = `${params.currentDay}.${params.currentMonth}.${params.currentYear} ${params.currentHour}:${params.currentMinute.toString().padStart(2, '0')}`;
  const locationStr = params.currentLocation
    ? `${params.currentLocation}` + (params.currentState ? `, ${params.currentState}` : '')
    : 'неизвестно';

  return `Ты — анализатор намерений в текстовой RPG (Сателит). Твоя цель: перевести действие игрока в строгий JSON.

Текущее время в мире: ${timeStr}
Текущая локация: ${locationStr}

Доступные навыки (статы): STR, DEX, CON, INT, WIS, CHA.
Сложность (difficulty): от 5 до 25. По умолчанию 12 (средняя).

Ты НЕ решаешь, преуспел ли игрок. Ты лишь формируешь намерение.

Возможные intent_type:
- "skill_check" — проверка навыка (бросок кубика)
- "combat" — атака или защита в бою
- "use_item" — использование предмета
- "explore" — исследование, поиск
- "social" — разговор, убеждение
- "movement" — перемещение, побег
- "rest" — отдых, сон, лечение
- "free_form" — описание без проверки

ОБЯЗАТЕЛЬНО верни ТОЛЬКО валидный JSON без markdown-обёрток:

{
  "intent_type": "skill_check",
  "target": "описание цели",
  "required_check": { "skill": "DEX", "difficulty": 15 },
  "items_used": ["название предмета"],
  "damage_dealt": 0,
  "damage_received": 0,
  "description": "Краткое описание намерения",
  "wants_location_change": false,
  "location_change_description": ""
}

ВАЖНО:
- wants_location_change: true если игрок явно хочет переместиться
- location_change_description: описание куда именно
- Если действие не требует проверки — required_check может быть null
- Сложность: Лёгкое 5-8, Среднее 10-15, Сложное 16-20, Эпическое 21-25`;
}

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
}): string {
  const timeStr = `${params.currentDay}.${params.currentMonth}.${params.currentYear} ${params.currentHour}:${params.currentMinute.toString().padStart(2, '0')}`;
  const locationStr = params.currentWildZone
    ? `Дикая зона: ${params.currentWildZone}`
    : params.currentLocation
      ? `${params.currentLocation}` + (params.currentState ? `, ${params.currentState}` : '')
      : 'неизвестно';

  const locationsList = params.availableLocations?.length
    ? params.availableLocations.map(l => `- [ID:${l.id || 'null'}] ${l.name} (${l.type || ''}, ${l.state_name || ''})`).join('\n')
    : 'локации не найдены';

  return `Ты — система GPS в текстовой RPG. Определи сколько времени занимает действие и как изменится локация.

Текущее время: ${timeStr}
Текущая локация: ${locationStr}

Действие игрока: "${params.actionText}"
Тип намерения: ${params.intentType}
Описание: ${params.intentDescription}

${params.wantsLocationChange ? `Игрок хочет переместиться: ${params.locationChangeDescription}` : 'Игрок не меняет локацию'}

${params.wantsLocationChange ? `Именованные локации мира (города, деревни, поселения):\n${locationsList}` : ''}

Верни ТОЛЬКО валидный JSON без markdown:

{
  "time_minutes": 30,
  "new_location_id": null,
  "new_location_name": null,
  "is_wild_zone": false,
  "location_changed": false,
  "travel_description": ""
}

ПРАВИЛА ВРЕМЕНИ:
- Разговор/торговля: 5-15 минут
- Поиск/исследование: 15-60 минут
- Бой: 5-30 минут
- Отдых короткий: 15-30 минут
- Отдых долгий (сон): 6-10 часов (360-600 минут)
- Перемещение по локации: 10-30 минут
- Перемещение между локациями: 1-12 часов

ПРАВИЛА ЛОКАЦИИ:
- Если игрок остаётся там же: location_changed = false
- Если игрок переходит в именованную локацию из списка: location_changed = true, new_location_id = ID из списка, new_location_name = название, is_wild_zone = false
- Если игрок идёт в природное место (лес, поле, пещера, горы, берег реки, руины вне города): location_changed = true, new_location_id = null, new_location_name = краткое название места ("Лес у Ривервуда", "Горная тропа", "Прибрежные скалы"), is_wild_zone = true
- Если игрок возвращается в ближайший город/деревню из дикой зоны: location_changed = true, выбери ближайшую именованную локацию из списка
- travel_description: краткое описание перемещения`;
}
