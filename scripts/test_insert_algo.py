import json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

def get_pts(name):
    raw = borders[name]['points']
    return [(p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1]) for p in raw]

def insert_and_snap_pair(poly_a_pts, poly_b_pts, threshold=70.0):
    line_a = LineString(poly_a_pts + [poly_a_pts[0]])
    line_b = LineString(poly_b_pts + [poly_b_pts[0]])
    
    # 1. For each vertex in A, if close to B, project onto B and record insertion
    b_insertions = [] # list of (dist_along_b, proj_pt, a_idx)
    for i, pt in enumerate(poly_a_pts):
        p = Point(pt)
        dist = line_b.distance(p)
        if dist < threshold:
            proj_dist = line_b.project(p)
            proj_pt = line_b.interpolate(proj_dist)
            b_insertions.append((proj_dist, (proj_pt.x, proj_pt.y), i))
            
    # 2. For each vertex in B, if close to A, project onto A and record insertion
    a_insertions = [] # list of (dist_along_a, proj_pt, b_idx)
    for j, pt in enumerate(poly_b_pts):
        p = Point(pt)
        dist = line_a.distance(p)
        if dist < threshold:
            proj_dist = line_a.project(p)
            proj_pt = line_a.interpolate(proj_dist)
            a_insertions.append((proj_dist, (proj_pt.x, proj_pt.y), j))

    print(f"A insertions to B: {len(b_insertions)}")
    print(f"B insertions to A: {len(a_insertions)}")

insert_and_snap_pair(get_pts('Эскорин'), get_pts('Роарн'))
