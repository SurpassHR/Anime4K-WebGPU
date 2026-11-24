import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: resolve(root, "extension"),
  build: {
    outDir: resolve(root, "dist/extension"),
    emptyOutDir: true,
    target: "chrome113",
    sourcemap: true,
    minify: false,
    modulePreload: false,
    lib: {
      entry: resolve(root, "src/extension/content.ts"),
      name: "Anime4KContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
