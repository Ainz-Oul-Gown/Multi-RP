import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

for m in re.finditer(r'<g\s+[^>]*id="([^"]+)"', text):
    print(m.group(1))
