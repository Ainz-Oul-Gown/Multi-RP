import re
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

state_meta = {
    'state25': {'name': 'Эскорин', 'color': '#bb3cb0', 'svg_name': 'Эксорин'},
    'state26': {'name': 'Дварфиз', 'color': '#7ef658', 'svg_name': 'Дварфирз'},
    'state27': {'name': 'Роарн', 'color': '#1db9cf', 'svg_name': 'Роарн'},
    'state28': {'name': 'Нагетс', 'color': '#bbe247', 'svg_name': 'Нагетс'},
    'state29': {'name': 'Сильфето', 'color': '#3989e1', 'svg_name': 'Сильфето'},
}

sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def svg_to_world(x, y):
    wx = int(round(sx * x + ox))
    wy = int(round(sy * y + oy))
    return wx, wy

states_output = {}

for sid, meta in state_meta.items():
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if not m:
        print(f"Error: {sid} not found!")
        continue
    
    d = m.group(1)
    rings = []
    for r_str in d.split('M'):
        if not r_str.strip():
            continue
        ring = []
        for p in r_str.split('L'):
            p = p.strip()
            if p:
                xy = p.split(',')
                if len(xy) == 2:
                    ring.append((float(xy[0]), float(xy[1])))
        if len(ring) >= 3:
            rings.append(np.array(ring, dtype=np.float32))
    
    rings.sort(key=lambda r: len(r), reverse=True)
    main_ring = rings[0]
    other_rings = rings[1:]
    
    # Simplify main ring to ~85-95 points (well above 30)
    arc_len = cv2.arcLength(main_ring, True)
    best_main = None
    for eps in np.linspace(0.0005, 0.005, 200):
        app = cv2.approxPolyDP(main_ring, eps * arc_len, True)
        if len(app) >= 80 and len(app) <= 95:
            best_main = app
            break
        elif len(app) < 80 and best_main is None:
            best_main = app
            
    if best_main is None or len(best_main) < 30:
        best_main = cv2.approxPolyDP(main_ring, 0.001 * arc_len, True)
        
    main_world_pts = []
    for pt in best_main.reshape(-1, 2):
        wx, wy = svg_to_world(pt[0], pt[1])
        main_world_pts.append({"x": wx, "y": wy})
        
    # Simplify islands
    all_polygons_world = [main_world_pts]
    for isl in other_rings:
        if len(isl) >= 15:
            i_app = cv2.approxPolyDP(isl, 0.004 * cv2.arcLength(isl, True), True)
            if len(i_app) >= 6:
                isl_world_pts = []
                for pt in i_app.reshape(-1, 2):
                    wx, wy = svg_to_world(pt[0], pt[1])
                    isl_world_pts.append({"x": wx, "y": wy})
                all_polygons_world.append(isl_world_pts)
                
    states_output[meta['name']] = {
        'color': meta['color'],
        'points': main_world_pts,
        'polygons': all_polygons_world
    }
    print(f"State {meta['name']}: main={len(main_world_pts)} pts, total polygons={len(all_polygons_world)}")

# Save to generated_borders.json
with open('scripts/generated_borders.json', 'w', encoding='utf-8') as f:
    json.dump(states_output, f, ensure_ascii=False, indent=2)

print("\nSaved to scripts/generated_borders.json successfully!")

# Draw verification image using PIL
img_w, img_h = 1600, 900
canvas = Image.new('RGB', (img_w, img_h), (25, 30, 40))
draw = ImageDraw.Draw(canvas, 'RGBA')

def world_to_img(wx, wy):
    ix = int(50 + (wx + 5000) / 10000.0 * 1500)
    iy = int(50 + (3500 - wy) / 6000.0 * 800)
    return ix, iy

def hex_to_rgba(h, a=80):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)

try:
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 12)
    font_large = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
except:
    font = None
    font_large = None

for sname, sdata in states_output.items():
    c_rgba = hex_to_rgba(sdata['color'], 90)
    c_stroke = hex_to_rgba(sdata['color'], 240)
    for ring in sdata['polygons']:
        pts = [world_to_img(p['x'], p['y']) for p in ring]
        if len(pts) >= 3:
            draw.polygon(pts, fill=c_rgba, outline=c_stroke)
    
    # Label
    main_xs = [p['x'] for p in sdata['points']]
    main_ys = [p['y'] for p in sdata['points']]
    cx, cy = world_to_img(sum(main_xs)/len(main_xs), sum(main_ys)/len(main_ys))
    if font_large:
        draw.text((cx, cy), sname, fill=(255, 255, 255, 255), font=font_large, anchor="mm")

# Draw locations from Этерия 2.6.json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world_data = json.load(f)

for s in world_data['geography']['states']:
    for l in s.get('locations', []):
        ix, iy = world_to_img(l['pos_x'], l['pos_y'])
        draw.ellipse([ix-4, iy-4, ix+4, iy+4], fill=(255, 255, 255, 240), outline=(0, 0, 0, 255))
        if font:
            draw.text((ix+6, iy-6), l['name'], fill=(220, 220, 220, 220), font=font)

canvas.save('scripts/map_verification.png')
print("Saved scripts/map_verification.png successfully!")
