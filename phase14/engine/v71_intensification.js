// engine/v71_intensification.js
//
// What an intensification block owes the athlete.
//
// The weightlifter's first block was rated 6.8. It rose one kilogram a week on
// the classic lifts -- 89% to 92% of current max -- while holding total volume
// at exactly 73 sets every week and the competition-lift share at exactly 39%,
// and labelled the last week Consolidate / Express while nothing fell. That is
// four weeks of the same week with a heavier bar.
//
// A block eight weeks from a meet is weeks -8 to -5: an intensification block,
// not the final taper. As intensity rises, volume comes down, and the share of
// work that is actually the competition lift goes up. Support work is what
// gives way -- rows, trunk work, hamstring curls, redundant overhead squats --
// never snatch or clean and jerk frequency.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile } from './v68_competition_state.js';

const CLASSIC = /\b(?:snatch|clean and jerk|clean & jerk|power clean|power snatch|hang (?:snatch|clean)|jerk|clean)\b/i;
// Trimmed before the competition lifts, in this order.
// Secondary pressing and squat support were structurally immune to the trim:
// neither appears below, and the block-level volume target is always met by
// cutting curls, planks and rows first, so the cut never reached them. The
// delivered block held overhead press at 8 sets and squat support at 6 in every
// week while total volume fell 78 -> 59, which is the "too much cheap support
// work" the review named. Low fatigue cost is not a justification: as the meet
// approaches an accessory has to answer a known need.
const SECONDARY_PRESS = /\b(?:overhead press|strict press|military press|push press|behind[- ](?:the[- ])?neck press|shoulder press|seated press)\b/i;
const SQUAT_SUPPORT = /\b(?:back squat|paused squat|tempo squat|box squat)\b/i;

// Jerk lockout named as an actual limiter, in what the athlete told us. Cue
// text inside the program ("if lockout speed worsens...") is the model's own
// writing and must not license its own volume.
export function jerkLockoutIsLimiter(intake = {}) {
  const said = `${txt(intake.notes)} ${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.primary_goals)} ${txt(intake.secondary_goals)} ${txt(intake.injuries)}`;
  return /\b(?:jerk|lockout|overhead)\b[^.]{0,60}\b(?:limiter|limiting|weakness|weak point|misses|missing|fails|failing|sticking point)\b/i.test(said)
    || /\b(?:limiter|limiting factor|weak point|weakness)\b[^.]{0,60}\b(?:jerk|lockout|overhead)\b/i.test(said);
}

// What secondary pressing and squat support may still carry, as a share of what
// they carried in Week 1. Specificity rises by these coming down, not by the
// classic lifts going up.
const LATE_SUPPORT_CEILING = { 3: { press: 0.75, squat: 1 }, 4: { press: 0.5, squat: 0.84 } };

function patternSets(wk, re) {
  return wk.rows.filter((r) => !r.classic && re.test(r.name)).reduce((n, r) => n + r.sets, 0);
}

const SUPPORT_CUT_ORDER = [
  /\b(?:hamstring curl|leg curl|leg extension|calf raise)\b/i,
  /\b(?:plank|dead bug|pallof|trunk|ab wheel|side plank)\b/i,
  /\b(?:row|chest-supported|bent-over|pendlay|lat pulldown)\b/i,
  /\b(?:overhead squat|good ?morning|back extension)\b/i,
];

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function firstInt(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }
function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join('\n'); }

// The athlete's current bests, read from what they told us.
export function currentMaxes(intake = {}) {
  const src = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const out = {};
  const grab = (re) => {
    const m = src.match(re);
    return m ? Number(m[1]) : null;
  };
  out.snatch = grab(/snatch[^\n]{0,40}?(\d{2,3})\s*kg/i);
  out.cleanJerk = grab(/clean and jerk[^\n]{0,40}?(\d{2,3})\s*kg/i)
    || grab(/clean\s*(?:and|&)\s*jerk[^\n]{0,40}?(\d{2,3})\s*kg/i);
  return out;
}

