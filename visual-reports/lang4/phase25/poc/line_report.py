"""Line-level view of the full-page results: each recognised line against the closest
transcription line, with its confidence — are the wrong lines the unconfident ones?"""
import difflib
import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_words import levenshtein  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = 'D:/AssignmentMaker/__tests__/realTruth/reference.manifest.json'


def norm(s):
    s = unicodedata.normalize('NFKC', s).replace('’', "'").replace('—', '-').replace('–', '-')
    return ' '.join(s.split())


def main():
    pages = json.load(open(os.path.join(HERE, 'out/pages.json'), encoding='utf-8'))
    manifest = {s['file']: s['transcription'].split('\n') for s in json.load(open(MANIFEST, encoding='utf-8'))['samples']}
    confident_wrong = 0
    confident = 0
    total = 0
    for name, exp_lines in manifest.items():
        exp = [norm(l) for l in exp_lines]
        print(f'\n=== {name}: {len(pages[name]["lines"])} recognised lines vs {len(exp)} transcription lines')
        for l in pages[name]['lines']:
            got = norm(l['text'])
            best = max(exp, key=lambda e: difflib.SequenceMatcher(None, e, got).ratio())
            ratio = difflib.SequenceMatcher(None, best, got).ratio()
            if ratio < 0.5:
                print(f"  conf {l['conf']:.2f}  NOT IN TRANSCRIPTION: {got!r}")
                continue
            total += 1
            cer = levenshtein(got, best) / max(1, len(best))
            if l['conf'] >= 0.95:
                confident += 1
                confident_wrong += cer > 0
            if cer > 0:
                print(f"  conf {l['conf']:.2f}  CER {cer:5.1%}  got {got!r}\n                        exp {best!r}")
    print(f'\nlines matched to the transcription: {total}; with conf ≥ 0.95: {confident}, of which NOT exact: {confident_wrong}')


if __name__ == '__main__':
    main()
