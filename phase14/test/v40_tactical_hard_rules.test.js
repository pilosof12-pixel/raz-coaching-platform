import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  auditTacticalHardRules, auditRaceDemandExposure, auditQualityVolume,
  auditSacrificeHierarchy, buildTacticalHardRuleBrief, raceProfile,
} from '../engine/v40_tactical_hard_rules.js';
import { tactical3KGoldenProgram, TACTICAL_3K_INTAKE } from './fixtures/golden_programs.js';

// Coaching Specification v1.0 HARD rules T3K-01 and T3K-08, plus the
// CONTEXT-DEPENDENT T3K-03 which is advisory by classification.
const LIVE = path.join(process.cwd(), '..', 'docs', 'qa', 'live-three-avatar', 'latest');
const readLive = (n) => fs.readFileSync(path.join(LIVE, `${n}-program.txt`), 'utf8');
const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const key = (sets, dist, clock) => `Wed\tRun\t${clock} per ${dist} m\t${sets}\t${dist} m\t2:30\t8\tKey session.\t`;

const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
};

test('[V1] the race profile is read from the goal, not hardcoded', () => {
  const p = raceProfile(TACTICAL);
  assert.equal(p.km, 3);
  assert.equal(p.goalSec, 720);
  assert.equal(p.currentSec, 810);
  assert.equal(p.goalPace, 240);
  // Not a race goal: the rules do not apply at all.
  assert.equal(raceProfile({ primary_goals: ['220kg back squat'] }), null);
  assert.deepEqual(auditTacticalHardRules(block(1, [key(5, 400, '1:45')]), { primary_goals: ['220kg back squat'] }), []);
});

// --- T3K-01 ------------------------------------------------------------------

test('[V2] T3K-01 rejects a block whose key session never moves toward race demand', () => {
  const flat = [1, 2, 3, 4].map((w) => block(w, [key(5, 400, '1:45')])).join('\n\n');
  const f = auditRaceDemandExposure(flat, TACTICAL);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'T3K-01');
  assert.equal(f[0].severity, 'hard');
  assert.equal(f[0].goal_pace_s_per_km, 240);
});

test('[V3] T3K-01 accepts any one of longer reps, more volume, or faster pace', () => {
  const longer = [key(5, 400, '1:45'), key(5, 400, '1:45'), key(4, 600, '2:38'), key(4, 400, '1:45')]
    .map((r, i) => block(i + 1, [r])).join('\n\n');
  assert.deepEqual(auditRaceDemandExposure(longer, TACTICAL), [], 'extending repetition length is race-demand progression');

  const faster = [key(5, 400, '1:45'), key(5, 400, '1:43'), key(5, 400, '1:41'), key(4, 400, '1:40')]
    .map((r, i) => block(i + 1, [r])).join('\n\n');
  assert.deepEqual(auditRaceDemandExposure(faster, TACTICAL), [], 'moving velocity toward goal is race-demand progression');

  const bigger = [key(4, 400, '1:45'), key(5, 400, '1:45'), key(6, 400, '1:45'), key(4, 400, '1:45')]
    .map((r, i) => block(i + 1, [r])).join('\n\n');
  assert.deepEqual(auditRaceDemandExposure(bigger, TACTICAL), [], 'adding quality volume is race-demand progression');
});

// --- T3K-03 (advisory) -------------------------------------------------------

test('[V4] T3K-03 is advisory and never blocks a release', () => {
  const thin = [1, 2, 3].map((w) => block(w, [key(3, 400, '1:45')])).join('\n\n');
  const f = auditQualityVolume(thin, TACTICAL);
  assert.ok(f.length >= 1);
  assert.ok(f.every((x) => x.severity === 'advisory'), 'CONTEXT-DEPENDENT rules must not be hard gates');
  assert.equal(f[0].rule, 'T3K-03');
});

