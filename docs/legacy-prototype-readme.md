# Anime4K WebGPU：站点实现分析与最小浏览器插件原型（历史版本）

> 这是项目迁移到 `~/Projects/Code/Anime4K-WebGPU` 之前的原型 README，保留作分析存档。
> 文中 `outputs/anime4k-webgpu/...` 是旧路径；当前目录结构、命令和状态以根目录 [README.md](../README.md) 为准。

## 1. 站点是怎么实现的

目标页面：`https://www.aniwatch.top/play/1517`

站点播放器加载了 `/static/js/anime4k-simple-s.js?v=1`，这是 **WebGL1** 的 Anime4K 实现，不是 WebGPU。核心结构：

- `VideoUpscaler` 类：创建 canvas、`webgl` context、framebuffer、float/half-float 纹理。
- `ANIME4KJS_SIMPLE_S_2X`：由 3 个 GLSL program 组成，实际是 Anime4K 官方 shader 链：

| 阶段 | 内容 | 说明 |
|---|---|---|
| Clamp Highlights | 3 个 pass | 5×5 亮度最大值（先横后纵）+ 高光抑制 |
| Restore CNN (S) | 4 个 conv pass | 源分辨率，4 通道特征，split ReLU，最后一个 pass 加 residual |
| Upscale CNN x2 (S) | 4 个 conv pass + depth-to-space | 最后从 4 通道 sub-pixel 还原 2× RGB，并叠加双线性放大的原图 |

权重与官方 `bloc97/Anime4K` 的 `Restore_CNN_S`、`Upscale_CNN_x2_S` 完全一致：各 63 个 `mat4`，已逐项比对。

播放器侧接入（`app.js`）：

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

关键细节：

- 每帧 `texImage2D(TEXTURE_2D, ..., video)` 把 `<video>` 当前帧上传为纹理。
- 用 `requestVideoFrameCallback` 跟随视频帧，回退到 `requestAnimationFrame`。
- canvas 尺寸设置为视频的 2×，覆盖在 video 上方；`pointer-events: none`，首帧后才显示。
- WebGL 需要 `OES_texture_float`、`OES_texture_float_linear`、`EXT_color_buffer_half_float`。
- 打开/关闭按钮是站点自己的「开启超分（Anime4K）」，只支持 2×。

## 2. 能否提取成浏览器插件

**能，但「提取 shader」只占工作量的 20%。**

可以复用的部分：

- Anime4K shader 权重和数学（MIT License，来自 bloc97/Anime4K）。
- 「视频帧 → GPU 纹理 → 多 pass → 2× canvas → 覆盖到 video 上」这条渲染链。

不能直接复制就完事的部分：

- 站点 wrapper 是站点自己的代码，未声明开源协议；建议按官方 shader 重写，而不是原样搬运 `anime4k-simple-s.js`。
- 通用插件要处理 DOM、Shadow DOM、iframe、播放器全屏、网页全屏、画中画、字幕、控制条、窗口缩放。
- 跨域视频如果没有 CORS，WebGPU 读不到帧；需要 `crossOrigin = "anonymous"` 重载，或服务端加 `Access-Control-Allow-Origin`。
- DRM/EME（Netflix、Disney+ 等）无法读取帧，插件不可能对受保护视频做超分。
- 如果播放器把 `<video>` 元素本身全屏，页面 overlay 无法盖在顶层视频上；只有容器全屏/网页全屏可行。

## 3. WebGPU 移植方案

推荐结构（也是 NijiLucid 的做法）：

1. **帧上传**
   - 优先 `device.importExternalTexture({ source: video })`，零拷贝。
   - 不可用时回退 `copyExternalImageToTexture`。
   - 再不可用回退 `createImageBitmap(video)` 或 2D canvas。
2. **计算着色器而不是 fragment shader**
   - `@compute @workgroup_size(8, 8)` + `texture_storage_2d<rgba16float, write>`。
   - `textureLoad` + clamp 坐标，像素对齐，不依赖 sampler 过滤。
   - 每个 conv 层是一个 dispatch；depth-to-space 是最后一个 dispatch。
3. **纹理格式**
   - 输入：`rgba8unorm`（或 external texture）。
   - 中间：`rgba16float`，动态范围足够。
   - 输出：canvas 的 `getPreferredCanvasFormat()`。
