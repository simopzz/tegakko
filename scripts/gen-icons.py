#!/usr/bin/env python3
"""Generate placeholder solid-color PWA icon PNGs (no external deps).

Story 1.1 only needs a manifest that satisfies installability criteria;
final brand icon art is out of scope here. Produces flat terracotta
squares at the sizes referenced by public/manifest.webmanifest.
"""
import os
import struct
import sys
import zlib

ACCENT = (0xC6, 0x71, 0x39)  # DESIGN.md colors.accent


def write_png(path: str, size: int, rgb: tuple[int, int, int]) -> None:
    r, g, b = rgb
    raw = bytearray()
    for _y in range(size):
        raw.append(0)  # filter type 0 (none) per scanline
        for _x in range(size):
            raw += bytes([r, g, b, 255])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data))
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public/icons"
    os.makedirs(out_dir, exist_ok=True)
    for name, size in [
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("icon-512-maskable.png", 512),
    ]:
        write_png(f"{out_dir}/{name}", size, ACCENT)
        print(f"wrote {out_dir}/{name}")
