import re
import os

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's inspect statesBody
states_body_match = re.search(r'<g\s+id="statesBody"[^>]*>(.*?)</g>', content, re.DOTALL)
if states_body_match:
    sb = states_body_match.group(1)
    paths = re.findall(r'<path\s+([^>]+)>', sb)
    for p in paths:
        # extract id, fill, etc.
        pid = re.search(r'id="([^"]+)"', p)
        fill = re.search(r'fill="([^"]+)"', p)
        d = re.search(r'd="([^"]+)"', p)
        d_len = len(d.group(1)) if d else 0
        point_count = len(d.group(1).split('L')) if d else 0
        print(f"Path id={pid.group(1) if pid else None}, fill={fill.group(1) if fill else None}, d_len={d_len}, approx_points={point_count}")

# Let's inspect labels and textPaths
print("\n--- Text Paths & Labels ---")
for text_match in re.finditer(r'<text[^>]*id="([^"]+)"[^>]*>(.*?)</text>', content, re.DOTALL):
    tid = text_match.group(1)
    tbody = text_match.group(2)
    # find text content
    tspan = re.search(r'<tspan[^>]*>(.*?)</tspan>', tbody, re.DOTALL)
    print(f"Text id={tid}, text={tspan.group(1) if tspan else tbody}")

# Also check for any other occurrences of state names in the SVG
state_names = ["Этерия", "Сильфето", "Дрегонхолд", "Валлека", "Тайбери"]
# Or what are the 5 states in Этерия 2.6.json? Let's check!
