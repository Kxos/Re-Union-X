// Booster rows of the master emblem and medal group codes (make-emblems.js): node server/test-make-emblems.js
'use strict';
const assert = require('assert');
const me = require('./make-emblems');
const clock = require('./clock');

const fields = (o) => ({ category: 0, attribute: 0, source: 0, keybladeCategory: 0, slot1: 0, slot2: 0, slot3: 0, slot4: 0, slot5: 0, upperParam: 0, ...o });
const P25 = { emblemId: 1811001, imageId: 6, sortId: 1811001, name: 'P Booster +25%', description: 'P SP Attack +25%', spanDays: 21,
  start: '2017-11-09 00:00:00', expiry: { date: '2017-11-30 23:59:59', source: 'notice' }, labels: ['boosterEffect'],
  effect: { kind: 'attribute', fields: fields({ category: 2, attribute: 3, upperParam: 2500 }) } };
const MICKEY = { emblemId: 1811007, imageId: 40, sortId: 1811007, name: 'Booster [Mickey] +25%', description: 'Mickey Medal SP Attack +25%', spanDays: 14,
  labels: ['boosterEffect'], effect: { kind: 'group', fields: fields({ category: 2, source: 181101, upperParam: 2500 }) } };

const tests = {
  // the 16 client fields in the client's order, effect fields from the record, a far endTime
  row_fields_from_effect() {
    const { rows } = me.makeEmblems({ boosters: [P25] });
    assert.deepStrictEqual(Object.keys(rows[0]), ['emblemId', 'imageId', 'sortId', 'name', 'description', ...me.FIELDS, 'endTime']);
    assert.strictEqual(rows[0].category, 2); assert.strictEqual(rows[0].attribute, 3); assert.strictEqual(rows[0].upperParam, 2500);
    assert.strictEqual(rows[0].endTime, me.FAR);
  },
  // an unbuilt name has no row and no index entry
  unbuilt_not_written() {
    const { rows, index } = me.makeEmblems({ boosters: [P25], unbuilt: [{ name: 'Booster [Toy Story] +5%', reason: 'boosterEffectUnknown' }] });
    assert.strictEqual(rows.length, 1); assert.ok(!index.byName['Booster [Toy Story] +5%']);
  },
  // the index keeps the span of the record and every id of a name
  span_days_and_names() {
    const twin = { ...P25, emblemId: 1811002, sortId: 1811002 };
    const { index } = me.makeEmblems({ boosters: [twin, P25] });
    assert.strictEqual(index.byId[1811001].spanDays, 21);
    assert.deepStrictEqual(index.byName['P Booster +25%'], [1811001, 1811002]);
  },
  // group codes go after the series code, validSource counts them, twice changes nothing
  group_codes_added_once() {
    const medals = [{ medalId: 10, source: [2, 0, 0], validSource: 1 }, { medalId: 11, source: [7, 0, 0], validSource: 1 }];
    assert.strictEqual(me.addGroupCodes(medals, { 181101: [10] }), 1);
    assert.deepStrictEqual(medals[0].source, [2, 181101, 0]); assert.strictEqual(medals[0].validSource, 2);
    assert.deepStrictEqual(medals[1].source, [7, 0, 0]);
    assert.strictEqual(me.addGroupCodes(medals, { 181101: [10] }), 0);
  },
  // the served endTime of an owned Booster is the player's own, in fake time; the others keep the far date
  served_end_time_per_player() {
    const { rows } = me.makeEmblems({ boosters: [P25, MICKEY] });
    const until = Date.UTC(2026, 10, 30, 7, 59, 59), off = -189302400000;
    const out = me.servedRows(rows, { 1811001: until }, (ms) => clock.fakeString(ms, off));
    assert.strictEqual(out.find((r) => r.emblemId === 1811001).endTime, clock.fakeString(until, off));
    assert.strictEqual(out.find((r) => r.emblemId === 1811007).endTime, me.FAR);
  },
  // a Booster not owned yet: session start + its span, so one obtained during the session shows about its expiry at once
  served_unowned_session_span() {
    const { rows } = me.makeEmblems({ boosters: [P25, MICKEY] });
    const t = Date.UTC(2026, 10, 14), off = 0;
    const out = me.servedRows(rows, {}, (ms) => clock.fakeString(ms, off), t, (id) => (id === 1811007 ? 14 : 0));
    assert.strictEqual(out.find((r) => r.emblemId === 1811007).endTime, clock.fakeString(t + 14 * 86400000, off));
    assert.strictEqual(out.find((r) => r.emblemId === 1811001).endTime, me.FAR);
  },
};
let failed = 0;
for (const [n, f] of Object.entries(tests)) { try { f(); console.log('ok', n); } catch (e) { failed++; console.log('FAIL', n, e.message); } }
console.log(failed ? `${failed} failed` : 'test-make-emblems: OK');
process.exit(failed ? 1 : 0);
