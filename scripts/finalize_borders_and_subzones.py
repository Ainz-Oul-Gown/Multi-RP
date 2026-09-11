import json
import numpy as np
import math
import random
from shapely.geometry import Polygon, LineString, Point
from shapely.validation import make_valid
from scipy.spatial import KDTree
import sys

sys.stdout.reconfigure(encoding='utf-8')
random.seed(42)
np.random.seed(42)

print("=== STEP 1: LOAD DATA & FIX NEUTRAL NAMES ===")
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

# Ensure correct swap between Сумеречный Предел and Долина Шрамов
pts_sp = borders['Сумеречный Предел']['points']
min_x_sp = min(p['x'] if isinstance(p, dict) else p[0] for p in pts_sp)
if min_x_sp > 0:
    print("Swapping Сумеречный Предел and Долина Шрамов to match geographic reality...")
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

# Set colors
borders['Сумеречный Предел']['color'] = '#d0d0d0'
borders['Долина Шрамов']['color'] = '#d0d0d0'
borders['Песчаная Бездна']['color'] = '#d0d0d0'

def get_pts(data):
    raw = data['points']
    return [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]

state_pts = {name: get_pts(data) for name, data in borders.items()}
names = list(state_pts.keys())

print("=== STEP 2: UNIFY SHARED BORDERS & ADD MISSING VERTICES ===")
lines = {n: LineString(state_pts[n] + [state_pts[n][0]]) for n in names}

valid_pairs = set([
    tuple(sorted(['Эскорин', 'Роарн'])),
    tuple(sorted(['Эскорин', 'Сумеречный Предел'])),
    tuple(sorted(['Роарн', 'Сумеречный Предел'])),
    tuple(sorted(['Сильфето', 'Сумеречный Предел'])),
    tuple(sorted(['Эскорин', 'Сильфето'])),
    tuple(sorted(['Роарн', 'Сильфето'])),
    tuple(sorted(['Сильфето', 'Нагетс'])),
    tuple(sorted(['Сильфето', 'Дварфиз'])),
    tuple(sorted(['Сильфето', 'Долина Шрамов'])),
    tuple(sorted(['Нагетс', 'Долина Шрамов'])),
    tuple(sorted(['Дварфиз', 'Долина Шрамов'])),
    tuple(sorted(['Нагетс', 'Дварфиз'])),
])

thresh = 65.0
vertex_neighbor = {}
for name in names:
    pts = state_pts[name]
    v_n = []
    for i, pt in enumerate(pts):
        p = Point(pt)
        best_n = None
        best_d = thresh
        for other in names:
            if other != name and tuple(sorted([name, other])) in valid_pairs:
                d = lines[other].distance(p)
                if d < best_d:
                    best_d = d
                    best_n = other
        v_n.append(best_n)
    vertex_neighbor[name] = v_n

def get_runs_for_neighbor(v_n_list, neighbor_name):
    indices = [i for i, n in enumerate(v_n_list) if n == neighbor_name]
    if not indices: return []
    runs = []
    curr = [indices[0]]
    for idx in indices[1:]:
        if idx == curr[-1] + 1:
            curr.append(idx)
        else:
            runs.append(curr)
            curr = [idx]
    runs.append(curr)
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == len(v_n_list) - 1:
        wrapped = runs[-1] + runs[0]
        runs = runs[1:-1] + [wrapped]
    return max(runs, key=len)

pair_list = [
    ('Эскорин', 'Роарн'),
    ('Эскорин', 'Сумеречный Предел'),
    ('Роарн', 'Сумеречный Предел'),
    ('Сильфето', 'Сумеречный Предел'),
    ('Эскорин', 'Сильфето'),
    ('Роарн', 'Сильфето'),
    ('Сильфето', 'Нагетс'),
    ('Сильфето', 'Дварфиз'),
    ('Сильфето', 'Долина Шрамов'),
    ('Нагетс', 'Долина Шрамов'),
    ('Дварфиз', 'Долина Шрамов'),
    ('Нагетс', 'Дварфиз'),
]

