// engine/untested_benchmark_disclosure.js
//
// The masters intake said, in her own numbers, "Deadlift: not attempted since
// the injury", and said in her notes that she had not deadlifted since and was
// wary of it. The block she received neither programmed a deadlift nor mentioned
// one. Leaving it out is a defensible coaching decision. Leaving it unmentioned
// is not: she opens the file looking for the thing she is most anxious about,
// does not find it, and cannot tell whether it was considered or forgotten.
//
// So: a benchmark the athlete flags as untested, avoided or feared must either
// appear in the block or be accounted for in the guidance. The repair says the
// decision out loud, names the programmed work that covers the same pattern, and
// ties the return to the athlete's own clinician rather than to a date.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, classifyExercise } from './v38_movement_taxonomy.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(txt).join('\n');
  if (typeof v === 'object') return Object.values(v).map(txt).join('\n');
  return String(v);
}

// Deliberately a short list of benchmarks an athlete actually names. Matching
// loosely here would have the block apologising for exercises nobody asked about.
const BENCHMARKS = [
  { label: 'Deadlift', re: /\bdead\s?lift\b/i, pattern: CATEGORY.HIP_DOMINANT },
  { label: 'Back Squat', re: /\bback squat\b/i, pattern: CATEGORY.KNEE_DOMINANT },
  { label: 'Bench Press', re: /\bbench press\b/i, pattern: CATEGORY.HORIZONTAL_PUSH },
  { label: 'Overhead Press', re: /\b(?:overhead press|strict press)\b/i, pattern: CATEGORY.VERTICAL_PUSH },
  { label: 'Pull-up', re: /\bpull[- ]?ups?\b/i, pattern: CATEGORY.VERTICAL_PULL },
];

// "not attempted since", "hasn't deadlifted since", "nervous about", "avoided".
const UNTESTED = /\b(?:not attempted|never attempted|not tested|untested|has not|hasn't|have not|haven't)\b|\b(?:nervous|anxious|apprehensive|wary|scared|frightened)\b|\bavoid(?:s|ed|ing)?\b/i;

function intakeSignal(intake, benchmark) {
  const sources = [
    txt(intake.current_numbers),
    txt(intake.notes),
    txt(intake.pain),
    arr(intake.performance_markers).map(txt).join('\n'),
  ].join('\n');
  for (const line of sources.split(/\n|(?<=\.)\s+/)) {
    if (!benchmark.re.test(line)) continue;
    if (!UNTESTED.test(line)) continue;
    return line.trim();
  }
  return null;
}

function programmedNames(program) {
  const names = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (name && !/^\s*\[WARMUP\]/i.test(name)) names.push(name);
    }
  }
  return names;
}

function head(program) { return String(program || '').split(/START_WEEK1_TSV/i)[0]; }

export function collectUntestedBenchmarkFlags(program, intake = {}) {
  const source = String(program || '');
  if (!source.includes('START_WEEK1_TSV')) return [];
  const names = programmedNames(source);
  const guidance = head(source);

  const flags = [];
  for (const benchmark of BENCHMARKS) {
    const signal = intakeSignal(intake, benchmark);
    if (!signal) continue;
    if (names.some((n) => benchmark.re.test(n))) continue;
    if (benchmark.re.test(guidance)) continue;
    flags.push({
      code: 'V95_UNTESTED_BENCHMARK_UNADDRESSED',
      exercise: benchmark.label,
      signal,
      detail: `The intake flags ${benchmark.label} as untested or avoided ("${signal}"), and the block neither programs it nor mentions it. Leaving it out can be right; leaving it unsaid means the athlete cannot tell whether it was a decision or an oversight.`,
    });
  }
  return flags;
}

function coveringExposures(program, pattern) {
  const seen = new Map();
  for (const name of programmedNames(program)) {
    if (classifyExercise(name).category !== pattern) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].slice(0, 3);
}

function sentence(program, intake, flag) {
  const benchmark = BENCHMARKS.find((b) => b.label === flag.exercise);
  const covering = coveringExposures(program, benchmark.pattern);
  const many = covering.length > 1;
  const cover = covering.length
    ? ` ${covering.join(' and ')} ${many ? 'train' : 'trains'} the same pattern at a fraction of the spinal and joint cost, and ${many ? 'they are' : 'it is'} what ${many ? 'rebuild' : 'rebuilds'} the capacity a ${flag.exercise.toLowerCase()} would ask for.`
    : '';
  const injured = Boolean(String(intake.injuries || '').trim())
    || Boolean(intake.pain && intake.pain.active);
  const gate = injured
    ? ` Bring it back when you have finished a block like this one symptom-free and can re-test it with your clinician's input, rather than on a fixed date.`
    : ` Bring it back once this block is finished and the supporting work above is comfortable, rather than on a fixed date.`;
  return `About the ${flag.exercise.toLowerCase()}: your intake lists it as untested, and this block deliberately does not include one.${cover}${gate}`;
}

export function normalizeUntestedBenchmarkDisclosure(program, intake = {}) {
  const original = String(program || '');
  const flags = collectUntestedBenchmarkFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  const guidance = head(original);
  if (!guidance.trim()) return { program: original, repaired: false, repairs: [] };

  const added = flags.map((flag) => sentence(original, intake, flag));
  const rest = original.slice(guidance.length).replace(/^\s*/, '');
  const updated = `${guidance.trimEnd()}\n\n${added.join('\n\n')}\n\n${rest}`;
  return {
    program: updated,
    repaired: true,
    repairs: flags.map((f) => ({ type: 'untested_benchmark_disclosed', exercise: f.exercise })),
  };
}
