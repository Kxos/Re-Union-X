// Event quest routes (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 4): the event cards
// of the Events tab (/stage/event category 2, after the raids: server.js lists [...raid().events(), ...events, ...]) and the
// rewards of an event quest clear. The factory takes everything from server.js; state lives in player.events only:
//   player.events = {kept: censusId | null, cleared: {stageId: [missionIds]}}
// Absent in older saves: the tab lists the served events with nothing cleared, and listing never writes the save.
// Rewards (spec, «Rewards»): the objective rewards and the first-clear items of the stage row (submission*, validClearGetItem,
// make-events.js) once per quest, paid here (server.js skips its own payment for event stages); drops on every clear by the
// usual /stage/clear path (the POI of the quest's map key, server.js poiStageId). Reward type 15 (Event Coins, Part 3 Task 5) is
// paid into the balance of the entry's board set (entry.boardSet, addEventCoins = routes-event-boards.js addCoins), never as Raid
// Coins; an entry without a set pays none (the objective counts as done, the coins are only logged).
//   events (list), catalogEvents (the Event Catalog banner), onStageClear (rewards), isEventStage, keep / unkeep / catalogCtx /
//   pruneKept (Event Catalog, Task 5).
'use strict';
const fs = require('fs');
const path = require('path');
const calendar = require('./event-calendar');
const { rowState, ptWeekday, weekdayOf } = require('./calendar-util');
const special = require('./special');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8'));
// Version segment of the event card URL (/web/event/img/v<N>/<evStageId>.png): the client caches banner images by URL. The same
// value make-events.js writes in the evStage rows (event_config.json imgVersion): bump it there when the cards change.
const EVENT_IMG_VERSION = CONFIG.imgVersion;
const EVENT_TYPE = CONFIG.eventType; // eventType of an index entry without one (make-events.js writes the donor value per entry)
const STAGE_FIRST = CONFIG.stageBase, STAGE_LAST = CONFIG.stageMax; // stage ids of the event quests
const COIN_TYPE = 15; // Event Coins: into the entry's board set (addEventCoins)