replacements = {n: [] for n in names}
for n1, n2 in pair_list:
    run1 = get_runs_for_neighbor(vertex_neighbor[n1], n2)
    run2 = get_runs_for_neighbor(vertex_neighbor[n2], n1)
    
    if len(run1) < 2 or len(run2) < 2:
        continue

    pts1 = [state_pts[n1][i] for i in run1]
    pts2 = [state_pts[n2][j] for j in run2]

    if len(pts2) >= len(pts1):
        ref_pts, other_pts = pts2, pts1
    else:
        ref_pts, other_pts = pts1, pts2

    line_ref = LineString(ref_pts)
    pts_on_line = []
    for pt in ref_pts:
        d = line_ref.project(Point(pt))
        pts_on_line.append((d, pt))
        
    for pt in other_pts:
        p = Point(pt)
        d = line_ref.project(p)
        proj_p = line_ref.interpolate(d)
        mid_pt = ((pt[0] + proj_p.x)/2.0, (pt[1] + proj_p.y)/2.0)
        pts_on_line.append((d, mid_pt))

    pts_on_line.sort(key=lambda x: x[0])

    unified = []
    for d, pt in pts_on_line:
        if not unified:
            unified.append(pt)
        else:
            prev = unified[-1]
            if np.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 10.0:
                unified.append(pt)
            else:
                unified[-1] = ((prev[0] + pt[0])/2.0, (prev[1] + pt[1])/2.0)

    d1_start = np.hypot(pts1[0][0] - unified[0][0], pts1[0][1] - unified[0][1])
    d1_end   = np.hypot(pts1[0][0] - unified[-1][0], pts1[0][1] - unified[-1][1])
    arc1 = unified if d1_start <= d1_end else list(reversed(unified))

    d2_start = np.hypot(pts2[0][0] - unified[0][0], pts2[0][1] - unified[0][1])
    d2_end   = np.hypot(pts2[0][0] - unified[-1][0], pts2[0][1] - unified[-1][1])
    arc2 = unified if d2_start <= d2_end else list(reversed(unified))

    replacements[n1].append((run1, arc1, n2))
    replacements[n2].append((run2, arc2, n1))
    print(f"  Unified {n1} <-> {n2}: {len(unified)} vertices (merged from {len(pts1)} and {len(pts2)})")

new_state_pts = {}
for name in names:
    reps = replacements[name]
    if not reps:
        new_state_pts[name] = state_pts[name]
        continue
    pts = state_pts[name]
    idx_map = {}
    for run, arc, other in reps:
        for idx in run: idx_map[idx] = []
        idx_map[run[0]] = arc

    assembled = []
    for i in range(len(pts)):
        if i in idx_map: assembled.extend(idx_map[i])
        else: assembled.append(pts[i])
            
    cleaned = []
    for pt in assembled:
        if not cleaned or np.hypot(pt[0] - cleaned[-1][0], pt[1] - cleaned[-1][1]) > 3.0:
            cleaned.append(pt)
    new_state_pts[name] = cleaned

print("=== STEP 3: SNAP MULTI-STATE JUNCTIONS ===")
all_pts = []
pt_owners = []
for name, pts in new_state_pts.items():
    for idx, p in enumerate(pts):
        all_pts.append(p)
        pt_owners.append((name, idx))
all_pts = np.array(all_pts)

tree = KDTree(all_pts)
pairs = tree.query_pairs(r=25.0)

parent = list(range(len(all_pts)))
def find(i):
    if parent[i] == i: return i
    parent[i] = find(parent[i])
    return parent[i]

def union(i, j):
    ri, rj = find(i), find(j)
    if ri != rj: parent[ri] = rj

for i, j in pairs:
    if pt_owners[i][0] != pt_owners[j][0]:
        union(i, j)

clusters = {}
for i in range(len(all_pts)):
    root = find(i)
    if root not in clusters: clusters[root] = []
    clusters[root].append(i)

