// "No two running days are consecutive" is a constraint athletes state for a
// reason, and the reason is usually a tendon.
//
// The sprint triathlete's achilles flared fourteen months ago "after adding two
// running days in one week", and her notes say plainly that the achilles "does
// not tolerate back-to-back" runs. Run #161 delivered her a block with three
// consecutive running days every week -- an 8-minute brick run off the bike on
// Tuesday, between Monday's intervals and Wednesday's easy run -- and five
// running days in Week 2 against the three she runs now. That is the mechanism
// of her previous injury, written into her program. No rule caught it, and the
// grader's 15-of-18 reproduction of the coach did not either.
//
// The model invented the brick runs; nothing in the engine asks for them. Brick
// work is good triathlon instinct, which is why the constraint has to be said to
// the model in so many words (see endurance_specialist_rules.js) and enforced on
// what comes back.
//
// The same statement is detected in the intake, where a schedule that
// contradicts it is asked about before any call is made. This module is where
// the wording lives, so the two checks cannot drift apart.

export const NO_CONSECUTIVE_RUN_DAYS = [
  /\bno\s+two\s+running\s+days?\s+(?:are|should\s+be|can\s+be)?\s*consecutive\b/i,
  /\bconsecutive\s+running\s+days?\s+are\s+not\s+(?:tolerated|possible|an option)\b/i,
  /\b(?:does\s+not|doesn't|cannot|can't)\s+tolerate\s+(?:back[- ]to[- ]back|consecutive)\s+(?:runs?|running)\b/i,
  /\b(?:back[- ]to[- ]back|consecutive)\s+running\s+days?\s+are\s+not\b/i,
];

