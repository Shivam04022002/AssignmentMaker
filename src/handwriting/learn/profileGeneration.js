/**
 * Personal handwriting profile generation (Lang4 Phase 6): a versioned
 * profile from the glyphs Phase 5 extracted, or — when the evidence is not
 * enough — no profile and the reasons why.
 *
 *   group       extracted glyphs by their exact unit key: a Latin character
 *               or a complete Devanagari cluster (matras and conjunct parts
 *               belong to the cluster's own glyph; nothing is assembled from
 *               parts, nothing is borrowed from another unit, profile or font)
 *   order       observations by (sample slot, revision, text position): the
 *               result does not depend on the order samples arrive in
 *   screen      a glyph below GLYPH_MIN confidence, or whose geometry fails
 *               the renderer-format check, is rejected with its reason
 *   variants    observations closer than VARIANT_SAME (mean distance between
 *               their centre-lines, x-heights) are one shape; each shape is
 *               one form — its medoid observation, unaltered, with weight =
 *               its share of the observations (at most MAX_VARIANTS)
 *   conflicts   with ≥ 3 observations, a lone shape further than CONFLICT
 *               from the majority shape is rejected as conflicting (likely
 *               a misread region); two observations that disagree that much
 *               keep both forms but the unit is only 'uncertain'
 *   coverage    'observed' when its best form has confidence ≥ OBSERVED_MIN
 *               and no unresolved conflict; otherwise 'uncertain'; a unit the
 *               prompts require with no usable glyph is 'missing' (no forms)
 *   headline    Devanagari clusters carry anchors where their headline
 *               segment starts and ends (headlineLeft / headlineRight), so a
 *               renderer can join the headlines of neighbouring clusters
 *               (rendererAdapter.headlineJoins); a cluster without a
 *               traceable headline gets none, and says so
 *   params      measured from the glyphs where enough evidence exists,
 *               otherwise an engine default, recorded as such
 *   minimum     REQUIREMENTS per script; any failure → status
 *               'insufficient', profile null, every failed requirement
 *               explained
 *
 * Thresholds are engineering choices checked on synthetic fixtures, not
 * calibrated on real handwriting. Saving goes through profileRepository
 * (immutable versions; renaming touches the index only).
 */
import { buildProfileVersion } from './profileBuilder';
import { isProfileId, PARAM_BOUNDS, validateGlyphForm } from './profileSchema';
import { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT } from './samplePrompts';

/** The maths a "+ Maths" handwriting must write: digits and the core operators and signs. */
export const MATHS_CORE_TEXT = '0 1 2 3 4 5 6 7 8 9 + − × ÷ = ( ) . % < >';
/** Signs that are taught but not required. */
export const MATHS_EXTRA_TEXT = '≤ ≥ √ ² / ,';
const DEVA_DIGITS_TEXT = '० १ २ ३ ४ ५ ६ ७ ८ ९';
const DEVA_NUMBER_WORDS_TEXT = 'एक दो तीन चार पाँच छह सात आठ नौ दस';
import { sampleChain } from './strokeFit';
import { lookupKey, splitUnits, UNIT_KIND } from './textUnits';
import { validateSampleMetadata } from './contracts';

export const PROFILE_THRESHOLDS = {
  GLYPH_MIN: 0.4, // an extracted glyph below this is not used
  OBSERVED_MIN: 0.45, // best form at least this → 'observed' (else 'uncertain')
  VARIANT_SAME: 0.06, // x-heights: closer shapes are one variant
  CONFLICT: 0.3, // x-heights: a lone shape this far from the majority is rejected
  MAX_VARIANTS: 4,
  PAD: 0.06, // side bearing of an extracted form (glyphExtraction EXTRACTION.PAD)
};

/** Minimum evidence per script. Fractions of each required set that must be 'observed'. */
export const REQUIREMENTS = {
  Latn: [
    { id: 'latin-lowercase', set: 'latinLower', minObserved: 0.9, description: 'lowercase a–z' },
    { id: 'latin-uppercase', set: 'latinUpper', minObserved: 0.75, description: 'capitals A–Z' },
  ],
  // Phase 22: a "+ Maths" handwriting (reported under the pseudo-script 'Math').
  Math: [{ id: 'maths-symbols', set: 'mathsCore', minObserved: 0.8, description: 'digits and maths symbols' }],
  Deva: [
    { id: 'devanagari-consonants', set: 'devaConsonants', minObserved: 0.85, description: 'the base consonants' },
    { id: 'devanagari-prompt', set: 'devaPrompt', minObserved: 0.75, description: 'the Hindi alphabet sample (vowels, consonants, matras, conjuncts)' },
  ],
  meanConfidenceMin: 0.45, // mean best-form confidence of a script's observed units
};

