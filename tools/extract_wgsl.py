#!/usr/bin/env python3
"""Extract the WGSL template literals from the extension renderer."""
from __future__ import annotations

import argparse
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path, default=Path("extension/anime4k-webgpu.js"))
    parser.add_argument("--out", type=Path, default=Path("build/wgsl"))
    args = parser.parse_args()

    text = args.renderer.read_text()
    modules: dict[str, str] = {}
    for name in ["VERTEX", "CONV", "CLAMP_H", "CLAMP_V", "CLAMP_RGB", "DEPTH", "BLIT"]:
        match = re.search(r"const " + name + r" = `(.*?)`;", text, re.S)
        if not match:
            raise SystemExit(f"missing WGSL template: {name}")
        modules[name] = match.group(1)

    args.out.mkdir(parents=True, exist_ok=True)
    vertex = modules["VERTEX"]
    for name, fragment in modules.items():
        if name == "VERTEX":
            continue
        (args.out / f"{name}.wgsl").write_text(vertex + "\n" + fragment)
        print(f"wrote {args.out / (name + '.wgsl')}")


if __name__ == "__main__":
    main()
