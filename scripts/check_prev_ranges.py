import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Let's inspect the coordinates of each state in generated_borders.json
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Let's see: in generated_borders.json:
for name, pts in borders.items():
    xs = [p['x'] for p in pts]
    ys = [p['y'] for p in pts]
    print(f"{name:20s}: X in [{min(xs):6d}, {max(xs):6d}], Y in [{min(ys):6d}, {max(ys):6d}]")
