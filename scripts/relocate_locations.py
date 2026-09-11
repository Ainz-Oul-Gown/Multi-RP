"""
Relocate locations to be inside their state polygon.
- Locations outside -> move inside
- All locations -> slightly redistribute for better coverage
"""
import json
import sys
import numpy as np
import cv2
import random

sys.stdout.reconfigure(encoding='utf-8')
random.seed(42)
np.random.seed(42)

# ============================================================
# Coordinate transform
# ============================================================
sx = 6.055213
ox = -5580.7692
sy = -7.746826
oy = 4161.2763

def world_to_svg(wx, wy):
    x = (wx - ox) / sx
    y = (wy - oy) / sy
    return x, y

def svg_to_world(sx_v, sy_v):
    wx = int(round(sx * sx_v + ox))
    wy = int(round(sy * sy_v + oy))
    return wx, wy

# ============================================================
# Load data
# ============================================================
with open('Этерия 2.6.json', 'r', encoding='utf-8') as f:
    world = json.load(f)

# ============================================================
# Build rasterized masks per state (SVG space 1872x1002)
# ============================================================
import re

svg_path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"
with open(svg_path, 'r', encoding='utf-8') as f:
    svg_text = f.read()

state_svg_ids = {
    'Эскорин': 'state25',
    'Дварфиз': 'state26',
    'Роарн': 'state27',
    'Нагетс': 'state28',
    'Сильфето': 'state29',
}

def extract_svg_rings(svg_text, sid):
    m = re.search(rf'<path\s+[^>]*id="{sid}"[^>]*d="([^"]+)"[^>]*>', svg_text)
    if not m:
        return []
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
                    ring_pts.append([float(xy[0]), float(xy[1])])
        if len(ring_pts) >= 3:
            rings.append(np.array(ring_pts, dtype=np.float32))
    return rings

W, H = 1872, 1002

# Build state masks in SVG space
state_masks = {}
state_svg_rings = {}
for state_name, svg_id in state_svg_ids.items():
    rings = extract_svg_rings(svg_text, svg_id)
    state_svg_rings[state_name] = rings
    mask = np.zeros((H, W), dtype=np.uint8)
    for r in rings:
        cnt = r.reshape(-1, 1, 2).astype(np.int32)
        cv2.fillPoly(mask, [cnt], 255)
    state_masks[state_name] = mask
    print(f"Built mask for {state_name}: {np.sum(mask > 0)} px, {len(rings)} rings")

# Also build neutral zone masks from rasterization
# (use generated_borders.json polygons, convert world -> svg)
with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

neutral_names = ['Песчаная Бездна', 'Сумеречный Предел', 'Долина Шрамов']
for nn in neutral_names:
    b = borders.get(nn, {})
    pts = b.get('points', [])
    if not pts:
        continue
    mask = np.zeros((H, W), dtype=np.uint8)
    svg_pts = [world_to_svg(p['x'], p['y']) for p in pts]
    cnt = np.array(svg_pts, dtype=np.float32).reshape(-1, 1, 2).astype(np.int32)
    cv2.fillPoly(mask, [cnt], 255)
    state_masks[nn] = mask
    print(f"Built mask for {nn}: {np.sum(mask > 0)} px")

# ============================================================
# Point-in-polygon test via mask lookup
# ============================================================
def point_in_state_mask(wx, wy, state_name):
    mask = state_masks.get(state_name)
    if mask is None:
        return False
    sx_v, sy_v = world_to_svg(wx, wy)
    ix, iy = int(round(sx_v)), int(round(sy_v))
    if 0 <= ix < W and 0 <= iy < H:
        return mask[iy, ix] > 0
    return False

# ============================================================
# Generate candidate points inside mask using eroded mask
# ============================================================
def get_interior_points(state_name, n_candidates=500, erosion=10):
    mask = state_masks.get(state_name)
    if mask is None:
        return []
    # Erode to avoid edges
    kernel = np.ones((erosion, erosion), np.uint8)
    eroded = cv2.erode(mask, kernel, iterations=1)
    # All valid pixels
    ys, xs = np.where(eroded > 0)
    if len(ys) == 0:
        # Fallback: no erosion
        ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return []
    # Sample random subset
    indices = np.random.choice(len(ys), size=min(n_candidates, len(ys)), replace=False)
    svg_pts = list(zip(xs[indices].tolist(), ys[indices].tolist()))
    world_pts = [svg_to_world(sx_v, sy_v) for sx_v, sy_v in svg_pts]
    return world_pts

