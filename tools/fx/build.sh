#!/bin/bash
cd /home/claude/fxtest/parts && cat p1_core.js p2_burst.js $(ls p[3-8]*.js 2>/dev/null) p9_class.js > /home/claude/ArcanWeb/js/skillfx.js && node --check /home/claude/ArcanWeb/js/skillfx.js 2>&1 | head -5 || true
