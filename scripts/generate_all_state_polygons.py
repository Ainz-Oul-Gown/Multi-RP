import cv2
import numpy as np
from PIL import Image
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Load image
img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Load json
json_path = 'Этерия 2.6.json'
with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Transformation coefficients
sx = 10.8089
ox = -5325.6952
sy = -14.2747
oy = 4108.9067

def px_to_world(px, py):
    wx = sx * px + ox
    wy = sy * py + oy
    return int(round(wx)), int(round(wy))

# State definitions for exact segmentation from image:
# Colors:
# Эксорин: Pink/Magenta
# Роарн: Cyan
# Сильфето: Sky Blue
# Нагетс: Yellow-Green/Lime
# Дварфиз: Mint/Light Green
# Сумеречный Предел: Southern pink island
# Долина Шрамов: White central enclave
# Песчаная Бездна: White north-eastern landmass

state_configs = {
    "Эскорин": {
        "lower": (140, 40, 160), "upper": (170, 140, 240),
        "min_x": 70, "max_x": 420, "min_y": 70, "max_y": 420,
        "exclude_rect": (290, 380, 420, 460),
        "target_pts": 45
    },
    "Роарн": {
        "lower": (88, 60, 180), "upper": (98, 150, 245),
        "min_x": 260, "max_x": 520, "min_y": 100, "max_y": 350,
        "target_pts": 40
    },
    "Сильфето": {
        "lower": (100, 60, 200), "upper": (115, 140, 255),
        "min_x": 370, "max_x": 620, "min_y": 80, "max_y": 440,
        "target_pts": 48
    },
    "Нагетс": {
        "lower": (33, 50, 200), "upper": (48, 130, 255),
        "min_x": 520, "max_x": 750, "min_y": 70, "max_y": 360,
        "target_pts": 42
    },
    "Дварфиз": {
        "lower": (49, 50, 200), "upper": (70, 130, 255),
        "min_x": 550, "max_x": 920, "min_y": 200, "max_y": 480,
        "target_pts": 50
    },
    "Сумеречный Предел": {
        "lower": (140, 40, 160), "upper": (170, 140, 240),
        "min_x": 290, "max_x": 420, "min_y": 375, "max_y": 460,
        "target_pts": 36
    },
    "Долина Шрамов": {
        "is_white": True,
        "min_x": 520, "max_x": 620, "min_y": 250, "max_y": 360,
        "target_pts": 36
    },
    "Песчаная Бездна": {
        "is_white": True,
        "min_x": 680, "max_x": 880, "min_y": 60, "max_y": 240,
        "target_pts": 40
    }
}

generated_borders = {}

for s in data['geography']['states']:
    name = s['name']
    cfg = state_configs.get(name)
    if not cfg:
        print(f"Warning: No config for {name}")
        continue
    
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
    
    # Morph close to connect across roads/text
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask_closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    cnts, _ = cv2.findContours(mask_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    main_cnt = max(cnts, key=cv2.contourArea)
    arc_len = cv2.arcLength(main_cnt, True)
    
    # Target points >= 35
    target = cfg["target_pts"]
    best_approx = None
    min_diff = 9999
    
    for eps_factor in np.linspace(0.0001, 0.015, 300):
        approx = cv2.approxPolyDP(main_cnt, eps_factor * arc_len, True)
        n_pts = len(approx)
        if n_pts >= 32: # strictly >= 32 points
            diff = abs(n_pts - target)
            if diff < min_diff:
                min_diff = diff
                best_approx = approx
    
    pts_px = best_approx.reshape(-1, 2)
    world_points = []
    for px, py in pts_px:
        wx, wy = px_to_world(px, py)
        world_points.append({"x": wx, "y": wy})
    
    generated_borders[name] = world_points
    print(f"State '{name}': generated {len(world_points)} vertices (target was {target})")

# Verify that all states have >= 30 points
for name, pts in generated_borders.items():
    assert len(pts) >= 30, f"{name} has {len(pts)} points, which is < 30!"

print("\nAll states verified with >= 30 points!")
