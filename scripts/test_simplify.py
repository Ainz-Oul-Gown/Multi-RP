import re
import cv2
import numpy as np
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

state_main_rings = {}
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
        rings.sort(key=lambda r: len(r), reverse=True)
        state_main_rings[sname] = (rings[0], rings[1:])

sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

for sname, (main_ring, island_rings) in state_main_rings.items():
    arc_len = cv2.arcLength(main_ring, True)
    # Find epsilon such that points are between 60 and 120
    best_approx = None
    for eps_factor in np.linspace(0.0005, 0.01, 200):
        approx = cv2.approxPolyDP(main_ring, eps_factor * arc_len, True)
        if len(approx) >= 45 and len(approx) <= 95:
            best_approx = approx
            break
        elif len(approx) < 45 and best_approx is None:
            best_approx = approx
    
    if best_approx is None or len(best_approx) < 30:
        # lower epsilon
        best_approx = cv2.approxPolyDP(main_ring, 0.001 * arc_len, True)
    
    # Also check islands (keep islands with >= 8 points, simplify them)
    valid_islands = []
    for isl in island_rings:
        if len(isl) >= 15:
            i_approx = cv2.approxPolyDP(isl, 0.004 * cv2.arcLength(isl, True), True)
            if len(i_approx) >= 6:
                valid_islands.append(i_approx)

    print(f"{sname}: raw main ring={len(main_ring)} -> approx={len(best_approx)} pts. Islands kept: {len(valid_islands)} (lengths={[len(i) for i in valid_islands]})")
