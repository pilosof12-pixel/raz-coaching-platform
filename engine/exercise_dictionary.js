// engine/exercise_dictionary.js
//
// Engine v19 — deterministic post-generation defenses.
//
// This module is intentionally dependency-free (no express, no storage, no SDK)
// so it can be imported both by server.js (which wires the validators into the
// build retry loop) and by test/v19_validators.test.js (which exercises the
// validators directly under `node --test`, without booting the server).
//
// It exports:
//   - EXERCISE_DICTIONARY            (Set of canonical exercise names)
//   - EXERCISE_ALIASES               (Map non-canonical -> canonical)
//   - EXERCISE_EQUIPMENT_REQUIREMENTS(Map canonical -> [equipment tokens])
//   - HEBREW_EXERCISE_MAP            (Map normalized-Hebrew -> English canonical)
//   - LOCATION_EQUIPMENT_WHITELIST   (Map training_location -> Set of tokens)
//   - LOCKED_OUT_UNDERSTIMULATING_EXERCISES (Set)
//   - the four validators + their helpers
//   - RetriableValidationError       (error class carrying a prompt amendment)

// ---------------------------------------------------------------------------
// 1. CANONICAL EXERCISE DICTIONARY
// ---------------------------------------------------------------------------
// Every rung named in CALISTHENICS_PROGRESSION_RULES / WARMUP_CEILING_RULES /
// UNILATERAL_LEG_INTENSITY_RULES, plus the standard loaded roster. Names are
// stored case-preserved; matching is done via a normalized index (see norm()).

const DICTIONARY_LIST = [
  // --- HSPU: wall (chest-to-wall) family ---
  "Pike Push-up", "Elevated Pike Push-up", "Wall Handstand Hold",
  "Wall Handstand Push-up Partial", "Wall Handstand Push-up",
  "Deficit Wall Handstand Push-up", "90-Degree Wall Handstand Push-up",
  // --- HSPU: freestanding family ---
  "Freestanding Handstand Hold", "Freestanding Handstand Push-up Negative",
  "Freestanding Handstand Push-up Partial", "Freestanding Handstand Push-up",
  "Deficit Freestanding Handstand Push-up", "90-Degree Freestanding Handstand Push-up",
  "Freestanding 90-Degree Handstand Push-up", "Handstand Push-up",
  "Handstand Hold", "Handstand Walk",
  // --- OAP (one-arm pull-up) family ---
  "Weighted Pull-up", "Archer Pull-up", "Typewriter Pull-up",
  "Assisted One-Arm Pull-up", "One-Arm Pull-up Eccentric",
  "One-Arm Pull-up Partial", "One-Arm Pull-up Isometric",
  "One-Arm Pull-up", "Weighted One-Arm Pull-up", "One-Arm Chin-up",
  // --- Planche family ---
  "Planche Lean", "Tuck Planche", "Advanced Tuck Planche", "Straddle Planche",
  "Half-Lay Planche", "Full Planche", "Planche Push-up", "Pseudo Planche Push-up",
  // --- Front lever family ---
  "Tuck Front Lever", "Tuck Front Lever Hold", "Tuck Front Lever Negative",
  "Tuck Front Lever Isometric", "Advanced Tuck Front Lever",
  "Single-Leg Front Lever", "Straddle Front Lever", "Half-Lay Front Lever",
  "Full Front Lever", "Front Lever Raise", "Front Lever Pull",
  // --- Human flag family ---
  "Side Plank", "Side Plank Hip Dip", "Vertical Pull to Tuck",
  "Tuck Human Flag Negative", "Tuck Human Flag Hold", "Tuck Human Flag",
  "One-Leg Tuck Human Flag", "Straddle Human Flag", "Full Human Flag",
  "Human Flag Hold",
  // --- Muscle-up family ---
  "Strict Chest-to-Bar Pull-up", "Explosive Hip-to-Bar Pull-up",
  "False-Grip Hold", "Banded Muscle-up", "Muscle-up Negative",
  "Strict Muscle-up", "Muscle-up", "Bar Muscle-up", "Ring Muscle-up",
  // --- Pistol / single-leg squat family ---
  "Bodyweight Squat", "Air Squat", "Assisted Squat", "Assisted Pistol Squat",
  "Box Squat to Parallel", "Pistol Squat", "Weighted Pistol Squat",
  "Eccentric Pistol Squat", "5-Second Eccentric Pistol Squat",
  "Single-Leg Box Jump", "Shrimp Squat", "Skater Squat",
  // --- Hang / pull prerequisites (warmup ceiling rungs) ---
  "Dead Hang", "Scapular Pull-up", "Bent-Arm Hang", "Strict Two-Arm Pull-up",
  "Active Hang", "L-Sit", "L-Sit Hold", "Tuck L-Sit", "Hanging Leg Raise",
  "Toes-to-Bar", "Knee Raise",
  // --- Unilateral leg roster ---
  "Bulgarian Split Squat", "Split Squat", "TRX Squat", "TRX Split Squat",
  "TRX Row", "TRX Fallout", "Rear-Foot-Elevated Step-Up",
  "Single-Leg Box Squat", "Goblet Split Squat", "Front-Loaded Split Squat",
  "Single-Leg Romanian Deadlift", "Single-Leg Hip Thrust", "Step-Up",
  "Split Squat Jump", "Depth Jump", "Single-Leg Deadlift", "Cossack Squat",
  "Walking Lunge", "Reverse Lunge", "Forward Lunge", "Lateral Lunge",
  "Curtsy Lunge", "Lunge", "Dumbbell Lunge", "Barbell Lunge",
  // --- Barbell roster ---
  "Back Squat", "Front Squat", "Overhead Squat", "Box Squat", "Pause Squat",
  "Deadlift", "Conventional Deadlift", "Sumo Deadlift", "Romanian Deadlift",
  "Deficit Deadlift", "Rack Pull", "Block Pull", "Snatch-Grip Deadlift",
  "Bench Press", "Incline Bench Press", "Decline Bench Press",
  "Close-Grip Bench Press", "Overhead Press", "Standing Barbell Overhead Press",
  "Push Press", "Push Jerk", "Split Jerk", "Barbell Row", "Pendlay Row",
  "Bent-Over Row", "Power Clean", "Hang Clean", "Clean", "Snatch",
  "Power Snatch", "Hang Snatch", "Clean and Jerk", "Clean and Press",
  "Hip Thrust", "Barbell Hip Thrust", "Good Morning", "Front Rack Lunge",
  "Zercher Squat", "Barbell Curl", "Landmine Press", "Landmine Row",
  // --- Dumbbell roster ---
  "Dumbbell Bench Press", "Incline Dumbbell Press", "Dumbbell Shoulder Press",
  "Arnold Press", "Dumbbell Row", "One-Arm Dumbbell Row",
  "Dumbbell Romanian Deadlift", "Goblet Squat", "Dumbbell Curl",
  "Hammer Curl", "Lateral Raise", "Dumbbell Fly", "Dumbbell Pullover",
  "Dumbbell Bulgarian Split Squat", "Dumbbell Step-Up", "Dumbbell Snatch",
  "Renegade Row", "Dumbbell Thruster",
  // --- Kettlebell roster ---
  "Kettlebell Swing", "Kettlebell Goblet Squat", "Kettlebell Clean",
  "Kettlebell Snatch", "Turkish Get-up", "Kettlebell Front Rack Carry",
  "Kettlebell Press", "Kettlebell Deadlift", "Farmer Carry",
  "Heavy Farmer Carry", "Suitcase Carry", "Front Rack Carry",
  // --- Cable / machine roster ---
  "Cable Row", "Seated Cable Row", "Lat Pulldown", "Cable Fly",
  "Cable Face-Pull", "Face Pull", "Tricep Pushdown", "Cable Crossover",
  "Cable Curl", "Cable Lateral Raise", "Leg Press", "Hack Squat",
  "Leg Extension", "Leg Curl", "Lying Leg Curl", "Seated Leg Curl",
  "Machine Hamstring Curl", "Chest Press Machine", "Pec Deck",
  "Smith Machine Squat", "GHD Raise", "Glute-Ham Raise", "Reverse Hyper",
  "Assault Bike", "Rower", "Treadmill", "Ski Erg", "Stationary Bike",
  "Elliptical", "Leg Press Machine", "Seated Row Machine",
  // --- Bodyweight / gymnastics general ---
  "Push-up", "Diamond Push-up", "Decline Push-up", "Archer Push-up",
  "Pull-up", "Chin-up", "Wide-Grip Pull-up", "Commando Pull-up",
  "Dip", "Ring Dip", "Bench Dip", "Parallel Bar Dip", "Korean Dip",
  "Inverted Row", "Ring Row", "Australian Pull-up", "Nordic Curl",
  "Nordic Hamstring Curl", "Plank", "Hollow Hold", "Hollow Body Rock",
  "Superman Hold", "Dead Bug", "Bird Dog", "Glute Bridge",
  "Single-Leg Glute Bridge", "Box Jump", "Broad Jump", "Tuck Jump",
  "Burpee", "Mountain Climber", "Wall Sit", "Calf Raise",
  "Standing Calf Raise", "Seated Calf Raise", "Sit-up", "Crunch",
  "Russian Twist", "V-Up", "Flutter Kick", "Bear Crawl", "Ring Support Hold",
  // --- Band roster ---
  "Band Row", "Band Pull-Apart", "Band Face Pull", "Banded Good Morning",
  "Band Pull-up", "Banded Squat", "Band Chest Press", "Band Lateral Walk",
  "Band Pallof Press",
  // --- Conditioning / location-specific ---
  "Hill Sprint", "Hill Sprints", "Sprint", "Sprint Intervals",
  "Weighted Vest Hill Sprint", "Sled Push", "Sled Drag", "Prowler Push",
  "Stair Sprint", "Jump Rope", "Skipping", "Shuttle Run", "Bear Hug Carry",
  "Burpee EMOM", "Sandbag Carry", "Backpack Carry",
  // --- Warmup / mobility drills (so prep chains land on real names) ---
  "Jumping Jacks", "Arm Circles", "Leg Swings", "Cat-Cow", "Bird-Dog",
  "World's Greatest Stretch", "Spiderman Lunge", "Inchworm", "Hip Airplane",
  "90/90 Hip Rotation", "Ankle Dorsiflexion Drill", "Wrist Prep",
  "Shoulder Dislocates", "Scapular Push-up", "Wall Slides", "Glute Activation",
  "Band Pull-Apart Warm-up", "Cossack Squat Warm-up", "Deep Squat Hold",
  "Thoracic Rotation", "Hip Flexor Stretch", "Adductor Rock",
];

