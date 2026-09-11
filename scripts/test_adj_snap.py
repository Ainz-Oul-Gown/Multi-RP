import json
import sys
from shapely.geometry import Polygon, LineString
from shapely.ops import snap
from shapely.validation import make_valid

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Correct swap between Сумеречный Предел and Долина Шрамов if needed
# Check bounds
pts_sp = borders['Сумеречный Предел']['points']
min_x_sp = min(p['x'] for p in pts_sp)
if min_x_sp > 0:
    print("Swapping Сумеречный Предел and Долина Шрамов to match geographic reality...")
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_pts(name):
    raw = borders[name]['points']
    return [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw]

adj_pairs = [
    ('Эскорин', 'Роарн'),
    ('Эскорин', 'Сильфето'),
    ('Эскорин', 'Сумеречный Предел'),
    ('Роарн', 'Сильфето'),
    ('Роарн', 'Сумеречный Предел'),
    ('Сильфето', 'Сумеречный Предел'),
    ('Сильфето', 'Нагетс'),
    ('Сильфето', 'Дварфиз'),
    ('Сильфето', 'Долина Шрамов'),
    ('Нагетс', 'Дварфиз'),
    ('Нагетс', 'Долина Шрамов'),
    ('Дварфиз', 'Долина Шрамов'),
]

lines = {}
for name in borders:
    pts = get_pts(name)
    lines[name] = LineString(pts + [pts[0]])

# Test snapping only adjacent pairs
tol = 80.0
for it in range(3):
    for n1, n2 in adj_pairs:
        lines[n1] = snap(lines[n1], lines[n2], tolerance=tol)
        lines[n2] = snap(lines[n2], lines[n1], tolerance=tol)
        lines[n1] = snap(lines[n1], lines[n2], tolerance=tol)

polys = {}
for name in borders:
    p = Polygon(lines[name])
    if not p.is_valid:
        p = make_valid(p)
    polys[name] = p
    coords = list(p.exterior.coords) if p.geom_type == 'Polygon' else []
    print(f"  {name}: {len(coords)} vertices")

print("\n=== Overlap check between true adjacent pairs ===")
total_overlap = 0
for n1, n2 in adj_pairs:
    inter = polys[n1].intersection(polys[n2])
    if not inter.is_empty and inter.area > 1e-2:
        print(f"  Overlap {n1} <-> {n2}: area = {inter.area:.1f}")
        total_overlap += inter.area
print(f"Total adjacent overlap area: {total_overlap:.1f}")
