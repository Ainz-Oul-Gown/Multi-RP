import numpy as np

# State centers in SVG
# state25 (Эксорин): center (464.1, 512.7)
# state27 (Роарн): center (697.3, 404.1)
# state29 (Сильфето): center (903.8, 483.3)
# state28 (Нагетс): center (1137.7, 311.3)
# state26 (Дварфирз): center (1304.8, 633.9)

# World centers (from locations):
# Эскорин: (-2836, 98)
# Роарн: (-1272, 1422)
# Сильфето: (-94, -578)
# Нагетс: (1220, 1369)
# Дварфиз: (2578, -858)

svg_pts = np.array([
    [464.1, 512.7],
    [697.3, 404.1],
    [903.8, 483.3],
    [1137.7, 311.3],
    [1304.8, 633.9]
])

world_pts = np.array([
    [-2836, 98],
    [-1272, 1422],
    [-94, -578],
    [1220, 1369],
    [2578, -858]
])

# Let's test independent X and Y linear fits:
# wx = a * sx + b
# wy = c * sy + d
fit_x = np.polyfit(svg_pts[:, 0], world_pts[:, 0], 1)
fit_y = np.polyfit(svg_pts[:, 1], world_pts[:, 1], 1)

print(f"Independent fit:")
print(f"  wx = {fit_x[0]:.4f} * sx + {fit_x[1]:.4f}")
print(f"  wy = {fit_y[0]:.4f} * sy + {fit_y[1]:.4f}")

for i, name in enumerate(["Эскорин", "Роарн", "Сильфето", "Нагетс", "Дварфиз"]):
    pred_x = fit_x[0] * svg_pts[i, 0] + fit_x[1]
    pred_y = fit_y[0] * svg_pts[i, 1] + fit_y[1]
    print(f"{name}: pred=({pred_x:.1f}, {pred_y:.1f}) vs target=({world_pts[i, 0]}, {world_pts[i, 1]})")

# Also let's test full affine transformation:
# [wx, wy] = [sx, sy, 1] @ M
A = np.hstack([svg_pts, np.ones((5, 1))])
M_x, _, _, _ = np.linalg.lstsq(A, world_pts[:, 0], rcond=None)
M_y, _, _, _ = np.linalg.lstsq(A, world_pts[:, 1], rcond=None)

print(f"\nFull affine fit:")
print(f"  wx = {M_x[0]:.4f} * sx + {M_x[1]:.4f} * sy + {M_x[2]:.4f}")
print(f"  wy = {M_y[0]:.4f} * sx + {M_y[1]:.4f} * sy + {M_y[2]:.4f}")

for i, name in enumerate(["Эскорин", "Роарн", "Сильфето", "Нагетс", "Дварфиз"]):
    pred_x = A[i] @ M_x
    pred_y = A[i] @ M_y
    err = np.hypot(pred_x - world_pts[i, 0], pred_y - world_pts[i, 1])
    print(f"{name}: pred=({pred_x:.1f}, {pred_y:.1f}) vs target=({world_pts[i, 0]}, {world_pts[i, 1]}), err={err:.1f}")
