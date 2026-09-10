import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Let's inspect <g id="cities"> and <g id="burgIcons">
cities_match = re.search(r'<g\s+id="cities"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if cities_match:
    print("<g id='cities'>:")
    circles = re.findall(r'<circle\s+[^>]+>', cities_match.group(1))
    print(f"  Circles count: {len(circles)}")
    for c in circles[:10]:
        print("   ", c)
    paths = re.findall(r'<path\s+[^>]+>', cities_match.group(1))
    print(f"  Paths count: {len(paths)}")
    for p in paths[:10]:
        print("   ", p)

# Let's inspect <g id="burgIcons">
bi = re.search(r'<g\s+id="burgIcons"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if bi:
    print("\n<g id='burgIcons'>:")
    circles = re.findall(r'<circle\s+[^>]+>', bi.group(1))
    print(f"  Circles count: {len(circles)}")
    for c in circles[:10]:
        print("   ", c)
    # Check other elements
    other = re.findall(r'<(\w+)\s+([^>]+)>', bi.group(1))
    print("  Element tags:", set(o[0] for o in other))
    for tag, attrs in other[:10]:
        print(f"    <{tag} {attrs}>")