const flat = (v) => (Array.isArray(v) ? v.map(flat).join(' | ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v || ''));

export function statesNoConsecutiveRunDays(intake = {}) {
  const stated = flat([intake?.notes, intake?.pain, intake?.injuries, intake?.limitations, intake?.clarification_answers]);
  return NO_CONSECUTIVE_RUN_DAYS.some((re) => re.test(stated));
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayIdx = (d) => WEEK.indexOf(String(d || '').trim().slice(0, 3).toLowerCase());
const RUN_ROW = /^\s*(?:easy\s+|long\s+|tempo\s+|brick\s+)?run(?:ning)?\s*$/i;

function weekBlock(program, week) {
  const m = String(program).match(new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i'));
  return m ? { whole: m[0], head: m[1], body: m[2], tail: m[3] } : null;
}

function minutesOf(reps, sets) {
  const m = String(reps || '').match(/(\d+(?:\.\d+)?)\s*(min|minutes?|sec|s)\b/i);
  if (!m) return null;
  const v = Number(m[1]) * (/^s|sec/i.test(m[2]) ? 1 / 60 : 1);
  return v * Math.max(1, Number(String(sets || '').match(/\d+/)?.[0] || 1));
}

function runRows(block) {
  const lines = block.body.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (i === 0) return;
    const c = line.split('\t');
    if (c.length < 9 || !RUN_ROW.test(c[1] || '')) return;
    out.push({ i, day: c[0], idx: dayIdx(c[0]), minutes: minutesOf(c[4], c[3]), single: singleSet(c[3]) });
  });
  return out;
}

function consecutivePairs(indices) {
  const days = [...new Set(indices)].filter((x) => x >= 0).sort((a, b) => a - b);
  const pairs = [];
  for (let i = 0; i < days.length; i += 1) {
    for (let j = i + 1; j < days.length; j += 1) {
      const gap = days[j] - days[i];
      if (gap === 1 || gap === 6) pairs.push([days[i], days[j]]);
    }
  }
  return pairs;
}

export function collectRunDaySpacingFlags(program, intake = {}) {
  if (!statesNoConsecutiveRunDays(intake)) return [];
  const out = [];
  for (let w = 1; w <= 4; w += 1) {
    const b = weekBlock(program, w);
    if (!b) continue;
    const pairs = consecutivePairs(runRows(b).map((r) => r.idx));
    if (pairs.length) {
      out.push({
        code: 'STATED_RUN_SPACING_VIOLATED',
        week: w,
        pairs: pairs.map(([a, c]) => [WEEK[a], WEEK[c]]),
      });
    }
  }
  return out;
}

// Which run goes is decided by the athlete's own schedule, not by its length.
//
// A first version removed any run with under fifteen minutes of work, and on
// run #160 that deleted Monday's 4 x 90 sec intervals -- six minutes of work, and
// her primary run session of the week. That is the same misreading fixed in the
// exposure rule earlier the same day: repeated work against a pace is a main
// session however short its total. Length cannot tell a brick from intervals.
//
// Her sport_schedule can. It names Monday, Wednesday and Saturday as running
// days. A run the model put on Tuesday or Friday is an addition, and under her
// constraint it is the addition that has to go, whatever its structure. A run on
// a day she scheduled is never touched. Only where the intake names no running
// days does length decide, and then only a single short continuous run -- a
// shake-out -- may move, never repeated work.
const SHORT_MINUTES = 15;

function scheduledRunDays(intake = {}) {
  const sched = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  return new Set(sched
    .filter((e) => /\brun(?:ning)?\b/i.test(`${e?.type || ''} ${e?.session || ''} ${e?.activity || ''}`))
    .map((e) => dayIdx(e?.day))
    .filter((x) => x >= 0));
}

const singleSet = (sets) => Number(String(sets || '').match(/\d+/)?.[0] || 1) <= 1;
const RUN_PROMISE = [
  [/[,;]?\s*then\s+go\s+straight\s+(?:in)?to\s+the\s+run\b/gi, ''],
  [/\bpre-run\s+/gi, ''],
  [/\bbefore\s+the\s+brick\s+run\b/gi, 'as the session closer'],
];

export function normalizeRunDaySpacing(program, intake = {}) {
  const original = String(program || '');
  const unchanged = { program: original, repaired: false, repairs: [] };
  if (!collectRunDaySpacingFlags(original, intake).length) return unchanged;

  let current = original;
  const repairs = [];
  for (let w = 1; w <= 4; w += 1) {
    for (let guard = 0; guard < 7; guard += 1) {
      const b = weekBlock(current, w);
      if (!b) break;
      const runs = runRows(b);
      const pairs = consecutivePairs(runs.map((r) => r.idx));
      if (!pairs.length) break;
      const inPairs = new Set(pairs.flat());
      const scheduled = scheduledRunDays(intake);
      const additions = runs.filter((r) => inPairs.has(r.idx) && scheduled.size && !scheduled.has(r.idx));
      const shakeouts = scheduled.size ? [] : runs.filter((r) => inPairs.has(r.idx)
        && r.single && r.minutes != null && r.minutes < SHORT_MINUTES);
      const candidate = [...additions, ...shakeouts].sort((a, b2) => (a.minutes ?? 0) - (b2.minutes ?? 0))[0];
      if (!candidate) break; // runs she scheduled are adjacent: a schedule question, not ours to move
      const lines = b.body.split('\n');
      lines.splice(candidate.i, 1);
      // The ride that led into it must stop saying a run follows.
      for (let k = 1; k < lines.length; k += 1) {
        const c = lines[k].split('\t');
        if (c.length < 9 || c[0] !== candidate.day || !/\bbike\b|\bride\b|\bcycl/i.test(c[1] || '')) continue;
        let note = c[7] || '';
        for (const [re, sub] of RUN_PROMISE) note = note.replace(re, sub);
        // Phrasing the patterns do not know ("bike-to-run pairs") would leave the
        // ride promising a run that is gone. A note that still mentions running is
        // replaced outright with one that is true.
        if (/\brun(?:s|ning)?\b|\bbrick\b/i.test(note)) {
          note = 'Ridden on its own: running stays off the days beside your run days, as your achilles needs. Keep it smooth and seated.';
        }
        note = note.replace(/\s{2,}/g, ' ').replace(/\s+([.;,])/g, '$1').trim();
        c[7] = note.charAt(0).toUpperCase() + note.slice(1);
        lines[k] = c.join('\t');
      }
      current = current.replace(b.whole, `${b.head}${lines.join('\n')}${b.tail}`);
      repairs.push({ action: 'remove_short_run_beside_run_day', week: w, day: candidate.day, minutes: candidate.minutes });
    }
  }
  return { program: current, repaired: current !== original, repairs };
}
