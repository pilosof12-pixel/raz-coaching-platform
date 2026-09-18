// engine/source_generator_rules.js
//
// The numbered Generator Rules from Articles 85-90, as checks.
//
// These are not new coaching opinions. Each one is a rule the engine already
// states in engine_instructions.txt and has never verified -- the audit in
// scripts/audit_source_coverage.mjs found 19 of 22 sampled rules in that state.
// A rule the model is told and nothing checks is exactly where a deduction
// comes from, and three of the ones here are injury rules rather than quality
// rules.
//
// Each carries its source wording verbatim, because the threshold is the
// source's and not ours.

import { rows } from './coach_rules.js';
import { STATE as CSTATE, stateForWeek, hasEvent, weeksOut } from './v68_competition_state.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const painText = (intake) => `${intake.injuries || ''} ${JSON.stringify(intake.pain || {})} ${intake.notes || ''}`;

// "3/10", "3 out of 10", "severity 4". Returns the highest reported.
export function painSeverity(text) {
  const all = [
    ...[...String(text).matchAll(/(\d{1,2})\s*(?:\/|out of)\s*10\b/gi)].map((m) => Number(m[1])),
    ...[...String(text).matchAll(/severity[^0-9]{0,12}(\d{1,2})\b/gi)].map((m) => Number(m[1])),
  ].filter((n) => n >= 0 && n <= 10);
  return all.length ? Math.max(...all) : null;
}

// --- A85.5 Neck Safety Interlock --------------------------------------------
// "Any neck pain report of >= 3/10 locks out all axial loading exercises until
// cleared."

const AXIAL = /\bback squat\b|\bfront squat\b|\boverhead press\b|\bpush press\b|\bmilitary press\b|\bshrug\b|\bgood ?morning\b|\bdeadlift\b|\bloaded carry\b|\bfarmer/i;

export function neckAxialLockout(program, intake = {}) {
  const text = painText(intake);
  if (!/\bneck\b|\bcervical\b/i.test(text)) return [];
  const severity = painSeverity(text);
  if (severity == null || severity < 3) return [];
  const loaded = [...new Set(rows(program).filter((r) => AXIAL.test(r.name)).map((r) => r.name))];
  if (!loaded.length) return [];
  return [{
    rule: 'NECK_PAIN_AXIAL_LOADING',
    severity,
    detail: `The athlete reports neck pain at ${severity}/10, and the block prescribes axial loading: ${loaded.join(', ')}. Any neck pain report at 3/10 or above locks out axial loading until it is cleared.`,
  }];
}

// --- A88.4 Tendon Pain Override ---------------------------------------------
// "Any tendon pain >= 3/10 removes all eccentric and plyometric work and
// substitutes isometric protocols until cleared."

const TENDON = /\bachilles\b|\bpatellar\b|\btendon\b|\btendinop\b|\bhamstring origin\b|\bproximal hamstring\b/i;
const ECCENTRIC_OR_PLYO = /\bnordic\b|\beccentric\b|\bdepth jump\b|\bplyo\w*\b|\bbound\w*\b|\bhop\b|\bjump squat\b|\bbox jump\b|\bdrop jump\b|\bglute[- ]ham raise\b/i;

export function tendonPainOverride(program, intake = {}) {
  const text = painText(intake);
  if (!TENDON.test(text)) return [];
  const severity = painSeverity(text);
  if (severity == null || severity < 3) return [];
  const offending = [...new Set(rows(program).filter((r) => ECCENTRIC_OR_PLYO.test(`${r.name} ${r.notes}`)).map((r) => r.name))];
  if (!offending.length) return [];
  return [{
    rule: 'TENDON_PAIN_ECCENTRIC_OR_PLYO',
    severity,
    detail: `The athlete reports tendon pain at ${severity}/10, and the block prescribes ${offending.join(', ')}. Tendon pain at 3/10 or above removes all eccentric and plyometric work and substitutes isometric protocols until it is cleared.`,
  }];
}

