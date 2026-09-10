import json
import glob
import os

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for s in data['geography']['states']:
    locs = s.get('locations', [])
    print(f"=== State: {s['name']} (shape: {s.get('border_shape')}) ===")
    if 'border_data' in s:
        print(f"  border_data: {s['border_data']}")
    for l in locs[:5]:
        print(f"  {l['name']}: ({l.get('pos_x')}, {l.get('pos_y')})")
