import { Anime4KWebGPU } from "../core/anime4k-webgpu";
import { byId } from "../shared/dom";

const video = byId<HTMLVideoElement>("v");
const canvas = byId<HTMLCanvasElement>("c");
const status = byId<HTMLSpanElement>("status");
let up: Anime4KWebGPU | null = null;

const setStatus = (text: string, ok = false): void => {
  status.textContent = text;
  status.style.color = ok ? "#8fe3b0" : "#9aa7c2";
};

if (location.protocol === "file:") {
  setStatus("请用本地 HTTP 打开：在仓库根目录运行 npm run dev", false);
  byId<HTMLButtonElement>("start").disabled = true;
}

byId<HTMLButtonElement>("start").addEventListener("click", async () => {
  if (up) {
    up.start();
    setStatus("运行中", true);
    return;
  }
  try {
    setStatus("初始化 WebGPU…");
    up = new Anime4KWebGPU(video, canvas, {
      fps: 0,
      output: "2x",
      clampHighlights: true,
      onError: (error) => {
        console.error(error);
        setStatus("GPU 错误: " + error.message, false);
      },
    });
    await up.init();
    await video.play().catch(() => undefined);
    up.start();
    setStatus("运行中（2x）", true);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus("失败: " + message, false);
  }
});

byId<HTMLButtonElement>("stop").addEventListener("click", () => {
  if (!up) return;
  up.stop();
  setStatus("已关闭");
});
