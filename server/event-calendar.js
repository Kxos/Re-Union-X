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
//   no weekday restriction (ruling of 06-11, «whole original period unless the record says otherwise»).
'use strict';
const { weekTo, weekDateAt } = require('./calendar-util');

const served = (q) => q && q.served;
const listable = (e) => !!(e && e.available && e.evStageId && (e.stageIds || []).length);

// The served quests of an entry open now: a quest (or its entry) with `days` only on the Shop week's date of the real weekday
function openQuests(entry, week = {}, nowMs) {
  const quests = ((entry && entry.quests) || []).filter(served);
  const hasDays = (x) => Array.isArray(x.days) && x.days.length;
  if (!hasDays(entry) && !quests.some(hasDays)) return quests;
  const today = weekDateAt(week, nowMs);
  if (!today) return [];
  if (hasDays(entry) && !entry.days.includes(today)) return [];
  return quests.filter((q) => !hasDays(q) || q.days.includes(today));
}

// The entries listed in the Shop week {shopFrom, shopTo} at the real moment nowMs, in index order
function currentEntries(index, week = {}, nowMs) {
  const { shopFrom } = week;
  if (!shopFrom) return [];
  const to = weekTo(week);
  return ((index && index.entries) || []).filter((e) => listable(e) && e.start <= to && (e.end || e.start) >= shopFrom && openQuests(e, week, nowMs).length);
}

module.exports = { currentEntries, openQuests, listable };
