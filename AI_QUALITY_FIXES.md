# AI Quality Issues — Пошаговые исправления

> Создан по итогам e2e тестов 03-09 (30/30 прошли). Файл для команды разработки.

---

## Проблема 1: Смешение языков в ответах AI 🔴

**Симптом:** В русском тексте появляются `distant`, `遠`, `lontano`, `遠кий` вместо "далёкий".

**Причина:** В поле `locations.description` в БД хранится мусорный текст от предыдущих AI-переводов. Это поле передаётся в `lore_context` нарратора и AI вставляет его дословно.

**Шаги исправления:**

1. Откройте Supabase Dashboard → Table Editor → таблица `locations`
2. Найдите строки где `description` содержит латиницу/иероглифы:
```sql
SELECT id, name, description
FROM locations
WHERE description ~ '[a-zA-Z]{5,}|[\u4e00-\u9fff]|lontano|distant';
```
3. Для каждой найденной локации — вручную напишите чистое русское описание и сохраните:
```sql
UPDATE locations
SET description = 'Опушка леса с высокими соснами. Воздух пахнет хвоей.'
WHERE name LIKE '%Шепчущ%';
```
4. Также исправьте опечатку в названии:
```sql
UPDATE locations SET name = 'Шепчущая роща' WHERE name = 'Шепчущая рощи';
```
5. В файле `supabase/functions/process-turn/steps/step5_narrator.ts` строка ~130:
```ts
// БЫЛО:
${loreContext ? `ЛОР:\n${loreContext}\n` : ''}

// СТАЛО — добавить очистку перед вставкой:
${loreContext ? `ЛОР:\n${loreContext.replace(/[^\u0400-\u04FF\s.,!?—«»\-\d]/g, '')}\n` : ''}
```
Этот regex оставляет только кириллицу, пробелы и базовую пунктуацию.

---

## Проблема 2: `<narrative text>` и `текст...` вместо нарратива 🔴

**Симптом:** AI иногда возвращает буквальный шаблон вместо сгенерированного текста.

**Причина:** LLM не генерирует текст (пустой ответ или ошибка), и fallback тоже не срабатывает.

**Файл:** `supabase/functions/process-turn/steps/step5_narrator.ts`

**Шаги:**

1. Найдите функцию `generateNarrative` (около строки 339)
2. После получения ответа от LLM добавьте проверку:
```ts
// После: const narrativeText = response?.choices?.[0]?.message?.content ?? '';
const narrativeText = response?.choices?.[0]?.message?.content ?? '';

// ДОБАВИТЬ: детектор placeholder
const PLACEHOLDERS = ['<narrative text>', 'текст...', '...', '[narrative]'];
const isPlaceholder = PLACEHOLDERS.some(p => narrativeText.trim() === p)
  || narrativeText.trim().length < 10;

if (isPlaceholder) {
  // Вызвать fallback нарратор
  return buildFallbackNarrative(context.system_truth);
}
```
3. Убедитесь что `buildFallbackNarrative` (строка ~167) возвращает осмысленный текст, а не пустую строку.

---

## Проблема 3: Атака классифицируется как `drop` 🔴

**Симптом:** Игрок пишет "Атакую волка!" → AI возвращает `Действие "drop" провалилось`.

**Причина:** `step1_router.ts` неверно определяет `action_type` на первой попытке.

**Файл:** `supabase/functions/process-turn/steps/step1_router.ts`

**Шаги:**

1. Найдите секцию с промптом для роутера (около строки 120-170)
2. В секции примеров добавьте явные примеры атаки:
```
ПРИМЕР АТАКИ (action_type: "attack"):
- "Атакую волка!"
- "Бью монстра мечом!"
- "Вижу врага, атакую!"
- "Наношу удар по противнику"
- "Кидаюсь на зверя"

ПРИМЕР ПЕРЕДАЧИ (action_type: "transfer"):
- "Отдаю ему меч" → нужен target + item_name в инвентаре
- "Передаю трактирщику монету"

ПРИМЕР ВЫБРОСА (action_type: "drop"):
- "Выбрасываю старый лук"
- "Бросаю флягу на землю"
```
3. В heuristic fallback (поиск по `buildRouterHeuristicFallback`) добавьте ключевые слова атаки:
```ts
if (/атак|бью|удар|кидаюсь|бросаюсь.*враг|наношу удар/i.test(actionText)) {
  return { action_type: 'attack', ... };
}
```

---

## Проблема 4: Предмет не найден при передаче НПС 🔴

**Симптом:** После крафта — предмет не находится при `transfer`.

**Причина:** Либо крафт не записывает предмет в инвентарь, либо при передаче передаётся `item_name: "не указан"`.

**Шаги:**

1. В `step1_router.ts` в промпте для `transfer` добавьте пример:
```
При action_type "transfer" ОБЯЗАТЕЛЬНО укажи:
- "item_name": точное название предмета из инвентаря игрока (строка из inventory[].name)
- "target_name": имя персонажа которому передаём
Если предмет неизвестен — спроси у игрока, не используй "не указан"
```
2. Проверьте, что `step3_persistence.ts` → функция крафта записывает предмет в таблицу `inventory`:
```ts
// Найдите функцию craft и убедитесь что после крафта есть:
await supabase.from('inventory').insert({
  player_id: playerId,
  name: craftedItemName,
  // ...
});
```
3. В `step2_engine.ts` найдите handler `transfer` и добавьте логирование:
```ts
console.log('[transfer] item_name from router:', action.item_name);
console.log('[transfer] player inventory:', player.inventory.map(i => i.name));
```
Запустите тест и посмотрите логи в Supabase Dashboard → Edge Functions → Logs.

---

## Проблема 5: NPC не найден при диалоге 🟡

**Симптом:** `Действие "talk" провалилось: Цель разговора не найдена`.

**Причина:** AI генерирует `target_entity_id: null` или неверный UUID NPC.

**Шаги:**

1. В `step4_system_truth.ts` найдите где формируется `npcs_in_location` (около строки 147)
2. Убедитесь что список NPC включается в `SystemTruthDto` и передаётся в нарратор
3. В промпте роутера (step1_router.ts) добавьте список NPC явно:
```
ПЕРСОНАЖИ В ТЕКУЩЕЙ ЛОКАЦИИ:
${npcsInLocation.map(n => `- ${n.name} (id: ${n.id})`).join('\n')}
При action_type "talk" используй id из этого списка для target_entity_id.
```

---

## Проблема 6: Повторяющееся вступление 🟢

**Симптом:** Каждый ответ начинается с "Солнечный свет пробивается сквозь...".

**Файл:** `supabase/functions/process-turn/steps/step5_narrator.ts`

**Шаги:**

В системном промпте нарратора (функция `buildNarratorSystemPrompt`) добавьте запрет:
```ts
// В конец системного промпта добавить:
`ЗАПРЕТ: не начинай каждый ответ с одинакового описания природы.
Варьируй вступления: иногда начинай с действия, иногда с диалога,
иногда с внутренних мыслей персонажа.`
```

---

## Как проверить исправления

После каждого исправления:
```bash
# Задеплоить функцию
supabase functions deploy process-turn

# Запустить e2e тесты
npx playwright test tests/e2e/03_npc_interaction.e2e.js --reporter=list
npx playwright test tests/e2e/08_combat.e2e.js --reporter=list

# Проверить ответы в БД
node tests/e2e/fetch_responses.mjs
```

Тест считается исправленным если в ответах нет иностранных слов и корректно определяется `action_type`.
