import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISCARDED_CALL_MARKER = 'OPENAI-DISCARDED-CALL-ACCOUNTING';

// Run #116 took 22.8 minutes to produce one program, and 13 of those minutes
// bought nothing at all.
//
// The arithmetic is exact. The request ceiling on the OpenAI path is 780s. The
// job reported its first attempt taking 1074s, and 780 + 294 = 1074: one
// generation ran to the ceiling, was aborted, and a retry then succeeded in
// 294s. The three calls the job admitted to took 294 + 110 + 178 = 582s. The
// fourth call -- the one nothing recorded -- cost 780s, which is 57% of the
// client's wait.
//
// It was invisible twice over.
//
//   recordBuildUsage runs after a successful response is parsed, so a call that
//   aborts throws straight past it. buildUsage.calls therefore counts calls
//   that WORKED, and the build honestly reported "3 model call(s)" for a build
//   that made four. Every cost figure derived from it understates the real
//   one, and the most expensive call of the build is the one it cannot see.
//
//   The transient-retry branch decrements the attempt counter and re-emits the
//   same stage and detail, so the progress a client polls showed
//   "generating / attempt 1 / initial generation" without changing for
//   eighteen minutes.
//
// This records the discarded call and says so out loud. It deliberately does
// NOT change the ceiling: one observation above 780s is not a distribution, and
// choosing a new ceiling from it would be a guess dressed as a fix. Measure
// first -- that is what this is for.
export function patchDiscardedCallAccountingSource(input) {
  let src = String(input || '');
  if (src.includes(DISCARDED_CALL_MARKER)) return src;

  // 1. An aborted or failed provider call is recorded where it is caught.
  const anchor = "    } catch (e) {\n      const providerMessage = String(e?.message || e || '');";
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`discarded-call anchor expected once, found ${count}`);

  const replacement = [
    '    } catch (e) {',
    `      // ${DISCARDED_CALL_MARKER}: a call that produced nothing still cost`,
    '      // money and still cost the client their wall clock, so it belongs in',
    '      // the usage record exactly like one that returned a program.',
    '      recordDiscardedCall({',
    '        provider: "openai", model: OPENAI_MODEL,',
    '        outcome: (e?.name === "AbortError" || /aborted/i.test(String(e?.message || "")))',
    '          ? "aborted_at_request_ceiling" : "failed",',
    '        ceiling_ms: AI_REQUEST_TIMEOUT_MS,',
    '        elapsed_ms: Date.now() - started,',
    '      });',
    "      const providerMessage = String(e?.message || e || '');",
  ].join('\n');
  src = src.replace(anchor, replacement);

  // 2. The counters that hold it.
  const usageAnchor = 'function resetBuildUsage() {';
  if (src.split(usageAnchor).length - 1 !== 1) throw new Error('resetBuildUsage anchor expected once');
  src = src.replace(usageAnchor, [
    'function recordDiscardedCall(d) {',
    '  if (!buildUsage) resetBuildUsage();',
    '  buildUsage.discarded_calls = (buildUsage.discarded_calls || 0) + 1;',
    '  buildUsage.discarded_ms = (buildUsage.discarded_ms || 0) + Number(d?.elapsed_ms || 0);',
    '  console.warn("OpenAI generation discarded:", JSON.stringify(d));',
    '}',
    usageAnchor,
  ].join('\n'));

  // resetBuildUsage must clear them too, or a second build inherits the first
  // build's waste and the number silently becomes cumulative.
  const resetAnchor = 'buildUsage = { calls: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, openai_ms: 0 };';
  if (src.split(resetAnchor).length - 1 !== 1) throw new Error('buildUsage shape anchor expected once');
  src = src.replace(resetAnchor,
    'buildUsage = { calls: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, openai_ms: 0, discarded_calls: 0, discarded_ms: 0 };');

  // The third half of this -- making the retry visible in the progress a client
  // polls -- lives in server.js and already flows through the build, so it is
  // deliberately not duplicated here.

  return src;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
const before = fs.readFileSync(target, 'utf8');
const after = patchDiscardedCallAccountingSource(before);
if (after !== before) {
  fs.writeFileSync(target, after);
  console.log('server.phase15.js: discarded-call accounting applied');
} else {
  console.log('server.phase15.js: already current');
}
