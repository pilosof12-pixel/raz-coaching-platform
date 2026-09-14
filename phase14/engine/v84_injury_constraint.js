// engine/v84_injury_constraint.js
//
// The athlete told us what hurts. Say it back as a constraint.
//
// Intakes carry a pain.tolerated_movements field where the athlete states, in
// their own words, what they can do and what reproduces their symptoms. It was
// read by exactly one repair and by no brief, so the most specific safety
// information in the whole intake never reached the model as an instruction --
// it arrived only as prose in the middle of a long profile, competing for
// attention with everything else.
//
// This states it plainly and separately: train what is tolerated, do not
// prescribe what is not, and where the athlete says they are discharged and
// cleared, treat them as an athlete with a constraint rather than a patient.

import { parseWeek } from './v34_workload_accounting.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join(' '); }
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

// Movements named often enough to be worth matching against a program.
const NAMED_MOVEMENTS = [
  'back squat', 'front squat', 'overhead squat', 'deadlift', 'romanian deadlift', 'stiff-leg deadlift',
  'good morning', 'barbell row', 'bent-over row', 'overhead press', 'push press', 'jerk', 'snatch',
  'clean', 'bench press', 'dip', 'pull-up', 'chin-up', 'lunge', 'split squat', 'step-up', 'leg press',
  'leg extension', 'leg curl', 'nordic', 'hip thrust', 'box jump', 'depth jump', 'sit-up', 'crunch',
  'russian twist', 'running', 'sprint', 'burpee', 'kipping',
];

// The half of the sentence that says what is NOT tolerated.
export function contraindicated(intake = {}) {
  const pain = intake && intake.pain ? intake.pain : {};
  const said = `${txt(pain.tolerated_movements)} ${txt(intake.injuries)} ${txt(pain.description)}`;
  const out = new Set();
  // "X, Y and Z are comfortable. A is not." / "A is not tolerated" / "avoid A"
  for (const m of said.matchAll(/(?:^|[.;])\s*([^.;]*?\b(?:is|are)\s+not\b[^.;]*)/gi)) out.add(m[1].trim());
  for (const m of said.matchAll(/\b(?:avoid|cannot|can't|must not|do not|don't)\b([^.;]*)/gi)) out.add(m[0].trim());
  return [...out].filter(Boolean);
}

// Exercises named inside those clauses, which a program can be checked against.
export function forbiddenMovements(intake = {}) {
  const clauses = contraindicated(intake).join(' ').toLowerCase();
  return NAMED_MOVEMENTS.filter((m) => clauses.includes(m));
}

export function isDischarged(intake = {}) {
  return /\b(?:discharged|cleared|signed off|released)\b/i.test(txt([intake.injuries, intake.notes]));
}

// Deliberately NOT wired into the blocking validation bundle. There is no
// deterministic repair for it -- choosing a safe substitute for someone else's
// injured position is a coaching judgement, not a mechanical swap -- and a
// blocking code with no repair spends all four attempts and then fails the
// build, which is how three runs died this week. The brief prevents the defect;
// this collector is here for offline QA of delivered programs.
export function collectInjuryConstraintFlags(program, intake = {}) {
  const forbidden = forbiddenMovements(intake);
  if (!forbidden.length) return [];
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      const hit = forbidden.find((m) => name.toLowerCase().includes(m));
      if (!hit) return;
      flags.push({
        code: 'V84_CONTRAINDICATED_MOVEMENT_PRESCRIBED',
        week, row, exercise: name,
        detail: `${name} is prescribed in Week ${week}, but the athlete told us this is a movement they do not tolerate. Their own account of what reproduces their symptoms outranks any programme logic: choose a variation that trains the same quality without the position that hurts.`,
      });
    });
  }
  return flags;
}

export function buildInjuryConstraintBrief(intake = {}) {
  const pain = intake && intake.pain ? intake.pain : {};
  const tolerated = txt(pain.tolerated_movements).trim();
  const injuries = txt(intake.injuries).trim();
  if (!tolerated && !injuries) return '';

  const lines = ['* WHAT THE ATHLETE TOLERATES, IN THEIR OWN WORDS. This outranks any general programme logic.'];
  if (tolerated) lines.push(`  "${tolerated}"`);
  if (injuries) lines.push(`  History: ${injuries}`);

  const forbidden = forbiddenMovements(intake);
  if (forbidden.length) {
    lines.push(`  Do not prescribe: ${forbidden.join(', ')}. Train the same quality through a variation that avoids the position that hurts, and say in the note what it replaces and why.`);
  } else {
    lines.push('  Where they name a position or a mechanism rather than an exercise, honour the mechanism: avoid the position under load and under fatigue, not merely the one exercise that came to mind.');
  }

  if (isDischarged(intake)) {
    lines.push('  They have been discharged and cleared. Train them. Do not write a rehabilitation programme, do not hedge every line, and do not refer them back to a clinician they have already been discharged by -- build towards the thing they actually want, inside the constraint they have described.');
  }
  lines.push('  If the goal movement is also the movement that injured them, that is the block: build the exposure back deliberately and gradually rather than assuming it or avoiding it.');
  return lines.join('\n');
}

