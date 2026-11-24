(() => {
  const video = document.getElementById('v');
  const canvas = document.getElementById('c');
  const status = document.getElementById('status');
  let up = null;

  const setStatus = (s, ok = false) => {
    status.textContent = s;
    status.style.color = ok ? '#8fe3b0' : '#9aa7c2';
  };

  if (location.protocol === "file:") {
    setStatus("请用本地 HTTP 打开：在 demo 目录运行 python3 -m http.server 8765", false);
    document.getElementById("start").disabled = true;
  }

  document.getElementById('start').addEventListener('click', async () => {
    if (up) {
      up.start();
      setStatus('运行中', true);
      return;
    }
    try {
      setStatus('初始化 WebGPU…');
      up = new Anime4KWebGPU(video, canvas, {
        fps: 0,
        mode: "upscale2x",
        clampHighlights: true,
        onError: (e) => {
          console.error(e);
          setStatus('GPU 错误: ' + (e.message || e), false);
        },
      });
      await up.init();
      await video.play().catch(() => {});
      up.start();
      setStatus('运行中（2x）', true);
    } catch (e) {
      console.error(e);
      setStatus('失败: ' + (e.message || e), false);
    }
  });

  document.getElementById('stop').addEventListener('click', () => {
    if (!up) return;
    up.stop();
    setStatus('已关闭');
  });
})();