/** Engine defaults for proportions the samples could not measure. */
export const ENGINE_DEFAULT_PARAMS = { xHeightPerPitch: 0.31, ascender: 1.72, capHeight: 1.5, descender: 0.65, strokeWidth: 0.15, letterGap: 0.2, glyphWidth: 1, wordGap: 1.9, slant: 0 };
const PARAM_MIN_SAMPLES = { ascender: 3, capHeight: 3, descender: 3, strokeWidth: 5, letterGap: 5, wordGap: 3, slant: 5, xHeightPerPitch: 1 };

const r3 = v => Math.round(v * 1000) / 1000;
const median = list => {
  const s = list.slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = list => (list.length ? list.reduce((a, v) => a + v, 0) / list.length : null);

// --- Required sets -----------------------------------------------------------------------

const keysOf = (text, keep) => [...new Set(splitUnits(text).filter(keep).map(u => u.key))];
/** The unit keys each requirement set covers (from the prescribed prompts). */
export const REQUIRED_SETS = {
  latinLower: keysOf(LATIN_ALPHABET.split('\n')[1], u => u.kind === UNIT_KIND.LETTER),
  latinUpper: keysOf(LATIN_ALPHABET.split('\n')[0], u => u.kind === UNIT_KIND.LETTER),
  latinExtra: keysOf(LATIN_DIGITS_TEXT.split('\n').slice(0, -1).join(' '), u => u.kind === UNIT_KIND.DIGIT || u.kind === UNIT_KIND.PUNCTUATION || u.kind === UNIT_KIND.SYMBOL),
  devaConsonants: keysOf(DEVANAGARI_ALPHABET.split('\n').slice(1, 3).join(' '), u => u.kind === UNIT_KIND.CLUSTER),
  devaPrompt: keysOf(DEVANAGARI_ALPHABET, u => u.kind === UNIT_KIND.CLUSTER),
  // Phase 13: the clusters (and danda) of the suggested everyday Hindi text.
  devaEveryday: keysOf(HINDI_SUGGESTED, u => u.script === 'Deva' && (u.kind === UNIT_KIND.CLUSTER || u.kind === UNIT_KIND.PUNCTUATION)),
  // Phase 22: maths.
  mathsCore: keysOf(MATHS_CORE_TEXT, u => u.kind !== UNIT_KIND.SPACE),
  mathsExtra: keysOf(MATHS_EXTRA_TEXT, u => u.kind !== UNIT_KIND.SPACE),
  devaDigits: keysOf(DEVA_DIGITS_TEXT, u => u.kind !== UNIT_KIND.SPACE),
  devaNumberWords: keysOf(DEVA_NUMBER_WORDS_TEXT, u => u.kind === UNIT_KIND.CLUSTER),
};
const SCRIPT_SETS = { Latn: ['latinLower', 'latinUpper', 'latinExtra'], Deva: ['devaConsonants', 'devaPrompt', 'devaEveryday'], Math: ['mathsCore', 'mathsExtra'] };
/** The sets reported for one (pseudo-)script of a profile: Hindi maths adds Devanagari digits and number words. */
export function setsFor(script, scripts = []) {
  if (script === 'Math' && scripts.includes('Deva')) return [...SCRIPT_SETS.Math, 'devaDigits', 'devaNumberWords'];
  return SCRIPT_SETS[script] || [];
}

/**
 * Which sets gate a profile (required: a REQUIREMENTS threshold applies)
 * and which are only reported (optional: digits and punctuation, the
 * everyday Hindi clusters of the suggested text).
 */
export const SET_INFO = {
  latinLower: { script: 'Latn', required: true, label: 'English lowercase' },
  latinUpper: { script: 'Latn', required: true, label: 'English capitals' },
  latinExtra: { script: 'Latn', required: false, label: 'Digits and punctuation' },
  devaConsonants: { script: 'Deva', required: true, label: 'Hindi consonants' },
  devaPrompt: { script: 'Deva', required: true, label: 'Hindi alphabet sample' },
  devaEveryday: { script: 'Deva', required: false, label: 'Everyday Hindi clusters (suggested text)' },
  mathsCore: { script: 'Math', required: true, label: 'Digits and maths symbols' },
  mathsExtra: { script: 'Math', required: false, label: 'More maths signs' },
  devaDigits: { script: 'Math', required: false, label: 'Hindi digits' },
  devaNumberWords: { script: 'Math', required: false, label: 'Hindi number words' },
};

/**
 * What a profile can write in each of its scripts — never more than it
 * learned. level: 'all-required' when every character of the required
 * sets is learned (observed or uncertain) — still not "the whole
 * language": Devanagari has far more clusters than any prompt, and the
 * rest show as dashed boxes until learned; 'partial' when the requirements
 * pass but required characters are missing; 'insufficient' when a
 * requirement fails (no profile is made). Returns script →
 * { level, required: { total, learned, missing }, optional: { total,
 * learned, missing }, text }.
 */
export function languageSupport(units, scripts, requirements = []) {
  const learned = k => units[k] && (units[k].coverage === 'observed' || units[k].coverage === 'uncertain') && units[k].forms.length > 0;
  const names = { Latn: 'English', Deva: 'Hindi', Math: 'Maths' };
  const out = {};
  for (const script of scripts) {
    const sets = setsFor(script, scripts);
    const keysIn = req => [...new Set(sets.filter(set => SET_INFO[set].required === req).flatMap(set => REQUIRED_SETS[set]))];
    const tally = keys => {
      const missing = keys.filter(k => !learned(k));
      return { total: keys.length, learned: keys.length - missing.length, missing };
    };
    const requiredKeys = keysIn(true);
    const required = tally(requiredKeys);
    // A character in both kinds of set (का is in the alphabet and the suggested text) counts as required only.
    const optional = tally(keysIn(false).filter(k => !requiredKeys.includes(k)));
    const failed = requirements.some(r => r.script === script && !r.pass);
    const level = failed ? 'insufficient' : required.missing.length ? 'partial' : 'all-required';
    const unit = script === 'Deva' ? 'clusters' : script === 'Math' ? 'digits and symbols' : 'characters';
    const head =
      level === 'insufficient'
        ? `${names[script]}: not enough learned to write it`
        : level === 'partial'
          ? `${names[script]}: usable, but ${required.missing.length} required ${unit} are missing (${required.missing.join(' ')})`
          : `${names[script]}: all ${required.total} required ${unit} learned`;
    const extra = optional.total ? `; optional ${optional.learned} of ${optional.total}${optional.missing.length ? ` (missing ${optional.missing.join(' ')})` : ''}` : '';
    const rest =
      script === 'Deva'
        ? '. Other clusters are written only once learned; until then they show as dashed boxes.'
        : script === 'Math'
        ? '. Symbols not learned show as dashed boxes.'
        : '. Characters not learned show as dashed boxes.';
    out[script] = { level, required, optional, text: head + extra + rest };
  }
  return out;
}

// --- Shape comparison --------------------------------------------------------------------

const pointsOf = form => form.strokes.flatMap(s => sampleChain(s, 0.03));

/** Mean distance between two forms' centre-lines (x-heights; symmetric). */
export function shapeDistance(a, b) {
  const pa = pointsOf(a);
  const pb = pointsOf(b);
  const one = (from, to) => {
    let sum = 0;
    for (const p of from) {
      let best = Infinity;
      for (const q of to) {
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
        if (d < best) best = d;
      }
      sum += Math.sqrt(best);
    }
    return sum / from.length;
  };
  return r3((one(pa, pb) + one(pb, pa)) / 2);
}

// --- Devanagari headline anchors ----------------------------------------------------------

/**
 * Where a cluster's headline runs: the height (0.7–1.35 x-height) at which
 * traced points form the longest unbroken horizontal run (no gap over 0.1
 * x-height — a bowl's two sides are not a run), and that run's ends.
 * Returns { headlineLeft, headlineRight } or null when no run spans 3/4 of
 * the glyph's ink width (a bowl's flat top does not; a broken headline —
 * थ ध भ in some hands — gets no anchors and is reported as unjoinable).
 */
export function headlineAnchors(form) {
  const pts = pointsOf(form);
  if (!pts.length) return null;
  const xs = pts.map(p => p[0]);
  const inkW = Math.max(...xs) - Math.min(...xs);
  let best = null;
  for (let k = 70; k <= 135; k++) {
    const y = k / 100;
    const xsIn = pts.filter(p => Math.abs(p[1] - y) <= 0.05).map(p => p[0]).sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= xsIn.length; i++) {
      if (i === xsIn.length || xsIn[i] - xsIn[i - 1] > 0.1) {
        const lo = xsIn[start];
        const hi = xsIn[i - 1];
        if (i - start >= 3 && (!best || hi - lo > best.hi - best.lo + 1e-9)) best = { y, lo, hi };
        start = i;
      }
    }
  }
  if (!best || best.hi - best.lo < 0.75 * inkW) return null;
  const y = r3(median(pts.filter(p => Math.abs(p[1] - best.y) <= 0.05).map(p => p[1])));
  return { headlineLeft: [r3(best.lo), y], headlineRight: [r3(best.hi), y] };
}

