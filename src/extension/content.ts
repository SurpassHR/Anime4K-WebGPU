import { Anime4KWebGPU } from "../core/anime4k-webgpu";
import type {
  Anime4KOutput,
  Anime4KQuality,
} from "../core/types";
import {
  DEFAULT_SETTINGS,
  isContentRequest,
  SETTINGS_STORAGE_KEY,
  type ContentRequest,
  type ContentResponse,
  type PageState,
  type PersistedSettings,
  type VideoSummary,
} from "./protocol";

const HOST_ATTR = "data-anime4k-webgpu";
const entries = new Map<HTMLVideoElement, VideoEntry>();
let scanTimer = 0;
let settings: PersistedSettings = { ...DEFAULT_SETTINGS };
let activeEntry: VideoEntry | null = null;
let lastError: string | null = null;

interface VideoEntry {
  video: HTMLVideoElement;
  host: HTMLDivElement;
  canvas: HTMLCanvasElement;
  up: Anime4KWebGPU | null;
  active: boolean;
  oldOpacity: string;
  raf: number;
  lastError: string | null;
}

const css = `
  :host { all: initial; }
  .box { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  canvas {
    display: block; width: 100%; height: 100%; object-fit: contain;
    visibility: hidden; pointer-events: none;
  }
`;

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const parseOutput = (
  value: unknown,
  legacyMode?: unknown,
  legacyFactor?: unknown,
): Anime4KOutput => {
  if (value === "auto" || value === "restore" || value === "2x" || value === "4x" || value === "8x") {
    return value;
  }
  if (legacyMode === "restore") return "restore";
  if (legacyMode === "upscale2x") return "2x";
  if (legacyMode === "upscale") {
    return legacyFactor === 4 ? "4x" : legacyFactor === 8 ? "8x" : "2x";
  }
  return "auto";
};

const parseQuality = (value: unknown): Anime4KQuality =>
  value === "balanced" || value === "ultra" ? value : "simple";

const isVisible = (video: HTMLVideoElement): boolean => {
  if (!video.isConnected || video.hidden) return false;
  const rect = video.getBoundingClientRect();
  if (rect.width < 240 || rect.height < 135) return false;
  const style = getComputedStyle(video);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0.01
  );
};

const collectVideos = (root: ParentNode, out: Set<HTMLVideoElement>): void => {
  for (const video of root.querySelectorAll("video")) out.add(video);
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) collectVideos(element.shadowRoot, out);
  }
};

const createEntry = (video: HTMLVideoElement): VideoEntry => {
  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "");
  host.style.position = "absolute";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.zIndex = "0";
  host.style.pointerEvents = "none";
  host.style.display = "none";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const box = document.createElement("div");
  box.className = "box";
  const canvas = document.createElement("canvas");
  box.append(canvas);
  shadow.append(style, box);

  const entry: VideoEntry = {
    video,
    host,
    canvas,
    up: null,
    active: false,
    oldOpacity: video.style.opacity,
    raf: 0,
    lastError: null,
  };
  entries.set(video, entry);
  ensureHostAttachment(entry);
  return entry;
};

const ensureHostAttachment = (entry: VideoEntry): void => {
  const parent = entry.video.parentElement;
  if (!parent) return;
  if (entry.host.parentElement !== parent || entry.host.nextSibling !== entry.video) {
    parent.insertBefore(entry.host, entry.video);
  }
};

const destroyEntry = (entry: VideoEntry): void => {
  entry.up?.stop();
  entry.up?.destroy();
  entry.up = null;
  if (entry.active) entry.video.style.opacity = entry.oldOpacity;
  if (entry.raf) cancelAnimationFrame(entry.raf);
  entry.raf = 0;
  entry.host.remove();
  entries.delete(entry.video);
  if (activeEntry === entry) activeEntry = null;
};

const position = (entry: VideoEntry): void => {
  if (!entry.active) {
    entry.host.style.display = "none";
    return;
  }
  const { video, host } = entry;
  const rect = video.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    host.style.display = "none";
    return;
  }
  host.style.display = "block";
  ensureHostAttachment(entry);

  const container = host.offsetParent as HTMLElement | null;
  if (container) {
    const frame = container.getBoundingClientRect();
    host.style.position = "absolute";
    host.style.left = rect.left - frame.left + "px";
    host.style.top = rect.top - frame.top + "px";
  } else {
    host.style.position = "fixed";
    host.style.left = rect.left + "px";
    host.style.top = rect.top + "px";
  }
  host.style.width = rect.width + "px";
  host.style.height = rect.height + "px";

  // Mirror the video's object-fit so letterboxing/cropping matches.
  const fit = getComputedStyle(video).objectFit;
  if (fit && fit !== "fill") entry.canvas.style.objectFit = fit;
};

