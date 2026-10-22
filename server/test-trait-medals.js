// Prova delle Trait Medal nel master (I-084 parte B, make-trait-medal-list.js, make-trait-medals.js):
//   node server/test-trait-medals.js [cartella master]   (default server/master_data)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const read = (dir, n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));

const tl = require('./make-trait-medal-list');
check(tl.label('{{EX|Illustrated KH Riku}}') === 'Illustrated KH Riku [EX]', 'etichetta EX');
check(tl.label('{{b|Sephiroth|EX+}}') === 'Sephiroth [EX+]', 'etichetta b');
check(tl.label('[[Supernova - Key Art 19]]') === 'Supernova - Key Art #19', 'etichetta Key Art');

const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'trait_medals.json'), 'utf8'));
check(list.length === 313, `elenco: ${list.length}`);
const e1 = list.find((e) => e.n === 1), e130 = list.find((e) => e.n === 130);
check(e1 && e1.affected === 301426 && e1.album === 985, `#1 -> Illustrated KH Riku [EX]: ${JSON.stringify(e1)}`);
check(e130 && e130.name === 'SN - KH III Xemnas', `#130: ${JSON.stringify(e130)}`);
// #189-#313 dalle pagine della khuxwiki (ricerca del 19-10)
const e190 = list.find((e) => e.n === 190), e312 = list.find((e) => e.n === 312);
check(e190 && e190.name === 'SN++ - KH III Roxas', `#190: ${JSON.stringify(e190)}`);
check(e312 && e312.name === 'Key Art #8' && e312.label === 'Key Art 8', `#312: ${JSON.stringify(e312)}`);
check(tl.pageName('Illustrated Kairi (EX)') === 'Illustrated Kairi [EX]' && tl.pageName('SN++ - Stained Glass 10') === 'SN++ - Stained Glass #10', 'nomi delle pagine');

const tm = require('./make-trait-medals');
const medal = read(MASTER, 'medal');
const burst = read(MASTER, 'burst');
const byId = new Map(medal.map((r) => [r.medalId, r]));
const t1 = byId.get(tm.traitMedalId(1));
check(t1, 'riga Trait Medal #1');
if (t1) {
  check(t1.name === 'Trait Medal #1' && t1.type === 9 && t1.rare === 6, 'nome, type 9, 6★');
  check(t1.attack === 1 && t1.maxAttack === 1 && t1.defense === 1 && t1.maxDefense === 1 && t1.cost === 999, 'STR/DEF 1, costo 999');
  check(t1.addPetPt === 15 && t1.sortId === 985 && t1.validPack === 1 && t1.shuffleskillSlot === 0, '15 Pet Point, Album 985, impilabile, senza slot');
  check(t1.shuffleSkillGroupId === byId.get(301426).shuffleSkillGroupId, 'gruppo dei trait della medaglia');
  check(t1.imageId === t1.medalId && t1.thumbId === t1.medalId, 'immagini proprie');
  // Tier 1: la guilt si sblocca (khuxwiki) ma la Trait Medal non vale come la sua medaglia (sub-slot, missioni)
  check(t1.guiltValue === 1 && !t1.addGuiltBurstLv && !t1.addGuiltBurstLvMax, `Tier della Trait Medal: ${t1.guiltValue}`);
  const b = burst.find((x) => x.burstId === t1.burstId);
  check(b && b.name === 'Lesser Attack' && b.target === 1 && b.gauge === 1 && b.displayPower === 10000, `Lesser Attack: ${b && [b.name, b.target, b.gauge, b.displayPower]}`);
}
check(medal.filter(tm.isTraitMedal).length === 313, `righe type 9: ${medal.filter(tm.isTraitMedal).length}`);
// pallino: tutta la linea (6★, 7★, boosted) ha la Trait Medal in burstEnhanceCategory
const line = medal.filter((r) => r.shuffleSkillGroupId === byId.get(301426).shuffleSkillGroupId && r.shuffleskillSlot > 0);
check(line.length >= 4 && line.every((r) => r.burstEnhanceCategory[0] === tm.traitMedalId(1)), `linea di #1: ${line.map((r) => r.medalId + ':' + r.burstEnhanceCategory)}`);
const xem = medal.filter((r) => r.name === 'SN+ - KH III Xemnas');
check(xem.length && xem.every((r) => r.burstEnhanceCategory.includes(tm.traitMedalId(130))), 'SN+ - KH III Xemnas collegata a #130');

// Album: la Trait Medal non e' una voce
const album = require('./routes-info-album');
const a = album.albumData([{ medalId: tm.traitMedalId(1), guiltFactor: 0 }], medal, () => 0).userAlbum;
check(a.albumMedals.length === 0, `album con la sola Trait Medal: ${JSON.stringify(a.albumMedals)}`);
const full = album.albumData([], medal.filter((r) => !tm.isTraitMedal(r)), () => 0).userAlbum.allMedalCount;
check(album.albumData([], medal, () => 0).userAlbum.allMedalCount === full, 'allMedalCount senza Trait Medal');

// idempotente
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-tm-'));
for (const n of ['medal', 'burst']) fs.copyFileSync(path.join(MASTER, n + '.json'), path.join(tmp, n + '.json'));
const log = console.log; console.log = () => {};
tm.patch(tmp);
console.log = log;
for (const n of ['medal', 'burst']) check(fs.readFileSync(path.join(tmp, n + '.json'), 'utf8') === fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'), `${n} cambia alla seconda esecuzione`);
fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: trait-medals');
