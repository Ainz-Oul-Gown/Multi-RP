import cv2
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
img_data = np.fromfile(img_path, dtype=np.uint8)
img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)

# Sample some known regions
# The image is 1024 wide, 548 high
# Let's inspect colors along lines or in representative points of states:
# Эксорин (west, around x=200, y=350)
# Роарн (north-center-west, around x=350, y=220)
# Сильфето (south-center, around x=450, y=350)
# Нагетс (north-center-east, around x=580, y=180)
# Дварфирз (south-east, around x=700, y=350)
# Песчаная Бездна / White region (north-east, around x=770, y=150)
# Ocean (top left, x=50, y=50)

hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

samples = {
    "Ocean": (50, 50),
    "Эксорин": (200, 350),
    "Роарн": (350, 220),
    "Сильфето": (450, 350),
    "Нагетс": (580, 180),
    "Дварфирз": (700, 350),
    "Белый северо-восток": (770, 150),
    "Белый анклав юг": (370, 325),
    "Сумеречный Предел (остров юг)": (335, 415),
}

for name, (px, py) in samples.items():
    c_bgr = img[py, px]
    c_rgb = rgb[py, px]
    c_hsv = hsv[py, px]
    print(f"{name} at ({px}, {py}): RGB={list(c_rgb)}, HSV={list(c_hsv)}")
