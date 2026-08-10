import fs from 'node:fs';

function patchFile(path, transforms) {
  let s = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [find, replace, label] of transforms) {
    if (s.includes(replace)) continue;
    const count = s.split(find).length - 1;
    if (count !== 1) throw new Error(`${path} ${label}: expected one anchor, found ${count}`);
    s = s.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, s);
  console.log(`${path}: ${changed ? 'patched' : 'already current'}`);
}

for (const path of ['engine/exercise_dictionary.js', 'phase14/engine/exercise_dictionary.js']) {
  patchFile(path, [
    [
      '  "Dumbbell Bench Press", "Incline Dumbbell Press", "Dumbbell Shoulder Press",\n',
      '  "Dumbbell Bench Press", "Incline Dumbbell Press", "Dumbbell Shoulder Press",\n  "Dumbbell Overhead Press", "Dumbbell Floor Press",\n',
      'add common dumbbell press names'
    ],
    [
      '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n',
      '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n  ["DB Overhead Press", "Dumbbell Overhead Press"],\n  ["Dumbbell OHP", "Dumbbell Overhead Press"],\n  ["DB Floor Press", "Dumbbell Floor Press"],\n',
      'add dumbbell press aliases'
    ],
    [
      '  ["Dumbbell Shoulder Press", ["dumbbells"]], ["Arnold Press", ["dumbbells"]],\n',
      '  ["Dumbbell Shoulder Press", ["dumbbells"]], ["Dumbbell Overhead Press", ["dumbbells"]],\n  ["Dumbbell Floor Press", ["dumbbells"]], ["Arnold Press", ["dumbbells"]],\n',
      'add dumbbell press equipment'
    ],
  ]);
}

patchFile('phase14/engine/phase15_planner.js', [
  [
    '  const sportText = `${txt(intake.sport)} ${maintenance} ${notes}`.toLowerCase();\n',
    `  const allGoalText = \`${'${primary} ${secondary} ${notes}'}\`;
  const benchmarkText = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  if (/planche/i.test(allGoalText) && /advanced tuck planche/i.test(benchmarkText)) {
    required.push('ADVANCED PLANCHE BRIDGE: keep Advanced Tuck Planche as the owned base, but include one controlled harder-rung bridge exposure each week, normally band-assisted/low-volume Straddle Planche or another verified next-rung exposure. Do not spend all four weeks only accumulating Advanced Tuck seconds.');
    required.push('Advanced planche bridge work stays low-fatigue and high-quality: 2-4 sets, short submaximal holds or controlled attempts, stop well before shape loss.');
  }
  if (/front lever/i.test(allGoalText) && /advanced tuck front lever/i.test(benchmarkText)) {
    required.push('ADVANCED FRONT-LEVER BRIDGE: keep Advanced Tuck Front Lever as the owned base, but include one controlled harder-rung bridge exposure each week, normally Single-Leg Front Lever or band-assisted Straddle Front Lever. Do not spend all four weeks only accumulating Advanced Tuck seconds.');
    required.push('Advanced front-lever bridge work stays low-fatigue and high-quality: 2-4 sets of brief holds/attempts, with the owned rung used for the bulk of volume.');
  }

  const activeCalendarDays = new Set([...days, ...Object.keys(sport)]);
  if (activeCalendarDays.size >= 7) {
    required.push('SEVEN-DAY LOAD MANAGEMENT: because gym plus sport occupies every day of the week, designate at least one gym session as explicitly low-cost/recovery-contingent. Keep that day skill-quality biased, avoid hard lower-body loading, and state that volume is reduced or the final accessory can be dropped when sport fatigue is high.');
  }

  const sportText = \`${'${txt(intake.sport)} ${maintenance} ${notes}'}\`.toLowerCase();
`,
    'advanced bridges and seven-day recovery rule'
  ],
]);

