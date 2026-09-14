# AI Context — Multi-RP Project

> Оглавление для агентов. Читай этот файл первым. Он укажет, где искать нужную информацию.

## 🗺️ Структура папки `.ai/`

```
.ai/
├── INDEX.md                        ← этот файл, читать первым
├── OVERVIEW.md                     ← что такое проект, стек, архитектура
├── modules/
│   ├── game_loop.md                ← игровой цикл (process-turn, step1-5)
│   ├── npc_system.md               ← NPC: память, характеры, боёвка
│   ├── map_and_world.md            ← карта, острова, локации, границы
│   ├── character_system.md         ← персонажи, статы, навыки, инвентарь
│   ├── frontend.md                 ← UI: lobby, game, auth, стили
│   └── database.md                 ← схема БД, все таблицы, RPC, RLS
├── context_supabase_functions.md   ← [Repomix] сжатый код Edge Functions
├── context_db_migrations.md        ← [Repomix] сжатый код миграций SQL
├── context_frontend.md             ← [Repomix] сжатый код фронтенда
└── context_tests.md                ← [Repomix] сжатый код тестов
```

## 🎯 Быстрый роутинг

| Задача | Читай |
|--------|-------|
| Понять проект целиком | `OVERVIEW.md` |
| Изменить игровую механику / ход хода | `modules/game_loop.md` → `context_supabase_functions.md` |
| Работа с NPC | `modules/npc_system.md` |
| Работа с картой / локациями | `modules/map_and_world.md` |
| Изменить персонажей / статы | `modules/character_system.md` |
| Изменить UI / страницы | `modules/frontend.md` → `context_frontend.md` |
| Изменить БД / схему | `modules/database.md` → `context_db_migrations.md` |
| Добавить / понять юнит-тест | `context_tests.md` |
| Запустить E2E тесты (браузер) | `tests/e2e/README.md` |

## 📦 Repomix контекст-файлы

Файлы `context_*.md` генерируются автоматически через Repomix с флагом `--compress`.
Они содержат **сжатые сигнатуры** всех функций, типов, классов — без тела функций.

Для регенерации:
```bash
npx repomix -c .ai/repomix.functions.json --no-security-check
npx repomix -c .ai/repomix.migrations.json --no-security-check
npx repomix -c .ai/repomix.frontend.json --no-security-check
npx repomix -c .ai/repomix.tests.json --no-security-check
```
