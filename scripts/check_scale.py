import cv2
import numpy as np
from PIL import Image
import sys

sys.stdout.reconfigure(encoding='utf-8')

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
pil_img = Image.open(img_path)
img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# In the image (1024x548):
# Let's check the scale bar:
# x=890 to 1000 (110 px) = 800 km -> 1 px = 7.2727 km, so scale = 7.2727 (or approx 7.25 - 7.5)
# In world coordinates:
# Delta X between Роарн (-1300) and Нагетс (+1200) = 2500 km.
# 2500 km / 7.2727 km/px = 343.75 pixels!
# Look at the centers: Роарн center is ~380 px, Нагетс center is ~605 px.
# Delta X in pixels = 605 - 380 = 225 pixels.
# Wait! Let's check:
# Delta Y between Роарн (+1400) and Сильфето (-500) = 1900 km.
# Delta Y in pixels: Роарн y=228, Сильфето y=350 -> Delta Y = 122 pixels.
# 1900 / 122 = 15.5 km/px?
# WAIT! Why would 1900 km / 122 px = 15.5 km/px while the scale bar says 800 km = 110 px (7.27 km/px)?
# Let's check if the world coordinates (x, y) were scaled or what scale was used when Azgaar generated this!

# Let's find out how the coordinates in "Этерия.json" were originally created!
