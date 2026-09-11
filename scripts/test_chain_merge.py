import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Fix swap if needed
pts_sp = borders['Сумеречный Предел']['points']
if min(p['x'] for p in pts_sp) > 0:
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_pts(name):
    raw = borders[name]['points']
    return [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]

pts_a = get_pts('Эскорин')
pts_b = get_pts('Роарн')

poly_a = Polygon(pts_a)
poly_b = Polygon(pts_b)

print(f"Original: Eskorin={len(pts_a)} pts, Roarn={len(pts_b)} pts")
print(f"Original overlap: {poly_a.intersection(poly_b).area:.1f}")

# Let's find vertices of A close to B
line_b = LineString(pts_b + [pts_b[0]])
line_a = LineString(pts_a + [pts_a[0]])

thresh = 60.0
a_border_indices = [i for i, pt in enumerate(pts_a) if line_b.distance(Point(pt)) < thresh]
b_border_indices = [j for j, pt in enumerate(pts_b) if line_a.distance(Point(pt)) < thresh]

print(f"Eskorin border indices: {len(a_border_indices)} vertices ({min(a_border_indices)} to {max(a_border_indices)})")
print(f"Roarn border indices: {len(b_border_indices)} vertices ({min(b_border_indices)} to {max(b_border_indices)})")
