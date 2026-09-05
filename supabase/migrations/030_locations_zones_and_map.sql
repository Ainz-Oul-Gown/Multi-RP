-- Migration 030: Add zones and location_map to locations table
-- Позволяет сохранять подзоны и матрицы расстояний локаций для Тумана Войны

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS zones JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS location_map JSONB DEFAULT '{}';

COMMENT ON COLUMN locations.zones IS 'Подзоны локации: массив объектов { id, name, type }';
COMMENT ON COLUMN locations.location_map IS 'Симметричная матрица расстояний между подзонами в метрах';
