// Special tab (Quests > Special): periods, weekday locks, pin and event list. Pure logic, no player or master access.
'use strict';

const clock = require('./clock');

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

// entries of the period, plus the campaigns whose window overlaps the shop week. Optional entry `from` / `to` (days
// 'YYYY-MM-DD', inclusive) split a period: checked against the start of the Shop week (e.g. Daily Cid VIP to
// 2017-04-19, free from 2017-04-20)
const currentEntries = (index, { period, shopFrom, shopTo }) => index.entries.filter((en) => {
  if (!en.periods.includes(period) || en.removed) return false;
  if ((en.from && shopFrom < en.from) || (en.to && shopFrom > en.to)) return false;
  if (!en.campaign) return true;
  return en.campaign.start <= shopTo && en.campaign.end >= shopFrom;
});

// a quest can be pinned only when its period is already past (campaigns use their own period)
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
  const build = (src, evStageId, { isLock, endTime, kept }) => ({
    stages: src.stageIds.map((stageId, i) => {
      const st = stageState(stageId) || {};
      return { stageId, useAp: src.useAp[i] || 0, score: st.score || 0, playStatus: st.playStatus || 0,
        clearMissionIds: st.clearMissionIds || [] };
    }),
    eventStageId: evStageId,
    showIcon: 1,
    bannerUrl: `${imgBase}/web/special/img/${evStageId}${kept ? '-kept' : ''}.png`,
    eventType: 0,
    status: 1,
    endTime,
    newStageId: 0,
    isLock,
    complete: 0,
  });
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
  periodOf, weekdayOf, isOpen, lockOf, currentEntries, pinnable, specialEvents, resetDue,
};
