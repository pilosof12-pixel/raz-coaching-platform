// A hard substitution used to be the end of the line: it fired only after a code
// had failed twice, so whatever it did to the row was already a rescue and nobody
// looked closely. Two things it did were wrong.
//
// It carried the load across. The kg in the cell was chosen for the movement the
// model wrote, and a substitution changes the movement: a 40 kg lat pulldown
// became a 40 kg weighted pull-up, and a 100 kg back squat became a 100 kg
// Bulgarian split squat -- about double the real per-leg load, delivered to the
// client as a prescription.
//
// And it overwrote the note, so the row lost its coaching cue and gained a
// sentence about the substitution's own paperwork.
//
// Both matter more now that the retry loop tries the substitution on the FIRST
// failure to save a two-and-a-half-minute model call, which puts this path in
// front of the client far more often.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateClientOutputCleanliness } from '../engine/client_output_qa.js';
import {
  hardSubstituteEquipment,
  hardSubstituteHallucinations,
  hardSubstituteUnilateral,
  validateEquipmentAgainstLocation,
} from '../engine/exercise_dictionary.js';

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const program = (...rows) => [1, 2, 3, 4]
  .map((n) => [`START_WEEK${n}_TSV`, HEAD, ...rows, `END_WEEK${n}_TSV`].join('\n'))
  .join('\n\n');
const row = (ex, load, note) => `Mon\t${ex}\t${load}\t3\t10\t2 min\t8\t${note}\t`;
const firstRow = (text) => text.split('\n').find((l) => /^Mon\t/.test(l)).split('\t');

const OUTDOOR = { training_location: 'outdoor park', equipment: ['pull-up bar', 'rings'] };

test('a load that cannot cross the substitution is not carried across', () => {
  const out = hardSubstituteEquipment(
    program(row('Lat Pulldown', '40 kg', 'Squeeze the lats at the bottom.')), OUTDOOR,
  );
  const cells = firstRow(out);
  assert.equal(cells[1], 'Pull-up');
  assert.equal(cells[2], 'RPE-selected load',
    'a 40 kg pulldown is not a 40 kg weighted pull-up');
});

test('a load that does cross the substitution is kept', () => {
  // Same movement, different implement: the weight is the same weight.
  const out = hardSubstituteEquipment(
    program(row('Sandbag Carry', '40 kg', 'Ribs down, brisk pace.')),
    { training_location: 'outdoor park', equipment: ['dumbbells'] },
  );
  const cells = firstRow(out);
  assert.equal(cells[1], 'Farmer Carry');
  assert.equal(cells[2], '40 kg', 'a carry stays the same carry at the same load');
});

test('a bilateral load is not handed to a single-leg movement', () => {
  const out = hardSubstituteUnilateral(
    program(row('Bodyweight Squat', '100 kg', 'Knees out, chest tall.')),
    { equipment: ['barbell', 'dumbbells'], training_location: 'indoor gym' },
  );
  const cells = firstRow(out);
  assert.equal(cells[1], 'Bulgarian Split Squat');
  assert.equal(cells[2], 'RPE-selected load',
    'per-leg work at the bilateral load is roughly double the intended dose');
});

test('the coaching cue survives the substitution', () => {
  const out = hardSubstituteEquipment(
    program(row('Lat Pulldown', '40 kg', 'Squeeze the lats at the bottom.')), OUTDOOR,
  );
  const note = firstRow(out)[7];
  assert.match(note, /^Substituted for Lat Pulldown: not available at your training location\./);
  assert.match(note, /Squeeze the lats at the bottom\./, 'the cue is coaching, not paperwork');
});

test('a cue that talks about the removed implement is dropped', () => {
  // "Drive low through the sled handles" is wrong advice for a farmer carry.
  const out = hardSubstituteEquipment(
    program(row('Sled Push', '80 kg', 'Drive low through the sled handles.')),
    { training_location: 'indoor gym', equipment: ['dumbbells'] },
  );
  const note = firstRow(out)[7];
  assert.match(note, /^Substituted for Sled Push:/);
  // The sentence names the movement it replaced, which is the point of it. What
  // must be gone is the advice about how to push a sled.
  assert.doesNotMatch(note, /Drive low/i, 'a cue about equipment the row no longer uses must go');
  assert.doesNotMatch(note, /handles/i);
});

test('the equipment substitution converges, so the model need not be asked', () => {
  // This is the whole basis for trying determinism before spending a model call:
  // the gate that refused the program must actually accept the repaired one.
  const before = program(row('Lat Pulldown', '40 kg', 'Squeeze the lats at the bottom.'));
  assert.throws(() => validateEquipmentAgainstLocation(before, OUTDOOR),
    (e) => e.code === 'EQUIPMENT_VIOLATION');
  const after = hardSubstituteEquipment(before, OUTDOOR);
  assert.doesNotThrow(() => validateEquipmentAgainstLocation(after, OUTDOOR),
    'if this throws, the early substitution would burn a call and still fail');
});

