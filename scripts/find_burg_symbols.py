import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In Azgaar, burgs/capitals are drawn as:
# A circle with a black border, white fill, and a small black inner dot or star.
# Radius is about 3 to 5 pixels.
# Let's inspect the pixels around the state names:
# 1. Дварфирз: the capital is right next to the letter 'Д' or under the word 'Дварфирз'
# In map_east_dvarfirz.png (which starts at x=550, y=150):
# Label is around x=170 in crop -> x_img = 720, y_img = 300
# Let's search for burg symbols in a 100x100 box around (720, 300)
# Let's print out circular features or template match:

def find_burg_in_box(x1, y1, x2, y2, name):
    box = img[y1:y2, x1:x2]
    gray = cv2.cvtColor(box, cv2.COLOR_BGR2GRAY)
    # Burgs have a white center (high value) surrounded by a dark ring
    # Let's find white pixels surrounded by dark pixels
    candidates = []
    for y in range(3, box.shape[0]-3):
        for x in range(3, box.shape[1]-3):
            # Check center
            c_val = gray[y, x]
            # ring at r=3
            ring = [gray[y+dy, x+dx] for dy, dx in [(-3,0),(3,0),(0,-3),(0,3),(-2,-2),(-2,2),(2,-2),(2,2)]]
            ring_mean = np.mean(ring)
            if ring_mean < 120 and c_val > 180:
                candidates.append((x1 + x, y1 + y, c_val - ring_mean))
    candidates.sort(key=lambda c: -c[2])
    print(f"Candidates for {name} in ({x1},{y1})-({x2},{y2}):")
    for c in candidates[:5]:
        print(f"   ({c[0]}, {c[1]}) contrast={c[2]:.1f}")

find_burg_in_box(460, 250, 520, 320, "Сильфето")
find_burg_in_box(330, 180, 420, 260, "Роарн")
find_burg_in_box(570, 140, 650, 220, "Нагетс")
find_burg_in_box(680, 270, 760, 350, "Дварфирз")
find_burg_in_box(190, 330, 280, 400, "Эксорин")
