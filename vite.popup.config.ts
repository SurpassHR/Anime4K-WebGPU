import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const popupRoot = resolve(projectRoot, "src/popup");

export default defineConfig({
  root: popupRoot,
  base: "./",
  publicDir: false,
  build: {
    outDir: resolve(projectRoot, "dist/extension"),
    emptyOutDir: false,
    target: "chrome113",
    sourcemap: true,
    rollupOptions: {
      input: resolve(popupRoot, "popup.html"),
    },
  },
});