export const EXERCISE_DICTIONARY = new Set(DICTIONARY_LIST);

// ---------------------------------------------------------------------------
// 2. ALIASES (non-canonical spelling -> canonical). Matching is normalized, so
//    these only need to cover forms whose *normalized* value differs from a
//    dictionary entry's normalized value (acronyms, reorderings, brand words).
// ---------------------------------------------------------------------------
const ALIAS_LIST = [
  ["Wall HSPU", "Wall Handstand Push-up"],
  ["Wall HSPU Partial", "Wall Handstand Push-up Partial"],
  ["Deficit Wall HSPU", "Deficit Wall Handstand Push-up"],
  ["Freestanding HSPU", "Freestanding Handstand Push-up"],
  ["HSPU", "Handstand Push-up"],
  ["90-Degree HSPU", "90-Degree Wall Handstand Push-up"],
  ["OAP", "One-Arm Pull-up"],
  ["Weighted OAP", "Weighted One-Arm Pull-up"],
  ["Assisted OAP", "Assisted One-Arm Pull-up"],
  ["BSS", "Bulgarian Split Squat"],
  ["RFE Split Squat", "Bulgarian Split Squat"],
  ["Rear Foot Elevated Split Squat", "Bulgarian Split Squat"],
  ["SLRDL", "Single-Leg Romanian Deadlift"],
  ["SL RDL", "Single-Leg Romanian Deadlift"],
  ["Single Leg RDL", "Single-Leg Romanian Deadlift"],
  ["RDL", "Romanian Deadlift"],
  ["OHP", "Overhead Press"],
  ["Standing OHP", "Standing Barbell Overhead Press"],
  ["Military Press", "Overhead Press"],
  ["BB Row", "Barbell Row"],
  ["DB Row", "Dumbbell Row"],
  ["DB Bench Press", "Dumbbell Bench Press"],
  ["DB Shoulder Press", "Dumbbell Shoulder Press"],
  ["KB Swing", "Kettlebell Swing"],
  ["Goblet KB Squat", "Kettlebell Goblet Squat"],
  ["Sumo DL", "Sumo Deadlift"],
  ["Conventional DL", "Conventional Deadlift"],
  ["Deadlifts", "Deadlift"],
  ["Pull Up", "Pull-up"],
  ["Pullup", "Pull-up"],
  ["Pullups", "Pull-up"],
  ["Chin Up", "Chin-up"],
  ["Push Up", "Push-up"],
  ["Pushup", "Push-up"],
  ["Pushups", "Push-up"],
  ["Pistol", "Pistol Squat"],
  ["Weighted Pistol", "Weighted Pistol Squat"],
  ["Bulgarian Split Squats", "Bulgarian Split Squat"],
  ["Split Squats", "Split Squat"],
  ["Step Up", "Step-Up"],
  ["Step Ups", "Step-Up"],
  ["Box Jumps", "Box Jump"],
  ["Hill Sprints", "Hill Sprint"],
  ["Sprints", "Sprint"],
  ["Muscle Up", "Muscle-up"],
  ["Muscle-Ups", "Muscle-up"],
  ["Front Lever Hold", "Full Front Lever"],
  ["L Sit", "L-Sit"],
  ["Face-Pull", "Face Pull"],
  ["Cable Rows", "Cable Row"],
  ["Lat Pull-down", "Lat Pulldown"],
  ["Lat Pull Down", "Lat Pulldown"],
  ["Leg Curls", "Leg Curl"],
  ["Leg Extensions", "Leg Extension"],
  ["Calf Raises", "Calf Raise"],
  ["Lateral Raises", "Lateral Raise"],
  ["Assault Bike Intervals", "Assault Bike"],
  ["Air Bike", "Assault Bike"],
  ["Echo Bike", "Assault Bike"],
  ["Nordic Hamstring Curls", "Nordic Hamstring Curl"],
  ["Nordics", "Nordic Curl"],
  ["Single Leg Box Jump", "Single-Leg Box Jump"],
  ["Eccentric Pistol", "Eccentric Pistol Squat"],
  ["5s Eccentric Pistol Squat", "5-Second Eccentric Pistol Squat"],
];

export const EXERCISE_ALIASES = new Map(ALIAS_LIST);

// ---------------------------------------------------------------------------
// 3. EQUIPMENT REQUIREMENTS (canonical -> tokens). Bodyweight movements map to
//    []. Anything not listed here defaults to [] (treated as bodyweight/no-gear)
//    so we never *falsely* block an unlisted-but-plausible bodyweight move.
// ---------------------------------------------------------------------------
const BARBELL = ["barbell", "rack", "plates"];
const BARBELL_NORACK = ["barbell", "plates"];
const EQUIP_LIST = [
  // barbell lifts
  ["Back Squat", BARBELL], ["Front Squat", BARBELL], ["Overhead Squat", BARBELL],
  ["Box Squat", BARBELL], ["Pause Squat", BARBELL], ["Zercher Squat", BARBELL],
  ["Deadlift", BARBELL_NORACK], ["Conventional Deadlift", BARBELL_NORACK],
  ["Sumo Deadlift", BARBELL_NORACK], ["Romanian Deadlift", BARBELL_NORACK],
  ["Deficit Deadlift", BARBELL_NORACK], ["Rack Pull", BARBELL],
  ["Snatch-Grip Deadlift", BARBELL_NORACK], ["Bench Press", BARBELL],
  ["Incline Bench Press", BARBELL], ["Decline Bench Press", BARBELL],
  ["Close-Grip Bench Press", BARBELL], ["Overhead Press", BARBELL_NORACK],
  ["Standing Barbell Overhead Press", BARBELL_NORACK], ["Push Press", BARBELL_NORACK],
  ["Push Jerk", BARBELL_NORACK], ["Barbell Row", BARBELL_NORACK],
  ["Pendlay Row", BARBELL_NORACK], ["Bent-Over Row", BARBELL_NORACK],
  ["Power Clean", BARBELL_NORACK], ["Clean", BARBELL_NORACK], ["Snatch", BARBELL_NORACK],
  ["Clean and Jerk", BARBELL_NORACK], ["Hip Thrust", ["barbell", "plates", "bench"]],
  ["Barbell Hip Thrust", ["barbell", "plates", "bench"]], ["Good Morning", BARBELL_NORACK],
  ["Barbell Lunge", BARBELL_NORACK], ["Barbell Curl", ["barbell", "plates"]],
  ["Landmine Press", ["barbell", "plates"]], ["Landmine Row", ["barbell", "plates"]],
  // dumbbell lifts
  ["Dumbbell Bench Press", ["dumbbells", "bench"]], ["Incline Dumbbell Press", ["dumbbells", "bench"]],
  ["Dumbbell Shoulder Press", ["dumbbells"]], ["Arnold Press", ["dumbbells"]],
  ["Dumbbell Row", ["dumbbells"]], ["One-Arm Dumbbell Row", ["dumbbells"]],
  ["Dumbbell Romanian Deadlift", ["dumbbells"]], ["Goblet Squat", ["dumbbells"]],
  ["Dumbbell Curl", ["dumbbells"]], ["Hammer Curl", ["dumbbells"]],
  ["Lateral Raise", ["dumbbells"]], ["Dumbbell Fly", ["dumbbells", "bench"]],
  ["Dumbbell Bulgarian Split Squat", ["dumbbells"]], ["Dumbbell Step-Up", ["dumbbells", "bench"]],
  ["Dumbbell Snatch", ["dumbbells"]], ["Renegade Row", ["dumbbells"]],
  ["Dumbbell Thruster", ["dumbbells"]], ["Dumbbell Lunge", ["dumbbells"]],
  // kettlebell
  ["Kettlebell Swing", ["kettlebells"]], ["Kettlebell Goblet Squat", ["kettlebells"]],
  ["Kettlebell Clean", ["kettlebells"]], ["Kettlebell Snatch", ["kettlebells"]],
  ["Turkish Get-up", ["kettlebells"]], ["Kettlebell Press", ["kettlebells"]],
  ["Kettlebell Deadlift", ["kettlebells"]], ["Farmer Carry", ["dumbbells"]],
  ["Kettlebell Front Rack Carry", ["kettlebells"]],
  // cable / machine
  ["Cable Row", ["cable_stack"]], ["Seated Cable Row", ["cable_stack"]],
  ["Lat Pulldown", ["cable_stack"]], ["Cable Fly", ["cable_stack"]],
  ["Cable Face-Pull", ["cable_stack"]], ["Face Pull", ["cable_stack"]],
  ["Tricep Pushdown", ["cable_stack"]], ["Cable Crossover", ["cable_stack"]],
  ["Cable Curl", ["cable_stack"]], ["Cable Lateral Raise", ["cable_stack"]],
  ["Leg Press", ["leg_press"]], ["Leg Press Machine", ["leg_press"]],
  ["Hack Squat", ["hack_squat"]], ["Leg Extension", ["leg_extension"]],
  ["Leg Curl", ["leg_curl"]], ["Lying Leg Curl", ["leg_curl"]],
  ["Seated Leg Curl", ["leg_curl"]], ["Machine Hamstring Curl", ["leg_curl"]],
  ["Chest Press Machine", ["machine"]], ["Pec Deck", ["machine"]],
  ["Smith Machine Squat", ["smith_machine"]], ["GHD Raise", ["ghd"]],
  ["Glute-Ham Raise", ["ghd"]], ["Reverse Hyper", ["reverse_hyper"]],
  ["Seated Row Machine", ["machine"]], ["Assault Bike", ["assault_bike"]],
  ["Rower", ["rower"]], ["Treadmill", ["treadmill"]], ["Ski Erg", ["ski_erg"]],
  ["Stationary Bike", ["bike"]], ["Elliptical", ["elliptical"]],
  // sled / conditioning gear
  ["Sled Push", ["sled"]], ["Sled Drag", ["sled"]], ["Prowler Push", ["sled"]],
  ["Weighted Vest Hill Sprint", ["weighted_vest", "hill"]],
  ["Weighted Pistol Squat", []], // load can be vest/backpack/bw — do not hard-require
  // pull/dip apparatus
  ["Pull-up", ["pull_up_bar"]], ["Chin-up", ["pull_up_bar"]],
  ["Wide-Grip Pull-up", ["pull_up_bar"]], ["Commando Pull-up", ["pull_up_bar"]],
  ["Weighted Pull-up", ["pull_up_bar"]], ["Archer Pull-up", ["pull_up_bar"]],
  ["Typewriter Pull-up", ["pull_up_bar"]], ["One-Arm Pull-up", ["pull_up_bar"]],
  ["Muscle-up", ["pull_up_bar"]], ["Bar Muscle-up", ["pull_up_bar"]],
  ["Dead Hang", ["pull_up_bar"]], ["Scapular Pull-up", ["pull_up_bar"]],
  ["Toes-to-Bar", ["pull_up_bar"]], ["Hanging Leg Raise", ["pull_up_bar"]],
  ["Dip", ["dip_bars"]], ["Parallel Bar Dip", ["dip_bars"]],
  ["Ring Dip", ["rings"]], ["Ring Row", ["rings"]], ["Ring Muscle-up", ["rings"]],
  ["Ring Support Hold", ["rings"]],
  // band movements
  ["Band Row", ["bands"]], ["Band Pull-Apart", ["bands"]], ["Band Face Pull", ["bands"]],
  ["Banded Good Morning", ["bands"]], ["Band Chest Press", ["bands"]],
  ["Band Lateral Walk", ["bands"]], ["Band Pallof Press", ["bands"]],
  ["Banded Squat", ["bands"]],
];
export const EXERCISE_EQUIPMENT_REQUIREMENTS = new Map(EQUIP_LIST);

