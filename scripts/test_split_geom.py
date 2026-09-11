import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import split, unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Ensure correct swap
pts_sp = borders['Сумеречный Предел']['points']
if min(p['x'] for p in pts_sp) > 0:
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_poly(name):
    raw = borders[name]['points']
    pts = [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)

p_esk = get_poly('Эскорин')
p_roarn = get_poly('Роарн')

# Union of Eskorin and Roarn
u = unary_union([p_esk, p_roarn])

# Cut line: let's take the shared boundary line between them
# In Roarn, vertices close to Eskorin form the cut line
line_esk = p_esk.exterior
idx_cut = [i for i, pt in enumerate(p_roarn.exterior.coords) if line_esk.distance(Point(pt)) < 60]

cut_pts = [p_roarn.exterior.coords[i] for i in idx_cut]
# Extend cut line slightly beyond U at ends so it cleanly splits U
cut_line = LineString(cut_pts)

# Extend line by 50 units at both ends
p0 = np.array(cut_pts[0])
p1 = np.array(cut_pts[1])
v_start = (p0 - p1) / (np.linalg.norm(p0 - p1) + 1e-6) * 50

pn_1 = np.array(cut_pts[-2])
pn = np.array(cut_pts[-1])
v_end = (pn - pn_1) / (np.linalg.norm(pn - pn_1) + 1e-6) * 50

extended_cut = LineString([p0 + v_start] + cut_pts + [pn + v_end])

result = split(u, extended_cut)
print(f"Split produced {len(result.geoms)} parts:")
for i, g in enumerate(result.geoms):
    print(f"  Part {i}: area={g.area:.1f}, centroid={g.centroid}")
