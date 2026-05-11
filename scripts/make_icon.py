"""Generate assets/icon.ico for Maiku AI installer."""
import io
import os
import struct
from PIL import Image, ImageDraw

BG   = (15, 23, 42, 255)    # dark navy
RING = (20, 184, 166, 255)  # teal
LETTER = (20, 184, 166, 255)

def rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: float, fill):
    x0, y0, x1, y1 = [int(v) for v in xy]
    r = max(0, int(radius))
    if r == 0 or x1 - x0 < 2*r or y1 - y0 < 2*r:
        draw.rectangle([x0, y0, x1, y1], fill=fill)
        return
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    draw.ellipse([x0, y0, x0 + 2*r - 1, y0 + 2*r - 1], fill=fill)
    draw.ellipse([x1 - 2*r, y0, x1 - 1, y0 + 2*r - 1], fill=fill)
    draw.ellipse([x0, y1 - 2*r, x0 + 2*r - 1, y1 - 1], fill=fill)
    draw.ellipse([x1 - 2*r, y1 - 2*r, x1 - 1, y1 - 1], fill=fill)

def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad  = max(1, int(size * 0.06))
    r    = max(2, int(size * 0.20))
    ring = max(1, size // 32)

    # Background
    rounded_rect(d, [pad, pad, size - pad - 1, size - pad - 1], r, BG)

    # Teal ring (only for larger sizes)
    if size >= 32:
        rounded_rect(d, [pad, pad, size - pad - 1, size - pad - 1], r, RING)
        inner_pad = pad + ring * 2
        rounded_rect(d, [inner_pad, inner_pad, size - inner_pad - 1, size - inner_pad - 1], max(1, r - ring*2), BG)

    # "M" letter
    s = size
    top  = s * 0.26
    bot  = s * 0.74
    pw   = max(1.0, s * 0.095)   # pillar width
    lx   = s * 0.20              # left pillar x
    rx   = s * 0.685             # right pillar x
    mid  = s * 0.52              # chevron bottom y

    # Left pillar
    d.rectangle([lx, top, lx + pw, bot], fill=LETTER)
    # Right pillar
    d.rectangle([rx, top, rx + pw, bot], fill=LETTER)

    # Chevron V between the tops
    chevron = [
        (lx + pw/2, top),        # top-left
        (s/2,       mid),         # bottom centre
        (rx + pw/2, top),         # top-right
        (rx + pw/2 - pw, top),
        (s/2,       mid - pw * 1.1),
        (lx + pw/2 + pw, top),
    ]
    d.polygon(chevron, fill=LETTER)

    return img

def build_ico(sizes: list[int]) -> bytes:
    """
    Build a multi-resolution ICO file from scratch.
    Stores each size as a PNG frame (valid per ICO spec for sizes >= 16).
    Pillow's ICO writer is unreliable for multi-res output, so we write the
    binary format directly:  6-byte header  +  N×16-byte directory  +  PNG data.
    """
    frames_png: list[bytes] = []
    for s in sizes:
        img = make_icon(s).convert("RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        frames_png.append(buf.getvalue())

    n = len(sizes)
    data_start = 6 + 16 * n        # byte offset of first image blob

    # ICONDIR header (6 bytes)
    header = struct.pack("<HHH", 0, 1, n)

    # ICONDIRENTRY array (16 bytes each)
    directory = b""
    offset = data_start
    for s, png in zip(sizes, frames_png):
        w = 0 if s >= 256 else s   # 0 encodes 256 in ICO spec
        h = 0 if s >= 256 else s
        directory += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), offset)
        offset += len(png)

    return header + directory + b"".join(frames_png)


def main():
    os.makedirs("assets", exist_ok=True)

    sizes = [16, 32, 48, 64, 128, 256]
    ico_bytes = build_ico(sizes)
    with open("assets/icon.ico", "wb") as f:
        f.write(ico_bytes)

    make_icon(256).save("assets/icon.png")

    print(f"Created assets/icon.ico  ({len(sizes)} sizes: {sizes}, {len(ico_bytes):,} bytes)")
    print("Created assets/icon.png  (256px preview)")

if __name__ == "__main__":
    main()
