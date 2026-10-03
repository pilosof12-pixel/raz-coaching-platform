// An active tendon problem gets an isometric, and the athlete often tells us so.
//
// The in-season basketball player has active right patellar tendinopathy, 2-3/10,
// and his intake says in so many words: "Isometric holds have reliably reduced
// symptoms." His delivered block had no isometric anywhere in four weeks. The
// authored corpus says the same thing from the other side -- A88.4, "tendon pain
// >= 3/10 ... substitutes isometric protocols until cleared" -- and that rule
// existed only in a grading script, never in anything the model was shown.
//
// Two sources, one instruction, and it reached the model from neither. This is
// the instruction. It is phrased for the tendon the athlete names, it says why,
// and it does not take the corpus rule further than this athlete's own report:
// A88.4 also removes plyometrics, but he reports that jumping never provokes it
// and jump height is his primary goal, so the athlete's tolerance governs that
// half and it is left to the existing pain rules.

const flat = (v) => (Array.isArray(v) ? v.map(flat).join(' | ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v || ''));

const TENDONS = [
  { name: 'patellar tendon', re: /\bpatellar\b|\bjumper'?s knee\b|\bpatellar tendin/i, hold: 'a Wall Sit or a single-leg wall hold at a knee angle that is tolerable', catalog: ['wall sit'] },
  { name: 'achilles tendon', re: /\bachilles\b/i, hold: 'a calf-raise hold at mid-range, double then single leg', catalog: ['calf raise'] },
  { name: 'hamstring tendon', re: /\bproximal hamstring\b|\bhamstring (?:origin|tendin)/i, hold: 'a supine bridge hold or isometric hamstring bridge at a tolerable hip angle', catalog: ['glute bridge'] },
];

export function activeTendon(intake = {}) {
  const pain = intake?.pain && typeof intake.pain === 'object' ? intake.pain : {};
  if (pain.active !== true) return null; // a cleared or historic tendon is not a live problem
  const text = flat([intake?.injuries, pain]);
  return TENDONS.find((t) => t.re.test(text)) || null;
}

export function tendonIsometricRules(intake = {}) {
  const tendon = activeTendon(intake);
  if (!tendon) return [];
  const reported = /\bisometric/i.test(flat([intake?.pain, intake?.injuries, intake?.notes]));
  const why = reported
    ? 'The athlete reports that isometric holds reliably reduce the symptoms'
    : 'The corpus prescribes isometric loading for an active tendon (A88.4)';
  return [
    `ACTIVE TENDON (${tendon.name}): ${why}. Include one isometric hold that loads the ${tendon.name} on each gym day, for example ${tendon.hold}, 4-5 holds of 30-45 seconds at an effort that does not raise pain above the athlete's usual level, placed early in the session. It is tendon management, not conditioning, so it does not count against a no-added-conditioning instruction.`,
  ];
}
