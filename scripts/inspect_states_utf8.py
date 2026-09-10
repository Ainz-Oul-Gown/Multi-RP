import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"C:\Users\Влад\Desktop\Этерия\Политическая Карта.svg"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's inspect states group
states_group = re.search(r'<g\s+id="states"[^>]*>(.*?)</g>', content, re.DOTALL)
if states_group:
    sg = states_group.group(1)
    print("--- <g id='states'> content ---")
    for line in sg.strip().split('\n'):
        print(line)

# Let's inspect statesBody
states_body = re.search(r'<g\s+id="statesBody"[^>]*>(.*?)</g>', content, re.DOTALL)
if states_body:
    sb = states_body.group(1)
    print("\n--- <g id='statesBody'> paths ---")
    paths = re.findall(r'<path\s+[^>]*id="([^"]+)"[^>]*fill="([^"]+)"[^>]*>', sb)
    for pid, fill in paths:
        print(f"Path ID: {pid}, fill: {fill}")

# Check textPaths defs
text_paths = re.search(r'<g\s+id="textPaths"[^>]*>(.*?)</g>', content, re.DOTALL)
if text_paths:
    tp = text_paths.group(1)
    print("\n--- <g id='textPaths'> matching stateLabel ---")
    for line in tp.strip().split('\n'):
        if 'stateLabel' in line:
            print(line)
