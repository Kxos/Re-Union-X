// Event Boards (sphere type 4) generator: node server/test-event-boards.js
// Synthetic fixture only (server/test-fixtures/event_board_sets.json, numbers and invented names), small hand-made master.
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const eb = require('./event-boards');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures', 'event_board_sets.json'), 'utf8'));
const sets = () => JSON.parse(JSON.stringify(FIX.sets));
const master = {
  medal: [{ medalId: 900001, name: 'Fixture Medal', rare: 6, groupId: 0 }, { medalId: 900002, name: 'Fixture Medal B', rare: 5, groupId: 0 }],
  material: [{ materialId: 9001, name: 'Fixture Gem' }],
  title: [{ titleId: 9101, title: 'Fixture Title' }],
  avatarParts: [], petParts: [],
};
const tests = [];
const test = (n, f) => tests.push([n, f]);

// Board 2 (7002) made fully payable: its medal cell found, its Booster cell replaced by Jewels
const payable = (s) => {
  const b = s[0].boards[1];
  b.cells[1] = { ...b.cells[1], rewardId: 900001, name: '6★ Fixture Medal' };
  b.cells[2] = { ...b.cells[2], rewardSelect: 2, rewardId: 0, num: 5, name: '5 Jewels' };
  return s;
};
const nodesOf = (row) => [...new Set(['spCol0', 'spCol1', 'spCol2', 'spCol3', 'spCol4'].flatMap((k) => row[k]).filter((v) => v > 0 && v < 1000))];
const skippedOf = (r) => r.report.skipped.map((x) => [x.board, x.why]);

