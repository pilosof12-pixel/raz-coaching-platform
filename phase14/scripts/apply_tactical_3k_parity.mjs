import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function patchFile(rel, transforms) {
  const p = path.join(root, rel);
  let src = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const t of transforms) {
    if (t.already && src.includes(t.already)) continue;
    const count = src.split(t.find).length - 1;
    if (count !== 1) throw new Error(`${rel} / ${t.label}: expected one anchor, found ${count}`);
    src = src.replace(t.find, t.replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(p, src);
  console.log(`${rel}: ${changed ? 'Tactical 3K parity applied' : 'already current'}`);
}

patchFile('engine/phase15_elite_guardrails.js', [
  {
    label: 'add rucking target modality',
    find: "  {\n    key:'swimming',\n    goal:/\\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly)\\b/i,\n    exposure:/\\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly|pool)\\b/i,\n    sport:/\\b(?:swim|swimming)\\b/i,\n    current:[\n      /(?:swims?|swimming)\\s*(\\d+)\\s*(?:sessions?|times?)?\\s*(?:per|\\/|each)\\s*week/i,\n      /(\\d+)\\s*(?:swims?|swimming sessions?)\\s*(?:per|\\/|each)?\\s*week/i,\n      /(\\d+)\\s*swims?\\b/i,\n    ],\n  },\n];",
    replace: "  {\n    key:'swimming',\n    goal:/\\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly)\\b/i,\n    exposure:/\\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly|pool)\\b/i,\n    sport:/\\b(?:swim|swimming)\\b/i,\n    current:[\n      /(?:swims?|swimming)\\s*(\\d+)\\s*(?:sessions?|times?)?\\s*(?:per|\\/|each)\\s*week/i,\n      /(\\d+)\\s*(?:swims?|swimming sessions?)\\s*(?:per|\\/|each)?\\s*week/i,\n      /(\\d+)\\s*swims?\\b/i,\n    ],\n  },\n  {\n    key:'rucking',\n    goal:/\\b(?:ruck(?:ing)?|ruck march|loaded march|pack march|backpack march)\\b/i,\n    exposure:/\\b(?:ruck(?:ing)?|ruck march|loaded march|pack march|backpack march|backpack carry)\\b/i,\n    sport:/\\b(?:ruck(?:ing)?|ruck march|loaded march|pack march)\\b/i,\n    current:[\n      /(?:rucks?|rucking|loaded marches?|pack marches?)\\s*(\\d+)\\s*(?:sessions?|times?)?\\s*(?:per|\\/|each)\\s*week/i,\n      /(\\d+)\\s*(?:rucks?|rucking sessions?|loaded marches?|pack marches?)\\s*(?:per|\\/|each)?\\s*week/i,\n      /(\\d+)\\s*rucks?\\b/i,\n    ],\n  },\n];",
    already: "key:'rucking'"
  },
  {
    label: 'ruck goal does not masquerade as running',
    find: "    for (const def of MODALITY_DEFS) if (def.goal.test(goal.text)) out.push({...goal,def});",
    replace: "    const ruckGoal = /\\b(?:ruck(?:ing)?|ruck march|loaded march|pack march|backpack march)\\b/i.test(goal.text);\n    for (const def of MODALITY_DEFS) {\n      // A distance such as '10 km ruck' is a loaded-locomotion goal, not a second running goal.\n      if (ruckGoal && def.key === 'running') continue;\n      if (def.goal.test(goal.text)) out.push({...goal,def});\n    }",
    already: "if (ruckGoal && def.key === 'running') continue;"
  },
  {
    label: 'goal family gives rucking precedence over bare distance running regex',
    find: "function goalFamily(text='') {\n  const s=norm(text);\n  const defs=[",
    replace: "function goalFamily(text='') {\n  const s=norm(text);\n  const ruckDef=MODALITY_DEFS.find(x=>x.key==='rucking');\n  if(ruckDef?.goal.test(s)) return {key:'rucking',pattern:ruckDef.exposure};\n  const defs=[",
    already: "const ruckDef=MODALITY_DEFS.find(x=>x.key==='rucking');"
  },
  {
    label: 'generic strict pull-up is a direct goal family',
    find: "    ['weighted_pullup',/(weighted pull|pull.?up.*\\+?\\d|\\+?\\d+\\s*kg.*pull)/i,/(weighted pull|pull.?up)/i],\n    ['squat',/(back squat|box squat|front squat|\\bsquat\\b)/i,/(back squat|box squat|front squat|\\bsquat\\b)/i],",
    replace: "    ['weighted_pullup',/(weighted pull|pull.?up.*\\+?\\d|\\+?\\d+\\s*kg.*pull)/i,/(weighted pull|pull.?up)/i],\n    ['strict_pullup',/\\b(?:strict\\s*)?pull.?ups?\\b/i,/\\b(?:strict\\s*)?(?:weighted\\s*)?pull.?ups?\\b/i],\n    ['squat',/(back squat|box squat|front squat|\\bsquat\\b)/i,/(back squat|box squat|front squat|\\bsquat\\b)/i],",
    already: "['strict_pullup',/\\b(?:strict\\s*)?pull.?ups?\\b/i"
  },
  {
    label: 'tactical language does not authorize fatigue theatre',
    find: "  ];\n  for(const {priority,text,def} of explicitModalityGoals(intake)) {",
    replace: "  ];\n  const tacticalContext=JSON.stringify({primary:intake.primary_goals,secondary:intake.secondary_goals,maintenance:intake.maintenance_goals,notes:intake.notes});\n  if(/combat[- ]?ready|special[- ]?operations|tactical|selection prep/i.test(tacticalContext)) rules.push('TACTICAL PRIORITY RULE: tactical/combat-ready language is context, not permission for punishment conditioning. Preserve the named 3K, ruck and calisthenics targets first. Do not add Burpee EMOM, arbitrary operator finishers, daily maximal tests or extra HIIT unless a named performance need, curated source and the recovery/time budget justify it.');\n  for(const {priority,text,def} of explicitModalityGoals(intake)) {",
    already: 'TACTICAL PRIORITY RULE:'
  },
  {
    label: 'ruck coaching and mechanical-load rules',
    find: "    if(def.key==='running' && /\\bmarathon\\b/i.test(text)) {",
    replace: "    if(def.key==='rucking') {\n      rules.push('RUCK DIRECT SPECIFICITY: a named ruck/loaded-march goal needs at least one direct weekly ruck exposure. Farmer Carry, sled work and Sandbag Carry may support trunk, grip or work capacity but cannot replace loaded locomotion over meaningful distance/time.');\n      rules.push('RUCK PROGRESSION LOAD MANAGEMENT: progress the smallest useful mechanical variable from the current tolerated benchmark. Do not simultaneously make pack load heavier, distance longer and pace faster. Hold the other major variables stable while one progresses, and use foot/ankle/shin response plus next-day recovery as load-management gates.');\n      rules.push('RUCK LOADED-RUNNING RULE: do not default to heavy loaded running or run under load as a toughness shortcut. Use controlled ruck/loaded walking unless the intake explicitly requires loaded running and the curated source supports it.');\n      const impactContext=JSON.stringify({injuries:intake.injuries,pain:intake.pain,notes:intake.notes});\n      if(/shin[- ]?splint|shin pain|tibial/i.test(impactContext)) rules.push('RUN + RUCK IMPACT HISTORY: the athlete is currently asymptomatic at an established running/ruck workload but has a shin-load history. Preserve tolerated exposure and avoid simultaneous abrupt increases in running impact and ruck mechanical stress; change one main load lever, then reassess symptoms/recovery.');\n    }\n    if(def.key==='running' && /\\bmarathon\\b/i.test(text)) {",
    already: 'RUCK DIRECT SPECIFICITY:'
  }
]);

patchFile('engine/exercise_dictionary.js', [
  {
    label: 'normalize ruck names to direct loaded-locomotion exercise',
    find: "const ALIAS_LIST = [\n  // Warmup / mobility hyphenation and phrasing variants\n",
    replace: "const ALIAS_LIST = [\n  // Tactical loaded-locomotion terminology\n  [\"Ruck\", \"Backpack Carry\"],\n  [\"Rucking\", \"Backpack Carry\"],\n  [\"Ruck March\", \"Backpack Carry\"],\n  [\"Loaded March\", \"Backpack Carry\"],\n  [\"Pack March\", \"Backpack Carry\"],\n  [\"Backpack March\", \"Backpack Carry\"],\n  // Warmup / mobility hyphenation and phrasing variants\n",
    already: '[\"Ruck March\", \"Backpack Carry\"]'
  }
]);

console.log('Tactical 3K coaching parity patch complete.');
