import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        d = m.group(1)
        pts = re.findall(r'([0-9.]+),([0-9.]+)', d)
        print(f"{sid}: {len(pts)} points in SVG path")
