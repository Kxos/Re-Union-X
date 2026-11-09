// Event calendar (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 4, spec
// docs/superpowers/specs/2026-11-06-events-design.md): which event quests of game_data/events.json (make-events.js) are listed in
// the player's Shop week. Pure: the week is storyCtx() of server.js (shopFrom / shopTo), the rotation of the Shop, Special and
// raids, so there is no counter of its own.
// Rules (docs/notes/events.md, «Calendar»):
// - only entries with an evStage row (available: at least one served quest) are listed, and only their served quests;
// - every entry whose dates [start, end] overlap the Shop week is listed, all of them (unlike the weekly raids, no largest
//   overlap): an event that ran three weeks is listed in each of the three real weeks;
// - a short-window event (entry.days, a donor window under 12 h, make-events.js) is open its whole original day: listed on the
//   real weekday (Pacific) of a day of `days` that falls in the Shop week (calendar-util.weekDateAt), all day, closed the day
//   after; a quest with days of its own opens only on them. Without a real clock (nowMs) a short-window event is never listed;
// - a daily event (one quest per original day, 24 h windows, no `days`) is listed for its whole period with every served quest:
//   no weekday restriction (ruling of 06-11, «whole original period unless the record says otherwise»);
// - one card per original evStage row of an entry (Part 2 Task 5, currentCards): a row is listed in the weeks its own dates overlap.
'use strict';
const { weekTo, weekDateAt } = require('./calendar-util');

const served = (q) => q && q.served;
const listable = (e) => !!(e && e.available && e.evStageId && (e.stageIds || []).length);

// The served quests of an entry open now: a quest (or its entry) with `days` only on the Shop week's date of the real weekday.
// A quest with openFrom (Part 5 fix round 1: the Pt. 2 quests of EV-0929, dated from its Pt. 1 line) only in the Shop weeks that
// reach that date
function openQuests(entry, week = {}, nowMs) {
  const to = week.shopFrom ? weekTo(week) : null;
  const quests = ((entry && entry.quests) || []).filter(served).filter((q) => !q.openFrom || !to || q.openFrom <= to);
  const hasDays = (x) => Array.isArray(x.days) && x.days.length;
  if (!hasDays(entry) && !quests.some(hasDays)) return quests;
  const today = weekDateAt(week, nowMs);
  if (!today) return [];
  if (hasDays(entry) && !entry.days.includes(today)) return [];
  return quests.filter((q) => !hasDays(q) || q.days.includes(today));
}

// One card per original evStage row (Part 2 Task 5, make-events.js entry `rows`): the built rows of an entry, each with its own
// dates, days and served quests; an entry without rows (an index before Task 5) is one row, the entry itself.
const builtRows = (e) => (Array.isArray(e.rows) && e.rows.length
  ? e.rows.filter((r) => r.available && (r.stageIds || []).length)
  : [{ evStageId: e.evStageId, start: e.start, end: e.end, days: e.days, eventType: e.eventType, stageIds: e.stageIds || [] }]);
// the served quests of one row of the entry open now (its days, then the quests' own days, as openQuests)
function rowQuests(entry, row, week = {}, nowMs) {
  const ids = new Set(row.stageIds || []);
  return openQuests({ days: row.days, quests: ((entry && entry.quests) || []).filter((q) => ids.has(q.stageId)) }, week, nowMs);
}

// The cards listed in the Shop week {shopFrom, shopTo} at the real moment nowMs, in index and row order: [{entry, row, quests}]
// for every built row whose dates overlap the week with an open quest
function currentCards(index, week = {}, nowMs) {
  const { shopFrom } = week;
  if (!shopFrom) return [];
  const to = weekTo(week), out = [];
  for (const e of ((index && index.entries) || []).filter(listable)) {
    for (const row of builtRows(e)) {
      const start = row.start || e.start, end = row.end || row.start || e.end || e.start;
      if (!start || start > to || end < shopFrom) continue;
      const quests = rowQuests(e, row, week, nowMs);
      if (quests.length) out.push({ entry: e, row, quests });
    }
  }
  return out;
}

// The entries listed in the Shop week {shopFrom, shopTo} at the real moment nowMs (one card or more), in index order
function currentEntries(index, week = {}, nowMs) {
  const seen = new Set();
  return currentCards(index, week, nowMs).map((c) => c.entry).filter((e) => !seen.has(e) && seen.add(e));
}

module.exports = { currentEntries, currentCards, openQuests, rowQuests, builtRows, listable };
