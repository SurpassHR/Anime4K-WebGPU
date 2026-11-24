#!/bin/zsh
cd "$(dirname "$0")" || exit 1
echo "Serving http://127.0.0.1:8765/"
echo "Open http://127.0.0.1:8765/color-test.html for the color test."
echo "Press Ctrl+C to stop."
python3 -m http.server 8765
