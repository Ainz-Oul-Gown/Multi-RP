import json
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

polys = {}
for name, data in borders.items():
    pts_raw = data.get('points', [])
    pts = [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in pts_raw]
    p = Polygon(pts)
    polys[name] = p

names = list(polys.keys())
print("Checking gaps between touching/adjacent pairs:")
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1, p2 = polys[n1], polys[n2]
        dist = p1.distance(p2)
        if dist < 50:
            # Let's check buffer gap:
            # buffer by 25, intersect
            b1 = p1.buffer(15)
            b2 = p2.buffer(15)
            gap = b1.intersection(b2).difference(p1).difference(p2)
            if not gap.is_empty and gap.area > 100:
                print(f"Gap between {n1} <-> {n2}: dist={dist:.1f}, gap area within 15 units = {gap.area:.1f}")
