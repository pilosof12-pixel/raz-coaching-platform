import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMPTY_OUTPUT_MARKER = 'OPENAI-EMPTY-OUTPUT-TRANSIENT-RETRY';

export function patchOpenAIEmptyOutputRetrySource(input) {
  let src = String(input || '');
  if (src.includes(EMPTY_OUTPUT_MARKER)) return src;

  const old = '      if (!text) throw new Error("OpenAI returned no output_text content.");';
  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`OpenAI empty-output anchor expected once, found ${count}`);

  const replacement = [
    '      if (!text) {',
    '        const emptyOutputError = new Error("OpenAI returned no output_text content.");',
    '        emptyOutputError.code = "OPENAI_EMPTY_OUTPUT";',
    '        emptyOutputError.status = 503; // OPENAI-EMPTY-OUTPUT-TRANSIENT-RETRY',
    '        throw emptyOutputError;',
    '      }',
  ].join('\n');

  return src.replace(old, replacement);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  const target = fileURLToPath(new URL('../server.phase15.js', import.meta.url));
  const before = fs.readFileSync(target, 'utf8');
  const after = patchOpenAIEmptyOutputRetrySource(before);
  fs.writeFileSync(target, after);
  console.log(`${target}: ${after === before ? 'already current' : 'empty OpenAI output classified as transient'}`);
}
