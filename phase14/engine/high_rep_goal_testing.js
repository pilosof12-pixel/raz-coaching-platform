// engine/high_rep_goal_testing.js
//
// Coach review, on the Tactical block: the athlete's goal is 14 strict pull-ups
// toward 18-20, and the program prescribes a near-maximal set every single week
// -- 14 @9.5, 14 @9-9.5, 15 @10, 14 @9-9.5 -- followed by singles. "Testing a
// near-max set every week isn't my preferred way to build a 20-rep pull-up set.
// The athlete needs more submaximal volume at meaningful set lengths."
//
// Weekly testing of a rep-max is the clear part and is what this repairs: one
// benchmark exposure in a block is normal, four is a block of tests. The build
// weeks after the first keep the same total reps, split into submaximal sets
// with reps in reserve.
//
// It stops deliberately short of the coach's full prescription (3-4 sets of
// 7-10). Going there raises this athlete's weekly pull-up volume by roughly
// forty percent, on someone whose primary goal is a 3 km run, who runs four
// times a week and has a shin-splint history. Choosing to spend that much more
// recovery on an accessory goal is a coaching decision, not a mechanical one, so
// the brief asks for it and this guarantees only the part that is unambiguous:
// the testing stops, the intensity comes down, and the volume does not go up.

import { parseWeek } from './v34_workload_accounting.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const MARKER = /reps in reserve on every set/i;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join('\n'); }

// "Improve strict pull-ups from 14 toward 18-20" -> { name: 'pull-up', current: 14 }
export function highRepGoal(intake = {}) {
  const goals = ['primary_goals', 'secondary_goals'].flatMap((k) => arr(intake[k])).map(String).join(' | ');
  const m = goals.match(/\b(?:strict\s+)?(pull[- ]?ups?|push[- ]?ups?|chin[- ]?ups?|dips?)\b[^|]{0,40}?\bfrom\s*(\d{1,3})\s*(?:toward|to|->)\s*(\d{1,3})/i);
  if (!m) return null;
  const current = Number(m[2]);
  if (!Number.isFinite(current) || current < 6) return null;
  return { movement: m[1].toLowerCase().replace(/s$/, ''), current, target: Number(m[3]) };
}

function movementMatcher(movement) {
  const base = movement.replace(/[- ]/g, '[- ]?');
  return new RegExp(`^\\s*${base}s?\\s*$`, 'i');
}

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function peakEffort(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  return nums && nums.length ? Math.max(...nums.map(Number)) : null;
}

// A set is a test when it asks for most of the athlete's demonstrated maximum at
// an effort that leaves nothing behind.
function isNearMaxTest(cells, parsed, effortIndex, goal, matcher) {
  const name = String(cells[parsed.exercise] || '').trim();
  if (!name || isWarmup(name) || !matcher.test(name)) return false;
  const reps = firstNum(cells[parsed.reps]);
  const effort = effortIndex >= 0 ? peakEffort(cells[effortIndex]) : null;
  if (!Number.isFinite(reps)) return false;
  return reps >= goal.current * 0.85 && effort != null && effort >= 8.5;
}

export function collectHighRepTestingFlags(program, intake = {}) {
  const goal = highRepGoal(intake);
  if (!goal) return [];
  const matcher = movementMatcher(goal.movement);
  const source = String(program || '');
  const weeksWithTest = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(source, week);
    if (!parsed) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    if (parsed.rows.some((c) => isNearMaxTest(c, parsed, effortIndex, goal, matcher))) weeksWithTest.push(week);
  }
  if (weeksWithTest.length < 3) return [];
  return [{
    code: 'V104_HIGH_REP_GOAL_TESTED_WEEKLY',
    movement: goal.movement,
    weeks: weeksWithTest,
    detail: `The ${goal.movement} goal moves from ${goal.current} toward ${goal.target}, and a near-maximal set appears in ${weeksWithTest.length} of the four weeks. That is a block of tests rather than a block of training: a rep-max is a benchmark to take once and then build from, and repeating it weekly spends the recovery that the submaximal set volume needed.`,
  }];
}

export function normalizeHighRepGoalTesting(program, intake = {}) {
  const original = String(program || '');
  const flags = collectHighRepTestingFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  const goal = highRepGoal(intake);
  const matcher = movementMatcher(goal.movement);
  const keep = flags[0].weeks[0]; // the first test stays: it is the benchmark.

  let candidate = original;
  const repairs = [];
  for (const week of flags[0].weeks) {
    if (week === keep) continue;
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    let changed = false;
    for (const cells of parsed.rows) {
      if (!isNearMaxTest(cells, parsed, effortIndex, goal, matcher)) continue;
      const reps = firstNum(cells[parsed.reps]);
      const sets = Math.max(1, firstNum(cells[parsed.sets]) || 1);
      const total = reps * sets;
      // Volume-neutral: the same total reps, in submaximal sets.
      const perSet = Math.max(3, Math.round(goal.current * 0.55));
      const newSets = Math.max(2, Math.round(total / perSet));
      cells[parsed.sets] = String(newSets);
      cells[parsed.reps] = String(perSet);
      if (effortIndex >= 0) cells[effortIndex] = '7';
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[parsed.notes] || '').trim();
        const line = `Submaximal set length, not a test: keep two to three reps in reserve on every set and stop the set the moment speed drops. The ${goal.current}-rep benchmark is taken once in this block, not every week.`;
        cells[parsed.notes] = MARKER.test(note) ? note : (note ? `${note} ${line}` : line);
      }
      changed = true;
      repairs.push({ type: 'high_rep_goal_submaximal_volume', week, from: `${sets}x${reps}`, to: `${newSets}x${perSet}` });
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}
