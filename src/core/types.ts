export type Anime4KOutput = "auto" | "restore" | "2x" | "4x" | "8x";
export type Anime4KActiveMode = "restore" | "upscale";
export type Anime4KScale = 1 | 2 | 4 | 8;
export type Anime4KQuality = "simple" | "balanced" | "ultra";

export interface ConvLayer {
  split: boolean;
  residual: boolean;
  bias: [number, number, number, number];
  weights: Float32Array;
}

export interface Anime4KWeights {
  restore: ConvLayer[];
  upscale: ConvLayer[];
}

export interface Anime4KWebGPURendererOptions {
  fps?: number;
  backpressure?: boolean;
  output?: Anime4KOutput;
  quality?: Anime4KQuality;
  clampHighlights?: boolean;
  adaptive?: boolean;
  onError?: (error: Error) => void;
}

export interface Anime4KStats {
  output: Anime4KOutput;
  mode: Anime4KActiveMode;
  scale: Anime4KScale;
  quality: Anime4KQuality;
  width: number;
  height: number;
  fps: number;
  frames: number;
  inFlight: boolean;
  format: GPUTextureFormat;
  upload: "copyExternalImageToTexture";
}