// ---------------------------------------------------------------------------
// 4. HEBREW -> ENGLISH reverse map (built from LOCALIZATION_RULES terminology
//    plus calisthenics-specific translations). Keyed by normalized Hebrew.
// ---------------------------------------------------------------------------
const HEBREW_PAIRS = [
  ["סקוואט אחורי", "Back Squat"], ["סקוואט קדמי", "Front Squat"],
  ["דדליפט", "Deadlift"], ["דדליפט רומני", "Romanian Deadlift"],
  ["לחיצת חזה", "Bench Press"], ["לחיצת כתפיים", "Overhead Press"],
  ["מתח", "Pull-up"], ["מתח בהחזקת סופינציה", "Chin-up"], ["דיפ", "Dip"],
  ["חתירה", "Barbell Row"], ["היפ תראסט", "Hip Thrust"],
  ["ספליט סקוואט בולגרי", "Bulgarian Split Squat"], ["פיסטול סקוואט", "Pistol Squat"],
  ["דדליפט רומני על רגל אחת", "Single-Leg Romanian Deadlift"], ["עלייה על ספסל", "Step-Up"],
  ["לחיצת עמידת ידיים על הקיר", "Wall Handstand Push-up"],
  ["לחיצת עמידת ידיים חופשית", "Freestanding Handstand Push-up"],
  ["פרונט לבר", "Front Lever"], ["דגל אנושי", "Human Flag"], ["פלאנץ", "Planche"],
  ["מאסל-אפ", "Muscle-up"], ["מאסל אפ", "Muscle-up"], ["מתח יד אחת", "One-Arm Pull-up"],
  // calisthenics-specific extras
  ["סקוואט", "Bodyweight Squat"], ["שכיבות סמיכה", "Push-up"],
  ["סקוואט גוף מלא", "Bodyweight Squat"], ["ריצת גבעה", "Hill Sprint"],
  ["ספרינט", "Sprint"], ["קפיצה על קופסה", "Box Jump"],
];
export const HEBREW_EXERCISE_MAP = new Map(
  HEBREW_PAIRS.map(([he, en]) => [hebNorm(he), en])
);

// ---------------------------------------------------------------------------
// 5. LOCATION EQUIPMENT WHITELIST + effective-equipment computation
// ---------------------------------------------------------------------------
const FULL_ROSTER = [
  "barbell", "rack", "plates", "bench", "dumbbells", "adjustable_dumbbells",
  "kettlebells", "pull_up_bar", "dip_bars", "parallel_bars", "rings", "bands",
  "cable_stack", "leg_press", "hack_squat", "leg_extension", "leg_curl",
  "machine", "smith_machine", "ghd", "reverse_hyper", "sled", "assault_bike",
  "rower", "treadmill", "ski_erg", "bike", "elliptical", "weighted_vest",
  "backpack", "sprint_lane", "hill", "stairs", "doorframe_bar",
];

export const LOCATION_EQUIPMENT_WHITELIST = new Map([
  ["outdoor_park", new Set([
    "pull_up_bar", "dip_bars", "parallel_bars", "bench", "rings", "bands",
    "weighted_vest", "backpack", "sprint_lane", "hill", "stairs",
  ])],
  ["calisthenics_park", new Set([
    "pull_up_bar", "dip_bars", "parallel_bars", "bench", "rings", "bands",
    "weighted_vest", "backpack", "sprint_lane", "hill", "stairs",
  ])],
  ["hotel_room", new Set(["bands", "doorframe_bar"])],
  ["travel", new Set(["bands", "doorframe_bar"])],
  ["home_bodyweight", new Set()], // {} + intake extras (handled as union below)
  ["home_gym", new Set([
    "barbell", "rack", "plates", "bench", "adjustable_dumbbells", "dumbbells",
    "pull_up_bar", "bands", "kettlebells",
  ])],
  ["garage_gym", new Set([
    "barbell", "rack", "plates", "bench", "adjustable_dumbbells", "dumbbells",
    "pull_up_bar", "bands", "kettlebells",
  ])],
  ["commercial_gym", new Set(FULL_ROSTER)],
]);

// Free-form intake.equipment -> normalized token set.
export function normalizeEquipmentTokens(equipment) {
  const tokens = new Set();
  let items = [];
  if (Array.isArray(equipment)) items = equipment;
  else if (typeof equipment === "string") items = equipment.split(/[,;/\n]+/);
  else if (equipment && typeof equipment === "object") items = Object.values(equipment).flat();
  for (const raw of items) {
    const s = String(raw || "").toLowerCase().trim();
    if (!s) continue;
    const add = (t) => tokens.add(t);
    if (/\bbar\s?bell\b|\bbarbell\b/.test(s)) add("barbell");
    if (/\bplate/.test(s)) add("plates");
    if (/\brack\b|power rack|squat rack|half rack/.test(s)) add("rack");
    if (/\bbench\b/.test(s)) add("bench");
    if (/adjustable dumbbell/.test(s)) { add("dumbbells"); add("adjustable_dumbbells"); }
    else if (/\bdumbbell|\bdb\b/.test(s)) add("dumbbells");
    if (/\bkettlebell|\bkb\b/.test(s)) add("kettlebells");
    if (/pull[-\s]?up bar|chin[-\s]?up bar/.test(s)) add("pull_up_bar");
    if (/doorframe|door frame|door bar/.test(s)) { add("doorframe_bar"); add("pull_up_bar"); }
    if (/\bdip (bar|station)|dip bars\b/.test(s)) add("dip_bars");
    if (/parallel bar|parallette/.test(s)) add("parallel_bars");
    if (/\bring\b|\brings\b|gymnastic ring/.test(s)) add("rings");
    if (/\bband/.test(s)) add("bands");
    if (/cable|pulldown|pull-down|crossover/.test(s)) add("cable_stack");
    if (/leg press/.test(s)) add("leg_press");
    if (/hack squat/.test(s)) add("hack_squat");
    if (/leg extension/.test(s)) add("leg_extension");
    if (/leg curl|hamstring curl/.test(s)) add("leg_curl");
    if (/smith/.test(s)) add("smith_machine");
    if (/\bghd\b|glute[-\s]?ham/.test(s)) add("ghd");
    if (/reverse hyper/.test(s)) add("reverse_hyper");
    if (/machine/.test(s)) add("machine");
    if (/\bsled\b|prowler/.test(s)) add("sled");
    if (/assault bike|air bike|echo bike|fan bike/.test(s)) add("assault_bike");
    if (/\brower\b|row erg|concept ?2/.test(s)) add("rower");
    if (/treadmill/.test(s)) add("treadmill");
    if (/ski erg|skierg/.test(s)) add("ski_erg");
    if (/\bbike\b|spin bike|stationary bike/.test(s) && !/assault|air|echo|fan/.test(s)) add("bike");
    if (/weighted vest|weight vest/.test(s)) add("weighted_vest");
    if (/backpack|ruck/.test(s)) add("backpack");
    if (/sprint|track|grass|field/.test(s)) add("sprint_lane");
    if (/\bhill\b/.test(s)) add("hill");
    if (/\bstair/.test(s)) add("stairs");
  }
  return tokens;
}

// Effective equipment = INTERSECTION(intake tokens, location whitelist),
// EXCEPT commercial_gym = UNION, and home_bodyweight = intake tokens (base {}).
export function computeEffectiveEquipment(intake = {}) {
  const location = String(intake.training_location || "").toLowerCase().trim();
  const intakeTokens = normalizeEquipmentTokens(intake.equipment);
  const whitelist = LOCATION_EQUIPMENT_WHITELIST.get(location);

  if (location === "commercial_gym") {
    return new Set([...FULL_ROSTER, ...intakeTokens]);
  }
  if (location === "home_bodyweight") {
    return new Set(intakeTokens); // base {} + explicit extras
  }
  if (!whitelist) {
    // Unknown location: fall back to what the athlete listed (be permissive).
    return new Set(intakeTokens);
  }
  const eff = new Set();
  for (const t of intakeTokens) if (whitelist.has(t)) eff.add(t);
  return eff;
}

// ---------------------------------------------------------------------------
// 6. UNILATERAL INTENSITY FLOOR
// ---------------------------------------------------------------------------
export const LOCKED_OUT_UNDERSTIMULATING_EXERCISES = new Set([
  "Bodyweight Squat", "Air Squat", "TRX Squat", "TRX Split Squat",
  "Split Squat", "Assisted Squat", "Assisted Pistol Squat",
  "Box Squat to Parallel",
]);
const LOCKED_OUT_NORM = new Set([...LOCKED_OUT_UNDERSTIMULATING_EXERCISES].map(norm));

