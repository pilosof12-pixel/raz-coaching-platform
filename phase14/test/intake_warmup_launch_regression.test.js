import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { enrichSpecificWarmups } from '../engine/specific_warmup_enrichment.js';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/intake-polish.js', import.meta.url), 'utf8');
const launch = fs.readFileSync(new URL('../scripts/apply_launch_runtime.mjs', import.meta.url), 'utf8');

function programFor(dayRows) {
  const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  return [1,2,3,4].map((w) => `START_WEEK${w}_TSV\n${header}\n${dayRows}\nEND_WEEK${w}_TSV`).join('\n');
}

test('goals remain before current performance markers in the intake flow', () => {
  const goal = index.indexOf('id="goal_primary_1"');
  const markers = index.indexOf('id="performance-block"');
  assert.ok(goal >= 0 && markers > goal);
});

test('specific lifting-day polish reveals the limited-day panel', () => {
  assert.match(polish, /gym_availability_mode/);
  assert.match(polish, /=== 'limited'/);
  assert.match(polish, /panel\.classList\.toggle\('hidden', !limited\)/);
  assert.match(launch, /appTag[\s\S]*intakePolishTag/);
});

test('heavy deadlift warmup gets movement drills and load-derived ramp sets', () => {
  const src = programFor([
    'Mon\t[WARMUP]\tBodyweight\t1\t5 min\tN/A\tN/A\tDynamic warm-up, light cardio\t',
    'Mon\tDeadlift\t180 kg\t2\t3\t3 min\t8\tStrength work\t',
  ].join('\n'));
  const out = enrichSpecificWarmups(src);
  assert.match(out, /Hip-hinge drill x 8/);
  assert.match(out, /Glute bridge x 10/);
  assert.match(out, /72\.5 kg x 5/);
  assert.match(out, /107\.5 kg x 3/);
  assert.match(out, /140 kg x 1-2/);
  assert.match(out, /before 180 kg work sets/);
});

test('pulling warmup gets scapular preparation and weighted pull-up ramping', () => {
  const src = programFor([
    'Wed\t[WARMUP]\tBodyweight\t1\t5 min\tN/A\tN/A\tDynamic warm-up\t',
    'Wed\tWeighted Pull-up\t+30 kg\t3\t5\t2 min\t8\tPriority pulling\t',
  ].join('\n'));
  const out = enrichSpecificWarmups(src);
  assert.match(out, /Scapular pull-up 2 x 5-6/);
  assert.match(out, /Band pull-apart x 10-12/);
  assert.match(out, /bodyweight x 5/);
  assert.match(out, /\+10 kg x 3/);
  assert.match(out, /\+20 kg x 2/);
});

test('authored running-specific warmup is preserved instead of overwritten', () => {
  const note = 'Easy jog 8 min; dynamic running drills; 2 relaxed strides';
  const src = programFor([
    `Tue\t[WARMUP]\tN/A\t1\t10 min\tN/A\tN/A\t${note}\t`,
    'Tue\tRun\t4:30/km\t5\t600m\t3 min\t8\tIntervals\t',
  ].join('\n'));
  const out = enrichSpecificWarmups(src);
  assert.ok(out.includes(note));
});
