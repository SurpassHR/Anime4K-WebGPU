import { shaderSources, type ShaderName } from "./shaders";
import type {
  Anime4KActiveMode,
  Anime4KOutput,
  Anime4KQuality,
  Anime4KScale,
  Anime4KStats,
  Anime4KWebGPURendererOptions,
  ConvLayer,
} from "./types";
import { anime4kWeights } from "./weights";

interface BindGroupLayouts {
  conv: GPUBindGroupLayout;
  clamp: GPUBindGroupLayout;
  clampRGB: GPUBindGroupLayout;
  depth: GPUBindGroupLayout;
  blit: GPUBindGroupLayout;
}

type PipelineName = ShaderName | "depthHalf";

interface RenderPassPlan {
  pipeline: PipelineName;
  bindGroup: GPUBindGroup;
  dstView: GPUTextureView;
}

const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    return new Error(String((value as { message: unknown }).message));
  }
  return new Error(String(value));
};

export class Anime4KWebGPU {
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly options: Anime4KWebGPURendererOptions;

  private readonly targetFps: number;
  private readonly backpressure: boolean;
  private output: Anime4KOutput;
  private quality: Anime4KQuality;
  private clampHighlights: boolean;
  private readonly adaptive: boolean;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = "bgra8unorm";
  private sampler!: GPUSampler;
  private bgl!: BindGroupLayouts;
  private pipelines!: Record<PipelineName, GPURenderPipeline>;

  private running = false;
  private width = 0;
  private height = 0;
  private frames = 0;
  private lastFrameTime = 0;
  private inFlight = false;
  private activeMode: Anime4KActiveMode = "restore";
  private scale: Anime4KScale = 1;
  private pendingRebuild = false;
  private destroyed = false;

  private statsTime = performance.now();
  private statsFrames = 0;
  private fps = 0;
  private rvfc = 0;
  private raf = 0;

  private passes: RenderPassPlan[] = [];
  private finalBindGroup: GPUBindGroup | null = null;
  private finalPipeline: PipelineName | null = null;
  private graphTextures: GPUTexture[] = [];
  private graphBuffers: GPUBuffer[] = [];

  private inputTex!: GPUTexture;
  private clampH?: GPUTexture;
  private clampV?: GPUTexture;
  private clampOut?: GPUTexture;
  private restoreA!: GPUTexture;
  private restoreB!: GPUTexture;

  private readonly onVideoFrame: VideoFrameRequestCallback = (now) => {
    if (!this.running) return;
    if (this.backpressure && this.inFlight) {
      this.schedule();
      return;
    }
    const min = this.targetFps ? 1000 / this.targetFps : 0;
    if (!min || now - this.lastFrameTime >= min - 1) {
      this.lastFrameTime = now;
      this.renderFrame();
    }
    this.schedule();
  };

  private readonly onRaf = (now: DOMHighResTimeStamp): void => {
    if (!this.running) return;
    const min = this.targetFps ? 1000 / this.targetFps : 1000 / 30;
    if (now - this.lastFrameTime >= min - 1) {
      this.lastFrameTime = now;
      this.renderFrame();
    }
    this.raf = requestAnimationFrame(this.onRaf);
  };

  private readonly onSeek = (): void => {
    if (this.running) this.renderFrame();
  };

  private readonly onPlay = (): void => {
    if (this.running) this.renderFrame();
  };

  private readonly onPause = (): void => {
    if (this.running) this.renderFrame();
  };

  constructor(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    options: Anime4KWebGPURendererOptions = {},
  ) {
    this.video = video;
    this.canvas = canvas;
    this.options = options;
    this.targetFps = options.fps ?? 0;
    this.backpressure = options.backpressure !== false;
    this.output = options.output ?? "auto";
    this.quality = options.quality ?? "simple";
    this.clampHighlights = options.clampHighlights !== false;
    this.adaptive = options.adaptive !== false;
  }

