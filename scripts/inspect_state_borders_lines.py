import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'<g\s+[^>]*id="stateBorders"[^>]*>(.*?)</g>', text, re.DOTALL)
if m:
    p = re.search(r'<path\s+[^>]*d="([^"]+)"', m.group(1))
    if p:
        lines = [seg for seg in p.group(1).split('M') if seg.strip()]
        print(f"Total border lines in stateBorders: {len(lines)}")
        for i, l in enumerate(lines):
            pts = re.findall(r'([0-9.]+),([0-9.]+)', l)
            print(f"  Line {i}: {len(pts)} points, start={pts[0]}, end={pts[-1]}")
