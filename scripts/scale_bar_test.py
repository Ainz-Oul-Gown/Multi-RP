import cv2
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
img_data = np.fromfile(img_path, dtype=np.uint8)
img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)

# The scale bar is at bottom right, y from 500 to 545, x from 850 to 1010
crop = img[500:545, 850:1015]
cv2.imwrite("scripts/scale_bar.png", crop)

# Let's inspect the lines in crop
gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
# Find the black or dark ticks of the scale bar
# Scale bar line is horizontal
# Let's find horizontal lines or dark pixels
for y in range(crop.shape[0]):
    for x in range(crop.shape[1]):
        pass

print("Scale bar crop saved to scripts/scale_bar.png")