# ============================================================
# Distribute locations evenly using grid-based selection
# ============================================================
def distribute_locations_in_state(state_name, n_locs, grid_rows=8, grid_cols=8):
    """Return n_locs world positions spread across the state polygon."""
    mask = state_masks.get(state_name)
    if mask is None:
        return []
    
    # Get all valid SVG pixels in eroded mask
    kernel = np.ones((8, 8), np.uint8)
    eroded = cv2.erode(mask, kernel, iterations=1)
    ys, xs = np.where(eroded > 0)
    if len(ys) == 0:
        ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return []
    
    pts = list(zip(xs.tolist(), ys.tolist()))
    
    # Divide bounding box into grid cells
    x_min, x_max = min(p[0] for p in pts), max(p[0] for p in pts)
    y_min, y_max = min(p[1] for p in pts), max(p[1] for p in pts)
    
    cell_w = (x_max - x_min + 1) / grid_cols
    cell_h = (y_max - y_min + 1) / grid_rows
    
    # Assign pts to cells
    cells = {}
    for px, py in pts:
        ci = min(int((px - x_min) / cell_w), grid_cols - 1)
        cj = min(int((py - y_min) / cell_h), grid_rows - 1)
        key = (ci, cj)
        if key not in cells:
            cells[key] = []
        cells[key].append((px, py))
    
    # Pick one random point from each cell, cycling if needed
    cell_keys = list(cells.keys())
    random.shuffle(cell_keys)
    
    selected = []
    i = 0
    while len(selected) < n_locs:
        key = cell_keys[i % len(cell_keys)]
        p = random.choice(cells[key])
        selected.append(p)
        i += 1
    
    return [svg_to_world(p[0], p[1]) for p in selected[:n_locs]]

# ============================================================
# Main: process all states
# ============================================================
total_moved = 0
total_outside = 0
total_locs = 0

states_processed = []
for s in world['geography']['states']:
    name = s['name']
    locs = s.get('locations', [])
    if not locs:
        continue
    if name not in state_masks:
        print(f"⚠ No mask for {name}, skipping")
        continue
    
    n = len(locs)
    total_locs += n
    
    # Check which are outside
    outside_idxs = []
    for i, loc in enumerate(locs):
        wx, wy = loc.get('pos_x', 0), loc.get('pos_y', 0)
        if not point_in_state_mask(wx, wy, name):
            outside_idxs.append(i)
    
    total_outside += len(outside_idxs)
    
    # Generate new positions for ALL locations using grid distribution
    new_positions = distribute_locations_in_state(name, n, grid_rows=10, grid_cols=10)
    
    if not new_positions:
        print(f"⚠ Could not generate positions for {name}")
        continue
    
    # How many to move: always move outsiders, optionally shuffle insiders too
    # User wants: move outsiders + slightly shift insiders
    # Strategy: 
    # - 100% of outsiders get new grid positions
    # - 30% of insiders get slightly shifted (stay in same area)
    
    inside_idxs = [i for i in range(n) if i not in outside_idxs]
    
    n_to_move = len(outside_idxs) + len(inside_idxs) // 3
    
    # Apply new positions
    locs_to_move = list(outside_idxs) + random.sample(inside_idxs, min(len(inside_idxs) // 3, len(inside_idxs)))
    
    for i, loc_idx in enumerate(locs_to_move):
        new_pos = new_positions[i % len(new_positions)]
        locs[loc_idx]['pos_x'] = new_pos[0]
        locs[loc_idx]['pos_y'] = new_pos[1]
    
    total_moved += len(locs_to_move)
    
    if outside_idxs:
        print(f"  {name}: {len(outside_idxs)}/{n} outside → moved; also shifted {len(locs_to_move) - len(outside_idxs)} insiders")
    else:
        print(f"  {name}: all {n} inside, shifted {len(locs_to_move)} for better distribution")
    
    states_processed.append(name)

print(f"\nTotal locations: {total_locs}")
print(f"Total outside: {total_outside}")
print(f"Total repositioned: {total_moved}")

# ============================================================
# Save
# ============================================================
with open('Этерия 2.6.json', 'w', encoding='utf-8') as f:
    json.dump(world, f, ensure_ascii=False, indent=2)
print("\nSaved Этерия 2.6.json with updated location positions")
