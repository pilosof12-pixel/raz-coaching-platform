// Grade a finished live acceptance run, without a second paid call.
//
// After every run so far the grading has been done by hand, which is slow and
// is where my scores drifted 0.33 above the coach's. This reads the delivered
// programs and reports only what is mechanically checkable: the findings
// coach_rules reproduces, the gates that would still refuse the program, and
// the structural checks that have cost us builds. It deliberately prints no
// overall score for an archetype the coach has not given dimension weights
// for, because a partial score looks like a number and is not one.
//
//   node scripts/grade_live_run.mjs [dir]
//
// Default dir is docs/qa/live-three-avatar/latest.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectTsvRowShapeFlags } from '../engine/tsv_row_shape_repair.js';
import { collectPaceRangeOrderFlags } from '../engine/pace_range_order.js';
import { deliveryVerdict } from '../engine/delivery_verdict.js';

// The acceptance evidence lives at the repository root, not under phase14, and
// the workflow writes both a fresh directory and a published `latest`. Resolve
// against the script rather than the caller's cwd so it works from either.
const here = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  path.join(here, '..', '..', 'docs', 'qa', 'live-three-avatar', 'latest'),
  path.join(here, '..', '..', 'docs', 'qa', 'live-three-avatar'),
  path.join(here, '..', 'docs', 'qa', 'live-three-avatar', 'latest'),
];
const dir = process.argv[2]
  || CANDIDATES.find((d) => fs.existsSync(path.join(d, 'result.json')))
  || CANDIDATES[0];

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

const resultRaw = read(path.join(dir, 'result.json'));
if (!resultRaw) {
  console.error(`no result.json under ${dir}`);
  process.exit(1);
}
const result = JSON.parse(resultRaw);

console.log(`run of ${result.timestamp}  runtime ${result.runtime}`);
console.log(`head ${String(result.head_sha || '').slice(0, 8)}\n`);

const summary = [];
for (const entry of result.results || []) {
  const program = read(path.join(dir, `${entry.id}-program.txt`));

  // A delivered program is not necessarily a clean one. When four repair
  // attempts cannot clear a rule, the salvage path ships the best candidate
  // rather than throwing away a complete program and charging for nothing --
  // a deliberate decision, and the right one -- and it records what stayed
  // broken at the front of the job detail.
  //
  // This script used to read only the `QA trace:` part of that detail and print
  // PASS, which is how run #160 got reported as two of two when one of the two
  // shipped carrying SPORT_DAY_COUPLING_VIOLATION and
  // LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE. The engine said so
  // plainly, at the very start of the detail; the grading hid it. A report that
  // overstates what shipped is worse than no report, so an unresolved rule now
  // decides the verdict.
  const { verdict, unresolved, effort, degraded, timing } = deliveryVerdict(entry);
  const line = [
    verdict.padEnd(5),
    entry.id.padEnd(20),
    `${String(entry.seconds).padStart(5)}s`,
    `${String(entry.program_chars).padStart(6)} chars`,
  ].join('  ');
  console.log(line);
  if (unresolved.length) {
    console.log(`        DELIVERED WITH ${unresolved.length} UNRESOLVED RULE(S): ${unresolved.join(', ')}`);
    console.log('        this program reached a customer carrying known violations');
  }
  if (degraded) {
    console.log(`        WRITTEN AT ${String(effort).toUpperCase()} EFFORT after de-escalation`);
    console.log('        completion was bought with quality; read this one before trusting it');
  }
  if (entry.detail) {
    const trace = String(entry.detail).match(/QA trace: ([^.]*)/);
    if (trace) console.log(`        trace: ${trace[1]}`);
  }
  if (!entry.ok) {
    console.log(`        ${entry.status}: ${entry.error || entry.detail || ''}`.slice(0, 200));
    summary.push({ id: entry.id, ok: false, unresolved });
    continue;
  }
  if (!program) {
    console.log('        delivered but no program file in this directory');
    summary.push({ id: entry.id, ok: true, program: false, unresolved });
    continue;
  }

  // Structural checks that have each cost a paid build at least once.
  const shape = collectTsvRowShapeFlags(program);
  const pace = collectPaceRangeOrderFlags(program);
  console.log(`        tsv row shape: ${shape.length} flag(s)   descending pace ranges: ${pace.length}`);

  const seconds = entry.seconds;
  if (timing) {
    console.log(`        timing: model ${timing.model_s}s across ${timing.calls} call(s), engine ${timing.engine_s}s, build total ${timing.total_s}s`);
    const harnessOverhead = seconds - timing.total_s;
    if (harnessOverhead > 5) console.log(`        plus ${harnessOverhead}s outside the build: deploy wait, queueing and polling`);
  }
  if (seconds > 300) {
    console.log(`        over the 300s bar by ${seconds - 300}s`);
    if (timing) {
      const cuttable = timing.engine_s + Math.max(0, seconds - timing.total_s);
      console.log(`        of which ${timing.model_s}s is the model and about ${cuttable}s is ours`);
    }
  }

  summary.push({ id: entry.id, ok: true, program: true, shape: shape.length, pace: pace.length, seconds, unresolved });
}

console.log('\n--- what still needs a human ---');
console.log('coach_rules reports findings, not scores, and two of these archetypes have');
console.log('no dimension weights, so no overall number is printed for them. Run');
console.log('gradeProgram against a program with its intake to list findings.');
const clean = summary.filter((s) => s.ok && !(s.unresolved || []).length);
const dirty = summary.filter((s) => s.ok && (s.unresolved || []).length);
console.log(`\n${summary.filter((s) => s.ok).length} of ${summary.length} delivered`);
console.log(`${clean.length} of ${summary.length} clean${dirty.length ? `, ${dirty.length} carrying unresolved rules: ${dirty.map((s) => s.id).join(', ')}` : ''}`);
const low = summary.filter((s) => s.degraded);
if (low.length) console.log(`${low.length} written at low effort after de-escalation: ${low.map((s) => s.id).join(', ')}`);
if (dirty.length) {
  console.log('\nA delivered program with unresolved rules is not a pass. Reporting it as');
  console.log('one is how a launch decision gets made on a number that was never true.');
}

export { summary };
