# Third-party notices

## Anime4K

This project reimplements the WebGPU wrapper and ports the following shaders
from [bloc97/Anime4K](https://github.com/bloc97/Anime4K), which is MIT licensed:

- `Anime4K_Clamp_Highlights.glsl`
- `Anime4K_Restore_CNN_S.glsl`
- `Anime4K_Upscale_CNN_x2_S.glsl`

The official GLSL sources are kept in `research/anime4k-shaders/` for
reproducibility. The original MIT license is included in that directory.

## NijiLucid

[NijiLucid](https://github.com/chenmozhijin/NijiLucid) was used as a reference
for WebGPU extension architecture (overlay management, frame upload fallbacks,
compute-shader layout, performance tiers). No NijiLucid source code is bundled
in this repository. NijiLucid's core is MIT licensed; its CuNNy-derived
components are LGPL-3.0-or-later. If you reuse code from NijiLucid, check its
`THIRD_PARTY_NOTICES.md` and component-level SPDX headers.

## aniwatch.top

The implementation analysis in `docs/site-implementation.md` describes the
public behavior of the site's player. The site's bundled `app.js` and
`anime4k-simple-s.js` are not copied into this repository.
