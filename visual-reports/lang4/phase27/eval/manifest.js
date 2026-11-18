/* eslint-env node */
/**
 * Loads a dataset manifest (DATASET_SPEC.md §4). Same schema as the Phase 14
 * protocol manifest (helpers/realProtocol.js validateManifest), plus the
 * dataset fields, and the typed transcription may live in a separate file:
 *
 *   "transcriptionFile": "truth/<id>.txt"   → read into `transcription`
 *
 * Nothing here reads pixels.
 */
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['english-print', 'english-cursive', 'english-mixed', 'hindi-devanagari', 'hindi-matras-conjuncts'];

function loadManifest(file) {
  const dir = path.dirname(file);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const s of m.samples || []) {
    if (typeof s.transcription !== 'string' && typeof s.transcriptionFile === 'string') {
      const t = path.join(dir, s.transcriptionFile);
      if (fs.existsSync(t)) s.transcription = fs.readFileSync(t, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
    }
  }
  return m;
}

/** Problems beyond validateManifest(): the dataset fields. */
function datasetProblems(m) {
  const errors = [];
  (m.samples || []).forEach((s, i) => {
    const at = `samples[${i}]`;
    if (s.category !== undefined && !CATEGORIES.includes(s.category)) errors.push(`${at}.category: one of ${CATEGORIES.join(', ')}`);
    if (s.writer !== undefined && !/^w[0-9]{1,3}$/.test(s.writer)) errors.push(`${at}.writer: w1, w2, … (no names)`);
    if (s.original !== undefined && !(s.original && Number.isInteger(s.original.width) && Number.isInteger(s.original.height))) errors.push(`${at}.original: { width, height } of the camera photo`);
  });
  return errors;
}

module.exports = { CATEGORIES, loadManifest, datasetProblems };