function routesEvents({ player, savePlayer, masterRows, eventIndex, storyWeek, realNow, serverTimeAt, clock, stageState, grantItem, grantObjective, addEventCoins = null, webBase, log = console.log }) {
  // read-only view of player.events (an older save has none: nothing kept, nothing cleared); state() creates it to write
  const view = () => player.events || { kept: null, cleared: {} };
  const state = () => {
    player.events ||= {};
    if (player.events.kept === undefined) player.events.kept = null;
    player.events.cleared ||= {};
    return player.events;
  };
  const entries = () => (eventIndex() || {}).entries || [];
  const isEventStage = (stageId) => { const id = Number(stageId); return id >= STAGE_FIRST && id <= STAGE_LAST; };
  const stageRow = (id) => masterRows('stage').find((r) => r.stageId === id);
  // the index entry of an event quest, and its board set (events.json entry.boardSet, make-events.js; null without one)
  const entryOfStage = (stageId) => { const id = Number(stageId); return entries().find((e) => (e.quests || []).some((q) => q.stageId === id) || (e.stageIds || []).includes(id)) || null; };
  const boardSetOf = (stageId) => (entryOfStage(stageId) || {}).boardSet || null;

  // From respondStageClear, after its objective rules (Lux objectives, all-together flag): cleared = the objective ids of this
  // clear. Pays the first-clear items (first clear of this quest) and the objectives never paid before; the caller saves.
  // false for any other stage.
  function onStageClear(stageId, cleared = []) {
    if (!isEventStage(stageId)) return false;
    const id = Number(stageId), row = stageRow(id), ev = state();
    const before = ev.cleared[id];
    // Event Coins (type 15) go into the balance of the entry's board set (routes-event-boards.js); an entry without a set
    // pays none (logged), never Raid Coins
    const setKey = boardSetOf(id);
    const pay = (type, what, fn, num) => {
      if (type !== COIN_TYPE) { fn(); return; }
      if (setKey && addEventCoins && addEventCoins(setKey, num)) return;
      log(`[event] ${id}: ${what} in Event Coins x${num} not paid (no board set)`);
    };
    if (!row) log(`[event] ${id}: no stage row, no reward`);
    if (row && before === undefined) {
      for (let i = 0; i < (row.validClearGetItem || 0); i++) {
        const type = row.clearGetItemType[i];
        pay(type, 'first-clear item', () => grantItem(type, row.clearGetItemId[i], row.clearGetItemNum[i]), row.clearGetItemNum[i]);
      }
    }
    // no stage row (a master not rebuilt yet): nothing paid and nothing recorded, so the first-clear items and the objectives
    // are paid at the first clear with the row (review of Task 4)
    if (!row) return true;
    const done = before || [];
    const fresh = [...new Set(cleared)].filter((n) => n >= 1 && n <= 3 && !done.includes(n)).sort((a, b) => a - b);
    for (const n of fresh) pay(row.submissionRewardType?.[n - 1], `objective ${n}`, () => grantObjective(row, n), row.submissionItemNum?.[n - 1]);
    ev.cleared[id] = [...new Set([...done, ...fresh])].sort((a, b) => a - b);
    return true;
  }

  // The events of the player's Shop week (event-calendar.js): storyWeek() is {shopFrom, shopTo} of storyCtx() in server.js
  const currentEntries = (realMs = realNow()) => calendar.currentEntries(eventIndex(), storyWeek(), realMs);
  // Event Catalog (Task 5): player.events.kept = the census id of the kept event (one at a time, as the Raid Catalog), served only
  // while it is a past event of the Story (rowState 'kept'), with all its served quests: a short-window one on the real weekday of
  // its days, as the raids kept from the catalogue open on their real days
  const entryOf = (censusId) => entries().find((e) => e.censusId === censusId);
  // kept: null when the index no longer has that census id (a record dropped): inert here, cleared by pruneKept
  function catalogCtx(realMs = realNow()) {
    const { shopFrom, shopTo } = storyWeek(), kept = view().kept || null;
    return { shopFrom, shopTo, current: new Set(currentEntries(realMs).map((e) => e.censusId)), kept: kept && entryOf(kept) ? kept : null };
  }
  // GET /web/event/catalog: a kept census id the index no longer has is cleared (saved), so the save holds no dead id; listing the
  // Events tab never writes the save
  function pruneKept() {
    const kept = view().kept;
    if (!kept || entryOf(kept)) return false;
    state().kept = null;
    savePlayer();
    log(`[event] Event Catalog: kept ${kept} is not in the index any more, cleared`);
    return true;
  }
  function keptEntry(realMs = realNow()) {
    const c = catalogCtx(realMs), e = c.kept && entryOf(c.kept);
    return e && calendar.listable(e) && rowState(e, c) === 'kept' ? e : null;
  }
  // the kept event's open cards, one per built row (Part 2 Task 5): its dates are past, so `days` (row or quest) are read as real
  // weekdays (Pacific). [{row, quests}]
  function keptCards(e, realMs) {
    const wd = ptWeekday(realMs);
    const onDay = (ds) => !Array.isArray(ds) || !ds.length || ds.some((d) => weekdayOf(d) === wd);
    return calendar.builtRows(e).map((row) => {
      const ids = new Set(row.stageIds || []);
      return { row, quests: onDay(row.days) ? (e.quests || []).filter((q) => q.served && ids.has(q.stageId) && onDay(q.days)) : [] };
    }).filter((c) => c.quests.length);
  }
  // an entry by its id or by the id of one of its rows (the Details and Keep buttons of a row card)
  const entryById = (id) => entries().find((x) => x.evStageId === id || (x.rows || []).some((r) => r.evStageId === id));
  // POST /web/event/keep/<evStageId> and /web/event/unkeep (Task 5 buttons): {code, body {ok, why?}}. Only a past event with a
  // served quest can be kept (else why: now, other, later, removed); keeping one replaces the previous.
  function keep(evStageId) {
    const id = Number(evStageId), e = entryById(id);
    if (!e) return { code: 404, body: { ok: false, why: 'unknown event' } };
    const st = calendar.listable(e) ? rowState(e, { ...catalogCtx(), kept: null }) : 'removed';
    if (st !== 'can') return { code: 409, body: { ok: false, why: st } };
    state().kept = e.censusId;
    savePlayer();
    log(`[event] Event Catalog: ${e.censusId} kept`);
    return { code: 200, body: { ok: true } };
  }
  function unkeep() {
    state().kept = null;
    savePlayer();
    return { code: 200, body: { ok: true } };
  }

  // /stage/event category 2, after the raids: the kept event (its cards with the KEPT tab), then one card per built original
  // evStage row (Part 2 Task 5: own eventStageId, card, eventType) of the events of the week, with its open served quests. endTime: the end of the real day when the entry or one of its open quests has days (a short-window
  // event or quest; `days: []` is no days), else of the real week (as the raids).
  function events(realMs = realNow()) {
    const cleared = view().cleared || {};
    const stageOf = (q) => {
      const st = stageState(q.stageId);
      return { stageId: q.stageId, useAp: Number(q.ap) || 0, score: st.score, playStatus: st.playStatus, clearMissionIds: [...(cleared[q.stageId] || [])] };
    };
    const objectives = (id) => Math.min(3, (stageRow(id) || {}).validSubmission || 0);
    const hasDays = (x) => Array.isArray(x.days) && x.days.length > 0;
    const card = (e, row, quests, kept = false) => {
      const stages = quests.map(stageOf);
      return {
        stages,
        eventStageId: row.evStageId,
        showIcon: 1,
        bannerUrl: `${webBase}/web/event/img/v${EVENT_IMG_VERSION}/${row.evStageId}${kept ? '-kept' : ''}.png`,
        eventType: Number.isInteger(row.eventType) ? row.eventType : Number.isInteger(e.eventType) ? e.eventType : EVENT_TYPE,
        status: 1,
        endTime: serverTimeAt(hasDays(row) || quests.some(hasDays) ? clock.dayEnd(realMs) : clock.weekEnd(realMs)),
        newStageId: 0,
        isLock: 0,
        // crown (as the Special tab): every quest with its objectives 1..min(3, validSubmission) done
        complete: stages.length && stages.every((s) => special.stageDone(s, objectives(s.stageId))) ? 1 : 0,
      };
    };
    const kept = keptEntry(realMs);
    return [...(kept ? keptCards(kept, realMs).map((c) => card(kept, c.row, c.quests, true)) : []),
      ...calendar.currentCards(eventIndex(), storyWeek(), realMs).map((c) => card(c.entry, c.row, c.quests))];
  }

  // The Event Catalog banner (index.catalog of make-events.js: eventType 0, Details -> /web/event/catalog, a tap opens its Training
  // Grounds quest): server.js lists it second in category 2, right after the Raid Catalog banner. None without index.catalog.
  function catalogEvents() {
    const cat = (eventIndex() || {}).catalog;
    if (!cat || !cat.evStageId || !(cat.stageIds || []).length) return [];
    const stages = cat.stageIds.map((id, i) => { const st = stageState(id); return { stageId: id, useAp: Number((cat.useAp || [])[i]) || 0, score: st.score, playStatus: st.playStatus, clearMissionIds: [] }; });
    return [{ stages, eventStageId: cat.evStageId, showIcon: 1, bannerUrl: `${webBase}/web/event/img/v${EVENT_IMG_VERSION}/${cat.evStageId}.png`, eventType: 0, status: 1,
      endTime: serverTimeAt(clock.weekEnd(realNow())), newStageId: 0, isLock: 0, complete: 0 }];
  }

  return { events, catalogEvents, onStageClear, isEventStage, keep, unkeep, catalogCtx, pruneKept, keptEntry, entryOfStage, boardSetOf, currentEntries };
}

module.exports = routesEvents;
module.exports.EVENT_IMG_VERSION = EVENT_IMG_VERSION;
