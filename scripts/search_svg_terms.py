import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

for term in ["Сумеречный", "Предел", "Долина", "Шрамов", "Песчаная", "Бездна", "Эскорин", "Эксорин", "Дварфиз", "Дварфирз", "Сильфето", "Роарн", "Нагетс"]:
    matches = [m.start() for m in re.finditer(term, content, re.IGNORECASE)]
    print(f"Term '{term}': {len(matches)} occurrences")
    for pos in matches[:3]:
        snippet = content[max(0, pos-100):min(len(content), pos+100)]
        print("  Snippet:", snippet.replace('\n', ' '))

# Check what groups exist in the SVG
print("\n--- All top-level groups ---")
groups = re.findall(r'<g\s+id="([^"]+)"', content)
print("All group IDs:", groups)

# Inspect <g id="regions">
reg_match = re.search(r'<g\s+id="regions"[^>]*>(.*?)</g>', content, re.DOTALL)
if reg_match:
    print("\n--- <g id='regions'> ---")
    print(reg_match.group(1)[:500])
