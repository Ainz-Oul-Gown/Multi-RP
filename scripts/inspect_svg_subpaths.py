import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        subpaths = [p for p in m.group(1).split('M') if p.strip()]
        print(f"{sid}: {len(subpaths)} subpaths (M commands)")
