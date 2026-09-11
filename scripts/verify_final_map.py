import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

try:
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 14)
    font_large = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 22)
    font_cap = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 15)
except Exception:
    font = None
    font_large = None
    font_cap = None

W, H = 1900, 1100
img = Image.new('RGB', (W, H), (15, 23, 42))
draw = ImageDraw.Draw(img)

all_x, all_y = [], []
for s in borders.values():
    for poly in s.get('polygons', [s['points']]):
        for p in poly:
            all_x.append(p['x'])
            all_y.append(p['y'])

min_x, max_x = min(all_x), max(all_x)
min_y, max_y = min(all_y), max(all_y)

pad = 50
scale_x = (W - 2 * pad) / (max_x - min_x)
scale_y = (H - 2 * pad) / (max_y - min_y)
scale = min(scale_x, scale_y)

ox = pad + (W - 2 * pad - (max_x - min_x) * scale) / 2 - min_x * scale
oy = pad + (H - 2 * pad - (max_y - min_y) * scale) / 2 - min_y * scale

def w2c(x, y):
    return int(round(ox + scale * x)), int(round(H - (oy + scale * y)))

colors = {
    'Эскорин': (187, 60, 176),
    'Роарн': (29, 185, 207),
    'Сильфето': (57, 137, 225),
    'Нагетс': (187, 226, 71),
    'Дварфиз': (126, 246, 88),
    'Песчаная Бездна': (240, 240, 240),
    'Сумеречный Предел': (240, 240, 240),
    'Долина Шрамов': (240, 240, 240),
}

# 1. Draw state polygons (mainland + all islands)
for name, s in borders.items():
    polys = s.get('polygons', [s['points']])
    c = colors.get(name, (180, 180, 180))
    fill_c = (c[0] // 3, c[1] // 3, c[2] // 3)
    for ring in polys:
        pts = [w2c(p['x'], p['y']) for p in ring]
        if len(pts) >= 3:
            draw.polygon(pts, fill=fill_c, outline=c)

# 2. Draw subzones (small cyan dots around parent location)
for state in world['geography']['states']:
    for loc in state.get('locations', []):
        for sz in loc.get('subzones', []):
            cx, cy = w2c(sz['pos_x'], sz['pos_y'])
            draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(150, 230, 255), outline=(0, 0, 0))

# 3. Draw locations
for state in world['geography']['states']:
    name = state['name']
    c = colors.get(name, (255, 255, 255))
    for loc in state.get('locations', []):
        cx, cy = w2c(loc['pos_x'], loc['pos_y'])
        is_cap = (loc.get('type') == 'capital')
        if is_cap:
            draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(255, 215, 0), outline=(0, 0, 0))
            draw.text((cx + 8, cy - 7), loc['name'], fill=(255, 255, 255), font=font_cap)
        else:
            draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=c, outline=(0, 0, 0))

# State names
for name, s in borders.items():
    pts = np.array([w2c(p['x'], p['y']) for p in s['points']])
    mid_x, mid_y = int(np.mean(pts[:, 0])), int(np.mean(pts[:, 1]))
    draw.text((mid_x - 35, mid_y), name, fill=(255, 255, 255), font=font_large)

draw.text((30, 25), "Этерия 2.6 — Все материки + ВСЕ ОСТРОВА + Подлокации", fill=(255, 255, 255), font=font_large)

img.save('scripts/map_verification_final.png')
print("Verification map saved to scripts/map_verification_final.png")
