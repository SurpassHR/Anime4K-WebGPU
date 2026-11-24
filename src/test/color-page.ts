import { Anime4KWebGPU } from "../core/anime4k-webgpu";
import type { Anime4KOutput } from "../core/types";
import { compareCanvasToVideo, type ColorPoint } from "../shared/color-check";
import { byId, delay, seekTo, waitForMediaEvent } from "../shared/dom";
import { appendResult } from "./result";

const points: ColorPoint[] = [
  [100, 100],
  [300, 100],
  [500, 100],
  [700, 100],
  [900, 100],
  [1100, 100],
  [100, 360],
  [300, 360],
  [500, 360],
  [700, 360],
  [900, 360],
  [1100, 360],
  [100, 620],
  [300, 620],
  [500, 620],
  [700, 620],
  [900, 620],
  [1100, 620],
];

export const runFixedColorCheck = async (
  output: Anime4KOutput,
  clampHighlights: boolean,
): Promise<void> => {
  try {
    const video = byId<HTMLVideoElement>("v");
    await waitForMediaEvent(video, "loadeddata");
    await seekTo(video, 1);

    const up = new Anime4KWebGPU(video, byId<HTMLCanvasElement>("c"), {
      fps: 0,
      output,
      clampHighlights,
      backpressure: false,
    });
    await up.init();
    up.start();
    await delay(300);
    up.renderFrame();

    const result = compareCanvasToVideo(up.canvas, video, points);
    for (const sample of result.samples) {
      appendResult(
        `${sample.x},${sample.y}: ` +
          `src(${sample.source.join(",")}) ` +
          `out(${sample.output.join(",")}) ` +
          `d(${sample.delta.join(",")})`,
      );
    }
    appendResult(`MAXD=${result.maxDelta} MEAND=${result.meanDelta.toFixed(2)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendResult("ERR " + message);
  }
};
