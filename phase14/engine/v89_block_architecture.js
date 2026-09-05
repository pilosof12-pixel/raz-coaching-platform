// engine/v89_block_architecture.js
//
// Three rules about the shape of a block, not the contents of a session.
//
// The review that prompted this made the criticism precisely: the generator
// answers at the exercise level when the question was at the system level.
// "Reduce sets" when the question was when is the meet. "Progress sprint
// distances" when the question was where match day sits and what five football
// sessions are already doing. Each of the three is measurable, and each was
// measurably absent:
//
//   The weightlifter's block referred to its distance from the meet twice.
//   The footballer's block positioned nothing by match day -- not once.
//   The masters rower's sport share was 31% of rows in all four weeks, to the
//   row, while the individual exercises progressed underneath it.

import { parseWeek } from './v34_workload_accounting.js';
import { competitionProfile, STATE, stateForWeek, eventType } from './v68_competition_state.js';
import { isInSeason, matchDays } from './v83_in_season.js';
import { governingClock, CLOCK, rehabStage, STAGE } from './v86_training_clock.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function dayKey(d) {
  const s = String(d || '').trim().toLowerCase().slice(0, 3);
  return WEEKDAYS.includes(s) ? s : null;
}

// --- 1. no peak or taper without a Day 0 ------------------------------------

// Language that asserts the block is arriving somewhere.
const ARRIVAL_LANGUAGE = /\b(?:peak week|peaking|the taper|taper week|taper(?:ing)? into|realis[sz]ation|competition week|fight week|meet week|peak(?:ing)? phase)\b/i;

export function hasDayZero(intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  return Boolean(profile && profile.blockEndsAtEvent);
}

export function collectDayZeroFlags(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  // Wording that explicitly DEFERS the peak is the opposite of claiming it, and
  // the engine writes some of it itself: v86 states "the taper comes later, as
  // its own block" precisely to be honest about a runway block. Matching that as
  // an unearned claim set two repairs rewriting each other, so the chain never
  // settled. Strip the deferrals before looking for a claim.
  const DEFERRAL = /\b(?:not the (?:taper|peak)|no taper|the taper comes later|taper (?:comes|is) later|(?:taper|peak)[^.]{0,40}\b(?:separate|later|its own) block|comes later, as its own block)\b[^.]*\.?/gi;
  const narrative = source.split(/START_WEEK1_TSV/i)[0].replace(DEFERRAL, ' ');
  const claim = narrative.match(ARRIVAL_LANGUAGE);
  if (!claim) return [];
  if (hasDayZero(intake, now)) return [];
  // An in-season athlete tapering gym load into match day is correct coaching
  // and is governed by its own rule. This one is about blocks that claim to
  // arrive at an event date they do not contain.
  if (governingClock(intake, now) === CLOCK.MICROCYCLE) return [];

  const profile = competitionProfile(intake, now);
  const why = profile
    ? `the event is about ${profile.weeksOut} weeks away and this block does not reach it`
    : 'there is no competition date in the intake at all';
  return [{
    code: 'V89_PEAK_CLAIMED_WITHOUT_DAY_ZERO',
    phrase: claim[0],
    detail: `The block uses "${claim[0]}", which is a claim about arriving at a date, but ${why}. A peak and a taper are defined by Day 0: without one they are decoration, and they tell an athlete the block is doing something it is not. Name the block for what it is -- a build, an intensification, an in-season phase -- and leave peaking language for the block that actually ends at the event.`,
  }];
}

const PLAIN_WORDING = [
  [/\bpeak week\b/gi, 'the heaviest week'],
  [/\bpeaking phase\b/gi, 'build phase'],
  [/\bpeaking\b/gi, 'building'],
  [/\bthe taper\b/gi, 'the lighter week'],
  [/\btaper week\b/gi, 'lighter week'],
  // Verb forms have to be replaced with matching verb forms. "taper into" ->
  // "easing into" produces "we easing into it", which is the second time this
  // exact slip has appeared in a rewrite rule.
  [/\btapering into\b/gi, 'easing into'],
  [/\btaper into\b/gi, 'ease into'],
  [/\brealis(?:ation|ation)\b/gi, 'expression'],
  [/\brealization\b/gi, 'expression'],
  [/\b(?:competition|fight|meet) week\b/gi, 'the final week of this block'],
];

