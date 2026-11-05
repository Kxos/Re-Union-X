// I-205 (user decisions 05-11): medal names fixed by medal-name-fix.js, and on the real master (when present) the Kyroo
// Subslot medals [SAB LV 7-10] do not evolve, Queen of Hearts keeps the 1/2/2 Playing Cards, Fantasia Mickey A -> B.
//   node server/test-medal-name-fix.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyNameFix } = require('./medal-name-fix');

const rows = [
  { medalId: 90085, groupId: 0, name: 'Fantasia Mickey Ver. A' },
  { medalId: 2090085, groupId: 90085, name: 'Fantasia Mickey Ver. A' },
  { medalId: 41036, groupId: 0, name: 'Illustrated Sora' },
  { medalId: 90086, groupId: 0, name: 'Other' },
];
assert.strictEqual(applyNameFix(rows), 3, 'three rows renamed');
assert.deepStrictEqual(rows.map((r) => r.name), ['Fantasia Mickey A', 'Fantasia Mickey A', 'Illustrated Sora A', 'Other']);
assert.strictEqual(applyNameFix(rows), 0, 'idempotent');

const file = path.join(process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
if (fs.existsSync(file)) {
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const by = new Map(medals.map((m) => [m.medalId, m]));
  const kyroo = medals.filter((m) => /Kyroo \[SAB LV \d+\]/.test(m.name));
  if (kyroo.length) {
    assert.strictEqual(kyroo.length, 24, 'six Kyroo medals x 4 tiers');
    const evolving = kyroo.filter((m) => m.validEvolve || m.evolveId);
    assert.deepStrictEqual(evolving.map((m) => m.medalId), [], 'no Kyroo tier evolves into the next one');
  }
  assert.strictEqual(by.get(90085).name, 'Fantasia Mickey A', '90085 renamed');
  assert.strictEqual(by.get(90085).evolveId, 300913, 'Fantasia Mickey A -> B kept');
  const qoh = [21133, 21134, 21135].map((id) => by.get(id) && by.get(id).validEvolveNeed);
  assert.deepStrictEqual(qoh, [1, 2, 2], 'Queen of Hearts 1/2/2 Playing Cards kept');
  console.log(`master: ${kyroo.length} Kyroo rows without Evolve, 90085 «${by.get(90085).name}», Queen of Hearts ${qoh.join('/')}`);
}
console.log('test-medal-name-fix OK');
