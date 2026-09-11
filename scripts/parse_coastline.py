import re
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'<g\s+[^>]*id="coastline"[^>]*>(.*?)</g>', text, re.DOTALL)
if m:
    paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', m.group(1))
    print(f"Coastline paths: {len(paths)}")
    polys = []
    for p in paths:
        subpaths = [sp for sp in p.split('M') if sp.strip()]
        for sp in subpaths:
            pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
            if len(pts) >= 3:
                poly = Polygon(pts)
                if poly.is_valid and poly.area > 10:
                    polys.append(poly)
    u_coast = unary_union(polys)
    print(f"Coast union area: {u_coast.area:.1f}, type={u_coast.geom_type}")
