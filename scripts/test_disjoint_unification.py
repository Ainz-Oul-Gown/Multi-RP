import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Load current borders
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Fix swap if needed
pts_sp = borders['Сумеречный Предел']['points']
if min(p['x'] for p in pts_sp) > 0:
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_pts(data):
    raw = data['points']
    return [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]

state_pts = {name: get_pts(data) for name, data in borders.items()}
names = list(state_pts.keys())

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

# For each state, tag each vertex with its closest valid neighbor if within threshold
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
    # Returns the list of indices where v_n == neighbor_name
    indices = [i for i, n in enumerate(v_n_list) if n == neighbor_name]
    if not indices:
        return []
    # If consecutive, return as is
    # If wraps around, reorder
    n = len(v_n_list)
    runs = []
    curr = [indices[0]]
    for idx in indices[1:]:
        if idx == curr[-1] + 1:
            curr.append(idx)
        else:
            runs.append(curr)
            curr = [idx]
    runs.append(curr)
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == n - 1:
        wrapped = runs[-1] + runs[0]
        runs = runs[1:-1] + [wrapped]
    return max(runs, key=len)

# Now for each valid pair, extract runs, merge into unified arc, and replace!
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

# We will record the replacements for each state to apply cleanly
# state_name -> list of (start_idx, end_idx, replacement_points)
replacements = {n: [] for n in names}

for n1, n2 in pair_list:
    run1 = get_runs_for_neighbor(vertex_neighbor[n1], n2)
    run2 = get_runs_for_neighbor(vertex_neighbor[n2], n1)
    
    if len(run1) < 2 or len(run2) < 2:
        print(f"Skipping pair {n1} <-> {n2} (run lengths: {len(run1)}, {len(run2)})")
        continue

    pts1 = [state_pts[n1][i] for i in run1]
    pts2 = [state_pts[n2][j] for j in run2]

    # Build reference line along the one with more vertices
    if len(pts2) >= len(pts1):
        ref_pts = pts2
        other_pts = pts1
    else:
        ref_pts = pts1
        other_pts = pts2

    line_ref = LineString(ref_pts)
    
    # Project all points onto line_ref
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

    # Unify with min_dist
    unified = []
    for d, pt in pts_on_line:
        if not unified:
            unified.append(pt)
        else:
            prev = unified[-1]
            if np.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 12.0:
                unified.append(pt)
            else:
                unified[-1] = ((prev[0] + pt[0])/2.0, (prev[1] + pt[1])/2.0)

    # Check orientation for n1 and n2
    # Determine whether run1 start matches unified[0] or unified[-1]
    d1_start = np.hypot(pts1[0][0] - unified[0][0], pts1[0][1] - unified[0][1])
    d1_end   = np.hypot(pts1[0][0] - unified[-1][0], pts1[0][1] - unified[-1][1])
    arc1 = unified if d1_start <= d1_end else list(reversed(unified))

    d2_start = np.hypot(pts2[0][0] - unified[0][0], pts2[0][1] - unified[0][1])
    d2_end   = np.hypot(pts2[0][0] - unified[-1][0], pts2[0][1] - unified[-1][1])
    arc2 = unified if d2_start <= d2_end else list(reversed(unified))

    replacements[n1].append((run1, arc1, n2))
    replacements[n2].append((run2, arc2, n1))
    print(f"  Prepared unified border {n1} <-> {n2}: {len(unified)} vertices (was {len(pts1)} and {len(pts2)})")

# Apply replacements to each state
new_state_pts = {}
for name in names:
    reps = replacements[name]
    if not reps:
        new_state_pts[name] = state_pts[name]
        continue
    
    # Sort replacements by start index of run
    # Note: handle non-wrapping runs first
    pts = state_pts[name]
    # Build new list of points:
    # Mark which original index is replaced by what
    idx_map = {} # original idx -> list of replacement points or None (deleted)
    # We assign: for a run [i0, i1, ..., ik], i0 gets the replacement arc, i1..ik get deleted (empty list)
    for run, arc, other in reps:
        # Check if run wrapped around
        for idx in run:
            idx_map[idx] = [] # mark as replaced/deleted
        idx_map[run[0]] = arc

    assembled = []
    for i in range(len(pts)):
        if i in idx_map:
            assembled.extend(idx_map[i])
        else:
            assembled.append(pts[i])
            
    # Clean duplicates in assembled
    cleaned = []
    for pt in assembled:
        if not cleaned or np.hypot(pt[0] - cleaned[-1][0], pt[1] - cleaned[-1][1]) > 5.0:
            cleaned.append(pt)
    new_state_pts[name] = cleaned
    print(f"  {name}: {len(pts)} -> {len(cleaned)} vertices")

# Overlap measurement
print("\n=== Final Overlap Check ===")
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1 = Polygon(new_state_pts[n1])
        p2 = Polygon(new_state_pts[n2])
        if not p1.is_valid: p1 = p1.buffer(0)
        if not p2.is_valid: p2 = p2.buffer(0)
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  Overlap {n1} <-> {n2}: {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap across all states: {total_overlap:.1f}")
