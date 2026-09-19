# Run #118 — two fixes, both falsifiable

Written before the run.

## Latency

A single attempt costs 164-285s across every avatar. The Hyrox athlete has taken
four attempts on every run it has ever had, because the strength-frequency gate
demanded four gym days in competition week and a taper has three.

That gate now exempts competition week.

**Prediction: 1 attempt, 200-350 seconds.** Run #117 was 4 attempts and 1237s.

If it still takes four attempts, the gate was not the only one rejecting this
athlete and the next step is to log which code each rejection carried.

## Coverage

Five of the eight stations were dictionary misses, so the model could not write
them even when asked; it substituted Medicine Ball Scoop Throw for wall balls.
They are in the dictionary now, and a deterministic repair fills any that are
still missing by spending an accessory slot.

**Prediction: 8 of 8 stations trained in weeks 1 and 2.** #116 had 2, #117 had 3.

The repair guarantees this unless it cannot find slots to spend, so the
interesting part is how many the model writes ON ITS OWN now that the vocabulary
allows it. If the model produces six or more unaided, the dictionary was the
real blocker all along and the brief was working from the start.

## Score

Coverage was the largest single deduction at 0.60. If it clears and nothing
regresses, event specificity should move from 6.4 toward 8.5.

**Prediction: 8.0 to 8.7.** Still not 9: compromised running and the race
rehearsal remain unrepaired, and between them the coach charged 0.45.
