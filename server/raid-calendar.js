// Raid calendar (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 8, spec step 3): which raids of raids.json run
// in the player's Shop week. Pure: the week comes from storyCtx() of server.js (shopFrom / shopTo, the same rotation as the
// Shop and Special tabs, one original week per real Monday inside the story tranche), so there is no second rotation counter.
//
// Rule, as special.currentEntries does for the weekly VIP versions (docs/notes/raid.md, «Calendar»):
// - candidates: the census rows of the index (every entry carries censusId, start, end: the census row's dates);
// - the rows whose dates hold shopFrom are the week's raids (several when they ran together: a Radiant Reward row beside
//   a Weekly one);
// - else the row with the largest overlap with [shopFrom, shopTo], tie to the later start (a Thursday-to-Wednesday Shop week
//   overlaps two Monday-based rows), together with any row of the same dates;
// - no row overlaps: no raid this week (as in the original, the list stays empty).
// Only available tiers are listed; the unavailable ones of the chosen rows are returned apart (Catalog, Notices).
// nowMs is reserved for the Weekend-only and Daily families (open only on the real weekend or day, Task 10): the families in
// raids.json today ignore it.
'use strict';

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
const overlap = (r, from, to) => days(r.start > from ? r.start : from, r.end < to ? r.end : to);

// census rows of the index: {censusId, start, end, evStageId}, one per row
function rowsOf(index) {
  const rows = new Map();
  for (const e of (index && index.entries) || []) {
    if (!e.censusId || !e.start || rows.has(e.censusId)) continue;
    rows.set(e.censusId, { censusId: e.censusId, start: e.start, end: e.end || e.start, evStageId: e.evStageId || 0 });
  }
  return [...rows.values()];
}

// The census rows that run in the Shop week [shopFrom, shopTo]
function weekRows(index, { shopFrom, shopTo }) {
  if (!shopFrom) return [];
  const to = shopTo && shopTo >= shopFrom ? shopTo : shopFrom;
  const rows = rowsOf(index);
  const hold = rows.filter((r) => r.start <= shopFrom && r.end >= shopFrom);
  if (hold.length) return hold;
  const near = rows.filter((r) => r.start <= to && r.end >= shopFrom);
  if (!near.length) return [];
  const best = near.reduce((a, b) => {
    const oa = overlap(a, shopFrom, to), ob = overlap(b, shopFrom, to);
    return ob > oa || (ob === oa && (b.start > a.start || (b.start === a.start && b.evStageId > a.evStageId))) ? b : a;
  });
  const size = overlap(best, shopFrom, to);
  return near.filter((r) => r.start === best.start && r.end === best.end && overlap(r, shopFrom, to) === size);
}

// {entries: available tiers of the week's rows, unavailable: the other tiers of those rows}, in index order
function weekRaids(index, ctx = {}) {
  const ids = new Set(weekRows(index, ctx).map((r) => r.censusId));
  const list = ((index && index.entries) || []).filter((e) => ids.has(e.censusId));
  return { entries: list.filter((e) => e.available), unavailable: list.filter((e) => !e.available) };
}

const raidsForWeek = (index, ctx = {}) => weekRaids(index, ctx).entries;

// Raid Catalog (Task 9): one row per census row (a raid week), by date: {censusId, evStageId, start, end, family, entries (its
// tiers, index order), bosses (names, first appearance order), available (at least one tier available)}
function catalogRows(index) {
  const rows = new Map();
  for (const e of (index && index.entries) || []) {
    if (!e.censusId || !e.start) continue;
    if (!rows.has(e.censusId)) rows.set(e.censusId, { censusId: e.censusId, evStageId: e.evStageId || 0, start: e.start, end: e.end || e.start, family: e.family || '', entries: [], bosses: [] });
    const r = rows.get(e.censusId);
    r.entries.push(e);
    if (e.boss && !r.bosses.includes(e.boss)) r.bosses.push(e.boss);
  }
  const list = [...rows.values()];
  for (const r of list) r.available = r.entries.some((e) => e.available);
  return list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.evStageId - b.evStageId));
}

// State of a catalogue row for the player: ctx {shopFrom, shopTo, current (census ids of the week: Set or array), kept}.
// removed: no available tier («Not restored yet», whatever the date); now: a raid of the Shop week; kept: the kept one;
// can: a week before the Shop week, which can be kept; other: dates inside the Shop week but not listed now (a row that lost
// the week to another, the Weekend-only and Daily rows of Task 10 off their day): reached by the Story, so never «later»;
// later: starts after the Shop week (also every row before the Story has a Shop week). A kept row counts as kept only while
// it is a past week (a save kept from a later Story stays inert).
function rowState(row, { shopFrom, shopTo, current, kept } = {}) {
  if (!row.available) return 'removed';
  const cur = current instanceof Set ? current : new Set(current || []);
  if (cur.has(row.censusId)) return 'now';
  if (shopFrom && row.end < shopFrom) return kept && kept === row.censusId ? 'kept' : 'can';
  return shopFrom && row.start <= (shopTo && shopTo >= shopFrom ? shopTo : shopFrom) ? 'other' : 'later';
}

module.exports = { raidsForWeek, weekRaids, weekRows, catalogRows, rowState };
