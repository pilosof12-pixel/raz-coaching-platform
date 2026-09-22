import {
  RetriableValidationError,
  SkillCalibrationError,
  validateExercisesAgainstDictionary,
  validateEquipmentAgainstLocation,
  hardSubstituteEquipment,
  enforceUnilateralIntensityFloor,
  enforceIntradayConditioningOrder,
  forceIntradayReorder,
  reformatWarmupCells,
  validateAndCalibrateSkills,
  coreExerciseName,
  norm,
  swapSportDayContent,
} from './exercise_dictionary.js';
import {
  repairGoalNarrative, repairOverheadExposure,
  repairModalityExposure, repairAdvancedSkillExposure,
} from './goal_exposure.js';
import { repairOptionalQualifiers } from './v46_language_accuracy.js';
import { repairSessionTimeBudget, repairLowFatigueAerobic } from './session_shape.js';
import { repairTacticalHardRules } from './v40_tactical_hard_rules.js';
import { repairUnconditionalProgression, repairHandstandBalance } from './coaching_spec_v1_quality.js';
import { repairMarathonSubordination } from './advanced_hybrid_quality.js';
import { repairDense72hWindow } from './manual_acceptance_quality.js';
import { repairSkillRest } from './coaching_spec_v1_quality.js';
import { repairEnduranceRedundancy } from './phase15_elite_guardrails.js';
import { repairRunBaseline } from './advanced_hybrid_quality.js';
import { repairInjuryConstraint, collectInjuryConstraintFlags } from './v84_injury_constraint.js';
import { repairMarathonProgression } from './marathon_progression.js';
import { stripRepeatedHeaderRows } from './stray_header_repair.js';
import { repairPainTolerance, collectPainToleranceFlags } from './pain_tolerance.js';
import { normalizeWeekTsvShape } from './tsv_shape.js';
import { repairPhase15Program } from './phase15_program_qa.js';
import { validatePhase15FinalProgram } from './phase15_final_qa.js';
import { parseProgramModel } from './program_model.js';
import { trimExcessSupportVolume } from './mrv_support_trim.js';
import { enrichSpecificWarmups } from './specific_warmup_enrichment.js';
import { normalizeFinalNoteCoherence } from './final_note_coherence.js'; // FINAL-NOTE-COHERENCE-WIRED
import { validatePrescriptionConsistency } from './v34_prescription_consistency.js'; // V34-PRESCRIPTION-CONSISTENCY-WIRED
import { validateCoachingStandards } from './v35_coaching_standards.js'; // V35-COACHING-STANDARDS-WIRED
import { auditProgramStructure } from './v38_structural_audit.js'; // V38-STRUCTURAL-AUDIT-WIRED
import { auditTacticalHardRules } from './v40_tactical_hard_rules.js'; // V40-TACTICAL-HARD-RULES-WIRED
import { collectRecoveryBudgetFlags, RECOVERY_BUDGET_HARD_CODES } from './v42_recovery_budget.js'; // V42-RECOVERY-BUDGET-WIRED
import { collectProgressionDisciplineFlags } from './v42_progression_discipline.js'; // V42-PROGRESSION-DISCIPLINE-WIRED
import { collectGovernanceFlags, GOVERNANCE_HARD_CODES } from './v43_coaching_governance.js'; // V43-GOVERNANCE-WIRED
import { collectSessionHierarchyFlags, collectKeySessionCrowdingFlags } from './v52_session_hierarchy.js'; // V52-SESSION-HIERARCHY-WIRED
import { collectPrePrimaryLoadFlags } from './v56_primary_day_protection.js'; // V56-PRIMARY-DAY-PROTECTION-WIRED
import { collectEnduranceVolumeFlags } from './v57_endurance_volume_governor.js'; // V57-ENDURANCE-VOLUME-WIRED
import { collectSemanticFlags } from './v58_semantic_cleanup.js'; // V58-SEMANTIC-CLEANUP-WIRED
import { collectFrequencyClaimFlags } from './v61_weekly_exposures.js'; // V61-FREQUENCY-EXPOSURES-WIRED
import { collectCompetitionFlags } from './v70_competition_rules.js'; // V70-COMPETITION-WIRED
import { collectIntensificationFlags } from './v71_intensification.js'; // V71-INTENSIFICATION-WIRED
import { collectCombatPowerFlags } from './v72_combat_power.js'; // V72-COMBAT-POWER-WIRED
import { collectEconomyFlags, collectNoveltyFlags } from './v74_camp_economy.js'; // V74-CAMP-ECONOMY-WIRED
import { collectAuditFlags } from './v73_taper_audit.js'; // V73-TAPER-AUDIT-WIRED
import { collectWeightCutFlags } from './v75_weight_cut.js'; // V75-WEIGHT-CUT-WIRED
import { collectConditioningFlags } from './v76_conditioning_gap.js'; // V76-CONDITIONING-GAP-WIRED
import { collectFightWeekClockFlags } from './v77_fight_week_clock.js'; // V77-FIGHT-WEEK-CLOCK-WIRED
import { collectSportTaperFlags, collectSportStateFlags } from './v78_sport_taper.js'; // V78-SPORT-TAPER-WIRED
import { collectBallisticShareFlags } from './v79_ballistic_share.js'; // V79-BALLISTIC-SHARE-WIRED
import { collectClusterFlags } from './v81_cluster_notation.js'; // V81-CLUSTER-NOTATION-WIRED
import { collectCampSharpeningFlags } from './v82_camp_sharpening.js'; // V82-CAMP-SHARPENING-WIRED
import { collectInSeasonFlags, collectSportWeekFlags } from './v83_in_season.js'; // V83-IN-SEASON-WIRED
import { collectClockFlags } from './v86_training_clock.js'; // V86-TRAINING-CLOCK-WIRED
import { collectDayZeroFlags, collectMatchDayFlags, collectAllocationFlags, collectSportFrequencyFlags } from './v89_block_architecture.js'; // V89-BLOCK-ARCHITECTURE-WIRED
import { collectCompetitionWeekFlags } from './v90_competition_week.js'; // V90-COMPETITION-WEEK-WIRED
import { collectTimelineIntegrityFlags } from './v91_timeline_integrity.js'; // V91-TIMELINE-INTEGRITY-WIRED
import { collectPrescriptionIntegrityFlags } from './v92_prescription_integrity.js'; // V92-PRESCRIPTION-INTEGRITY-WIRED
import { collectLanguageAccuracyFlags, LANGUAGE_HARD_CODES, repairCountClaims } from './v46_language_accuracy.js'; // V46-LANGUAGE-ACCURACY-WIRED
import { repairDeterministicContradictions } from './v35_deterministic_repair.js'; // V35-DETERMINISTIC-REPAIR-WIRED
import { normalizeAdvancedHybridWeek4OapConsolidation } from './advanced_hybrid_oap_consolidation_normalizer.js';
import {
  normalizeAdvancedHybridSecondaryRunStability,
  normalizeYouthSkillAcquisitionQuality,
  normalizeTactical3KRaceSpecificity,
} from './coaching_spec_v1_convergence_normalizer.js'; // COACH-SPEC-V1-MANUAL-CONVERGENCE
import { normalizeAdvancedHybridAdjacentPulling } from './advanced_hybrid_pull_spacing_normalizer.js'; // COACH-SPEC-V1-AH04-NORMALIZER
import { normalizeAdvancedHybridOHPComplement } from './advanced_hybrid_ohp_normalizer.js';
import { normalizeYouthPrimarySkillOrder } from './youth_skill_order_normalizer.js';
import { normalizeYouthAcquisitionGoalFloors } from './youth_goal_floor_normalizer.js';
import { normalizeYouthSessionQuality } from './youth_session_quality_normalizer.js';
import { normalizeYouthWeek4Consolidation } from './youth_consolidation_normalizer.js';
import { validateYouthSessionQualitySemantic } from './youth_session_quality.js';
import { normalizeTacticalGppFloor } from './tactical_gpp_normalizer.js';
import { normalizeTacticalWeightedPullExposure } from './tactical_weighted_pull_normalizer.js';
import {
  validateDirectGoalExposureSemantic,
  validateSportDayCouplingSemantic,
  validateWeeklyVolumeBudgetSemantic,
} from './semantic_program_qa.js';
import {
  validateProgressionArchitectureSemantic,
  validateTacticalGppCoverageSemantic,
  validateTacticalScheduleArchitectureSemantic,
  validateKnownMaxPullUpDoseSemantic,
} from './coaching_progression_gpp.js';
import {
  validateTactical3KIntervalProgressionSemantic,
  validateTacticalStrengthCompletenessSemantic,
} from './tactical_3k_gpp_quality.js';
import {
  validateHardRunWarmupSemantic,
  validateYouthProgressionQualitySemantic,
} from './coaching_acceptance_quality.js';
import { validateYouthConsolidationRetentionSemantic } from './coaching_consolidation_quality.js';
import { validateGoalComponentCoverageSemantic } from './goal_progression_graph.js';
import { validateAdvancedHybridQualitySemantic } from './advanced_hybrid_quality.js';
import {
  validateYouthManualAcceptanceSemantic,
  validateAdvancedHybridManualAcceptanceSemantic,
} from './manual_acceptance_quality.js';
import {
  validateAdvancedHybridCoachingSpecV1,
  validateYouthCoachingSpecV1HardRules,
  validateTactical3KCoachingSpecV1,
} from './coaching_spec_v1_quality.js'; // COACHING-SPEC-V1-HARD-RULES
import { validateTacticalManualAcceptanceSemantic } from './tactical_manual_acceptance.js'; // TACTICAL-MANUAL-ACCEPTANCE-WIRED

