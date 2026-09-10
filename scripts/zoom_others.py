import cv2
import numpy as np
from PIL import Image

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

crops = {
    "sumerech": img[380:450, 300:380],
    "shramov": img[260:330, 530:600],
    "bezdna": img[80:160, 720:820],
}

for name, c in crops.items():
    zoomed = cv2.resize(c, (c.shape[1]*4, c.shape[0]*4), interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(f"scripts/zoom_{name}.png", zoomed)

print("Other burgs zoomed.")
