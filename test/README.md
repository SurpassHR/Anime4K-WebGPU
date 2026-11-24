# Regression pages

Start the Vite dev server from the repository root:

```bash
cd ~/Projects/Code/Anime4K-WebGPU
npm run dev
```

Then open:

- `http://127.0.0.1:8765/test/auto-mode.html` — auto mode chooses Restore at 640px; `setOutput('2x')` rebuilds to 2×.
- `http://127.0.0.1:8765/test/color-2x.html` — SMPTE bars, 2× + Clamp. Expected max error ≤ 2/255.
- `http://127.0.0.1:8765/test/color-restore.html` — SMPTE bars, 1× Restore. Expected max error ≤ 1/255.

Automated regression (uses the local Chrome installation):

```bash
npx playwright install chromium   # first run only, for the extension popup test
npm run test:e2e
```

The page tests use local Chrome and assert `document.body.dataset.result`. The extension popup test loads `dist/extension` in Playwright's bundled Chromium, starts the same Vite server on port 8766, and verifies that the player contains no controls. Manual headless Chrome example:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --enable-unsafe-webgpu --use-angle=metal \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/a4k-test --virtual-time-budget=20000 \
  --dump-dom http://127.0.0.1:8765/test/auto-mode.html
```

The pages write results into `document.body.dataset.result`.
