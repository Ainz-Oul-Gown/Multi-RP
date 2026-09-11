import re
import shapely
from shapely.geometry import Polygon
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
    rings = []
    for sp in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            if p.is_valid and p.area > 5:
                rings.append((p.area, len(pts), pts))
                
    rings.sort(key=lambda r: r[0], reverse=True)
    print(f"=== {name} ({sid}): {len(rings)} total rings/islands ===")
    for idx, (area, n_pts, pts) in enumerate(rings):
        print(f"  Ring {idx}: area={area:.1f}, {n_pts} pts, sample pt=({pts[0][0]:.1f}, {pts[0][1]:.1f})")