for root, members in clusters.items():
    if len(members) > 1:
        states = set(pt_owners[m][0] for m in members)
        if len(states) > 1:
            centroid = np.mean([all_pts[m] for m in members], axis=0)
            centroid = (round(centroid[0], 1), round(centroid[1], 1))
            for m in members:
                s_name, s_idx = pt_owners[m]
                new_state_pts[s_name][s_idx] = centroid

# Resolve any residual sub-pixel overlap
polys = {}
for name in names:
    p = Polygon(new_state_pts[name])
    if not p.is_valid: p = make_valid(p)
    polys[name] = p

# Eskorin & Roarn residual cut
inter_er = polys['Эскорин'].intersection(polys['Роарн'])
if not inter_er.is_empty and inter_er.area > 1e-2:
    polys['Роарн'] = polys['Роарн'].difference(polys['Эскорин'])

inter_rt = polys['Роарн'].intersection(polys['Сумеречный Предел'])
if not inter_rt.is_empty and inter_rt.area > 1e-2:
    polys['Роарн'] = polys['Роарн'].difference(polys['Сумеречный Предел'])

# Extract clean points back
final_state_points = {}
for name in names:
    p = polys[name]
    if p.geom_type == 'Polygon':
        coords = list(p.exterior.coords)[:-1]
    elif p.geom_type == 'MultiPolygon':
        # largest
        largest = max(p.geoms, key=lambda g: g.area)
        coords = list(largest.exterior.coords)[:-1]
    else:
        coords = new_state_pts[name]
        
    pts_dict = [{'x': round(c[0], 1), 'y': round(c[1], 1)} for c in coords]
    final_state_points[name] = pts_dict
    borders[name]['points'] = pts_dict
    borders[name]['polygons'] = [pts_dict]
    print(f"  {name}: {len(pts_dict)} final vertices")

# Save generated_borders.json
with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(borders, f, ensure_ascii=False, indent=2)
print("Saved scripts/generated_borders.json")

print("\n=== STEP 4: RELOCATE SUBLOCATIONS (8 KM RADIUS) ===")
# 8 km in world units ~ 12.0 units
MAX_R = 12.0
MIN_R = 2.0
total_subzones = 0

for state in world_data['geography']['states']:
    s_name = state['name']
    # update state border data in JSON
    if s_name in borders:
        state['map_color'] = borders[s_name]['color']
        state['border_data'] = {
            'points': borders[s_name]['points'],
            'polygons': borders[s_name]['polygons']
        }
        state['border_shape'] = 'polygon'

    # update subzones
    for loc in state.get('locations', []):
        lx, ly = loc['pos_x'], loc['pos_y']
        subzones = loc.get('subzones', [])
        n_sz = len(subzones)
        if n_sz == 0: continue
        
        for i, sz in enumerate(subzones):
            total_subzones += 1
            angle = (2.0 * math.pi * i / n_sz) + random.uniform(-0.35, 0.35)
            r = random.uniform(MIN_R, MAX_R)
            sz['pos_x'] = round(lx + r * math.cos(angle), 2)
            sz['pos_y'] = round(ly + r * math.sin(angle), 2)
            sz['radius'] = 0.35

print(f"Relocated {total_subzones} subzones around their locations within 8 km!")

with open('Этерия 2.6.json', 'w', encoding='utf-8') as f:
    json.dump(world_data, f, ensure_ascii=False, indent=2)
print("Saved Этерия 2.6.json")

print("\n=== VERIFY OVERLAPS ===")
total_ov = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1 = Polygon([(p['x'], p['y']) for p in borders[n1]['points']])
        p2 = Polygon([(p['x'], p['y']) for p in borders[n2]['points']])
        if not p1.is_valid: p1 = make_valid(p1)
        if not p2.is_valid: p2 = make_valid(p2)
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  Overlap {n1} <-> {n2}: {inter.area:.1f}")
            total_ov += inter.area
print(f"TOTAL OVERLAP ACROSS MAP: {total_ov:.2f}")
