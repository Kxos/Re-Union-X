#!/usr/bin/env node
// Righe alias del cut-in dello speciale (I-187, utente 21-10: Lexaeus A 7★ senza cut-in ne' suono, nel deck e come friend).
// Allo speciale cerca la riga medal(medalId), che porta gli id che finiscono in 2 o 4 a id-1
// (convenzione SE: le 2★/4★ usano il cut-in della 1★/3★, sempre presente nei dati originali); se la riga manca salta
// immagine (cutinId), animazione (darklight) e suono. I nostri id (300000+ di Roboloid, boosted 1/2/3xxxxxx, 900xx)
// non seguono la convenzione: per ogni medaglia con speciale che finisce in 2/4 senza riga id-1 si aggiunge una copia
// all'id-1 con groupId = la medaglia (normale per le boosted), cosi' isBoosted la tiene fuori da Album, elenchi e regali
// come le boosted. Nessuno la possiede: serve solo al cut-in. Analisi in D:\Progetto_Restauro_KH_UX\tmp\friend_cutin\.
// Idempotente; in fondo a make-game-tables.js (dopo boosted e Trait Medal). Dopo: alzare la revisione.
//
//   node server/make-cutin-alias.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const cutinRowId = (id) => (id % 10 === 2 || id % 10 === 4 ? id - 1 : id);

function aliasRows(medals) {
  const have = new Set(medals.map((r) => r.medalId));
  const out = [];
  for (const r of medals) {
    const id = cutinRowId(r.medalId);
    if (!r.validBurst || id === r.medalId || have.has(id)) continue;
    out.push({ ...JSON.parse(JSON.stringify(r)), medalId: id, groupId: r.groupId || r.medalId });
    have.add(id);
  }
  return out;
}

// alias = riga id-1 copiata dalla medaglia id (o dalla sua normale per le boosted): una 1★/3★ vera di SE ha groupId 0
function isCutinAlias(row, byId) {
  const next = row && byId.get(row.medalId + 1);
  return Boolean(next && cutinRowId(next.medalId) === row.medalId && row.groupId && row.groupId === (next.groupId || next.medalId)
    && row.cutinId === next.cutinId);
}

function patch(masterDir) {
  const file = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const add = aliasRows(medals);
  // prima delle Trait Medal (type 9, make-trait-medals.js le riscrive in fondo): l'ordine resta stabile fra i due patch
  const at = medals.findIndex((r) => r.type === 9 && r.medalId >= 9000000);
  if (add.length) fs.writeFileSync(file, JSON.stringify(at < 0 ? medals.concat(add) : [...medals.slice(0, at), ...add, ...medals.slice(at)]));
  console.log(`cut-in: +${add.length} righe alias (${add.map((r) => r.medalId).join(' ')})`);
  return add.length;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { cutinRowId, aliasRows, isCutinAlias, patch };
