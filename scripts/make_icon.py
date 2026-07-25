"""Generate Anker's app icon, splash and adaptive icon.

The mark is an anchor — the app's name, and the right metaphor for the job:
something that holds you steady while you settle. Drawn geometrically rather
than with a font so it stays crisp at 40px in the App Store search results,
which is where the icon actually has to work.

Palette comes from constants/theme.ts so the icon cannot drift from the app.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

TEAL = (14, 124, 114)        # theme primary
TEAL_DEEP = (9, 90, 83)
CREAM = (251, 250, 248)      # theme background
WHITE = (255, 255, 255)


def anchor(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, colour, stroke: int):
    """A clean anchor: ring, shank, crossbar, curved arms and flukes.

    The arm geometry is computed rather than eyeballed so the flukes attach
    exactly to the arc's endpoints and the shank lands on its lowest point —
    a floating barb or a gap reads as a broken glyph at App Store thumbnail
    size, which is the only size that matters.
    """
    import math

    r = size * 0.11                       # top ring radius
    top = cy - size * 0.46
    half = size * 0.36                    # arm half-width (arc x-radius)

    # Arc geometry: a wide ellipse whose bottom forms the anchor's arms.
    arc_cy = cy + size * 0.20
    rx, ry = half, half * 0.72
    start_deg, end_deg = 22, 158

    def on_arc(deg: float):
        rad = math.radians(deg)
        return cx + rx * math.cos(rad), arc_cy + ry * math.sin(rad)

    # ring
    draw.ellipse([cx - r, top - r, cx + r, top + r], outline=colour, width=stroke)

    # shank, running from just under the ring to the arc's lowest point
    draw.line([cx, top + r, cx, arc_cy + ry], fill=colour, width=stroke)

    # crossbar
    bar = cy - size * 0.20
    draw.line([cx - size * 0.25, bar, cx + size * 0.25, bar], fill=colour, width=stroke)

    # arms
    draw.arc(
        [cx - rx, arc_cy - ry, cx + rx, arc_cy + ry],
        start=start_deg, end=end_deg, fill=colour, width=stroke,
    )

    # flukes, anchored on the exact arc endpoints and angled outward/up
    tip = size * 0.13
    for deg, sx in ((end_deg, -1), (start_deg, 1)):
        ax, ay = on_arc(deg)
        draw.line([ax, ay, ax + sx * tip * 0.75, ay - tip], fill=colour, width=stroke)


def rounded_square(size: int, radius_ratio: float, fill) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=fill)
    return img


def build_icon(size: int = 1024) -> Image.Image:
    # Full-bleed teal: iOS applies its own mask, so no rounding here.
    # Flat teal, no inner disc: at 40px the disc read as a rendering artefact
    # rather than depth, and a bolder single-colour mark survives scaling.
    img = Image.new("RGB", (size, size), TEAL)
    d = ImageDraw.Draw(img)
    anchor(d, size // 2, int(size * 0.5), int(size * 0.66), WHITE, max(2, int(size * 0.05)))
    return img


def build_adaptive(size: int = 1024) -> Image.Image:
    """Android foreground: mark only, generous safe-zone padding."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    anchor(d, size // 2, size // 2, int(size * 0.42), WHITE, max(2, int(size * 0.032)))
    return img


def build_splash(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    anchor(d, size // 2, size // 2, int(size * 0.44), TEAL, max(2, int(size * 0.034)))
    return img


def build_favicon(size: int = 96) -> Image.Image:
    img = rounded_square(size, 0.22, TEAL)
    d = ImageDraw.Draw(img)
    anchor(d, size // 2, size // 2, int(size * 0.60), WHITE, max(2, int(size * 0.055)))
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    build_icon().save(os.path.join(OUT, "icon.png"))
    build_adaptive().save(os.path.join(OUT, "adaptive-icon.png"))
    build_splash().save(os.path.join(OUT, "splash-icon.png"))
    build_favicon().save(os.path.join(OUT, "favicon.png"))
    for name in ("icon.png", "adaptive-icon.png", "splash-icon.png", "favicon.png"):
        p = os.path.join(OUT, name)
        print(f"{name}: {Image.open(p).size} {round(os.path.getsize(p)/1024)}KB")