test('type4_rows', () => {
  const r = eb.buildEventBoards({ sets: payable(sets()), master, ids: {} });
  assert.deepStrictEqual(r.sphereRows.map((x) => x.sphereBoardId), [4000001, 4000002]);
  assert.ok(r.sphereRows.every((x) => x.type === 4 && x.arryId === x.sphereBoardId && x.masuId === x.sphereBoardId && x.kindId === 1));
  const m = r.masuRows[0];
  assert.deepStrictEqual(m.spherePoint.slice(0, 7), [0, 10, 20, 30, 40, 0, 50]);
  assert.deepStrictEqual(m.rewardSelect.slice(0, 7), [0, 2, 3, 3, 5, 0, 41]);
  assert.strictEqual(m.rewardId[3], 900002, 'donor medal id replaced by ours (name + rarity)');
  assert.strictEqual(m.rewardId[6], 0, 'Draw Ticket is wallet 0');
  assert.deepStrictEqual([m.rewardSelect[22], m.rewardId[22]], [7, 9101]);
  assert.strictEqual(r.arrayRows[0].spCol4[0], 1000);
  assert.deepStrictEqual(r.bySet['2099-01'], [4000001, 4000002]);
});
test('chain_remapped', () => {
  const r = eb.buildEventBoards({ sets: payable(sets()), master, ids: { boards: { '2099-01/7002': 5, '2099-01/7001': 9 } } });
  const b2 = r.sphereRows.find((x) => x.openId === 5);
  assert.strictEqual(b2.sphereBoardId, 4000005);
  assert.strictEqual(b2.openParam, 4000009);
  assert.deepStrictEqual(r.chains, { 4000005: 4000009 });
});
// user decision 08-11: every original cell had a reward and a cost; a board with any cell we cannot pay is not served
// (no pass-through node any more). Board 2 of the fixture has a medal not found and a Booster
test('unmatched_cell_skips_board', () => {
  const r = eb.buildEventBoards({ sets: sets(), master, ids: {} });
  assert.deepStrictEqual(r.sphereRows.map((x) => x.sphereBoardId), [4000001], 'only the fully payable board');
  assert.deepStrictEqual(skippedOf(r).find((x) => x[0] === 7002), [7002, 'unpayable cells (Boosters: Part 6)']);
  assert.deepStrictEqual(r.report.unmatched.filter((u) => u.board === 7002).map((u) => u.idx), [2, 3]);
  assert.ok(r.report.unmatched.every((u) => u.why));
  assert.deepStrictEqual(r.chains, {});
  const s = sets(); s[0].boards[1].cells[2] = { ...s[0].boards[1].cells[2], rewardSelect: 2, rewardId: 0, name: '5 Jewels' };
  assert.deepStrictEqual(skippedOf(eb.buildEventBoards({ sets: s, master, ids: {} })).find((x) => x[0] === 7002), [7002, 'unmatched medal']);
});
test('booster_cell_skips_board', () => {
  const s = payable(sets()); s[0].boards[1].cells[2] = { ...s[0].boards[1].cells[2], rewardSelect: 34, rewardId: 9900, name: 'Fixture Booster' };
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(skippedOf(r).find((x) => x[0] === 7002), [7002, 'unpayable cells (Boosters: Part 6)']);
  assert.deepStrictEqual(r.bySet['2099-01'], [4000001], 'only Board 2 skipped: Board 1 stays');
});
test('chain_head_skipped_skips_tail', () => {
  const s = payable(sets());
  s[0].boards[0].cells[4] = { ...s[0].boards[0].cells[4], rewardSelect: 34, rewardId: 9900, name: 'Fixture Booster' };
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(skippedOf(r).filter((x) => x[0] !== 7003), [[7001, 'unpayable cells (Boosters: Part 6)'], [7002, 'chained to a skipped board']]);
  assert.deepStrictEqual(r.bySet['2099-01'], []);
  assert.deepStrictEqual(r.chains, {});
});
// a grid node with no cell at all would be a node with no reward and no cost
test('grid_node_without_cell_skips_board', () => {
  const s = payable(sets()); s[0].boards[0].cells.pop();
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(skippedOf(r).filter((x) => x[0] === 7001), [[7001, 'unpayable cells (grid node without a cell)']]);
});
// defensive guard: no node of an emitted board has rewardSelect 0 (the client crashes on such a cursor, bench 08-11)
test('no_empty_node_emitted', () => {
  for (const s of [sets(), payable(sets())]) {
    const r = eb.buildEventBoards({ sets: s, master, ids: {} });
    assert.ok(r.arrayRows.length);
    for (const a of r.arrayRows) {
      const m = r.masuRows.find((x) => x.masuId === a.arryId);
      for (const n of nodesOf(a)) assert.ok(m.rewardSelect[n - 1] && m.spherePoint[n - 1], `board ${a.arryId} node ${n}`);
    }
  }
});
// the donor study's ourName (a variant letter our master lacks), same rarity and exactly one medal only
test('our_name_medal', () => {
  const s = payable(sets()); const c = s[0].boards[0].cells[1];
  Object.assign(c, { rewardId: 1, name: '6★ Fixture Medal A', ourName: '6★ Fixture Medal' });
  let r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.strictEqual(r.masuRows[0].rewardId[2], 900001);
  Object.assign(c, { ourName: '5★ Fixture Medal B' });
  r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(skippedOf(r).find((x) => x[0] === 7001), [7001, 'unmatched medal'], 'another rarity: not used');
});
test('unmatched_completion_skips_board', () => {
  const r = eb.buildEventBoards({ sets: payable(sets()), master, ids: {} });
  assert.deepStrictEqual(r.report.skipped.map((x) => x.board), [7003]);
  assert.strictEqual(r.sphereRows.length, 2);
  assert.strictEqual(r.bySet['2099-01'].length, 2);
});
test('chain_target_skipped_cascades', () => {
  const s = payable(sets()); s[0].boards[0].completion = { rewardSelect: 3, rewardId: 1, num: 1, name: '6★ Nobody' };
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(r.report.skipped.map((x) => x.board).sort(), [7001, 7002, 7003]);
  assert.deepStrictEqual(r.chains, {});
});
test('all_unmatched_board_skipped', () => {
  const s = sets(); const b = s[0].boards[2];
  b.cells = [{ idx: 1, cost: 10, rewardSelect: 34, rewardId: 9900, num: 1, name: 'Fixture Booster' }]; b.completion = s[0].boards[0].completion;
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(skippedOf(r).filter((x) => x[0] === 7003), [[7003, 'no matched cells']]);
  assert.strictEqual(r.sphereRows.length, 1);
  assert.strictEqual(r.report.unmatched.filter((u) => u.board === 7003).length, 1);
});
test('bad_index', () => {
  const s = sets(); const b = s[0].boards[0];
  b.cells.push({ idx: 22, cost: 5, rewardSelect: 2, rewardId: 0, num: 1, name: '5 Jewels' }, { idx: 30, cost: 5, rewardSelect: 2, rewardId: 0, num: 1, name: '5 Jewels' },
    { idx: 5, cost: 5, rewardSelect: 2, rewardId: 0, num: 1, name: '5 Jewels' });
  const r = eb.buildEventBoards({ sets: s, master, ids: {} });
  assert.deepStrictEqual(r.report.unmatched.filter((u) => u.board === 7001).map((u) => [u.idx, u.why]), [[22, 'bad index'], [30, 'bad index'], [5, 'bad index']]);
  assert.deepStrictEqual(skippedOf(r).find((x) => x[0] === 7001), [7001, 'unpayable cells (bad index)']);
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
