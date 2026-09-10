import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

states_body = re.search(r'<g\s+id="statesBody"[^>]*>(.*?)</g>', content, re.DOTALL)
if states_body:
    sb = states_body.group(1)
    paths = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*d="([^"]+)"[^>]*>', sb)
    for pid, d in paths:
        cmds = re.findall(r'([MLHVCSQTAZ])', d)
        coords = re.findall(r'[-+]?\d*\.?\d+', d)
        print(f"Path {pid}: command types={set(cmds)}, total coords={len(coords)}, approx points={len(coords)//2}")
        # print first 100 chars of d
        print(f"  d start: {d[:120]} ... {d[-60:]}")
