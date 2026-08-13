import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const elite=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js',import.meta.url));
let e=fs.readFileSync(elite,'utf8');
const eb=e;
const oldPrompt="The authored endurance framework says progress the smallest useful variable within the recovery budget; do not simultaneously escalate quality-session volume, routine easy-run volume and long-run volume across the same build week. Hold lower-priority volume stable when the long run or quality session is the chosen progression lever.";
const newPrompt="The authored endurance framework says progress/regress one main variable according to adaptation and recovery. For each build-week transition, choose ONE main running-volume progression lever: quality-session distance, routine easy-run distance/duration, or long-run distance/duration. Hold the other two categories stable rather than escalating them together. Week 1 should start near the documented current workload rather than creating a large step-change.";
if(e.includes(oldPrompt)) e=e.replace(oldPrompt,newPrompt);
else if(!e.includes('choose ONE main running-volume progression lever')) throw new Error('marathon prompt text not found');
if(e!==eb) fs.writeFileSync(elite,e);

const finalQa=fileURLToPath(new URL('../phase14/engine/phase15_final_qa.js',import.meta.url));
let q=fs.readFileSync(finalQa,'utf8');
const qb=q;
const oldCond="    if(b.quality>a.quality && b.easy>a.easy && b.long>a.long) flags.push({";
const newCond="    const increases=[b.quality>a.quality,b.easy>a.easy,b.long>a.long].filter(Boolean).length;\n    if(increases>1) flags.push({";
if(q.includes(oldCond)) q=q.replace(oldCond,newCond);
else if(!q.includes('if(increases>1)')) throw new Error('marathon stacked progression condition not found');
const oldMsg="Week '+b.week+' simultaneously increases quality-session distance, routine easy-run distance and long-run distance versus Week '+a.week+'. The authored endurance framework says progress the smallest useful variable inside the recovery budget; choose the main progression lever and hold lower-priority volume stable rather than stacking every volume source at once.";
const newMsg="Week '+b.week+' increases more than one main running-volume category versus Week '+a.week+'. The authored endurance decision system says progress/regress one main variable according to adaptation and recovery. Choose one main progression lever for this transition and hold the other running-volume categories stable.";
if(q.includes(oldMsg)) q=q.replace(oldMsg,newMsg);
else if(!q.includes('increases more than one main running-volume category')) throw new Error('marathon QA message not found');
if(q!==qb) fs.writeFileSync(finalQa,q);
console.log('marathon one-main-variable progression guard applied');
