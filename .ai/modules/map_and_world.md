# Модуль: Карта и Мир (Map & World)

> Ссылка на полный код: [context_db_migrations.md](../context_db_migrations.md)  
> Python скрипты: `scripts/` (инструменты для работы с картой)

## Иерархия географии

```
World (мир)
  └── State (государство)  ← state_border_polygons (SVG/GeoJSON полигоны)
        └── Location (локация)
              └── Zone (зона внутри локации)  ← location_map (матрица расстояний)
```

## Таблицы

```sql
states (
  id, world_id, name, description,
  ruler_id (→ npcs.id),    -- правитель
  color TEXT,               -- цвет на карте
  polygon JSONB             -- границы государства
)

locations (
  id, state_id (или NULL для дикой зоны),
  name, type,               -- 'city' | 'village' | 'dungeon' | 'wilderness' | ...
  description,
  terrain_type,             -- 'open' | 'forest' | 'cave' | 'urban' | 'building' | 'mountain'
  location_map JSONB,       -- матрица расстояний между зонами
  coordinates JSONB         -- {x, y} на карте мира
)

routes (
  from_location_id, to_location_id,
  distance INT,             -- в условных единицах
  travel_time_hours INT
)

session_locations (
  session_id, location_id,
  terrain_type,
  location_map JSONB        -- может отличаться от базовой (ИИ генерирует при входе)
)
```

## location_map — Матрица расстояний

Каждая локация делится на **зоны** (rooms/areas).  
`location_map` — словарь `{zone_name: {zone_name: distance_tier}}`.

```json
{
  "Таверна": {
    "Зал": 1,
    "Кухня": 1,
    "Улица": 2
  },
  "Зал": {
    "Кухня": 1,
    "Улица": 2
  }
}
```

Тиры расстояний:
| Тир | Расстояние | Описание |
|-----|-----------|---------|
| 0 | ~0м | Та же комната/зона |
| 1 | ~10м | Рядом, сквозь стену |
| 2 | ~50м | Соседняя зона |
| 3 | ~200м | Другой квартал |
| 4 | ~1км | Другой конец города |
| 5 | >1км | Другой город |

## Генерация location_map (fog_location_generator.ts)

При входе в локацию ИИ генерирует `location_map` и `terrain_type`.  
Если ИИ недоступен — используется эвристический фоллбэк `buildFallbackLocationMap()`.

```typescript
ensureLocationMapAndTerrain({
  supabase, sessionId, locationId, locationName,
  locationType, locationDescription, isWildZone,
  openrouterApiKey, model
}) → LocationMapResult
```

## Дикие зоны (Wild Zones)

Локации без привязки к государству (`state_id IS NULL`).  
Генерируются процедурно при перемещении игрока в неисследованную территорию.

## Туман войны

Таблица `fog_of_war`:
```sql
session_id, player_id,
zone TEXT,        -- название зоны
visible BOOLEAN   -- видима ли зона игроку
```

## Python скрипты для работы с картой

Скрипты в `scripts/` — инструменты для парсинга SVG-карты мира (Azgaar Fantasy Map Generator).

| Категория | Скрипты | Назначение |
|-----------|---------|-----------|
| SVG анализ | `inspect_svg*.py`, `find_*.py` | Парсинг SVG, поиск полигонов |
| Границы | `generate_borders*.py`, `normalize_borders.py` | Генерация границ государств |
| Острова | `check_world_islands.py`, `add_islands_to_borders.py` | Работа с островами |
| Локации | `check_locations_on_islands.py`, `relocate_locations.py` | Валидация локаций |
| Синхронизация | `sync_etheria_db.cjs`, `sync_borders_to_db.cjs` | Загрузка данных в БД |
| Верификация | `verify_final_map.py`, `check_containment.py` | Проверка корректности |

## Данные мира Этерия

В корне проекта находятся JSON-файлы с данными игрового мира:
- `Этерия.json` — основной файл мира (1.3MB)
- `Этерия 2.6.json` — версия 2.6 (1.5MB)
- `Карточка Мира.txt` — описание мира в текстовом виде (180KB)
- `01_Лор.txt`, `03_Политика.txt`, `04_Религия.txt`, `05_Магия и заклинания.txt` — лор-файлы

## Полезные скрипты

```bash
# Посмотреть список деревень/локаций
python scripts/list_villages.py

# Проверить острова и их локации
python scripts/check_world_islands.py
python scripts/check_locations_on_islands.py

# Синхронизировать данные в БД
node scripts/sync_etheria_db.cjs

# Добавить острова в систему границ
python scripts/add_islands_to_borders.py

# Верификация финальной карты
python scripts/verify_final_map.py
```
