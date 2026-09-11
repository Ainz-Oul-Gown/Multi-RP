import re
import shapely
from shapely.geometry import Polygon
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

svg_polys = {}
for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        # get main outer ring
        subpaths = [p for p in m.group(1).split('M') if p.strip()]
        rings = []
        for sp in subpaths:
            pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
            if len(pts) >= 3:
                rings.append(Polygon(pts))
        if rings:
            # take largest
            largest = max(rings, key=lambda p: p.area)
            svg_polys[sid] = largest

print("=== Overlaps in SVG raw polygons ===")
for s1 in svg_polys:
    for s2 in svg_polys:
        if s1 < s2:
            inter = svg_polys[s1].intersection(svg_polys[s2])
            print(f"SVG Overlap {s1} <-> {s2}: area = {inter.area:.2f}")
