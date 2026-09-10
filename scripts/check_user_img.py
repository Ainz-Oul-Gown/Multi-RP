from PIL import Image
import os

img_path = r"C:\Users\Влад\.gemini\antigravity-ide\brain\beed8616-b18b-41aa-8390-49886bc00e70\.user_uploaded\media_1789080660089.png"
if os.path.exists(img_path):
    im = Image.open(img_path)
    print("User image size:", im.size)
