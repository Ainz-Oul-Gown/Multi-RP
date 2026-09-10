-- Migration 038: Add border polygon data to states table
-- Adds border_shape and border_data columns to states,
-- matching the existing pattern used by locations.bounds_shape / locations.bounds_data

ALTER TABLE public.states
  ADD COLUMN IF NOT EXISTS border_shape TEXT NOT NULL DEFAULT 'auto' 
    CHECK (border_shape IN ('auto', 'circle', 'polygon')),
  ADD COLUMN IF NOT EXISTS border_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS map_color TEXT DEFAULT NULL;

COMMENT ON COLUMN public.states.border_shape IS 
  'auto = compute convex hull from city coords at runtime. polygon = use explicit vertices in border_data.points. circle = use border_data.radius.';

COMMENT ON COLUMN public.states.border_data IS
  'For polygon: { "points": [{x, y}, ...] }. For circle: { "radius": N, "center_x": X, "center_y": Y }. Empty for auto.';

COMMENT ON COLUMN public.states.map_color IS
  'Optional hex color for this state on the world map (e.g. "#f472b6"). If NULL, a color is derived from the state id hash.';
