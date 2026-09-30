"""Convert downloaded images to right-sized WebP and build the Open Graph card.

Run after fetch_content.py: python tools/optimize_images.py
Writes next to the source as <name>.webp and updates data/*.json to point at them.
"""
import glob
import json
import os

from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
DATA = os.path.join(ROOT, "data")

RULES = {
    "team": dict(box=(640, 640), crop=True, q=78),
    "blog": dict(box=(1200, 675), crop=True, q=72),
    "podcast": dict(box=(640, 360), crop=True, q=72),
    "clients": dict(box=(360, 160), crop=False, q=90),
    "press": dict(box=(360, 160), crop=False, q=90),
}


def trim(im):
    """Cut the white or transparent margin around a logo."""
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda a: 255 if a > 16 else 0)
    white = rgba.convert("L").point(lambda v: 255 if v < 235 else 0)
    mask = ImageChops.multiply(alpha, white)
    box = mask.getbbox()
    if not box:
        return im
    pad = 6
    box = (max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, im.width), min(box[3] + pad, im.height))
    return im.crop(box)


def to_webp(src, box, crop, q):
    dst = os.path.splitext(src)[0] + ".webp"
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)
    im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
    if not crop:
        im = trim(im)
    if crop:
        im = ImageOps.fit(im, box, Image.LANCZOS, centering=(0.5, 0.35))
    else:
        im.thumbnail(box, Image.LANCZOS)
    im.save(dst, "WEBP", quality=q, method=6)
    return dst


def rel(p):
    return os.path.relpath(p, IMG).replace("\\", "/")


def og_card():
    """1200x630 share image: ink background, drafting grid, white logo."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), (10, 12, 15))
    d = ImageDraw.Draw(card)
    for x in range(0, W, 48):
        d.line([(x, 0), (x, H)], fill=(22, 25, 30))
    for y in range(0, H, 48):
        d.line([(0, y), (W, y)], fill=(22, 25, 30))
    d.rectangle([80, 470, 80 + 180, 474], fill=(255, 91, 46))
    logo = Image.open(os.path.join(IMG, "brand", "logo-white.png")).convert("RGBA")
    logo.thumbnail((760, 200), Image.LANCZOS)
    card.paste(logo, (80, 250), logo)
    card.save(os.path.join(IMG, "brand", "og.jpg"), "JPEG", quality=88)


def main():
    mapping = {}
    for folder, rule in RULES.items():
        for src in glob.glob(os.path.join(IMG, folder, "*")):
            if src.endswith(".webp"):
                continue
            dst = to_webp(src, **rule)
            mapping[rel(src)] = rel(dst)

    # favicons
    fav = Image.open(os.path.join(IMG, "brand", "favicon.png")).convert("RGBA")
    for size in (32, 180, 192, 512):
        f = ImageOps.contain(fav, (size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(f, ((size - f.width) // 2, (size - f.height) // 2), f)
        canvas.save(os.path.join(IMG, "brand", f"icon-{size}.png"))
    logo = Image.open(os.path.join(IMG, "brand", "logo-white.png")).convert("RGBA")
    logo.thumbnail((480, 60), Image.LANCZOS)
    logo.save(os.path.join(IMG, "brand", "logo-white-480.png"), optimize=True)
    og_card()

    for name in ("team", "clients", "press", "posts", "podcasts"):
        path = os.path.join(DATA, f"{name}.json")
        items = json.load(open(path, encoding="utf-8"))
        for it in items:
            for k in ("image", "logo", "thumb"):
                if it.get(k) in mapping:
                    it[k] = mapping[it[k]]
        json.dump(items, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("converted", len(mapping))


if __name__ == "__main__":
    main()
