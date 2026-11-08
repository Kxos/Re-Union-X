// Event Boards: master rows sphere / sphereArray / sphereMasu of type 4 (paid in Event Coins), built on raid-boards.js (events
// Part 3, Task 3). Input: the board sets of the private donor study (a set = a month/week of boards:
// {setKey, boards: [{donorId, name, openId, openParam, kindId, grid: {spCol0..4}, cells: [{idx, cost, rewardSelect, rewardId, num,
// name}], completion: {rewardSelect, rewardId, num, name}}]}); the file stays private, the tests use a hand-made fixture.
// - Layout from the data (an unmatched node stays on the path as a pass-through: cost 0, no reward; a board with no matched cell is skipped): the board's own grid (an event board is not a 22-node raid snake) and the masu index = the cell's idx
//   (completion = index 22). 
// - Ids: ids.boards {"<setKey>/<donorBoardId>": n}, sphereBoardId = arryId = masuId = 4000000 + n, append-only (event_ids.json).
// - Rewards: donor medal ids that differ from ours are mapped by name + rarity against our master (exactly one candidate; none
//   or several -> unmatched); other items are kept by id when our master has the row; Boosters (rewardSelect 34) stay unmatched
//   until the Boosters exist (Part 6). A board whose completion is unmatched is not emitted (report.skipped), and neither is a
//   board chained (openId 5) behind a skipped one.
// - openId 5 (opens when the previous board is completed): openParam is remapped to our id of that board; `chains` lists them
//   (the server enforces the chain, the client does not).
'use strict';
const rb = require('./raid-boards');

const TYPE = 4, ID_BASE = 4000000, ID_MAX = 4999999, BACKGROUND = 4;
const EV_START = '2015-01-01 08:00:00';
const GRID_KEYS = ['spCol4', 'spCol3', 'spCol2', 'spCol1', 'spCol0'];

const rareOf = (name) => { const m = /^(\d+)\s*★\s*(.+)$/.exec(String(name || '').trim()); return m ? { rare: m[1], name: m[2] } : null; };

// {sel, id, value} or {why}; ix: itemIndex(master) plus id sets
function matchDonor(ix, c) {
  const sel = c.rewardSelect, value = c.num || 1;
  if (sel === 34) return { why: 'Booster: not implemented yet (Part 6)' };
  if (sel === 2) return { sel, id: 0, value };
  if (sel === 3) {
    const n = rareOf(c.name);
    if (!n) return { why: 'medal name without rarity' };
    const hits = ix.idx.medal.get(`${n.rare}|${rb.norm(n.name)}`) || [];
    if (hits.length === 1) return { sel, id: hits[0].medalId, value };
    if (hits.length > 1) return { why: `${hits.length} medals of that name and rarity` };
    return { why: 'no medal of that name and rarity' };
  }
  if (sel === 5) return ix.material.has(c.rewardId) ? { sel, id: c.rewardId, value } : { why: 'no material with that id' };
  if (sel === 7) return ix.title.has(c.rewardId) ? { sel, id: c.rewardId, value: 1 } : { why: 'no title with that id' };
  if (sel === 19 || sel === 20 || sel === 23) return ix.avatar.has(c.rewardId) ? { sel, id: c.rewardId, value: 1 } : { why: 'no avatar part with that id' };
  if (sel === 33) return ix.pet.has(c.rewardId) ? { sel, id: c.rewardId, value: 1 } : { why: 'no Spirit part with that id' };
  if (sel === 41) {
    const t = rb.TICKETS[rb.norm(String(c.name || '').replace(/\s*[x×]\s*\d+\s*$/i, ''))];
    return t === undefined ? { why: 'unknown ticket currency' } : { sel, id: t, value };
  }
  return { why: `no item type for rewardSelect ${sel}` };
}

function allocate(sets, ids) {
  const boards = { ...((ids || {}).boards || {}) };
  const seen = new Map();
  for (const [k, v] of Object.entries(boards)) {
    if (!Number.isInteger(v) || v < 1 || v > ID_MAX - ID_BASE) throw new Error(`events: event_ids.json: board ${k} has number ${v}, outside 1-${ID_MAX - ID_BASE}`);
    if (seen.has(v)) throw new Error(`events: event_ids.json: board number ${v} repeats (${seen.get(v)}, ${k})`);
    seen.set(v, k);
  }
  let next = Math.max(0, ...Object.values(boards)) + 1;
  for (const s of sets) for (const b of s.boards || []) { const k = `${s.setKey}/${b.donorId}`; if (!(k in boards)) boards[k] = next++; }
  return boards;
}

