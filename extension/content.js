(() => {
  "use strict";

  const HOST_ATTR = "data-anime4k-webgpu";
  const states = new WeakMap();
  const seen = new Set();
  let scanTimer = 0;
  let activeCount = 0;

  const css = `
    :host { all: initial; }
    .box { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; visibility: hidden; pointer-events: none; }
    button {
      position: absolute; right: 12px; bottom: 12px; z-index: 2;
      pointer-events: auto; cursor: pointer;
      border: 1px solid rgba(255,255,255,.22); border-radius: 999px;
      background: rgba(18,20,30,.78); color: #fff;
      padding: 7px 12px; font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .2px; backdrop-filter: blur(10px);
      box-shadow: 0 6px 24px rgba(0,0,0,.35);
    }
    button:hover { background: rgba(34,38,58,.92); }
    button[data-busy="1"] { opacity: .7; cursor: wait; }
    .toast {
      position: absolute; left: 12px; right: 12px; bottom: 52px; z-index: 3;
      display: none; pointer-events: none;
      background: rgba(120,20,30,.92); color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: pre-wrap;
    }
    .toast.show { display: block; }
    .hud {
      position: absolute; left: 10px; top: 10px; z-index: 3;
      display: none; align-items: center; gap: 8px;
      pointer-events: auto;
      background: rgba(14,16,24,.78); color: #cfd6e6;
      border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
      padding: 6px 8px; font: 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }
    .hud select { pointer-events: auto; background: #1b2130; color: #e8ecf6; border: 1px solid #39445c; border-radius: 5px; font: inherit; padding: 2px 4px; }
    .hud label { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
    .hud input { margin: 0; }
    .hud .stats { opacity: .8; white-space: nowrap; }
  `;

  const isVisible = (video) => {
    if (!video.isConnected || video.hidden) return false;
    const rect = video.getBoundingClientRect();
    if (rect.width < 240 || rect.height < 135) return false;
    const s = getComputedStyle(video);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.01;
  };

  const collectVideos = (root, out) => {
    if (!root || !root.querySelectorAll) return;
    for (const v of root.querySelectorAll("video")) out.add(v);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) collectVideos(el.shadowRoot, out);
    }
  };

  const createState = (video) => {
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "none";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const box = document.createElement("div");
    box.className = "box";
    const canvas = document.createElement("canvas");
    const button = document.createElement("button");
    button.textContent = "✨ 超分";
    button.title = "Anime4K WebGPU 2x";
    const toast = document.createElement("div");
    toast.className = "toast";
    const hud = document.createElement("div");
    hud.className = "hud";
    const mode = document.createElement("select");
    for (const [value, label] of [["auto", "自动"], ["restore", "1x 修复"], ["upscale2x", "2x 超分"]]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      mode.appendChild(opt);
    }
    const clampLabel = document.createElement("label");
    const clamp = document.createElement("input");
    clamp.type = "checkbox";
    clampLabel.append(clamp, document.createTextNode("Clamp"));
    const stats = document.createElement("span");
    stats.className = "stats";
    hud.append(mode, clampLabel, stats);
    box.append(canvas, button, toast, hud);
    shadow.append(style, box);
    document.documentElement.appendChild(host);

    const state = {
      video, host, canvas, button, toast, hud, mode, clamp, stats,
      up: null, oldOpacity: video.style.opacity, raf: 0, active: false,
      selectedMode: "auto", clampEnabled: false, hudTimer: 0,
    };
    states.set(video, state);

    mode.addEventListener("change", () => {
      state.selectedMode = mode.value;
      if (state.up) state.up.setMode(state.selectedMode);
    });
    clamp.addEventListener("change", () => {
      state.clampEnabled = clamp.checked;
      if (state.up) state.up.setClampHighlights(state.clampEnabled);
    });

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      void toggle(state);
    });

    const update = () => {
      if (!state.active) {
        state.raf = 0;
        return;
      }
      position(state);
      state.raf = requestAnimationFrame(update);
    };
    state.startLayout = () => {
      if (!state.raf) state.raf = requestAnimationFrame(update);
    };
    return state;
  };

  const position = (state) => {
    const { video, host, button } = state;
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      host.style.display = "none";
      return;
    }
    host.style.display = "block";
    const fs = document.fullscreenElement;
    if (fs && fs !== document.documentElement && fs.contains(video)) {
      if (host.parentNode !== fs) fs.appendChild(host);
      const fr = fs.getBoundingClientRect();
      host.style.position = "absolute";
      host.style.left = rect.left - fr.left + "px";
      host.style.top = rect.top - fr.top + "px";
    } else {
      if (host.parentNode !== document.documentElement) document.documentElement.appendChild(host);
      host.style.position = "fixed";
      host.style.left = rect.left + "px";
      host.style.top = rect.top + "px";
    }
    host.style.width = rect.width + "px";
    host.style.height = rect.height + "px";
    // Mirror the video's object-fit so letterboxing/cropping matches.
    const fit = getComputedStyle(video).objectFit;
    if (fit && fit !== "fill") state.canvas.style.objectFit = fit;
    button.style.display = state.active || rect.width >= 300 ? "block" : "none";
  };

  const showToast = (state, text) => {
    state.toast.textContent = text;
    state.toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => state.toast.classList.remove("show"), 6000);
  };

  const setBusy = (state, busy, label) => {
    state.button.dataset.busy = busy ? "1" : "0";
    state.button.textContent = label;
  };

  async function toggle(state) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (state.up) {
        setBusy(state, true, "关闭中…");
        state.up.stop();
        state.up.destroy();
        state.up = null;
        state.active = false;
        state.video.style.opacity = state.oldOpacity;
        state.canvas.style.visibility = "hidden";
        clearInterval(state.hudTimer);
        state.hud.style.display = "none";
        activeCount = Math.max(0, activeCount - 1);
        setBusy(state, false, "✨ 超分");
        return;
      }

      const video = state.video;
      if (!video.videoWidth || !video.videoHeight) {
        showToast(state, "视频还没有加载出画面，先点播放再试。");
        return;
      }
      if (video.mediaKeys) {
        showToast(state, "这个视频受 DRM/EME 保护，WebGPU 无法读取帧，不能超分。");
        return;
      }
      if (!navigator.gpu) {
        showToast(state, "当前浏览器没有 WebGPU。请使用 Chrome/Edge 113+ 或支持 WebGPU 的浏览器。");
        return;
      }

      setBusy(state, true, "启动中…");
      const up = new Anime4KWebGPU(video, state.canvas, {
        fps: 30,
        mode: state.selectedMode,
        clampHighlights: state.clampEnabled,
        backpressure: true,
        onError: (e) => {
          const msg = String(e && e.message ? e.message : e);
          showToast(state, "GPU/视频帧读取失败：\n" + msg + "\n跨域视频通常需要服务端 CORS，或开启扩展的跨域兼容模式。");
        },
      });
      await up.init();
      up.start();
      state.up = up;
      state.active = true;
      state.oldOpacity = video.style.opacity;
      video.style.opacity = "0";
      state.startLayout();
      activeCount++;
      setBusy(state, false, "关闭超分");
      state.hud.style.display = "flex";
      state.hudTimer = setInterval(() => {
        if (!state.up) return;
        const s = state.up.getStats();
        state.stats.textContent = `${s.mode} ${s.width}x${s.height} → ${s.width * s.scale}x${s.height * s.scale} · ${s.fps.toFixed(0)}fps · ${s.format}`;
      }, 500);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      showToast(state, "超分启动失败：\n" + msg);
      setBusy(state, false, "✨ 超分");
    } finally {
      state.busy = false;
    }
  }

  const scan = () => {
    scanTimer = 0;
    const videos = new Set();
    collectVideos(document, videos);
    for (const video of videos) {
      if (seen.has(video)) continue;
      if (!isVisible(video)) continue;
      seen.add(video);
      const state = createState(video);
      position(state);
    }
  };

  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 600);
  };

  const onFullscreen = () => {
    for (const video of seen) {
      const state = states.get(video);
      if (state) position(state);
    }
    const fs = document.fullscreenElement;
    if (fs && fs.tagName === "VIDEO") {
      // Video-element fullscreen puts the video in the top layer; a page overlay
      // cannot be painted above it. Tell the user instead of silently failing.
      console.warn("[Anime4K WebGPU] video-element fullscreen is not overlayable; use the player's web fullscreen.");
    }
  };

  const boot = () => {
    scheduleScan();
    const mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      for (const video of seen) {
        const state = states.get(video);
        if (state) position(state);
      }
    }, { passive: true });
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("scroll", () => {
      for (const video of seen) {
        const state = states.get(video);
        if (state && state.active) position(state);
      }
    }, { passive: true, capture: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  // Debug handle for local prototyping; harmless in the extension isolated world.
  globalThis.__anime4kWebGPU = { states, toggle, scan, rescan: scheduleScan };
})();