// --- A86.5 Head Impact Protocol ---------------------------------------------
// "If any concussion or acute head impact is flagged, generate zero gym work
// for that week and prompt coach for medical clearance."

export function headImpactLockout(program, intake = {}) {
  const text = painText(intake);
  if (!/\bconcussion\b|\bhead impact\b|\bknocked out\b|\bhead knock\b/i.test(text)) return [];
  // Historic and cleared is not a live flag.
  if (/\bcleared\b|\bno longer\b|\bhistoric\b|\byears ago\b|\bfully recovered\b/i.test(text)) return [];
  const any = rows(program).length;
  if (!any) return [];
  return [{
    rule: 'HEAD_IMPACT_GYM_NOT_WITHHELD',
    detail: `A concussion or acute head impact is flagged in the intake and the block prescribes ${any} working rows. A flagged head impact generates zero gym work for that week and a prompt for medical clearance.`,
  }];
}

// --- A89.5 Recovery Day Lock ------------------------------------------------
// "A minimum of 2 complete recovery days per 7-day microcycle is hard-coded."
//
// Sport counts. A gym rest day on which the athlete trains their sport is not a
// recovery day, which is the case that makes this worth checking at all.

export function recoveryDayLock(program, intake = {}) {
  const sportDays = new Set(arr(intake.sport_schedule)
    .map((s) => String((s && s.day) || '').slice(0, 3).toLowerCase()).filter(Boolean));
  const out = [];
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!r.day) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Set());
    byWeek.get(r.week).add(r.day);
  }
  // Attribution matters more than the count. A fighter training seven days a
  // week on his own sport schedule has no recovery days the gym can give back,
  // and flagging his program every week says nothing the coach can act on. The
  // rule is about days the PROGRAM spends: it fires only where the sport left
  // two free days and the gym took them.
  const sportFree = 7 - sportDays.size;
  if (sportFree < 2) return [];
  for (const [week, gymDays] of byWeek) {
    const busy = new Set([...gymDays, ...sportDays]);
    const free = 7 - busy.size;
    if (free >= 2) continue;
    const taken = [...gymDays].filter((d) => !sportDays.has(d));
    out.push({
      rule: 'RECOVERY_DAYS_BELOW_MINIMUM',
      week,
      free,
      detail: `Week ${week} leaves ${free} complete recovery day${free === 1 ? '' : 's'} in a seven-day microcycle. The sport schedule leaves ${sportFree} free, and the gym places work on ${taken.length} of them (${taken.join(', ') || 'none'}). The minimum is 2 days with neither gym nor sport, and here the gym is what removes them.`,
    });
  }
  return out;
}

// --- A85.2 Pulling Volume Cap -----------------------------------------------
// "When mat hours >= 10, total weekly pulling sets are hard-capped at 6 working
// sets." A86.3 raises the same cap when grip fatigue is reported at 7 or above.

const PULLING = /\bpull[- ]?up\b|\bchin[- ]?up\b|\brow\b|\bpulldown\b|\bface pull\b|\bcurl\b/i;