export function repairDayZeroClaims(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  if (!collectDayZeroFlags(source, intake, now).length) return source;
  const split = source.search(/START_WEEK1_TSV/i);
  if (split < 0) return source;
  // Rewrite only the sentences that make a claim. A sentence deferring the peak
  // to a later block is already saying the right thing and must survive intact.
  const DEFERS = /\b(?:not the (?:taper|peak)|no taper|comes later|later, as its own block|separate block)\b/i;
  const narrative = source.slice(0, split).split(/(?<=\.)\s+/).map((sentence) => {
    if (DEFERS.test(sentence)) return sentence;
    let out = sentence;
    for (const [re, plain] of PLAIN_WORDING) out = out.replace(re, plain);
    return out;
  }).join(' ');
  return narrative + source.slice(split);
}

// --- 2. an in-season block is built around match day ------------------------

function offsetFromMatch(day, match) {
  const d = WEEKDAYS.indexOf(day);
  const m = WEEKDAYS.indexOf(match);
  if (d < 0 || m < 0) return null;
  // Days until the next match, expressed as a negative offset.
  const before = (m - d + 7) % 7;
  return before === 0 ? 0 : -before;
}

export function matchOffsets(intake = {}) {
  const match = matchDays(intake)[0];
  if (!match) return null;
  const gym = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  const out = new Map();
  for (const d of gym) out.set(d, offsetFromMatch(d, match));
  return out;
}

const MD_MARKER = /\bMD\s*[-+]\s*\d\b/i;

export function collectMatchDayFlags(program, intake = {}) {
  if (!isInSeason(intake)) return [];
  const offsets = matchOffsets(intake);
  if (!offsets || !offsets.size) return [];
  const source = String(program || '');
  if (MD_MARKER.test(source)) return [];
  const shown = [...offsets.entries()].map(([d, o]) => `${d} is MD${o}`).join(', ');
  return [{
    code: 'V89_SESSIONS_NOT_PLACED_BY_MATCH_DAY',
    detail: `The gym sessions are presented as weekdays, not as positions in the match week (${shown}). In-season, a session's distance from match day is what decides what belongs in it -- how hard it can be, how much it can leave behind, whether it primes or develops. Label each session with its offset and let the offset drive the content.`,
  }];
}

export function repairMatchDayPlacement(program, intake = {}) {
  if (!isInSeason(intake)) return String(program || '');
  const offsets = matchOffsets(intake);
  if (!offsets || !offsets.size) return String(program || '');
  let out = String(program || '');
  if (MD_MARKER.test(out)) return out;

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const rows = parsed.rows.map((c) => c.slice());
    const seen = new Set();
    let changed = false;
    rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      const day = dayKey(cells[parsed.day]);
      if (!name || isWarmup(name) || !day || !offsets.has(day)) return;
      // Once per session, on its first row, so the label reads as a heading
      // rather than being repeated on every line.
      const key = `${week}|${day}`;
      if (seen.has(key)) return;
      seen.add(key);
      const off = offsets.get(day);
      const note = String(cells[parsed.notes] || '');
      const label = `MD${off}: ${Math.abs(off)} day${Math.abs(off) === 1 ? '' : 's'} before the match.`;
      cells[parsed.notes] = note ? `${label} ${note}` : label;
      changed = true;
    });
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

// --- 3. a return shifts allocation toward the sport -------------------------

