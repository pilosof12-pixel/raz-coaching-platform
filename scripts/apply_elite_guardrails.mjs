import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve from this script, not process.cwd(), so the same patcher works both in
// repository-root CI and from Render where Root Directory is phase14/.
const qaPath=fileURLToPath(new URL('../phase14/engine/phase15_program_qa.js', import.meta.url));
let q=fs.readFileSync(qaPath,'utf8');
const before=q;

if (!q.includes('phase15_elite_guardrails.js')) {
  const anchor='} from "./phase15_quality_rules.js";';
  if (!q.includes(anchor)) throw new Error('quality-rules import anchor missing');
  q=q.replace(anchor, anchor+'\nimport {\n  elitePromptRules,\n  goalDoseFlags,\n  unbenchmarkedVariationLoadFlags,\n  strengthSessionAccountingFlags,\n  endurancePerformanceIntegrityFlags,\n  exactPrimaryMovementFlags,\n} from "./phase15_elite_guardrails.js";');
} else if (!q.includes('endurancePerformanceIntegrityFlags')) {
  const anchor='  strengthSessionAccountingFlags,\n} from "./phase15_elite_guardrails.js";';
  if (!q.includes(anchor)) throw new Error('elite import expansion anchor missing');
  q=q.replace(anchor,'  strengthSessionAccountingFlags,\n  endurancePerformanceIntegrityFlags,\n  exactPrimaryMovementFlags,\n} from "./phase15_elite_guardrails.js";');
}

if (!q.includes('ELITE-GUARDRAILS-PROMPT-WIRED')) {
  const anchor='  if (/squat/i.test(primary) && /(max|1\\s*rm|exceed|over\\s*\\d+)/i.test(primary) && /(?:x|×)\\s*(?:6|7|8|9|10|11|12)\\b|(?:6|7|8|9|10|11|12)\\s*reps?/i.test(primary)) {';
  if (!q.includes(anchor)) throw new Error('prompt anchor missing');
  q=q.replace(anchor, '  rules.push(...elitePromptRules(intake)); // ELITE-GUARDRAILS-PROMPT-WIRED\n'+anchor);
}

if (!q.includes('ELITE-GUARDRAILS-FINAL-QA-WIRED')) {
  const anchor='  const flags = [];';
  if (!q.includes(anchor)) throw new Error('validator anchor missing');
  q=q.replace(anchor, anchor+'\n\n  // Avatar-agnostic integrity floor. Coaching dose itself remains source-authored.\n  flags.push(...goalDoseFlags(raw, intake, parsed));\n  flags.push(...unbenchmarkedVariationLoadFlags(intake, parsed));\n  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED');
}

if (!q.includes('ENDURANCE-PRESERVATION-FINAL-QA-WIRED')) {
  const anchor='  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED';
  if (!q.includes(anchor)) throw new Error('expanded final-QA anchor missing');
  q=q.replace(anchor, anchor+'\n  flags.push(...endurancePerformanceIntegrityFlags(raw, intake, parsed)); // ENDURANCE-PRESERVATION-FINAL-QA-WIRED\n  flags.push(...exactPrimaryMovementFlags(raw, intake, parsed)); // EXACT-PRIMARY-MOVEMENT-FINAL-QA-WIRED');
}

if (q!==before) fs.writeFileSync(qaPath,q);
console.log(`${qaPath}: ${q===before?'already current':'elite guardrails wired'}`);

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const eliteBefore=e;
const oldCanonical=`function canonicalLift(name='') {\n  return norm(name).replace(/\\[[^\\]]+\\]/g,'').replace(/\\b(to parallel|parallel|paused?|tempo|speed|box|front|high bar|low bar|deficit|block|rack|close grip|incline|dumbbell|barbell|strict)\\b/g,' ').replace(/\\s+/g,' ').trim();\n}`;
const legacyReplacement=`function canonicalLift(name='') {\n  return norm(name)\n    .replace(/\\[[^\\]]+\\]/g,'')\n    .replace(/[:].*$/,'')\n    .replace(/\\brdl\\b/g,'romanian deadlift')\n    .replace(/\\bohp\\b/g,'overhead press')\n    .replace(/[^a-z0-9+ -]+/g,' ')\n    .replace(/\\s+/g,' ')\n    .trim(); // EXACT-VARIATION-KEY: keep box/front/pause/ROM/push-press/etc distinct.\n}`;
if (e.includes(oldCanonical)) e=e.replace(oldCanonical,legacyReplacement);
if (!e.includes('EXACT-VARIATION-KEY')) throw new Error('elite exact-variation patch did not apply');

