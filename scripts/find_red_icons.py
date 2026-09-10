import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In Azgaar maps, capitals have red circles with white/black centers, or dark burg icons
# Let's search for small red circles across the image:
# Red in HSV: H in [0, 10] or [170, 180], S > 100, V > 100
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
red_mask1 = cv2.inRange(hsv, (0, 120, 120), (10, 255, 255))
red_mask2 = cv2.inRange(hsv, (170, 120, 120), (180, 255, 255))
red_mask = cv2.bitwise_or(red_mask1, red_mask2)

# Also roads are red dashed lines, but capitals are small round clusters
cnts, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
red_circles = []
for c in cnts:
    area = cv2.contourArea(c)
    if 5 <= area <= 200:
        (x, y), radius = cv2.minEnclosingCircle(c)
        if 2 <= radius <= 12:
            red_circles.append((x, y, radius, area))

print(f"Found {len(red_circles)} candidate red dots/icons:")
for rc in sorted(red_circles, key=lambda x: -x[3])[:20]:
    print(f"  at ({rc[0]:.1f}, {rc[1]:.1f}), r={rc[2]:.1f}, area={rc[3]:.1f}")
