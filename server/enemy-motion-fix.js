#!/usr/bin/env node
// Original moves of the enemy rows our generators copied from another creature, and a safety net for special-attack
// moves whose model has no atkSp (I-261, user 11-11).
//
// enemyAttack.attackMotion 2 plays lwf/character/enemy/<displayId>/atkSp/. Without that folder the client shows `wait`
// in a normal fight (docs/notes/battaglia.md#nemici-jp), but the first strike of a CAUTION ambush (map team kind 2)
// does not fire at all (Lexaeus VII Shadow, bench 11-11). The wrong moves were ours:
//  - guest allies 2001-2024 (make-enemy-oltre.js, I-199) copy the moves of their template 2001 Hercules (200101);
//  - family clones of make-enemy-oltre.js (story 526-979) copy the whole row of their base (Cerberus 112: 11201).
// 1. applyOriginalMoves: the rows of the PRIVATE file (KHUX_ORIGINAL_MOVES, default
//    D:\Progetto_Restauro_KH_UX\private\events\enemies\original_moves.json, built locally from donated material, never
//    copied into the repo) get back their original skills and countdown attacks (HP, attack and the rest stay); the
//    attack rows it cites are original rows for enemy-attack-fix.js. Without the file nothing changes.
// 2. applyMotionFix (safety net): every motion-2 move left on a model without atkSp becomes a copy of the same attack
//    with attackMotion 1 (same power and effects, only the animation), id PLAIN_BASE + original id. The original attack
//    row is never changed: other enemies with atkSp use it.
// make-game-tables.js applies 1 after the enemy rows are complete and before the attacks, 2 after the attacks.
// Alone (1, and 2 only with KHUX_ENEMY_PLAIN_SP=1, on server/master_data in place; idempotent; then revision +1 and relogin.ps1):
//   node server/enemy-motion-fix.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

const MOVE_KEYS = ['validSkill', 'skillId', 'skillRequire', 'skillRequireArg', 'skillOdds',
  'validUrgency', 'urgency', 'urgencyValue', 'urgencyFrequency', 'urgencySkillId'];
const ORIGINAL_MOVES_PATH = process.env.KHUX_ORIGINAL_MOVES
  || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\enemies\\original_moves.json';
const PLAIN_BASE = 2100000000;
const INT32_MAX = 2147483647;
const plainId = (id) => {
  if (PLAIN_BASE + id > INT32_MAX) throw new Error(`enemy-motion-fix: attack ${id} has no room for its plain copy`);
  return PLAIN_BASE + id;
};

const NAMES = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
const ENEMY_GEN = process.env.KHUX_NO_ENEMY_GEN ? null
  : path.join(process.env.KHUX_ENEMY_GEN || 'D:\\Progetto_Restauro_KH_UX\\enemy_gen\\files', 'lwf', 'character', 'enemy');

// {enemies: {"<id>": {MOVE_KEYS}}, attacks: {"<id>": row}} or null
function readOriginalMoves(file = ORIGINAL_MOVES_PATH) {
  if (!file || !fs.existsSync(file)) return null;
  const src = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!src || typeof src.enemies !== 'object') throw new Error(`enemy-motion-fix: ${file} has no «enemies»`);
  return src;
}
const attackRows = (src) => (src && src.attacks ? Object.values(src.attacks) : []);

// -> [enemyId] restored (only rows present in the master)
function applyOriginalMoves(enemies, src) {
  const done = [];
  if (!src) return done;
  const byId = new Map(enemies.map((e) => [e.enemyId, e]));
  for (const [k, m] of Object.entries(src.enemies)) {
    const e = byId.get(Number(k));
    if (!e) continue;
    for (const key of MOVE_KEYS) if (key in m) e[key] = JSON.parse(JSON.stringify(m[key]));
    done.push(e.enemyId);
  }
  return done;
}

const ORIGINALS_TSV = path.join(__dirname, '..', 'recon', 'tools', 'originals.tsv');