export function maxFor(name, maxes) {
  if (/snatch/i.test(name)) return maxes.snatch || null;
  if (/clean|jerk/i.test(name)) return maxes.cleanJerk || null;
  return null;
}

function weekFacts(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  let sets = 0;
  let classicSets = 0;
  const rows = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    const n = firstInt(cells[parsed.sets]) || 0;
    sets += n;
    const classic = CLASSIC.test(name);
    if (classic) classicSets += n;
    rows.push({ index, name, sets: n, classic });
  });
  return { parsed, sets, classicSets, share: sets ? classicSets / sets : 0, rows };
}

// Does this block sit in the run-up rather than the taper?
function isIntensification(intake, now) {
  const profile = competitionProfile(intake, now);
  if (!profile) return false;
  const states = profile.weeks.map((w) => w.state);
  // An intensification block builds: it contains no taper or competition week.
  return states.includes(STATE.SPECIFICITY)
    && !states.includes(STATE.TAPER)
    && !states.includes(STATE.COMPETITION_WEEK);
}

export function collectIntensificationFlags(program, intake = {}, now = Date.now()) {
  if (!isIntensification(intake, now)) return [];
  const weeks = [1, 2, 3, 4].map((w) => weekFacts(program, w));
  if (weeks.some((w) => !w)) return [];
  const flags = [];

  // Secondary pressing and squat support must give ground as the block gets
  // more specific, rather than riding through untouched.
  const lockout = jerkLockoutIsLimiter(intake);
  for (const week of [3, 4]) {
    const ceiling = LATE_SUPPORT_CEILING[week];
    const pressNow = patternSets(weeks[week - 1], SECONDARY_PRESS);
    const pressFirst = patternSets(weeks[0], SECONDARY_PRESS);
    if (!lockout && pressFirst > 0 && pressNow > Math.round(pressFirst * ceiling.press)) {
      flags.push({
        code: 'V71_SECONDARY_PRESS_NOT_REDUCED', week,
        detail: `Week ${week} still carries ${pressNow} sets of secondary pressing against ${pressFirst} in Week 1. As the meet approaches the classic lifts take a larger share of the work, and overhead pressing that is not answering a stated jerk-lockout limiter is the first thing that should give way. Reduce it to about ${Math.round(pressFirst * ceiling.press)} sets.`,
      });
    }
    const squatNow = patternSets(weeks[week - 1], SQUAT_SUPPORT);
    const squatPrev = patternSets(weeks[week - 2], SQUAT_SUPPORT);
    if (week === 4 && squatPrev > 1 && squatNow >= squatPrev) {
      flags.push({
        code: 'V71_SQUAT_SUPPORT_FLAT_IN_FINAL_WEEK', week,
        detail: `Squat support holds at ${squatNow} sets into Week ${week}. Strength maintenance does not have to stay flat to be maintained; a small reduction in the last week of the block buys freshness for the competition lifts at no real cost.`,
      });
    }
  }

  // Volume must come down as the block progresses. Holding it flat while the
  // bar creeps up is not intensification, it is repetition.
  if (weeks[3].sets >= weeks[0].sets) {
    flags.push({
      code: 'V71_INTENSIFICATION_VOLUME_FLAT',
      detail: `This is an intensification block, but weekly volume runs ${weeks.map((w) => w.sets).join(', ')} sets. As intensity rises through the block, total volume comes down. Trim support work, not competition-lift frequency.`,
    });
  }

  // And the share of work that is the competition lift must rise.
  if (weeks[3].share <= weeks[0].share + 0.01) {
    flags.push({
      code: 'V71_CLASSIC_SHARE_NOT_RISING',
      detail: `Competition-lift share runs ${weeks.map((w) => Math.round(w.share * 100) + '%').join(', ')} across the block. Specificity means the classic lifts take a larger share of the work as the meet approaches; cut rows, trunk work, hamstring curls and redundant overhead squats first.`,
    });
  }

  // A prescribed classic-lift load the athlete cannot audit against their own
  // max is a number without a meaning.
  const maxes = currentMaxes(intake);
  if (maxes.snatch || maxes.cleanJerk) {
    for (const wk of weeks) {
      const missing = wk.rows.filter((r) => r.classic && maxFor(r.name, maxes));
      const parsed = wk.parsed;
      for (const r of missing) {
        const load = String(parsed.rows[r.index][parsed.load] || '');
        if (/\d/.test(load) && !/%/.test(load)) {
          flags.push({
            code: 'V71_MISSING_PERCENT_OF_MAX',
            exercise: r.name,
            detail: `${r.name} is prescribed at ${load} with no percentage of current max. Competition-lift intensity should read as both kilograms and % of current max so the progression is auditable.`,
          });
          break;
        }
      }
    }
  }
  return flags;
}

