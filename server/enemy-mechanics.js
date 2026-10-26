// Contatori e assorbimento dei nemici delle missioni 526-979 (I-207, decisioni dell'autore 25-10).
//
// Il client li gestisce (validUrgency/urgency/urgencyValue/urgencyFrequency/urgencySkillId; absorbAttribute), ma le
// righe 526-979 di make-enemy-oltre.js sono cloni senza. La tabella privata
// reference\world_schema\oltre525\enemy_mechanics_oltre.json (enemy_mechanics_oltre.py: wiki delle missioni x stage
// JP) da' per id il tipo (2 «N-attack count», 3 «N-hit count», 7 «Slot N counter») e il valore; urgencyFrequency 0 =
// il contatore riparte sempre (come il Gold Tricholoma originale). Contrattacchi SOSPESI (decisione dell'utente 26-10):
// la ricerca (D:\Progetto_Restauro_KH_UX\tmp\i207\research\REPORT.md) mostra che a 0 la mossa era propria della
// famiglia (veleno, DEF giu', cura degli alleati, fuga...), non «l'attacco piu' forte» usato il 25-10. Un contatore si
// applica solo se la tabella da' la mossa verificata (c.skillId); gli altri vengono tolti (validUrgency 0).
// Assorbimento: bit 0 Power, 1 Speed, 2 Magic, 3 Upright, 4 Reversed.
// Grafica (ActMapSpEnmUI_*, Absorb_*): import_jp_coco.py. Notice «Story Quests 526-979».
//
// make-game-tables.js la applica dopo make-enemy-oltre.js addRows() e la creazione degli attacchi; da sola corregge
// server/master_data sul posto (idempotente; poi revisione +1 e relogin.ps1):
//   node server/enemy-mechanics.js [cartella master] [enemy_mechanics_oltre.json]
'use strict';
const fs = require('fs');
const path = require('path');

const TABLE_PATH = process.env.KHUX_ENEMY_MECHANICS || 'D:\\Progetto_Restauro_KH_UX\\reference\\world_schema\\oltre525\\enemy_mechanics_oltre.json';
const BITS = { power: 1, speed: 2, magic: 4, upright: 8, reversed: 16 };

// attacco piu' forte contro il giocatore fra le abilita' del nemico; null se ha solo cure/buff sugli alleati
function counterAttack(row, attById) {
  let best = null, bestKey = null;
  (row.skillId || []).slice(0, row.validSkill || 0).forEach((sid, i) => {
    const a = attById.get(sid);
    if (!a || !(a.target === 1 || (a.target === 2 && /attack/i.test(a.name)))) return;
    const key = [(a.power || 0) * (a.hitCount || 1), a.display === 1 ? 1 : 0, i];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] >= bestKey[1])) { best = sid; bestKey = key; }
  });
  return best;
}

const first = (arr, v) => { const out = Array.isArray(arr) && arr.length ? arr.map(() => 0) : [0, 0, 0]; out[0] = v; return out; };

// rows: righe enemy (sul posto); atts: righe enemyAttack; table: {counters, absorb}. -> rapporto
function applyMechanics(rows, atts, table) {
  const attById = new Map(atts.map((a) => [a.enemyAttackId, a]));
  const rep = { counters: 0, suspended: 0, absorb: 0, noAttack: [] };
  for (const row of rows) {
    const c = (table.counters || {})[row.enemyId];
    if (c && !c.skillId) {
      // sospeso: nessuna mossa verificata; toglie anche un contatore messo da una versione precedente (righe 526-979)
      Object.assign(row, { validUrgency: 0, urgency: first(row.urgency, 0), urgencyValue: first(row.urgencyValue, 0),
        urgencyFrequency: first(row.urgencyFrequency, 0), urgencySkillId: first(row.urgencySkillId, 0) });
      rep.suspended++;
    } else if (c) {
      const sid = attById.has(c.skillId) ? c.skillId : null;
      if (sid == null) rep.noAttack.push(row.enemyId);
      else {
        Object.assign(row, { validUrgency: 1, urgency: first(row.urgency, c.urgency), urgencyValue: first(row.urgencyValue, c.value),
          urgencyFrequency: first(row.urgencyFrequency, 0), urgencySkillId: first(row.urgencySkillId, sid) });
        rep.counters++;
      }
    }
    const a = (table.absorb || {})[row.enemyId];
    if (a) {
      row.absorbAttribute = a.kinds.reduce((m, k) => m | (BITS[k] || 0), 0);
      rep.absorb++;
    }
  }
  return rep;
}

const readTable = (file = TABLE_PATH) => JSON.parse(fs.readFileSync(file, 'utf8'));

module.exports = { applyMechanics, counterAttack, readTable, TABLE_PATH };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
  const file = path.join(dir, 'enemy.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(rows);
  const rep = applyMechanics(rows, JSON.parse(fs.readFileSync(path.join(dir, 'enemyAttack.json'), 'utf8')), readTable(process.argv[3]));
  if (JSON.stringify(rows) !== before) fs.writeFileSync(file, JSON.stringify(rows));
  console.log('enemy-mechanics:', JSON.stringify(rep));
}
