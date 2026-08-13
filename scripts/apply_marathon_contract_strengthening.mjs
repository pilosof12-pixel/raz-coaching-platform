import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const finalPath=fileURLToPath(new URL('../phase14/engine/phase15_final_qa.js',import.meta.url));
let q=fs.readFileSync(finalPath,'utf8');
q=q.replace(
  "message:'Week '+b.week+' makes the quality run both longer/more voluminous and faster than Week '+a.week+'. The authored endurance framework says progress one main variable at a time; choose pace/intensity OR accumulated quality work for this transition, not both.'",
  "message:'Week '+b.week+' makes the quality run both longer/more voluminous and faster than Week '+a.week+'. The authored endurance framework says progress one main variable at a time. Choose pace/intensity OR accumulated quality work for this transition, not both. If pace progresses, copy the prior week quality duration/distance unchanged. If accumulated quality work progresses, copy the prior week pace unchanged.'"
);
q=q.replace(
  "message:'Week '+b.week+' progresses more than one main running category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and hold the other running categories stable.'",
  "message:'Week '+b.week+' progresses more than one main running category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and copy the non-selected category prescriptions from Week '+a.week+' unchanged. If long-run volume progresses, keep quality and routine easy volume unchanged; if quality progresses, keep long-run and easy volume unchanged; if easy volume progresses, keep quality and long-run prescriptions unchanged.'"
);
if(!q.includes('copy the non-selected category prescriptions')) throw new Error('final QA correction wording patch failed');

if(!q.includes('ALL-WEEK-TSV-SHAPE-QA')) {
  const anchor='export function marathonStackedProgressionFlags(program,intake={}) {';
  if(!q.includes(anchor)) throw new Error('marathon progression helper anchor missing');
  const helpers=`export function allWeekTsvShapeFlags(program) {
  const expected=['day','exercise','weight','sets','reps','rest','target rpe','notes','results'];
  const flags=[];
  for(let week=1;week<=4;week++) {
    const m=String(program||'').match(new RegExp('START_WEEK'+week+'_TSV\\\\s*\\\\n([\\\\s\\\\S]*?)\\\\nEND_WEEK'+week+'_TSV','i'));
    if(!m) { flags.push({code:'TSV_WEEK_BLOCK_MISSING',message:'Week '+week+' TSV block is missing. Return all four complete TSV blocks.'}); continue; }
    const lines=m[1].split('\\n').filter(x=>x.trim());
    if(!lines.length) { flags.push({code:'TSV_SCHEMA_VIOLATION',message:'Week '+week+' TSV block is empty.'}); continue; }
    const header=lines[0].split('\\t').map(x=>x.trim().toLowerCase());
    if(header.length!==9 || expected.some((x,i)=>header[i]!==x)) flags.push({code:'TSV_SCHEMA_VIOLATION',message:'Week '+week+' TSV header must have exactly the nine required columns in the required order.'});
    for(let i=1;i<lines.length;i++) {
      const cells=lines[i].split('\\t');
      if(cells.length!==9) flags.push({code:'TSV_ROW_COLUMN_COUNT_MISMATCH',message:'Week '+week+' row '+i+' has '+cells.length+' TSV cells instead of exactly 9. Rewrite that physical row with exactly Day, Exercise, Weight, Sets, Reps, Rest, Target RPE, Notes, Results and no embedded tab.'});
    }
  }
  return flags;
} // ALL-WEEK-TSV-SHAPE-QA

export function weekOneRunningVolumeFlags(program,intake={}) {
  const goals=[goalText(intake,'primary_goals'),goalText(intake,'secondary_goals')].join(' | ');
  if(!/\\bmarathon\\b/i.test(goals)) return [];
  const source=[intake.notes,intake.current_numbers,intake.performance_markers,intake.current_endurance].map(x=>typeof x==='string'?x:JSON.stringify(x||'')).join(' ');
  const vm=source.match(/\\b(?:about|around|roughly|approximately|~)?\\s*(\\d+(?:\\.\\d+)?)\\s*km\\s*(?:\\/|per)\\s*week\\b/i);
  if(!vm) return [];
  const currentKm=Number(vm[1]); if(!Number.isFinite(currentKm)||currentKm<=0) return [];
  const p=parseWeek(program,1); if(!p) return [];
  const e=p.idx.exercise,r=p.idx.reps,s=p.idx.sets;
  let total=0,runRows=0,measurable=0;
  for(const row of p.rows) {
    const ex=String(row[e]||''); if(!/\\brun(?:ning)?\\b/i.test(ex)||/^\\s*\\[WARMUP\\]/i.test(ex)) continue;
    runRows++;
    const dose=String(r>=0?row[r]||'':'');
    const km=[...dose.matchAll(/\\b(\\d+(?:\\.\\d+)?)\\s*km\\b/ig)].map(m=>Number(m[1]));
    if(!km.length) continue;
    measurable++;
    total+=Math.max(...km)*Math.max(1,Number(s>=0?row[s]||1:1)||1);
  }
  if(!runRows||measurable!==runRows) return [];
  if(total>currentKm) return [{
    code:'MARATHON_WEEK1_VOLUME_ABOVE_CURRENT',
    message:'Week 1 totals about '+total+' km of direct running while the intake reports about '+currentKm+' km/week currently. The authored endurance framework treats established workload as the starting anchor. Keep Week 1 at or below the supplied current weekly distance, preserve the required run frequency, and begin the selected progression lever from a later week rather than creating an immediate workload jump.'
  }];
  return [];
} // MARATHON-WEEK1-CURRENT-VOLUME-QA

`;
  q=q.replace(anchor,helpers+anchor);
}

