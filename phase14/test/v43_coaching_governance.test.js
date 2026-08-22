import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectSkillCeilingFlags, collectSessionDurationFlags, collectMaintenanceDriftFlags,
  collectAutoregulationFlags, collectCausalInjuryResponseFlags, collectGovernanceFlags,
  GOVERNANCE_HARD_CODES, buildGovernanceBrief, sessionBudgetMinutes, maintenancePatterns,
} from '../engine/v43_coaching_governance.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const program = (head, weeks) => [head, ...weeks].join('\n\n');

const YOUTH = { primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'], session_length: '60 min', injuries: 'None reported' };
const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  maintenance_goals: ['Maintain useful squat and deadlift strength'],
  session_duration_minutes: 60,
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
};

// --- item 11: skill work is a ceiling ---------------------------------------

test('[G1] a skill row with no stop condition is a violation', () => {
  const p = program('Overview.', [block(1, [
    'Session B\tHandstand Hold\tBodyweight\t3\t20s\t90 sec\tN/A\tBack-to-wall; each hold includes 2 heel pulls, then re-set.\t',
  ])]);
  const flags = collectSkillCeilingFlags(p, YOUTH);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V43_SKILL_QUOTA_WITHOUT_CEILING');
});

test('[G2] a skill row that names its stop condition passes', () => {
  const p = program('Overview.', [block(1, [
    'Session A\tControlled Handstand Kick-up\tBodyweight\t3\t2\t60 sec\tN/A\tSix high-quality entries is a ceiling, not a quota; stop earlier if balance quality deteriorates.\t',
  ])]);
  assert.deepEqual(collectSkillCeilingFlags(p, YOUTH), []);
});

test('[G3] the skill ceiling is repaired deterministically, not by regeneration', () => {
  // A hard rule with no repair is how a generation loop burns all four attempts
  // on one code. Appending the stop condition invents no coaching: it states the
  // standard the rest of the program already applies.
  const p = program('Overview.', [block(1, [
    'Session B\tHandstand Hold\tBodyweight\t3\t20s\t90 sec\tN/A\tBack-to-wall; each hold includes 2 heel pulls, then re-set.\t',
  ])]);
  const repaired = repairDeterministicContradictions(p, YOUTH);
  assert.deepEqual(collectSkillCeilingFlags(repaired.program, YOUTH), []);
  assert.match(repaired.program, /ceiling, not a quota/);
  // The prescription itself is untouched.
  assert.match(repaired.program, /Handstand Hold\tBodyweight\t3\t20s\t/);
  const again = repairDeterministicContradictions(repaired.program, YOUTH);
  assert.equal(again.program, repaired.program, 'repair must be idempotent');
});

// --- item 12: session duration realism --------------------------------------

test('[G4] the stated time budget is read the same way the planner reads it', () => {
  assert.equal(sessionBudgetMinutes({ session_duration_minutes: 60 }), 60);
  assert.equal(sessionBudgetMinutes({ session_length: '45-60 min' }), 60);
  assert.equal(sessionBudgetMinutes({}), null);
});

test('[G5] a session that overruns its budget is reported with the cut order', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(`Mon\tBack Squat ${i}\t100 kg\t5\t5\t4 min\t8\tWork.\t`);
  const p = program('Overview.', [block(1, rows)]);
  const flags = collectSessionDurationFlags(p, { session_duration_minutes: 45 });
  assert.equal(flags[0].code, 'V43_SESSION_EXCEEDS_TIME_BUDGET');
  assert.ok(flags[0].estimated_minutes > 45);
  assert.match(flags[0].message, /optional accessories first/);
});

test('[G6] no stated budget means no duration finding', () => {
  const p = program('Overview.', [block(1, ['Mon\tBack Squat\t100 kg\t5\t5\t4 min\t8\tWork.\t'])]);
  assert.deepEqual(collectSessionDurationFlags(p, {}), []);
});

// --- item 13: maintenance is held -------------------------------------------

test('[G7] a maintenance lift may not drift upward just because a week passed', () => {
  const p = program('Overview.', [
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tMaintenance dose.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t3\t5\t3 min\t7\tMoving up.\t']),
  ]);
  const flags = collectMaintenanceDriftFlags(p, TACTICAL);
  assert.equal(flags[0].code, 'V43_MAINTENANCE_AUTO_PROGRESSED');
  assert.equal(flags[0].goal, 'squat');
});

test('[G8] a goal the athlete is developing is not a maintenance goal', () => {
  // "Maintain squat strength" alongside a primary squat goal is a contradiction
  // in the intake, and the developed goal wins.
  const intake = { ...TACTICAL, primary_goals: ['220kg back squat'] };
  const p = program('Overview.', [
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tBuild.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t3\t5\t3 min\t7\tBuild.\t']),
  ]);
  assert.deepEqual(collectMaintenanceDriftFlags(p, intake), []);
});

test('[G9] maintenance drift is repaired by restoring the dose that already worked', () => {
  const p = program('Overview.', [
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tMaintenance dose.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t4\t5\t3 min\t7\tMoving up.\t']),
  ]);
  const repaired = repairDeterministicContradictions(p, TACTICAL);
  assert.deepEqual(collectMaintenanceDriftFlags(repaired.program, TACTICAL), []);
  assert.match(repaired.program, /Mon\tBack Squat\t140 kg\t3\t5\t/, 'Week 2 returns to the Week 1 dose');
});

