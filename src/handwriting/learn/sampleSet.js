/**
 * The five-sample set behind "Create My Handwriting" — pure state and
 * validation, no UI and no image analysis.
 *
 * Phase 23: the type controls every photo: photo N shows the type's page N
 * (copied by hand, exactly); there is no per-photo page choice and no free
 * writing. A photo keeps its page when photos are reordered.
 *
 * Phase 24: exactly five photos (MIN_PHOTOS = MAX_PHOTOS = 5), and the user
 * may correct a photo's text on the review (setTextOverride / knownTextOf)
 * when what they wrote differs from its page; the correction belongs to
 * the sample record, so it moves with the photo and is dropped with it.
 *
 * Phase 22: the set belongs to ONE handwriting type (handwritingTypes.js):
 * English, Hindi, English + Hindi, or any of them + Maths. The type sets each
 * photo's starting page and the pages a photo may show; every photo chosen
 * contributes to that one handwriting.
 *
 * Each photo position (slot 1–5) holds a page (samplePrompts.PRACTICE_PAGES):
 * the exact text the photo's letters are aligned to. The page moves with
 * the photo.
 *
 * Identity: every chosen image becomes a sample record with its own id. A
 * slot (1–5) only points at a sample id, so moving a sample to another
 * slot carries its typed transcription, chosen scripts and file checks
 * with it, and nothing can end up attached to the wrong image. Replacing
 * or removing an image drops its record entirely: no check or text made
 * for the old image survives.
 *
 * Every action returns { set, release }: `release` lists the temporary
 * image copies the caller must hand to imageInput.releaseImages().
 *
 * Pixel checks (decode → quality → initial segmentation) are recorded per
 * sample in `analysis` (markAnalysis); results are summaries, never pixels.
 * Until a sample has been checked — and on builds that cannot decode
 * images — it carries QUALITY_NOT_ANALYSED, never a made-up value.
 */
import { SAMPLE_MIME_TYPES, validateSampleMetadata } from './contracts';
import { checkedScripts, handwritingType, MAX_PHOTOS, MIN_PHOTOS } from './handwritingTypes';
import { REQUIRED_SETS, SET_INFO, setsFor } from './profileGeneration';
import { PRACTICE_PAGES, practicePage, SAMPLE_SLOTS } from './samplePrompts';
import { splitUnits } from './textUnits';

export const QUALITY_NOT_ANALYSED = Object.freeze({
  status: 'not-analysed',
  message: 'Image quality has not been checked yet: handwriting analysis is not available in this version.',
});

/** File-level limits — generous, so ordinary phone photos always pass. */
export const FILE_LIMITS = {
  maxBytes: 60 * 1024 * 1024, // larger is not an ordinary photo
  minShortSide: 600, // below this, handwriting detail is lost
  smallShortSide: 1000, // usable, but a sharper photo would help
  largeMegapixels: 50, // fine: scaled down for analysis
  maxMegapixels: 250,
  maxAspect: 4, // a long thin strip: probably cropped
};

const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' };
const problem = (code, severity, message, advice) => ({ code, severity, message, advice });

/** The type a set is for when none was chosen explicitly: the Phase 21 plan (English + Hindi). */
export const DEFAULT_TYPE = 'english-hindi';

/** An empty set for a handwriting type: five photo positions, no photos. */
export function createSampleSet(typeId = DEFAULT_TYPE) {
  const type = handwritingType(typeId) || handwritingType(DEFAULT_TYPE);
  return {
    type: type.id,
    slots: SAMPLE_SLOTS.map((s, i) => ({ slot: s.slot, sampleId: null, error: null, page: type.pages[i] })),
    samples: {},
    seq: 0,
  };
}

/** The handwriting type of a set. */
export const typeOf = set => handwritingType(set.type) || handwritingType(DEFAULT_TYPE);

/**
 * Chooses the handwriting type. Every position takes the new type's page;
 * photos already chosen are kept (the caller re-checks those whose page
 * changed, against the new text).
 */