4. **pass 图**
   - 2×：Clamp×3 + Restore×4 + Upscale×4 + DepthToSpace×1 = 12 个 pass。
   - 4×：Upscale 阶段重复两次（NijiLucid 的 `CNNx2M + CNNx2M` 预设）。
5. **性能**
   - 1080p→4K、2×、8 个卷积层，对 GPU 和带宽都不轻。
   - 建议做 2×/4×、性能档位、帧率上限、GPU 基准测试。
   - NijiLucid 的基准目标是 1080p→4K 24fps，并分 快速/均衡/质量/极致 四档。

## 4. 这个原型包含什么

```
outputs/anime4k-webgpu/
├── extension/                 # 可加载的 MV3 原型（1×/2× auto）
│   ├── manifest.json
│   ├── anime4k-data.js        # Restore S + Upscale S 权重
│   ├── anime4k-webgpu.js      # WebGPU renderer（fragment shader 版）
│   └── content.js             # 视频发现、按钮、canvas overlay
├── demo/
│   ├── index.html             # 独立 WebGPU demo
│   ├── demo.js
│   ├── color-test.html        # SMPTE 彩条逐点颜色测试
│   ├── color-test.js
│   ├── anime4k-data.js
│   ├── anime4k-webgpu.js
│   ├── sample.mp4
│   └── color.mp4
└── README.md
```

### 加载扩展

1. Chrome/Edge 打开 `chrome://extensions`。
2. 打开「开发者模式」。
3. 「加载已解压的扩展程序」→ 选择 `extension/` 目录。
4. 在有 `<video>` 的页面播放视频，右下角出现「✨ 超分」，点击即可。

> 这是原型，不是生产插件。默认 `auto`（按显示尺寸选 1× 或 2×）、30fps 上限、fragment shader 实现；没有 per-site 白名单、跨域自动恢复、4×、GPU 基准测试。

> 更新：现在已经加入 **自动/1×/2×** 三档、`Clamp` 开关、FPS/HUD 和单帧 in-flight 背压。默认 `auto`：显示尺寸不需要 2× 时只跑 Restore（1×），需要时才跑 2×。

### 运行独立 demo

```bash
cd outputs/anime4k-webgpu/demo
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

也可以直接双击 `demo/serve.command`（macOS）。

### 常见错误：canvas has been tainted

如果颜色测试报：

```text
Failed to execute 'getImageData' on 'CanvasRenderingContext2D':
The canvas has been tainted by cross-origin data.
```

说明你用的是 `file://` 直接打开。浏览器会把本地视频画到 canvas 后标记为 cross-origin，随后禁止 `getImageData`。这不是颜色算法错误。

请改用：

```bash
cd outputs/anime4k-webgpu/demo
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/color-test.html
```

`file://` 下 WebGPU 的 `copyExternalImageToTexture` 也通常读不到视频帧，所以主 demo 也需要 HTTP。

## 5. 已验证

- WGSL 通过 `naga` 校验（CONV / CLAMP_H / CLAMP_V / CLAMP_RGB / DEPTH 全部 Validation successful）。
- headless Chrome + Metal：`1280×720 → 2560×1440`，2 帧，输出平均亮度 `126.8`，源视频平均亮度 `125.7`。
- 与浏览器双线性 2× 放大的平均绝对差 `2.46`，说明 CNN 不是简单 passthrough。
- 强制 2× 时扩展 UI 实测：点击后 `UP=true`、`CANVAS=2560×1440`、`video.opacity=0`，按钮变为「关闭超分」。
- **颜色准确性（SMPTE 彩条，2×）**：18 个采样点最大误差 `2/255`，平均 `0.28/255`。
- **颜色准确性（SMPTE 彩条，1× Restore）**：最大误差 `1/255`，平均 `0.07/255`。
- **`color-test.html`（HTTP 下，2×）**：`MAXD=1/255`，`MEAND=0.11/255`。
- **自动档位**：640px 显示宽度 + 1280×720 源视频 → `restore`、1280×720；切到 `upscale2x` → 2560×1440；打开 `Clamp` 后重建成功。

## 6. 针对 NijiLucid 的卡顿/过曝，这个版本做了什么

### 过曝

