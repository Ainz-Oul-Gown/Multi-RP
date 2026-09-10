import json
import re
import numpy as np
from shapely.geometry import Point, Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Load SVG state paths
svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

state_id_to_name = {
    'state25': 'Эскорин',
    'state26': 'Дварфиз',
    'state27': 'Роарн',
    'state28': 'Нагетс',
    'state29': 'Сильфето'
}

state_polygons_svg = {}
for sid, sname in state_id_to_name.items():
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        rings = []
        for r_str in d.split('M'):
            if not r_str.strip():
                continue
            ring = []
            for p in r_str.split('L'):
                p = p.strip()
                if p:
                    xy = p.split(',')
                    if len(xy) == 2:
                        ring.append((float(xy[0]), float(xy[1])))
            if len(ring) >= 3:
                rings.append(ring)
        # Main ring is the largest
        rings.sort(key=lambda r: len(r), reverse=True)
        # Store all rings as polygons
        polys = [Polygon(r) for r in rings if len(r) >= 3]
        state_polygons_svg[sname] = polys

# 2. Load locations from Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

state_locs = {}
for s in world_data['geography']['states']:
    if s['name'] in state_id_to_name.values():
        state_locs[s['name']] = [(l['name'], l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

print("State locations count:")
for sname, locs in state_locs.items():
    print(f"  {sname}: {len(locs)} locations")

# Let's test a range of sx, ox, sy, oy:
# From our previous calculation:
# sx was ~ (10.8089 / 1.828125) = 5.9125
# ox was ~ -5325.7
# sy was ~ (-14.2747 / 1.828467) = -7.807
# oy was ~ 4108.9
# Let's check how many cities are contained under this transform:

def test_transform(sx, ox, sy, oy):
    total = 0
    contained = 0
    details = {}
    for sname, locs in state_locs.items():
        polys = state_svg_polygons[sname]
        c = 0
        for name, wx, wy in locs:
            total += 1
            # Inverse transform: from world (wx, wy) to svg (sx_pt, sy_pt)
            # wx = sx * svg_x + ox => svg_x = (wx - ox) / sx
            # wy = sy * svg_y + oy => svg_y = (wy - oy) / sy
            svg_x = (wx - ox) / sx
            svg_y = (wy - oy) / sy
            pt = Point(svg_x, svg_y)
            # check if inside any of the state's polygons
            is_in = any(poly.contains(pt) for poly in polys)
            if is_in:
                c += 1
                contained += 1
        details[sname] = (c, len(locs))
    return contained, total, details

# Test baseline
c, t, d = test_transform(5.9125, -5325.7, -7.807, 4108.9)
print(f"\nBaseline transform (5.9125, -5325.7, -7.807, 4108.9): {c}/{t} contained")
for sname, (inc, tot) in d.items():
    print(f"  {sname}: {inc}/{tot}")
