import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSPORT_RETRY_MARKER = 'OPENAI-TRANSPORT-TRANSIENT-RETRY';

// Live acceptance run #76 lost Advanced Hybrid to {"error":"fetch failed"} sixty
// seconds into attempt 2, after the build had already paid for a full first
// attempt. Nothing was wrong with the program: the connection to the provider
// dropped, and a dropped connection was being treated as a verdict on the
// build.
//
// This is the same mistake the empty-output retry already fixed one line below,
// for the same reason -- a transient condition ending a build that had only to
// ask again. An attempt costs minutes and real money, so the request is retried
// where it failed rather than costing a regeneration.
//
// Deliberately NOT retried:
//   * our own AbortController firing, which is a deterministic timeout and
//     would only double the wall clock against the build deadline
//   * 4xx other than 429 -- a bad request fails identically every time
export function patchOpenAITransportRetrySource(input) {
  let src = String(input || '');
  if (src.includes(TRANSPORT_RETRY_MARKER)) return src;

  const helperAnchor = 'async function runEngineRaw(userContent) {';
  const helperCount = src.split(helperAnchor).length - 1;
  if (helperCount !== 1) throw new Error(`runEngineRaw anchor expected once, found ${helperCount}`);

  const helper = [
    '// OPENAI-TRANSPORT-TRANSIENT-RETRY',
    'function isTransientTransportError(e) {',
    '  // undici reports a dropped connection as TypeError: fetch failed and puts',
    '  // the real reason on .cause.',
    '  const code = e?.cause?.code || e?.code || "";',
    '  if (["ECONNRESET","ECONNREFUSED","ETIMEDOUT","EPIPE","EAI_AGAIN","ENOTFOUND","UND_ERR_SOCKET","UND_ERR_CONNECT_TIMEOUT"].includes(code)) return true;',
    '  return e instanceof TypeError && /fetch failed|network|socket/i.test(String(e.message || ""));',
    '}',
    '',
    'async function openAIFetchWithTransportRetry(url, init, signal, maxAttempts = 3) {',
    '  let lastError = null;',
    '  for (let attempt = 1; attempt <= maxAttempts; attempt++) {',
    '    try {',
    '      const r = await fetch(url, init);',
    '      // 429 and 5xx are the provider asking us to come back, not a verdict',
    '      // on the request. The body is a string, so it is safe to re-send.',
    '      if ((r.status === 429 || r.status >= 500) && attempt < maxAttempts) {',
    '        lastError = new Error("OpenAI HTTP " + r.status);',
    '        console.warn(`openAIFetchWithTransportRetry: HTTP ${r.status} on attempt ${attempt}/${maxAttempts}; retrying`);',
    '      } else {',
    '        return r;',
    '      }',
    '    } catch (e) {',
    '      // Our own timeout is deterministic: asking again cannot help and only',
    '      // spends the build deadline.',
    '      if (signal?.aborted) throw e;',
    '      if (!isTransientTransportError(e) || attempt >= maxAttempts) throw e;',
    '      lastError = e;',
    '      console.warn(`openAIFetchWithTransportRetry: ${e?.message || e} on attempt ${attempt}/${maxAttempts}; retrying`);',
    '    }',
    '    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));',
    '    if (signal?.aborted) break;',
    '  }',
    '  throw lastError || new Error("OpenAI request failed after transport retries.");',
    '}',
    '',
  ].join('\n');

  src = src.replace(helperAnchor, helper + helperAnchor);

  const callAnchor = '      const r = await fetch("https://api.openai.com/v1/responses", {';
  const callCount = src.split(callAnchor).length - 1;
  if (callCount !== 1) throw new Error(`OpenAI call anchor expected once, found ${callCount}`);

  src = src.replace(
    callAnchor,
    '      const r = await openAIFetchWithTransportRetry("https://api.openai.com/v1/responses", {',
  );

  const tailAnchor = '        signal: controller.signal\n      });';
  const tailCount = src.split(tailAnchor).length - 1;
  if (tailCount !== 1) throw new Error(`OpenAI call tail anchor expected once, found ${tailCount}`);

  return src.replace(tailAnchor, '        signal: controller.signal\n      }, controller.signal);');
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  const target = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(target, 'utf8');
  const after = patchOpenAITransportRetrySource(before);
  fs.writeFileSync(target, after);
  console.log(`${target}: ${after === before ? 'already current' : 'OpenAI transport failures retried in place'}`);
}
