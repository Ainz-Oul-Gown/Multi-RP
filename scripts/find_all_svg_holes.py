import re
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

def parse_svg_path(d_str):
    subpaths = [p for p in d_str.split('M') if p.strip()]
    polys = []
    for sp in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            if p.is_valid and p.area > 10:
                polys.append(p)
    return polys

state_svgs = {}
for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        polys = parse_svg_path(m.group(1))
        u = unary_union(polys)
        state_svgs[sid] = u

# Check union of 26, 28, 29
u_26_28_29 = unary_union([state_svgs['state26'], state_svgs['state28'], state_svgs['state29']])
if u_26_28_29.geom_type == 'MultiPolygon':
    for g_idx, geom in enumerate(u_26_28_29.geoms):
        for i, h in enumerate(geom.interiors):
            hp = Polygon(h)
            if hp.area > 50:
                print(f"Hole in 26+28+29: area={hp.area:.1f}, bounds={hp.bounds}")

# Also check all holes in union of ALL 5 states!
u_all = unary_union(list(state_svgs.values()))
print("\n=== ALL 5 STATES UNION HOLES ===")
if u_all.geom_type == 'MultiPolygon':
    for g_idx, geom in enumerate(u_all.geoms):
        for i, h in enumerate(geom.interiors):
            hp = Polygon(h)
            if hp.area > 200:
                print(f"Hole {i}: area={hp.area:.1f}, bounds={hp.bounds}")
elif u_all.geom_type == 'Polygon':
    for i, h in enumerate(u_all.interiors):
        hp = Polygon(h)
        if hp.area > 200:
            print(f"Hole {i}: area={hp.area:.1f}, bounds={hp.bounds}")
