import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(join(root, "demo"), { recursive: true });
for (const name of ["anime4k-data.js", "anime4k-webgpu.js"]) {
  await copyFile(join(root, "extension", name), join(root, "demo", name));
  console.log(`synced extension/${name} -> demo/${name}`);
}
