# Модуль: Игровой Цикл (Game Loop)

> Ссылка на полный код: [context_supabase_functions.md](../context_supabase_functions.md)  
> Основная функция: `supabase/functions/process-turn/index.ts`

## Обзор

Весь игровой цикл проходит через **одну Edge Function** — `process-turn`.
Она принимает действие игрока и запускает 5-шаговый конвейер.

## 5-шаговый конвейер хода

```
Игрок → action_text (строка)
         │
         ▼
┌─────────────────────────────────────────────┐
│ Step 1: step1_router.ts — РОУТЕР             │
│  ИИ парсит текст → JSON с намерением         │
│  Выход: { intent, items, target_npc, ... }   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Step 2: engine/step2_engine.ts — ДВИЖОК      │
│  Выбирает handler по типу действия           │
│  Бросает кубики, проверяет инвентарь         │
│  Выход: EngineMutation[] (что изменить в БД) │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Step 3: step3_persistence.ts — ПЕРСИСТЕНЦИЯ  │
│  Применяет мутации к PostgreSQL              │
│  UPDATE: hp, inventory, location, turn_queue │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Step 4: step4_system_truth.ts — СИСТЕМНАЯ   │
│          ИСТИНА                              │
│  Формирует факты о том что РЕАЛЬНО произошло │
│  Проверяет: HP, инвентарь, локацию, статус  │
│  Выход: string[] (факты для нарратора)       │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Step 5: step5_narrator.ts — НАРРАТОР         │
│  ИИ генерирует финальный ответ Мастера       │
│  Использует факты из Step 4, не выдумывает   │
│  Выход: строка нарратива (текст для чата)    │
└─────────────────────────────────────────────┘
         │
         ▼
  INSERT messages + Supabase Realtime push
```

## Хендлеры действий (Step 2)

| Файл | Тип действия | Что делает |
|------|-------------|-----------|
| `attack_handler.ts` | `attack` | Бросок атаки d20, урон, HP цели |
| `move_handler.ts` | `move` | Смена локации, проверка доступности |
| `talk_handler.ts` | `talk` | Диалог с NPC, нет кубиков |
| `transfer_handler.ts` | `transfer` | Передача предметов между игроками |
| `drop_handler.ts` | `drop` | Выброс предмета из инвентаря |
| `craft_handler.ts` | `craft` | Создание предметов |
| `build_handler.ts` | `build` | Строительство объектов |
| `loot_search_handler.ts` | `loot_search` | Поиск лута в локации |
| `harvest_ambient_handler.ts` | `harvest` | Сбор ресурсов из окружения |

## Система кубиков (dice.ts)

```typescript
rollD20()                        // 1-20
rollD20Advantage()               // best of 2d20
rollD20Disadvantage()            // worst of 2d20
performAttackRoll(opts)          // бросок атаки с модификаторами
performSavingThrow(mod, dc)      // спасбросок
rollDamage("1d8+2")             // парсинг и бросок урона
getStatModifier(statValue)       // floor((stat - 10) / 2)
getProficiencyBonus(level)       // ceil(level / 4) + 1
```

**Критический удар** = автоуспех при броске 20.  
**Фамбл** = автопровал при броске 1.

## Туман войны (fog_of_war_utils.ts)

Система дистанционного восприятия событий:

| Тип местности | Звук мод | Видимость мод |
|--------------|---------|--------------|
| open | +1 | +2 |
| forest | -1 | -2 |
| cave | +2 | -3 |
| urban | 0 | -1 |
| building | -1 | -2 |
| mountain | -1 | +1 |

Игрок слышит/видит события в других зонах локации через `location_map` (матрица расстояний).

## Сюжетный прогресс (storyProgressEvaluator.ts)

Автоматически проверяет выполнение целей арок после каждого хода.  
Если цель достигнута — продвигает `current_arc_index` в `storyline` JSON сессии.

```typescript
interface StoryArc {
  id, act, title, description,
  goals: string[],
  completed_goals: string[],
  key_npcs, key_locations,
  status: "active" | "completed" | "pending"
}
```

## Раунд мира (npc_world_simulator.ts)

После каждого круга ходов всех игроков — фоновая симуляция жизни мира:
- Берёт до 8 NPC не в текущей сцене
- Один запрос к ИИ на всех → действия (travel/hunt/trade/rest...)
- Применяет мутации: перемещение, XP, предметы, логи
- Пишет системное сообщение-хронику в чат
