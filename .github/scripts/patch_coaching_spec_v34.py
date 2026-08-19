from pathlib import Path
p=Path('phase14/scripts/apply_coaching_spec_v1.mjs')
s=p.read_text()
old='    already: "if (hasYouthFailureBasedPrescription(`${notes} ${exercise?.dose?.reps_raw || \'\'}`))",\n'
new='    already: "const failureText = `${notes} ${exercise?.dose?.reps_raw || \'\'}`",\n'
if old not in s:
    raise SystemExit('coaching spec v34 matcher anchor missing')
p.write_text(s.replace(old,new,1))
