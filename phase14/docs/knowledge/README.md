# Coaching sources

The four documents the generator's knowledge is built on, added 2026-09-18.
Until then none of them were in the repository, and every rule taken from them
reached the engine second-hand through a coach's review of a delivered program.

| file | what it is |
|---|---|
| `articles_1-52.md` | Base layer: concurrent training, screening, substitution, barbell design, RIR, deloads, volume landmarks, conditioning modalities, skill progressions, periodization models |
| `articles_52-102.txt` | Advanced layer: GPP decision rules, combat-sport blocks, volume landmarks for advanced athletes, nutrition, stateful coaching, sport adjustment rules, peaking and competition week |
| `endurance_conditioning_cluster.txt` | Bioenergetics, aerobic determinants, intensity domains, critical power/speed, interval and repeated-sprint prescription |
| `competition_peaking_tapering_cluster.txt` | Peaking, tapering, fitness-fatigue, readiness; Mujika's volume-reduction and duration findings |

## What the audit of these found

`scripts/audit_source_coverage.mjs` samples the explicit rules in these
documents -- the numbered **Generator Rules** in Articles 85-90, and the
numeric taper prescriptions -- and asks which state each is in:

- **CHECKED** — a module reads a produced program and can raise a finding
- **TOLD ONLY** — the rule reaches the model in the prompt, and nothing verifies it
- **ABSENT** — in the source, and not in the prompt either

On the sample it audits, 19 of 22 are TOLD ONLY. That is the answer to "where
do the deductions come from": almost none of them are missing knowledge. They
are instructions the model was given, did not follow, and that nothing checked.

A brief builder does not count as a check, and the audit strips brief text and
imports before matching -- an earlier version counted them and reported three
times the coverage that exists.
