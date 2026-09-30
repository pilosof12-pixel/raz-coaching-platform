import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectUndeclaredGoalStatusFlags,
  declaresMaintenance,
  normalizeGoalStatusDeclaration,
} from '../engine/goal_status_declaration.js';
import { progressionAnalysis, validateProgressionArchitectureSemantic } from '../engine/coaching_progression_gpp.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';

const stripGuidance = (p) => p.slice(p.indexOf('START_WEEK1_TSV'));

test('a named goal held flat through the build weeks must say so', () => {
  // The coach's first engine-level correction: a named secondary goal that is
  // deliberately maintained has to be declared, not silently given maintenance
  // programming while the block describes everything as progression.
  const undeclared = stripGuidance(advancedHybridLaunchProgram());
  const flags = collectUndeclaredGoalStatusFlags(
    progressionAnalysis(undeclared, ADVANCED_HYBRID_LAUNCH_INTAKE),
    undeclared,
  );
  assert.equal(flags.length, 1);
  assert.equal(flags[0].family, 'overhead_press');
  assert.equal(flags[0].code, 'V101_GOAL_STATUS_UNDECLARED');
});

test('the declaration names the goal, the reason and what is being developed instead', () => {
  const undeclared = stripGuidance(advancedHybridLaunchProgram());
  const withHead = `This block trains the squat and the one-arm pull-up.\n\n${undeclared}`;
  const out = normalizeGoalStatusDeclaration(
    withHead,
    ADVANCED_HYBRID_LAUNCH_INTAKE,
    progressionAnalysis(withHead, ADVANCED_HYBRID_LAUNCH_INTAKE),
  );
  assert.equal(out.repaired, true);
  const head = out.program.split('START_WEEK1_TSV')[0];
  assert.match(head, /100kg overhead press/);
  assert.match(head, /maintenance dose rather than developing it/);
  assert.match(head, /sport sessions a week already own most of the recovery budget/);
  // Guidance only: not one prescription row changes.
  const rows = (p) => p.split('\n').filter((l) => l.includes('\t'));
  assert.deepEqual(rows(out.program), rows(withHead));
});

