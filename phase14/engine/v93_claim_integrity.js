// engine/v93_claim_integrity.js
//
// A block may not tell the athlete about a progression its table does not
// contain.
//
// V35 already checked exactly one sentence of this kind -- "the long run
// builds" -- measured in exactly one unit, kilometres in the reps cell. A coach
// reviewing a delivered tactical block found the same defect one clause over
// and we were blind to it: the narrative told the athlete to "rebuild toward
// the top of your 18-20 km range by adding a few minutes to the easy runs",
// and both easy runs sat at 25 min in all four weeks. Wrong subject, wrong
// unit, same lie. It was the single most expensive finding in the review.
//
// It is also the third instance of one defect class in two reviewed programs.
// The taper audit reported set counts for a program five repairs out of date;
// a hybrid block asserted a "routine 4 kg cut" the intake never mentioned.
// Every time, the prose asserted and the table did not deliver, and every time
// the internal rubric passed the program clean.
//
// So this generalises the check rather than adding a second special case: any
// named subject, any rise verb, any measurable column. A claim is unsupported
// when nothing the subject is measured by ever increases.
//
// Deliberately NOT wired into the blocking bundle, for the reason v87 records:
// the honest repair here is a coaching decision -- either write the progression
// into the rows or drop the promise -- and a blocking code whose repair is a
// judgement call spends four attempts and kills the build. The brief prevents
// it at generation time; the collector catches it in offline QA.

import { parseWeek } from './v34_workload_accounting.js';

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

export function narrative(program) {
  const s = String(program || '');
  const at = s.search(/START_WEEK1_TSV/i);
  return at < 0 ? s : s.slice(0, at);
}

// A subject is a thing the athlete reads about in the prose and can point to in
// the table. `row` identifies the family by exercise name; `qualifier`, where
// present, narrows it using the whole row -- "easy run" lives in the Weight
// cell ("Easy conversational, ~5:20-5:50/km"), not in the exercise name.
export const SUBJECTS = [
  { key: 'easy run', claim: /\beasy runs?\b|\beasy[- ]running\b|\baerobic runs?\b|\brunning volume\b|\bweekly (?:running )?(?:volume|mileage)\b/i,
    row: /\brun(?:ning)?\b|\bjog\b/i, qualifier: /easy|conversational|zone ?2|aerobic|recovery/i, exclude: /interval|repeat|stride|tempo|threshold/i },
  { key: 'long run', claim: /\blong runs?\b/i, row: /\brun(?:ning)?\b/i, qualifier: /\blong\b|\d+(?:\.\d+)?\s*km\b/i },
  { key: 'interval session', claim: /\bintervals?\b|\brepeats?\b|\bquality (?:run|session|work)\b/i,
    row: /\brun(?:ning)?\b/i, qualifier: /interval|repeat|\d+\s*m\b|\/\s*\d+\s*m\b/i },
  { key: 'ruck', claim: /\bruck(?:ing|s)?\b|\bloaded carr(?:y|ies|ying)\b/i, row: /\bruck\b|\bbackpack carry\b|\bloaded carry\b/i },
  { key: 'pull-up work', claim: /\bpull[- ]?ups?\b|\bpull[- ]?up work\b/i, row: /\bpull[- ]?up\b|\bchin[- ]?up\b/i },
  { key: 'squat', claim: /\bsquats?\b/i, row: /\bsquat\b/i },
  { key: 'deadlift', claim: /\bdeadlifts?\b/i, row: /\bdeadlift\b/i },
  { key: 'press', claim: /\b(?:overhead )?press(?:ing)?\b/i, row: /\bpress\b/i },
];

// Verbs that assert the thing gets bigger. "Moves", "changes" and "adjusts" are
// deliberately absent: a pace band that moves when the prior week was clean is
// a conditional, not a promise.
const RISE = /\b(?:build(?:s|ing)?|rebuild(?:s|ing)?|increas(?:e|es|ing)|progress(?:es|ing|ively)?|grow(?:s|ing)?|extend(?:s|ing)?|lengthen(?:s|ing)?|add(?:s|ing)?|step(?:s|ping)? up|climb(?:s|ing)?|ramp(?:s|ing)?|rise(?:s|ing)?|work up)\b/i;

