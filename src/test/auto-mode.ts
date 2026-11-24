import { Anime4KWebGPU } from "../core/anime4k-webgpu";
import { byId, delay, seekTo, waitForMediaEvent } from "../shared/dom";
import { appendResult } from "./result";

const run = async (): Promise<void> => {
  try {
    const video = byId<HTMLVideoElement>("v");
    await waitForMediaEvent(video, "loadeddata");
    await seekTo(video, 1);

    const up = new Anime4KWebGPU(video, byId<HTMLCanvasElement>("c"), {
      fps: 0,
      output: "auto",
      clampHighlights: false,
      backpressure: false,
    });
    await up.init();
    up.start();
    await delay(300);
    up.renderFrame();

    const first = up.getStats();
    appendResult(
      `AUTO=${first.mode} scale=${first.scale} canvas=${up.canvas.width}x${up.canvas.height}`,
    );

    up.setOutput("2x");
    up.renderFrame();
    await delay(100);
    up.renderFrame();
    const second = up.getStats();
    appendResult(
      `2X=${second.mode} scale=${second.scale} canvas=${up.canvas.width}x${up.canvas.height}`,
    );

    up.setClampHighlights(true);
    up.renderFrame();
    await delay(100);
    up.renderFrame();
    const third = up.getStats();
    appendResult(
      `CLAMP mode=${third.mode} canvas=${up.canvas.width}x${up.canvas.height}`,
    );

    up.setOutput("4x");
    up.setQuality("balanced");
    const configured = up.getStats();
    appendResult(
      `CONFIG output=${configured.output} quality=${configured.quality}`,
    );
    up.stop();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendResult("ERR " + message);
  }
};

void run();
