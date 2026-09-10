import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(svg_path, 'r', encoding='utf-8') as f:
    svg_content = f.read()

burgs = re.findall(r'<text\s+[^>]*id="burgLabel(\d+)"[^>]*x="([^"]+)"\s+y="([^"]+)"[^>]*>(.*?)</text>', svg_content)
print("First 20 SVG burgs:")
for bid, x, y, name in burgs[:20]:
    print(f"  {name!r} at ({x}, {y})")

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

print("\nFirst 20 locations in Этерия 2.6.json:")
for state in world_data.get('geography', {}).get('states', []):
    for loc in state.get('locations', [])[:3]:
        print(f"  {loc['name']!r} in {state['name']} at ({loc['pos_x']}, {loc['pos_y']})")