test('[V5] T3K-03 exempts the Week 4 taper, where reduced quality volume is intended', () => {
  const withTaper = [key(6, 400, '1:45'), key(5, 500, '2:12'), key(4, 600, '2:38'), key(3, 400, '1:42')]
    .map((r, i) => block(i + 1, [r])).join('\n\n');
  assert.deepEqual(auditQualityVolume(withTaper, TACTICAL), [], 'a taper week is not a quality-volume shortfall');
});

// --- T3K-08 ------------------------------------------------------------------

test('[V6] T3K-08 rejects cutting the key session while accessory volume holds or rises', () => {
  const inverted = [
    block(1, [key(6, 400, '1:45'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
    block(2, [key(5, 500, '2:12'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
    block(3, [key(3, 400, '1:45'), 'Fri\tPull-up\tBodyweight\t5\t8\t2 min\t7\tMore support.\t',
      'Fri\tBicep Curl\tRPE-selected\t3\t12\t60 sec\t7\tAccessory.\t']),
  ].join('\n\n');
  const f = auditSacrificeHierarchy(inverted, TACTICAL);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'T3K-08');
  assert.equal(f[0].severity, 'hard');
  assert.equal(f[0].week, 3);
  assert.ok(f[0].lower_priority_sets_after > f[0].lower_priority_sets_before);
});

test('[V7] T3K-08 accepts cutting the key session when lower-priority work was cut first', () => {
  const correct = [
    block(1, [key(6, 400, '1:45'), 'Fri\tPull-up\tBodyweight\t5\t8\t2 min\t7\tSupport.\t',
      'Fri\tBicep Curl\tRPE-selected\t3\t12\t60 sec\t7\tAccessory.\t']),
    block(2, [key(5, 500, '2:12'), 'Fri\tPull-up\tBodyweight\t5\t8\t2 min\t7\tSupport.\t',
      'Fri\tBicep Curl\tRPE-selected\t3\t12\t60 sec\t7\tAccessory.\t']),
    block(3, [key(3, 400, '1:45'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tTrimmed first.\t']),
  ].join('\n\n');
  assert.deepEqual(auditSacrificeHierarchy(correct, TACTICAL), [], 'lower-priority work was sacrificed first, as the hierarchy requires');
});

test('[V8] T3K-08 exempts Week 4, where reducing the key session is the taper', () => {
  const taper = [
    block(1, [key(6, 400, '1:45'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
    block(2, [key(5, 500, '2:12'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
    block(3, [key(4, 600, '2:38'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
    block(4, [key(3, 400, '1:42'), 'Fri\tPull-up\tBodyweight\t3\t8\t2 min\t7\tSupport.\t']),
  ].join('\n\n');
  assert.deepEqual(auditSacrificeHierarchy(taper, TACTICAL), []);
});

// --- real programs -----------------------------------------------------------

test('[V9] the coach-approved golden Tactical program raises no finding at all', () => {
  const f = auditTacticalHardRules(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.deepEqual(f, [], `an approved program must satisfy these rules, got: ${f.map((x) => x.rule).join(', ')}`);
});

test('[V10] the v37 live Tactical program satisfies all three rules', () => {
  // The live block runs 400 -> 500 -> 600 -> 400 with a taper, which is exactly
  // the race-demand progression T3K-01 asks for.
  assert.deepEqual(auditTacticalHardRules(readLive('tactical_3k'), TACTICAL), []);
});

test('[V11] the generation brief states all three rules before the model writes', () => {
  const brief = buildTacticalHardRuleBrief(TACTICAL);
  assert.match(brief, /T3K-01/);
  assert.match(brief, /3 km race/);
  assert.match(brief, /240 s\/km/);
  assert.match(brief, /T3K-03/);
  assert.match(brief, /2000-4000 m/);
  assert.match(brief, /T3K-08/);
  assert.match(brief, /only then the key race-specific session/);
  assert.match(brief, /Safety overrides this order/);
  // Not a race athlete: no brief at all.
  assert.equal(buildTacticalHardRuleBrief({ primary_goals: ['220kg back squat'] }), '');
});
