import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';
import { computeEffectiveEquipment, hardSubstituteEquipment } from '../engine/exercise_dictionary.js';

const youth = {
  primary_goals:['Achieve first bar muscle-up','Achieve a freestanding handstand'],
  secondary_goals:['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  days_per_week:2,
  gym_availability_mode:'flexible',
  available_gym_days:[],
  session_length:'60 min',
  training_location:'home_gym',
  equipment:'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  current_numbers:'Pistol squat: can perform with about +5 kg external load historically; no external load is available for the current block.',
  clarification_answers:{
    benchmark_bar_muscle_up:'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.',
    benchmark_handstand:'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.'
  },
  injuries:'None reported',
  pain:{active:false},
  notes:'Athlete is 13 years old. Occasional low-volume plyometrics and sprints with his father. No external weights available.'
};

test('home-gym equipment honors explicitly listed rings', () => {
  const eq=computeEffectiveEquipment(youth);
  assert.equal(eq.has('rings'),true);
  assert.equal(eq.has('pull_up_bar'),true);
  assert.equal(eq.has('bands'),true);
  assert.equal(eq.has('bench'),true);
  assert.equal(eq.has('barbell'),false);
});

test('unmapped unavailable strength work is never converted to Burpee EMOM', () => {
  const program=`START_WEEK1_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\nMonday\tCable Lateral Raise\tBW\t3\t10\t60s\t8\tAccessory\nEND_WEEK1_TSV`;
  const out=hardSubstituteEquipment(program,youth);
  assert.doesNotMatch(out,/Burpee EMOM/i);
  assert.match(out,/Cable Lateral Raise/i);
});

test('Youth gymnastics deterministic brief protects 9-plus coaching features', () => {
  const brief=buildDeterministicBrief(youth);
  assert.match(brief,/BAR MUSCLE-UP HIGH-PULL SUPPORT/i);
  assert.match(brief,/Strict Chest-to-Bar Pull-up|Explosive Hip-to-Bar Pull-up/i);
  assert.match(brief,/Generic chin-ups .* support volume only/i);
  assert.match(brief,/HANDSTAND BALANCE PROGRESSION/i);
  assert.match(brief,/Count kick-ups as attempts/i);
  assert.match(brief,/LOWER-BODY ATHLETICISM/i);
  assert.match(brief,/Pistol Squat/i);
  assert.match(brief,/ATHLETIC POWER/i);
  assert.match(brief,/YOUTH QUALITY RULE/i);
  assert.match(brief,/High-fatigue conditioning filler/i);
});

test('premium client exporter matches approved Youth gymnastics structure and hyperlink policy', () => {
  const src=fs.readFileSync(new URL('../public/spreadsheet-parity.js',import.meta.url),'utf8');
  for(const name of ["'Overview'","'Warm-Up'","`Week ${w.week}`"]) assert.ok(src.includes(name),`missing sheet structure token ${name}`);
  for(const header of ['Exercise','Load / Target','Sets','Reps / Duration','Rest','Effort','Coaching Note','Log','Video','Status','Done']) assert.ok(src.includes(header),`missing ${header}`);
  assert.match(src,/youtube\.com\/results\?search_query=/i);
  assert.match(src,/resolveExerciseDemo/);
  assert.doesNotMatch(src,/README/);
  assert.match(src,/4-WEEK INDIVIDUALIZED TRAINING BLOCK/);
});

test('live Youth gymnastics QA keeps the pistol-squat benchmark', () => {
  const src=fs.readFileSync(new URL('../public/live-qa.js',import.meta.url),'utf8');
  assert.match(src,/Pistol squat: can perform with about \+5 kg/i);
});