export function setType(set, typeId) {
  const type = handwritingType(typeId);
  if (!type || type.id === set.type) return { set, release: [] };
  return { set: { ...set, type: type.id, slots: set.slots.map((e, i) => ({ ...e, page: type.pages[i] })) }, release: [] };
}

/**
 * File-level checks of a picked image's metadata. Returns
 * { valid, mime, problems: [{ code, severity: 'error'|'warning'|'info',
 * message, advice }] }. Only errors make an image invalid.
 */
export function validateImageFile(image) {
  const problems = [];
  if (!image || typeof image !== 'object' || typeof image.uri !== 'string' || !image.uri.trim()) {
    return {
      valid: false,
      mime: null,
      problems: [problem('missing-reference', 'error', 'The chosen image could not be found.', 'Choose the photo again.')],
    };
  }
  const raw = typeof image.mime === 'string' ? image.mime.toLowerCase() : '';
  const mime = MIME_ALIASES[raw] || raw;
  if (!SAMPLE_MIME_TYPES.includes(mime)) {
    problems.push(problem('unsupported-format', 'error', 'This file type is not supported.', 'Use a JPEG, PNG, HEIC or WebP photo.'));
  }
  const dims = Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0;
  if (!dims) {
    problems.push(problem('unreadable-metadata', 'error', 'The size of this image could not be read.', 'Try another photo, or take the picture again.'));
  }
  if (!Number.isInteger(image.bytes) || image.bytes <= 0) {
    problems.push(problem('unreadable-metadata', 'error', 'This image file appears to be empty.', 'Try another photo.'));
  } else if (image.bytes > FILE_LIMITS.maxBytes) {
    problems.push(problem('file-too-large', 'error', 'This file is much larger than a normal photo.', 'Use an ordinary camera photo (not a RAW or scanned archive file).'));
  }
  if (dims) {
    const short = Math.min(image.width, image.height);
    const long = Math.max(image.width, image.height);
    const mp = (image.width * image.height) / 1e6;
    if (short < FILE_LIMITS.minShortSide) {
      problems.push(problem('too-small', 'error', 'This image is too small to show handwriting clearly.', 'Use the original camera photo rather than a screenshot or a resized copy.'));
    } else if (short < FILE_LIMITS.smallShortSide) {
      problems.push(problem('low-resolution', 'warning', 'This image is quite small.', 'A full-size camera photo will capture your handwriting in more detail.'));
    }
    if (mp > FILE_LIMITS.maxMegapixels) {
      problems.push(problem('too-many-pixels', 'error', 'This image is too large to process.', 'Use a normal camera photo.'));
    } else if (mp > FILE_LIMITS.largeMegapixels) {
      problems.push(problem('large-image', 'info', 'This is a very large photo.', 'That is fine: it will be scaled down for analysis.'));
    }
    if (long / short > FILE_LIMITS.maxAspect) {
      problems.push(problem('unusual-shape', 'warning', 'This image is a long, narrow strip.', 'Make sure the whole page of writing is in the photo.'));
    }
  }
  if (image.orientation !== undefined) {
    if (!Number.isInteger(image.orientation) || image.orientation < 1 || image.orientation > 8) {
      problems.push(problem('orientation-unknown', 'warning', 'The photo’s rotation information could not be read.', 'If the writing looks sideways, rotate the photo before choosing it.'));
    } else if (image.orientation !== 1) {
      problems.push(problem('rotated', 'info', 'The photo is stored rotated.', 'It will be turned upright before analysis.'));
    }
  }
  return { valid: !problems.some(p => p.severity === 'error'), mime: SAMPLE_MIME_TYPES.includes(mime) ? mime : null, problems };
}

