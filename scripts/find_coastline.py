import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

for gid in ['coastline', 'sea_island', 'ocean', 'regions', 'viewbox']:
    m = re.search(rf'<g\s+[^>]*id="{gid}"[^>]*>(.*?)</g>', text, re.DOTALL)
    if m:
        paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', m.group(1))
        print(f"Group {gid}: {len(paths)} paths, text len {len(m.group(1))}")
