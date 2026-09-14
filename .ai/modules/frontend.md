# Модуль: Фронтенд (Frontend)

> Ссылка на полный код: [context_frontend.md](../context_frontend.md)  
> Директория: `src/`, точка входа: `src/main.js`

## Архитектура

SPA (Single Page Application) на **Vanilla JS + Vite**. Роутинг — кастомный хэш-роутер (`src/router.js`).

```
index.html → src/main.js → src/router.js → pages/...
```

## Страницы (`src/pages/`)

| Файл | Маршрут | Описание |
|------|---------|---------|
| `auth.js` | `/auth` | Авторизация/регистрация через Supabase Auth |
| `lobby.js` | `/lobby` | Список миров, сессий, создание персонажей, управление NPC |
| `session-settings.js` | `/session/:id/settings` | Настройки сессии: сюжет, PvP, AI-ключи, игроки |
| `game.js` | `/session/:id` | Основной игровой экран |

### game.js (главная страница)

Самый большой файл (170KB). Содержит:
- Отображение чата и истории сообщений
- Ввод действий игрока
- Карточку персонажа (HP, статы, инвентарь)
- Интерактивную карту мира (canvas/SVG)
- Очередь ходов
- Туман войны UI

### lobby.js

- Список миров пользователя
- Создание/редактирование миров
- Генерация NPC через ИИ
- Управление лор-файлами
- Создание/удаление сессий
- Управление character cards
- Импорт/экспорт JSON

## API слой (`src/api/`)

| Файл | Назначение |
|------|-----------|
| `supabase.js` | Supabase клиент, Auth, Realtime подписки |
| `game.js` | CRUD методы: игроки, сессии, инвентарь, сообщения, NPC |
| `openrouter.js` | Вызовы OpenRouter API (генерация через LLM) |
| `storyline.js` | Генерация/редактирование сюжетных линий |

## Утилиты (`src/utils/`)

| Файл | Назначение |
|------|-----------|
| `dice.js` | Броски кубиков для UI (parseDice, rollDice, rollAttack) |
| `toast.js` | Toast-уведомления (showToast, success/error/info/warning) |
| `fogOfWar.js` | Расчёт тумана войны на фронтенде |
| `fogNarratives.js` | Шаблоны дистантного восприятия (без AI!) |
| `gameDate.js` | Форматирование игрового календаря |
| `generationStore.js` | Сохранение прогресса генерации в localStorage |
| `indexedDB.js` | IndexedDB: прогресс генерации, custom DB конфиг |
| `npcRaceResolver.js` | Определение расы NPC по имени/категории |
| `text.js` | Текстовые утилиты |
| `supabaseFullSchema.js` | Полная схема БД для подсказок/валидации |

## Конфигурация (`src/config/`)

| Файл | Назначение |
|------|-----------|
| `damageTypes.js` | Типы урона D&D (физические, стихийные, магические) |
| `hitDice.js` | Кости хитов по классу (d6-d12), расчёт HP |
| `config.js` | Глобальная конфигурация приложения |

## Стили (`src/styles/`)

| Файл | Назначение |
|------|-----------|
| `variables.css` | CSS Custom Properties (цвета, размеры, шрифты) |
| `main.css` | Глобальные стили, компоненты |
| `game.css` | Стили игрового экрана (самый большой, 4345 токенов) |

## Realtime подписки

Фронтенд подписывается на изменения через Supabase Realtime:
- `messages` — новые сообщения от Мастера
- `players` — изменения HP/статов/локации
- `turn_queue` — статус очереди ходов

## PWA

- `public/manifest.json` — PWA Manifest
- `public/sw.js` — Service Worker (офлайн-кэширование)
- Тема: `#1a1a2e` (тёмная, фэнтезийная)

## Сборка

```bash
npm run dev      # разработка (Vite dev server)
npm run build    # продакшн → dist/
```
