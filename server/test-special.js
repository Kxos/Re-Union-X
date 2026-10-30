// Special tab pure logic test: node server/test-special.js
'use strict';
const sp = require('./special');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const PERIODS = [
  { n: 1, name: 'p1', from: '2015-11-01', to: '2016-09-18' },
  { n: 2, name: 'p2', from: '2016-09-19', to: '2018-02-01' },
  { n: 3, name: 'p3', from: '2018-02-02', to: '2019-12-31' },
  { n: 4, name: 'p4', from: '2020-01-01', to: '2020-11-15' },
  { n: 5, name: 'p5', from: '2020-11-16', to: '2099-01-01' },
];
const e = (key, evStageId, o) => ({ key, evStageId, name: key, family: key, periods: [1], days: 'all', vip: false,
  replacedBy: null, removed: '', campaign: null, resetGroup: '', stageIds: [evStageId * 10, evStageId * 10 + 1],
  useAp: [5, 8], ...o });
const index = {
  catalog: { evStageId: 7000, stageIds: [970000], useAp: [0] },
  entries: [
    e('old', 7101, { periods: [1, 2], days: ['Tue'] }),
    e('oldRepl', 7102, { periods: [1, 2], days: ['Tue'], replacedBy: 'cur' }),
    e('cur', 7103, { periods: [4], days: ['Tue', 'Thu'] }),
    e('vipq', 7104, { periods: [4], days: [], vip: true }),
    e('gone', 7105, { periods: [1, 2], removed: 'no-use' }),
    e('camp', 7106, { periods: [4], campaign: { start: '2019-07-15', end: '2019-07-21' } }),
  ],
};
const by = (k) => index.entries.find((x) => x.key === k);

// periodOf
const P = (d) => sp.periodOf(d, PERIODS);
check(P('2015-11-02') === 1, 'periodOf 2015-11-02');
check(P('2016-09-18') === 1 && P('2016-09-19') === 2, 'periodOf 1/2 boundary');
check(P('2018-05-25') === 3, 'periodOf 2018-05-25');
check(P('2020-05-23') === 4, 'periodOf 2020-05-23');
check(P('2020-11-16') === 5 && P('2021-06-01') === 5, 'periodOf period 5');
check(P('2010-01-01') === 1 && P('2200-01-01') === 5, 'periodOf clamps');

// weekdayOf
check(sp.weekdayOf(Date.UTC(2026, 9, 26, 9)) === 'Mon', 'weekdayOf Mon 09:00');
check(sp.weekdayOf(Date.UTC(2026, 9, 26, 7)) === 'Sun', 'weekdayOf Sun before 08:00');
check(sp.weekdayOf(Date.UTC(2017, 11, 31, 9)) === 'Sun', 'weekdayOf before day 0 (negative index)');

// isOpen
const tue = e('t', 1, { days: ['Tue'] });
check(sp.isOpen(tue, { weekday: 'Tue', vip: false, pinned: false }), 'Tue entry open Tue');
check(!sp.isOpen(tue, { weekday: 'Wed', vip: false, pinned: false }), 'Tue entry closed Wed');
check(sp.isOpen(tue, { weekday: 'Wed', vip: true, pinned: false }), 'Tue entry open Wed with vip');
const v = e('v', 2, { days: [], vip: true });
check(!sp.isOpen(v, { weekday: 'Tue', vip: false, pinned: false }), 'vip entry closed without vip');
check(sp.isOpen(v, { weekday: 'Tue', vip: true, pinned: false }), 'vip entry open with vip');
check(sp.isOpen(tue, { weekday: 'Wed', vip: false, pinned: true }), 'pinned Tue entry open Wed');
check(!sp.isOpen(e('t2', 3, { days: ['Tue'], replacedBy: 'x' }), { weekday: 'Wed', vip: false, pinned: true }), 'pinned replaced entry stays closed');
check(!sp.isOpen(v, { weekday: 'Tue', vip: false, pinned: true }), 'pinned vip entry without vip closed');

// pinnable
check(sp.pinnable(by('old'), 4).ok === true, 'pinnable past');
check(sp.pinnable(by('oldRepl'), 4).why === 'replaced', 'pinnable replaced');
check(sp.pinnable(by('cur'), 4).why === 'not-past', 'pinnable not-past');
check(sp.pinnable(by('gone'), 4).why === 'removed', 'pinnable removed');
check(sp.pinnable({ key: 'catalog', evStageId: 7000 }, 4).why === 'training', 'pinnable catalog');
check(sp.pinnable(by('old'), 4).why === '', 'pinnable ok has empty why');

// currentEntries
const keysOf = (a) => a.map((x) => x.key).join(',');
check(keysOf(sp.currentEntries(index, { period: 4, shopFrom: '2020-06-01', shopTo: '2020-06-07' })) === 'cur,vipq', 'currentEntries without campaign');
check(keysOf(sp.currentEntries(index, { period: 4, shopFrom: '2019-07-15', shopTo: '2019-07-21' })) === 'cur,vipq,camp', 'currentEntries campaign in window');
check(keysOf(sp.currentEntries(index, { period: 4, shopFrom: '2019-07-22', shopTo: '2019-07-28' })) === 'cur,vipq', 'currentEntries campaign out of window');
check(keysOf(sp.currentEntries(index, { period: 1, shopFrom: '2016-01-01', shopTo: '2016-01-07' })) === 'old,oldRepl', 'currentEntries skips removed');

