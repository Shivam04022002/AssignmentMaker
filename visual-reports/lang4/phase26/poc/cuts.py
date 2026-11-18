"""
At the 43 hand-read letter boundaries of the cursive page: is there ink in the
cut column (letters joined by a stroke) or a gap? And how thick is the ink there
compared with the stroke width? This is the physical reason a cursive letter
cannot be cut out without taking or leaving part of a connecting stroke.
"""
import json
import os

import cv2
import numpy as np

REF = 'D:/AssignmentMaker/reference'
TRUTH = 'D:/AssignmentMaker/__tests__/realTruth/reference-pages.words.json'
CUTS = 'D:/AssignmentMaker/__tests__/realTruth/cursive-letter-boundaries.json'


def main():
    cuts = json.load(open(CUTS, encoding='utf-8'))
    page = cuts['page']
    truth = json.load(open(TRUTH, encoding='utf-8'))['pages'][page]
    g = cv2.imread(os.path.join(REF, page), cv2.IMREAD_GRAYSCALE)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    bw = (bw > 0).astype(np.uint8)
    ys = [ln['y'] for ln in truth['lines']]
    pitch = float(np.median(np.diff(ys)))
    # stroke width: median run length of ink along rows inside the word bands
    runs = []
    rows = []
    for w in cuts['words']:
        ln = truth['lines'][w['expectedLine']]
        box = next(b for b in ln['words'] if b[0] == w['text'])
        y0, y1 = int(ln['y'] - 0.45 * pitch), int(ln['y'] + 0.45 * pitch)
        band = bw[y0:y1, box[1]:box[2] + 1]
        for row in band:
            run = 0
            for v in row:
                if v:
                    run += 1
                elif run:
                    runs.append(run)
                    run = 0
        rows.append((w, ln, y0, y1, box))
    stroke = float(np.median(runs)) if runs else 2.0
    print(f'{page}: {len(cuts["words"])} cursive words, {sum(len(w["boundaries"]) for w in cuts["words"])} letter cuts; stroke width ≈ {stroke:.1f} px, line pitch {pitch:.0f} px')
    joined = gap = thin = 0
    details = []
    for w, ln, y0, y1, box in rows:
        band = bw[y0:y1]
        prof = band.sum(axis=0)
        for bx in w['boundaries']:
            col = int(prof[bx])
            local = int(prof[max(0, bx - 2):bx + 3].min())
            around = int(prof[max(0, bx - 8):bx + 9].max())
            if local == 0:
                gap += 1
                kind = 'gap'
            elif local <= 1.6 * stroke:
                joined += 1
                thin += 1
                kind = 'joined, one stroke'
            else:
                joined += 1
                kind = 'joined, overlapping'
            details.append((w['text'], bx, col, local, around, kind))
    n = joined + gap
    print(f'cuts through a true gap (no ink within ±2 px): {gap} ({gap / n:.0%})')
    print(f'cuts through ink: {joined} ({joined / n:.0%}) — of which through a single connecting stroke (≤ 1.6 × stroke width): {thin}, through overlapping/thicker ink: {joined - thin}')
    print('\nword          cut x  ink@x  min±2  max±8  kind')
    for d in details:
        print(f'{d[0]:13} {d[1]:5d} {d[2]:6d} {d[3]:6d} {d[4]:6d}  {d[5]}')


if __name__ == '__main__':
    main()
