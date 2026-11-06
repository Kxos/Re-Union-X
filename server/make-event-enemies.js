#!/usr/bin/env node
// Enemy rows of the event quests that our master lacks (Events Part 1, Task 2b, 6 Nov 2026).
//
// Author's rule (6 Nov): every missing enemy must be FOUND, never replaced by another enemy; a quest whose enemy is
// still missing is not served. The rows and the attacks they cite come from a PRIVATE file outside the repository
// (KHUX_EVENT_ENEMIES, default D:\Progetto_Restauro_KH_UX\private\events\enemies\event_enemies.json, built by the
// private research script of Task 2b from the donated WW tables: never copied into the repo):
//   {enemies: {"<enemyId>": {row, model: served|new|missing, approved, attacks[], source}}, attacks: {"<id>": row}}
// A row is added only when
//   - its model was found (model != missing) and the user approved it (approved: the served graphics are approved
//     already; a new model only after the user saw its rendered animations), and
//   - its displayId is drawn by the installed resources (names_v4 + enemy_gen, the `drawn` set of
//     make-game-tables.js): master and package go together (docs/notes/battaglia.md#nemici-jp).
// Rows of a previous run go away first (ids of the file: none of them is a row of the original master), so the
// patch is idempotent. Called by make-enemy-oltre.js addRows (from make-game-tables.js) after the graphics choice,
// before the attacks (enemy-attack-fix.js reads attackRows() as original attack rows) and the appearance effect.
//
//   node server/make-event-enemies.js --report      (what a regeneration would add; writes nothing)
'use strict';

const fs = require('fs');
const path = require('path');

const EVENT_ENEMIES_PATH = process.env.KHUX_EVENT_ENEMIES
  || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\enemies\\event_enemies.json';

function readEventEnemies(file = EVENT_ENEMIES_PATH) {
  if (!file || !fs.existsSync(file)) return null;
  const src = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!src || typeof src.enemies !== 'object') throw new Error(`event-enemies: ${file} has no «enemies»`);
  return src;
}

function strip(enemies, src) {
  if (!src) return 0;
  const ids = new Set(Object.keys(src.enemies).map(Number));
  const kept = enemies.filter((e) => !ids.has(e.enemyId));
  const n = enemies.length - kept.length;
  enemies.splice(0, enemies.length, ...kept);
  return n;
}

// -> {added: [ids], missing: [ids], unapproved: [ids], notDrawn: [ids], stripped}
function addRows(enemies, src, drawn) {
  const rep = { added: [], missing: [], unapproved: [], notDrawn: [], stripped: strip(enemies, src) };
  if (!src) return rep;
  for (const [k, v] of Object.entries(src.enemies)) {
    const id = Number(k);
    if (!v.row || v.row.enemyId !== id) throw new Error(`event-enemies: row ${k} without its enemyId`);
    if (v.model === 'missing') { rep.missing.push(id); continue; }
    if (!v.approved) { rep.unapproved.push(id); continue; }
    if (!drawn || !drawn.has(v.row.displayId)) { rep.notDrawn.push(id); continue; }
    enemies.push(JSON.parse(JSON.stringify(v.row)));
    rep.added.push(id);
  }
  return rep;
}

// original attack rows cited by the event enemies (for enemy-attack-fix.js applyEnemyAttacks)
function attackRows(src = readEventEnemies()) {
  return src && src.attacks ? Object.values(src.attacks) : [];
}

function summary(rep) {
  return `event-enemies: +${rep.added.length} rows; not found ${rep.missing.length}, model awaiting approval `
    + `${rep.unapproved.length}, graphic not in the resources ${rep.notDrawn.length}`
    + (rep.unapproved.length ? ` (${rep.unapproved.join(', ')})` : '');
}

module.exports = { EVENT_ENEMIES_PATH, readEventEnemies, strip, addRows, attackRows, summary };

if (require.main === module && process.argv[2] === '--report') {
  const { drawnDisplays } = require('./make-enemy-oltre');
  const src = readEventEnemies();
  if (!src) { console.log(`event-enemies: ${EVENT_ENEMIES_PATH} absent, nothing to add`); process.exit(0); }
  const rep = addRows([], src, drawnDisplays());
  console.log(summary(rep));
  console.log(JSON.stringify(rep));
}
