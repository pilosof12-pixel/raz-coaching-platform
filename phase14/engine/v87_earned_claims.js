// engine/v87_earned_claims.js
//
// A programme should not be able to say something it has not done.
//
// Three claims a block makes about itself, each of which was decorative rather
// than earned:
//
//   A phase label. "Specificity", "express" and "taper" describe what a week
//   does. A week called a taper that carries Week-1 volume is mislabelled, and
//   the label is the first thing a coach reads.
//
//   A priority. If a goal is primary, it should generally be trained more often
//   than the general work around it. A block that calls a lift primary and
//   trains it once a week while accessories run three times has an ordering in
//   its prose and a different one in its table.
//
//   A progression. Four identical weeks are sometimes exactly right --
//   maintenance through a season is the clearest case -- but then the block
//   should say so. Unstated repetition is indistinguishable from copy-paste.

import { parseWeek } from './v34_workload_accounting.js';

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join(' '); }
function num(v) { const m = String(v || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }

function weekRows(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rows = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    rows.push({
      index, name,
      day: String(cells[parsed.day] || '').trim().toLowerCase().slice(0, 3),
      sets: num(cells[parsed.sets]) || 0,
      reps: String(cells[parsed.reps] || '').trim(),
      load: Number.isInteger(parsed.load) ? String(cells[parsed.load] || '').trim() : '',
    });
  });
  return { parsed, rows };
}
const totalSets = (rows) => rows.reduce((n, r) => n + r.sets, 0);

// --- 1. phase labels must be earned ----------------------------------------

const PHASE_CLAIMS = [
  { label: 'taper', asLabel: /\btaper(?:ing)? week\b|\bweek[^.\n]{0,24}\b(?:is|as) a taper\b/i,
    test: (w, prev) => totalSets(w) < totalSets(prev) * 0.85 },
  { label: 'deload', asLabel: /\bdeload week\b|\bweek[^.\n]{0,24}\b(?:is|as) a deload\b/i,
    test: (w, prev) => totalSets(w) < totalSets(prev) * 0.85 },
  { label: 'consolidation', asLabel: /\bconsolidation week\b|\bweek[^.\n]{0,24}\b(?:is|as) a consolidation\b/i,
    test: (w, prev) => totalSets(w) < totalSets(prev) },
  { label: 'peak', asLabel: /\bpeak (?:week|load week)\b|\bweek[^.\n]{0,24}\b(?:is|as) (?:the )?peak\b/i,
    test: (w, prev) => totalSets(w) >= totalSets(prev) },
];

export function collectPhaseLabelFlags(program, intake = {}) {
  const source = String(program || '');
  const flags = [];
  for (let week = 2; week <= 4; week += 1) {
    const cur = weekRows(source, week);
    const prev = weekRows(source, week - 1);
    if (!cur || !prev) continue;
    // The label as it appears in this week's own rows and their notes.
    const parsed = cur.parsed;
    const scope = parsed.rows.map((c) => c.join(' ')).join(' ');
    for (const claim of PHASE_CLAIMS) {
      // Only when the word is used as this week's label. "Consolidate the
      // technique before adding load" is a coaching verb, not a phase claim,
      // and reading it as one flagged a tactical block the coach rated 8.7.
      if (!claim.asLabel.test(scope)) continue;
      if (claim.test(cur.rows, prev.rows)) continue;
      flags.push({
        code: 'V87_PHASE_LABEL_NOT_EARNED',
        week, claim: claim.label,
        detail: `Week ${week} is described as a ${claim.label} but carries ${totalSets(cur.rows)} sets against ${totalSets(prev.rows)} the week before. A phase name is a claim about the prescription underneath it, and a coach reads the label first. Either make the week do what the label says, or call it what it is.`,
      });
      break;
    }
  }
  return flags;
}

// --- 2. a primary goal should be trained like one ---------------------------

// Words from the athlete's own primary goals that name a movement.
const STOPWORDS = /\b(?:the|and|for|with|from|into|toward|towards|improve|increase|build|get|a|an|to|my|of|in|on|at|by|kg|reps?|sets?|week|weeks|first|strong|stronger|better|more)\b/gi;
export function primaryTerms(intake = {}) {
  const terms = new Set();
  for (const goal of arr(intake.primary_goals)) {
    for (const word of String(goal || '').toLowerCase().replace(STOPWORDS, ' ').split(/[^a-z-]+/)) {
      if (word.length >= 4) terms.add(word);
    }
  }
  return [...terms];
}

function exposureDays(rows, terms) {
  const days = new Set();
  for (const r of rows) {
    const n = r.name.toLowerCase();
    if (terms.some((t) => n.includes(t))) days.add(r.day);
  }
  return days.size;
}

