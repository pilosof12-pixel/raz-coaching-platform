// Distilled, paraphrased decision rules from Steven Low's Overcoming Gravity.
// This is an implementation layer for Phase 15 gymnastics/bodyweight goals,
// not a reproduction of the source text.

const FAMILY_RULES = {
  planche: [
    'Planche: anchor work at the athlete\'s demonstrated clean rung. Do not regress a clean Advanced Tuck/Straddle athlete to Planche Lean or Tuck except as low-cost warm-up/back-off.',
    'Planche quality: locked elbows, strong scapular protraction, controlled shoulder position and rigid pelvis/body line. Stop before position degrades.',
    'Primary Planche goal: normally use at least two weekly specific exposures when recovery permits. One may bias harder intensity/shorter holds and another slightly easier accumulated-quality volume.'
  ],
  front_lever: [
    'Front Lever: direct holds/pulls at or near demonstrated level are the anchor. Pull-ups, rows and weighted pulling build reserve strength but do not replace direct lever practice.',
    'Use cleaner/easier lever rungs for additional volume only when they preserve the target shape and do not displace the harder direct exposure.'
  ],
  one_arm_pull_up: [
    'One-Arm Pull-up/Chin-up: once full concentric reps are owned, direct unilateral concentric work is highest-specificity. Assisted reps add clean volume; weighted bilateral pulling is support strength.',
    'Eccentrics are primarily a bridge before full concentric ownership and should not replace direct concentric work once multiple strict reps are demonstrated.'
  ],
  hspu: [
    'Handstand/HSPU: separate balance skill from pressing strength. Freestanding goals require direct free-balance practice; wall HSPU and overhead pressing can build strength reserve but are not equivalent skill exposures.',
    'Protect high-quality balance/skill work from fatigue by placing it early and stopping before technical breakdown.'
  ],
  handstand: [
    'Handstand: treat balance as a practiced skill, not merely a strength prerequisite. Use frequent high-quality practice while fresh and preserve demonstrated ability rather than restarting from easier wall work.'
  ],
  human_flag: [
    'Human Flag: direct side-specific flag holds/controlled transitions at the demonstrated rung are required for a primary flag goal. Pulling, pressing, carries and trunk work support but do not replace direct flag practice.'
  ],
  muscle_up: [
    'Muscle-up: preserve direct transition/skill exposure when the athlete can already perform a meaningful version. Pulling, dipping and false-grip strength are support qualities, not replacements for direct transition practice.'
  ]
};

export function overcomingGravityRulesForFamily(family) {
  const common = [
    'OVERCOMING GRAVITY FRAMEWORK: demonstrated clean ability controls the starting level. Progression charts are maps, not reasons to regress an athlete who already owns a harder variation.',
    'Competency heuristics: roughly 6 seconds of clean control is meaningful evidence for a static rung; roughly 3 clean repetitions is meaningful evidence for a dynamic rung. These are coaching heuristics, not universal pass/fail gates.',
    'Exercise order: warm-up/position prep -> skill/technique while fresh -> difficult strength/isometrics/eccentrics/concentrics -> conditioning if required -> low-cost prehab/mobility/accessories.',
    'Quality rule: stop skill sets before technical breakdown. Most difficult strength work stays short of technical failure so enough clean volume can accumulate.',
    'Advanced programming: vary difficulty, reps/hold duration or volume across exposures when useful instead of forcing identical work every day. A harder low-volume exposure plus a slightly easier volume exposure is valid.',
    'Support rule: easier progressions, weighted basics, antagonist work and structural-balance accessories can support the target but do not replace direct practice once the athlete can perform a measurable version.',
    'Concurrent-sport rule: judge gymnastics dose against the whole training week. Reduce secondary volume before reducing primary skill quality when sport stress is high.',
    'GPP rule: small doses of trunk, carry, neck, elbow/arm, scapular or local hypertrophy work are legitimate when they address a sport need, weak link or robustness goal and there is real time/recovery headroom. They are first to be cut when primary work or sport recovery suffers.'
  ];
  return [...common, ...(FAMILY_RULES[family] || [])];
}

export function overcomingGravityCompetencyText() {
  return 'Static competency ~6s clean; dynamic competency ~3 clean reps; controlled eccentrics are bridges when full concentric skill is not yet owned. Use demonstrated technique, pain and recovery to override simplistic thresholds.';
}
