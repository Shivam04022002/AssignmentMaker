"""
Could OCR character spans help the engine choose WHERE to cut a joined cursive
word? On the 43 hand-read letter cuts (page 02):

  1. valley candidates — local minima of the column profile inside connected
     ink, engine-style (≤ 1.6 × stroke width and ≤ half the ink around them);
  2. for each true cut: the nearest valley, and whether a cut is tolerant there
     (how wide the thin connector is);
  3. three ways of placing the k-th boundary and their error against truth:
       width prior   equal letter widths across the word (what the engine falls
                     back to when the text's letter widths are all it has)
       OCR span      midpoint between consecutive CTC character spans
       OCR → valley  the valley nearest the OCR boundary (the proposal)
"""
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ppocr import Recognizer  # noqa: E402

REF = 'D:/AssignmentMaker/reference'
TRUTH = 'D:/AssignmentMaker/__tests__/realTruth/reference-pages.words.json'
CUTS = 'D:/AssignmentMaker/__tests__/realTruth/cursive-letter-boundaries.json'
TOL = 3  # px: the hand-read cuts are ±1.5 px; a cut within 3 px lands on the same connector


def valleys(prof, stroke):
    out = []
    for x in range(2, len(prof) - 2):
        v = prof[x]
        if v == 0 or v > 1.6 * stroke:
            continue
        if v > prof[x - 1] or v > prof[x + 1]:
            continue
        if v == prof[x - 1] and x > 0 and prof[x - 1] <= prof[x - 2]:
            continue  # plateau: keep the first column
        around = max(prof[max(0, x - 8):x].max(initial=0), prof[x + 1:x + 9].max(initial=0))
        if around and v <= 0.5 * around:
            out.append(x)
    return out


def main():
    cuts = json.load(open(CUTS, encoding='utf-8'))
    page = cuts['page']
    truth = json.load(open(TRUTH, encoding='utf-8'))['pages'][page]
    bgr = cv2.imread(os.path.join(REF, page))
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    bw = (bw > 0).astype(np.uint8)
    ys = [ln['y'] for ln in truth['lines']]
    pitch = float(np.median(np.diff(ys)))
    rec = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
    stroke = 3.0  # measured in cuts.py
    err = {'width prior': [], 'OCR span': [], 'OCR → valley': [], 'truth → nearest valley': []}
    tolerant = 0
    n_cuts = 0
    n_valleys = 0
    extra_valleys = 0
    print(f'{page}: valley candidates vs true letter cuts (tolerance ±{TOL} px)')
    for w in cuts['words']:
        ln = truth['lines'][w['expectedLine']]
        box = next(b for b in ln['words'] if b[0] == w['text'])
        _, l, r = box
        y0, y1 = int(ln['y'] - 0.45 * pitch), int(ln['y'] + 0.45 * pitch)
        prof = bw[y0:y1, l:r + 1].sum(axis=0).astype(int)
        vs = [l + x for x in valleys(prof, stroke)]
        tb = w['boundaries']
        n_cuts += len(tb)
        n_valleys += len(vs)
        extra_valleys += sum(1 for v in vs if min(abs(v - t) for t in tb) > TOL)
        # tolerance: width of the thin connector around each true cut
        for t in tb:
            x = t - l
            lo = x
            while lo > 0 and 0 < prof[lo - 1] <= 1.6 * stroke:
                lo -= 1
            hi = x
            while hi < len(prof) - 1 and 0 < prof[hi + 1] <= 1.6 * stroke:
                hi += 1
            if 0 < prof[x] <= 1.6 * stroke and hi - lo + 1 >= 2 * TOL:
                tolerant += 1
        # OCR spans
        crop = bgr[max(0, y0 - 2):y1 + 2, max(0, l - 4):r + 5]
        res = rec(crop)
        chars = res['chars']
        ocr_b = [max(0, l - 4) + (chars[i]['x1'] + chars[i + 1]['x0']) / 2 for i in range(len(chars) - 1)] if len(chars) == len(w['text']) else None
        n = len(w['text'])
        prior_b = [l + (r - l) * (k + 1) / n for k in range(n - 1)]
        for k, t in enumerate(tb):
            err['width prior'].append(abs(prior_b[k] - t))
            err['truth → nearest valley'].append(min(abs(v - t) for v in vs) if vs else 99)
            if ocr_b:
                err['OCR span'].append(abs(ocr_b[k] - t))
                near = min(vs, key=lambda v: abs(v - ocr_b[k])) if vs else ocr_b[k]
                err['OCR → valley'].append(abs(near - t))
        print(f"  {w['text']:12} letters {n:2d} true cuts {len(tb):2d} valleys {len(vs):2d} (not at a true cut: {sum(1 for v in vs if min(abs(v - t) for t in tb) > TOL)}) · OCR read {res['text']!r}")
    print(f'\ntrue cuts {n_cuts}; valley candidates {n_valleys}, of which letter-internal (no true cut within ±{TOL} px): {extra_valleys}')
    print(f'true cuts lying on a thin connector at least {2 * TOL} px wide (a ±{TOL} px error still cuts only the connector): {tolerant}/{n_cuts}')
    print(f'\nboundary placement error vs the hand-read cut (px) — n={len(err["OCR span"])} cuts with an OCR reading of the right length')
    print('method                  mean   median  within ±3 px')
    for k, v in err.items():
        v = np.array(v, dtype=float)
        if len(v):
            print(f'{k:22} {v.mean():6.1f} {np.median(v):7.1f}   {np.mean(v <= TOL):6.0%}')


if __name__ == '__main__':
    main()
