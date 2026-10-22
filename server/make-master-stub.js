#!/usr/bin/env node
// Genera in server/master_data/ le tabelle master minime che il client accetta.
//
// - ogni tabella dello schema (recon/out/master_types_ww431.json) diventa `[]`:
//   valido per il client, che lo scarica e lo salva senza errori;
// - `misc` riceve una riga per ogni id che il codice chiede al suo getter
//   (recon/out/misc_ids_ww431.txt, da recon/tools/getter_ids.py), con value 0
//   salvo i valori noti qui sotto. Senza queste righe il client va in crash
//   appena ne legge una (prima: misc 804, nella registrazione del nome).
//
// I valori sono nostri segnaposto, non dati di Square Enix. Non sovrascrive i
// file che esistono gia', a meno di passare --force.
//
//   node server/make-master-stub.js [--force]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const force = process.argv.includes('--force');

// miscId -> value, con il perche'
const MISC_VALUES = {
  804: 10, // lunghezza massima del nome giocatore ("Max 10 char.", Txt_Limit1)
};

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'recon', 'out', 'master_types_ww431.json'), 'utf8'));
const miscIds = fs.readFileSync(path.join(ROOT, 'recon', 'out', 'misc_ids_ww431.txt'), 'utf8')
  .replace(/^﻿/, '').split(/\r?\n/).filter((l) => /^\d+\t/.test(l)).map((l) => Number(l.split('\t')[0]));

fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const name of Object.keys(schema)) {
  const file = path.join(OUT, name + '.json');
  if (fs.existsSync(file) && !force) continue;
  let rows = [];
  if (name === 'misc') rows = miscIds.map((id) => ({ miscId: id, value: MISC_VALUES[id] ?? 0 }));
  fs.writeFileSync(file, JSON.stringify(rows));
  written++;
}
console.log(`${written} tabelle scritte in ${OUT} (${Object.keys(schema).length} nello schema, ${miscIds.length} righe misc)`);