const withSlot = (set, slot, patch) => ({
  ...set,
  slots: set.slots.map(s => (s.slot === slot ? { ...s, ...patch } : s)),
});
const sampleIn = (set, slot) => {
  const s = set.slots.find(x => x.slot === slot);
  return s && s.sampleId ? set.samples[s.sampleId] : null;
};
const dropSample = (samples, id) => {
  const next = { ...samples };
  delete next[id];
  return next;
};

/** Puts a newly picked image in a slot (replacing and releasing any previous one). */
export function selectImage(set, slot, image) {
  const old = sampleIn(set, slot);
  const id = `sample-${set.seq + 1}`;
  const page = pageOf(set, slot);
  const record = {
    id,
    revision: set.seq + 1, // image revision: a new number for every image chosen
    image: { ...image },
    file: validateImageFile(image),
    quality: QUALITY_NOT_ANALYSED,
    analysis: { status: 'not-started' }, // pixel checks: see markAnalysis
    scripts: [...page.scripts],
  };
  const samples = { ...(old ? dropSample(set.samples, old.id) : set.samples), [id]: record };
  return {
    set: withSlot({ ...set, samples, seq: set.seq + 1 }, slot, { sampleId: id, error: null }),
    release: old && old.image && old.image.uri ? [old.image.uri] : [],
  };
}

/** Removes a slot's image (and everything derived from it). */
export function removeSample(set, slot) {
  const old = sampleIn(set, slot);
  if (!old) return { set: withSlot(set, slot, { error: null }), release: [] };
  return {
    set: withSlot({ ...set, samples: dropSample(set.samples, old.id) }, slot, { sampleId: null, error: null }),
    release: old.image && old.image.uri ? [old.image.uri] : [],
  };
}

/** Swaps the images of two slots; each keeps its page and its checks. */
export function moveSample(set, from, to) {
  const a = set.slots.find(s => s.slot === from);
  const b = set.slots.find(s => s.slot === to);
  if (!a || !b || from === to) return { set, release: [] };
  // The page is what the photo shows: it moves with the photo.
  const swapped = withSlot(withSlot(set, from, { sampleId: b.sampleId, page: b.page, error: null }), to, { sampleId: a.sampleId, page: a.page, error: null });
  return { set: swapped, release: [] };
}

/**
 * What the photo in a slot shows — always a page of the set's type:
 * { id, title, text (the exact known text), scripts, category }.
 */
export function pageOf(set, slot) {
  const entry = set.slots.find(e => e.slot === slot);
  const fallback = typeOf(set).pages[set.slots.indexOf(entry)];
  const page = practicePage(entry && entry.page) || practicePage(fallback);
  return { id: page.id, title: page.title, text: page.text, scripts: [...page.scripts], category: page.category };
}

/**
 * The exact text a photo's letters are matched to: its page, unless the
 * user corrected it on the review step (what they actually wrote differs
 * from the page — a skipped line, a changed word). Never recognised from
 * the photo: see textRecognition.js.
 */
export function knownTextOf(set, slot) {
  const s = sampleIn(set, slot);
  return s && typeof s.textOverride === 'string' ? s.textOverride : pageOf(set, slot).text;
}

/**
 * Why a corrected text cannot be used for a photo, or null when it can: it
 * must not be empty and may only use the set's type's scripts (digits and
 * punctuation are common to all).
 */
export function textOverrideProblem(set, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Type the text as it appears on the photo.';
  const allowed = new Set(typeOf(set).scripts);
  const foreign = splitUnits(text).filter(u => (u.script === 'Latn' || u.script === 'Deva') && !allowed.has(u.script));
  if (foreign.length) return `This handwriting type does not write ${foreign[0].script === 'Deva' ? 'Hindi' : 'English'}: “${foreign[0].text}” cannot be used.`;
  return null;
}

/**
 * Records what the user actually wrote on a photo when it differs from its
 * page (null, or the page's own text, removes the correction). The text
 * belongs to the sample record, so it moves with the photo and is dropped
 * with it. The caller re-checks the photo against the new text.
 */