// A gym pulling machine is not the sport. "Rowing (masters)" produced the
// pattern /row/, which counted Cable Row, Seated Row Machine and
// Chest-Supported Row as sport exposure -- so the block reported a 34% share of
// the sport while the erg itself accounted for 15%, and the allocation rule
// believed a shift that had not happened. Whatever the sport, a row that names
// a gym implement is general work standing in for it.
const GYM_IMPLEMENT = /\b(?:cable|seated|chest[- ]supported|machine|dumbbell|barbell|bent[- ]over|inverted|ring|pendlay|t[- ]bar|single[- ]arm|landmine)\b/i;

export function isSportRow(name, re) {
  const n = String(name || '');
  if (!re || !re.test(n)) return false;
  return !GYM_IMPLEMENT.test(n);
}

function sportPattern(intake = {}) {
  const sport = String(intake.sport || '').toLowerCase();
  if (/row/.test(sport)) return /\b(?:erg|ergometer|on[- ]water|scull|sweep|row(?:ing)?)\b/i;
  if (/run|athletic/.test(sport)) return /\b(?:run|running|tempo|interval|track)\b/i;
  if (/swim/.test(sport)) return /\b(?:swim|pool)\b/i;
  if (/cycl|bike/.test(sport)) return /\b(?:bike|cycling|turbo)\b/i;
  const first = sport.split(/[^a-z]+/).filter((w) => w.length > 3)[0];
  return first ? new RegExp(`\\b${first}`, 'i') : null;
}

export function sportShareByWeek(program, intake = {}) {
  const re = sportPattern(intake);
  if (!re) return null;
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) return null;
    let total = 0;
    let sport = 0;
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      // Sets, not rows: a row count cannot be moved without inventing or
      // deleting exercises, and the honest way to shift the balance is to trim
      // the general work that is standing in for the sport.
      const sets = Number(String(cells[parsed.sets] || '').match(/\d+/)?.[0]) || 0;
      total += sets;
      if (isSportRow(name, re)) sport += sets;
    });
    if (!total) return null;
    out.push({ week, sport, total, share: sport / total });
  }
  return out;
}

// The same mechanism the intensification block already uses: specificity rises
// by the support work receding around the thing that matters, not by adding
// sessions the athlete has no room for. A brief alone did not move this -- the
// delivered block sat at 30% of sets in all four weeks -- so it is enforced.

export function repairAllocationShift(program, intake = {}, now = Date.now()) {
  if (governingClock(intake, now) !== CLOCK.REHAB) return String(program || '');
  if (rehabStage(intake) === STAGE.PROTECTED) return String(program || '');
  const re = sportPattern(intake);
  if (!re) return String(program || '');
  let out = String(program || '');

  const start = sportShareByWeek(out, intake);
  if (!start || start.length < 4) return out;
  if (start[3].share >= start[0].share + 0.06) return out;

  // Raise the share in the later weeks by trimming general accessory sets, in
  // the order a coach would drop them, never below one set and never touching
  // the sport itself.
  for (const week of [3, 4]) {
    const target = start[0].share + (week === 3 ? 0.03 : 0.06);
    // Bounded only against a pathological program: the loop already stops when
    // the target is met or nothing can be cut, and an arbitrary six passes left
    // the share short of what the rule then demanded.
    for (let pass = 0; pass < 60; pass += 1) {
      const now2 = sportShareByWeek(out, intake);
      if (!now2 || now2[week - 1].share >= target) break;
      const parsed = parseWeek(out, week);
      if (!parsed) break;
      const rows = parsed.rows.map((c) => c.slice());
      let cut = false;
      for (const pattern of GENERAL_CUT_ORDER) {
        const i = rows.findIndex((cells) => {
          const name = String(cells[parsed.exercise] || '').trim();
          if (!name || isWarmup(name) || isSportRow(name, re)) return false;
          if (!pattern.test(name)) return false;
          return (Number(String(cells[parsed.sets] || '').match(/\d+/)?.[0]) || 0) > 1;
        });
        if (i < 0) continue;
        const sets = Number(String(rows[i][parsed.sets]).match(/\d+/)[0]);
        rows[i][parsed.sets] = String(sets - 1);
        if (Number.isInteger(parsed.notes)) {
          const note = String(rows[i][parsed.notes] || '');
          const add = 'Trimmed as the block shifts toward the sport: general work gives way as tolerance for the event improves.';
          if (!note.includes('shifts toward the sport')) rows[i][parsed.notes] = note ? `${note} ${add}` : add;
        }
        cut = true;
        break;
      }
      if (!cut) break;
      const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
      out = out.replace(parsed.re, `$1${rebuilt}$3`);
    }
  }
  return out;
}

