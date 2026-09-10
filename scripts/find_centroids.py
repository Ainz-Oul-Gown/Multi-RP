import cv2
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
img_data = np.fromfile(img_path, dtype=np.uint8)
img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Let's find the center of mass of each state's color mask!
# 1. Эксорин: H in [135, 165], S in [40, 150], V in [150, 255]
# 2. Роарн: H in [85, 98], S in [60, 160], V in [180, 255]
# 3. Сильфето: H in [99, 115], S in [60, 160], V in [180, 255]
# 4. Нагетс: H in [30, 48], S in [50, 150], V in [180, 255]
# 5. Дварфирз: H in [49, 75], S in [50, 150], V in [180, 255]
# 6. Белый С-В (Песчаная Бездна): S < 30, V > 220, and x > 650, y < 300

masks = {
    "Эксорин": cv2.inRange(hsv, (135, 40, 150), (165, 150, 255)),
    "Роарн": cv2.inRange(hsv, (85, 60, 180), (98, 160, 255)),
    "Сильфето": cv2.inRange(hsv, (99, 60, 180), (118, 160, 255)),
    "Нагетс": cv2.inRange(hsv, (30, 50, 180), (48, 150, 255)),
    "Дварфирз": cv2.inRange(hsv, (49, 50, 180), (75, 150, 255)),
}

for name, mask in masks.items():
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    total_area = sum(cv2.contourArea(c) for c in cnts)
    main_cnts = [c for c in cnts if cv2.contourArea(c) > 500]
    print(f"{name}: {len(cnts)} components, total area {total_area:.0f}, main components {len(main_cnts)}")
    for i, c in enumerate(main_cnts):
        M = cv2.moments(c)
        if M["m00"] > 0:
            cx = M["m10"] / M["m00"]
            cy = M["m01"] / M["m00"]
            area = cv2.contourArea(c)
            print(f"   Comp {i}: center=({cx:.1f}, {cy:.1f}), area={area:.0f}")
