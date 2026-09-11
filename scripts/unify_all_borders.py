import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load borders
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Fix swap if needed
pts_sp = borders['Сумеречный Предел']['points']
if min(p['x'] for p in pts_sp) > 0:
    print("Swapping Сумеречный Предел and Долина Шрамов...")
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_pts(data):
    raw = data['points']
    return [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]

state_polys = {name: get_pts(data) for name, data in borders.items()}

def unify_border_pair(pts_a, pts_b, thresh=60.0, min_dist=12.0):
    line_b = LineString(pts_b + [pts_b[0]])
    line_a = LineString(pts_a + [pts_a[0]])
    
    # Check if they are close at all
    if line_a.distance(line_b) > thresh:
        return pts_a, pts_b, 0
        
    n_a = len(pts_a)
    n_b = len(pts_b)
    
    close_a = [i for i, pt in enumerate(pts_a) if line_b.distance(Point(pt)) < thresh]
    close_b = [j for j, pt in enumerate(pts_b) if line_a.distance(Point(pt)) < thresh]
    
    if len(close_a) < 2 or len(close_b) < 2:
        return pts_a, pts_b, 0

    # Find longest contiguous run of indices (handling circular wrap)
    def longest_run(indices, n):
        if not indices: return []
        # Check consecutive runs
        runs = []
        curr = [indices[0]]
        for idx in indices[1:]:
            if idx == curr[-1] + 1:
                curr.append(idx)
            else:
                runs.append(curr)
                curr = [idx]
        runs.append(curr)
        # Check wrap-around
        if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == n - 1:
            wrapped = runs[-1] + runs[0]
            runs = runs[1:-1] + [wrapped]
        return max(runs, key=len)

    run_a = longest_run(close_a, n_a)
    run_b = longest_run(close_b, n_b)
    
    if len(run_a) < 2 or len(run_b) < 2:
        return pts_a, pts_b, 0

    chain_a = [pts_a[i] for i in run_a]
    chain_b = [pts_b[j] for j in run_b]
    
    # Check orientation
    d_start_start = np.hypot(chain_a[0][0] - chain_b[0][0], chain_a[0][1] - chain_b[0][1])
    d_start_end   = np.hypot(chain_a[0][0] - chain_b[-1][0], chain_a[0][1] - chain_b[-1][1])
    
    # We want chain_b to run in the same parameter direction as line_cb
    line_ref = LineString(chain_b)
    if line_ref.length < 1e-3:
        return pts_a, pts_b, 0
        
    # Collect all points along line_ref
    pts_on_line = []
    for pt in chain_b:
        d = line_ref.project(Point(pt))
        pts_on_line.append((d, pt))
        
    for pt in chain_a:
        p = Point(pt)
        d = line_ref.project(p)
        proj_p = line_ref.interpolate(d)
        mid_pt = ((pt[0] + proj_p.x) / 2.0, (pt[1] + proj_p.y) / 2.0)
        pts_on_line.append((d, mid_pt))
        
    pts_on_line.sort(key=lambda x: x[0])
    
    # Snap endpoints to common junctions
    if d_start_end < d_start_start:
        # Opposite direction: chain_a[0] connects near chain_b[-1], chain_a[-1] connects near chain_b[0]
        j_start = ((chain_a[-1][0] + chain_b[0][0])/2.0, (chain_a[-1][1] + chain_b[0][1])/2.0)
        j_end = ((chain_a[0][0] + chain_b[-1][0])/2.0, (chain_a[0][1] + chain_b[-1][1])/2.0)
    else:
        j_start = ((chain_a[0][0] + chain_b[0][0])/2.0, (chain_a[0][1] + chain_b[0][1])/2.0)
        j_end = ((chain_a[-1][0] + chain_b[-1][0])/2.0, (chain_a[-1][1] + chain_b[-1][1])/2.0)
        
    unified = [j_start]
    for d, pt in pts_on_line:
        prev = unified[-1]
        dist = np.hypot(pt[0] - prev[0], pt[1] - prev[1])
        if dist > min_dist:
            unified.append(pt)
        else:
            unified[-1] = ((prev[0] + pt[0])/2.0, (prev[1] + pt[1])/2.0)
    if np.hypot(unified[-1][0] - j_end[0], unified[-1][1] - j_end[1]) > min_dist:
        unified.append(j_end)
    else:
        unified[-1] = j_end

    # Replace in B
    # Note: run_b could wrap around
    def replace_subsequence(full_list, run, replacement):
        # if run does not wrap
        if run[0] <= run[-1]:
            return full_list[:run[0]] + replacement + full_list[run[-1]+1:]
        else:
            # wraps around 0: run = [start..n-1] + [0..end]
            # middle part is full_list[run[-1]+1 : run[0]]
            # We place replacement spanning wrap
            mid = full_list[run[-1]+1 : run[0]]
            return replacement + mid

    new_b = replace_subsequence(pts_b, run_b, unified)
    
    # In A: if opposite direction, use reversed(unified), else unified
    if d_start_end < d_start_start:
        replacement_a = list(reversed(unified))
    else:
        replacement_a = unified
        
    new_a = replace_subsequence(pts_a, run_a, replacement_a)
    
    return new_a, new_b, len(unified)

pairs = [
    ('Эскорин', 'Роарн'),
    ('Эскорин', 'Сумеречный Предел'),
    ('Роарн', 'Сумеречный Предел'),
    ('Эскорин', 'Сильфето'),
    ('Роарн', 'Сильфето'),
    ('Сильфето', 'Сумеречный Предел'),
    ('Сильфето', 'Нагетс'),
    ('Сильфето', 'Дварфиз'),
    ('Сильфето', 'Долина Шрамов'),
    ('Нагетс', 'Дварфиз'),
    ('Нагетс', 'Долина Шрамов'),
    ('Дварфиз', 'Долина Шрамов'),
]

for n1, n2 in pairs:
    pts1, pts2, n_shared = unify_border_pair(state_polys[n1], state_polys[n2])
    if n_shared > 0:
        state_polys[n1] = pts1
        state_polys[n2] = pts2
        print(f"  Unified {n1} <-> {n2}: {n_shared} shared vertices, {n1} now {len(pts1)} pts, {n2} now {len(pts2)} pts")

# Check overlaps
print("\n=== Final overlap check ===")
names = list(state_polys.keys())
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1 = Polygon(state_polys[n1])
        p2 = Polygon(state_polys[n2])
        if not p1.is_valid: p1 = p1.buffer(0)
        if not p2.is_valid: p2 = p2.buffer(0)
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  Overlap {n1} <-> {n2}: {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap area across all states: {total_overlap:.1f}")
