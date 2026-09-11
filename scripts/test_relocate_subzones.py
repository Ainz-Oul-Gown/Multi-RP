import json
import math
import random
import sys

sys.stdout.reconfigure(encoding='utf-8')
random.seed(42)

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)

# 8 km in world units:
# 1 SVG px = 4 km; scale ~ 6.05 world units per SVG px => 1 km ~ 1.5 world units
# 8 km ~ 12 world units
MAX_R_WORLD = 12.0
MIN_R_WORLD = 2.0

total_subzones = 0
for state in world['geography']['states']:
    for loc in state.get('locations', []):
        lx, ly = loc['pos_x'], loc['pos_y']
        subzones = loc.get('subzones', [])
        n_sz = len(subzones)
        if n_sz == 0:
            continue
            
        for i, sz in enumerate(subzones):
            total_subzones += 1
            # Evenly distribute angles around the location with jitter
            angle = (2.0 * math.pi * i / n_sz) + random.uniform(-0.3, 0.3)
            # Distance within 8 km (2.0 to 12.0 units)
            r = random.uniform(MIN_R_WORLD, MAX_R_WORLD)
            new_x = round(lx + r * math.cos(angle), 2)
            new_y = round(ly + r * math.sin(angle), 2)
            sz['pos_x'] = new_x
            sz['pos_y'] = new_y

print(f"Relocated {total_subzones} subzones in JSON across all states!")
