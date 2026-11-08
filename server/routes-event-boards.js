// Event Coins and Event Boards (sphere type 4; Events Part 3, plan docs/superpowers/plans/2026-11-08-events-part3-coins.md
// Task 5; client side docs/notes/events.md «Event Boards spike»). game_data/events.json boardSets {[setKey]: {boardIds,
// chains {boardId: prevBoardId}, censusIds}} (make-events.js): the event quests of a set's feeder events pay Event Coins
// (reward type 15) into that set's balance, spent on that set's boards.
// Save (all absent in older saves: empty defaults, nothing written by a read):
//   player.eventCoins {[setKey]: n}            coin balance per set; never expires
//   player.eventSphere {[boardId]: {id, unlock[], getDatetime}}   board progress, kept for good (as player.raidSphere)
//   player.eventSphereSent [boardId]           the type-4 boards the client holds as far as the server knows
//   player.eventCoinFocus setKey | null        the set of the last event quest started
// Rules (controller rulings of 08-11):
// - a set is available while one of its feeder events is in the current story week or is the kept event (Event Catalog);
// - focus = the set of the last event quest started when available, else the newest set of the week, else the kept event's;
//   userPoint.stageSpherePoint (the one Event Coins field of the client) shows the focus balance;
// - only the focus set's boards are handed out; a chained board (chains, openId 5) only once the board before is complete:
//   the client enforces neither the chain nor the window (bench 08-11), so update() refuses anything not handed out;
// - a board id goes in a /user/sphere/check answer once per hand-out (the client pops «Unlocked an Event Board!» per entry):
//   a check whose checkTypes has 3 closes the boards no longer handed out (closeEventSphereBoardIds), GET /user/sphere
//   drops the closed ones from the list (a new board is still sent by the next check). Coins and progress stay; a cell is paid once, the completion reward (index 22) once.
'use strict';

const TYPE = 4;
const CELLS = 23;

