import json
import re
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Load SVG state paths
svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Map state ID to name
state_id_to_name = {
    'state25': 'Эскорин', # SVG: Эксорин
    'state26': 'Дварфиз', # SVG: Дварфирз
    'state27': 'Роарн',
    'state28': 'Нагетс',
    'state29': 'Сильфето'
}

state_svg_polygons = {}
for sid, sname in state_id_to_name.items():
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        # Parse rings
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
        # Sort rings by point count / area descending
        rings.sort(key=lambda r: len(r), reverse=True)
        state_svg_polygons[sname] = rings
        print(f"{sname} ({sid}): {len(rings)} rings, largest has {len(rings[0])} pts")

# 2. Load locations from Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

state_locations = {}
for s in world_data['geography']['states']:
    state_locations[s['name']] = [(l['name'], l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

for sname, locs in state_locations.items():
    if locs:
        xs = [l[1] for l in locs]
        ys = [l[2] for l in locs]
        print(f"World locs {sname}: {len(locs)} locs, X=[{min(xs)}, {max(xs)}], Y=[{min(ys)}, {max(ys)}], center=({np.mean(xs):.1f}, {np.mean(ys):.1f})")
