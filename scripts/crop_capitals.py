import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In the image, let's find the capital red/black icons or city dots:
# In Azgaar's Fantasy Map Generator (which this map was made with!):
# Capitals have a specific red/circle or star/circle icon or label.
# Let's find the text for "Великое Древо Жизни" or "Эскория" or "Паровой Град" or "Стальная Наковальня" or "Клык-Гора".
# Let's crop candidate regions and inspect.

# Candidate 1: Center region around Сильфето: x from 450 to 550, y from 260 to 360
cv2.imwrite("scripts/crop_silfeto.png", img[240:370, 430:560])

# Candidate 2: Роарн region: x from 300 to 450, y from 130 to 250
cv2.imwrite("scripts/crop_roarn.png", img[120:250, 300:450])

# Candidate 3: Нагетс region: x from 550 to 700, y from 100 to 230
cv2.imwrite("scripts/crop_nagets.png", img[100:230, 550:700])

# Candidate 4: Дварфиз region: x from 650 to 800, y from 270 to 400
cv2.imwrite("scripts/crop_dvarfiz.png", img[270:400, 650:800])

# Candidate 5: Эксорин region: x from 150 to 300, y from 250 to 380
cv2.imwrite("scripts/crop_exorin.png", img[250:380, 150:300])

print("Crops written successfully.")
