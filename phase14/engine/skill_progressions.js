// engine/skill_progressions.js
//
// Engine v20 — Elite Skill Progression System.
//
// A data-driven skill graph for advanced calisthenics goals. Each family encodes
// its goal, required/optional equipment, hard prerequisites, and an ordered set
// of rungs (beginner -> goal). Every rung carries a working-set `dose` and
// optional `complementary` accessory work, plus a `criterion` describing the
// standard that, once met, promotes the athlete to the next rung.
//
// This module is dependency-free (no server, no dictionary import) so it can be
// consumed by both server.js and exercise_dictionary.js (which hosts the
// validator) without creating an import cycle, and unit-tested directly.
//
// Exports:
//   - SKILL_PROGRESSIONS      Map<family, skillObject>
//   - SKILL_TSV_COLUMNS       canonical 9-column TSV order
//   - getGoalFamily(str)      fuzzy goal-string -> family key (EN + Hebrew)
//   - parseSkillBenchmarks(intake)   current_numbers -> benchmark object
//   - selectRungForSkill(family, benchmarks, intake) -> selection / gate result
//   - renderSkillWorkForRung(rung, intake, day) -> array of TSV row cell-arrays

// ---------------------------------------------------------------------------
// Canonical TSV column order (mirrors the engine machine block).
// ---------------------------------------------------------------------------
export const SKILL_TSV_COLUMNS = [
  "Day", "Exercise", "Weight", "Sets", "Reps", "Rest", "Target RPE", "Notes", "Results",
];

