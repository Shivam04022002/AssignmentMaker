"""Sanity check of the ONNX pipeline on PRINTED text (not evidence about handwriting)."""
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ppocr import Detector, Recognizer, crop_box  # noqa: E402

REF = 'D:/AssignmentMaker/reference'

rec = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
print('dict size', len(rec.chars), 'sample', rec.chars[1:12], '...', rec.chars[-5:])
img = Image.new('RGB', (420, 64), 'white')
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 40)
except Exception:
    font = ImageFont.load_default()
d.text((8, 8), 'Hello World 123', fill='black', font=font)
out = rec(cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR))
print('printed:', repr(out['text']), 'conf %.3f' % out['conf'], 'steps', out['steps'], '%.1f ms' % out['ms'])

dev = Recognizer('devanagari_PP-OCRv5_mobile_rec_onnx')
print('deva dict size', len(dev.chars))
img = Image.new('RGB', (420, 64), 'white')
d = ImageDraw.Draw(img)
try:
    import glob
    cands = glob.glob('C:/Windows/Fonts/Nirmala*.ttf') + glob.glob('C:/Windows/Fonts/mangal*.ttf')
    font = ImageFont.truetype(cands[0], 40)
    d.text((8, 4), 'नमस्ते भारत', fill='black', font=font)
    out = dev(cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR))
    print('printed devanagari:', repr(out['text']), 'conf %.3f' % out['conf'])
except Exception as e:
    print('devanagari font not available:', e)

det = Detector()
page = cv2.imread(os.path.join(REF, 'handwriting_03.png'))
t = time.perf_counter()
boxes, dt = det(page)
print('det boxes', len(boxes), 'model %.0f ms, total %.0f ms' % (dt * 1000, (time.perf_counter() - t) * 1000))
for box, score in boxes[:6]:
    crop = crop_box(page, box)
    r = rec(crop)
    print('  box y=%.0f score %.2f -> %r conf %.2f' % (box[:, 1].mean(), score, r['text'], r['conf']))
