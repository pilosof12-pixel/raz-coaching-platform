import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const eliteBefore=e;

if (!e.includes('CONTINUOUS-RACE-BENCHMARK-INTEGRITY')) {
  const oldPaceFn=`function prescribedPaceSecPerKm(text='') {\n  const m=String(text||'').match(/\\b(\\d{1,2}):([0-5]\\d)\\s*\\/\\s*km\\b/i);\n  return m ? Number(m[1])*60+Number(m[2]) : null;\n}\n`;
  const newPaceFn=`function prescribedPaceSecPerKm(text='') {\n  const m=String(text||'').match(/\\b(\\d{1,2}):([0-5]\\d)(?:\\s*(?:-|–|to)\\s*(\\d{1,2}):([0-5]\\d))?\\s*\\/\\s*km\\b/i);\n  if(!m) return null;\n  const first=Number(m[1])*60+Number(m[2]);\n  const second=m[3]!=null ? Number(m[3])*60+Number(m[4]) : first;\n  return Math.min(first,second);\n}\n\nfunction maxContinuousMinutes(text='') {\n  const values=[];\n  for(const m of String(text||'').matchAll(/\\b(\\d+(?:\\.\\d+)?)(?:\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?))?\\s*(?:min|minutes?)\\b/ig)) {\n    values.push(Number(m[2]||m[1]));\n  }\n  return values.length ? Math.max(...values) : null;\n}\n`;
  if(!e.includes(oldPaceFn)) throw new Error('pace parser anchor missing');
  e=e.replace(oldPaceFn,newPaceFn);

  const eventAnchor='    const eventGoal=/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text);';
  if(!e.includes(eventAnchor)) throw new Error('event goal anchor missing');
  const benchmarkCheck=`    if(def.key==='running') {\n      const race=currentRunningRaceAnchor(intake);\n      if(race) {\n        for(const item of rows) {\n          const rowText=String(item.ctx||'')+' '+String(item.dose||'');\n          if(/\\b(?:test|race|time trial|assessment)\\b/i.test(rowText)) continue;\n          const pace=prescribedPaceSecPerKm(rowText);\n          const durationMin=maxContinuousMinutes(rowText);\n          const setCount=Math.max(1,Number(item.row?.cells?.[parsed.idx.sets]||1)||1);\n          if(setCount===1 && pace!=null && durationMin!=null && pace<race.paceSecPerKm && durationMin*60>=race.totalSeconds) {\n            flags.push({\n              code:'CONTINUOUS_RUN_EXCEEDS_CURRENT_RACE_BENCHMARK',\n              message:"A continuous running prescription asks for "+durationMin+" minutes at about "+formatPaceSec(pace)+"/km, while the athlete's demonstrated "+race.distanceKm+"K is "+Math.round(race.totalSeconds/60)+" minutes at about "+formatPaceSec(race.paceSecPerKm)+"/km. That would imply sustaining a faster-than-current race pace for current-race duration or longer. Re-anchor from current field performance and the authored endurance sources; do not assume future/goal pace is already continuously sustainable. Across the block, progress the smallest useful variable rather than automatically increasing pace and duration together."\n            });\n            break;\n          }\n        }\n      }\n    } // CONTINUOUS-RACE-BENCHMARK-INTEGRITY\n`;
  e=e.replace(eventAnchor,benchmarkCheck+eventAnchor);

  const promptAnchor="      if(race) rules.push('LOW-INTENSITY RUNNING ANCHOR: the intake demonstrates about '+formatPaceSec(race.paceSecPerKm)+'/km for '+race.distanceKm+'K. Any row labelled easy, conversational or Zone 2 must be genuinely below that demonstrated race intensity; never use that race pace or a faster pace as low intensity. If no threshold test exists, use the authored pace + RPE/breathing hierarchy rather than fabricating a precise breakpoint.');";
  if(!e.includes(promptAnchor)) throw new Error('running prompt anchor missing');
  const promptAdd="      if(race) rules.push('CURRENT-RACE PERFORMANCE ANCHOR: do not prescribe a continuous non-test run faster than the demonstrated '+race.distanceKm+'K pace for the same race duration or longer; that would assume performance beyond the supplied current benchmark. If faster work is source-appropriate, calibrate its structure from the authored endurance sources rather than treating goal pace as already sustainable. Across the four-week block, progress the smallest useful variable and do not automatically increase both pace and duration together.'); // CONTINUOUS-RACE-BENCHMARK-PROMPT";
  e=e.replace(promptAnchor,promptAnchor+'\n'+promptAdd);
}

