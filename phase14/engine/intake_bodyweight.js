// engine/intake_bodyweight.js
//
// One parser for the athlete's bodyweight.
//
// The intake form collects bodyweight as free text and its own placeholder
// asks for "85 kg", so every consumer that reached for Number(intake.bodyweight)
// got NaN from a field the athlete had filled in correctly. Relative-strength
// judgement then silently fell back to "unknown" for everyone who answered.
//
// Dependency-free on purpose: both the engine and the intake clarification
// layer import this, and neither may pull the other in.

const LB_TO_KG = 0.45359237;

// Plausible human bodyweight. A parsed value outside this is a misread of some
// other number in the field, not a light or heavy athlete, so we decline it
// rather than feed a bad ratio into strength judgements.
const MIN_KG = 25;
const MAX_KG = 250;

export function bodyweightKg(intake = {}) {
  const raw = intake?.bodyweight ?? intake?.bodyweight_kg ?? intake?.body_weight ?? intake?.weight_kg;
  if (raw == null) return null;

  if (typeof raw === "number") return inRange(raw) ? raw : null;

  const text = String(raw).trim();
  if (!text) return null;

  // Pounds must be tested first: "187 lb" also contains a bare number, and
  // reading it as kilograms would make the athlete 187 kg.
  const lb = text.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (lb) {
    const kg = Number(lb[1]) * LB_TO_KG;
    return inRange(kg) ? Math.round(kg * 10) / 10 : null;
  }

  // "85 kg", "85kg", "~85 kg", "85" — the unit is optional because the form
  // labels the field "Bodyweight" and athletes routinely type just the number.
  const kg = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)?\b/i);
  if (!kg) return null;
  const n = Number(kg[1]);
  return inRange(n) ? n : null;
}

function inRange(n) {
  return Number.isFinite(n) && n >= MIN_KG && n <= MAX_KG;
}
