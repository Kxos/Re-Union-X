// Boosters (Events Part 6, Task 3; plan docs/superpowers/plans/2026-11-14-events-part6-boosters.md): the rows of the master
// `emblem` and the medal Booster-group codes, from the private Booster records (tmp\events\boosters\build_boosters.py ->
// boosters.json, never in the repo: donor names and descriptions).
// - Row: the 16 fields the 4.3.1 client reads, in its order (docs/notes/events.md «Boosters: client behaviour»), effect fields
//   from the record (`effect.fields`, rebuilt from the description). endTime here is a far date: the served endTime is the
//   player's own (servedRows, from player.boosters, in fake time like the mission endDate). An unbuilt record has no row.
// - Group Boosters: the client covers a medal when the Booster's `source` is among the medal's `source[0..validSource-1]`; our
//   medal rows only carry the series code, so the donor codes (records.medalGroups {code: [medalId]}, matched by name in the
//   builder; user 14-11) are appended after the first entry, up to the 3 slots of the field.
// - game_data/boosters.json: {byId: {emblemId: {name, spanDays, labels, expiry, start}}, byName: {name: [emblemId]}} for the
//   server (boosters.js, make-events.js, event-boards.js, raid-boards.js).
// Run by make-game-tables.js (patch); KHUX_BOOSTERS = the records file (default the private path below).
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT = 'D:\\Progetto_Restauro_KH_UX\\tmp\\events\\boosters\\boosters.json';
const FAR = '2099-12-31 23:59:59';
const FIELDS = ['category', 'attribute', 'source', 'keybladeCategory', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'upperParam'];

function rowOf(b) {
  const f = b.effect.fields;
  const row = { emblemId: b.emblemId, imageId: b.imageId, sortId: b.sortId, name: b.name, description: b.description };
  for (const k of FIELDS) row[k] = Number(f[k]) || 0;
  row.endTime = FAR;
  return row;
}

// records {boosters, unbuilt} -> {rows, index}
function makeEmblems(records) {
  const list = ((records && records.boosters) || []).filter((b) => b && b.effect && b.effect.fields);
  const rows = list.map(rowOf).sort((a, b) => a.sortId - b.sortId || a.emblemId - b.emblemId);
  const index = { byId: {}, byName: {} };
  for (const b of list) {
    index.byId[b.emblemId] = { name: b.name, spanDays: b.spanDays, labels: b.labels || [], expiry: b.expiry, start: b.start };
    (index.byName[b.name] = index.byName[b.name] || []).push(b.emblemId);
  }
  for (const k of Object.keys(index.byName)) index.byName[k].sort((a, b) => a - b);
  return { rows, index };
}

// medal rows + {code: [medalId]} -> number of rows changed (idempotent: a code already there is not added again)
function addGroupCodes(medals, groups) {
  const by = new Map();
  for (const [code, ids] of Object.entries(groups || {})) for (const id of ids) (by.get(id) || by.set(id, []).get(id)).push(Number(code));
  let changed = 0;
  for (const m of medals) {
    const codes = by.get(m.medalId);
    if (!codes) continue;
    const src = (m.source || []).slice(0, 3);
    while (src.length < 3) src.push(0);
    let n = Math.max(1, m.validSource || 0);
    let did = false;
    for (const c of codes) {
      if (src.slice(0, n).includes(c) || n >= 3) continue;
      src[n++] = c; did = true;
    }
    if (did) { m.source = src; m.validSource = n; changed++; }
  }
  return changed;
}

// served emblem rows (fake time): an owned Booster gets the player's own endTime (owned {emblemId: untilMs}); a Booster not
// owned yet gets the session start + its span (spanDays(id)), so one obtained during the session shows about its real expiry
// at once (the master is read at login: the exact date comes with the next login); no span: the far date
function servedRows(rows, owned, fakeString, sessionMs = null, spanDays = () => 0) {
  return rows.map((r) => {
    if (owned && owned[r.emblemId]) return { ...r, endTime: fakeString(owned[r.emblemId]) };
    const d = sessionMs !== null ? Number(spanDays(r.emblemId)) || 0 : 0;
    return d > 0 ? { ...r, endTime: fakeString(sessionMs + d * 86400000) } : r;
  });
}

function patch(masterDir, file = process.env.KHUX_BOOSTERS || DEFAULT, gameData = path.join(__dirname, 'game_data')) {
  if (!fs.existsSync(file)) { console.log(`emblems: ${file} not found: emblem table left empty`); return null; }
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { rows, index } = makeEmblems(records);
  fs.writeFileSync(path.join(masterDir, 'emblem.json'), JSON.stringify(rows));
  fs.writeFileSync(path.join(gameData, 'boosters.json'), JSON.stringify(index));
  const medalFile = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8'));
  const changed = addGroupCodes(medals, records.medalGroups);
  if (changed) fs.writeFileSync(medalFile, JSON.stringify(medals));
  const r = { rows: rows.length, unbuilt: (records.unbuilt || []).length, medalsWithGroupCodes: changed };
  console.log('emblems:', JSON.stringify(r));
  return r;
}

module.exports = { makeEmblems, addGroupCodes, servedRows, rowOf, patch, FAR, FIELDS };
