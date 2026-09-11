import json
import numpy as np
from shapely.geometry import Polygon, LineString
from shapely.ops import snap
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

def get_pts(name):
    raw = borders[name]['points']
    return [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw]

names = list(borders.keys())
lines = {}
for name in names:
    pts = get_pts(name)
    lines[name] = LineString(pts + [pts[0]])

# We snap touching pairs
# Let's determine which pairs touch or are very close (dist < 80)
# Run iterative mutual snapping
tol = 80.0
for it in range(3):
    print(f"Iteration {it+1}...")
    for i in range(len(names)):
        for j in range(len(names)):
            if i != j:
                n1, n2 = names[i], names[j]
                if lines[n1].distance(lines[n2]) < tol:
                    lines[n1] = snap(lines[n1], lines[n2], tolerance=tol)

polys = {}
for name in names:
    p = Polygon(lines[name])
    if not p.is_valid:
        p = make_valid(p)
    polys[name] = p
    coords = list(p.exterior.coords) if p.geom_type == 'Polygon' else []
    print(f"  {name}: {len(coords)} vertices")

print("\n=== Overlap check ===")
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        inter = polys[n1].intersection(polys[n2])
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  Overlap {n1} <-> {n2}: area = {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap area across all states: {total_overlap:.1f}")
