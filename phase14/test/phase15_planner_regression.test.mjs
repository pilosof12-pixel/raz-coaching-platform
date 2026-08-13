import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';

const intake = {
  language:'en',
  primary_goals:[
    'Box squat to parallel: progress toward 180 kg x 10, with nearer term goal exceeding 210 kg max',
    'One arm pull up: progress from 2 strict reps to 4 strict reps'
  ],
  secondary_goals:[
    'Strict overhead press: progress from current 75 kg x 4 to 5 toward 100 kg',
    'Improve aerobic conditioning and day to day energy without reducing strength or BJJ/MMA performance'
  ],
  maintenance_goals:[
    'Maintain strength transfer to grappling and MMA',
    'Maintain muscle mass with direct cable lateral raises and face pulls',
    'Maintain low fatigue explosive work',
    'Freestanding HSPU is nice to have only and must not take resources from OHP, conditioning, recovery, or mat performance'
  ],
  current_numbers:[
    'Box squat to parallel: 205 kg confirmed; approximately 210 kg current max',
    'Speed box squat: 100 to 105 kg explosive and well tolerated',
    'One arm pull up: 2 strict reps maximum',
    'Weighted chin up: +80 kg external load 1RM',
    'Strict overhead press: 75 kg x 4 to 5; historical 1RM approximately 90 kg',
    'Push press: 80 kg x 3 at RPE 9 to 9.5 while fatigued',
  ].join('\n'),
  days_per_week:4,
  session_duration_minutes:60,
  gym_availability_mode:'flexible',
  available_gym_days:[],
  sport:'BJJ / MMA',
  sport_schedule:[
    {day:'Sun',intensity:'moderate'}, {day:'Mon',intensity:'hard'}, {day:'Tue',intensity:'hard'},
    {day:'Wed',intensity:'moderate'}, {day:'Thu',intensity:'hard'}
  ],
  same_day_gap_hours:6,
  training_location:'commercial_gym',
  equipment:'barbell, plates, rack, bench, dumbbells, cable stack, machines, pull-up bar, dip bars, bike, rower, med balls, sled, bands',
  split_preference:'full_body',
  pain:'Recurrent lower back sensitivity with sciatica tendencies. Deep loaded squatting with lumbar flexion and heavy RDLs can flare it. Box squats to parallel and speed box squats are well tolerated. OAP, weighted pulling, OHP and push press generally tolerated. Hip thrusts are well tolerated. Prefer lower spinal fatigue posterior chain assistance.',
  mobility:{active:false},
  sleep_hours:'6-7',
  recovery_rating:'Average',
  notes:'Advanced concurrent strength and combat athlete. Recovery varies. Prefer low volume full body training. Prioritize strength return per unit fatigue. OAP should use two unilateral specific exposures, not maximal work every day. Weighted chin work must respect +80 kg 1RM. OHP outranks HSPU. Keep low volume jumps or med ball throws if low fatigue and stop before velocity loss. Two to three Zone 2 sessions desirable. Do not add hard running or hard conditioning unnecessarily.'
};

const brief = buildDeterministicBrief(intake);

test('dual box squat outcomes stay distinct', () => {
  assert.match(brief, /DUAL BOX-SQUAT GOAL/);
  assert.match(brief, /BOX_SQUAT_HEAVY/);
  assert.match(brief, /1-4 reps/);
  assert.match(brief, /BOX_SQUAT_REP/);
  assert.match(brief, /6-8 rep/);
  assert.match(brief, /toward 8-10 quality reps/);
  assert.match(brief, /double-progression logic/);
  assert.match(brief, /current tolerated box-squat max anchor is about 210 kg/i);
  assert.match(brief, /180 kg x 10 target is NOT the Week 1 working load/i);
});

test('OAP prescription matches a two-rep strict athlete and separates direct from support work', () => {
  assert.match(brief, /athlete already owns 2 strict One-Arm Pull-up reps/i);
  assert.match(brief, /strict One-Arm Pull-up singles or clusters/i);
  assert.match(brief, /Assisted One-Arm Pull-up doubles or triples/i);
  assert.match(brief, /direct unilateral practice drives the skill/i);
  assert.match(brief, /Weighted Chin-up or Weighted Pull-up is valuable base strength support/i);
  assert.match(brief, /never counts as either required direct OAP exposure/i);
  assert.match(brief, /One-Arm Pull-up Eccentric\/negative as either main OAP exposure/i);
  assert.match(brief, /Archer Pull-up.*substitute/i);
  assert.match(brief, /current \+80 kg external-load 1RM/i);
});

test('strict OHP keeps direct specificity while allowing purposeful variation', () => {
  assert.match(brief, /STRICT OHP IS A PROGRESSION GOAL/);
  assert.match(brief, /at least one direct strict Overhead Press exposure every week/i);
  assert.match(brief, /at least two meaningful vertical-press exposures/i);
  assert.match(brief, /second may deliberately vary the stimulus/i);
  assert.match(brief, /Push Press overload/i);
  assert.match(brief, /Variation is a tool, not random exercise rotation/i);
  assert.match(brief, /Current strict OHP anchor is 75 kg x about 4\+ reps/);
  assert.match(brief, /Long-term strict OHP target is about 100 kg/);
});

test('all four gym days remain strength days and aerobic work stays low fatigue', () => {
  assert.match(brief, /Gym days \(4\): Wed, Fri, Sat, Sun/);
  assert.match(brief, /ALL 4 listed gym days are genuine strength\/full-body sessions/);
  for (const day of ['Wed','Fri','Sat','Sun']) {
    const line = brief.split('\n').find(x => x.startsWith(`* ${day}:`));
    assert.ok(line, `missing ${day}`);
    assert.ok(!/^\* \w+: ZONE2_[AB];/.test(line), `${day} collapsed to cardio only`);
  }
  assert.match(brief, /choose frequency, duration and modality from the curated endurance sources/i);
  assert.doesNotMatch(brief, /20-35 minutes each|Two meaningful low-fatigue Zone 2 exposures/i);
  assert.match(brief, /Unrequested hard intervals/);
});

test('client-facing exercise naming has no review path in the brief', () => {
  assert.match(brief, /Never output \[REVIEW\], support messages or placeholder exercise rows/);
  assert.match(brief, /Overhead Press/);
  assert.match(brief, /aerobic-base \/ Zone 2 goal/i);
  assert.match(brief, /Assisted One-Arm Pull-up/);
  assert.match(brief, /Box Squat to Parallel/);
  assert.match(brief, /use Box Jump/i);
});