// Source-grounded semantic integrity for low-intensity running. The endurance
// cluster defines Zone 2 as clearly low intensity, says current modality-specific
// field performance should anchor prescription, and forbids fabricating precise
// breakpoints when no threshold test exists. We therefore reject only the
// impossible contradiction of calling CURRENT race pace (or faster) easy/Zone 2;
// we do not invent a universal training-pace formula.
if (!e.includes('LOW-INTENSITY-RACE-PACE-INTEGRITY')) {
  const exportAnchor='export function endurancePerformanceIntegrityFlags(program, intake={}, parsed=null) {';
  if (!e.includes(exportAnchor)) throw new Error('endurance integrity export anchor missing');
  const helpers=`function currentRunningRaceAnchor(intake={}) {\n  const src=[String(intake.current_numbers||''),...list(intake.performance_markers).map(String)].join(' | ');\n  const anchors=[];\n  for(const m of src.matchAll(/\\b(3|5|10)\\s*k(?:m)?\\b[^0-9]{0,20}(\\d{1,2}):(\\d{2})\\b/ig)) {\n    const distanceKm=Number(m[1]), totalSeconds=Number(m[2])*60+Number(m[3]);\n    if(distanceKm>0&&totalSeconds>0) anchors.push({distanceKm,totalSeconds,paceSecPerKm:totalSeconds/distanceKm});\n  }\n  if(!anchors.length) return null;\n  return anchors.sort((a,b)=>b.paceSecPerKm-a.paceSecPerKm)[0];\n}\n\nfunction prescribedPaceSecPerKm(text='') {\n  const m=String(text||'').match(/\\b(\\d{1,2}):([0-5]\\d)\\s*\\/\\s*km\\b/i);\n  return m ? Number(m[1])*60+Number(m[2]) : null;\n}\n\nfunction formatPaceSec(sec) {\n  const s=Math.round(Number(sec)||0);\n  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');\n}\n\n`;
  e=e.replace(exportAnchor,helpers+exportAnchor);

  const eventAnchor='    const eventGoal=/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text);';
  if (!e.includes(eventAnchor)) throw new Error('event progression anchor missing');
  const lowIntensityCheck=`    if(def.key==='running') {\n      const race=currentRunningRaceAnchor(intake);\n      if(race) {\n        for(const item of rows) {\n          const rowText=\\`${'${item.ctx} ${item.dose}'}\\`;\n          if(!/\\b(?:zone\\s*[- ]?2|easy|conversational|low[- ]?intensity)\\b/i.test(rowText)) continue;\n          const prescribed=prescribedPaceSecPerKm(rowText);\n          if(prescribed!=null && prescribed<=race.paceSecPerKm) {\n            flags.push({\n              code:'LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE',\n              message:\\`A low-intensity/Zone-2 running row uses ${'${formatPaceSec(prescribed)}'}/km, while the athlete's demonstrated ${'${race.distanceKm}'}K performance is about ${'${formatPaceSec(race.paceSecPerKm)}'}/km. Zone 2 is explicitly below the first major threshold; do not label current race pace or faster as easy. Re-anchor from the authored field-performance + RPE/breathing hierarchy without inventing a universal zone formula.\\`\n            });\n            break;\n          }\n        }\n      }\n    } // LOW-INTENSITY-RACE-PACE-INTEGRITY\n`;
  e=e.replace(eventAnchor,lowIntensityCheck+eventAnchor);

  const promptAnchor='    const current=currentTargetModalityExposure(intake,def.key);';
  if (!e.includes(promptAnchor)) throw new Error('endurance prompt current-frequency anchor missing');
  const promptAddition=`    const current=currentTargetModalityExposure(intake,def.key);\n    if(def.key==='running') {\n      const race=currentRunningRaceAnchor(intake);\n      if(race) rules.push(\\`LOW-INTENSITY RUNNING ANCHOR: the intake demonstrates about ${'${formatPaceSec(race.paceSecPerKm)}'}/km for ${'${race.distanceKm}'}K. Any row labelled easy, conversational or Zone 2 must be genuinely below that demonstrated race intensity; never use that race pace or a faster pace as low intensity. If no threshold test exists, use the authored pace + RPE/breathing hierarchy rather than fabricating a precise breakpoint.\\`);\n    }`;
  e=e.replace(promptAnchor,promptAddition);
}

