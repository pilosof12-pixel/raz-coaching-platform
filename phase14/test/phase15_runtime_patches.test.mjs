import test from 'node:test';
import assert from 'node:assert/strict';
import { patchPhase15RuntimeSource } from '../engine/phase15_runtime_patches.js';

function fixture() {
  return [
    'const OPENAI_COMPACT_DEVELOPER = ["Goal numbers are targets, not current capacities. If no current benchmark is supplied for a loaded lift, do NOT invent exact kilograms. Put RPE-selected load in Weight and calibrate through Target RPE/RIR. Exact kg prescriptions require a supplied benchmark or a clear deterministic anchor. Use the available belt load, tempo, pauses and ROM to make limited external load productive. short acceleration sprints use roughly 90-95% quality effort with about 2-3 minutes full recovery and stop before speed drops."];',
    'function buildOpenAICompactUser(x){ return x; }',
    'function stripAndFlagFormulaViolations(){',
    '  const flags=[];',
    '  try {',
    '    const DENSITY_DEMANDING_GOAL = /(endurance|conditioning|gas tank|work capacity|cardio|fat loss|lose fat|zone\\s*2|aerobic|emom|amrap|density|threshold|vo2)/;',
    '  } catch(e) {}',
    '  return { violations: flags.length, flags };',
    '}',
    'function phase15LastMileTsv(tsv, intake) {',
    "  const out=[]; let ex='Sprint'; const cells=['Mon','Sprint','','3','20 m','2-3 min','7','90-95% quality effort',''];",
    "    out.push(cells.join('\\t'));",
    '  const cleaned = out.join("\\n"); return cleaned;',
    '}',
    'function privacyScrub() {}',
    'function scrubForbiddenWords(s) {',
    '  if (!s) return s;',
    '  return s;',
    '}',
    'async function runEngineRaw(userContent) {',
    '  if (OPENAI_API_KEY) {',
    '    const timer = setTimeout(() => {}, 1000);',
    '    try {',
    "      throw new Error('no credits remaining');",
    '    } finally {',
    '      clearTimeout(timer);',
    '    }',
    '  }',
    '  if (USE_PPLX_PROXY) {',
    '    return userContent;',
    '  }',
    '  const cacheName = await getEngineCacheName();',
    '  if (cacheName) return cacheName;',
    '  return ai.models.generateContent({',
    '    model: GEMINI_MODEL,',
    '    contents: userContent,',
    '    config: { ...genParams, systemInstruction: ENGINE },',
    '  });',
    '}',
  ].join('\n');
}

test('generic endurance no longer implies density/EMOM/AMRAP requirement', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /DENSITY_DEMANDING_GOAL = \/\(\?:emom\|amrap\|density\)\//);
  assert.doesNotMatch(out, /DENSITY_DEMANDING_GOAL = \/\(endurance\|conditioning/);
});

test('legacy formula marker counts only actual capacity/formula flags', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /LEGACY-FORMULA-SCOPE-NARROWED/);
  assert.match(out, /static-hold-exceeds-current-max\|fixed-density-reps-exceed-current-max/);
});

test('Sprint TSV semantics use speed quality rather than strength RPE', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /if \(\/\^Sprint\$\/i\.test\(ex\)\)/);
  assert.match(out, /cells\[6\] = 'N\/A'/);
  assert.match(out, /Target RPE is N\/A because speed quality/);
});

test('unambiguous naming variants are repaired after legacy closed-set review', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /ENDURANCE-ALIAS-LASTMILE/);
  assert.match(out, /Zone-2 Rower/);
  assert.match(out, /cells\[1\] = 'Zone-2 Row'/);
  assert.match(out, /Bicep Curl/);
  assert.match(out, /cells\[1\] = 'Dumbbell Curl'/);
  assert.match(out, /Passive Hang/);
  assert.match(out, /cells\[1\] = 'Dead Hang'/);
  assert.match(out, /cells\[1\] = 'Treadmill'/);
  assert.match(out, /COOLDOWN/);
  assert.match(out, /Jog/);
});

test('endurance external target is moved into the external target field when supplied in notes', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /ENDURANCE-EXTERNAL-TARGET-LASTMILE/);
  assert.match(out, /targetMatch/);
  assert.match(out, /cells\[2\] = targetMatch\[1\]/);
});

test('current capacity and loadable limited-equipment work are calibrated rather than underloaded by label', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /CURRENT-CAPACITY CALIBRATION/);
  assert.match(out, /mandatory lower-body strength\/hypertrophy work should not default to bodyweight by habit/);
});

test('client prose strips internal source-excerpt labels', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /SOURCE-LABEL-CLIENT-SCRUB/);
  assert.match(out, /SOURCE EXCERPT/);
});

test('future endurance goal pace is not treated as current capacity', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /ENDURANCE TARGET ANCHOR/);
  assert.match(out, /future goal pace, power or split is not automatically a sustainable current training intensity/);
  assert.match(out, /ENDURANCE-TSV-FIELD-CONTRACT/);
});

test('OpenAI quota/outage path falls through to Gemini with the same compact source-grounded user and system prompts', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /OpenAI provider unavailable; using source-grounded Gemini fallback/);
  assert.match(out, /providerUnavailable/);
  assert.match(out, /if \(!GEMINI_API_KEY \|\| !providerUnavailable\) throw e/);
  assert.match(out, /userContent = buildOpenAICompactUser\(userContent\)/);
  assert.match(out, /sourceGroundedGeminiFallback = true/);
  assert.match(out, /sourceGroundedGeminiFallback \? null : await getEngineCacheName\(\)/);
  assert.match(out, /systemInstruction: sourceGroundedGeminiFallback \? OPENAI_COMPACT_DEVELOPER : ENGINE/);
});
