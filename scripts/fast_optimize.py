import re
import json
import numpy as np
import cv2
import sys
from scipy.optimize import minimize

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

# Loss function: penalize squared distance of points outside their state
# Parameters: [sx, ox, sy, oy] where:
# wx = sx * svg_x + ox  => svg_x = (wx - ox) / sx
# wy = sy * svg_y + oy  => svg_y = (wy - oy) / sy
def loss_func(p):
    sx, ox, sy, oy = p
    if sx <= 0 or sy >= 0:
        return 1e9
    total_penalty = 0.0
    for sname, locs in state_locs.items():
        rings = state_contours[sname]
        for name, wx, wy in locs:
            svg_x = (wx - ox) / sx
            svg_y = (wy - oy) / sy
            best_dist = -1e9
            for r in rings:
                d = cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), True)
                if d > best_dist:
                    best_dist = d
            if best_dist < 0:
                # outside: penalize distance in world units
                total_penalty += (-best_dist * sx) ** 2
            else:
                # inside: slight reward
                total_penalty -= min(best_dist * sx, 50.0)
    return total_penalty

# Start from baseline:
init_p = [5.9125, -5325.7, -7.807, 4108.9]

res = minimize(loss_func, init_p, method='Nelder-Mead', options={'maxiter': 2000, 'disp': True})
opt_p = res.x
sx, ox, sy, oy = opt_p

print(f"\nOptimal Transform:")
print(f"  wx = {sx:.6f} * svg_x + {ox:.4f}")
print(f"  wy = {sy:.6f} * svg_y + {oy:.4f}")
print(f"Inverse:")
print(f"  svg_x = (wx - {ox:.4f}) / {sx:.6f}")
print(f"  svg_y = (wy - {oy:.4f}) / {sy:.6f}")

contained = 0
total = 0
for sname, locs in state_locs.items():
    rings = state_contours[sname]
    c = 0
    for name, wx, wy in locs:
        total += 1
        svg_x = (wx - ox) / sx
        svg_y = (wy - oy) / sy
        best_dist = -1e9
        for r in rings:
            d = cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), True)
            if d > best_dist:
                best_dist = d
        if best_dist >= 0:
            c += 1
            contained += 1
        else:
            print(f"  Outside: {sname} -> {name}: dist = {best_dist:.2f} SVG px ({best_dist*sx:.1f} world km)")
    print(f"  {sname}: {c}/{len(locs)} inside")

print(f"\nTotal contained: {contained}/{total}")
