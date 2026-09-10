import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

states_info = {
    'state25': 'Эксорин (Эскорин)',
    'state26': 'Дварфирз (Дварфиз)',
    'state27': 'Роарн',
    'state28': 'Нагетс',
    'state29': 'Сильфето'
}

for pid, name in states_info.items():
    m = re.search(rf'<path\s+[^>]*id="{pid}"[^>]*d="([^"]+)"[^>]*>', content)
    if m:
        d = m.group(1)
        # Parse all numbers
        # Find points
        pts = []
        for part in re.split(r'[ML]', d):
            part = part.strip()
            if part:
                xy = part.split(',')
                if len(xy) == 2:
                    try:
                        pts.append((float(xy[0]), float(xy[1])))
                    except:
                        pass
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        avg_x = sum(xs) / len(xs)
        avg_y = sum(ys) / len(ys)
        print(f"{name} ({pid}):")
        print(f"  bbox: X [{min_x:.1f}, {max_x:.1f}], Y [{min_y:.1f}, {max_y:.1f}]")
        print(f"  center: ({avg_x:.1f}, {avg_y:.1f})")
