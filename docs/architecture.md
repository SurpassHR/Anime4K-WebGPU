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

1× mode stops after Restore and uses a final blit pass. 2× mode runs the
Upscale stage and depth-to-space. The canvas is sized to source × scale and
positioned over the video element; CSS `object-fit` mirrors the video's fit.

## Files

- `extension/manifest.json` — MV3 manifest, content script on all frames.
- `extension/anime4k-data.js` — Restore S + Upscale S weights as `Float32Array`.
- `extension/anime4k-webgpu.js` — `Anime4KWebGPU` renderer; no build step.
- `extension/content.js` — video discovery, overlay, button, HUD, mode/clamp controls.

## Renderer API

```js
const up = new Anime4KWebGPU(video, canvas, {
  mode: "auto",          // auto | restore | upscale2x
  clampHighlights: false,
  fps: 30,
  backpressure: true,
  onError: (err) => {},
});
await up.init();
up.start();

up.setMode("upscale2x");
up.setClampHighlights(true);
up.getStats(); // { mode, scale, width, height, fps, frames, inFlight, format, upload }
up.stop();
up.destroy();
```

## Resource lifetime

- `buildGraph(w, h)` creates textures, uniform buffers, weight storage buffers and bind groups.
- Mode/clamp changes set `_pendingRebuild`; the next frame rebuilds only when no frame is in flight.
- `backpressure` uses `queue.onSubmittedWorkDone()`; while pending, new video frames are skipped instead of queued.
- `device.lost` clears `inFlight` and forwards an error; `destroy()` marks the instance destroyed so intentional device destruction does not surface as an error.

## Pass order

1. `clampH` — 5-tap horizontal luma max.
2. `clampV` — 5-tap vertical luma max.
3. `clampRGB` — subtract overbright luma, output alpha 1.
4. `restore[0..3]` — 4 convolutions; split ReLU; final residual add.
5. `upscale[0..3]` — 4 convolutions; final depth-to-space 2×.
6. `depth` or `blit` — present to canvas.

## Texture formats

- video upload: `rgba8unorm`, usage `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT`.
- intermediates: `rgba16float`, usage `RENDER_ATTACHMENT | TEXTURE_BINDING`.
- canvas: `navigator.gpu.getPreferredCanvasFormat()`; do not force an `-srgb` format.
