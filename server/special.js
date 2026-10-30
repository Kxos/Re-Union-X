// Special tab (Quests > Special): periods, weekday locks, pin and event list. Pure logic, no player or master access.
'use strict';

const clock = require('./clock');

// Version segment of every Special banner URL (/web/special/img/v<N>/<id>.png): the client caches banner images by URL, so
// bump SPECIAL_IMG_VERSION whenever recon/tools/make_special_banners.py output changes, then bump the master revision.
const SPECIAL_IMG_VERSION = 4; // 3: VIP Materials, spirit part, Limited VIP Board art (31-10); 4: C44151 / C48395 rebuilt
const imgPath = (name) => `/web/special/img/v${SPECIAL_IMG_VERSION}/${name}.png`;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// special_periods.json ({periods, entries}, make-special.js) is read on first use, so the tests can run with their
// own periods
let periodsCache = null;
const loadPeriods = () => {
  if (!periodsCache) periodsCache = require('./special_periods.json').periods;
  return periodsCache;
};

// period (1..5) that contains the day 'YYYY-MM-DD'; before the first -> 1, after the last -> last
const periodOf = (day, periods = loadPeriods()) => {
  let n = periods[0].n;
  for (const p of periods) if (day >= p.from) n = p.n;
  return n;
};

// game weekday: day 0 is Monday 2018-01-01 08:00 UTC; the modulo is guarded for dates before day 0
const weekdayOf = (realMs) => WEEKDAYS[((clock.dayIndex(realMs) % 7) + 7) % 7];

const ownDay = (entry, weekday) => entry.days === 'all' || (Array.isArray(entry.days) && entry.days.includes(weekday));

// lock state: 0 open on its own day (or always), 2 open only thanks to VIP or the pin, 1 closed
const lockOf = (entry, { weekday, vip, pinned }) => {
  if (entry.vip) return vip ? 0 : 1;
  if (ownDay(entry, weekday)) return 0;
  if (vip || (pinned && !entry.replacedBy)) return 2;
  return 1;
};

const isOpen = (entry, st) => lockOf(entry, st) !== 1;

const isCatalog = (entry) => !entry.periods || entry.key === 'catalog' || entry.training === true;

// Daily Challenge: Cid (family SQ12, reset groups cid / cid-vip): in the original one quest cycling seven variants, so
// only today's variant was listed and playable, VIP or not (khuxwiki, notice 18256; research 31-10)
const isDailyCid = (entry) => entry.family === 'SQ12' || /^cid/.test(entry.resetGroup || '');

// entries of the period, plus the campaigns whose window overlaps the shop week. Optional entry `from` / `to` (days
// 'YYYY-MM-DD', inclusive) split a period: checked against the start of the Shop week (e.g. Daily Cid VIP to
// 2017-04-19, free from 2017-04-20). With a weekday in the context, a Daily Cid entry is listed only on its own day
// (the catalogue page passes the day too; without one every entry of the period is kept).
// Recurring VIP sets (round 17): a week version (weekOf = the set's entry key, campaign = its week) replaces its set's
// entry in the weeks it is listed; the entry stays for the weeks without a known version (fallback).
const currentEntries = (index, { period, shopFrom, shopTo, weekday }) => {
  let list = index.entries.filter((en) => {
    if (!en.periods.includes(period) || en.removed) return false;
    if (weekday && isDailyCid(en) && !ownDay(en, weekday)) return false;
    if ((en.from && shopFrom < en.from) || (en.to && shopFrom > en.to)) return false;
    if (!en.campaign) return true;
    return en.campaign.start <= shopTo && en.campaign.end >= shopFrom;
  });
  const weekly = new Set(list.filter((en) => en.weekOf).map((en) => en.weekOf));
  if (!weekly.size) return list;
  // one Shop week, one version per set (bench rev 223: Shop weeks start on the tranche day, so a Thursday-to-Wednesday
  // week overlaps two Monday-based versions): every version whose window contains shopFrom (two only where the
  // original banners ran together), else the one with the largest overlap (tie -> the later one)
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
  const overlap = (en) => days(en.campaign.start > shopFrom ? en.campaign.start : shopFrom, en.campaign.end < shopTo ? en.campaign.end : shopTo);
  const keep = new Set();
  for (const set of weekly) {
    const vs = list.filter((en) => en.weekOf === set);
    const hold = vs.filter((en) => en.campaign.start <= shopFrom && en.campaign.end >= shopFrom);
    if (hold.length) hold.forEach((en) => keep.add(en));
    else keep.add(vs.reduce((a, b) => (overlap(b) > overlap(a) || (overlap(b) === overlap(a) && (b.campaign.start > a.campaign.start
      || (b.campaign.start === a.campaign.start && b.evStageId > a.evStageId))) ? b : a)));
  }
  list = list.filter((en) => !en.weekOf || keep.has(en));
  // the versions take the place of their set's entry (the tab keeps its order)
  const listed = new Set(list.map((en) => en.key));
  return list.filter((en) => !(en.weekOf && listed.has(en.weekOf)))
    .flatMap((en) => (weekly.has(en.key) ? list.filter((v) => v.weekOf === en.key) : [en]));
};