本原型不使用 `importExternalTexture`，而是固定走：

```text
HTMLVideoElement -> copyExternalImageToTexture -> rgba8unorm
-> rgba16float 中间纹理 -> bgra8unorm canvas
```

关键是 **不要在颜色空间上做第二次转换**：输入和输出都使用非 `-srgb` 格式，shader 里处理的是视频原本的编码值（和站点 WebGL 实现一致）。这样不会把 sRGB 当线性值再编码一次，避免中间灰被抬亮。

`importExternalTexture` 更快，但它的采样颜色空间/精度取决于浏览器和视频源；如果直接把 external texture 当普通 `rgba8unorm` 用，容易出现 gamma/过曝。要加这条路径，建议先用 SMPTE 彩条和灰阶斜坡做逐点对比。

### 卡顿

- **默认 `auto`**：显示尺寸不够大时只跑 `Restore`（4 个 conv + blit），不跑 8 个 conv + depth-to-space 的 2× 链。1× 的 pass 数约为 2× 的 1/2.4，带宽也少很多。
- **单帧 in-flight 背压**：`queue.onSubmittedWorkDone()` 完成前跳过新帧，避免 GPU 队列越积越多造成“越看越卡”。
- **30fps 上限**：默认 `fps: 30`，减少 GPU 压力；可在 `content.js` 改。
- **默认关闭 Clamp**：少 3 个 pass。需要高光保护时在 HUD 里勾选 `Clamp`。
- **不做 4×/8×**：2× 已经足够覆盖大多数 1080p→4K/Retina 场景。

### 调试 HUD

开启后左上角会显示：

```text
auto 1920x1080 → 3840x2160 · 28fps · bgra8unorm
```

- `自动 / 1x 修复 / 2x 超分`：切换模式，立即重建资源。
- `Clamp`：开关高光保护，用于对比过曝/高光。
- FPS：判断是 GPU 慢还是视频源本身掉帧。

如果 2× 只有 10–15fps，先切 `1x 修复`；如果 1× 也卡，说明瓶颈在 `copyExternalImageToTexture` 或页面本身，而不是 Anime4K。

### 关于 NijiLucid

NijiLucid 的默认预设可能包含 `CNNx2M` 两次（4×）或 `A+A`（Restore + Upscale 重复），并且默认走 `importExternalTexture`。这两点分别对应卡顿和颜色偏差的高风险来源；它的性能档位/跨域恢复/多模型仍然值得参考。

## 7. 现成方案：NijiLucid

如果你只是想在任意网站使用 Anime4K，而不是自己维护一套插件，建议直接看：

- GitHub: https://github.com/chenmozhijin/NijiLucid
- Chrome Web Store: `hpmbccepehpoanjpjkamfdpdkbmfmhek`
- Edge Add-ons / Firefox Add-ons 也有发布。

它的特点：

- 纯 WebGPU、MV3 扩展；核心 MIT，CuNNy 部分 LGPL，Anime4K shader MIT。
- 支持 Anime4K CNN S/M/L/VL/UL、GAN、2×/3×/4×/8×、性能档位。
- `importExternalTexture` + `copyExternalImageToTexture` + canvas/bitmap 多级回退。
- compute shader（不是 fragment shader），`texture_storage_2d<rgba16float>`。
- 支持 iframe、开放 Shadow DOM、跨域恢复、GPU 基准测试、性能 HUD。
- 明确不支持 EME/DRM 视频。

对比：

| | 站点内置 | 本原型 | NijiLucid |
|---|---|---|---|
| 图形 API | WebGL1 | WebGPU | WebGPU |
| shader | fragment | fragment | compute |
| 倍率 | 2× | 1×/2×（auto） | 2×/3×/4×/8× |
| 跨域恢复 | 不涉及 | 无 | 有 |
| 多模型 | 仅 S | 仅 S | S/M/L/VL/UL/GAN |
| 生产可用 | 站点自用 | 原型 | 是 |

## 8. 许可与致谢

- Anime4K shader 与权重：MIT License，https://github.com/bloc97/Anime4K
- NijiLucid：核心 MIT，https://github.com/chenmozhijin/NijiLucid
- 本站点 wrapper 代码仅用于分析，未复制到本原型；原型中的 JS 为重新实现。
