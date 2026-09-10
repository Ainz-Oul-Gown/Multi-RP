import cv2
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
img_data = np.fromfile(img_path, dtype=np.uint8)
img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
print(f"Image shape: {img.shape}")
