import re
import os
import xml.etree.ElementTree as ET

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
if not os.path.exists(path):
    print("File not found:", path)
    exit()

print("File size:", os.path.getsize(path))

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

print("Content length:", len(content))

# Look for groups
groups = re.findall(r'<g\s+id="([^"]+)"', content)
print("Groups:", groups)

# Look for states, statesBody, stateLabels
for gid in ['statesBody', 'states', 'statesHalo', 'stateLabels', 'borders', 'stateBorders', 'provBorders']:
    if gid in groups:
        print(f"Found group: {gid}")

# Let's see what is inside <g id="statesBody"> or <g id="states"> or <g id="stateLabels">
def inspect_group(gid):
    pattern = rf'<g\s+id="{gid}"[^>]*>(.*?)</g>'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        body = match.group(1)
        print(f"\n--- Group {gid} (len={len(body)}) ---")
        paths = re.findall(r'<path[^>]*>', body)
        print(f"Path count: {len(paths)}")
        for p in paths[:10]:
            print(" ", p[:200])
        texts = re.findall(r'<text[^>]*>.*?</text>', body, re.DOTALL)
        if texts:
            print(f"Text count: {len(texts)}")
            for t in texts[:10]:
                print(" ", t[:200])

for g in ['statesBody', 'states', 'stateLabels', 'borders', 'stateBorders']:
    inspect_group(g)
