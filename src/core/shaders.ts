import blitShader from "./shaders/blit.wgsl?raw";
import clampHShader from "./shaders/clamp-h.wgsl?raw";
import clampRgbShader from "./shaders/clamp-rgb.wgsl?raw";
import clampVShader from "./shaders/clamp-v.wgsl?raw";
import convShader from "./shaders/conv.wgsl?raw";
import depthShader from "./shaders/depth.wgsl?raw";
import vertexShader from "./shaders/vertex.wgsl?raw";

const compose = (fragment: string): string => `${vertexShader}\n${fragment}`;

export const shaderSources = {
  conv: compose(convShader),
  clampH: compose(clampHShader),
  clampV: compose(clampVShader),
  clampRGB: compose(clampRgbShader),
  depth: compose(depthShader),
  blit: compose(blitShader),
} as const;

export type ShaderName = keyof typeof shaderSources;
