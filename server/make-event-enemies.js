#!/usr/bin/env node
// Enemy rows of the event quests that our master lacks (Events Part 1, Task 2b, 6 Nov 2026).
//
// Author's rule (6 Nov): every missing enemy must be FOUND, never replaced by another enemy; a quest whose enemy is
// still missing is not served.
// GLOBAL SWITCH (controller ruling, 6 Nov): KHUX_EVENT_ENEMIES=1 lets event rows into the master; default OFF, so no event
// enemy row and no event attack row of any kind enters the master (the Task 7 bench turns it on). With the switch on,
// the per-family gate below still applies. The rows and the attacks they cite come from a PRIVATE file outside the
// repository (KHUX_EVENT_ENEMIES_FILE, default D:\Progetto_Restauro_KH_UX\private\events\enemies\event_enemies.json, built by the
// private research script of Task 2b from the donated WW tables: never copied into the repo):
//   {enemies: {"<enemyId>": {row, model: served|new|missing, approved, attacks[], source}}, attacks: {"<id>": row}}
// With the switch on, a row is added only when
//   - its model was found (model != missing) and the user approved it (approved: the served graphics are approved
//     already; a new model only after the user saw its rendered animations), and
//   - its displayId is drawn by the installed resources (names_v4 + enemy_gen, the `drawn` set of
//     make-game-tables.js): master and package go together (docs/notes/battaglia.md#nemici-jp).
// Rows of a previous run go away first (ids of the file: none of them is a row of the original master), so the
// patch is idempotent (the strip runs with the switch off too).
// Event rows never answer a name lookup of another generator: eventIds() / withoutEventRows() (the ids of the private
// file, else server/game_data/event_enemy_ids.json, written by make-enemy-oltre.js; Python:
// recon/tools/event_enemy_ids.py), used by make-story-oltre.js, make-special.js, make-proud.js, gen_story_maps.py and
// gen_tours_v2.py. Called by make-enemy-oltre.js addRows (from make-game-tables.js) after the graphics choice,
// before the attacks (enemy-attack-fix.js reads attackRows() as original attack rows) and the appearance effect.
//
//   node server/make-event-enemies.js --report      (what a regeneration with the switch on would add; writes nothing)
'use strict';

const fs = require('fs');
const path = require('path');

const EVENT_ENEMIES_PATH = process.env.KHUX_EVENT_ENEMIES_FILE
  || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\enemies\\event_enemies.json';

const ID_LIST_PATH = process.env.KHUX_EVENT_ENEMY_IDS || path.join(__dirname, 'game_data', 'event_enemy_ids.json');
const enabled = () => /^(1|on|true|yes)$/i.test(String(process.env.KHUX_EVENT_ENEMIES || '').trim());

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

// ids of the event rows (Set): the private file's, else the list written by writeIdList (no private file on this PC)
function eventIds(src = readEventEnemies(), listFile = ID_LIST_PATH) {
  if (src) return new Set(Object.keys(src.enemies).map(Number));
  if (listFile && fs.existsSync(listFile)) return new Set((JSON.parse(fs.readFileSync(listFile, 'utf8')).ids || []).map(Number));
  return new Set();
}

// the same ids for the other generators (ids only, not versioned: server/game_data is ignored by git)
function writeIdList(src, listFile = ID_LIST_PATH) {
  if (!src || !listFile) return;
  fs.mkdirSync(path.dirname(listFile), { recursive: true });
  fs.writeFileSync(listFile, JSON.stringify({ _doc: 'event quest enemy ids (make-event-enemies.js): never a name-lookup answer',
    ids: [...eventIds(src)].sort((a, b) => a - b) }));
}

// rows without the event rows, for every name -> id lookup
function withoutEventRows(rows, ids = eventIds()) {
  return (rows || []).filter((e) => !ids.has(e.enemyId));
}

// Event families without a model of their own whose rows show another SERVED model of the same creature (user
// decisions only): 185 Enraged Elk (gem quests) has only a dead animation anywhere, identical to the served 184; the user
// decided (07-11, Events Part 2) that its rows show the story model 184 (the reference footage, story quest 475, is 184).
// Declared in the Notices. The private source row keeps its donor displayId; the master row gets the shown one.
const DISPLAY_AS = Object.freeze({ 185: 184 });

// -> {on, added: [ids], missing: [ids], unapproved: [ids], notDrawn: [ids], stripped}
function addRows(enemies, src, drawn, on = enabled()) {
  const rep = { on, added: [], missing: [], unapproved: [], notDrawn: [], stripped: strip(enemies, src) };
  if (!src || !on) return rep;
  for (const [k, v] of Object.entries(src.enemies)) {
    const id = Number(k);
    if (!v.row || v.row.enemyId !== id) throw new Error(`event-enemies: row ${k} without its enemyId`);
    if (v.model === 'missing') { rep.missing.push(id); continue; }
    if (!v.approved) { rep.unapproved.push(id); continue; }
    const shown = DISPLAY_AS[v.row.displayId] ?? v.row.displayId;
    if (!drawn || !drawn.has(shown)) { rep.notDrawn.push(id); continue; }
    enemies.push(Object.assign(JSON.parse(JSON.stringify(v.row)), { displayId: shown }));
    rep.added.push(id);
  }
  return rep;
}

// original attack rows cited by the event enemies (for enemy-attack-fix.js applyEnemyAttacks)
function attackRows(src = readEventEnemies(), on = enabled()) {
  return on && src && src.attacks ? Object.values(src.attacks) : [];
}

function summary(rep) {
  if (!rep.on) return `event-enemies: switch off (KHUX_EVENT_ENEMIES), no event row added (${rep.stripped} stripped)`;
  return `event-enemies: +${rep.added.length} rows; not found ${rep.missing.length}, model awaiting approval `
    + `${rep.unapproved.length}, graphic not in the resources ${rep.notDrawn.length}`
    + (rep.unapproved.length ? ` (${rep.unapproved.join(', ')})` : '');
}

module.exports = { EVENT_ENEMIES_PATH, ID_LIST_PATH, DISPLAY_AS, enabled, readEventEnemies, eventIds, writeIdList, withoutEventRows, strip,
  addRows, attackRows, summary };

if (require.main === module && process.argv[2] === '--report') {
  const { drawnDisplays } = require('./make-enemy-oltre');
  const src = readEventEnemies();
  if (!src) { console.log(`event-enemies: ${EVENT_ENEMIES_PATH} absent, nothing to add`); process.exit(0); }
  const rep = addRows([], src, drawnDisplays(), true);
  console.log(`switch KHUX_EVENT_ENEMIES is ${enabled() ? 'ON' : 'OFF (nothing enters the master)'}; with it on:`);
  console.log(summary(rep));
  console.log(JSON.stringify(rep));
}
