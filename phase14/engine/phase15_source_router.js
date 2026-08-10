// Phase 15 curated-source router.
// Grounds compact generation in the authored RAZ coaching engine.

const STOP = new Set(['about','after','again','also','around','because','before','between','build','client','could','days','from','goal','goals','have','into','like','more','most','only','other','over','program','session','sessions','some','than','that','their','them','then','they','this','training','using','very','want','week','weekly','what','when','where','which','while','with','without','work','would','your']);

function normalizeText(v) {
  if (Array.isArray(v)) return v.map(normalizeText).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

export function sourceRoutingTerms(intake = {}) {
  const raw = normalizeText(intake).toLowerCase();
  const terms = new Set();
  for (const token of raw.match(/[a-z][a-z0-9-]{3,}/g) || []) if (!STOP.has(token)) terms.add(token);
  const add = xs => xs.forEach(x => terms.add(x));
  if (/hypertroph|muscle|physique|body composition/.test(raw)) add(['hypertrophy','muscle growth','training volume','proximity to failure','rir','rpe']);
  if (/strength|weighted pull|weighted chin|weighted dip|calisthen/.test(raw)) add(['strength','maximal strength','weighted calisthenics','specificity','load progression']);
  if (/explos|athlet|power|warrior|batman|jump|sprint|plyometric/.test(raw)) add(['power','plyometric','jump','sprint','explosive','velocity loss','full recovery']);
  if (/park|outdoor|rings|pull-up bar|dip bars/.test(raw)) add(['bodyweight','rings','pull-up','dip','unilateral','limited external load','calisthenics']);
  if (/zone\s*2|aerobic|conditioning|work capacity/.test(raw)) add(['aerobic','zone 2','conditioning','work capacity','interference','concurrent training']);
  if (/bjj|jiu|mma|wrestl|combat|sport/.test(raw)) add(['sport','concurrent training','fatigue','recovery','interference']);
  if (/pain|injur|tendon|elbow|shoulder|knee|back|sciatica/.test(raw)) add(['pain','tendon','load management','return to loading','symptom response']);
  return [...terms];
}
