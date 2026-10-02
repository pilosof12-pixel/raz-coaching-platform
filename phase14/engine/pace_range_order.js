// A pace range written backwards reads as a typo to the person using it.
//
// The Masters block prescribed "2:24-2:26/500 m" on one row and
// "2:18-2:17/500 m" on another, in the same program. The second is numerically
// descending, so the block contradicts its own convention four times. On an erg a
// lower split is faster, which makes a descending range ambiguous exactly where
// precision matters: the athlete cannot tell whether the first number is the
// target or the floor.
//
// Nothing about the prescription changes here. The two numbers stay the two
// numbers; only their order is normalised, to the ascending form the same
// programs already use everywhere else.

const RANGE = /\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/g;
const seconds = (m, s) => Number(m) * 60 + Number(s);

export function collectPaceRangeOrderFlags(program) {
  const out = [];
  for (const m of String(program || '').matchAll(RANGE)) {
    if (seconds(m[1], m[2]) > seconds(m[3], m[4])) out.push({ code: 'PACE_RANGE_DESCENDING', range: m[0] });
  }
  return out;
}

export function normalizePaceRangeOrder(program) {
  const original = String(program || '');
  // The detector decides, so production exercises it rather than leaving it as a
  // rule only the tests ever call.
  if (!collectPaceRangeOrderFlags(original).length) return { program: original, repaired: false, repairs: [] };
  const repairs = [];
  const out = original.replace(RANGE, (whole, a, b, c, d) => {
    if (seconds(a, b) <= seconds(c, d)) return whole;
    const fixed = `${c}:${d}-${a}:${b}`;
    repairs.push({ from: whole, to: fixed });
    return fixed;
  });
  if (out === original) return { program: original, repaired: false, repairs: [] };
  return { program: out, repaired: true, repairs };
}