// a quest can be pinned only when its period is already past (campaigns use their own period)
// Story quest that unlocks an entry (catalogue «later» rows, round 5): story = the Shop catalogue's rows
// [qFrom, qTo, date] (the tranche dates that also move the Shop week); the first tranche whose date is on or after the
// entry's start: a campaign's start, else the from of its first period or its own `from` when later. null = no tranche
// reaches it in this version of the Story.
const unlockQuest = (story, entry, periods = loadPeriods()) => {
  const p1 = periods.find((p) => p.n === Math.min(...entry.periods));
  const start = entry.campaign ? entry.campaign.start : [p1 ? p1.from : '', entry.from || ''].sort().pop();
  const day = [...new Set((story || []).map((r) => r[2]))].sort().find((d) => d >= start);
  if (!day) return null;
  return Math.min(...story.filter((r) => r[2] === day).map((r) => r[0]));
};

const pinnable = (entry, period) => {
  if (isCatalog(entry)) return { ok: false, why: 'training' };
  if (entry.removed) return { ok: false, why: 'removed' };
  if (entry.replacedBy) return { ok: false, why: 'replaced' };
  if (!(Math.max(...entry.periods) < period)) return { ok: false, why: 'not-past' };
  return { ok: true, why: '' };
};

const specialEvents = (index, ctx) => {
  const { period, weekday, vip, pinnedKey, dayEndStr, weekEndStr, imgBase } = ctx;
  const stageState = ctx.stageState || (() => ({ score: 0, playStatus: 0, clearMissionIds: [] }));
  // objectives of a stage (ctx.objectiveCount: validSubmission of the master row, at most 3; default 3)
  const objectiveCount = ctx.objectiveCount || (() => 3);
  // complete (crown to the right of the banner, user 31-10): 1 when every stage has all its objectives done; a stage
  // without objectives counts once cleared (playStatus)
  const allDone = (stages) => (stages.length && stages.every((s) => {
    const n = Math.min(3, objectiveCount(s.stageId));
    return n > 0 ? [1, 2, 3].slice(0, n).every((m) => s.clearMissionIds.includes(m)) : !!s.playStatus;
  }) ? 1 : 0);
  const build = (src, evStageId, { isLock, endTime, kept }) => {
    const stages = src.stageIds.map((stageId, i) => {
      const st = stageState(stageId) || {};
      return { stageId, useAp: src.useAp[i] || 0, score: st.score || 0, playStatus: st.playStatus || 0,
        clearMissionIds: st.clearMissionIds || [] };
    });
    return {
      stages,
      eventStageId: evStageId,
      showIcon: 1,
      bannerUrl: `${imgBase}${imgPath(`${evStageId}${kept ? '-kept' : ''}`)}`,
      eventType: 0,
      status: 1,
      endTime,
      newStageId: 0,
      isLock,
      complete: allDone(stages),
    };
  };
  // VIP entries and campaigns last until the end of the week, the others until the end of the day
  const endOf = (en, isLock) => (en.vip || en.campaign || isLock === 2 ? weekEndStr : dayEndStr);

  const out = [build(index.catalog, index.catalog.evStageId, { isLock: 0, endTime: dayEndStr, kept: false })];
  const current = currentEntries(index, ctx);
  const pin = pinnedKey && index.entries.find((en) => en.key === pinnedKey);
  if (pin && pinnable(pin, period).ok && !current.includes(pin)) {
    const isLock = lockOf(pin, { weekday, vip, pinned: true });
    out.push(build(pin, pin.evStageId, { isLock, endTime: endOf(pin, isLock), kept: true }));
  }
  for (const en of current) {
    const isLock = lockOf(en, { weekday, vip, pinned: en.key === pinnedKey && pinnable(en, period).ok });
    out.push(build(en, en.evStageId, { isLock, endTime: endOf(en, isLock), kept: false }));
  }
  return out;
};

// Daily Cid style reset: true when every stage of every entry in the reset group has 3 objectives done and a
// new week has begun. `group` is the index or an entry array.
const resetDue = (entry, done, lastResetWeek, week, group) => {
  if (!entry.resetGroup || !(week > lastResetWeek)) return false;
  const all = Array.isArray(group) ? group : (group && group.entries) || [entry];
  const members = all.filter((en) => en.resetGroup === entry.resetGroup);
  return members.every((en) => en.stageIds.every((id) => (done[id] || []).length >= 3));
};

module.exports = {
  get PERIODS() { return loadPeriods(); },
  SPECIAL_IMG_VERSION, imgPath, periodOf, isDailyCid, unlockQuest, weekdayOf, isOpen, lockOf, currentEntries, pinnable, specialEvents, resetDue,
};
