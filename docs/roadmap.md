# Roadmap

## P0 — correctness and debugging

- [x] Color-safe upload path (`copyExternalImageToTexture`, `rgba8unorm`).
- [x] 1× Restore / 2× Upscale / auto mode.
- [x] Optional Clamp, HUD, mode selector.
- [x] Single-frame in-flight backpressure.
- [x] SMPTE color regression tests.

## P1 — performance

- [ ] Compute-shader port (`@workgroup_size(8, 8)`, `texture_storage_2d<rgba16float, write>`).
- [ ] Optional `importExternalTexture` with automatic color-bar validation and copy fallback.
- [ ] Adaptive quality based on measured GPU frame time, not only display size.
- [ ] `shader-f16` path where supported.
- [ ] Fuse Clamp into upload or a single 5×5 pass.

## P2 — extension productization

- [ ] Per-site whitelist/settings page.
- [ ] Cross-origin recovery (`crossOrigin='anonymous'` + reload, with user consent).
- [ ] Container fullscreen / iframe / open Shadow DOM hardening.
- [ ] Subtitle/control layering tests on common players.
- [ ] Device-lost recovery and error telemetry-free diagnostics.

## P3 — quality

- [ ] More Anime4K models (M/L/VL/UL, GAN).
- [ ] 4× presets with explicit performance warning.
- [ ] Benchmark page (1080p→4K target).
- [ ] Visual A/B and SSIM/PSNR comparison against bilinear.
