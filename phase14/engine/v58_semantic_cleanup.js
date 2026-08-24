// engine/v58_semantic_cleanup.js
//
// A final grammar pass over client-facing coaching prose, run after the
// program logic is frozen.
//
// Most of what it cleans is self-inflicted. repairRowNote restates a note
// against the row's own numbers, and where no natural rep word exists -- above
// triples -- it substitutes the phrase "sets of N" into a slot that held a
// singular noun. "singles quality bilateral support set only" becomes "sets of
// 4 quality bilateral support set only", which is correct arithmetic and
// broken English, and it reached a paying athlete four times in one program.
//
// The rules here are narrow on purpose. This pass never changes a number, a
// load or an exercise; it only makes the sentence say what the row already
// says.

import { parseWeek } from './v34_workload_accounting.js';

const RULES = [
  {
    // "sets of 4 quality bilateral support set only" -- the substitution left
    // a plural phrase in front and a singular "set only" behind it.
    name: 'sets_of_n_set_only',
    test: /\bsets of (\d+)\s+(.+?)\s+set only\b/i,
    apply: (s) => s.replace(/\bsets of (\d+)\s+(.+?)\s+set only\b/gi,
      (_m, n, middle) => `${middle.charAt(0).toUpperCase()}${middle.slice(1)} — one set of ${n} only`),
  },
  {
    // The same substitution without the trailing singular: "sets of 4 quality
    // reps" is fine, but "sets of 4 quality bilateral support" is not a phrase.
    name: 'sets_of_n_dangling',
    test: /\bsets of (\d+)\s+(?!reps?\b|singles?\b|doubles?\b|triples?\b|per\b|at\b|with\b)([a-z])/i,
    apply: (s) => s.replace(/\bsets of (\d+)\s+(?!reps?\b|singles?\b|doubles?\b|triples?\b|per\b|at\b|with\b)([a-z])/gi,
      (_m, n, next) => `sets of ${n} reps, ${next}`),
  },
  {
    // "Hold the hold", "quality quality" -- a duplicated word from two
    // normalizers writing into the same sentence.
    name: 'duplicated_word',
    test: /\b([A-Za-z]{3,})\s+\1\b/i,
    apply: (s) => s.replace(/\b([A-Za-z]{3,})\s+\1\b/gi, '$1'),
  },
  {
    name: 'doubled_punctuation',
    test: /\s+([.;,])|([.;,])\2/,
    apply: (s) => s.replace(/\s+([.;,])/g, '$1').replace(/([.;,])\1+/g, '$1'),
  },
];

function cleanSentence(text) {
  let out = String(text || '');
  for (const rule of RULES) out = rule.apply(out);
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function collectSemanticFlags(program, _intake = {}) {
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    for (const cells of parsed.rows) {
      const note = String(cells[parsed.notes] || '');
      if (!note.trim()) continue;
      for (const rule of RULES) {
        if (rule.test.test(note)) {
          flags.push({
            code: 'V58_MALFORMED_COACHING_PROSE',
            week,
            rule: rule.name,
            exercise: String(cells[parsed.exercise] || '').trim(),
            detail: `${rule.name} in the note for ${String(cells[parsed.exercise] || '').trim()} (Week ${week}).`,
          });
          break;
        }
      }
    }
  }
  return flags;
}

export function repairSemanticProse(program, _intake = {}) {
  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    let changed = false;
    const rows = parsed.rows.map((cells) => {
      const copy = cells.slice();
      const note = String(copy[parsed.notes] || '');
      if (note.trim()) {
        const cleaned = cleanSentence(note);
        if (cleaned !== note) { copy[parsed.notes] = cleaned; changed = true; }
      }
      return copy;
    });
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export { cleanSentence };
