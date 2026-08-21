from pathlib import Path


def write(path, text):
    Path(path).write_text(text)


# 1) Deterministically repair alternative attempt-ceiling/range wording.
p = Path('phase14/engine/final_note_coherence.js')
s = p.read_text()
marker = "  out = out.replace(/\\s{2,}/g, ' ').replace(/\\s+([.;,])/g, '$1').trim();"
if 'alternate_attempt_ceiling_claim' not in s:
    if marker not in s:
        raise SystemExit('final_note_coherence insertion anchor missing')
    insertion = r'''
  // (f) Alternate attempt-ceiling/range phrasings must also agree with the
  // authoritative structured dose. These are objective arithmetic repairs, not
  // subjective coaching rewrites.
  if (Number.isFinite(sets) && Number.isFinite(reps)) {
    const prescribed = sets * reps;
    out = out.replace(/\b((?:quality\s+)?ceiling(?:\s+of|:)?\s+)(\d+)(\s+(?:total\s+)?(?:attempts?|entries|reps?)\b)/gi,
      (whole, prefix, n, tail) => {
        const claimed = Number(n);
        if (!Number.isFinite(claimed) || claimed <= prescribed) return whole;
        changes.push({ kind: 'alternate_attempt_ceiling_claim', from: claimed, to: prescribed });
        return `${prefix}${prescribed}${tail}`;
      });

    out = out.replace(/\b(stay\s+around|aim\s+for|target)\s+(\d+)\s*[-–]\s*(\d+)(\s+(?:excellent\s+|quality\s+|clean\s+|high-quality\s+)?(?:attempts?|entries|reps?)\b)/gi,
      (whole, verb, loRaw, hiRaw, tail) => {
        const lo = Number(loRaw), hi = Number(hiRaw);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= prescribed) return whole;
        const clampedLo = Math.min(lo, prescribed);
        changes.push({ kind: 'attempt_range_ceiling_claim', from: `${lo}-${hi}`, to: clampedLo === prescribed ? `${prescribed}` : `${clampedLo}-${prescribed}` });
        return clampedLo === prescribed ? `${verb} ${prescribed}${tail}` : `${verb} ${clampedLo}-${prescribed}${tail}`;
      });

    const wordNumbers = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20 };
    out = out.replace(/\b(up to|at most|no more than|(?:quality\s+)?ceiling(?:\s+of|:)?)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(\s+(?:total\s+)?(?:high-quality\s+|quality\s+|clean\s+)?(?:attempts?|entries|reps?)\b)/gi,
      (whole, verb, word, tail) => {
        const claimed = wordNumbers[String(word).toLowerCase()];
        if (!Number.isFinite(claimed) || claimed <= prescribed) return whole;
        changes.push({ kind: 'word_attempt_ceiling_claim', from: claimed, to: prescribed });
        return `${verb} ${prescribed}${tail}`;
      });
  }

'''
    s = s.replace(marker, insertion + marker, 1)
    write(p, s)

# 2) Progression claims in every client-visible dose text field; compare only
# against the immediately previous week and the metric explicitly named.
p = Path('phase14/engine/v34_prescription_consistency.js')
s = p.read_text()
start = s.index('export function collectProgressionLanguageFlags')
end = s.index('// Spelled-out attempt claims', start)
seg = s[start:end]
if "const claimText = [loadText, repsText, note]" not in seg:
    seg = seg.replace('  const previous = new Map();', '  let previous = new Map();', 1)
    old = """      const note = String(cells[parsed.notes] || '');\n      if (!note.trim()) return;"""
    new = """      const note = String(cells[parsed.notes] || '');
      const loadText = Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '';
      const repsText = Number.isInteger(parsed.reps) ? String(cells[parsed.reps] || '') : '';
      const claimText = [loadText, repsText, note].filter((x) => x.trim()).join(' | ');
      if (!claimText.trim()) return;"""
    if old not in seg:
        raise SystemExit('progression claim-text anchor missing')
    seg = seg.replace(old, new, 1)
    seg = seg.replace("        if (!claim.re.test(note)) continue;", "        const matchedClaim = claimText.match(claim.re);\n        if (!matchedClaim) continue;", 1)
    old_down = """        if (claim.direction === 'down') {
          const volumeSame = Number.isFinite(current.volume) && Number.isFinite(prior.volume) && current.volume >= prior.volume;
          const setsSame = Number.isFinite(sets) && Number.isFinite(prior.sets) && sets >= prior.sets;
          const kmSame = Number.isFinite(km) && Number.isFinite(prior.km) && km >= prior.km;
          const nothingFell = (volumeSame || setsSame || kmSame)
            && !(Number.isFinite(current.volume) && Number.isFinite(prior.volume) && current.volume < prior.volume)
            && !(Number.isFinite(km) && Number.isFinite(prior.km) && km < prior.km);
          if (nothingFell) {
            claimed = true;
            flags.push({ code: 'V34_PROGRESSION_LANGUAGE_MISMATCH', ...where, claim: 'reduction',
              previous: { sets: prior.sets, reps: prior.reps, km: prior.km }, current: { sets, reps, km },
              message: `${exercise} (Week ${week}) claims reduced work, but the prescription did not fall (previous ${prior.sets}x${prior.reps}${prior.km ? ` / ${prior.km} km` : ''}, now ${sets}x${reps}${km ? ` / ${km} km` : ''}).` });
          }
        }"""
    new_down = """        if (claim.direction === 'down') {
          const metricText = String(matchedClaim?.[1] || matchedClaim?.[0] || '').toLowerCase();
          let reductionMissing = false;
          let metric = 'work';
          if (/set/.test(metricText)) {
            metric = 'sets';
            reductionMissing = Number.isFinite(sets) && Number.isFinite(prior.sets) && sets >= prior.sets;
          } else if (/distance/.test(metricText)) {
            metric = 'distance';
            reductionMissing = Number.isFinite(km) && Number.isFinite(prior.km) && km >= prior.km;
          } else {
            metric = /rep/.test(metricText) ? 'total reps' : 'volume';
            reductionMissing = Number.isFinite(current.volume) && Number.isFinite(prior.volume) && current.volume >= prior.volume;
          }
          if (reductionMissing) {
            claimed = true;
            flags.push({ code: 'V34_PROGRESSION_LANGUAGE_MISMATCH', ...where, claim: `reduction:${metric}`,
              previous: { sets: prior.sets, reps: prior.reps, km: prior.km, volume: prior.volume }, current: { sets, reps, km, volume: current.volume },
              message: `${exercise} (Week ${week}) claims reduced ${metric}, but that metric did not fall from the immediately previous week.` });
          }
        }"""
    if old_down not in seg:
        raise SystemExit('metric-specific progression anchor missing')
    seg = seg.replace(old_down, new_down, 1)
    old_tail = """    for (const [k, v] of thisWeek) previous.set(k, v);
  }
  return flags;"""
    new_tail = """    // Compare only to the immediately previous week. A movement that disappears
    // for a week must not be compared to stale history when it returns later.
    previous = thisWeek;
  }
  return flags;"""
    if old_tail not in seg:
        raise SystemExit('previous-week progression anchor missing')
    seg = seg.replace(old_tail, new_tail, 1)
    s = s[:start] + seg + s[end:]
    write(p, s)