test('a declared hold satisfies the progression gate; silence does not', () => {
  const undeclared = `This block trains the squat.\n\n${stripGuidance(advancedHybridLaunchProgram())}`;
  // Without the declaration the gate is entitled to refuse: an athlete reading
  // an improvement goal and an unchanging dose cannot tell which is the mistake.
  assert.throws(
    () => validateProgressionArchitectureSemantic(undeclared, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (e) => e.code === 'PROGRESSION_ARCHITECTURE_MISSING',
  );
  const declared = normalizeGoalStatusDeclaration(
    undeclared,
    ADVANCED_HYBRID_LAUNCH_INTAKE,
    progressionAnalysis(undeclared, ADVANCED_HYBRID_LAUNCH_INTAKE),
  ).program;
  assert.doesNotThrow(() => validateProgressionArchitectureSemantic(declared, ADVANCED_HYBRID_LAUNCH_INTAKE));
});

test('the declaration converges in one pass and is idempotent', () => {
  const undeclared = `This block trains the squat.\n\n${stripGuidance(advancedHybridLaunchProgram())}`;
  const once = normalizeGoalStatusDeclaration(undeclared, ADVANCED_HYBRID_LAUNCH_INTAKE, progressionAnalysis(undeclared, ADVANCED_HYBRID_LAUNCH_INTAKE));
  assert.deepEqual(collectUndeclaredGoalStatusFlags(progressionAnalysis(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE), once.program), []);
  const twice = normalizeGoalStatusDeclaration(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE, progressionAnalysis(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE));
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('ordinary coaching prose is not mistaken for a status declaration', () => {
  // A first attempt accepted "held", "hold" or "preserved" anywhere near the
  // goal word, and passed on "with OHP moving at a smaller dose and one weekly
  // easy long run preserved" -- which says the opposite of a hold.
  const misleading = 'Primary work stays on Back Squat, with OHP moving at a smaller dose and one weekly easy long run preserved around MMA.';
  assert.equal(declaresMaintenance(`${misleading}\n\nSTART_WEEK1_TSV`, 'overhead_press'), false);
  assert.equal(declaresMaintenance('On the overhead press: held at a maintenance dose this block.\n\nSTART_WEEK1_TSV', 'overhead_press'), true);
});

test('a goal that genuinely progresses needs no declaration', () => {
  const program = advancedHybridLaunchProgram();
  const flags = collectUndeclaredGoalStatusFlags(progressionAnalysis(program, ADVANCED_HYBRID_LAUNCH_INTAKE), program);
  assert.equal(flags.some((f) => f.family === 'squat'), false);
});

test('the production bundle declares status before the semantic checks read it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  const declaredAt = bundle.indexOf('normalizeGoalStatusDeclaration(candidate, intake');
  const checksAt = bundle.indexOf('validateProgressionArchitectureSemantic(candidate, intake, model)');
  assert.ok(declaredAt > 0 && checksAt > 0);
  assert.ok(declaredAt < checksAt, 'written after the gate reads it, the declaration cannot answer it');
});

test('the integrated muscle-up is an assistance ladder with a gate, not a repeated dose', async () => {
  const { normalizeYouthSkillAcquisitionQuality } = await import('../engine/coaching_spec_v1_convergence_normalizer.js');
  const fs = await import('node:fs');
  const YOUTH = {
    age: 13,
    days_per_week: 2,
    primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
    secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
    current_numbers: 'Pistol squat established; ring muscle-up achieved; about 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
    notes: 'Skill quality before fatigue; no grinders or repeated failed attempts.',
  };
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const legacy = 'Band assistance selected for a smooth full bar turnover';
  const rows = (w) => [
    ['Session A', 'Bar Muscle-up Transition Drill', 'Moderate band', '3', '2', '90s', '5-6', 'Turnover practice.', ''].join('\t'),
    ['Session A', 'Banded Muscle-up', legacy, '2', '1', '90 sec', '6', 'Integrated singles.', ''].join('\t'),
  ];
  const program = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${rows(w).join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');

  const out = normalizeYouthSkillAcquisitionQuality(program, YOUTH);
  const loadFor = (w) => out.program.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
    .split('\n').find((l) => l.includes('\tBanded Muscle-up\t')).split('\t')[2];

  // The component drill progressed while the integrated movement repeated the
  // same 2x1 in all four weeks, which is what the coach charged.
  assert.equal(new Set([loadFor(1), loadFor(2), loadFor(3)]).size, 3, 'assistance must move week to week');
  assert.match(loadFor(2), /less band than Week 1/i);
  assert.match(loadFor(3), /least band/i);

  // And Week 3 gates to the real thing rather than only reducing assistance.
  const w3note = out.program.match(/START_WEEK3_TSV[\s\S]*?END_WEEK3_TSV/)[0]
    .split('\n').find((l) => l.includes('\tBanded Muscle-up\t')).split('\t')[7];
  assert.match(w3note, /unassisted attempts BEFORE this set/i);
  assert.match(w3note, /while you are freshest/i);

  // Volume never moves: at thirteen the progression is assistance, not fatigue.
  for (const w of [1, 2, 3, 4]) {
    const cells = out.program.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
      .split('\n').find((l) => l.includes('\tBanded Muscle-up\t')).split('\t');
    assert.equal(cells[3], '2');
    assert.equal(cells[4], '1');
  }
});

test('a named kilogram goal progresses on its heaviest set, not on a lighter one', async () => {
  const { progressionAnalysis } = await import('../engine/coaching_progression_gpp.js');
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const press = (load, sets, reps) => ['Mon', 'Overhead Press', load, String(sets), String(reps), '3 min', '7', 'Press.', ''].join('\t');
  const intake = { secondary_goals: ['100kg overhead press'], current_numbers: 'Overhead Press: 80 kg x 4' };

  // The shape the coach objected to: the goal set sits at 65 kg for three weeks
  // while a lighter second exposure moves 60 -> 65 once.
  const flatLead = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${[
    press(w === 1 ? '60 kg' : '65 kg', 2, 5),
    press('65 kg', 3, 5),
  ].join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
  const flat = progressionAnalysis(flatLead, intake).targets.find((t) => t.family === 'overhead_press');
  assert.equal(flat.lead_tracked, true);
  assert.equal(flat.progressed, false, 'the heaviest set never moved');

  // And when the goal set itself moves, it progresses.
  const movingLead = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${[
    press('60 kg', 2, 5),
    press(`${[65, 67.5, 70, 65][w - 1]} kg`, 3, 5),
  ].join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
  assert.equal(progressionAnalysis(movingLead, intake).targets.find((t) => t.family === 'overhead_press').progressed, true);
});

test('declarations are rewritten wholesale, never stacked or left contradicting', async () => {
  const { progressionAnalysis } = await import('../engine/coaching_progression_gpp.js');
  const base = `This block trains the squat.\n\n${stripGuidance(advancedHybridLaunchProgram())}`;

  const once = normalizeGoalStatusDeclaration(base, ADVANCED_HYBRID_LAUNCH_INTAKE, progressionAnalysis(base, ADVANCED_HYBRID_LAUNCH_INTAKE));
  const twice = normalizeGoalStatusDeclaration(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE, progressionAnalysis(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE));

  const count = (p) => (p.match(/holds it at a maintenance dose rather than developing it/g) || []).length;
  assert.equal(count(twice.program), count(once.program), 'a second pass must not stack a second copy');

  // The repair chain runs more than once on a candidate. An earlier pass once
  // declared one goal held while naming another as developed, a later pass found
  // that second goal flat and declared it too, and the block shipped carrying
  // both claims. Stripping happens before the flags are computed, so a goal can
  // never lose its declaration by having suppressed its own flag.
  const declared = [...twice.program.matchAll(/^On ([^:]+):/gm)].map((m) => m[1]);
  for (const goal of declared) {
    assert.doesNotMatch(
      twice.program,
      new RegExp(`${goal.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} (?:is|are) what this block develops`),
      `${goal} is declared held and also named as developed`,
    );
  }
});
