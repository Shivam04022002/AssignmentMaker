"""
Word-crop recognition on the REAL reference pages with word-level ground truth
(reference-pages.words.json: handwriting_03 print hand, handwriting_02 cursive).
Crops are the truth boxes (left/right ink extent, line centre ± half the line
pitch), so this measures recognition alone, not detection.
"""
import csv
import json
import os
import sys
import unicodedata

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ppocr import Recognizer  # noqa: E402

REF = 'D:/AssignmentMaker/reference'
TRUTH = 'D:/AssignmentMaker/__tests__/realTruth/reference-pages.words.json'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)


def levenshtein(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def norm(s):
    s = unicodedata.normalize('NFKC', s).replace('’', "'").replace('—', '-').replace('–', '-')
    return s.strip()


def letters_only(s):
    return ''.join(ch for ch in s.lower() if ch.isalnum())


TIGHT = '--tight' in sys.argv


def tighten(crop, margin=3):
    """Trim the crop vertically to the rows that hold ink (the app's own word boxes are tight)."""
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    rows = np.where(bw.sum(axis=1) > 0)[0]
    if len(rows) < 4:
        return crop
    y0, y1 = max(0, rows[0] - margin), min(crop.shape[0], rows[-1] + margin + 1)
    return crop[y0:y1]


def main():
    truth = json.load(open(TRUTH, encoding='utf-8'))['pages']
    rec = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
    rows = []
    for page_name, page in truth.items():
        img = cv2.imread(os.path.join(REF, page_name))
        ys = [ln['y'] for ln in page['lines']]
        gaps = np.diff(ys)
        pitch = float(np.median(gaps)) if len(gaps) else 40.0
        half = 0.55 * pitch
        for li, ln in enumerate(page['lines']):
            y0 = int(max(0, round(ln['y'] - half)))
            y1 = int(min(img.shape[0], round(ln['y'] + half)))
            for wi, (word, l, r) in enumerate(ln['words']):
                x0 = max(0, int(l) - 4)
                x1 = min(img.shape[1], int(r) + 4)
                crop = img[y0:y1, x0:x1]
                if crop.size == 0:
                    continue
                if TIGHT:
                    crop = tighten(crop)
                res = rec(crop)
                got = norm(res['text'])
                exp = norm(word)
                rows.append({
                    'page': page_name, 'line': li, 'word': wi, 'expected': exp, 'got': got,
                    'exact': int(got == exp), 'ci_alnum': int(letters_only(got) == letters_only(exp) and letters_only(exp) != ''),
                    'cer': levenshtein(got, exp) / max(1, len(exp)),
                    'conf': round(res['conf'], 4), 'min_conf': round(res['min_conf'], 4), 'ms': round(res['ms'], 1),
                    'n_chars_expected': len(exp), 'n_chars_got': len(got),
                })
    with open(os.path.join(OUT, 'words-tight.csv' if TIGHT else 'words.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    report(rows)


def report(rows):
    def stats(sub, label):
        n = len(sub)
        if not n:
            return
        exact = sum(r['exact'] for r in sub)
        ci = sum(r['ci_alnum'] for r in sub)
        cer = sum(r['cer'] * r['n_chars_expected'] for r in sub) / max(1, sum(r['n_chars_expected'] for r in sub))
        ms = np.mean([r['ms'] for r in sub])
        print(f'{label}: {n} words · exact {exact} ({exact / n:.1%}) · letters-only case-insensitive {ci} ({ci / n:.1%}) · CER {cer:.1%} · {ms:.1f} ms/word')
    print('=== PP-OCRv5 mobile EN recogniser on real word crops (truth boxes) ===')
    stats(rows, 'ALL')
    for p in sorted(set(r['page'] for r in rows)):
        stats([r for r in rows if r['page'] == p], p)
    print('\n--- confidence as a filter (mean char prob) ---')
    print('thresh  accepted  correct(exact)  WRONG accepted  precision  recall-of-correct')
    total_correct = sum(r['exact'] for r in rows)
    for th in [0.0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.98]:
        acc = [r for r in rows if r['conf'] >= th]
        ok = sum(r['exact'] for r in acc)
        wrong = len(acc) - ok
        print(f'{th:5.2f}   {len(acc):7d}   {ok:12d}   {wrong:13d}   {ok / max(1, len(acc)):8.1%}   {ok / max(1, total_correct):8.1%}')
    print('\n--- confidence as a filter (min char prob) ---')
    for th in [0.5, 0.7, 0.8, 0.9, 0.95]:
        acc = [r for r in rows if r['min_conf'] >= th]
        ok = sum(r['exact'] for r in acc)
        print(f'{th:5.2f}   {len(acc):7d}   {ok:12d}   {len(acc) - ok:13d}   {ok / max(1, len(acc)):8.1%}   {ok / max(1, total_correct):8.1%}')
    print('\n--- examples of confident mistakes (conf ≥ 0.9, wrong) ---')
    for r in sorted([r for r in rows if not r['exact'] and r['conf'] >= 0.9], key=lambda r: -r['conf'])[:15]:
        print(f"  {r['page'][:14]} expected {r['expected']!r:22} got {r['got']!r:22} conf {r['conf']:.3f}")


if __name__ == '__main__':
    main()
