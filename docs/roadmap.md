# Roadmap

## P0 — correctness and debugging

- [x] Color-safe upload path (`copyExternalImageToTexture`, `rgba8unorm`).
- [x] 1× Restore / 2×/4×/8× Upscale / auto output strategy.
- [x] Optional Clamp, toolbar popup settings, mode selector.
- [x] Single-frame in-flight backpressure.
- [x] SMPTE color regression tests.

## P1 — performance

- [ ] Compute-shader port (`@workgroup_size(8, 8)`, `texture_storage_2d<rgba16float, write>`).
- [ ] Optional `importExternalTexture` with automatic color-bar validation and copy fallback.
- [ ] Adaptive quality based on measured GPU frame time, not only display size.
- [ ] `shader-f16` path where supported.
- [ ] Fuse Clamp into upload or a single 5×5 pass.
- [ ] Research-only: benchmark Anime4KMetal on M1 Pro 14-core/16GB
  (`Restore_CNN_M`, Mode A Fast, Mode A+A HQ; 1080p→1440p; GPU ms, dropped
  frames, memory). Verify macOS 26 compatibility first; do not implement yet.

## P2 — extension productization

- [ ] Per-site whitelist/settings page.
- [ ] Cross-origin recovery (`crossOrigin='anonymous'` + reload, with user consent).
- [ ] Container fullscreen / iframe / open Shadow DOM hardening.
- [ ] Subtitle/control layering tests on common players.
- [ ] Device-lost recovery and error telemetry-free diagnostics.
- [x] Merge “超分模式” and “超分倍数” into one Output Strategy control
  (Automatic / 1× restore / 2× / 4× / 8×). Automatic uses 1× or 2× only.

## P3 — quality

- [ ] More Anime4K models (M/L/VL/UL, GAN).
- [x] 2×/4×/8× presets and simple/balanced/ultra refinement levels with explicit GPU-limit warnings.
- [ ] Benchmark page (1080p→4K target).
- [ ] Visual A/B and SSIM/PSNR comparison against bilinear.