// -> {sphereRows, arrayRows, masuRows, art, bySet, chains, ids: {boards}, report: {unmatched, skipped}}
function buildEventBoards({ sets, master, ids }) {
  const boards = allocate(sets, ids);
  const idx = rb.itemIndex(master);
  const ix = { idx, material: new Set((master.material || []).map((r) => r.materialId)), title: new Set((master.title || []).map((r) => r.titleId)),
    avatar: new Set((master.avatarParts || []).map((r) => r.avatarPartsId)), pet: new Set((master.petParts || []).map((r) => r.petPartsId)) };
  const out = { sphereRows: [], arrayRows: [], masuRows: [], art: [], bySet: {}, chains: {}, ids: { ...(ids || {}), boards }, report: { unmatched: [], skipped: [] } };
  for (const s of sets) {
    const idOf = (donor) => ID_BASE + boards[`${s.setKey}/${donor}`];
    const state = new Map(); // donorId -> {b, cells, done} | {skip}
    for (const b of s.boards || []) {
      const cells = [];
      const nodes = new Set(GRID_KEYS.flatMap((k) => b.grid[k]).filter((v) => v > 0 && v < 1000));
      for (const c of b.cells || []) {
        // idx = masu index (node value - 1): it must be a node of the grid and not the completion slot
        const m = Number.isInteger(c.idx) && c.idx >= 0 && c.idx < rb.COMPLETION && nodes.has(c.idx + 1) ? matchDonor(ix, c) : { why: 'bad index' };
        if (m.why) out.report.unmatched.push({ setKey: s.setKey, board: b.donorId, idx: c.idx, rewardSelect: c.rewardSelect, rewardId: c.rewardId, name: c.name, why: m.why });
        else cells.push({ ...c, item: m });
      }
      const done = matchDonor(ix, b.completion || {});
      if (done.why) { state.set(b.donorId, { skip: `completion ${b.completion && b.completion.name}: ${done.why}` }); continue; }
      if (!cells.length) { state.set(b.donorId, { skip: 'no matched cells' }); continue; }
      state.set(b.donorId, { b, cells, done });
    }
    // a chained board is only reachable through the previous one
    for (let again = true; again;) {
      again = false;
      for (const [id, st] of state) {
        if (st.skip || st.b.openId !== 5) continue;
        const prev = state.get(st.b.openParam);
        if (!prev) { state.set(id, { skip: `chained behind ${st.b.openParam}, which is not in the set` }); again = true; }
        else if (prev.skip) { state.set(id, { skip: `chained behind ${st.b.openParam}, which is skipped` }); again = true; }
      }
    }
    const list = [];
    for (const [donorId, st] of state) {
      if (st.skip) { out.report.skipped.push({ setKey: s.setKey, board: donorId, why: st.skip }); continue; }
      const { b } = st, id = idOf(donorId);
      const chained = b.openId === 5;
      if (chained) out.chains[id] = idOf(b.openParam);
      out.sphereRows.push({ sphereBoardId: id, boardName: String(b.name).slice(0, 128), kindId: b.kindId || 0, boardId: BACKGROUND, arryId: id, masuId: id, type: TYPE,
        openId: b.openId, openParam: chained ? idOf(b.openParam) : b.openParam || 0, price: 0, detailUrl: '', startDatetime: EV_START, endDatetime: rb.END });
      out.arrayRows.push({ arryId: id, ...Object.fromEntries(GRID_KEYS.map((k) => [k, [...b.grid[k]]])) });
      const masu = { masuId: id, sphereBoardId: id };
      for (const key of rb.MASU_KEYS) masu[key] = Array(rb.MASU).fill(0);
      for (const c of st.cells) {
        masu.spherePoint[c.idx] = rb.num(c.cost);
        masu.rewardSelect[c.idx] = c.item.sel;
        masu.rewardId[c.idx] = c.item.id;
        masu.rewardValue[c.idx] = c.item.value;
      }
      masu.rewardSelect[rb.COMPLETION] = st.done.sel;
      masu.rewardId[rb.COMPLETION] = st.done.id;
      masu.rewardValue[rb.COMPLETION] = st.done.value || 1;
      out.masuRows.push(masu);
      list.push(id);
    }
    out.bySet[s.setKey] = list;
  }
  return out;
}

module.exports = { buildEventBoards, matchDonor, TYPE, ID_BASE, ID_MAX };
