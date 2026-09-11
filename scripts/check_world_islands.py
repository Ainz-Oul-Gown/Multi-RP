import re
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def svg_to_world(x, y):
    return round(sx * x + ox, 1), round(sy * y + oy, 1)

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

state_defs = [
    ('state25', 'Эскорин'),
    ('state26', 'Дварфиз'),
    ('state27', 'Роарн'),
    ('state28', 'Нагетс'),
    ('state29', 'Сильфето'),
]

for sid, name in state_defs:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if not m: continue
    subpaths = [p for p in m.group(1).split('M') if p.strip()]
    polys = []
    for sp in subpaths:
        pts = [svg_to_world(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            # keep if area in world coordinates > 500
            if p.is_valid and p.area > 500:
                polys.append((p.area, pts, p))
    polys.sort(key=lambda x: x[0], reverse=True)
    print(f"{name}: 1 mainland + {len(polys)-1} islands (world areas: {[int(p[0]) for p in polys[1:]]})")
