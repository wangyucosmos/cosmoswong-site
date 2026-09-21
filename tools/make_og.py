# tools/make_og.py —— 生成分享卡片 public/og.png（1200×630）
# 用法：uv run --with pillow python tools/make_og.py   （或任何装了 Pillow 的 python）
# 副标题和首页 data.js 的 me.title 保持一致；改了 me.title 要重跑一次。
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630

# 副标题直接从 data.js 读 me.title，避免两处手维护
data = (ROOT / "public/assets/data.js").read_text("utf8")
m = re.search(r"^\s*title:\s*'([^']*)'", data, re.M)
SUB = m.group(1) if m else "运营十年 · 游戏 / 活动 / 社群 / 内容"

img = Image.new("RGB", (W, H), (14, 10, 26))
blob = Image.new("RGB", (W, H), (14, 10, 26))
d = ImageDraw.Draw(blob)
d.ellipse((-200, -260, 620, 420), fill=(124, 58, 237))
d.ellipse((520, 180, 1320, 860), fill=(6, 182, 212))
d.ellipse((260, 60, 900, 640), fill=(236, 72, 153))
blob = blob.filter(ImageFilter.GaussianBlur(120))
img = Image.blend(img, blob, 0.62)
d = ImageDraw.Draw(img)


def font(paths, size, variation=None):
    for p in paths:
        try:
            f = ImageFont.truetype(p, size)
            if variation:
                try:
                    f.set_variation_by_name(variation)
                except Exception:
                    pass
            return f
        except OSError:
            continue
    return ImageFont.load_default()


BIG = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]
CJK = ["/System/Library/Fonts/PingFang.ttc",
       "/System/Library/PrivateFrameworks/FontServices.framework/Versions/A/Resources/Reserved/PingFangUI.ttc",
       "/System/Library/Fonts/Hiragino Sans GB.ttc"]
d.text((80, 300), "Cosmos Wong", font=font(BIG, 108, "Bold"), fill=(255, 255, 255))
d.text((84, 430), SUB, font=font(CJK, 40), fill=(235, 225, 255))
d.text((W - 80, H - 60), "cosmoswong.com", font=font(BIG, 26), fill=(255, 255, 255), anchor="rs")  # 右下角
out = ROOT / "public/og.png"
img.save(out, optimize=True)
print(f"✓ {out.relative_to(ROOT)}  {out.stat().st_size} B  副标题「{SUB}」")
