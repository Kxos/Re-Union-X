// Buff e stati iniziali dei nemici veri (I-207, 25-10). recon/tools/raw_master_old.py leggeva spostati i campi a
// 1076..1096 della riga vecchia (bufTurn, bufCount, statusAilments, statusAilmentsTurn/Count finivano nei buff
// Upright/Reversed, che la riga vecchia non ha): finti buff ATK Upright, durate perse, nemici che dormono svegli.
// enemy.json e' anche l'ingresso di make-game-tables.js, quindi le righe gia' presenti si riallineano qui ai valori
// della riga vera decodificata (enemy_dec.json). I cloni 526-979 (make-enemy-oltre.js) copiano la base dopo.
'use strict';

const KEYS = ['bufAttack', 'bufDefense', 'bufAttackPower', 'bufDefensePower', 'bufAttackSpeed', 'bufDefenseSpeed',
  'bufAttackMagic', 'bufDefenseMagic', 'bufAttackUpright', 'bufDefenseUpright', 'bufAttackReverse', 'bufDefenseReverse',
  'bufTurn', 'bufCount', 'statusAilments', 'statusAilmentsTurn', 'statusAilmentsCount'];

// rows: righe del master (modificate sul posto); real: righe di enemy_dec.json. -> numero di righe cambiate
function applyStartState(rows, real) {
  const byId = new Map((real || []).map((r) => [r.enemyId, r]));
  let changed = 0;
  for (const row of rows) {
    const r = byId.get(row.enemyId);
    if (!r) continue;
    let diff = false;
    for (const k of KEYS) {
      // campi assenti nella riga vecchia (buff Upright/Reversed): 0
      const v = k === 'statusAilments' ? [...(r[k] || [0, 0])] : (r[k] || 0);
      if (JSON.stringify(row[k]) !== JSON.stringify(v)) { row[k] = v; diff = true; }
    }
    if (diff) changed++;
  }
  return changed;
}

// cloni 526-979 di un master gia' generato (sources di enemy_oltre_sources.json): i campi della riga da cui sono nati
// (via, poi base, template per gli alleati), risolvendo prima la catena dei via. -> numero di righe cambiate
function propagateClones(rows, sources) {
  const byId = new Map(rows.map((r) => [r.enemyId, r]));
  const done = new Set();
  let changed = 0;
  const fix = (id) => {
    if (done.has(id)) return;
    done.add(id);
    const v = sources[id], row = byId.get(Number(id));
    const from = v && (v.via ?? v.base ?? v.template);
    if (!row || from == null || !byId.has(Number(from))) return;
    if (sources[from]) fix(String(from));
    const b = byId.get(Number(from));
    let diff = false;
    for (const k of KEYS) {
      if (JSON.stringify(row[k]) !== JSON.stringify(b[k])) { row[k] = JSON.parse(JSON.stringify(b[k])); diff = true; }
    }
    if (diff) changed++;
  };
  for (const id of Object.keys(sources)) fix(id);
  return changed;
}

module.exports = { applyStartState, propagateClones, KEYS };

if (require.main === module) {
  // master gia' generato, sul posto (poi revisione +1 e relogin.ps1):
  //   node server/enemy-start-state.js [cartella master] [enemy_dec.json] [enemy_oltre_sources.json]
  const fs = require('fs'); const path = require('path');
  const W = 'D:\\Progetto_Restauro_KH_UX';
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  const dec = process.argv[3] || path.join(process.env.KHUX_REAL_MASTER_DIR || path.join(W, 'external', 'thethiny'), 'enemy_dec.json');
  const srcPath = process.argv[4] || require('./make-enemy-oltre').SOURCES_PATH;
  const file = path.join(dir, 'enemy.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const real = applyStartState(rows, JSON.parse(fs.readFileSync(dec, 'utf8')));
  const clones = propagateClones(rows, JSON.parse(fs.readFileSync(srcPath, 'utf8')).sources);
  if (real || clones) fs.writeFileSync(file, JSON.stringify(rows));
  console.log(`enemy: buff/stati iniziali corretti su ${real} righe vere e ${clones} cloni in ${dir}`);
}
