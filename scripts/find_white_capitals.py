import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# Let's inspect silfeto_burg:
# In crop y from 250 to 320, x from 460 to 540
# The text "Сильфето" is in the lower half
# The capital icon is at:
crop_sil = img[250:320, 460:540]
# Find where the white dot is in crop_sil:
# The burg icon is white circle with black dot inside:
# Let's find white pixels in crop_sil:
ys, xs = np.where((crop_sil[:, :, 0] > 230) & (crop_sil[:, :, 1] > 230) & (crop_sil[:, :, 2] > 230))
for y, x in zip(ys, xs):
    print(f"Silfeto white pixel in crop: x={x} (abs={460+x}), y={y} (abs={250+y})")

# Let's do the same for roarn_burg (y: 160..230, x: 330..410)
crop_ro = img[160:230, 330:410]
ys, xs = np.where((crop_ro[:, :, 0] > 230) & (crop_ro[:, :, 1] > 230) & (crop_ro[:, :, 2] > 230))
for y, x in zip(ys, xs):
    print(f"Roarn white pixel in crop: x={x} (abs={330+x}), y={y} (abs={160+y})")

# dvarfirz_burg (y: 280..350, x: 680..780)
crop_dv = img[280:350, 680:780]
ys, xs = np.where((crop_dv[:, :, 0] > 230) & (crop_dv[:, :, 1] > 230) & (crop_dv[:, :, 2] > 230))
for y, x in zip(ys, xs):
    print(f"Dvarfirz white pixel in crop: x={x} (abs={680+x}), y={y} (abs={280+y})")

# nagets_burg (y: 150..220, x: 580..680)
crop_nag = img[150:220, 580:680]
ys, xs = np.where((crop_nag[:, :, 0] > 230) & (crop_nag[:, :, 1] > 230) & (crop_nag[:, :, 2] > 230))
for y, x in zip(ys, xs):
    print(f"Nagets white pixel in crop: x={x} (abs={580+x}), y={y} (abs={150+y})")

# exorin_burg (y: 340..400, x: 200..280)
crop_ex = img[340:400, 200:280]
ys, xs = np.where((crop_ex[:, :, 0] > 230) & (crop_ex[:, :, 1] > 230) & (crop_ex[:, :, 2] > 230))
for y, x in zip(ys, xs):
    print(f"Exorin white pixel in crop: x={x} (abs={200+x}), y={y} (abs={340+y})")
