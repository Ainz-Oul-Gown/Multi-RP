import json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, LinearRing
from shapely.ops import nearest_points, snap, unary_union, split
from shapely.validation import make_valid
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

def get_pts(name):
    raw = borders[name]['points']
    return [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw]

p_esk = Polygon(get_pts('Эскорин'))
p_roarn = Polygon(get_pts('Роарн'))

inter = p_esk.intersection(p_roarn)
print(f"Initial overlap area: {inter.area:.1f}")

# The boundary between them in the overlap zone:
# Suppose we resolve the overlap by cutting it along the centerline, or assigning half to each:
# Or voronoi diagram of the vertices!
# Let's see: what if we take union of p_esk and p_roarn:
u = p_esk.union(p_roarn)
print(f"Union area: {u.area:.1f}")
# If we have the union, any dividing line splits u into two non-overlapping polygons!