// Parse a free-form current_numbers string for a weighted-pistol benchmark.
export function parseUnilateralBenchmark(intakeString) {
  const s = String(intakeString || "").toLowerCase();
  if (!s.includes("pistol")) return null;
  // reps: "x 12", "× 12", "for 12", "12 reps"
  let reps = null;
  let m = s.match(/(?:x|×|for)\s*(\d+)\s*(?:reps?)?/);
  if (m) reps = parseInt(m[1], 10);
  if (reps == null) { m = s.match(/(\d+)\s*reps?/); if (m) reps = parseInt(m[1], 10); }
  // external load: "bw+10kg", "bw + 10 kg", "+10", "10kg"
  let extLoad = 0;
  let bwLoaded = /\bbw\b|body\s*weight|weighted/.test(s);
  m = s.match(/bw\s*\+\s*(\d+(?:\.\d+)?)\s*kg?/);
  if (m) { extLoad = parseFloat(m[1]); bwLoaded = true; }
  else {
    m = s.match(/\+\s*(\d+(?:\.\d+)?)\s*kg?/);
    if (m) { extLoad = parseFloat(m[1]); bwLoaded = true; }
    else {
      m = s.match(/(\d+(?:\.\d+)?)\s*kg/);
      if (m) { extLoad = parseFloat(m[1]); }
    }
  }
  return { pattern: "pistol", reps, extLoad, bwLoaded };
}

// True when the athlete demonstrates elite unilateral leg strength.
export function ELITE_UNILATERAL_TRIGGER(intake = {}) {
  const raw = intake.current_numbers != null
    ? (typeof intake.current_numbers === "string"
        ? intake.current_numbers
        : JSON.stringify(intake.current_numbers))
    : "";
  const bench = parseUnilateralBenchmark(raw);
  if (bench && bench.pattern === "pistol" && (bench.reps || 0) >= 5 && (bench.bwLoaded || bench.extLoad > 0)) {
    return true;
  }
  // Generic: any unilateral movement at >= 50% bodyweight external load x 5+ reps.
  const bw = Number(intake.bodyweight || intake.body_weight || intake.weight_kg || 0);
  if (bw > 0 && bench && (bench.reps || 0) >= 5 && bench.extLoad >= 0.5 * bw) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 7. NORMALIZATION HELPERS
// ---------------------------------------------------------------------------
export function norm(s) {
  let x = String(s || "").toLowerCase();
  x = x.replace(/[–—]/g, "-");        // en/em dash -> hyphen
  x = x.replace(/[’'".,:;!?()]/g, " ");           // drop most punctuation
  x = x.replace(/-/g, " ");                        // hyphen -> space
  x = x.replace(/\s+/g, " ").trim();
  // acronym / spelling unifications
  x = x.replace(/\bhspu\b/g, "handstand push up");
  x = x.replace(/\boap\b/g, "one arm pull up");
  x = x.replace(/\bpush ?ups?\b/g, "push up");
  x = x.replace(/\bpull ?ups?\b/g, "pull up");
  x = x.replace(/\bchin ?ups?\b/g, "chin up");
  x = x.replace(/\bsit ?ups?\b/g, "sit up");
  x = x.replace(/\bv ?ups?\b/g, "v up");
  x = x.replace(/\bstep ?ups?\b/g, "step up");
  x = x.replace(/\bpull ?aparts?\b/g, "pull apart");
  x = x.replace(/\bhandstands?\b/g, "handstand");
  // de-pluralize a known set of movement nouns
  x = x.replace(/\b(squat|lunge|swing|raise|dip|row|curl|press|jump|sprint|extension|hold|bridge|thrust|deadlift|clean|snatch|plank|crawl|dislocate|circle|slide|twist|kick|crunch|get up|pushdown|fly)s\b/g, "$1");
  x = x.replace(/\bcarries\b/g, "carry");
  return x.trim();
}

function hebNorm(s) {
  return String(s || "")
    .replace(/[֑-ׇ]/g, "")   // strip niqqud/cantillation
    .replace(/["'`׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NORM_DICT = new Set([...EXERCISE_DICTIONARY].map(norm));
const NORM_ALIAS = new Map([...EXERCISE_ALIASES].map(([k, v]) => [norm(k), v]));

const MODIFIER_SET = new Set([
  "eccentric", "eccentrics", "negative", "negatives", "isometric", "iso",
  "hold", "holds", "partial", "partials", "rom", "assisted", "tempo",
  "paused", "pause", "cluster", "amrap", "emom",
]);

const WARMUP_PREFIX_RE = /^\s*"?\s*\[(?:WARMUP|חימום)\]/i;
export function isWarmupCell(cell) {
  return WARMUP_PREFIX_RE.test(String(cell || ""));
}

// Reduce a raw Exercise cell to its core movement name for dictionary lookup.
export function coreExerciseName(cell, isHebrew = false) {
  let s = String(cell || "").trim().replace(/^"|"$/g, "").trim();
  s = s.replace(/^\[(?:WARMUP|חימום)\]\s*/i, "");
  // Drop a leading label like "General prep:" / "Specific ramp:" / Hebrew equivalents.
  s = s.replace(/^[^:]{0,32}:\s*/, (m) => (/(prep|ramp|primer|הכנה|ראמפ|פריימר|חימום)/i.test(m) ? "" : m));
  // Hebrew-first parenthetical "עברית (English)" OR annotation parenthetical.
  const paren = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const outer = paren[1].trim();
    const inner = paren[2].trim();
    const outerHeb = /[֐-׿]/.test(outer);
    const innerLatin = /[A-Za-z]/.test(inner);
    if (outerHeb && innerLatin) s = inner;                      // Hebrew-first -> English
    else if (/\d|sec|\bs\b|min|lower|hold|side|each|leg|tempo|pause|%|rir|rpe/i.test(inner)) s = outer; // annotation
    else s = outer + " " + inner;                               // brand/qualifier -> keep whole
  }
  // Strip trailing set/rep/load/duration annotations.
  s = s.split(/[;]/)[0];
  s = s.replace(/\b\d+\s*(?:x|×)\s*\d+.*$/i, "");
  s = s.replace(/\b(?:x|×)\s*\d+.*$/i, "");
  s = s.replace(/\b\d+\s*-\s*\d+\s*(?:reps?|sec|s|min).*$/i, "");
  s = s.replace(/\b\d+\s*(?:reps?|sec|min).*$/i, "");
  s = s.replace(/\bbw\s*\+\s*\d+\s*kg\b.*$/i, "");
  s = s.replace(/\b\d+(?:\.\d+)?\s*kg\b.*$/i, "");
  s = s.replace(/,\s*$/, "").replace(/\s{2,}/g, " ").trim();
  // Hebrew-only name (later appearances have no Latin parenthetical): reverse map.
  if (/[֐-׿]/.test(s) && !/[A-Za-z]/.test(s)) {
    const en = HEBREW_EXERCISE_MAP.get(hebNorm(s));
    if (en) s = en;
  }
  return s.trim();
}

// Match a core name against dictionary + aliases (+ trailing-modifier stripping).
// Returns { status: 'hit' } | { status: 'alias', canonical } | { status: 'miss' }.
export function matchDictionary(core) {
  const n = norm(core);
  if (!n) return { status: "miss" };
  if (NORM_DICT.has(n)) return { status: "hit" };
  if (NORM_ALIAS.has(n)) return { status: "alias", canonical: NORM_ALIAS.get(n) };
  let toks = n.split(" ");
  while (toks.length > 1 && MODIFIER_SET.has(toks[toks.length - 1])) {
    toks = toks.slice(0, -1);
    const nn = toks.join(" ");
    if (NORM_DICT.has(nn)) return { status: "hit" };
    if (NORM_ALIAS.has(nn)) return { status: "hit" }; // accept base, keep bridge descriptor
  }
  return { status: "miss" };
}

// ---------------------------------------------------------------------------
// 8. TSV BLOCK ITERATION (block-aware, delimiter-preserving)
// ---------------------------------------------------------------------------
// transformTsvBlocks walks the program line by line. For each data row inside a
// START_WEEKn_TSV ... END_WEEKn_TSV block it calls rowFn(cells, ctx). rowFn may
// return: undefined/null (no change), a cells array (replacement row), or an
// array-of-cells-arrays (row split into several). Everything else passes through
// untouched, so the machine block structure and all non-TSV prose are preserved.
export function transformTsvBlocks(program, rowFn) {
  const lines = String(program || "").split("\n");
  const out = [];
  let inBlock = false;
  let header = null;
  let exIdx = -1;
  let delim = "\t";
  for (const line of lines) {
    if (/START_WEEK\d+_TSV/.test(line)) { inBlock = true; header = null; exIdx = -1; out.push(line); continue; }
    if (/END_WEEK\d+_TSV/.test(line)) { inBlock = false; header = null; out.push(line); continue; }
    if (!inBlock || !line.trim()) { out.push(line); continue; }
    const d = line.includes("\t") ? "\t" : (line.includes(",") ? "," : null);
    if (!header) {
      delim = d || "\t";
      header = line.split(delim).map((c) => c.trim().toLowerCase());
      exIdx = header.indexOf("exercise");
      out.push(line);
      continue;
    }
    const rowDelim = d || delim;
    const cells = line.split(rowDelim);
    const res = rowFn(cells, { exIdx, header, delim: rowDelim });
    if (res == null) { out.push(line); }
    else if (Array.isArray(res) && res.length && Array.isArray(res[0])) {
      for (const r of res) out.push(r.join(rowDelim));
    } else {
      out.push(res.join(rowDelim));
    }
  }
  return out.join("\n");
}

// Read-only collection of every non-header Exercise cell in the program.
export function collectExerciseRows(program) {
  const rows = [];
  transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx >= 0 && ctx.exIdx < cells.length) {
      rows.push({ exercise: cells[ctx.exIdx], cells: cells.slice(), exIdx: ctx.exIdx });
    }
    return null;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// 9. RETRIABLE ERROR CLASS
// ---------------------------------------------------------------------------
export class RetriableValidationError extends Error {
  constructor(code, amendment, details = {}) {
    super(code);
    this.name = "RetriableValidationError";
    this.code = code;
    this.amendment = amendment;
    this.details = details;
  }
}
export const RETRIABLE_CODES = new Set([
  "EXERCISE_HALLUCINATION", "EQUIPMENT_VIOLATION", "UNILATERAL_UNDERSTIMULATION",
  "INTRADAY_ORDER_VIOLATION", "SPORT_DAY_COUPLING_VIOLATION", "WEEKLY_MRV_EXCEEDED",
]);

// ---------------------------------------------------------------------------
// 10. VALIDATOR: exercise dictionary (zero-hallucination)
// ---------------------------------------------------------------------------
export function validateExercisesAgainstDictionary(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const unknown = [];
  const corrected = [];
  const newProgram = transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx < 0 || ctx.exIdx >= cells.length) return null;
    const cell = cells[ctx.exIdx];
    if (isWarmupCell(cell)) return null; // warmup prep chains are governed by prose rules
    const core = coreExerciseName(cell, isHebrew);
    if (!core) return null;
    const m = matchDictionary(core);
    if (m.status === "hit") return null;
    if (m.status === "alias") {
      corrected.push({ from: core, to: m.canonical });
      cells[ctx.exIdx] = cell.replace(core, m.canonical);
      return cells;
    }
    unknown.push({ exercise: core, row: cell.trim() });
    return null;
  });
  if (unknown.length > 0) {
    const list = unknown.map((u) => `"${u.exercise}"`).join(", ");
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. The following exercise names do NOT exist in " +
      `our dictionary and must be replaced with real ladder entries: [${list}]. ` +
      "Use ONLY exact names from CALISTHENICS_PROGRESSION_RULES or standard barbell/DB terminology.";
    throw new RetriableValidationError("EXERCISE_HALLUCINATION", amendment, { unknown });
  }
  return { program: newProgram, ok: true, unknown, corrected };
}

// Hard-substitute downgrade: neutralize unknown exercises instead of failing.
export function hardSubstituteHallucinations(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const note = "This exercise slot could not be safely generated — please contact support.";
  return transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx < 0 || ctx.exIdx >= cells.length) return null;
    const cell = cells[ctx.exIdx];
    if (isWarmupCell(cell)) return null;
    const core = coreExerciseName(cell, isHebrew);
    if (!core || matchDictionary(core).status !== "miss") return null;
    cells[ctx.exIdx] = "[REVIEW] " + cell.trim();
    const notesIdx = ctx.header.indexOf("notes");
    if (notesIdx >= 0 && notesIdx < cells.length) cells[notesIdx] = note;
    return cells;
  });
}

