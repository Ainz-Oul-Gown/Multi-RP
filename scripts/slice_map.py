import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# Let's save slices of the map to scripts/ for inspection:
# West (Эксорин): x in [50, 400], y in [100, 450]
cv2.imwrite("scripts/map_west_exorin.png", img[100:450, 50:400])

# North (Роарн & Нагетс): x in [250, 750], y in [50, 300]
cv2.imwrite("scripts/map_north_roarn_nagets.png", img[50:300, 250:750])

# Center-South (Сильфето): x in [350, 600], y in [150, 450]
cv2.imwrite("scripts/map_center_silfeto.png", img[150:450, 350:600])

# East (Дварфирз): x in [550, 900], y in [150, 450]
cv2.imwrite("scripts/map_east_dvarfirz.png", img[150:450, 550:900])

# North-East (White region): x in [650, 900], y in [50, 250]
cv2.imwrite("scripts/map_ne_white.png", img[50:250, 650:900])

print("Slices saved.")
