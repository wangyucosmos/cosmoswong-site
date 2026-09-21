# tools/make_icons.py —— 用 Pillow 直接画出 favicon 位图（不依赖 SVG 渲染工具）
# 产物：public/apple-touch-icon.png（180×180）、public/favicon.ico（32×32）
# 用法：uv run --with pillow python tools/make_icons.py   （或任何装了 Pillow 的 python）
# 图形和 public/favicon.svg 保持一致：圆角方块 + 紫→粉→青对角渐变 + 白色 "CW"。
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
STOPS = [(0.0, (124, 58, 237)), (0.55, (236, 72, 153)), (1.0, (6, 182, 212))]
BOLD = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial Bold.ttf"]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad_color(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def font(size):
    for p in BOLD:
        try:
            f = ImageFont.truetype(p, size)
            try:  # SF / Helvetica Neue 是 collection，挑一个粗体
                f.set_variation_by_name("Bold")
            except Exception:
                pass
            return f
        except OSError:
            continue
    return ImageFont.load_default()


def icon(size, scale=4):
    # 超采样再缩小，让圆角和文字边缘平滑
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGB", (S, S))
    px = grad.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = grad_color((x + y) / (2 * (S - 1)))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 16 // 64, fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    f = font(S * 30 // 64)
    # 与 SVG 同比例：基线在 43/64，居中；用 anchor 让不同字体都对齐
    d.text((S / 2 + S * 0.01, S * 43 / 64), "CW", font=f, fill=(255, 255, 255, 255), anchor="ms")
    return img.resize((size, size), Image.LANCZOS)


icon(180).save(PUB / "apple-touch-icon.png", optimize=True)
icon(32).save(PUB / "favicon.ico", format="ICO", sizes=[(32, 32)])
for n in ("apple-touch-icon.png", "favicon.ico"):
    print(f"✓ public/{n}  {(PUB / n).stat().st_size} B")
