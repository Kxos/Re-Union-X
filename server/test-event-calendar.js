// Event calendar (Events Part 1, Task 4): which event quests of events.json are listed in the player's Shop week.
// Synthetic fixtures only. Real dates: 2026-11-04 is a Wednesday, 20:00 UTC = 12:00 PST.
//   node server/test-event-calendar.js
'use strict';
const assert = require('assert');
const cal = require('./event-calendar');

const WED = Date.parse('2026-11-04T20:00:00Z'), THU = Date.parse('2026-11-05T20:00:00Z'), TUE = Date.parse('2026-11-03T20:00:00Z');
const quest = (stageId, extra = {}) => ({ stageId, ap: 5, served: true, status: 'served', ...extra });
const entry = (censusId, start, end, extra = {}) => ({ censusId, evStageId: 20000 + Number(censusId.slice(2)), start, end, stageIds: [4000000 + Number(censusId.slice(2))],
  available: true, quests: [quest(4000000 + Number(censusId.slice(2)))], ...extra });
const ids = (list) => list.map((e) => e.censusId);
const week = (shopFrom, shopTo) => ({ shopFrom, shopTo });

const tests = {
  // an event of three weeks is listed in each of them (spec: «An event that ran three weeks stays three real weeks»), not only in
  // the week of largest overlap as the weekly raids
  week_overlap() {
    const idx = { entries: [entry('E-1', '2019-04-01', '2019-04-21'), entry('E-2', '2019-04-08', '2019-04-14')] };
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-01', '2019-04-07'), WED)), ['E-1']);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-08', '2019-04-14'), WED)), ['E-1', 'E-2']);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-15', '2019-04-21'), WED)), ['E-1']);
    // a Thursday-to-Wednesday Shop week touching the first and last days
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-03-28', '2019-04-03'), WED)), ['E-1']);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-18', '2019-04-24'), WED)), ['E-1']);
    // no real clock: a plain event is listed all the same
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-08', '2019-04-14'))), ['E-1', 'E-2']);
  },
  // nothing outside its dates; no evStage row (no served quest) is never listed; no Shop week (before the Story has one): none
  none_outside() {
    const idx = { entries: [entry('E-1', '2019-04-01', '2019-04-07'), { ...entry('E-3', '2019-04-01', '2019-04-07'), evStageId: undefined, stageIds: [], available: false, quests: [] }] };
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-03-25', '2019-03-31'), WED)), []);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-08', '2019-04-14'), WED)), []);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-04-01', '2019-04-07'), WED)), ['E-1']);
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week(null, null), WED)), []);
    assert.deepStrictEqual(ids(cal.currentEntries({}, week('2019-04-01', '2019-04-07'), WED)), []);
  },
  // a short-window event (entry.days, make-events.js) is open its whole original day: the real weekday (Pacific) of that day inside
  // the Shop week, all day long, and closed the day after (and the day before); without a real clock it is never listed
  whole_day() {
    const short = entry('E-4', '2019-04-03', '2019-04-03', { days: ['2019-04-03'] }); // a Wednesday
    const idx = { entries: [short] };
    const w = week('2019-04-01', '2019-04-07');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w, WED)), ['E-4'], 'its day, at noon');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w, Date.parse('2026-11-04T08:00:00Z'))), ['E-4'], 'its day, 00:00 PST');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w, Date.parse('2026-11-05T07:59:00Z'))), ['E-4'], 'its day, 23:59 PST');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w, THU)), [], 'the day after');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w, TUE)), [], 'the day before');
    assert.deepStrictEqual(ids(cal.currentEntries(idx, w)), [], 'no real clock');
    // a Thursday-to-Wednesday Shop week: Wednesday is its last day, still 2019-04-03
    assert.deepStrictEqual(ids(cal.currentEntries(idx, week('2019-03-28', '2019-04-03'), WED)), ['E-4']);
    // per quest: a quest with days of its own opens only on them, the others of the entry on every day of the entry
    const two = entry('E-5', '2019-04-03', '2019-04-04', { days: ['2019-04-03', '2019-04-04'],
      quests: [quest(4000051, { days: ['2019-04-03'] }), quest(4000052, { days: ['2019-04-04'] }), quest(4000053, { served: false, status: 'not served yet' })] });
    assert.deepStrictEqual(cal.openQuests(two, w, WED).map((q) => q.stageId), [4000051]);
    assert.deepStrictEqual(cal.openQuests(two, w, THU).map((q) => q.stageId), [4000052]);
    assert.deepStrictEqual(cal.openQuests(two, w, TUE).map((q) => q.stageId), []);
  },
  // a daily event (one quest per day, 24 h windows, no `days`): listed with every served quest for its whole period (ruling 06-11)
  daily_whole_period() {
    const daily = entry('E-6', '2019-04-01', '2019-04-07', { quests: [1, 2, 3].map((n) => quest(4000060 + n, { window: [`2019-04-0${n} 07:00:00`, `2019-04-0${n + 1} 06:59:59`] })) });
    assert.deepStrictEqual(cal.openQuests(daily, week('2019-04-01', '2019-04-07'), TUE).map((q) => q.stageId), [4000061, 4000062, 4000063]);
  },
  // one card per original evStage row (Part 2 Task 5): each built row of an entry with its own dates, days and quests
  rows_own_cards() {
    const qs = [quest(4000071), quest(4000072), quest(4000073, { days: ['2019-04-10'] }), quest(4000074, { served: false })];
    const e = entry('E-7', '2019-04-01', '2019-04-14', { stageIds: [4000071, 4000072, 4000073], quests: qs, rows: [
      { evStageId: 20071, start: '2019-04-01', end: '2019-04-14', stageIds: [4000071], available: true },
      { evStageId: 20072, start: '2019-04-08', end: '2019-04-14', stageIds: [4000072], available: true },
      { evStageId: 20073, start: '2019-04-10', end: '2019-04-10', days: ['2019-04-10'], stageIds: [4000073], available: true },
      { evStageId: 20074, start: '2019-04-01', end: '2019-04-07', stageIds: [], available: false }] });
    const cards = (w, now) => cal.currentCards({ entries: [e] }, w, now).map((c) => [c.row.evStageId, c.quests.map((q) => q.stageId)]);
    assert.deepStrictEqual(cards(week('2019-04-01', '2019-04-07'), WED), [[20071, [4000071]]], 'first week: the long row only');
    assert.deepStrictEqual(cards(week('2019-04-08', '2019-04-14'), WED), [[20071, [4000071]], [20072, [4000072]], [20073, [4000073]]], 'its day (a Wednesday)');
    assert.deepStrictEqual(cards(week('2019-04-08', '2019-04-14'), THU), [[20071, [4000071]], [20072, [4000072]]], 'not on another day');
    assert.deepStrictEqual(ids(cal.currentEntries({ entries: [e] }, week('2019-04-01', '2019-04-07'), WED)), ['E-7']);
    // an entry without rows (an index before Task 5): one card, the entry itself
    assert.deepStrictEqual(cal.currentCards({ entries: [entry('E-1', '2019-04-01', '2019-04-07')] }, week('2019-04-01', '2019-04-07'), WED).map((c) => c.row.evStageId), [20001]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
if (failed) { console.error(`test-event-calendar: ${failed} FAIL`); process.exit(1); }
console.log('test-event-calendar: OK');
