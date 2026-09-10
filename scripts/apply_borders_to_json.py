import json

# Load generated borders
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Load Этерия 2.6.json
json_path = 'Этерия 2.6.json'
with open(json_path, 'r', encoding='utf-8') as f:
    world_data = json.load(f)

updated_count = 0
for s in world_data['geography']['states']:
    name = s['name']
    if name in borders:
        b_info = borders[name]
        s['border_shape'] = 'polygon'
        s['map_color'] = b_info['color']
        s['border_data'] = {
            'points': b_info['points'],
            'polygons': b_info['polygons']
        }
        print(f"Updated {name}: {len(b_info['points'])} main points, {len(b_info['polygons'])} total polygons, color={b_info['color']}")
        updated_count += 1
    else:
        # Grey zones / neutral lands
        s['border_shape'] = 'none'
        s['border_data'] = {}
        s['map_color'] = None
        print(f"Set neutral/none for {name}")

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(world_data, f, ensure_ascii=False, indent=2)

print(f"\nSuccessfully updated {json_path} (updated {updated_count} states)!")
