import json
import numpy as np
from shapely.geometry import Polygon, LineString
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

tol = 75.0
s_a = snap(line_a, line_b, tolerance=tol)
s_b = snap(line_b, s_a, tolerance=tol)
s_a = snap(s_a, s_b, tolerance=tol)

p_a = Polygon(s_a)
p_b = Polygon(s_b)

inter = p_a.intersection(p_b)
print(f"Overlap area between Eskorin and Roarn: {inter.area:.1f}")
