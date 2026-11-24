# Anime4K-WebGPU

WebGPU 实时 Anime4K 视频超分/修复浏览器扩展原型。当前版本聚焦两件事：

- **颜色准确**：固定 `copyExternalImageToTexture → rgba8unorm → rgba16float → bgra8unorm`，不做 sRGB 二次转换。SMPTE 彩条实测误差 ≤ 2/255。
- **可控性能**：`auto / 1x 修复 / 2x 超分` 三档、30fps 上限、单帧 in-flight 背压、可选 Clamp、HUD 调试。

> 状态：可加载的 MV3 原型，不是商店级成品。尚未实现 per-site 白名单、跨域自动恢复、4×/8×、GPU 基准测试。

## Quick start

```bash
cd ~/Projects/Code/Anime4K-WebGPU
npm run serve
# 打开 http://127.0.0.1:8765/
```

macOS 也可以直接双击 `scripts/serve.command`。

加载扩展：

```text
chrome://extensions
→ 开发者模式
→ 加载已解压的扩展程序
→ 选择 extension/
```

打开任意有 `<video>` 的页面，播放视频，右下角出现「✨ 超分」。左上角 HUD 显示模式、源/目标分辨率、FPS 和 canvas 格式。

## 目录

```text
extension/     MV3 可加载扩展（manifest + renderer + content script）
demo/          独立 WebGPU demo、SMPTE 颜色测试、示例视频
test/          自动档位/1×/2× 回归测试页
tools/         权重提取、WGSL 提取与 naga 校验
research/      官方 Anime4K GLSL、权重 JSON、来源说明
docs/          架构、站点实现分析、颜色/性能、排查、路线图
scripts/       demo 同步与本地服务器
```

## 工作模式

| 模式 | 内容 | pass 数（关闭 Clamp） |
|---|---|---|
| `1x 修复` | Restore CNN (S) + blit | 5 |
| `2x 超分` | Restore CNN (S) + Upscale CNN x2 (S) + depth-to-space | 9 |
| 2× + Clamp | 额外 3 个高光 clamp pass | 12 |

`auto` 根据显示尺寸和 `devicePixelRatio` 选择 1× 或 2×：显示宽度不超过源宽 1.25 倍时只做 Restore。

## 开发命令

```bash
npm run lint             # JS 语法检查
npm run sync:demo        # extension/*.js -> demo/*.js
npm run extract:weights  # 从 research/anime4k-shaders 重新生成 weights.json
npm run validate:wgsl    # 需要 naga: cargo install naga-cli --locked
```

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

## 许可

本项目代码 MIT。Anime4K shader 权重/数学来自 bloc97/Anime4K（MIT）；详见 [NOTICE.md](NOTICE.md)。
