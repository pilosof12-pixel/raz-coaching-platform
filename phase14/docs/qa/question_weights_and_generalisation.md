# Two questions left over from the HYROX standard

Both come from your last answer, not from a program. Neither blocks anything —
the rules you gave are encoded and running — but each decides whether a number
is treated as yours or as mine, and I would rather not choose on your behalf.

---

## 1. Which is authoritative: your weights, or your 7.3?

You gave six dimensions and weights for a multi-component event:

| dimension | weight | your score |
|---|---|---|
| event specificity and component coverage | 0.30 | 6.4 |
| conditioning progression and race preparation | 0.20 | 7.1 |
| strength maintenance and interference | 0.15 | 8.5 |
| taper and competition week | 0.15 | 7.6 |
| athlete-specific constraints | 0.10 | 8.4 |
| execution rules and autoregulation | 0.10 | 8.7 |

Those weights against those scores give **7.4650**. You published **7.3**.

This matters because your other four weight sets — weightlifting, tactical
endurance, combat, youth — reproduce your published scores to four decimal
places. This is the only set that does not, and it is the newest. The gap is
0.1650.

Three things would explain it, and they differ in what should be encoded:

- **The weights are right and the 7.3 carries a separate charge.** A flat 0.165
  off a weighted average is an odd number to arrive at by hand, but a holistic
  deduction applied after the arithmetic would look exactly like this.
- **The 7.3 is right and the weights are approximate.** Reaching 7.3 from your
  own dimension scores needs about 0.072 of weight moved off execution and onto
  event specificity — roughly 0.37 and 0.03. A 3% weight on execution rules is
  low enough that I doubt it is what you meant.
- **The 7.3 was the judgement and the dimension scores were reconstructed after
  it.** Entirely legitimate, and the honest encoding is then to treat the
  weights as indicative and not test against them.

I have recorded the discrepancy in a test rather than tuning the weights to
close it, because fitting six weights to one observation would make the model
agree with you once and mean nothing on the next program. Tell me which of the
three it is and I will encode that instead.

---

## 2. Do the HYROX thresholds generalise?

You flagged these as your codification rather than quoted rule, which is the
reason for asking:

- a component counts as trained at **25% of race dose**
- **50% of an event's named components** must appear by the end of week 1
- **two exposures** across weeks 1 to 3 for each named component

They are currently applied to any event the engine can name components for.
Today that is HYROX and one other. The question is whether they are HYROX
numbers or event numbers.

Two cases where I suspect they are not the same:

- **An event with far fewer components.** A two-part event — a duathlon, a
  strongman medley of three — makes "50% by week 1" mean one thing, and the
  25% dose is easy to hit with a token set. Is there a floor in absolute
  exposures rather than proportion?
- **An event with a dominant component.** If 70% of race time is running, is
  running's 25%-dose threshold the same as a sled pull's, or should the dose
  scale with the component's share of the race?

If the answer is "these are HYROX numbers, do not generalise them", say so and I
will scope them to HYROX and leave other events uncovered until you define them.
That is a worse outcome for coverage and a better one for honesty, and it is
your call rather than mine.

---

## 3. Four findings with no price on them

An audit of the deduction table against the rules that actually fire found six
rules charging nothing. Two of them were yours already and had simply never been
wired up: accessory redundancy, which fires more often than any other finding we
record, maps onto your ACCESSORY_LOW_MARGINAL_RETURN at 0.18, and an unanchored
load on an event component is the same defect as an unanchored primary load at
0.15. Those are connected now.

The remaining four have no line in your table at all, and I would rather ask than
invent a number. For each: is it worth a deduction, and if so how much?

- **The taper is compressed into the final week.** Fires on 4 of 26 programs. The
  block cuts volume, but only in the last week, so there is no progressive
  unloading. Distinct from a taper that introduces a new emphasis, which you have
  at 0.45.
- **Recovery days below the minimum for the athlete.** Fires on 4 of 26. Related
  to your avoidable consecutive-day clustering at 0.20, but not the same defect:
  a week can have enough spacing between sessions and still leave too few full
  rest days.
- **A movement promised in the prose that never appears in the table.** Fires
  once. Arguably your text-contradicts-table at 0.08, but a broken promise about
  what the athlete will train may be worth more to you than a wording slip.
- **Heavy lower-body work within 48 hours of a speed session.** Fires once. An
  interference defect with no current line.

If any of these should not carry a deduction at all, say so and it will be
recorded as detection-only rather than left looking like an oversight.
