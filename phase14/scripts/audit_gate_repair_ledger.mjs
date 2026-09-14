// Which of our gates can actually be answered?
//
// Fifty-five paid avatar builds produced twenty-eight programs. Thirteen of the
// twenty-seven failures were dead builds: QA raised a flag, the loop asked the
// model to fix it four times, and the same flag came back every time. In twelve
// of those thirteen the killing flag was already present on an earlier attempt.
// Re-asking the model is not a repair strategy for a flag it cannot answer.
//
// Every one of those was found by a paid run, one at a time. This finds them
// without one. For every blocking code the engine can raise it asks three
// questions:
//
//   1. Is there a deterministic repair anywhere for it? A gate with no repair
//      depends entirely on the model complying, and if it does not, the
//      customer is charged and gets nothing.
//   2. Has anything ever demonstrated it converging -- a test, a stress
//      perturbation -- or is it untested?
//   3. Has it killed a live build?
//
// A code that is unrepaired AND untested AND has killed a build is not a risk,
// it is a known defect. A code that is unrepaired and untested is the next one.
//
//   node scripts/audit_gate_repair_ledger.mjs            summary
//   node scripts/audit_gate_repair_ledger.mjs --full     every code

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readAll(dir, skip = /node_modules/) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.test(e.name)) walk(p); continue; }
      if (/\.(js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const engineFiles = [...readAll(path.join(root, 'engine')), ...readAll(path.join(root, 'scripts'))];
const testFiles = readAll(path.join(root, 'test'));
const testText = testFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const stressText = fs.readFileSync(path.join(root, 'scripts', 'stress_test_convergence.mjs'), 'utf8');

// Every code, and the module that raises it.
const CODE_RE = [
  /code:\s*['"]([A-Z][A-Z0-9_]{4,})['"]/g,
  /RetriableValidationError\(\s*['"]([A-Z][A-Z0-9_]{4,})['"]/g,
  /\bfail\(\s*['"]([A-Z][A-Z0-9_]{4,})['"]/g,
  /Phase15QualityError\(\[\{\s*code:\s*['"]([A-Z][A-Z0-9_]{4,})['"]/g,
];
const raisedIn = new Map(); // code -> Set(file)
for (const file of engineFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const re of CODE_RE) {
    for (const m of src.matchAll(re)) {
      if (!raisedIn.has(m[1])) raisedIn.set(m[1], new Set());
      raisedIn.get(m[1]).add(path.relative(root, file));
    }
  }
}

// A module that raises a flag and also exports a repair is suggestive, and no
// more than that. Adding one repair to a module made every code that module
// raises look answered -- which is how three codes quietly left the debt list
// without anything having been done about them. So this is recorded as a lead
// and never counted as proof. The only evidence that a code can be answered is
// a test or a stress perturbation that names it and shows it clearing.
const repairExports = new Map(); // file -> [repair function names]
for (const file of engineFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const names = [...src.matchAll(/export function ((?:repair|normalize|swap|fix|enforce|trim|apply)\w*)/g)].map((m) => m[1]);
  if (names.length) repairExports.set(path.relative(root, file), names);
}

// Which repairs the production chain actually calls. A repair nobody calls is
// the defect that killed two builds in one run.
const bundleSrc = fs.readFileSync(path.join(root, 'engine', 'repairable_validation_bundle.js'), 'utf8');
const v35Src = fs.readFileSync(path.join(root, 'engine', 'v35_deterministic_repair.js'), 'utf8');
const wiredText = bundleSrc + '\n' + v35Src;

// Codes observed killing a live build, read from the published acceptance
// evidence rather than from memory.
const LIVE_KILLERS = new Map(Object.entries({
  ADVANCED_HYBRID_OAP_SPECIFICITY: '2026-08-28 advanced_hybrid',
  WEEKLY_MRV_EXCEEDED: '2026-08-29 advanced_hybrid',
  V35_SECONDARY_VOLUME_CREEP: '2026-08-29 advanced_hybrid',
  V34_PROGRESSION_LANGUAGE_MISMATCH: '2026-08-30/31 weightlifter_peak x3',
  REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED: '2026-08-31 weightlifter_peak',
  V74_NOVEL_EXERCISE_NEAR_EVENT: '2026-08-31 mma_fight_camp',
  V75_EFFORT_TOO_HIGH_DURING_CUT: '2026-09-04 weightlifter_meet_week',
  SPORT_DAY_COUPLING_VIOLATION: '2026-09-04/11/12 mma + dual_event x4',
  V77_FIGHT_WEEK_NOT_ON_THE_CLOCK: '2026-09-04 mma, 2026-09-05 meet_week',
  V82_POWER_EXPOSURE_DUPLICATED: '2026-09-11/12 mma_fight_camp x2',
  EVENT_PROGRESSING_SESSION_MISSING: '2026-09-11 postpartum_runner',
  V91_TIMELINE_VIEWS_DISAGREE: '2026-09-12 mma_fight_camp',
  TSV_ROW_COLUMN_COUNT_MISMATCH: '2026-09-12 mma_fight_camp',
}));

// Can this code block a build at all?
//
// Three modules -- v53, v87, v88 -- export collectors that nothing in
// production calls. Only their briefs are used, to instruct the model. Their
// codes cannot refuse a program, so counting them as dead-build risk inflates
// the number and points the work at the wrong place. A code is reachable only
// if the exported function that raises it is called somewhere inside the
// module closure production actually loads.
const PRODUCTION_ROOTS = [
  'engine/repairable_validation_bundle.js',
  'engine/phase15_final_qa.js',
  'engine/phase15_program_qa.js',
  'engine/v35_deterministic_repair.js',
  'server.phase15.js',
];

function importsOf(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, 'utf8');
  const out = [];
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.relative(root, path.resolve(path.dirname(abs), m[1]));
    if (fs.existsSync(path.join(root, target))) out.push(target);
  }
  return out;
}

const reachableModules = new Set();
(function walk(list) {
  for (const f of list) {
    if (reachableModules.has(f)) continue;
    reachableModules.add(f);
    walk(importsOf(f));
  }
})(PRODUCTION_ROOTS);

// Module reachability alone says nothing: the planner imports v87 to build a
// brief, which makes the module loaded and its collectors still dead. So the
// walk is over FUNCTIONS. A function is live when something production calls
// reaches it, and a function that is only ever called by its own module's other
// dead functions stays dead.
const bodies = new Map(); // name -> body text
for (const file of reachableModules) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const starts = [...src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const body = src.slice(m.index, end);
    bodies.set(m[1], (bodies.get(m[1]) || '') + '\n' + body);
  });
}

// Everything the runtime itself calls, plus the two aggregate entry points.
const runtimeSrc = fs.existsSync(path.join(root, 'server.phase15.js'))
  ? fs.readFileSync(path.join(root, 'server.phase15.js'), 'utf8') : '';
const entries = new Set(['collectRepairableValidationFailures', 'validateRepairableProgramBundle',
  'validatePhase15FinalProgram', 'validatePhase15Program', 'repairDeterministicContradictions']);
for (const m of runtimeSrc.matchAll(/\b(\w+)\s*\(/g)) if (bodies.has(m[1])) entries.add(m[1]);

const liveFunctions = new Set();
(function reach(names) {
  for (const name of names) {
    if (liveFunctions.has(name)) continue;
    liveFunctions.add(name);
    const body = bodies.get(name);
    if (!body) continue;
    const called = [...body.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1]).filter((n) => bodies.has(n) && n !== name);
    reach(called);
  }
})([...entries]);

// The exported function a code sits inside, so we can ask whether anything
// calls it.
function enclosingExport(file, code) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const at = src.indexOf(code);
  if (at < 0) return null;
  const before = src.slice(0, at);
  const matches = [...before.matchAll(/export function (\w+)/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

// Severity is the third thing that decides whether a code can refuse anything.
// The tactical audit emits findings at 'hard' and 'advisory', and its only
// consumer keeps the hard ones -- so an advisory-only code cannot block a build
// however loudly it is worded. Counting those as dead-build risk sent me
// writing a repair for a rule that says of itself "this is a contextual
// default, not a universal minimum".
function advisoryOnly(code) {
  let seen = false;
  for (const file of engineFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(new RegExp(`code:\\s*['"]${code}['"]([\\s\\S]{0,200})`, 'g'))) {
      const near = m[1];
      const sev = near.match(/severity:\s*['"](\w+)['"]/);
      if (!sev) return false;      // emitted with no severity at all: assume it blocks
      if (sev[1] !== 'advisory') return false;
      seen = true;
    }
  }
  return seen;
}

const ledger = [];
for (const [code, files] of [...raisedIn].sort()) {
  const modules = [...files];
  const repairsNearby = modules.flatMap((f) => repairExports.get(f) || []);
  const wired = repairsNearby.filter((n) => new RegExp(`\\b${n}\\(`).test(wiredText));
  const owners = modules.map((f) => enclosingExport(f, code)).filter(Boolean);
  // Raised by a module production loads, from a function production calls.
  const advisory = advisoryOnly(code);
  const reachable = !advisory
    && modules.some((f) => reachableModules.has(f))
    && (!owners.length || owners.some((fn) => liveFunctions.has(fn)));
  ledger.push({
    code,
    modules,
    owners,
    advisory,
    reachable,
    repairs: repairsNearby,
    wired,
    tested: testText.includes(code),
    stressed: stressText.includes(code),
    killedLive: LIVE_KILLERS.get(code) || '',
  });
}

const live = ledger.filter((r) => r.reachable);
const proven = live.filter((r) => r.tested || r.stressed);
const unproven = live.filter((r) => !r.tested && !r.stressed);
const leadOnly = unproven.filter((r) => r.wired.length);
const provenKillers = ledger.filter((r) => r.killedLive);

console.log(`GATE / REPAIR LEDGER  --  ${ledger.length} codes defined, ${live.length} of them able to refuse a build\n`);
console.log(`  ${String(ledger.length - live.length).padStart(3)}  cannot block: advisory-only, or nothing production calls raises them`);
console.log(`  ${String(proven.length).padStart(3)}  are proven: a test or a stress case names the code and shows it clearing`);
console.log(`  ${String(unproven.length).padStart(3)}  are unproven: nothing has ever demonstrated one of these being answered`);
console.log(`      of which ${leadOnly.length} sit in a module that exports some repair -- a lead, not proof`);
console.log(`  ${String(provenKillers.length).padStart(3)}  have already killed a paid build\n`);

console.log('--- codes that have killed a live build ---');
for (const r of provenKillers.sort((a, b) => a.code.localeCompare(b.code))) {
  const state = [r.wired.length ? 'repaired' : 'UNREPAIRED', r.tested ? 'tested' : '', r.stressed ? 'stressed' : '']
    .filter(Boolean).join(' + ');
  console.log(`  ${r.code.padEnd(42)} ${state.padEnd(30)} ${r.killedLive}`);
}

const shown = process.argv.includes('--full') ? unproven : unproven.slice(0, 25);
console.log(`\n--- ${shown.length} of ${unproven.length} unproven${process.argv.includes('--full') ? '' : ' (use --full for all)'} ---`);
for (const r of shown) console.log(`  ${r.code.padEnd(48)}${r.wired.length ? 'lead: ' + r.wired[0] : ''}`);

fs.writeFileSync(path.join(root, 'docs', 'qa', 'gate_repair_ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`\nledger written to docs/qa/gate_repair_ledger.json`);
