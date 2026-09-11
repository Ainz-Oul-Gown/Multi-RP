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

# Define the 12 border contact pairs
border_pairs = [
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

# We will extract the shared border arc between each pair:
# For each pair (A, B):
# Find the segment of A close to B, and segment of B close to A
def extract_shared_arc(pts_a, pts_b, thresh=75.0):
    line_b = LineString(pts_b + [pts_b[0]])
    line_a = LineString(pts_a + [pts_a[0]])
    
    close_a = [i for i, pt in enumerate(pts_a) if line_b.distance(Point(pt)) < thresh]
    close_b = [j for j, pt in enumerate(pts_b) if line_a.distance(Point(pt)) < thresh]
    
    if len(close_a) < 2 or len(close_b) < 2:
        return None
        
    def longest_consecutive(indices, n):
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

    run_a = longest_consecutive(close_a, len(pts_a))
    run_b = longest_consecutive(close_b, len(pts_b))
    
    chain_a = [pts_a[i] for i in run_a]
    chain_b = [pts_b[j] for j in run_b]
    
    # Orient chain_a to match chain_b (or opposite)
    d_start_start = np.hypot(chain_a[0][0] - chain_b[0][0], chain_a[0][1] - chain_b[0][1])
    d_start_end   = np.hypot(chain_a[0][0] - chain_b[-1][0], chain_a[0][1] - chain_b[-1][1])
    
    line_ref = LineString(chain_b)
    if line_ref.length < 1e-3: return None
    
    # Project both sets of vertices onto line_ref
    pts_on_line = []
    for pt in chain_b:
        d = line_ref.project(Point(pt))
        pts_on_line.append((d, pt))
        
    for pt in chain_a:
        p = Point(pt)
        d = line_ref.project(p)
        proj_p = line_ref.interpolate(d)
        mid_pt = ((pt[0] + proj_p.x)/2.0, (pt[1] + proj_p.y)/2.0)
        pts_on_line.append((d, mid_pt))
        
    pts_on_line.sort(key=lambda x: x[0])
    
    # Merge close vertices (< 12 units)
    unified = []
    for d, pt in pts_on_line:
        if not unified:
            unified.append(pt)
        else:
            prev = unified[-1]
            dist = np.hypot(pt[0] - prev[0], pt[1] - prev[1])
            if dist > 12.0:
                unified.append(pt)
            else:
                unified[-1] = ((prev[0] + pt[0])/2.0, (prev[1] + pt[1])/2.0)
                
    # Return run_a, run_b, unified arc, and whether opposite
    return {
        'run_a': run_a,
        'run_b': run_b,
        'arc': unified,
        'is_opposite': (d_start_end < d_start_start)
    }

# Iteratively apply unified arcs
for it in range(3):
    print(f"Iteration {it+1}:")
    for n1, n2 in border_pairs:
        res = extract_shared_arc(state_pts[n1], state_pts[n2])
        if res:
            arc = res['arc']
            run_a = res['run_a']
            run_b = res['run_b']
            
            # Helper to replace run
            def replace_run(full, run, repl):
                if run[0] <= run[-1]:
                    return full[:run[0]] + repl + full[run[-1]+1:]
                else:
                    mid = full[run[-1]+1 : run[0]]
                    return repl + mid

            # Replace in B
            state_pts[n2] = replace_run(state_pts[n2], run_b, arc)
            
            # Replace in A
            repl_a = list(reversed(arc)) if res['is_opposite'] else arc
            state_pts[n1] = replace_run(state_pts[n1], run_a, repl_a)
            print(f"  {n1} <-> {n2}: {len(arc)} vertices unified")

# Verify polygon vertex counts
print("\nVertex counts after unification:")
for n in names:
    print(f"  {n}: {len(state_pts[n])} vertices")

# Measure overlaps
print("\n=== Overlap Measurements ===")
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1 = Polygon(state_pts[n1])
        p2 = Polygon(state_pts[n2])
        if not p1.is_valid: p1 = p1.buffer(0)
        if not p2.is_valid: p2 = p2.buffer(0)
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  {n1} <-> {n2}: overlap = {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap: {total_overlap:.1f}")
