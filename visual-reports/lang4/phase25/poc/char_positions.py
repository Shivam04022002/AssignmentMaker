"""
Can the recogniser itself place characters on the ink? Its CTC time steps give each
character a horizontal span; compared here with the hand-read letter boundaries of
cursive words (cursive-letter-boundaries.json, 43 cuts), in page pixels.
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


def main():
    cuts = json.load(open(CUTS, encoding='utf-8'))
    page_name = cuts['page']
    truth = json.load(open(TRUTH, encoding='utf-8'))['pages'][page_name]
    img = cv2.imread(os.path.join(REF, page_name))
    ys = [ln['y'] for ln in truth['lines']]
    pitch = float(np.median(np.diff(ys)))
    half = 0.55 * pitch
    rec = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
    print(f'page {page_name}, {len(cuts["words"])} words, {sum(len(w["boundaries"]) for w in cuts["words"])} letter cuts; method: {cuts.get("method", "")[:120]}')
    errs = []
    count_ok = 0
    for w in cuts['words']:
        # the word's truth box: same text on the expected line
        ln = truth['lines'][w['expectedLine']]
        box = next((b for b in ln['words'] if b[0] == w['text']), None)
        if not box:
            print('  no truth box for', w['text'])
            continue
        _, l, r = box
        y0, y1 = int(max(0, round(ln['y'] - half))), int(min(img.shape[0], round(ln['y'] + half)))
        x0, x1 = max(0, l - 4), min(img.shape[1], r + 4)
        res = rec(img[y0:y1, x0:x1])
        got = res['text']
        same_len = len(got) == len(w['text'])
        count_ok += same_len
        # predicted internal boundaries: between consecutive character spans
        chars = res['chars']
        pred = [x0 + (chars[i]['x1'] + chars[i + 1]['x0']) / 2 for i in range(len(chars) - 1)]
        truth_b = w['boundaries']
        if same_len and got == w['text'] and len(pred) == len(truth_b):
            e = [abs(p - t) for p, t in zip(pred, truth_b)]
            errs.extend(e)
            print(f"  {w['text']:14} read {got!r:16} boundary error px: mean {np.mean(e):5.1f} max {max(e):5.1f}")
        else:
            print(f"  {w['text']:14} read {got!r:16} ({'same length' if same_len else 'different length'}; {len(pred)} vs {len(truth_b)} boundaries) — not comparable")
    if errs:
        xh = pitch / 3.2  # rough x-height of this page from the line pitch (for scale only)
        print(f'\ncomparable cuts: {len(errs)} · mean |error| {np.mean(errs):.1f} px · median {np.median(errs):.1f} px · 90th pct {np.percentile(errs, 90):.1f} px · within 3 px: {np.mean(np.array(errs) <= 3):.0%} · (line pitch {pitch:.0f} px; CTC step = width/steps)')
        print(f'words read with the right number of characters: {count_ok}/{len(cuts["words"])}')


if __name__ == '__main__':
    main()
