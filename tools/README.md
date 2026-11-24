# Tools

## Extract weights

```bash
npm run extract:weights
```

Reads `research/anime4k-shaders/Anime4K_Restore_CNN_S.glsl` and
`Anime4K_Upscale_CNN_x2_S.glsl`, writes `research/weights.json`, then
`npm run sync:demo` copies the runtime JS. The runtime data file
`extension/anime4k-data.js` is generated from this layout manually/with a small
script; keep the two in sync when changing models.

## Validate WGSL

```bash
cargo install naga-cli --locked
npm run validate:wgsl
```

`extract_wgsl.py` pulls the template literals out of
`extension/anime4k-webgpu.js`; `validate-wgsl.sh` runs naga on each module.
