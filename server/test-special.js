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

// WW week-limited VIP campaigns (Task 12): VIP, every day, window {start, end} inclusive; listed only in the Shop weeks
// that overlap the window and only in their own period; pinnable from a later period; playable only with VIP
const wk = { catalog: index.catalog, entries: [
  e('C1', 7501, { periods: [2], vip: true, campaign: { start: '2017-02-20', end: '2017-02-26' } }),
  e('C2', 7502, { periods: [2], vip: true, campaign: { start: '2017-02-27', end: '2017-03-12' } }),
  e('C3', 7503, { periods: [3], vip: true, campaign: { start: '2018-08-31', end: '2018-10-09' } }),
] };
const wkAt = (period, shopFrom, shopTo) => keysOf(sp.currentEntries(wk, { period, shopFrom, shopTo }));
check(wkAt(2, '2017-02-20', '2017-02-26') === 'C1', 'campaign week: only C1');
check(wkAt(2, '2017-02-27', '2017-03-05') === 'C2' && wkAt(2, '2017-03-06', '2017-03-12') === 'C2', 'two-week campaign in both weeks, not the one before');
check(wkAt(2, '2017-03-13', '2017-03-19') === '', 'week after the windows: no campaign');
check(wkAt(2, '2017-02-23', '2017-03-01') === 'C1,C2', 'a Shop week across two campaign weeks lists both');
check(wkAt(3, '2018-09-03', '2018-09-09') === 'C3' && wkAt(2, '2018-09-03', '2018-09-09') === '', 'campaign only in its own period');
check(!sp.pinnable(wk.entries[0], 2).ok && sp.pinnable(wk.entries[0], 2).why === 'not-past' && sp.pinnable(wk.entries[0], 3).ok, 'campaign pinnable from a later period');
check(sp.lockOf(wk.entries[0], { weekday: 'Wed', vip: false, pinned: true }) === 1 && sp.lockOf(wk.entries[0], { weekday: 'Wed', vip: true, pinned: true }) === 0, 'pinned campaign: VIP only');
{
  const kp = sp.specialEvents(wk, { period: 4, weekday: 'Wed', vip: false, pinnedKey: 'C1', shopFrom: '2020-06-01', shopTo: '2020-06-07',
    dayEndStr: 'D', weekEndStr: 'W', imgBase: '' });
  const k1 = kp.find((x) => x.eventStageId === 7501);
  check(kp.length === 2 && k1 && k1.isLock === 1 && k1.bannerUrl.endsWith('/v' + sp.SPECIAL_IMG_VERSION + '/7501-kept.png') && k1.endTime === 'W', 'pinned old campaign kept, locked without VIP');
}

// currentEntries: optional from / to of an entry (days 'YYYY-MM-DD', inclusive) against the Shop week start
const dated = { catalog: index.catalog, entries: [
  e('vipCid', 7201, { periods: [1, 2], vip: true, from: '2016-05-19', to: '2017-04-19' }),
  e('freeCid', 7202, { periods: [2, 3], from: '2017-04-20' }),
  e('always', 7203, { periods: [1, 2, 3] }),
] };
const at = (period, shopFrom) => keysOf(sp.currentEntries(dated, { period, shopFrom, shopTo: shopFrom }));
check(at(1, '2016-05-16') === 'always', 'from: before the date not listed');
check(at(1, '2016-05-19') === 'vipCid,always', 'from: listed on the date');
check(at(2, '2017-04-19') === 'vipCid,always', 'to: listed on the date');
check(at(2, '2017-04-20') === 'freeCid,always', 'to / from: switch on 2017-04-20');
check(at(3, '2019-01-07') === 'freeCid,always', 'from: later periods keep the entry');
check(sp.pinnable(dated.entries[0], 3).ok, 'from / to do not change pinnable');

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
check(ev[1].bannerUrl === 'http://h/web/special/img/v' + sp.SPECIAL_IMG_VERSION + '/7103.png', 'bannerUrl');
check(sp.SPECIAL_IMG_VERSION === 4, `SPECIAL_IMG_VERSION ${sp.SPECIAL_IMG_VERSION} (4: reconstructed C44151 / C48395 banners, 30-10)`);
const kept = sp.specialEvents(index, ctx({ pinnedKey: 'old' }));
check(kept[1].eventStageId === 7101 && kept[1].bannerUrl.endsWith('/v' + sp.SPECIAL_IMG_VERSION + '/7101-kept.png'), 'kept element second, -kept banner');
check(kept[1].isLock === 2 && kept[1].endTime === 'WEEKEND', 'pinned Tue-only entry on Wed: isLock 2');
const same = sp.specialEvents(index, ctx({ pinnedKey: 'cur' }));
check(same.filter((x) => x.eventStageId === 7103).length === 1 && !same.some((x) => x.bannerUrl.includes('-kept')), 'current pin shown once, no -kept');
check(same.find((x) => x.eventStageId === 7103).isLock === 1, 'current pinned entry follows its own rules (Wed, no vip: closed)');
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

