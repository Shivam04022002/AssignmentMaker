"""
OCR over every sample of a dataset manifest (PP-OCRv5 mobile via ONNX Runtime,
the Phase 25 PoC code in ../../phase25/poc): full page (detector + recogniser)
against the typed transcription, and — where a word-box truth file exists —
recognition of the truth word crops. Writes out/<run>/ocr.json (text and
metrics, no pixels). The engine runner can take that file (--ocr) to learn from
the recognised text instead of the typed one.

  python -X utf8 run_ocr.py [--manifest m.json] [--dir images/] [--out out/run1]
"""
import argparse
import csv
import json
import os
import sys
import time
import unicodedata
from collections import Counter

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'phase25', 'poc'))
from ppocr import Detector, Recognizer, crop_box  # noqa: E402


def norm(s):
    s = unicodedata.normalize('NFKC', s).replace('’', "'").replace('—', '-').replace('–', '-')
    return ' '.join(s.split())


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


def tighten(crop, margin=3):
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    rows = np.where(bw.sum(axis=1) > 0)[0]
    if len(rows) < 4:
        return crop
    return crop[max(0, rows[0] - margin):min(crop.shape[0], rows[-1] + margin + 1)]


def load_manifest(path):
    m = json.load(open(path, encoding='utf-8'))
    d = os.path.dirname(path)
    for s in m['samples']:
        if 'transcription' not in s and 'transcriptionFile' in s:
            p = os.path.join(d, s['transcriptionFile'])
            if os.path.exists(p):
                s['transcription'] = open(p, encoding='utf-8').read().replace('\r\n', '\n').rstrip('\n')
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', default=os.path.join(ROOT, '__tests__', 'realTruth', 'reference.manifest.json'))
    ap.add_argument('--dir', default=None)
    ap.add_argument('--truth-dir', default=None)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    images = a.dir or (os.path.join(ROOT, 'reference') if 'realTruth' in a.manifest else os.path.dirname(a.manifest))
    truth_dir = a.truth_dir or os.path.dirname(a.manifest)
    out = a.out or os.path.join(HERE, 'out', f"{os.path.splitext(os.path.basename(a.manifest))[0]}-{time.strftime('%Y-%m-%d')}")
    os.makedirs(out, exist_ok=True)
    m = load_manifest(a.manifest)
    det = Detector()
    recs = {}

    def rec_for(scripts):
        name = 'devanagari_PP-OCRv5_mobile_rec_onnx' if 'Deva' in scripts else 'en_PP-OCRv5_mobile_rec_onnx'
        if name not in recs:
            recs[name] = Recognizer(name)
        return name, recs[name]

    report = {'manifest': os.path.basename(a.manifest), 'ran': time.strftime('%Y-%m-%dT%H:%M:%S'), 'samples': {}}
    word_rows = []
    for s in m['samples']:
        f = os.path.join(images, s['file'])
        if not os.path.exists(f):
            report['samples'][s['id']] = {'skipped': 'image not found'}
            print(s['id'], 'image not found')
            continue
        img = cv2.imread(f)
        model, rec = rec_for(s.get('scripts', ['Latn']))
        t0 = time.perf_counter()
        boxes, det_s = det(img)
        lines = []
        for box, score in boxes:
            r = rec(crop_box(img, box))
            if r['text'].strip():
                lines.append({'y': float(box[:, 1].mean()), 'x': float(box[:, 0].mean()), 'text': r['text'], 'conf': round(r['conf'], 3)})
        total = time.perf_counter() - t0
        lines.sort(key=lambda l: (round(l['y'] / 12), l['x']))
        text = '\n'.join(l['text'] for l in lines)
        exp = s.get('transcription', '')
        e_tok, g_tok = Counter(norm(exp).split()), Counter(norm(text).split())
        hit = sum(min(n, g_tok[w]) for w, n in e_tok.items())
        entry = {
            'model': model, 'boxes': len(boxes), 'ms': round(total * 1000), 'text': text,
            'lines': [{'text': l['text'], 'conf': l['conf']} for l in lines],
            'page': {'words_expected': sum(e_tok.values()), 'words_verbatim': hit, 'word_recall': round(hit / max(1, sum(e_tok.values())), 3), 'cer': round(levenshtein(norm(text), norm(exp)) / max(1, len(norm(exp))), 3), 'mean_conf': round(float(np.mean([l['conf'] for l in lines])), 3) if lines else 0.0} if exp else None,
        }
        # word crops from the truth boxes, when a truth file exists
        if s.get('truth'):
            tf, _, page = s['truth'].partition('#')
            allt = json.load(open(os.path.join(truth_dir, tf), encoding='utf-8'))
            truth = allt['pages'][page] if page else allt
            ys = [ln['y'] for ln in truth['lines']]
            pitch = float(np.median(np.diff(ys))) if len(ys) > 1 else 40.0
            rows = []
            for li, ln in enumerate(truth['lines']):
                y0, y1 = int(max(0, ln['y'] - 0.55 * pitch)), int(min(img.shape[0], ln['y'] + 0.55 * pitch))
                for wi, (word, l, r_) in enumerate(ln['words']):
                    crop = tighten(img[y0:y1, max(0, int(l) - 4):min(img.shape[1], int(r_) + 4)])
                    rr = rec(crop)
                    got, want = norm(rr['text']), norm(word)
                    rows.append({'sample': s['id'], 'line': li, 'word': wi, 'expected': want, 'got': got, 'exact': int(got == want), 'cer': round(levenshtein(got, want) / max(1, len(want)), 3), 'conf': round(rr['conf'], 4)})
            word_rows.extend(rows)
            n = len(rows)
            entry['words'] = {
                'n': n, 'exact': sum(r['exact'] for r in rows), 'accuracy': round(sum(r['exact'] for r in rows) / max(1, n), 3),
                'cer': round(sum(r['cer'] * len(r['expected']) for r in rows) / max(1, sum(len(r['expected']) for r in rows)), 3),
                'wrong_at_conf_0.95': sum(1 for r in rows if not r['exact'] and r['conf'] >= 0.95),
                'accepted_at_conf_0.95': sum(1 for r in rows if r['conf'] >= 0.95),
            }
        report['samples'][s['id']] = entry
        p = entry['page']
        print(f"{s['id']}: {model.split('_')[0]} · {len(boxes)} boxes · {entry['ms']} ms" + (f" · words {p['words_verbatim']}/{p['words_expected']} ({p['word_recall']:.0%}) · CER {p['cer']:.1%}" if p else '') + (f" · word crops {entry['words']['exact']}/{entry['words']['n']} exact, {entry['words']['wrong_at_conf_0.95']} wrong at conf≥0.95" if 'words' in entry else ''))
    json.dump(report, open(os.path.join(out, 'ocr.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if word_rows:
        with open(os.path.join(out, 'ocr-words.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=list(word_rows[0].keys()))
            w.writeheader()
            w.writerows(word_rows)
    print('written', os.path.join(out, 'ocr.json'))


if __name__ == '__main__':
    main()
