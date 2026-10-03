// Weeks 2-4 are built from Week 1 by rule, not written by the model.
//
// 62% of every generated token was the model writing out weeks 2-4: the same
// rows again with the numbers moved and the notes reworded. That is the slow
// part of a build, and it is also where most cross-week rules failed, because
// each week was re-decided in prose. The model now writes Week 1 -- the
// coaching decisions -- and this module progresses it, one rule per row:
//
//   strength with a known load (<= 6 reps)   single progression on load
//   hypertrophy (6-15 reps)                  double progression: reps, then load
//   goal skill                               sets, then reps or hold time; Week 4
//                                            keeps the Week 3 standard
//   power primer                             one more set at most; never grinds
//   accessory / trunk                        small rep or hold step
//   continuous endurance                     ~10% a week (endurance cluster),
//                                            one lever at a time
//   intervals                                one more repetition, pace unchanged
//   Week 4                                   consolidation: fewer sets, kept quality
//
// and a plateau the athlete reports gets an intensifier in Weeks 2-3: a drop
// set for a stalled hypertrophy target, a 2+2+1 cluster for a stalled strength
// lift. Everything this builds is then judged by the full quality chain, and
// the week-specific normalizers (marathon ladder, youth skill ladder, 3K
// specificity...) refine it exactly as they refine a model-written week.

import { parseWeek } from './v34_workload_accounting.js';
import { competitionWeek } from './v90_competition_week.js';
import { isLeadingSkill, isPowerPrimer, isAccessoryByName, skillFamilyOf } from './exercise_roles.js';

