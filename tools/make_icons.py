# tools/make_icons.py —— 用 Pillow 直接画出 favicon 位图（不依赖 SVG 渲染工具）
# 产物：public/apple-touch-icon.png（180×180，铺满不留圆角，iOS 自己裁）、public/favicon.ico（16 / 32 / 48）
# 用法：uv run --with pillow python tools/make_icons.py
# 图形和 public/favicon.svg 保持一致（2026-10-30 起是「星座 CW」）：深空径向渐变底 + 两组连线 + 九颗星 + 金星。坐标都按 64×64 写。
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
LINES = [[(29, 19.9), (15, 19.9), (8, 32), (15, 44.1), (29, 44.1)], [(35, 20), (40, 44), (46, 31), (52, 44), (57, 20)]]
STARS = [(29, 19.9, 3.4), (15, 19.9, 2.8), (8, 32, 3.7), (15, 44.1, 2.8), (29, 44.1, 3.2), (35, 20, 3.2), (40, 44, 2.9), (52, 44, 2.9), (57, 20, 3.5)]
SPARK = [(46, 22), (47.3, 29.7), (55, 31), (47.3, 32.3), (46, 40), (44.7, 32.3), (37, 31), (44.7, 29.7)]


def icon(size, rounded=True, scale=8):
    S = size * scale
    k = S / 64
    # 径向渐变底：中心 (40%, 35%)、半径 80%，#1c2250 → #070916
    bg = Image.new("RGB", (S, S))
    px = bg.load()
    cx, cy, r = 0.40 * S, 0.35 * S, 0.80 * S
    c0, c1 = (0x1c, 0x22, 0x50), (0x07, 0x09, 0x16)
    for y in range(S):
        for x in range(S):
            t = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / r)
            px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(15 * k) if rounded else 0, fill=255)
    img.paste(bg, (0, 0), mask)
    # 连线：#dfe5ff、55% 透明度，单独一层再叠上去
    ln = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ln)
    w = round(2.4 * k)
    for pts in LINES:
        p = [(x * k, y * k) for x, y in pts]
        d.line(p, fill=(0xdf, 0xe5, 0xff, 140), width=w, joint="curve")
        for x, y in p:
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=(0xdf, 0xe5, 0xff, 140))
    img = Image.alpha_composite(img, ln)
    d = ImageDraw.Draw(img)
    for x, y, rr in STARS:
        d.ellipse(((x - rr) * k, (y - rr) * k, (x + rr) * k, (y + rr) * k), fill=(0xf4, 0xf2, 0xed, 255))
    d.polygon([(x * k, y * k) for x, y in SPARK], fill=(0xff, 0xd2, 0x7a, 255))
    d.ellipse(((46 - 4.2) * k, (31 - 4.2) * k, (46 + 4.2) * k, (31 + 4.2) * k), fill=(0xff, 0xc0, 0x4a, 255))
    return img.resize((size, size), Image.LANCZOS)


icon(180, rounded=False).save(PUB / "apple-touch-icon.png", optimize=True)
icon(48).save(PUB / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
for n in ("apple-touch-icon.png", "favicon.ico"):
    print(f"✓ public/{n}  {(PUB / n).stat().st_size} B")