// ---------------------------------------------------------------------------
// 11. VALIDATOR: equipment vs location
// ---------------------------------------------------------------------------
export function validateEquipmentAgainstLocation(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const effective = computeEffectiveEquipment(intake);
  const location = String(intake.training_location || "").toLowerCase().trim();
  const violations = [];
  for (const row of collectExerciseRows(program)) {
    if (isWarmupCell(row.exercise)) continue;
    const core = coreExerciseName(row.exercise, isHebrew);
    if (!core) continue;
    // resolve to canonical via alias so the requirements map hits.
    const m = matchDictionary(core);
    let canonical = core;
    if (m.status === "alias") canonical = m.canonical;
    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical) ||
      EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonicalFromNorm(core));
    if (!req || req.length === 0) continue;
    const missing = req.filter((t) => !effective.has(t));
    if (missing.length > 0) {
      violations.push({ exercise: core, missing, required: req });
    }
  }
  if (violations.length > 0) {
    const list = violations.map((v) => `"${v.exercise}" (needs ${v.missing.join("+")})`).join(", ");
    const setStr = [...effective].join(", ") || "(bodyweight only)";
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. The following exercises require equipment not " +
      `available at this athlete's training_location='${location}': [${list}]. ` +
      `EFFECTIVE EQUIPMENT SET IS EXACTLY: [${setStr}]. Do NOT prescribe anything outside this set.`;
    throw new RetriableValidationError("EQUIPMENT_VIOLATION", amendment, { violations, effective: [...effective] });
  }
  return { ok: true, violations };
}

function canonicalFromNorm(core) {
  const n = norm(core);
  for (const key of EXERCISE_EQUIPMENT_REQUIREMENTS.keys()) {
    if (norm(key) === n) return key;
  }
  return null;
}

const EQUIPMENT_SUBSTITUTIONS = new Map([
  ["Assault Bike", { outdoor: "Hill Sprints", default: "Burpee EMOM" }],
  ["Rower", { outdoor: "Hill Sprints", default: "Burpee EMOM" }],
  ["Cable Row", { outdoor: "Band Row", default: "Band Row" }],
  ["Seated Cable Row", { outdoor: "Band Row", default: "Band Row" }],
  ["Lat Pulldown", { outdoor: "Pull-up", default: "Band Row" }],
  ["Sled Push", { outdoor: "Weighted Vest Hill Sprint", default: "Heavy Farmer Carry" }],
  ["Sled Drag", { outdoor: "Weighted Vest Hill Sprint", default: "Heavy Farmer Carry" }],
  ["Prowler Push", { outdoor: "Weighted Vest Hill Sprint", default: "Heavy Farmer Carry" }],
  ["Leg Press", { outdoor: "Bulgarian Split Squat", default: "Bulgarian Split Squat" }],
  ["Hack Squat", { outdoor: "Bulgarian Split Squat", default: "Bulgarian Split Squat" }],
  ["Leg Extension", { outdoor: "Split Squat", default: "Split Squat" }],
  ["Leg Curl", { outdoor: "Nordic Hamstring Curl", default: "Nordic Hamstring Curl" }],
]);

export function hardSubstituteEquipment(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const effective = computeEffectiveEquipment(intake);
  const isOutdoor = /outdoor|park/.test(String(intake.training_location || "").toLowerCase());
  return transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx < 0 || ctx.exIdx >= cells.length) return null;
    const cell = cells[ctx.exIdx];
    if (isWarmupCell(cell)) return null;
    const core = coreExerciseName(cell, isHebrew);
    const m = matchDictionary(core);
    const canonical = m.status === "alias" ? m.canonical : (canonicalFromNorm(core) || core);
    const req = EXERCISE_EQUIPMENT_REQUIREMENTS.get(canonical);
    if (!req || req.length === 0) return null;
    if (req.every((t) => effective.has(t))) return null;
    const sub = EQUIPMENT_SUBSTITUTIONS.get(canonical);
    const replacement = sub ? (isOutdoor ? sub.outdoor : sub.default) : (isOutdoor ? "Hill Sprints" : "Burpee EMOM");
    cells[ctx.exIdx] = cell.replace(core, replacement);
    const notesIdx = ctx.header.indexOf("notes");
    if (notesIdx >= 0 && notesIdx < cells.length) {
      cells[notesIdx] = `Substituted for ${core}: not available at your training location.`;
    }
    return cells;
  });
}

// ---------------------------------------------------------------------------
// 12. VALIDATOR: unilateral intensity floor / lockout
// ---------------------------------------------------------------------------
function matchesLockedOut(core) {
  const n = norm(core);
  if (LOCKED_OUT_NORM.has(n)) return true;
  for (const locked of LOCKED_OUT_NORM) {
    if (n === locked || n.startsWith(locked + " ")) return true;
  }
  return false;
}

export function enforceUnilateralIntensityFloor(program, intake = {}) {
  if (!ELITE_UNILATERAL_TRIGGER(intake)) return { ok: true, triggered: false, violations: [] };
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const violations = [];
  for (const row of collectExerciseRows(program)) {
    if (isWarmupCell(row.exercise)) continue; // locked-out moves may appear in warmups
    const core = coreExerciseName(row.exercise, isHebrew);
    if (core && matchesLockedOut(core)) violations.push({ exercise: core });
  }
  if (violations.length > 0) {
    const raw = typeof intake.current_numbers === "string"
      ? intake.current_numbers : JSON.stringify(intake.current_numbers || "");
    const list = violations.map((v) => `"${v.exercise}"`).join(", ");
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. This athlete demonstrates elite unilateral leg " +
      `strength (parsed benchmark: ${raw}). The following working-set exercises are ` +
      `UNDER-STIMULATING and are LOCKED OUT of primary/secondary working sets: [${list}]. ` +
      "Replace with one of these vectors: (1) matched loaded Bulgarian Split Squat at the " +
      "calibrated %1RM; (2) Weighted Pistol progression; (3) plyometrics (Depth Jumps, " +
      "Single-Leg Box Jumps, Split Squat Jumps); (4) Sprint or Hill Sprint intervals (only " +
      "if training_location permits — check LOCATION_EQUIPMENT_WHITELIST); (5) tempo-driven " +
      "work (5s eccentric on Pistol/Bulgarian). Refer to UNILATERAL_LEG_INTENSITY_RULES for calibration.";
    throw new RetriableValidationError("UNILATERAL_UNDERSTIMULATION", amendment, { violations });
  }
  return { ok: true, triggered: true, violations };
}

export function hardSubstituteUnilateral(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const eff = computeEffectiveEquipment(intake);
  const hasLoad = eff.has("barbell") || eff.has("dumbbells") || eff.has("kettlebells");
  const isOutdoor = /outdoor|park/.test(String(intake.training_location || "").toLowerCase());
  return transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx < 0 || ctx.exIdx >= cells.length) return null;
    const cell = cells[ctx.exIdx];
    if (isWarmupCell(cell)) return null;
    const core = coreExerciseName(cell, isHebrew);
    if (!core || !matchesLockedOut(core)) return null;
    let replacement;
    if (hasLoad) replacement = "Bulgarian Split Squat";       // at calibrated load
    else if (isOutdoor) replacement = "Single-Leg Box Jump";
    else replacement = "Weighted Pistol Squat";
    // final fallback if none of the above make sense
    if (!replacement) replacement = "5-Second Eccentric Pistol Squat";
    cells[ctx.exIdx] = cell.replace(core, replacement);
    const notesIdx = ctx.header.indexOf("notes");
    if (notesIdx >= 0 && notesIdx < cells.length) {
      cells[notesIdx] = `Substituted for ${core}: your benchmark shows the original would be under-stimulating.`;
    }
    return cells;
  });
}

// ---------------------------------------------------------------------------
// 13. WARMUP CELL SPLITTER
// ---------------------------------------------------------------------------
const SETS_REPS_RE = /(?:\d+\s*(?:x|×)\s*\d+)|(?:(?:x|×)\s*\d+)|(?:\d+\s*(?:reps?|sec|s\b|min|דק|שנ))|(?:\d+\s*-\s*\d+\s*(?:reps?|sec|min))/i;

function hasSetsReps(fragment) {
  return SETS_REPS_RE.test(fragment);
}

// Raz clarified (v19 finish): combined warmup drills must NOT explode into many
// TSV rows — that makes the spreadsheet too long. Instead keep ONE row and put
// each drill on its own line INSIDE the Exercise cell, separated by an escaped
// "\n". The [WARMUP]/[חימום] prefix (and an optional "General prep:" label)
// stays ONCE at the top; each drill follows on its own line. A real newline
// would break the delimiter-based TSV parser downstream, so we emit the literal
// two-character escape "\n" and rely on wrapText in the spreadsheet builder.
const WARMUP_LABEL_RE = /(prep|ramp|primer|warm|mobility|activation|general|specific|prehab|הכנה|ראמפ|פריימר|חימום|כללי|ספציפי)/i;

