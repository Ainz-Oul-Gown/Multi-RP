# Multi-RP AI — Обзор Проекта

## Что это

**MultiRP AI v2.0** — асинхронная многопользовательская текстовая RPG с ИИ-Мастером.
Игроки вводят текст действий → ИИ парсит намерения → математика честно бросает кубики → ИИ генерирует нарратив.

## Стек

```
Frontend (Vite/PWA)    →    Supabase Backend    →    OpenRouter API (MiMo v2.5)
     ↓                           ↓                           ↓
GitHub Pages (статика)     PostgreSQL +              AI-Парсер → JSON
                           Edge Functions (Deno)     AI-Рассказчик → Нарратив
```

| Слой | Технология | Роль |
|------|-----------|------|
| Frontend | Vite + Vanilla JS/CSS | SPA, PWA, роутинг |
| Backend | Supabase (PostgreSQL + Edge Functions) | БД, Auth, Realtime, RLS |
| AI | OpenRouter → MiMo v2.5 | Парсинг действий + нарратив |
| Деплой | GitHub Pages | Статика |

## Ключевой принцип

> **Supabase = судья** (математика, инвентарь, броски d20, честность)  
> **ИИ = Гейммастер** (парсинг действий, генерация истории, NPC-диалоги)

ИИ никогда не решает "есть ли предмет у игрока" — это делает БД. ИИ только рассказывает что происходит.

## Архитектура директорий

```
Multi-RP/
├── src/                        # Frontend (Vite)
│   ├── api/                    # Supabase + OpenRouter клиенты
│   ├── config/                 # Конфигурация (hitDice, damageTypes)
│   ├── pages/                  # Страницы: auth, lobby, game, session-settings
│   ├── styles/                 # CSS (variables, main, game)
│   └── utils/                  # Утилиты: toast, dice, fogOfWar, fogNarratives
├── supabase/
│   ├── migrations/             # 38 SQL миграций (история схемы БД)
│   └── functions/              # Edge Functions (Deno TypeScript)
│       ├── _shared/            # Общие движки: NPC, карта, память, боёвка
│       └── process-turn/       # Главная функция — обработка хода (5 шагов)
├── tests/                      # Тесты (playwright-like, fetch-based)
├── scripts/                    # Python/JS скрипты для работы с картой мира
└── .ai/                        # AI-контекст (этот каталог)
```

## Поток данных (один ход игрока)

```
1. Игрок вводит текст → frontend
2. Frontend → Supabase turn_queue (INSERT)
3. Frontend → Edge Function: process-turn
   ├── Step 1: Роутер (парсинг JSON через ИИ — намерение + предметы)
   ├── Step 2: Движок (математика: d20, хендлеры по типу действия)
   ├── Step 3: Персистенция (UPDATE БД: HP, инвентарь, локация, очередь)
   ├── Step 4: System Truth (факты для нарратора: что реально произошло)
   └── Step 5: Нарратор (ИИ генерирует финальный ответ Мастера)
4. Ответ сохраняется в messages
5. Supabase Realtime пушит ответ всем игрокам сессии
```

## Внешние зависимости

| Сервис | Использование |
|--------|--------------|
| OpenRouter | LLM API (модели: MiMo, DeepSeek, Claude, GPT) |
| Supabase | PostgreSQL, Auth, Edge Functions, Realtime |
| GitHub Pages | Хостинг статики |

## Переменные окружения

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_OPENROUTER_API_KEY=sk-or-...   # фронтенд (опционально)
OPENROUTER_API_KEY=sk-or-...        # Edge Function секрет (Supabase Secrets)
```
