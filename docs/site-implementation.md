# aniwatch.top Anime4K implementation

The play page loads `/static/js/anime4k-simple-s.js?v=1`. It is a **WebGL1**
wrapper around Anime4K v4.0, not WebGPU.

## Shader chain

| Stage | Passes | Notes |
|---|---|---|
| Clamp Highlights | 3 | 5×5 luma max (horizontal then vertical) + highlight clamp |
| Restore CNN (S) | 4 | source resolution, split ReLU, final residual add |
| Upscale CNN x2 (S) | 4 + 1 | 4 convolutions + depth-to-space 2× + bilinear source residual |

The weights match the official `bloc97/Anime4K` `Restore_CNN_S` and
`Upscale_CNN_x2_S` shaders: 63 `mat4` per stage, compared term by term.

## Player integration

```js
const video = artPlayer.video;
const canvas = document.createElement("canvas");
canvas.className = "anime4k-super-resolution";
video.parentNode.insertBefore(canvas, video.nextSibling);

const up = new Anime4KSimpleS.VideoUpscaler(
  Anime4KSimpleS.ANIME4KJS_SIMPLE_S_2X
);
up.attachVideo(video, canvas);
up.start();
```

Key details:

- `texImage2D(..., video)` uploads each frame.
- `requestVideoFrameCallback` drives the loop, with `requestAnimationFrame` fallback.
- WebGL1 float extensions: `OES_texture_float`, `OES_texture_float_linear`, `EXT_color_buffer_half_float`.
- The canvas is 2× source, `pointer-events: none`, and hidden until the first frame.
- The site's UI only exposes 2×.

## Why a generic extension is more work

The shader math is the easy part. A general extension also needs video
discovery (DOM, open Shadow DOM, iframes), overlay geometry, fullscreen/PiP,
subtitle/control layering, cross-origin frame access, DRM detection, error
reporting and performance tiers.

The site's wrapper is not copied here; the WebGPU renderer is a clean
reimplementation. The Anime4K GLSL shaders themselves are MIT.
