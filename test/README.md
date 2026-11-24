# Regression pages

Serve from the repository root, not from `test/`:

```bash
cd ~/Projects/Code/Anime4K-WebGPU
python3 -m http.server 8765
```

Then open:

- `http://127.0.0.1:8765/test/auto-mode.html` — auto mode chooses Restore at 640px; `setMode('upscale2x')` rebuilds to 2×.
- `http://127.0.0.1:8765/test/color-2x.html` — SMPTE bars, 2× + Clamp. Expected max error ≤ 2/255.
- `http://127.0.0.1:8765/test/color-restore.html` — SMPTE bars, 1× Restore. Expected max error ≤ 1/255.

Headless Chrome example:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --enable-unsafe-webgpu --use-angle=metal \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/a4k-test --virtual-time-budget=20000 \
  --dump-dom http://127.0.0.1:8765/test/auto-mode.html
```

The pages write results into `document.body.dataset.result`.
