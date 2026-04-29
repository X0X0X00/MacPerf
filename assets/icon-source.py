"""Render a 1024x1024 icon for MacPerf.

Style: rounded square with vertical blue gradient + white performance line chart + small bars.
Renders at 4x for nice anti-aliasing, downsamples with LANCZOS.
"""
from PIL import Image, ImageDraw, ImageFilter

SCALE = 4
SIZE = 1024 * SCALE
RADIUS = int(SIZE * 0.225)   # macOS-ish rounded corners (squircle approx)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg(img):
    """Vertical gradient from deep blue (top) to lighter blue (bottom)."""
    top = (32, 78, 207)      # #204ECF
    mid = (53, 110, 240)     # #356EF0
    bot = (96, 156, 252)     # #609CFC
    px = img.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        if t < 0.5:
            c = lerp(top, mid, t * 2)
        else:
            c = lerp(mid, bot, (t - 0.5) * 2)
        for x in range(SIZE):
            px[x, y] = (*c, 255)


def rounded_mask():
    mask = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, SIZE, SIZE), radius=RADIUS, fill=255)
    return mask


def draw_chart(img):
    """Performance line chart with a soft glow."""
    # Coordinates for a stylized "spiky usage" chart.
    # X positions are normalized to padding rectangle.
    pad_x = 0.13
    pad_y_top = 0.22
    pad_y_bot = 0.62
    points_norm = [
        (0.00, 0.85),
        (0.10, 0.70),
        (0.18, 0.78),
        (0.27, 0.40),
        (0.35, 0.55),
        (0.45, 0.18),
        (0.55, 0.45),
        (0.62, 0.30),
        (0.72, 0.62),
        (0.80, 0.35),
        (0.90, 0.55),
        (1.00, 0.25),
    ]
    px_pts = []
    for nx, ny in points_norm:
        x = (pad_x + nx * (1 - 2 * pad_x)) * SIZE
        y = (pad_y_top + ny * (pad_y_bot - pad_y_top)) * SIZE
        px_pts.append((x, y))

    # Filled area under curve (subtle, like a chart fill)
    fill_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill_layer)
    bottom = pad_y_bot * SIZE
    poly = px_pts + [(px_pts[-1][0], bottom), (px_pts[0][0], bottom)]
    fd.polygon(poly, fill=(255, 255, 255, 40))
    img.alpha_composite(fill_layer)

    # Soft glow line (drawn on a separate layer, blurred, composited)
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.line(px_pts, fill=(255, 255, 255, 110), width=int(28 * SCALE), joint="curve")
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18 * SCALE))
    img.alpha_composite(glow)

    # Crisp main line
    line_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line_layer)
    ld.line(px_pts, fill=(255, 255, 255, 255), width=int(14 * SCALE), joint="curve")
    img.alpha_composite(line_layer)

    # Endpoint dots: highlight the peak (lowest y = highest value)
    peak_idx = min(range(len(px_pts)), key=lambda i: px_pts[i][1])
    peak = px_pts[peak_idx]
    r = int(22 * SCALE)
    dot_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot_layer)
    dd.ellipse((peak[0] - r, peak[1] - r, peak[0] + r, peak[1] + r), fill=(255, 255, 255, 255))
    inner = int(10 * SCALE)
    dd.ellipse(
        (peak[0] - inner, peak[1] - inner, peak[0] + inner, peak[1] + inner),
        fill=(53, 110, 240, 255),
    )
    img.alpha_composite(dot_layer)


def draw_bars(img):
    """Small bar chart at the bottom representing per-core / multi-metric activity."""
    bar_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(bar_layer)
    cx = SIZE / 2
    bar_y = int(0.82 * SIZE)
    bar_w = int(0.055 * SIZE)
    bar_gap = int(0.028 * SIZE)
    heights = [0.55, 0.78, 0.42, 0.92, 0.65, 0.30, 0.85]
    total_w = len(heights) * bar_w + (len(heights) - 1) * bar_gap
    start_x = cx - total_w / 2
    for i, h in enumerate(heights):
        x0 = start_x + i * (bar_w + bar_gap)
        x1 = x0 + bar_w
        bh = int(h * (0.13 * SIZE))
        y0 = bar_y - bh
        y1 = bar_y
        radius = bar_w // 2
        d.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=(255, 255, 255, 220))
    img.alpha_composite(bar_layer)


def main():
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gradient_bg(base)
    draw_chart(base)
    draw_bars(base)

    # Apply rounded square mask
    mask = rounded_mask()
    rounded = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded.paste(base, (0, 0), mask)

    # Subtle drop highlight at top edge for that glassy macOS feel
    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.rounded_rectangle(
        (int(SIZE * 0.04), int(SIZE * 0.04), int(SIZE * 0.96), int(SIZE * 0.50)),
        radius=int(RADIUS * 0.85),
        fill=(255, 255, 255, 18),
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=10 * SCALE))
    rounded = Image.alpha_composite(rounded, Image.composite(sheen, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask))

    # Downsample to 1024
    out = rounded.resize((1024, 1024), Image.Resampling.LANCZOS)
    out.save("/tmp/macperf_icon.png", "PNG")
    print("wrote /tmp/macperf_icon.png 1024x1024")


if __name__ == "__main__":
    main()
