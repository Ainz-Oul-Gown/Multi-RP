import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's inspect all <g> tags with their id and class
for m in re.finditer(r'<g\s+([^>]+)>', content):
    attrs = m.group(1)
    gid = re.search(r'id="([^"]+)"', attrs)
    gclass = re.search(r'class="([^"]+)"', attrs)
    print(f"Group: id={gid.group(1) if gid else None}, class={gclass.group(1) if gclass else None}")

# Check all paths with an id attribute
all_paths = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*>', content)
print("\nAll path IDs count:", len(all_paths))
print("Sample path IDs:", all_paths[:20])

# Check all paths that have a fill color (not none, not white, not black)
colored_paths = re.findall(r'<path\s+[^>]*fill="([^"]+)"[^>]*id="([^"]+)"[^>]*>', content)
print("\nColored paths (fill before id):", colored_paths)
colored_paths_2 = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*fill="([^"]+)"[^>]*>', content)
print("Colored paths (id before fill):", [(p, f) for p, f in colored_paths_2 if f not in ('none', 'white', 'black', '#000000', '#ffffff')])
