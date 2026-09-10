import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In each state's burg crop, let's just inspect where the circle is:
# In roarn_burg (y: 160..230, x: 330..410):
# Let's save a zoomed 4x image of each crop so we can see pixels!
crops = {
    "roarn": img[160:230, 330:410],
    "exorin": img[340:400, 200:280],
    "nagets": img[150:220, 580:680],
    "dvarfirz": img[280:350, 680:780],
}

for name, c in crops.items():
    zoomed = cv2.resize(c, (c.shape[1]*4, c.shape[0]*4), interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(f"scripts/zoom_{name}.png", zoomed)

print("Zoomed crops saved.")
