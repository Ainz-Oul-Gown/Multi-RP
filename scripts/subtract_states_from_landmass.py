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
            if p.is_valid and p.area > 50:
                polys.append(p)
    return polys

# Landmass: let's find the landmass paths
# In the SVG: let's check the group containing the 917663 area polygon
m_paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', text)
landmass_p = None
for d_str in m_paths:
    for sp in d_str.split('M'):
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 100:
            p = Polygon(pts)
            if p.is_valid and p.area > 800000:
                landmass_p = p
                break
    if landmass_p: break

print(f"Landmass polygon found: area={landmass_p.area:.1f}, {len(landmass_p.exterior.coords)} coords")

# States:
state_polys = []
state_dict = {}
for sid, name in [('state25', 'Эскорин'), ('state26', 'Дварфиз'), ('state27', 'Роарн'), ('state28', 'Нагетс'), ('state29', 'Сильфето')]:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        polys = parse_svg_path(m.group(1))
        u = unary_union(polys)
        state_polys.append(u)
        state_dict[name] = u

u_states = unary_union(state_polys)
print(f"Union of 5 states: area={u_states.area:.1f}")

diff = landmass_p.difference(u_states)
print(f"Difference (Landmass - States): type={diff.geom_type}, area={diff.area:.1f}")

parts = []
if diff.geom_type == 'Polygon':
    parts = [diff]
elif diff.geom_type == 'MultiPolygon':
    parts = list(diff.geoms)

# Sort parts by area
parts.sort(key=lambda p: p.area, reverse=True)
print(f"Number of remaining parts: {len(parts)}")
for i, p in enumerate(parts[:10]):
    b = p.bounds
    print(f"  Part {i}: area={p.area:.1f}, {len(p.exterior.coords)} coords, bounds: ({b[0]:.1f}, {b[1]:.1f}) to ({b[2]:.1f}, {b[3]:.1f})")
