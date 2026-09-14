# Модуль: База данных (Database)

> Ссылка на полный код: [context_db_migrations.md](../context_db_migrations.md)  
> Директория: `supabase/migrations/` (38 миграций)

## Полная схема таблиц

### Ядро игры (001, 003)

| Таблица | Ключевые поля | Назначение |
|---------|-------------|-----------|
| `worlds` | `id`, `owner_id`, `name`, `settings JSONB` | Миры и сеттинги |
| `lore_files` | `world_id`, `folder`, `title`, `content`, `tags[]` | База знаний мира |
| `sessions` | `world_id`, `difficulty`, `is_pvp_enabled`, `storyline JSONB` | Игровые комнаты |
| `players` | `session_id`, `user_id`, `stats JSONB`, `hp`, `max_hp`, `money` | Персонажи в сессии |
| `inventory` | `player_id`, `item_name`, `quantity`, `type`, `attributes JSONB` | Предметы |
| `messages` | `session_id`, `sender_type`, `content`, `metadata JSONB` | Чат/история |
| `turn_queue` | `session_id`, `player_id`, `status`, `action_text`, `parsed_action JSONB` | Очередь ходов |
| `character_cards` | `owner_id`, `name`, `race`, `class`, `stats JSONB` | Шаблоны персонажей |
| `user_settings` | `id` (= user_id), `openrouter_key`, `preferred_model` | Настройки пользователя |

### Мир и география (006, 009, 030, 037, 038)

| Таблица | Ключевые поля | Назначение |
|---------|-------------|-----------|
| `states` | `world_id`, `name`, `description`, `ruler_id` | Государства |
| `locations` | `state_id`, `name`, `type`, `terrain_type`, `location_map JSONB` | Локации |
| `routes` | `from_location_id`, `to_location_id`, `distance` | Маршруты |
| `state_border_polygons` | `state_id`, `polygon JSONB` | Границы государств (SVG/GeoJSON) |
| `session_locations` | `session_id`, `location_id`, `terrain_type`, `location_map JSONB` | Активные локации сессии |

### Система NPC (006, 015, 018, 020, 028, 029)

| Таблица | Ключевые поля | Назначение |
|---------|-------------|-----------|
| `npcs` | `world_id`, `name`, `race`, `role`, `tier`, `level`, `hp`, `combat_stats JSONB` | NPC мира |
| `npc_memories` | `npc_id`, `player_id`, `memory_text`, `vividness`, `tier`, `embedding vector` | Векторная память |
| `npc_relationships` | `npc_id`, `player_id`, `score`, `tier`, `status_tags[]` | Шкала отношений |
| `npc_world_logs` | `npc_id`, `session_id`, `action_type`, `narrative_log` | Хроника жизни мира |
| `creature_templates` | `world_id`, `name`, `tier`, `combat_stats JSONB`, `special_attacks JSONB` | Шаблоны монстров |

### Боёвка и состояние (004, 005, 011, 012, 020)

| Таблица | Ключевые поля | Назначение |
|---------|-------------|-----------|
| `player_injuries` | `player_id`, `injury_type`, `severity`, `stat_penalties JSONB` | Травмы |
| `player_skills` | `player_id`, `skill_name`, `level`, `xp` | Навыки и уровни |

### Туман войны (026, 027)

| Таблица | Ключевые поля | Назначение |
|---------|-------------|-----------|
| `fog_of_war` | `session_id`, `player_id`, `zone`, `visible` | Видимость зон |

## Ключевые RPC функции

```sql
-- Кубики
roll_d20(stat_value, difficulty_mod)         → {roll, total, success}
roll_d20_advantage(stat_value)               → {rolls[], best_roll, total, success}
roll_d20_disadvantage(stat_value)            → {rolls[], worst_roll, total, success}

-- Персонаж
update_player_hp(player_id, hp_change)       → {new_hp, new_max_hp, is_alive}
add_item_to_inventory(player_id, item, qty)  → UUID
remove_item_from_inventory(player_id, item)  → BOOLEAN

-- Настройки
upsert_user_settings(user_id, openrouter_key)
get_user_openrouter_key(user_id)             → TEXT

-- Мутации хода (017)
apply_turn_mutations(session_id, mutations JSONB)
```

## RLS (Row Level Security)

**Принцип:** каждый видит только своё или данные своей сессии.

| Таблица | Чтение | Запись |
|---------|--------|--------|
| `worlds` | Все | Только owner |
| `sessions` | Авторизованные | Участники |
| `players` | Участники сессии | Только свой |
| `messages` | Участники сессии | System + own |
| `inventory` | Свой player | Свой player + system |
| `user_settings` | Только свой | Только свой |

## История миграций (ключевые)

| Миграция | Что добавлено |
|---------|--------------|
| 001 | Начальная схема: worlds, sessions, players, inventory, messages, turn_queue |
| 006 | pgvector, states, locations, routes, npcs + векторная память |
| 012 | creature_templates, боёвка монстров |
| 017 | apply_turn_mutations — атомарное применение всех мутаций хода |
| 018 | npc_relationships, npc_memories |
| 020 | player_skills, XP, левелинг NPC |
| 026 | fog_of_war таблица |
| 033 | session ai_key_mode (personal/session ключ OpenRouter) |
| 037 | session_locations, location_map, terrain_type, физическое пространство |
| 038 | state_border_polygons |
