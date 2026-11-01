#!/bin/bash
# $1 = name, $2 = source glb, $3 = colour texture size
set -e
cd /home/claude/zones2
/tmp/meshoptimizer/gltfpack -i "$2" -o dec/$1.glb -si 0.01 -se 0.05 2>&1 | tail -1
python3 /home/claude/mon3d/texopt.py dec/$1.glb web/$1.glb ${3:-1024}
python3 -c "import base64,json;json.dump({'b64':base64.b64encode(open('web/$1.glb','rb').read()).decode()},open('/home/claude/ArcanWeb/assets/creatures/$1.glb.json','w'))"
ls -la dec/$1.glb web/$1.glb /home/claude/ArcanWeb/assets/creatures/$1.glb.json
