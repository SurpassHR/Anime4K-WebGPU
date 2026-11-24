# Anime4K-WebGPU

WebGPU 实时 Anime4K 视频超分/修复浏览器扩展原型。当前版本聚焦两件事：

- **颜色准确**：固定 `copyExternalImageToTexture → rgba8unorm → rgba16float → bgra8unorm`，不做 sRGB 二次转换。SMPTE 彩条实测误差 ≤ 2/255。
- **可控性能**：输出策略 `自动 / 1× 修复 / 2× / 4× / 8×`，simple/balanced/ultra 精细度，30fps 上限、单帧 in-flight 背压、可选 Clamp、浏览器工具栏悬浮设置窗。

> 状态：可加载的 MV3 原型，不是商店级成品。尚未实现 per-site 白名单、跨域自动恢复、GPU 基准测试。

## Quick start

```bash
cd ~/Projects/Code/Anime4K-WebGPU
npm install
npm run dev
# 打开 http://127.0.0.1:8765/
```

macOS 也可以直接双击 `scripts/serve.command`。

加载扩展：

```text
npm run build:extension
chrome://extensions
→ 开发者模式
→ 加载已解压的扩展程序
→ 选择 dist/extension/
```

打开任意有 `<video>` 的页面，播放视频，然后点击浏览器工具栏里的 Anime4K 图标打开悬浮设置窗。播放器内部不再显示按钮、HUD 或提示框，只保留超分 canvas。

设置窗会枚举当前标签页的所有 frame，自动选择包含视频（或正在运行）的 frame；顶层播放器和 iframe 播放器都支持。

超分 canvas 插入在播放器 DOM 中视频元素之前，层级低于播放器控件、弹幕和皮肤，因此小窗口下原有控件仍然可见。

## 目录

```text
src/core/       TypeScript 渲染器、权重与 WGSL 着色器
src/extension/  MV3 content script 源码
src/popup/      浏览器工具栏悬浮设置窗（React + studio-ui）
src/demo/       demo 与颜色测试页逻辑
src/test/       自动档位、倍数与精细度回归测试页逻辑
extension/      MV3 manifest 源文件
e2e/            Playwright 浏览器回归测试
demo/ test/     保留原有页面 URL 的 HTML 与示例视频
tools/          权重提取与 naga WGSL 校验
research/       官方 Anime4K GLSL、权重 JSON、来源说明
docs/           架构、站点实现分析、颜色/性能、排查、路线图
dist/           构建产物（site/ 与 extension/，不提交）
```

## 工作模式

| 模式 | 内容 | pass 数（关闭 Clamp、simple） |
|---|---|---|
| `1x 修复` | Restore CNN (S) + blit | 5 |
| `2x 超分` | Restore CNN (S) + 1× Upscale CNN x2 (S) + depth-to-space | 9 |
| `4x 超分` | Restore CNN (S) + 2× Upscale CNN x2 (S) | 14 |
| `8x 超分` | Restore CNN (S) + 3× Upscale CNN x2 (S) | 19 |
| 任意倍数 + Clamp | 额外 3 个高光 clamp pass | +3 |

`自动` 根据显示尺寸和 `devicePixelRatio` 选择 1× 修复或 2× 超分：显示宽度不超过源宽 1.25 倍时只做 Restore；4×/8× 需要显式选择。

精细程度：`简单` 使用标准 Anime4K 管线；`均衡` 在输出分辨率增加 1 组 Restore 细化 pass；`极致` 增加 2 组。8× 和极致模式显存/GPU 压力较高，超过设备纹理上限时会停止并提示。

## 开发命令

```bash
npm run dev              # Vite 开发服务器，http://127.0.0.1:8765/
npm run build            # 类型检查 + 构建站点与扩展
npm run typecheck        # TypeScript 严格检查
npx playwright install chromium  # 首次运行扩展弹窗测试前执行
npm run test:e2e         # Playwright 回归测试（页面 + 扩展弹窗）
npm run preview          # 预览 dist/site
npm run extract:weights  # 从 research/anime4k-shaders 重新生成 weights.json
npm run validate:wgsl    # 需要 naga: cargo install naga-cli --locked
```

扩展产物在 `dist/extension/`；站点产物在 `dist/site/`。`extension/` 只保留 manifest 等静态资源。

工具栏悬浮设置窗基于 [`@xmsthc/studio-ui`](https://github.com/SurpassHR/studio-ui) v0.1.0（React 组件库）。仓库内的 `.npmrc` 仅为允许该 git 依赖。

## 文档

- [架构](docs/architecture.md)
- [站点 Anime4K 实现分析](docs/site-implementation.md)
- [颜色与性能：NijiLucid 过曝/卡顿排查](docs/color-and-performance.md)
- [常见问题](docs/troubleshooting.md)
- [路线图](docs/roadmap.md)
- [测试说明](test/README.md)

## 已知限制

- 受 DRM/EME 保护的视频无法读帧。
- 跨域视频需要 CORS；当前没有自动 `crossOrigin` 重载。
- `<video>` 元素本身全屏时，页面 overlay 无法覆盖；请使用容器/网页全屏。
- 当前是 fragment shader 管线；compute shader 版本在路线图中。
- 没有 per-site 白名单，扩展会注入所有页面。
- 8× 受 `maxTextureDimension2D` 和显存限制；超过设备上限时会停止并提示。

## 许可

本项目代码 MIT。Anime4K shader 权重/数学来自 bloc97/Anime4K（MIT）；详见 [NOTICE.md](NOTICE.md)。
