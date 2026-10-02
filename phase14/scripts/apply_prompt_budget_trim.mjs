// A prompt one sentence over budget should lose a sentence, not the build.
//
// Run #156 lost tactical_3k in two seconds flat: "OpenAI compact build prompt
// exceeded 70000 characters." No model call, no program, a build slot spent on a
// throw. Measured across the six launch avatars the assembled prompt runs:
//
//   masters 53181   basketball 53811   triathlete 61580
//   youth   68623   hybrid     69378   tactical   70663  <- over by 663
//
// Three of six sit within 1400 characters of a hard failure, so any authored
// rule added anywhere could delete a paid build, and did. The budget itself is
// reasonable; destroying the build to enforce it is not.
//
// So the limit now trims instead of throwing, and it trims the one section that
// can afford it: CURATED COACHING SOURCE EXCERPTS. Those are retrieved by
// relevance and ranked, so the tail is the least relevant text in the prompt --
// and on the youth athlete it is 28797 characters, more than a third of the
// whole thing. Everything authored is preserved: the deterministic skeleton
// (which carries the required exposures), the Phase 15 quality gate, and the
// goal-specific specialist rules distilled from the sources.
//
// If trimming the excerpts cannot get under budget, the throw still happens.
// A prompt that large is a real defect rather than a rounding error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '..', 'server.phase15.js');
let s = fs.readFileSync(target, 'utf8');
const before = s;

const MARK = 'OPENAI-COMPACT-PROMPT-BUDGET-TRIM';

const anchor = '      const compactUser = buildOpenAICompactUser(userContent);';
const patched = `      let compactUser = buildOpenAICompactUser(userContent);
      // ${MARK}: trim the retrieved excerpts rather than lose the build.
      if (/A NEW CLIENT has submitted/i.test(String(userContent || "")) && compactUser.length > 70000) {
        const header = "=== CURATED COACHING SOURCE EXCERPTS";
        const at = compactUser.indexOf(header);
        if (at >= 0) {
          const nextHeader = compactUser.indexOf("\\n=== ", at + header.length);
          const endOfBlock = nextHeader >= 0 ? nextHeader : compactUser.length;
          const over = compactUser.length - 70000;
          const block = compactUser.slice(at, endOfBlock);
          // Keep a floor of excerpt text: a grounding section trimmed to nothing
          // is a different prompt, not a smaller one.
          const keep = Math.max(2000, block.length - over - 400);
          if (keep < block.length) {
            const trimmed = block.slice(0, keep).replace(/\\n[^\\n]*$/, "")
              + "\\n[Excerpts truncated to fit the prompt budget. The rules above are complete; only the lowest-ranked source excerpts were dropped.]";
            compactUser = compactUser.slice(0, at) + trimmed + compactUser.slice(endOfBlock);
            console.warn("OpenAI prompt budget: trimmed " + (block.length - trimmed.length) + " characters of source excerpts to fit 70000.");
          }
        }
      }`;

if (!s.includes(MARK)) {
  if (!s.includes(anchor)) throw new Error('compact-user anchor missing');
  s = s.replace(anchor, patched);
}

if (s !== before) fs.writeFileSync(target, s);
console.log('prompt budget trim applied');