// round 2 (31-10, originals research): Daily Cid lists only today's variant, with or without VIP; the other days' Cid
// entries are not listed at all (not locked, not opened by VIP). Same for the VIP Cid of period 1.
{
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cidIx = { catalog: index.catalog, entries: [
    ...DAYS.map((d, i) => e('cid-' + d, 7301 + i, { periods: [4], days: [d], family: 'SQ12', resetGroup: 'cid' })),
    ...DAYS.map((d, i) => e('cidvip-' + d, 7401 + i, { periods: [1], days: [d], family: 'SQ12', resetGroup: 'cid-vip', vip: true })),
    e('other', 7310, { periods: [4], days: ['Mon'] }),
  ] };
  const cids = (o) => sp.specialEvents(cidIx, ctx(o)).filter((x) => x.eventStageId >= 7301 && x.eventStageId <= 7407 && x.eventStageId !== 7310);
  const tv = cids({ weekday: 'Tue', vip: true });
  check(tv.length === 1 && tv[0].eventStageId === 7302 && tv[0].isLock === 0, `Cid Tue with VIP: ${tv.map((x) => x.eventStageId + '/' + x.isLock)}`);
  const wn = cids({ weekday: 'Wed', vip: false });
  check(wn.length === 1 && wn[0].eventStageId === 7303 && wn[0].isLock === 0, `Cid Wed without VIP: ${wn.map((x) => x.eventStageId + '/' + x.isLock)}`);
  check(sp.specialEvents(cidIx, ctx({ weekday: 'Tue', vip: true })).some((x) => x.eventStageId === 7310 && x.isLock === 2), 'other weekday entries still opened by VIP');
  const p1 = (o) => sp.specialEvents(cidIx, ctx({ period: 1, shopFrom: '2016-06-06', shopTo: '2016-06-12', ...o })).filter((x) => x.eventStageId >= 7401 && x.eventStageId <= 7407);
  const p1v = p1({ weekday: 'Fri', vip: true }), p1n = p1({ weekday: 'Fri', vip: false });
  check(p1v.length === 1 && p1v[0].eventStageId === 7405 && p1v[0].isLock === 0, `VIP Cid Fri with VIP: ${p1v.map((x) => x.eventStageId + '/' + x.isLock)}`);
  check(p1n.length === 1 && p1n[0].eventStageId === 7405 && p1n[0].isLock === 1, `VIP Cid Fri without VIP: locked ${p1n.map((x) => x.eventStageId + '/' + x.isLock)}`);
  check(sp.currentEntries(cidIx, { period: 4, shopFrom: '2020-06-01', shopTo: '2020-06-07' }).length === 8, 'no weekday in the context: all Cid entries (catalogue without a day)');
  check(sp.isDailyCid(cidIx.entries[0]) && sp.isDailyCid(cidIx.entries[7]) && !sp.isDailyCid(cidIx.entries[14]), 'isDailyCid');
}

// round 5: the Story quest that unlocks an entry: first tranche of the Shop catalogue's story rows ([qFrom, qTo, date])
// whose date is on or after the entry's start (first period's from, its own from if later, a campaign's start)
{
  const story = [[1, 10, '2016-01-01'], [11, 20, '2016-06-01'], [21, 25, '2016-09-19'], [26, 30, '2016-09-19'], [31, 40, '2018-03-01'], [41, 50, '2020-02-01']];
  check(sp.unlockQuest(story, e('a', 1, { periods: [2] }), PERIODS) === 21, `period 2 (from 2016-09-19): quest ${sp.unlockQuest(story, e('a', 1, { periods: [2] }), PERIODS)}`);
  check(sp.unlockQuest(story, e('b', 2, { periods: [3, 4] }), PERIODS) === 31, 'period 3 (from 2018-02-02): first tranche after, 31');
  check(sp.unlockQuest(story, e('c', 3, { periods: [3], from: '2019-01-07' }), PERIODS) === 41, 'own from later than the period: 41');
  check(sp.unlockQuest(story, e('d', 4, { periods: [2], campaign: { start: '2016-06-01', end: '2016-06-07' } }), PERIODS) === 11, 'campaign start on a tranche date: 11');
  check(sp.unlockQuest(story, e('f', 5, { periods: [2], campaign: { start: '2016-06-02', end: '2016-06-08' } }), PERIODS) === 21, 'campaign start after a tranche date: next tranche 21');
  check(sp.unlockQuest(story, e('g', 6, { periods: [5] }), PERIODS) === null, 'never reached: null');
  check(sp.unlockQuest([], e('h', 7, { periods: [2] }), PERIODS) === null, 'no story rows: null');
}

