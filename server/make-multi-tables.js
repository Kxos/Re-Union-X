#!/usr/bin/env node
// Scrive in server/master_data/ le tabelle `multi` e `multiStage` (Union Cross) con un evento
// segnaposto sempre aperto. Senza un evento il pannello Union Cross della schermata Quest va
// in crash (multiEvents[0] letto senza controllo, poi la riga `multi` di quel multiId): vedi
// docs/notes/union_cross.md. Righe vere non trovate (nessun dump pubblico delle master multi).
//
//   node server/make-multi-tables.js            (poi alzare KHUX_REVISION)
// Variabili: KHUX_MULTI_STAGE (stageId della mappa, default 1010 = Prologue),
//            KHUX_MULTI_AP (AP, default 5).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'recon', 'out', 'master_types_ww431.json'), 'utf8'));

function blank(table) {
  const row = {};
  for (const [f, t] of schema[table]) row[f] = /\[\d+\]$/.test(t) ? [] : t.startsWith('string') ? '' : 0;
  return row;
}

// Campi della riga multi: bannerUrl e detailUrl
// (stringhe fino a 512 caratteri). detailUrl vuoto = tasto «Detail» nascosto.
const multi = [Object.assign(blank('multi'), {
  multiId: 1,
  coinId: 0,                                   // significato non ricavato
  useAp: Number(process.env.KHUX_MULTI_AP || 5),
  valid: 1,
  stageStartId: [1], stageEndId: [1], weight: [100], // intervallo di multiStageId e pesi
  bannerUrl: '', detailUrl: '',
  startTime: '2020-01-01 00:00:00', endTime: '2030-12-31 23:59:59', boardEndTime: '2030-12-31 23:59:59',
})];

const multiStage = [Object.assign(blank('multiStage'), {
  multiStageId: 1,
  stageBinId: Number(process.env.KHUX_MULTI_STAGE || 1010),
  hpFactor: 100,
})];

fs.mkdirSync(OUT, { recursive: true });
for (const [name, rows] of [['multi', multi], ['multiStage', multiStage]]) {
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(rows, null, 1));
  console.log(`${name}: ${rows.length} righe -> ${path.join(OUT, name + '.json')}`);
}
