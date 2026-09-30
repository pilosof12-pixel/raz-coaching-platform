// engine/freestanding_balance_progression.js
//
// Coach review, on the Youth block: "There are plenty of kick-ups, but the
// actual freestanding handstand goal is not developed strongly enough... A first
// freestanding handstand requires progressive unsupported balance exposure, not
// just increasing wall-hold duration. Claude should distinguish: position
// capacity = wall hold, entry skill = kick-up, balance skill = freestanding
// attempts/holds. All three can exist, but the primary goal requires the third
// to progress."
//
// The engine had been treating a kick-up as balance work -- the same conflation
// he objected to. Checked against the delivered block, the ONLY exposure counting
// toward the handstand goal in any week was the kick-up. The athlete had an entry
// and a wall hold and no unsupported balance time at all, which is the one thing
// a first freestanding handstand is made of.
//
// The rung added here is deliberately small. His instruction was explicit: "Do
// not fix this by adding lots more volume. At age 13, I'd rather have short,
// frequent, high-quality attempts with clear success criteria." So the set count
// never moves and the attempts stay short; what progresses is the hold being
// aimed at, and the standard is stated rather than implied.

import { parseWeek } from './v34_workload_accounting.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

const KICK_UP = /controlled handstand kick[- ]?up|handstand kick[- ]?up/i;
// Unsupported balance, as distinct from a wall or back-to-wall hold.
const FREESTANDING = /freestanding handstand|unsupported handstand|handstand balance/i;
const WALL_HOLD = /wall|back[- ]?to[- ]?wall|chest[- ]?to[- ]?wall/i;

const MOVEMENT = 'Freestanding Handstand Hold';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join('\n'); }

export function freestandingHandstandGoal(intake = {}) {
  const goals = ['primary_goals', 'secondary_goals'].flatMap((k) => arr(intake[k])).map(String).join(' | ');
  if (!/freestanding handstand|unsupported handstand|handstand balance/i.test(goals)) return false;
  // Acquisition, not maintenance: the athlete does not yet own the balance.
  const evidence = `${txt(intake.current_numbers)} ${txt(intake.notes)} ${txt(intake.clarification_answers)}`;
  return /no reliable unsupported balance|cannot.*freestanding|wall[- ]?facing|back[- ]?to[- ]?wall|improving/i.test(evidence);
}

// Short, fresh and frequent. The set count is identical in every week; the hold
// being aimed at is what moves.
const RUNGS = {
  1: {
    reps: 'up to 5 sec',
    note: 'Unsupported balance, taken fresh. Kick up and hold whatever balance you find, even a second - that second IS the skill. Bail to the side the moment it goes. Stop the set when the entries stop being controlled, not when the attempts run out.',
  },
  2: {
    reps: 'up to 8 sec',
    note: 'Unsupported balance, taken fresh. Aim to beat Week 1 by a second or two on your best attempt, not by taking more attempts. Bail to the side the moment it goes, and stop the set when entries stop being controlled.',
  },
  3: {
    reps: 'up to 12 sec',
    note: 'Unsupported balance, taken fresh. This is the week to find a real hold: same number of attempts, and the target is the longest clean balance of the block. Bail to the side the moment it goes; stop the set when entries stop being controlled.',
  },
  4: {
    reps: 'best clean hold',
    note: 'Unsupported balance, taken fresh. Same attempts as Week 3, but stop chasing a longer hold: repeat the best clean balance you already own. Stop after any entry that is not controlled.',
  },
};

export function collectFreestandingBalanceFlags(program, intake = {}) {
  if (!freestandingHandstandGoal(intake)) return [];
  const source = String(program || '');
  const missing = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(source, week);
    if (!parsed) continue;
    const names = parsed.rows
      .map((c) => String(c[parsed.exercise] || '').trim())
      .filter((n) => n && !isWarmup(n));
    const hasBalance = names.some((n) => FREESTANDING.test(n) && !WALL_HOLD.test(n));
    if (!hasBalance) missing.push(week);
  }
  if (!missing.length) return [];
  return [{
    code: 'V106_FREESTANDING_BALANCE_MISSING',
    weeks: missing,
    detail: `The block names a freestanding handstand as a goal but contains no unsupported balance exposure in week${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. A kick-up is the entry and a wall hold is position capacity; neither is balance time, and balance time is what the goal is made of.`,
  }];
}

export function normalizeFreestandingBalance(program, intake = {}) {
  const original = String(program || '');
  const flags = collectFreestandingBalanceFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  let candidate = original;
  const repairs = [];
  for (const week of flags[0].weeks) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    // Immediately after each kick-up: the entry is the warm-up for the balance,
    // and both belong before anything that makes the athlete tired.
    const insertAfter = [];
    parsed.rows.forEach((cells, i) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (name && !isWarmup(name) && KICK_UP.test(name)) insertAfter.push(i);
    });
    if (!insertAfter.length) continue;

    const rung = RUNGS[week] || RUNGS[1];
    let offset = 0;
    for (const at of insertAfter) {
      const source = parsed.rows[at + offset];
      const row = new Array(parsed.header.length).fill('');
      row[parsed.day] = source[parsed.day];
      row[parsed.exercise] = MOVEMENT;
      if (Number.isInteger(parsed.load)) row[parsed.load] = 'Bodyweight';
      row[parsed.sets] = '2';
      row[parsed.reps] = rung.reps;
      if (Number.isInteger(parsed.rest)) row[parsed.rest] = '60-90 sec';
      const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
      if (effortIndex >= 0) row[effortIndex] = 'N/A';
      if (Number.isInteger(parsed.notes)) row[parsed.notes] = rung.note;
      parsed.rows.splice(at + offset + 1, 0, row);
      offset += 1;
      repairs.push({ type: 'freestanding_balance_exposure', week, day: source[parsed.day] });
    }
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}