// The retry loop itself. Read the shipped runtime rather than a copy of it, the
// same way the abort-classification test does.
//
// server.phase15.js is the live path and the only one that matters here:
// final_pipeline_lock replaces the whole catch block when it builds that file and
// drops hardSubstitute entirely, which is why a dictionary answer for
// EQUIPMENT_VIOLATION still cost run #143 a second model call.
const LIVE = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');

const catchBlock = () => {
  const start = LIVE.indexOf('await onProgress("refining", attempt, `internal repair: ${repairLabel}`);');
  const end = LIVE.indexOf('repairCandidate = requiresFreshCandidate ? null : program;', start);
  assert.ok(start > 0 && end > start, 'live retry catch block not found');
  return LIVE.slice(start, end);
};

test('the live loop tries the deterministic substitution before another model call', () => {
  const between = catchBlock();
  assert.match(between, /hardSubstitute\(repairCode, program, intake\)/,
    'the substitution must be attempted before the model is asked again');
  assert.ok(between.indexOf('hardSubstitute(repairCode, program, intake)')
    < between.indexOf('runQualityChain(substituted)'),
    'substitute first, then re-validate');
});

test('the live loop re-validates the substitution instead of trusting it', () => {
  const between = catchBlock();
  // No gate is weakened: steps 2-11 run again, phase15 final QA included, plus
  // the client-output check, and only then is the program returned.
  assert.match(between, /runQualityChain\(substituted\)/);
  assert.match(between, /validateClientOutputCleanliness\(finished\)/);
  // Scope the ordering to the substitution branch: the bundle-reuse block above
  // it also returns a `finished`, so a search across the whole catch finds that
  // one and proves nothing.
  const branch = between.slice(between.indexOf('if (substituted) {'));
  assert.ok(branch.indexOf('runQualityChain(substituted)') < branch.indexOf('return finished;'),
    'the program is returned only after the chain has accepted it');
});

test('the success path adds no gate the chain did not run', () => {
  // A later patch collapsed steps 2-11 into the repairable bundle plus the
  // client-output check, so the chain is those two calls. What matters is that
  // nothing validating sits between the chain and the return: a gate outside the
  // chain is a gate the re-validated substitution would never have to pass.
  const chainStart = LIVE.indexOf('const runQualityChain = (start) => {');
  const chainEnd = LIVE.indexOf('    };', chainStart);
  assert.ok(chainStart > 0 && chainEnd > chainStart);
  const chain = LIVE.slice(chainStart, chainEnd);
  assert.match(chain, /validateRepairableProgramBundle\(program, intake/);
  assert.match(chain, /validateClientOutputCleanliness\(program\)/);

  const afterChain = LIVE.slice(
    LIVE.indexOf('const finished = runQualityChain(program);'),
    LIVE.indexOf('return finished;', LIVE.indexOf('const finished = runQualityChain(program);')),
  );
  assert.doesNotMatch(afterChain, /\bvalidate[A-Z]/,
    'every gate must be inside runQualityChain so the substitution faces it too');
});

test('a substitution that does not converge falls through to the model', () => {
  const between = catchBlock();
  assert.match(between, /catch \(stillFlagged\)/,
    'a substitution that fails re-validation must not be returned');
  // And the model gets the text it actually wrote, not a half-normalized hybrid:
  // runQualityChain reassigns `program` as it goes.
  assert.match(between, /program = programBeforeSubstitution;/,
    'the failed attempt must not leave its partial normalization behind');
});

test('a deterministic name fix converges only when it is clean', () => {
  // hardSubstituteHallucinations does two different things, and only one of them
  // is shippable. An alias becomes its canonical name, which is lossless and
  // exactly what determinism is for. A name the dictionary does not know at all
  // becomes "[REVIEW] ..." plus contact-support text -- a client-visible defect
  // the repair prompt explicitly forbids.
  //
  // This is why the re-validation has to include the client-output check rather
  // than just the bundle: it is the gate that refuses the second branch and sends
  // the build back to the model, which is the right outcome.
  const known = hardSubstituteHallucinations(
    program(row('Chin Up', 'Bodyweight', 'Full hang each rep.')), OUTDOOR,
  );
  assert.doesNotMatch(known, /\[REVIEW\]/, 'a known alias is renamed, not flagged');
  assert.doesNotThrow(() => validateClientOutputCleanliness(known));

  const invented = hardSubstituteHallucinations(
    program(row('Quantum Lat Blaster', 'Bodyweight', 'Three hard sets.')), OUTDOOR,
  );
  assert.match(invented, /\[REVIEW\]/, 'an invented movement is flagged rather than guessed at');
  assert.throws(() => validateClientOutputCleanliness(invented),
    'the cleanliness gate must refuse this, so the loop asks the model instead');
});
