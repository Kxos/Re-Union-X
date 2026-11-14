// Owned Boosters, expiry and emblemIds (boosters.js): node server/test-boosters.js
'use strict';
const assert = require('assert');
const { boosters, DAY } = require('./boosters');

const index = { byId: { 1811007: { name: 'Booster [Mickey] +25%', spanDays: 14 }, 1811008: { name: 'Booster [Mickey] +10%', spanDays: 14 },
  1809001: { name: 'Treasure Trove Booster +0.60', spanDays: 29 } },
byName: { 'Booster [Mickey] +25%': [1811007], 'Booster [Mickey] +10%': [1811008], 'Treasure Trove Booster +0.60': [1809001] } };
const T0 = Date.UTC(2026, 10, 14, 12);
const mk = (player, now = T0) => { let t = now; const b = boosters({ player, index, realNow: () => t }); b.at = (x) => { t = x; }; return b; };

const tests = {
  grant_active_now() {
    const p = {}; const b = mk(p);
    assert.ok(b.grant(1811007, { stageId: 4000100, objective: 1 }));
    assert.deepStrictEqual(b.activeIds(T0), [1811007]);
    assert.strictEqual(p.boosters[0].until, T0 + 14 * DAY);
  },
  expired_not_sent() {
    const p = {}; const b = mk(p);
    b.grant(1811007, { stageId: 4000100, objective: 1 });
    assert.deepStrictEqual(b.activeIds(T0 + 14 * DAY + 1), []);
    assert.strictEqual(b.untilOf(1811007, T0 + 14 * DAY + 1), null);
  },
  expired_never_regranted() {
    const p = {}; const b = mk(p);
    b.grant(1811007, { stageId: 4000100, objective: 1 });
    b.at(T0 + 30 * DAY);
    assert.strictEqual(b.grant(1811007, { objective: 1, stageId: 4000100 }), false); // same source, keys in another order
    assert.strictEqual(p.boosters.length, 1);
  },
  same_id_renews() {
    const p = {}; const b = mk(p);
    b.grant(1811007, { stageId: 4000100, objective: 1 });
    b.at(T0 + 5 * DAY);
    assert.ok(b.grant(1811007, { board: 2000001, cell: 3 }));
    assert.deepStrictEqual(b.activeIds(T0 + 15 * DAY), [1811007]);
    assert.strictEqual(b.untilOf(1811007, T0 + 15 * DAY), T0 + 19 * DAY);
  },
  unknown_id_refused() {
    const p = {}; const b = mk(p);
    assert.strictEqual(b.grant(1999999, { board: 1, cell: 1 }), false);
    assert.ok(!p.boosters);
  },
  pending_paid_once() {
    const p = { pendingBoosters: [{ emblemName: 'Booster [Mickey] +25%', stageId: 4000300, objective: 1 },
      { emblemName: 'Treasure Trove Booster +0.60', stageId: 4000200, objective: 0, slot: 1 }] };
    const b = mk(p);
    assert.strictEqual(b.payPending(), 2);
    assert.deepStrictEqual(p.pendingBoosters, []);
    assert.strictEqual(b.payPending(), 0);
    assert.deepStrictEqual(p.boosters[1].from, { stageId: 4000200, objective: 0, slot: 1 });
    // the quest cleared again now pays nothing: same source
    assert.strictEqual(b.grant(1811007, { stageId: 4000300, objective: 1 }), false);
  },
  pending_unbuilt_kept() {
    const p = { pendingBoosters: [{ emblemName: 'Booster [Toy Story] +5%', stageId: 1, objective: 1 }] };
    assert.strictEqual(mk(p).payPending(), 0);
    assert.strictEqual(p.pendingBoosters.length, 1);
  },
  emblem_list_other_profile_empty() {
    const p = {}; const b = mk(p);
    b.grant(1811007, { stageId: 4000100, objective: 1 });
    assert.deepStrictEqual(b.list(2), { emblemIds: [] });
    assert.deepStrictEqual(b.list(1), { emblemIds: [1811007] });
  },
  old_save_no_write() {
    const p = { name: 'x' }; const b = mk(p);
    assert.deepStrictEqual(b.activeIds(), []);
    assert.strictEqual(b.payPending(), 0);
    assert.deepStrictEqual(Object.keys(p), ['name']);
  },
};
let failed = 0;
for (const [n, f] of Object.entries(tests)) { try { f(); console.log('ok', n); } catch (e) { failed++; console.log('FAIL', n, e.message); } }
console.log(failed ? `${failed} failed` : 'test-boosters: OK');
process.exit(failed ? 1 : 0);
