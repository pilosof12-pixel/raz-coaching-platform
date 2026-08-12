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
  { id:'one_arm_pullup', goal:/\b(?:one[- ]arm pull[- ]?up|oap)\b/i, current:/\b(?:one[- ]arm pull[- ]?up|oap)\b/i, label:'one-arm pull-up' },
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

export function detectIntakeClarifications(intake = {}) {
  const out = [];
  const goals = goalText(intake);
  const current = currentText(intake);
  const pain = painText(intake);
  const rawGoals = text([intake?.primary_goals, intake?.secondary_goals]);

  // A quantified strength/skill outcome needs a current anchor for that same
  // movement family. We ask rather than infer a load from a related variation.
  for (const mv of MOVEMENTS) {
    if (!mv.goal.test(goals) || mv.current.test(current) || answered(intake, `benchmark_${mv.id}`)) continue;
    const matchedGoal = rawGoals.split('|').find(x => mv.goal.test(x)) || rawGoals;
    if (!looksQuantifiedGoal(matchedGoal) || goalStatesBaselineAndTarget(matchedGoal)) continue;
    addQuestion(out, intake, {
      id:`benchmark_${mv.id}`,
      prompt:`What is your current best recent performance for ${mv.label}?`,
      help:'Give the most useful recent set, max, added load, reps or hold that you can perform with clean technique. If you do not know, write "unknown".',
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
  if (/\b(?:3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|running (?:time|pace|performance))\b/i.test(goals)) {
    const exposureText = text([intake?.notes, intake?.sport, intake?.sport_schedule, intake?.clarification_answers]).toLowerCase();
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
  if (/(?:low back|lower back|lumbar|sciatica)/i.test(pain) && /(?:squat|deadlift|rdl|hinge)/i.test(goals) && !toleranceDetail.test(pain)) {
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

  return out;
}

export function intakeClarificationResult(intake = {}) {
  const questions = detectIntakeClarifications(intake);
  return { ready: questions.length === 0, questions };
}
