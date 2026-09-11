import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

state_pts = {}
for sid in ['state25', 'state26', 'state27', 'state28', 'state29']:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"', text)
    if m:
        pts = re.findall(r'([0-9.]+),([0-9.]+)', m.group(1))
        state_pts[sid] = set(pts)

for s1 in state_pts:
    for s2 in state_pts:
        if s1 < s2:
            common = state_pts[s1].intersection(state_pts[s2])
            if common:
                print(f"{s1} & {s2}: {len(common)} EXACT matching vertices in SVG!")
