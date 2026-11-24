export type ColorPoint = readonly [x: number, y: number];

export interface ColorSample {
  x: number;
  y: number;
  source: [number, number, number];
  output: [number, number, number];
  delta: [number, number, number];
}

export interface ColorCheckResult {
  width: number;
  height: number;
  maxDelta: number;
  meanDelta: number;
  samples: ColorSample[];
}

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context unavailable");
  return context;
};

export const compareCanvasToVideo = (
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  points: readonly ColorPoint[],
): ColorCheckResult => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) throw new Error("canvas has no drawing buffer");

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = context2d(outputCanvas);
  outputContext.drawImage(canvas, 0, 0);
  const outputData = outputContext.getImageData(0, 0, width, height).data;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = context2d(sourceCanvas);
  sourceContext.drawImage(video, 0, 0, width, height);
  const sourceData = sourceContext.getImageData(0, 0, width, height).data;

  let maxDelta = 0;
  let sum = 0;
  let count = 0;
  const samples: ColorSample[] = [];

  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    const source: [number, number, number] = [
      sourceData[index]!,
      sourceData[index + 1]!,
      sourceData[index + 2]!,
    ];
    const output: [number, number, number] = [
      outputData[index]!,
      outputData[index + 1]!,
      outputData[index + 2]!,
    ];
    const delta: [number, number, number] = [
      Math.abs(output[0] - source[0]),
      Math.abs(output[1] - source[1]),
      Math.abs(output[2] - source[2]),
    ];
    maxDelta = Math.max(maxDelta, ...delta);
    sum += delta[0] + delta[1] + delta[2];
    count += 3;
    samples.push({ x, y, source, output, delta });
  }

  return {
    width,
    height,
    maxDelta,
    meanDelta: count ? sum / count : 0,
    samples,
  };
};

export const percentagePoints = (
  width: number,
  height: number,
  xFractions: readonly number[],
  yFractions: readonly number[],
): ColorPoint[] => {
  const points: ColorPoint[] = [];
  for (const y of yFractions) {
    for (const x of xFractions) {
      points.push([Math.round(x * width), Math.round(y * height)]);
    }
  }
  return points;
};
