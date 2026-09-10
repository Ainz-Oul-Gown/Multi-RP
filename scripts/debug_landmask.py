import re
import sys
import json
import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# Let's check what landmass paths look like
mask_match = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
if mask_match:
    inner = mask_match.group(1)
    # Find all paths
    paths = re.findall(r'<path[^>]+>', inner)
    print(f"Paths in land mask: {len(paths)}")
    for p in paths[:5]:
        fill = re.search(r'fill="([^"]+)"', p)
        pid = re.search(r'id="([^"]+)"', p)
        print(f"  {pid.group(1) if pid else '?'}: fill={fill.group(1) if fill else '?'}")

# Also check deftemp paths and statePaths
for gid in ['deftemp', 'statePaths', 'landmass']:
    g = re.search(rf'<g\s+id="{gid}"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
    if g:
        paths = re.findall(r'<path[^>]+>', g.group(1))
        print(f"\nGroup '{gid}': {len(paths)} paths")
        for p in paths[:3]:
            fill = re.search(r'fill="([^"]+)"', p)
            pid = re.search(r'id="([^"]+)"', p)
            d_attr = re.search(r'd="([^"]{,60})', p)
            print(f"  {pid.group(1) if pid else '?'}: fill={fill.group(1) if fill else '?'}, d={d_attr.group(1) if d_attr else '?'}")

# Check coastline group
g = re.search(r'<g\s+id="coastline"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if g:
    paths = re.findall(r'<path[^>]+>', g.group(1))
    print(f"\nGroup 'coastline': {len(paths)} paths")
    for p in paths[:5]:
        fill = re.search(r'fill="([^"]+)"', p)
        pid = re.search(r'id="([^"]+)"', p)
        d_len = len(re.search(r'd="([^"]+)"', p).group(1)) if re.search(r'd="([^"]+)"', p) else 0
        print(f"  {pid.group(1) if pid else '?'}: fill={fill.group(1) if fill else '?'}, d_len={d_len}")

# Check what use the land mask — maybe statePaths has the actual land
g = re.search(r'<g\s+id="statePaths"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
if g:
    inner = g.group(1)
    print(f"\n<g id='statePaths'> content (first 500 chars):")
    print(inner[:500])
