import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for s in data['geography']['states']:
    print(f"State: {repr(s['name'])}")
    for l in s.get('locations', []):
        print(f"   {repr(l['name'])}: ({l.get('pos_x')}, {l.get('pos_y')}) type={l.get('type')}")
