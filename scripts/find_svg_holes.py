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
        # union all polys for this state
        u = unary_union(polys)
        state_svgs[sid] = u
        print(f"{sid}: area = {u.area:.1f}, type={u.geom_type}")

# Now let's union state25, 27, 29:
u_3 = unary_union([state_svgs['state25'], state_svgs['state27'], state_svgs['state29']])
print(f"Union of 25, 27, 29: type={u_3.geom_type}")
# Check interiors (holes)
if u_3.geom_type == 'Polygon':
    print(f"Holes in union: {len(u_3.interiors)}")
    for i, h in enumerate(u_3.interiors):
        hp = Polygon(h)
        print(f"  Hole {i}: area={hp.area:.1f}, bounds={hp.bounds}")
elif u_3.geom_type == 'MultiPolygon':
    for g_idx, geom in enumerate(u_3.geoms):
        if len(geom.interiors) > 0:
            print(f"Geom {g_idx} has {len(geom.interiors)} holes:")
            for i, h in enumerate(geom.interiors):
                hp = Polygon(h)
                print(f"  Hole {i}: area={hp.area:.1f}, bounds={hp.bounds}")