const validateAnchor='export function validatePhase15FinalProgram(program, intake={}) {\n  let baseResult={ok:true,flags:[]};';
if(!q.includes('const tsvShapeFlags=allWeekTsvShapeFlags(program);')) {
  if(!q.includes(validateAnchor)) throw new Error('final QA validate anchor missing');
  q=q.replace(validateAnchor,`export function validatePhase15FinalProgram(program, intake={}) {\n  const tsvShapeFlags=allWeekTsvShapeFlags(program);\n  if(tsvShapeFlags.length) throw new Phase15QualityError(tsvShapeFlags);\n\n  let baseResult={ok:true,flags:[]};`);
}
const progressionCall=`  const marathonProgressionFlags=marathonStackedProgressionFlags(program,intake);\n  if(marathonProgressionFlags.length) throw new Phase15QualityError(marathonProgressionFlags);`;
if(!q.includes('const weekOneVolumeFlags=weekOneRunningVolumeFlags(program,intake);')) {
  if(!q.includes(progressionCall)) throw new Error('marathon progression call missing');
  q=q.replace(progressionCall,`  const weekOneVolumeFlags=weekOneRunningVolumeFlags(program,intake);\n  if(weekOneVolumeFlags.length) throw new Phase15QualityError(weekOneVolumeFlags);\n\n${progressionCall}`);
}
fs.writeFileSync(finalPath,q);

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js',import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const current="For each build-week transition, choose ONE main running progression lever. Within a quality session, do not increase both pace/intensity and accumulated work in the same transition. Across the week, do not progress quality work, routine easy volume and long-run volume together; hold the other running categories stable. Week 1 should start near the documented current workload rather than creating a large step-change.";
const stronger="MARATHON SINGLE-LEVER HARD CONTRACT: for EACH Week 1 to 2, Week 2 to 3 and Week 3 to 4 transition, choose exactly ONE main running progression lever. Within a quality session, change pace/intensity OR accumulated work, never both in the same transition. Across the week, if the long run progresses then COPY the prior-week quality and routine-easy prescriptions unchanged; if quality progresses then COPY the prior-week long-run and routine-easy prescriptions unchanged; if routine easy volume progresses then COPY the prior-week quality and long-run prescriptions unchanged. When the intake supplies current weekly running distance, Week 1 total direct running distance MUST NOT exceed that supplied current weekly distance; treat it as the starting workload anchor and begin progression later. Preserve the stated run frequency while redistributing the Week 1 distances inside that current-volume ceiling.";
if(!e.includes(stronger)) {
  const prior=/MARATHON SINGLE-LEVER HARD CONTRACT:[^"']*?Week 1 should start near the documented current workload rather than creating a large step-change\./;
  if(prior.test(e)) e=e.replace(prior,stronger);
  else if(e.includes(current)) e=e.replace(current,stronger);
  else if(!e.includes('Week 1 total direct running distance MUST NOT exceed')) throw new Error('marathon hard-contract prompt anchor missing');
}
fs.writeFileSync(elitePath,e);

const buildPath=fileURLToPath(new URL('../phase14/scripts/build_phase15_runtime.mjs',import.meta.url));
let b=fs.readFileSync(buildPath,'utf8');
const oldLine='    "All four weeks must preserve the same goal hierarchy while progressing load, reps, sets or assistance conservatively.",';
const newLines='    "All four weeks must preserve the same goal hierarchy. Apply progression only where the deterministic/source-grounded plan selects it; maintenance/support qualities may remain stable or reduce to protect the primary goal.",\n    "Do not change a maintenance/support row merely to make later weeks look progressive. Stable maintenance is valid when the source-grounded goal hierarchy calls for maintenance.",\n    "When a supplied marathon rule says one progression lever per transition, copy non-selected running-category prescriptions unchanged from the prior week; within quality work, change pace OR accumulated work, not both.",\n    "When a marathon intake supplies current weekly running distance, Week 1 direct running distance must not exceed it. Treat supplied current volume as the starting anchor and begin progression in later weeks.",\n    "Every physical TSV data row in every week must contain exactly nine tab-separated cells matching the required header; never insert an extra set/reps/rest/RPE field or an embedded tab inside a cell.",';
if(!b.includes('Stable maintenance is valid')) {
  if(!b.includes(oldLine)) throw new Error('compact progression contract anchor missing');
  b=b.replace(oldLine,newLines);
} else {
  const anchor='    "When a supplied marathon rule says one progression lever per transition, copy non-selected running-category prescriptions unchanged from the prior week; within quality work, change pace OR accumulated work, not both.",';
  if(!b.includes('Week 1 direct running distance must not exceed it')) {
    if(!b.includes(anchor)) throw new Error('compact marathon anchor missing');
    b=b.replace(anchor,anchor+'\n    "When a marathon intake supplies current weekly running distance, Week 1 direct running distance must not exceed it. Treat supplied current volume as the starting anchor and begin progression in later weeks.",\n    "Every physical TSV data row in every week must contain exactly nine tab-separated cells matching the required header; never insert an extra set/reps/rest/RPE field or an embedded tab inside a cell.",');
  }
}
fs.writeFileSync(buildPath,b);
console.log('marathon correction contract + maintenance hierarchy + Week1/TSV acceptance strengthened');
