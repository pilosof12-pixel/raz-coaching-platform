import fs from 'node:fs';

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

b = b.replaceAll('sentUserChars > 30000', 'sentUserChars > 45000');
b = b.replaceAll('exceeded 30000 characters', 'exceeded 45000 characters');
b = b.replaceAll('deterministic-skeleton-v5.2.9-source-grounded', 'deterministic-skeleton-v5.2.10-source-grounded');
b = b.replaceAll('raz-phase15-source-grounded-v5-2-9', 'raz-phase15-source-grounded-v5-2-10');

if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'raised grounded compact cap and bumped v5.2.10' : 'already current'}`);
