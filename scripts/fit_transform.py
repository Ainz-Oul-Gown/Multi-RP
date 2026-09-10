import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In Azgaar, burg circle is a 5x5 or 7x7 circle:
# Center is white (or very light gray), surrounded by a black ring of radius ~3-4 pixels.
# Let's write a simple kernel: 
# Inner disk r <= 2 is +1
# Outer ring 2 < r <= 4 is -1

kernel = np.zeros((9, 9), dtype=np.float32)
for y in range(9):
    for x in range(9):
        r = np.sqrt((x-4)**2 + (y-4)**2)
        if r <= 2.0:
            kernel[y, x] = 1.0
        elif 2.0 < r <= 4.2:
            kernel[y, x] = -1.0

# Normalize kernel
kernel[kernel > 0] /= np.sum(kernel[kernel > 0])
kernel[kernel < 0] /= -np.sum(kernel[kernel < 0])

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
resp = cv2.filter2D(gray, -1, kernel)

# Regions where we know the capitals are located:
regions = {
    "Паровой Град (Нагетс)": (615, 140, 660, 185, 1200, 1300),
    "Великое Древо Жизни (Сильфето)": (475, 260, 520, 305, -100, -500),
    "Стальная Наковальня (Дварфирз)": (685, 290, 730, 335, 2400, -1100),
    "Клык-Гора (Роарн)": (360, 200, 405, 245, -1300, 1400),
    "Эскория (Эксорин)": (210, 350, 255, 395, -2600, -100),
}

capitals_found = []
for name, (x1, y1, x2, y2, wx, wy) in regions.items():
    sub_resp = resp[y1:y2, x1:x2]
    max_y, max_x = np.unravel_index(np.argmax(sub_resp), sub_resp.shape)
    best_px = x1 + max_x
    best_py = y1 + max_y
    val = sub_resp[max_y, max_x]
    print(f"{name}: px=({best_px}, {best_py}), resp={val:.1f} -> world=({wx}, {wy})")
    capitals_found.append((best_px, best_py, wx, wy))

# Now let's fit the affine transform:
# wx = s_x * px + t_x
# wy = s_y * py + t_y
pxs = [c[0] for c in capitals_found]
pys = [c[1] for c in capitals_found]
wxs = [c[2] for c in capitals_found]
wys = [c[3] for c in capitals_found]

fit_x = np.polyfit(pxs, wxs, 1)
fit_y = np.polyfit(pys, wys, 1)

print("\n--- Linear fit results ---")
print(f"world_x = {fit_x[0]:.4f} * px + {fit_x[1]:.4f}")
print(f"world_y = {fit_y[0]:.4f} * py + {fit_y[1]:.4f}")

# Check errors:
for name, (x1, y1, x2, y2, wx, wy), (px, py, _, _) in zip(regions.keys(), regions.values(), capitals_found):
    pred_x = fit_x[0] * px + fit_x[1]
    pred_y = fit_y[0] * py + fit_y[1]
    err_x = pred_x - wx
    err_y = pred_y - wy
    dist_err = np.sqrt(err_x**2 + err_y**2)
    print(f"{name}: pred=({pred_x:.1f}, {pred_y:.1f}) vs actual=({wx}, {wy}) -> error = {dist_err:.1f} km")
