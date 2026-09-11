import re
import json
from shapely.geometry import Polygon
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Transformation constants from SVG to World
sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def svg_to_world(x, y):
    return round(sx * x + ox, 1), round(sy * y + oy, 1)

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Load current borders
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)

state_defs = [
    ('state25', 'Эскорин'),
    ('state26', 'Дварфиз'),
    ('state27', 'Роарн'),
    ('state28', 'Нагетс'),
    ('state29', 'Сильфето'),
]

# Extract all islands for each state from SVG
for sid, name in state_defs:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', svg_text)
    if not m: continue
    subpaths = [p for p in m.group(1).split('M') if p.strip()]
    rings = []
    for sp in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r'([0-9.]+),([0-9.]+)', sp)]
        if len(pts) >= 3:
            p = Polygon(pts)
            # Area in SVG > 25 (corresponds to > 1000 in world coordinates)
            if p.is_valid and p.area > 25:
                rings.append((p.area, p))
                
    # Sort descending by area: ring 0 is mainland, rings 1.. are islands!
    rings.sort(key=lambda r: r[0], reverse=True)
    islands = rings[1:]
    
    # We keep our carefully normalized seamless mainland polygon as ring 0!
    mainland_pts = borders[name]['points']
    all_polys = [mainland_pts]
    
    # Add each island, simplified with tolerance
    island_count = 0
    for area, isl_p in islands:
        # Simplify island slightly in SVG space (tolerance 1.0)
        simp_p = isl_p.simplify(1.0, preserve_topology=True)
        if not simp_p.is_valid: simp_p = isl_p
        
        # Transform coords to world
        coords = list(simp_p.exterior.coords)[:-1]
        if len(coords) < 3: continue
        
        world_pts = [{'x': round(sx * pt[0] + ox, 1), 'y': round(sy * pt[1] + oy, 1)} for pt in coords]
        all_polys.append(world_pts)
        island_count += 1
        
    borders[name]['polygons'] = all_polys
    print(f"State {name}: 1 mainland + {island_count} islands added to border_data.polygons!")

# Save to generated_borders.json
with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(borders, f, ensure_ascii=False, indent=2)
print("Saved scripts/generated_borders.json with all islands")

# Also update Этерия 2.6.json
for s in world['geography']['states']:
    s_name = s['name']
    if s_name in borders:
        s['border_data'] = {
            'points': borders[s_name]['points'],
            'polygons': borders[s_name]['polygons']
        }
        s['border_shape'] = 'polygon'

with open('Этерия 2.6.json', 'w', encoding='utf-8') as f:
    json.dump(world, f, ensure_ascii=False, indent=2)
print("Saved Этерия 2.6.json with all islands")
