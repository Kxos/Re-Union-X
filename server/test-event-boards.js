// Event Boards (sphere type 4) generator: node server/test-event-boards.js
// Synthetic fixture only (server/test-fixtures/event_board_sets.json, numbers and invented names), small hand-made master.
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const eb = require('./event-boards');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures', 'event_board_sets.json'), 'utf8'));
const sets = () => JSON.parse(JSON.stringify(FIX.sets));
const master = {
  medal: [{ medalId: 90076, name: 'Cid', rare: 6, groupId: 0 }, { medalId: 301159, name: 'Halloween Sora C', rare: 5, groupId: 0 }],
  material: [{ materialId: 48, name: 'Power Gem' }],
  title: [{ titleId: 12229, title: 'Angelic' }],
  avatarParts: [], petParts: [],
};
const tests = [];
const test = (n, f) => tests.push([n, f]);

test('type4_rows', () => {
  const r = eb.buildEventBoards({ sets: sets(), master, ids: {} });
  assert.deepStrictEqual(r.sphereRows.map((x) => x.sphereBoardId), [4000001, 4000002]);
  assert.ok(r.sphereRows.every((x) => x.type === 4 && x.arryId === x.sphereBoardId && x.masuId === x.sphereBoardId && x.kindId === 1));
  const m = r.masuRows[0];
  assert.deepStrictEqual(m.spherePoint.slice(0, 7), [0, 10, 20, 30, 40, 0, 50]);
  assert.deepStrictEqual(m.rewardSelect.slice(0, 7), [0, 2, 3, 3, 5, 0, 41]);
  assert.strictEqual(m.rewardId[3], 301159, 'donor medal id replaced by ours (name + rarity)');
  assert.strictEqual(m.rewardId[6], 0, 'Draw Ticket is wallet 0');
  assert.deepStrictEqual([m.rewardSelect[22], m.rewardId[22]], [7, 12229]);
  assert.strictEqual(r.arrayRows[0].spCol4[0], 1000);
  assert.deepStrictEqual(r.bySet['2099-01'], [4000001, 4000002]);
});
test('chain_remapped', () => {
  const r = eb.buildEventBoards({ sets: sets(), master, ids: { boards: { '2099-01/7002': 5, '2099-01/7001': 9 } } });
  const b2 = r.sphereRows.find((x) => x.openId === 5);
  assert.strictEqual(b2.sphereBoardId, 4000005);
  assert.strictEqual(b2.openParam, 4000009);
  assert.deepStrictEqual(r.chains, { 4000005: 4000009 });
});
test('unmatched_cell_dropped', () => {
  const r = eb.buildEventBoards({ sets: sets(), master, ids: {} });
  const m = r.masuRows[1];
  assert.strictEqual(m.rewardSelect[2], 0); assert.strictEqual(m.spherePoint[2], 0);
  assert.strictEqual(m.rewardSelect[1], 2, 'the matched cell stays');
  assert.deepStrictEqual(r.report.unmatched.filter((u) => u.board === 7002).map((u) => u.idx), [2, 3]);
  assert.ok(r.report.unmatched.every((u) => u.why));
});
test('unmatched_completion_skips_board', () => {
  const r = eb.buildEventBoards({ sets: sets(), master, ids: {} });
  assert.deepStrictEqual(r.report.skipped.map((x) => x.board), [7003]);
  assert.strictEqual(r.sphereRows.length, 2);
  assert.strictEqual(r.bySet['2099-01'].length, 2);
});
test('chain_target_skipped_cascades', () => {
  const s = sets(); s[0].boards[0].completion = { rewardSelect: 3, rewardId: 1, num: 1, name: '6★ Nobody' };
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(r.report.skipped.map((x) => x.board).sort(), [7001, 7002, 7003]);
  assert.deepStrictEqual(r.chains, {});
});
test('ids_append_only', () => {
  const a = eb.buildEventBoards({ sets: sets(), master, ids: {} });
  const s = sets(); s[0].boards.unshift({ ...s[0].boards[2], donorId: 7000, completion: s[0].boards[0].completion });
  const b = eb.buildEventBoards({ sets: s, master, ids: { boards: a.ids.boards } });
  for (const [k, v] of Object.entries(a.ids.boards)) assert.strictEqual(b.ids.boards[k], v);
  assert.strictEqual(b.ids.boards['2099-01/7000'], Math.max(...Object.values(a.ids.boards)) + 1);
  assert.ok(b.sphereRows.some((x) => x.sphereBoardId === 4000001));
});
test('ids_range_checked', () => {
  assert.throws(() => eb.buildEventBoards({ sets: sets(), master, ids: { boards: { 'x/1': 1000000 } } }), /outside/);
});

let fail = 0;
for (const [n, f] of tests) { try { f(); console.log('ok   ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ': ' + e.message); } }
console.log(fail ? `test-event-boards: ${fail} failed` : `test-event-boards: ${tests.length} ok`);
process.exit(fail ? 1 : 0);
