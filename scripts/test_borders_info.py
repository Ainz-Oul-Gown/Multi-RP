import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import nearest_points
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

for name, d in borders.items():
    pts = [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in d['points']]
    print(f"{name}: {len(pts)} vertices")
