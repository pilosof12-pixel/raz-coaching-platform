// Phase 15 curated-source router.
// Grounds compact generation in the authored RAZ coaching engine.

import fs from 'node:fs';

const STOP = new Set(['about','after','again','also','around','because','before','between','build','client','could','days','from','goal','goals','have','into','like','more','most','only','other','over','program','session','sessions','some','than','that','their','them','then','they','this','training','using','very','want','week','weekly','what','when','where','which','while','with','without','work','would','your']);

function loadEnduranceCorpus() {
  const sourceFiles = [
    './endurance_runtime_parts/part01_foundations.md',
    './endurance_runtime_parts/part02_programming.md',
    './endurance_runtime_parts/part03_application.md',
  ];
  const text = sourceFiles
    .map((p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').trim())
    .join('\n\n');
  if (
    text.length < 12000 ||
    !/ARTICLE 11[\s\S]*Conditioning Decision System/i.test(text) ||
    !/ENGINE-WIDE DECISION HIERARCHY/i.test(text) ||
    !/Do not strengthen a rule beyond what this source pack says/i.test(text)
  ) {
    throw new Error('ENDURANCE_SOURCE_CORPUS_INVALID');
  }
  return text;
}

const ENDURANCE_CORPUS = loadEnduranceCorpus();

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

function chunkText(full, maxChunkChars = 1800) {
  const paras = String(full || '').split(/\n{2,}/).map(x => x.trim()).filter(x => x.length >= 80);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > maxChunkChars) { chunks.push(buf); buf = p; }
    else buf = buf ? buf + '\n\n' + p : p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function chunkCorpus(engineText, maxChunkChars = 1800) {
  return chunkText(sourceCorpus(engineText), maxChunkChars);
}

function rawIntake(intake = {}) { return normalizeText(intake).toLowerCase(); }

export function isEnduranceRelevant(intake = {}) {
  const raw = rawIntake(intake);
  return /\b(?:cardio|conditioning|endurance|aerobic|zone\s*2|vo2|maximal aerobic|threshold|critical\s+(?:speed|power)|3\s*k(?:m)?|5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|run(?:ning)?|row(?:ing|er)?|erg(?:ometer)?|cycling|cyclist|bike|swim(?:ming)?|triathlon|ironman|repeated sprint|work capacity)\b/i.test(raw);
}

export function sourceRoutingTerms(intake = {}) {
  const raw = rawIntake(intake);
  const terms = new Set();
  for (const token of raw.match(/[a-z][a-z0-9-]{2,}/g) || []) if (!STOP.has(token)) terms.add(token);
  const add = xs => xs.forEach(x => terms.add(x));
  if (/hypertroph|muscle|physique|body composition/.test(raw)) add(['hypertrophy','muscle growth','training volume','proximity to failure','rir','rpe']);
  if (/strength|weighted pull|weighted chin|weighted dip|calisthen/.test(raw)) add(['strength','maximal strength','weighted calisthenics','specificity','load progression']);
  if (/explos|athlet|power|warrior|batman|jump|sprint|plyometric/.test(raw)) add(['power','plyometric','jump','sprint','explosive','velocity loss','full recovery']);
  if (/park|outdoor|rings|pull-up bar|dip bars/.test(raw)) add(['bodyweight','rings','pull-up','dip','unilateral','limited external load','calisthenics']);
  if (/zone\s*2|aerobic|conditioning|cardio|endurance|work capacity/.test(raw)) add(['aerobic','low intensity','zone 2','conditioning','work capacity','interference','concurrent training','recovery cost','intensity distribution']);
  if (/vo2|maximal aerobic/.test(raw)) add(['vo2max','interval training','high aerobic power','time near vo2max','long intervals','short intervals']);
  if (/threshold|tempo|critical speed|critical power/.test(raw)) add(['threshold','critical speed','critical power','sustainable intensity','pace','intensity domain']);
  if (/3\s*k|5\s*k|10\s*k|half[- ]?marathon|marathon|run(?:ning)?/.test(raw)) add(['running','running pace','event specific','economy','tissue tolerance','threshold','vo2max','modality specificity']);
  if (/row(?:ing|er)?|erg(?:ometer)?|concept ?2/.test(raw)) add(['rowing','rowing pace','rowing power','stroke rate','modality specificity']);
  if (/cycling|cyclist|bike|criterium/.test(raw)) add(['cycling','power','watts','modality specificity','low eccentric']);
  if (/swim(?:ming)?|freestyle|pool/.test(raw)) add(['swimming','swim pace','technique','economy','modality specificity']);
  if (/triathlon|ironman|multisport/.test(raw)) add(['triathlon','multisport','swim','bike','run','separate intensity anchors','event specific']);
  if (/bjj|jiu|mma|wrestl|boxing|combat|sport/.test(raw)) add(['sport','combat','concurrent training','fatigue','recovery','interference','sport practice','repeated high intensity']);
  if (/pain|injur|tendon|elbow|shoulder|knee|back|sciatica/.test(raw)) add(['pain','tendon','load management','return to loading','symptom response','impact tolerance']);
  return [...terms];
}

function scoreChunk(chunk, terms) {
  const low = chunk.toLowerCase(); let score = 0;
  for (const term of terms) if (low.includes(term)) score += term.includes(' ') ? 5 : term.length >= 9 ? 3 : 1;
  if (/article\s+\d+|decision rules|programming implications|source synthesis|source traceability/i.test(chunk)) score += 2;
  return score;
}

function ranked(chunks, terms, kind) {
  return chunks.map((text,index)=>({text,index,kind,score:scoreChunk(text,terms)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
}

function takeWithin(selected, candidates, count, maxChars, usedRef) {
  for (const item of candidates) {
    if (selected.filter(x => x.kind === item.kind).length >= count) break;
    if (selected.some(x => x.kind === item.kind && x.index === item.index)) continue;
    if (usedRef.value + item.text.length > maxChars && selected.length >= 2) continue;
    selected.push(item); usedRef.value += item.text.length;
  }
}

export function retrieveCuratedCoachingExcerpts(engineText, intake = {}, options = {}) {
  const endurance = isEnduranceRelevant(intake);
  const maxChars = Number(options.maxChars || (endurance ? 8600 : 5200));
  const maxChunks = Number(options.maxChunks || (endurance ? 5 : 3));
  const terms = sourceRoutingTerms(intake);
  const base = ranked(chunkCorpus(engineText), terms, 'RAZ BASE');
  const end = endurance ? ranked(chunkText(ENDURANCE_CORPUS), terms, 'ENDURANCE CLUSTER') : [];
  const selected=[]; const used={value:0};

  if (endurance) {
    // Reserve both source families for hybrid cases: the new endurance cluster supplies
    // physiology/prescription while the original RAZ corpus preserves strength, skill,
    // injury and other authored coaching logic. This prevents either side crowding out the other.
    takeWithin(selected, end, Math.min(3, maxChunks), maxChars, used);
    if (selected.length < maxChunks) takeWithin(selected, base, Math.min(2, maxChunks-selected.length), maxChars, used);
    const merged = [...end, ...base].sort((a,b)=>b.score-a.score||a.index-b.index);
    for (const item of merged) {
      if (selected.length >= maxChunks) break;
      if (selected.some(x => x.kind===item.kind && x.index===item.index)) continue;
      if (used.value + item.text.length > maxChars) continue;
      selected.push(item); used.value += item.text.length;
    }
  } else {
    takeWithin(selected, base, maxChunks, maxChars, used);
  }

  if (!selected.length) throw new Error('SOURCE_GROUNDING_NO_RELEVANT_EXCERPTS');
  return selected.map((x,i)=>`${x.kind} SOURCE EXCERPT ${i+1}\n${x.text}`).join('\n\n');
}

function exerciseFamilyTerms(intake = {}) {
  const raw = rawIntake(intake);
  const terms = new Set(['warm-up','plank','dead bug','pallof','carry','row','push-up','pull-up','chin-up']);
  const add = xs => xs.forEach(x => terms.add(x));
  if (/one-arm|oap|weighted chin|weighted pull/.test(raw)) add(['one-arm','weighted pull-up','weighted chin-up','archer pull-up','pull-up','chin-up']);
  if (/squat|box squat|lower body|leg/.test(raw)) add(['squat','box squat','split squat','lunge','hip thrust','leg press','hamstring curl','calf raise']);
  if (/overhead press|\bohp\b|push press|shoulder/.test(raw)) add(['overhead press','push press','dumbbell shoulder press','lateral raise','face pull']);
  if (/zone\s*2|aerobic|conditioning|cardio|endurance|3\s*k|5\s*k|10\s*k|marathon|run/.test(raw)) add(['zone-2','bike','row','run','treadmill','assault bike','sprint']);
  if (/row(?:ing|er)?|erg/.test(raw)) add(['row','rower']);
  if (/cycling|bike/.test(raw)) add(['bike','assault bike']);
  if (/bjj|mma|wrestl|combat/.test(raw)) add(['neck','pallof','carry','row','hip thrust','copenhagen','side plank']);
  if (/planche/.test(raw)) add(['planche']);
  if (/front lever/.test(raw)) add(['front lever']);
  if (/handstand|hspu/.test(raw)) add(['handstand','pike push-up']);
  if (/dip/.test(raw)) add(['dip']);
  if (/park|rings/.test(raw)) add(['ring','dip','pull-up','chin-up','sprint','broad jump','split squat']);
  return [...terms];
}

export function canonicalExerciseCatalog(exerciseDictionary, intake = {}) {
  const all = [...(exerciseDictionary || [])].map(String).filter(Boolean);
  if (all.length < 50) throw new Error('SOURCE_GROUNDING_EXERCISE_CATALOG_TOO_SMALL');
  const terms = exerciseFamilyTerms(intake);
  const selected = all.filter(name => {
    const low = name.toLowerCase();
    return terms.some(term => low.includes(term));
  });
  // Keep a compact, deterministic closed set. If routing becomes too narrow, fall back to the first
  // canonical names rather than sending the entire library and breaking prompt-size limits.
  const unique = [...new Set(selected)].sort((a,b)=>a.localeCompare(b));
  const fallback = all.filter(x=>!unique.includes(x)).slice(0, Math.max(0, 60-unique.length));
  return [...unique, ...fallback].slice(0, 120).join(' | ');
}

export function buildPhase15SourceGrounding(engineText, intake, exerciseDictionary) {
  return [
    '=== CURATED COACHING SOURCE EXCERPTS ===',
    'These excerpts come from the authored RAZ coaching knowledge engine and the approved source-grounded Endurance / Conditioning cluster. Treat them as internal evidence, not client-facing copy. Do not use generic model memory to fill an unresolved source gap.',
    retrieveCuratedCoachingExcerpts(engineText, intake),
    '',
    '=== CANONICAL EXERCISE CATALOG ===',
    'Exercise-column names must come from this catalog exactly. Do not paraphrase, pluralize, rename or invent exercise names. Aliases are handled by the deterministic server, not by the model.',
    canonicalExerciseCatalog(exerciseDictionary, intake),
  ].join('\n');
}