export function setTextOverride(set, slot, text) {
  const s = sampleIn(set, slot);
  if (!s) return { set, release: [] };
  const clean = typeof text === 'string' ? text.trim() : '';
  const page = pageOf(set, slot);
  const next = { ...s };
  if (!clean || clean === page.text) delete next.textOverride;
  else {
    if (textOverrideProblem(set, clean)) return { set, release: [] };
    next.textOverride = clean;
  }
  return { set: { ...set, samples: { ...set.samples, [s.id]: next } }, release: [] };
}

/**
 * What the photos' pages can teach, before any photo is analysed: per
 * required set of the type, how many of its characters appear on some
 * photo's page, and the type's page not yet photographed that would add
 * the most missing ones. A plan, not a result: only analysis says what was
 * actually learned.
 */
export function plannedCoverage(set) {
  const type = typeOf(set);
  // The photos chosen so far; before any is chosen, the planned pages of all five.
  const withPhoto = set.slots.filter(e => e.sampleId);
  const pages = (withPhoto.length ? withPhoto : set.slots).map(e => pageOf(set, e.slot));
  const keys = new Set(pages.flatMap(p => (p.text ? splitUnits(p.text).map(u => u.key) : [])));
  // What the type must write: its scripts and, for a maths type, maths.
  const scripts = checkedScripts(type);
  const sets = scripts
    .flatMap(script => setsFor(script, type.scripts))
    .filter(id => SET_INFO[id] && SET_INFO[id].required)
    .map(id => {
      const info = SET_INFO[id];
      const all = REQUIRED_SETS[id];
      const missing = all.filter(k => !keys.has(k));
      return { id, label: info.label, script: info.script, total: all.length, covered: all.length - missing.length, missing };
    });
  const missingAll = new Set(sets.flatMap(x => x.missing));
  const used = new Set(pages.map(p => p.id));
  let suggestion = null;
  if (missingAll.size) {
    for (const page of PRACTICE_PAGES.filter(pg => type.pages.includes(pg.id))) {
      if (used.has(page.id)) continue;
      const pageKeys = new Set(splitUnits(page.text).map(u => u.key));
      const adds = scripts.length ? [...missingAll].filter(k => pageKeys.has(k)).length : pageKeys.size;
      if (adds && (!suggestion || adds > suggestion.adds)) suggestion = { id: page.id, title: page.title, adds };
    }
  }
  return { type: type.id, scripts, sets, complete: !missingAll.size, suggestion };
}

/** Records (or clears, with null) a picking error shown on a slot. */
export function setSlotError(set, slot, error) {
  return { set: withSlot(set, slot, { error: error || null }), release: [] };
}

/** Empties the set and returns every temporary copy to release. */
export function discardAll(set) {
  const release = Object.values(set.samples)
    .map(s => s.image && s.image.uri)
    .filter(Boolean);
  return { set: createSampleSet(), release };
}

/** Temporary uris still held by the set. */
export function heldUris(set) {
  return Object.values(set.samples)
    .map(s => s.image && s.image.uri)
    .filter(Boolean);
}

/**
 * A slot's status for the wizard:
 *   { slot, sample, state: 'empty' | 'picker-error' | 'invalid' | 'warning'
 *     | 'selected', fileValid, qualityAnalysed: false, transcription:
 *     'prescribed' | 'provided' | 'not-provided' }
 */
