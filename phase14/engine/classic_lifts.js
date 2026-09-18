// engine/classic_lifts.js
//
// What counts as a competition lift, in one place.
//
// The same regex was written out in the intensification repair and again in the
// taper audit, and both had the same hole: "snatch" matches inside "Snatch
// Pull", so a pull was treated as a classic lift. That has two consequences,
// and neither is cosmetic. The percentage annotator measured a 97.5 kg snatch
// pull against the 112 kg snatch max and printed "87% of current max" on a set
// that is 75% of the athlete's own 130 kg pull. And the taper audit counted
// pull sets toward the competition-lift share -- the exact number the coach
// reads when he judges whether a block is specific enough.
//
// Nothing surfaced it because the exercise dictionary contained no pulls, so
// no program could prescribe one. Adding them made both defects reachable in
// the same run.

const CLASSIC = /\b(?:snatch|clean and jerk|clean & jerk|power clean|power snatch|hang (?:snatch|clean)|jerk|clean)\b/i;

// A pull, a shrug or a deadlift is support for a classic lift, not one of them.
const SUPPORT_VARIANT = /\b(?:pull|shrug|deadlift|high[- ]pull)\b/i;

export function isClassicLift(name) {
  const n = String(name || '');
  return CLASSIC.test(n) && !SUPPORT_VARIANT.test(n);
}