  async init(): Promise<this> {
    this.destroyed = false;
    if (!navigator.gpu) throw new Error("当前浏览器没有 WebGPU（navigator.gpu 不存在）");

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("没有可用的 WebGPU GPUAdapter");

    this.device = await adapter.requestDevice();
    const device = this.device;
    device.lost.then((info) => {
      if (this.destroyed) return;
      this.inFlight = false;
      this.stop();
      this.reportError(new Error("GPU device lost: " + (info.message || info.reason)));
    });
    device.onuncapturederror = (event) => {
      this.reportError(event.error);
    };

    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("canvas.getContext('webgpu') 失败");

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    this.createPipelines();
    return this;
  }

  private reportError(error: unknown): void {
    this.options.onError?.(toError(error));
  }

  private requireDevice(): GPUDevice {
    if (!this.device) throw new Error("Anime4KWebGPU has not been initialized");
    return this.device;
  }

  private createPipelines(): void {
    const device = this.requireDevice();
    const convModule = device.createShaderModule({ code: shaderSources.conv });
    const clampHModule = device.createShaderModule({ code: shaderSources.clampH });
    const clampVModule = device.createShaderModule({ code: shaderSources.clampV });
    const clampRGBModule = device.createShaderModule({ code: shaderSources.clampRGB });
    const depthModule = device.createShaderModule({ code: shaderSources.depth });
    const blitModule = device.createShaderModule({ code: shaderSources.blit });

    const convBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });
    const clampBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const clampRGBBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const depthBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const blitBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const pipeline = (
      layout: GPUBindGroupLayout,
      module: GPUShaderModule,
      target: GPUTextureFormat,
      entry = "fs",
    ): GPURenderPipeline =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: entry, targets: [{ format: target }] },
        primitive: { topology: "triangle-list" },
      });

    this.bgl = {
      conv: convBGL,
      clamp: clampBGL,
      clampRGB: clampRGBBGL,
      depth: depthBGL,
      blit: blitBGL,
    };
    this.pipelines = {
      conv: pipeline(convBGL, convModule, "rgba16float"),
      clampH: pipeline(clampBGL, clampHModule, "rgba16float"),
      clampV: pipeline(clampBGL, clampVModule, "rgba16float"),
      clampRGB: pipeline(clampRGBBGL, clampRGBModule, "rgba16float"),
      depthHalf: pipeline(depthBGL, depthModule, "rgba16float"),
      depth: pipeline(depthBGL, depthModule, this.format),
      blit: pipeline(blitBGL, blitModule, this.format),
    };
  }

  private createTexture(
    width: number,
    height: number,
    format: GPUTextureFormat,
    usage: GPUTextureUsageFlags,
  ): GPUTexture {
    return this.requireDevice().createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format,
      usage,
    });
  }

  private createUniform(size: number): GPUBuffer {
    return this.requireDevice().createBuffer({
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createStorage(size: number): GPUBuffer {
    return this.requireDevice().createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private writeConvParams(
    buffer: GPUBuffer,
    layer: ConvLayer,
    width: number,
    height: number,
  ): void {
    const data = new ArrayBuffer(32);
    new Float32Array(data, 0, 4).set(layer.bias);
    new Float32Array(data, 16, 2).set([1 / width, 1 / height]);
    new Uint32Array(data, 24, 1)[0] = layer.split ? 1 : 0;
    new Uint32Array(data, 28, 1)[0] = layer.residual ? 1 : 0;
    this.requireDevice().queue.writeBuffer(buffer, 0, data);
  }

  private writeClampParams(buffer: GPUBuffer, width: number, height: number): void {
    const data = new ArrayBuffer(16);
    new Float32Array(data, 0, 2).set([1 / width, 1 / height]);
    this.requireDevice().queue.writeBuffer(buffer, 0, data);
  }

  private writeDepthParams(buffer: GPUBuffer, width: number, height: number): void {
    const data = new ArrayBuffer(16);
    new Float32Array(data, 0, 2).set([1 / width, 1 / height]);
    new Float32Array(data, 8, 2).set([width, height]);
    this.requireDevice().queue.writeBuffer(buffer, 0, data);
  }

  private convBindGroup(
    srcView: GPUTextureView,
    residualView: GPUTextureView,
    weightsBuffer: GPUBuffer,
    paramsBuffer: GPUBuffer,
  ): GPUBindGroup {
    return this.requireDevice().createBindGroup({
      layout: this.bgl.conv,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: residualView },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: paramsBuffer } },
        { binding: 4, resource: { buffer: weightsBuffer } },
      ],
    });
  }

  private clampBindGroup(
    srcView: GPUTextureView,
    paramsBuffer: GPUBuffer,
  ): GPUBindGroup {
    return this.requireDevice().createBindGroup({
      layout: this.bgl.clamp,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });
  }

  private clampRGBBindGroup(
    srcView: GPUTextureView,
    statsView: GPUTextureView,
  ): GPUBindGroup {
    return this.requireDevice().createBindGroup({
      layout: this.bgl.clampRGB,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: statsView },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  private depthBindGroupFor(
    lowView: GPUTextureView,
    mainView: GPUTextureView,
    paramsBuffer: GPUBuffer,
  ): GPUBindGroup {
    return this.requireDevice().createBindGroup({
      layout: this.bgl.depth,
      entries: [
        { binding: 0, resource: lowView },
        { binding: 1, resource: mainView },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: paramsBuffer } },
      ],
    });
  }

  private blitBindGroup(srcView: GPUTextureView): GPUBindGroup {
    return this.requireDevice().createBindGroup({
      layout: this.bgl.blit,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  private destroyGraph(): void {
    for (const texture of this.graphTextures) texture.destroy();
    for (const buffer of this.graphBuffers) buffer.destroy();
    this.graphTextures = [];
    this.graphBuffers = [];
    this.passes = [];
    this.finalBindGroup = null;
    this.finalPipeline = null;
    this.clampH = undefined;
    this.clampV = undefined;
    this.clampOut = undefined;
  }

  private resolveOutput(width: number): {
    mode: Anime4KActiveMode;
    scale: Anime4KScale;
  } {
    if (this.output === "restore") return { mode: "restore", scale: 1 };
    if (this.output === "auto") {
      if (!this.adaptive) return { mode: "upscale", scale: 2 };
      // Auto uses 1× restore when the display does not need more pixels,
      // otherwise 2×. 4×/8× remain explicit, high-cost choices.
      const rect = this.video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = rect.width * dpr;
      return displayWidth > width * 1.25
        ? { mode: "upscale", scale: 2 }
        : { mode: "restore", scale: 1 };
    }
    const scale: Anime4KScale = this.output === "2x" ? 2 : this.output === "4x" ? 4 : 8;
    return { mode: "upscale", scale };
  }

  private refinePassCount(): number {
    if (this.quality === "simple") return 0;
    return this.quality === "balanced" ? 1 : 2;
  }

  buildGraph(width: number, height: number): void {
    this.destroyGraph();
    this.width = width;
    this.height = height;
    const { mode, scale } = this.resolveOutput(width);
    this.activeMode = mode;
    this.scale = scale;
    const targetWidth = width * scale;
    const targetHeight = height * scale;
    const maxDimension = this.requireDevice().limits.maxTextureDimension2D;
    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      throw new Error(
        "输出尺寸 " +
          targetWidth +
          "×" +
          targetHeight +
          " 超过 GPU 纹理上限 " +
          maxDimension +
          "px。请选择更低的输出倍数。",
      );
    }
    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;

    const textures: GPUTexture[] = [];
    const buffers: GPUBuffer[] = [];
    const texture = (
      textureWidth: number,
      textureHeight: number,
      format: GPUTextureFormat,
      usage: GPUTextureUsageFlags,
    ): GPUTexture => {
      const result = this.createTexture(textureWidth, textureHeight, format, usage);
      textures.push(result);
      return result;
    };

    // copyExternalImageToTexture requires COPY_DST *and* RENDER_ATTACHMENT on
    // the destination texture in current WebGPU implementations.
    const inputUsage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT;
    const midUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

    this.inputTex = texture(width, height, "rgba8unorm", inputUsage);
    if (this.clampHighlights) {
      this.clampH = texture(width, height, "rgba16float", midUsage);
      this.clampV = texture(width, height, "rgba16float", midUsage);
      this.clampOut = texture(width, height, "rgba16float", midUsage);
    }
    this.restoreA = texture(width, height, "rgba16float", midUsage);
    this.restoreB = texture(width, height, "rgba16float", midUsage);

    const view = (textureToView: GPUTexture): GPUTextureView => textureToView.createView();
    const passes: RenderPassPlan[] = [];
    const push = (
      pipeline: PipelineName,
      bindGroup: GPUBindGroup,
      destination: GPUTexture,
    ): void => {
      passes.push({ pipeline, bindGroup, dstView: view(destination) });
    };

    const clampParams = this.createUniform(16);
    buffers.push(clampParams);
    if (this.clampHighlights) {
      this.writeClampParams(clampParams, width, height);
      push("clampH", this.clampBindGroup(view(this.inputTex), clampParams), this.clampH!);
      push("clampV", this.clampBindGroup(view(this.clampH!), clampParams), this.clampV!);
      push(
        "clampRGB",
        this.clampRGBBindGroup(view(this.inputTex), view(this.clampV!)),
        this.clampOut!,
      );
    }

    const restoreInput = this.clampHighlights ? this.clampOut! : this.inputTex;
    const restoreSources = [restoreInput, this.restoreA, this.restoreB, this.restoreA];
    const restoreDestinations = [this.restoreA, this.restoreB, this.restoreA, this.restoreB];

    const addConvPasses = (
      layers: ConvLayer[],
      sources: GPUTexture[],
      destinations: GPUTexture[],
      residualTexture: GPUTexture,
      layerWidth: number,
      layerHeight: number,
    ): void => {
      for (let index = 0; index < layers.length; index++) {
        const layer = layers[index]!;
        const weightsBuffer = this.createStorage(layer.weights.byteLength);
        const paramsBuffer = this.createUniform(32);
        buffers.push(weightsBuffer, paramsBuffer);
        this.requireDevice().queue.writeBuffer(weightsBuffer, 0, layer.weights);
        this.writeConvParams(paramsBuffer, layer, layerWidth, layerHeight);
        const bindGroup = this.convBindGroup(
          view(sources[index]!),
          view(residualTexture),
          weightsBuffer,
          paramsBuffer,
        );
        push("conv", bindGroup, destinations[index]!);
      }
    };

    addConvPasses(
      anime4kWeights.restore,
      restoreSources,
      restoreDestinations,
      restoreInput,
      width,
      height,
    );

    if (mode === "restore") {
      this.finalBindGroup = this.blitBindGroup(view(this.restoreB));
      this.finalPipeline = "blit";
    } else {
      const stageCount = scale === 2 ? 1 : scale === 4 ? 2 : 3;
      const refinePasses = this.refinePassCount();
      let stageInput = this.restoreB;
      let stageWidth = width;
      let stageHeight = height;

      for (let stage = 0; stage < stageCount; stage++) {
        const isFinalStage = stage === stageCount - 1;
        const stageA = texture(stageWidth, stageHeight, "rgba16float", midUsage);
        const stageB = texture(stageWidth, stageHeight, "rgba16float", midUsage);
        const outputWidth = stageWidth * 2;
        const outputHeight = stageHeight * 2;
        const needsOutputTexture = !isFinalStage || refinePasses > 0;
        const stageOut = needsOutputTexture
          ? texture(outputWidth, outputHeight, "rgba16float", midUsage)
          : null;

        addConvPasses(
          anime4kWeights.upscale,
          [stageInput, stageA, stageB, stageA],
          [stageA, stageB, stageA, stageB],
          stageInput,
          stageWidth,
          stageHeight,
        );

        const depthParams = this.createUniform(16);
        buffers.push(depthParams);
        this.writeDepthParams(depthParams, stageWidth, stageHeight);
        const depthBindGroup = this.depthBindGroupFor(
          view(stageB),
          view(stageInput),
          depthParams,
        );

        if (isFinalStage && refinePasses === 0) {
          this.finalBindGroup = depthBindGroup;
          this.finalPipeline = "depth";
        } else {
          push("depthHalf", depthBindGroup, stageOut!);
        }

        if (isFinalStage && refinePasses > 0 && stageOut) {
          let refineInput = stageOut;
          const refineA = texture(outputWidth, outputHeight, "rgba16float", midUsage);
          const refineB = texture(outputWidth, outputHeight, "rgba16float", midUsage);
          for (let pass = 0; pass < refinePasses; pass++) {
            addConvPasses(
              anime4kWeights.restore,
              [refineInput, refineA, refineB, refineA],
              [refineA, refineB, refineA, refineB],
              refineInput,
              outputWidth,
              outputHeight,
            );
            refineInput = refineB;
          }
          this.finalBindGroup = this.blitBindGroup(view(refineB));
          this.finalPipeline = "blit";
        }

        stageInput = stageOut ?? stageInput;
        stageWidth = outputWidth;
        stageHeight = outputHeight;
      }
    }

    this.passes = passes;
    this.graphTextures = textures;
    this.graphBuffers = buffers;
  }

  setOutput(output: Anime4KOutput): void {
    this.output = output;
    this.pendingRebuild = true;
  }

  setQuality(quality: Anime4KQuality): void {
    this.quality = quality;
    this.pendingRebuild = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  setClampHighlights(on: boolean): void {
    this.clampHighlights = Boolean(on);
    this.pendingRebuild = true;
  }

  getStats(): Anime4KStats {
    const now = performance.now();
    const elapsed = (now - this.statsTime) / 1000;
    if (elapsed > 0.4) {
      this.fps = (this.frames - this.statsFrames) / elapsed;
      this.statsFrames = this.frames;
      this.statsTime = now;
    }
    return {
      output: this.output,
      mode: this.activeMode,
      scale: this.scale,
      quality: this.quality,
      width: this.width,
      height: this.height,
      fps: this.fps,
      frames: this.frames,
      inFlight: this.inFlight,
      format: this.format,
      upload: "copyExternalImageToTexture",
    };
  }

  renderFrame(): void {
    if (!this.running || !this.device || (this.backpressure && this.inFlight)) return;
    const video = this.video;
    if (!video.videoWidth || !video.videoHeight) return;
    if (
      video.videoWidth !== this.width ||
      video.videoHeight !== this.height ||
      this.pendingRebuild
    ) {
      this.pendingRebuild = false;
      try {
        this.buildGraph(video.videoWidth, video.videoHeight);
      } catch (error) {
        this.stop();
        this.reportError(error);
        return;
      }
    }
    const device = this.device;
    const context = this.context;
    if (!context || !this.finalPipeline || !this.finalBindGroup) return;

    try {
      device.queue.copyExternalImageToTexture(
        { source: video, flipY: false },
        { texture: this.inputTex, premultipliedAlpha: false },
        [this.width, this.height],
      );
    } catch (error) {
      this.stop();
      this.reportError(error);
      return;
    }

    const encoder = device.createCommandEncoder();
    for (const pass of this.passes) {
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: pass.dstView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass.setPipeline(this.pipelines[pass.pipeline]);
      renderPass.setBindGroup(0, pass.bindGroup);
      renderPass.draw(3);
      renderPass.end();
    }

    const canvasView = context.getCurrentTexture().createView();
    const finalPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    finalPass.setPipeline(this.pipelines[this.finalPipeline]);
    finalPass.setBindGroup(0, this.finalBindGroup);
    finalPass.draw(3);
    finalPass.end();

    this.inFlight = true;
    device.queue.submit([encoder.finish()]);
    this.canvas.style.visibility = "visible";
    this.frames++;
    if (this.backpressure && typeof device.queue.onSubmittedWorkDone === "function") {
      device.queue
        .onSubmittedWorkDone()
        .then(() => {
          this.inFlight = false;
        })
        .catch((error: unknown) => {
          this.inFlight = false;
          this.reportError(error);
        });
    } else {
      this.inFlight = false;
    }
  }

  private schedule(): void {
    if (!this.running) return;
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.rvfc = this.video.requestVideoFrameCallback(this.onVideoFrame);
    } else {
      this.raf = requestAnimationFrame(this.onRaf);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.inFlight = false;
    this.lastFrameTime = 0;
    this.video.addEventListener("seeked", this.onSeek);
    this.video.addEventListener("play", this.onPlay);
    this.video.addEventListener("pause", this.onPause);
    this.renderFrame();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.video.removeEventListener("seeked", this.onSeek);
    this.video.removeEventListener("play", this.onPlay);
    this.video.removeEventListener("pause", this.onPause);
    if (this.rvfc && this.video.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfc);
    }
    this.rvfc = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.style.visibility = "hidden";
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.destroyGraph();
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }
}