test('[G10] a stated reason keeps an intentional maintenance change', () => {
  const p = program('Overview.', [
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tMaintenance dose.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t3\t5\t3 min\t7\tOnly if Week 1 felt genuinely easy and the priority has changed.\t']),
  ]);
  assert.deepEqual(collectMaintenanceDriftFlags(p, TACTICAL), []);
});

// --- item 14: autoregulation ------------------------------------------------

test('[G11] a hard primary set must say what happens when it goes wrong', () => {
  const p = program('Overview.', [block(1, [
    'Mon\tOverhead Press\t65 kg\t3\t4\t2 min\t8\tStrict reps; no layback to turn it into a push press.\t',
  ])]);
  const flags = collectAutoregulationFlags(p, {});
  assert.equal(flags[0].code, 'V43_NO_AUTOREGULATION_PATH');
  assert.equal(flags[0].rpe, 8);
});

test('[G12] a stated failure path satisfies it, on the row or in the block narrative', () => {
  const onRow = program('Overview.', [block(1, [
    'Mon\tOverhead Press\t65 kg\t3\t4\t2 min\t8\tIf bar speed falls, stop at 2 sets and repeat this load next week.\t',
  ])]);
  assert.deepEqual(collectAutoregulationFlags(onRow, {}), []);

  const inHead = program('If shoulders are beat up from sport, repeat the last successful Overhead Press load rather than forcing the next jump.', [block(1, [
    'Mon\tOverhead Press\t65 kg\t3\t4\t2 min\t8\tStrict reps.\t',
  ])]);
  assert.deepEqual(collectAutoregulationFlags(inHead, {}), []);
});

test('[G13] light and accessory work needs no failure path', () => {
  const p = program('Overview.', [block(1, [
    'Mon\tBack Squat\t100 kg\t3\t5\t3 min\t6\tTechnique.\t',
    'Mon\tCable Row\tRPE-selected load\t2\t10\t90 sec\t8\tSupport.\t',
  ])]);
  assert.deepEqual(collectAutoregulationFlags(p, {}), []);
});

// --- item 9: causal injury response -----------------------------------------

test('[G14] a symptom history must be answered by changing its own stressor', () => {
  const generic = program('If anything flares up, cut the accessory work first and keep going.', [
    block(1, ['Mon\tRun\tN/A\t1\t10 km\tN/A\t5\tEasy.\t']),
  ]);
  const flags = collectCausalInjuryResponseFlags(generic, TACTICAL);
  assert.equal(flags[0].code, 'V43_INJURY_RESPONSE_NOT_CAUSAL');
  assert.equal(flags[0].modality, 'running');

  const causal = program('If the shins start complaining, repeat the last tolerated running week rather than adding km or pace.', [
    block(1, ['Mon\tRun\tN/A\t1\t10 km\tN/A\t5\tEasy.\t']),
  ]);
  assert.deepEqual(collectCausalInjuryResponseFlags(causal, TACTICAL), []);
});

test('[G15] an athlete with no history raises nothing', () => {
  const p = program('If anything hurts, back off.', [block(1, ['Mon\tRun\tN/A\t1\t10 km\tN/A\t5\tEasy.\t'])]);
  assert.deepEqual(collectCausalInjuryResponseFlags(p, { injuries: 'None reported' }), []);
});

// --- classification and prevention ------------------------------------------

test('[G16] only the objectively repairable rules block a release', () => {
  // Both hard codes have deterministic repairs. Estimates and coaching emphasis
  // are reported so a coach can judge them, not enforced against the model.
  assert.deepEqual([...GOVERNANCE_HARD_CODES].sort(), ['V43_MAINTENANCE_AUTO_PROGRESSED', 'V43_SKILL_QUOTA_WITHOUT_CEILING']);
  assert.ok(!GOVERNANCE_HARD_CODES.has('V43_SESSION_EXCEEDS_TIME_BUDGET'));
  assert.ok(!GOVERNANCE_HARD_CODES.has('V43_NO_AUTOREGULATION_PATH'));
});

test('[G17] the brief carries each rule the athlete is actually subject to', () => {
  const youth = buildGovernanceBrief(YOUTH);
  assert.match(youth, /60 minutes is the ceiling/);
  assert.match(youth, /SKILL WORK IS A CEILING/);
  assert.match(youth, /AUTOREGULATION/);

  const tactical = buildGovernanceBrief(TACTICAL);
  assert.match(tactical, /MAINTENANCE GOALS \(squat, deadlift\)/);
  assert.match(tactical, /running symptom history/);
  assert.doesNotMatch(tactical, /SKILL WORK IS A CEILING/, 'no skill goal, no skill brief');
});

test('[G18] maintenance patterns come from the athlete, not a hardcoded list', () => {
  assert.deepEqual(maintenancePatterns({ maintenance_goals: ['Maintain useful squat and deadlift strength'] }).map((p) => p.label), ['squat', 'deadlift']);
  assert.deepEqual(maintenancePatterns({}), []);
  assert.deepEqual(maintenancePatterns({ maintenance_goals: ['Maintain muscle mass'] }), []);
});

test('[G19] the assembled collector returns every family', () => {
  const p = program('Overview.', [block(1, [
    'Session B\tHandstand Hold\tBodyweight\t3\t20s\t90 sec\tN/A\tBack-to-wall.\t',
  ])]);
  const codes = new Set(collectGovernanceFlags(p, YOUTH).map((f) => f.code));
  assert.ok(codes.has('V43_SKILL_QUOTA_WITHOUT_CEILING'));
});
