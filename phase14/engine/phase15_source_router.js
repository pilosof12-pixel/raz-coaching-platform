// Phase 15 curated-source router.
// Grounds compact generation in the authored RAZ coaching engine.

const STOP = new Set(['about','after','again','also','around','because','before','between','build','client','could','days','from','goal','goals','have','into','like','more','most','only','other','over','program','session','sessions','some','than','that','their','them','then','they','this','training','using','very','want','week','weekly','what','when','where','which','while','with','without','work','would','your']);

function normalizeText(v) {
  if (Array.isArray(v)) return v.map(normalizeText).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function sourceCorpus(engineText) {
  const full = String(engineText || '');
  if (full.length < 50000) throw new Error('SOURCE_GROUNDING_CORPUS_TOO_SMALL');
  const markers = ['=== INTERNAL REFERENCE KNOWLEDGE LAYER', '# EXPANDED KNOWLEDGE LAYER', 'EXPANDED KNOWLEDGE LAYER (v10.9)'];
  let start = -1;
  for (const marker of markers) {
    const i = full.indexOf(marker);
    if (i >= 0 && (start < 0 || i < start)) start = i;
  }
  return start >= 0 ? full.slice(start) : full;
}

function chunkCorpus(engineText, maxChunkChars = 3200) {
  const paras = sourceCorpus(engineText).split(/\n{2,}/).map(x => x.trim()).filter(x => x.length >= 80);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > maxChunkChars) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
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

function scoreChunk(chunk, terms) {
  const low = chunk.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!low.includes(term)) continue;
    score += term.includes(' ') ? 5 : term.length >= 9 ? 3 : 1;
  }
  if (/article\s+n\d+|source|evidence|knowledge layer/i.test(chunk)) score += 1;
  return score;
}

export function retrieveCuratedCoachingExcerpts(engineText, intake = {}, options = {}) {
  const maxChars = Number(options.maxChars || 16000);
  const maxChunks = Number(options.maxChunks || 7);
  const terms = sourceRoutingTerms(intake);
  const scored = chunkCorpus(engineText).map((text, index) => ({ text, index, score: scoreChunk(text, terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = [];
  let used = 0;
  for (const item of scored) {
    if (selected.length >= maxChunks) break;
    if (used + item.text.length > maxChars && selected.length >= 3) continue;
    selected.push(item);
    used += item.text.length;
  }
  if (!selected.length) throw new Error('SOURCE_GROUNDING_NO_RELEVANT_EXCERPTS');
  return selected.map((x, i) => 'SOURCE EXCERPT ' + (i + 1) + '\n' + x.text).join('\n\n');
}

export function canonicalExerciseCatalog(exerciseDictionary) {
  const names = [...(exerciseDictionary || [])].map(String).filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (names.length < 50) throw new Error('SOURCE_GROUNDING_EXERCISE_CATALOG_TOO_SMALL');
  return names.join(' | ');
}

export function buildPhase15SourceGrounding(engineText, intake, exerciseDictionary) {
  return [
    '=== CURATED COACHING SOURCE EXCERPTS ===',
    'These excerpts come from the authored RAZ coaching knowledge engine built from the supplied coaching logic/articles/books. Treat them as internal evidence, not client-facing copy.',
    retrieveCuratedCoachingExcerpts(engineText, intake),
    '',
    '=== CANONICAL EXERCISE CATALOG ===',
    'Exercise-column names must come from this catalog exactly. Do not paraphrase, pluralize, rename or invent exercise names. Aliases are handled by the deterministic server, not by the model.',
    canonicalExerciseCatalog(exerciseDictionary),
  ].join('\n');
}
