"""
Turns out/<run>/engine.json (+ ocr.json) into REPORT.md: one row per sample, one
block per category, and the acceptance criteria of DATASET_SPEC.md §6 marked
PASS / FAIL / n/a. Criteria are only ever evaluated on real samples that ran;
nothing is inferred for missing ones.

  python -X utf8 report.py out/<run> [--categories categories.json]
"""
import argparse
import json
import os

CRITERIA = {
    # id: (description, applies-to categories or None=all)
    'Q1': ('x-height ≥ 20 px in the analysis raster', None),
    'Q2': ('no error-level quality issue; no blur / small warnings', None),
    'O1': ('OCR page word recall ≥ 95 % (print, Devanagari) / ≥ 85 % (cursive, mixed)', None),
    'O2': ('OCR page CER ≤ 3 %', None),
    'A1': ('every clearly aligned word on its annotated word (truth file): wrong = 0', None),
    'A2': ('lines found within ±10 % of the expected lines (at least ±1)', None),
    'G1': ('glyphs from OCR text: WRONG label = 0', None),
    'G2': ('glyph yield ≥ 40 % of characters (print, Devanagari) — reported only for cursive/mixed', None),
}
RECALL_MIN = {'english-print': 0.95, 'hindi-devanagari': 0.95, 'hindi-matras-conjuncts': 0.95, 'english-cursive': 0.85, 'english-mixed': 0.85}


def mark(v):
    return {True: 'PASS', False: 'FAIL', None: 'n/a'}[v]


def evaluate(sid, e, o, cat):
    if 'typed' not in e:
        return {k: None for k in CRITERIA}, 'not analysed'
    t = e['typed']
    res = {}
    xh = t['segmentation']['xHeight']
    res['Q1'] = None if xh is None else xh >= 20
    issues = t['quality']['issues']
    res['Q2'] = not any(i.endswith(':error') or i.startswith('blurry') or i.startswith('too-small') for i in issues)
    p = o.get('page') if o else None
    res['O1'] = None if not p else p['word_recall'] >= RECALL_MIN.get(cat, 0.95)
    res['O2'] = None if not p else p['cer'] <= 0.03
    ts = t.get('truthScore')
    res['A1'] = None if not ts or 'error' in ts else (ts.get('words', {}).get('wrong', ts.get('wrong', 0)) == 0)
    exp = t['segmentation']['expectedLines']
    res['A2'] = None if not exp else abs(t['segmentation']['lines'] - exp) <= max(1, round(0.1 * exp))
    lab = e.get('ocrText', {}).get('labels') if e.get('ocrText') else None
    res['G1'] = None if not lab else lab['wrong'] == 0
    ex = t.get('extraction')
    yield_ = (ex['extracted'] / ex['considered']) if ex and ex['considered'] else None
    res['G2'] = None if yield_ is None or cat in ('english-cursive', 'english-mixed') else yield_ >= 0.4
    note = f"x-height {xh} px; issues {', '.join(issues) or 'none'}; lines {t['segmentation']['lines']}/{exp}; words aligned {t['alignment']['words']['aligned'] if t['alignment'] else '-'}/{t['alignment']['expectedWords'] if t['alignment'] else '-'}; glyphs {ex['extracted'] if ex else '-'}/{ex['considered'] if ex else '-'}" + (f" ({yield_:.0%})" if yield_ is not None else '') + (f"; OCR words {p['word_recall']:.0%}, CER {p['cer']:.1%}" if p else '; OCR not run') + (f"; OCR-text glyphs {e['ocrText']['extraction']['extracted']}, wrong label {lab['wrong']}" if lab else '')
    return res, note


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run')
    ap.add_argument('--categories', default=None)
    a = ap.parse_args()
    eng = json.load(open(os.path.join(a.run, 'engine.json'), encoding='utf-8'))
    ocr_path = os.path.join(a.run, 'ocr.json')
    ocr = json.load(open(ocr_path, encoding='utf-8'))['samples'] if os.path.exists(ocr_path) else {}
    cats = json.load(open(a.categories, encoding='utf-8')) if a.categories else {}
    by_cat = {}
    for sid, e in eng['samples'].items():
        cat = e.get('category') or cats.get(sid) or 'uncategorised'
        by_cat.setdefault(cat, []).append((sid, e))
    lines = [f"# Dataset evaluation — {eng['manifest']} ({eng['ran'][:10]}, scale {eng.get('scale', 1)})", '']
    if eng.get('manifestErrors'):
        lines += ['**Manifest problems:** ' + '; '.join(eng['manifestErrors']), '']
    lines += ['Criteria (DATASET_SPEC.md §6):', ''] + [f'- **{k}** — {d}' for k, (d, _) in CRITERIA.items()] + ['']
    for cat in sorted(by_cat):
        lines += [f'## {cat} ({len(by_cat[cat])} sample{"s" if len(by_cat[cat]) != 1 else ""})', '', '| sample | ' + ' | '.join(CRITERIA) + ' | notes |', '|---|' + '---|' * len(CRITERIA) + '---|']
        for sid, e in by_cat[cat]:
            res, note = evaluate(sid, e, ocr.get(sid), cat)
            lines.append(f'| {sid} | ' + ' | '.join(mark(res[k]) for k in CRITERIA) + f' | {note} |')
        lines.append('')
    if eng.get('privacyCheck'):
        lines += [f"**Privacy check:** {eng['privacyCheck']}", '']
    out = os.path.join(a.run, 'REPORT.md')
    open(out, 'w', encoding='utf-8').write('\n'.join(lines))
    print('\n'.join(lines))
    print('\nwritten', out)


if __name__ == '__main__':
    main()
