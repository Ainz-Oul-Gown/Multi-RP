import cv2
import numpy as np
from PIL import Image
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In the image, at x=495, y=285 there is the text "Сильфето"
# Let's inspect the text positions for all states:
# "Эксорин" is around x=220, y=360
# "Роарн" is around x=370, y=230
# "Сильфето" is around x=480, y=290
# "Нагетс" is around x=590, y=170
# "Дварфирз" is around x=720, y=300

# Let's check the distances in pixels between state labels vs world coordinates of capitals!
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

capitals = {}
for s in data['geography']['states']:
    for l in s.get('locations', []):
        if l.get('type') == 'capital':
            capitals[s['name']] = (l['pos_x'], l['pos_y'])

for k, v in capitals.items():
    print(f"Capital of {k}: world coords {v}")
