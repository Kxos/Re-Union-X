#!/usr/bin/env node
// Genera server/master_data/moogleshop.json: gli articoli del Moogle Shop (scheda Items e
// scheda Traits), assenti dai master serviti. Righe dalla khuxwiki (pagina «Moogle Shop»,
// tabelle 2020-2021) e dagli screenshot in reference\moogle_shop\ (Rainbow Gem x10 = 100
// jewel, x100 = 1.000; Attack Boost XV Max x1 = 100).
//
// Campi (recon/out/master_types_ww431.json): moogleshopId,
// type, sortId, shuffleSkillId, itemType, itemId, skillType, skillId, skillLv,
// burstUpperNumber, itemNum, flavor, benefitId, payType, price, count, cpTitle, frameType,
// display, startDate, endDate. Ipotesi da verificare sul banco: type = scheda (1 Traits,
// 2 Items), itemType come i premi (3 medaglia, 5 materiale), payType 1 = jewel,
// count = scambi possibili (0 senza limite), frameType 1 = riga blu
// (Panel; altrimenti Panel_Rare dorata, changeRowItem). Verificati: type 2 = Items,
// payType 1 = jewel; display 1 = mostra Txt_Limit «N days left» fino a endDate (0 per gli
// articoli permanenti).
//
//   node server/make-moogleshop.js

const fs = require('fs');
const path = require('path');

const OUT = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const schema = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json'), 'utf8'));

function blank(table) {
  const row = {};
  for (const [f, t] of schema[table]) row[f] = t.startsWith('string') ? '' : 0;
  return row;
}

const TAB_TRAITS = 1;
const TAB_ITEMS = 2;
const JEWEL = 1;
const rows = [];
function add(fields) {
  rows.push(Object.assign(blank('moogleshop'), {
    moogleshopId: rows.length + 1, sortId: rows.length + 1, payType: JEWEL, display: 0, frameType: 1,
    startDate: '2015-01-01 00:00:00', endDate: '2099-12-31 23:59:59',
  }, fields));
}

// Items: gemme (tabella material) x10 a 100 jewel e x100 a 1.000
const GEMS = [[47, 'Rainbow Gem'], [48, 'Power Gem'], [49, 'Speed Gem'], [50, 'Magic Gem'],
  [51, 'Sun Gem'], [52, 'Moon Gem'], [53, 'Brilliant Gem']];
for (const [id] of GEMS) {
  add({ type: TAB_ITEMS, itemType: 5, itemId: id, itemNum: 10, price: 100 });
  add({ type: TAB_ITEMS, itemType: 5, itemId: id, itemNum: 100, price: 1000 });
}
// Items: medaglie a 10 jewel (khuxwiki: Cid, Huey & Dewey & Louie, Chip, Dale 6★; Yen Sid
// 4★; Fairy Godmother 3★; Merlin 2★; Cheshire Cat ★)
for (const id of [90078, 90146, 90056, 90066, 90084, 90083, 90082, 90081]) {
  add({ type: TAB_ITEMS, itemType: 3, itemId: id, itemNum: 1, price: 10 });
}

// Traits (tabella shuffleskill, anch'essa assente): i trait della khuxwiki. Icona
// img/kakusei/Kakusei_Icon%04d.png = category (type x 10 (0010 gauge, 0020 HP, 0030-0050
// resistenze a veleno/paralisi/sonno, 0060/0061 nemici di terra/aria, 0070 raid,
// 0080 attacco extra, 0090 STR, 0100 DEF, dalle immagini). Campi del valore: ability
// (gauge), hp, poison/paralyze/sleep, enemyKind (1 terra, 2 aria) + enemyKindRate,
// raidKindRate, addDamage, attack, defense.
const traits = [];
function trait(type, name, fields) {
  // il client passa il nome per un formato printf: «%» va raddoppiato (senza, «DEF -60»)
  name = name.replace(/%/g, '%%');
  traits.push(Object.assign(blank('shuffleskill'), {
    // category = numero dell'icona (il client carica
    // img/kakusei/Kakusei_Icon%04d.png; un'icona inesistente lo manda in crash)
    // type 1 per tutti: con altri valori il client non mostra la riga (dei 13 compariva
    // solo quello con type 1); l'effetto lo danno category e i campi del valore
    shuffleSkillId: traits.length + 1, category: type * 10, type: 1, name, sortId: traits.length + 1,
  }, fields));
  return traits.length;
}
const MUNNY = 2;
const T = {
  gauge2: trait(1, 'Max Gauges +2', { ability: 2 }),
  hp300: trait(2, 'Max HP +300', { hp: 300 }),
  ground70: trait(6, 'Ground Enemy DEF -70%', { enemyKind: 1, enemyKindRate: 70 }),
  aerial70: trait(6, 'Aerial Enemy DEF -70%', { enemyKind: 2, enemyKindRate: 70, category: 61 }),
  extra50: trait(8, 'Extra Attack: 50% Power', { addDamage: 50 }),
  str1500: trait(9, 'STR +1500', { attack: 1500 }),
  raid50: trait(7, 'Damage in Raids +50%', { raidKindRate: 50 }),
  ground60: trait(6, 'Ground Enemy DEF -60%', { enemyKind: 1, enemyKindRate: 60 }),
  aerial60: trait(6, 'Aerial Enemy DEF -60%', { enemyKind: 2, enemyKindRate: 60, category: 61 }),
  extra40: trait(8, 'Extra Attack: 40% Power', { addDamage: 40 }),
  str1000: trait(9, 'STR +1000', { attack: 1000 }),
  raid40: trait(7, 'Damage in Raids +40%', { raidKindRate: 40 }),
  def2000: trait(10, 'DEF +2000', { defense: 2000 }),
};
// offerte a tempo come nello screenshot (STR +1000 / DEF +2000 a 1.000 jewel, 3 scambi,
// riga dorata, «N day left»); poi i trait a 100 jewel (02/2021) e a 5.000.000 munny
// scadenza: una settimana dopo la generazione della tabella (come le offerte settimanali)
const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + ' 23:59:59';
add({ type: TAB_TRAITS, shuffleSkillId: T.str1000, price: 1000, count: 3, frameType: 0, display: 1,
  endDate: weekEnd });
add({ type: TAB_TRAITS, shuffleSkillId: T.def2000, price: 1000, count: 3, frameType: 0, display: 1,
  endDate: weekEnd });
add({ type: TAB_TRAITS, shuffleSkillId: T.gauge2, price: 5000 });
add({ type: TAB_TRAITS, shuffleSkillId: T.hp300, price: 5000 });
for (const k of ['ground70', 'aerial70', 'extra50', 'str1500', 'raid50']) {
  add({ type: TAB_TRAITS, shuffleSkillId: T[k], price: 100 });
}
for (const k of ['ground60', 'aerial60', 'extra40', 'raid40']) {
  add({ type: TAB_TRAITS, shuffleSkillId: T[k], price: 5000000, payType: MUNNY });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'moogleshop.json'), JSON.stringify(rows));
fs.writeFileSync(path.join(OUT, 'shuffleskill.json'), JSON.stringify(traits));
// righe 901/902 del Burst (il client le legge senza controllo del null)
require('./make-guilt-burst').patch(OUT);
console.log(`moogleshop: ${rows.length} righe (Traits ${rows.filter((r) => r.type === TAB_TRAITS).length})`);
