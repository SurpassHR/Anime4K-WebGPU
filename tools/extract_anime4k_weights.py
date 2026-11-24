#!/usr/bin/env python3
"""Extract Anime4K Restore_CNN_S + Upscale_CNN_x2_S weights to JSON.

The input GLSL files are from bloc97/Anime4K (MIT). The output layout is
optimized for the generic WebGPU convolution shader in src/core/anime4k-webgpu.ts:
for each tap, four vec4s (one per output channel), each vec4 holding the four
input-channel weights.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def blocks(path: Path):
    text = path.read_text()
    parts = re.split(r"//!DESC\s+", text)
    for part in parts[1:]:
        title = part.splitlines()[0].strip()
        yield title, part


def parse_block(title: str, body: str):
    if "Depth-to-Space" in title:
        return {"title": title, "type": "depth"}

    split = "#define go_1" in body
    residual = "return result + MAIN_tex" in body
    taps: dict[int, dict[int, list[float]]] = {}

    pattern = re.compile(
        r"mat4\(([^)]*)\)\s*\*\s*go_([01])\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)"
    )
    for match in pattern.finditer(body):
        numbers = [float(x) for x in match.group(1).replace("\n", " ").split(",") if x.strip()]
        if len(numbers) != 16:
            raise ValueError(f"{title}: expected 16 mat4 values, got {len(numbers)}")
        sign = int(match.group(2))
        ix = int(round(float(match.group(3))))
        iy = int(round(float(match.group(4))))
        tap = (iy + 1) * 3 + (ix + 1)
        taps.setdefault(sign, {})[tap] = numbers

    bias_match = re.search(r"result\s*\+=\s*vec4\(([^)]*)\)", body)
    if not bias_match:
        raise ValueError(f"{title}: bias not found")
    bias = [float(x) for x in bias_match.group(1).replace("\n", " ").split(",") if x.strip()]
    if len(bias) != 4:
        raise ValueError(f"{title}: expected 4 bias values, got {len(bias)}")

    if 0 not in taps or set(taps[0]) != set(range(9)):
        raise ValueError(f"{title}: incomplete go_0 taps")
    if split and (1 not in taps or set(taps[1]) != set(range(9))):
        raise ValueError(f"{title}: incomplete go_1 taps")

    return {
        "title": title,
        "type": "conv",
        "split": split,
        "residual": residual,
        "bias": bias,
        "pos": [taps[0][i] for i in range(9)],
        "neg": [taps[1][i] for i in range(9)] if split else None,
    }


def pack(layer: dict) -> list[float]:
    out: list[float] = []
    for tap in range(9):
        matrix = layer["pos"][tap]
        for out_channel in range(4):
            out.extend((
                matrix[0 * 4 + out_channel],
                matrix[1 * 4 + out_channel],
                matrix[2 * 4 + out_channel],
                matrix[3 * 4 + out_channel],
            ))
    if layer["split"]:
        for tap in range(9):
            matrix = layer["neg"][tap]
            for out_channel in range(4):
                out.extend((
                    matrix[0 * 4 + out_channel],
                    matrix[1 * 4 + out_channel],
                    matrix[2 * 4 + out_channel],
                    matrix[3 * 4 + out_channel],
                ))
    return out


def parse_model(path: Path) -> list[dict]:
    layers = []
    for title, body in blocks(path):
        layer = parse_block(title, body)
        if layer["type"] == "conv":
            layer["weights"] = pack(layer)
            layers.append(layer)
    return layers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--glsl", type=Path, default=Path("research/anime4k-shaders"))
    parser.add_argument("--out", type=Path, default=Path("research/weights.json"))
    args = parser.parse_args()

    restore = parse_model(args.glsl / "Anime4K_Restore_CNN_S.glsl")
    upscale = parse_model(args.glsl / "Anime4K_Upscale_CNN_x2_S.glsl")
    data = {"restore": restore, "upscale": upscale}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {args.out} ({len(restore)} restore layers, {len(upscale)} upscale layers)")


if __name__ == "__main__":
    main()
