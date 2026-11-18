"""Contact sheet of the glyphs the engine extracted from the print page (boxes mapped
back to the original image), each labelled with the letter the engine assigned, for
inspection by eye: does every box hold exactly that letter?"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REF = 'D:/AssignmentMaker/reference'
page = sys.argv[1] if len(sys.argv) > 1 else 'handwriting_03'
data = json.load(open(os.path.join(HERE, 'out/glyphs03.json')))[page]
src = Image.open(os.path.join(REF, page.replace('x2', '') + '.png')).convert('L')
if page.endswith('x2'):
    src = src.resize((src.width * 2, src.height * 2), Image.BICUBIC)
ink = (np.array(src) < 128).astype(np.uint8)
units = data['units']
t = units[0]['transform']['deskew']
angle = math.radians(t['angle']) if t else 0.0
cx, cy = (t['cx'], t['cy']) if t else (0, 0)


def to_source(x, y, sign):
    # the deskewed frame is the analysis frame rotated about (cx, cy); undo it
    a = sign * angle
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def box_in_source(b, sign):
    x, y, w, h = b
    pts = [to_source(px, py, sign) for px, py in [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return int(min(xs)), int(min(ys)), int(math.ceil(max(xs))), int(math.ceil(max(ys)))


def coverage(sign):
    tot = 0
    for u in units:
        x0, y0, x1, y1 = box_in_source(u['bbox'], sign)
        tot += ink[max(0, y0):y1, max(0, x0):x1].sum()
    return tot


sign = 1 if coverage(1) >= coverage(-1) else -1
print(f'{page}: {len(units)} glyphs; rotation sign {sign:+d} (ink inside boxes {coverage(sign)} vs {coverage(-sign)})')
cell = 64
cols = 12
rows = math.ceil(len(units) / cols)
sheet = Image.new('RGB', (cols * cell, rows * (cell + 14)), 'white')
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
except Exception:
    font = ImageFont.load_default()
for i, u in enumerate(units):
    x0, y0, x1, y1 = box_in_source(u['bbox'], sign)
    pad = 3
    crop = src.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y1 + pad))
    scale = min((cell - 4) / max(1, crop.width), (cell - 4) / max(1, crop.height), 4)
    crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))), Image.NEAREST).convert('RGB')
    # the box itself, drawn on the enlarged crop
    d2 = ImageDraw.Draw(crop)
    d2.rectangle([pad * scale, pad * scale, crop.width - pad * scale - 1, crop.height - pad * scale - 1], outline=(220, 40, 40))
    cx0, cy0 = (i % cols) * cell, (i // cols) * (cell + 14)
    sheet.paste(crop, (cx0 + (cell - crop.width) // 2, cy0 + (cell - crop.height) // 2))
    draw.text((cx0 + 4, cy0 + cell), f"{i + 1}:{u['text']}  {u['conf']['score']:.2f}", fill=(0, 0, 0), font=font)
out = os.path.join(HERE, f'out/glyphs-{page}.png')
sheet.save(out)
print('sheet', out, sheet.size)