// served animation folders of the enemy models: Set of "<displayId>/<anim>" from the resource names, the originals
// list (import_originals.py, e.g. section 52 Ephemer & Skuld atkSp/atk3_o) and the enemy_gen package
function servedAnims(namesFile = NAMES, genDir = ENEMY_GEN, tsv = ORIGINALS_TSV) {
  const out = new Set();
  for (const f of [namesFile, tsv]) {
    if (!f || !fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^lwf\/character\/enemy\/(\d+)\/(\w+)\//gm)) out.add(`${Number(m[1])}/${m[2]}`);
  }
  if (genDir && fs.existsSync(genDir)) {
    for (const n of fs.readdirSync(genDir)) {
      if (!/^\d+$/.test(n)) continue;
      for (const a of fs.readdirSync(path.join(genDir, n))) {
        if (fs.existsSync(path.join(genDir, n, a, `${a}.lwf`))) out.add(`${Number(n)}/${a}`);
      }
    }
  }
  return out;
}

// displayIds with a served atkSp
function atkSpModels(namesFile = NAMES, genDir = ENEMY_GEN, tsv = ORIGINALS_TSV) {
  const out = new Set();
  for (const k of servedAnims(namesFile, genDir, tsv)) if (k.endsWith('/atkSp')) out.add(Number(k.split('/')[0]));
  return out;
}

// attack ids of the private file with attackMotion >= 3 whose atk<N>_o is served for EVERY master enemy citing them
// (enemy-attack-fix.js keeps their motion; any other motion >= 3 falls back to 1, a missing atk<N>_o crashes)
function motionOkAttacks(enemies, src, anims = servedAnims()) {
  const ok = new Set();
  for (const a of attackRows(src)) {
    if (!(a.attackMotion >= 3)) continue;
    const users = enemies.filter((e) => movesOf(e).includes(a.enemyAttackId));
    if (users.length && users.every((e) => anims.has(`${e.displayId}/atk${a.attackMotion}_o`))) ok.add(a.enemyAttackId);
  }
  return ok;
}

const movesOf = (e) => [...(e.skillId || []), ...(e.urgencySkillId || [])];

// enemies, atts: master tables (changed in place); atkSp: Set of displayIds with atkSp. -> {plain: [enemyId], added: [attackId]}
function applyMotionFix(enemies, atts, atkSp) {
  const rep = { plain: [], added: [] };
  const att = new Map(atts.map((a) => [a.enemyAttackId, a]));
  const special = (id) => id && att.get(id) && att.get(id).attackMotion === 2;
  for (const e of enemies) {
    if (atkSp.has(e.displayId) || !movesOf(e).some(special)) continue;
    for (const k of ['skillId', 'urgencySkillId']) {
      if (!Array.isArray(e[k])) continue;
      e[k] = e[k].map((id) => {
        if (!special(id)) return id;
        const p = plainId(id);
        if (!att.has(p)) {
          const row = Object.assign(JSON.parse(JSON.stringify(att.get(id))), { enemyAttackId: p, attackMotion: 1 });
          atts.push(row);
          att.set(p, row);
          rep.added.push(p);
        }
        return p;
      });
    }
    rep.plain.push(e.enemyId);
  }
  return rep;
}

// rows still asking for an animation their model lacks (for the tests): [enemyId]
function missingMotions(enemies, atts, atkSp) {
  const att = new Map(atts.map((a) => [a.enemyAttackId, a]));
  return enemies.filter((e) => !atkSp.has(e.displayId)
    && movesOf(e).some((id) => id && att.get(id) && att.get(id).attackMotion === 2)).map((e) => e.enemyId);
}

const summary = (restored, rep) => `enemy-motion-fix: original moves ${restored.length} rows; plain copies `
  + `${rep.plain.length} rows (${rep.plain.join(', ')}), +${rep.added.length} attacks`;

module.exports = { MOVE_KEYS, ORIGINAL_MOVES_PATH, PLAIN_BASE, plainId, readOriginalMoves, attackRows, applyOriginalMoves,
  servedAnims, atkSpModels, motionOkAttacks, applyMotionFix, missingMotions, summary };

if (require.main === module) {
  const fix = require('./enemy-attack-fix');
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  const ep = path.join(dir, 'enemy.json'), ap = path.join(dir, 'enemyAttack.json');
  const enemies = JSON.parse(fs.readFileSync(ep, 'utf8'));
  const atts = JSON.parse(fs.readFileSync(ap, 'utf8'));
  const src = readOriginalMoves();
  const restored = applyOriginalMoves(enemies, src);
  fix.addMissing(atts, enemies);
  fix.applyEnemyAttacks(atts, fix.readOrig(undefined, [...require('./make-event-enemies').attackRows(), ...attackRows(src)]),
    undefined, motionOkAttacks(enemies, src));
  // the safety net only on request, as in make-game-tables.js (KHUX_ENEMY_PLAIN_SP=1; 13-11: run alone it plain-copied 333 rows)
  const plainOn = /^(1|on|true|yes)$/i.test(String(process.env.KHUX_ENEMY_PLAIN_SP || ''));
  const rep = plainOn ? applyMotionFix(enemies, atts, atkSpModels()) : { plain: [], added: [] };
  fs.writeFileSync(ep, JSON.stringify(enemies));
  fs.writeFileSync(ap, JSON.stringify(atts));
  console.log(summary(restored, rep));
}
