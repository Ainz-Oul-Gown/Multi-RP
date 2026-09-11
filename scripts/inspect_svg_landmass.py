import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'<g\s+[^>]*id="landmass"[^>]*>(.*?)</g>', text, re.DOTALL)
if m:
    print(f"landmass length: {len(m.group(1))}")
    paths = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*d="([^"]+)"', m.group(1))
    print(f"Number of paths in landmass: {len(paths)}")
    for pid, d in paths:
        pts = re.findall(r'([0-9.]+),([0-9.]+)', d)
        print(f"  {pid}: {len(pts)} points")
