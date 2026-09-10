import cv2
import numpy as np
from PIL import Image
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load image
img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

from scipy.optimize import minimize
import test_containment

contours = test_containment.contours_px

state_cities = {}
for s in data['geography']['states']:
    state_cities[s['name']] = [(l['pos_x'], l['pos_y']) for l in s.get('locations', [])]

# Initial guess from centroid fit:
# sx = 10.8089, ox = -5325.6952
# sy = -14.2747, oy = 4108.9067
x0 = [10.8, -5325.0, -14.3, 4108.0]

def loss(params):
    sx, ox, sy, oy = params
    total_penalty = 0.0
    for name, cities in state_cities.items():
        poly = contours[name].astype(np.float32)
        for wx, wy in cities:
            px = (wx - ox) / sx
            py = (wy - oy) / sy
            # dist > 0 is inside, < 0 is outside
            d = cv2.pointPolygonTest(poly, (float(px), float(py)), True)
            if d < 0:
                # Penalty for being outside: heavy squared penalty
                total_penalty += (-d)**2 * 100.0 + 1000.0
            else:
                # Reward for being comfortably inside
                total_penalty -= min(d, 15.0)
    return total_penalty

res = minimize(loss, x0, method='Nelder-Mead', options={'maxiter': 3000})
print("Optimization success:", res.success)
sx, ox, sy, oy = res.x
print(f"Optimal parameters: sx={sx:.4f}, ox={ox:.4f}, sy={sy:.4f}, oy={oy:.4f}")

# Check containment with optimal parameters
total_inside = 0
for name, cities in state_cities.items():
    poly = contours[name].astype(np.float32)
    c_inside = 0
    for wx, wy in cities:
        px = (wx - ox) / sx
        py = (wy - oy) / sy
        d = cv2.pointPolygonTest(poly, (float(px), float(py)), True)
        if d >= -0.5: # within half pixel
            c_inside += 1
    total_inside += c_inside
    print(f"  {name:20s}: {c_inside}/{len(cities)} inside")

print(f"\nTotal cities inside: {total_inside}/72")

