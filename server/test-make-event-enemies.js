// Test of make-event-enemies.js (Events Part 1, Task 2b): fake rows only (the real file is private).
//   node server/test-make-event-enemies.js
// 1. the global switch KHUX_EVENT_ENEMIES (default off: nothing enters the master, no attack rows);
// 2. the per-family gate (found + approved + drawn) with the switch on;
// 3. name lookups: with event rows in a fixture master, the story (make-story-oltre storyEnemyId), special
//    (make-special lookups), proud (make-proud proudEnemyId) lookups answer the same ids as without them.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
delete process.env.KHUX_EVENT_ENEMIES;
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

// --- 1. switch: default off ------------------------------------------------------------------------------------
assert.strictEqual(ev.enabled(), false);
let master = [row(1, 1, 'Shadow'), row(11, 1, 'old copy')];
let rep = ev.addRows(master, src, drawn);
assert.strictEqual(rep.on, false);
assert.deepStrictEqual(rep.added, []);
assert.deepStrictEqual(master.map((e) => e.enemyId), [1], 'switch off: previous event rows stripped, none added');
assert.deepStrictEqual(ev.attackRows(src), [], 'switch off: no attack rows');
assert.match(ev.summary(rep), /switch off/);
process.env.KHUX_EVENT_ENEMIES = '1';
assert.strictEqual(ev.enabled(), true);
assert.strictEqual(ev.attackRows(src).length, 2);
process.env.KHUX_EVENT_ENEMIES = '0';
assert.strictEqual(ev.enabled(), false);
delete process.env.KHUX_EVENT_ENEMIES;

// --- 2. gate with the switch on (explicit argument) ----------------------------------------------------------------
master = [row(1, 1, 'Shadow'), row(11, 1, 'old copy')];
rep = ev.addRows(master, src, drawn, true);
assert.deepStrictEqual(rep.added, [11, 13]);
assert.deepStrictEqual(rep.missing, [14]);
assert.deepStrictEqual(rep.unapproved, [12]);
assert.deepStrictEqual(rep.notDrawn, [15]);
assert.strictEqual(rep.stripped, 1);
assert.deepStrictEqual(master.map((e) => e.enemyId), [1, 11, 13]);
ev.addRows(master, src, drawn, true);
assert.deepStrictEqual(master.map((e) => e.enemyId), [1, 11, 13], 'idempotent');
master[1].name = 'changed';
assert.strictEqual(src.enemies[11].row.name, 'X', 'rows are copies');
assert.deepStrictEqual(ev.addRows([row(1, 1)], null, drawn, true).added, []);
assert.deepStrictEqual(ev.addRows([], src, null, true).added, []);
assert.throws(() => ev.addRows([], { enemies: { 9: { row: row(8, 1), model: 'served', approved: true } } }, drawn, true));
// attack rows for enemy-attack-fix: the thethiny row wins on the same id
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-enemies-'));
fs.writeFileSync(path.join(tmp, 'atk.json'), JSON.stringify([{ enemyAttackId: 1, power: 5 }]));
const orig = fix.readOrig(path.join(tmp, 'atk.json'), ev.attackRows(src, true));
assert.deepStrictEqual(orig.map((r) => [r.enemyAttackId, r.power]), [[1, 5], [110, 7]]);

// --- id list for the other generators (and Python) ------------------------------------------------------------------
const list = path.join(tmp, 'ids.json');
ev.writeIdList(src, list);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(list, 'utf8')).ids, [11, 12, 13, 14, 15]);
assert.deepStrictEqual([...ev.eventIds(null, list)].sort((a, b) => a - b), [11, 12, 13, 14, 15], 'list used without the private file');
assert.deepStrictEqual([...ev.eventIds(src, path.join(tmp, 'none.json'))].length, 5);
assert.deepStrictEqual([...ev.eventIds(null, path.join(tmp, 'none.json'))], []);

// --- 3. name lookups: same ids with and without event rows -----------------------------------------------------------
// real-like names: story rows 11511/11512 Ferocious Fins, 11534 Barrier Master, 1612011505 Werewolf, 1 / 80001 Shadow,
// 11541 + 1541 Blizzard Lord; event rows 1512, 1534, 11505, 1904010001, 180211541 (smaller or in the target range)
const base = [row(11511, 1511, 'Ferocious Fins'), row(11512, 1512, 'Ferocious Fins'), row(11534, 1534, 'Barrier Master'),
  row(1612011505, 1505, 'Werewolf'), row(1, 1, 'Shadow'), row(80001, 1, 'Shadow'), row(1541, 1541, 'Blizzard Lord'),
  row(13, 13, 'Large Body'), row(80013, 13, 'Large Body')];
const evRows = [row(1512, 1512, 'Ferocious Fins'), row(1534, 1534, 'Barrier Master'), row(11505, 1505, 'Werewolf'),
  row(1904010001, 1, 'Shadow'), row(180211541, 1541, 'Blizzard Lord'), row(11541, 1541, 'Blizzard Lord'), row(12, 13, 'Large Body')];
const ids = new Set(evRows.map((e) => e.enemyId));
const withEv = base.concat(evRows);
const names = ['Ferocious Fins', 'Barrier Master', 'Werewolf', 'Shadow', 'Blizzard Lord', 'Large Body'];
const { storyEnemyId } = require('./make-story-oltre');
const { proudEnemyId } = require('./make-proud');
const special = require('./make-special');
for (const n of names) {
  assert.strictEqual(storyEnemyId(withEv, n, {}, ids), storyEnemyId(base, n, {}, ids), `story ${n}`);
  assert.strictEqual(proudEnemyId(ev.withoutEventRows(withEv, ids), n, new Set()), proudEnemyId(base, n, new Set()), `proud ${n}`);
  const a = special.lookups({ enemy: withEv, eventIds: ids }), b = special.lookups({ enemy: base, eventIds: ids });
  assert.strictEqual(a.enemyId(n), b.enemyId(n), `special enemyId ${n}`);
  for (const t of [true, false]) assert.strictEqual(a.mapEnemyId(n, t), b.mapEnemyId(n, t), `special mapEnemyId ${n} ${t}`);
}
// the lookups really would have changed without the filter (the fixture is meaningful)
assert.notStrictEqual(storyEnemyId(withEv, 'Ferocious Fins', {}, new Set()), storyEnemyId(base, 'Ferocious Fins', {}, new Set()));
assert.notStrictEqual(special.lookups({ enemy: withEv, eventIds: new Set() }).mapEnemyId('Werewolf', true),
  special.lookups({ enemy: base, eventIds: new Set() }).mapEnemyId('Werewolf', true));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-make-event-enemies: OK');
