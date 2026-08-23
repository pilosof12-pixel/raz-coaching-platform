import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectIntakeClarifications, intakeClarificationResult, requiredClarifications } from '../intake_clarification.js';

function ids(intake) { return detectIntakeClarifications(intake).map(q => q.id); }

test('quantified 5K goal asks for current performance and current running exposure when both are missing', () => {
  const out = ids({ secondary_goals:['Run 5K in 22:30'] });
  assert.ok(out.includes('benchmark_running_event'));
  assert.ok(out.includes('running_current_exposure'));
});

test('explicit from-to 5K goal already contains baseline but still asks for current weekly exposure', () => {
  const out = ids({ secondary_goals:['Improve 5 km from 25:00 to 22:30'] });
  assert.ok(!out.includes('benchmark_running_event'));
  assert.ok(out.includes('running_current_exposure'));
});

test('clarification answers resolve the questions without needing AI inference', () => {
  const intake = {
    secondary_goals:['Run 5K in 22:30'],
    clarification_answers:{
      benchmark_running_event:'Recent 5K is 25:00',
      running_current_exposure:'2 runs per week, about 10 km per week',
    },
  };
  assert.equal(intakeClarificationResult(intake).ready, true);
});

test('first bar muscle-up and freestanding handstand ask only the two skill-specific baselines', () => {
  const out = ids({
    primary_goals:['Achieve first bar muscle-up','Achieve a freestanding handstand'],
    equipment:'Home setup with rings, pull-up bar, resistance bands and bench',
  });
  assert.ok(out.includes('benchmark_bar_muscle_up'));
  assert.ok(out.includes('benchmark_handstand'));
  assert.ok(!out.includes('benchmark_muscle_up'));
  assert.equal(out.length, 2);
});

test('ring muscle-up evidence does not falsely satisfy a bar muscle-up baseline', () => {
  const out = ids({
    primary_goals:['Achieve first bar muscle-up'],
    current_numbers:['Ring muscle-up: achieved','Pull-ups: 12','Ring dips: 6'],
  });
  assert.ok(out.includes('benchmark_bar_muscle_up'));
  assert.ok(!out.includes('benchmark_muscle_up'));
});