// Exact kg are a presentation/calibration detail that can be repaired safely when
// the athlete has only a related-variation benchmark. The authored integrity rule
// already requires RPE-selected loading in that case; this repair prevents a model
// retry from wasting a generation on a deterministic cell-level correction.
if(!e.includes('UNBENCHMARKED-VARIATION-LOAD-REPAIR')) {
  const anchor='export function unbenchmarkedVariationLoadFlags(intake={}, parsed=null) {';
  if(!e.includes(anchor)) throw new Error('unbenchmarked variation flag anchor missing');
  const repair=`export function repairUnbenchmarkedVariationLoads(program, intake={}) {\n  const benches=benchmarkRows(intake);\n  if(!benches.length) return String(program||'');\n  const fixedKg=/(?:^|\\s|\\+)\\d+(?:\\.\\d+)?\\s*kg\\b/i;\n  return String(program||'').split('\\n').map(line=>{\n    if(!line.includes('\\t')) return line;\n    const cells=line.split('\\t');\n    if(cells.length!==9 || /^Day$/i.test(String(cells[0]||'').trim())) return line;\n    const ex=String(cells[1]||'').trim();\n    if(!ex || /^\\s*\\[WARMUP\\]/i.test(ex)) return line;\n    const family=liftFamily(ex);\n    if(!family || !fixedKg.test(String(cells[2]||''))) return line;\n    const sameFamily=benches.filter(b=>b.family===family);\n    if(!sameFamily.length) return line;\n    const exact=sameFamily.some(b=>canonicalLift(ex)===b.canonical);\n    if(exact) return line;\n    cells[2]='RPE-selected load';\n    return cells.join('\\t');\n  }).join('\\n');\n} // UNBENCHMARKED-VARIATION-LOAD-REPAIR\n\n`;
  e=e.replace(anchor,repair+anchor);
}

if(e!==eliteBefore) fs.writeFileSync(elitePath,e);
console.log(`${elitePath}: ${e===eliteBefore?'already current':'semantic/load integrity added'}`);

const finalPath=fileURLToPath(new URL('../phase14/engine/phase15_final_qa.js', import.meta.url));
let f=fs.readFileSync(finalPath,'utf8');
const finalBefore=f;
if(!f.includes('ENDURANCE-ALL-WEEKS-FINAL-QA')) {
  const importAnchor="import { validatePhase15Program, Phase15QualityError } from './phase15_program_qa.js';";
  if(!f.includes(importAnchor)) throw new Error('final QA import anchor missing');
  f=f.replace(importAnchor,importAnchor+"\nimport { endurancePerformanceIntegrityFlags } from './phase15_elite_guardrails.js';");

  const bodyAnchor=`    if (flags.length) throw new Phase15QualityError(flags);\n  }\n\n  // Direct demo links are supplemental UI metadata, not a coaching-safety gate.`;
  if(!f.includes(bodyAnchor)) throw new Error('final QA body anchor missing');
  const allWeeks=`    if (flags.length) throw new Phase15QualityError(flags);\n  }\n\n  // Week 1 is covered by validatePhase15Program above. Re-run the authored\n  // endurance integrity floor on Weeks 2-4 so a later-week pace/frequency\n  // regression cannot bypass client-visible final QA.\n  for(let week=2;week<=4;week++) {\n    const p=parseWeek(program,week);\n    if(!p) continue;\n    const parsed={idx:p.idx,rows:p.rows.map(cells=>({cells}))};\n    const flags=endurancePerformanceIntegrityFlags(program,intake,parsed);\n    if(flags.length) throw new Phase15QualityError(flags.map(flag=>({...flag,message:'Week '+week+': '+flag.message})));\n  } // ENDURANCE-ALL-WEEKS-FINAL-QA\n\n  // Direct demo links are supplemental UI metadata, not a coaching-safety gate.`;
  f=f.replace(bodyAnchor,allWeeks);
}
if(f!==finalBefore) fs.writeFileSync(finalPath,f);
console.log(`${finalPath}: ${f===finalBefore?'already current':'all-week endurance final QA added'}`);
