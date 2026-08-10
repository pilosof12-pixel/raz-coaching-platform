import fs from 'node:fs';

// Triggered after the workflow exists so the one-shot source patch is applied.
function patchFile(path, transforms) {
  let s = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [find, replace, label] of transforms) {
    if (s.includes(replace)) continue;
    const count = s.split(find).length - 1;
    if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
    s = s.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, s);
  console.log(`${path}: ${changed ? 'patched' : 'already current'}`);
}

patchFile('phase14/engine/exercise_dictionary.js', [
  [
    '  "Arnold Press", "Dumbbell Row", "One-Arm Dumbbell Row",\n',
    '  "Arnold Press", "Dumbbell Row", "One-Arm Dumbbell Row", "Chest-Supported Row",\n',
    'dictionary chest-supported row'
  ],
  [
    '  "Dumbbell Bench Press", "Incline Dumbbell Press", "Dumbbell Shoulder Press",\n',
    '  "Dumbbell Bench Press", "Incline Dumbbell Press", "Dumbbell Shoulder Press",\n  "Dumbbell Overhead Press", "Dumbbell Floor Press",\n',
    'dictionary common dumbbell presses'
  ],
  [
    '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n',
    '  ["DB Shoulder Press", "Dumbbell Shoulder Press"],\n  ["DB Overhead Press", "Dumbbell Overhead Press"],\n  ["Dumbbell OHP", "Dumbbell Overhead Press"],\n  ["DB Floor Press", "Dumbbell Floor Press"],\n  ["Chest Supported Row", "Chest-Supported Row"],\n  ["Chest Supported DB Row", "Chest-Supported Row"],\n  ["Chest-Supported DB Row", "Chest-Supported Row"],\n  ["Dumbbell Hammer Curl", "Hammer Curl"],\n',
    'avatar aliases'
  ],
  [
    '  ["Dumbbell Shoulder Press", ["dumbbells"]], ["Arnold Press", ["dumbbells"]],\n',
    '  ["Dumbbell Shoulder Press", ["dumbbells"]], ["Dumbbell Overhead Press", ["dumbbells"]],\n  ["Dumbbell Floor Press", ["dumbbells"]], ["Arnold Press", ["dumbbells"]],\n',
    'dumbbell press equipment'
  ],
  [
    '  ["Dumbbell Row", ["dumbbells"]], ["One-Arm Dumbbell Row", ["dumbbells"]],\n',
    '  ["Dumbbell Row", ["dumbbells"]], ["One-Arm Dumbbell Row", ["dumbbells"]],\n  ["Chest-Supported Row", ["dumbbells", "bench"]],\n',
    'chest-supported equipment'
  ]
]);

patchFile('phase14/engine/phase15_planner.js', [
  [
    '  const sportText = `${txt(intake.sport)} ${maintenance} ${notes}`.toLowerCase();\n',
    `  const allGoalText = \`${'${primary} ${secondary} ${notes}'}\`;
  const benchmarkText = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  if (/planche/i.test(allGoalText) && /advanced tuck planche/i.test(benchmarkText)) {
    required.push('ADVANCED PLANCHE BRIDGE: keep Advanced Tuck Planche as the owned base, but include one controlled harder-rung bridge exposure each week, normally low-volume Straddle Planche or a verified assisted next-rung exposure. Do not spend all four weeks only accumulating Advanced Tuck seconds.');
  }
  if (/front lever/i.test(allGoalText) && /advanced tuck front lever/i.test(benchmarkText)) {
    required.push('ADVANCED FRONT-LEVER BRIDGE: keep Advanced Tuck Front Lever as the owned base, but include one controlled harder-rung bridge exposure each week, normally Single-Leg Front Lever or a verified assisted Straddle Front Lever. Do not spend all four weeks only accumulating Advanced Tuck seconds.');
  }
  const activeCalendarDays = new Set([...days, ...Object.keys(sport)]);
  if (activeCalendarDays.size >= 7) {
    required.push('SEVEN-DAY LOAD MANAGEMENT: because gym plus sport occupies every day, designate at least one gym session as explicitly low-cost/recovery-contingent. Keep it skill-quality biased, avoid hard lower-body loading and make the final accessory easy to drop when sport fatigue is high.');
  }

  const sportText = \`${'${txt(intake.sport)} ${maintenance} ${notes}'}\`.toLowerCase();
`,
    'advanced skill bridges and seven-day recovery'
  ]
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
function hasBenchmark(intake, re) { return re.test(currentBenchmarkText(intake)); }
function numericKgWeight(value) {
  return /^\\s*(?:pair\\s*)?\\+?\\d+(?:\\.\\d+)?(?:-\\d+(?:\\.\\d+)?)?\\s*kg(?:s)?\\s*$/i.test(String(value || ''));
}
`,
    'benchmark helpers'
  ],
  [
    '    "CLIENT CLEANLINESS HARD RULE: never output [REVIEW], contact-support text, placeholder rows, QA labels or unresolved internal language. Such output is rejected and never saved to a client.",\n',
    `    "CLIENT CLEANLINESS HARD RULE: never output [REVIEW], contact-support text, placeholder rows, QA labels or unresolved internal language. Such output is rejected and never saved to a client.",
    "LOAD PRECISION HARD RULE: if current_numbers does not provide a benchmark for a loaded lift, do NOT invent an exact kilogram prescription. Put 'RPE-selected load' or 'choose load @ RPE X' in Weight and use Target RPE for calibration.",
    "ADVANCED SKILL BRIDGE HARD RULE: if the athlete already demonstrates Advanced Tuck Planche or Advanced Tuck Front Lever and wants the full skill, keep the owned rung for volume but include a small controlled next-rung bridge exposure.",
    "SEVEN-DAY RECOVERY HARD RULE: when gym plus sport occupies all seven calendar days, at least one gym day must be explicitly low-cost/recovery-contingent.",
`,
    'quality prompt upgrades'
  ],
  [
    '  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = `${primary} | ${secondary}`;\n',
    `  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = \`${'${primary} | ${secondary}'}\`;

  const exIdx = parsed.idx.exercise, weightIdx = parsed.idx.weight;
  const lacksOhpBenchmark = !hasBenchmark(intake, /(?:overhead press|\\bohp\\b)[^\\d]{0,40}\\d+(?:\\.\\d+)?\\s*kg/i);
  const lacksRdlBenchmark = !hasBenchmark(intake, /(?:romanian deadlift|\\brdl\\b|deadlift)[^\\d]{0,40}\\d+(?:\\.\\d+)?\\s*kg/i);
  for (const row of parsed.rows) {
    const ex = String(row.cells[exIdx] || '');
    const weight = String(row.cells[weightIdx] || '');
    if (lacksOhpBenchmark && /^(?:Overhead Press|Standing Barbell Overhead Press|Dumbbell Overhead Press|Dumbbell Shoulder Press)$/i.test(ex) && numericKgWeight(weight)) flags.push({ code:'UNANCHORED_LOAD_PRECISION', message:\`\${ex} has exact kg despite no current press benchmark. Use RPE-selected load.\` });
    if (lacksRdlBenchmark && /^(?:Romanian Deadlift|Dumbbell Romanian Deadlift)$/i.test(ex) && numericKgWeight(weight)) flags.push({ code:'UNANCHORED_LOAD_PRECISION', message:\`\${ex} has exact kg despite no current hinge benchmark. Use RPE-selected load.\` });
  }
`,
    'reject unanchored exact loads'
  ]
]);