const GENERAL_CUT_ORDER = [
  /\b(?:plank|dead bug|pallof|side plank|trunk|ab wheel)\b/i,
  /\b(?:curl|extension|raise|fly|pull-?down|face pull)\b/i,
  /\b(?:press|bench|row)\b/i,
];

export function collectAllocationFlags(program, intake = {}, now = Date.now()) {
  if (governingClock(intake, now) !== CLOCK.REHAB) return [];
  const stage = rehabStage(intake);
  if (stage === STAGE.PROTECTED) return []; // capacity first is correct here
  const weeks = sportShareByWeek(program, intake);
  if (!weeks || weeks.length < 4) return [];

  // A meaningful shift, not a rounding drift. The delivered block moved two
  // points across four weeks and read as flat to the coach, which it was.
  const MEANINGFUL_SHIFT = 0.06;
  const first = weeks[0].share;
  const last = weeks[weeks.length - 1].share;
  if (last >= first + MEANINGFUL_SHIFT) return [];

  // Only ask for a shift the final week can actually reach. Trimming has a
  // floor of one set per row, so simulate cutting everything cuttable in the
  // week that has to rise and see where the share lands. Counting trimmable
  // work across both weeks let week 3's leftovers keep the rule demanding a
  // week-4 shift that had nothing left to give -- the same collector/repair
  // divergence that killed the peak block twice.
  const re = sportPattern(intake);
  const parsed = parseWeek(program, 4);
  if (!parsed) return [];
  let sportSets = 0;
  let floorTotal = 0;
  parsed.rows.forEach((cells) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    const sets = Number(String(cells[parsed.sets] || '').match(/\d+/)?.[0]) || 0;
    if (isSportRow(name, re)) { sportSets += sets; floorTotal += sets; return; }
    floorTotal += GENERAL_CUT_ORDER.some((pattern) => pattern.test(name)) ? Math.min(sets, 1) : sets;
  });
  // Ask for the smaller of "a meaningful shift" and "everything trimming can
  // reach". A fixed target the block cannot hit is unrepairable and kills the
  // build; a target of only what it can hit still has teeth, because the
  // delivered block did not come close to it.
  const achievable = floorTotal ? sportSets / floorTotal : 0;
  const required = Math.min(first + MEANINGFUL_SHIFT, achievable);
  if (required <= first + 0.005) return []; // nothing to ask for
  if (last >= required - 0.005) return [];

  const shown = weeks.map((w) => `W${w.week} ${Math.round(w.share * 100)}%`).join(', ');
  return [{
    code: 'V89_SPORT_ALLOCATION_NOT_SHIFTING',
    detail: `The sport's share of the work does not move across the block (${shown}). A return is not finished when the gym exercises progress: it is finished when the athlete is doing their sport again. As tolerance improves the allocation itself has to shift -- more of the week spent on the event, less on the general work that was standing in for it -- and here the gym progressed while the balance stayed exactly where it started.`,
  }];
}

// --- 4. the sport gets more of the week, not just a bigger slice of it ------
//
// Trimming accessory sets raises the sport's share arithmetically while the
// athlete still touches their sport on exactly the same days. The coach read
// that as what it is: "shift frequency and training budget toward the actual
// sport, not only by trimming accessory sets but by replacing some gym work
// with additional low-cost sport exposure." So the block has to buy the sport
// another day, and pay for it by giving up a gym slot rather than by adding a
// session the returning athlete has no room for.