export function reformatWarmupCells(program) {
  return transformTsvBlocks(program, (cells, ctx) => {
    if (ctx.exIdx < 0 || ctx.exIdx >= cells.length) return null;
    const cell = cells[ctx.exIdx];
    if (cell.includes("\\n")) return null; // already reformatted
    const pm = cell.match(/^(\s*"?\s*)(\[(?:WARMUP|חימום)\])\s*(.*)$/i);
    if (!pm) return null; // not a warmup row
    const lead = pm[1];
    const prefix = pm[2];
    let body = pm[3];

    // Peel off an optional leading "General prep:" style label so it sits on its
    // own first line rather than being glued to the first drill.
    let label = "";
    const lm = body.match(/^([^:;]{1,40}):\s*(.*)$/);
    if (lm && WARMUP_LABEL_RE.test(lm[1])) {
      label = lm[1].trim() + ":";
      body = lm[2].trim();
    }

    // 1) Semicolon split (strong separator).
    let fragments = body.split(";").map((f) => f.trim()).filter(Boolean);
    // 2) If only one fragment, try comma split — but only when at least two
    //    comma-fragments carry their OWN sets/reps notation (else it's one drill
    //    with a descriptive clause, e.g. "Dead Bug, slow tempo").
    if (fragments.length <= 1) {
      const commaParts = body.split(",").map((f) => f.trim()).filter(Boolean);
      const withNotation = commaParts.filter(hasSetsReps).length;
      if (commaParts.length > 1 && withNotation >= 2) fragments = commaParts;
    }
    // Skip: single fragment (a lone compound movement with no separators).
    if (fragments.length <= 1) return null;

    const joined = fragments.join("\\n");
    const newBody = label ? `${label}\\n${joined}` : joined;
    cells[ctx.exIdx] = `${lead}${prefix} ${newBody}`;
    return cells;
  });
}

// Preserve the old export name so server.js and any callers keep working.
export const splitWarmupRows = reformatWarmupCells;

// ---------------------------------------------------------------------------
// 14. ROW CLASSIFICATION + BLOCK-LEVEL (day-grouped) TSV ITERATION
// ---------------------------------------------------------------------------
// Several v19-finish validators need to reason about a whole training day (group
// of consecutive rows sharing a Day token) rather than a single row. eachTsvBlock
// hands a blockFn the parsed data rows of each week block; the fn returns the new
// rows (already reordered/edited) which are re-serialized with the block's delim.
export function eachTsvBlock(program, blockFn) {
  const lines = String(program || "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/START_WEEK\d+_TSV/.test(line)) {
      out.push(line);
      i++;
      // header line
      while (i < lines.length && !lines[i].trim() && !/END_WEEK\d+_TSV/.test(lines[i])) {
        out.push(lines[i]); i++;
      }
      if (i >= lines.length || /END_WEEK\d+_TSV/.test(lines[i])) continue;
      const headerLine = lines[i];
      const delim = headerLine.includes("\t") ? "\t" : (headerLine.includes(",") ? "," : "\t");
      const header = headerLine.split(delim).map((c) => c.trim().toLowerCase());
      out.push(headerLine);
      i++;
      const dataRows = [];
      while (i < lines.length && !/END_WEEK\d+_TSV/.test(lines[i])) {
        if (lines[i].trim()) dataRows.push(lines[i].split(delim));
        i++;
      }
      const newRows = blockFn(dataRows, { header, delim }) || dataRows;
      for (const r of newRows) out.push(r.join(delim));
      // The END line (if present) is emitted on the next loop iteration.
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

function colIdx(header, ...names) {
  for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
  return -1;
}
function cellAt(cells, idx) { return idx >= 0 && idx < cells.length ? String(cells[idx] || "") : ""; }

function parseIntensity(s) {
  const t = String(s || "").toLowerCase();
  let rir = null, rpe = null;
  let m = t.match(/rir\s*(\d+(?:\.\d+)?)/); if (m) rir = parseFloat(m[1]);
  m = t.match(/rpe\s*(\d+(?:\.\d+)?)/); if (m) rpe = parseFloat(m[1]);
  return { rir, rpe };
}
function parseRepsLow(s) {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
function parseSetsCount(s) {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

const COMPOUND_RE = /squat|deadlift|bench|press|row|pull ?up|chin ?up|clean|snatch|muscle ?up|dip|lunge|split squat|hip thrust|pistol|front lever|planche|handstand|hspu|thruster/i;
const CONDITIONING_HARD_RE = /air ?bike|assault bike|echo bike|fan bike|sprint interval|hill sprint|sled push|sled drag|prowler|rowing interval|row erg interval|battle rope|burpee emom|emom|shuttle|conditioning|metcon|intervals?/i;
const CONDITIONING_EASY_RE = /zone[-\s]?2|z2|easy jog|easy run|steady state|steady[-\s]?state|light row|tempo run|easy bike|recovery spin|light jog/i;
const MOBILITY_RE = /stretch|breath|sauna|foam roll|foam-roll|cool[-\s]?down|cooldown|mobility|down ?reg|nasal breathing/i;

// Movement-pattern buckets for MRV accounting.
function patternOf(core) {
  const n = norm(core);
  if (!n) return null;
  if (/(pull up|chin up|\brow\b|lat pulldown|face pull|muscle up|front lever|inverted row|pull apart|pullover|\bcurl\b)/.test(n)) return "pull";
  if (/(press|bench|\bdip\b|push up|handstand push up|planche|lateral raise|\bfly\b|pushdown|pallof)/.test(n)) {
    if (/pallof/.test(n)) return "core";
    return "push";
  }
  if (/(deadlift|romanian|\brdl\b|hip thrust|good morning|swing|nordic|leg curl|glute|hinge|hyper|back extension)/.test(n)) return "hinge";
  if (/(squat|lunge|split squat|pistol|step up|leg press|leg extension|hack|box jump|skater|shrimp|cossack|calf)/.test(n)) return "squat";
  if (/(plank|hollow|l sit|sit up|crunch|leg raise|toes to bar|knee raise|dead bug|bird dog|russian twist|v up|flutter|superman|core|ab wheel|rollout)/.test(n)) return "core";
  if (/(bike|rower|\brow erg|treadmill|ski erg|run|jog|sprint|sled|prowler|burpee|jump rope|skipping|shuttle|carry|conditioning)/.test(n)) return "aerobic";
  return null;
}

// Classify a single non-warmup row into an intraday-order class.
function classifyRow(cells, header, isHebrew) {
  const exIdx = colIdx(header, "exercise");
  const raw = cellAt(cells, exIdx);
  if (isWarmupCell(raw)) return "warmup";
  const core = coreExerciseName(raw, isHebrew);
  const low = raw.toLowerCase();
  const reps = parseRepsLow(cellAt(cells, colIdx(header, "reps", "reps/duration", "duration")));
  const { rir, rpe } = parseIntensity(
    cellAt(cells, colIdx(header, "target rpe", "rpe", "load/rir", "load/rir/rpe")) + " " +
    cellAt(cells, colIdx(header, "notes"))
  );

  if (MOBILITY_RE.test(low)) return "mobility_finisher";
  const intervalNotation = /\b\d+\s*(?:x|×)\s*\d+\s*s\b.*\/\s*\d+\s*s|\bon\/off\b|\d+\s*s\s*\/\s*\d+\s*s/i.test(low);
  if (CONDITIONING_HARD_RE.test(low) || (rpe != null && rpe >= 9) || intervalNotation) return "conditioning_hard";
  if (CONDITIONING_EASY_RE.test(low) || (rpe != null && rpe <= 6 && patternOf(core) === "aerobic")) return "conditioning_easy";

  const highIntensity = (rir != null && rir <= 2) || (rpe != null && rpe >= 7.5);
  if (reps != null && reps <= 5 && highIntensity) return "strength_primary";
  const secondaryInt = (rir != null && rir >= 1 && rir <= 3) || (rpe != null && rpe >= 6.5);
  if (reps != null && reps >= 6 && reps <= 10 && secondaryInt && COMPOUND_RE.test(core)) return "strength_secondary";
  if (patternOf(core) === "aerobic") return "conditioning_easy";
  return "accessory";
}

const INTRADAY_RANK = {
  warmup: 0, strength_primary: 1, strength_secondary: 2, accessory: 3,
  conditioning_hard: 4, conditioning_easy: 5, mobility_finisher: 6,
};

function dayTokenOf(cells, header) {
  return cellAt(cells, colIdx(header, "day")).trim();
}

// Split a block's rows into ordered day-groups. Rows carry a Day token only on
// the first row of each day (the spreadsheet merges the rest), so blanks inherit.
function groupByDay(dataRows, header) {
  const groups = [];
  let cur = null, lastDay = "";
  for (const cells of dataRows) {
    let day = dayTokenOf(cells, header);
    if (day) lastDay = day; else day = lastDay;
    if (!cur || cur.day !== day) { cur = { day, rows: [] }; groups.push(cur); }
    cur.rows.push(cells);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 15. VALIDATOR (FIX B): intraday conditioning-follows-strength ordering
// ---------------------------------------------------------------------------
// Hard conditioning fries the CNS and wrecks subsequent strength quality, so
// within a day the order must be warmup -> primary -> secondary -> accessory ->
// hard conditioning -> easy conditioning -> mobility. We stable-sort each day by
// that rank (preserving the LLM's order within a class). We only THROW when the
// day is incoherent — a strength_secondary appearing before a strength_primary —
// otherwise we silently reorder and annotate any moved hard-conditioning row.
export function enforceIntradayConditioningOrder(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const conflicts = [];
  const newProgram = eachTsvBlock(program, (dataRows, { header }) => {
    const notesIdx = colIdx(header, "notes");
    const groups = groupByDay(dataRows, header);
    const outRows = [];
    for (const g of groups) {
      const tagged = g.rows.map((cells, origIdx) => ({
        cells, origIdx, cls: classifyRow(cells, header, isHebrew),
      }));
      // Incoherence check: a secondary strictly before a primary.
      const firstPrimary = tagged.findIndex((t) => t.cls === "strength_primary");
      const firstSecondary = tagged.findIndex((t) => t.cls === "strength_secondary");
      if (firstSecondary >= 0 && firstPrimary >= 0 && firstSecondary < firstPrimary) {
        conflicts.push({ day: g.day });
      }
      // Which conditioning_hard rows sit before any strength row? Those get moved.
      const lastStrength = Math.max(
        -1,
        ...tagged.filter((t) => t.cls === "strength_primary" || t.cls === "strength_secondary").map((t) => t.origIdx)
      );
      const sorted = tagged
        .map((t, i) => ({ ...t, stable: i }))
        .sort((a, b) => (INTRADAY_RANK[a.cls] - INTRADAY_RANK[b.cls]) || (a.stable - b.stable));
      for (const t of sorted) {
        if (t.cls === "conditioning_hard" && t.origIdx < lastStrength && notesIdx >= 0 && notesIdx < t.cells.length) {
          const existing = String(t.cells[notesIdx] || "").trim();
          const note = "Reordered: hard conditioning must follow strength work per intraday-order rules.";
          t.cells[notesIdx] = existing ? `${existing} ${note}` : note;
        }
        outRows.push(t.cells);
      }
    }
    return outRows;
  });
  if (conflicts.length > 0) {
    const days = [...new Set(conflicts.map((c) => c.day))].join(", ");
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. Within a training day the order MUST be: " +
      "warm-up, then primary strength, then secondary strength, then accessories, then " +
      "hard conditioning, then easy conditioning, then mobility/finisher. The following " +
      `day(s) placed strength work out of order (secondary before primary): [${days}]. ` +
      "Re-sequence each day so the heaviest, most technical strength work comes first and " +
      "all hard conditioning (Airbike/sprints/intervals) comes AFTER strength.";
    throw new RetriableValidationError("INTRADAY_ORDER_VIOLATION", amendment, { conflicts });
  }
  return newProgram;
}

// Downgrade: force the reorder even for incoherent days (never throws).
export function forceIntradayReorder(program, intake = {}) {
  try { return enforceIntradayConditioningOrder(program, intake); }
  catch (_) {
    const isHebrew = String(intake.language || "").toLowerCase() === "he";
    return eachTsvBlock(program, (dataRows, { header }) => {
      const groups = groupByDay(dataRows, header);
      const outRows = [];
      for (const g of groups) {
        const tagged = g.rows.map((cells, i) => ({ cells, stable: i, cls: classifyRow(cells, header, isHebrew) }));
        tagged.sort((a, b) => (INTRADAY_RANK[a.cls] - INTRADAY_RANK[b.cls]) || (a.stable - b.stable));
        for (const t of tagged) outRows.push(t.cells);
      }
      return outRows;
    });
  }
}

// ---------------------------------------------------------------------------
// 16. VALIDATOR (FIX C): sport-day coupling / 48h heavy-lift recovery
// ---------------------------------------------------------------------------
const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function dayIndex(tok) {
  const t = String(tok || "").toLowerCase().slice(0, 3);
  return WEEK_ORDER.indexOf(t);
}
function parseSportDays(intake) {
  const raw = intake.sport_days;
  let toks = [];
  if (Array.isArray(raw)) toks = raw;
  else if (typeof raw === "string") toks = raw.split(/[,;/|\s]+/);
  return toks.map(dayIndex).filter((i) => i >= 0);
}
// Sport days are hard unless the intake explicitly scopes them to technique only.
function sportIsHard(intake) {
  const s = String(intake.sport_intensity || "").toLowerCase();
  if (!s) return true;
  const hard = /(hard|spar|roll|intense|competition|comp\b|live)/.test(s);
  const techOnly = /(technique|tech|drill|light|easy)/.test(s) && !hard;
  return techOnly ? false : true;
}
const LOWER_PATTERN_RE = /squat|deadlift|lunge|pistol|hip thrust|hinge|split squat|step up|leg press|good morning/i;
const UPPER_PATTERN_RE = /press|bench|\brow\b|pull up|chin up|\bohp\b|overhead|\bdip\b|muscle up/i;

function classifyDayType(rows, header, isHebrew) {
  if (!rows.length) return "rest";
  const exIdx = colIdx(header, "exercise");
  let primaryLower = false, primaryUpper = false, hasStrength = false, hasCond = false;
  for (const cells of rows) {
    const cls = classifyRow(cells, header, isHebrew);
    const core = coreExerciseName(cellAt(cells, exIdx), isHebrew);
    if (cls === "strength_primary" || cls === "strength_secondary") {
      hasStrength = true;
      if (LOWER_PATTERN_RE.test(core)) primaryLower = true;
      else if (UPPER_PATTERN_RE.test(core)) primaryUpper = true;
    }
    if (cls === "conditioning_hard" || cls === "conditioning_easy") hasCond = true;
  }
  if (primaryLower) return "heavy_lower";
  if (primaryUpper) return "heavy_upper";
  if (hasStrength) return "mixed";
  if (hasCond) return "conditioning";
  return "rest";
}

// Build a 7-slot week timeline of strength day types keyed by day-of-week.
function buildStrengthTimeline(program, intake) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const timeline = Array(7).fill("rest");
  eachTsvBlock(program, (dataRows, { header }) => {
    const groups = groupByDay(dataRows, header);
    for (const g of groups) {
      const idx = dayIndex(g.day);
      if (idx >= 0) timeline[idx] = classifyDayType(g.rows, header, isHebrew);
    }
    return dataRows; // read-only
  });
  return timeline;
}

export function validateSportDayCoupling(program, intake = {}) {
  const sportDays = parseSportDays(intake);
  if (!sportDays.length) return { ok: true, violations: [] };
  const hard = sportIsHard(intake);
  const strength = buildStrengthTimeline(program, intake);
  const sport = Array(7).fill(null);
  for (const idx of sportDays) sport[idx] = hard ? "sport_hard" : "sport_technique";

  const violations = [];
  const name = (i) => WEEK_ORDER[i].charAt(0).toUpperCase() + WEEK_ORDER[i].slice(1);
  for (let i = 0; i < 6; i++) {
    const a = i, b = i + 1;
    // Rule 1: heavy_lower immediately BEFORE a hard sport day.
    if (strength[a] === "heavy_lower" && sport[b] === "sport_hard") {
      violations.push({ type: "lower_before_sport", days: [name(a), name(b)] });
    }
    // Rule 2: heavy_lower immediately AFTER a hard sport day.
    if (sport[a] === "sport_hard" && strength[b] === "heavy_lower") {
      violations.push({ type: "lower_after_sport", days: [name(a), name(b)] });
    }
    // Rule 3: two heavy_lower days back-to-back.
    if (strength[a] === "heavy_lower" && strength[b] === "heavy_lower") {
      violations.push({ type: "back_to_back_lower", days: [name(a), name(b)] });
    }
    // Rule 4: two heavy_upper days back-to-back (allowed only if the second is
    // demonstrably lighter — which we cannot verify from data, so flag).
    if (strength[a] === "heavy_upper" && strength[b] === "heavy_upper") {
      violations.push({ type: "back_to_back_upper", days: [name(a), name(b)] });
    }
  }
  if (violations.length > 0) {
    const list = violations.map((v) => `${v.type} (${v.days.join("->")})`).join(", ");
    const sportPattern = Array.isArray(intake.sport_days)
      ? intake.sport_days.join("/") : String(intake.sport_days || "");
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. This athlete trains a sport on: " +
      `[${sportPattern}] (intensity: ${intake.sport_intensity || "assumed hard"}). ` +
      "Leave at least 48h between any heavy lower-body strength day and a hard sport day, " +
      "and never place two heavy lower days back-to-back. Conflicts detected: " +
      `[${list}]. Re-plan the week so heavy squat/deadlift days are ≥48h from hard sport sessions.`;
    throw new RetriableValidationError("SPORT_DAY_COUPLING_VIOLATION", amendment, { violations, sportDays });
  }
  return { ok: true, violations };
}

// Downgrade: swap the strength CONTENT of a conflicting heavy_lower day with an
// earlier heavy_upper day so heavy lower moves ≥48h from the sport day. Day
// sequence (user-chosen training days) is preserved; only the block contents
// swap. Best-effort — if no safe swap target exists, annotate and return as-is.
export function swapSportDayContent(program, intake = {}) {
  const sportDays = parseSportDays(intake);
  if (!sportDays.length) return program;
  const hard = sportIsHard(intake);
  const strength = buildStrengthTimeline(program, intake);
  const sportHardDays = new Set(sportDays.filter(() => hard));
  // Find a heavy_lower day adjacent to a hard sport day, and a heavy_upper day
  // that is NOT adjacent to any hard sport day, to receive the lower block.
  let fromIdx = -1, toIdx = -1;
  const adjSportHard = (i) => sportHardDays.has(i - 1) || sportHardDays.has(i + 1);
  for (let i = 0; i < 7; i++) {
    if (strength[i] === "heavy_lower" && adjSportHard(i)) { fromIdx = i; break; }
  }
  if (fromIdx >= 0) {
    for (let j = 0; j < 7; j++) {
      if (strength[j] === "heavy_upper" && !adjSportHard(j)) { toIdx = j; break; }
    }
  }
  if (fromIdx < 0 || toIdx < 0) return program;
  const fromDay = WEEK_ORDER[fromIdx], toDay = WEEK_ORDER[toIdx];
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  return eachTsvBlock(program, (dataRows, { header }) => {
    const notesIdx = colIdx(header, "notes");
    const dayIdxCol = colIdx(header, "day");
    const groups = groupByDay(dataRows, header);
    const gFrom = groups.find((g) => dayIndex(g.day) === fromIdx);
    const gTo = groups.find((g) => dayIndex(g.day) === toIdx);
    if (gFrom && gTo) {
      const note = `Swapped ${WEEK_ORDER[fromIdx]}/${WEEK_ORDER[toIdx]} strength content: 48h recovery needed before hard sport session.`;
      const relabel = (rows, dayTok) => rows.map((cells, k) => {
        const r = cells.slice();
        if (dayIdxCol >= 0 && dayIdxCol < r.length) r[dayIdxCol] = k === 0 ? capitalize(dayTok) : "";
        if (notesIdx >= 0 && notesIdx < r.length && k === 0) {
          const ex = String(r[notesIdx] || "").trim();
          r[notesIdx] = ex ? `${ex} ${note}` : note;
        }
        return r;
      });
      const fromContent = relabel(gFrom.rows, fromDay);
      const toContent = relabel(gTo.rows, toDay);
      gFrom.rows = toContent;
      gTo.rows = fromContent;
    }
    const outRows = [];
    for (const g of groups) for (const r of g.rows) outRows.push(r);
    return outRows;
  });
}
function capitalize(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }

// ---------------------------------------------------------------------------
// 17. VALIDATOR (FIX D): weekly MEV/MRV volume budget (sport-aware)
// ---------------------------------------------------------------------------
// Per-session "hard sets equivalent" cost of a sport session, by movement
// pattern. Conservative coaching heuristics — hybrid athletes accumulate real
// systemic stress from their sport that must count against weekly MRV.
export const SPORT_STRESS_MAP = {
  BJJ_hard_roll:      { pull: 6, push: 4, squat: 4, hinge: 3, core: 8, aerobic: 12 },
  BJJ_technique:      { pull: 2, push: 1, squat: 1, hinge: 1, core: 3, aerobic: 3 },
  MMA_sparring:       { pull: 5, push: 6, squat: 3, hinge: 3, core: 8, aerobic: 15 },
  Boxing_bag_pad:     { pull: 1, push: 5, squat: 1, hinge: 1, core: 4, aerobic: 12 },
  Boxing_sparring:    { pull: 2, push: 6, squat: 2, hinge: 2, core: 6, aerobic: 15 },
  Running_intervals:  { squat: 4, hinge: 4, aerobic: 20 },
  Running_easy_long:  { squat: 2, hinge: 2, aerobic: 15 },
  Swimming_intervals: { pull: 6, push: 4, core: 6, aerobic: 15 },
  Swimming_easy:      { pull: 3, push: 2, core: 3, aerobic: 10 },
};

export const MRV_CEILINGS = { pull: 25, push: 22, squat: 18, hinge: 14, core: 20, aerobic: 40 };

const EMPTY_PATTERN_TOTALS = () => ({ pull: 0, push: 0, squat: 0, hinge: 0, core: 0, aerobic: 0 });

function detectSport(text) {
  const s = String(text || "").toLowerCase();
  const heb = hebNorm(String(text || ""));
  if (/bjj|jiu|jitsu|grappl|גויוגיטסו|גויו|גיטסו/.test(s) || /גויו|גיטסו/.test(heb)) return "BJJ";
  if (/mma|mixed martial/.test(s)) return "MMA";
  if (/box|איגרוף/.test(s) || /איגרוף/.test(heb)) return "Boxing";
  if (/run|jog|ריצה/.test(s) || /ריצה/.test(heb)) return "Running";
  if (/swim|שחייה|שחיה/.test(s) || /שחייה|שחיה/.test(heb)) return "Swimming";
  return null;
}
function sportKeys(sport) {
  switch (sport) {
    case "BJJ": return { hard: "BJJ_hard_roll", tech: "BJJ_technique" };
    case "MMA": return { hard: "MMA_sparring", tech: "MMA_sparring" };
    case "Boxing": return { hard: "Boxing_sparring", tech: "Boxing_bag_pad" };
    case "Running": return { hard: "Running_intervals", tech: "Running_easy_long" };
    case "Swimming": return { hard: "Swimming_intervals", tech: "Swimming_easy" };
    default: return null;
  }
}

export function estimateSportStress(intake = {}) {
  const totals = EMPTY_PATTERN_TOTALS();
  const sport = detectSport(
    [intake.sport, intake.sport_name, intake.sport_intensity, intake.sports].filter(Boolean).join(" ")
  );
  if (!sport) return totals;
  const keys = sportKeys(sport);
  if (!keys) return totals;

  // Session count: prefer explicit sport_days, else parse "Nx" from intensity.
  let sessions = 0;
  if (Array.isArray(intake.sport_days)) sessions = intake.sport_days.length;
  else if (typeof intake.sport_days === "string") sessions = intake.sport_days.split(/[,;/|\s]+/).filter(Boolean).length;
  const intensity = String(intake.sport_intensity || "");
  if (!sessions) {
    const m = intensity.match(/(\d+)\s*x/i);
    if (m) sessions = parseInt(m[1], 10);
  }
  if (!sessions) return totals;

  // Split hard vs technique sessions if the intensity string breaks it down.
  let hardCount = 0, techCount = 0;
  const hardM = intensity.match(/(\d+)\s*x?[^.,;]*?(hard|roll|spar|intense|live|comp)/i);
  const techM = intensity.match(/(\d+)\s*x?[^.,;]*?(tech|drill|light|easy)/i);
  if (hardM) hardCount = parseInt(hardM[1], 10);
  if (techM) techCount = parseInt(techM[1], 10);
  if (hardCount + techCount === 0) {
    if (/tech|drill|light|easy/i.test(intensity) && !/hard|roll|spar|intense|live/i.test(intensity)) techCount = sessions;
    else hardCount = sessions; // default: treat sport as hard
  } else if (hardCount + techCount < sessions) {
    hardCount += sessions - hardCount - techCount; // remainder counts as hard
  }

  const add = (key, mult) => {
    const cost = SPORT_STRESS_MAP[key] || {};
    for (const p of Object.keys(totals)) totals[p] += (cost[p] || 0) * mult;
  };
  add(keys.hard, hardCount);
  add(keys.tech, techCount);
  return totals;
}

// Count strength hard sets per movement pattern from the program's TSV rows.
export function countStrengthVolume(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const totals = EMPTY_PATTERN_TOTALS();
  for (const row of collectExerciseRows(program)) {
    if (isWarmupCell(row.exercise)) continue;
    const core = coreExerciseName(row.exercise, isHebrew);
    const pattern = patternOf(core);
    if (!pattern) continue;
    // collectExerciseRows keeps the raw cells; find sets via a heuristic: the
    // first purely-numeric small cell after the exercise cell is the Sets count.
    const sets = setsFromCells(row.cells, row.exIdx);
    totals[pattern] += sets;
  }
  return totals;
}
function setsFromCells(cells, exIdx) {
  for (let i = exIdx + 1; i < cells.length; i++) {
    const v = String(cells[i] || "").trim();
    if (/^\d{1,2}$/.test(v)) return parseInt(v, 10); // Sets is a bare small integer
  }
  return 0;
}

export function validateWeeklyVolumeBudget(program, intake = {}) {
  const strength = countStrengthVolume(program, intake);
  const sport = estimateSportStress(intake);
  const totals = EMPTY_PATTERN_TOTALS();
  const over = [];
  for (const p of Object.keys(totals)) {
    totals[p] = (strength[p] || 0) + (sport[p] || 0);
    if (totals[p] > MRV_CEILINGS[p]) {
      over.push({ pattern: p, total: totals[p], ceiling: MRV_CEILINGS[p], strength: strength[p] || 0, sport: sport[p] || 0 });
    }
  }
  if (over.length > 0) {
    const list = over.map((o) => `${o.pattern}: ${o.total} (${o.strength} strength + ${o.sport} sport) vs ceiling ${o.ceiling}`).join("; ");
    const amendment =
      "PRIOR ATTEMPT FAILED VALIDATION. Total weekly stimulus exceeds this athlete's MRV " +
      "once sport volume is counted. Over-budget movement patterns: [" + list + "]. " +
      "Reduce programmed strength sets in those patterns so the combined strength + sport " +
      "load stays at or below the ceiling. Prioritize keeping primary/secondary strength; " +
      "cut accessory volume first.";
    throw new RetriableValidationError("WEEKLY_MRV_EXCEEDED", amendment, { over, totals, strength, sport });
  }
  return { ok: true, over, totals, strength, sport };
}

// Downgrade: trim the lowest-priority (accessory) sets in over-budget patterns
// until each is at/under ceiling. Primary/secondary strength is preserved.
export function trimAccessorySets(program, intake = {}) {
  const isHebrew = String(intake.language || "").toLowerCase() === "he";
  const { over } = safeBudget(program, intake);
  if (!over || !over.length) return program;
  const need = {};
  for (const o of over) need[o.pattern] = o.total - o.ceiling;

  return eachTsvBlock(program, (dataRows, { header }) => {
    const exIdx = colIdx(header, "exercise");
    const setsIdx = colIdx(header, "sets");
    const notesIdx = colIdx(header, "notes");
    const out = [];
    for (const cells of dataRows) {
      const raw = cellAt(cells, exIdx);
      if (isWarmupCell(raw)) { out.push(cells); continue; }
      const core = coreExerciseName(raw, isHebrew);
      const pattern = patternOf(core);
      const cls = classifyRow(cells, header, isHebrew);
      if (pattern && cls === "accessory" && (need[pattern] || 0) > 0) {
        const sets = parseSetsCount(cellAt(cells, setsIdx));
        if (sets > 0) {
          const cut = Math.min(sets, need[pattern]);
          const remaining = sets - cut;
          need[pattern] -= cut;
          if (remaining <= 0) {
            // Drop the row entirely.
            continue;
          }
          const r = cells.slice();
          if (setsIdx >= 0 && setsIdx < r.length) r[setsIdx] = String(remaining);
          if (notesIdx >= 0 && notesIdx < r.length) {
            const ex = String(r[notesIdx] || "").trim();
            const note = `Trimmed ${cut} accessory set(s) for ${pattern} to stay within weekly MRV given sport volume.`;
            r[notesIdx] = ex ? `${ex} ${note}` : note;
          }
          out.push(r);
          continue;
        }
      }
      out.push(cells);
    }
    return out;
  });
}
function safeBudget(program, intake) {
  try { return validateWeeklyVolumeBudget(program, intake); }
  catch (e) { return e.details || { over: [] }; }
}

// ---------------------------------------------------------------------------
// 18. HARD-SUBSTITUTE DISPATCH (used by the retry loop after 3 failures)
// ---------------------------------------------------------------------------
export function hardSubstitute(code, program, intake) {
  switch (code) {
    case "EXERCISE_HALLUCINATION": return hardSubstituteHallucinations(program, intake);
    case "EQUIPMENT_VIOLATION": return hardSubstituteEquipment(program, intake);
    case "UNILATERAL_UNDERSTIMULATION": return hardSubstituteUnilateral(program, intake);
    case "INTRADAY_ORDER_VIOLATION": return forceIntradayReorder(program, intake);
    case "SPORT_DAY_COUPLING_VIOLATION": return swapSportDayContent(program, intake);
    case "WEEKLY_MRV_EXCEEDED": return trimAccessorySets(program, intake);
    default: return program;
  }
}
