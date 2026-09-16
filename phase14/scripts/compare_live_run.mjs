// Did the briefs change what the model writes?
//
// The grader reads output; the briefs shape input. Nothing offline can answer
// that question, so a live run answers it and this script reads the answer:
// grade each new program against the coach's standard and put it beside the
// version that came before it.
//
//   node scripts/compare_live_run.mjs            summary
//   node scripts/compare_live_run.mjs --detail   every finding, both sides

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gradeProgram } from '../engine/coach_rules.js';
import { collectClaimIntegrityFlags } from '../engine/v93_claim_integrity.js';
import { collectSportStateFlags } from '../engine/v78_sport_taper.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => path.join(root, '..', 'test', 'fixtures', f);
const live = (f) => path.join(root, '..', 'docs', 'qa', 'live-three-avatar', f);
const json = (f) => JSON.parse(fs.readFileSync(fx(f), 'utf8'));
const detail = process.argv.includes('--detail');

const A = json('acceptance_intakes.json');
const C = json('competition_avatars.json');
const H = json('hard_avatars.json');
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

// Each avatar, its intake, the newly generated program, and the best version
// that came before it with the coach's score on that one.
const CASES = [
  {
    id: 'inseason_footballer',
    intake: H.inseason_footballer,
    before: fx('run101_inseason_footballer.txt'),
    beforeScore: 9.0,
    predicted: ['SPRINT_SPEED_EXPOSURE_MISSING', 'SPRINT_DISTANCE_BELOW_BENCHMARK', 'REPEATED_SPRINT_EXPOSURE_MISSING', 'ECCENTRIC_HAMSTRING_TOO_CLOSE_TO_MATCH'],
  },
  {
    id: 'weightlifter_peak',
    intake: { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' },
    before: fx('run101_weightlifter_peak.txt'),
    beforeScore: 8.2,
    predicted: ['BENCHMARK_UNEXPOSED', 'PRIMARY_LOAD_UNANCHORED', 'INTENSIFICATION_BAND_NOT_REACHED', 'CONSECUTIVE_TRAINING_DAYS'],
  },
  {
    id: 'tactical_3k',
    intake: A.tactical_3k,
    before: fx('run81_tactical_3k.txt'),
    beforeScore: 7.6,
    predicted: ['STATED_PROGRESSION_ABSENT', 'GOAL_SPEED_NOT_APPROACHED', 'GOAL_DISTANCE_BELOW_TOLERANCE', 'CONSECUTIVE_LOWER_LEG_DAYS', 'IMPROVEMENT_GOAL_FLAT', 'TRAINING_DAYS_VS_INTAKE'],
  },
];

const grade = (program, intake) => {
  const raw = [
    ...gradeProgram(program, intake),
    ...collectClaimIntegrityFlags(program, intake).map((f) => ({ rule: 'STATED_PROGRESSION_ABSENT', movement: f.subject, detail: f.detail })),
    ...collectSportStateFlags(program, intake).map((f) => ({ rule: 'SPORT_STATE_MISDESCRIBED', movement: f.day, detail: f.detail })),
  ];
  const distinct = new Map();
  for (const f of raw) {
    const k = `${f.rule}|${f.movement || ''}`;
    if (!distinct.has(k)) distinct.set(k, f);
  }
  return [...distinct.values()];
};

let anyMissing = false;
console.log('\nDID THE BRIEFS CHANGE THE OUTPUT?\n');

for (const c of CASES) {
  const newPath = live(`${c.id}-program.txt`);
  if (!fs.existsSync(newPath)) {
    console.log(`  ${c.id.padEnd(22)} no program produced in this run`);
    anyMissing = true;
    continue;
  }
  const after = grade(fs.readFileSync(newPath, 'utf8'), c.intake);
  const before = fs.existsSync(c.before) ? grade(fs.readFileSync(c.before, 'utf8'), c.intake) : [];
  const key = (f) => `${f.rule}|${f.movement || ''}`;
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  const fixed = before.filter((f) => !afterKeys.has(key(f)));
  const introduced = after.filter((f) => !beforeKeys.has(key(f)));
  const stillThere = after.filter((f) => beforeKeys.has(key(f)));

  console.log(`  ${c.id}  (coach scored the previous version ${c.beforeScore})`);
  console.log(`    before ${String(before.length).padStart(2)} findings   after ${String(after.length).padStart(2)} findings`);
  console.log(`    fixed ${fixed.length}, still there ${stillThere.length}, new ${introduced.length}`);
  const predictedGone = c.predicted.filter((r) => !after.some((f) => f.rule === r));
  console.log(`    predicted to disappear: ${c.predicted.length}, actually gone: ${predictedGone.length} (${predictedGone.join(', ') || 'none'})`);
  if (detail || introduced.length) {
    for (const f of fixed) console.log(`      GONE  [${f.rule}] ${f.movement || ''}`);
    for (const f of stillThere) console.log(`      STAYS [${f.rule}] ${f.movement || ''}`);
    for (const f of introduced) console.log(`      NEW   [${f.rule}] ${f.movement || ''} -- ${String(f.detail).slice(0, 110)}`);
  }
  console.log('');
}

if (anyMissing) console.log('  Some avatars produced nothing. A program that was never generated is not a clean one.\n');
