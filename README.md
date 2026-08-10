# MultiRP AI v2.0 — Гибридный ИИ-Движок для текстовых RPG

Асинхронная многопользовательская текстовая RPG с ИИ-Мастером на базе MiMo v2.5.

## Архитектура

```
Frontend (PWA/Vite)  →  Supabase Backend  →  OpenRouter API (MiMo v2.5)
     ↓                      ↓                        ↓
  GitHub Pages          PostgreSQL +           AI-Парсер → JSON
  (статика)             Edge Functions         AI-Рассказчик → Нарратив
```

**Ключевой принцип:** Supabase выступает строгим судьёй (математика, инвентарь, честность бросков), а нейросеть MiMo v2.5 — Гейммастером (парсинг действий + генерация нарратива).

## Двухшаговый конвейер хода

1. **Парсинг** — текст игрока → JSON (намерение, навыки, предметы)
2. **Математика** — Edge Function валидирует JSON, бросает кубики (d20), обновляет БД
3. **Нарратив** — результаты броска + лор → AI генерирует ответ
4. **Трансляция** — ответ пушится всем через Supabase Realtime

## Быстрый старт

### 1. Установка

```bash
git clone https://github.com/YOU/multirp-ai.git
cd multirp-ai
npm install
```

### 2. Настройка Supabase

1. Создайте проект в [Supabase](https://supabase.com)
2. Выполните SQL-миграцию:
   - Перейдите SQL Editor → скопируйте содержимое `supabase/migrations/001_initial_schema.sql`
3. Создайте Edge Function:
   - `supabase functions deploy process-turn`
4. Установите секреты:
   ```bash
   supabase secrets set OPENROUTER_API_KEY=sk-or-...
   ```

### 3. Настройка окружения

Скопируйте `.env.example` в `.env.local` и заполните:

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_OPENROUTER_API_KEY=sk-or-...
```

### 4. Запуск

```bash
npm run dev
```

### 5. Деплой на GitHub Pages

```bash
npm run build
# Деплой папки dist/
```

## Структура проекта

```
multirp-ai/
├── index.html                 # Точка входа PWA
├── public/
│   ├── manifest.json          # PWA Manifest
│   ├── sw.js                  # Service Worker (офлайн)
│   └── favicon.svg
├── src/
│   ├── main.js                # Entry point
│   ├── config.js              # Конфигурация
│   ├── router.js              # SPA-роутер
│   ├── api/
│   │   ├── supabase.js        # Клиент Supabase + Auth
│   │   └── game.js            # API-методы (CRUD)
│   ├── pages/
│   │   ├── auth.js            # Авторизация
│   │   ├── lobby.js           # Глобальное лобби
│   │   ├── session-settings.js# Настройки сессии
│   │   └── game.js            # Игровой экран
│   ├── styles/
│   │   ├── variables.css      # CSS Custom Properties
│   │   ├── main.css           # Глобальные стили
│   │   └── game.css           # Стили игрого экрана
│   └── utils/
│       ├── toast.js           # Уведомления
│       └── dice.js            # Броски кубиков (UI)
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # Вся БД + RPC
│   └── functions/
│       └── process-turn/
│           └── index.ts       # AI Pipeline Edge Function
└── .env.example
```

## База данных

| Таблица       | Описание                          |
|--------------|-----------------------------------|
| `worlds`     | Миры и сеттинги                   |
| `lore_files` | База знаний мира (Markdown)       |
| `sessions`   | Игровые комнаты                   |
| `players`    | Карточки персонажей               |
| `inventory`  | Вещи и экипировка                 |
| `messages`   | Игровой чат (только ответы Мастера)|
| `turn_queue` | Очередь ходов                     |

## RPC-функции

| Функция                      | Описание                                  |
|-----------------------------|-------------------------------------------|
| `roll_d20(stat, mod)`       | Бросок d20 с модификатором                |
| `roll_d20_advantage(stat)`  | Бросок с Преимуществом (Легко)            |
| `roll_d20_disadvantage(stat)`| Бросок с Помехой (Хардкор)              |
| `update_player_hp(id, delta)`| Атомарное обновление HP                  |
| `add_item_to_inventory(...)` | Безопасное добавление предмета (стаки)    |
| `remove_item_from_inventory(...)`| Безопасное удаление предмета         |

## Ключевые механики

- **PvP** — тумблер в настройках сессии
- **Динамический сюжет** — выбор Акта или режим «Песочница»
- **Фантомные предметы** — если предмета нет в инвентаре, ИИ отыгрывает конфуз
- **Race Conditions** — SQL-транзакции с `FOR UPDATE` блокировками
- **Экспорт/Импорт** — миров и персонажей через JSON-файлы
- **PWA** — офлайн-кэширование, установка на рабочий стол

## Импорт/Экспорт

### Мир
- Экспорт: скачать entire worlds + lore_files в JSON
- Импорт: загрузить JSON → создаётся новый мир + все файлы лора

### Персонаж
- Экспорт: персонаж отвязан от сессии, сохраняется полностью
- Импорт: в новой сессии может потребоваться корректировка расы/класса

## Лицензия

MIT License
