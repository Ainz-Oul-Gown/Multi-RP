-- Migration 027: Fog of War — тип местности для акустики/видимости
-- terrain_type определяется ИИ при генерации/смене локации
-- и напрямую влияет на дальность fog-восприятия.

-- Возможные значения terrain_type:
--   'open'      — открытое пространство (поляна, поле, морской берег)
--                 Звук/видимость: +1 тир к аудио, +2 тира к визуальному
--   'forest'    — густой лес / джунгли
--                 Звук: -1 тир (деревья гасят), Видимость: -2 тира
--   'cave'      — пещера / подземелье (эхо!)
--                 Звук: +2 тира (эхо), Видимость: -3 тира (темнота)
--   'urban'     — городская среда (стены, переулки)
--                 Звук: 0, Видимость: -1 тир
--   'building'  — внутри здания / таверна / замок
--                 Звук: -1 тир, Видимость: -2 тира
--   'mountain'  — горный рельеф
--                 Звук: -1 тир, Видимость: +1 тир
--   null        — не определено (нейтральные модификаторы, как 'urban')

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS terrain_type TEXT DEFAULT NULL;

-- Добавляем terrain_type и в session (для wild zones, где нет locations-записи)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_terrain_type TEXT DEFAULT NULL;

COMMENT ON COLUMN locations.terrain_type IS
  'Тип местности: open|forest|cave|urban|building|mountain. Влияет на дальность звука и видимости.';
COMMENT ON COLUMN sessions.current_terrain_type IS
  'Тип местности текущей зоны/wild_zone (для fog of war). Синхронизируется с locations.terrain_type или задаётся ИИ для wild zone.';
