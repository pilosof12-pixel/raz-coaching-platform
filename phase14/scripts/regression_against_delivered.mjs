// What would today's engine do to a program a coach already approved?
//
// Forty-four deterministic repairs now run before a program is delivered, and
// most of them were written in the last few days to stop builds dying. Every
// one of them changes what the client reads. None has been seen by a coach.
//
// The stress suite cannot answer this: it damages a program on purpose and
// checks the damage is undone. The internal rubric cannot answer it either --
// it scores 9.7 on a program with every coaching note stripped out. So a repair
// that converges beautifully and quietly makes the training worse would pass
// everything we have.
//
// This asks a different question. We have the real programs the service
// delivered, including ones the coach scored. Run each through the chain
// exactly as production would, and look at what changes. A repair firing on a
// program that was already good is not automatically wrong -- the rules have
// moved on since -- but it is always a change a human should look at, and
// until now nothing was even listing them.
//
//   node scripts/regression_against_delivered.mjs           summary
//   node scripts/regression_against_delivered.mjs --diff    every changed row

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, '..', 'test', 'fixtures', f), 'utf8');
const json = (f) => JSON.parse(fx(f));

const CORE = json('acceptance_intakes.json');
const HARD = json('hard_avatars.json');
const COMP = json('competition_avatars.json');

const day = 86400000;
const weeksOut = (n) => new Date(Date.now() + n * 7 * day).toISOString().slice(0, 10);
const onSaturday = (n) => {
  const d = new Date(Date.now() + n * 7 * day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};

// Programs the service actually delivered, with the coach's score where one was
// given. An unrated program is still worth checking: it is real output, not a
// fixture written to make a rule fire.
const DELIVERED = [
  { file: 'run81_advanced_hybrid.txt', intake: CORE.advanced_hybrid, score: 7.9, note: 'coach review, early hybrid' },
  { file: 'run88_advanced_hybrid.txt', intake: CORE.advanced_hybrid, score: null, note: 'delivered' },
  { file: 'run81_tactical_3k.txt', intake: CORE.tactical_3k, score: 7.9, note: 'coach review' },
  { file: 'run84_tactical_3k.txt', intake: CORE.tactical_3k, score: null, note: 'delivered' },
  { file: 'run100_inseason_footballer.txt', intake: HARD.inseason_footballer, score: null, note: 'delivered' },
  { file: 'run101_inseason_footballer.txt', intake: HARD.inseason_footballer, score: 9.1, note: 'coach review' },
  { file: 'run100_masters_return.txt', intake: HARD.masters_return, score: null, note: 'delivered' },
  { file: 'run101_masters_return.txt', intake: HARD.masters_return, score: 9.1, note: 'coach review' },
  {
    file: 'run101_weightlifter_peak.txt', score: 9.2, note: 'coach review',
    intake: { ...COMP.weightlifter_peak, competition_date: weeksOut(8), event_type: 'strength_meet', event_priority: 'A' },
  },
  {
    file: 'run97_mma_camp_delivered.txt', score: 8.5, note: 'coach review',
    intake: { ...COMP.mma_fight_camp, competition_date: onSaturday(4), event_type: 'combat', event_priority: 'A' },
  },
];

// Rows matched by what they are, not where they sit.
//
// The first version of this keyed rows by their index in the week, and the
// warm-up enricher adds and merges rows -- so one insertion shifted everything
// below it and the diff reported four hundred and sixty-seven changes to a
// program that had a handful. A regression harness that cries wolf that loudly
// is worse than none: the real changes were in there, buried.
function rowsOf(program) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const m = program.match(new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i'));
    if (!m) continue;
    const lines = m[1].split('\n').filter((l) => l.includes('\t'));
    const seen = new Map();
    let lastDay = '';
    lines.slice(1).forEach((line) => {
      const cells = line.split('\t');
      const day = String(cells[0] || '').trim() || lastDay;
      lastDay = day;
      const name = String(cells[1] || '').trim();
      const id = `${week}|${day}|${name}`;
      const nth = (seen.get(id) || 0) + 1;
      seen.set(id, nth);
      out.push({ week, day, name, key: `${id}|${nth}`, cells });
    });
  }
  return out;
}

