// Medaglie «boosted» (sotto-progetto 2b, docs/notes/medaglie.md#boosted): nell'originale una boosted e'
// una riga a parte del master medal, non un campo di userMedal. Il client la riconosce dal displayId
// della riga: 1, 101, 201, 301, 1101, 1201, 1301 = displayId della normale + 1
// (0 senza badge, 100/200/300 SN/SN+/SN++, +1000 varianti R)
// trattano n e n+1 allo stesso modo (badge invariato). groupId punta alla normale: il
// dettaglio ne mostra il No. e colora di giallo STR/DEF/Cost migliori.
// Statistiche dalle frasi dei banner (1000 STR; 1000 STR e DEF; 2000 STR e DEF, B0514) e dal video
// LFJ5 (SN++ - Master Eraqus: Cost 46 -> 36). minCost - 10 e' una proposta (tetto di Cid invariato).
'use strict';

const ga = require('./gacha-data');

// variante (str:def) -> cifra dei milioni del medalId della boosted
const VARIANTS = { '1000:0': 1, '1000:1000': 2, '2000:2000': 3 };
const BADGES = new Set([0, 100, 200, 300, 1100, 1200, 1300]);

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function boostedId(normalId, str, def) {
  const v = VARIANTS[`${str}:${def}`];
  if (!v) throw new Error(`boosted: variante ${str}/${def} sconosciuta`);
  return v * 1000000 + normalId;
}

const isBoosted = (row) => Boolean(row && row.groupId);

// copia della normale: stesse immagini, nome, burst, guiltValue, addMax*, Evolve; cella propria (validPack 0)
function boostedRow(normal, str, def) {
  const row = JSON.parse(JSON.stringify(normal));
  return Object.assign(row, {
    medalId: boostedId(normal.medalId, str, def),
    attack: normal.attack + str, maxAttack: normal.maxAttack + str,
    defense: normal.defense + def, maxDefense: normal.maxDefense + def,
    cost: Math.max(0, normal.cost - 10), minCost: Math.max(0, normal.minCost - 10),
    displayId: BADGES.has(normal.displayId) ? normal.displayId + 1 : 1,
    groupId: normal.medalId, validPack: 0,
  });
}

// Versioni rare originali SE (2c/G4, 19-10): id 1xxxxx = la normale id-100000 con stesso nome e stella e STR
// piu' alta (le 17 Organizzazione XIII, notice 20865 «even rarer version ... 1,000 more base strength»). Nel
// client 1.1.3 hanno groupId = la normale; make-game-tables.js lo azzera, make-boosted-medals.js lo rimette.
// -> medalId della normale, o 0.
function origBoostedBase(row, byId) {
  const id = row?.medalId || 0;
  if (id < 100000 || id >= 200000) return 0;
  const b = byId.get(id - 100000);
  return b && b.name === row.name && b.rare === row.rare && (row.attack || 0) > (b.attack || 0) ? b.medalId : 0;
}

// 'normalId:str:def' -> medalId della boosted, per le righe boosted gia' nel master (le rare originali SE
// con la variante dalla differenza di STR e DEF rispetto alla normale)
function boostedIndex(medalRows) {
  const byDigit = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [v, k]));
  const byId = new Map(medalRows.map((r) => [r.medalId, r]));
  const out = new Map();
  for (const r of medalRows) {
    if (!isBoosted(r)) continue;
    const base = r.medalId < 1000000 && byId.get(r.groupId);
    const sd = base ? `${r.attack - base.attack}:${r.defense - base.defense}` : byDigit[Math.floor(r.medalId / 1000000)];
    if (sd) out.set(`${r.groupId}:${sd}`, r.medalId);
  }
  return out;
}

// riserva (guarantee.slots) che copre l'indice di slot k (slotsUsed compreso): la stessa di gacha-data
const slotOf = (banner, k) => ga.reservationOf(banner, k) || undefined;

// nomi (del catalogo, minuscoli) di una voce boosted: on.names, oppure i nomi delle riserve a lista di
// on.slots (e i nomi alternativi degli slot Tier)
function resolveNames(entry, banner) {
  const on = entry.on || {};
  if (on.names) return [...new Set(on.names)];
  const out = new Set();
  for (const k of on.slots || []) for (const n of slotOf(banner, k)?.names || []) out.add(n);
  return [...out];
}

// medalId del pool del banner per le voci senza nomi: {star} (la stella) e gli slot non a lista (la
// stella dello slot, col Tier per gli slot «tier»; slot senza riserva: la stella di slotRarities).
// Pool alla data del banner (i PERMANENT: alla fine, il piu' largo). Tier = guiltValue della riga.
function resolveIds(entry, banner, catalog, rowsById) {
  const on = entry.on || {};
  const wants = [];
  if (on.star != null && !on.names && !on.slots) wants.push({ star: on.star });
  for (const k of on.slots || []) {
    const s = slotOf(banner, k);
    if (s && s.kind === 'list') continue;
    if (s && s.kind === 'tier') wants.push({ star: s.star, tierMin: s.tierMin, tierMax: s.tierMax });
    else wants.push({ star: s ? s.star : ga.slotRarities(banner)[k] });
  }
  if (!wants.length) return [];
  const { pool } = ga.expandPool(banner, catalog, ga.asOf(banner, '2099-12-31'));
  const tierOf = new Map();
  for (const m of Object.values(catalog.medals || {})) for (const [id, , , t] of m.ids || []) tierOf.set(id, t || 0);
  const out = new Set();
  for (const w of wants) {
    for (const id of pool[w.star] || []) {
      const t = rowsById.get(id)?.guiltValue ?? tierOf.get(id) ?? 0;
      if (w.tierMin != null && t < w.tierMin) continue;
      if (w.tierMax != null && t > w.tierMax) continue;
      out.add(id);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// voce per Tier (Task 2, decisione 8): stella (o tutte), tierMin <= guiltValue <= tierMax, senza Prime
const tierMatch = (on, row) => (on.star == null || row.rare === on.star) && (row.guiltValue || 0) >= (on.tierMin || 0)
  && (on.tierMax == null || (row.guiltValue || 0) <= on.tierMax) && !(on.excludePrime && norm(row.name).startsWith('prime - '));

module.exports = { VARIANTS, BADGES, norm, boostedId, isBoosted, boostedRow, boostedIndex, origBoostedBase, slotOf, resolveNames, resolveIds, tierMatch };
