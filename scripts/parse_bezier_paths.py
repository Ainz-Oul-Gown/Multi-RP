import re
import sys
import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# The land paths are in <g id="deftemp"> with fill=white and Bezier curves
# Parse using C (cubic bezier) and M, L, Z commands
# We'll just sample points densely along the path

def parse_svg_path_points(d, step=5):
    """Parse SVG path d attribute and sample points densely."""
    # Use a simple approach: treat cubic beziers as straight lines to control points
    # This gives reasonable polygon approximations
    pts = []
    current = [0.0, 0.0]
    
    # Tokenize
    d = re.sub(r'([MLCZz])', r' \1 ', d)
    tokens = d.split()
    
    i = 0
    while i < len(tokens):
        cmd = tokens[i]
        i += 1
        
        if cmd == 'M':
            x, y = float(tokens[i]), float(tokens[i+1])
            current = [x, y]
            pts.append((x, y))
            i += 2
        elif cmd == 'L':
            x, y = float(tokens[i]), float(tokens[i+1])
            pts.append((x, y))
            current = [x, y]
            i += 2
        elif cmd == 'C':
            # Cubic bezier: cp1x,cp1y cp2x,cp2y ex,ey
            try:
                cp1x, cp1y = float(tokens[i]), float(tokens[i+1])
                cp2x, cp2y = float(tokens[i+2]), float(tokens[i+3])
                ex, ey = float(tokens[i+4]), float(tokens[i+5])
                # Sample the bezier
                for t in np.linspace(0, 1, step):
                    bx = (1-t)**3*current[0] + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*ex
                    by = (1-t)**3*current[1] + 3*(1-t)**2*t*cp1y + 3*(1-t)*t**2*cp2y + t**3*ey
                    pts.append((bx, by))
                current = [ex, ey]
                i += 6
            except (IndexError, ValueError):
                break
        elif cmd in ('Z', 'z'):
            pass
        else:
            # Try to handle implicit continuation
            try:
                x = float(cmd)
                y = float(tokens[i])
                pts.append((x, y))
                current = [x, y]
                i += 1
            except (ValueError, IndexError):
                pass
    
    return pts

# Get all land (deftemp) paths with fill=white
deftemp = re.search(r'<g\s+id="deftemp"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
land_contours = []
if deftemp:
    paths = re.findall(r'<path\s+[^>]*fill="white"[^>]*d="([^"]+)"[^>]*/>', deftemp.group(1))
    print(f"White land paths in deftemp: {len(paths)}")
    for d in paths:
        pts = parse_svg_path_points(d, step=4)
        if len(pts) >= 3:
            land_contours.append(np.array(pts, dtype=np.float32))

print(f"Parsed land contours: {len(land_contours)}")

# Also check the coastline group
coastline = re.search(r'<g\s+id="coastline"[^>]*>(.*?)</g>', svg_text, re.DOTALL)
coastline_contours = []
if coastline:
    paths_all = re.findall(r'<path[^>]*d="([^"]+)"[^>]*/>', coastline.group(1))
    print(f"Coastline paths: {len(paths_all)}")
    for d in paths_all:
        pts = parse_svg_path_points(d, step=4)
        if len(pts) >= 3:
            coastline_contours.append(np.array(pts, dtype=np.float32))
    print(f"Parsed coastline contours: {len(coastline_contours)}")

# Check sizes
for i, c in enumerate(land_contours[:10]):
    area = cv2.contourArea(c.reshape(-1, 1, 2).astype(np.int32))
    bb = cv2.boundingRect(c.reshape(-1, 1, 2).astype(np.int32))
    print(f"  Land contour {i}: {len(c)} pts, area={area:.0f}, bbox={bb}")
