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
  availableSubzones?: string[]; // подзоны текущей локации для AI zone matching
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

  const subzonesList = params.availableSubzones?.length
    ? `\nПодзоны внутри текущей локации (для перемещения внутри локации):\n${params.availableSubzones.map(z => `- ${z}`).join('\n')}`
    : '';

  return `Ты — система GPS в текстовой RPG. Определи время, дистанцию и изменение локации.

Текущее время: ${timeStr}
Текущая локация: ${locationStr}
Тип местности / terrain_type: ${(params as any).terrainType || 'неизвестно'}

Действие игрока: "${params.actionText}"

${params.wantsLocationChange ? `Игрок хочет переместиться: ${params.locationChangeDescription}` : 'Игрок не меняет локацию'}

${params.wantsLocationChange ? `Именованные локации мира (города, деревни, поселения):\n${locationsList}` : ''}
${subzonesList}

Верни ТОЛЬКО валидный JSON без markdown:

{
  "time_minutes": 30,
  "new_location_id": null,
  "new_location_name": null,
  "is_wild_zone": false,
  "location_changed": false,
  "moved_to_subzone": null,
  "travel_description": ""
}

━━━ ПРАВИЛА ВРЕМЕНИ (ПО ДИСТАНЦИИ) ━━━
Уровень 0 — В пределах зоны (100-500 м): 5-15 минут
  Примеры: "иду к дереву", "подхожу к костру", "перехожу к ручью внутри рощи"
Уровень 1 — Местное перемещение (0.5-5 км): 15-60 минут
  Примеры: "иду вглубь рощи", "спускаюсь к реке", "иду в пещеру у холма"
Уровень 2 — Региональное (5-50 км): 2-8 часов (120-480 минут)
  Примеры: "иду в соседний город", "перехожу через горный перевал"
Уровень 3 — Дальнее (50+ км): 8-48 часов (480-2880 минут)
  Примеры: "отправляюсь в далёкий город", "еду в столицу"

Другие действия:
- Разговор/торговля: 5-15 минут
- Поиск/исследование: 15-60 минут
- Бой: 5-30 минут
- Отдых короткий: 15-30 минут
- Отдых долгий (сон): 360-600 минут

━━━ ПРАВИЛА ЛОКАЦИИ (ОЧЕНЬ ВАЖНО) ━━━

ШАГ 1 — ПРОВЕРЬ ПЛАУЗИБИЛНОСТЬ:
Прежде чем создавать новую локацию, спроси себя: "Может ли ЭТО существовать РЯДОМ с текущей местностью?"

МАТРИЦА ПЛАУЗИБИЛНЫХ ПЕРЕХОДОВ:
| Текущая зона       | Возможно рядом                              | НЕВОЗМОЖНО рядом              |
|--------------------|---------------------------------------------|-------------------------------|
| Лес/роща           | поляна, ручей, пещера, холм, болото, руины  | замок, банк, сокровищница     |
| Горы               | перевал, пещера, водопад, ущелье, руины     | порт, рынок, таверна в 1 ходу |
| Пустыня            | оазис, развалины, скалы, дюны              | лес, болото, горная река       |
| Берег реки/моря    | пристань, скалы, пещера в берегу, брод     | горный перевал, пустошь        |
| Городские окрестности | лес за городом, поле, дорога, ферма     | пещера в центре города         |

ЕСЛИ запрошенная локация НЕВОЗМОЖНА рядом с текущей:
→ location_changed = false, time_minutes = 5
→ travel_description = "Такого места здесь нет. [Краткое объяснение почему]"

ШАГ 2 — ОПРЕДЕЛИ ТИП ПЕРЕМЕЩЕНИЯ:

A) Движение внутри текущей зоны (к подзоне/точке):
   → location_changed = false, moved_to_subzone = название из списка (если есть), time_minutes = 5-15

B) Переход в природную зону рядом (плаузибильная по матрице выше):
   → location_changed = true, is_wild_zone = true
   → new_location_name = КОНКРЕТНОЕ название, отражающее terrain: "Тёмный бурелом", "Пещера у замшелых скал", "Туманная поляна", "Брод через Шёпот-ручей"
   → НЕ называй абстрактно: не "Лес у X", а нечто атмосферное

C) Переход в именованную локацию из списка:
   → location_changed = true, new_location_id = ID из списка, is_wild_zone = false

D) Выход из здания наружу:
   → location_changed = true, is_wild_zone = true
   → new_location_name = "Придорожный тракт у [название]" или "Улица у [название]"

E) Возврат из дикой зоны в известную локацию:
   → Найди ближайшую именованную локацию из списка

━━━ ПРАВИЛА ПОДЗОН (moved_to_subzone) ━━━
- Если в списке подзон есть место, куда явно хочет попасть игрок: moved_to_subzone = точное название из списка
- Если игрок взаимодействует с NPC в определённой зоне: перемести туда
- Если действие не к подзоне: moved_to_subzone = null
- moved_to_subzone ТОЛЬКО из предоставленного списка, не придумывать новые`;
}
