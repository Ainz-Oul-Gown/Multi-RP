import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

for s in d['geography']['states']:
    for l in s.get('locations', []):
        if l.get('type') == 'village':
            szs = [sz['name'] for sz in l.get('subzones', [])]
            print(f"[{s['name']}] {l['name']} (pos: {l.get('pos_x')}, {l.get('pos_y')})")
            print(f"   Desc: {l.get('description', '')[:90]}")
            print(f"   Subzones: {szs}")
