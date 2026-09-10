import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# Exact locations from visual inspection:
# 1. Нагетс (Паровой Град): in nagets_burg (y:150..220, x:580..680)
# Look at the circle:
# Let's crop tightly around the circle:
# In nagets_burg, it's above the word "Нагетс", near the top center
crop_nag = img[150:200, 610:650]
# 2. Сильфето (Великое Древо Жизни): in silfeto_burg (y:250..320, x:460..540)
# It's above "льфето"
# 3. Дварфирз (Стальная Наковальня): in dvarfirz_burg (y:280..350, x:680..780)
# It's left of "Д"
# 4. Роарн (Клык-Гора): in roarn_burg (y:160..230, x:330..410)
# It's above the corner of "Р"
# 5. Эксорин (Эскория): in exorin_burg (y:340..400, x:200..280)
# It's under "с"

# Let's find white pixels with dark border in these tight regions:
boxes = {
    "Паровой Град (Нагетс)": (620, 155, 645, 175),
    "Великое Древо Жизни (Сильфето)": (490, 275, 510, 295),
    "Стальная Наковальня (Дварфирз)": (700, 305, 725, 325),
    "Клык-Гора (Роарн)": (380, 215, 400, 235),
    "Эскория (Эксорин)": (220, 360, 240, 380),
}

cap_pixels = {}
for name, (x1, y1, x2, y2) in boxes.items():
    patch = img[y1:y2, x1:x2]
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    # The circle has white center (gray > 220) and dark rim (gray < 80)
    # Let's find white pixels
    whites = np.where(gray > 220)
    if len(whites[0]) > 0:
        cy = np.mean(whites[0]) + y1
        cx = np.mean(whites[1]) + x1
        cap_pixels[name] = (cx, cy)
        print(f"{name}: px=({cx:.2f}, {cy:.2f})")
    else:
        # Just find max brightness in patch
        max_idx = np.unravel_index(np.argmax(gray), gray.shape)
        cx = max_idx[1] + x1
        cy = max_idx[0] + y1
        cap_pixels[name] = (cx, cy)
        print(f"{name} (max bright): px=({cx:.2f}, {cy:.2f})")
