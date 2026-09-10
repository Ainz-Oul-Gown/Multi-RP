import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# Scale bar at bottom right
# Let's crop x: 880 to 1010, y: 515 to 540
crop = img[510:545, 870:1015]
gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

# Find the scale bar line: horizontal line
for y in range(gray.shape[0]):
    row = gray[y]
    # Check if there is a long horizontal line (many dark pixels)
    dark_count = np.sum(row < 120)
    if dark_count > 50:
        print(f"Row {y} in crop (y_img={510+y}): dark count = {dark_count}")
        # Find start and end of this line
        dark_indices = np.where(row < 120)[0]
        x_start = dark_indices[0] + 870
        x_end = dark_indices[-1] + 870
        print(f"Scale bar starts at x={x_start}, ends at x={x_end}, length={x_end - x_start} px")
        # 800 km scale bar length!
        km_per_px = 800.0 / (x_end - x_start)
        print(f"Scale: {km_per_px:.4f} km per pixel, or {(x_end - x_start) / 800.0:.4f} pixels per km")
        break
