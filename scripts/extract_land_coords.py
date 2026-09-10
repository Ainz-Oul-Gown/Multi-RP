import re
import sys
import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

def parse_path_bezier(d, step=6):
    """Parse SVG path with M, C, L, Z commands using regex number extraction."""
    points = []
    cur = [0.0, 0.0]
    start = [0.0, 0.0]
    
    # Tokenize
    d_clean = re.sub(r'([MLCZzHhVvSsQqTtAa])', r' \1 ', d)
    tokens = d_clean.split()
    
    i = 0
    cmd = 'M'
    while i < len(tokens):
        t = tokens[i]
        if t in 'MLCZzHhVvSsQqTtAa':
            cmd = t
            i += 1
            continue
        
        if cmd == 'M':
            try:
                x = float(tokens[i].split(',')[0])
                if ',' in tokens[i]:
                    y = float(tokens[i].split(',')[1])
                    i += 1
                else:
                    y = float(tokens[i+1])
                    i += 2
                cur = [x, y]
                start = [x, y]
                points.append((x, y))
            except:
                i += 1
        elif cmd == 'L':
            try:
                if ',' in tokens[i]:
                    parts = tokens[i].split(',')
                    x, y = float(parts[0]), float(parts[1])
                    i += 1
                else:
                    x, y = float(tokens[i]), float(tokens[i+1])
                    i += 2
                cur = [x, y]
                points.append((x, y))
            except:
                i += 1
        elif cmd == 'C':
            # cp1x,cp1y cp2x,cp2y ex,ey -- but data is comma-delimited
            try:
                nums = []
                while len(nums) < 6 and i < len(tokens):
                    for n in tokens[i].split(','):
                        if n:
                            nums.append(float(n))
                    i += 1
                if len(nums) >= 6:
                    cp1x, cp1y = nums[0], nums[1]
                    cp2x, cp2y = nums[2], nums[3]
                    ex, ey = nums[4], nums[5]
                    for t in np.linspace(0, 1, step+1):
                        bx = (1-t)**3*cur[0] + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*ex
                        by = (1-t)**3*cur[1] + 3*(1-t)**2*t*cp1y + 3*(1-t)*t**2*cp2y + t**3*ey
                        points.append((bx, by))
                    cur = [ex, ey]
            except:
                i += 1
        elif cmd in ('Z', 'z'):
            cur = start[:]
        else:
            i += 1
    
    return points

# Actually let's use a simpler approach:
# The paths use "M x,y C cx1,cy1 cx2,cy2 ex,ey ..." format
# Let's just extract ALL numeric pairs as a dense approximation
def extract_all_coords(d):
    """Simple dense sampling - just extract all coordinate pairs in the path."""
    coords = re.findall(r'([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)', d)
    return [(float(x), float(y)) for x, y in coords]

# Parse all land paths from deftemp
deftemp_content = re.search(r'<g\s+id="deftemp"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
land_by_id = {}

if deftemp_content:
    inner = deftemp_content.group(1)
    # All paths in deftemp
    path_tags = re.findall(r'<path\s+[^>]*d="([^"]+)"[^>]*/>', inner)
    print(f"Paths in deftemp: {len(path_tags)}")
    
    # Separately get paths from mask id=land
    mask_content = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', inner, re.DOTALL)
    if mask_content:
        land_paths = re.findall(r'<path\s+[^>]*d="([^"]+)"', mask_content.group(1))
        print(f"Land mask paths: {len(land_paths)}")
        for i, d in enumerate(land_paths):
            pts = extract_all_coords(d)
            if pts:
                land_by_id[i] = np.array(pts, dtype=np.float32)
                print(f"  Path {i}: {len(pts)} coord pairs")

# Also try directly from the mask element
mask_elem = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
if mask_elem:
    paths_in_mask = re.findall(r'd="([^"]+)"', mask_elem.group(1))
    print(f"\nDirect mask paths with d= : {len(paths_in_mask)}")
    for i, d in enumerate(paths_in_mask[:3]):
        pts = extract_all_coords(d)
        print(f"  d path {i}: {len(pts)} coord pairs, first coords: {pts[:3]}")
