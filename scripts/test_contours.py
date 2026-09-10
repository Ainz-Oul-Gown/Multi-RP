import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# Color ranges for each state:
# 1. Эксорин (Pink):
#    RGB ~ [210, 145, 210]. H ~ 145-165, S ~ 50-130, V ~ 180-230
# 2. Роарн (Cyan):
#    RGB ~ [125, 213, 227]. H ~ 90-98, S ~ 70-140, V ~ 200-240
# 3. Сильфето (Blue):
#    RGB ~ [140, 187, 237]. H ~ 100-112, S ~ 70-130, V ~ 210-250
# 4. Нагетс (Yellow-Green):
#    RGB ~ [210, 235, 153]. H ~ 35-46, S ~ 60-120, V ~ 210-245
# 5. Дварфирз (Light Green):
#    RGB ~ [177, 246, 163]. H ~ 50-65, S ~ 60-120, V ~ 220-255
# 6. Песчаная Бездна (White NE):
#    RGB ~ [240, 248, 252]. S < 30, V > 230, x > 680, y < 280
# 7. Долина Шрамов (White center):
#    RGB ~ [240, 248, 252]. S < 30, V > 230, 520 < x < 620, 250 < y < 350
# 8. Сумеречный Предел (Southern pink island):
#    Pink island at 300 < x < 380, 380 < y < 450

state_defs = {
    "Эксорин": {
        "lower": (140, 40, 160), "upper": (170, 140, 240),
        "min_x": 70, "max_x": 420, "min_y": 70, "max_y": 420,
        "exclude_rect": (290, 380, 420, 460) # exclude southern island
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
    "Дварфирз": {
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

for name, cfg in state_defs.items():
    if cfg.get("is_white"):
        # White land: high brightness, low saturation, not ocean
        mask = cv2.inRange(hsv, (0, 0, 225), (180, 35, 255))
    else:
        mask = cv2.inRange(hsv, cfg["lower"], cfg["upper"])
    
    # Restrict to bounding box
    bbox_mask = np.zeros_like(mask)
    bbox_mask[cfg["min_y"]:cfg["max_y"], cfg["min_x"]:cfg["max_x"]] = 255
    if "exclude_rect" in cfg:
        ex = cfg["exclude_rect"]
        bbox_mask[ex[1]:ex[3], ex[0]:ex[2]] = 0
    mask = cv2.bitwise_and(mask, bbox_mask)
    
    # Morphological close to bridge thin text/road pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask_closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    cnts, _ = cv2.findContours(mask_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        print(f"[{name}] No contours found!")
        continue
    main_cnt = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(main_cnt)
    
    # Approximate contour to polygon
    # We want at least 30-50 points!
    epsilon = 0.003 * cv2.arcLength(main_cnt, True)
    approx = cv2.approxPolyDP(main_cnt, epsilon, True)
    
    print(f"[{name}] Area={area:.0f}, Raw points={len(main_cnt)}, Approx (eps={epsilon:.2f}) points={len(approx)}")
