// Boosters the player owns (Events Part 6, Task 4; plan docs/superpowers/plans/2026-11-14-events-part6-boosters.md).
// State: player.boosters = [{emblemId, from, at, until}] (real ms; absent in older saves = none). `from` names what paid it:
// {stageId, objective[, slot]} (event quest objective / first-clear item), {board, cell} (Event or Raid Board cell); a source pays
// once, ever: a replay, a rerun sharing the stage row or a reopened board never grants again, not even after the expiry.
// - grant(emblemId, from): a built Booster (game_data/boosters.json byId) lasts spanDays from now (Builder's call 2: the span of
//   the original from the event start to the notice's expiry). The same Booster from another source renews it: one id in the list,
//   the later until (call 6; the client merges emblemIds without duplicates).
// - activeIds(realMs): the ids not expired, each once, sorted: the `emblemIds` of every response. The client never drops an
//   expired Booster by itself (docs/notes/events.md «Boosters: client behaviour»), so expiring is this list's job.
// - payPending(): the Boosters recorded before Part 6 (player.pendingBoosters [{emblemName, stageId, objective, slot?}]) are
//   granted at login with a full span from now (call 3), under the same `from` as the quest pays now; a name with no built row
//   stays pending.
// - list(userId): PUT /emblem/list (188): another player's profile gets an empty list.
'use strict';

const DAY = 86400000;
const keyOf = (from) => JSON.stringify(Object.keys(from || {}).sort().reduce((o, k) => ((o[k] = from[k]), o), {}));

function boosters({ player, index, realNow = Date.now, log = () => {} }) {
  const byId = (index && index.byId) || {};
  const byName = (index && index.byName) || {};
  const owned = () => (Array.isArray(player.boosters) ? player.boosters : []);

  function grant(emblemId, from) {
    const info = byId[emblemId];
    if (!info) return false;
    const k = keyOf(from);
    if (owned().some((b) => keyOf(b.from) === k)) return false;
    const at = realNow();
    const until = at + Math.max(1, Number(info.spanDays) || 1) * DAY;
    player.boosters = [...owned(), { emblemId: Number(emblemId), from, at, until }];
    log(`[booster] ${info.name} (${emblemId}) granted until ${new Date(until).toISOString()} from ${k}`);
    return true;
  }

  function untilOf(emblemId, realMs = realNow()) {
    const u = owned().filter((b) => b.emblemId === Number(emblemId)).reduce((m, b) => Math.max(m, b.until), 0);
    return u > realMs ? u : null;
  }

  function activeIds(realMs = realNow()) {
    return [...new Set(owned().filter((b) => b.until > realMs && byId[b.emblemId]).map((b) => b.emblemId))].sort((a, b) => a - b);
  }

  // {emblemId: until} of the active Boosters (the served emblem endTime)
  function activeUntil(realMs = realNow()) {
    const out = {};
    for (const id of activeIds(realMs)) out[id] = untilOf(id, realMs);
    return out;
  }

  function payPending() {
    const pend = Array.isArray(player.pendingBoosters) ? player.pendingBoosters : [];
    if (!pend.length) return 0;
    let paid = 0;
    const keep = [];
    for (const p of pend) {
      const ids = byName[p.emblemName] || [];
      if (!ids.length) { keep.push(p); continue; }
      const from = { stageId: p.stageId, objective: p.objective, ...(p.objective === 0 && p.slot !== undefined ? { slot: p.slot } : {}) };
      if (grant(ids[0], from)) paid++;
    }
    player.pendingBoosters = keep;
    return paid;
  }

  const list = (userId) => ({ emblemIds: Number(userId || 1) === 1 ? activeIds() : [] });

  return { grant, activeIds, activeUntil, untilOf, payPending, list };
}

module.exports = { boosters, keyOf, DAY };
