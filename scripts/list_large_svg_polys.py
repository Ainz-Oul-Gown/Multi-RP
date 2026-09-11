import re
from shapely.geometry import Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

m_paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', text)
polys = []
for d_str in m_paths:
    subpaths = [p for p in d_str.split('M') if p.strip()]
    for sp in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 10:
            p = Polygon(pts)
            if p.is_valid and p.area > 5000:
                polys.append((p.area, pts, p.bounds))

# Sort by area descending
polys.sort(key=lambda x: x[0], reverse=True)
print(f"Total large polygons: {len(polys)}")
for area, pts, b in polys[:20]:
    print(f"  Area: {area:.1f}, {len(pts)} pts, bounds: ({b[0]:.1f}, {b[1]:.1f}) to ({b[2]:.1f}, {b[3]:.1f})")