const HEADINGS = ['Day', 'Exercise', 'Weight', 'Sets', 'Reps', 'Rest', 'RPE', 'Notes'];

function diffSegment(a, b) {
  const A = String(a);
  const B = String(b);
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head += 1;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head
    && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail += 1;
  const at = Math.max(0, head - 18);
  return [(at ? '...' : '') + A.slice(at, A.length - tail + 8),
    (at ? '...' : '') + B.slice(at, B.length - tail + 8)];
}

function changedCells(before, after) {
  const a = rowsOf(before);
  const b = rowsOf(after);
  const bByKey = new Map(b.map((r) => [r.key, r]));
  const aKeys = new Set(a.map((r) => r.key));
  const changes = [];

  for (const row of a) {
    const other = bByKey.get(row.key);
    if (!other) {
      changes.push({ week: row.week, exercise: row.name, what: 'row removed', from: `${row.day} ${row.name}`, to: '' });
      continue;
    }
    row.cells.forEach((cell, c) => {
      const to = String(other.cells[c] ?? '');
      if (String(cell) === to) return;
      const [from, into] = diffSegment(cell, to);
      changes.push({ week: row.week, exercise: row.name, what: HEADINGS[c] || `col ${c}`, from, to: into });
    });
  }
  for (const row of b) {
    if (aKeys.has(row.key)) continue;
    changes.push({ week: row.week, exercise: row.name, what: 'row added', from: '', to: `${row.day} ${row.name}` });
  }
  return changes;
}

const showDiff = process.argv.includes('--diff');
let touched = 0;
let ratedTouched = 0;
const report = [];

for (const item of DELIVERED) {
  let before;
  try { before = fx(item.file); } catch { console.log(`  (missing ${item.file})`); continue; }
  let res;
  try {
    res = collectRepairableValidationFailures(before, item.intake, { skipSkillCalibration: true });
  } catch (e) {
    report.push({ ...item, error: e?.code || e?.message || 'threw' });
    continue;
  }
  const after = res.program;
  const repairs = (res.deterministic_repairs || []).map((r) => r.type);
  const changes = after === before ? [] : changedCells(before, after);
  if (changes.length) { touched += 1; if (item.score != null) ratedTouched += 1; }
  report.push({ ...item, repairs, changes, flags: (res.flags || []).map((f) => f.code) });
}

console.log('WHAT TODAY\'S ENGINE WOULD DO TO PROGRAMS IT ALREADY DELIVERED\n');
console.log(`${DELIVERED.length} delivered programs, ${DELIVERED.filter((d) => d.score != null).length} of them coach-scored\n`);

for (const item of report) {
  const label = `${item.file.replace(/\.txt$/, '')}${item.score != null ? `  [coach ${item.score}]` : ''}`;
  if (item.error) { console.log(`${label}\n   ERROR: ${item.error}\n`); continue; }
  const n = item.changes.length;
  console.log(`${label}\n   ${n === 0 ? 'unchanged' : `${n} cell(s) changed`}${item.repairs.length ? `  via ${[...new Set(item.repairs)].join(', ')}` : ''}`);
  if (n && showDiff) {
    for (const c of item.changes.slice(0, 40)) {
      console.log(`     W${c.week} ${String(c.exercise || '').padEnd(26)} ${c.what}: "${c.from}" -> "${c.to}"`);
    }
    if (n > 40) console.log(`     ... and ${n - 40} more`);
  }
  console.log('');
}

console.log('--- summary ---');
console.log(`  ${touched} of ${report.length} delivered programs would be changed by today's chain`);
console.log(`  ${ratedTouched} of them are programs the coach scored`);
if (touched) console.log('\nA repair firing on delivered output is not automatically wrong -- the rules have\nmoved on. It is a change a human should look at. Run with --diff to read them.');