// Clauses that say what the block will NOT do. Left in place they turn every
// "never by adding a fourth running day" into a promise to add running days.
const NEGATED = /\b(?:never|rather than|instead of|without|not by|no need to)\b[^,.;]*/gi;

// A symptom-response instruction is not a promise. "If shin symptoms return,
// reduce the stressor most recently increased" contains a rise verb and three
// subjects, and asserts nothing at all about the prescription.
const CONDITIONAL = /\bif\b[^.]*\b(?:symptom|pain|irritat|sore|flare|hurt|niggle)/i;

// Verbs that say the thing is deliberately not moving. A clause carrying one of
// these is a hold, whatever the neighbouring clause promises.
const HOLD = /\b(?:stay(?:s|ing)?|held|hold(?:s|ing)?|fixed|unchanged|maintenance|maintain(?:s|ed|ing)?|same|constant|capped|keep(?:s|ing)? (?:load|time|it|the))\b/i;

// A progression claim names what grows. Without this, "make Monday One-Arm
// Pull-up all singles and add a little help on Tuesday" read as a promise to
// progress the pull-up, when it is the opposite -- an instruction to take load
// off a cranky elbow.
const QUANTITY = /\b(?:min(?:ute)?s?|reps?|sets?|kg|km|metres?|meters?|load|volume|distance|duration|pace|weight|intensity|gradually|progressively|week by week|each week|over the block|toward|towards)\b/i;

// The verb has to belong to the subject. "Pull-up work builds gradually, while
// the ruck stays at 20 kg" is one sentence making two opposite statements, and
// reading it whole charged the ruck with the pull-up's promise.
const CLAUSE = /\s*(?:;|,?\s+\b(?:while|whereas|but|although|though)\b)\s*/i;

// A sentence may also open with its subordinate clause, and then the boundary
// is the first comma rather than a conjunction. Reading "While shins and
// next-day soreness stay normal, rebuild toward the top of your 18-20 km range"
// as one clause let "stay normal" -- a statement about the athlete's shins --
// cancel a promise about the easy runs, which is how the most expensive finding
// in the review went back to being invisible.
const LEADING = /^\s*(?:while|when|once|if|as long as|provided|after|before|unless|since)\b[^,]*,\s*/i;

function clauses(sentence) {
  const lead = sentence.match(LEADING);
  const parts = lead ? [lead[0], sentence.slice(lead[0].length)] : [sentence];
  return parts.flatMap((p) => p.split(CLAUSE));
}

const sentences = (text) => [...String(text || '').matchAll(/[^.!?\n]+[.!?]?/g)]
  .filter((m) => m[0].trim().length > 12);

export function narrativeClaims(head) {
  const out = [];
  for (const s of sentences(head)) {
    if (CONDITIONAL.test(s[0])) continue;
    for (const clause of clauses(s[0])) {
      const clean = clause.replace(NEGATED, ' ');
      if (!RISE.test(clean) || HOLD.test(clean) || !QUANTITY.test(clean)) continue;
      for (const subject of SUBJECTS) {
        if (!subject.claim.test(clean)) continue;
        out.push({ subject: subject.key, sentence: s[0].trim(), clause: clause.trim(), index: s.index });
      }
    }
  }
  return out;
}

// Every number a row can be measured by. A subject progresses if any one of
// them rises: minutes for an easy run, metres for an interval, kilos for a
// press, reps for a pull-up. Insisting on one unit per subject is what let the
// original check miss a progression written in minutes.
const NUM = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

// Seconds per kilometre, from "9:25-9:35/km" or "~5:20-5:50/km". The fastest
// end of the band is the claim, and a ruck whose only moving variable is pace
// looked completely flat until this was read.
function paceSeconds(text) {
  const all = [...String(text).matchAll(/(\d{1,2}):(\d{2})\s*(?:[-\u2013]\s*\d{1,2}:\d{2}\s*)?\/\s*km/gi)]
    .map((m) => Number(m[1]) * 60 + Number(m[2]));
  return all.length ? Math.min(...all) : null;
}