const ENDURANCE = /\b(?:run|running|jog|treadmill|bike|cycl\w*|ride|swim|rower|rowing|row erg|ski ?erg|ruck|backpack carry|march|walk|airbike|assault bike|elliptical|zone-2)\b/i;
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const num = (s) => { const m = String(s || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const round = (x, step) => Math.round(x / step) * step;
const fmt = (x) => String(Number.isInteger(x) ? x : Number(x.toFixed(2)));

function kgOf(load) {
  const m = String(load || '').match(/(\+?)\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? { plus: m[1] === '+', kg: Number(m[2]) } : null;
}
// Every kilogram figure in the cell moves by the same step, so a "175 kg top,
// 165 kg back-offs" row keeps its shape.
function setKg(load, kg) {
  const first = kgOf(load);
  const delta = first ? kg - first.kg : 0;
  return String(load).replace(/(\+?\s*)(\d+(?:\.\d+)?)(\s*kg\b)/gi, (x, p, n, u) => `${p}${fmt(Number(n) + delta)}${u}`);
}
// Replace the first number in a cell, keeping everything around it ("8/side").
function bumpFirst(cell, fn) {
  return String(cell).replace(/\d+(?:\.\d+)?/, (n) => fmt(fn(Number(n))));
}
function shiftRpe(cell, delta) {
  const s = String(cell || '');
  if (!/\d/.test(s)) return s;
  return s.replace(/\d+(?:\.\d+)?/g, (n) => fmt(Math.min(9.5, Math.max(4, Number(n) + delta))));
}
function setsTo(cells, idx, n) { cells[idx] = String(Math.max(1, Math.round(n))); }
// Week 4 takes a set off only where there are three or more; a two-set row
// keeps its sets and eases the effort instead.
function consolidate(c, p, sets) {
  if (sets >= 3) { setsTo(c, p.sets, sets - 1); return 'one set fewer'; }
  if (Number.isInteger(p.rpe) && /\d/.test(String(c[p.rpe] || ''))) { c[p.rpe] = shiftRpe(c[p.rpe], -0.5); return 'a little easier'; }
  return 'the same dose, done crisper';
}
const isRange = (reps) => /\d+\s*[-–]\s*\d+/.test(String(reps || ''));

// The athlete's estimated max for this lift, from their own numbers:
// "Back Squat: 205 kg 1RM" or "Back Squat: 140 kg x 5" (Epley).
export function knownMaxKg(intake = {}, name = '') {
  const core = String(name || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
  if (!core) return null;
  const lines = txt([intake.current_numbers, intake.performance_markers]).split(/\n|\|/);
  let best = null;
  for (const line of lines) {
    const l = line.toLowerCase();
    if (!l.includes(core)) continue;
    const m = l.match(/(\d+(?:\.\d+)?)\s*kg(?:\s*(?:x|×)\s*(\d+))?/);
    if (!m) continue;
    const kg = Number(m[1]);
    const reps = m[2] ? Number(m[2]) : 1;
    const e1rm = reps > 1 ? kg * (1 + reps / 30) : kg;
    best = Math.max(best || 0, e1rm);
  }
  return best;
}
// The athlete's own added load for this movement at the given reps or fewer,
// from "Weighted Pull-up: +32 kg x 3".
function addedBenchmark(intake = {}, name = '', reps = null) {
  const core = String(name || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
  let best = null;
  for (const line of txt([intake.current_numbers, intake.performance_markers]).split(/\n|\|/)) {
    const l = line.toLowerCase();
    if (!core || !l.includes(core.replace(/^weighted\s+/, '')) || !/weighted|\+/.test(l)) continue;
    const m = l.match(/\+\s*(\d+(?:\.\d+)?)\s*kg(?:\s*(?:x|×)\s*(\d+))?/);
    if (!m) continue;
    const r = m[2] ? Number(m[2]) : 1;
    if (reps != null && r < reps) continue;
    best = Math.max(best ?? 0, Number(m[1]));
  }
  return best;
}

// The athlete's current max reps for a skill, from their own numbers:
// "Strict ring muscle-up: 2 clean reps", "One-Arm Pull-up: 2 strict reps each arm".
const SKILL_BENCH_WORDS = {
  one_arm_pull: /one[- ]arm (?:pull|chin)/i, muscle_up: /muscle[- ]?up/i, handstand: /handstand push|hspu/i,
  planche: /planche push/i, front_lever: /front lever (?:pull|raise|row)/i,
};
export function skillMaxReps(intake = {}, name = '') {
  const fam = skillFamilyOf(name)?.key;
  const words = SKILL_BENCH_WORDS[fam];
  if (!words) return null;
  if (/handstand/.test(fam) && !/push|hspu/i.test(name)) return null;
  let best = null;
  for (const line of txt([intake.current_numbers, intake.performance_markers]).split(/\n|\||;/)) {
    if (!words.test(line) || /assist|band|negative|weighted|\+\s*\d/i.test(line)) continue;
    const m = line.match(/(\d+)\s*(?:clean |strict |good )?reps?\b/i);
    if (m) best = Math.max(best ?? 0, Number(m[1]));
  }
  return best;
}

// The heaviest load a set of `reps` at `rpe` should carry for that max.
function capFor(max, reps, rpeCell) {
  if (!max || !reps) return null;
  const nums = String(rpeCell || '').match(/\d+(?:\.\d+)?/g);
  const rpe = nums ? Math.max(...nums.map(Number)) : 8;
  const rir = Math.max(0, 10 - rpe);
  return Math.floor((max / (1 + (reps + rir) / 30)) / 2.5) * 2.5;
}

// Progression goes to the goals; maintenance and support lifts hold their
// dose (engine: "maintenance stays stable unless deliberately developed"). An
// athlete whose goal is general strength or size progresses every lift.
const LIFT_FAMILIES = [
  [/squat/i, /squat/i], [/deadlift|rdl/i, /deadlift/i], [/bench/i, /bench/i],
  [/overhead press|\bohp\b|shoulder press|push press/i, /overhead press|\bohp\b|press/i],
  [/pull-?up|chin-?up/i, /pull-?up|chin-?up|pullup|chinup/i], [/\brow\b/i, /\brow(?:ing)?\b/i],
  [/hip thrust/i, /hip thrust|glute/i], [/lunge|split squat/i, /lunge|split squat|single-leg/i],
  [/snatch|clean|jerk/i, /snatch|clean|jerk/i], [/dip\b/i, /\bdips?\b/i], [/curl/i, /arm|bicep/i],
  [/calf/i, /calf|calves/i],
];
export function progressesForGoal(name, intake = {}) {
  const goalText = txt([intake.primary_goals, intake.secondary_goals]);
  if (/hypertroph|muscle|\bsize\b|\bmass\b|bodybuild|aesthetic|physique|get stronger|general strength|stronger overall|כוח|מסה|היפרטרופיה/i.test(goalText)) return true;
  const fam = LIFT_FAMILIES.find(([row]) => row.test(String(name || '')));
  return Boolean(fam && fam[1].test(goalText));
}

function roleOf(name, reps, load, intake) {
  if (isWarmup(name)) return 'warmup';
  if (ENDURANCE.test(name) && /\d\s*(?:km|m|min|minutes?|sec|s)\b/i.test(reps)) return 'endurance';
  if (isLeadingSkill(name, intake)) return skillFamilyOf(name)?.key === 'olympic_lift' && kgOf(load) ? 'olympic' : 'skill';
  if (isPowerPrimer(name)) return 'power';
  if (isAccessoryByName(name)) return 'accessory';
  const r = num(reps);
  const goal = progressesForGoal(name, intake);
  if (!goal && !plateauTargets(intake).some((re) => re.test(String(name || '')))) return 'maintenance';
  if (r != null && r <= 6 && kgOf(load)) return 'strength';
  if (r != null && r <= 6) return 'strength_rpe';
  return 'hypertrophy';
}

// --- plateau intensifiers ------------------------------------------------------

const PLATEAU = /\b(?:plateau\w*|stuck|stall\w*|stagnat\w*|not (?:growing|progressing|improving)|hasn'?t (?:grown|moved|improved))\b|תקוע|תקיעה|פלטו/i;
const TARGETS = [
  { re: /\bcalf|calves|תאומים/i, row: /calf raise/i },
  { re: /\bchin-?ups?\b|\bpull-?ups?\b|מתח|צ'?ינ/i, row: /chin-?up|pull-?up/i },
  { re: /\bbench\b|\bchest\b|חזה/i, row: /bench press|chest press|dumbbell press/i },
  { re: /\bbiceps?\b|\barms?\b|יד קדמית/i, row: /curl/i },
  { re: /\btriceps?\b/i, row: /triceps|pushdown|skull ?crusher|extension/i },
  { re: /\bsquat\b|\bquads?\b/i, row: /squat/i },
  { re: /\bshoulders?\b|\bdelts?\b|כתפיים/i, row: /lateral raise|shoulder press|overhead press/i },
];
function txt(v) { return Array.isArray(v) ? v.map(txt).join(' | ') : v && typeof v === 'object' ? Object.values(v).map(txt).join(' | ') : String(v || ''); }

export function plateauTargets(intake = {}) {
  const sentences = txt([intake.notes, intake.current_numbers, intake.clarification_answers, intake.primary_goals, intake.secondary_goals, intake.plateaus])
    .split(/(?<=[.!?|\n])\s+/).filter((s) => PLATEAU.test(s));
  return TARGETS.filter((t) => sentences.some((s) => t.re.test(s))).map((t) => t.row);
}

// --- one row, one week ---------------------------------------------------------

function progressRow(cells, p, role, week, plateau) {
  const c = cells.slice();
  const sets = num(c[p.sets]) || 1;
  const reps = String(c[p.reps] || '');
  const kg = Number.isInteger(p.load) ? kgOf(c[p.load]) : null;
  const rpeIdx = p.rpe;
  let note = '';

  if (role === 'warmup') return c;

  if (role === 'strength' && kg.plus) {
    // An added load on bodyweight (a weighted pull-up, chin-up or dip). Epley
    // describes the whole mass moved, not the plate on the belt, so the RPE cap
    // below would read +30 kg as already at the ceiling and hold a primary goal
    // flat -- which is how run #166's +40 kg weighted pull-up was declared
    // "maintenance". It steps 2.5 kg a week instead, up to 2.5 kg past the
    // athlete's own benchmark for the same or fewer reps.
    const bench = addedBenchmark(p.intake, cells[p.exercise], num(reps));
    const ceiling = bench != null ? round(bench + 2.5, 1.25) : Infinity;
    const at = (x) => Math.min(x, Math.max(kg.kg, ceiling));
    if (week === 2) { c[p.load] = setKg(c[p.load], at(kg.kg + 2.5)); note = 'A small step on the belt from Week 1; same reps. If Week 1 felt above target, repeat it instead.'; }
    if (week === 3) {
      const t = at(kg.kg + 5);
      c[p.load] = setKg(c[p.load], t);
      // Past the athlete's own benchmark for these reps, the set gets shorter:
      // intensification, not a heavier copy of the same set.
      const r = num(reps);
      if (bench != null && t > bench && r != null && r > 1 && !isRange(reps)) c[p.reps] = bumpFirst(reps, (n) => n - 1);
      if (Number.isInteger(rpeIdx)) c[rpeIdx] = shiftRpe(c[rpeIdx], 0.5);
      note = t > (bench ?? Infinity) ? 'The block\'s heaviest week on the belt: heavier than your benchmark, so one rep fewer per set. Stop at the first rep that loses the strict line.' : 'The block\'s heaviest week on the belt. Stop the set at the first rep that loses the strict line.';
    }
    if (week === 4) { c[p.load] = setKg(c[p.load], at(kg.kg + 2.5)); note = `Consolidation at the Week 2 load: ${consolidate(c, p, sets)}.`; }
  } else if (role === 'strength') {
    const step = (pct) => Math.max(2.5, round(kg.kg * pct, 2.5));
    const cap = capFor(p.max, num(reps), c[rpeIdx]);
    const target = (x) => (cap ? Math.min(x, Math.max(kg.kg, cap)) : x);
    if (week === 2) { const t = target(kg.kg + step(0.025)); c[p.load] = setKg(c[p.load], t); note = t > kg.kg ? 'A small load step from Week 1; same reps and RPE ceiling. If Week 1 felt above target, repeat it instead.' : 'Same load as Week 1, done with better speed; it is already near your current ceiling for these reps.'; }
    if (week === 3) {
      if (Number.isInteger(rpeIdx)) c[rpeIdx] = shiftRpe(c[rpeIdx], 0.5);
      const t = target(kg.kg + step(0.05));
      c[p.load] = setKg(c[p.load], t);
      note = 'The block\'s heaviest week. Stop the set if bar speed or technique drops.';
    }
    if (week === 4) { const t = target(kg.kg + step(0.025)); c[p.load] = setKg(c[p.load], t); note = `Consolidation at the Week 2 load: ${consolidate(c, p, sets)}, so you finish fresher, not flatter.`; }
  } else if (role === 'olympic') {
    // A competition lift is loaded by percentage of the demonstrated max, in
    // 1 kg steps: about 85% in Week 2 and into the 88-90% intensification band
    // by Week 3 at singles or doubles. Week 4 consolidates at the Week 2 load;
    // a competition week is shaped by the competition-week rules after this.
    const max = p.max;
    const pct = (x) => (max ? Math.round(max * x) : null);
    const r = num(reps);
    if (week === 2) { const t = Math.max(kg.kg, pct(0.85) ?? kg.kg + 2); c[p.load] = setKg(c[p.load], t); note = 'Build toward the heavy week: crisp, fast singles or doubles.'; }
    if (week === 3) {
      const t = Math.max(kg.kg, pct(0.89) ?? kg.kg + 4);
      c[p.load] = setKg(c[p.load], t);
      if (r != null && r > 2) c[p.reps] = bumpFirst(reps, () => 2);
      note = 'The intensification week: the heaviest clean singles or doubles of the block. Stop at the first slow pull or soft catch.';
    }
    if (week === 4) { const t = Math.max(kg.kg, pct(0.85) ?? kg.kg + 2); c[p.load] = setKg(c[p.load], t); note = `Consolidation at the Week 2 load: ${consolidate(c, p, sets)}.`; }
  } else if (role === 'maintenance') {
    if (week === 2 || week === 3) note = 'Held at the Week 1 dose: this lift supports your goals, so it keeps its place without taking recovery from them.';
    if (week === 4) note = `Consolidation: ${consolidate(c, p, sets)}.`;
  } else if (role === 'strength_rpe') {
    if (week === 2) note = 'Same reps; choose a load that sits at the target RPE. Add a little if Week 1 felt easy.';
    if (week === 3) { if (Number.isInteger(rpeIdx)) c[rpeIdx] = shiftRpe(c[rpeIdx], 0.5); note = 'Push the load slightly: about half an RPE harder than Week 2, technique unchanged.'; }
    if (week === 4) note = `Consolidation at a Week 2 feel: ${consolidate(c, p, sets)}.`;
  } else if (role === 'hypertrophy') {
    const r = num(reps);
    const range = isRange(reps);
    if (week === 2) {
      if (!range && r != null) c[p.reps] = bumpFirst(reps, (n) => n + (n >= 10 ? 2 : 1));
      note = range ? 'Double progression: same load, work toward the top of the range on every set.' : 'Double progression: same load, one or two more reps per set.';
    }
    if (week === 3) {
      if (kg) c[p.load] = setKg(c[p.load], kg.kg + Math.max(2.5, round(kg.kg * 0.025, 2.5)));
      else if (!range && r != null) c[p.reps] = bumpFirst(reps, (n) => n + (n >= 10 ? 4 : 2));
      note = kg ? 'Double progression: reps earned, so the load steps up and reps return to the Week 1 target.' : 'Double progression: the top of what Week 2 earned on every set.';
    }
    if (week === 4) {
      const w3 = progressRow(cells, p, role, 3, false);
      c[p.reps] = w3[p.reps];
      if (Number.isInteger(p.load)) c[p.load] = w3[p.load];
      note = `Consolidation: keep the Week 3 reps and load, ${consolidate(c, p, sets)}.`;
    }
    if (plateau && (week === 2 || week === 3)) note += ' Plateau intensifier: on the last set, a drop set -- take about 20% off and continue twice, no rest between drops.';
  } else if (role === 'skill' && p.skillMax != null && !isRange(reps) && num(reps) != null) {
    // A rep goal near the athlete's max progresses the LENGTH of one set, not
    // every set. Coach on run #166: OAP at a 2-rep max going to 2x3 is not the
    // same stimulus as a ring row going 8 to 9, and five consecutive
    // muscle-ups are not more total singles. The day's top set lengthens up to
    // the current max; the short volume sets only grow in number; one rep past
    // the max is offered in Week 3 only if Week 2 was crisp, never prescribed;
    // Week 4 keeps the length reached at lower volume.
    const r = num(reps);
    const m = p.skillMax;
    const grow = Math.min(r + 1, Math.max(m, r));
    if (p.topSet) {
      if (week === 2) {
        if (r < m) { c[p.reps] = bumpFirst(reps, () => grow); setsTo(c, p.sets, Math.max(1, Math.ceil((sets * r) / grow))); note = `One rep longer per set, up to your current ${m}; every rep strict and crisp.`; }
        else { if (sets < 4) setsTo(c, p.sets, sets + 1); note = 'Same set length, one more set of the same quality.'; }
      }
      if (week === 3) {
        const w2 = progressRow(cells, p, role, 2, false);
        c[p.reps] = w2[p.reps]; c[p.sets] = w2[p.sets];
        const len = num(w2[p.reps]);
        note = `Same as Week 2. Make the first set ${len + 1} reps only if every Week 2 set was crisp; otherwise keep it at ${len}.`;
      }
      if (week === 4) {
        const w2 = progressRow(cells, p, role, 2, false);
        c[p.reps] = w2[p.reps];
        const w2sets = num(w2[p.sets]) || sets;
        setsTo(c, p.sets, Math.min(sets, w2sets >= 3 ? w2sets - 1 : w2sets));
        note = 'Consolidation: keep the set length you reached, with less volume than Week 2.';
      }
    } else {
      if (week === 2) note = 'Same short sets; every rep crisp.';
      if (week === 3) { if (sets < 5) setsTo(c, p.sets, sets + 1); note = 'One more short set: more clean reps in total, the same length.'; }
      if (week === 4) note = 'Consolidation: Week 1 volume, same quality.';
    }
  } else if (role === 'skill') {
    const hold = reps.match(/(\d+)\s*(?:s|sec|seconds)\b/i);
    if (week === 2) { if (sets < 5) setsTo(c, p.sets, sets + 1); note = 'One more set of the same quality as Week 1. Stop a set at the first clearly worse rep.'; }
    if (week === 3) {
      if (sets < 5) setsTo(c, p.sets, sets + 1);
      if (hold) c[p.reps] = reps.replace(hold[0], `${Number(hold[1]) + 5}${hold[0].slice(hold[1].length)}`);
      else if (!isRange(reps) && num(reps) != null && num(reps) <= 3) c[p.reps] = bumpFirst(reps, (n) => n + 1);
      note = hold ? 'Five seconds longer per hold, same body line.' : 'One more clean rep per set if every Week 2 rep was crisp; otherwise repeat Week 2.';
    }
    if (week === 4) {
      const w3 = progressRow(cells, p, role, 3, false);
      c[p.reps] = w3[p.reps];
      if (Number.isInteger(p.load)) c[p.load] = w3[p.load];
      setsTo(c, p.sets, sets);
      note = 'Consolidation: Week 1 set count, keeping the best Week 3 standard.';
    }
  } else if (role === 'power') {
    if (week === 2) note = 'Same dose; every rep fast and fully reset.';
    if (week === 3) { if (sets < 5) setsTo(c, p.sets, sets + 1); note = 'One more set only if speed held through Week 2; stop when it drops.'; }
    if (week === 4) note = `Consolidation: maximal intent, ${consolidate(c, p, sets)}.`;
  } else if (role === 'accessory') {
    const hold = reps.match(/(\d+)\s*(?:s|sec|seconds)\b/i);
    if (week === 2) note = 'Same dose; cleaner reps.';
    if (week === 3) {
      if (hold) c[p.reps] = reps.replace(hold[0], `${Number(hold[1]) + 5}${hold[0].slice(hold[1].length)}`);
      else if (!isRange(reps) && num(reps) != null) c[p.reps] = bumpFirst(reps, (n) => n + 2);
      note = hold ? 'Five seconds longer per hold.' : 'Two more reps per set at the same effort.';
    }
    if (week === 4) {
      const w3 = progressRow(cells, p, role, 3, false);
      c[p.reps] = w3[p.reps];
      note = `Consolidation: keep the Week 3 reps, ${consolidate(c, p, sets)}.`;
    }
    if (plateau && (week === 2 || week === 3)) note += ' Plateau intensifier: on the last set, a drop set -- take about 20% off and continue twice, no rest between drops.';
  } else if (role === 'endurance') {
    const intervals = sets >= 2;
    if (intervals) {
      if (week === 2) { setsTo(c, p.sets, sets + 1); note = 'One more repetition; pace and recovery unchanged.'; }
      if (week === 3) { setsTo(c, p.sets, Math.min(Math.ceil(sets * 1.5), sets + 2)); note = 'One more repetition again; same pace. Volume is the only lever this week.'; }
      if (week === 4) { setsTo(c, p.sets, Math.max(2, sets - 1)); note = 'Consolidation: fewer repetitions at the same pace, finishing fresh.'; }
    } else {
      const factor = { 2: 1.1, 3: 1.2, 4: 0.85 }[week];
      const unitKm = /\d\s*km\b/i.test(reps);
      c[p.reps] = bumpFirst(reps, (n) => (unitKm ? Math.max(1, round(n * factor, 0.5)) : Math.max(5, round(n * factor, 5))));
      // "Easy" only where the row is easy. A race-pace brick at RPE 7 called
      // "same easy effort" is a low-intensity label on race pace, and
      // LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE refused it week by
      // week: three repairs on run #165's triathlete.
      const rpeNums = String(Number.isInteger(rpeIdx) ? c[rpeIdx] : '').match(/\d+(?:\.\d+)?/g);
      const rpeTop = rpeNums ? Math.max(...rpeNums.map(Number)) : null;
      const easy = (rpeTop != null && rpeTop <= 5) || (rpeTop == null && /\b(?:easy|conversational|zone ?2|recovery|aerobic)\b/i.test(`${cells[p.notes] || ''} ${Number.isInteger(p.load) ? cells[p.load] : ''}`));
      const effort = easy ? 'same easy effort' : 'same pace and effort';
      note = week === 4
        ? (easy ? 'Consolidation: shorter, fully easy, finishing fresher than Week 3.' : 'Consolidation: shorter at the same pace, finishing fresher than Week 3.')
        : `About 10% more than ${week === 2 ? 'Week 1' : 'Week 2'}; ${effort}. Distance or time is the only lever.`;
    }
  }

  // A stalled strength lift: a 2+2+1 cluster at a load the athlete could lift
  // for a hard double at most. Where the max is known (and the load is not an
  // added load on bodyweight, which Epley does not describe) that load is set.
  if (plateau && (role === 'strength' || role === 'strength_rpe') && (week === 2 || week === 3)) {
    c[p.reps] = '5 (2+2+1)';
    if (kg && !kg.plus && p.max) {
      const double = Math.floor(p.max / (1 + 2 / 30) / 2.5) * 2.5 - (week === 2 ? 2.5 : 0);
      if (double > kg.kg) c[p.load] = setKg(c[p.load], double);
    }
    note = 'Plateau intensifier: a cluster, 2+2+1 with 15-20 s between pieces, at a load you could lift for a hard double at most.';
  }
  if (Number.isInteger(p.notes) && note) {
    const cue = String(cells[p.notes] || '').split(/(?<=[.!?])\s+/)[0] || '';
    // Only an endurance row needs its identity carried ("long run" is what makes
    // it the marathon session); elsewhere a carried sentence only repeats
    // Week 1's wording, including wording a later rule would flag.
    const keep = role === 'endurance' && cue && !/\d|\bweek\b|first|baseline|start|introduc|new\b|then\b|next\b/i.test(cue) && cue.length <= 160;
    c[p.notes] = keep ? `${cue.trim()} ${note}` : note;
  }
  return c;
}

// --- the block -------------------------------------------------------------------

// Who gets the Week-1-only build. A block that ends in its competition (a meet
// week, a fight week) is a taper whose weeks are each shaped differently --
// intensification, then a descent into Day 0 -- and the coach rules and the
// taper rules disagree about it unless the whole run-in is written together.
// Those blocks keep the full model-written block; everyone else gets Week 1
// from the model and Weeks 2-4 from these rules.
export function week1OnlyApplies(intake = {}, now = Date.now()) {
  try { return !competitionWeek(intake, now); } catch { return true; }
}

export function buildWeeksFromWeekOne(program, intake = {}) {
  const src = String(program || '');
  const unchanged = { program: src, built: false, rows: 0 };
  if (/START_WEEK2_TSV/i.test(src)) return unchanged;
  if (!week1OnlyApplies(intake)) return unchanged;
  const w1 = parseWeek(src, 1);
  if (!w1) return unchanged;
  const header = w1.header;
  const lower = header.map((h) => String(h || '').trim().toLowerCase());
  const p = { ...w1, rpe: lower.findIndex((h) => /target rpe|^rpe|effort/.test(h)) };
  if (p.rpe < 0) p.rpe = undefined;
  const plateauRows = plateauTargets(intake);

  const blocks = [];
  for (const week of [2, 3, 4]) {
    // The top set of a skill on a day: its row with the most reps.
    const topIndex = new Map();
    let lastDay = '';
    w1.rows.forEach((cells, i) => {
      const day = String(cells[p.day] || '').trim() || lastDay;
      lastDay = day;
      const fam = skillFamilyOf(cells[p.exercise])?.key;
      if (!fam) return;
      const key = `${day}|${fam}`;
      const r = num(cells[p.reps]) ?? 0;
      if (!topIndex.has(key) || r > (num(w1.rows[topIndex.get(key)][p.reps]) ?? 0)) topIndex.set(key, i);
    });
    const tops = new Set(topIndex.values());
    const rows = w1.rows.map((cells, i) => {
      const name = cells[p.exercise];
      const role = roleOf(name, cells[p.reps], Number.isInteger(p.load) ? cells[p.load] : '', intake);
      const plateau = plateauRows.some((re) => re.test(String(name || '')));
      const ctx = { ...p, max: knownMaxKg(intake, name), intake, skillMax: role === 'skill' ? skillMaxReps(intake, name) : null, topSet: tops.has(i) };
      return progressRow(cells, ctx, role, week, plateau).join('\t');
    });
    blocks.push(`START_WEEK${week}_TSV\n${header.join('\t')}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`);
  }
  const end = src.search(/END_WEEK1_TSV/i) + 'END_WEEK1_TSV'.length;
  const out = `${src.slice(0, end)}\n\n${blocks.join('\n\n')}${src.slice(end)}`;
  return { program: out, built: true, rows: w1.rows.length * 3 };
}

// The instruction that turns a build into a Week-1-only one. Carried after
// the compact prompt, so it overrides the four-block output contract there.
export function week1OnlySection(intake = {}) {
  if (!week1OnlyApplies(intake)) return '';
  return [
    '',
    '',
    '=== WEEK 1 ONLY ===',
    'This overrides the output contract above. Write the short client intro, the pain/substitution guidance relevant to this athlete, and ONLY the START_WEEK1_TSV ... END_WEEK1_TSV block.',
    'Do not write Weeks 2-4 and do not write a weeks 2-4 progression note: the system builds Weeks 2-4 from your Week 1 with fixed rules (single progression on loaded strength, double progression on hypertrophy work, sets then reps or hold time on goal skills, about 10% a week on one endurance lever, goal lifts progressing while support lifts hold, Week 4 consolidation).',
    'So Week 1 is the template for the whole block: every session, exercise, order, dose and coaching note must be complete and correct, and every row must name its real role (for example identify the long run as the long run).',
    'No exercise can appear later in this block that is not in Week 1, so do not promise one ("Deadlift comes back once..."): a movement held back for now belongs to the next block, and should be described that way.',
  ].join('\n');
}

// The program cut back to its intro and Week 1, so Weeks 2-4 can be rebuilt
// from a repaired Week 1. Text after the last week (guidance, closing notes)
// is kept.
export function keepWeekOne(program) {
  const src = String(program || '');
  const start = src.search(/START_WEEK2_TSV/i);
  const endMatch = [...src.matchAll(/END_WEEK4_TSV/gi)].pop();
  if (start < 0 || !endMatch) return null;
  const end = endMatch.index + endMatch[0].length;
  return `${src.slice(0, start).replace(/\s+$/, '')}\n${src.slice(end)}`;
}
