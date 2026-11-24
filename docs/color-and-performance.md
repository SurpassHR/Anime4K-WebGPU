# Color and performance

## Why NijiLucid can overexpose

NijiLucid's default frame path uses `importExternalTexture`. External textures
are fast but their sampling color space/precision can differ from
`copyExternalImageToTexture`. If the shader treats sRGB-encoded values as linear
(or the canvas is configured with an `-srgb` format while the shader already
holds encoded values), flat midtones get lifted and highlights clip.

NijiLucid also creates its frame texture as `rgba16float`, while the Anime4K
shaders were trained on gamma-encoded SDR video. That is a high-risk combination
unless the transfer function is handled explicitly.

### Distinguish color-management from model highlight enhancement

Use the bundled SMPTE color-bar test:

- flat patch error `> 2/255` → color space/format problem;
- only highlights/edges change → model/preset behavior (GAN/UL/quality tiers).

Our path is deliberately color-conservative:

```text
video -> copyExternalImageToTexture -> rgba8unorm
      -> rgba16float intermediates -> bgra8unorm canvas
```

Measured on SMPTE bars:

| Mode | Max error | Mean error |
|---|---:|---:|
| 2× + Clamp | 2/255 | 0.28/255 |
| 1× Restore | 1/255 | 0.07/255 |
| `color-test.html` (HTTP, 2×) | 1/255 | 0.11/255 |

## Why NijiLucid can stutter

Its `A` preset at `performance` tier is:

```text
ClampHighlights + CNNM + CNNx2M + CNNx2M
```

This is 4× upscaling with multiple CNN passes. `A+A` adds more Restore/Upscale
stages. On integrated GPUs or a Retina display, 1080p→4K 4× is expensive.

Our defaults:

- `auto`: Restore-only when the display does not need 2×;
- 30fps cap;
- one frame in flight (`queue.onSubmittedWorkDone()`), skip excess video frames;
- Clamp off by default (3 fewer passes);
- no 4×/8× yet.

## Debug workflow

1. Start with `1x 修复`; if smooth, switch to `2x 超分`.
2. If both stutter, the bottleneck is upload/overlay/page, not convolution.
3. Run `demo/color-test.html`; compare flat patches.
4. Toggle `Clamp`; if only highlights change, it is model/highlight behavior.
5. Check HUD `format`; `bgra8unorm` is expected for SDR. Avoid forcing `-srgb`.
