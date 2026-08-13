import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const p=fileURLToPath(new URL('../phase14/engine/phase15_elite_guardrails.js', import.meta.url));
let s=fs.readFileSync(p,'utf8');
const before=s;

if(!s.includes('MARATHON-LONG-RUN-PROGRESSION')) {
  const old=`    const eventGoal=/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text);\n    if(eventGoal && !rows.some(eventProgressionBearing)) flags.push({\n      code:'EVENT_PROGRESSING_SESSION_MISSING',\n      message:\`${'${def.key}'} is tied to a named performance/event goal but Week 1 has no progression-bearing direct session with an external pace/power/split/distance structure. Use the curated endurance source to prescribe a real event-relevant progression rather than token modality exposure.\`\n    });`;
  const repl=`    const eventGoal=/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text);\n    const marathonLongRunProgression=/\\bmarathon\\b/i.test(text) && rows.some(item => {\n      const rowText=String(item.ctx||'')+' '+String(item.dose||'');\n      const longRole=/\\blong(?:[- ]run)?\\b|long aerobic|endurance run/i.test(rowText);\n      const externalDose=/\\b\\d+(?:\\.\\d+)?\\s*(?:km|miles?|min|minutes?|hours?|hrs?)\\b/i.test(rowText);\n      return longRole && externalDose;\n    }); // MARATHON-LONG-RUN-PROGRESSION\n    if(eventGoal && !rows.some(eventProgressionBearing) && !marathonLongRunProgression) flags.push({\n      code:'EVENT_PROGRESSING_SESSION_MISSING',\n      message:\`${'${def.key}'} is tied to a named performance/event goal but Week 1 has no progression-bearing direct session with an external event-relevant target. For marathon preparation, an explicitly identified long run with a prescribed duration/distance is a valid event-specific progression anchor; other events still require their source-supported pace/power/split/interval or equivalent progression.\`\n    });`;
  if(!s.includes(old)) throw new Error('event progression block not found');
  s=s.replace(old,repl);
}

if(!s.includes('MARATHON-LONG-RUN-PROMPT')) {
  const old="    if(/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text)) rules.push(`EVENT-PROGRESSION INTEGRITY: '${text}' needs at least one progression-bearing ${def.key} session with an external event-relevant target (for example source-selected interval, pace, power, split, stroke-rate or equivalent prescription). A warm-up or generic easy session alone is not sufficient. The exact workout design must come from the curated sources, not generic model memory.`);";
  const repl="    if(/\\d|\\b(?:mile|3\\s*k|5\\s*k|10\\s*k|half[- ]?marathon|marathon|erg|time trial|triathlon)\\b/i.test(text)) rules.push(`EVENT-PROGRESSION INTEGRITY: '${text}' needs at least one progression-bearing ${def.key} session with an external event-relevant target. For a marathon goal, a clearly identified long run with a prescribed duration or distance is a legitimate event-specific progression anchor; interval/tempo/pace work may also be used only when supported by the curated source and athlete context. For other events use the relevant source-selected interval, pace, power, split, stroke-rate or equivalent prescription. A warm-up or generic easy session alone is not sufficient. The exact workout design must come from the curated sources, not generic model memory.`); // MARATHON-LONG-RUN-PROMPT";
  if(!s.includes(old)) throw new Error('event progression prompt rule not found');
  s=s.replace(old,repl);
}

if(s!==before) fs.writeFileSync(p,s);
console.log(`${p}: ${s===before?'already current':'marathon progression semantics applied'}`);
