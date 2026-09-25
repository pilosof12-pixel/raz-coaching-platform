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

import { rows, toleratedDistance, goalFamilyTiers, benchmarks, accessoryRedundancy, repeatedSprintExposure, sprintDistanceSpecificity, taperAgainstSource, repeatedSprintProgression } from './coach_rules.js';
import { parseWeek } from './v34_workload_accounting.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { strengthSessionAccountingFlags } from './phase15_elite_guardrails.js';
import { statedGoalFamilies } from './coach_rules.js';
import { taperPowerSpike } from './coach_race_block_rules.js';
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
  // One duration for the whole block, never a falling one.
  //
  // The minutes were computed from each week's own pace against the same target
  // distance, so as the athlete got faster the same distance took fewer minutes
  // and the repair wrote 76, 75, 74, 74. Read back, that is a carry whose
  // duration falls while its pace improves and whose distance never moves --
  // exactly what V38_CARRY_PACE_ONLY_PROGRESSION exists to catch. The chain was
  // manufacturing the blocking defect, and on run81 it did so every time.
  //
  // Holding the largest requirement fixes it honestly rather than by hiding it:
  // the duration stays put, and the further distance the athlete covers at a
  // faster pace is the progression the rule is asking to see.
  let heldMins = 0;
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
        const needMins = Math.max(Math.ceil(tol.low * paceMin), heldMins);
        heldMins = needMins;
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
      // And an easy run that says so is not quality work either, whatever its
      // reps column looks like.
      //
      // That duration test was the only thing separating the two, and this
      // athlete's easy runs are prescribed as "7 km" -- so the repair drove
      // them to 95% and 97% of 3K goal speed and left the words "Easy
      // conversational pace" in front of them. Weeks 3 and 4 told a runner
      // whose 3K pace is 4:30/km to run easy at 4:12 and 4:07. The gate that
      // caught it looks for exactly these words, so the repair reads them too;
      // a repair and the rule that judges it must agree about what a row is.
      // The pace cell only, and "recovery" is not in the list. Reading the note
      // too caught the interval rows, whose notes say things like "full
      // recovery between reps" -- so the quality work stopped being repaired
      // and week 3 came out at 91% of goal speed instead of the 95% it needs.
      // The label that matters sits where the pace is written.
      const paceCell = String(row[Number.isInteger(parsed.load) ? parsed.load : 0] || '');
      if (/\b(?:zone\s*[- ]?2|easy|conversational|low[- ]?intensity)\b/i.test(paceCell)) return;
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
// His bands are not the same for the two lifts: 88-90% on the snatch and 89-90%
// on the clean and jerk.
const bandFor = (name, week) => (week >= 3 && /clean|jerk/i.test(name) ? 0.89 : OLY_WEEK_FRACTION[week]);
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

  // Loading modes under which the movement carries no external kilograms at all.
  // Narrower than "not a number on purpose": "RPE-selected load" on a snatch is
  // an autoregulation instruction on a lift that HAS a benchmark max, and
  // anchoring it to a percentage is the whole job of this repair. "Bodyweight"
  // is different in kind -- it names the load, and adding plates to it changes
  // which exercise is being done.
  const NON_KILOGRAM_PRESCRIPTION = /bodyweight|body ?weight|\bband\b|assist|unloaded|no added (?:load|weight)/i;
  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.load)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;

    // Only the heaviest set of each lift moves. A block has heavy singles and
    // lighter technique work in the same week, and the first version raised
    // every row of the movement to the band -- which turns a speed day into a
    // second heavy day and introduced an intensification finding on a program
    // that did not have one.
    const topRowFor = new Map();
    cells.forEach((row, index) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (isWarmup(name) || !targeted.some((g) => g.family.test(name))) return;
      const kgHere = Number((String(row[parsed.load] || '').match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1]) || 0;
      const best = topRowFor.get(name);
      if (!best || kgHere > best.kg) topRowFor.set(name, { index, kg: kgHere });
    });

    cells.forEach((row, rowIndex) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (isWarmup(name) || !targeted.some((g) => g.family.test(name))) return;
      const text = String(row[parsed.load] || '');
      const max = maxFor(name);
      if (!max) return;
      const fraction = bandFor(name, week);
      const kg = round2p5(max * fraction);
      const written = Number((text.match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1]);

      // Nothing to read: write the number. A cell naming how the movement is
      // loaded is not nothing -- it is the prescription. "Bodyweight" on a light
      // foundational Pull-up carries no digits, so this branch read it as blank
      // and wrote a percentage of the athlete's WEIGHTED pull-up max over it,
      // turning a deliberate 2x5 at RPE 6.5 the day after a heavy pull day into a
      // near-maximal weighted set. UNBENCHMARKED_VARIATION_LOAD_TOO_ASSERTIVE
      // then correctly rejected it, the repair rewrote it on the next attempt,
      // and run #138 spent four model calls and 8.5 minutes in that loop before
      // shipping unresolved.
      if (NON_KILOGRAM_PRESCRIPTION.test(text)) return;
      if (!/\d+(?:\.\d+)?\s*(?:kg|%)|\d{1,2}:\d{2}/.test(text)) {
        row[parsed.load] = `${kg} kg (${Math.round(fraction * 100)}% of current max)`;
        moves.push({ week, movement: name, kg, pct: Math.round(fraction * 100) });
        changed = true;
        return;
      }

      // A number that is there but short of the band the coach named. His
      // figure for week 3 is 88-90% on the snatch and 89-90% on the jerk, and a
      // block that tops out at 86% has not peaked -- which is the whole point
      // of the last heavy week. Raising it is the same arithmetic as writing it
      // in the first place, so it was strange to do one and not the other.
      if (week < 3 || !Number.isFinite(written) || written >= kg) return;
      if (topRowFor.get(name)?.index !== rowIndex) return;
      row[parsed.load] = text.replace(/(\d+(?:\.\d+)?)\s*kg/i, `${kg} kg`)
        .replace(/\(\s*\d+(?:\.\d+)?\s*%[^)]*\)/i, `(${Math.round(fraction * 100)}% of current max)`);
      if (!/%/.test(row[parsed.load])) row[parsed.load] = `${row[parsed.load]} (${Math.round(fraction * 100)}% of current max)`;
      moves.push({ week, movement: name, from: written, kg, pct: Math.round(fraction * 100) });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

