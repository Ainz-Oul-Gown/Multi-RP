import numpy as np
import json
import cv2
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Load contours_px from test_containment
import test_containment
contours = test_containment.contours_px

# For each state, we have a list of cities:
state_cities = {}
for s in data['geography']['states']:
    state_cities[s['name']] = [(l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

# We want: wx = scale_x * (px - origin_x), wy = -scale_y * (py - origin_y)
# Inverting: px = origin_x + wx / scale_x, py = origin_y - wy / scale_y
# Let's search over (origin_x, origin_y, scale_x, scale_y)
# Initial estimate:
# origin_x ~ 485 (near center of Silfeto)
# origin_y ~ 275 (near center of Silfeto)
# scale_x ~ 10.0 to 11.5
# scale_y ~ 10.0 to 12.0

best_score = -1
best_params = None

for sx in np.linspace(9.0, 12.5, 36):
    for sy in np.linspace(9.0, 13.5, 36):
        for ox in np.linspace(460, 510, 26):
            for oy in np.linspace(240, 290, 26):
                # Check containment: how many of the 72 cities are inside their state polygon?
                inside_count = 0
                for name, cities in state_cities.items():
                    poly_px = contours[name].astype(np.float32)
                    for wx, wy in cities:
                        px = ox + wx / sx
                        py = oy - wy / sy
                        # cv2.pointPolygonTest
                        dist = cv2.pointPolygonTest(poly_px, (float(px), float(py)), False)
                        if dist >= 0:
                            inside_count += 1
                if inside_count > best_score:
                    best_score = inside_count
                    best_params = (sx, sy, ox, oy)
                    print(f"New best: {inside_count}/72 with sx={sx:.2f}, sy={sy:.2f}, ox={ox:.1f}, oy={oy:.1f}")
                    if inside_count == 72:
                        break
            if best_score == 72: break
        if best_score == 72: break
    if best_score == 72: break

print(f"\nFinal Best Score: {best_score}/72 with params: {best_params}")
