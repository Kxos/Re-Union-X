#!/usr/bin/env node
// Trait dalla fusione (I-084 parte A, docs/superpowers/specs/2026-10-19-trait-design.md): due ritocchi del master.
//
// 1. medal.shuffleSkillGroupId: il client (anteprima) conta un materiale come
//    «da trait» se il suo shuffleSkillGroupId e' uguale a quello della base (e diverso da 0) e la base ha
//    shuffleskillSlot > 0. Era 0 ovunque. Stessa medaglia = stesso nome (tutte le rarita', boosted, varianti
//    >= 1.000.000; dalla 2.6.0 vale fra rarita' diverse, notice 40729) oppure stesso numero di Album (sortId > 0):
//    le evoluzioni rinominate (SN -> SN+ -> SN++, X -> Supernova - X) sono la stessa medaglia. Prova (parte B, 19-10):
//    il deal «SN+ - KH III Xemnas Trait Medal Deal» da' la Trait Medal #130, che la khuxwiki lega a «SN - KH III
//    Xemnas», e la Trait Medal condivide la cella dell'Album con la sua medaglia (notice 38128).
//    Valore = medalId piu' basso della famiglia (stabile fra le rigenerazioni).
// 2. shuffleskill: la ruota della fusione estrae fra gli 11 trait originali (notice 27491, guida p. 21-23):
//    mancavano come trait normali (type 1) Max HP +800 e Poison/Sleep/Paralysis Resist 20%, che esistevano solo
//    come Special Trait del pet (type 2): righe 14-17 copiate dalle 1024/1029/1032/1035 col type 1. La roulette del
// client (anche nell'acquisto del Moogle Shop) mostra le righe type 1 con rate != 0: rate 100 su tutte
//    (anche i trait solo da Moogle Shop, Max HP +300 e i 5 della 4.1.0), l'estrazione la fa il server sugli 11.
// Idempotente; chiamato in fondo a make-game-tables.js (dopo make-pet-tables, che ha i Special Trait). Dopo:
// alzare la revisione del master.
//
//   node server/make-trait-groups.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');
const { isCutinAlias } = require('./make-cutin-alias');

// ordine: Extra Attack 40%, Ground -60%, Aerial -60%, STR +1000, Raids +40%, DEF +2000, Gauges +2, HP +800, Resist x3
const FUSION_TRAIT_IDS = [10, 8, 9, 11, 12, 13, 1, 14, 15, 16, 17];
const NEW_ROWS = [[14, 1024], [15, 1029], [16, 1032], [17, 1035]]; // [id nuovo type 1, Special Trait da copiare]

// medalId -> gruppo, per le righe con slot dei trait: componenti connesse di (stesso nome) e (stesso sortId > 0)
function groups(medals) {
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
  // senza le righe alias del cut-in (make-cutin-alias.js, I-187): id-1 della medaglia, non una medaglia
  const byId = new Map(medals.map((r) => [r.medalId, r]));
  const rows = medals.filter((r) => (r.shuffleskillSlot || 0) > 0 && !isCutinAlias(r, byId));
  for (const r of rows) {
    for (const k of ['m' + r.medalId, 'n' + r.name, ...(r.sortId > 0 ? ['s' + r.sortId] : [])]) if (!parent.has(k)) parent.set(k, k);
    union('m' + r.medalId, 'n' + r.name);
    if (r.sortId > 0) union('m' + r.medalId, 's' + r.sortId);
  }
  const low = new Map();
  for (const r of rows) { const c = find('m' + r.medalId); if (!(low.get(c) <= r.medalId)) low.set(c, r.medalId); }
  return new Map(rows.map((r) => [r.medalId, low.get(find('m' + r.medalId))]));
}

function patch(masterDir) {
  const out = [];
  const medalFile = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8'));
  const low = groups(medals);
  let changed = 0;
  for (const r of medals) {
    const g = low.get(r.medalId) || 0;
    if ((r.shuffleskillSlot || 0) > 0 && low.has(r.medalId) && r.shuffleSkillGroupId !== g) { r.shuffleSkillGroupId = g; changed++; }
  }
  if (changed) fs.writeFileSync(medalFile, JSON.stringify(medals));
  out.push(`medal: ${new Set(low.values()).size} gruppi dei trait (cambiate ${changed})`);

  const shuffleFile = path.join(masterDir, 'shuffleskill.json');
  const rows = JSON.parse(fs.readFileSync(shuffleFile, 'utf8'));
  const byId = new Map(rows.map((r) => [r.shuffleSkillId, r]));
  let touched = 0;
  for (const [id, from] of NEW_ROWS) {
    const src = byId.get(from);
    if (!src) throw new Error(`shuffleskill ${from} assente: lanciare prima make-pet-tables.js`);
    const want = { ...src, shuffleSkillId: id, type: 1, sortId: id, rate: 100, campaignRate: 0 };
    if (JSON.stringify(byId.get(id)) !== JSON.stringify(want)) { byId.set(id, want); touched++; }
  }
  // rate 100 su tutti i trait normali: la roulette del client (anche nell'acquisto del Moogle Shop) deve avere fra le
  // facce il trait che arriva dal server; quale trait esce lo decide il server (FUSION_TRAIT_IDS, medal-trait.js)
  for (const r of byId.values()) {
    if (r.type !== 1 || r.shuffleSkillId >= 900) continue;
    if (r.rate !== 100) { r.rate = 100; touched++; }
  }
  if (touched) fs.writeFileSync(shuffleFile, JSON.stringify([...byId.values()].sort((a, b) => a.shuffleSkillId - b.shuffleSkillId)));
  out.push(`shuffleskill: ruota sugli 11 trait originali (cambiate ${touched})`);
  console.log(`trait: ${out.join('; ')}`);
  return changed + touched;
}

module.exports = { FUSION_TRAIT_IDS, groups, patch };

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));
