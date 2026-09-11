import re

with open(r'C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg', 'r', encoding='utf-8') as f:
    text = f.read()

def inspect_group(gid):
    m = re.search(rf'<g\s+[^>]*id="{gid}"[^>]*>(.*?)</g>', text, re.DOTALL)
    if m:
        content = m.group(1)
        print(f"=== Group: {gid} (length: {len(content)}) ===")
        paths = re.findall(r'<path\s+[^>]*>', content)
        print(f"Number of paths: {len(paths)}")
        for p in paths[:10]:
            print("  ", p[:120])
    else:
        print(f"Group {gid} not found")

inspect_group("statesBody")
inspect_group("stateBorders")