export function slotStatus(set, slot) {
  const entry = set.slots.find(s => s.slot === slot);
  const sample = sampleIn(set, slot);
  // Every photo shows its type's page; 'provided' when the user corrected its text on review.
  const transcription = sample && typeof sample.textOverride === 'string' ? 'provided' : 'prescribed';
  let state;
  if (!sample) state = entry.error ? 'picker-error' : 'empty';
  else if (!sample.file.valid) state = 'invalid';
  else if (sample.file.problems.some(p => p.severity === 'warning')) state = 'warning';
  else state = 'selected';
  const analysis = sample ? sample.analysis : null;
  const done = !!(analysis && analysis.status === 'done');
  return {
    slot,
    sample,
    error: entry.error,
    state,
    fileValid: !!(sample && sample.file.valid),
    // Separate statuses (never one generic "OK"):
    analysisStatus: analysis ? analysis.status : null,
    decoded: !!(analysis && (analysis.status === 'analysing' || done || (analysis.status === 'failed' && analysis.stage === 'analyse'))),
    qualityAnalysed: done,
    qualityAcceptable: done ? analysis.quality.usable && !analysis.quality.issues.length : null,
    qualityUsable: done ? analysis.quality.usable : null,
    regionUncertain: done ? analysis.segmentation.regionScore === null || analysis.segmentation.regionScore < 0.5 : null,
    analysisFailed: !!(analysis && analysis.status === 'failed'),
    transcription,
  };
}

/**
 * Records the analysis state of one sample (by its id, not its slot):
 *   { status: 'decoding' | 'analysing' } while running,
 *   { status: 'done', quality, segmentation, … } (see summariseAnalysis),
 *   { status: 'failed', stage: 'decode' | 'analyse', code, message, advice },
 *   { status: 'unavailable' } when this build cannot decode pixels.
 * A result for a sample that was replaced or removed meanwhile is ignored.
 */
export function markAnalysis(set, sampleId, analysis) {
  const s = set.samples[sampleId];
  if (!s) return { set, release: [] };
  return { set: { ...set, samples: { ...set.samples, [sampleId]: { ...s, analysis } } }, release: [] };
}

/**
 * The part of an analysis result the wizard keeps: quality and a
 * segmentation summary. No pixels, no masks.
 */
export function summariseAnalysis(result, decodeInfo) {
  const seg = result.segmentation;
  return {
    status: 'done',
    quality: result.quality,
    segmentation: {
      lines: seg.lines.length,
      words: seg.words.length,
      uncertain: seg.uncertain.length,
      regionScore: seg.region ? seg.region.confidence.score : null,
      regionReasons: seg.region ? seg.region.reasons : [],
      possibleHeadlines: seg.diagnostics.possibleHeadlines || 0,
      expectedLines: seg.diagnostics.expectedLines,
      lineCountMatches: seg.diagnostics.lineCountMatches,
      medianXHeight: seg.diagnostics.medianXHeight,
    },
    rules: { rules: result.rules.rules, uncertain: result.rules.uncertain, periodic: result.rules.periodic },
    skew: { angle: result.skew.angle, applied: result.skew.applied },
    timings: result.timings,
    decode: decodeInfo || null,
    // Letters this photo gave (and why others were left out): counts only.
    extraction: result.extraction && result.extraction.summary ? { considered: result.extraction.summary.considered, extracted: result.extraction.summary.extracted } : null,
    // Transcription-guided segmentation: counts only (the observations are
    // produced for the profile builder, not kept in the wizard).
    alignment: result.alignment && result.alignment.summary
      ? { status: result.alignment.status, ...result.alignment.summary }
      : result.alignment
      ? { status: result.alignment.status }
      : null,
  };
}

/**
 * Whole-set validation before continuing. Returns
 * { ready, selected, problems: [{ slot, code, severity, message, advice }] }.
 * `ready` means: five images with valid file details, the sample
 * information the analysis pipeline needs, no check still running and no
 * photo the pixel checks found unusable. Imperfect photos give warnings,
 * not errors. Nothing here says anything about learned handwriting.
 */