// How many days a week actually touch the sport.
export function sportDaysByWeek(program, intake = {}) {
  const re = sportPattern(intake);
  if (!re) return null;
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) return null;
    const days = new Set();
    const sportDays = new Set();
    let lastDay = '';
    parsed.rows.forEach((cells) => {
      const raw = String(cells[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !lastDay) return;
      days.add(lastDay);
      if (isSportRow(name, re)) sportDays.add(lastDay);
    });
    out.push({ week, days: days.size, sport: sportDays.size, dayList: [...days], sportList: [...sportDays] });
  }
  return out;
}

export function collectSportFrequencyFlags(program, intake = {}, now = Date.now()) {
  if (governingClock(intake, now) !== CLOCK.REHAB) return [];
  if (rehabStage(intake) === STAGE.PROTECTED) return [];
  const weeks = sportDaysByWeek(program, intake);
  if (!weeks || weeks.length < 4) return [];
  if (weeks[3].sport > weeks[0].sport) return [];
  // Only ask for a day the week can actually give up: there must be a session
  // with no sport in it and something general to replace.
  if (!replaceableDay(program, 4, intake)) return [];
  const shown = weeks.map((w) => `W${w.week} ${w.sport}/${w.days}`).join(', ');
  return [{
    code: 'V89_SPORT_FREQUENCY_STATIC',
    detail: `The athlete touches their sport on the same number of days in week 4 as in week 1 (${shown} days). Trimming accessory sets moves the percentages without moving the training: as tolerance improves the sport should get more of the week, bought by replacing a gym slot with an additional low-cost exposure -- short, easy and well inside what the athlete tolerates -- not by adding a session on top.`,
  }];
}

// A day carrying no sport work and at least one general exercise that could
// give up its place.
function replaceableDay(program, week, intake) {
  const re = sportPattern(intake);
  const parsed = parseWeek(program, week);
  if (!re || !parsed) return null;
  const byDay = new Map();
  let lastDay = '';
  parsed.rows.forEach((cells, index) => {
    const raw = String(cells[parsed.day] || '').trim();
    if (raw) lastDay = raw;
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name) || !lastDay) return;
    if (!byDay.has(lastDay)) byDay.set(lastDay, []);
    byDay.get(lastDay).push({ index, name });
  });
  for (const [day, rows] of byDay) {
    if (rows.some((r) => isSportRow(r.name, re))) continue;
    for (const pattern of GENERAL_CUT_ORDER) {
      const target = rows.find((r) => pattern.test(r.name));
      if (target) return { parsed, day, target };
    }
  }
  return null;
}

