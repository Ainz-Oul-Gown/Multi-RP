import re
import sys
import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

def extract_coords(d):
    coords = re.findall(r'([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)', d)
    return [(float(x), float(y)) for x, y in coords]

# Get land mask paths (43 paths in the mask - each is an island/landmass)
mask_elem = re.search(r'<mask\s+id="land"[^>]*>(.*?)</mask>', svg_text, re.DOTALL)
land_contours = []
if mask_elem:
    paths_with_attrs = re.findall(r'<path\s+([^>]+)>', mask_elem.group(1))
    for attrs in paths_with_attrs:
        d_match = re.search(r'd="([^"]+)"', attrs)
        fill_match = re.search(r'fill="([^"]+)"', attrs)
        if d_match:
            pts = extract_coords(d_match.group(1))
            if len(pts) >= 3:
                land_contours.append({
                    'pts': np.array(pts, dtype=np.float32),
                    'fill': fill_match.group(1) if fill_match else 'unknown'
                })

print(f"Land mask contours: {len(land_contours)}")
for i, lc in enumerate(land_contours):
    cnt = lc['pts'].reshape(-1, 1, 2).astype(np.int32)
    area = cv2.contourArea(cnt)
    bb = cv2.boundingRect(cnt)
    print(f"  {i}: pts={len(lc['pts'])}, area={area:.0f}, fill={lc['fill']}, bbox={bb[:2]}+{bb[2:]}")

# Get state contours
state_id_to_name = {
    'state25': 'Эскорин',
    'state26': 'Дварфиз',
    'state27': 'Роарн',
    'state28': 'Нагетс',
    'state29': 'Сильфето'
}
state_contours_all = {}
for sid in state_id_to_name:
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if m:
        d = m.group(1)
        rings = []
        for seg in d.split('M'):
            if not seg.strip():
                continue
            ring_pts = []
            for p in seg.split('L'):
                p = p.strip()
                if p:
                    xy = p.split(',')
                    if len(xy) == 2:
                        ring_pts.append((float(xy[0]), float(xy[1])))
            if len(ring_pts) >= 3:
                rings.append(np.array(ring_pts, dtype=np.float32))
        rings.sort(key=len, reverse=True)
        state_contours_all[sid] = rings

# Rasterize all land to canvas 1872x1002
W, H = 1872, 1002
land_canvas = np.zeros((H, W), dtype=np.uint8)
for lc in land_contours:
    cnt = lc['pts'].reshape(-1, 1, 2).astype(np.int32)
    cv2.fillPoly(land_canvas, [cnt], 255)

# Rasterize and subtract all state polygons
state_canvas = np.zeros((H, W), dtype=np.uint8)
for sid, rings in state_contours_all.items():
    for r in rings:
        cnt = r.reshape(-1, 1, 2).astype(np.int32)
        cv2.fillPoly(state_canvas, [cnt], 255)

# Neutral zones = land - states
neutral_canvas = cv2.bitwise_and(land_canvas, cv2.bitwise_not(state_canvas))

# Find contours of neutral zones
contours, _ = cv2.findContours(neutral_canvas, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
contours_by_area = sorted(contours, key=cv2.contourArea, reverse=True)

print(f"\nNeutral zone regions (top 15):")
for i, cnt in enumerate(contours_by_area[:15]):
    area = cv2.contourArea(cnt)
    bb = cv2.boundingRect(cnt)
    cx = bb[0] + bb[2]//2
    cy = bb[1] + bb[3]//2
    print(f"  [{i}] area={area:.0f}, center_svg=({cx},{cy}), bbox=x{bb[0]}y{bb[1]}w{bb[2]}h{bb[3]}")

# Debug image
debug = cv2.cvtColor(neutral_canvas, cv2.COLOR_GRAY2BGR)
colors = [(255, 0, 255), (0, 200, 255), (255, 150, 0)]
for i, cnt in enumerate(contours_by_area[:3]):
    cv2.drawContours(debug, [cnt], -1, colors[i], 3)
    bb = cv2.boundingRect(cnt)
    cx = bb[0] + bb[2]//2
    cy = bb[1] + bb[3]//2
    cv2.circle(debug, (cx, cy), 15, colors[i], -1)
    
cv2.imwrite('scripts/neutral_zones_debug.png', debug)
print("\nSaved scripts/neutral_zones_debug.png")