patchFile('phase14/engine/phase15_program_qa.js', [
  [
    'function firstNumber(s) {\n  const m = String(s || "").match(/\\d+(?:\\.\\d+)?/);\n  return m ? Number(m[0]) : null;\n}\n',
    `function firstNumber(s) {
  const m = String(s || "").match(/\\d+(?:\\.\\d+)?/);
  return m ? Number(m[0]) : null;
}

function currentBenchmarkText(intake) {
  return JSON.stringify(intake?.current_numbers || intake?.performance_markers || intake?.current_strength || '');
}

function hasBenchmark(intake, re) {
  return re.test(currentBenchmarkText(intake));
}

function numericKgWeight(value) {
  return /^\\s*(?:pair\\s*)?\\+?\\d+(?:\\.\\d+)?(?:-\\d+(?:\\.\\d+)?)?\\s*kg(?:s)?\\s*$/i.test(String(value || ''));
}
`,
    'benchmark helpers'
  ],
  [
    '    "CLIENT CLEANLINESS HARD RULE: never output [REVIEW], contact-support text, placeholder rows, QA labels or unresolved internal language. Such output is rejected and never saved to a client.",\n',
    `    "CLIENT CLEANLINESS HARD RULE: never output [REVIEW], contact-support text, placeholder rows, QA labels or unresolved internal language. Such output is rejected and never saved to a client.",
    "LOAD PRECISION HARD RULE: if current_numbers does not provide a benchmark for a loaded lift, do NOT invent an exact kilogram prescription. Put 'RPE-selected load' or 'choose load @ RPE X' in Weight and use the Target RPE column for calibration. Exact kg is allowed only when it is anchored to a supplied/current performance number or a deterministic translation from one.",
    "ADVANCED SKILL BRIDGE HARD RULE: when the athlete already demonstrates Advanced Tuck Planche or Advanced Tuck Front Lever and the goal is the full skill, retain the owned rung for volume but include a small controlled next-rung bridge exposure. Four weeks of only longer Advanced Tuck holds is under-progressed.",
    "SEVEN-DAY RECOVERY HARD RULE: when gym days plus sport occupy all seven calendar days, at least one gym day must be explicitly low-cost/recovery-contingent rather than another normal strength day.",
`,
    'quality prompt upgrades'
  ],
  [
    '  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = `${primary} | ${secondary}`;\n',
    `  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = \`${'${primary} | ${secondary}'}\`;

  const exIdx = parsed.idx.exercise, weightIdx = parsed.idx.weight;
  const lacksOhpBenchmark = !hasBenchmark(intake, /(?:overhead press|\\bohp\\b)[^\\d]{0,40}\\d+(?:\\.\\d+)?\\s*kg/i);
  const lacksRdlBenchmark = !hasBenchmark(intake, /(?:romanian deadlift|\\brdl\\b)[^\\d]{0,40}\\d+(?:\\.\\d+)?\\s*kg/i);
  for (const row of parsed.rows) {
    const ex = String(row.cells[exIdx] || '');
    const weight = String(row.cells[weightIdx] || '');
    if (lacksOhpBenchmark && /^(?:Overhead Press|Standing Barbell Overhead Press|Dumbbell Overhead Press|Dumbbell Shoulder Press)$/i.test(ex) && numericKgWeight(weight)) {
      flags.push({ code:'UNANCHORED_LOAD_PRECISION', message:\`\${ex} has an exact kg load despite no current press benchmark. Use RPE-selected load instead.\` });
    }
    if (lacksRdlBenchmark && /^(?:Romanian Deadlift|Dumbbell Romanian Deadlift)$/i.test(ex) && numericKgWeight(weight)) {
      flags.push({ code:'UNANCHORED_LOAD_PRECISION', message:\`\${ex} has an exact kg load despite no current RDL/deadlift benchmark. Use RPE-selected load instead.\` });
    }
  }
`,
    'reject unanchored exact loads'
  ],
]);

patchFile('phase14/engine/phase15_final_qa.js', [
  [
    'function parseWeek1(program) { return parseWeek(program,1); }\n',
    `function parseWeek1(program) { return parseWeek(program,1); }

function clientStructuralFailures(program) {
  const raw = String(program || '');
  const failures = [];
  if (/\\[REVIEW\\]|contact\\s+support|could not be safely generated|placeholder(?:\\s+exercise|\\s+row)?/i.test(raw)) {
    failures.push({code:'CLIENT_OUTPUT_NOT_READY', message:'Unresolved review/support/placeholder language reached final output.'});
  }
  for (let w=1; w<=4; w++) {
    const p = parseWeek(raw,w);
    if (!p) { failures.push({code:'TSV_PARSE_FAIL', message:\`Week \${w} TSV could not be parsed.\`}); continue; }
    if (Object.keys(p.idx).length !== 9 || !('results' in p.idx)) failures.push({code:'TSV_COLUMN_COUNT_INVALID', message:\`Week \${w} must have exactly 9 TSV columns including Results.\`});
    for (let i=0; i<p.rows.length; i++) {
      const r = p.rows[i];
      if (r.length !== 9) failures.push({code:'TSV_ROW_MALFORMED', message:\`Week \${w} row \${i+1} has \${r.length} cells instead of 9.\`});
      const ex = String(r[p.idx.exercise] || '').trim();
      if (/^\\s*\\[WARMUP\\]/i.test(ex)) continue;
      const sets = String(r[p.idx.sets] || '').trim();
      const reps = String(r[p.idx.reps] || '').trim();
      if (/^0(?:\\.0+)?$/.test(sets) || /^0(?:\\.0+)?$/.test(reps)) failures.push({code:'ZERO_WORK_PLACEHOLDER_ROW', message:\`Week \${w} contains zero-set/zero-rep placeholder row for \${ex || 'unknown exercise'}.\`});
    }
  }
  return failures;
}
`,
    'final structural QA helper'
  ],
  [
    'export function validatePhase15FinalProgram(program, intake={}) {\n  let baseResult={ok:true,flags:[]};\n',
    `export function validatePhase15FinalProgram(program, intake={}) {
  const structural = clientStructuralFailures(program);
  if (structural.length) throw new Phase15QualityError(structural);
  let baseResult={ok:true,flags:[]};
`,
    'run structural QA first'
  ],
]);

patchFile('phase14/scripts/build_phase15_runtime.mjs', [
  [
    '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",\n',
    '  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high. Do not assign a high RPE to a load that is obviously too light for the athlete\'s current benchmark.",\n  "If the intake gives no benchmark for a loaded lift, never invent an exact kg load. Write RPE-selected load in Weight and calibrate with Target RPE/RIR. Exact kilograms require an intake anchor or deterministic translation.",\n  "For an athlete already at Advanced Tuck Planche or Advanced Tuck Front Lever aiming at the full skill, retain the owned rung for most quality volume but add a small controlled next-rung bridge exposure. Do not spend all four weeks only adding seconds to Advanced Tuck.",\n  "If gym plus sport occupies every calendar day, make at least one gym session explicitly low-cost/recovery-contingent, skill-quality biased and easy to trim when sport fatigue rises.",\n',
    'OpenAI developer quality rules'
  ],
  [
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n',
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n    [/\\tDB Overhead Press\\t/gi, "\\tDumbbell Overhead Press\\t"],\n    [/\\tDumbbell OHP\\t/gi, "\\tDumbbell Overhead Press\\t"],\n    [/\\tDB Floor Press\\t/gi, "\\tDumbbell Floor Press\\t"],\n',
    'OpenAI common dumbbell canonicalization'
  ],
]);

console.log('9+ quality patch applied');
