// engine/v70_competition_rules.js
//
// The competition rules Appendix E says can be encoded strongly, and only
// those. The cluster is explicit that exact volume percentages, taper
// durations, final hard-sparring days and opener percentages must stay
// adjustable defaults rather than gates, so none of them are enforced here.
//
// What is enforced:
//   - a competition week does not carry work whose only effect is fatigue
//   - volume genuinely falls into a taper or competition week
//   - a combat athlete's gym work does not duplicate their sport
//
// Every rule is inert for an athlete with no event.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise } from './v38_movement_taxonomy.js';
import { STATE, competitionProfile, stateForWeek } from './v68_competition_state.js';

// Near-failure work in competition week is the clearest encodable case: the
// cluster lists failure training under "what usually leaves" for every event
// type, and a final session that becomes a test is a named failure mode.
const COMPETITION_WEEK_RPE_CEILING = 8;

// Patterns the cost matrix puts at the top for eccentric and damage cost.
const HIGH_DAMAGE = /\b(?:romanian deadlift|rdl|nordic|good ?morning|deficit|eccentric|slow negative|tempo (?:squat|deadlift|press)|walking lunge|step[- ]down|drop jump|depth jump)\b/i;

// Conditioning a combat athlete already gets from the sport itself.
const REDUNDANT_CONDITIONING = /\b(?:circuit|metcon|conditioning|burpee|assault bike|airdyne|battle rope|sprint interval|shuttle|hiit)\b/i;

function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function topOf(v) {
  const n = [...String(v || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
}
function firstInt(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }
function rpeIndex(parsed) { return parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || ''))); }

function weekRows(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rpeCol = rpeIndex(parsed);
  const rows = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    rows.push({
      index,
      name,
      sets: firstInt(cells[parsed.sets]) || 0,
      rpe: rpeCol >= 0 ? topOf(cells[rpeCol]) : null,
      category: classifyExercise(name).category,
    });
  });
  return { parsed, rpeCol, rows };
}

const totalSets = (rows) => rows.reduce((n, r) => n + r.sets, 0);

export function collectCompetitionFlags(program, intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile) return [];
  const flags = [];

  for (const wk of profile.weeks) {
    const data = weekRows(program, wk.week);
    if (!data) continue;
    const { rows } = data;

    if (wk.state === STATE.COMPETITION_WEEK) {
      for (const r of rows) {
        if (r.rpe != null && r.rpe > COMPETITION_WEEK_RPE_CEILING) {
          flags.push({
            code: 'V70_COMPETITION_WEEK_NEAR_FAILURE',
            week: wk.week, exercise: r.name, rpe: r.rpe,
            detail: `Week ${wk.week} is competition week and ${r.name} is prescribed at RPE ${r.rpe}. Competition week creates readiness, not adaptation; a session that becomes a test is a known failure mode.`,
          });
        }
        if (HIGH_DAMAGE.test(r.name)) {
          flags.push({
            code: 'V70_COMPETITION_WEEK_HIGH_DAMAGE',
            week: wk.week, exercise: r.name,
            detail: `Week ${wk.week} is competition week and ${r.name} is a high-damage eccentric exposure. Muscle damage can reduce force and cause soreness for days, which is fatigue with no Day 0 benefit.`,
          });
        }
      }
    }

    // Volume must genuinely fall into a taper or competition week. The amount
    // is deliberately not specified -- only the direction, which the cluster
    // supports and the exact percentage, which it does not.
    if (wk.state === STATE.TAPER || wk.state === STATE.COMPETITION_WEEK) {
      const prev = wk.week > 1 ? weekRows(program, wk.week - 1) : null;
      if (prev && totalSets(rows) >= totalSets(prev.rows) && totalSets(prev.rows) > 0) {
        flags.push({
          code: 'V70_TAPER_VOLUME_NOT_REDUCED',
          week: wk.week, current: totalSets(rows), previous: totalSets(prev.rows),
          detail: `Week ${wk.week} is a ${wk.state.replace(/_/g, ' ')} week but carries ${totalSets(rows)} sets against Week ${wk.week - 1}'s ${totalSets(prev.rows)}. Volume is the fatigue lever and must come down; intensity is what stays.`,
        });
      }
    }

    // A combat athlete's sport already supplies conditioning.
    if (profile.eventType === 'combat' && wk.state !== STATE.NORMAL) {
      for (const r of rows) {
        if (REDUNDANT_CONDITIONING.test(r.name)) {
          flags.push({
            code: 'V70_COMBAT_CONDITIONING_DUPLICATED',
            week: wk.week, exercise: r.name,
            detail: `Week ${wk.week} adds ${r.name} for an athlete whose sport already supplies hard conditioning. Generic conditioning must not duplicate sparring.`,
          });
        }
      }
    }
  }
  return flags;
}

export function repairCompetitionBlock(program, intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile) return String(program || '');
  let out = String(program || '');

  for (const wk of profile.weeks) {
    const data = weekRows(out, wk.week);
    if (!data) continue;
    const { parsed, rpeCol } = data;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;

    const note = (cells, reason) => {
      if (!Number.isInteger(parsed.notes)) return;
      const existing = String(cells[parsed.notes] || '').trim();
      if (existing.includes(reason.slice(0, 30))) return;
      cells[parsed.notes] = existing ? `${existing} ${reason}` : reason;
    };

    if (wk.state === STATE.COMPETITION_WEEK && rpeCol >= 0) {
      for (const cells of rows) {
        const name = String(cells[parsed.exercise] || '').trim();
        if (!name || isWarmup(name)) continue;
        const rpe = topOf(cells[rpeCol]);
        if (rpe != null && rpe > COMPETITION_WEEK_RPE_CEILING) {
          cells[rpeCol] = String(COMPETITION_WEEK_RPE_CEILING);
          note(cells, 'Held at RPE 8: competition week creates readiness, not adaptation. Stop while speed and technique are still crisp.');
          changed = true;
        }
      }
    }

    // Volume: trim the week's largest sets until it sits under the prior week.
    if (wk.state === STATE.TAPER || wk.state === STATE.COMPETITION_WEEK) {
      const prev = wk.week > 1 ? weekRows(out, wk.week - 1) : null;
      if (prev && totalSets(prev.rows) > 0) {
        const target = totalSets(prev.rows) - 1;
        const idx = [];
        rows.forEach((cells, i) => {
          const name = String(cells[parsed.exercise] || '').trim();
          if (name && !isWarmup(name)) idx.push(i);
        });
        const setsOf = (i) => firstInt(rows[i][parsed.sets]) || 0;
        let total = idx.reduce((n, i) => n + setsOf(i), 0);
        let guard = 0;
        while (total > target && guard < 500) {
          guard += 1;
          const biggest = idx.filter((i) => setsOf(i) > 1).sort((a, b) => setsOf(b) - setsOf(a))[0];
          if (biggest == null) break;
          rows[biggest][parsed.sets] = String(setsOf(biggest) - 1);
          total -= 1;
          changed = true;
        }
        if (changed) {
          const first = idx.find((i) => setsOf(i) > 0);
          if (first != null) note(rows[first], 'Volume reduced into the event: fatigue comes down while the intensity that keeps you sharp stays.');
        }
      }
    }

    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export { stateForWeek };
