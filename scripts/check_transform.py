import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(svg_path, 'r', encoding='utf-8') as f:
    svg_content = f.read()

# Check scale bar
scale_bar = re.search(r'<g\s+id="scaleBar"[^>]*>(.*?)</g>', svg_content, re.DOTALL)
if scale_bar:
    print("Scale bar:", scale_bar.group(0)[:500])

# Check viewbox
viewbox = re.search(r'viewBox="([^"]+)"', svg_content)
print("viewBox:", viewbox.group(1) if viewbox else "None")
width = re.search(r'width="([^"]+)"', svg_content)
height = re.search(r'height="([^"]+)"', svg_content)
print(f"width={width.group(1) if width else None}, height={height.group(1) if height else None}")

# Check burgLabels: id, x, y, name
burgs = re.findall(r'<text\s+[^>]*id="burgLabel(\d+)"[^>]*x="([^"]+)"\s+y="([^"]+)"[^>]*>(.*?)</text>', svg_content)
print(f"\nTotal burgLabels in SVG: {len(burgs)}")
svg_burg_dict = {}
for bid, x, y, name in burgs:
    svg_burg_dict[name.strip()] = (float(x), float(y))

# Load locations from Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

matched = []
for state in world_data.get('geography', {}).get('states', []):
    for loc in state.get('locations', []):
        name = loc.get('name')
        wx = loc.get('pos_x')
        wy = loc.get('pos_y')
        if name in svg_burg_dict and wx is not None and wy is not None:
            sx, sy = svg_burg_dict[name]
            matched.append((name, state['name'], sx, sy, wx, wy))

print(f"\nMatched locations with exact name in SVG: {len(matched)}")
for m in matched[:15]:
    print(f"  {m[0]} ({m[1]}): svg=({m[2]}, {m[3]}), world=({m[4]}, {m[5]})")
