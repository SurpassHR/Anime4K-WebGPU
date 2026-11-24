# Architecture

## Runtime

```text
HTMLVideoElement
  │  copyExternalImageToTexture (rgba8unorm)
  ▼
Clamp Highlights (optional, 3 passes)
  ▼
Restore CNN (S) (4 conv passes, source resolution)
  ▼
Upscale CNN x2 (S) (4 conv passes + depth-to-space, 2× only)
  ▼
bgra8unorm canvas overlay
```

1× mode stops after Restore and uses a final blit pass. 2×/4×/8× modes run
one/two/three Upscale + depth-to-space stages. `balanced` and `ultra` add one
or two Restore refinement passes at output resolution. The canvas is sized to
source × scale and positioned over the video element; CSS `object-fit` mirrors
the video's fit.

## Files

- `extension/manifest.json` — MV3 manifest source; content script on all frames.
- `src/core/anime4k-webgpu.ts` — typed `Anime4KWebGPU` renderer shared by demo, tests and extension.
- `src/core/weights.ts` — Restore S + Upscale S weights as `Float32Array`.
- `src/core/shaders/*.wgsl` — vertex and fragment WGSL modules imported with Vite `?raw`.
- `src/extension/content.ts` — video discovery, canvas overlay, and popup message API; no in-page controls.
- `src/extension/protocol.ts` — shared popup/content message and state types.
- `src/popup/*` — React toolbar popup built with `@xmsthc/studio-ui`.
- Popup frame routing: `webNavigation.getAllFrames` + `tabs.sendMessage({ frameId })`
  selects the frame with a video or an active renderer (top-level and iframe players).
- The overlay host is inserted immediately before the `<video>` in its player DOM with
  `z-index: 0`. The video is made transparent, while player controls, danmaku and skins
  stay above the canvas.
- `vite.config.ts` / `vite.extension.config.ts` — multi-page site and IIFE extension builds.
- Build outputs: `dist/site/` and `dist/extension/` (load the latter in Chrome).

## Renderer API

```ts
const up = new Anime4KWebGPU(video, canvas, {
  output: "auto",        // auto | restore | 2x | 4x | 8x
  quality: "simple",     // simple | balanced | ultra
  clampHighlights: false,
  fps: 30,
  backpressure: true,
  onError: (err) => {},
});
await up.init();
up.start();

up.setOutput("4x");
up.setQuality("balanced");
up.setClampHighlights(true);
const stats: Anime4KStats = up.getStats();
up.stop();
up.destroy();
```

The renderer is exported as an ES module. There are no global `Anime4KWebGPU` or `Anime4KData` objects.

## Resource lifetime

- `buildGraph(w, h)` creates textures, uniform buffers, weight storage buffers and bind groups.
- Mode/factor/quality/clamp changes set `pendingRebuild`; the next frame rebuilds only when no frame is in flight.
- `backpressure` uses `queue.onSubmittedWorkDone()`; while pending, new video frames are skipped instead of queued.
- `device.lost` stops the renderer, clears `inFlight` and forwards an error; `destroy()` marks the instance destroyed so intentional device destruction does not surface as an error.

## Pass order

1. `clampH` — 5-tap horizontal luma max.
2. `clampV` — 5-tap vertical luma max.
3. `clampRGB` — subtract overbright luma, output alpha 1.
4. `restore[0..3]` — 4 convolutions; split ReLU; final residual add.
5. `upscale[0..3]` — 4 convolutions; final depth-to-space 2×. Repeat 1/2/3 times for 2×/4×/8×.
6. `balanced`/`ultra` — run the restore weights again at output resolution (1 or 2 passes).
7. `depth` or `blit` — present to canvas.

## Texture formats

- video upload: `rgba8unorm`, usage `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT`.
- intermediates: `rgba16float`, usage `RENDER_ATTACHMENT | TEXTURE_BINDING`.
- canvas: `navigator.gpu.getPreferredCanvasFormat()`; do not force an `-srgb` format.