function eventBoardRoutes({ player, events, master, grantSphereReward, now, nextUserSphereId, log = (...m) => console.log(...m) }) {
  const sets = () => ((events.index() || {}).boardSets) || {};
  const boardRow = (id) => master('sphere').find((r) => r.sphereBoardId === Number(id) && r.type === TYPE);
  // the boards of a set the master serves, in set order
  const boardsOf = (setKey) => ((sets()[setKey] || {}).boardIds || []).filter((id) => boardRow(id));
  const setOfBoard = (id) => Object.keys(sets()).find((k) => (sets()[k].boardIds || []).includes(Number(id))) || null;
  const prevOf = (id) => { const s = sets()[setOfBoard(id)]; const p = s && (s.chains || {})[id]; return p ? Number(p) : null; };
  const setOfCensus = (cid) => Object.keys(sets()).find((k) => (sets()[k].censusIds || []).includes(cid)) || null;
  const state = (id) => (player.eventSphere || {})[id];

  function nodesOf(board) {
    const arr = master('sphereArray').find((r) => r.arryId === board.arryId);
    const nodes = new Set();
    for (const k of ['spCol0', 'spCol1', 'spCol2', 'spCol3', 'spCol4']) for (const v of arr?.[k] || []) if (v >= 1 && v <= CELLS) nodes.add(v);
    return [...nodes].sort((a, b) => a - b);
  }
  const complete = (id) => { const b = boardRow(id), s = state(id); return !!(b && s && nodesOf(b).every((n) => s.unlock.includes(n))); };

  // {week: [setKey] (a feeder event listed in the current story week), kept: setKey | null (the kept event's)}
  function windows() {
    const current = new Set(events.currentCensusIds() || []), keptId = events.keptCensusId() || null;
    const week = Object.keys(sets()).filter((k) => boardsOf(k).length && (sets()[k].censusIds || []).some((c) => current.has(c)));
    const kept = keptId && setOfCensus(keptId);
    return { week, kept: kept && boardsOf(kept).length ? kept : null };
  }
  const newest = (keys) => [...keys].sort().pop() || null;
  function focusSet() {
    const w = windows(), avail = new Set([...w.week, ...(w.kept ? [w.kept] : [])]);
    const f = player.eventCoinFocus;
    if (f && avail.has(f)) return f;
    return newest(w.week) || w.kept;
  }
  const stagePoint = () => { const f = focusSet(); return (f && (player.eventCoins || {})[f]) || 0; };

  // Event Coins into a set's balance (an event quest of that set: objective, first-clear item, drop); false = not paid
  function addCoins(setKey, n) {
    n = Number(n) || 0;
    if (!n) return false;
    if (!setKey || !sets()[setKey]) { log(`[event boards] Event Coin x${n} not paid: no board set (${setKey || '-'})`); return false; }
    player.eventCoins ||= {};
    player.eventCoins[setKey] = (player.eventCoins[setKey] || 0) + n;
    return true;
  }

  // /stage/start of an event quest (its index entry): the focus moves to the entry's set
  function onStageStart(entry) {
    const k = entry && entry.boardSet;
    if (!k || !sets()[k]) return false;
    if (player.eventCoinFocus !== k) log(`[event boards] focus ${player.eventCoinFocus || '-'} -> ${k}`);
    player.eventCoinFocus = k;
    return true;
  }

  // the boards handed out now: the focus set's, a chained one only behind a complete board. Their state is made here (kept for good)
  function active() {
    const f = focusSet();
    if (!f) return [];
    const out = [];
    for (const id of boardsOf(f)) {
      const prev = prevOf(id);
      if (prev && !complete(prev)) continue;
      player.eventSphere ||= {};
      if (!player.eventSphere[id]) player.eventSphere[id] = { id: nextUserSphereId(), unlock: [], getDatetime: now() };
      out.push(id);
    }
    return out;
  }
  // every type-4 board the client may hold: those ever handed out (a state) or sent. Not every board of every set, unlike the
  // raids: the client can hold only what it was sent, and a fresh save closes nothing (test-raid-boards.js close_event_boards)
  const known = () => [...new Set([...(player.eventSphereSent || []).map(Number), ...Object.keys(player.eventSphere || {}).map(Number)])].sort((a, b) => a - b);

  // POST /user/sphere/check: {add: board ids to send, close: ids for closeEventSphereBoardIds}. checkTypes with 3 closes;
  // otherwise a check whose boardTypes has 4 (or none given) adds the boards handed out since the last answer, once each
  function check(body = {}) {
    const types = (body.checkTypes || []).map(Number), boards = Array.isArray(body.boardTypes) ? body.boardTypes.map(Number) : null;
    const act = active(), sent = new Set((player.eventSphereSent || []).map(Number));
    if (types.includes(3)) {
      const close = known().filter((id) => !act.includes(id));
      player.eventSphereSent = [...sent].filter((id) => act.includes(id));
      return { add: [], close };
    }
    if (boards && !boards.includes(TYPE)) return { add: [], close: [] };
    const add = act.filter((id) => !sent.has(id));
    player.eventSphereSent = [...sent, ...add];
    return { add, close: [] };
  }

  // GET /user/sphere: the boards handed out now. setSent true drops from eventSphereSent the boards no longer handed out; a board
  // handed out for the first time by the list is NOT marked as sent, so the next check still sends it once and the client pops
  // «Unlocked an Event Board!» (bench 08-11, Task 7b: the login GET came before the home check and the popup never showed).
  // 'merge' leaves eventSphereSent as it is
  function list({ setSent = false } = {}) {
    const act = active();
    if (setSent === true) player.eventSphereSent = (player.eventSphereSent || []).map(Number).filter((id) => act.includes(id));
    return act;
  }

  // POST /user/sphere/update on a type-4 board: {ok, why?, nodes, cost}. Refused (nothing changes) when the board is not handed
  // out (window, focus, chain), the node is not on the board or already open, or the set's balance is short
  function update(boardId, releaseMasuId, allOpen = false) {
    const id = Number(boardId), board = boardRow(id);
    if (!board) return { ok: false, why: 'not an event board', nodes: [], cost: 0 };
    const prev = prevOf(id);
    if (prev && !complete(prev)) return { ok: false, why: `chained behind ${prev}`, nodes: [], cost: 0 };
    if (!active().includes(id)) return { ok: false, why: 'not handed out', nodes: [], cost: 0 };
    const s = state(id), setKey = setOfBoard(id);
    const masu = master('sphereMasu').find((r) => r.masuId === board.masuId);
    const nodes = nodesOf(board);
    const todo = allOpen ? nodes.filter((n) => !s.unlock.includes(n)) : [Number(releaseMasuId)].filter((n) => nodes.includes(n) && !s.unlock.includes(n));
    const cost = todo.reduce((t, n) => t + ((masu && masu.spherePoint[n - 1]) || 0), 0);
    if (!masu || !todo.length) return { ok: false, why: 'node', nodes: todo, cost };
    const balance = (player.eventCoins || {})[setKey] || 0;
    if (cost > balance) return { ok: false, why: `coins ${balance} < ${cost}`, nodes: todo, cost };
    player.eventCoins ||= {};
    player.eventCoins[setKey] = balance - cost;
    const wasComplete = complete(id);
    for (const n of todo) { s.unlock.push(n); grantSphereReward(masu, n - 1); }
    if (!wasComplete && complete(id)) grantSphereReward(masu, CELLS - 1);
    return { ok: true, nodes: todo, cost, setKey };
  }

  return { focusSet, stagePoint, addCoins, check, update, onStageStart, list, active, known, setOfBoard, isEventBoard: (id) => !!boardRow(id) };
}

module.exports = eventBoardRoutes;
module.exports.TYPE = TYPE;