const startLayout = (entry: VideoEntry): void => {
  if (entry.raf) return;
  const update = (): void => {
    if (!entry.active) {
      entry.raf = 0;
      return;
    }
    position(entry);
    entry.raf = requestAnimationFrame(update);
  };
  entry.raf = requestAnimationFrame(update);
};

const primaryEntry = (): VideoEntry | null => {
  let best: VideoEntry | null = null;
  let bestArea = 0;
  for (const entry of entries.values()) {
    const video = entry.video;
    if (!video.isConnected || !isVisible(video)) continue;
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = entry;
      bestArea = area;
    }
  }
  return best;
};

const videoSummary = (entry: VideoEntry): VideoSummary => {
  const video = entry.video;
  const rect = video.getBoundingClientRect();
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    displayWidth: Math.round(rect.width),
    displayHeight: Math.round(rect.height),
    ready: Boolean(video.videoWidth && video.videoHeight),
  };
};

const visibleCount = (): number => {
  let count = 0;
  for (const entry of entries.values()) {
    if (entry.video.isConnected && isVisible(entry.video)) count++;
  }
  return count;
};

const getState = (): PageState => {
  if (activeEntry && !activeEntry.video.isConnected) stopActive();
  if (activeEntry?.up && !activeEntry.up.isRunning()) {
    const preservedError = lastError;
    stopActive();
    lastError = preservedError;
  }
  const current = activeEntry ?? primaryEntry();
  return {
    supported: Boolean(navigator.gpu),
    enabled: Boolean(activeEntry),
    video: current ? videoSummary(current) : null,
    videoCount: visibleCount(),
    settings: { ...settings, enabled: Boolean(activeEntry) },
    stats: activeEntry?.up?.getStats() ?? null,
    error: lastError ?? activeEntry?.lastError ?? null,
  };
};

const applySettings = (): void => {
  if (!activeEntry?.up) return;
  activeEntry.up.setOutput(settings.output);
  activeEntry.up.setQuality(settings.quality);
  activeEntry.up.setClampHighlights(settings.clampHighlights);
  activeEntry.up.renderFrame();
};

const saveSettings = (): void => {
  chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
};

const loadSettings = (): Promise<void> =>
  new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, (result) => {
      const stored = result[SETTINGS_STORAGE_KEY] as
        | {
            output?: unknown;
            quality?: unknown;
            clampHighlights?: unknown;
            mode?: unknown;
            upscaleFactor?: unknown;
          }
        | undefined;
      if (stored) {
        settings = {
          output: parseOutput(stored.output, stored.mode, stored.upscaleFactor),
          quality: parseQuality(stored.quality),
          clampHighlights:
            typeof stored.clampHighlights === "boolean"
              ? stored.clampHighlights
              : settings.clampHighlights,
        };
      }
      resolve();
    });
  });

const stopActive = (): void => {
  const entry = activeEntry;
  if (!entry) return;
  entry.up?.stop();
  entry.up?.destroy();
  entry.up = null;
  entry.active = false;
  entry.video.style.opacity = entry.oldOpacity;
  entry.canvas.style.visibility = "hidden";
  entry.host.style.display = "none";
  if (entry.raf) cancelAnimationFrame(entry.raf);
  entry.raf = 0;
  activeEntry = null;
  entry.lastError = null;
  lastError = null;
};

const startActive = async (): Promise<void> => {
  lastError = null;
  if (activeEntry) return;

  const entry = primaryEntry();
  if (!entry) {
    lastError = "当前页面没有找到可超分的视频。";
    return;
  }

  const video = entry.video;
  if (!video.videoWidth || !video.videoHeight) {
    lastError = "视频还没有加载出画面，请先播放再试。";
    return;
  }
  if (video.mediaKeys) {
    lastError = "这个视频受 DRM/EME 保护，WebGPU 无法读取帧，不能超分。";
    return;
  }
  if (!navigator.gpu) {
    lastError = "当前浏览器没有 WebGPU。请使用 Chrome/Edge 113+ 或支持 WebGPU 的浏览器。";
    return;
  }

  let up: Anime4KWebGPU | null = null;
  try {
    up = new Anime4KWebGPU(video, entry.canvas, {
      fps: 30,
      output: settings.output,
      quality: settings.quality,
      clampHighlights: settings.clampHighlights,
      backpressure: true,
      onError: (error) => {
        const message = error.message;
        entry.lastError = message;
        lastError = message;
        window.setTimeout(() => {
          if (activeEntry === entry && entry.up && !entry.up.isRunning()) {
            stopActive();
            lastError = message;
            entry.lastError = message;
          }
        }, 0);
      },
    });
    await up.init();
    up.start();
    if (up.getStats().frames === 0) {
      throw new Error(lastError ?? "超分启动失败。");
    }
    entry.up = up;
    entry.active = true;
    entry.oldOpacity = video.style.opacity;
    video.style.opacity = "0";
    activeEntry = entry;
    entry.lastError = null;
    position(entry);
    startLayout(entry);
  } catch (error) {
    up?.destroy();
    entry.up = null;
    entry.active = false;
    video.style.opacity = entry.oldOpacity;
    entry.canvas.style.visibility = "hidden";
    entry.host.style.display = "none";
    lastError = toError(error).message;
  }
};

