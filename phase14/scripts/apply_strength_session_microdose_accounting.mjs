import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STRENGTH_MICRODOSE_MARKER = 'HIGH-CONCURRENCY-STRENGTH-MICRODOSE-ACCOUNTING';

export function patchStrengthSessionMicrodoseAccounting(input) {
  let src = String(input || '');
  if (src.includes(STRENGTH_MICRODOSE_MARKER)) return src;

  const importAnchor = "// Generic integrity guardrails for Phase 15.";
  if (!src.includes("from './advanced_hybrid_concurrency.js'")) {
    if (src.split(importAnchor).length - 1 !== 1) throw new Error('elite guardrail import anchor mismatch');
    src = src.replace(importAnchor, `${importAnchor}\nimport { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';`);
  }

  const old = `function meaningfulStrengthRow(exercise='', cells=[], idx={}) {\n  const ex=norm(exercise);\n  if (!ex || /^\\s*\\[warmup\\]/i.test(ex)) return false;\n  if (/(zone.?2|bike|rower|run|jog|sprint|shuttle|walk|conditioning|pallof|side plank|plank|dead bug|bird dog|neck isometric|mobility|stretch)/i.test(ex)) return false;\n  const resistance=/(squat|lunge|deadlift|rdl|hinge|press|bench|row|chin|pull.?up|dip|curl|extension|raise|fly|pulldown|leg press|leg curl|hip thrust|split squat|step.?up|calf|planche|lever|handstand|muscle.?up)/i.test(ex);\n  if (!resistance) return false;\n  return (num(cells[idx.sets]||'')||1)>=2;\n}\n\nexport function strengthSessionAccountingFlags(program, intake={}, parsed=null) {\n  const requested=Number(intake.days_per_week||0);\n  if (!parsed || !requested) return [];\n  const d=parsed.idx.day,e=parsed.idx.exercise;\n  const strengthDays=new Set();\n  for (const row of parsed.rows) {\n    const day=row.cells[d]||''; if(!day) continue;\n    if (meaningfulStrengthRow(row.cells[e]||'',row.cells,parsed.idx)) strengthDays.add(day);\n  }\n  if (strengthDays.size>=requested) return [];\n  return [{\n    code:'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED',\n    message:\`Client requested \${requested} strength sessions; Week 1 contains \${strengthDays.size} meaningful resistance-training day(s). The authored planner may choose lower-cost strength work under high sport load, but it may not silently turn a requested strength day into cardio/core only.\`\n  }];\n}`;

  const replacement = `function strengthSetCount(exercise='', cells=[], idx={}) {\n  const ex=norm(exercise);\n  if (!ex || /^\\s*\\[warmup\\]/i.test(ex)) return 0;\n  if (/(zone.?2|bike|rower|run|jog|sprint|shuttle|walk|conditioning|pallof|side plank|plank|dead bug|bird dog|neck isometric|mobility|stretch)/i.test(ex)) return 0;\n  const resistance=/(squat|lunge|deadlift|rdl|hinge|press|bench|row|chin|pull.?up|dip|curl|extension|raise|fly|pulldown|leg press|leg curl|hip thrust|split squat|step.?up|calf|planche|lever|handstand|muscle.?up)/i.test(ex);\n  if (!resistance) return 0;\n  const sets=num(cells[idx.sets]||'');\n  return Number.isFinite(sets) && sets > 0 ? sets : 1;\n}\n\nfunction meaningfulStrengthRow(exercise='', cells=[], idx={}) {\n  return strengthSetCount(exercise,cells,idx)>=2;\n}\n\nfunction compoundMicrodoseRow(exercise='', cells=[], idx={}) {\n  if (strengthSetCount(exercise,cells,idx)<1) return false;\n  const ex=norm(exercise);\n  return /(squat|deadlift|rdl|hinge|press|bench|chin|pull.?up|dip|planche|lever|handstand|muscle.?up)/i.test(ex);\n}\n\nexport function strengthSessionAccountingFlags(program, intake={}, parsed=null) {\n  const requested=Number(intake.days_per_week||0);\n  if (!parsed || !requested) return [];\n  const d=parsed.idx.day,e=parsed.idx.exercise;\n  const byDay=new Map();\n  for (const row of parsed.rows) {\n    const day=row.cells[d]||''; if(!day) continue;\n    const exercise=row.cells[e]||'';\n    const sets=strengthSetCount(exercise,row.cells,parsed.idx);\n    if(!sets) continue;\n    const state=byDay.get(day)||{sets:0,compoundMicrodose:false};\n    state.sets+=sets;\n    if(compoundMicrodoseRow(exercise,row.cells,parsed.idx)) state.compoundMicrodose=true;\n    byDay.set(day,state);\n  }\n  const highConcurrency=isHighConcurrencyHybrid(intake);\n  const strengthDays=new Set();\n  for(const [day,state] of byDay) {\n    if(state.sets>=2 || (highConcurrency && state.compoundMicrodose && state.sets>=1)) strengthDays.add(day); // ${STRENGTH_MICRODOSE_MARKER}\n  }\n  if (strengthDays.size>=requested) return [];\n  return [{\n    code:'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED',\n    message:\`Client requested \${requested} strength sessions; Week 1 contains \${strengthDays.size} meaningful resistance-training day(s). The authored planner may choose lower-cost strength work under high sport load, but it may not silently turn a requested strength day into cardio/core only. A one-set day counts only in a verified high-concurrency hybrid when that set is a compound/primary strength or advanced-skill microdose; token isolation, cardio and core rows do not satisfy the request.\`\n  }];\n}`;

  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`strength-session accounting anchor expected once, found ${count}`);
  return src.replace(old, replacement);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  const target = fileURLToPath(new URL('../engine/phase15_elite_guardrails.js', import.meta.url));
  const before = fs.readFileSync(target, 'utf8');
  const after = patchStrengthSessionMicrodoseAccounting(before);
  fs.writeFileSync(target, after);
  console.log(`${target}: ${after === before ? 'already current' : 'strength microdose accounting aligned'}`);
}
