#!/usr/bin/env node
// Righe boosted del master medal (medal-boost.js, docs/notes/medaglie.md#boosted) dalle voci
// banner.enhance.boosted del catalogo (server/game_data/gacha_catalog.json, versione 3). Si applica da
// sola (idempotente) a server/master_data, ed e' chiamata in fondo a make-game-tables.js, che riscrive
// medal.json. Una riga per ogni coppia distinta (medaglia normale, str/def); una coppia chiesta da piu'
// famiglie conta come nuova nella prima che la chiede. Candidate: righe d'attacco
// (type 1) non boosted, tutte le stelle, per famiglia di voce:
// - names: le righe col nome (normalizzato come nel catalogo);
// - slots: i nomi delle riserve a lista dello slot; per gli slot Tier/trait/senza riserva il pool del
//   banner alla stella dello slot (gacha-data.expandPool), col Tier per gli slot «tier»;
// - star: il pool del banner a quella stella;
// - tier (on.tierMin, decisione 8): tutte le righe della stella (o di ogni stella) nel Tier, senza
//   Prime se excludePrime; senza date: l'estrazione (Task 5) sceglie solo fra le medaglie del pool.
// Dopo: alzare la revisione del master (KHUX_REVISION).
//
//   node server/make-boosted-medals.js [cartella master] [catalogo]
'use strict';

const fs = require('fs');
const path = require('path');
const mb = require('./medal-boost');

const familyOf = (on) => (on.tierMin !== undefined ? 'tier' : on.names ? 'names' : on.slots ? 'slots' : 'star');

function patch(masterDir, catalogFile) {
  const medalFile = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  // rare originali SE (id 1xxxxx, medal-boost.origBoostedBase): groupId = la normale, come nel client 1.1.3
  const allById = new Map(medals.map((r) => [r.medalId, r]));
  let regrouped = 0;
  for (const r of medals) {
    const base = !r.groupId && mb.origBoostedBase(r, allById);
    if (base) { r.groupId = base; regrouped++; }
  }
  const normals =medals.filter((r) => r.type === 1 && !mb.isBoosted(r) && r.medalId < 1000000);
  const byId = new Map(normals.map((r) => [r.medalId, r]));
  const byName = new Map();
  for (const r of normals) {
    const n = mb.norm(r.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  }
  const have = mb.boostedIndex(medals);
  const released = new Map(); // medalId -> data d'uscita del catalogo
  for (const v of Object.values(catalog.medals || {})) for (const [id, , d] of v.ids || []) if (d && !released.has(id)) released.set(id, d);
  const seen = new Set(), missingNames = new Set(), missingIds = new Set();
  const families = {}, variants = {};
  const added = [];
  let kept = 0;
  const want = (fam, row, str, def) => {
    const key = `${row.medalId}:${str}:${def}`;
    const f = (families[fam] ||= { pairs: 0, added: 0, keys: new Set() });
    if (!f.keys.has(key)) { f.keys.add(key); f.pairs++; }
    if (seen.has(key)) return;
    seen.add(key);
    if (have.has(key)) { kept++; return; }
    added.push(mb.boostedRow(row, str, def));
    f.added++;
    variants[`${str}:${def}`] = (variants[`${str}:${def}`] || 0) + 1;
  };
  for (const banner of catalog.banners || []) {
    for (const entry of banner.enhance?.boosted || []) {
      const on = entry.on || {}, fam = familyOf(on);
      if (fam === 'tier') {
        for (const r of normals) if (mb.tierMatch(on, r)) want(fam, r, entry.str, entry.def);
        continue;
      }
      // famiglia slots: solo la stella delle riserve con stella (B0046/B0047: le Organizzazione XIII 6★, non 5★/7★
      // inventate, 19-10)
      const stars = new Set(fam === 'slots' ? (on.slots || []).map((k) => mb.slotOf(banner, k)?.star).filter(Boolean) : []);
      // solo le varianti gia' uscite all'inizio del banner (date del catalogo): niente 7★ boosted per i banner del
      // 2016-17 (2c/G5, 19-10); un id fuori dal catalogo resta candidato
      const out = (r) => banner.start && released.has(r.medalId) && released.get(r.medalId) > banner.start;
      for (const n of mb.resolveNames(entry, banner)) {
        const rows = byName.get(mb.norm(n));
        if (!rows) { missingNames.add(n); continue; }
        for (const r of rows) if ((!stars.size || stars.has(r.rare)) && !out(r)) want(fam, r, entry.str, entry.def);
      }
      for (const id of mb.resolveIds(entry, banner, catalog, byId)) {
        const r = byId.get(id);
        if (r) want(fam, r, entry.str, entry.def); else missingIds.add(id);
      }
    }
  }
  if (added.length || regrouped) {
    added.sort((a, b) => a.medalId - b.medalId);
    fs.writeFileSync(medalFile, JSON.stringify(medals.concat(added)));
  }
  for (const f of Object.values(families)) delete f.keys;
  const res = { added: added.length, kept, regrouped, missing: missingNames.size, missingIds: missingIds.size, families, variants };
  console.log(`boosted: +${res.added} righe (${kept} gia' presenti, ${regrouped} rare originali con groupId), per variante ${JSON.stringify(variants)}, per famiglia (nuove/coppie) ` +
    Object.entries(families).map(([k, v]) => `${k} +${v.added}/${v.pairs}`).join(', ') +
    `; nomi assenti da medal.json ${missingNames.size}${missingNames.size ? ` (${[...missingNames].slice(0, 8).join('; ')}${missingNames.size > 8 ? '; ...' : ''})` : ''}` +
    `; id del pool assenti ${missingIds.size}`);
  return res;
}

if (require.main === module) {
  const dir = process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
  const cat = process.argv[3] || path.join(__dirname, 'game_data', 'gacha_catalog.json');
  patch(dir, cat);
}

module.exports = { patch };
