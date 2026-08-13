import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const elite=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js',import.meta.url));
let e=fs.readFileSync(elite,'utf8');
const eb=e;
if(!e.includes('MARATHON-CURRENT-WEEKLY-VOLUME-PROMPT')) {
  const anchor="    rules.push(`TARGET-MODALITY INTEGRITY: ${def.key} is a named ${priority} performance goal${current?` and the intake documents about ${current} current ${def.key} exposure(s) per week`:''}. Do not silently reduce that existing target-modality practice. Put the target-modality sessions into the four-week deliverable, including non-gym sport days when needed, and use the curated endurance sources to assign their actual purpose/dose. Cross-training may supplement but not replace them.`);";
  if(!e.includes(anchor)) throw new Error('target modality anchor missing');
  const insert=`    if(def.key==='running' && /\\bmarathon\\b/i.test(text)) {\n      const volumeSource=String(intake.notes||'')+' '+String(intake.current_numbers||'');\n      const vm=volumeSource.match(/\\b(?:about|around|roughly|approximately|~)?\\s*(\\d+(?:\\.\\d+)?)\\s*km\\s*(?:\\/|per)\\s*week\\b/i);\n      if(vm) rules.push('MARATHON CURRENT-WEEKLY-VOLUME ANCHOR: the intake documents about '+vm[1]+' km/week currently. Treat that established workload as the starting anchor rather than creating a large Week-1 step-change. The authored endurance framework says progress the smallest useful variable within the recovery budget; do not simultaneously escalate quality-session volume, routine easy-run volume and long-run volume across the same build week. Hold lower-priority volume stable when the long run or quality session is the chosen progression lever.');\n    } // MARATHON-CURRENT-WEEKLY-VOLUME-PROMPT\n`;
  e=e.replace(anchor,insert+anchor);
}
if(e!==eb) fs.writeFileSync(elite,e);

const finalQa=fileURLToPath(new URL('../phase14/engine/phase15_final_qa.js',import.meta.url));
let q=fs.readFileSync(finalQa,'utf8');
const qb=q;
if(!q.includes('MARATHON-STACKED-PROGRESSION-QA')) {
  const before="export function validatePhase15FinalProgram(program, intake={}) {";
  if(!q.includes(before)) throw new Error('final QA export anchor missing');
  const helpers=`function marathonStackedProgressionFlags(program,intake={}) {\n  const goals=[...(Array.isArray(intake.primary_goals)?intake.primary_goals:[]),...(Array.isArray(intake.secondary_goals)?intake.secondary_goals:[])].map(String).join(' | ');\n  if(!/\\bmarathon\\b/i.test(goals)) return [];\n  const weekMetrics=[];\n  for(let week=1;week<=4;week++) {\n    const p=parseWeek(program,week); if(!p) continue;\n    const e=p.idx.exercise,r=p.idx.reps,s=p.idx.sets,n=p.idx.notes;\n    let quality=0,easy=0,long=0;\n    for(const row of p.rows) {\n      const ex=String(row[e]||'');\n      if(!/\\brun(?:ning)?\\b/i.test(ex)) continue;\n      const note=n>=0?String(row[n]||''):'';\n      const dose=String(r>=0?row[r]||'':'')+' '+note;\n      const m=dose.match(/\\b(\\d+(?:\\.\\d+)?)\\s*km\\b/i);\n      if(!m) continue;\n      const km=Number(m[1]) * Math.max(1,Number(row[s]||1)||1);\n      if(/\\blong(?:[- ]run)?\\b|long aerobic|endurance run/i.test(note)) long+=km;\n      else if(/\\binterval|quality|threshold|tempo|race pace|target pace|marathon pace\\b/i.test(note)) quality+=km;\n      else if(/\\beasy|zone\\s*[- ]?2|conversational|recovery/i.test(note)||/^\\s*\\[WARMUP\\]/i.test(ex)) easy+=km;\n    }\n    weekMetrics.push({week,quality,easy,long});\n  }\n  const flags=[];\n  for(let i=1;i<weekMetrics.length;i++) {\n    const a=weekMetrics[i-1],b=weekMetrics[i];\n    if(b.quality>a.quality && b.easy>a.easy && b.long>a.long) flags.push({\n      code:'MARATHON_STACKED_VOLUME_PROGRESSION',\n      message:'Week '+b.week+' simultaneously increases quality-session distance, routine easy-run distance and long-run distance versus Week '+a.week+'. The authored endurance framework says progress the smallest useful variable inside the recovery budget; choose the main progression lever and hold lower-priority volume stable rather than stacking every volume source at once.'\n    });\n  }\n  return flags;\n} // MARATHON-STACKED-PROGRESSION-QA\n\n`;
  q=q.replace(before,helpers+before);
  const returnAnchor="  // Direct demo links are supplemental UI metadata, not a coaching-safety gate.";
  if(!q.includes(returnAnchor)) throw new Error('final QA return anchor missing');
  const call=`  const marathonProgressionFlags=marathonStackedProgressionFlags(program,intake);\n  if(marathonProgressionFlags.length) throw new Phase15QualityError(marathonProgressionFlags);\n\n`;
  q=q.replace(returnAnchor,call+returnAnchor);
}
if(q!==qb) fs.writeFileSync(finalQa,q);
console.log('marathon volume progression guard applied');
