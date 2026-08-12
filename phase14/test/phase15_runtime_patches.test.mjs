import test from 'node:test';
import assert from 'node:assert/strict';
import { patchPhase15RuntimeSource } from '../engine/phase15_runtime_patches.js';

function fixture() {
  return [
    'const OPENAI_COMPACT_DEVELOPER = ["short acceleration sprints use roughly 90-95% quality effort with about 2-3 minutes full recovery and stop before speed drops."];',
    'function buildOpenAICompactUser(x){ return x; }',
    'function stripAndFlagFormulaViolations(){',
    '  try {',
    '    const DENSITY_DEMANDING_GOAL = /(endurance|conditioning|gas tank|work capacity|cardio|fat loss|lose fat|zone\\s*2|aerobic|emom|amrap|density|threshold|vo2)/;',
    '  } catch(e) {}',
    '}',
    'function phase15LastMileTsv(tsv, intake) {',
    "  const out=[]; let ex='Sprint'; const cells=['Mon','Sprint','','3','20 m','2-3 min','7','90-95% quality effort',''];",
    "    out.push(cells.join('\\t'));",
    '  const cleaned = out.join("\\n"); return cleaned;',
    '}',
    'function privacyScrub() {}',
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

test('Sprint TSV semantics use speed quality rather than strength RPE', () => {
  const out = patchPhase15RuntimeSource(fixture());
  assert.match(out, /if \(\/\^Sprint\$\/i\.test\(ex\)\)/);
  assert.match(out, /cells\[6\] = 'N\/A'/);
  assert.match(out, /Target RPE is N\/A because speed quality/);
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
