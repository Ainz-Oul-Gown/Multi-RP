import cv2
import numpy as np
from PIL import Image
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load json
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Load image
img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Let's check city locations on the image directly!
# For each state, we have 9 locations with (pos_x, pos_y).
# Let's find the best affine transform (scale_x, scale_y, offset_x, offset_y)
# that maps (px, py) to (wx, wy) such that each state's cities lie inside the state's polygon mask!

state_defs = {
    "Эскорин": {
        "lower": (140, 40, 160), "upper": (170, 140, 240),
        "min_x": 70, "max_x": 420, "min_y": 70, "max_y": 420,
        "exclude_rect": (290, 380, 420, 460)
    },
    "Роарн": {
        "lower": (88, 60, 180), "upper": (98, 150, 245),
        "min_x": 260, "max_x": 520, "min_y": 100, "max_y": 350,
    },
    "Сильфето": {
        "lower": (100, 60, 200), "upper": (115, 140, 255),
        "min_x": 370, "max_x": 620, "min_y": 80, "max_y": 440,
    },
    "Нагетс": {
        "lower": (33, 50, 200), "upper": (48, 130, 255),
        "min_x": 520, "max_x": 750, "min_y": 70, "max_y": 360,
    },
    "Дварфиз": {
        "lower": (49, 50, 200), "upper": (70, 130, 255),
        "min_x": 550, "max_x": 920, "min_y": 200, "max_y": 480,
    },
    "Сумеречный Предел": {
        "lower": (140, 40, 160), "upper": (170, 140, 240),
        "min_x": 290, "max_x": 420, "min_y": 375, "max_y": 460,
    },
    "Долина Шрамов": {
        "is_white": True,
        "min_x": 520, "max_x": 620, "min_y": 250, "max_y": 360,
    },
    "Песчаная Бездна": {
        "is_white": True,
        "min_x": 680, "max_x": 880, "min_y": 60, "max_y": 240,
    }
}

# Extract contours for all 8 states:
contours_px = {}
for s in data['geography']['states']:
    name = s['name']
    cfg = state_defs.get(name)
    if not cfg: continue
    
    if cfg.get("is_white"):
        mask = cv2.inRange(hsv, (0, 0, 225), (180, 35, 255))
    else:
        mask = cv2.inRange(hsv, cfg["lower"], cfg["upper"])
    
    bbox_mask = np.zeros_like(mask)
    bbox_mask[cfg["min_y"]:cfg["max_y"], cfg["min_x"]:cfg["max_x"]] = 255
    if "exclude_rect" in cfg:
        ex = cfg["exclude_rect"]
        bbox_mask[ex[1]:ex[3], ex[0]:ex[2]] = 0
    mask = cv2.bitwise_and(mask, bbox_mask)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask_closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    cnts, _ = cv2.findContours(mask_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    main_cnt = max(cnts, key=cv2.contourArea)
    
    # We want at least 30-40 points
    # Let's dynamically find epsilon so points >= 35
    for eps_factor in np.linspace(0.005, 0.0005, 50):
        approx = cv2.approxPolyDP(main_cnt, eps_factor * cv2.arcLength(main_cnt, True), True)
        if len(approx) >= 32:
            break
    
    pts = approx.reshape(-1, 2)
    contours_px[name] = pts
    print(f"State {name}: extracted {len(pts)} points")

# Let's inspect city containment for different scales/offsets!
