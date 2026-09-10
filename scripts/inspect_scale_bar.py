import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

m = re.search(r'<g\s+id="scaleBar"[^>]*>(.*?)</g>\s*</g>', svg_text, re.DOTALL)
if m:
    print("Scale bar XML:")
    print(m.group(0))
else:
    # find all text in scaleBar
    sb = re.search(r'<g\s+id="scaleBar".*?</g>', svg_text, re.DOTALL)
    if sb:
        print(sb.group(0))
