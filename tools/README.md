# Tools

## Extract weights

```bash
npm run extract:weights
```

Reads `research/anime4k-shaders/Anime4K_Restore_CNN_S.glsl` and
`Anime4K_Upscale_CNN_x2_S.glsl` and writes `research/weights.json`. Runtime
weights live in `src/core/weights.ts`; keep the two in sync when changing models.

## Validate WGSL

```bash
cargo install naga-cli --locked
npm run validate:wgsl
```

`validate-wgsl.sh` runs naga directly on each `src/core/shaders/*.wgsl` source
module. There is no separate extraction step.
