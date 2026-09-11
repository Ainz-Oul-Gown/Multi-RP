import test_all_states_snap
from shapely.geometry import Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Let's test difference resolving
import unify_all_borders as u

polys = {name: Polygon(pts) for name, pts in u.state_polys.items()}

# Clean small remaining overlaps by difference
names = list(polys.keys())
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        p1, p2 = polys[n1], polys[n2]
        inter = p1.intersection(p2)
        if not inter.is_empty and inter.area > 1e-2:
            print(f"Resolving {n1} <-> {n2} overlap {inter.area:.1f}...")
            # We cut overlap from one and add to other, or split along midpoint
            # Let's subtract from the larger state or smaller state
            if p1.area > p2.area:
                polys[n1] = p1.difference(p2)
            else:
                polys[n2] = p2.difference(p1)

print("\n=== Overlap check after difference resolution ===")
total_overlap = 0
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        inter = polys[n1].intersection(polys[n2])
        if not inter.is_empty and inter.area > 1e-2:
            print(f"  Overlap {n1} <-> {n2}: {inter.area:.1f}")
            total_overlap += inter.area
print(f"Total overlap: {total_overlap:.1f}")
