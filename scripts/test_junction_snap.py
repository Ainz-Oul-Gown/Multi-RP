import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

import test_disjoint_unification as t

state_pts = t.new_state_pts
names = list(state_pts.keys())

# Let's find all pairs of vertices in state_pts that are within 30 units of each other across different states
# and cluster them to their exact centroid!
all_pts = []
pt_owners = [] # (state_name, pt_idx)
for name, pts in state_pts.items():
    for idx, p in enumerate(pts):
        all_pts.append(p)
        pt_owners.append((name, idx))

all_pts = np.array(all_pts)

# Cluster points within 25 units
from scipy.spatial import KDTree
tree = KDTree(all_pts)
pairs = tree.query_pairs(r=25.0)

# Build connected components for points in different states
parent = list(range(len(all_pts)))
def find(i):
    if parent[i] == i: return i
    parent[i] = find(parent[i])
    return parent[i]

def union(i, j):
    ri, rj = find(i), find(j)
    if ri != rj: parent[ri] = rj

for i, j in pairs:
    # Only cluster if they belong to different states
    if pt_owners[i][0] != pt_owners[j][0]:
        union(i, j)

clusters = {}
for i in range(len(all_pts)):
    root = find(i)
    if root not in clusters: clusters[root] = []
    clusters[root].append(i)

# For each cluster with > 1 point from different states, compute centroid and assign!
snapped_count = 0
for root, members in clusters.items():
    if len(members) > 1:
        # Check if multiple states
        states = set(pt_owners[m][0] for m in members)
        if len(states) > 1:
            centroid = np.mean([all_pts[m] for m in members], axis=0)
            centroid = (round(centroid[0], 1), round(centroid[1], 1))
            for m in members:
                s_name, s_idx = pt_owners[m]
                state_pts[s_name][s_idx] = centroid
                snapped_count += 1

print(f"Snapped {snapped_count} vertices at border junctions!")

# Final Overlap Check
print("\n=== Overlap Check After Junction Snapping ===")
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
            print(f"  Overlap {n1} <-> {n2}: {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap across all states: {total_overlap:.1f}")
