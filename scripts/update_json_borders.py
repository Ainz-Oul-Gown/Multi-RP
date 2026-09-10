import json
import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Run generation and update Этерия 2.6.json
from generate_all_state_polygons import generated_borders

json_path = 'Этерия 2.6.json'
with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for s in data['geography']['states']:
    name = s['name']
    if name in generated_borders:
        s['border_shape'] = 'polygon'
        s['border_data'] = {
            'points': generated_borders[name]
        }
        print(f"Updated '{name}' in {json_path} with {len(generated_borders[name])} vertices.")

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nSaved updated {json_path} successfully!")

# Also save generated_borders to a standalone json file for node / sql
with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(generated_borders, f, ensure_ascii=False, indent=2)

print("Saved scripts/generated_borders.json successfully!")