test('answering the two youth skill clarifications fully resolves the next round', () => {
  const result = intakeClarificationResult({
    primary_goals:['Achieve first bar muscle-up','Achieve a freestanding handstand'],
    secondary_goals:['Build general push and pull strength'],
    equipment:'Home setup with rings, pull-up bar, resistance bands and bench. No external weights.',
    clarification_answers:{
      benchmark_bar_muscle_up:'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.',
      benchmark_handstand:'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
    },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.questions, []);
});

test('fully specified youth muscle-up and handstand avatar does not create redundant skill ping-pong', () => {
  const out = ids({
    primary_goals:['Achieve first bar muscle-up','Achieve a freestanding handstand'],
    secondary_goals:['Build general push and pull strength'],
    current_numbers:[
      'Bar muscle-up: cannot perform yet; ring muscle-up achieved; 12 strict pull-ups; 6 ring dips',
      'Handstand: wall-facing 15 seconds; back-to-wall 20 seconds; improving kick-ups; no reliable unsupported balance',
    ],
    equipment:'Home setup with rings, pull-up bar, resistance bands and bench. No external weights.',
    training_location:'home_gym',
  });
  assert.ok(!out.includes('benchmark_bar_muscle_up'));
  assert.ok(!out.includes('benchmark_handstand'));
  assert.deepEqual(out, []);
});

test('vague low-back pain intersecting a squat goal asks movement-tolerance question', () => {
  const out = ids({ primary_goals:['Back squat 200 kg'], current_numbers:['Back squat 170x3'], injuries:'Recurring low-back irritation' });
  assert.ok(out.includes('lumbar_goal_movement_tolerance'));
});

test('explicit aggravating feature and tolerated substitutions avoid redundant low-back question', () => {
  const out = ids({
    primary_goals:['Back squat 200 kg'],
    current_numbers:['Back squat 170x3'],
    injuries:'Lower-back irritation after high-volume deep squatting. Parallel box squat, RDL and split squat are tolerated.',
  });
  assert.ok(!out.includes('lumbar_goal_movement_tolerance'));
});

test('combat sport without schedule asks for weekly sport structure', () => {
  const out = ids({ primary_goals:['Strength'], sport:'BJJ and MMA' });
  assert.ok(out.includes('sport_week_structure'));
});

test('fully specified annoying avatar does not create unnecessary ping-pong', () => {
  const out = detectIntakeClarifications({
    primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps'],
    secondary_goals:['Improve 5 km from 25:00 to 22:30'],
    current_numbers:['Back squat 170x3','Weighted chin-up +55x3','5K 25:00'],
    sport:'MMA and BJJ',
    sport_schedule:['Mon hard MMA','Wed moderate BJJ','Fri hard MMA','Sat moderate BJJ'],
    injuries:'Lower-back irritation after high-volume deep squatting. Parallel box squat, RDL and split squat are tolerated.',
    notes:'Currently 2 runs per week, about 10 km/week.',
  });
  assert.deepEqual(out, []);
});

test('server build clarification gate stays before generation rate limit and Program Pass guard', () => {
  const src = fs.readFileSync(new URL('../server_secure.js', import.meta.url), 'utf8');
  // The gate now offers optional questions alongside the blocking ones; what
  // this test protects is its position, not its exact wording.
  const gate = src.indexOf('detectIntakeClarifications(intake)');
  const rate = src.indexOf('consumeHourly(req,"build"');
  const guard = src.indexOf('return guardProgramPass(req,res,next)');
  assert.ok(gate >= 0 && rate > gate && guard > rate);
});

test('clarification UI is a local fetch retry layer with no AI endpoint', () => {
  const src = fs.readFileSync(new URL('../public/clarification-controls.js', import.meta.url), 'utf8');
  assert.match(src, /response\.status === 422/);
  assert.match(src, /clarification_answers/);
  assert.doesNotMatch(src, /openai|gemini|generateContent|\/api\/adjust/i);
});

// A coach's framing: the clarification exchange already works, so it should
// cover everything the engine needs before generating -- not just goal
// benchmarks. Each question below exists because a rule is switched off
// entirely without its answer, not merely weakened.

test('optional gaps are offered only while the athlete is already answering', () => {
  // Neither of these blocks a build, and neither is worth a round trip of its
  // own. A session length of "coach decides" is a real answer, not a gap, and
  // re-asking would second-guess a choice the athlete made in the form.
  const asked = (i) => intakeClarificationResult(i).questions.map((q) => q.id);

  const complete = { primary_goals: ['220kg back squat'], current_numbers: 'Back Squat: 205 kg 1RM' };
  assert.deepEqual(asked(complete), [], 'nothing is asked when nothing blocks');

  // Already in the exchange for a required reason: the optional gaps come too.
  const inExchange = { primary_goals: ['4 One arm pullups'], secondary_goals: ['Improve 5 km from 25:00 to 22:30'] };
  const ids2 = asked(inExchange);
  assert.ok(ids2.includes('session_time_budget'), 'no stated session ceiling');
  assert.ok(ids2.includes('bodyweight'), 'calisthenics goal with no bodyweight');
});

test('a stated session ceiling or bodyweight is never asked for again', () => {
  const asked = (i) => intakeClarificationResult(i).questions.map((q) => q.id);
  const base = { primary_goals: ['4 One arm pullups'], secondary_goals: ['Improve 5 km from 25:00 to 22:30'] };
  assert.ok(!asked({ ...base, session_length: '45-70 min' }).includes('session_time_budget'));
  assert.ok(!asked({ ...base, session_duration_minutes: 60 }).includes('session_time_budget'));
  assert.ok(!asked({ ...base, current_numbers: 'Bodyweight 82 kg' }).includes('bodyweight'));
  // A purely barbell athlete is never asked for bodyweight.
  assert.ok(!asked({ primary_goals: ['220kg back squat'], secondary_goals: ['Improve 5 km from 25:00 to 22:30'] }).includes('bodyweight'));
});

test('an athlete who stated a race time is not asked for repeats as well', () => {
  // The rule that needs a repeat pace now falls back to the current race time,
  // which is a demonstrated capacity in its own right. Asking for repeats the
  // athlete may never have run would interrogate an intake that already
  // answered the question.
  const stated = { primary_goals: ['Improve 5 km from 25:00 to 22:30'], session_duration_minutes: 60, current_numbers: '5K 25:00', notes: 'Runs 2 per week, about 10 km/week.' };
  assert.ok(!ids(stated).includes('interval_repeat_capacity'));
});

test('an intake that answers everything is asked nothing and builds', () => {
  const complete = intakeClarificationResult({
    primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
    session_duration_minutes: 60,
    current_numbers: '3 km: 13:30',
    notes: 'Runs 3 sessions per week, about 18-20 km/week. Recent 400 m repeats are around 1:42-1:45.',
  });
  assert.deepEqual(complete.questions, []);
  assert.equal(complete.ready, true);
});

test('optional questions are offered but never gate the build', () => {
  const partial = intakeClarificationResult({ primary_goals: ['4 One arm pullups'], secondary_goals: ['Improve 5 km from 25:00 to 22:30'] });
  const optional = partial.questions.filter((q) => q.required === false);
  assert.ok(optional.length, 'optional questions ride along with the required one');
  assert.ok(requiredClarifications(partial.questions).every((q) => q.required !== false),
    'and are never counted among the answers that gate the build');
});
