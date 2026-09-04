// engine/v85_block_fundamentals.js
//
// Two things a coach does for every athlete, which this engine only did for
// some of them.
//
// Both were found by running a program a human coach actually wrote through the
// engine and asking what we would have missed. The answer was not a coaching
// disagreement -- the coach's program passes every one of our validators -- but
// two instructions that exist only on avatar-specific paths:
//
//   1. Week 4 consolidates. The youth brief teaches this, and the hybrid and
//      tactical paths have their own normalizers for it, so a general strength
//      athlete was told nothing at all about how the last week of a four-week
//      block should differ from the first three.
//
//   2. A load the athlete can act on. Where the intake states a max, the coach
//      writes "75 kg, about 79% of your current 1RM" -- a number to load and the
//      reasoning behind it. Our competition brief asks for this; nothing asked
//      for it outside a competition block, which is how a program comes back
//      prescribing "RPE-selected load" for every working set.

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join('\n'); }

function isYouth(intake = {}) {
  const age = Number(intake && intake.age);
  return Number.isFinite(age) && age < 18;
}

// Lifts the athlete has given us a number for: "Bench Press: 95 kg 1RM",
// "Squat: 100 kg x3", "Weighted Pull-up: +30 kg x1".
export function statedMaxes(intake = {}) {
  const source = txt([intake.current_numbers, intake.performance_markers]);
  const out = [];
  for (const line of source.split('\n')) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z\-' ]{2,40}?)\s*[:\-]\s*\+?(\d+(?:\.\d+)?)\s*kg\b\s*(?:x\s*(\d+)|(\d+)\s*RM|1RM)?/i);
    if (!m) continue;
    const reps = Number(m[3] || m[4] || 1);
    out.push({ lift: m[1].trim(), kg: Number(m[2]), reps: Number.isFinite(reps) ? reps : 1 });
  }
  // current_numbers and performance_markers usually restate the same lifts, and
  // listing a lift twice in the brief reads as carelessness.
  const seen = new Set();
  return out.filter((x) => {
    const key = x.lift.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildConsolidationBrief(intake = {}) {
  // Youth already has a fuller version of this, written for skill work.
  if (isYouth(intake)) return '';
  return [
    '* WEEK 4 IS A CONSOLIDATION WEEK, AND MUST LOOK DIFFERENT FROM WEEKS 1-3.',
    '  Take roughly 30-40% off the non-essential volume -- a set from most accessories, and a set from anchors carrying three or more -- while holding a moderate intensity on the main lifts. The athlete should finish the block fresher than they started it without feeling like they detrained.',
    '  Cut volume, not intensity. A week that drops the load as well as the sets loses the strength the first three weeks bought; a week that keeps every set is not a consolidation week at all, whatever the heading calls it.',
    '  Say in the narrative what Week 4 is doing and why, so the athlete does not read the smaller numbers as a lost week.',
  ].join('\n');
}

export function buildStartingLoadBrief(intake = {}) {
  const maxes = statedMaxes(intake);
  if (!maxes.length) return '';
  const example = maxes[0];
  return [
    '* PRESCRIBE LOADS THE ATHLETE CAN ACT ON.',
    `  They told us what they lift: ${maxes.slice(0, 4).map((m) => `${m.lift} ${m.kg} kg x ${m.reps}`).join('; ')}. Use it.`,
    '  Every working set on a barbell or loadable lift carries a number in kg, and where a max is known, the reasoning behind it as a percentage of that max. An effort cap belongs alongside the load, not instead of it.',
    `  "${example.lift}: ${Math.round(example.kg * 0.75 / 2.5) * 2.5} kg, about 75% of the ${example.kg} kg they gave us, RPE 7-8" is a prescription. "RPE-selected load" is not: it leaves the athlete to invent the number on the day, and makes the block impossible to audit against the numbers they came in with.`,
    '  For bodyweight-plus-load movements, name the added load and say that bodyweight is part of the total, so the percentage is a guide rather than an arithmetic claim.',
  ].join('\n');
}
