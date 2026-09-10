import cv2
import numpy as np
from PIL import Image
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Let's load the image and draw the polygons and cities to verify visually!
img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Let's test the transform:
# sx = 10.8
# sy = -14.3
# ox = -5325.0
# oy = 4108.0

# Let's create an overlay image where we draw:
# 1. State contour from image
# 2. Transformed city dots (px = (wx - ox)/sx, py = (wy - oy)/sy)
overlay = img.copy()

colors = {
    "Эскорин": (255, 0, 255),
    "Роарн": (255, 255, 0),
    "Сильфето": (255, 128, 0),
    "Нагетс": (0, 255, 255),
    "Дварфиз": (0, 255, 0),
    "Сумеречный Предел": (128, 0, 255),
    "Долина Шрамов": (255, 255, 255),
    "Песчаная Бездна": (200, 200, 200),
}

import test_containment
contours = test_containment.contours_px

# Let's draw contours on overlay
for name, cnt in contours.items():
    col = colors.get(name, (0, 0, 255))
    cv2.polylines(overlay, [cnt.astype(np.int32)], True, col, 2)

# Draw cities
sx = 10.8089
ox = -5325.6952
sy = -14.2747
oy = 4108.9067

for s in data['geography']['states']:
    name = s['name']
    col = colors.get(name, (0, 0, 255))
    for l in s.get('locations', []):
        wx = l['pos_x']
        wy = l['pos_y']
        px = int(round((wx - ox) / sx))
        py = int(round((wy - oy) / sy))
        if l.get('type') == 'capital':
            cv2.circle(overlay, (px, py), 5, (0, 0, 255), -1)
            cv2.circle(overlay, (px, py), 7, (255, 255, 255), 1)
        else:
            cv2.circle(overlay, (px, py), 3, (0, 0, 0), -1)
            cv2.circle(overlay, (px, py), 2, col, -1)

cv2.imwrite("scripts/map_overlay.png", overlay)
print("Overlay written to scripts/map_overlay.png")
