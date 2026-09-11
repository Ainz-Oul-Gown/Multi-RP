import json
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

polys = {}
for name, data in borders.items():
    pts_raw = data.get('points', [])
    if len(pts_raw) >= 3:
        pts = [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in pts_raw]
        p = Polygon(pts)
        if not p.is_valid:
            p = make_valid(p)
        polys[name] = p

names = list(polys.keys())
print("=== Overlaps between states ===")
total_overlap_area = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1, p2 = polys[n1], polys[n2]
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-3:
            print(f"Overlap {n1} <-> {n2}: area = {inter.area:.1f}")
            total_overlap_area += inter.area

print(f"Total overlap area: {total_overlap_area:.1f}")
