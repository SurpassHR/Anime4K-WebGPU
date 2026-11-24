(function (global) {
  "use strict";

  // Anime4K v4.0 / v3.2 shaders, ported from bloc97/Anime4K (MIT).
  // Pipeline: Clamp_Highlights -> Restore_CNN_S -> Upscale_CNN_x2_S
  const VERTEX = `
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var t = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0)
  );
  var o: VSOut;
  o.pos = vec4<f32>(p[i], 0.0, 1.0);
  o.uv = t[i];
  return o;
}
`;

  const CONV = `
struct Params {
  bias: vec4<f32>,
  texel: vec2<f32>,
  split: u32,
  residual: u32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var residualTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<storage, read> weights: array<vec4<f32>>;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var acc = params.bias;
  for (var tap: u32 = 0u; tap < 9u; tap = tap + 1u) {
    let ox = f32(tap % 3u) - 1.0;
    let oy = f32(tap / 3u) - 1.0;
    let c = textureSample(srcTex, samp, uv + vec2<f32>(ox, oy) * params.texel);
    let pos = max(c, vec4<f32>(0.0));
    acc.x = acc.x + dot(weights[tap * 4u + 0u], pos);
    acc.y = acc.y + dot(weights[tap * 4u + 1u], pos);
    acc.z = acc.z + dot(weights[tap * 4u + 2u], pos);
    acc.w = acc.w + dot(weights[tap * 4u + 3u], pos);
    if (params.split != 0u) {
      let neg = max(-c, vec4<f32>(0.0));
      acc.x = acc.x + dot(weights[36u + tap * 4u + 0u], neg);
      acc.y = acc.y + dot(weights[36u + tap * 4u + 1u], neg);
      acc.z = acc.z + dot(weights[36u + tap * 4u + 2u], neg);
      acc.w = acc.w + dot(weights[36u + tap * 4u + 3u], neg);
    }
  }
  if (params.residual != 0u) {
    acc = acc + textureSample(residualTex, samp, uv);
  }
  return acc;
}
`;

  const CLAMP_H = `
struct ClampParams { texel: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: ClampParams;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var gmax = 0.0;
  for (var i: u32 = 0u; i < 5u; i = i + 1u) {
    let off = f32(i) - 2.0;
    let c = textureSample(srcTex, samp, uv + vec2<f32>(off, 0.0) * params.texel);
    gmax = max(gmax, dot(c.rgb, vec3<f32>(0.299, 0.587, 0.114)));
  }
  return vec4<f32>(gmax, 0.0, 0.0, 0.0);
}
`;

  const CLAMP_V = `
struct ClampParams { texel: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: ClampParams;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var gmax = 0.0;
  for (var i: u32 = 0u; i < 5u; i = i + 1u) {
    let off = f32(i) - 2.0;
    let c = textureSample(srcTex, samp, uv + vec2<f32>(0.0, off) * params.texel);
    gmax = max(gmax, c.x);
  }
  return vec4<f32>(gmax, 0.0, 0.0, 0.0);
}
`;

  const CLAMP_RGB = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var statsTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(srcTex, samp, uv);
  let l = dot(c.rgb, vec3<f32>(0.299, 0.587, 0.114));
  let m = textureSample(statsTex, samp, uv).x;
  let nl = min(l, m);
  return vec4<f32>(c.rgb - vec3<f32>(l - nl), 1.0);
}
`;

  const DEPTH = `
struct DSParams { lowTexel: vec2<f32>, lowSize: vec2<f32> };
@group(0) @binding(0) var lowTex: texture_2d<f32>;
@group(0) @binding(1) var mainTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: DSParams;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let f = fract(uv * params.lowSize);
  let i = vec2<u32>(f * 2.0);
  let idx = i.y * 2u + i.x;
  let base = (vec2<f32>(0.5) - f) * params.lowTexel + uv;
  let c = textureSample(lowTex, samp, base);
  var v = 0.0;
  if (idx == 0u) { v = c.r; }
  else if (idx == 1u) { v = c.g; }
  else if (idx == 2u) { v = c.b; }
  else { v = c.a; }
  return vec4<f32>(v, v, v, 0.0) + textureSample(mainTex, samp, uv);
}
`;

  const BLIT = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(srcTex, samp, uv);
}
`;

  const U = globalThis.GPUBufferUsage || {};
  const T = globalThis.GPUTextureUsage || {};

  class Anime4KWebGPU {
    constructor(video, canvas, options = {}) {
      this.video = video;
      this.canvas = canvas;
      this.options = options;
      this.targetFps = options.fps || 0;
      this.backpressure = options.backpressure !== false;
      this.mode = options.mode || "auto";
      this.clampHighlights = options.clampHighlights !== false;
      this.adaptive = options.adaptive !== false;
      this.device = null;
      this.context = null;
      this.format = null;
      this.running = false;
      this.width = 0;
      this.height = 0;
      this.frames = 0;
      this.lastFrameTime = 0;
      this.inFlight = false;
      this.activeMode = "restore";
      this.scale = 1;
      this._pendingRebuild = false;
      this._statsTime = performance.now();
      this._statsFrames = 0;
      this._fps = 0;
      this._rvfc = 0;
      this._raf = 0;
      this._onVideoFrame = this._onVideoFrame.bind(this);
      this._onRaf = this._onRaf.bind(this);
      this._onSeek = this._onSeek.bind(this);
      this._onPlay = this._onPlay.bind(this);
      this._onPause = this._onPause.bind(this);
    }

    async init() {
      this._destroyed = false;
      if (!navigator.gpu) throw new Error("当前浏览器没有 WebGPU（navigator.gpu 不存在）");
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("没有可用的 WebGPU GPUAdapter");
      this.device = await adapter.requestDevice();
      this.device.lost.then((info) => {
        if (this._destroyed) return;
        this.inFlight = false;
        if (this.options.onError) this.options.onError(new Error("GPU device lost: " + (info.message || info.reason)));
      });
      this.device.onuncapturederror = (ev) => {
        if (this.options.onError) this.options.onError(ev.error || new Error(String(ev)));
      };
      this.context = this.canvas.getContext("webgpu");
      if (!this.context) throw new Error("canvas.getContext('webgpu') 失败");
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
      this.sampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      this._createPipelines();
      return this;
    }

    _createPipelines() {
      const device = this.device;
      const convModule = device.createShaderModule({ code: VERTEX + "\n" + CONV });
      const clampHModule = device.createShaderModule({ code: VERTEX + "\n" + CLAMP_H });
      const clampVModule = device.createShaderModule({ code: VERTEX + "\n" + CLAMP_V });
      const clampRGBModule = device.createShaderModule({ code: VERTEX + "\n" + CLAMP_RGB });
      const depthModule = device.createShaderModule({ code: VERTEX + "\n" + DEPTH });
      const blitModule = device.createShaderModule({ code: VERTEX + "\n" + BLIT });

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

      const pipeline = (layout, module, target, entry = "fs") =>
        device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: entry, targets: [{ format: target }] },
          primitive: { topology: "triangle-list" },
        });

      this.bgl = { conv: convBGL, clamp: clampBGL, clampRGB: clampRGBBGL, depth: depthBGL, blit: blitBGL };
      this.pipelines = {
        conv: pipeline(convBGL, convModule, "rgba16float"),
        clampH: pipeline(clampBGL, clampHModule, "rgba16float"),
        clampV: pipeline(clampBGL, clampVModule, "rgba16float"),
        clampRGB: pipeline(clampRGBBGL, clampRGBModule, "rgba16float"),
        depth: pipeline(depthBGL, depthModule, this.format),
        blit: pipeline(blitBGL, blitModule, this.format),
      };
    }

    _tex(w, h, format, usage) {
      return this.device.createTexture({
        size: { width: w, height: h, depthOrArrayLayers: 1 },
        format,
        usage,
      });
    }

    _uniform(size) {
      return this.device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    }

    _storage(size) {
      return this.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    }

    _writeConvParams(buffer, layer, w, h) {
      const ab = new ArrayBuffer(32);
      new Float32Array(ab, 0, 4).set(layer.bias);
      new Float32Array(ab, 16, 2).set([1 / w, 1 / h]);
      new Uint32Array(ab, 24, 1)[0] = layer.split ? 1 : 0;
      new Uint32Array(ab, 28, 1)[0] = layer.residual ? 1 : 0;
      this.device.queue.writeBuffer(buffer, 0, ab);
    }

    _writeClampParams(buffer, w, h) {
      const ab = new ArrayBuffer(16);
      new Float32Array(ab, 0, 2).set([1 / w, 1 / h]);
      this.device.queue.writeBuffer(buffer, 0, ab);
    }

    _writeDepthParams(buffer, w, h) {
      const ab = new ArrayBuffer(16);
      new Float32Array(ab, 0, 2).set([1 / w, 1 / h]);
      new Float32Array(ab, 8, 2).set([w, h]);
      this.device.queue.writeBuffer(buffer, 0, ab);
    }

    _convBindGroup(srcView, residualView, weightsBuffer, paramsBuffer) {
      return this.device.createBindGroup({
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

    _clampBindGroup(srcView, paramsBuffer) {
      return this.device.createBindGroup({
        layout: this.bgl.clamp,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: { buffer: paramsBuffer } },
        ],
      });
    }

    _clampRGBBindGroup(srcView, statsView) {
      return this.device.createBindGroup({
        layout: this.bgl.clampRGB,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: statsView },
          { binding: 2, resource: this.sampler },
        ],
      });
    }

    _depthBindGroup(lowView, mainView, paramsBuffer) {
      return this.device.createBindGroup({
        layout: this.bgl.depth,
        entries: [
          { binding: 0, resource: lowView },
          { binding: 1, resource: mainView },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      });
    }

    _blitBindGroup(srcView) {
      return this.device.createBindGroup({
        layout: this.bgl.blit,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this.sampler },
        ],
      });
    }

    _destroyGraph() {
      if (this._graphTextures) for (const t of this._graphTextures) t.destroy();
      if (this._graphBuffers) for (const b of this._graphBuffers) b.destroy();
      this._graphTextures = [];
      this._graphBuffers = [];
      this.passes = [];
      this.depthBindGroup = null;
      this.finalBindGroup = null;
      this.finalPipeline = null;
    }

    _chooseMode(w, h) {
      if (this.mode === "restore" || this.mode === "upscale2x") return this.mode;
      if (!this.adaptive) return "upscale2x";
      // Only pay for 2x when the display actually has more pixels than the
      // source. A 1080p video on a 1080p display gets Restore-only, which is
      // much cheaper and still sharper than the raw video.
      const rect = this.video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayW = rect.width * dpr;
      return displayW > w * 1.25 ? "upscale2x" : "restore";
    }

    buildGraph(w, h) {
      this._destroyGraph();
      this.width = w;
      this.height = h;
      const mode = this._chooseMode(w, h);
      const scale = mode === "upscale2x" ? 2 : 1;
      this.activeMode = mode;
      this.scale = scale;
      this.canvas.width = w * scale;
      this.canvas.height = h * scale;

      const textures = [];
      const buffers = [];
      const tex = (name, ww, hh, format, usage) => {
        const t = this._tex(ww, hh, format, usage);
        textures.push(t);
        this[name] = t;
        return t;
      };
      // copyExternalImageToTexture requires COPY_DST *and* RENDER_ATTACHMENT on
      // the destination texture in current WebGPU implementations.
      const inputUsage =
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT;
      const midUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
      this.inputTex = tex("inputTex", w, h, "rgba8unorm", inputUsage);
      if (this.clampHighlights) {
        this.clampH = tex("clampH", w, h, "rgba16float", midUsage);
        this.clampV = tex("clampV", w, h, "rgba16float", midUsage);
        this.clampOut = tex("clampOut", w, h, "rgba16float", midUsage);
      }
      this.restoreA = tex("restoreA", w, h, "rgba16float", midUsage);
      this.restoreB = tex("restoreB", w, h, "rgba16float", midUsage);
      if (mode === "upscale2x") {
        this.upA = tex("upA", w, h, "rgba16float", midUsage);
        this.upB = tex("upB", w, h, "rgba16float", midUsage);
      }

      const view = (t) => t.createView();
      const passes = [];
      const push = (pipeline, bindGroup, dstTexture) => {
        passes.push({ pipeline, bindGroup, dstView: view(dstTexture) });
      };

      const clampParams = this._uniform(16);
      buffers.push(clampParams);
      if (this.clampHighlights) {
        this._writeClampParams(clampParams, w, h);
        push("clampH", this._clampBindGroup(view(this.inputTex), clampParams), this.clampH);
        push("clampV", this._clampBindGroup(view(this.clampH), clampParams), this.clampV);
        push("clampRGB", this._clampRGBBindGroup(view(this.inputTex), view(this.clampV)), this.clampOut);
      }

      const restoreInput = this.clampHighlights ? this.clampOut : this.inputTex;
      const restoreSrc = [restoreInput, this.restoreA, this.restoreB, this.restoreA];
      const restoreDst = [this.restoreA, this.restoreB, this.restoreA, this.restoreB];

      const addConvPasses = (layers, srcs, dsts, residualTex) => {
        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i];
          const wb = this._storage(layer.weights.byteLength);
          const pb = this._uniform(32);
          buffers.push(wb, pb);
          this.device.queue.writeBuffer(wb, 0, layer.weights);
          this._writeConvParams(pb, layer, w, h);
          const bg = this._convBindGroup(view(srcs[i]), view(residualTex), wb, pb);
          push("conv", bg, dsts[i]);
        }
      };

      addConvPasses(Anime4KData.restore, restoreSrc, restoreDst, restoreInput);

      if (mode === "upscale2x") {
        const upSrc = [this.restoreB, this.upA, this.upB, this.upA];
        const upDst = [this.upA, this.upB, this.upA, this.upB];
        addConvPasses(Anime4KData.upscale, upSrc, upDst, this.restoreB);
        const depthParams = this._uniform(16);
        buffers.push(depthParams);
        this._writeDepthParams(depthParams, w, h);
        this.finalBindGroup = this._depthBindGroup(view(this.upB), view(this.restoreB), depthParams);
        this.finalPipeline = "depth";
      } else {
        this.finalBindGroup = this._blitBindGroup(view(this.restoreB));
        this.finalPipeline = "blit";
      }

      this.passes = passes;
      this._graphTextures = textures;
      this._graphBuffers = buffers;
    }

    setMode(mode) {
      this.mode = mode;
      this._pendingRebuild = true;
    }

    setClampHighlights(on) {
      this.clampHighlights = Boolean(on);
      this._pendingRebuild = true;
    }

    getStats() {
      const now = performance.now();
      const dt = (now - this._statsTime) / 1000;
      if (dt > 0.4) {
        this._fps = (this.frames - this._statsFrames) / dt;
        this._statsFrames = this.frames;
        this._statsTime = now;
      }
      return {
        mode: this.activeMode,
        scale: this.scale,
        width: this.width,
        height: this.height,
        fps: this._fps,
        frames: this.frames,
        inFlight: this.inFlight,
        format: this.format,
        upload: "copyExternalImageToTexture",
      };
    }

    renderFrame() {
      if (!this.running || !this.device || (this.backpressure && this.inFlight)) return;
      const v = this.video;
      if (!v.videoWidth || !v.videoHeight) return;
      if (v.videoWidth !== this.width || v.videoHeight !== this.height || this._pendingRebuild) {
        this._pendingRebuild = false;
        this.buildGraph(v.videoWidth, v.videoHeight);
      }
      try {
        this.device.queue.copyExternalImageToTexture(
          { source: v, flipY: false },
          { texture: this.inputTex, premultipliedAlpha: false },
          [this.width, this.height]
        );
      } catch (e) {
        this.stop();
        if (this.options.onError) this.options.onError(e);
        return;
      }
      const encoder = this.device.createCommandEncoder();
      for (const p of this.passes) {
        const rp = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: p.dstView,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        rp.setPipeline(this.pipelines[p.pipeline]);
        rp.setBindGroup(0, p.bindGroup);
        rp.draw(3);
        rp.end();
      }
      const canvasView = this.context.getCurrentTexture().createView();
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
      this.device.queue.submit([encoder.finish()]);
      this.canvas.style.visibility = "visible";
      this.frames++;
      if (this.backpressure && typeof this.device.queue.onSubmittedWorkDone === "function") {
        this.device.queue.onSubmittedWorkDone().then(() => {
          this.inFlight = false;
        }).catch((e) => {
          this.inFlight = false;
          if (this.options.onError) this.options.onError(e);
        });
      } else {
        this.inFlight = false;
      }
    }

    _schedule() {
      if (!this.running) return;
      if (typeof this.video.requestVideoFrameCallback === "function") {
        this._rvfc = this.video.requestVideoFrameCallback(this._onVideoFrame);
      } else {
        this._raf = requestAnimationFrame(this._onRaf);
      }
    }

    _onVideoFrame(now) {
      if (!this.running) return;
      if (this.backpressure && this.inFlight) {
        this._schedule();
        return;
      }
      const min = this.targetFps ? 1000 / this.targetFps : 0;
      if (!min || now - this.lastFrameTime >= min - 1) {
        this.lastFrameTime = now;
        this.renderFrame();
      }
      this._schedule();
    }

    _onRaf(now) {
      if (!this.running) return;
      const min = this.targetFps ? 1000 / this.targetFps : 1000 / 30;
      if (now - this.lastFrameTime >= min - 1) {
        this.lastFrameTime = now;
        this.renderFrame();
      }
      this._raf = requestAnimationFrame(this._onRaf);
    }

    _onSeek() {
      if (this.running) this.renderFrame();
    }

    _onPlay() {
      if (this.running) this.renderFrame();
    }

    _onPause() {
      if (this.running) this.renderFrame();
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.inFlight = false;
      this.lastFrameTime = 0;
      this.video.addEventListener("seeked", this._onSeek);
      this.video.addEventListener("play", this._onPlay);
      this.video.addEventListener("pause", this._onPause);
      this.renderFrame();
      this._schedule();
    }

    stop() {
      this.running = false;
      this.video.removeEventListener("seeked", this._onSeek);
      this.video.removeEventListener("play", this._onPlay);
      this.video.removeEventListener("pause", this._onPause);
      if (this._rvfc && this.video.cancelVideoFrameCallback) {
        this.video.cancelVideoFrameCallback(this._rvfc);
      }
      this._rvfc = 0;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      if (this.canvas) this.canvas.style.visibility = "hidden";
    }

    destroy() {
      this._destroyed = true;
      this.stop();
      this._destroyGraph();
      if (this.device) {
        this.device.destroy();
        this.device = null;
      }
    }
  }

  global.Anime4KWebGPU = Anime4KWebGPU;
})(globalThis);
