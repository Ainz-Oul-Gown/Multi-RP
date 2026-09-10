import json
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Using our transformation:
# wx = sx * svg_x + ox
# wy = sy * svg_y + oy
# => svg_x = (wx - ox) / sx
# => svg_y = (wy - oy) / sy

sx = 6.0549
ox = -5580.3612
sy = -7.7430
oy = 4159.6704

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

for s in world_data['geography']['states']:
    locs = s.get('locations', [])
    if not locs:
        continue
    svg_coords = []
    for l in locs:
        wx = l['pos_x']
        wy = l['pos_y']
        svg_x = (wx - ox) / sx
        svg_y = (wy - oy) / sy
        svg_coords.append((svg_x, svg_y))
    
    xs = [c[0] for c in svg_coords]
    ys = [c[1] for c in svg_coords]
    print(f"{s['name']}:")
    print(f"  SVG X: [{min(xs):.1f}, {max(xs):.1f}], center={np.mean(xs):.1f}")
    print(f"  SVG Y: [{min(ys):.1f}, {max(ys):.1f}], center={np.mean(ys):.1f}")