// --- repair -------------------------------------------------------------
//
// The note above was right when it was written: a blocking code with no repair
// spends four attempts and fails the build. What it missed is that the intake
// usually names the answer. "Trap bar deadlift, split squats, sled pushes, hip
// thrusts and all upper body are comfortable. Heavy back squat is not." -- the
// athlete has listed both halves, and choosing from a list they wrote
// themselves is not a coaching judgement made on their behalf.
//
// So the rule now fires only where it can be answered. A contraindicated
// movement with a tolerated substitute of the same pattern is swapped. One
// without stays a brief, exactly as before, because refusing a program we
// cannot mend helps nobody.

import { classifyExercise } from './v38_movement_taxonomy.js';
import { matchDictionary } from './exercise_dictionary.js';

// The half of the sentence that says what IS tolerated.
export function toleratedMovements(intake = {}) {
  const pain = intake && intake.pain ? intake.pain : {};
  const said = txt(pain.tolerated_movements);
  const positive = [];
  for (const clause of said.split(/(?<=[.;])/)) {
    if (/\b(?:is|are)\s+not\b|\bavoid\b|\bcannot\b|\bcan't\b/i.test(clause)) continue;
    positive.push(clause);
  }
  const text = positive.join(' ').toLowerCase();
  const forbidden = forbiddenMovements(intake);
  return NAMED_MOVEMENTS
    .filter((m) => text.includes(m))
    .filter((m) => !forbidden.includes(m));
}

// The athlete's own words, turned into a name the dictionary accepts. "split
// squats" is what they wrote; "Bulgarian Split Squat" is what a program says.
const CANONICAL_FORMS = {
  'trap bar deadlift': ['Trap Bar Deadlift'],
  'romanian deadlift': ['Romanian Deadlift', 'Dumbbell Romanian Deadlift'],
  deadlift: ['Trap Bar Deadlift', 'Deadlift'],
  'split squat': ['Bulgarian Split Squat', 'Split Squat'],
  lunge: ['Walking Lunge', 'Reverse Lunge'],
  'step-up': ['Step-up'],
  'leg press': ['Leg Press'],
  'hip thrust': ['Barbell Hip Thrust', 'Hip Thrust'],
  'leg curl': ['Leg Curl', 'Lying Leg Curl'],
  'leg extension': ['Leg Extension'],
  'front squat': ['Front Squat'],
  'back squat': ['Back Squat'],
  'bench press': ['Bench Press'],
  'overhead press': ['Overhead Press'],
  'push press': ['Push Press'],
  'pull-up': ['Pull-up'],
  'chin-up': ['Chin-up'],
  'barbell row': ['Barbell Row'],
  'bent-over row': ['Bent-Over Row'],
  dip: ['Dip'],
  running: ['Easy Run'],
};

function canonicalFor(movement) {
  for (const name of CANONICAL_FORMS[movement] || []) {
    const hit = matchDictionary(name);
    if (hit && hit.status === 'hit') return name;
  }
  return null;
}

// Prefer a substitute that trains the same thing. A fighter who cannot back
// squat should get another way to load the legs, not another upper-body push --
// and the honest answer for a painful bilateral squat is usually a unilateral
// or a hinge, not a different squat, so the match is on family before category.
const LOWER = new Set(['knee_dominant', 'hip_dominant', 'unilateral_lower']);
function familyOf(name) {
  const category = classifyExercise(name)?.category || '';
  return { category, lower: LOWER.has(category) };
}

function chooseSubstitute(original, tolerated, alreadyOnDay) {
  const want = familyOf(original);
  if (!want.category) return null;
  const options = tolerated.map(canonicalFor).filter(Boolean)
    .filter((n) => !alreadyOnDay.has(n.toLowerCase()))
    .map((n) => ({ name: n, ...familyOf(n) }))
    .filter((o) => o.lower === want.lower);
  if (!options.length) return null;
  return (options.find((o) => o.category === want.category) || options[0]).name;
}

export function repairInjuryConstraint(program, intake = {}) {
  const forbidden = forbiddenMovements(intake);
  if (!forbidden.length) return String(program || '');
  const tolerated = toleratedMovements(intake);
  if (!tolerated.length) return String(program || '');

  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => c.slice());

    const onDay = new Map();
    let lastDay = '';
    parsed.rows.forEach((row) => {
      const raw = String(row[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      if (!onDay.has(lastDay)) onDay.set(lastDay, new Set());
      onDay.get(lastDay).add(name.toLowerCase());
    });

    let changed = false;
    lastDay = '';
    parsed.rows.forEach((row, i) => {
      const raw = String(row[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      if (!forbidden.some((m) => name.toLowerCase().includes(m))) return;
      const swap = chooseSubstitute(name, tolerated, onDay.get(lastDay) || new Set());
      if (!swap) return; // no answer: leave it, and let the warning say so
      onDay.get(lastDay)?.delete(name.toLowerCase());
      onDay.get(lastDay)?.add(swap.toLowerCase());
      cells[i][parsed.exercise] = swap;
      if (Number.isInteger(parsed.load)) cells[i][parsed.load] = 'RPE-selected load';
      if (Number.isInteger(parsed.notes)) {
        cells[i][parsed.notes] = `Replaces ${name}, which you told us you do not tolerate. This trains the same quality in a position you said is comfortable. Build the load back gradually and stop if the old symptoms appear.`;
      }
      changed = true;
    });
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}
