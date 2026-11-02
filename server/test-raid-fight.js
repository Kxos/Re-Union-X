// Raid fight rules test: node server/test-raid-fight.js
'use strict';
const assert = require('assert');
const rf = require('./raid-fight');

const T0 = Date.UTC(2018, 0, 8, 12);
const MIN = 60000;
const ROWS = [
  { raidEnemyId: 11, weakness: 2, hp: 1000, attribute: 1, rare: 0 },
  { raidEnemyId: 10, weakness: 1, hp: 150000000, attribute: 1, rare: 0 },
  { raidEnemyId: 12, weakness: 3, hp: 400, attribute: 2, rare: 0 },
];
const mk = (o) => rf.newBoss({ key: 'a', tier: 'normal', stageId: 5, enemy: { raidEnemyId: 10 }, partRows: ROWS, level: 1,
  upMinutes: 60, useAp: 10, nowMs: T0, hasStartDemo: true, hasEscapeDemo: true, ...o });
const sent = (b, hps) => b.parts.map((p, i) => ({ raidEnemyId: p.raidEnemyId, partsId: p.partsId, hp: hps[i], damage: 0 }));
const tests = {
  spawn_status_4_then_3() {
    const b = mk();
    assert.deepStrictEqual(b.parts.map((p) => p.partsId), [1, 2, 3]);
    assert.strictEqual(rf.listView(b, T0).raidStatus, 4);
    rf.afterList(b, T0);
    assert.strictEqual(rf.listView(b, T0).raidStatus, 3);
    assert.strictEqual(rf.listView(mk({ hasStartDemo: false }), T0).raidStatus, 3);
  },
  info_shape() {
    const r = rf.listView(mk(), T0).raid;
    assert.deepStrictEqual(Object.keys(r), ['raidId', 'level', 'useAp', 'timeLeft', 'feverFlag', 'feverTime', 'stageId', 'parts']);
    assert.strictEqual(r.raidId, T0);
    assert.strictEqual(r.timeLeft, '2018-01-08 13:00:00');
    assert.deepStrictEqual(Object.keys(r.parts[0]), ['raidEnemyId', 'partsId', 'hp', 'attribute', 'rare']);
  },
  first_fight_free_then_useAp() {
    const b = mk();
    assert.strictEqual(rf.listView(b, T0).raid.useAp, 0);
    assert.strictEqual(rf.startFight(b, T0).ap, 0);
    assert.strictEqual(rf.listView(b, T0).raid.useAp, 10);
    assert.strictEqual(rf.startFight(b, T0).ap, 10);
  },
  damage_kept() {
    const b = mk();
    rf.startFight(b, T0);
    rf.clearFight(b, sent(b, [149720581, 1000, 400]), T0 + MIN);
    assert.strictEqual(rf.startFight(b, T0 + 2 * MIN).parts[0].hp, 149720581);
  },
  hp_never_rises() {
    const b = mk();
    rf.clearFight(b, sent(b, [100, 1000, 400]), T0);
    rf.clearFight(b, sent(b, [999, 1000, 400]), T0);
    assert.strictEqual(b.parts[0].hp, 100);
  },
  weak_point_stays_3_minutes() {
    const b = mk();
    rf.clearFight(b, sent(b, [500, 0, 400]), T0);
    assert.strictEqual(rf.startFight(b, T0 + 179000).parts[1].hp, 0);
    assert.strictEqual(rf.startFight(b, T0 + 181000).parts[1].hp, 500);
    // a second clear restarts the wait
    const c = mk();
    rf.clearFight(c, sent(c, [500, 0, 400]), T0);
    rf.startFight(c, T0 + 2 * MIN);
    rf.clearFight(c, sent(c, [500, 0, 400]), T0 + 2 * MIN);
    assert.strictEqual(rf.startFight(c, T0 + 4 * MIN).parts[1].hp, 0);
    assert.strictEqual(rf.startFight(c, T0 + 5 * MIN + 1000).parts[1].hp, 500);
  },
  victory() {
    const b = mk();
    let r = rf.clearFight(b, sent(b, [0, 0, 400]), T0);
    assert.deepStrictEqual(r, { victory: true, allPoints: false, raidTimeStatus: 3 });
    const c = mk();
    r = rf.clearFight(c, sent(c, [0, 0, 0]), T0);
    assert.strictEqual(r.allPoints, true);
  },
  give_up() {
    const b = mk();
    const r = rf.clearFight(b, sent(b, [5, 0, 0]), T0);
    assert.strictEqual(r.victory, false);
    assert.strictEqual(r.allPoints, false);
    assert.strictEqual(r.raidTimeStatus, 1);
  },
  victory_after_timer_counts() {
    const b = mk();
    assert.strictEqual(rf.clearFight(b, sent(b, [0, 1000, 400]), b.endsAt + 5 * MIN).victory, true);
  },
  expired_boss() {
    let b = mk();
    const late = b.endsAt + 1;
    assert.strictEqual(rf.listView(b, late).raidStatus, 2);
    assert.strictEqual(rf.afterList(b, late), null);
    const none = rf.listView(null, late);
    assert.strictEqual(none.raidStatus, 0);
    assert.deepStrictEqual(none.raid, { raidId: 0, level: 0, useAp: 0, timeLeft: '2018-01-08 13:00:00', feverFlag: 0,
      feverTime: '2018-01-08 13:00:00', stageId: 0, parts: [] });
    b = mk({ hasEscapeDemo: false });
    assert.strictEqual(rf.listView(b, late).raidStatus, 0);
    assert.strictEqual(rf.afterList(b, late), null);
  },
  killed_mid_fight() {
    const b = mk();
    rf.startFight(b, T0);
    const v = rf.listView(b, T0 + MIN);
    assert.strictEqual(v.raidStatus, 4);
    assert.strictEqual(b.fights, 1);
    assert.strictEqual(v.raid.useAp, 10);
    assert.strictEqual(v.raid.parts[0].hp, 150000000);
  },
  week_change_ignored() {
    const b = mk();
    assert.deepStrictEqual(rf.listView(b, T0 + 10 * MIN), rf.listView(b, T0 + 10 * MIN));
    assert.deepStrictEqual(rf.listView(b, T0 + 10 * MIN).raid, rf.listView(b, T0 + 30 * MIN).raid);
  },
};
let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed');
