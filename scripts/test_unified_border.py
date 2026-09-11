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

line_b = LineString(pts_b + [pts_b[0]])
line_a = LineString(pts_a + [pts_a[0]])

thresh = 65.0
idx_a = [i for i, pt in enumerate(pts_a) if line_b.distance(Point(pt)) < thresh]
idx_b = [j for j, pt in enumerate(pts_b) if line_a.distance(Point(pt)) < thresh]

# Roarn chain: idx_b from 0 to 30
chain_b = [pts_b[j] for j in idx_b]
line_cb = LineString(chain_b)

# Unified chain starts with all B vertices parameterized along line_cb
pts_on_line = []
for pt in chain_b:
    d = line_cb.project(Point(pt))
    pts_on_line.append((d, pt))

# Project A vertices onto line_cb
chain_a = [pts_a[i] for i in idx_a]
for pt in chain_a:
    p = Point(pt)
    d = line_cb.project(p)
    proj_p = line_cb.interpolate(d)
    # Midpoint between pt and proj_p
    mid_pt = ((pt[0] + proj_p.x)/2.0, (pt[1] + proj_p.y)/2.0)
    pts_on_line.append((d, mid_pt))

# Sort along line
pts_on_line.sort(key=lambda x: x[0])

# Filter duplicates within 15 units
unified_chain = []
for d, pt in pts_on_line:
    if not unified_chain:
        unified_chain.append(pt)
    else:
        prev = unified_chain[-1]
        dist = np.hypot(pt[0] - prev[0], pt[1] - prev[1])
        if dist > 15.0:
            unified_chain.append(pt)
        else:
            # average
            unified_chain[-1] = ((prev[0] + pt[0])/2.0, (prev[1] + pt[1])/2.0)

print(f"Unified chain length: {len(unified_chain)} vertices")

# Replace in Roarn: idx_b are 0..30
# Roarn was from 0 to 30, so:
new_pts_b = unified_chain + pts_b[idx_b[-1]+1:]

# Replace in Eskorin: idx_a are 80..90
# Eskorin matches reversed unified_chain!
new_pts_a = pts_a[:idx_a[0]] + list(reversed(unified_chain)) + pts_a[idx_a[-1]+1:]

poly_new_a = Polygon(new_pts_a)
poly_new_b = Polygon(new_pts_b)

print(f"New Eskorin vertices: {len(new_pts_a)}")
print(f"New Roarn vertices: {len(new_pts_b)}")
print(f"New overlap area: {poly_new_a.intersection(poly_new_b).area:.2f}")

# Check gap:
b_a = poly_new_a.buffer(10)
b_b = poly_new_b.buffer(10)
gap = b_a.intersection(b_b).difference(poly_new_a).difference(poly_new_b)
print(f"Gap area along border (within 10 units): {gap.area:.2f}")
