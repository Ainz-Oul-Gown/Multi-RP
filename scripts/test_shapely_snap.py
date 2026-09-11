import json
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import snap, unary_union
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

polys = {}
for name, data in borders.items():
    pts_raw = data.get('points', [])
    pts = [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in pts_raw]
    p = Polygon(pts)
    if not p.is_valid:
        p = make_valid(p)
    polys[name] = p

print("Original polygons loaded:")
for k, v in polys.items():
    print(f"  {k}: {len(v.exterior.coords)} coords, area={v.area:.1f}")
