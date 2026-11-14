// Status ailment table (badstatus): Poison, Virus, Sleep, Paralysis, one row per side (target 0 / 1).
//
// The WW 5.0.1 master ships this table EMPTY. Enemy attacks poison, sleep or paralyze again since I-181
// (enemy-attack-fix.js), and when the player's turn starts while paralyzed the client looks up the Paralysis row:
// with no row it dereferences a null pointer and the game closes (I-273, tester report 14-11, Quest 344: CAUTION
// Bad Dogs paralyze on their first strike; benched 14-11, crash with no Esuna, no crash once the rows are back).
// The original rows are in thethiny's data (badstatus.json, 8 rows), identical to the donated 2021 master.
//
// make-game-tables.js applies it before writing; alone it fixes server/master_data in place
// (idempotent; then revision +1 and relogin.ps1):
//   node server/badstatus-fix.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

const ORIG = process.env.KHUX_ORIG_BADSTATUS || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\badstatus.json';

// rows: master rows (changed in place); orig: original rows. An original row replaces the row with the same id,
// missing ids are added; rows only in the master stay. Sorted by id. -> { added, replaced, same }
function applyBadstatus(rows, orig) {
  const stats = { added: 0, replaced: 0, same: 0 };
  const byId = new Map(rows.map((r, i) => [r.badstatusId, i]));
  for (const o of orig || []) {
    const row = JSON.parse(JSON.stringify(o));
    const i = byId.get(row.badstatusId);
    if (i === undefined) { rows.push(row); byId.set(row.badstatusId, rows.length - 1); stats.added++; }
    else if (JSON.stringify(rows[i]) === JSON.stringify(row)) stats.same++;
    else { rows[i] = row; stats.replaced++; }
  }
  rows.sort((a, b) => a.badstatusId - b.badstatusId);
  return stats;
}

// original rows, or null when the source file is absent (the caller warns: without them paralysis crashes the client)
function readOrig(file = ORIG) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// fix the badstatus.json of a master folder; -> stats, or null when the source is absent
function fixFolder(dir) {
  const orig = readOrig();
  if (!orig) { console.warn(`badstatus-fix: ${ORIG} absent: badstatus stays as it is (paralysis on the player crashes the client)`); return null; }
  const file = path.join(dir, 'badstatus.json');
  const rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const stats = applyBadstatus(rows, orig);
  if (stats.added || stats.replaced || !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(rows));
  return stats;
}

module.exports = { applyBadstatus, readOrig, fixFolder, ORIG };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
  console.log('badstatus-fix:', JSON.stringify(fixFolder(dir)));
}
