// Test of make-event-enemies.js (Events Part 1, Task 2b): fake rows only (the real file is private).
//   node server/test-make-event-enemies.js
'use strict';
const assert = require('assert');
const ev = require('./make-event-enemies');
const fix = require('./enemy-attack-fix');

const row = (id, displayId, name = 'X') => ({ enemyId: id, name, displayId, skillId: [id * 10, 0, 0, 0], urgencySkillId: [0, 0, 0] });
const src = {
  enemies: {
    11: { row: row(11, 1), model: 'served', approved: true, attacks: [110] },
    12: { row: row(12, 2), model: 'new', approved: false, attacks: [120] },
    13: { row: row(13, 3), model: 'new', approved: true, attacks: [130] },
    14: { row: row(14, 4), model: 'missing', approved: false, attacks: [] },
    15: { row: row(15, 5), model: 'served', approved: true, attacks: [] },
  },
  attacks: { 110: { enemyAttackId: 110, power: 7 }, 1: { enemyAttackId: 1, power: 99 } },
};
const drawn = new Set([1, 2, 3, 4]);

// added: found + approved + drawn; master rows kept; previous run stripped (idempotent)
const master = [row(1, 1, 'Shadow'), row(11, 1, 'old copy')];
let rep = ev.addRows(master, src, drawn);
assert.deepStrictEqual(rep.added, [11, 13]);
assert.deepStrictEqual(rep.missing, [14]);
assert.deepStrictEqual(rep.unapproved, [12]);
assert.deepStrictEqual(rep.notDrawn, [15]);
assert.strictEqual(rep.stripped, 1);
assert.deepStrictEqual(master.map((e) => e.enemyId), [1, 11, 13]);
assert.strictEqual(master[1].name, 'X');
rep = ev.addRows(master, src, drawn);
assert.deepStrictEqual(master.map((e) => e.enemyId), [1, 11, 13]);
// the pushed rows are copies, never the source objects
master[1].name = 'changed';
assert.strictEqual(src.enemies[11].row.name, 'X');
// no source / no drawn set: nothing added
assert.deepStrictEqual(ev.addRows([row(1, 1)], null, drawn).added, []);
assert.deepStrictEqual(ev.addRows([], src, null).added, []);
// a row whose enemyId differs from its key is an error
assert.throws(() => ev.addRows([], { enemies: { 9: { row: row(8, 1), model: 'served', approved: true } } }, drawn));
// attack rows for enemy-attack-fix: the thethiny row wins on the same id
assert.strictEqual(ev.attackRows(src).length, 2);
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = path.join(os.tmpdir(), `ev-atk-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify([{ enemyAttackId: 1, power: 5 }]));
const orig = fix.readOrig(tmp, ev.attackRows(src));
fs.unlinkSync(tmp);
assert.deepStrictEqual(orig.map((r) => [r.enemyAttackId, r.power]), [[1, 5], [110, 7]]);
console.log('test-make-event-enemies: OK');
