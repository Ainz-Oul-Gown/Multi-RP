import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# 1. Bounding box of all states combined
all_state_pts = []
for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        for part in re.split(r'[ML]', d):
            part = part.strip()
            if part:
                xy = part.split(',')
                if len(xy) == 2:
                    try:
                        all_state_pts.append((float(xy[0]), float(xy[1])))
                    except:
                        pass

xs = [p[0] for p in all_state_pts]
ys = [p[1] for p in all_state_pts]
print("All 5 states SVG bbox:")
print(f"  X: [{min(xs):.1f}, {max(xs):.1f}], span={max(xs)-min(xs):.1f}")
print(f"  Y: [{min(ys):.1f}, {max(ys):.1f}], span={max(ys)-min(ys):.1f}")

# 2. Bounding box of all landmask paths (land_2 to land_44)
mask = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
all_land_pts = []
if mask:
    paths = re.findall(r'<path\s+[^>]*d="([^"]+)"[^>]*>', mask.group(1))
    for d in paths:
        # Land mask has curves C and lines L
        # Extract all coordinate pairs
        coords = re.findall(r'[-+]?\d*\.?\d+', d)
        for i in range(0, len(coords)-1, 2):
            all_land_pts.append((float(coords[i]), float(coords[i+1])))

if all_land_pts:
    lxs = [p[0] for p in all_land_pts]
    lys = [p[1] for p in all_land_pts]
    print("\nAll landmask SVG bbox:")
    print(f"  X: [{min(lxs):.1f}, {max(lxs):.1f}], span={max(lxs)-min(lxs):.1f}")
    print(f"  Y: [{min(lys):.1f}, {max(lys):.1f}], span={max(lys)-min(lys):.1f}")

# 3. Bounding box of all locations in Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

world_pts = []
for s in world_data['geography']['states']:
    for l in s.get('locations', []):
        world_pts.append((l['pos_x'], l['pos_y']))

wxs = [p[0] for p in world_pts]
wys = [p[1] for p in world_pts]
print("\nAll locations World bbox:")
print(f"  wx: [{min(wxs):.1f}, {max(wxs):.1f}], span={max(wxs)-min(wxs):.1f}")
print(f"  wy: [{min(wys):.1f}, {max(wys):.1f}], span={max(wys)-min(wys):.1f}")