export const ENDURANCE_REPAIRS = [
  repairRuckDistance, repairGoalSpeed, repairUnanchoredCompetitionLoad, repairImprovementGoalFlat,
  repairRepeatedSprintRecovery, repairSprintDistance, repairRepeatedSprintProgression, repairTaperOpening,
];

// repairTaperPowerSpike is deliberately NOT in the list above. It caps the power
// volume a tapering week may carry, and three repairs that run later in the v35
// chain can all put power work back into that week -- the ballistic swap most of
// all, which exists to buy ballistic exposure near an event and does not know a
// taper from a build. Run here it was measuring a week that had not finished
// being written: live run #119 delivered a week 3 trimmed to seven power sets
// and then refilled to eighteen, and the coach's 0.45 for a taper that
// multiplies a quality was charged on the delivered program. It is now invoked
// next to the competition-week budget, for the reason already written there:
// that is the first point at which the week's real volume can be judged.



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

// The client asked for a number of strength days. A trim may not answer that
// request by quietly turning one of them into a mobility session.
//
// run96 asked for five and came back with four: the accessory trim took the
// rows that made Wednesday a strength day and left Dead Bug, Pallof Press and
// a carry behind, which is a day the athlete turns up for and does no
// resistance training. REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED caught it and
// refused the build, and the structural audit this guard reads does not raise
// that code -- the third repair this session to clear its own target while
// breaking a rule the audit cannot see.
function weekOneShape(program) {
  const m = String(program || '').match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);
  if (!m) return null;
  const lines = m[1].split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split('\t').map((x) => x.trim().toLowerCase());
  return {
    idx: Object.fromEntries(header.map((x, i) => [x, i])),
    rows: lines.slice(1).map((x) => ({ cells: x.split('\t') })),
  };
}
function lostARequestedStrengthDay(before, after, intake) {
  const flagsFor = (program) => {
    const shape = weekOneShape(program);
    if (!shape) return null;
    try { return strengthSessionAccountingFlags(program, intake, shape).length; }
    catch { return null; }
  };
  const a = flagsFor(before);
  const b = flagsFor(after);
  if (a === null || b === null) return false;
  return b > a;
}