// ---------------------------------------------------------------------------
// Skill family definitions.
// ---------------------------------------------------------------------------
const FAMILIES = [
  // ---- PLANCHE ---------------------------------------------------------
  {
    goal: "Full Planche", family: "planche", category: "static_pushing",
    required_equipment: ["floor"], optional_equipment: ["parallelettes", "rings"],
    prerequisites: [
      { type: "benchmark", metric: "pseudo_planche_push_up", min: 8, label: "8+ pseudo planche push-ups" },
      { type: "training_age_years", min: 2, label: "2+ years training" },
    ],
    rungs: [
      { name: "Planche Lean", criterion: { type: "hold_seconds", metric: "planche_lean_hold_s", min: 20, quality: "shoulders_over_wrists" }, dose: { sets: 4, reps: "10-20s", rest: "90s", rir: "1-2", frequency_per_week: 3 }, complementary: ["Pseudo Planche Push-up", "Wrist Prep"] },
      { name: "Tuck Planche", criterion: { type: "hold_seconds", metric: "tuck_planche_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "2 min", rir: "1", frequency_per_week: 2 }, complementary: ["Pseudo Planche Push-up"] },
      { name: "Advanced Tuck Planche", criterion: { type: "hold_seconds", metric: "adv_tuck_planche_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "2 min", rir: "1", frequency_per_week: 2 }, complementary: ["Planche Push-up"] },
      { name: "Straddle Planche", criterion: { type: "hold_seconds", metric: "straddle_planche_hold_s", min: 15 }, dose: { sets: 5, reps: "5-10s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Straddle Planche Push-up"] },
      { name: "Half-Lay Planche", criterion: { type: "hold_seconds", metric: "half_lay_planche_hold_s", min: 5 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Full Planche", criterion: { type: "hold_seconds", metric: "full_planche_hold_s", min: 3 }, dose: { sets: 5, reps: "2-5s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- FRONT LEVER -----------------------------------------------------
  {
    goal: "Full Front Lever", family: "front_lever", category: "static_pulling",
    required_equipment: ["pull_up_bar", "rings"], optional_equipment: ["rings"],
    prerequisites: [
      { type: "benchmark", metric: "pull_ups", min: 8, label: "8+ strict pull-ups" },
    ],
    rungs: [
      { name: "Tuck Front Lever", criterion: { type: "hold_seconds", metric: "tuck_front_lever_hold_s", min: 20 }, dose: { sets: 4, reps: "10-20s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Scapular Pull-up", "Front Lever Raise"] },
      { name: "Advanced Tuck Front Lever", criterion: { type: "hold_seconds", metric: "adv_tuck_front_lever_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Front Lever Raise"] },
      { name: "Single-Leg Front Lever", criterion: { type: "hold_seconds", metric: "single_leg_front_lever_hold_s", min: 10 }, dose: { sets: 4, reps: "5-10s", rest: "2-3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Front Lever Pull"] },
      { name: "Straddle Front Lever", criterion: { type: "hold_seconds", metric: "straddle_front_lever_hold_s", min: 10 }, dose: { sets: 5, reps: "5-10s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Front Lever Pull"] },
      { name: "Half-Lay Front Lever", criterion: { type: "hold_seconds", metric: "half_lay_front_lever_hold_s", min: 5 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Full Front Lever", criterion: { type: "hold_seconds", metric: "full_front_lever_hold_s", min: 5 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- BACK LEVER ------------------------------------------------------
  {
    goal: "Full Back Lever", family: "back_lever", category: "static_pulling",
    required_equipment: ["rings", "pull_up_bar"], optional_equipment: ["rings"],
    prerequisites: [
      { type: "benchmark", metric: "pull_ups", min: 8, label: "8+ strict pull-ups" },
    ],
    rungs: [
      { name: "German Hang", criterion: { type: "hold_seconds", metric: "german_hang_hold_s", min: 30 }, dose: { sets: 3, reps: "20-30s", rest: "90s", rir: "1-2", frequency_per_week: 3 }, complementary: ["Skin the Cat"] },
      { name: "Tuck Back Lever", criterion: { type: "hold_seconds", metric: "tuck_back_lever_hold_s", min: 20 }, dose: { sets: 4, reps: "10-20s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Skin the Cat"] },
      { name: "Advanced Tuck Back Lever", criterion: { type: "hold_seconds", metric: "adv_tuck_back_lever_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "2 min", rir: "1", frequency_per_week: 2 }, complementary: [] },
      { name: "Straddle Back Lever", criterion: { type: "hold_seconds", metric: "straddle_back_lever_hold_s", min: 10 }, dose: { sets: 5, reps: "5-10s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: [] },
      { name: "Full Back Lever", criterion: { type: "hold_seconds", metric: "back_lever_hold_s", min: 5 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- HUMAN FLAG ------------------------------------------------------
  {
    goal: "Full Human Flag", family: "human_flag", category: "static_pulling",
    required_equipment: ["pull_up_bar"], optional_equipment: ["parallel_bars"],
    prerequisites: [
      { type: "benchmark", metric: "pull_ups", min: 15, label: "15+ strict pull-ups" },
      { type: "benchmark", metric: "dips", min: 20, label: "20+ controlled dips" },
      { type: "benchmark", metric: "side_plank_hold_s", min: 30, label: "30s straight-arm side plank" },
    ],
    rungs: [
      { name: "Side Plank", criterion: { type: "hold_seconds", metric: "side_plank_hold_s", min: 45 }, dose: { sets: 3, reps: "30-45s", rest: "60s", rir: "1-2", frequency_per_week: 3 }, complementary: ["Side Plank Hip Dip"] },
      { name: "Vertical Pull to Tuck", criterion: { type: "hold_seconds", metric: "vertical_tuck_flag_hold_s", min: 10 }, dose: { sets: 4, reps: "5-10s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Side Plank Hip Dip"] },
      { name: "Tuck Human Flag", criterion: { type: "hold_seconds", metric: "tuck_human_flag_hold_s", min: 10 }, dose: { sets: 4, reps: "5-10s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: [] },
      { name: "One-Leg Tuck Human Flag", criterion: { type: "hold_seconds", metric: "one_leg_human_flag_hold_s", min: 8 }, dose: { sets: 4, reps: "5-8s", rest: "2-3 min", rir: "0-1", frequency_per_week: 2 }, complementary: [] },
      { name: "Straddle Human Flag", criterion: { type: "hold_seconds", metric: "straddle_human_flag_hold_s", min: 5 }, dose: { sets: 5, reps: "3-5s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Full Human Flag", criterion: { type: "hold_seconds", metric: "full_human_flag_hold_s", min: 3 }, dose: { sets: 5, reps: "2-5s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- IRON CROSS (HARD GATE, rings required) --------------------------
  {
    goal: "Iron Cross", family: "iron_cross", category: "static_pushing", hard_gate: true,
    required_equipment: ["rings"], optional_equipment: [],
    prerequisites: [
      { type: "training_age_years", min: 3, label: "3+ years straight-arm training" },
      { type: "benchmark", metric: "muscle_ups", min: 5, label: "5+ strict muscle-ups" },
      { type: "benchmark", metric: "weighted_pullup_bw_pct", min: 30, label: "10+ weighted pull-ups at BW+30%" },
      { type: "benchmark", metric: "straddle_l_sit_hold_s", min: 30, label: "30s straddle L-sit" },
    ],
    rungs: [
      { name: "German Hang", criterion: { type: "hold_seconds", metric: "german_hang_hold_s", min: 45 }, dose: { sets: 3, reps: "30-45s", rest: "2 min", rir: "1", frequency_per_week: 2 }, complementary: ["Skin the Cat"] },
      { name: "Skin the Cat", criterion: { type: "reps", metric: "skin_the_cat_reps", min: 8 }, dose: { sets: 3, reps: "5-8", rest: "2 min", rir: "1", frequency_per_week: 2 }, complementary: ["German Hang"] },
      { name: "Straddle L Ring Support", criterion: { type: "hold_seconds", metric: "straddle_l_ring_support_hold_s", min: 20 }, dose: { sets: 4, reps: "10-20s", rest: "2-3 min", rir: "1", frequency_per_week: 2 }, complementary: ["Ring Support Hold"] },
      { name: "Bulgarian Dip Hold", criterion: { type: "hold_seconds", metric: "bulgarian_dip_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Ring Support Hold"] },
      { name: "Assisted Iron Cross (band)", criterion: { type: "hold_seconds", metric: "assisted_iron_cross_hold_s", min: 10 }, dose: { sets: 5, reps: "5-10s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Bulgarian Dip Hold"] },
      { name: "Iron Cross Negative", criterion: { type: "seconds_lower", metric: "iron_cross_negative_s", min: 5 }, dose: { sets: 5, reps: "3-5s lower", rest: "3-4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Iron Cross Hold", criterion: { type: "hold_seconds", metric: "iron_cross_hold_s", min: 3 }, dose: { sets: 5, reps: "2-5s", rest: "4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- MALTESE (HARD GATE) --------------------------------------------
  {
    goal: "Maltese", family: "maltese", category: "static_pushing", hard_gate: true,
    required_equipment: ["rings"], optional_equipment: ["parallelettes"],
    prerequisites: [
      { type: "training_age_years", min: 3, label: "3+ years straight-arm training" },
      { type: "benchmark", metric: "straddle_planche_hold_s", min: 5, label: "programmable Straddle Planche (5s+)" },
    ],
    rungs: [
      { name: "Ring Straddle Planche", criterion: { type: "hold_seconds", metric: "ring_straddle_planche_hold_s", min: 8 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Straddle Planche"] },
      { name: "Maltese Lean (Rings)", criterion: { type: "hold_seconds", metric: "maltese_lean_hold_s", min: 10 }, dose: { sets: 5, reps: "5-10s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: [] },
      { name: "Assisted Maltese (band)", criterion: { type: "hold_seconds", metric: "assisted_maltese_hold_s", min: 8 }, dose: { sets: 5, reps: "3-8s", rest: "3-4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Maltese Negative", criterion: { type: "seconds_lower", metric: "maltese_negative_s", min: 4 }, dose: { sets: 5, reps: "3-4s lower", rest: "4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Straddle Maltese", criterion: { type: "hold_seconds", metric: "straddle_maltese_hold_s", min: 3 }, dose: { sets: 5, reps: "2-4s", rest: "4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Maltese", criterion: { type: "hold_seconds", metric: "maltese_hold_s", min: 2 }, dose: { sets: 5, reps: "1-3s", rest: "4-5 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- VICTORIAN (HARD GATE) ------------------------------------------
  {
    goal: "Victorian", family: "victorian", category: "static_pulling", hard_gate: true,
    required_equipment: ["rings"], optional_equipment: [],
    prerequisites: [
      { type: "training_age_years", min: 4, label: "4+ years straight-arm training" },
      { type: "benchmark", metric: "back_lever_hold_s", min: 15, label: "15s full Back Lever" },
      { type: "benchmark", metric: "muscle_ups", min: 5, label: "5+ strict muscle-ups" },
    ],
    rungs: [
      { name: "Full Back Lever (rings)", criterion: { type: "hold_seconds", metric: "ring_back_lever_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Skin the Cat"] },
      { name: "Victorian Lean", criterion: { type: "hold_seconds", metric: "victorian_lean_hold_s", min: 8 }, dose: { sets: 5, reps: "3-8s", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: [] },
      { name: "Tuck Victorian", criterion: { type: "hold_seconds", metric: "tuck_victorian_hold_s", min: 8 }, dose: { sets: 5, reps: "3-8s", rest: "3-4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Assisted Victorian (band)", criterion: { type: "hold_seconds", metric: "assisted_victorian_hold_s", min: 6 }, dose: { sets: 5, reps: "3-6s", rest: "4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Victorian Negative", criterion: { type: "seconds_lower", metric: "victorian_negative_s", min: 4 }, dose: { sets: 5, reps: "3-4s lower", rest: "4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Victorian", criterion: { type: "hold_seconds", metric: "victorian_hold_s", min: 2 }, dose: { sets: 5, reps: "1-3s", rest: "4-5 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- MANNA -----------------------------------------------------------
  {
    goal: "Manna", family: "manna", category: "pressing",
    required_equipment: ["floor"], optional_equipment: ["parallelettes", "pull_up_bar"],
    prerequisites: [
      { type: "benchmark", metric: "l_sit_hold_s", min: 20, label: "20s L-sit" },
    ],
    rungs: [
      { name: "L-Sit", criterion: { type: "hold_seconds", metric: "l_sit_hold_s", min: 30 }, dose: { sets: 4, reps: "15-30s", rest: "90s", rir: "1", frequency_per_week: 3 }, complementary: ["Compression Work"] },
      { name: "V-Sit", criterion: { type: "hold_seconds", metric: "v_sit_hold_s", min: 15 }, dose: { sets: 4, reps: "8-15s", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Compression Work"] },
      { name: "High V-Sit", criterion: { type: "hold_seconds", metric: "high_v_sit_hold_s", min: 10 }, dose: { sets: 5, reps: "5-10s", rest: "2-3 min", rir: "0-1", frequency_per_week: 2 }, complementary: [] },
      { name: "Manna Negative", criterion: { type: "seconds_lower", metric: "manna_negative_s", min: 5 }, dose: { sets: 5, reps: "3-5s lower", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "Manna", criterion: { type: "hold_seconds", metric: "manna_hold_s", min: 2 }, dose: { sets: 5, reps: "2-5s", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- HSPU ------------------------------------------------------------
  {
    goal: "Freestanding 90-Degree Handstand Push-up", family: "hspu", category: "vertical_push",
    required_equipment: ["wall", "floor"], optional_equipment: ["parallelettes"],
    prerequisites: [
      { type: "benchmark", metric: "pike_push_up", min: 8, label: "8+ pike push-ups" },
    ],
    rungs: [
      { name: "Pike Push-Up", criterion: { type: "reps", metric: "pike_push_up", min: 12 }, dose: { sets: 4, reps: "8-12", rest: "90s", rir: "1-2", frequency_per_week: 3 }, complementary: ["Wall Handstand Hold"] },
      { name: "Elevated Pike Push-up", criterion: { type: "reps", metric: "elevated_pike_push_up", min: 10 }, dose: { sets: 4, reps: "6-10", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: ["Wall Handstand Hold"] },
      { name: "Back-to-Wall Handstand Push-Up", criterion: { type: "reps", metric: "back_to_wall_hspu", min: 8 }, dose: { sets: 4, reps: "4-8", rest: "2-3 min", rir: "1", frequency_per_week: 2 }, complementary: ["Freestanding Handstand Hold"] },
      { name: "Belly-to-Wall Handstand Push-Up", criterion: { type: "reps", metric: "belly_to_wall_hspu", min: 7 }, dose: { sets: 4, reps: "3-7", rest: "3 min", rir: "1", frequency_per_week: 2 }, complementary: ["Freestanding Handstand Hold"] },
      { name: "Deficit Handstand Push-Up", criterion: { type: "reps", metric: "deficit_wall_hspu", min: 5 }, dose: { sets: 4, reps: "3-5", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Freestanding Handstand Hold"] },
      { name: "Freestanding Handstand Push-up Negative", criterion: { type: "reps", metric: "freestanding_hspu_negative", min: 4 }, dose: { sets: 4, reps: "2-4", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Freestanding Handstand Hold"] },
      { name: "Freestanding Handstand Push-Up", criterion: { type: "reps", metric: "freestanding_hspu", min: 3 }, dose: { sets: 5, reps: "1-3", rest: "3-4 min", rir: "0", frequency_per_week: 2 }, complementary: ["Deficit Handstand Push-Up"] },
      { name: "90-Degree Handstand Push-Up", criterion: { type: "reps", metric: "freestanding_90_hspu", min: 1 }, dose: { sets: 4, reps: "1-2", rest: "4 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Deficit Handstand Push-Up", "Freestanding Handstand Hold"] },
    ],
  },
  // ---- ONE-ARM PULL-UP -------------------------------------------------
  {
    goal: "One-Arm Pull-Up", family: "one_arm_pull_up", category: "vertical_pull",
    required_equipment: ["pull_up_bar"], optional_equipment: ["bands", "rings"],
    prerequisites: [
      { type: "benchmark", metric: "pull_ups", min: 12, label: "12+ strict pull-ups" },
      { type: "benchmark", metric: "weighted_pullup_bw_pct", min: 30, label: "weighted pull-up at BW+30%" },
    ],
    rungs: [
      { name: "Weighted Pull-Up", criterion: { type: "benchmark", metric: "weighted_pullup_bw_pct", min: 50 }, dose: { sets: 5, reps: "3-5", rest: "3 min", rir: "1", frequency_per_week: 2 }, complementary: ["Scapular Pull-up"] },
      { name: "Archer Pull-Up", criterion: { type: "reps", metric: "archer_pull_up", min: 5 }, dose: { sets: 4, reps: "3-5/side", rest: "2-3 min", rir: "1", frequency_per_week: 3 }, complementary: ["Weighted Pull-Up"] },
      { name: "Typewriter Pull-Up", criterion: { type: "reps", metric: "typewriter_pull_up", min: 4 }, dose: { sets: 4, reps: "3-4/side", rest: "2-3 min", rir: "1", frequency_per_week: 3 }, complementary: ["Archer Pull-Up"] },
      { name: "Band-Assisted One-Arm Pull-up", criterion: { type: "reps", metric: "band_assisted_oap", min: 4 }, dose: { sets: 4, reps: "2-4/side", rest: "3 min", rir: "0-1", frequency_per_week: 3 }, complementary: ["Typewriter Pull-Up"] },
      { name: "One-Arm Pull-up Eccentric", criterion: { type: "seconds_lower", metric: "oap_eccentric_s", min: 8 }, dose: { sets: 5, reps: "3-5s lower/side", rest: "3 min", rir: "0-1", frequency_per_week: 2 }, complementary: ["Band-Assisted One-Arm Pull-up"] },
      { name: "One-Arm Pull-up Partial", criterion: { type: "reps", metric: "oap_partial", min: 3 }, dose: { sets: 5, reps: "1-3/side", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "One-Arm Pull-up Isometric", criterion: { type: "hold_seconds", metric: "oap_isometric_s", min: 5 }, dose: { sets: 5, reps: "3-5s/side", rest: "3 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
      { name: "One-Arm Pull-Up", criterion: { type: "reps", metric: "one_arm_pull_up", min: 1 }, dose: { sets: 5, reps: "1-2/side", rest: "3-4 min", rir: "0", frequency_per_week: 2 }, complementary: [] },
    ],
  },
  // ---- ONE-ARM HANDSTAND ----------------------------------------------
  {
    goal: "Freestanding One-Arm Handstand", family: "one_arm_handstand", category: "vertical_push",
    required_equipment: ["wall", "floor"], optional_equipment: [],
    prerequisites: [
      { type: "benchmark", metric: "freestanding_handstand_hold_s", min: 30, label: "30s freestanding handstand hold" },
    ],
    rungs: [
      { name: "Freestanding Handstand Hold", criterion: { type: "hold_seconds", metric: "freestanding_handstand_hold_s", min: 60 }, dose: { sets: 5, reps: "30-60s", rest: "2 min", rir: "1", frequency_per_week: 4 }, complementary: ["Handstand Weight Shifts"] },
      { name: "Handstand Weight Shifts", criterion: { type: "reps", metric: "hs_weight_shifts", min: 10 }, dose: { sets: 4, reps: "8-10/side", rest: "2 min", rir: "1", frequency_per_week: 4 }, complementary: [] },
      { name: "Handstand Fingertip Shifts", criterion: { type: "reps", metric: "hs_fingertip_shifts", min: 8 }, dose: { sets: 4, reps: "5-8/side", rest: "2 min", rir: "1", frequency_per_week: 3 }, complementary: [] },
      { name: "Tuck One-Arm Handstand (wall)", criterion: { type: "hold_seconds", metric: "tuck_oahs_wall_s", min: 10 }, dose: { sets: 5, reps: "5-10s/side", rest: "2-3 min", rir: "0-1", frequency_per_week: 3 }, complementary: [] },
      { name: "One-Arm Handstand Wall Assisted", criterion: { type: "hold_seconds", metric: "oahs_wall_assisted_s", min: 8 }, dose: { sets: 5, reps: "5-8s/side", rest: "3 min", rir: "0-1", frequency_per_week: 3 }, complementary: [] },
      { name: "One-Arm Handstand (wall)", criterion: { type: "hold_seconds", metric: "oahs_wall_s", min: 5 }, dose: { sets: 5, reps: "3-5s/side", rest: "3 min", rir: "0", frequency_per_week: 3 }, complementary: [] },
      { name: "Freestanding One-Arm Handstand", criterion: { type: "hold_seconds", metric: "oahs_freestanding_s", min: 2 }, dose: { sets: 5, reps: "1-3s/side", rest: "3-4 min", rir: "0", frequency_per_week: 3 }, complementary: [] },
    ],
  },
  // ---- HANDSTAND WALK --------------------------------------------------
  {
    goal: "10-meter Handstand Walk", family: "handstand_walk", category: "dynamic",
    required_equipment: ["floor"], optional_equipment: ["wall"],
    prerequisites: [
      { type: "benchmark", metric: "freestanding_handstand_hold_s", min: 20, label: "20s freestanding handstand hold" },
    ],
    rungs: [
      { name: "Freestanding Handstand Hold", criterion: { type: "hold_seconds", metric: "freestanding_handstand_hold_s", min: 40 }, dose: { sets: 5, reps: "20-40s", rest: "2 min", rir: "1", frequency_per_week: 4 }, complementary: ["Wall Handstand Hold"] },
      { name: "Handstand Belly-to-Wall Walks", criterion: { type: "reps", metric: "belly_wall_walk_steps", min: 10 }, dose: { sets: 4, reps: "6-10 steps", rest: "2 min", rir: "1", frequency_per_week: 4 }, complementary: [] },
      { name: "Handstand Short Walks", criterion: { type: "reps", metric: "hs_short_walk_steps", min: 6 }, dose: { sets: 5, reps: "3-6 steps", rest: "2-3 min", rir: "0-1", frequency_per_week: 4 }, complementary: [] },
      { name: "Handstand Walk 5m", criterion: { type: "distance_m", metric: "hs_walk_m", min: 5 }, dose: { sets: 5, reps: "3-5 m", rest: "3 min", rir: "0-1", frequency_per_week: 3 }, complementary: [] },
      { name: "Handstand Walk 10m", criterion: { type: "distance_m", metric: "hs_walk_m", min: 10 }, dose: { sets: 5, reps: "8-10 m", rest: "3 min", rir: "0", frequency_per_week: 3 }, complementary: [] },
    ],
  },
];

export const SKILL_PROGRESSIONS = new Map(FAMILIES.map((f) => [f.family, f]));

// ---------------------------------------------------------------------------
// getGoalFamily — fuzzy goal-string -> family key (English + Hebrew).
// Order matters: more specific patterns first (one_arm_handstand before
// handstand_walk before hspu; the elite ring skills before generic).
// ---------------------------------------------------------------------------
const FAMILY_PATTERNS = [
  ["iron_cross", /iron\s*cross|צלב\s*ברזל/i],
  ["maltese", /maltese|מלטיז|מלטז/i],
  ["victorian", /victorian|ויקטוריאן/i],
  ["manna", /\bmanna\b|מאנה/i],
  ["one_arm_handstand", /one[-\s]?arm\s*hand\s*stand|\boahs\b|עמידת ידיים.*יד אחת|יד אחת.*עמידת ידיים/i],
  ["handstand_walk", /hand\s*stand\s*walk|\bhs\s*walk\b|הליכה על ידיים|הליכה בעמידת ידיים/i],
  ["hspu", /\bhspu\b|hand\s*stand\s*push|לחיצת עמידת ידיים|לחיצה בעמידת ידיים/i],
  ["one_arm_pull_up", /one[-\s]?arm\s*(pull|chin)|\boap\b|מתח\s*יד\s*אחת|מתח\s*ביד\s*אחת/i],
  ["front_lever", /front\s*lever|פרונט\s*לבר|מנוף\s*קדמי/i],
  ["back_lever", /back\s*lever|בק\s*לבר|מנוף\s*אחורי/i],
  ["human_flag", /human\s*flag|\bflag\b|דגל\s*אנושי|דגל/i],
  ["planche", /planche|פלאנץ|פלאנש/i],
];

export function getGoalFamily(goalString) {
  const s = String(goalString || "").trim();
  if (!s) return null;
  for (const [family, re] of FAMILY_PATTERNS) {
    if (re.test(s)) return family;
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseSkillBenchmarks — scan intake.current_numbers for skill benchmarks.
// Returns { general: {...}, <family>: {...} }. Missing metrics are absent (0).
// ---------------------------------------------------------------------------
function firstIntAfter(text, re) {
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

export function parseSkillBenchmarks(intake = {}) {
  const raw = intake.current_numbers != null
    ? (typeof intake.current_numbers === "string" ? intake.current_numbers : JSON.stringify(intake.current_numbers))
    : "";
  const t = String(raw).toLowerCase();
  const out = { general: {}, };

  // ---- General strength/skill prerequisites ----
  const g = out.general;
  g.pull_ups = firstIntAfter(t, /(\d+)\s*(?:strict\s*)?pull[-\s]?ups?/);
  g.dips = firstIntAfter(t, /(\d+)\s*(?:strict\s*)?dips?/);
  g.muscle_ups = firstIntAfter(t, /(\d+)\s*(?:strict\s*)?(?:muscle[-\s]?ups?|mu\b)/);
  g.side_plank_hold_s = firstIntAfter(t, /side\s*plank[^0-9]*(\d+)\s*s/);
  g.l_sit_hold_s = firstIntAfter(t, /(?<!straddle )l[-\s]?sit[^0-9]*(\d+)\s*s/);
  g.straddle_l_sit_hold_s = firstIntAfter(t, /straddle\s*l[-\s]?sit[^0-9]*(\d+)\s*s/);
  g.pseudo_planche_push_up = firstIntAfter(t, /pseudo\s*planche\s*push[-\s]?ups?[^0-9]*(\d+)/);
  g.pike_push_up = firstIntAfter(t, /pike\s*push[-\s]?ups?[^0-9]*(\d+)/);
  g.back_to_wall_hspu = firstIntAfter(t, /back[-\s]?to[-\s]?wall[^0-9]*(?:hand\s*stand\s*push[-\s]?ups?|hspu)[^0-9]*(\d+)/);
  g.belly_to_wall_hspu = firstIntAfter(t, /belly[-\s]?to[-\s]?wall[^0-9]*(?:hand\s*stand\s*push[-\s]?ups?|hspu)[^0-9]*(\d+)/);
  g.freestanding_handstand_hold_s = firstIntAfter(t, /(?:freestanding\s*)?hand\s*stand(?:\s*hold)?[^0-9]*(\d+)\s*s/);
  g.back_lever_hold_s = firstIntAfter(t, /(?:full\s*)?back\s*lever[^0-9]*(\d+)\s*s/);
  g.straddle_planche_hold_s = firstIntAfter(t, /straddle\s*planche[^0-9]*(\d+)\s*s/);
  // weighted pull-up as a %BW: "bw+30%", "bw + 30 %", "+30% pull-up"
  {
    const m = t.match(/bw\s*\+\s*(\d+)\s*%/) || t.match(/\+\s*(\d+)\s*%\s*(?:on\s*)?(?:weighted\s*)?pull/);
    g.weighted_pullup_bw_pct = m ? parseInt(m[1], 10) : 0;
  }
  // training age (years)
  {
    const ta = String(intake.training_age || intake.experience || "").toLowerCase();
    let years = 0;
    let m = ta.match(/(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yr|yrs)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:years?|yr|yrs)\s*(?:of\s*)?(?:straight[-\s]?arm|training)/);
    if (m) years = parseFloat(m[1]);
    else if (/advanced|elite/.test(ta)) years = 4;
    else if (/intermediate/.test(ta)) years = 2;
    g.training_age_years = years;
  }

  // ---- Family-specific holds ----
  out.planche = {
    planche_lean_hold_s: firstIntAfter(t, /planche\s*lean[^0-9]*(\d+)\s*s/),
    tuck_planche_hold_s: firstIntAfter(t, /(?<!advanced )tuck\s*planche[^0-9]*(\d+)\s*s/),
    adv_tuck_planche_hold_s: firstIntAfter(t, /advanced\s*tuck\s*planche[^0-9]*(\d+)\s*s/),
    straddle_planche_hold_s: g.straddle_planche_hold_s,
    half_lay_planche_hold_s: firstIntAfter(t, /half[-\s]?lay\s*planche[^0-9]*(\d+)\s*s/),
    full_planche_hold_s: firstIntAfter(t, /full\s*planche[^0-9]*(\d+)\s*s/),
  };
  out.front_lever = {
    tuck_front_lever_hold_s: firstIntAfter(t, /(?<!advanced )tuck\s*front\s*lever[^0-9]*(\d+)\s*s/),
    adv_tuck_front_lever_hold_s: firstIntAfter(t, /advanced\s*tuck\s*front\s*lever[^0-9]*(\d+)\s*s/),
    single_leg_front_lever_hold_s: firstIntAfter(t, /single[-\s]?leg\s*front\s*lever[^0-9]*(\d+)\s*s/),
    straddle_front_lever_hold_s: firstIntAfter(t, /straddle\s*front\s*lever[^0-9]*(\d+)\s*s/),
    half_lay_front_lever_hold_s: firstIntAfter(t, /half[-\s]?lay\s*front\s*lever[^0-9]*(\d+)\s*s/),
    full_front_lever_hold_s: firstIntAfter(t, /full\s*front\s*lever[^0-9]*(\d+)\s*s/),
  };
  out.back_lever = {
    german_hang_hold_s: firstIntAfter(t, /german\s*hang[^0-9]*(\d+)\s*s/),
    tuck_back_lever_hold_s: firstIntAfter(t, /(?<!advanced )tuck\s*back\s*lever[^0-9]*(\d+)\s*s/),
    adv_tuck_back_lever_hold_s: firstIntAfter(t, /advanced\s*tuck\s*back\s*lever[^0-9]*(\d+)\s*s/),
    straddle_back_lever_hold_s: firstIntAfter(t, /straddle\s*back\s*lever[^0-9]*(\d+)\s*s/),
    back_lever_hold_s: g.back_lever_hold_s,
  };
  out.human_flag = {
    side_plank_hold_s: g.side_plank_hold_s,
    vertical_tuck_flag_hold_s: firstIntAfter(t, /vertical\s*(?:pull\s*to\s*)?tuck[^0-9]*(\d+)\s*s/),
    tuck_human_flag_hold_s: firstIntAfter(t, /tuck\s*(?:human\s*)?flag[^0-9]*(\d+)\s*s/),
    one_leg_human_flag_hold_s: firstIntAfter(t, /one[-\s]?leg\s*(?:tuck\s*)?(?:human\s*)?flag[^0-9]*(\d+)\s*s/),
    straddle_human_flag_hold_s: firstIntAfter(t, /straddle\s*(?:human\s*)?flag[^0-9]*(\d+)\s*s/),
    full_human_flag_hold_s: firstIntAfter(t, /full\s*(?:human\s*)?flag[^0-9]*(\d+)\s*s/),
  };
  out.iron_cross = {
    german_hang_hold_s: out.back_lever.german_hang_hold_s,
    straddle_l_ring_support_hold_s: firstIntAfter(t, /straddle\s*l\s*ring\s*support[^0-9]*(\d+)\s*s/),
    bulgarian_dip_hold_s: firstIntAfter(t, /bulgarian\s*dip[^0-9]*(\d+)\s*s/),
    assisted_iron_cross_hold_s: firstIntAfter(t, /assisted\s*iron\s*cross[^0-9]*(\d+)\s*s/),
    iron_cross_hold_s: firstIntAfter(t, /(?<!assisted )iron\s*cross[^0-9]*(\d+)\s*s/),
  };
  out.maltese = {
    straddle_planche_hold_s: g.straddle_planche_hold_s,
    maltese_lean_hold_s: firstIntAfter(t, /maltese\s*lean[^0-9]*(\d+)\s*s/),
    maltese_hold_s: firstIntAfter(t, /(?<!lean )maltese[^0-9]*(\d+)\s*s/),
  };
  out.victorian = {
    back_lever_hold_s: g.back_lever_hold_s,
    victorian_lean_hold_s: firstIntAfter(t, /victorian\s*lean[^0-9]*(\d+)\s*s/),
    victorian_hold_s: firstIntAfter(t, /(?<!lean )victorian[^0-9]*(\d+)\s*s/),
  };
  out.manna = {
    l_sit_hold_s: g.l_sit_hold_s,
    v_sit_hold_s: firstIntAfter(t, /(?<!high )v[-\s]?sit[^0-9]*(\d+)\s*s/),
    high_v_sit_hold_s: firstIntAfter(t, /high\s*v[-\s]?sit[^0-9]*(\d+)\s*s/),
    manna_hold_s: firstIntAfter(t, /(?<!negative )manna[^0-9]*(\d+)\s*s/),
  };
  out.hspu = {
    pike_push_up: g.pike_push_up,
    elevated_pike_push_up: firstIntAfter(t, /elevated\s*pike[^0-9]*(\d+)/),
    wall_hspu_partial: firstIntAfter(t, /wall\s*hspu\s*partial[^0-9]*(\d+)/),
    wall_hspu: firstIntAfter(t, /(?<!partial )wall\s*hspu[^0-9]*(\d+)/),
    deficit_wall_hspu: firstIntAfter(t, /deficit\s*wall\s*hspu[^0-9]*(\d+)/),
    freestanding_hspu: firstIntAfter(t, /freestanding\s*hspu[^0-9]*(\d+)/),
    freestanding_90_hspu: firstIntAfter(t, /(?:90[-\s]?degree|90\s*deg).*?(?:hspu|hand\s*stand\s*push)[^0-9]*(\d+)/),
  };
  out.one_arm_pull_up = {
    pull_ups: g.pull_ups,
    weighted_pullup_bw_pct: g.weighted_pullup_bw_pct,
    archer_pull_up: firstIntAfter(t, /archer\s*(?:pull[-\s]?up)?[^0-9]*(\d+)/),
    typewriter_pull_up: firstIntAfter(t, /typewriter[^0-9]*(\d+)/),
    band_assisted_oap: firstIntAfter(t, /band[-\s]?assisted\s*(?:one[-\s]?arm|oap)[^0-9]*(\d+)/),
    // ADVANCED-SKILL-DIRECT-OAP-BENCHMARK
    // Accept both "2 one-arm pull-ups" and natural intake phrasing such as
    // "One-Arm Pull-up: 2 strict reps each arm". Demonstrated full-skill
    // performance must route from the achieved state, not back to prerequisites.
    one_arm_pull_up:
      firstIntAfter(t, /one[-\s]?arm\s*(?:pull|chin)(?:[-\s]?ups?)?[^0-9]{0,30}(\d+)/) ||
      firstIntAfter(t, /(\d+)\s*(?:strict\s*)?one[-\s]?arm\s*(?:pull|chin)/),
  };
  out.one_arm_handstand = {
    freestanding_handstand_hold_s: g.freestanding_handstand_hold_s,
  };
  out.handstand_walk = {
    freestanding_handstand_hold_s: g.freestanding_handstand_hold_s,
    hs_walk_m: firstIntAfter(t, /hand\s*stand\s*walk[^0-9]*(\d+)\s*m/),
  };
  return out;
}

// ---------------------------------------------------------------------------
// Equipment detection (local, dependency-free). required_equipment is ANY-of.
// ---------------------------------------------------------------------------
const AMBIENT_EQUIP = new Set(["floor", "wall", "mat", "air", "bodyweight"]);

function equipText(intake) {
  return JSON.stringify([
    intake.equipment, intake.training_location, intake.location, intake.gym, intake.equipment_list,
  ]).toLowerCase();
}
function hasEquipmentToken(token, text) {
  if (AMBIENT_EQUIP.has(token)) return true;
  switch (token) {
    case "pull_up_bar": return /pull[-\s]?up bar|chin[-\s]?up bar|monkey bar|doorframe|door frame|calisthenics|outdoor[_\s]?park|bodyweight station|\bpull[-\s]?up\b/.test(text);
    case "rings": return /\brings?\b|gymnastic ring/.test(text);
    case "parallelettes": return /parallelette|paralette|\bp[-\s]?bars?\b/.test(text);
    case "parallel_bars": return /parallel bar|\bdip bar/.test(text);
    case "dumbbells": return /dumbbell|\bdb\b/.test(text);
    case "barbell": return /barbell/.test(text);
    case "bands": return /\bbands?\b|resistance band/.test(text);
    default: return text.includes(token);
  }
}
function hasRequiredEquipment(skill, intake) {
  const req = skill.required_equipment || [];
  if (!req.length) return true;
  const text = equipText(intake);
  // ADVANCED-SKILL-COMMERCIAL-GYM-EQUIPMENT
  // The main equipment validator defines commercial_gym as the full roster.
  // Skill calibration must use the same contract rather than separately gating
  // a demonstrated advanced athlete for a pull-up bar or rings.
  if (/commercial[_\s-]?gym|full commercial gym/.test(text)) return true;
  return req.some((tok) => hasEquipmentToken(tok, text));
}

// ---------------------------------------------------------------------------
// Prerequisite checking.
// ---------------------------------------------------------------------------
function metricValue(benchmarks, metric) {
  if (!benchmarks) return 0;
  if (benchmarks.general && benchmarks.general[metric] != null) return Number(benchmarks.general[metric]) || 0;
  if (benchmarks[metric] != null) return Number(benchmarks[metric]) || 0;
  return 0;
}
export function checkPrerequisites(skill, benchmarks = {}, intake = {}) {
  const missing = [];
  for (const p of skill.prerequisites || []) {
    if (p.type === "training_age_years") {
      const yrs = metricValue(benchmarks, "training_age_years");
      if (yrs < p.min) missing.push(p.label || `${p.min}+ years training`);
    } else if (p.type === "benchmark") {
      if (metricValue(benchmarks, p.metric) < p.min) missing.push(p.label || `${p.metric} >= ${p.min}`);
    }
  }
  return { met: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// selectRungForSkill — highest rung whose criterion the athlete has met, +1.
// Returns { gated, rungIndex, rung, demonstratedIndex, reason?, note? }.
// ---------------------------------------------------------------------------
export function selectRungForSkill(family, benchmarks = {}, intake = {}) {
  const skill = SKILL_PROGRESSIONS.get(family);
  if (!skill) return null;
  const fam = benchmarks[family] || {};
  const lastIdx = skill.rungs.length - 1;

  // Which is the highest rung whose completion criterion is demonstrated?
  let demonstratedIndex = -1;
  skill.rungs.forEach((r, i) => {
    const c = r.criterion || {};
    const key = c.metric;
    const val = key != null ? (Number(fam[key]) || metricValue(benchmarks, key)) : 0;
    if (key && val >= Number(c.min || 0)) demonstratedIndex = i;
  });

  // Equipment gate always applies — cannot program a skill without its apparatus.
  if (!hasRequiredEquipment(skill, intake)) {
    return {
      gated: true, rungIndex: 0, rung: skill.rungs[0], demonstratedIndex,
      reason: `Requires ${skill.required_equipment.join(" or ")} which is not available at this training location`,
    };
  }

  // Prerequisite gate: always for hard-gate (ring) skills; for other families
  // only when the athlete has NOT already demonstrated past the first rung
  // (mid-ladder performance implies the entry prerequisites are satisfied).
  const enforcePrereq = skill.hard_gate || demonstratedIndex < 1;
  if (enforcePrereq) {
    const pre = checkPrerequisites(skill, benchmarks, intake);
    if (!pre.met) {
      return {
        gated: true, rungIndex: 0, rung: skill.rungs[0], demonstratedIndex, missing: pre.missing,
        reason: `Prerequisite gate for ${skill.goal} not met — ${pre.missing.join("; ")}`,
      };
    }
  }

  const rungIndex = demonstratedIndex < 0 ? 0 : Math.min(demonstratedIndex + 1, lastIdx);
  return {
    gated: false, rungIndex, rung: skill.rungs[rungIndex], demonstratedIndex,
    note: demonstratedIndex < 0 ? "No benchmark met — starting at the beginner rung" : undefined,
  };
}

// ---------------------------------------------------------------------------
// renderSkillWorkForRung — emit TSV row cell-arrays for a rung's working set
// (plus lighter complementary rows). Column order = SKILL_TSV_COLUMNS.
// ---------------------------------------------------------------------------
export function renderSkillWorkForRung(rung, intake = {}, day = "") {
  if (!rung) return [];
  const d = rung.dose || {};
  const rpe = d.rir != null ? `RIR ${d.rir}` : "";
  const freqNote = d.frequency_per_week ? `skill work ${d.frequency_per_week}x/week` : "";
  const critNote = rung.criterion && rung.criterion.min != null
    ? `progress at ${rung.criterion.min}${rung.criterion.type === "reps" ? " reps" : rung.criterion.type === "distance_m" ? " m" : "s"}`
    : "";
  const notes = [critNote, freqNote].filter(Boolean).join("; ");
  const rows = [];
  rows.push([day, rung.name, "BW", String(d.sets ?? ""), String(d.reps ?? ""), String(d.rest ?? ""), rpe, notes, ""]);
  for (const comp of rung.complementary || []) {
    rows.push([day, comp, "BW", "3", "8-12", "90s", "RIR 2", "complementary to " + rung.name, ""]);
  }
  return rows;
}
