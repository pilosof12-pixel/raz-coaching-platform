// The text may not promise a movement the table never delivers.
//
// Coach on run #165's masters rower: the intro says "Deadlift comes back once
// these stay clean", and no deadlift appears anywhere in the block. Not a
// programming error -- nothing obliged the block to bring it back -- but a
// promise the program does not keep. When the table holds no row of the
// movement, the promise is restated as what it really is: a decision for the
// next block, on the same condition.

import { EXERCISE_DICTIONARY } from './exercise_dictionary.js';

const PROMISE = '(?:comes back|come back|returns|will return|is reintroduced|will be reintroduced|gets added|will be added|is added later|is introduced|will be introduced|re-enters|returns later)';

function tableNames(program) {
  const names = new Set();
  for (const m of String(program || '').matchAll(/START_WEEK[1-4]_TSV\s*\n([\s\S]*?)\nEND_WEEK[1-4]_TSV/gi)) {
    for (const line of m[1].split('\n').slice(1)) names.add(String(line.split('\t')[1] || '').toLowerCase());
  }
  return names;
}

export function normalizeNarrativePromises(program) {
  const original = String(program || '');
  const firstWeek = original.search(/START_WEEK1_TSV/i);
  if (firstWeek < 0) return { program: original, repaired: false, repairs: [] };
  let head = original.slice(0, firstWeek);
  const rows = [...tableNames(original)];
  const repairs = [];
  for (const name of [...EXERCISE_DICTIONARY].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escaped})\\s+${PROMISE}\\b`, 'gi');
    if (!re.test(head)) continue;
    const lower = name.toLowerCase();
    if (rows.some((r) => r === lower || r.includes(lower))) continue;
    head = head.replace(re, (m, n) => `${n} is considered for the next block`);
    repairs.push({ type: 'unkept_promise_restated', exercise: name });
  }
  if (!repairs.length) return { program: original, repaired: false, repairs: [] };
  return { program: head + original.slice(firstWeek), repaired: true, repairs };
}
