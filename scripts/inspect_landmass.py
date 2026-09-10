import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Inspect landmass group
lm = re.search(r'<g\s+id="landmass"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if lm:
    print("<g id='landmass'>:")
    paths = re.findall(r'<path\s+[^>]*>', lm.group(1))
    print(f"  Path count: {len(paths)}")
    for p in paths[:10]:
        print("   ", p[:150])

# Inspect mask id="land"
mask = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
if mask:
    print("\n<mask id='land'>:")
    paths = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*>', mask.group(1))
    print(f"  Land mask paths: {len(paths)}")
    print("  IDs:", paths[:30])

# Check lakes
lakes = re.search(r'<g\s+id="lakes"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if lakes:
    paths = re.findall(r'<path\s+[^>]*>', lakes.group(1))
    print(f"\nLakes path count: {len(paths)}")
