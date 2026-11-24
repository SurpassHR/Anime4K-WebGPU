import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist/site");

await mkdir(out, { recursive: true });

for (const file of ["README.md", "NOTICE.md", "LICENSE"]) {
  await cp(join(root, file), join(out, file));
}

for (const dir of ["docs", "research", "test", "tools"]) {
  const source = join(root, dir);
  await cp(source, join(out, dir), {
    recursive: true,
    filter: (path) => path.endsWith(".md") || path.endsWith("/" + dir),
  });
}

console.log("copied README, NOTICE, LICENSE and Markdown docs into dist/site");
