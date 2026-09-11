import re
import shapely
from shapely.geometry import Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's search all paths in svg for the top-right island
# In world coords, Peschanaya Bezdna is x in [2570, 3871], y in [1148, 2992]
# In SVG coords (sx = 6.055, ox = -5580.8, sy = -7.747, oy = 4161.3):
# svg_x = (wx - ox) / sx:
# (2570 - (-5580.8))/6.055 = 1346
# (3871 - (-5580.8))/6.055 = 1561
# svg_y = (wy - oy) / sy:
# (2992 - 4161.3)/(-7.747) = 150
# (1148 - 4161.3)/(-7.747) = 388
# So in SVG: x in [1340, 1570], y in [150, 390]!
print("Searching for island at SVG x in [1340, 1570], y in [150, 390]...")

m_paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', text)
found_islands = []
for d_str in m_paths:
    subpaths = [p for p in d_str.split('M') if p.strip()]
    for sp in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 10:
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            if 1300 <= min_x and max_x <= 1650 and 100 <= min_y and max_y <= 420:
                p = Polygon(pts)
                if p.is_valid and p.area > 5000:
                    found_islands.append((p.area, pts, (min_x, max_x, min_y, max_y)))

print(f"Found {len(found_islands)} matching paths:")
for area, pts, bounds in found_islands[:5]:
    print(f"  Area: {area:.1f}, {len(pts)} points, bounds={bounds}")
