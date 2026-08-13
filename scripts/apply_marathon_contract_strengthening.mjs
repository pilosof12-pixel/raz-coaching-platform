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
fs.writeFileSync(finalPath,q);

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js',import.meta.url));
let e=fs.readFileSync(elitePath,'utf8');
const current="For each build-week transition, choose ONE main running progression lever. Within a quality session, do not increase both pace/intensity and accumulated work in the same transition. Across the week, do not progress quality work, routine easy volume and long-run volume together; hold the other running categories stable. Week 1 should start near the documented current workload rather than creating a large step-change.";
const stronger="MARATHON SINGLE-LEVER HARD CONTRACT: for EACH Week 1 to 2, Week 2 to 3 and Week 3 to 4 transition, choose exactly ONE main running progression lever. Within a quality session, change pace/intensity OR accumulated work, never both in the same transition. Across the week, if the long run progresses then COPY the prior-week quality and routine-easy prescriptions unchanged; if quality progresses then COPY the prior-week long-run and routine-easy prescriptions unchanged; if routine easy volume progresses then COPY the prior-week quality and long-run prescriptions unchanged. Week 1 should start near the documented current workload rather than creating a large step-change.";
if(!e.includes(stronger)) {
  if(!e.includes(current)) throw new Error('marathon hard-contract prompt anchor missing');
  e=e.replace(current,stronger);
}
fs.writeFileSync(elitePath,e);

const buildPath=fileURLToPath(new URL('../phase14/scripts/build_phase15_runtime.mjs',import.meta.url));
let b=fs.readFileSync(buildPath,'utf8');
const oldLine='    "All four weeks must preserve the same goal hierarchy while progressing load, reps, sets or assistance conservatively.",';
const newLines='    "All four weeks must preserve the same goal hierarchy. Apply progression only where the deterministic/source-grounded plan selects it; maintenance/support qualities may remain stable or reduce to protect the primary goal.",\n    "Do not change a maintenance/support row merely to make later weeks look progressive. Stable maintenance is valid when the source-grounded goal hierarchy calls for maintenance.",\n    "When a supplied marathon rule says one progression lever per transition, copy non-selected running-category prescriptions unchanged from the prior week; within quality work, change pace OR accumulated work, not both.",';
if(!b.includes('Stable maintenance is valid')) {
  if(!b.includes(oldLine)) throw new Error('compact progression contract anchor missing');
  b=b.replace(oldLine,newLines);
}
fs.writeFileSync(buildPath,b);
console.log('marathon correction contract + maintenance hierarchy strengthened');
