import { Anime4KWebGPU } from "../core/anime4k-webgpu";
import type { Anime4KOutput } from "../core/types";
import { compareCanvasToVideo, percentagePoints } from "../shared/color-check";
import { byId } from "../shared/dom";

const video = byId<HTMLVideoElement>("v");
const canvas = byId<HTMLCanvasElement>("c");
const log = byId<HTMLPreElement>("log");
let up: Anime4KWebGPU | null = null;
let output: Anime4KOutput = "2x";

const isFile = location.protocol === "file:";
const httpHelp = [
  "file:// 下无法执行 getImageData：video 会把 canvas 标记为 cross-origin。",
  "",
  "请在仓库根目录运行：",
  "  npm run dev",
  "",
  "然后打开：",
  "  http://127.0.0.1:8765/demo/color-test.html",
].join("\n");

const say = (text: string): void => {
  log.textContent = text;
};

const pad = (value: number): string => String(value).padStart(3, " ");

async function ensure(outputName: Anime4KOutput): Promise<Anime4KWebGPU> {
  if (up) {
    up.stop();
    up.destroy();
    up = null;
  }
  output = outputName;
  const renderer = new Anime4KWebGPU(video, canvas, {
    fps: 0,
    output,
    clampHighlights: true,
    backpressure: false,
    onError: (error) => say("GPU 错误: " + error.message),
  });
  await renderer.init();
  await video.play().catch(() => undefined);
  renderer.start();
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  renderer.renderFrame();
  up = renderer;
  return renderer;
}

async function run(): Promise<void> {
  if (isFile) {
    say(httpHelp);
    return;
  }
  try {
    const renderer = await ensure(output);
    const width = renderer.canvas.width;
    const height = renderer.canvas.height;
    const points = percentagePoints(
      width,
      height,
      [0.08, 0.25, 0.42, 0.58, 0.75, 0.92],
      [0.15, 0.5, 0.85],
    );
    const result = compareCanvasToVideo(renderer.canvas, video, points);
    const stats = renderer.getStats();
    const lines = [
      `mode=${stats.mode} canvas=${width}x${height} source=${video.videoWidth}x${video.videoHeight}`,
    ];
    for (const sample of result.samples) {
      lines.push(
        `(${pad(sample.x)},${pad(sample.y)}) ` +
          `src(${pad(sample.source[0])},${pad(sample.source[1])},${pad(sample.source[2])}) ` +
          `out(${pad(sample.output[0])},${pad(sample.output[1])},${pad(sample.output[2])}) ` +
          `d(${sample.delta.join(",")})`,
      );
    }
    lines.push(`MAXD=${result.maxDelta}/255  MEAND=${result.meanDelta.toFixed(2)}/255`);
    say(lines.join("\n"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      (error instanceof Error && error.name === "SecurityError") ||
      /tainted/i.test(message)
    ) {
      say(httpHelp);
    } else {
      say("失败: " + message);
    }
  }
}

if (isFile) {
  say(httpHelp);
}

byId<HTMLButtonElement>("run").addEventListener("click", () => {
  void run();
});
byId<HTMLButtonElement>("restore").addEventListener("click", async () => {
  output = "restore";
  await run();
});

if (new URLSearchParams(location.search).has("autorun")) {
  void run();
}
