# Troubleshooting

## `The canvas has been tainted by cross-origin data`

You opened the demo with `file://`. Chromium marks a canvas tainted after
`drawImage(video)`, so `getImageData()` is blocked. WebGPU
`copyExternalImageToTexture` also usually cannot read local-file video frames.

Use HTTP:

```bash
npm run serve
# http://127.0.0.1:8765/demo/color-test.html
```

The page now detects `file://` and prints the exact command instead of throwing.

## `WebGPU 不可用`

- Chrome/Edge 113+ recommended.
- Check `chrome://gpu` for WebGPU status.
- On macOS, Metal must be available; remote desktop/headless environments may expose no adapter.

## `Destination texture needs CopyDst and RenderAttachment usage`

`copyExternalImageToTexture` requires the destination texture to have both
`COPY_DST` and `RENDER_ATTACHMENT` usage. The renderer already does this.

## Black frames / no output

- Check `video.readyState >= 2` and `video.videoWidth > 0`.
- Try playing the video; a paused, freshly-seeked frame can be black on the first render.
- For cross-origin video, the browser may block frame readback.
- Check HUD `format` and `mode`.

## Stutter

- Switch to `1x 修复`.
- Lower `fps` in `extension/content.js` (default 30).
- Close other GPU-heavy tabs.
- If 1× still stutters, profile upload/overlay; the CNN is not the only possible bottleneck.

## Overexposure / washed-out colors

- Run `demo/color-test.html` over HTTP.
- Flat patches > 2/255 indicate a color-space/format problem.
- Do not use `bgra8unorm-srgb` while shader values are already sRGB-encoded.
- If adding `importExternalTexture`, gate it behind the color test and fall back to copy.

## DRM / EME

Protected video frames cannot be captured. The extension cannot upscale Netflix,
Disney+, etc. This is a platform restriction, not a shader limitation.