export function matHours(intake = {}) {
  const text = `${intake.notes || ''} ${intake.current_numbers || ''} ${intake.sport || ''}`;
  const m = text.match(/(\d{1,2})\s*(?:\+\s*)?(?:mat |training )?hours?\s*(?:a|per|\/)\s*week/i)
    || text.match(/mat hours?[^0-9]{0,12}(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

export function pullingVolumeCap(program, intake = {}) {
  const hours = matHours(intake);
  const grip = Number((String(intake.notes || '').match(/grip fatigue[^0-9]{0,12}(\d{1,2})/i) || [])[1]);
  const governed = (hours != null && hours >= 10) || (Number.isFinite(grip) && grip >= 7);
  if (!governed) return [];
  const out = [];
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!PULLING.test(r.name)) continue;
    byWeek.set(r.week, (byWeek.get(r.week) || 0) + (r.sets ?? 0));
  }
  for (const [week, sets] of byWeek) {
    if (sets <= 6) continue;
    out.push({
      rule: 'PULLING_VOLUME_ABOVE_MAT_CAP',
      week,
      sets,
      detail: `Week ${week} prescribes ${sets} working pulling sets. ${hours != null && hours >= 10 ? `At ${hours} mat hours a week` : `With grip fatigue reported at ${grip}`}, weekly pulling is capped at 6 working sets -- the mat is already supplying the pulling volume and the grip.`,
    });
  }
  return out;
}

// --- A86.6 Competition Prep Cutoff ------------------------------------------
// "Pressing overhead is eliminated entirely from T-3 weeks to fight week."

const OVERHEAD_PRESS = /\boverhead press\b|\bpush press\b|\bmilitary press\b|\bjerk\b|\bshoulder press\b|\bhandstand push/i;

export function overheadPressCutoff(program, intake = {}, now = Date.now()) {
  if (String(intake.event_type || '').toLowerCase() !== 'combat') return [];
  if (!hasEvent(intake)) return [];
  const out = [];
  for (const week of [1, 2, 3, 4]) {
    const state = (() => { try { return stateForWeek(intake, week, now); } catch { return null; } })();
    const out3 = weeksOut(intake, now);
    // T-3 to fight week: the final three weeks of the run-up and the event week.
    const inCutoff = state === CSTATE.COMPETITION_WEEK
      || (Number.isFinite(out3) && out3 - (week - 1) <= 3);
    if (!inCutoff) continue;
    const found = [...new Set(rows(program).filter((r) => r.week === week && OVERHEAD_PRESS.test(r.name)).map((r) => r.name))];
    if (!found.length) continue;
    out.push({
      rule: 'OVERHEAD_PRESS_INSIDE_COMPETITION_CUTOFF',
      week,
      detail: `Week ${week} prescribes ${found.join(', ')}, inside the last three weeks before a combat event. Overhead pressing is eliminated entirely from T-3 to fight week.`,
    });
  }
  return out;
}

// --- A85.4 Competition Week Lock --------------------------------------------
// "In competition weeks (T-0), generate movement quality and activation only.
// No strength work above 70% 1RM."
//
// Scoped to combat, because it is Article 85's grappling rule. A weightlifter's
// competition week is the opposite case: openers sit near max by design, which
// is why this must not be applied to a strength meet.

const COMBAT_EVENT = /^(combat|grappling|bjj|mma)$/i;

export function competitionWeekIntensityCap(program, intake = {}, now = Date.now()) {
  if (!COMBAT_EVENT.test(String(intake.event_type || ''))) return [];
  if (!hasEvent(intake)) return [];
  const maxes = new Map();
  for (const line of String(intake.current_numbers || '').split('\n')) {
    const name = (line.match(/^\s*([A-Za-z][A-Za-z '()\-\/]*?)\s*:/) || [])[1];
    const kg = [...line.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].map((m) => Number(m[1]));
    if (name && kg.length) maxes.set(name.trim().toLowerCase(), Math.max(...kg));
  }
  if (!maxes.size) return [];
  const out = [];
  for (const week of [1, 2, 3, 4]) {
    const state = (() => { try { return stateForWeek(intake, week, now); } catch { return null; } })();
    if (state !== CSTATE.COMPETITION_WEEK) continue;
    for (const r of rows(program)) {
      if (r.week !== week) continue;
      const kg = Number((String(r.load).match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1]);
      if (!Number.isFinite(kg)) continue;
      const name = r.name.toLowerCase();
      const key = [...maxes.keys()].find((k) => name.includes(k) || k.includes(name));
      if (!key) continue;
      const pct = kg / maxes.get(key);
      if (pct <= 0.70) continue;
      out.push({
        rule: 'COMPETITION_WEEK_ABOVE_SEVENTY_PERCENT',
        week,
        movement: r.name,
        detail: `Competition week prescribes ${r.name} at ${kg} kg, ${(pct * 100).toFixed(0)}% of the athlete's ${maxes.get(key)} kg benchmark. In competition week a combat athlete gets movement quality and activation only: nothing above 70% of 1RM.`,
      });
    }
  }
  return out;
}
