// Attacchi originali dei nemici (enemyAttack): potenza, bersagli, buff, cure, stati alterati.
//
// Il master WW 5.0.1 ha solo 13 righe enemyAttack; make-game-tables.js copia le altre (276) da tre attacchi
// generici (1 «Attack», 101 «Moderate Attack», 601 «Powerful Attack»), quindi nessun nemico avvelenava,
// addormentava o paralizzava (Poison Apple, «High Chance of Poison») e Esuna dello Spirit non poteva scattare
// (banco 20-10). Le righe originali sono nei dati di thethiny (enemyAttack.json, 289/289 id del nostro master;
// le 13 righe WW coincidono campo per campo). Si copiano i campi che hanno, tranne due che caricano risorse:
//  - hitEffect: lwf/character/enemy/hit_effect_fla/eff_N/ solo se servita (names_v4 o originals.tsv), altrimenti
//    resta quello di oggi;
//  - attackMotion: 1 (atk1_o) o 2 (atkSp, che senza file ricade su wait); atk3_o e oltre senza file = crash
// (docs/notes/battaglia.md#nemici-jp), quindi resta 1.
// I campi che i dati di thethiny non hanno (riflessi, upright/reverse, spEffect...) restano quelli del master.
//
// make-game-tables.js la applica prima di scrivere; da sola corregge server/master_data sul posto
// (idempotente; poi revisione +1 e relogin.ps1):
//   node server/enemy-attack-fix.js [cartella master]
'use strict';
const fs = require('fs');
const path = require('path');

const ORIG = process.env.KHUX_ORIG_ENEMY_ATTACK || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\enemyAttack.json';
const NAMES = process.env.KHUX_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
const TSV = path.join(__dirname, '..', 'recon', 'tools', 'originals.tsv');

// effetti di colpo serviti (WW o importati)
function servedHitEffects(files = [NAMES, TSV]) {
  const out = new Set();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/lwf\/character\/enemy\/hit_effect_fla\/eff_(\d+)\//g)) out.add(Number(m[1]));
  }
  return out;
}

function applyEnemyAttacks(atts, origRows, served = servedHitEffects()) {
  const stats = { patched: 0, same: 0, hitKept: 0, motionKept: 0 };
  const orig = new Map(origRows.map((r) => [r.enemyAttackId, r]));
  for (const a of atts) {
    const o = orig.get(a.enemyAttackId);
    if (!o) continue;
    const want = { ...o };
    if (!served.has(o.hitEffect)) { want.hitEffect = a.hitEffect; stats.hitKept++; }
    if (![1, 2].includes(o.attackMotion)) { want.attackMotion = 1; stats.motionKept++; }
    if (Object.keys(want).every((k) => JSON.stringify(a[k]) === JSON.stringify(want[k]))) stats.same++;
    else { Object.assign(a, want); stats.patched++; }
  }
  return stats;
}

// righe mancanti citate dai nemici: la 5.0.1 ne ha 13, i nemici veri ne citano centinaia. Copia di un attacco vero
// per posizione (prima abilita' «Attack» 1, seconda «Moderate Attack» 101, le altre «Powerful Attack» 601; i nemici
// con 3 abilita' andavano in crash all'avvio della missione) e per i contrattacchi (urgencySkillId, I-207: 1501001 del
// Gold Tricholoma mancava) 601; poi applyEnemyAttacks mette i valori originali. -> righe aggiunte
function addMissing(atts, enemies) {
  const have = new Set(atts.map((a) => a.enemyAttackId));
  const tpl = (i) => atts.find((a) => a.enemyAttackId === [1, 101, 601][Math.min(i, 2)]) || atts[0];
  let added = 0;
  const add = (sid, i) => {
    if (!sid || have.has(sid)) return;
    atts.push(Object.assign(JSON.parse(JSON.stringify(tpl(i))), { enemyAttackId: sid }));
    have.add(sid);
    added++;
  };
  for (const e of enemies) {
    (e.skillId || []).forEach(add);
    (e.urgencySkillId || []).forEach((sid) => add(sid, 2));
  }
  return added;
}

const readOrig = (file = ORIG) => JSON.parse(fs.readFileSync(file, 'utf8'));

module.exports = { applyEnemyAttacks, addMissing, servedHitEffects, readOrig };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
  const file = path.join(dir, 'enemyAttack.json');
  const atts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const added = addMissing(atts, JSON.parse(fs.readFileSync(path.join(dir, 'enemy.json'), 'utf8')));
  const stats = { added, ...applyEnemyAttacks(atts, readOrig()) };
  console.log('enemy-attack-fix:', JSON.stringify(stats));
  if (stats.patched || added) fs.writeFileSync(file, JSON.stringify(atts));
}
