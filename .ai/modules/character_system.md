# Модуль: Система Персонажей

> Ссылка на полный код: [context_frontend.md](../context_frontend.md) + [context_db_migrations.md](../context_db_migrations.md)

## Обзор

Персонаж — центральная сущность игрока. Хранится в таблице `players` (активный в сессии) и `character_cards` (шаблоны/библиотека).

## Структура персонажа

```typescript
// Таблица players
{
  id: UUID,
  session_id: UUID,
  user_id: UUID,              // привязка к пользователю
  name: string,
  race: string,               // "Человек", "Эльф", "Орк", ...
  class: string,              // "Воин", "Маг", "Плут", ...
  appearance: string,
  personality: {
    ideals: string[],
    bonds: string[],
    flaws: string[]
  },
  bio: string,
  power_level: int,           // 1-100
  
  // Характеристики (D&D 5e стиль)
  stats: {
    STR: int,  // Сила
    DEX: int,  // Ловкость
    CON: int,  // Телосложение
    INT: int,  // Интеллект
    WIS: int,  // Мудрость
    CHA: int   // Харизма
  },
  
  // Здоровье
  hp: int,
  max_hp: int,
  
  // Боёвка (миграция 004)
  initiative: int,
  armor_class: int,
  saving_throws: JSONB,
  
  // Состояние
  money: int,
  is_active: boolean,
  active_injuries: JSONB[],  // активные травмы
  rest_penalty_hours: int,
  last_rested_at: timestamptz,
  
  // Локация (миграция 037)
  current_location_id: UUID,
  current_zone: string        // зона внутри локации
}
```

## Система характеристик (D&D 5e)

```
Модификатор = floor((STAT - 10) / 2)
Бонус мастерства = ceil(level / 4) + 1

Примеры:
  STR 10 → модификатор 0
  DEX 16 → модификатор +3
  CON  8 → модификатор -1
```

## HP и Hit Dice (hitDice.js / миграция 014)

```javascript
// Уровень 1: макс кубика + CON_мод + 10
// Каждый следующий уровень: среднее кубика + CON_мод

Кубики по классу:
  d6  — Волшебник, Чародей
  d8  — Бард, Жрец, Друид, Монах, Плут, Колдун
  d10 — Воин, Паладин, Следопыт
  d12 — Варвар
```

## Навыки и Левелинг (миграция 020)

Таблица `player_skills`:
```sql
player_id UUID,
skill_name TEXT,   -- "Атака", "Скрытность", "Магия огня", ...
level INT,
xp INT
```

Прокачка через практику — навык растёт от использования в боёвке/RP.

## Инвентарь

Таблица `inventory`:
```sql
player_id UUID,
item_name TEXT,
quantity INT,
type TEXT,    -- 'weapon' | 'armor' | 'consumable' | 'misc'
attributes JSONB   -- урон, AC, эффекты и т.д.
```

RPC для атомарных операций:
```sql
add_item_to_inventory(player_id, item_name, qty, type, attributes)
remove_item_from_inventory(player_id, item_name, qty)
```

**Антихак:** ИИ никогда не решает "есть ли предмет". Всегда проверяется БД.

## Травмы (миграция 005)

```sql
-- player_injuries
injury_type TEXT,
severity TEXT,          -- 'minor' | 'moderate' | 'severe'
stat_penalties JSONB,   -- {"STR": -2, "DEX": -1}
hp_penalty INT,
duration_hours INT,
is_permanent BOOLEAN
```

Генерируются через `process-rest` Edge Function при тяжёлых ранениях.

## Character Cards (шаблоны)

Таблица `character_cards` — личная библиотека персонажей пользователя.  
Не привязана к сессии. Используется для быстрого создания нового персонажа.

Генерация персонажа:
- `generate-character` — полная генерация через ИИ
- `generate-character-minimal` — без производных статов
- `generate-character-no-derived` — без расчётов

## Генерация через ИИ (generate-character)

```typescript
// Вход: раса, класс, уровень, сеттинг мира
// Выход: name, appearance, personality, bio, stats, hp, inventory[]
// validateAndFixStats() — проверяет что сумма статов в норме
// calculateDerivedStats() — рассчитывает AC, initiative, saving_throws
```
