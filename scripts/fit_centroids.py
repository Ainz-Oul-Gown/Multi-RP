import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Pairs of (px, py) -> (wx, wy) from the 8 state centroids:
centroids = [
    ("Эскорин", 242.2, 292.5, -2835.0, 75.0),
    ("Роарн", 380.4, 227.8, -1272.0, 1422.0),
    ("Сильфето", 485.0, 275.0, -94.0, -578.0),
    ("Нагетс", 605.2, 189.3, 1220.0, 1369.0),
    ("Дварфиз", 729.5, 335.9, 2578.0, -869.0),
    ("Сумеречный Предел", 342.8, 401.1, -1262.0, -1478.0),
    ("Долина Шрамов", 560.0, 290.0, 433.0, 196.0),
    ("Песчаная Бездна", 770.0, 150.0, 3106.0, 1878.0),
]

pxs = np.array([c[1] for c in centroids])
pys = np.array([c[2] for c in centroids])
wxs = np.array([c[3] for c in centroids])
wys = np.array([c[4] for c in centroids])

# Fit wx = scale_x * px + off_x
# Fit wy = scale_y * py + off_y
sx, ox = np.polyfit(pxs, wxs, 1)
sy, oy = np.polyfit(pys, wys, 1)

print(f"sx = {sx:.4f}, ox = {ox:.4f}")
print(f"sy = {sy:.4f}, oy = {oy:.4f}")

print("\nCentroid fitting residuals:")
for name, px, py, wx, wy in centroids:
    pred_wx = sx * px + ox
    pred_wy = sy * py + oy
    err = np.hypot(pred_wx - wx, pred_wy - wy)
    print(f"  {name:20s}: pred=({pred_wx:6.1f}, {pred_wy:6.1f}) vs actual=({wx:6.1f}, {wy:6.1f}) -> err={err:5.1f} km")
