import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Show the actual structure of a land path
deftemp = re.search(r'<g\s+id="deftemp"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if deftemp:
    inner = deftemp.group(1)
    # Show first path in full
    first_path_match = re.search(r'<path\s+([^>]+)/>', inner)
    if first_path_match:
        attrs = first_path_match.group(1)
        print("First path attrs:")
        print(attrs[:500])
        
    # Check self-closing vs open tags
    paths_self_closing = re.findall(r'<path\s+[^>]+/>', inner)
    paths_open = re.findall(r'<path\s+[^>]+>', inner)
    print(f"\nSelf-closing paths: {len(paths_self_closing)}")
    print(f"Open paths: {len(paths_open)}")
    
    # Check for use elements
    uses = re.findall(r'<use[^>]+>', inner)
    print(f"Use elements: {len(uses)}")
    
    # Show raw first 1000 chars
    print("\nFirst 1000 chars of deftemp:")
    print(inner[:1000])
