#!/usr/bin/env node
// Trofei di Bad Guy Breaker (I-009, missioni 526-979, 21-10): righe master material 61 «Trophy NI» (Niceland), 62
// «Trophy CS» (Cy-Bug Sector), 63 «Trophy CK» (Candy Kingdom). La tabella material della 5.0.1 (e della 1.1.3) si
// ferma alla 60; gli id sono quelli originali: il JP 4.3.1 ha le icone img/material/material_61.png (coppa d'oro in
// pixel art, Niceland), _62 (coppa cibernetica, Cy-Bug Sector), _63 (coppa di caramelle, Candy Kingdom), servite da
// recon/tools/originals.tsv sezione 41, uguali a «Trophy NI/CS/CK KHX.png» della khuxwiki (Keyblade#Trophy).
// Khuxwiki: «Trophy (トロフィー) are obtained, one at a time, for completing the third objective of certain Story Quests
// [...] exclusively used to strengthen the Bad Guy Breaker Keyblade, and as Trophies are finite in number, they cannot be
// sold» -> come Dark Matter (58): categoria 1, sell 0. Premi: terzo obiettivo delle 880/885 (NI), 890/895/900/905 (CS),
// 915 (CK), make-story-oltre.js; passi +4/+9 (NI), +14/+19/+24/+29 (CS), +30 (CK) in make-keyblade-levels.js.
// Ricostruiti (nessuna riga originale): nomi = etichette della wiki (in gioco erano forse tutti «Trophy»), descrizioni
// dalla wiki, sortId 93-95 subito dopo Dark Matter (92) come nell'elenco della wiki.
// Idempotente; in fondo a make-game-tables.js (prima di make-story-oltre.js). Dopo: alzare la revisione del master.
//
//   node server/make-trophy-materials.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const TROPHIES = { 61: ['Trophy NI', 'Niceland'], 62: ['Trophy CS', 'the Cy-Bug Sector'], 63: ['Trophy CK', 'the Candy Kingdom'] };

function trophyRows() {
  return Object.entries(TROPHIES).map(([id, [name, world]], i) => ({ materialId: Number(id), category: 1, sortId: 93 + i, name,
    description: `A trophy from ${world}. Used only to strengthen the Bad Guy Breaker Keyblade.`, sell: 0 }));
}

function patch(masterDir) {
  const file = path.join(masterDir, 'material.json');
  const add = trophyRows();
  const ids = new Set(add.map((r) => r.materialId));
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => !ids.has(r.materialId)).concat(add)
    .sort((a, b) => a.materialId - b.materialId);
  fs.writeFileSync(file, JSON.stringify(rows));
  console.log(`trofei: material ${add.map((r) => `${r.materialId} ${r.name}`).join(', ')}`);
  return add.length;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { TROPHIES, trophyRows, patch };
