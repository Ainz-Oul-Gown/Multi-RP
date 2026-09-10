import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

points = [
    # (name, px, py, wx, wy)
    ("Эскория (Эксорин)", 226, 364, -2600, -100),
    ("Великое Древо Жизни (Сильфето)", 483, 275, -100, -500),
    ("Клык-Гора (Роарн)", 379, 221, -1300, 1400),
    ("Паровой Град (Нагетс)", 620, 152, 1200, 1300),
    ("Стальная Наковальня (Дварфирз)", 703, 324, 2400, -1100),
    ("Бухта Контрабандистов (Сумеречный Предел)", 335, 410, -1300, -1400),
    ("Цитадель Крови (Долина Шрамов)", 560, 290, 450, 200),
    ("Жерло Игниса (Песчаная Бездна)", 765, 140, 3100, 1900),
]

pxs = np.array([p[1] for p in points])
pys = np.array([p[2] for p in points])
wxs = np.array([p[3] for p in points])
wys = np.array([p[4] for p in points])

# Fit affine: wx = ax * px + bx, wy = ay * py + by
ax, bx = np.polyfit(pxs, wxs, 1)
ay, by = np.polyfit(pys, wys, 1)

print(f"X transform: wx = {ax:.4f} * px + ({bx:.4f})")
print(f"Y transform: wy = {ay:.4f} * py + ({by:.4f})")

print("\nResiduals for 8 capitals:")
for name, px, py, wx, wy in points:
    pred_x = ax * px + bx
    pred_y = ay * py + by
    dx = pred_x - wx
    dy = pred_y - wy
    err = np.sqrt(dx**2 + dy**2)
    print(f"  {name:40s}: pred=({pred_x:6.1f}, {pred_y:6.1f}) vs actual=({wx:5d}, {wy:5d}) -> err={err:5.1f} km")

# Also check 2D affine (allowing small rotation/shear if any):
# [wx, wy] = [px, py, 1] * M
A = np.column_stack([pxs, pys, np.ones_like(pxs)])
Mx, _, _, _ = np.linalg.lstsq(A, wxs, rcond=None)
My, _, _, _ = np.linalg.lstsq(A, wys, rcond=None)

print("\nFull Affine Matrix:")
print(f"wx = {Mx[0]:.4f} * px + {Mx[1]:.4f} * py + {Mx[2]:.4f}")
print(f"wy = {My[0]:.4f} * px + {My[1]:.4f} * py + {My[2]:.4f}")

print("\nResiduals with Full Affine:")
for name, px, py, wx, wy in points:
    pred_x = Mx[0] * px + Mx[1] * py + Mx[2]
    pred_y = My[0] * px + My[1] * py + My[2]
    dx = pred_x - wx
    dy = pred_y - wy
    err = np.sqrt(dx**2 + dy**2)
    print(f"  {name:40s}: pred=({pred_x:6.1f}, {pred_y:6.1f}) vs actual=({wx:5d}, {wy:5d}) -> err={err:5.1f} km")
