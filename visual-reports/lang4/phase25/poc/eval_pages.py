"""
Full-page PP-OCRv5 mobile (det + rec) on the four REAL reference pages, against the
typed transcriptions in reference.manifest.json (reference1.png has none: timing only).
"""
import json
import os
import sys
import time
import unicodedata

import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ppocr import Detector, Recognizer, crop_box  # noqa: E402
from eval_words import levenshtein  # noqa: E402

REF = 'D:/AssignmentMaker/reference'
MANIFEST = 'D:/AssignmentMaker/__tests__/realTruth/reference.manifest.json'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)


def norm(s):
    s = unicodedata.normalize('NFKC', s).replace('’', "'").replace('—', '-').replace('–', '-')
    return ' '.join(s.split())


def tokens(s):
    return [t for t in norm(s).split(' ') if t]


def bag_recall(expected, got):
    """Words of the transcription found verbatim in the recognised text (multiset)."""
    from collections import Counter
    e, g = Counter(tokens(expected)), Counter(tokens(got))
    hit = sum(min(n, g[w]) for w, n in e.items())
    return hit, sum(e.values()), sum(g.values())


def main():
    det = Detector()
    rec = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
    manifest = {s['file']: s['transcription'] for s in json.load(open(MANIFEST, encoding='utf-8'))['samples']}
    results = {}
    for name in ['handwriting_01.png', 'handwriting_02.png', 'handwriting_03.png', 'reference1.png']:
        img = cv2.imread(os.path.join(REF, name))
        t0 = time.perf_counter()
        boxes, det_s = det(img)
        lines = []
        rec_ms = 0.0
        confs = []
        for box, score in boxes:
            r = rec(crop_box(img, box))
            rec_ms += r['ms']
            if r['text'].strip():
                lines.append({'y': float(box[:, 1].mean()), 'x': float(box[:, 0].mean()), 'text': r['text'], 'conf': round(r['conf'], 3), 'det': round(score, 3)})
                confs.append(r['conf'])
        total = time.perf_counter() - t0
        lines.sort(key=lambda l: (round(l['y'] / 12), l['x']))
        got = '\n'.join(l['text'] for l in lines)
        entry = {'boxes': len(boxes), 'det_ms': round(det_s * 1000), 'rec_ms': round(rec_ms), 'total_ms': round(total * 1000), 'lines': lines, 'mean_conf': round(sum(confs) / len(confs), 3) if confs else 0}
        if name in manifest:
            exp = manifest[name]
            hit, n_exp, n_got = bag_recall(exp, got)
            cer = levenshtein(norm(got), norm(exp)) / max(1, len(norm(exp)))
            entry.update({'words_expected': n_exp, 'words_recognised': n_got, 'words_hit_verbatim': hit, 'word_recall': round(hit / n_exp, 3), 'page_cer': round(cer, 3)})
        results[name] = entry
        print(f"{name}: {len(boxes)} boxes · det {entry['det_ms']} ms · rec {entry['rec_ms']} ms · total {entry['total_ms']} ms · mean conf {entry['mean_conf']}"
              + (f" · words {entry['words_hit_verbatim']}/{entry['words_expected']} verbatim ({entry['word_recall']:.1%}) · page CER {entry['page_cer']:.1%}" if 'page_cer' in entry else ' · (no transcription)'))
    json.dump(results, open(os.path.join(OUT, 'pages.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n--- handwriting_03 (print hand), first 8 recognised lines ---')
    for l in results['handwriting_03.png']['lines'][:8]:
        print(f"  conf {l['conf']:.2f}: {l['text']}")
    print('--- handwriting_02 (cursive), first 8 recognised lines ---')
    for l in results['handwriting_02.png']['lines'][:8]:
        print(f"  conf {l['conf']:.2f}: {l['text']}")


if __name__ == '__main__':
    main()