// The sport as the program already names it, so an added exposure uses a
// movement the athlete is already doing and the dictionary already accepts.
function sportExerciseName(program, intake) {
  const re = sportPattern(intake);
  if (!re) return null;
  const counts = new Map();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').replace(/^\s*\[WARMUP\]\s*/i, '').trim();
      if (!name || !isSportRow(name, re)) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function repairSportFrequency(program, intake = {}, now = Date.now()) {
  if (governingClock(intake, now) !== CLOCK.REHAB) return String(program || '');
  if (rehabStage(intake) === STAGE.PROTECTED) return String(program || '');
  let out = String(program || '');
  const weeks = sportDaysByWeek(out, intake);
  if (!weeks || weeks.length < 4) return out;
  if (weeks[3].sport > weeks[0].sport) return out;
  const name = sportExerciseName(out, intake);
  if (!name) return out;

  // Week 4 buys the day. Week 3 buys one too if it is still level with week 1,
  // so the shift reads as a progression rather than a step at the end.
  for (const week of [3, 4]) {
    const before = sportDaysByWeek(out, intake);
    if (!before) break;
    if (before[week - 1].sport > before[0].sport) continue;
    const spot = replaceableDay(out, week, intake);
    if (!spot) continue;
    const { parsed, target } = spot;
    const rows = parsed.rows.map((c) => c.slice());
    const cells = rows[target.index];
    cells[parsed.exercise] = name;
    if (Number.isInteger(parsed.load)) cells[parsed.load] = 'Easy, conversational';
    cells[parsed.sets] = '1';
    cells[parsed.reps] = week === 3 ? '15 min' : '20 min';
    if (Number.isInteger(parsed.rest)) cells[parsed.rest] = 'n/a';
    const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
    if (rpeCol >= 0) cells[rpeCol] = '4';
    if (Number.isInteger(parsed.notes)) {
      cells[parsed.notes] = `Replaces ${target.name}: an extra low-cost exposure to the sport, easy throughout and well inside what is tolerated. `
        + `The return is measured in how much of the week is spent on the sport, not in how much the gym work has progressed.`;
    }
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

// --- briefs -----------------------------------------------------------------

export function buildBlockArchitectureBrief(intake = {}, now = Date.now()) {
  const clock = governingClock(intake, now);
  const lines = [];

  if (clock === CLOCK.EVENT) {
    const profile = competitionProfile(intake, now);
    lines.push(
      '* BUILD THIS BLOCK BACKWARD FROM DAY 0.',
      `  Day 0 is the event, about ${profile.weeksOut} weeks away. Work backwards from it: name each week by its distance from the event, and let that distance decide the week's job before anything else does.`,
      hasDayZero(intake, now)
        ? '  This block reaches Day 0, so it may peak and taper -- and it must actually do so, arriving rather than merely ending.'
        : '  This block does NOT reach Day 0. It may not call anything a peak, a taper, a realization or competition week: those words describe arriving at a date this block does not contain. Name it for what it is, and say what the block that follows will have to do.',
    );
  }

  if (clock === CLOCK.MICROCYCLE) {
    const offsets = matchOffsets(intake);
    const shown = offsets ? [...offsets.entries()].map(([d, o]) => `${d} = MD${o}`).join(', ') : '';
    lines.push(
      '* BUILD THE WEEK AROUND MATCH DAY.',
      shown ? `  The gym sessions sit at ${shown}. Label every session with its offset and let the offset drive its content.` : '  Label every session by its distance from match day and let that drive its content.',
      '  MD-4 and MD-3 can carry real work. MD-2 is short and sharp. MD-1 primes and leaves nothing behind. MD+1 is recovery, not a slot to make up what was missed.',
      '  The team sessions are already training the athlete. Say what they are covering -- sprinting, changes of direction, repeated efforts -- and make the gym solve what they leave undone rather than repeating them.',
    );
  }

  if (clock === CLOCK.REHAB) {
    const stage = rehabStage(intake);
    lines.push(
      '* A RETURN SHIFTS THE ALLOCATION, NOT ONLY THE LOADS.',
      '  Progressing the gym exercises is not the same as returning to sport. Across these four weeks the share of training spent on the athlete\'s actual event should rise, and the general work standing in for it should fall.',
      stage === STAGE.PERFORMANCE
        ? '  This athlete is cleared, asymptomatic and well past the injury: the block should be visibly weighted toward the sport by Week 4, with gym work supporting it rather than dominating it.'
        : '  Shift the balance as tolerance is demonstrated, not on a fixed schedule -- but the direction across the block should be unmistakable.',
      '  BUY THE SPORT ANOTHER DAY, AND PAY FOR IT. Trimming accessory sets moves the percentage without moving the training -- the athlete still touches their sport on exactly the same days. Replace a gym slot in the later weeks with an additional low-cost exposure to the sport: short, easy, well inside what the athlete tolerates, and taken instead of the general work rather than on top of it.',
      '  A gym movement that shares a word with the sport is not the sport. A cable row is not rowing; a leg press is not cycling. Only the event itself counts toward the shift.',
      '  Say the shift out loud in the narrative, week by week, so the athlete can see the return happening rather than inferring it from exercise names.',
    );
  }

  return lines.join('\n');
}