# 3) Whole-week high-concurrency recovery architecture.
p = Path('phase14/engine/manual_acceptance_quality.js')
s = p.read_text()
if 'ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW' not in s:
    start = s.index('export function validateAdvancedHybridManualAcceptanceSemantic')
    ret = s.index('  return { ok: true, skipped: false, model };', start)
    insertion = r'''
  // Whole-week recovery architecture: in a high-concurrency block a long run two
  // days before the primary heavy squat is only acceptable when the intervening
  // day is genuinely low-cost.
  if (squat1rm) {
    for (const week of model.weeks || []) {
      const dayMap = new Map((week.days || []).map((d) => [String(d.day || '').toLowerCase(), d]));
      for (const [heavyDay, day] of dayMap) {
        if (!WEEKDAY_ORDER.includes(heavyDay)) continue;
        const heavySquat = (day.exercises || []).find((x) => /^back squat$/i.test(String(x.display_name || '')) && (kgLoad(x?.dose?.load) || 0) >= squat1rm * 0.80);
        if (!heavySquat) continue;
        const heavyIndex = WEEKDAY_ORDER.indexOf(heavyDay);
        const longRunDay = WEEKDAY_ORDER[(heavyIndex + 5) % 7];
        const middleDay = WEEKDAY_ORDER[(heavyIndex + 6) % 7];
        const prior = dayMap.get(longRunDay);
        const middle = dayMap.get(middleDay);
        if (!prior || !middle) continue;
        const longRun = (prior.exercises || []).find((x) => x.modality === 'running' && (kmDose(x) || 0) >= Math.max(12, (currentRunBaseline(intake).longest_km || 0) * 0.75));
        if (!longRun) continue;
        const meaningfulMiddle = (middle.exercises || []).some((x) => {
          if (x.role === 'warm_up' || x.modality === 'warm_up' || x.modality === 'recovery') return false;
          const rpe = effortUpper(x);
          const setCount = Number(x?.dose?.sets || 0);
          return (Number.isFinite(rpe) && rpe >= 7) || (Number.isFinite(setCount) && setCount >= 3);
        });
        if (meaningfulMiddle) {
          fail(
            'ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW',
            `Week ${week.week}: a ${kmDose(longRun)} km long run on ${longRunDay} is followed by substantive ${middleDay} training and then the primary heavy Back Squat on ${heavyDay}. In this high-concurrency block, protect the primary squat/OAP readiness window: move the long run, or make the intervening session genuinely low-cost (roughly RPE <=6-6.5 and compact) rather than stacking three meaningful days into the same 72-hour window.`,
            { week: week.week, long_run_day: longRunDay, middle_day: middleDay, heavy_day: heavyDay, run_km: kmDose(longRun), squat_load: kgLoad(heavySquat?.dose?.load), current_1rm: squat1rm },
          );
        }
      }
    }
  }

'''
    s = s[:ret] + insertion + s[ret:]
    write(p, s)

# 4) Restore Tactical applicability for the live special-operations wording so
# the existing T3K-08 state machine actually executes.
p = Path('phase14/engine/coaching_spec_v1_quality.js')
s = p.read_text()
old = "return /(?:tactical|military|special operations|selection|operator)/.test(tacticalContext(intake)) && /\\b3\\s*k(?:m)?\\b/.test(lower(goals(intake, 'primary')));"
new = "return /(?:tactical|military|special[-–— ]?operations|selection|operator)/.test(tacticalContext(intake)) && /\\b3\\s*k(?:m)?\\b/.test(lower(goals(intake, 'primary')));"
if old in s:
    s = s.replace(old, new, 1)
    write(p, s)
elif new not in s:
    raise SystemExit('Tactical applicability anchor missing')
