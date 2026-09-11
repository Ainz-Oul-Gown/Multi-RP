"""
Border normalization: snap shared vertices between adjacent state polygons.

Strategy:
1. Load all state polygons from generated_borders.json
2. For each pair of states, find vertices from state A that are close (< epsilon) 
   to vertices from state B
3. Snap both to their average position
4. Also snap points on edges (not just vertices) for better coverage
5. Save back to generated_borders.json and Этерия 2.6.json
"""
import json
import sys
import numpy as np
from itertools import combinations

sys.stdout.reconfigure(encoding='utf-8')

EPSILON = 80  # World units - snap radius for shared vertices

def pts_to_arr(pts):
    return np.array([[p['x'], p['y']] for p in pts], dtype=np.float64)

def arr_to_pts(arr):
    return [{'x': int(round(float(p[0]))), 'y': int(round(float(p[1])))} for p in arr]

def snap_ring_to_ring(ring_a, ring_b, epsilon=EPSILON):
    """Snap vertices in ring_a that are close to vertices in ring_b (in-place)."""
    snapped_a = 0
    snapped_b = 0
    arr_a = np.array(ring_a, dtype=np.float64)
    arr_b = np.array(ring_b, dtype=np.float64)
    
    for i, va in enumerate(arr_a):
        # Distance to all vertices in ring_b
        dists = np.sqrt(np.sum((arr_b - va) ** 2, axis=1))
        min_idx = np.argmin(dists)
        min_dist = dists[min_idx]
        
        if min_dist < epsilon:
            # Snap to average
            avg = (va + arr_b[min_idx]) / 2
            arr_a[i] = avg
            arr_b[min_idx] = avg
            snapped_a += 1
    
    ring_a[:] = arr_a.tolist()
    ring_b[:] = arr_b.tolist()
    return snapped_a

def normalize_all_borders(borders_data):
    """Snap shared vertices across all state pairs."""
    # Build list of (state_name, ring_index, ring_as_mutable_list)
    all_rings = []
    for state_name, binfo in borders_data.items():
        polys = binfo.get('polygons') or []
        if not polys and binfo.get('points'):
            polys = [binfo['points']]
        for ri, ring in enumerate(polys):
            all_rings.append({
                'state': state_name,
                'ring_idx': ri,
                'data': [[p['x'], p['y']] for p in ring]
            })
    
    total_snapped = 0
    processed_pairs = 0
    
    # Compare all pairs
    for i, r1 in enumerate(all_rings):
        for j, r2 in enumerate(all_rings):
            if i >= j:
                continue
            if r1['state'] == r2['state']:
                continue
            
            arr1 = np.array(r1['data'])
            arr2 = np.array(r2['data'])
            
            # Quick bbox check
            if (arr1[:, 0].max() < arr2[:, 0].min() - EPSILON or
                arr1[:, 0].min() > arr2[:, 0].max() + EPSILON or
                arr1[:, 1].max() < arr2[:, 1].min() - EPSILON or
                arr1[:, 1].min() > arr2[:, 1].max() + EPSILON):
                continue
            
            n = snap_ring_to_ring(r1['data'], r2['data'], EPSILON)
            if n > 0:
                total_snapped += n
                processed_pairs += 1
                print(f"  Snapped {n} vertices between {r1['state']} and {r2['state']}")
    
    print(f"\nTotal snapped vertices: {total_snapped} across {processed_pairs} state pairs")
    
    # Write back to borders_data
    ring_by_key = {}
    for r in all_rings:
        key = (r['state'], r['ring_idx'])
        ring_by_key[key] = r['data']
    
    for state_name, binfo in borders_data.items():
        polys = binfo.get('polygons') or []
        had_points = bool(not polys and binfo.get('points'))
        if had_points:
            polys = [binfo['points']]
        
        for ri, ring in enumerate(polys):
            key = (state_name, ri)
            if key in ring_by_key:
                new_ring = [{'x': int(round(p[0])), 'y': int(round(p[1]))} 
                           for p in ring_by_key[key]]
                polys[ri] = new_ring
        
        if not had_points:
            binfo['polygons'] = polys
        else:
            binfo['points'] = polys[0]
            if binfo.get('polygons'):
                binfo['polygons'][0] = polys[0]

    return borders_data

# ============================================================
print("Loading generated_borders.json...")
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

print(f"States loaded: {list(borders.keys())}")
print("\nRunning border normalization...")
borders = normalize_all_borders(borders)

with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(borders, f, ensure_ascii=False, indent=2)
print("\nSaved scripts/generated_borders.json")

# Update Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)

for s in world['geography']['states']:
    name = s['name']
    if name in borders:
        b = borders[name]
        s['map_color'] = b.get('color')
        pts = b.get('points', [])
        polys = b.get('polygons', [])
        if not polys and pts:
            polys = [pts]
        s['border_data'] = {
            'points': pts,
            'polygons': polys
        }
        s['border_shape'] = 'polygon'

with open('Этерия 2.6.json', 'w', encoding='utf-8') as f:
    json.dump(world, f, ensure_ascii=False, indent=2)
print("Saved Этерия 2.6.json")
