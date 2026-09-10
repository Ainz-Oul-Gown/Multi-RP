import numpy as np
import json
import cv2
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

import test_containment
contours = test_containment.contours_px

# Let's test transform:
# wx = sx * px + ox
# wy = sy * py + oy
# Inverting: px = (wx - ox) / sx, py = (wy - oy) / sy

sx = 10.8089
ox = -5325.6952
sy = -14.2747
oy = 4108.9067

for s in data['geography']['states']:
    name = s['name']
    poly = contours[name].astype(np.float32)
    print(f"=== {name} ({len(poly)} vertices) ===")
    inside = 0
    for l in s.get('locations', []):
        wx = l['pos_x']
        wy = l['pos_y']
        px = (wx - ox) / sx
        py = (wy - oy) / sy
        d = cv2.pointPolygonTest(poly, (float(px), float(py)), True)
        status = "INSIDE" if d >= 0 else f"OUTSIDE ({d:.1f}px)"
        if d >= 0: inside += 1
        print(f"   {l['name']:30s}: world=({wx:5d},{wy:5d}) -> px=({px:5.1f},{py:5.1f}) {status}")
    print(f"Total inside: {inside}/{len(s.get('locations', []))}")
