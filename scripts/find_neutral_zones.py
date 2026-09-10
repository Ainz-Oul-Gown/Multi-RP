import re
import sys
import json
import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

# 1. Get all landmass paths from <mask id="land">
mask_match = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
land_paths = []
if mask_match:
    paths_in_mask = re.findall(r'<path\s+[^>]*fill="([^"]+)"[^>]*d="([^"]+)"[^>]*/>', mask_match.group(1))
    for fill, d in paths_in_mask:
        if fill.lower() == 'white':
            ring = []
            for part in re.split(r'C', d.split('M')[-1]):  # rough parse
                pass
            # Just extract all points
            pts = []
            for seg in re.split(r'M', d):
                if not seg.strip():
                    continue
                seg_pts = []
                nums = re.findall(r'[-+]?\d*\.?\d+,[-+]?\d*\.?\d+', seg)
                for n in nums:
                    x, y = map(float, n.split(','))
                    seg_pts.append((x, y))
                if len(seg_pts) >= 3:
                    pts.extend(seg_pts)
            if len(pts) >= 3:
                land_paths.append(np.array(pts, dtype=np.float32))

print(f"Land paths (white fill): {len(land_paths)}")

# 2. Get the 5 state paths
state_ids = ['state25', 'state26', 'state27', 'state28', 'state29']
state_rings = {}
for sid in state_ids:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        rings = []
        for r_str in d.split('M'):
            if not r_str.strip():
                continue
            ring = []
            for p in r_str.split('L'):
                p = p.strip()
                if p:
                    xy = p.split(',')
                    if len(xy) == 2:
                        ring.append((float(xy[0]), float(xy[1])))
            if len(ring) >= 3:
                rings.append(np.array(ring, dtype=np.float32))
        rings.sort(key=lambda r: len(r), reverse=True)
        state_rings[sid] = rings
        print(f"State {sid}: {len(rings)} rings, total pts = {sum(len(r) for r in rings)}")

# 3. Rasterize on a canvas and subtract
# SVG canvas: 1872x1002
W, H = 1872, 1002
canvas = np.zeros((H, W), dtype=np.uint8)

# Draw all land (white)
for pts in land_paths:
    cnt = pts.reshape(-1, 1, 2).astype(np.int32)
    cv2.fillPoly(canvas, [cnt], 255)

# Draw all states (black = subtract)
for sid, rings in state_rings.items():
    for r in rings:
        cnt = r.reshape(-1, 1, 2).astype(np.int32)
        cv2.fillPoly(canvas, [cnt], 0)

# 4. Find contours in the remaining white area
contours, _ = cv2.findContours(canvas, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
contours_sorted = sorted(contours, key=cv2.contourArea, reverse=True)

print(f"\nRemaining white regions after subtracting states:")
for i, cnt in enumerate(contours_sorted[:20]):
    area = cv2.contourArea(cnt)
    bb = cv2.boundingRect(cnt)
    cx = bb[0] + bb[2]//2
    cy = bb[1] + bb[3]//2
    print(f"  [{i}] Area={area:.0f}, bbox={bb}, center=({cx}, {cy}), pts={len(cnt)}")

# The top 3 largest are the neutral zones:
print("\n=== TOP 3 NEUTRAL ZONES ===")
neutral_candidates = [(i, cnt) for i, cnt in enumerate(contours_sorted[:10]) if cv2.contourArea(cnt) > 500][:3]
for i, (idx, cnt) in enumerate(neutral_candidates):
    bb = cv2.boundingRect(cnt)
    cx = bb[0] + bb[2]//2
    cy = bb[1] + bb[3]//2
    print(f"  Zone {i+1}: Area={cv2.contourArea(cnt):.0f}, center_svg=({cx}, {cy})")

# Save debug image
debug = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)
colors_rgb = [(255, 0, 255), (255, 150, 0), (0, 200, 255)]
for i, (idx, cnt) in enumerate(neutral_candidates):
    cv2.drawContours(debug, [cnt], -1, colors_rgb[i], 2)
    bb = cv2.boundingRect(cnt)
    cx = bb[0] + bb[2]//2
    cy = bb[1] + bb[3]//2
    cv2.circle(debug, (cx, cy), 10, colors_rgb[i], -1)
cv2.imwrite('scripts/neutral_zones_raw.png', debug)
print("\nSaved scripts/neutral_zones_raw.png")
