import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 5 capitals in SVG:
# burg559 (Эксорин): cx=394.2, cy=674.66
# burg561 (Роарн): cx=693.67, cy=404.83
# burg563 (Сильфето): cx=908.42, cy=543.92
# burg562 (Нагетс): cx=1114.88, cy=275.21
# burg560 (Дварфирз): cx=1276.1, cy=601.8

# 5 capitals in world coordinates:
# Эскория (Эскорин): (-2600, -100)
# Клык-Гора (Роарн): (-1300, 1400)
# Великое Древо Жизни (Сильфето): (-100, -500)
# Паровой Град (Нагетс): (1200, 1300)
# Стальная Наковальня (Дварфиз): (2400, -1100)

svg_capitals = np.array([
    [394.2, 674.66],
    [693.67, 404.83],
    [908.42, 543.92],
    [1114.88, 275.21],
    [1276.1, 601.8]
])

world_capitals = np.array([
    [-2600, -100],
    [-1300, 1400],
    [-100, -500],
    [1200, 1300],
    [2400, -1100]
])

names = ["Эскория", "Клык-Гора", "Великое Древо Жизни", "Паровой Град", "Стальная Наковальня"]

# 1. Independent linear fit:
# wx = sx * cx + ox
# wy = sy * cy + oy
fit_x = np.polyfit(svg_capitals[:, 0], world_capitals[:, 0], 1)
fit_y = np.polyfit(svg_capitals[:, 1], world_capitals[:, 1], 1)

print(f"Independent linear fit:")
print(f"  sx = {fit_x[0]:.6f}, ox = {fit_x[1]:.4f}")
print(f"  sy = {fit_y[0]:.6f}, oy = {fit_y[1]:.4f}")

for i, name in enumerate(names):
    pred_x = fit_x[0] * svg_capitals[i, 0] + fit_x[1]
    pred_y = fit_y[0] * svg_capitals[i, 1] + fit_y[1]
    dx = pred_x - world_capitals[i, 0]
    dy = pred_y - world_capitals[i, 1]
    err = np.hypot(dx, dy)
    print(f"  {name:22s}: pred=({pred_x:7.1f}, {pred_y:7.1f}) vs target=({world_capitals[i, 0]:5d}, {world_capitals[i, 1]:5d}) -> err={err:5.1f}")

# 2. Full affine fit (allows small rotation / shear):
A = np.hstack([svg_capitals, np.ones((5, 1))])
Mx, _, _, _ = np.linalg.lstsq(A, world_capitals[:, 0], rcond=None)
My, _, _, _ = np.linalg.lstsq(A, world_capitals[:, 1], rcond=None)

print(f"\nFull affine fit:")
print(f"  wx = {Mx[0]:.6f} * cx + {Mx[1]:.6f} * cy + {Mx[2]:.4f}")
print(f"  wy = {My[0]:.6f} * cx + {My[1]:.6f} * cy + {My[2]:.4f}")

for i, name in enumerate(names):
    pred_x = A[i] @ Mx
    pred_y = A[i] @ My
    err = np.hypot(pred_x - world_capitals[i, 0], pred_y - world_capitals[i, 1])
    print(f"  {name:22s}: pred=({pred_x:7.1f}, {pred_y:7.1f}) vs target=({world_capitals[i, 0]:5d}, {world_capitals[i, 1]:5d}) -> err={err:5.1f}")
