// Which of the coaching sources does the engine actually check?
//
// The four source documents the generator is built on are in docs/knowledge.
// The question this answers is not whether the engine knows a rule -- it is
// told a great many -- but whether anything verifies the output against it.
//
// Three states, and the middle one is where the coach's deductions come from:
//
//   CHECKED    a module reads the program and can raise a finding
//   TOLD ONLY  the rule reaches the model in the prompt, and nothing verifies it
//   ABSENT     the rule is in the source and not in the prompt either
//
//   node scripts/audit_source_coverage.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const engine = path.join(root, '..', 'engine');
// The instruction file is one carrier; the conditional briefs are another, and
// a rule reaching the model through a brief is in the same state as one
// reaching it through the file -- told, and unverified.
const instructions = fs.readFileSync(path.join(engine, 'engine_instructions.txt'), 'utf8')
  + fs.readFileSync(path.join(engine, 'source_cluster_brief.js'), 'utf8')
  + fs.readFileSync(path.join(engine, 'coach_standard_brief.js'), 'utf8');
// A brief builder is not a check. Importing one, or emitting its text, is the
// engine telling the model something -- the same state as the prompt. Only a
// module that reads a produced program and can raise a finding counts, so
// lines that merely build or import brief text are stripped before matching.
const code = fs.readdirSync(engine).filter((f) => f.endsWith('.js'))
  .map((f) => {
    const raw = fs.readFileSync(path.join(engine, f), 'utf8');
    const text = raw.split('\n')
      .filter((l) => !/build[A-Za-z]*Brief|^import |^\s*'|^\s*`|^\s*\/\//.test(l))
      .join('\n');
    return { file: f, text };
  });

// Each entry: the source rule, where it comes from, how the prompt would say
// it, and what a module that checks it would have to contain. The `checks`
// pattern is deliberately about the concept, not about a number that could
// appear anywhere -- matching "60" found unrelated code and reported coverage
// that did not exist.
const RULES = [
  // --- Article 85, grappling -------------------------------------------------
  { id: 'A85.2', rule: 'Pulling volume capped at 6 working sets when mat hours >= 10', told: /pulling[^.]{0,40}(cap|6 (working )?sets)/i, checks: /pullingVolumeCap|PULLING_VOLUME_ABOVE_MAT_CAP/ },
  { id: 'A85.3', rule: 'Grip fatigue >= 7 forces the >=10 mat-hour protocol', told: /grip[_ ]fatigue/i, checks: /grip_?fatigue|gripFatigue/i },
  { id: 'A85.4', rule: 'Competition week: no strength above 70% 1RM', told: /70%[^.]{0,30}1RM/i, checks: /competitionWeekIntensityCap|COMPETITION_WEEK_ABOVE_SEVENTY_PERCENT/ },
  { id: 'A85.5', rule: 'Neck pain >= 3/10 locks out axial loading', told: /neck pain/i, checks: /neckAxialLockout|NECK_PAIN_AXIAL_LOADING/ },
  // --- Article 86, striking --------------------------------------------------
  { id: 'A86.2', rule: 'Pressing <= 60% of base volume, <= 35% in sparring weeks', told: /pressing[^.]{0,40}(60|35)\s?%/i, checks: /pressingCeiling|pressingCap|PRESSING_/i },
  { id: 'A86.4', rule: 'Footwork sessions >= 4/week blocks lower-body plyometrics', told: /footwork/i, checks: /footwork/i },
  { id: 'A86.5', rule: 'Concussion or head impact generates zero gym work', told: /concussion|head impact/i, checks: /headImpactLockout|HEAD_IMPACT_GYM_NOT_WITHHELD/ },
  { id: 'A86.6', rule: 'Overhead pressing eliminated from T-3 weeks to fight week', told: /overhead[^.]{0,60}(T-3|fight week)/i, checks: /overheadPressCutoff|OVERHEAD_PRESS_INSIDE_COMPETITION_CUTOFF/ },
  // --- Article 87, MMA -------------------------------------------------------
  { id: 'A87.2', rule: 'Each wrestling session adds a low-back fatigue unit; >=3 reduces load', told: /wrestling[^.]{0,40}(adder|fatigue unit)/i, checks: /wrestlingAdder|lowBackUnits|LOW_BACK_/i },
  { id: 'A87.5', rule: 'No session longer than 45 minutes during a weight cut', told: /45 min/i, checks: /45\s*\*?\s*60|sessionCapDuringCut|CUT_SESSION/i },
  { id: 'A87.6', rule: 'Progressive overload suspended while the weight-cut flag is active', told: /weight[- ]cut[^.]{0,60}(suspend|block|overload)/i, checks: /V75_|weightCut/i },
  // --- Article 88, running and field sport -----------------------------------
  { id: 'A88.1', rule: '>= 48 hours between heavy gym lower body and sport speed work', told: /48[- ]?hour/i, checks: /speedSessionSeparation|SPEED_SESSION_TOO_CLOSE/ },
  { id: 'A88.3', rule: 'Plyometric lockout when speed sessions >= 2 per week', told: /plyometric/i, checks: /plyoLockout|PLYO_[A-Z]*LOCK|plyometricLockout/i },
  { id: 'A88.4', rule: 'Tendon pain >= 3/10 removes eccentric and plyo, substitutes isometrics', told: /tendon pain/i, checks: /tendonPainOverride|TENDON_PAIN_ECCENTRIC_OR_PLYO/ },
  { id: 'A88.5', rule: 'Mileage tiers at 40 and 70 km/week change gym lower-body volume', told: /70 ?km|mileage tier/i, checks: /mileageTier|MILEAGE_TIER|kmTier/ },
  // --- Article 89, hybrid ----------------------------------------------------
  { id: 'A89.3', rule: 'Same-day strength and endurance applies a +15% next-day fatigue cost', told: /fatigue multiplier|15\s?%/i, checks: /fatigueMultiplier|sameDayFatigue|CONCURRENT_FATIGUE/ },
  { id: 'A89.5', rule: 'Minimum 2 complete recovery days per 7-day microcycle', told: /recovery day/i, checks: /recoveryDayLock|RECOVERY_DAYS_BELOW_MINIMUM/ },
  { id: 'A89.4', rule: 'Caloric deficit > 500 kcal with high load reduces volume', told: /500 ?kcal/i, checks: /kcal|calorieDeficit/i },
  // --- Peaking and tapering cluster -----------------------------------------
  { id: 'TAP.1', rule: 'Taper reduces volume by 41-60% of pretaper', told: /41 to 60/i, checks: /TAPER_VOLUME_BAND|TAPER_VOLUME_NOT_REDUCED/ },
  { id: 'TAP.2', rule: 'Taper duration 8-14 days is the default window', told: /8 to 14|8-14/i, checks: /taperDays|TAPER_WINDOW|8\s*,\s*14/ },
  { id: 'TAP.3', rule: 'Frequency held at 30-50% of pretaper, not cut with volume', told: /30 to 50|30-50/i, checks: /FREQUENCY_FLOOR|TAPER_CUTS_FREQUENCY_NOT_VOLUME/ },
  { id: 'TAP.4', rule: 'Remove volume selectively: conditioning and redundant patterns first', told: /redundant[^.]{0,40}pattern|selectiv/i, checks: /accessoryRedundancy|mrv_support_trim|trimOrder/i },
];

const state = (r) => {
  const hit = code.find((c) => r.checks.test(c.text));
  if (hit) return { s: 'CHECKED', where: hit.file };
  if (r.told.test(instructions)) return { s: 'TOLD ONLY', where: 'engine_instructions.txt' };
  return { s: 'ABSENT', where: '-' };
};

const out = RULES.map((r) => ({ ...r, ...state(r) }));
const by = (s) => out.filter((x) => x.s === s);

console.log('\nSOURCE COVERAGE: what the engine checks, what it only says, what it never mentions\n');
for (const s of ['CHECKED', 'TOLD ONLY', 'ABSENT']) {
  const rows = by(s);
  console.log(`${s}  (${rows.length}/${out.length})`);
  for (const r of rows) console.log(`  ${r.id.padEnd(7)} ${r.rule}${s === 'CHECKED' ? `  [${r.where}]` : ''}`);
  console.log('');
}
console.log(`A rule in TOLD ONLY reaches the model and nothing verifies the output against it.`);
console.log(`That is where a deduction comes from: the instruction was given and not followed.\n`);