// round 6: complete (crown right of the banner) = 1 when every stage of the element has all its objectives done
{
  const done = { 970000: [1, 2, 3], 71030: [1, 2, 3], 71031: [1, 2], 71010: [1, 2, 3], 71011: [3, 1, 2] };
  const st = (id) => ({ score: 0, playStatus: id in done ? 2 : 0, clearMissionIds: done[id] || [] });
  const cx = (o) => ctx({ weekday: 'Tue', stageState: st, ...o });
  const out = sp.specialEvents(index, cx({ pinnedKey: 'old' }));
  const el = (id) => out.find((x) => x.eventStageId === id);
  check(el(7000).complete === 1, `catalog with [1,2,3]: complete ${el(7000).complete}`);
  check(el(7103).complete === 0, `one stage missing an objective: complete ${el(7103).complete}`);
  check(el(7101).complete === 1, `KEPT element, all done (any order): complete ${el(7101).complete}`);
  check(el(7104).complete === 0, 'nothing done: 0');
  // a stage with fewer objectives (ctx.objectiveCount): 2 of 2 is complete
  const two = sp.specialEvents(index, cx({ objectiveCount: (id) => (id === 71031 ? 2 : 3) }));
  check(two.find((x) => x.eventStageId === 7103).complete === 1, 'stage with 2 objectives, both done: complete 1');
  check(sp.specialEvents(index, ctx({})).every((x) => x.complete === 0), 'no objectives done: all 0');
}

// round 17: recurring VIP set with week versions (weekOf = the set's entry, campaign = the week): in a week with a
// version only the version(s) are listed, the set's entry is hidden; in a week without one the entry (fallback)
{
  const ws = { catalog: index.catalog, entries: [
    e('vm', 7021, { periods: [3, 4], vip: true, from: '2019-03-04', family: 'SQ22' }),
    e('vm@2019-07-01', 7701, { periods: [3], vip: true, family: 'SQ22', weekOf: 'vm', campaign: { start: '2019-07-01', end: '2019-07-14' } }),
    e('vm@2019-07-08', 7702, { periods: [3], vip: true, family: 'SQ22', weekOf: 'vm', campaign: { start: '2019-07-08', end: '2019-07-14' } }),
    e('other', 7022, { periods: [3, 4], vip: true, family: 'SQ22' }),
  ] };
  const at3 = (from, to) => keysOf(sp.currentEntries(ws, { period: 3, shopFrom: from, shopTo: to }));
  check(at3('2019-07-01', '2019-07-07') === 'vm@2019-07-01,other', `week with one version: version only (${at3('2019-07-01', '2019-07-07')})`);
  check(at3('2019-07-08', '2019-07-14') === 'vm@2019-07-01,vm@2019-07-08,other', `week with two versions: both, no fallback (${at3('2019-07-08', '2019-07-14')})`);
  check(at3('2019-07-15', '2019-07-21') === 'vm,other', `week without a version: the set's entry (${at3('2019-07-15', '2019-07-21')})`);
  check(at3('2019-02-25', '2019-03-03') === 'other', 'before the entry from: neither');
  const moved = { catalog: index.catalog, entries: [ws.entries[0], ws.entries[3], ws.entries[1]] };
  check(keysOf(sp.currentEntries(moved, { period: 3, shopFrom: '2019-07-01', shopTo: '2019-07-07' })) === 'vm@2019-07-01,other', 'the version takes the place of its set entry in the tab');
  check(!sp.pinnable(ws.entries[1], 3).ok && sp.pinnable(ws.entries[1], 4).ok, 'week version pinnable from a later period');
  const ev = sp.specialEvents(ws, ctx({ period: 3, vip: true, shopFrom: '2019-07-01', shopTo: '2019-07-07' }));
  check(ev.map((x) => x.eventStageId).join() === '7000,7701,7022' && ev[1].isLock === 0 && ev[1].endTime === 'WEEKEND', `tab: the week's version open with VIP (${ev.map((x) => x.eventStageId)})`);
  const kp = sp.specialEvents(ws, ctx({ period: 4, vip: true, pinnedKey: 'vm@2019-07-08', shopFrom: '2020-06-01', shopTo: '2020-06-07' }));
  check(kp.map((x) => x.eventStageId).join() === '7000,7702,7021,7022' && kp[1].bannerUrl.endsWith('/7702-kept.png'), `kept week version next to the fallback (${kp.map((x) => x.eventStageId)})`);
}

if (errors.length) { console.error(`test-special: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-special: OK');