export function collectPriorityFlags(program, intake = {}) {
  const terms = primaryTerms(intake);
  if (!terms.length) return [];
  const source = String(program || '');
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const data = weekRows(source, week);
    if (!data || !data.rows.length) continue;

    const isPrimary = (name) => terms.some((t) => name.toLowerCase().includes(t));
    const primaryDays = exposureDays(data.rows, terms);
    if (primaryDays === 0) continue; // a different rule owns "missing entirely"

    // Counting every training day as the denominator punished a hybrid athlete
    // for squatting twice in a week whose other days were runs and sport, which
    // is correct coaching. The real signal is narrower and is what the review
    // asked for: some ordinary supporting exercise is trained MORE often than
    // the goal the athlete called primary.
    const days = new Map();
    for (const r of data.rows) {
      if (isPrimary(r.name)) continue;
      const key = r.name.toLowerCase();
      if (!days.has(key)) days.set(key, new Set());
      days.get(key).add(r.day);
    }
    let worst = null;
    for (const [name, set] of days) {
      if (set.size > primaryDays && (!worst || set.size > worst.count)) worst = { name, count: set.size };
    }
    if (!worst) continue;

    flags.push({
      code: 'V87_PRIMARY_GOAL_UNDER_TRAINED',
      week, primaryDays, rival: worst.name, rivalDays: worst.count,
      detail: `Week ${week} trains the primary goal on ${primaryDays} day(s) while ${worst.name} is trained on ${worst.count}. A goal the athlete named as primary should generally be exposed at least as often as the supporting work around it. If there is a reason -- a sport taking the recovery, an injury, a deliberate maintenance phase -- say so in the narrative, because otherwise the table contradicts the priority the programme claims.`,
    });
  }
  return flags;
}

// --- 3. repetition is a decision, and should read like one ------------------

const MAINTENANCE_LANGUAGE = /\b(?:maintain|maintenance|hold(?:ing)?|unchanged|deliberately (?:the same|repeated|flat)|same as|repeat(?:s|ed)?|keep(?:s|ing)? the same|in[- ]season|availability)\b/i;

export function collectRepetitionFlags(program, intake = {}) {
  const source = String(program || '');
  const signature = (data) => data.rows
    .map((r) => `${r.day}|${r.name.toLowerCase()}|${r.sets}|${r.reps}|${r.load.toLowerCase()}`)
    .sort().join('\n');
  const flags = [];
  for (let week = 2; week <= 4; week += 1) {
    const cur = weekRows(source, week);
    const prev = weekRows(source, week - 1);
    if (!cur || !prev || !cur.rows.length) continue;
    if (signature(cur) !== signature(prev)) continue;
    // Identical is fine when the block says why.
    const narrative = source.split(/START_WEEK1_TSV/i)[0];
    const weekScope = cur.parsed.rows.map((c) => c.join(' ')).join(' ');
    if (MAINTENANCE_LANGUAGE.test(narrative) || MAINTENANCE_LANGUAGE.test(weekScope)) continue;
    flags.push({
      code: 'V87_REPEATED_WEEK_UNEXPLAINED',
      week,
      detail: `Week ${week} is identical to Week ${week - 1} in every exercise, set, rep and load, and nothing says why. Repeating a week is often correct -- maintenance through a season, holding a dose while a sport takes the load -- but it has to be stated. An unexplained repeat is indistinguishable from a copy-paste, and the athlete cannot tell which one they were given.`,
    });
  }
  return flags;
}

// Deliberately NOT wired into the blocking validation bundle. None of these
// three has a mechanical repair: renaming a phase, rebalancing a week's
// frequency and justifying a repeat are all coaching judgements, and a blocking
// code without a deterministic repair spends four attempts and kills the build.
// The brief prevents them; these collectors are for offline QA of delivered
// programs, where they found a real inversion -- an athlete whose primary goal
// was the 2 km erg, rowing twice a week while side plank ran three times.
export function collectEarnedClaimFlags(program, intake = {}) {
  return [
    ...collectPhaseLabelFlags(program, intake),
    ...collectPriorityFlags(program, intake),
    ...collectRepetitionFlags(program, intake),
  ];
}

export function buildEarnedClaimsBrief(intake = {}) {
  return [
    '* A BLOCK MAY NOT CLAIM WHAT IT HAS NOT DONE.',
    '  Phase names are claims about the prescription beneath them. Do not call a week a taper, a deload or a consolidation unless its volume actually falls, and do not call it a peak unless it is the hardest week in the block. If a week is simply another training week, name it plainly.',
    '  Train the primary goal like the primary goal. It should generally be exposed at least as often as the general work supporting it. Where something else -- a sport, an injury, a deliberate maintenance phase -- means it should not be, say so in the narrative rather than leaving the table to contradict the stated priority.',
    '  Repeating a week is a decision, so write it as one. Holding a dose while a sport takes the load, or maintaining through a season, is good coaching; say that is what you are doing. An identical week with no explanation reads as copy-paste, and the athlete cannot tell the difference.',
  ].join('\n');
}