// --- Parameters ---------------------------------------------------------------------------

function yExtent(form) {
  const ys = form.strokes.flatMap(s => s.filter((_, i) => i % 2 === 1));
  return [Math.min(...ys), Math.max(...ys)];
}

/** Proportions from the used observations (records) and sample rules. */
function measureParams(used, ordered, samples) {
  const values = {};
  const tops = keys => used.filter(r => keys.includes(r.key)).map(r => yExtent(r.form)[1]);
  values.ascender = { list: tops(['b', 'd', 'h', 'k', 'l']), method: 'median top of b d h k l (x-heights above the baseline)', unit: 'x-height' };
  values.capHeight = { list: tops(REQUIRED_SETS.latinUpper), method: 'median top of the capitals', unit: 'x-height' };
  values.descender = { list: used.filter(r => ['g', 'j', 'p', 'q', 'y'].includes(r.key)).map(r => -yExtent(r.form)[0]), method: 'median depth of g j p q y below the baseline', unit: 'x-height' };
  values.strokeWidth = { list: used.map(r => r.diagnostics.strokeWidth), method: 'median pen width measured on the page (Phase 5), in x-heights', unit: 'x-height' };
  // Slant: near-vertical traced strokes of Latin letters (stems).
  const slants = [];
  for (const r of used.filter(x => x.script === 'Latn')) {
    for (const s of r.form.strokes) {
      const n = s.length;
      const dx = s[n - 2] - s[0];
      const dy = s[n - 1] - s[1];
      if (Math.hypot(dx, dy) < 0.6 || Math.abs(dy) < 3 * Math.abs(dx)) continue;
      const [top, bottom] = dy > 0 ? [[s[n - 2], s[n - 1]], [s[0], s[1]]] : [[s[0], s[1]], [s[n - 2], s[n - 1]]];
      slants.push(-(Math.atan2(top[0] - bottom[0], top[1] - bottom[1]) * 180) / Math.PI);
    }
  }
  values.slant = { list: slants, method: 'median lean of near-vertical stems (degrees; negative leans forward)', unit: 'deg' };
  // Gaps between neighbouring glyphs on the page. Forms are centre-lines:
  // the gap between two forms' bodies = ink gap + one stroke width (half on
  // each side) − both side bearings (PAD).
  const letterGaps = [];
  const wordGaps = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1];
    const b = ordered[i];
    if (a.status !== 'extracted' || b.status !== 'extracted' || a.slot !== b.slot || a.revision !== b.revision || a.observation.line !== b.observation.line) continue;
    const ink = (b.observation.bbox[0] - (a.observation.bbox[0] + a.observation.bbox[2])) / a.transform.glyph.unitPx;
    const gap = ink + (a.diagnostics.strokeWidth + b.diagnostics.strokeWidth) / 2;
    if (b.word === a.word) letterGaps.push(gap - 2 * PROFILE_THRESHOLDS.PAD);
    else if (b.word === a.word + 1) wordGaps.push(gap - 2 * PROFILE_THRESHOLDS.PAD);
  }
  values.letterGap = { list: letterGaps, method: 'median gap between neighbouring letters on the page (ink gap + stroke width − side bearings, x-heights)', unit: 'x-height' };
  values.wordGap = { list: wordGaps, method: 'median gap between neighbouring words on the page (ink gap + stroke width − side bearings, x-heights)', unit: 'x-height' };
  // x-height per rule pitch: only from ruled samples.
  const pitch = [];
  for (const s of samples) {
    const spacing = s.rules && s.rules.spacing;
    if (!spacing) continue;
    const unitPx = median(used.filter(r => r.slot === s.slot).map(r => r.transform.glyph.unitPx));
    const sw = median(used.filter(r => r.slot === s.slot).map(r => r.diagnostics.strokeWidth));
    if (unitPx) pitch.push((unitPx * (1 + (sw || 0))) / spacing);
  }
  values.xHeightPerPitch = { list: pitch, method: 'ink x-height ÷ rule spacing on ruled samples', unit: 'ratio' };
  return values;
}

