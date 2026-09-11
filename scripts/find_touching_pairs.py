import json
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/generated_borders.json', 'r', encoding='utf-8') as f:
    borders = json.load(f)

# Ensure correct swap
pts_sp = borders['Сумеречный Предел']['points']
if min(p['x'] for p in pts_sp) > 0:
    borders['Сумеречный Предел'], borders['Долина Шрамов'] = borders['Долина Шрамов'], borders['Сумеречный Предел']

def get_pts(name):
    raw = borders[name]['points']
    return [(float(p['x']), float(p['y'])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in raw]

names = ['Эскорин', 'Роарн', 'Сумеречный Предел', 'Сильфето', 'Нагетс', 'Долина Шрамов', 'Дварфиз', 'Песчаная Бездна']
lines = {n: LineString(get_pts(n) + [get_pts(n)[0]]) for n in names}

# Let's inspect the distances between lines to find touching sections
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        d = lines[n1].distance(lines[n2])
        if d < 50:
            print(f"Touching pair: {n1} <-> {n2}, min dist = {d:.2f}")
