import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

for name, pts in borders.items():
    xs = [p['x'] for p in pts]
    ys = [p['y'] for p in pts]
    print(f"{name}: {len(pts)} points")
    print(f"  X: [{min(xs)}, {max(xs)}], center={sum(xs)/len(xs):.1f}")
    print(f"  Y: [{min(ys)}, {max(ys)}], center={sum(ys)/len(ys):.1f}")
