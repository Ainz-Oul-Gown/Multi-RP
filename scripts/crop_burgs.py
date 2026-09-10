import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In Azgaar maps:
# Look at the icon under "Нагетс": in map_north_roarn_nagets.png (x in [250, 750], y in [50, 300]):
# There is a burg circle with label! Let's save a 60x60 crop of it:
# Let's search in y in [150, 220], x in [580, 680]
cv2.imwrite("scripts/nagets_burg.png", img[150:220, 580:680])
cv2.imwrite("scripts/dvarfirz_burg.png", img[280:350, 680:780])
cv2.imwrite("scripts/silfeto_burg.png", img[250:320, 460:540])
cv2.imwrite("scripts/roarn_burg.png", img[160:230, 330:410])
cv2.imwrite("scripts/exorin_burg.png", img[340:400, 200:280])
cv2.imwrite("scripts/sumerech_burg.png", img[380:450, 300:380])
cv2.imwrite("scripts/shramov_burg.png", img[260:330, 530:600])
cv2.imwrite("scripts/bezdna_burg.png", img[80:160, 720:820])

print("Burg crops saved.")