export function validateSampleSet(set) {
  const problems = [];
  const uriSlots = {};
  let selected = 0;
  for (const info of SAMPLE_SLOTS) {
    const st = slotStatus(set, info.slot);
    const at = p => problems.push({ slot: info.slot, ...p });
    if (!st.sample) continue; // an empty position is counted below (too-few-photos), not reported twice
    selected++;
    st.sample.file.problems.forEach(p => at(p));
    // The same picture chosen twice. Every pick is copied to a new file, so
    // the copy's name cannot tell; the same type, pixel size and byte size can.
    const f = st.sample.image;
    const fingerprint = `${st.sample.file.mime}|${f.width}x${f.height}|${f.bytes}`;
    (uriSlots[fingerprint] = uriSlots[fingerprint] || []).push(info.slot);
    if (f.uri) (uriSlots[f.uri] = uriSlots[f.uri] || []).push(info.slot);
    // Pixel checks (where this build can decode images). An imperfect photo
    // is allowed with a warning; only unusable ones block.
    const a = st.sample.analysis;
    if (a && (a.status === 'decoding' || a.status === 'analysing')) {
      at(problem('analysis-pending', 'error', `Sample ${info.slot} is still being checked.`, 'Wait a moment for the check to finish.'));
    } else if (a && a.status === 'failed') {
      const blocking = a.stage === 'decode';
      at(problem(a.code || 'analysis-failed', blocking ? 'error' : 'warning', a.message, a.advice));
    } else if (a && a.status === 'done') {
      a.quality.issues.forEach(i => at(problem(i.code, i.severity, i.message, i.advice)));
      if (a.quality.usable && (a.segmentation.regionScore === null || a.segmentation.regionScore < 0.5)) {
        at(problem('region-uncertain', 'warning', `The writing area of sample ${info.slot} could not be found clearly.`, 'A straight, well-lit photo of the whole page helps.'));
      }
    }
  }
  if (selected < MIN_PHOTOS) {
    problems.unshift({
      slot: null,
      ...problem(
        'too-few-photos',
        'error',
        `Add ${MIN_PHOTOS === MAX_PHOTOS ? 'all' : 'at least'} ${MIN_PHOTOS} photos (${selected} added so far).`,
        `Photograph ${MIN_PHOTOS === MAX_PHOTOS ? MIN_PHOTOS : `${MIN_PHOTOS} to ${MAX_PHOTOS}`} pages of the same person's handwriting.`,
      ),
    });
  }
  const reported = new Set();
  for (const slots of Object.values(uriSlots)) {
    const key = slots.join(',');
    if (slots.length > 1 && !reported.has(key)) {
      reported.add(key);
      problems.push({ slot: slots[1], ...problem('duplicate-image', 'error', `The same photo is chosen for photos ${slots.join(' and ')}.`, 'Each photo should be a different page of your writing: replace one of them.') });
    }
  }
  return { ready: !problems.some(p => p.severity === 'error'), selected, problems };
}

/**
 * The samples as profile sample metadata (contracts.js) — no pixels, no
 * file paths — for the analysis pipeline. Only for a ready set.
 */
export function toSampleMetadata(set) {
  const check = validateSampleSet(set);
  if (!check.ready) throw new Error('The sample set is not complete.');
  return SAMPLE_SLOTS.filter(info => sampleIn(set, info.slot)).map(info => {
    const s = sampleIn(set, info.slot);
    const page = pageOf(set, info.slot);
    // The page's text, or the user's correction of it ('user': typed, not prescribed).
    const transcription = typeof s.textOverride === 'string' ? { mode: 'user', text: s.textOverride } : { mode: 'prescribed', text: page.text };
    const meta = {
      slot: info.slot,
      category: page.category,
      mime: s.file.mime,
      width: s.image.width,
      height: s.image.height,
      bytes: s.image.bytes,
      transcription,
      retained: false,
      scripts: [...page.scripts],
    };
    const errors = validateSampleMetadata(meta);
    if (errors.length) throw new Error(`Sample ${info.slot}: ${errors.join('; ')}`);
    return meta;
  });
}

/** Where each sample's temporary image is, for the (future) analysis step only. */
export function analysisInputs(set) {
  return SAMPLE_SLOTS.map(info => {
    const s = sampleIn(set, info.slot);
    return { slot: info.slot, uri: s ? s.image.uri : null };
  });
}
