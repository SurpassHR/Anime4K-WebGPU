#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1
echo "Serving http://127.0.0.1:8765/"
echo "Open http://127.0.0.1:8765/demo/color-test.html for the color test."
echo "Press Ctrl+C to stop."
npm run serve:demo
