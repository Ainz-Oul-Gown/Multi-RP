import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import snap
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

def get_pts(name):
    raw = borders[name]['points']
    return [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw]

pts_a = get_pts('Эскорин')
pts_b = get_pts('Роарн')

line_a = LineString(pts_a + [pts_a[0]])
line_b = LineString(pts_b + [pts_b[0]])

# Snap line_a to vertices of line_b, and line_b to vertices of line_a
tol = 75.0
s_a = snap(line_a, line_b, tolerance=tol)
s_b = snap(line_b, s_a, tolerance=tol)
s_a = snap(s_a, s_b, tolerance=tol)

coords_a = list(s_a.coords)
coords_b = list(s_b.coords)

print(f"Eskorin coords: {len(pts_a)} -> {len(coords_a)}")
print(f"Roarn coords: {len(pts_b)} -> {len(coords_b)}")

# Let's count shared vertices (within 1e-3)
set_a = set((round(x, 1), round(y, 1)) for x, y in coords_a)
set_b = set((round(x, 1), round(y, 1)) for x, y in coords_b)
common = set_a.intersection(set_b)
print(f"Common vertices after snap: {len(common)}")
