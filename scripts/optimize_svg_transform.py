import json
import re
import numpy as np
import cv2
import sys

sys.stdout.reconfigure(encoding='utf-8')

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

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

state_locs = {}
for s in world_data['geography']['states']:
    if s['name'] in state_id_to_name.values():
        state_locs[s['name']] = [(l['name'], l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

sx, ox, sy, oy = 5.9125, -5325.7, -7.807, 4108.9

print("--- Locations outside baseline border ---")
for sname, locs in state_locs.items():
    rings = state_contours[sname]
    for name, wx, wy in locs:
        svg_x = (wx - ox) / sx
        svg_y = (wy - oy) / sy
        # find distance to contour
        best_dist = -999999
        for r in rings:
            d = cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), True)
            if d > best_dist:
                best_dist = d
        if best_dist < 0:
            print(f"  {sname} -> {name}: wx={wx}, wy={wy} (svg={svg_x:.1f}, {svg_y:.1f}), dist={best_dist:.1f} SVG px ({best_dist*abs(sx):.1f} world units)")

# Grid search / optimization to maximize containment or minimize distance outside
def score(params):
    sx, ox, sy, oy = params
    penalty = 0
    contained = 0
    for sname, locs in state_locs.items():
        rings = state_contours[sname]
        for name, wx, wy in locs:
            svg_x = (wx - ox) / sx
            svg_y = (wy - oy) / sy
            best_dist = -999999
            for r in rings:
                d = cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), True)
                if d > best_dist:
                    best_dist = d
            if best_dist >= 0:
                contained += 1
            else:
                penalty += (-best_dist) ** 2
    return penalty, contained

from scipy.optimize import minimize
res = minimize(lambda p: score(p)[0], [sx, ox, sy, oy], method='Nelder-Mead')
opt_params = res.x
penalty, contained = score(opt_params)
print(f"\nOptimized params: sx={opt_params[0]:.4f}, ox={opt_params[1]:.4f}, sy={opt_params[2]:.4f}, oy={opt_params[3]:.4f}")
print(f"Contained: {contained}/45, penalty: {penalty:.1f}")

# Check which are still outside
for sname, locs in state_locs.items():
    rings = state_contours[sname]
    for name, wx, wy in locs:
        svg_x = (wx - opt_params[1]) / opt_params[0]
        svg_y = (wy - opt_params[3]) / opt_params[2]
        best_dist = -999999
        for r in rings:
            d = cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), True)
            if d > best_dist:
                best_dist = d
        if best_dist < 0:
            print(f"  Still outside: {sname} -> {name}: dist={best_dist:.1f} SVG px ({best_dist*abs(opt_params[0]):.1f} world units)")
