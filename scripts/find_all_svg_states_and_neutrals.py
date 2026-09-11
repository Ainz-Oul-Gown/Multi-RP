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
            if p.is_valid and p.area > 5:
                polys.append(p)
    return polys

state_polys = {}
for sid, name in [('state25', 'Эскорин'), ('state26', 'Дварфиз'), ('state27', 'Роарн'), ('state28', 'Нагетс'), ('state29', 'Сильфето')]:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        polys = parse_svg_path(m.group(1))
        # Keep polygons with area > 100
        valid = [p for p in polys if p.area > 100]
        state_polys[name] = unary_union(valid)
        print(f"{name} ({sid}): area={state_polys[name].area:.1f}")

# Hole in 25+27+29 (Сумеречный Предел)
u_twilight = unary_union([state_polys['Эскорин'], state_polys['Роарн'], state_polys['Сильфето']])
twilight_hole = None
if u_twilight.geom_type == 'MultiPolygon':
    for g in u_twilight.geoms:
        for h in g.interiors:
            hp = Polygon(h)
            if 3000 < hp.area < 4500:
                twilight_hole = hp
                print(f"Сумеречный Предел found! Area={hp.area:.1f}, bounds={hp.bounds}")

# Check islands from sea_island or coastline for Песчаная Бездна
# Top-right island: x in [1300, 1800], y in [50, 350]
m_island = re.search(r'<g\s+[^>]*id="sea_island"[^>]*>(.*?)</g>', text, re.DOTALL)
if m_island:
    paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', m_island.group(1))
    for p in paths:
        subpaths = [sp for sp in p.split('M') if sp.strip()]
        for sp in subpaths:
            pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
            if len(pts) >= 3:
                poly = Polygon(pts)
                b = poly.bounds
                # Top right island bounds roughly x > 1200, y < 400
                if b[0] > 1100 and b[1] < 400 and poly.area > 5000:
                    print(f"Island found in sea_island: area={poly.area:.1f}, bounds={b}")
