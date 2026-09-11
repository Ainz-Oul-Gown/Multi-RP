import json
import re
from shapely.geometry import Polygon, Point
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load world
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)

# Load island polygons
import check_world_islands as c

# For each state, check if any location was inside one of its islands
for sid, name in c.state_defs:
    # get polys for this state
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', c.text)
    if not m: continue
    subpaths = [p for p in m.group(1).split('M') if p.strip()]
    polys = []
    for sp in subpaths:
        pts = [c.svg_to_world(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            if p.is_valid and p.area > 500:
                polys.append(p)
    polys.sort(key=lambda p: p.area, reverse=True)
    islands = polys[1:]
    
    # Find locations in state
    state_locs = []
    for s in world['geography']['states']:
        if s['name'] == name:
            state_locs = s.get('locations', [])
            break
            
    print(f"\nState {name}: {len(state_locs)} locations, {len(islands)} islands")
    for loc in state_locs:
        pt = Point(loc['pos_x'], loc['pos_y'])
        for idx, isl in enumerate(islands):
            if isl.contains(pt):
                print(f"  Location {loc['name']} is on Island #{idx+1} (area {isl.area:.0f})!")