function measures(cells, parsed) {
  const reps = String(cells[parsed.reps] || '');
  const load = Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '';
  const val = (re, text) => {
    const all = [...String(text).matchAll(re)].map((m) => Number(m[1]));
    return all.length ? Math.max(...all) : null;
  };
  return {
    km: val(/(\d+(?:\.\d+)?)\s*km\b/gi, reps),
    m: val(/(\d+(?:\.\d+)?)\s*m\b(?!in)/gi, reps),
    min: val(/(\d+(?:\.\d+)?)\s*min\b/gi, reps),
    // A bare reps cell ("4", "8-10") only counts when it is not a distance or
    // a duration, otherwise "400 m" reads as 400 reps.
    reps: /\b(?:km|m\b|min|sec|s\b)/i.test(reps) ? null : NUM(reps),
    sets: NUM(cells[parsed.sets]),
    load: val(/(\d+(?:\.\d+)?)\s*kg\b/gi, load),
    // Negated so that "bigger is progress" holds for every unit alike.
    pace: (() => { const p = paceSeconds(cells.join(' ')); return p == null ? null : -p; })(),
  };
}

export function weeklyMeasures(program, subject) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let best = null;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !subject.row.test(name)) continue;
      const whole = cells.join(' ');
      if (subject.qualifier && !subject.qualifier.test(whole)) continue;
      if (subject.exclude && subject.exclude.test(whole)) continue;
      const m = measures(cells, parsed);
      best = best || {};
      for (const k of Object.keys(m)) {
        if (m[k] == null) continue;
        best[k] = best[k] == null ? m[k] : Math.max(best[k], m[k]);
      }
    }
    if (best && Object.keys(best).length) out.push({ week, ...best });
  }
  return out;
}

const UNITS = ['km', 'm', 'min', 'reps', 'sets', 'load', 'pace'];

export function subjectRises(series) {
  for (const unit of UNITS) {
    const seen = series.filter((s) => s[unit] != null);
    if (seen.length < 2) continue;
    if (seen.some((s, i) => i > 0 && s[unit] > seen[i - 1][unit])) return unit;
  }
  return null;
}

export function collectClaimIntegrityFlags(program, intake = {}) {
  const source = String(program || '');
  const head = narrative(source);
  const flags = [];
  const seen = new Set();
  for (const claim of narrativeClaims(head)) {
    if (seen.has(claim.subject)) continue;
    const subject = SUBJECTS.find((s) => s.key === claim.subject);
    const series = weeklyMeasures(source, subject);
    if (series.length < 2) continue;
    if (subjectRises(series)) continue;
    seen.add(claim.subject);
    const shown = UNITS
      .filter((u) => u !== 'pace' && series.every((s) => s[u] != null))
      .map((u) => `${u} ${series.map((s) => s[u]).join(' / ')}`)
      .join(', ');
    flags.push({
      code: 'V93_STATED_PROGRESSION_ABSENT',
      subject: claim.subject,
      sentence: claim.sentence,
      series,
      detail: `The block tells the athlete the ${claim.subject} progresses -- "${claim.sentence}" -- and nothing the prescription measures it by ever increases${shown ? ` (${shown})` : ''}. Either write the progression into the weeks or say plainly that the dose is held; an athlete who reads a promise and is handed four identical weeks cannot tell which one the coach meant.`,
    });
  }
  return flags;
}

export function buildClaimIntegrityBrief() {
  return [
    '* DO NOT DESCRIBE A PROGRESSION THE TABLE DOES NOT CONTAIN.',
    '  If the narrative says something builds, rebuilds, increases, extends or steps up -- easy-run duration, ruck pace, interval volume, a lift -- then the weekly rows for that thing must actually show a larger number in some column. Saying it and not writing it is the most common way a block misleads the athlete it was written for.',
    '  Holding a dose flat is frequently correct. When it is, write it as a decision: name the thing and say it is held at maintenance, and why. Do not hand the athlete the progression as homework ("add a few minutes when you feel good") while the table stays flat; if the weeks should get longer, prescribe the longer weeks.',
  ].join('\n');
}