patchFile('phase14/engine/phase15_final_qa.js', [
  [
    'function parseWeek1(program) { return parseWeek(program,1); }\n',
    `function parseWeek1(program) { return parseWeek(program,1); }

function clientStructuralFailures(program) {
  const raw = String(program || '');
  const failures = [];
  if (/\\[REVIEW\\]|contact\\s+support|could not be safely generated|placeholder(?:\\s+exercise|\\s+row)?/i.test(raw)) failures.push({code:'CLIENT_OUTPUT_NOT_READY',message:'Unresolved review/support/placeholder language reached final output.'});
  for (let w=1; w<=4; w++) {
    const p=parseWeek(raw,w);
    if (!p) { failures.push({code:'TSV_PARSE_FAIL',message:\`Week \${w} TSV could not be parsed.\`}); continue; }
    if (Object.keys(p.idx).length !== 9 || !('results' in p.idx)) failures.push({code:'TSV_COLUMN_COUNT_INVALID',message:\`Week \${w} must have exactly 9 TSV columns including Results.\`});
    for (let i=0;i<p.rows.length;i++) {
      const r=p.rows[i];
      if (r.length !== 9) failures.push({code:'TSV_ROW_MALFORMED',message:\`Week \${w} row \${i+1} has \${r.length} cells instead of 9.\`});
      const ex=String(r[p.idx.exercise]||'').trim();
      if (/^\\s*\\[WARMUP\\]/i.test(ex)) continue;
      const sets=String(r[p.idx.sets]||'').trim(), reps=String(r[p.idx.reps]||'').trim();
      if (/^0(?:\\.0+)?$/.test(sets) || /^0(?:\\.0+)?$/.test(reps)) failures.push({code:'ZERO_WORK_PLACEHOLDER_ROW',message:\`Week \${w} contains zero-set/zero-rep placeholder row for \${ex||'unknown exercise'}.\`});
    }
  }
  return failures;
}
`,
    'structural final QA'
  ],
  [
    'export function validatePhase15FinalProgram(program, intake={}) {\n  let baseResult={ok:true,flags:[]};\n',
    `export function validatePhase15FinalProgram(program, intake={}) {
  const structural=clientStructuralFailures(program);
  if (structural.length) throw new Phase15QualityError(structural);
  let baseResult={ok:true,flags:[]};
`,
    'run structural QA first'
  ]
]);

patchFile('phase14/scripts/build_phase15_runtime.mjs', [
  [
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n',
    '    [/\\tBroad Jump\\t/gi, "\\tBox Jump\\t"],\n    [/\\tDB Overhead Press\\t/gi, "\\tDumbbell Overhead Press\\t"],\n    [/\\tDumbbell OHP\\t/gi, "\\tDumbbell Overhead Press\\t"],\n    [/\\tDB Floor Press\\t/gi, "\\tDumbbell Floor Press\\t"],\n    [/\\tChest Supported Row\\t/gi, "\\tChest-Supported Row\\t"],\n    [/\\tChest-Supported DB Row\\t/gi, "\\tChest-Supported Row\\t"],\n    [/\\tDumbbell Hammer Curl\\t/gi, "\\tHammer Curl\\t"],\n',
    'OpenAI canonical row normalization'
  ]
]);