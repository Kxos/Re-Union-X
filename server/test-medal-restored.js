// Test of medal-restored.js (Events Part 2, Task 5a): medals missing from our master restored as clones of a sibling.
//   node server/test-medal-restored.js
// Fixture rows only: a fake 90056 «Chip» 6★ sibling; the SP Chip & Dale 90346 row is added only when its art exists.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medal-restored-'));
const art = path.join(tmp, 'img', 'medal');
try {
  // no art in the medal package: nothing added (master and package go together)
  let r = mr.restoredMedalRows([chip], tmp);
  assert.deepStrictEqual(r.rows, []);
  assert.deepStrictEqual(r.skipped, [90346], 'skipped without Medal_L/Medal_S');
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(art, 'Medal_L_90346.png'), 'L');
  assert.deepStrictEqual(mr.restoredMedalRows([chip], tmp).rows, [], 'Medal_S missing: still skipped');
  fs.writeFileSync(path.join(art, 'Medal_S_90346.png'), 'S');
  r = mr.restoredMedalRows([chip], tmp);
  assert.strictEqual(r.rows.length, 1);
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
  // idempotent: an existing row is never duplicated; a missing sibling is an error
  assert.deepStrictEqual(mr.restoredMedalRows([chip, m], tmp).rows, []);
  assert.throws(() => mr.restoredMedalRows([], tmp), /90056/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('test-medal-restored: OK');