// specialEvents
const stageState = (id) => ({ score: id, playStatus: 0, clearMissionIds: [] });
const ctx = (o) => ({ period: 4, weekday: 'Wed', vip: false, pinnedKey: '', shopFrom: '2020-06-01', shopTo: '2020-06-07',
  nowStr: '2020-06-03 10:00:00', dayEndStr: 'DAYEND', weekEndStr: 'WEEKEND', imgBase: 'http://h', stageState, ...o });
const EV = ['stages', 'eventStageId', 'showIcon', 'bannerUrl', 'eventType', 'status', 'endTime', 'newStageId', 'isLock', 'complete'];
const ST = ['stageId', 'useAp', 'score', 'playStatus', 'clearMissionIds'];
const ev = sp.specialEvents(index, ctx({}));
check(ev[0].eventStageId === 7000 && ev[0].isLock === 0 && ev[0].endTime === 'DAYEND', 'first element is the catalog, open');
check(ev.length === 3 && ev[1].eventStageId === 7103 && ev[2].eventStageId === 7104, 'no pin: catalog + current');
check(ev.every((x) => EV.every((k) => k in x) && Object.keys(x).length === EV.length), 'every element has the 10 keys');
check(ev.every((x) => x.stages.every((s) => ST.every((k) => k in s))), 'every stage has the 5 keys');
check(ev[1].stages[1].useAp === 8 && ev[1].stages[0].score === 71030, 'useAp and stageState used');
check(ev[1].isLock === 1 && ev[2].isLock === 1, 'closed entries isLock 1 (Wed, no vip)');
check(ev[1].bannerUrl === 'http://h/web/special/img/7103.png', 'bannerUrl');
const kept = sp.specialEvents(index, ctx({ pinnedKey: 'old' }));
check(kept[1].eventStageId === 7101 && kept[1].bannerUrl.endsWith('7101-kept.png'), 'kept element second, -kept banner');
check(kept[1].isLock === 2 && kept[1].endTime === 'WEEKEND', 'pinned Tue-only entry on Wed: isLock 2');
const same = sp.specialEvents(index, ctx({ pinnedKey: 'cur' }));
check(same.filter((x) => x.eventStageId === 7103).length === 1 && !same.some((x) => x.bannerUrl.includes('-kept')), 'current pin shown once, no -kept');
check(sp.specialEvents(index, ctx({ pinnedKey: 'nope' })).length === 3, 'unknown pinnedKey ignored');
check(sp.specialEvents(index, ctx({ pinnedKey: 'oldRepl' })).length === 3, 'replaced pin not kept');
check(sp.specialEvents(index, ctx({ pinnedKey: 'gone' })).length === 3, 'removed pin not kept');
const tueEv = sp.specialEvents(index, ctx({ weekday: 'Tue' }));
check(tueEv[1].isLock === 0 && tueEv[1].endTime === 'DAYEND', 'own day: isLock 0, dayEnd');
const vipTue = sp.specialEvents(index, ctx({ weekday: 'Tue', vip: true }));
check(vipTue[1].isLock === 0, 'Tue entry on Tue with vip: 0');
check(vipTue[2].isLock === 0 && vipTue[2].endTime === 'WEEKEND', 'vip entry with vip: 0, weekEnd');
const vipWed = sp.specialEvents(index, ctx({ vip: true }));
check(vipWed[1].isLock === 2 && vipWed[1].endTime === 'WEEKEND', 'Tue entry on Wed with vip: isLock 2');
const camp = sp.specialEvents(index, ctx({ shopFrom: '2019-07-15', shopTo: '2019-07-21' }));
const c = camp.find((x) => x.eventStageId === 7106);
check(c && c.isLock === 0 && c.endTime === 'WEEKEND', 'campaign (days all): open, weekEnd');

// resetDue (the group is looked up in the 5th argument: an index or an entry array)
const g1 = [e('c1', 1, { resetGroup: 'cid', stageIds: [11] }), e('c2', 2, { resetGroup: 'cid', stageIds: [21, 22] })];
const full = { 11: [1, 2, 3], 21: [1, 2, 3], 22: [1, 2, 3] };
check(!sp.resetDue(g1[0], full, 10, 10, g1), 'resetDue same week false');
check(sp.resetDue(g1[0], full, 10, 11, g1), 'resetDue next week true');
check(sp.resetDue(g1[0], full, 10, 11, { entries: g1 }), 'resetDue accepts an index');
check(!sp.resetDue(g1[0], { ...full, 22: [1, 2] }, 10, 11, g1), 'resetDue incomplete false');
check(!sp.resetDue(e('x', 9, {}), full, 10, 11, g1), 'resetDue no group false');

if (errors.length) { console.error(`test-special: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-special: OK');
