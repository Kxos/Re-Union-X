// Test of medal-restored.js (Events Part 2, Task 5a; Events Part 3, Task 7a2): medals missing from our master restored as
// clones of a sibling.
//   node server/test-medal-restored.js
// Fixture rows only: a fake 90056 «Chip» 6★ and 90016 «Moogle» 6★ sibling; the SP Chip & Dale 90346 and Riku & Moogle 90296
// rows are added only when their art exists.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const mr = require('./medal-restored');

const chip = {
  medalId: 90056, imageId: 90056, thumbId: 90056, cutinId: 90056, imageCategory: 0, artId: 90056, displayId: 90056,
  sortId: 237, listSortId: 237, name: 'Chip', flavor: 'x', advantage: 'Increases strength by 150.', type: 4, attribute: 4,
  darklight: 3, rare: 6, maxLv: 1, cost: 999, minCost: 999, sell: 800, sellPerLv: 30, enhanceAttack: 150, enhanceDefense: 0,
  validPack: 1, autoEnhance: 1, addPetPt: 15, source: [0, 0, 0], evolveNeedId: [0, 0, 0, 0, 0], evolveMoney: 99999, groupId: 0,
};
const moogle = {
  medalId: 90016, imageId: 90016, thumbId: 90016, cutinId: 90016, imageCategory: 0, artId: 90016, displayId: 90016,
  sortId: 222, listSortId: 222, name: 'Moogle', flavor: 'x', advantage: 'A 6★ Medal with\ngreat resale value.', type: 3,
  attribute: 4, darklight: 3, rare: 6, maxLv: 1, cost: 999, minCost: 999, sell: 32000, sellJewel: 0, sellPerLv: 30,
  materialExp: 400, enhanceAttack: 0, enhanceDefense: 0, validPack: 1, autoEnhance: 0, addPetPt: 15, source: [0, 0, 0],
  evolveNeedId: [0, 0, 0, 0, 0], evolveMoney: 99999, groupId: 0, attack: 0, defense: 0, burstId: 0,
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medal-restored-'));
const art = path.join(tmp, 'img', 'medal');
const put = (id) => ['L', 'S'].forEach((k) => fs.writeFileSync(path.join(art, `Medal_${k}_${id}.png`), k));
try {
  // no art in the medal package: nothing added (master and package go together)
  let r = mr.restoredMedalRows([chip, moogle], tmp);
  assert.deepStrictEqual(r.rows, []);
  assert.deepStrictEqual(r.skipped, [90346, 90296], 'skipped without Medal_L/Medal_S');
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(art, 'Medal_L_90346.png'), 'L');
  assert.deepStrictEqual(mr.restoredMedalRows([chip, moogle], tmp).rows, [], 'Medal_S missing: still skipped');
  fs.writeFileSync(path.join(art, 'Medal_S_90346.png'), 'S');
  r = mr.restoredMedalRows([chip, moogle], tmp);
  assert.strictEqual(r.rows.length, 1);
  assert.deepStrictEqual(r.skipped, [90296]);
  const m = r.rows[0];
  for (const k of ['medalId', 'imageId', 'thumbId', 'cutinId', 'artId', 'displayId']) assert.strictEqual(m[k], 90346, k);
  assert.strictEqual(m.imageCategory, 0);
  assert.strictEqual(m.name, 'SP Chip & Dale');
  assert.strictEqual(m.advantage, 'Increases strength and defense\nby 1,000.');
  assert.strictEqual(m.flavor, "Private Pluto (1943)\n\nOne of Disney Castle's engineers.");
  assert.strictEqual(m.enhanceAttack, 1000);
  assert.strictEqual(m.enhanceDefense, 1000);
  assert.strictEqual(m.sortId, 1702);
  assert.strictEqual(m.listSortId, 1702);
  assert.strictEqual(m.rare, 6);
  assert.strictEqual(m.cost, 999, 'cost/minCost 999 like the siblings');
  assert.strictEqual(m.minCost, 999);
  assert.strictEqual(m.sell, 800);
  assert.strictEqual(m.type, 4, 'support');
  assert.notStrictEqual(m.source, chip.source, 'arrays are copies');
  assert.deepStrictEqual(m.source, [0, 0, 0]);
  assert.strictEqual(chip.name, 'Chip', 'sibling untouched');

  // Riku & Moogle 6★ 90296: Sell Medal worth 500 Jewels, clone of the Moogle 6★
  put(90296);
  r = mr.restoredMedalRows([chip, moogle, m], tmp);
  assert.strictEqual(r.rows.length, 1);
  const rm = r.rows[0];
  for (const k of ['medalId', 'imageId', 'thumbId', 'cutinId', 'artId', 'displayId']) assert.strictEqual(rm[k], 90296, k);
  assert.strictEqual(rm.name, 'Riku & Moogle');
  assert.strictEqual(rm.flavor, "KINGDOM HEARTS (2002)\n\nOne of Sora's best friends, and\na mysterious yet adorable moogle.");
  assert.strictEqual(rm.advantage, 'A Medal that can be exchanged\nfor Jewels.');
  assert.strictEqual(rm.type, 3, 'sell medal, not a Subslot Medal (type 10)');
  assert.strictEqual(rm.rare, 6);
  assert.strictEqual(rm.attribute, 4);
  assert.strictEqual(rm.sortId, 1588);
  assert.strictEqual(rm.listSortId, 1588);
  assert.strictEqual(rm.sell, 0, 'no munny');
  assert.strictEqual(rm.sellJewel, 500, '500 Jewels each');
  assert.strictEqual(rm.materialExp, 0);
  assert.strictEqual(rm.attack, 0);
  assert.strictEqual(rm.burstId, 0, 'no Special Attack');
  assert.strictEqual(moogle.sell, 32000, 'sibling untouched');

  // idempotent: an existing row is never duplicated; a missing sibling is an error
  assert.deepStrictEqual(mr.restoredMedalRows([chip, moogle, m, rm], tmp).rows, []);
  assert.throws(() => mr.restoredMedalRows([moogle], tmp), /90056/);
  assert.throws(() => mr.restoredMedalRows([chip], tmp), /90016/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('test-medal-restored: OK');
