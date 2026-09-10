import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# State labels are large dark text with character height ~ 15-25 px
# Let's inspect small regions around the approximate positions:
# 1. Эксорин around (220, 360)
# 2. Роарн around (370, 230)
# 3. Сильфето around (480, 290)
# 4. Нагетс around (590, 170)
# 5. Дварфирз around (720, 300)

labels_approx = {
    "Эксорин": (220, 350),
    "Роарн": (370, 230),
    "Сильфето": (470, 280),
    "Нагетс": (590, 170),
    "Дварфирз": (720, 290),
}

for name, (ax, ay) in labels_approx.items():
    patch = gray[ay-30:ay+30, ax-60:ax+60]
    # Dark text pixels
    dark_pixels = np.where(patch < 60)
    if len(dark_pixels[0]) > 0:
        cy = np.mean(dark_pixels[0]) + ay - 30
        cx = np.mean(dark_pixels[1]) + ax - 60
        print(f"Label '{name}': center at pixel ({cx:.1f}, {cy:.1f})")
    else:
        print(f"Label '{name}': no dark pixels found near ({ax}, {ay})")
