import re
import sys
import cv2
import numpy as np
import json

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Transform: SVG -> World
sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def svg_to_world(x, y):
    wx = int(round(sx * x + ox))
    wy = int(round(sy * y + oy))
    return wx, wy

def extract_coords(d):
    coords = re.findall(r'([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)', d)
    return [(float(x), float(y)) for x, y in coords]

# Get all land mask paths (43 paths)
mask_elem = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
land_contours = []
if mask_elem:
    path_tags = re.findall(r'<path\s+([^>]+)>', mask_elem.group(1))
    for attrs in path_tags:
        d_match = re.search(r'd="([^"]+)"', attrs)
        if d_match:
            pts = extract_coords(d_match.group(1))
            if len(pts) >= 3:
                land_contours.append(np.array(pts, dtype=np.float32))

# Get state contours (all rings)
state_ids = ['state25', 'state26', 'state27', 'state28', 'state29']
state_contours_all = {}
for sid in state_ids:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        rings = []
        for seg in d.split('M'):
            if not seg.strip():
                continue
            ring_pts = []
            for p in seg.split('L'):
                p = p.strip()
                if p:
                    xy = p.split(',')
                    if len(xy) == 2:
                        ring_pts.append((float(xy[0]), float(xy[1])))
            if len(ring_pts) >= 3:
                rings.append(np.array(ring_pts, dtype=np.float32))
        rings.sort(key=len, reverse=True)
        state_contours_all[sid] = rings

# Rasterize
W, H = 1872, 1002
land_canvas = np.zeros((H, W), dtype=np.uint8)
for pts in land_contours:
    cnt = pts.reshape(-1, 1, 2).astype(np.int32)
    cv2.fillPoly(land_canvas, [cnt], 255)

state_canvas = np.zeros((H, W), dtype=np.uint8)
for sid, rings in state_contours_all.items():
    for r in rings:
        cnt = r.reshape(-1, 1, 2).astype(np.int32)
        cv2.fillPoly(state_canvas, [cnt], 255)

# Neutral = land minus states
neutral_canvas = cv2.bitwise_and(land_canvas, cv2.bitwise_not(state_canvas))

# Find contours sorted by area
contours, _ = cv2.findContours(neutral_canvas, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
contours_by_area = sorted(contours, key=cv2.contourArea, reverse=True)

# Top 3 are our neutral zones
# Index 0 = Песчаная Бездна (top-right island, area=31242, center ~(1454,270))
# Index 1 = Сумеречный Предел (hole between states, area=3846, center ~(1046,577))
# Index 2 = Долина Шрамов (border region, area=3378, center ~(693,595))

neutral_zones = [
    ('Песчаная Бездна', contours_by_area[0]),
    ('Сумеречный Предел', contours_by_area[1]),
    ('Долина Шрамов', contours_by_area[2]),
]

for zone_name, cnt in neutral_zones:
    area = cv2.contourArea(cnt)
    bb = cv2.boundingRect(cnt)
    cx_svg = bb[0] + bb[2]//2
    cy_svg = bb[1] + bb[3]//2
    print(f"\n{zone_name}: area={area:.0f}, svg_center=({cx_svg},{cy_svg})")

# Generate simplified polygons
result = {}
for zone_name, raw_cnt in neutral_zones:
    arc_len = cv2.arcLength(raw_cnt, True)
    # Simplify to 40-80 points
    best = None
    for eps in np.linspace(0.005, 0.05, 100):
        app = cv2.approxPolyDP(raw_cnt, eps * arc_len, True)
        if 40 <= len(app) <= 80:
            best = app
            break
        elif len(app) < 40 and best is None:
            best = app

    if best is None or len(best) < 10:
        best = cv2.approxPolyDP(raw_cnt, 0.01 * arc_len, True)

    world_pts = []
    for pt in best.reshape(-1, 2):
        wx, wy = svg_to_world(pt[0], pt[1])
        world_pts.append({"x": wx, "y": wy})

    result[zone_name] = {
        "color": None,
        "points": world_pts,
        "polygons": [world_pts]
    }
    print(f"{zone_name}: {len(best)} simplified points")

print("\nGenerated neutral zone borders:")
for name, data in result.items():
    xs = [p['x'] for p in data['points']]
    ys = [p['y'] for p in data['points']]
    print(f"  {name}: {len(data['points'])} pts, X=[{min(xs)},{max(xs)}], Y=[{min(ys)},{max(ys)}]")

# Load existing generated_borders.json and merge
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    existing = json.load(f)

existing.update(result)

with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(existing, f, ensure_ascii=False, indent=2)

print("\nSaved to scripts/generated_borders.json (merged with existing state borders)")

# Update Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

for s in world_data['geography']['states']:
    name = s['name']
    if name in result:
        s['border_shape'] = 'polygon'
        s['border_data'] = {
            'points': result[name]['points'],
            'polygons': result[name]['polygons']
        }
        s['map_color'] = None
        print(f"Updated {name} in JSON: {len(result[name]['points'])} pts")

with open('Этерия 2.6.json', 'w', encoding='utf-8') as f:
    json.dump(world_data, f, ensure_ascii=False, indent=2)
print("\nSaved Этерия 2.6.json")

# Draw verification
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

from PIL import Image, ImageDraw, ImageFont
img_w, img_h = 1600, 900
canvas_img = Image.new('RGB', (img_w, img_h), (25, 30, 40))
draw = ImageDraw.Draw(canvas_img, 'RGBA')

def world_to_img(wx, wy):
    ix = int(50 + (wx + 5000) / 10000.0 * 1500)
    iy = int(50 + (3500 - wy) / 6000.0 * 800)
    return ix, iy

def hex_to_rgba(h, a=80):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)

state_colors = {
    'Эскорин': ('#bb3cb0', 90),
    'Дварфиз': ('#7ef658', 90),
    'Роарн': ('#1db9cf', 90),
    'Нагетс': ('#bbe247', 90),
    'Сильфето': ('#3989e1', 90),
    'Песчаная Бездна': ('#888888', 70),
    'Сумеречный Предел': ('#888888', 70),
    'Долина Шрамов': ('#888888', 70),
}

try:
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 14)
except:
    font = None

for s in world_data['geography']['states']:
    name = s['name']
    if s.get('border_shape') != 'polygon':
        continue
    polys = s.get('border_data', {}).get('polygons') or []
    if not polys:
        pts = s.get('border_data', {}).get('points', [])
        if pts:
            polys = [pts]
    color_hex, alpha = state_colors.get(name, ('#aaaaaa', 70))
    c_rgba = hex_to_rgba(color_hex, alpha)
    c_stroke = hex_to_rgba(color_hex, 230)
    for ring in polys:
        pts_img = [world_to_img(p['x'], p['y']) for p in ring]
        if len(pts_img) >= 3:
            draw.polygon(pts_img, fill=c_rgba, outline=c_stroke)
    if polys and polys[0]:
        main_xs = [p['x'] for p in polys[0]]
        main_ys = [p['y'] for p in polys[0]]
        cx, cy = world_to_img(sum(main_xs)/len(main_xs), sum(main_ys)/len(main_ys))
        if font:
            draw.text((cx, cy), name, fill=(255, 255, 255, 240), font=font, anchor="mm")

# Draw locations
for s in world_data['geography']['states']:
    for l in s.get('locations', []):
        ix, iy = world_to_img(l['pos_x'], l['pos_y'])
        draw.ellipse([ix-4, iy-4, ix+4, iy+4], fill=(255, 255, 255, 240), outline=(0, 0, 0, 255))

canvas_img.save('scripts/map_verification_all.png')
print("Saved scripts/map_verification_all.png")