if (e!==eliteBefore) fs.writeFileSync(elitePath,e);
console.log(`${elitePath}: ${e===eliteBefore?'already current':'exact-variation/intensity integrity fixed'}`);

// Event-specific endurance work needs canonical names that describe the actual
// modality, not a fake strength exercise or a warm-up. This is vocabulary only;
// workout dose and intensity still come from the authored endurance sources.
const dictPath=fileURLToPath(new URL('../phase14/engine/exercise_dictionary.js', import.meta.url));
let d=fs.readFileSync(dictPath,'utf8');
const dictBefore=d;
if (!d.includes('"Run", "Bike", "Swim", "Rowing Ergometer"')) {
  const anchor='  "Zone-2 Bike", "Zone-2 Row", "Zone-2 Run", "Assault Bike", "Airbike Intervals",';
  if (!d.includes(anchor)) throw new Error('conditioning dictionary anchor missing');
  d=d.replace(anchor, '  "Run", "Bike", "Swim", "Rowing Ergometer",\n'+anchor);
}
if (!d.includes('["Bike", ["bike"]]')) {
  const anchor='  ["Stationary Bike", ["bike"]], ["Elliptical", ["elliptical"]],';
  if (!d.includes(anchor)) throw new Error('conditioning equipment anchor missing');
  d=d.replace(anchor, '  ["Stationary Bike", ["bike"]], ["Elliptical", ["elliptical"]],\n  ["Bike", ["bike"]], ["Swim", ["pool"]], ["Rowing Ergometer", ["rower"]],');
}
if (!d.includes('add("pool")')) {
  const anchor='    if (/treadmill/.test(s)) add("treadmill");';
  if (!d.includes(anchor)) throw new Error('equipment-token pool anchor missing');
  d=d.replace(anchor, anchor+'\n    if (/\\bpool\\b|swimming pool|swim access/.test(s)) add("pool");');
}
if (!d.includes('ENDURANCE-MODALITY-CANONICAL-SET')) {
  d=d.replace('export const EXERCISE_DICTIONARY = new Set(DICTIONARY_LIST);','export const EXERCISE_DICTIONARY = new Set(DICTIONARY_LIST); // ENDURANCE-MODALITY-CANONICAL-SET');
}
if(d!==dictBefore) fs.writeFileSync(dictPath,d);
console.log(`${dictPath}: ${d===dictBefore?'already current':'endurance modality vocabulary added'}`);

// Ensure the compact catalog exposes those modality names whenever the intake
// actually names the sport. Without this, a closed-set catalog could contain the
// canonical names but still hide them from the model on a triathlon/swim build.
const routerPath=fileURLToPath(new URL('../phase14/engine/phase15_source_router.js', import.meta.url));
let r=fs.readFileSync(routerPath,'utf8');
const routerBefore=r;
if (!r.includes('ENDURANCE-MODALITY-CATALOG-ROUTING')) {
  const anchor="  if (/cycling|bike/.test(raw)) add(['bike','assault bike']);";
  if (!r.includes(anchor)) throw new Error('source-router modality anchor missing');
  r=r.replace(anchor, anchor+"\n  if (/swim|swimming|freestyle|pool/.test(raw)) add(['swim']);\n  if (/triathlon|multisport|ironman/.test(raw)) add(['swim','bike','run']); // ENDURANCE-MODALITY-CATALOG-ROUTING");
}
if(r!==routerBefore) fs.writeFileSync(routerPath,r);
console.log(`${routerPath}: ${r===routerBefore?'already current':'endurance modality catalog routing added'}`);
