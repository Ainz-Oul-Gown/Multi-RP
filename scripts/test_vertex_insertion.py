import json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, Point, LineString
from shapely.ops import snap, unary_union, polygonize
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load current borders
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

names = list(polys.keys())

# Let's test mutual snapping with tolerance
# When we snap A to B with tolerance T, vertices of B near edges of A are inserted into A,
# and vertices of A near vertices of B are moved to B.
# If we do mutual snap:
# A_snapped = snap(A, B, T)
# B_snapped = snap(B, A_snapped, T)
# A_snapped_again = snap(A_snapped, B_snapped, T)

print("Testing mutual snapping...")
snapped = {k: v for k, v in polys.items()}

for iteration in range(3):
    for i in range(len(names)):
        for j in range(len(names)):
            if i != j:
                n1, n2 = names[i], names[j]
                p1, p2 = snapped[n1], snapped[n2]
                if p1.distance(p2) < 60:
                    # Snap p1 to p2 boundary
                    snapped[n1] = snap(p1, p2.exterior, tolerance=60.0)

for name in names:
    orig_pts = len(polys[name].exterior.coords)
    new_pts = len(snapped[name].exterior.coords)
    print(f"  {name}: {orig_pts} -> {new_pts} coords")

# Now check overlaps
print("\n=== Overlaps after snapping ===")
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        inter = snapped[n1].intersection(snapped[n2])
        if not inter.is_empty and inter.area > 1e-2:
            print(f"Overlap {n1} <-> {n2}: area = {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap area after snap: {total_overlap:.1f}")
