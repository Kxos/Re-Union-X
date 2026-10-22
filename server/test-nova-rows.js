// Prova di make-nova-rows.js (addGuiltBurstLv/Max nelle righe medal che un preset «guilt: max» puo' consegnare):
//   node server/test-nova-rows.js   -> «OK: ...» oppure «ERRORI (n)», uscita 1
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { targets, patch } = require('./make-nova-rows');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const row = (medalId, rare, guiltValue, o = {}) => ({ medalId, name: `m${medalId}`, type: 1, rare, guiltValue, groupId: 0,
  addGuiltBurstLv: 0, addGuiltBurstLvMax: 0, ...o });
const medals = [
  row(300771, 7, 4), row(300586, 7, 3), row(301428, 6, 7), row(32035, 5, 2),
  row(300999, 7, 0),                                   // 7★ senza Tier: niente guilt, niente Nova
  row(2300771, 7, 4, { groupId: 300771 }),             // boosted di HD Axel: stessa riga per il client
  row(90156, 3, 0, { type: 3 }),                       // Magic Mirror
];
const banner = (rowId, rarityMix, preset, extra = {}) => ({ rowId, rarityMix, lotCount: 10, enhance: { preset }, ...extra });
const catalog = {
  medals: { 'hd axel': { ids: [[1201, 5, '2016-01-01', 4], [300771, 7, '2018-05-14', 4]] }, 'tw art 2': { ids: [[301428, 6, '2018-05-14', 7]] } },
  banners: [
    banner('B0306', [[7, 1], [6, 1], [5, 8]], [{ on: { slots: [0] }, dots: 'max', guilt: 'max' }]),
    banner('B0400', [[6, 2], [5, 8]], [{ on: { names: ['tw art 2'] }, dots: 'max', guilt: 'max' }]),
    banner('B0500', [[5, 10]], [{ on: { star: 5 }, dots: 3, guilt: null }]),   // solo pallini: nessun Nova
  ],
};

const t = targets(medals, catalog);
check(t.has(300771) && t.has(300586), 'slot 0 7★ di B0306: le 7★ con Tier');
check(!t.has(300999), '7★ senza Tier esclusa');
check(t.has(2300771), 'boosted della normale coinvolta');
check(t.has(301428), 'preset per nome (B0400)');
check(!t.has(32035), 'preset senza guilt (B0500): esclusa');
check(!t.has(90156), 'medaglie non d\'attacco escluse');
check(!t.has(1201), 'id del catalogo assente dal master: ignorato');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-nova-'));
fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify(medals));
const cat = path.join(dir, 'catalog.json');
fs.writeFileSync(cat, JSON.stringify(catalog));
const log = console.log; console.log = () => {};
const n1 = patch(dir, cat), n2 = patch(dir, cat);
console.log = log;
const out = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8'));
const by = new Map(out.map((r) => [r.medalId, r]));
check(by.get(300771).addGuiltBurstLv === 1 && by.get(300771).addGuiltBurstLvMax === 5, 'valori 1 e 5');
check(by.get(2300771).addGuiltBurstLv === 1 && by.get(2300771).addGuiltBurstLvMax === 5, 'valori anche sulla boosted');
check(by.get(32035).addGuiltBurstLv === 0 && by.get(300999).addGuiltBurstLvMax === 0, 'le altre restano 0');
check(n1 === 4 && n2 === 0, `idempotente (${n1}, ${n2})`);
fs.rmSync(dir, { recursive: true, force: true });

if (errors.length) {
  console.log(`ERRORI (${errors.length})`);
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log('OK: righe del Nova (slot, nomi, stella, boosted, Tier 0 escluso, idempotente)');
