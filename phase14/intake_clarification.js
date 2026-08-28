import { bodyweightKg } from './engine/intake_bodyweight.js';

function text(v) {
  if (Array.isArray(v)) return v.map(text).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function answers(intake) { return intake?.clarification_answers && typeof intake.clarification_answers === 'object' ? intake.clarification_answers : {}; }
function answered(intake, id) { return nonEmpty(String(answers(intake)[id] || '')); }
function currentText(intake) { return text(intake?.current_numbers || intake?.performance_markers || intake?.current_strength || '').toLowerCase(); }
function goalText(intake) { return text([intake?.primary_goals, intake?.secondary_goals]).toLowerCase(); }
function painText(intake) { return text([intake?.injuries, intake?.pain, intake?.limitations, intake?.tolerated_movements, intake?.notes]).toLowerCase(); }

const MOVEMENTS = [
  { id:'back_squat', goal:/\b(?:back\s+)?squat\b/i, current:/\b(?:back\s+)?squat\b/i, label:'back squat' },
  { id:'deadlift', goal:/\b(?:deadlift|rdl|romanian deadlift)\b/i, current:/\b(?:deadlift|rdl|romanian deadlift)\b/i, label:'deadlift / hinge' },
  { id:'bench_press', goal:/\bbench(?: press)?\b/i, current:/\bbench(?: press)?\b/i, label:'bench press' },
  { id:'overhead_press', goal:/\b(?:overhead press|ohp|strict press)\b/i, current:/\b(?:overhead press|ohp|strict press)\b/i, label:'overhead press' },
  { id:'weighted_pull', goal:/\bweighted (?:chin|pull)[- ]?up\b/i, current:/\bweighted (?:chin|pull)[- ]?up\b/i, label:'weighted chin-up / pull-up' },
  { id:'weighted_dip', goal:/\bweighted dip\b/i, current:/\bweighted dip\b/i, label:'weighted dip' },
  { id:'one_arm_pullup', goal:/\b(?:one[- ]arm pull[- ]?up|oap)\b/i, current:/\b(?:one[- ]arm pull[- ]?up|oap)\b/i, label:'one-arm pull-up', always_baseline:true },
  { id:'planche', goal:/\bplanche\b/i, current:/\bplanche\b/i, label:'planche progression / hold', always_baseline:true },
  { id:'front_lever', goal:/\bfront lever\b/i, current:/\bfront lever\b/i, label:'front lever progression / hold', always_baseline:true },
  { id:'handstand_pushup', goal:/\b(?:handstand push[- ]?up|hspu)\b/i, current:/\b(?:handstand push[- ]?up|hspu)\b/i, label:'handstand push-up progression', always_baseline:true },
  { id:'bar_muscle_up', goal:/\bbar muscle[- ]?up\b/i, current:/\bbar muscle[- ]?up\b/i, label:'bar muscle-up', always_baseline:true },
  { id:'handstand', goal:/\b(?:free[- ]?standing|freestanding)?\s*handstand\b/i, current:/\bhandstand\b/i, label:'freestanding handstand / current handstand progression', always_baseline:true },
  { id:'muscle_up', goal:/\bmuscle[- ]?up\b/i, current:/\bmuscle[- ]?up\b/i, label:'muscle-up', always_baseline:true },
];

function looksQuantifiedGoal(s) {
  return /\d|\b(?:1rm|max|rep|reps|kg|lb|time|pace|seconds?|minutes?)\b/i.test(String(s || ''));
}
function goalStatesBaselineAndTarget(s) {
  const raw = String(s || '');
  return /(?:\bfrom\b[\s\S]{0,80}\bto\b|(?:-|=)>|→)/i.test(raw);
}

function addQuestion(out, intake, q) {
  if (out.length >= 4 || answered(intake, q.id) || out.some(x => x.id === q.id)) return;
  out.push({ answer_type:'text', required:true, ...q });
}

// Whether anything actually blocks the build. An optional question is worth
// asking while the athlete is already answering something, and is never worth
// stopping a build over.
export function requiredClarifications(questions) {
  return (questions || []).filter(q => q.required !== false);
}

export function detectIntakeClarifications(intake = {}) {
  const out = [];
  const goals = goalText(intake);
  const current = currentText(intake);
  const pain = painText(intake);
  const rawGoals = text([intake?.primary_goals, intake?.secondary_goals]);
  const hasBarMuscleUpGoal = /\bbar muscle[- ]?up\b/i.test(goals);

  // Quantified outcomes need a current anchor. Advanced skill goals also need a
  // baseline even when written qualitatively (for example "first bar muscle-up"
  // or "freestanding handstand") because the useful progression depends on the
  // athlete's present rung, not just the destination.
  for (const mv of MOVEMENTS) {
    // "bar muscle-up" is a strict subtype of the generic muscle-up pattern.
    // Once the bar-specific goal exists, generic muscle-up must never create a
    // duplicate question in the same OR a later clarification round.
    if (mv.id === 'muscle_up' && hasBarMuscleUpGoal) continue;
    if (!mv.goal.test(goals) || mv.current.test(current) || answered(intake, `benchmark_${mv.id}`)) continue;
    const matchedGoal = rawGoals.split('|').find(x => mv.goal.test(x)) || rawGoals;
    if ((!mv.always_baseline && !looksQuantifiedGoal(matchedGoal)) || goalStatesBaselineAndTarget(matchedGoal)) continue;
    addQuestion(out, intake, {
      id:`benchmark_${mv.id}`,
      prompt:`What is your current best recent performance for ${mv.label}?`,
      help:'Give the most useful current progression, set, max, reps or hold you can perform with clean technique. If the goal is a skill you cannot do yet, state the closest version you can currently perform.',
    });
  }

  // Named endurance-event goals need a current performance anchor before the
  // engine can make pace/power progression decisions. A goal written explicitly
  // as "from X to Y" or "X -> Y" already contains the baseline and target.
  const enduranceEvents = [
    { id:'running_event', goal:/\b(?:mile|3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|running (?:time|pace|performance))\b/i, current:/\b(?:mile|3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|run(?:ning)?)\b/i, label:'your target running event' },
    { id:'rowing_event', goal:/\b(?:500\s*m|1\s*k|2\s*k|5\s*k)?\s*(?:row|rowing|rower|erg)\b/i, current:/\b(?:row|rowing|rower|erg|concept ?2)\b/i, label:'your rowing event/test' },
    { id:'cycling_event', goal:/\b(?:cycling|cyclist|bike time trial|criterium|ftp)\b/i, current:/\b(?:cycling|bike|ftp|watts?|w\b)\b/i, label:'your cycling event/test' },
    { id:'swimming_event', goal:/\b(?:swim|swimming|freestyle|pool time)\b/i, current:/\b(?:swim|swimming|freestyle|pool)\b/i, label:'your swimming event/test' },
  ];
  for (const ev of enduranceEvents) {
    const matchedGoal = rawGoals.split('|').find(x => ev.goal.test(x)) || '';
    if (ev.goal.test(goals) && !ev.current.test(current) && !goalStatesBaselineAndTarget(matchedGoal)) {
      addQuestion(out, intake, {
        id:`benchmark_${ev.id}`,
        prompt:`What is your current recent performance for ${ev.label}?`,
        help:'Give a recent time, pace, power or distance result. If you have no recent test, say that explicitly.',
      });
    }
  }

  // Running event progression changes materially with present running exposure.
  // A running goal is not the only reason this matters. An athlete with a
  // history of running-related overuse needs the same answer before anyone
  // prescribes Week-1 running volume, because the safe starting dose is
  // defined by what they are currently tolerating and by nothing else.
  const overuseHistory = /\bshin split|shin splint|stress (?:fracture|reaction)|plantar|achilles|\bitb\b|it band|runner'?s knee|periostitis|tendinopathy/i
    .test(text([intake?.injuries, intake?.pain, intake?.notes]));
  const runningGoal = /\b(?:3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|running (?:time|pace|performance))\b/i.test(goals);
  if (runningGoal || (overuseHistory && /\brun|jog|ruck\b/i.test(`${goals} ${text([intake?.notes])}`))) {
    // current_numbers and performance_markers are where an athlete actually
    // writes "2 runs per week, about 14 km total" -- the running-benchmark box
    // is the obvious place to put it. Reading only notes and clarifications
    // meant asking again for something already on the form.
    const exposureText = text([
      intake?.notes, intake?.sport, intake?.sport_schedule, intake?.clarification_answers,
      intake?.current_numbers, intake?.performance_markers,
    ]).toLowerCase();
    if (!/(?:\b\d+(?:\.\d+)?\s*km\b|\b\d+\s*(?:runs?|running sessions?)\b|weekly mileage|weekly kilometres|weekly kilometers|km\/week|runs?\/week)/i.test(exposureText)) {
      addQuestion(out, intake, {
        id:'running_current_exposure',
        prompt:'What does your current running look like in a normal week?',
        help:'Approximate sessions per week and/or weekly distance is enough. Mention your longest recent run if the goal is a half marathon or marathon.',
      });
    }
  }

  // Concurrent sport scheduling affects placement. Do not invent hard/easy days.
  const sport = text(intake?.sport).toLowerCase();
  if (/(?:bjj|jiu|mma|wrestl|boxing|kickbox|combat|football|soccer|rugby|basketball|sport)/i.test(sport) && (!Array.isArray(intake?.sport_schedule) || intake.sport_schedule.length === 0)) {
    addQuestion(out, intake, {
      id:'sport_week_structure',
      prompt:'Which days do you normally do your sport, and which of those sessions are hard, moderate or light?',
      help:'A simple answer such as "Mon hard BJJ, Wed technical, Fri hard BJJ" is enough.',
    });
  }

  // Injury/pain only triggers clarification when it intersects a named goal and
  // the intake does not already identify the aggravating feature or tolerated ROM/variation.
  const toleranceDetail = /(deep|depth|parallel|range|\brom\b|heavy|load|volume|fatigue|technique|flexion|extension|butt wink|tolerat|comfortable|pain[- ]?free|box squat|reduced range|partial)/i;
  if (/(?:low[- ]back|lower[- ]back|lumbar|sciatica)/i.test(pain) && /(?:squat|deadlift|rdl|hinge)/i.test(goals) && !toleranceDetail.test(pain)) {
    addQuestion(out, intake, {
      id:'lumbar_goal_movement_tolerance',
      prompt:'For the squat/deadlift pattern connected to your goal, what specifically aggravates the lower back and what is currently tolerated?',
      help:'For example: deep ROM, heavy loading, high volume, fatigue/technique breakdown, or all versions. Mention whether reduced depth, box squat, RDL, split squat or another close variation is comfortable.',
    });
  }
  if (/(?:knee|patellar)/i.test(pain) && /(?:squat|run|running|jump|lunge)/i.test(goals) && !toleranceDetail.test(pain)) {
    addQuestion(out, intake, {
      id:'knee_goal_movement_tolerance',
      prompt:'Which range, loading or version of the goal movement aggravates the knee, and which close variations are currently comfortable?',
      help:'Include whether symptoms change with depth, speed, impact, heavier load or higher volume.',
    });
  }
  if (/(?:shoulder|elbow|biceps|triceps)/i.test(pain) && /(?:press|bench|dip|pull|chin|row|handstand|planche)/i.test(goals) && !toleranceDetail.test(pain)) {
    addQuestion(out, intake, {
      id:'upper_body_goal_movement_tolerance',
      prompt:'Which part of the goal movement aggravates the upper-body issue, and which close variations/ranges are currently comfortable?',
      help:'Mention grip, ROM, load, volume or specific exercise variations if you know them.',
    });
  }

  // Limited-equipment weighted goals need the actual load ceiling when it
  // materially changes how progression can be written. Commercial/full gyms do
  // not need this question; park/home/limited setups do when no numeric ceiling
  // has been supplied.
  const equipment=text([intake?.equipment,intake?.training_location,intake?.notes]).toLowerCase();
  const limitedSetup=/(?:park|home|limited|minimal|rings|pull[- ]?up bar|weight(?:ed)? belt|plates? only|outdoor)/i.test(equipment) && !/(?:commercial gym|full gym|fully equipped)/i.test(equipment);
  const weightedGoal=/\b(?:weighted (?:chin|pull)[- ]?up|weighted dip|belt load|added load)\b/i.test(goals);
  const numericCeiling=/(?:up to|max(?:imum)?|ceiling|available)[^.!]{0,25}\d+(?:\.\d+)?\s*(?:kg|lb)|\d+(?:\.\d+)?\s*(?:kg|lb)[^.!]{0,25}(?:available|max|plates?|belt)/i.test(equipment);
  if(limitedSetup && weightedGoal && !numericCeiling) {
    addQuestion(out,intake,{
      id:'equipment_load_ceiling',
      prompt:'What is the maximum external load you can actually add with your current setup?',
      help:'For example: weighted belt with up to 25 kg of plates. If there is no practical ceiling, say that.',
    });
  }

  return out;
}

// Questions worth asking while the athlete is already answering something, and
// never worth stopping a build over. detectIntakeClarifications above returns
// only what blocks; these are added alongside it, are marked optional, and are
// ignored by the gate. Each exists because a rule is switched off entirely
// without its answer -- not merely weakened -- but none of them is worth a round
// trip of its own, and a session length of "coach decides" is a real answer
// rather than a gap.
export function addOptionalQuestions(out, intake = {}) {
  if (!out.length) return out;
  const goals = goalText(intake);

  // Without a session ceiling the engine cannot judge whether a session fits the
  // athlete's evening at all: the duration check is switched off entirely rather
  // than merely relaxed, and a coach reviewing a live program raised session
  // length as a problem the engine had reported nothing about.
  const statedBudget = text([intake?.session_length, intake?.session_duration_minutes, intake?.time_per_session]);
  if (!/\d/.test(statedBudget)) {
    addQuestion(out, intake, {
      id:'session_time_budget',
      required:false,
      prompt:'How long can a normal training session run, door to door?',
      help:'A range is fine, for example "about 60 minutes" or "45-70 minutes". This is treated as a ceiling, not a target to fill.',
    });
  }

  // Bodyweight decides what a calisthenics benchmark means. "+80 kg weighted
  // chin-up" and "one-arm pull-up" describe very different athletes at 65 kg
  // and at 95 kg, and every relative-strength judgement is blind without it.
  const bodyweightGiven = /\b(?:bodyweight|body weight|bw)\b[^\n]{0,20}\d+\s*(?:kg|lb)/i.test(
    text([intake?.current_numbers, intake?.notes, intake?.clarification_answers]),
  ) || bodyweightKg(intake) != null;
  const relativeStrengthGoal = /\b(?:one[- ]arm|muscle[- ]?up|handstand|planche|lever|pull[- ]?up|chin[- ]?up|dip|calisthenic|bodyweight)\b/i.test(goals);
  if (relativeStrengthGoal && !bodyweightGiven) {
    addQuestion(out, intake, {
      id:'bodyweight',
      required:false,
      prompt:'What is your current bodyweight?',
      help:'Bodyweight is what turns a calisthenics number into a level: the same weighted pull-up means something different at 65 kg and at 95 kg.',
    });
  }

  addQuestion(out, intake, {
    id: 'adherence_exclusions',
    required: false,
    prompt: 'Are there any exercises you know you will not do, or have consistently skipped before?',
    help: 'Optional. Name them and say why if you like - too boring, no access, previous niggle, or simply never done. Anything listed here will not be programmed as an accessory.',
  });
  return out;
}

export function intakeClarificationResult(intake = {}) {
  const questions = addOptionalQuestions(detectIntakeClarifications(intake), intake);
  return { ready: requiredClarifications(questions).length === 0, questions };
}
