import subprocess
import json

out = subprocess.check_output(['git', 'show', '66df4abf49b3a56ffc2b85319ec4220e9f969157:Этерия 2.6.json'])
data = json.loads(out.decode('utf-8'))
for s in data['geography']['states']:
    pts = s.get('border_data', {}).get('points', [])
    print(f"{s['name']}: shape={s.get('border_shape')}, pts={len(pts)}")
