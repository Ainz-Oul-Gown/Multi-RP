import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# Template around Silfeto capital at (483, 275)
# Let's crop a 9x9 template around (483, 275)
tpl = img[271:280, 479:488]
cv2.imwrite("scripts/capital_template.png", tpl)

# Match template across the image
res = cv2.matchTemplate(img, tpl, cv2.TM_CCOEFF_NORMED)
# Find peaks
threshold = 0.65
loc = np.where(res >= threshold)
matches = []
for pt in zip(*loc[::-1]):
    # center is pt[0] + 4, pt[1] + 4
    matches.append((pt[0] + 4, pt[1] + 4, res[pt[1], pt[0]]))

# Non-maximum suppression
clean_matches = []
for m in sorted(matches, key=lambda x: -x[2]):
    if not any(np.hypot(m[0]-c[0], m[1]-c[1]) < 10 for c in clean_matches):
        clean_matches.append(m)

print(f"Found {len(clean_matches)} burgs matching capital icon:")
for m in clean_matches:
    print(f"  at px=({m[0]}, {m[1]}), score={m[2]:.3f}")
