import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

states_body = re.search(r'<g\s+id="statesBody"[^>]*>(.*?)</g>', content, re.DOTALL)
if states_body:
    sb = states_body.group(1)
    for pid in ['state25', 'state26', 'state27', 'state28', 'state29']:
        p_match = re.search(rf'<path\s+[^>]*id="{pid}"[^>]*d="([^"]+)"[^>]*>', sb)
        if p_match:
            d = p_match.group(1)
            # Find all M commands
            m_parts = re.split(r'M', d)
            # First element is empty because string starts with M
            rings = [part for part in m_parts if part.strip()]
            print(f"State {pid}: {len(rings)} sub-polygons / rings")
            for i, r in enumerate(rings):
                pts = r.split('L')
                print(f"  Ring {i}: {len(pts)} points, starts at {pts[0]}, ends at {pts[-1]}")
