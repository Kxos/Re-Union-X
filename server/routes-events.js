// Event quest routes (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 4): the event cards
// of the Events tab (/stage/event category 2, after the raids: server.js lists [...raid().events(), ...events, ...]) and the
// rewards of an event quest clear. The factory takes everything from server.js; state lives in player.events only:
//   player.events = {kept: censusId | null, cleared: {stageId: [missionIds]}}
// Absent in older saves: the tab lists the served events with nothing cleared, and listing never writes the save.
// Rewards (spec, «Rewards»): the objective rewards and the first-clear items of the stage row (submission*, validClearGetItem,
// make-events.js) once per quest, paid here (server.js skips its own payment for event stages); drops on every clear by the
// usual /stage/clear path (the POI of the quest's map key, server.js poiStageId). Reward type 15 (Event Coins) is not paid in
// this part (event boards later), never as Raid Coins: the objective counts as done, the coins are only logged.
//   events (list), onStageClear (rewards), isEventStage, keep / unkeep / catalogCtx (Event Catalog, Task 5).
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
const EVENT_TYPE = CONFIG.eventType; // eventType of our evStage rows (make-events.js)
const STAGE_FIRST = CONFIG.stageBase, STAGE_LAST = CONFIG.stageMax; // stage ids of the event quests
const COIN_TYPE = 15; // Event Coins: not paid in this part

function routesEvents({ player, savePlayer, masterRows, eventIndex, storyWeek, realNow, serverTimeAt, clock, stageState, grantItem, grantObjective, webBase, log = console.log }) {
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

  // From respondStageClear, after its objective rules (Lux objectives, all-together flag): cleared = the objective ids of this
  // clear. Pays the first-clear items (first clear of this quest) and the objectives never paid before; the caller saves.
  // false for any other stage.
  function onStageClear(stageId, cleared = []) {
    if (!isEventStage(stageId)) return false;
    const id = Number(stageId), row = stageRow(id), ev = state();
    const before = ev.cleared[id];
    const pay = (type, what, fn) => {
      if (type === COIN_TYPE) { log(`[event] ${id}: ${what} in Event Coins not paid (event boards not served yet)`); return; }
      fn();
    };
    if (!row) log(`[event] ${id}: no stage row, no reward`);
    if (row && before === undefined) {
      for (let i = 0; i < (row.validClearGetItem || 0); i++) {
        const type = row.clearGetItemType[i];
        pay(type, 'first-clear item', () => grantItem(type, row.clearGetItemId[i], row.clearGetItemNum[i]));
      }
    }
    const done = before || [];
    const fresh = [...new Set(cleared)].filter((n) => n >= 1 && n <= 3 && !done.includes(n)).sort((a, b) => a - b);
    for (const n of row ? fresh : []) pay(row.submissionRewardType?.[n - 1], `objective ${n}`, () => grantObjective(row, n));
    ev.cleared[id] = [...new Set([...done, ...fresh])].sort((a, b) => a - b);
    return true;
  }

  // The events of the player's Shop week (event-calendar.js): storyWeek() is {shopFrom, shopTo} of storyCtx() in server.js
  const currentEntries = (realMs = realNow()) => calendar.currentEntries(eventIndex(), storyWeek(), realMs);
  // Event Catalog (Task 5): player.events.kept = the census id of the kept event (one at a time, as the Raid Catalog), served only
  // while it is a past event of the Story (rowState 'kept'), with all its served quests: a short-window one on the real weekday of
  // its days, as the raids kept from the catalogue open on their real days
  const entryOf = (censusId) => entries().find((e) => e.censusId === censusId);
  function catalogCtx(realMs = realNow()) {
    const { shopFrom, shopTo } = storyWeek();
    return { shopFrom, shopTo, current: new Set(currentEntries(realMs).map((e) => e.censusId)), kept: view().kept || null };
  }
  function keptEntry(realMs = realNow()) {
    const c = catalogCtx(realMs), e = c.kept && entryOf(c.kept);
    return e && calendar.listable(e) && rowState(e, c) === 'kept' ? e : null;
  }
  // the kept event's open quests: its dates are past, so `days` (entry or quest) are read as real weekdays (Pacific)
  function keptQuests(e, realMs) {
    const wd = ptWeekday(realMs);
    const onDay = (ds) => !Array.isArray(ds) || !ds.length || ds.some((d) => weekdayOf(d) === wd);
    return onDay(e.days) ? (e.quests || []).filter((q) => q.served && onDay(q.days)) : [];
  }
  // POST /web/event/keep/<evStageId> and /web/event/unkeep (Task 5 buttons): {code, body {ok, why?}}. Only a past event with a
  // served quest can be kept (else why: now, other, later, removed); keeping one replaces the previous.
  function keep(evStageId) {
    const id = Number(evStageId), e = entries().find((x) => x.evStageId === id);
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

  // /stage/event category 2, after the raids: the kept event (its card with the KEPT tab), then one card per event of the week with
  // its open served quests. endTime: the end of the real day for a short-window event, else of the real week (as the raids).
  function events(realMs = realNow()) {
    const cleared = view().cleared || {};
    const stageOf = (q) => {
      const st = stageState(q.stageId);
      return { stageId: q.stageId, useAp: Number(q.ap) || 0, score: st.score, playStatus: st.playStatus, clearMissionIds: [...(cleared[q.stageId] || [])] };
    };
    const objectives = (id) => Math.min(3, (stageRow(id) || {}).validSubmission || 0);
    const card = (e, quests, kept = false) => {
      const stages = quests.map(stageOf);
      return {
        stages,
        eventStageId: e.evStageId,
        showIcon: 1,
        bannerUrl: `${webBase}/web/event/img/v${EVENT_IMG_VERSION}/${e.evStageId}${kept ? '-kept' : ''}.png`,
        eventType: EVENT_TYPE,
        status: 1,
        endTime: serverTimeAt(e.days ? clock.dayEnd(realMs) : clock.weekEnd(realMs)),
        newStageId: 0,
        isLock: 0,
        // crown (as the Special tab): every quest with its objectives 1..min(3, validSubmission) done
        complete: stages.length && stages.every((s) => special.stageDone(s, objectives(s.stageId))) ? 1 : 0,
      };
    };
    const kept = keptEntry(realMs), keptList = kept ? keptQuests(kept, realMs) : [];
    const week = storyWeek();
    return [...(keptList.length ? [card(kept, keptList, true)] : []), ...currentEntries(realMs).map((e) => card(e, calendar.openQuests(e, week, realMs)))];
  }

  return { events, onStageClear, isEventStage, keep, unkeep, catalogCtx };
}

module.exports = routesEvents;
module.exports.EVENT_IMG_VERSION = EVENT_IMG_VERSION;