export function repairIntensification(program, intake = {}, now = Date.now()) {
  if (!isIntensification(intake, now)) return String(program || '');
  let out = String(program || '');
  const maxes = currentMaxes(intake);

  // 1. Annotate competition-lift loads with % of current max.
  if (maxes.snatch || maxes.cleanJerk) {
    for (let week = 1; week <= 4; week += 1) {
      const parsed = parseWeek(out, week);
      if (!parsed || !Number.isInteger(parsed.load)) continue;
      const rows = parsed.rows.map((c) => c.slice());
      let changed = false;
      for (const cells of rows) {
        const name = String(cells[parsed.exercise] || '').trim();
        if (!name || isWarmup(name) || !CLASSIC.test(name)) continue;
        const max = maxFor(name, maxes);
        if (!max) continue;
        const load = String(cells[parsed.load] || '');
        if (!/\d/.test(load) || /%/.test(load)) continue;
        // Use the top of a range: that is the number the athlete works to.
        const nums = [...load.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
        if (!nums.length) continue;
        const pct = Math.round((Math.max(...nums) / max) * 100);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 120) continue;
        cells[parsed.load] = `${load} (${pct}% of current max)`;
        changed = true;
      }
      if (!changed) continue;
      const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
      out = out.replace(parsed.re, `$1${rebuilt}$3`);
    }
  }

  // 2. Bring volume down across the block by trimming support work only, which
  //    raises the competition-lift share by the same action.
  const first = weekFacts(out, 1);
  if (!first) return out;
  for (let week = 2; week <= 4; week += 1) {
    const wk = weekFacts(out, week);
    if (!wk) continue;
    // A gentle taper of support volume: about 8% off per week from week 2.
    const target = Math.max(1, Math.round(first.sets * (1 - 0.08 * (week - 1))));
    if (wk.sets <= target) continue;

    const parsed = wk.parsed;
    const rows = parsed.rows.map((c) => c.slice());
    const setsOf = (i) => firstInt(rows[i][parsed.sets]) || 0;
    let total = wk.sets;
    const trimmed = [];

    for (const pattern of SUPPORT_CUT_ORDER) {
      if (total <= target) break;
      const candidates = wk.rows
        .filter((r) => !r.classic && pattern.test(r.name))
        .map((r) => r.index)
        .sort((a, b) => setsOf(b) - setsOf(a));
      for (const i of candidates) {
        const before = setsOf(i);
        while (total > target && setsOf(i) > 1) {
          rows[i][parsed.sets] = String(setsOf(i) - 1);
          total -= 1;
        }
        // A row whose set count just changed must not keep a note describing
        // the old one. Every other repair in this chain restates what it
        // edits; leaving a stale claim here would hand the athlete a sentence
        // its own row contradicts.
        if (setsOf(i) !== before) trimmed.push({ index: i, before, after: setsOf(i) });
        if (total <= target) break;
      }
    }
    if (total === wk.sets) continue;

    // Restate the rows that changed, before the block-level note.
    if (Number.isInteger(parsed.notes)) {
      for (const t of trimmed) {
        const cells = rows[t.index];
        const note = String(cells[parsed.notes] || '').trim();
        // Drop a hold-claim the new set count no longer supports, then say what
        // happened instead of leaving the row silently contradicted.
        const cleaned = note.replace(
          /\b(?:hold|keep|maintain|repeat|same)\b[^.;]{0,40}\b(?:set count|sets)\b[^.;]*[.;]?/gi, '').trim();
        const reason = `Support volume trimmed to ${t.after} set${t.after === 1 ? '' : 's'} this week as the classic lifts take a larger share.`;
        cells[parsed.notes] = (cleaned ? `${cleaned} ${reason}` : reason).replace(/\s+/g, ' ').trim();
      }
      const lead = wk.rows.find((r) => r.classic);
      if (lead) {
        const cells = rows[lead.index];
        const existing = String(cells[parsed.notes] || '').trim();
        const reason = 'Support volume comes down this week so the classic lifts take a larger share as the meet approaches.';
        if (!existing.includes('larger share')) cells[parsed.notes] = existing ? `${existing} ${reason}` : reason;
      }
    }
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  // This module's own repair must answer this module's own flags: leaving the
  // late-support trim to a separate call meant the collector still reported a
  // finding after repairIntensification had run.
  out = repairLateSupportVolume(out, intake, now);

  return out;
}

export { isIntensification };

// Bring secondary pressing and squat support down to what a specific block can
// justify. Trimming sets rather than deleting rows keeps the exposure -- the
// athlete still presses, and still squats -- while the classic lifts take a
// larger share of the week by the support work receding around them.
export function repairLateSupportVolume(program, intake = {}, now = Date.now()) {
  if (!isIntensification(intake, now)) return String(program || '');
  let out = String(program || '');
  const first = weekFacts(out, 1);
  if (!first) return out;

  const lockout = jerkLockoutIsLimiter(intake);
  const pressFirst = patternSets(first, SECONDARY_PRESS);

  for (const week of [3, 4]) {
    const wk = weekFacts(out, week);
    if (!wk) continue;
    const ceiling = LATE_SUPPORT_CEILING[week];

    const targets = [];
    if (!lockout && pressFirst > 0) {
      targets.push({ re: SECONDARY_PRESS, target: Math.max(1, Math.round(pressFirst * ceiling.press)), label: 'secondary pressing' });
    }
    if (week === 4) {
      const prev = weekFacts(out, 3);
      const squatPrev = prev ? patternSets(prev, SQUAT_SUPPORT) : 0;
      if (squatPrev > 1) targets.push({ re: SQUAT_SUPPORT, target: Math.max(1, squatPrev - 1), label: 'squat support' });
    }
    if (!targets.length) continue;

    const parsed = wk.parsed;
    const rows = parsed.rows.map((c) => c.slice());
    const setsOf = (i) => firstInt(rows[i][parsed.sets]) || 0;
    let changed = false;

    for (const { re, target, label } of targets) {
      const candidates = wk.rows.filter((r) => !r.classic && re.test(r.name)).map((r) => r.index);
      let total = candidates.reduce((n, i) => n + setsOf(i), 0);
      if (total <= target) continue;

      // Take from the heaviest row first, and never take the last set: the
      // point is less of it, not none of it.
      while (total > target) {
        const from = candidates.slice().sort((a, b) => setsOf(b) - setsOf(a))[0];
        if (!Number.isInteger(from) || setsOf(from) <= 1) break;
        rows[from][parsed.sets] = String(setsOf(from) - 1);
        total -= 1;
        changed = true;
      }

      if (!changed) continue;
      const lead = rows[candidates[0]];
      if (Number.isInteger(parsed.notes)) {
        const reason = `Volume here steps down as the meet nears; the ${label} is maintenance now, not a target.`;
        const existing = String(lead[parsed.notes] || '');
        if (!existing.includes('maintenance now')) lead[parsed.notes] = existing ? `${existing} ${reason}` : reason;
      }
    }

    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}
