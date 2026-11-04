#!/usr/bin/env node
// Tabella master petParts (parti dello Spirit), ricostruita: nel master 5.0.1 e' vuota.
//
// Righe da server/pet_parts.tsv (petPartsId, nome inglese; versionato): gli id sono quelli della
// grafica JP 4.3.1 (lwf/pet/part, icone img/petParts/pi<id>.png) che recon/tools/jp_pet_parts.py
// importa nelle risorse; i nomi vengono dalla khwiki/khuxwiki confrontando le icone
// (D:\Progetto_Restauro_KH_UX\reference\pet\spirit_parts_names.md). Restano fuori gli accessori a
// cui manca grafica anche nel JP (jp_pet_parts.py, «serie escluse») e la serie 999.
//
// Colonne (master_types: petPartsId, name string(128), partsType, combinationType,
// combinationFlag, offsetNumber):
// - partsType = cifre TT di 3TTNNN/4TTNNN, la scheda dell'editor: 4 Head, 3 Ears,
//   8 Body, 6 Legs, 9 Tail; 1/2/5/7/10/11 Accessories;
// - combinationFlag 1 = la parte non va in nessuna scheda (l'editor la salta): 0;
// - combinationType e offsetNumber (riga di petPartsOffset, posizioni di attacco delle parti per
//   specie) ignoti: 0, e petPartsOffset resta vuota (il client usa i valori di riposo, home_profilo.md).
//
// Reconstructed parts (03-11): status column of pet_parts.tsv; a «recon» candidate gets a row only once the user approves
// it (status «recon-ok»); its textures then move into the private pet_parts_recon/files (resources).
//
//   node server/make-pet-parts.js     (scrive server/tables/petParts.json, alzare la revisione)
//
// The server reads server/master_data/petParts.json, NOT server/tables: after this script run make-game-tables.js (it copies
// every server/tables/*.json) or copy the file by hand, otherwise the new part is missing from the client's Outfits list and
// is never drawn (04-11: Olaf's Snow Cloud looked «not drawn» for an hour because only tables/ had the row).
'use strict';
const fs = require('fs');
const path = require('path');

const TSV = path.join(__dirname, 'pet_parts.tsv');
// third column (03-11): '' original graphics, 'recon' reconstructed textures awaiting the user's approval (left out),
// 'recon-ok' reconstructed and approved (served, declared in the Notices)
const STATUSES = new Set(['', 'recon', 'recon-ok']);

function readTsv(file = TSV) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('petPartsId')) continue;
    const [id, name, status = ''] = line.split('\t');
    const petPartsId = Number(id);
    if (!petPartsId || !name) throw new Error(`pet_parts.tsv: riga non valida «${line}»`);
    if (!STATUSES.has(status)) throw new Error(`pet_parts.tsv: ${petPartsId}: unknown status «${status}»`);
    out.push({ petPartsId, name, status });
  }
  return out;
}

// Map petPartsId -> status of the parts with reconstructed textures
function partStatus(file = TSV) {
  return new Map(readTsv(file).filter((r) => r.status).map((r) => [r.petPartsId, r.status]));
}

// opts.previewRecon (or KHUX_PET_RECON=all): every «recon» candidate too, for a local preview of unapproved parts
function petPartsRows(file = TSV, opts = {}) {
  const preview = opts.previewRecon ?? process.env.KHUX_PET_RECON === 'all';
  const rows = [];
  for (const { petPartsId, name, status } of readTsv(file)) {
    if (status === 'recon' && !preview) continue;
    rows.push({
      petPartsId, name, partsType: Math.floor(petPartsId / 1000) % 100,
      combinationType: 0, combinationFlag: 0, offsetNumber: 0,
    });
  }
  return rows.sort((a, b) => a.petPartsId - b.petPartsId);
}

if (require.main === module) {
  const rows = petPartsRows();
  const out = path.join(__dirname, 'tables', 'petParts.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  const byType = {};
  for (const r of rows) byType[r.partsType] = (byType[r.partsType] || 0) + 1;
  console.log(`petParts: ${rows.length} righe ${JSON.stringify(byType)} (alzare KHUX_REVISION)`);
}

module.exports = { petPartsRows, partStatus };
