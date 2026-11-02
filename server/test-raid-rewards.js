// Raid coin tables, rewards and pending entries: node server/test-raid-rewards.js
// reward_type_15 loads the server the way test-title-popup.js does.
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const rr = require('./raid-rewards');

const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const D_OLD = '2019-08-11', D_NEW = '2019-08-12', D_GEM = '2020-03-16';
const rowsOf = (o) => rr.coinRows({ date: D_NEW, tier: 'Epic', level: 50, ...o });
const nums = (row) => row.num.slice(0, row.validReward);
const tests = {
  victory_pays_one_slot() {
    const rows = rowsOf({ tier: 'Advanced', date: D_GEM, gemDrop: true });
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const slot = rr.rollReward(rows.victory, 10, mulberry(i));
      assert.ok(slot >= 1 && slot <= rows.victory.validReward);
      const it = rr.slotItem(rows.victory, slot);
      assert.strictEqual(it.num, it.type === 5 ? 1 : 180);
      seen.add(it.type + ':' + it.id);
    }
    assert.deepStrictEqual([...seen].sort(), [rr.CONFIG.coinType + ':0', '5:48', '5:49', '5:50']);
    const e = rr.pendingEntry({ raid: { raidId: 1, level: 10 }, rows, victory: true, allPoints: true, rng: mulberry(3) });
    assert.strictEqual(rr.entryItems(e, rows).filter((x) => x.from === 'victory').length, 1);
  },
  high_coin_rare() {
    const row = rowsOf().victory; const rng = mulberry(42); let high = 0;
    for (let i = 0; i < 10000; i++) if (rr.rollReward(row, 50, rng) === 2) high++;
    assert.ok(high >= 900 && high <= 1100, 'high ' + high);
    assert.deepStrictEqual(nums(row), [240, 360]);
  },
  coin_tables() {
    const a = rowsOf();
    assert.deepStrictEqual([nums(a.victory), nums(a.mvp), nums(a.all)], [[240, 360], [90], [90]]);
    const b = rr.coinRows({ date: D_OLD, tier: 'single', level: 20 });
    assert.deepStrictEqual([nums(b.victory), nums(b.mvp), nums(b.all)], [[150, 220], [60], [60]]);
    const c = rr.coinRows({ date: D_OLD, tier: 'single', level: 5 });
    assert.deepStrictEqual([nums(c.victory), nums(c.mvp)], [[40, 60], [10]]);
    assert.deepStrictEqual(nums(rr.coinRows({ date: D_NEW, tier: 'Legendary', level: 99 }).victory), [210, 315]);
    assert.ok(a.victory.type.slice(0, 2).every((t) => t === rr.CONFIG.coinType));
  },
  all_points_only_when_earned() {
    const rows = rowsOf();
    const no = rr.pendingEntry({ raid: { raidId: 1, level: 5 }, rows, victory: true, allPoints: false, rng: mulberry(1) });
    assert.strictEqual(no.partAllId, 0);
    assert.ok(no.subdueId >= 1 && no.mvpId >= 1);
    const yes = rr.pendingEntry({ raid: { raidId: 1, level: 5 }, rows, victory: true, allPoints: true, rng: mulberry(1) });
    assert.ok(yes.partAllId >= 1);
  },
  no_double_mvp() {
    const rows = rowsOf();
    const e = rr.pendingEntry({ raid: { raidId: 1, level: 5 }, rows, victory: true, allPoints: false, rng: mulberry(1) });
    const items = rr.entryItems(e, rows);
    assert.deepStrictEqual(items.map((x) => x.from), ['victory', 'mvp']);
  },
  defeat_pays_nothing() {
    assert.strictEqual(rr.pendingEntry({ raid: { raidId: 1, level: 5 }, rows: rowsOf(), victory: false, allPoints: false, rng: mulberry(1) }), null);
  },
  bad_slot_dropped() {
    const rows = rowsOf(); const four = { ...rows.victory, validReward: 4 };
    const good = { raidId: 1, level: 1, subdueId: 1, mvpId: 1, partAllId: 0, rewardIds: { victory: 1, mvp: 2, all: 3 } };
    const badSlot = { ...good, raidId: 2, subdueId: 9 };
    const gone = { ...good, raidId: 3, partAllId: 1, rewardIds: { victory: 1, mvp: 2, all: 99 } };
    const logs = [];
    const exists = (id) => (id === 99 ? null : { ...four, raidRewardId: id });
    const out = rr.sanitizePending([good, badSlot, gone, { ...good, raidId: 4, partAllId: 3 }], exists, (m) => logs.push(m));
    assert.deepStrictEqual(out.map((x) => x.raidId), [1, 4]);
    assert.strictEqual(logs.length, 2);
  },
  full_box() {
    assert.strictEqual(rr.deliverReward({ type: 3, id: 90033, num: 1 }, { medalCount: 3000, cap: 3000 }), 'present');
    assert.strictEqual(rr.deliverReward({ type: 3, id: 90033, num: 1 }, { medalCount: 2999, cap: 3000 }), 'grant');
    assert.strictEqual(rr.deliverReward({ type: rr.CONFIG.coinType, id: 0, num: 90 }, { medalCount: 3000, cap: 3000 }), 'grant');
    const row = { validReward: 1, type: [3], id: [90033], num: [2], odds: [100000], oddsUpPerLv: 0 };
    const rows = { victory: row, mvp: row, all: row };
    const e = { raidId: 1, level: 1, subdueId: 1, mvpId: 1, partAllId: 0, rewardIds: {} };
    const got = { grant: [], present: [] };
    const r = rr.deliverEntry(e, rows, { medalCount: 2999, cap: 3000, grant: (i) => got.grant.push(i), present: (i) => got.present.push(i) });
    assert.strictEqual(r.granted + r.presented, 2);
    assert.strictEqual(got.grant.length + got.present.length, 2);
    assert.ok(got.present.length >= 1);
  },
  old_save() {
    const p = {};
    assert.deepStrictEqual(rr.raidState(p), { boss: null, levels: {}, points: 0, pending: [], kept: null });
    assert.strictEqual(p.raid.pending.length, 0);
    p.raid.points = 5;
    assert.strictEqual(rr.raidState(p).points, 5);
    assert.deepStrictEqual(rr.raidState({ raid: { points: 2 } }), { boss: null, levels: {}, points: 2, pending: [], kept: null });
  },
  reward_type_15() {
    const SAVE = path.join(os.tmpdir(), `khux-test-raid-rewards-${process.pid}.json`);
    try { fs.unlinkSync(SAVE); } catch { /* new */ }
    process.env.KHUX_SAVE = SAVE; delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
    const log = console.log; console.log = () => {};
    let t; try { t = require('./server')._test; } finally { console.log = log; }
    const q = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
    const before = q(() => t.userPointData(Date.now())).raidSpherePoint;
    q(() => t.grantObjectiveReward({ submissionRewardType: [15], submissionItemId: [0], submissionItemNum: [7] }, 1));
    assert.strictEqual(t.player.raidSpherePoint, 7);
    assert.strictEqual(q(() => t.userPointData(Date.now())).raidSpherePoint, before + 7);
    try { fs.unlinkSync(SAVE); } catch { /* gone */ }
  },
};
let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed'); process.exit(0);
