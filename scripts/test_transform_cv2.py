import json
import re
import numpy as np
import cv2
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

state_contours = {}
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
                rings.append(np.array(ring, dtype=np.float32))
        state_contours[sname] = rings

# 2. Load locations from Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

state_locs = {}
for s in world_data['geography']['states']:
    if s['name'] in state_id_to_name.values():
        state_locs[s['name']] = [(l['name'], l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

def test_transform(sx, ox, sy, oy):
    total = 0
    contained = 0
    details = {}
    for sname, locs in state_locs.items():
        rings = state_contours[sname]
        c = 0
        for name, wx, wy in locs:
            total += 1
            svg_x = (wx - ox) / sx
            svg_y = (wy - oy) / sy
            is_in = False
            for r in rings:
                # cv2.pointPolygonTest returns >= 0 if inside or on edge
                if cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), False) >= 0:
                    is_in = True
                    break
            if is_in:
                c += 1
                contained += 1
        details[sname] = (c, len(locs))
    return contained, total, details

c, t, d = test_transform(5.9125, -5325.7, -7.807, 4108.9)
print(f"Baseline transform (5.9125, -5325.7, -7.807, 4108.9): {c}/{t} contained")
for sname, (inc, tot) in d.items():
    print(f"  {sname}: {inc}/{tot}")
