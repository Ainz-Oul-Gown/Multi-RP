import re
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Transformation constants
sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def svg_to_world(x, y):
    wx = round(sx * x + ox, 1)
    wy = round(sy * y + oy, 1)
    return wx, wy

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

def parse_svg_path(d_str):
    subpaths = [p for p in d_str.split('M') if p.strip()]
    polys = []
    for sp in subpaths:
        pts = [svg_to_world(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            if p.is_valid and p.area > 500:
                polys.append(p)
    return polys

world_svg_polys = {}
for sid, name in [('state25', 'Эскорин'), ('state26', 'Дварфиз'), ('state27', 'Роарн'), ('state28', 'Нагетс'), ('state29', 'Сильфето')]:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        polys = parse_svg_path(m.group(1))
        world_svg_polys[name] = unary_union(polys)
        print(f"{name}: area={world_svg_polys[name].area:.1f}")

# Load generated_borders.json to compare areas
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    gb = json.load(f)

for name in world_svg_polys:
    raw = gb[name]['points']
    p_gb = Polygon([(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw])
    print(f"{name}: SVG area = {world_svg_polys[name].area:.1f}, Current GB area = {p_gb.area:.1f}")
