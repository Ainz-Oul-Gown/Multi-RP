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

state_svgs = {}
for sid, name in [('state25', 'Эскорин'), ('state26', 'Дварфиз'), ('state27', 'Роарн'), ('state28', 'Нагетс'), ('state29', 'Сильфето')]:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        polys = parse_svg_path(m.group(1))
        # Keep main outer body
        u = unary_union(polys)
        state_svgs[name] = u
        print(f"{name}: area={u.area:.1f}, type={u.geom_type}")

# Check overlap between all pairs of SVG states
names = list(state_svgs.keys())
print("\n=== Overlap between SVG states ===")
for i in range(len(names)):
    for j in range(i+1, len(names)):
        n1, n2 = names[i], names[j]
        inter = state_svgs[n1].intersection(state_svgs[n2])
        print(f"  {n1} <-> {n2}: {inter.area:.3f}")
