import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const elitePath=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let s=fs.readFileSync(elitePath,'utf8');
const before=s;

// 1) Accept the intake formats actually used by the product: 5K, 5km and 5 km.
if(!s.includes('RUN-DISTANCE-SPACING-ANCHOR')) {
  const old="for(const m of src.matchAll(/\\b(3|5|10)\\s*k(?:m)?\\b[^0-9]{0,20}(\\d{1,2}):(\\d{2})\\b/ig)) {";
  const replacement="for(const m of src.matchAll(/\\b(3|5|10)\\s*k\\s*m?\\b[^0-9]{0,20}(\\d{1,2}):(\\d{2})\\b/ig)) { // RUN-DISTANCE-SPACING-ANCHOR";
  if(!s.includes(old)) throw new Error('running race anchor parser not found');
  s=s.replace(old,replacement);
}

// 2) In a combat + running hybrid, extra cross-training must have an explicit authored purpose.
// This does not prescribe a universal number of conditioning sessions. It only prevents
// generic bike/row volume from being stacked onto direct running + combat by habit.
if(!s.includes('CONCURRENT-ENDURANCE-REDUNDANCY-INTEGRITY')) {
  const eventAnchor="    const eventGoal=/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text);";
  if(!s.includes(eventAnchor)) throw new Error('endurance event anchor missing');
  const block=`    if(def.key==='running') {\n      const sportContext=String(intake.sport||'')+' '+JSON.stringify(intake.sport_schedule||[]);\n      const combatConcurrent=/\\b(?:bjj|jiu[- ]?jitsu|mma|wrestl(?:e|ing)|boxing|combat)\\b/i.test(sportContext);\n      if(combatConcurrent) {\n        const exIdx=parsed.idx.exercise, noteIdx=parsed.idx.notes, repsIdx=parsed.idx.reps, weightIdx=parsed.idx.weight, setsIdx=parsed.idx.sets;\n        const unjustified=[];\n        for(const rr of parsed.rows) {\n          const ex=String(rr.cells[exIdx]||'');\n          if(/^\\s*\\[WARMUP\\]/i.test(ex)) continue;\n          const note=noteIdx>=0?String(rr.cells[noteIdx]||''):'';\n          const ctx=ex+' '+note;\n          if(!/\\b(?:bike|cycling|rower|rowing|zone[- ]?2 bike|zone[- ]?2 row)\\b/i.test(ctx)) continue;\n          const dose=String(repsIdx>=0?rr.cells[repsIdx]||'':'')+' '+String(weightIdx>=0?rr.cells[weightIdx]||'':'')+' '+note;\n          const mins=maxContinuousMinutes(dose);\n          const sets=Math.max(1,Number(rr.cells[setsIdx]||1)||1);\n          const meaningful=(mins!=null&&mins*sets>=15)||/\\b\\d+(?:\\.\\d+)?\\s*(?:km|m)\\b/i.test(dose);\n          if(!meaningful) continue;\n          const hasPurpose=/\\b(?:lower[- ]?impact|impact management|reduce(?:d)? impact|recovery cost|fatigue cost|supplement(?:al)?|replace(?:s|ment)?|because|aerobic volume with less|orthopedic|eccentric cost|missing aerobic|specific purpose)\\b/i.test(note);\n          if(!hasPurpose) unjustified.push(ex);\n        }\n        if(unjustified.length) flags.push({\n          code:'CONCURRENT_ENDURANCE_REDUNDANCY_UNJUSTIFIED',\n          message:'The athlete already has concurrent combat practice plus a named running goal, yet Week 1 adds meaningful '+[...new Set(unjustified)].join(', ')+' work without stating the source-grounded purpose. The authored endurance cluster says sport practice must be counted first and supplemental conditioning should fill a defined gap. Preserve the required direct running exposures; use bike/row only when it deliberately reduces mechanical cost, replaces higher-cost volume, or fills an identified missing quality, and state that purpose instead of stacking generic Zone 2 by habit.'\n        });\n      }\n    } // CONCURRENT-ENDURANCE-REDUNDANCY-INTEGRITY\n`;
  s=s.replace(eventAnchor,block+eventAnchor);
}

// 3) Put the same source-grounded budget rule into the generation prompt so QA does not
// merely reject after the fact.
if(!s.includes('CONCURRENT-ENDURANCE-BUDGET-PROMPT')) {
  const targetAnchor="    rules.push(`TARGET-MODALITY INTEGRITY: ${def.key} is a named ${priority} performance goal${current?` and the intake documents about ${current} current ${def.key} exposure(s) per week`:''}. Do not silently reduce that existing target-modality practice. Put the target-modality sessions into the four-week deliverable, including non-gym sport days when needed, and use the curated endurance sources to assign their actual purpose/dose. Cross-training may supplement but not replace them.`);";
  if(!s.includes(targetAnchor)) throw new Error('target-modality prompt anchor missing');
  const prompt=`    if(def.key==='running') {\n      const sportContext=String(intake.sport||'')+' '+JSON.stringify(intake.sport_schedule||[]);\n      if(/\\b(?:bjj|jiu[- ]?jitsu|mma|wrestl(?:e|ing)|boxing|combat)\\b/i.test(sportContext)) {\n        rules.push('CONCURRENT ENDURANCE BUDGET: count the existing combat sessions inside the athlete\\'s finite weekly recovery budget before adding conditioning. Preserve the stated direct running exposures first because running specificity matters for the named event. Do not automatically add generic Zone 2 bike/row sessions on top. Cross-training may supplement only when the curated endurance sources support a specific reason such as obtaining useful aerobic work with lower mechanical cost, replacing higher-cost running volume, or filling an identified missing quality; if you use it, state that purpose. Poor/variable recovery or high sport load strengthens the case for removing redundant volume before adding more.');\n      }\n    } // CONCURRENT-ENDURANCE-BUDGET-PROMPT\n`;
  s=s.replace(targetAnchor,prompt+targetAnchor);
}

if(s!==before) fs.writeFileSync(elitePath,s);
console.log(`${elitePath}: ${s===before?'already current':'final concurrent endurance quality patch applied'}`);