// Did removing those rows raise anything that was not there before?
function brokeSomething(before, after, intake, ignore = []) {
  if (lostARequestedStrengthDay(before, after, intake)) return true;
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
  return Object.keys(tb).some((code) => !ignore.includes(code) && (tb[code] || 0) > (ta[code] || 0));
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

// --- 6. a taper that takes up jumping ----------------------------------------
//
// "Going from 2 to 17 power sets is not preservation. It is a new training
// emphasis." A week that cuts total volume and simultaneously multiplies a
// quality is introducing it, and the coach charged 0.45 for doing that to an
// athlete whose stated injury is an achilles that flares.
//
// His prescription is exact, so this follows it rather than inventing a taper:
// keep four to six low-volume power sets across the whole week, using exercises
// the athlete was already doing, and do not introduce anything new. So the
// repair drops the unfamiliar movements first -- a broad jump that appears for
// the first time in week 3 is the clearest case of a new emphasis -- and then
// trims sets off what remains until the week is inside his cap.

// His number, from the run #124 review. The cap was 6, which he still charged
// 0.30 for: "keep total added ballistic work to about 2 to 4 sets for the week",
// because the race-specific sled and transition work already supplies the fast
// intent. Six was my reading of "a dose a taper can carry"; four is his.
const TAPER_POWER_SET_CAP = 4;
const TAPER_POWER_FLOOR = 4;
const POWER_MOVEMENT = /explosive|plyo|box jump|broad jump|depth jump|bound|jump squat|hop|med(?:icine)? ball|throw|snap down/i;

export function repairTaperPowerSpike(program, intake = {}) {
  const spikes = taperPowerSpike(program, intake);
  if (!spikes.length) return { program: String(program || ''), changed: false, moves: [] };

  // What the athlete was already doing, from the weeks that were still building.
  const familiar = new Set();
  const spikeWeeks = new Set(spikes.map((s) => s.week));
  for (const r of rows(program)) {
    if (spikeWeeks.has(r.week) || isWarmup(r.name)) continue;
    if (POWER_MOVEMENT.test(r.name)) familiar.add(r.name.toLowerCase());
  }

  let out = String(program || '');
  const moves = [];
  for (const spike of spikes) {
    const parsed = parseWeek(out, spike.week);
    if (!parsed) continue;
    let cells = parsed.rows.map((c) => [...c]);

    const powerRows = () => cells
      .map((c, index) => ({ index, name: String(c[parsed.exercise] || '').trim() }))
      .filter((r) => r.name && !isWarmup(r.name) && POWER_MOVEMENT.test(r.name));
    const total = () => powerRows().reduce((n, r) => n + (Number(cells[r.index][parsed.sets]) || 0), 0);

    // Reduce the volume; do not delete the movement.
    //
    // Two earlier versions dropped whole exercises and both were refused by the
    // session audit, correctly: taking the jumps out emptied a Tuesday in one
    // block and a competition-week day in another. It was also unnecessary. The
    // finding is about a quality being MULTIPLIED in a week that is cutting
    // volume, so bringing the volume back down answers it -- week 3 of the
    // Hyrox goes from seventeen power sets to seven without losing a single
    // movement, and the athlete keeps the exposure at a dose a taper can carry.
    const dropped = [];
    const trimmed = [];
    let guard = 0;
    while (total() > TAPER_POWER_SET_CAP && guard < 60) {
      guard += 1;
      const setsOf = (r) => Number(cells[r.index][parsed.sets]) || 0;
      const biggest = powerRows().sort((a, b) => setsOf(b) - setsOf(a))[0];
      if (!biggest) break;

      if (setsOf(biggest) > 1) {
        cells[biggest.index][parsed.sets] = String(setsOf(biggest) - 1);
        trimmed.push(biggest.name);
        continue;
      }

      // Every power row is down to a single set and the week is still over the
      // cap, so trimming cannot finish the job. Two earlier versions of this
      // repair deleted movements and both emptied sessions, which is why it
      // trims and never deletes -- but that rule leaves seven single-set rows
      // untouchable, and run116's taper sits at seven against a cap of four for
      // exactly that reason.
      //
      // The coach's own instruction on this finding was to delete: "keep total
      // added ballistic work to about 2 to 4 sets for the week ... and remove
      // the Friday Box Jump". So the last resort is removing a whole row, with
      // the guard the earlier versions lacked: never take a day below two
      // working rows, so no session can be emptied.
      const dayOf = (i) => String(cells[i][parsed.day] || '').trim();
      const workingRowsOn = (day) => cells.filter((c, i) => dayOf(i) === day
        && String(c[parsed.exercise] || '').trim() && !isWarmup(String(c[parsed.exercise] || ''))).length;
      const removable = powerRows().filter((r) => workingRowsOn(dayOf(r.index)) > 2);
      if (!removable.length) break;
      const victim = removable[removable.length - 1];
      dropped.push(victim.name);
      cells.splice(victim.index, 1);
    }

    if (!dropped.length && !trimmed.length) continue;
    const candidate = rebuild(out, parsed, cells);
    // A taper sheds work on purpose, so losing a movement category in the week
    // being tapered is the intended outcome rather than damage. The coach's own
    // instruction here was to take the broad jumps out; a guard that refuses
    // because the week now trains one fewer pattern is refusing the fix.
    if (brokeSomething(out, candidate, intake, ['V38_MISSING_MOVEMENT_CATEGORY'])) continue;
    out = candidate;
    moves.push({ week: spike.week, from: spike.power, to: total(), dropped: [...new Set(dropped)] });
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 7. a shuttle that is quality work wearing repeatability's name ----------
//
// "Thursday shuttle at 90% with 60 s recovery is not repeated-sprint work."
// "Shuttle recovery stays at 65-75 s, too long to be repeated-sprint work."
// He charged this on all three versions of the footballer, at 0.45, 0.35, 0.30
// and 0.25, and it is the single most expensive thing he found on that athlete.
//
// The work is already in the block. What makes it repeatability work rather
// than speed work is the recovery being deliberately incomplete, and the number
// that decides it is his: under 60 seconds. So this changes a rest cell rather
// than adding a session to a footballer who already plays five times a week and
// a match -- which would be a fatigue decision, and is not what the finding is
// about.

const RSA_REST_SECONDS = 45;
const RSA_MIN_EFFORT = 95;
const SPRINTABLE = /sprint|shuttle|accel|flying|prowler|sled/i;

export function repairRepeatedSprintRecovery(program, intake = {}) {
  const findings = repeatedSprintExposure(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.rest)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (isWarmup(name) || !SPRINTABLE.test(name)) return;
      if ((Number(row[parsed.sets]) || 0) < 3) return;
      const rest = String(row[parsed.rest] || '');
      const secs = /(\d+):(\d{2})/.test(rest)
        ? Number(RegExp.$1) * 60 + Number(RegExp.$2)
        : Number((rest.match(/(\d+)\s*s/i) || [])[1]) || null;
      // Effort as well as recovery. His words on one of these: "Thursday
      // shuttle at 90% with 60 s recovery is not repeated-sprint work" -- both
      // halves have to be true, and a block that fixes only the clock still
      // fails the definition.
      let raisedEffort = null;
      const pcts = [...String(row.join(' ')).matchAll(/(\d{2,3})\s*%/g)].map((m) => Number(m[1]));
      if (pcts.length && Math.max(...pcts) < RSA_MIN_EFFORT) {
        raisedEffort = Math.max(...pcts);
        row.forEach((cell, ci) => {
          if (typeof cell !== 'string') return;
          row[ci] = cell.replace(/(\d{2,3})\s*%/g, (m, n) => (Number(n) < RSA_MIN_EFFORT ? `${RSA_MIN_EFFORT}%` : m));
        });
      }
      if (secs == null || (secs < 60 && raisedEffort === null)) return;
      if (secs != null && secs >= 60) row[parsed.rest] = `${RSA_REST_SECONDS} sec`;
      if (Number.isInteger(parsed.notes)) {
        row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} Recovery is short on purpose: this is repeated-sprint work, so you should start each rep before you feel ready. If the last rep is more than a stride slower than the first, stop the set.`.trim();
      }
      moves.push({ week, movement: name, from: secs, to: RSA_REST_SECONDS, effort: raisedEffort });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 8. a sprint that stops before the part the goal is measured over --------
//
// "Sprint work never passes 20 m against a 30 m benchmark." The athlete's goal
// is a 30 m time and the block never exposes them to the last third of it,
// which is the part that separates the acceleration they already have from the
// speed they are chasing.
//
// The number is the benchmark's, not ours: 75% of the distance the goal is
// measured over, by week 3.

export function repairSprintDistance(program, intake = {}) {
  const findings = sprintDistanceSpecificity(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, moves: [] };
  const need = Number((String(findings[0].detail).match(/short of the (\d+)\s*m/i) || [])[1]);
  const bench = Number((String(findings[0].detail).match(/benchmark is (\d+)\s*m/i) || [])[1]);
  if (!Number.isFinite(need) || !Number.isFinite(bench)) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  // Weeks 2 and 3, not week 1. The block is allowed to open at the distance the
  // athlete is already doing and arrive at the benchmark, which is the same
  // shape every other progression repair here uses.
  for (const week of [2, 3]) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      // The row is often just called "Run". The rule's own matcher includes it,
      // and a narrower one here found nothing to repair on the only program that
      // has the finding -- the sprint rows were named Run, 20 m.
      if (isWarmup(name) || !/\bsprint\b|\bacceleration\b|\bflying\b|\bshuttle\b|\brun\b/i.test(name)) return;
      const reps = String(row[parsed.reps] || '');
      // Only a short rep is a sprint. A 40-minute easy run is also called Run.
      if (/min\b/i.test(reps)) return;
      const m = Number((reps.match(/(\d+(?:\.\d+)?)\s*m\b(?!in)/i) || [])[1]);
      if (!Number.isFinite(m) || m >= need) return;
      const target = week === 3 ? bench : Math.ceil(need);
      row[parsed.reps] = reps.replace(/(\d+(?:\.\d+)?)\s*m\b(?!in)/i, `${target} m`);
      if (Number.isInteger(parsed.notes)) {
        row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} Out to ${target} m, because the last part of the ${bench} m is the part your time is won in and the block never took you there.`.trim();
      }
      moves.push({ week, movement: name, from: m, to: target });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 9. a taper that waits until the last week to start ----------------------
//
// "The general starting window is 8 to 14 days, which opens in the week before
// competition week; a taper confined to the last seven days is half of it." The
// block holds volume flat and then drops 39% in one week, so the athlete
// arrives at the event having shed fatigue for seven days instead of ten to
// fourteen.
//
// The descent has to begin in the week before, and the rule names the floor:
// 10% down on the weeks that came before it. So this takes sets off the least
// specific work in that week until the number is met -- never off a competition
// lift, a sport session or the athlete's primary quality, which are the things
// a taper is protecting.

const TAPER_OPENING_FLOOR = 0.10;
const TAPER_COMPETITION_FLOOR = 0.41;
const LEAST_SPECIFIC = /plank|pallof|dead bug|calf|curl|raise|fly|extension|band|face pull|shrug/i;

export function repairTaperOpening(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  // Iterate, because these two findings uncover each other. Trimming the week
  // before competition fixes the compressed taper and changes the pre-taper
  // average the competition week is measured against, so the insufficient
  // reduction only becomes visible once the first is answered. Computing the
  // findings once left the second one standing.
  for (let pass = 0; pass < 4; pass += 1) {
    // The week BEFORE competition only. Trimming competition week itself was
    // tried and does two things wrong at once: it collides with the freshness
    // budget that owns those days (V90_SESSION_GROWS_INTO_DAY_ZERO), and it
    // chases a moving target, because trimming the pre-taper week lowers the
    // average competition week is measured against. His two taper rules can
    // genuinely conflict on a three-week camp, and resolving both means
    // redesigning the block's volume profile rather than shaving sets -- a
    // coaching decision, so the remaining finding is reported rather than
    // forced.
    const findings = (taperAgainstSource(out, intake) || [])
      .filter((f) => f.rule === 'TAPER_COMPRESSED_INTO_FINAL_WEEK');
    if (!findings.length) break;
    const before = out;
    for (const f of findings) {
    // Same machinery, two different floors. The week before competition has to
    // BEGIN the descent -- 10% is enough. Competition week itself has to finish
    // it, and his band is 41-60% off the pre-taper average.
    const isCompWeek = f.rule === 'TAPER_VOLUME_NOT_REDUCED';
    const carried = Number((String(f.detail).match(isCompWeek ? /carries (\d+) working sets/i : /week (\d+) carries (\d+)/i) || [])[isCompWeek ? 1 : 2]);
    const earlier = Number((String(f.detail).match(isCompWeek ? /average of (\d+)/i : /against (\d+) earlier/i) || [])[1]);
    const week = Number((String(f.detail).match(/[Ww]eek (\d+) (?:carries|is competition)/i) || [])[1]);
    if (![carried, earlier, week].every(Number.isFinite)) continue;

    const target = Math.floor(earlier * (1 - (isCompWeek ? TAPER_COMPETITION_FLOOR : TAPER_OPENING_FLOOR)));
    if (carried <= target) continue;
    const parsed = parseWeek(out, week);
    if (!parsed) continue;

    const cells = parsed.rows.map((c) => [...c]);
    const setsAt = (i) => Number(cells[i][parsed.sets]) || 0;
    // Working sets, the way the rule counts them. Including warm-up rows made
    // the before and after numbers disagree with the finding they were meant to
    // answer -- it reported a week going from 24 sets to 25 while removing work.
    const total = () => cells.reduce((n, c, i) =>
      (isWarmup(String(c[parsed.exercise] || '')) ? n : n + setsAt(i)), 0);
    let guard = 0;
    const trimmed = [];
    while (total() > target && guard < 80) {
      guard += 1;
      // Isolation work first, then anything else that serves no stated goal. A
      // fight camp carries almost no curls and planks, so a trim restricted to
      // those reached one set of the three it needed and stopped. What a taper
      // must not touch is the competition work and the athlete's own goals, not
      // everything that happens to be compound.
      const goals = statedGoalFamilies(intake);
      const spendable = cells
        .map((c, index) => ({ index, name: String(c[parsed.exercise] || '').trim() }))
        .filter((r) => r.name && !isWarmup(r.name) && setsAt(r.index) > 1)
        .filter((r) => !goals.some((g) => g.test && g.test(r.name)));
      const candidates = spendable.sort((a, b) =>
        (Number(LEAST_SPECIFIC.test(b.name)) - Number(LEAST_SPECIFIC.test(a.name)))
        || (setsAt(b.index) - setsAt(a.index)));
      if (!candidates.length) break;
      const victim = candidates[0];
      cells[victim.index][parsed.sets] = String(setsAt(victim.index) - 1);
      trimmed.push(victim.name);
    }
    if (!trimmed.length) continue;
    const candidate = rebuild(out, parsed, cells);
    if (brokeSomething(out, candidate, intake)) continue;
    out = candidate;
    moves.push({ week, from: carried, to: total(), target });
    }
    if (out === before) break;
  }
  return { program: out, changed: moves.length > 0, moves };
}

// --- 10. a repeated-sprint exposure that never gets harder -------------------
//
// "Improving repeated-sprint ability is a stated goal and nothing about the
// exposure moves by Week 3: W1 4 x 20 m / 45 s, W2 4 x 20 m / 45 s, W3 the
// same." Partly our doing: the recovery repair above sets every week to the
// same 45 s, which fixes the definition and flattens the progression.
//
// Repeatability improves by doing more reps at the same quality, not by running
// them further or resting less, so the rep count is the lever. One rep a week,
// which is the smallest change that makes the block progress at all.

export function repairRepeatedSprintProgression(program, intake = {}) {
  const findings = repeatedSprintProgression(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, moves: [] };

  let out = String(program || '');
  const moves = [];
  for (const week of [2, 3]) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;
    cells.forEach((row) => {
      const name = String(row[parsed.exercise] || '').trim();
      if (isWarmup(name) || !SPRINTABLE.test(name)) return;
      const sets = Number(row[parsed.sets]) || 0;
      if (sets < 3) return;
      row[parsed.sets] = String(sets + (week - 1));
      if (Number.isInteger(parsed.notes)) {
        row[parsed.notes] = `${String(row[parsed.notes] || '').trim()} One more rep than last week, same distance and same short recovery: repeatability improves by holding the quality over more efforts, not by running further.`.trim();
      }
      moves.push({ week, movement: name, from: sets, to: sets + (week - 1) });
      changed = true;
    });
    if (changed) out = rebuild(out, parsed, cells);
  }
  return { program: out, changed: moves.length > 0, moves };
}
