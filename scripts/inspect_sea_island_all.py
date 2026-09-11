import re
from shapely.geometry import Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'<g\s+[^>]*id="sea_island"[^>]*>(.*?)</g>', text, re.DOTALL)
if m:
    paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', m.group(1))
    print(f"sea_island group has {len(paths)} paths:")
    for i, p in enumerate(paths):
        subpaths = [sp for sp in p.split('M') if sp.strip()]
        for j, sp in enumerate(subpaths):
            pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
            if len(pts) >= 3:
                poly = Polygon(pts)
                if poly.is_valid and poly.area > 20:
                    b = poly.bounds
                    print(f"  Path {i} sub {j}: area={poly.area:.1f}, {len(pts)} pts, bounds=({b[0]:.1f}, {b[1]:.1f}) to ({b[2]:.1f}, {b[3]:.1f})")
