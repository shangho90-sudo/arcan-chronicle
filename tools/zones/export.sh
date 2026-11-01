#!/bin/bash
# export zone meshes with the C# world builder
cp /home/claude/ArcanWeb/assets/data/zones.json /tmp/resroot/Arcan/Data/zones.json
cd /home/claude/ArcanChronicle
for z in "$@"; do
/opt/pwsh/pwsh -NoProfile -File Tools/Tests/csc.ps1 -Out /tmp/export_web.dll -SourceDirs "Assets/Arcan/Scripts" -Sources "Tools/Tests/Stubs/UnityCoreStubs.cs,Tools/Tests/Stubs/UnityRuntimeStubs.cs,Tools/Preview/SceneExport.cs" -Run "Arcan.Tools.SceneExport.Web" -RunArgs "/tmp/resroot,$z,/home/claude/ArcanWeb/assets/zone_$z.json" 2>&1 | grep -E "web export|error"
done
