/**
 * The review screen's reading of a build result (profileGeneration): per
 * script, how many of the type's characters were learned, set by set, with
 * the missing and uncertain ones named. Pure: counts come from the report
 * (never from the pages that were prescribed), so a character counts only
 * when the engine actually learned it from the photos.
 */
import { checkedScripts } from './handwritingTypes';
import { REQUIRED_SETS, SET_INFO, setsFor } from './profileGeneration';

export const SCRIPT_LABELS = { Latn: 'English', Deva: 'Hindi', Math: 'Maths' };

/** Row labels as the review shows them (SET_INFO labels are the engine's). */
const ROW_LABELS = {
  latinUpper: 'Uppercase letters',
  latinLower: 'Lowercase letters',
  devaConsonants: 'Consonants',
  devaPrompt: 'Vowels, matras and clusters',
  devaEveryday: 'Everyday Hindi clusters',
  mathsCore: 'Digits and maths symbols',
  mathsExtra: 'More maths signs',
  devaDigits: 'Hindi digits',
  devaNumberWords: 'Hindi number words',
};
const isDigit = k => /^[0-9]$/.test(k);

/** The rows of one coverage set; digits and punctuation are shown apart. */
function rowsOf(id, entry) {
  const base = { set: id, required: !!(SET_INFO[id] && SET_INFO[id].required), uncertain: entry.uncertain || 0 };
  if (id === 'latinExtra') {
    const keys = REQUIRED_SETS.latinExtra || [];
    const missing = new Set(entry.missingKeys || []);
    const part = (label, pick, suffix) => {
      const mine = keys.filter(pick);
      const gone = mine.filter(k => missing.has(k));
      return { ...base, id: `${id}-${suffix}`, label, total: mine.length, learned: mine.length - gone.length, missing: gone };
    };
    return [part('Numbers', isDigit, 'digits'), part('Punctuation', k => !isDigit(k), 'punctuation')];
  }
  return [{ ...base, id, label: ROW_LABELS[id] || (SET_INFO[id] ? SET_INFO[id].label : id), total: entry.total, learned: entry.total - entry.missing, missing: [...(entry.missingKeys || [])] }];
}

/**
 * summariseBuild(result, type) → {
 *   status: 'created' | 'insufficient' | 'failed',
 *   banner: { tone: 'good' | 'bad', title, text },
 *   scripts: [{ script, label, learned, total, percent, rows, missing, optionalMissing, uncertain }],
 *   warnings: [string]
 * }
 * learned/total/percent count the required sets only (what the type must
 * write); optional rows are listed but never make coverage look better.
 */
export function summariseBuild(result, type) {
  const report = (result && result.report) || {};
  const scripts = [];
  for (const script of checkedScripts(type)) {
    const entries = (report.scripts && report.scripts[script]) || {};
    const rows = setsFor(script, type.scripts).flatMap(id => (entries[id] ? rowsOf(id, entries[id]) : []));
    const required = rows.filter(r => r.required);
    const total = required.reduce((n, r) => n + r.total, 0);
    const learned = required.reduce((n, r) => n + r.learned, 0);
    const uncertain = required.reduce((n, r) => n + r.uncertain, 0);
    scripts.push({
      script,
      label: SCRIPT_LABELS[script] || script,
      total,
      learned,
      percent: total ? Math.round((learned / total) * 100) : 0,
      rows,
      missing: [...new Set(required.flatMap(r => r.missing))],
      optionalMissing: [...new Set(rows.filter(r => !r.required).flatMap(r => r.missing))],
      uncertain,
    });
  }
  const status = result && (result.status === 'created' || result.status === 'insufficient') ? result.status : 'failed';
  const banner =
    status === 'created'
      ? { tone: 'good', title: 'Good coverage', text: 'We found enough characters to create your handwriting.' }
      : status === 'insufficient'
      ? { tone: 'bad', title: 'Not enough characters yet', text: 'Some required characters could not be learned from these photos. Retake or replace the photos below, then analyse again.' }
      : { tone: 'bad', title: 'These photos could not be turned into a handwriting', text: (result && result.errors && result.errors[0]) || 'Please try again with other photos.' };
  const warnings = [];
  for (const s of scripts) {
    if (s.uncertain) warnings.push(`${s.label}: ${s.uncertain} character${s.uncertain === 1 ? ' was' : 's were'} learned with low confidence.`);
    if (s.missing.length) warnings.push(`${s.label}: missing ${s.missing.join(' ')}`);
  }
  return { status, banner, scripts, warnings };
}