const NON_EXERCISE_ROW_NAMES = new Set(['rest', 'rest day', 'off', 'off day', 'recovery day']);

export function stripNonExerciseScheduleRows(program, intake = {}) {
  const isHebrew = String(intake.language || '').toLowerCase() === 'he';
  const lines = String(program || '').split('\n');
  const out = [];
  let inBlock = false;
  let header = null;
  let exIdx = -1;
  let delim = '\t';

  for (const line of lines) {
    if (/START_WEEK\d+_TSV/.test(line)) {
      inBlock = true;
      header = null;
      exIdx = -1;
      out.push(line);
      continue;
    }
    if (/END_WEEK\d+_TSV/.test(line)) {
      inBlock = false;
      header = null;
      exIdx = -1;
      out.push(line);
      continue;
    }
    if (!inBlock || !line.trim()) {
      out.push(line);
      continue;
    }

    const rowDelim = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : delim);
    if (!header) {
      delim = rowDelim;
      header = line.split(delim).map((c) => c.trim().toLowerCase());
      exIdx = header.indexOf('exercise');
      out.push(line);
      continue;
    }

    if (exIdx >= 0) {
      const cells = line.split(rowDelim);
      const raw = exIdx < cells.length ? cells[exIdx] : '';
      const core = coreExerciseName(raw, isHebrew);
      if (NON_EXERCISE_ROW_NAMES.has(norm(core))) continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function isRepairable(err) {
  return Boolean(
    err instanceof RetriableValidationError ||
    err instanceof SkillCalibrationError ||
    err?.code === 'PHASE15_QUALITY_VIOLATION'
  );
}

function flattenError(err) {
  if (err?.code === 'PHASE15_QUALITY_VIOLATION' && Array.isArray(err.flags) && err.flags.length) {
    return err.flags.map((flag) => ({
      code: String(flag?.code || 'PHASE15_QUALITY_VIOLATION'),
      amendment: String(flag?.amendment || flag?.message || err?.amendment || err?.message || ''),
      details: flag?.details || {},
      source_error: err,
    }));
  }
  return [{
    code: String(err?.code || 'INTERNAL_QUALITY_VIOLATION'),
    amendment: String(err?.amendment || err?.message || err?.code || 'Unknown quality failure'),
    details: err?.details || {},
    source_error: err,
  }];
}

function dedupeFlags(flags) {
  const seen = new Set();
  const out = [];
  for (const flag of flags) {
    const key = `${flag.code}|${flag.amendment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(flag);
  }
  return out;
}

function runRepairable(flags, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (!isRepairable(err)) throw err;
    flags.push(...flattenError(err));
    return { ok: false, value: null };
  }
}

function aggregateError(flags) {
  const clean = dedupeFlags(flags);

  if (
    clean.length === 1 &&
    clean[0].source_error?.code === 'PHASE15_QUALITY_VIOLATION' &&
    Array.isArray(clean[0].source_error?.flags) &&
    clean[0].source_error.flags.length
  ) {
    return clean[0].source_error;
  }

  const amendment = [
    clean.length > 1
      ? 'PRIOR ATTEMPT FAILED MULTIPLE REPAIRABLE VALIDATORS IN THE SAME CANDIDATE.'
      : 'PRIOR ATTEMPT FAILED A REPAIRABLE PRODUCTION VALIDATOR.',
    clean.length > 1
      ? 'Repair ALL defects below in one pass. Do not fix one item by violating another item.'
      : 'Repair the defect below while preserving every already-valid program requirement.',
    ...clean.map((flag, i) => `${i + 1}. ${flag.code}: ${flag.amendment}`),
  ].join('\n');
  const err = new RetriableValidationError(
    'PHASE15_QUALITY_VIOLATION',
    amendment,
    { violations: clean.map(({ code, amendment, details }) => ({ code, amendment, details })) },
  );
  err.flags = clean.map(({ code, amendment, details }) => ({ code, amendment, details }));
  err.aggregate = true;
  return err;
}

function applyDeterministicCandidateRepairs(program, intake = {}) {
  let candidate = String(program || '');
  const repairs = [];

  // A session on a day the athlete cannot attend has a deterministic answer:
  // move it to a day they can. This has to run here, before the gates, because
  // validateSportDayCouplingSemantic is checked long before the late repair
  // chain -- a repair that runs after its own gate never clears it.
  //
  // The repair itself was only ever wired into hardSubstitute, and the pipeline
  // stopped calling that when the final safety net was replaced by a hard
  // failure. So nothing ran it in production at all, and
  // SPORT_DAY_COUPLING_VIOLATION became unanswerable: it killed a fight camp
  // and a dual-event block in a single paid run.
  const placedOnAvailableDays = swapSportDayContent(candidate, intake);
  if (placedOnAvailableDays !== candidate) {
    candidate = placedOnAvailableDays;
    repairs.push({ type: 'v19_sport_day_placement' });
  }

  // A movement the pain rule refuses must not survive to the client, and a
  // tolerance-gated one must carry its condition. Both were computed and then
  // dropped: the refusal was never read at all, and the condition had no repair
  // behind its flag. This runs with the other placement repairs, before any
  // gate reads the table.
  // The athlete told us which movements reproduce their symptoms, and until now
  // nothing checked the program against that. The collector existed, was
  // tested, and was never called -- deliberately, because a blocking code with
  // no repair kills builds. It has one now: the same intake usually names what
  // IS tolerated, and choosing from a list the athlete wrote themselves is not
  // a judgement made on their behalf. Where no substitute exists the row is
  // left alone and reported as a warning rather than refusing the program.
  // Three more rules that could refuse a program and had no way to mend one.
  // A skill movement on a conditioning clock gets its rest back; a fighter's
  // bike session gets the one sentence that says why it is a bike and not a
  // run; week 1 running comes back to what the athlete already runs. Each is a
  // value the rule itself names, not a judgement it was waiting on.
  // Three high-concurrency rules that named their own answer and could not
  // apply it: say what earns the extra weight on the bar, keep the support run
  // subordinate, and make the day between a long run and a heavy squat
  // genuinely low-cost.
  // The two hard tactical rules. T3K-01 wants the key session to move toward
  // race demand; T3K-08 wants the accessories cut before the race work is. Both
  // named an ordering, and an ordering is code.
  // A freestanding-handstand goal with no balance work in the week is a block
  // missing the thing the goal is made of. Put it in rather than refuse four
  // times and deliver nothing.
  // A session that will not fit in the time the athlete has gets shorter, and
  // an athlete who asked for low-fatigue aerobic work is not given intervals.
  // Both rules refuse programs; neither could mend one.
  // A qualifier that makes primary-goal work sound discretionary, and generic
  // conditioning for an athlete whose sport already supplies it. Both rules
  // refuse programs; neither had a repair, and the ledger credited both to
  // repairs that never touched them.
  // Four rules that refuse a program for missing an exposure the athlete's own
  // goal requires, and could not put it there. Convert before adding: a press
  // that is not strict becomes the strict press the goal named, and an eccentric
  // on a movement the athlete already owns becomes assisted volume.
  const narrated = repairGoalNarrative(candidate, intake);
  if (narrated !== candidate) { candidate = narrated; repairs.push({ type: 'goal_narrative_matches_goal' }); }

  const overhead = repairOverheadExposure(candidate, intake);
  if (overhead !== candidate) { candidate = overhead; repairs.push({ type: 'overhead_press_exposure' }); }

  const modality = repairModalityExposure(candidate, intake);
  if (modality !== candidate) { candidate = modality; repairs.push({ type: 'named_modality_exposure' }); }

  const skill = repairAdvancedSkillExposure(candidate, intake);
  if (skill !== candidate) { candidate = skill; repairs.push({ type: 'advanced_skill_exposure' }); }

  const notOptional = repairOptionalQualifiers(candidate, intake);
  if (notOptional !== candidate) { candidate = notOptional; repairs.push({ type: 'primary_work_not_optional' }); }

  const withinTime = repairSessionTimeBudget(candidate, intake);
  if (withinTime !== candidate) { candidate = withinTime; repairs.push({ type: 'session_time_budget' }); }

  const aerobic = repairLowFatigueAerobic(candidate, intake);
  if (aerobic !== candidate) { candidate = aerobic; repairs.push({ type: 'low_fatigue_aerobic' }); }

  const balanced = repairHandstandBalance(candidate, intake);
  if (balanced !== candidate) { candidate = balanced; repairs.push({ type: 'handstand_balance_specificity' }); }

  const raceSpecific = repairTacticalHardRules(candidate, intake);
  if (raceSpecific !== candidate) { candidate = raceSpecific; repairs.push({ type: 'tactical_race_demand_and_hierarchy' }); }

  const conditioned = repairUnconditionalProgression(candidate, intake);
  if (conditioned !== candidate) { candidate = conditioned; repairs.push({ type: 'progression_condition_stated' }); }

  const subordinated = repairMarathonSubordination(candidate, intake);
  if (subordinated !== candidate) { candidate = subordinated; repairs.push({ type: 'marathon_support_run_subordinated' }); }

  const windowProtected = repairDense72hWindow(candidate, intake);
  if (windowProtected !== candidate) { candidate = windowProtected; repairs.push({ type: 'primary_readiness_window_protected' }); }

  const restHeld = repairSkillRest(candidate, intake);
  if (restHeld !== candidate) { candidate = restHeld; repairs.push({ type: 'skill_rest_quality' }); }

  const redundancyExplained = repairEnduranceRedundancy(candidate, intake);
  if (redundancyExplained !== candidate) { candidate = redundancyExplained; repairs.push({ type: 'endurance_redundancy_purpose' }); }

  const runHeld = repairRunBaseline(candidate, intake);
  if (runHeld !== candidate) { candidate = runHeld; repairs.push({ type: 'run_baseline_cap' }); }

  const injurySafe = repairInjuryConstraint(candidate, intake);
  if (injurySafe !== candidate) {
    candidate = injurySafe;
    repairs.push({ type: 'injury_constraint_substitution' });
  }

  const painSafe = repairPainTolerance(candidate, intake);
  if (painSafe !== candidate) {
    candidate = painSafe;
    repairs.push({ type: 'pain_tolerance_substitution' });
  }

  // Four marathon rules live in final QA, where the only answer to a flag was a
  // throw. Each message already stated its own fix -- hold week 1 to the
  // distance the athlete runs, progress one lever per transition, keep a
  // maintenance lift maintenance -- so the fix happens here instead of being
  // read aloud to the model four times.
  const marathonHeld = repairMarathonProgression(candidate, intake);
  if (marathonHeld !== candidate) {
    candidate = marathonHeld;
    repairs.push({ type: 'marathon_one_lever_per_transition' });
  }

  const warmed = enrichSpecificWarmups(candidate, intake);
  if (warmed !== candidate) {
    candidate = warmed;
    repairs.push({ type: 'specific_warmup_enrichment' });
  }

  const advancedOapConsolidation = normalizeAdvancedHybridWeek4OapConsolidation(candidate, intake);
  candidate = advancedOapConsolidation.program;
  if (advancedOapConsolidation.repaired) repairs.push({ type: 'advanced_hybrid_week4_oap_consolidation', rows: advancedOapConsolidation.repairs });

  const advancedPullSpacing = normalizeAdvancedHybridAdjacentPulling(candidate, intake);
  candidate = advancedPullSpacing.program;
  if (advancedPullSpacing.repaired) repairs.push({ type: 'advanced_hybrid_adjacent_pull_spacing', rows: advancedPullSpacing.repairs }); // COACH-SPEC-V1-AH04-CANDIDATE-REPAIR

  const advancedOhpComplement = normalizeAdvancedHybridOHPComplement(candidate, intake);
  candidate = advancedOhpComplement.program;
  if (advancedOhpComplement.repaired) repairs.push({ type: 'advanced_hybrid_ohp_complement', rows: advancedOhpComplement.repairs });

  const youthFloors = normalizeYouthAcquisitionGoalFloors(candidate, intake);
  candidate = youthFloors.program;
  if (youthFloors.repaired) repairs.push({ type: 'youth_acquisition_goal_floor', rows: youthFloors.repairs });

  const youthSessionQuality = normalizeYouthSessionQuality(candidate, intake);
  candidate = youthSessionQuality.program;
  if (youthSessionQuality.repaired) repairs.push({ type: 'youth_session_quality', rows: youthSessionQuality.repairs });

  const tacticalWeightedPull = normalizeTacticalWeightedPullExposure(candidate, intake);
  candidate = tacticalWeightedPull.program;
  if (tacticalWeightedPull.repaired) repairs.push({ type: 'tactical_weighted_pull', rows: tacticalWeightedPull.repairs });

  const tacticalGpp = normalizeTacticalGppFloor(candidate, intake);
  candidate = tacticalGpp.program;
  if (tacticalGpp.repaired) repairs.push({ type: 'tactical_gpp_floor', rows: tacticalGpp.repairs });

  const youthOrder = normalizeYouthPrimarySkillOrder(candidate, intake);
  candidate = youthOrder.program;
  if (youthOrder.reordered) repairs.push({ type: 'youth_primary_skill_order', moves: youthOrder.moves });

  const youthConsolidation = normalizeYouthWeek4Consolidation(candidate, intake);
  candidate = youthConsolidation.program;
  if (youthConsolidation.repaired) repairs.push({ type: 'youth_week4_consolidation', rows: youthConsolidation.repairs });

  const advancedSecondaryRun = normalizeAdvancedHybridSecondaryRunStability(candidate, intake);
  candidate = advancedSecondaryRun.program;
  if (advancedSecondaryRun.repaired) repairs.push({ type: 'advanced_hybrid_secondary_run_stability', rows: advancedSecondaryRun.repairs });

  const youthAcquisitionQuality = normalizeYouthSkillAcquisitionQuality(candidate, intake);
  candidate = youthAcquisitionQuality.program;
  if (youthAcquisitionQuality.repaired) repairs.push({ type: 'youth_skill_acquisition_quality', rows: youthAcquisitionQuality.repairs });

  const tacticalRaceSpecificity = normalizeTactical3KRaceSpecificity(candidate, intake);
  candidate = tacticalRaceSpecificity.program;
  if (tacticalRaceSpecificity.repaired) repairs.push({ type: 'tactical_3k_race_specificity', rows: tacticalRaceSpecificity.repairs }); // COACH-SPEC-V1-MANUAL-CANDIDATE-REPAIR

  return { program: candidate, repairs };
}

export function collectRepairableValidationFailures(program, intake = {}, options = {}) {
  const skipSkillCalibration = options?.skipSkillCalibration === true;
  let candidate = stripNonExerciseScheduleRows(program, intake);
  const flags = [];
  let warnings = [];
  let schedule = [];
  let mrv_trim = null;
  let deterministic_repairs = [];

  // Before anything reads the table, make sure the table is readable. A row
  // with eight cells instead of nine is a typing accident with one correct
  // answer, and final QA used to end the build over it -- forty-six of them in
  // one fight camp week, which cost a paid attempt and produced nothing. This
  // has to sit ahead of the dictionary pass: every repair below parses the
  // week, and the ones that follow only run when that pass succeeds.
  const shaped = normalizeWeekTsvShape(candidate);
  if (shaped.repaired) {
    candidate = shaped.program;
    deterministic_repairs.push({ type: 'tsv_row_shape', rows: shaped.rows });
  }

  // Before the dictionary gate, because that gate is the first thing this bundle
  // runs and a repeated header row trips it instantly. Run #126's first attempt
  // raised five codes at once and the unknown-name diagnostic named the
  // hallucinated exercise as, literally, "Exercise" -- the model had emitted the
  // header line a second time inside a week block. One stray row, five findings,
  // and a whole regeneration, with no repair ever getting a look because the
  // build was already on its way back to the model.
  const headerStripped = stripRepeatedHeaderRows(candidate);
  if (headerStripped.changed) {
    candidate = headerStripped.program;
    deterministic_repairs.push({ type: 'stray_header_row_dropped', rows: headerStripped.dropped.length });
  }

  // Normalize the model-authored exercise vocabulary first. Deterministic coaching
  // floors are only applied after that initial dictionary pass so they operate on
  // stable movement identity rather than trying to infer intent from a rejected
  // exercise name.
  const dictionary = runRepairable(flags, () => validateExercisesAgainstDictionary(candidate, intake));
  if (dictionary.ok) candidate = dictionary.value.program;

  if (!skipSkillCalibration) {
    const skills = runRepairable(flags, () => validateAndCalibrateSkills(candidate, intake));
    if (skills.ok) candidate = skills.value.program;
  }

  if (dictionary.ok) {
    const normalized = applyDeterministicCandidateRepairs(candidate, intake);
    candidate = normalized.program;
    // Concat, not assign: this used to replace the array and silently discard
    // the header-strip and row-shape records written above it. The repairs still
    // happened, but the build's own account of what it did to the program lost
    // them, which is the part anyone diagnosing a slow run reads.
    deterministic_repairs = [...deterministic_repairs, ...normalized.repairs];

    // The repair layer inserts only canonical source-authored movements, but run
    // the same dictionary gate again so production never grants itself a bypass.
    const repairedDictionary = runRepairable(flags, () => validateExercisesAgainstDictionary(candidate, intake));
    if (repairedDictionary.ok) candidate = repairedDictionary.value.program;
  }

  // Substitute before judging. The dictionary already knows the in-family
  // answer for an implement the athlete does not have -- a sandbag carry is a
  // loaded carry -- and hardSubstituteEquipment applies it. It was only ever
  // reached after the gate had refused the build and the model had spent
  // attempts on it, so a program the engine could mend deterministically went
  // back for regeneration instead. The gate still runs immediately after, so
  // nothing grants itself a bypass: a substitution that does not resolve the
  // violation is refused exactly as before.
  const equipmentSubstituted = hardSubstituteEquipment(candidate, intake);
  if (equipmentSubstituted !== candidate) {
    candidate = equipmentSubstituted;
    deterministic_repairs.push({ type: 'equipment_substitution' });
  }
  runRepairable(flags, () => validateEquipmentAgainstLocation(candidate, intake));
  runRepairable(flags, () => enforceUnilateralIntensityFloor(candidate, intake));

  // enforceIntradayConditioningOrder reorders the day and then throws, so the
  // reordered program it built is discarded and the flag stands. The
  // deterministic answer already exists -- forceIntradayReorder, written for
  // exactly this -- and was reachable only through hardSubstitute, which the
  // pipeline stopped calling. Same root cause as the sport-day gate: a repair
  // nobody ran, and a rule that could refuse a program with no way to answer
  // it. Reorder first; the check then passes, and still refuses a day the
  // reorder genuinely cannot sequence.
  const reordered = forceIntradayReorder(candidate, intake);
  if (typeof reordered === 'string' && reordered !== candidate) {
    candidate = reordered;
    deterministic_repairs.push({ type: 'intraday_order_forced' });
  }

  const ordered = runRepairable(flags, () => enforceIntradayConditioningOrder(candidate, intake));
  if (ordered.ok && typeof ordered.value === 'string') candidate = ordered.value;

  mrv_trim = trimExcessSupportVolume(candidate, intake);
  if (mrv_trim.repaired) candidate = mrv_trim.program;

  let model = parseProgramModel(candidate, intake);
  const semanticChecks = [
    () => validateSportDayCouplingSemantic(candidate, intake, model),
    () => validateDirectGoalExposureSemantic(candidate, intake, model),
    () => validateGoalComponentCoverageSemantic(candidate, intake, model),
    () => validateAdvancedHybridQualitySemantic(candidate, intake, model),
    () => validateProgressionArchitectureSemantic(candidate, intake, model),
    () => validateYouthProgressionQualitySemantic(candidate, intake, model),
    () => validateYouthConsolidationRetentionSemantic(candidate, intake, model),
    () => validateYouthSessionQualitySemantic(candidate, intake, model),
    () => validateYouthManualAcceptanceSemantic(candidate, intake, model),
    () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, model),
    () => validateAdvancedHybridCoachingSpecV1(candidate, intake, model),
    () => validateYouthCoachingSpecV1HardRules(candidate, intake, model),
    () => validateTactical3KCoachingSpecV1(candidate, intake, model),
    () => validateTacticalManualAcceptanceSemantic(candidate, intake, model), // TACTICAL-MANUAL-ACCEPTANCE-RUNTIME
    () => validateTacticalScheduleArchitectureSemantic(candidate, intake, model),
    () => validateKnownMaxPullUpDoseSemantic(candidate, intake, model),
    () => validateTacticalGppCoverageSemantic(candidate, intake, model),
    () => validateTacticalStrengthCompletenessSemantic(candidate, intake, model),
    () => validateTactical3KIntervalProgressionSemantic(candidate, intake, model),
    () => validateHardRunWarmupSemantic(candidate, intake, model),
    () => validateWeeklyVolumeBudgetSemantic(candidate, intake, model),
  ];

  for (let i = 0; i < semanticChecks.length; i++) {
    const checked = runRepairable(flags, semanticChecks[i]);
    if (checked.ok && checked.value?.model) model = checked.value.model;
    if (i === 0 && checked.ok) {
      warnings = checked.value?.warnings || [];
      schedule = checked.value?.schedule || [];
    }
  }

  candidate = reformatWarmupCells(candidate);
  candidate = repairPhase15Program(candidate);

  // Final-boundary convergence: the legacy formatting/repair pass must not be
  // able to reintroduce a defect after deterministic candidate repair. Re-apply
  // only narrow, idempotent repairs here, then re-run affected semantic gates
  // before the final release validator.
  const finalAdvancedOap = normalizeAdvancedHybridWeek4OapConsolidation(candidate, intake);
  candidate = finalAdvancedOap.program;
  if (finalAdvancedOap.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_week4_oap_consolidation', rows: finalAdvancedOap.repairs });

  const finalAdvancedPullSpacing = normalizeAdvancedHybridAdjacentPulling(candidate, intake);
  candidate = finalAdvancedPullSpacing.program;
  if (finalAdvancedPullSpacing.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_adjacent_pull_spacing', rows: finalAdvancedPullSpacing.repairs }); // COACH-SPEC-V1-AH04-FINAL-REPAIR

  const finalAdvancedOhp = normalizeAdvancedHybridOHPComplement(candidate, intake);
  candidate = finalAdvancedOhp.program;
  if (finalAdvancedOhp.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_ohp_complement', rows: finalAdvancedOhp.repairs });

  const finalTacticalPull = normalizeTacticalWeightedPullExposure(candidate, intake);
  candidate = finalTacticalPull.program;
  if (finalTacticalPull.repaired) deterministic_repairs.push({ type: 'final_tactical_weighted_pull', rows: finalTacticalPull.repairs });

  const finalYouthConsolidation = normalizeYouthWeek4Consolidation(candidate, intake);
  candidate = finalYouthConsolidation.program;
  if (finalYouthConsolidation.repaired) deterministic_repairs.push({ type: 'final_youth_week4_consolidation', rows: finalYouthConsolidation.repairs });

  const finalAdvancedSecondaryRun = normalizeAdvancedHybridSecondaryRunStability(candidate, intake);
  candidate = finalAdvancedSecondaryRun.program;
  if (finalAdvancedSecondaryRun.repaired) deterministic_repairs.push({ type: 'final_advanced_hybrid_secondary_run_stability', rows: finalAdvancedSecondaryRun.repairs });

  const finalYouthAcquisitionQuality = normalizeYouthSkillAcquisitionQuality(candidate, intake);
  candidate = finalYouthAcquisitionQuality.program;
  if (finalYouthAcquisitionQuality.repaired) deterministic_repairs.push({ type: 'final_youth_skill_acquisition_quality', rows: finalYouthAcquisitionQuality.repairs });

  const finalTacticalRaceSpecificity = normalizeTactical3KRaceSpecificity(candidate, intake);
  candidate = finalTacticalRaceSpecificity.program;
  if (finalTacticalRaceSpecificity.repaired) deterministic_repairs.push({ type: 'final_tactical_3k_race_specificity', rows: finalTacticalRaceSpecificity.repairs }); // COACH-SPEC-V1-MANUAL-FINAL-REPAIR

  // Last deterministic repair: every prescription above is now settled, so any
  // quantitative claim a note still makes about its own row can be checked
  // against the final structured fields.
  const finalNoteCoherence = normalizeFinalNoteCoherence(candidate, intake);
  candidate = finalNoteCoherence.program;
  if (finalNoteCoherence.repaired) deterministic_repairs.push({ type: 'final_note_coherence', rows: finalNoteCoherence.repairs });

  // The structured prescription is authoritative and a note is derived text, so a
  // note that contradicts its own row has exactly one correct resolution: restate
  // the note. Doing that here means the gates below only reject genuinely
  // structural problems, instead of asking the model to guess which of two
  // disagreeing statements was meant -- which is what exhausted the repair loop.
  const deterministicText = repairDeterministicContradictions(candidate, intake);
  candidate = deterministicText.program;
  if (deterministicText.repaired) deterministic_repairs.push({ type: 'v35_deterministic_contradiction_repair', rows: deterministicText.repairs });

  const finalModel = parseProgramModel(candidate, intake);
  runRepairable(flags, () => validateAdvancedHybridManualAcceptanceSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateAdvancedHybridCoachingSpecV1(candidate, intake, finalModel));
  runRepairable(flags, () => validateYouthCoachingSpecV1HardRules(candidate, intake, finalModel));
  runRepairable(flags, () => validateTactical3KCoachingSpecV1(candidate, intake, finalModel));
  runRepairable(flags, () => validateTacticalScheduleArchitectureSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateKnownMaxPullUpDoseSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateYouthConsolidationRetentionSemantic(candidate, intake, finalModel));
  runRepairable(flags, () => validateYouthSessionQualitySemantic(candidate, intake, finalModel));
  // v34: runs AFTER every deterministic prescription repair, so it compares
  // notes against final structured fields.
  runRepairable(flags, () => validatePrescriptionConsistency(candidate, intake, RetriableValidationError));
  // v35: the program's own claims and block shape must match the structured
  // prescriptions and the athlete's stated goal.
  runRepairable(flags, () => validateCoachingStandards(candidate, intake, RetriableValidationError));

  // v38: structural coaching architecture. Session completeness, foundational
  // strength under skill work, circular-week recovery and loaded-carry
  // progression. Architecture failures are regenerated rather than patched:
  // rewriting a session's content would be inventing coaching. Weekly movement
  // coverage is advisory and reported, not a release block.
  runRepairable(flags, () => {
    const structural = [
      ...auditProgramStructure(candidate, intake),
      ...auditTacticalHardRules(candidate, intake),
    ].filter((f) => f.severity === 'hard');
    if (!structural.length) return;
    throw new RetriableValidationError(
      structural[0].code,
      structural.map((f) => f.message).join(' '),
      { flags: structural },
    );
  });
  // v42: recovery budgeting and one-stressor-at-a-time progression. Only a
  // label that contradicts its own prescription blocks release; placement
  // against a sport week and multi-dimensional progression are coaching
  // judgements, reported for review rather than rejected. Rejecting them would
  // make the engine rigid about choices a coach is entitled to make.
  runRepairable(flags, () => {
    const budget = collectRecoveryBudgetFlags(candidate, intake)
      .filter((f) => RECOVERY_BUDGET_HARD_CODES.has(f.code));
    if (!budget.length) return;
    throw new RetriableValidationError(
      budget[0].code,
      budget.map((f) => f.message).join(' '),
      { flags: budget },
    );
  });

  // v43: governance. Both hard codes have deterministic repairs that ran
  // earlier in this bundle, so reaching here means the repair could not resolve
  // them and regeneration is the right answer.
  runRepairable(flags, () => {
    const governance = collectGovernanceFlags(candidate, intake)
      .filter((f) => GOVERNANCE_HARD_CODES.has(f.code));
    if (!governance.length) return;
    throw new RetriableValidationError(
      governance[0].code,
      governance.map((f) => f.message).join(' '),
      { flags: governance },
    );
  });

  // v46: the prose must count the program correctly. Repaired in place first --
  // restating a number is mechanical and cannot be a coaching decision -- so
  // reaching the gate means the claim could not be reconciled at all.
  const counted = repairCountClaims(candidate, intake);
  if (counted.repaired) candidate = counted.program;
  runRepairable(flags, () => {
    const language = collectLanguageAccuracyFlags(candidate, intake)
      .filter((f) => LANGUAGE_HARD_CODES.has(f.code));
    if (!language.length) return;
    throw new RetriableValidationError(
      language[0].code,
      language.map((f) => f.message).join(' '),
      { flags: language },
    );
  });

  // v52: secondary work must not interrupt the primary exposures of a session.
  // The repair above reorders it, so reaching here means the reorder could not
  // resolve it and regeneration is the right answer.
  runRepairable(flags, () => {
    const hierarchy = [...collectSessionHierarchyFlags(candidate, intake), ...collectKeySessionCrowdingFlags(candidate, intake)];
    if (!hierarchy.length) return;
    throw new RetriableValidationError(hierarchy[0].code,
      hierarchy.map((f) => f.message).join(' '), { flags: hierarchy });
  });

  // v56: the repair above holds the pre-primary day to a technical dose, so
  // reaching here means the cap could not be applied and regeneration is right.
  runRepairable(flags, () => {
    const prePrimary = collectPrePrimaryLoadFlags(candidate, intake);
    if (!prePrimary.length) return;
    throw new RetriableValidationError(prePrimary[0].code,
      prePrimary.map((f) => f.detail).join(' '), { flags: prePrimary });
  });

  runRepairable(flags, () => {
    const governed = collectEnduranceVolumeFlags(candidate, intake);
    if (!governed.length) return;
    throw new RetriableValidationError(governed[0].code,
      governed.map((f) => f.detail).join(' '), { flags: governed });
  });

  // Malformed prose is always repairable in place, so reaching here means the
  // cleanup could not resolve it and the sentence needs regenerating.
  runRepairable(flags, () => {
    const prose = collectSemanticFlags(candidate, intake);
    if (!prose.length) return;
    throw new RetriableValidationError(prose[0].code,
      prose.map((f) => f.detail).join(' '), { flags: prose });
  });

  runRepairable(flags, () => {
    const freq = collectFrequencyClaimFlags(candidate, intake);
    if (!freq.length) return;
    throw new RetriableValidationError(freq[0].code,
      freq.map((f) => f.detail).join(' '), { flags: freq });
  });

  runRepairable(flags, () => {
    const comp = collectCompetitionFlags(candidate, intake);
    if (!comp.length) return;
    throw new RetriableValidationError(comp[0].code,
      comp.map((f) => f.detail).join(' '), { flags: comp });
  });

  runRepairable(flags, () => {
    const intens = collectIntensificationFlags(candidate, intake);
    if (!intens.length) return;
    throw new RetriableValidationError(intens[0].code,
      intens.map((f) => f.detail).join(' '), { flags: intens });
  });

  runRepairable(flags, () => {
    const power = collectCombatPowerFlags(candidate, intake);
    if (!power.length) return;
    throw new RetriableValidationError(power[0].code,
      power.map((f) => f.detail).join(' '), { flags: power });
  });

  runRepairable(flags, () => {
    const lean = [...collectEconomyFlags(candidate, intake), ...collectNoveltyFlags(candidate, intake),
      ...collectAuditFlags(candidate, intake), ...collectWeightCutFlags(candidate, intake),
      ...collectConditioningFlags(candidate, intake), ...collectFightWeekClockFlags(candidate, intake),
      ...collectSportTaperFlags(candidate, intake), ...collectSportStateFlags(candidate, intake),
      ...collectBallisticShareFlags(candidate, intake),
      ...collectClusterFlags(candidate, intake),
      ...collectCampSharpeningFlags(candidate, intake),
      ...collectPainToleranceFlags(candidate, intake),
      ...collectInSeasonFlags(candidate, intake), ...collectSportWeekFlags(candidate, intake),
      ...collectClockFlags(candidate, intake),
      ...collectDayZeroFlags(candidate, intake), ...collectMatchDayFlags(candidate, intake),
      ...collectAllocationFlags(candidate, intake), ...collectSportFrequencyFlags(candidate, intake),
      ...collectCompetitionWeekFlags(candidate, intake), ...collectTimelineIntegrityFlags(candidate, intake),
      ...collectPrescriptionIntegrityFlags(candidate, intake)];
    if (!lean.length) return;
    throw new RetriableValidationError(lean[0].code,
      lean.map((f) => f.detail).join(' '), { flags: lean });
  });

  // Again, immediately before the gate that reads it.
  //
  // The first pass runs at line 367, which is before the whole v35 chain. v35
  // moves rows between days, converts accessories into race stations, deletes
  // ballistic sets and gathers rehearsals -- any of which can change a week's
  // running volumes after the marathon repair has already had its look. Run
  // #125 spent a second model call on A1:MARATHON_STACKED_VOLUME_PROGRESSION,
  // and the repair for it had run four hundred lines earlier against a program
  // that no longer existed by the time the gate read it.
  //
  // This is the same shape as the taper cap being undone by the ballistic swap:
  // the fix is not a cleverer repair, it is running it where the evidence is
  // final. It is idempotent, so a second pass on an already-correct program
  // costs nothing.
  const marathonHeldFinal = repairMarathonProgression(candidate, intake);
  if (marathonHeldFinal !== candidate) {
    candidate = marathonHeldFinal;
    deterministic_repairs.push({ type: 'marathon_one_lever_per_transition_final' });
  }

  runRepairable(flags, () => validatePhase15FinalProgram(candidate, intake));

  // Contraindicated movements the substitution could not answer. These do not
  // refuse the program -- there is no safe swap to make, and failing the build
  // helps nobody -- but they must never be silent either.
  const unresolvedInjury = collectInjuryConstraintFlags(candidate, intake);
  if (unresolvedInjury.length) {
    warnings = [...warnings, ...unresolvedInjury.map((f) => ({
      code: f.code, week: f.week, exercise: f.exercise, message: f.detail,
    }))];
  }

  return {
    ok: flags.length === 0,
    program: candidate,
    model,
    flags: dedupeFlags(flags),
    warnings,
    schedule,
    deterministic_repairs,
    mrv_trim: mrv_trim ? {
      repaired: Boolean(mrv_trim.repaired),
      reductions: mrv_trim.reductions || [],
      unresolved: Boolean(mrv_trim.unresolved),
    } : null,
    skill_calibration_skipped: skipSkillCalibration,
  };
}

export function validateRepairableProgramBundle(program, intake = {}, options = {}) {
  const result = collectRepairableValidationFailures(program, intake, options);
  if (!result.ok) throw aggregateError(result.flags);
  return result;
}
