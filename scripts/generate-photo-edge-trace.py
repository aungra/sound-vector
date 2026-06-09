from PIL import Image, ImageOps, ImageFilter, ImageDraw
from pathlib import Path

SOURCE = Path("/Volumes/20251005_12TBskyhawk/20231113_photobackup/名称未設定の書き出し/DSC_7740.jpg")
OUT_DIR = Path("images")
OUT_DIR.mkdir(exist_ok=True)

# Foreground crop measured from DSC_7740.jpg. This keeps the five people and flag
# while removing most of the sky, wall, and unrelated crowd.
CROP_BOX = (330, 1450, 2130, 2950)


def add_person_mask(draw, x, y, w, h):
    draw.ellipse((x + w * 0.32, y, x + w * 0.68, y + h * 0.22), fill=255)
    draw.polygon(
        [
            (x + w * 0.25, y + h * 0.18),
            (x + w * 0.72, y + h * 0.2),
            (x + w * 0.84, y + h * 0.58),
            (x + w * 0.7, y + h * 0.95),
            (x + w * 0.48, y + h),
            (x + w * 0.32, y + h * 0.96),
            (x + w * 0.16, y + h * 0.58),
        ],
        fill=255,
    )
    draw.line((x + w * 0.2, y + h * 0.32, x - w * 0.1, y + h * 0.54), fill=255, width=max(24, int(w * 0.12)))
    draw.line((x + w * 0.72, y + h * 0.32, x + w * 1.02, y + h * 0.55), fill=255, width=max(24, int(w * 0.12)))
    draw.line((x + w * 0.38, y + h * 0.62, x + w * 0.32, y + h * 1.08), fill=255, width=max(24, int(w * 0.12)))
    draw.line((x + w * 0.62, y + h * 0.62, x + w * 0.75, y + h * 1.08), fill=255, width=max(24, int(w * 0.12)))


def build_mask(size):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)

    # Flag body and pole from the actual crop.
    draw.polygon(
        [
            (545, 690),
            (680, 720),
            (895, 815),
            (1140, 950),
            (1390, 1005),
            (1565, 1005),
            (1560, 1135),
            (1390, 1265),
            (1130, 1340),
            (860, 1465),
            (700, 1455),
            (620, 1310),
            (575, 1050),
        ],
        fill=255,
    )
    draw.line((610, 685, 735, 1495), fill=255, width=70)

    # Five foreground people. These are broad masks, not final outlines.
    add_person_mask(draw, 210, 210, 330, 1280)
    add_person_mask(draw, 570, 145, 360, 1330)
    add_person_mask(draw, 930, 85, 420, 1380)
    add_person_mask(draw, 1240, 230, 360, 1280)
    add_person_mask(draw, 1510, 220, 360, 1300)

    # Cups/hands visible in the photo.
    draw.rounded_rectangle((365, 555, 455, 650), radius=16, fill=255)
    draw.rounded_rectangle((1260, 500, 1395, 645), radius=16, fill=255)
    draw.rounded_rectangle((1285, 650, 1390, 785), radius=16, fill=255)
    draw.rounded_rectangle((1710, 610, 1840, 760), radius=16, fill=255)

    return mask.filter(ImageFilter.GaussianBlur(24))


def keep_large_components(binary, min_pixels=42):
    width, height = binary.size
    src = binary.load()
    out = Image.new("L", binary.size, 0)
    dst = out.load()
    seen = bytearray(width * height)

    for start_y in range(height):
        row_offset = start_y * width
        for start_x in range(width):
            pos = row_offset + start_x
            if seen[pos] or src[start_x, start_y] == 0:
                continue

            stack = [(start_x, start_y)]
            seen[pos] = 1
            pixels = []
            while stack:
                x, y = stack.pop()
                pixels.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    npos = ny * width + nx
                    if seen[npos] or src[nx, ny] == 0:
                        continue
                    seen[npos] = 1
                    stack.append((nx, ny))

            if len(pixels) >= min_pixels:
                for x, y in pixels:
                    dst[x, y] = 255

    return out


def make_trace():
    photo = Image.open(SOURCE).convert("RGB")
    crop = photo.crop(CROP_BOX)
    # Work smaller first. Downsampling suppresses film grain while keeping the
    # larger silhouette and flag folds.
    work_size = (900, 750)
    crop_work = crop.resize(work_size, Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(crop_work)
    gray = ImageOps.autocontrast(gray, cutoff=1)
    gray = gray.filter(ImageFilter.MedianFilter(5))
    gray = gray.filter(ImageFilter.GaussianBlur(1.2))

    # Pencil-sketch style extraction keeps photographic shape better than hard
    # edge detection on this low-contrast, grainy film photo.
    inverted = ImageOps.invert(gray)
    blurred = inverted.filter(ImageFilter.GaussianBlur(8))
    base = gray.load()
    blur = blurred.load()
    sketch = Image.new("L", gray.size, 255)
    dst = sketch.load()
    for yy in range(gray.height):
        for xx in range(gray.width):
            b = blur[xx, yy]
            if b >= 252:
                dst[xx, yy] = 255
            else:
                value = min(255, int(base[xx, yy] * 255 / (255 - b)))
                dst[xx, yy] = value

    sketch = ImageOps.autocontrast(sketch, cutoff=2)
    edges = sketch.point(lambda p: 0 if p < 150 else 255)
    edges = ImageOps.invert(edges)
    edges = edges.filter(ImageFilter.MaxFilter(3))
    edges = keep_large_components(edges, min_pixels=38)
    edges = edges.filter(ImageFilter.MaxFilter(3))
    mask = build_mask(crop.size).resize(work_size, Image.Resampling.LANCZOS)
    edges = Image.composite(edges, Image.new("L", work_size, 0), mask)
    edges = edges.point(lambda p: 255 if p > 128 else 0)

    line_art = ImageOps.invert(edges).convert("RGB")

    # Put the crop trace into a square artboard matching the existing previews.
    artboard = Image.new("RGB", (1200, 1200), "white")
    scaled = line_art.resize((1080, 900), Image.Resampling.LANCZOS)
    artboard.paste(scaled, (60, 120))

    out_jpg = OUT_DIR / "people_flag_photo_realistic_trace.jpg"
    out_png = OUT_DIR / "people_flag_photo_realistic_trace.png"
    artboard.save(out_jpg, quality=95)
    artboard.save(out_png)

    # SVG wrapper for app display. This is a raster trace embedded in SVG, because
    # the goal is faithful photo-derived line art rather than OBJ/vector mesh lines.
    import base64

    encoded = base64.b64encode(out_png.read_bytes()).decode("ascii")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title desc">
  <title id="title">Photo-derived realistic contour trace</title>
  <desc id="desc">Raster line trace extracted from DSC_7740.jpg, masked to the people holding the flag.</desc>
  <image href="data:image/png;base64,{encoded}" width="1200" height="1200"/>
</svg>
'''
    for name in ["people_flag_photo_realistic_trace.svg", "people_flag_photo_trace.svg", "people_flag_line_art.svg", "t-01.svg"]:
        (OUT_DIR / name).write_text(svg)

    print(out_jpg)


if __name__ == "__main__":
    make_trace()
