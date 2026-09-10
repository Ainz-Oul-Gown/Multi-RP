import numpy as np

# Centers in SVG:
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

svg_centers = {
    'Эскорин': (464.1, 512.7),
    'Роарн': (697.3, 404.1),
    'Сильфето': (903.8, 483.3),
    'Нагетс': (1137.7, 311.3),
    'Дварфиз': (1304.8, 633.9)
}

world_centers = {
    'Эскорин': (-2836, 98),
    'Роарн': (-1272, 1422),
    'Сильфето': (-94, -578),
    'Нагетс': (1220, 1369),
    'Дварфиз': (2578, -858)
}

# Look at X offsets from center (936):
for name in svg_centers:
    sx, sy = svg_centers[name]
    wx, wy = world_centers[name]
    dx = sx - 936
    dy = sy - 501
    print(f"{name:10s}: dx={dx:6.1f} -> wx={wx:6d} (ratio={wx/dx:5.2f}), dy={dy:6.1f} -> wy={wy:6d} (ratio={-wy/dy if dy!=0 else 0:5.2f})")
