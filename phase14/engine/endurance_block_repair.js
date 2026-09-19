// engine/endurance_block_repair.js
//
// Four findings that had checks and no answers, on the two athletes the repair
// chain never touched.
//
// The tactical 3 km runner is the worst program the coach has scored (7.6) and
// the repair chain applied literally nothing to it: every one of its five
// findings was detection-only, so the block shipped with all of them. The
// advanced hybrid was the same story with three.
//
// Each repair here takes its number from the athlete's own intake rather than
// from a judgement about training. The ruck distance the athlete already
// tolerates, the goal pace they stated, the frequency they asked for: these are
// facts the program contradicted, and putting a fact back is not coaching.

import { rows, toleratedDistance, goalFamilyTiers, benchmarks, accessoryRedundancy } from './coach_rules.js';
import { parseWeek } from './v34_workload_accounting.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { rebuild } from './tsv_rows.js';
import { THRESHOLDS } from './coach_standard.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const arr = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).map(String);
const secs = (t) => { const m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const RUCK = /ruck|loaded (?:march|carry walk)|backpack carry|weighted vest walk/i;
const RUN = /\brun\b|\brunning\b|interval|tempo|repeat|treadmill/i;

// --- 1. a ruck shorter than the distance the athlete already covers ----------

export function repairRuckDistance(program, intake = {}) {
  const goal = `${arr(intake.secondary_goals).join(' ')} ${arr(intake.primary_goals).join(' ')}`;
  if (!/ruck/i.test(goal)) return { program: String(program || ''), changed: false, moves: [] };
  const tol = toleratedDistance(intake, /ruck/i);
  if (!tol) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '');
      if (isWarmup(name) || !RUCK.test(name)) return;
      const reps = String(row[parsed.reps] || '');
      const explicitKm = Number((reps.match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1]);
      // The ruck is usually written as time at a pace rather than a distance --
      // "60 min" at "9:25-9:35/km" is 6.4 km, and a repair that only understood
      // kilometres left the defect exactly where it found it.
      const mins = Number((reps.match(/(\d+(?:\.\d+)?)\s*min/i) || [])[1]);
      const paceText = `${row[parsed.load] || ''} ${reps}`;
      const pm = paceText.match(/(\d{1,2}):(\d{2})\s*(?:-\s*(\d{1,2}):(\d{2}))?\s*\/\s*km/i);
      const paceMin = pm ? (Number(pm[1]) + Number(pm[2]) / 60) : null;
      const km = Number.isFinite(explicitKm) ? explicitKm
        : (Number.isFinite(mins) && paceMin ? mins / paceMin : NaN);
      if (!Number.isFinite(km) || km >= tol.low) return;
      if (!Number.isFinite(explicitKm) && Number.isFinite(mins) && paceMin) {
        const needMins = Math.ceil(tol.low * paceMin);
        row[parsed.reps] = reps.replace(/(\d+(?:\.\d+)?)\s*min/i, `${needMins} min`);
        if (Number.isInteger(parsed.notes)) {
          row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} ${needMins} minutes at this pace is about ${tol.low} km, which is the distance you already ruck with this load without symptoms.`.trim();
        }
        moves.push({ week, from: Number(km.toFixed(1)), to: tol.low });
        changed = true;
        return;
      }
      // The bottom of the tolerated range, never the top: the athlete's own
      // evidence says this distance is already covered without symptoms, and
      // anything beyond it would be a training decision rather than a fact.
      row[parsed.reps] = reps.replace(/(\d+(?:\.\d+)?)\s*km\b/i, `${tol.low} km`);
      if (Number.isInteger(parsed.notes)) {
        row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} Held at ${tol.low} km, which is the distance you already ruck with this load without symptoms.`.trim();
      }
      moves.push({ week, from: km, to: tol.low });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 2. quality running that never approaches the goal pace ------------------

export function repairGoalSpeed(program, intake = {}) {
  const goal = arr(intake.primary_goals).join(' ');
  const g = goal.match(/(\d+(?:\.\d+)?)\s*km/i);
  const times = [...goal.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => secs(m[1])).filter(Boolean);
  if (!g || !times.length) return { program: String(program || ''), changed: false, moves: [] };
  const goalSecPerKm = Math.min(...times) / Number(g[1]);
  if (!Number.isFinite(goalSecPerKm) || goalSecPerKm <= 0) return { program: String(program || ''), changed: false, moves: [] };

  // The standard the coach applies: 95% of goal speed by week 3, 97% by week 4.
  const floorFor = (week) => (week >= 4 ? 0.97 : week === 3 ? 0.95 : null);
  // Rounded DOWN, always. Rounding to the nearest second put a week-3 pace at
// 253 s/km against a 252.6 floor, which satisfies nobody: the repair ran, the
// program changed, and the finding stayed exactly where it was.
const mmss = (s) => { const t = Math.floor(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  let out = String(program || '');
  const moves = [];
  for (let week = 3; week <= 4; week += 1) {
    const floor = floorFor(week);
    const parsed = parseWeek(out, week);
    if (!floor || !parsed) continue;
    const slowestAllowed = goalSecPerKm / floor;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '');
      if (isWarmup(name) || !RUN.test(name)) return;
      // Only a rep prescribed as a distance is quality work; an easy run by
      // duration is not what this standard is about.
      if (!/\d+\s*(?:m|km)\b/i.test(String(row[parsed.reps] || ''))) return;
      const loadCol = Number.isInteger(parsed.load) ? parsed.load : null;
      if (loadCol === null) return;
      const text = String(row[loadCol] || '');
      const per400 = text.match(/(\d{1,2}:\d{2})\s*(?:-\s*(\d{1,2}:\d{2}))?\s*(\/|per)\s*(\d+)\s*m\b(?!in)/i);
      const perKm = text.match(/(\d{1,2}:\d{2})\s*(?:-\s*(\d{1,2}:\d{2}))?\s*(\/|per)\s*km/i);
      if (per400) {
        const sep = per400[3];
        const metres = Number(per400[4]);
        const fastest = secs(per400[1]);
        const current = fastest / (metres / 1000);
        if (current <= slowestAllowed) return;
        const target = slowestAllowed * (metres / 1000);
        // Keep the program's own phrasing. Rewriting "per 600 m" as "/ 600 m"
        // changes the author's voice for no reason and makes a diff look larger
        // than the change actually is.
        row[loadCol] = text.replace(per400[0], `${mmss(target)} ${sep} ${metres} m`);
        moves.push({ week, from: Math.round(current), to: Math.round(slowestAllowed) });
        changed = true;
      } else if (perKm) {
        const current = secs(perKm[1]);
        if (current <= slowestAllowed) return;
        row[loadCol] = text.replace(perKm[0], `${mmss(slowestAllowed)} ${perKm[3]} km`);
        moves.push({ week, from: current, to: Math.round(slowestAllowed) });
        changed = true;
      }
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 3. a movement serving an improvement goal that never moves --------------

export function repairImprovementGoalFlat(program, intake = {}) {
  const tiered = goalFamilyTiers(intake);
  if (!tiered.length) return { program: String(program || ''), changed: false, moves: [] };
  // Primary and secondary both, but only ever through the load.
  //
  // The first version raised sets as well and broke the rule that holds
  // accessory volume while a primary quality advances -- correctly, because
  // that rule is about VOLUME. Restricting to primary goals made it pass and
  // left five real findings unrepaired: a weighted pull-up sat at +22.5 kg for
  // four weeks against a goal of going from 14 strict reps to 18-20.
  //
  // Adding weight to a bar while the set count stays exactly where it was does
  // not raise accessory volume, so the two rules do not actually disagree. The
  // reps path is gone for the same reason it was removed before: a rep is
  // volume, and a rep added to an assisted one-arm pull-up is a training
  // decision rather than a restored fact.
  const serves = (name) => tiered.some((g) => g.family.test(name));

  // Which named movements are identical in every week they appear.
  const byName = new Map();
  for (const r of rows(program)) {
    if (isWarmup(r.name) || !serves(r.name)) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const flat = [];
  for (const [name, list] of byName) {
    const weeks = [...new Set(list.map((r) => r.week))];
    if (weeks.length < THRESHOLDS.IDENTICAL_WEEKS_DEFECT_AFTER) continue;
    const sig = (w) => list.filter((r) => r.week === w).map((r) => `${r.sets}|${r.reps}|${r.load}`.toLowerCase()).sort().join('~');
    if (!weeks.every((w) => sig(w) === sig(weeks[0]))) continue;
    flat.push(name);
  }
  if (!flat.length) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  // Week 1 is the athlete's established dose and stays. Later weeks climb from
  // it, and week 4 holds week 3 rather than peaking into a week that may be a
  // taper -- the smallest change that makes the block progress at all.
  const STEP_KG = 2.5;
  for (let week = 2; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const step = Math.min(week, 3) - 1;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (!flat.includes(name)) return;
      // A week that says it is holding is holding on purpose. Week 4 of a block
      // often reads "Hold the best Week 3 level", which is consolidation rather
      // than a flat prescription -- the defect is the three weeks before it. The
      // first version skipped the whole movement when any week said hold, so it
      // never repaired anything that consolidated at the end, which is most of
      // what a good block does.
      if (/maintain|maintenance|held|hold|unchanged|deliberately|consolidat/i.test(String(row[parsed.notes] || ''))) return;
      const loadCol = Number.isInteger(parsed.load) ? parsed.load : null;
      const text = loadCol === null ? '' : String(row[loadCol] || '');
      const kg = text.match(/([+-]?\s*\d+(?:\.\d+)?)\s*kg/i);
      if (kg) {
        const base = Number(String(kg[1]).replace(/\s+/g, ''));
        const next = base + STEP_KG * step;
        row[loadCol] = text.replace(kg[0], `${text.trim().startsWith('+') || String(kg[1]).includes('+') ? '+' : ''}${next} kg`);
        moves.push({ week, movement: name, from: base, to: next });
        changed = true;
        return;
      }
      // Without a number on the bar there is nothing to move deterministically.
      // Adding reps to an assisted one-arm pull-up prescribed at "minimum
      // assistance for clean reps" would be inventing a training decision, not
      // restoring a fact, so these are left for a human and stay reported.
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}



// --- 4. a competition lift with no number on the bar --------------------------
//
// "The athlete cannot tell whether Week 1 is 70% or 92%." A lift that serves a
// goal stated as a number, prescribed across four weeks without a single kilo
// or percentage, is the one place the coach is unambiguous that RPE alone is
// not enough -- and it is also the one place a repair has something exact to
// put there, because the intake carries the max.
//
// The week 3 figure is his, not ours: 88-90% for the snatch and 89-90% for the
// clean and jerk. The other weeks are placed below it so the block arrives
// there rather than starting there, and week 4 holds week 3 rather than
// climbing into what may be a competition week.


const OLY_WEEK_FRACTION = { 1: 0.82, 2: 0.85, 3: 0.88, 4: 0.88 };
const round2p5 = (kg) => Math.floor(kg / 2.5) * 2.5;

export function repairUnanchoredCompetitionLoad(program, intake = {}) {
  const tiered = goalFamilyTiers(intake, ['primary']);
  const targeted = tiered.filter((g) => /\d+\s*(?:kg|km|m\b)|\d{1,2}:\d{2}/i.test(g.goal));
  if (!targeted.length) return { program: String(program || ''), changed: false, moves: [] };

  const marks = benchmarks(intake);
  const maxFor = (name) => {
    const b = marks.find((x) => new RegExp(String(x.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(name)
      || new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(x.name));
    return b && Number.isFinite(b.kg) ? b.kg : null;
  };

  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.load)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (isWarmup(name) || !targeted.some((g) => g.family.test(name))) return;
      const text = String(row[parsed.load] || '');
      // Only where there is genuinely no number to read.
      if (/\d+(?:\.\d+)?\s*(?:kg|%)|\d{1,2}:\d{2}/.test(text)) return;
      const max = maxFor(name);
      if (!max) return;
      const fraction = OLY_WEEK_FRACTION[week];
      const kg = round2p5(max * fraction);
      row[parsed.load] = `${kg} kg (${Math.round(fraction * 100)}% of current max)`;
      moves.push({ week, movement: name, kg, pct: Math.round(fraction * 100) });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

export const ENDURANCE_REPAIRS = [
  repairRuckDistance, repairGoalSpeed, repairUnanchoredCompetitionLoad, repairImprovementGoalFlat,
];

// Deliberately not in the list above. This one deletes rows, and the repairs
// that want a slot -- a missing benchmarked movement, an untrained race
// component -- must get first claim on them by converting them into something
// that serves a goal. Run before those, it would throw away the very rows they
// were about to put to use.

// --- 5. the same job done twice ----------------------------------------------
//
// Two or three rowing variations in one week, none of them serving anything the
// athlete asked for. The coach charges this on almost every block we have and
// his prescription is not to redistribute the volume but to stop doing it:
// "Use the saved volume for direct work or leave it as recovery."
//
// So this removes rather than reshuffles, and it runs late on purpose. The
// repairs that want a slot -- a missing benchmarked movement, an untrained race
// component -- have already had first claim on these rows by converting them
// into something that serves a goal. What reaches here is what nothing needed.
//
// It keeps the most specific variant of the function and drops the rest. A
// barbell row is a more trainable thing than a cable row, so where both exist
// the machine goes first.

const SPECIFICITY = [
  [/barbell row|pendlay|bent-?over/i, 3],
  [/chest-?supported|t-?bar|landmine/i, 2],
  [/dumbbell|single-?arm|one-?arm/i, 1],
  [/cable|machine|seated|pec deck|fly/i, 0],
];
const specificityOf = (name) => (SPECIFICITY.find(([re]) => re.test(name)) || [null, 2])[1];

// Only the upper-body accessory duplication the coach actually charges. The
// first version trimmed any redundant function and took the foundation work out
// from under the gymnast's skills -- V38_SKILL_WITHOUT_FOUNDATION on every
// youth program, and the same on the masters return and the postpartum block,
// where the "redundant" squat pattern is the rebuild. A row serving no stated
// GOAL is not a row serving nothing, and deleting lower-body or skill-support
// work on that reasoning is how a trim becomes an injury.
const TRIMMABLE_FUNCTIONS = new Set(['horizontal_pull', 'horizontal_press']);

// Did removing those rows raise anything that was not there before?
function brokeSomething(before, after, intake) {
  const count = (program) => {
    try {
      return auditProgramStructure(program, intake).map((f) => f.code || f.rule).filter(Boolean);
    } catch { return null; }
  };
  const a = count(before);
  const b = count(after);
  if (!a || !b) return true; // cannot tell, so do not risk it
  const tally = (list) => list.reduce((m, c) => ({ ...m, [c]: (m[c] || 0) + 1 }), {});
  const ta = tally(a);
  const tb = tally(b);
  return Object.keys(tb).some((code) => (tb[code] || 0) > (ta[code] || 0));
}

export function repairAccessoryRedundancy(program, intake = {}) {
  const findings = accessoryRedundancy(program, intake)
    .filter((f) => String(f.functions || '').split(',').every((fn) => TRIMMABLE_FUNCTIONS.has(fn.trim())));
  if (!findings.length) return { program: String(program || ''), changed: false, moves: [] };

  // Every exercise the rule named as surplus, per week.
  const surplus = new Map();
  for (const f of findings) {
    for (const m of String(f.detail).matchAll(/\(([^)]+)\)/g)) {
      for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const key = f.week ?? 'all';
        if (!surplus.has(key)) surplus.set(key, new Set());
        surplus.get(key).add(name.toLowerCase());
      }
    }
  }

  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const names = surplus.get(week) || surplus.get('all');
    if (!names || names.size < 2) continue;
    const parsed = parseWeek(out, week);
    if (!parsed) continue;

    const present = parsed.rows
      .map((cells, index) => ({ index, name: String(cells[parsed.exercise] || '').trim() }))
      .filter((r) => r.name && !isWarmup(r.name) && names.has(r.name.toLowerCase()));
    if (present.length < 2) continue;

    // Keep one -- the most specific, earliest on a tie -- and drop the others.
    const keep = present.slice().sort((a, b) => specificityOf(b.name) - specificityOf(a.name) || a.index - b.index)[0];
    const drop = new Set(present.filter((r) => r.index !== keep.index).map((r) => r.index));
    if (!drop.size) continue;

    const cells = parsed.rows.filter((_, i) => !drop.has(i));
    const candidate = rebuild(out, parsed, cells);

    // Put it back if it broke something. A row can serve no stated goal and
    // still be the foundation a skill stands on: the gymnast's Ring Push-up
    // reads as duplicate horizontal pressing beside a Ring Dip, and removing it
    // raised V38_SKILL_WITHOUT_FOUNDATION on every youth program in the suite.
    // Enumerating every such dependency would mean modelling the skill graph
    // here and being wrong about it later, so the repair checks its own work
    // instead and declines when the answer is worse.
    if (brokeSomething(out, candidate, intake)) continue;
    out = candidate;
    moves.push({ week, kept: keep.name, dropped: present.filter((r) => drop.has(r.index)).map((r) => r.name) });
  }
  return { program: out, changed: moves.length > 0, moves };
}
