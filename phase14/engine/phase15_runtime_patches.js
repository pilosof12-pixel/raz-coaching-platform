export function patchPhase15RuntimeSource(input) {
  let s = String(input || '');

  // The old formula safety-net treated every endurance/cardio goal as requiring
  // an EMOM/AMRAP/Zone-2/density-style row. That is not source-grounded: a valid
  // named endurance goal may use continuous, threshold, pace or interval work.
  // Keep this legacy absence check only for goals that explicitly request density.
  const densityLine = /^\s*const DENSITY_DEMANDING_GOAL = \/.*\/;\s*$/m;
  const densityMatches = s.match(new RegExp(densityLine.source, 'gm')) || [];
  if (densityMatches.length !== 1) throw new Error(`Expected one DENSITY_DEMANDING_GOAL line, found ${densityMatches.length}`);
  s = s.replace(densityLine, '    const DENSITY_DEMANDING_GOAL = /(?:emom|amrap|density)/; // source-aligned: only explicit density goals require density rows');

  // Final TSV normalization happens after the legacy closed-set validator. The
  // validator may mark harmless naming variants as [REVIEW] even when the intended
  // movement is already canonical in the authored path. Resolve only exact,
  // unambiguous aliases here; do not broaden the exercise closed set.
  const fnStart = s.indexOf('function phase15LastMileTsv');
  const fnEnd = s.indexOf('\nfunction privacyScrub', fnStart);
  if (fnStart < 0 || fnEnd < 0) throw new Error('phase15LastMileTsv block not found');
  let block = s.slice(fnStart, fnEnd);
  const pushAnchor = "    out.push(cells.join('\\t'));";
  const pushCount = block.split(pushAnchor).length - 1;
  if (pushCount !== 1) throw new Error(`Expected one phase15LastMileTsv push anchor, found ${pushCount}`);
  block = block.replace(pushAnchor, [
    "    // ENDURANCE-ALIAS-LASTMILE: exact aliases only, never free-form exercise invention.",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Zone-2 Rower$/i.test(ex)) { cells[1] = 'Zone-2 Row'; cells[7] = 'Low-intensity rowing. Keep output controlled and repeatable, and use pace or power as the external anchor.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Bicep Curl(?: \\(Dumbbell\\))?$/i.test(ex)) { cells[1] = 'Dumbbell Curl'; cells[7] = 'Controlled accessory work. Keep the prescribed effort and stop before form deteriorates.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Passive Hang$/i.test(ex)) { cells[1] = 'Dead Hang'; cells[7] = 'Relax into a controlled hang with a secure grip; stop before grip or shoulder position deteriorates.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Swimming$/i.test(ex)) { cells[1] = 'Swim'; cells[7] = 'Use swim pace and technique quality as the primary external anchors for this session.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Cycling$/i.test(ex)) { cells[1] = 'Bike'; cells[7] = 'Use cycling power or pace as the primary external anchor and keep the prescribed session intent.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?Running$/i.test(ex)) { cells[1] = 'Run'; cells[7] = 'Use running pace as the primary external anchor and keep the prescribed session intent.'; ex = cells[1]; }",
    "    if (/^(?:\\[REVIEW\\]\\s*)?\\[COOLDOWN\\]\\s*Easy Walk$/i.test(ex)) continue;",
    "    // Sprint intensity uses speed/quality language, not strength-set RPE.",
    "    if (/^Sprint$/i.test(ex)) {",
    "      cells[6] = 'N/A';",
    "      const sprintNote = String(cells[7] || '').trim();",
    "      if (!/(speed|velocity|quality|%)/i.test(sprintNote)) cells[7] = sprintNote ? sprintNote + ' Speed/quality target governs intensity; stop before speed drops.' : 'Speed/quality target governs intensity; stop before speed drops.';",
    "    }",
    pushAnchor,
  ].join('\n'));
  s = s.slice(0, fnStart) + block + s.slice(fnEnd);

  // Internal source-router labels are never client-facing coaching language.
  // Remove exact source-excerpt labels in prose without changing the prescription.
  const scrubAnchor = 'function scrubForbiddenWords(s) {\n  if (!s) return s;';
  const scrubCount = s.split(scrubAnchor).length - 1;
  if (scrubCount !== 1) throw new Error(`Expected one scrubForbiddenWords anchor, found ${scrubCount}`);
  s = s.replace(scrubAnchor, scrubAnchor + "\n  s = s.replace(/\\b(?:RAZ BASE |ENDURANCE )?SOURCE EXCERPT\\s*\\d+\\b/gi, 'the coaching plan'); // SOURCE-LABEL-CLIENT-SCRUB");

  // Make the compact-provider instruction say the same thing before generation,
  // reducing how often deterministic cleanup is needed.
  const oldSprint = 'short acceleration sprints use roughly 90-95% quality effort with about 2-3 minutes full recovery and stop before speed drops.';
  const newSprint = 'short acceleration sprints use roughly 90-95% speed-quality effort with about 2-3 minutes full recovery and stop before speed drops. For Sprint rows, Target RPE is N/A because speed quality, not strength-set RPE, defines intensity.';
  const sprintCount = s.split(oldSprint).length - 1;
  if (sprintCount === 1) s = s.replace(oldSprint, newSprint);

  // Goal performance is not current capacity. This is an integrity rule from the
  // authored endurance decision system, not a new numerical training prescription.
  const targetAnchor = 'Goal numbers are targets, not current capacities.';
  const targetReplacement = 'Goal numbers are targets, not current capacities. ENDURANCE TARGET ANCHOR: a future goal pace, power or split is not automatically a sustainable current training intensity. Calibrate endurance sessions from supplied current performance plus the routed authored sources; use goal pace only in a dose the athlete can plausibly execute from current capacity. ENDURANCE-TSV-FIELD-CONTRACT: for interval rows, Sets is interval count, Reps is work distance or duration, Weight carries the external pace/power/split target when one is prescribed, Rest is actual between-interval recovery duration, Target RPE is internal effort only when useful, and Notes explains execution. Never put target pace or split in the Rest column. For continuous endurance rows, Reps is total duration/distance and Rest is N/A.';
  const targetCount = s.split(targetAnchor).length - 1;
  if (targetCount === 1) s = s.replace(targetAnchor, targetReplacement);

  // The compact Phase-15 provider originally short-circuited whenever an OpenAI
  // key existed, so a quota/outage/timeout error never reached the existing Gemini
  // path. Restore fallback only for provider-availability failures. Crucially, the
  // fallback must use BOTH the same compact user prompt AND the same compact system
  // contract.
  const fnAnchor = 'async function runEngineRaw(userContent) {\n  if (OPENAI_API_KEY) {';
  const fnCount = s.split(fnAnchor).length - 1;
  if (fnCount !== 1) throw new Error(`Expected one runEngineRaw anchor, found ${fnCount}`);
  s = s.replace(fnAnchor, 'async function runEngineRaw(userContent) {\n  let sourceGroundedGeminiFallback = false;\n  if (OPENAI_API_KEY) {');

  const providerAnchor = [
    '    } finally {',
    '      clearTimeout(timer);',
    '    }',
    '  }',
    '  if (USE_PPLX_PROXY) {',
  ].join('\n');
  const providerCount = s.split(providerAnchor).length - 1;
  if (providerCount !== 1) throw new Error(`Expected one OpenAI provider-finally anchor, found ${providerCount}`);
  const providerReplacement = [
    '    } catch (e) {',
    "      const providerMessage = String(e?.message || e || '');",
    "      const providerUnavailable = e?.name === 'AbortError' || /(no credits remaining|insufficient[_ -]?quota|quota|rate limit|too many requests|\\b429\\b|\\b5\\d\\d\\b|temporar|timeout|timed out|service unavailable|overloaded)/i.test(providerMessage);",
    '      if (!GEMINI_API_KEY || !providerUnavailable) throw e;',
    "      console.warn('OpenAI provider unavailable; using source-grounded Gemini fallback:', providerMessage);",
    '      userContent = buildOpenAICompactUser(userContent);',
    '      sourceGroundedGeminiFallback = true;',
    '    } finally {',
    '      clearTimeout(timer);',
    '    }',
    '  }',
    '  if (USE_PPLX_PROXY) {',
  ].join('\n');
  s = s.replace(providerAnchor, providerReplacement);

  const cacheAnchor = '  const cacheName = await getEngineCacheName();';
  const cacheCount = s.split(cacheAnchor).length - 1;
  if (cacheCount !== 1) throw new Error(`Expected one engine-cache anchor, found ${cacheCount}`);
  s = s.replace(cacheAnchor, '  const cacheName = sourceGroundedGeminiFallback ? null : await getEngineCacheName();');

  const inlineAnchor = '    config: { ...genParams, systemInstruction: ENGINE },';
  const inlineCount = s.split(inlineAnchor).length - 1;
  if (inlineCount !== 1) throw new Error(`Expected one inline Gemini system anchor, found ${inlineCount}`);
  s = s.replace(inlineAnchor, '    config: { ...genParams, systemInstruction: sourceGroundedGeminiFallback ? OPENAI_COMPACT_DEVELOPER : ENGINE },');

  return s;
}
