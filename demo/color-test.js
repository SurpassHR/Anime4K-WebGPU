(() => {
  const video = document.getElementById("v");
  const canvas = document.getElementById("c");
  const log = document.getElementById("log");
  let up = null;
  let mode = "upscale2x";

  const isFile = location.protocol === "file:";
  const httpHelp = [
    "file:// 下无法执行 getImageData：video 会把 canvas 标记为 cross-origin。",
    "",
    "请在终端运行：",
    "  cd outputs/anime4k-webgpu/demo",
    "  python3 -m http.server 8765",
    "",
    "然后打开：",
    "  http://127.0.0.1:8765/color-test.html",
  ].join("\n");

  const say = (s) => { log.textContent = s; };
  const pad = (v) => String(v).padStart(3, " ");

  async function ensure(modeName) {
    if (up) { up.stop(); up.destroy(); up = null; }
    mode = modeName;
    up = new Anime4KWebGPU(video, canvas, {
      fps: 0,
      mode,
      clampHighlights: true,
      backpressure: false,
      onError: (e) => say("GPU 错误: " + (e.message || e)),
    });
    await up.init();
    await video.play().catch(() => {});
    up.start();
    await new Promise((r) => setTimeout(r, 350));
    up.renderFrame();
  }

  async function run() {
    if (isFile) {
      say(httpHelp);
      return;
    }
    try {
      await ensure(mode);
      const W = up.canvas.width, H = up.canvas.height;
      const a = document.createElement("canvas"); a.width = W; a.height = H;
      const ac = a.getContext("2d"); ac.drawImage(canvas, 0, 0);
      const ad = ac.getImageData(0, 0, W, H).data;
      const b = document.createElement("canvas"); b.width = W; b.height = H;
      const bc = b.getContext("2d"); bc.drawImage(video, 0, 0, W, H);
      const bd = bc.getImageData(0, 0, W, H).data;
      const xs = [0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map((x) => Math.round(x * W));
      const ys = [0.15, 0.5, 0.85].map((y) => Math.round(y * H));
      let maxd = 0, sum = 0, n = 0;
      const lines = [`mode=${up.getStats().mode} canvas=${W}x${H} source=${video.videoWidth}x${video.videoHeight}`];
      for (const y of ys) {
        for (const x of xs) {
          const i = (y * W + x) * 4;
          const ds = [0, 1, 2].map((k) => Math.abs(ad[i + k] - bd[i + k]));
          maxd = Math.max(maxd, ...ds);
          sum += ds[0] + ds[1] + ds[2]; n += 3;
          lines.push(`(${pad(x)},${pad(y)}) src(${pad(bd[i])},${pad(bd[i+1])},${pad(bd[i+2])}) out(${pad(ad[i])},${pad(ad[i+1])},${pad(ad[i+2])}) d(${ds.join(",")})`);
        }
      }
      lines.push(`MAXD=${maxd}/255  MEAND=${(sum / n).toFixed(2)}/255`);
      say(lines.join("\n"));
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if ((e && e.name === "SecurityError") || /tainted/i.test(msg)) {
        say(httpHelp);
      } else {
        say("失败: " + msg);
      }
    }
  }

  if (isFile) {
    say(httpHelp);
  }

  document.getElementById("run").addEventListener("click", run);
  document.getElementById("restore").addEventListener("click", async () => {
    mode = "restore";
    await run();
  });

  if (new URLSearchParams(location.search).has("autorun")) {
    run();
  }
})();
