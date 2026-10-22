#!/usr/bin/env node
// Livelli del Nova nelle righe medal (addGuiltBurstLv = 1, addGuiltBurstLvMax = 5) solo per le
// medaglie che un preset «guilt: 'max'» del catalogo dei banner puo' consegnare (I-149, sotto-progetto 2b).
//
// Perche': dopo un'estrazione con guiltBurstFirst/MaxUserMedalIds il client calcola da solo i livelli del popup
// «NOVA LEVEL UP!» dalle righe delle copie elencate (partenza = userPoint.guiltBurstLv - somma
// delle righe; + addGuiltBurstLv / + addGuiltBurstLvMax a ogni passo). Con 0 il popup
// mostrerebbe «LV n » LV n». Il popup parte solo se il server manda le liste (guilt-burst.js), quindi i valori
// non fanno comparire popup nelle estrazioni normali; il Level Up usa i campi della risposta (guilt-burst.gained).
// Righe toccate solo dove servono (altri lettori del campo nel client, 
// non ancora capiti): righe d'attacco (type 1) con guiltValue > 0 alla stella degli slot (on.slots), alla stella
// (on.star) o col nome (on.names) del preset, piu' le loro boosted (groupId). guilt-burst.js usa gli stessi
// valori (1 e 5 di default), quindi il livello del server e quello del client coincidono.
// Idempotente; chiamato in fondo a make-game-tables.js (dopo le boosted). Dopo: alzare la revisione del master.
//
//   node server/make-nova-rows.js [cartella master] [catalogo]
'use strict';

const fs = require('fs');
const path = require('path');
const { slotRarities } = require('./gacha-data');

const FIRST = 1, MAX = 5;

function targets(medals, catalog) {
  const attack = medals.filter((r) => r.type === 1 && (r.guiltValue || 0) > 0);
  const stars = new Set(), ids = new Set();
  for (const b of catalog.banners || []) {
    for (const p of (b.enhance && b.enhance.preset) || []) {
      if (p.guilt !== 'max' || !p.on) continue;
      if (p.on.star) stars.add(p.on.star);
      if (p.on.slots) {
        const sr = slotRarities({ rarityMix: b.rarityMix || [], lotCount: b.lotCount || 0 });
        for (const i of p.on.slots) if (sr[i]) stars.add(sr[i]);
      }
      for (const n of p.on.names || []) for (const e of ((catalog.medals || {})[n] || {}).ids || []) ids.add(e[0]);
    }
  }
  const out = new Set();
  for (const r of attack) if (!r.groupId && (stars.has(r.rare) || ids.has(r.medalId))) out.add(r.medalId);
  for (const r of attack) if (r.groupId && out.has(r.groupId)) out.add(r.medalId);
  return out;
}

function patch(masterDir, catalogFile) {
  const medalFile = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  const t = targets(medals, catalog);
  let changed = 0;
  for (const r of medals) {
    if (!t.has(r.medalId) || (r.addGuiltBurstLv === FIRST && r.addGuiltBurstLvMax === MAX)) continue;
    r.addGuiltBurstLv = FIRST;
    r.addGuiltBurstLvMax = MAX;
    changed++;
  }
  if (changed) fs.writeFileSync(medalFile, JSON.stringify(medals));
  console.log(`nova: ${t.size} righe medal con addGuiltBurstLv ${FIRST} / addGuiltBurstLvMax ${MAX} (cambiate ${changed})`);
  return changed;
}

module.exports = { targets, patch, FIRST, MAX };

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  const cat = process.argv[3] || path.join(__dirname, 'game_data', 'gacha_catalog.json');
  patch(dir, cat);
}
