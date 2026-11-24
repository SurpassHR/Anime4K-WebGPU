import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/",
  server: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: true,
  },
  build: {
    outDir: resolve(root, "dist/site"),
    emptyOutDir: true,
    target: "chrome113",
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        colorTestRedirect: resolve(root, "color-test.html"),
        demo: resolve(root, "demo/index.html"),
        demoColorTest: resolve(root, "demo/color-test.html"),
        autoMode: resolve(root, "test/auto-mode.html"),
        color2x: resolve(root, "test/color-2x.html"),
        colorRestore: resolve(root, "test/color-restore.html"),
        frameParent: resolve(root, "test/frame-parent.html"),
        frameVideo: resolve(root, "test/frame-video.html"),
      },
    },
  },
});