// --- Generation ---------------------------------------------------------------------------

function observationOf(r) {
  return { sample: r.slot, bbox: r.observation.bbox.slice() };
}

/**
 * @param input {
 *   id, version?, name, now, previous? (last version: id, version + 1 and
 *   creation time come from it), scripts? (default: scripts with glyphs),
 *   samples: [{ metadata (contracts sample metadata), extraction (Phase 5
 *   result), revision?, quality? ({ score }), rules? ({ spacing }) }],
 *   synthetic? (test fixtures only) }
 * Returns { status: 'created' | 'insufficient' | 'invalid', profile, report, errors? }
 */
export function generatePersonalProfile(input) {
  const T = PROFILE_THRESHOLDS;
  const samples = (input.samples || []).slice().sort((a, b) => a.metadata.slot - b.metadata.slot);
  const report = { status: null, requirements: [], scripts: {}, units: [], rejected: [], samples: [], params: {}, warnings: [], thresholds: { ...T, meanConfidenceMin: REQUIREMENTS.meanConfidenceMin } };
  const inputErrors = [];
  samples.forEach((s, i) => inputErrors.push(...validateSampleMetadata(s.metadata, `samples[${i}].metadata`)));
  const id = input.previous ? input.previous.id : input.id;
  if (!isProfileId(id)) inputErrors.push('id: a profile id (profileSchema.generateProfileId)');
  if (inputErrors.length) return { status: 'invalid', profile: null, report: { ...report, status: 'invalid' }, errors: inputErrors };

  // Every extraction record, deterministically ordered.
  const all = [];
  for (const s of samples) {
    const ex = s.extraction;
    if (!ex || !Array.isArray(ex.units)) continue;
    for (const r of ex.units) all.push({ ...r, slot: s.metadata.slot });
  }
  all.sort((a, b) => a.slot - b.slot || a.revision - b.revision || a.source.start - b.source.start);
  const contribution = new Map(samples.map(s => [s.metadata.slot, { slot: s.metadata.slot, considered: 0, extracted: 0, used: 0, rejected: {}, units: new Set() }]));
  const rejectAt = (r, code, reasons) => {
    report.rejected.push({ key: r.key || lookupKey(r.text), text: r.text, slot: r.slot, revision: r.revision, source: r.source, code, reasons });
    const c = contribution.get(r.slot);
    if (c) c.rejected[code] = (c.rejected[code] || 0) + 1;
  };
  for (const r of all) {
    const c = contribution.get(r.slot);
    c.considered++;
    if (r.status === 'extracted') c.extracted++;
    else rejectAt(r, `extraction:${r.code}`, r.reasons);
  }

  // Group usable glyphs by unit key.
  const groups = new Map();
  for (const r of all.filter(x => x.status === 'extracted')) {
    const key = lookupKey(r.key || r.text);
    const geometry = validateGlyphForm(r.form, { synthetic: !!input.synthetic }, 'form');
    if (geometry.length) {
      rejectAt(r, 'invalid-geometry', geometry);
      continue;
    }
    if (!(r.confidence && r.confidence.score >= T.GLYPH_MIN)) {
      rejectAt(r, 'low-confidence', [`glyph confidence ${r.confidence ? r.confidence.score : 'none'} is below ${T.GLYPH_MIN}`]);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...r, key });
  }

  // Variants, conflicts and coverage per unit.
  const units = {};
  const used = [];
  for (const key of [...groups.keys()].sort()) {
    const obs = groups.get(key);
    const clusters = [];
    for (const r of obs) {
      const home = clusters.find(c => shapeDistance(c.members[0].form, r.form) <= T.VARIANT_SAME);
      if (home) home.members.push(r);
      else clusters.push({ members: [r] });
    }
    for (const c of clusters) {
      // Medoid: the member closest to all others (ties: the earlier one).
      let best = 0;
      let bestSum = Infinity;
      c.members.forEach((m, i) => {
        const sum = c.members.reduce((s, o) => s + (o === m ? 0 : shapeDistance(m.form, o.form)), 0);
        if (sum < bestSum - 1e-12) {
          bestSum = sum;
          best = i;
        }
      });
      c.medoid = c.members[best];
    }
    clusters.sort((a, b) => b.members.length - a.members.length || obs.indexOf(a.members[0]) - obs.indexOf(b.members[0]));
    const notes = [];
    let conflict = false;
    if (obs.length >= 3 && clusters[0].members.length >= 2) {
      for (const c of clusters.slice(1)) {
        const d = shapeDistance(c.medoid.form, clusters[0].medoid.form);
        if (c.members.length === 1 && d > T.CONFLICT) {
          rejectAt(c.medoid, 'conflicting-geometry', [`its shape is ${d} x-height from the ${clusters[0].members.length} matching observations of “${key}” (more than ${T.CONFLICT}): probably not this character`]);
          c.rejected = true;
        }
      }
    } else if (obs.length === 2 && clusters.length === 2) {
      const d = shapeDistance(clusters[0].medoid.form, clusters[1].medoid.form);
      if (d > T.CONFLICT) {
        conflict = true;
        notes.push(`its two observations disagree (${d} x-height apart) and there is no third to decide; both kept, unit only uncertain`);
      }
    }
    let kept = clusters.filter(c => !c.rejected);
    if (kept.length > T.MAX_VARIANTS) {
      for (const c of kept.slice(T.MAX_VARIANTS)) for (const m of c.members) rejectAt(m, 'variant-limit', [`more than ${T.MAX_VARIANTS} distinct shapes of “${key}”; the rarest are left out`]);
      kept = kept.slice(0, T.MAX_VARIANTS);
    }
    if (!kept.length) continue;
    const total = kept.reduce((s, c) => s + c.members.length, 0);
    const forms = kept.map(c => ({
      w: c.medoid.form.w,
      weight: r3(c.members.length / total),
      strokes: c.medoid.form.strokes.map(s => s.slice()),
      method: 'skeleton-trace',
      confidence: { ...c.medoid.confidence, inputs: { ...c.medoid.confidence.inputs, observations: c.members.length } },
      observations: c.members.map(observationOf),
    }));
    const members = kept.flatMap(c => c.members);
    members.forEach(m => {
      used.push(m);
      const c = contribution.get(m.slot);
      c.used++;
      c.units.add(key);
    });
    const bestScore = Math.max(...forms.map(f => f.confidence.score));
    const script = members[0].script;
    const unit = {
      text: key,
      script,
      kind: members[0].kind,
      coverage: !conflict && bestScore >= T.OBSERVED_MIN ? 'observed' : 'uncertain',
      forms,
      confidence: {
        identification: { score: r3(mean(members.map(m => m.observation.alignment))), basis: 'mean Phase 4 alignment score of the observations used', inputs: { observations: members.length } },
        segmentation: { score: r3(mean(members.map(m => m.observation.boundary))), basis: 'mean Phase 4 boundary score of the observations used' },
        geometryExtraction: { score: r3(mean(members.map(m => m.confidence.inputs.fidelity))), basis: 'mean trace fidelity (Phase 5)' },
        variantDiversity: { score: r3(Math.min(1, members.length / 3)), basis: 'observations used ÷ 3 (capped at 1)', inputs: { observations: members.length, variants: forms.length } },
        overall: { score: r3(bestScore), basis: 'confidence of the best form (Phase 4 scores × trace fidelity)' },
      },
    };
    if (bestScore < T.OBSERVED_MIN) notes.push(`best glyph confidence ${r3(bestScore)} is below ${T.OBSERVED_MIN}`);
    if (script === 'Deva') {
      const anchors = headlineAnchors(forms[0]);
      if (anchors) unit.anchors = anchors;
      else notes.push('no headline segment could be traced; it cannot be joined to its neighbours');
    }
    units[key] = unit;
    report.units.push({ key, script, coverage: unit.coverage, observations: members.length, variants: forms.length, confidence: r3(bestScore), notes });
  }

  // Scripts: requested, or every script with glyphs.
  const present = [...new Set(Object.values(units).map(u => u.script).filter(s => s === 'Latn' || s === 'Deva'))];
  const scripts = (input.scripts && input.scripts.length ? input.scripts : present).filter(s => s === 'Latn' || s === 'Deva');
  if (!scripts.length) report.requirements.push({ id: 'any-script', script: null, description: 'glyphs of at least one supported script (Latin or Devanagari)', required: 1, actual: 0, pass: false, reason: 'no usable glyph was extracted from the samples' });

  // Coverage per required set; required units without glyphs are 'missing'.
  for (const script of scripts) {
    report.scripts[script] = {};
    for (const set of SCRIPT_SETS[script]) {
      const keys = REQUIRED_SETS[set];
      const state = k => (units[k] ? units[k].coverage : 'missing');
      const missing = keys.filter(k => state(k) === 'missing');
      report.scripts[script][set] = {
        total: keys.length,
        observed: keys.filter(k => state(k) === 'observed').length,
        uncertain: keys.filter(k => state(k) === 'uncertain').length,
        missing: missing.length,
        missingKeys: missing,
      };
      for (const k of missing) {
        const [u] = splitUnits(k);
        if (!units[k] && u) units[k] = { text: k, script: u.script, kind: u.kind, coverage: 'missing', forms: [] };
      }
    }
    for (const req of REQUIREMENTS[script]) {
      const s = report.scripts[script][req.set];
      const share = s.total ? s.observed / s.total : 0;
      const pass = share >= req.minObserved;
      report.requirements.push({
        id: req.id,
        script,
        description: req.description,
        required: req.minObserved,
        actual: r3(share),
        pass,
        ...(pass ? null : { reason: `${s.observed} of ${s.total} ${req.description} observed (${Math.round(share * 100)} %); at least ${Math.round(req.minObserved * 100)} % are needed. Missing: ${s.missingKeys.join(' ') || '—'}${s.uncertain ? `; uncertain: ${s.uncertain}` : ''}` }),
      });
    }
    const scores = Object.values(units).filter(u => u.script === script && u.coverage === 'observed').map(u => u.confidence.overall.score);
    const m = mean(scores);
    const pass = m !== null && m >= REQUIREMENTS.meanConfidenceMin;
    report.requirements.push({ id: `${script === 'Latn' ? 'latin' : 'devanagari'}-confidence`, script, description: 'mean confidence of the observed glyphs', required: REQUIREMENTS.meanConfidenceMin, actual: m === null ? 0 : r3(m), pass, ...(pass ? null : { reason: m === null ? 'no observed glyph' : `mean glyph confidence ${r3(m)} is below ${REQUIREMENTS.meanConfidenceMin}` }) });
  }

  // Phase 22: a "+ Maths" handwriting must also write digits and maths symbols.
  const reportScripts = input.maths ? [...scripts, 'Math'] : scripts;
  if (input.maths) {
    report.scripts.Math = {};
    for (const set of setsFor('Math', scripts)) {
      const keys = REQUIRED_SETS[set];
      const state = k => (units[k] ? units[k].coverage : 'missing');
      const missing = keys.filter(k => state(k) === 'missing');
      report.scripts.Math[set] = { total: keys.length, observed: keys.filter(k => state(k) === 'observed').length, uncertain: keys.filter(k => state(k) === 'uncertain').length, missing: missing.length, missingKeys: missing };
      for (const k of missing) {
        const [u] = splitUnits(k);
        if (!units[k] && u && (u.script !== 'Deva' || scripts.includes('Deva'))) units[k] = { text: k, script: u.script, kind: u.kind, coverage: 'missing', forms: [] };
      }
    }
    for (const req of REQUIREMENTS.Math) {
      const s = report.scripts.Math[req.set];
      const share = s.total ? s.observed / s.total : 0;
      const pass = share >= req.minObserved;
      report.requirements.push({
        id: req.id,
        script: 'Math',
        description: req.description,
        required: req.minObserved,
        actual: r3(share),
        pass,
        ...(pass ? null : { reason: `${s.observed} of ${s.total} ${req.description} observed (${Math.round(share * 100)} %); at least ${Math.round(req.minObserved * 100)} % are needed. Missing: ${s.missingKeys.join(' ') || '—'}${s.uncertain ? `; uncertain: ${s.uncertain}` : ''}` }),
      });
    }
  }

  // Units outside the profile's scripts are not part of it.
  for (const [k, u] of Object.entries(units)) {
    if ((u.script === 'Latn' || u.script === 'Deva') && !scripts.includes(u.script)) {
      delete units[k];
      report.warnings.push(`“${k}” (${u.script}) left out: ${u.script} is not one of this profile's scripts`);
    }
  }

  // Parameters.
  const ordered = all;
  const measured = measureParams(used, ordered, samples);
  const params = {};
  const paramSources = {};
  const metrics = {};
  for (const [name, def] of Object.entries(ENGINE_DEFAULT_PARAMS)) {
    const m = measured[name];
    const value = m && m.list.length >= (PARAM_MIN_SAMPLES[name] || Infinity) ? median(m.list) : null;
    const bounds = PARAM_BOUNDS[name];
    if (value !== null && value >= bounds[0] && value <= bounds[1]) {
      params[name] = r3(value);
      paramSources[name] = 'measured';
      metrics[name] = { value: r3(value), unit: m.unit, samples: m.list.length, method: m.method };
    } else {
      params[name] = def;
      paramSources[name] = 'engine-default';
      if (value !== null) report.warnings.push(`${name} measured ${r3(value)} is outside [${bounds.join(', ')}]; the engine default ${def} is used`);
    }
    report.params[name] = { value: params[name], source: paramSources[name], samples: m ? m.list.length : 0 };
  }

  report.samples = [...contribution.values()].map(c => ({ ...c, units: [...c.units].sort() }));
  report.support = languageSupport(units, reportScripts, report.requirements);
  report.setInfo = Object.fromEntries(Object.entries(SET_INFO).filter(([, v]) => reportScripts.includes(v.script)));
  const failed = report.requirements.filter(r => !r.pass);
  if (failed.length) {
    report.status = 'insufficient';
    return { status: 'insufficient', profile: null, report };
  }

  // Profile-level confidence (measured dimensions only; others stay null).
  const learned = Object.values(units).filter(u => u.forms.length);
  const qualities = samples.filter(s => s.quality && Number.isFinite(s.quality.score)).map(s => s.quality.score);
  const dim = (list, basis) => (list.length ? { score: r3(mean(list)), basis } : null);
  const confidence = {
    imageQuality: dim(qualities, 'mean Phase 3 quality score of the samples'),
    regionDetection: null,
    segmentation: dim(used.map(m => m.observation.boundary), 'mean Phase 4 boundary score of the glyphs used'),
    identification: dim(used.map(m => m.observation.alignment), 'mean Phase 4 alignment score of the glyphs used'),
    geometryExtraction: dim(used.map(m => m.confidence.inputs.fidelity), 'mean trace fidelity of the glyphs used'),
    reconstruction: null,
    variantDiversity: dim(learned.map(u => u.confidence.variantDiversity.score), 'mean per-unit observation support (observations ÷ 3, capped)'),
    composition: null,
    overall: dim(learned.map(u => u.confidence.overall.score), 'mean best-form confidence of the learned units'),
  };
  const limitations = [
    'Letterforms are centre-lines traced from the final ink: pen order, direction and pressure are reconstructed by convention, not recovered.',
    'Characters missing from the samples are not drawn by this profile; nothing is substituted from another handwriting or a font.',
    'Devanagari clusters are learned whole; a cluster not written in the samples is missing even if its parts were written.',
    'Thresholds are engineering choices, not calibrated on real handwriting.',
  ];
  if (input.synthetic) limitations.unshift('SYNTHETIC test profile built from generated fixtures, not from anyone\'s handwriting.');
  const built = buildProfileVersion({
    id,
    version: input.previous ? input.previous.version + 1 : input.version || 1,
    name: input.name,
    now: input.now,
    profileCreatedAt: input.previous ? input.previous.profileCreatedAt : input.now,
    scripts,
    sources: samples.map(s => s.metadata),
    metrics,
    params,
    paramSources,
    units,
    confidence,
    diagnostics: { warnings: report.warnings.slice(), errors: [] },
    limitations,
    ...(input.synthetic ? { synthetic: true } : null),
    ...(input.handwritingType ? { handwritingType: input.handwritingType } : null),
    // What it was built from, for the profile's details (counts only).
    evidence: {
      samples: report.samples.map(c => ({ slot: c.slot, considered: c.considered, extracted: c.extracted, used: c.used, rejected: { ...c.rejected } })),
      requirements: report.requirements.map(r => ({ id: r.id, description: r.description, required: r.required, actual: r.actual, pass: r.pass })),
    },
  });
  if (!built.ok) {
    report.status = 'invalid';
    return { status: 'invalid', profile: null, report, errors: built.errors };
  }
  report.status = 'created';
  return { status: 'created', profile: built.profile, report };
}

