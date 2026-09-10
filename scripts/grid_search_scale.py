import re
import json
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

# Let's search over scale_x, scale_y, cx, cy
# wx = scale_x * (svg_x - cx)
# wy = -scale_y * (svg_y - cy)
best_score = -1
best_params = None

for s_x in np.linspace(5.0, 6.5, 31):
    for s_y in np.linspace(5.0, 8.5, 36):
        for cx in np.linspace(850, 950, 21):
            for cy in np.linspace(450, 550, 21):
                # test containment
                contained = 0
                total = 45
                for sname, locs in state_locs.items():
                    rings = state_contours[sname]
                    for name, wx, wy in locs:
                        svg_x = wx / s_x + cx
                        svg_y = -wy / s_y + cy
                        is_in = False
                        for r in rings:
                            if cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), False) >= 0:
                                is_in = True
                                break
                        if is_in:
                            contained += 1
                if contained > best_score:
                    best_score = contained
                    best_params = (s_x, s_y, cx, cy)
                    if contained == 45:
                        break
            if best_score == 45:
                break
        if best_score == 45:
            break
    if best_score == 45:
        break

print(f"Best containment: {best_score}/45")
s_x, s_y, cx, cy = best_params
print(f"Params: s_x={s_x:.4f}, s_y={s_y:.4f}, cx={cx:.1f}, cy={cy:.1f}")
print(f"Equivalent: wx = {s_x:.4f}*svg_x + {-s_x*cx:.1f}")
print(f"            wy = {-s_y:.4f}*svg_y + {s_y*cy:.1f}")

# Detail
for sname, locs in state_locs.items():
    rings = state_contours[sname]
    c = 0
    for name, wx, wy in locs:
        svg_x = wx / s_x + cx
        svg_y = -wy / s_y + cy
        is_in = False
        for r in rings:
            if cv2.pointPolygonTest(r, (float(svg_x), float(svg_y)), False) >= 0:
                is_in = True
                break
        if is_in:
            c += 1
    print(f"  {sname}: {c}/{len(locs)}")
