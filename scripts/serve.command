#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1
echo "Serving http://127.0.0.1:8765/"
echo "Demo:       http://127.0.0.1:8765/demo/"
echo "Color test: http://127.0.0.1:8765/demo/color-test.html"
echo "Tests:      http://127.0.0.1:8765/test/"
echo "Press Ctrl+C to stop."
python3 -m http.server 8765
