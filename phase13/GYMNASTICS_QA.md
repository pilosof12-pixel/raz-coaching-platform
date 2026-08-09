# Gymnastics and Advanced Bodyweight QA

Purpose: keep the skill engine grounded in real, coach-verified exercises. A name that is not present in the authoritative Exercise Library must not be invented by the model.

## High confidence fixes already applied

* Removed `90-Degree Wall Handstand Push-up` from the canonical dictionary and HSPU ladder.
* Added hard rejection for wall-supported / wall-assisted Human Flag inventions.
* Added hard rejection for the fabricated 90-degree wall HSPU name.
* Reframed HSPU logic into base pressing strength, freestanding control, and target-specific 90-degree exposure instead of one fake linear ladder.

## Skill families currently mapped

* planche: Full Planche
* front_lever: Full Front Lever
* back_lever: Full Back Lever
* human_flag: Full Human Flag
* iron_cross: Iron Cross
* maltese: Maltese
* victorian: Victorian
* manna: Manna
* hspu: Freestanding 90-Degree Handstand Push-up
* one_arm_pull_up: One-Arm Pull-up
* one_arm_handstand: Freestanding One-Arm Handstand
* handstand_walk: 10-meter Handstand Walk

## Graph names not currently present as exact Exercise Library headings

These are not automatically wrong. Some are spelling aliases or coach-valid progressions. They need one of three actions: map to an existing canonical library name, add a proper library entry, or remove them from the graph.

### Full Planche
* Planche Lean
* Tuck Planche
* Advanced Tuck Planche
* Straddle Planche
* Half-Lay Planche
* Full Planche
* Pseudo Planche Push-up
* Wrist Prep
* Planche Push-up
* Straddle Planche Push-up

### Full Front Lever
* Tuck Front Lever
* Single-Leg Front Lever
* Half-Lay Front Lever
* Scapular Pull-up
* Front Lever Raise
* Front Lever Pull

### Full Back Lever
* Tuck Back Lever
* Advanced Tuck Back Lever
* Skin the Cat

### Full Human Flag
* Side Plank
* Vertical Pull to Tuck
* Tuck Human Flag
* One-Leg Tuck Human Flag
* Straddle Human Flag
* Full Human Flag
* Side Plank Hip Dip

### Iron Cross
* Skin the Cat
* Straddle L Ring Support
* Bulgarian Dip Hold
* Assisted Iron Cross (band)
* Iron Cross Negative
* Iron Cross Hold
* Ring Support Hold

### Maltese
* Ring Straddle Planche
* Maltese Lean (rings)
* Assisted Maltese (band)
* Maltese Negative
* Straddle Maltese
* Maltese
* Straddle Planche

### Victorian
* Full Back Lever (rings)
* Victorian Lean
* Tuck Victorian
* Assisted Victorian (band)
* Victorian Negative
* Victorian
* Skin the Cat

### Manna
* L-Sit
* V-Sit
* High V-Sit
* Manna Negative
* Manna
* Compression Work

### Freestanding 90-Degree Handstand Push-up
* Pike Push-up
* Elevated Pike Push-up
* Wall Handstand Push-up Partial
* Wall Handstand Push-up
* Deficit Wall Handstand Push-up
* Freestanding Handstand Push-up Negative
* Freestanding Handstand Push-up
* Wall Handstand Hold

### One-Arm Pull-up
* Weighted Pull-up
* Archer Pull-up
* Typewriter Pull-up
* Band-Assisted One-Arm Pull-up
* One-Arm Pull-up Eccentric
* One-Arm Pull-up Partial
* One-Arm Pull-up Isometric
* One-Arm Pull-up
* Scapular Pull-up

### Freestanding One-Arm Handstand
* Handstand Weight Shifts
* Handstand Fingertip Shifts
* Tuck One-Arm Handstand (wall)
* One-Arm Handstand Wall Assisted
* One-Arm Handstand (wall)
* Freestanding One-Arm Handstand

### 10-meter Handstand Walk
* Handstand Belly-to-Wall Walks
* Handstand Short Walks
* Handstand Walk 5m
* Handstand Walk 10m
* Wall Handstand Hold

## Rules for future additions

* Each advanced skill needs a target expression, prerequisites, current benchmark, valid regressions, valid eccentric/isometric routes where they truly exist, allowed assistance methods, and exit criteria.
* Wall, band, assisted, negative, partial, straddle, tuck, and deficit are not generic modifiers. The exact resulting exercise must exist in the library or verified graph.
* Static hold, dynamic press/pull, balance skill, and endurance expression of the same family are separate adaptations and should not be silently substituted for one another.
* Side-specific pain or capacity may route each limb differently when a verified lower-demand variation is tolerated.