const setEnabled = async (enabled: boolean): Promise<PageState> => {
  if (enabled) await startActive();
  else stopActive();
  return getState();
};

const updateSettings = (partial: Partial<PersistedSettings>): PageState => {
  if (partial.output !== undefined) {
    settings = { ...settings, output: parseOutput(partial.output) };
  }
  if (partial.quality !== undefined) {
    settings = { ...settings, quality: parseQuality(partial.quality) };
  }
  if (typeof partial.clampHighlights === "boolean") {
    settings = { ...settings, clampHighlights: partial.clampHighlights };
  }
  saveSettings();
  applySettings();
  return getState();
};

const scan = (): void => {
  scanTimer = 0;
  for (const [video, entry] of entries) {
    if (!video.isConnected) destroyEntry(entry);
  }

  const videos = new Set<HTMLVideoElement>();
  collectVideos(document, videos);
  for (const video of videos) {
    if (!video.isConnected || !isVisible(video)) continue;
    if (!entries.has(video)) createEntry(video);
  }

  const current = activeEntry ?? primaryEntry();
  if (current) position(current);
};

const scheduleScan = (): void => {
  if (scanTimer) return;
  scanTimer = window.setTimeout(scan, 600);
};

const handleRequest = async (request: ContentRequest): Promise<ContentResponse> => {
  switch (request.type) {
    case "anime4k:get-state":
      return { state: getState() };
    case "anime4k:set-enabled":
      return { state: await setEnabled(request.enabled) };
    case "anime4k:update-settings":
      return { state: updateSettings(request.settings) };
    case "anime4k:rescan":
      scan();
      return { state: getState() };
  }
};

const onFullscreen = (): void => {
  if (activeEntry) position(activeEntry);
  const fullscreen = document.fullscreenElement;
  if (fullscreen && fullscreen.tagName === "VIDEO") {
    console.warn(
      "[Anime4K WebGPU] video-element fullscreen is not overlayable; use the player's web fullscreen.",
    );
  }
};

const boot = (): void => {
  scheduleScan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener(
    "resize",
    () => {
      if (activeEntry) position(activeEntry);
    },
    { passive: true },
  );
  document.addEventListener("fullscreenchange", onFullscreen);
  window.addEventListener(
    "scroll",
    () => {
      if (activeEntry) position(activeEntry);
    },
    { passive: true, capture: true },
  );
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]) return;
  const next = changes[SETTINGS_STORAGE_KEY].newValue as
    | {
        output?: unknown;
        quality?: unknown;
        clampHighlights?: unknown;
        mode?: unknown;
        upscaleFactor?: unknown;
      }
    | undefined;
  if (!next) return;
  settings = {
    output: parseOutput(
      next.output ?? settings.output,
      next.mode,
      next.upscaleFactor,
    ),
    quality: parseQuality(next.quality ?? settings.quality),
    clampHighlights:
      typeof next.clampHighlights === "boolean"
        ? next.clampHighlights
        : settings.clampHighlights,
  };
  applySettings();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isContentRequest(message)) return false;
  void handleRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      lastError = toError(error).message;
      sendResponse({ state: getState() } satisfies ContentResponse);
    });
  return true;
});

void loadSettings().then(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});

type Anime4KDebugHandle = {
  entries: Map<HTMLVideoElement, VideoEntry>;
  getState: typeof getState;
  setEnabled: typeof setEnabled;
  scan: typeof scan;
  rescan: typeof scheduleScan;
};
const debugGlobal = globalThis as typeof globalThis & {
  __anime4kWebGPU?: Anime4KDebugHandle;
};
debugGlobal.__anime4kWebGPU = {
  entries,
  getState,
  setEnabled,
  scan,
  rescan: scheduleScan,
};
