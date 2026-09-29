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
