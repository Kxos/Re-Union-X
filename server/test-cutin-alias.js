// Prova delle righe alias del cut-in (make-cutin-alias.js, I-187):
//   node server/test-cutin-alias.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { aliasRows, patch, cutinRowId, isCutinAlias } = require('./make-cutin-alias');
const { isBoosted } = require('./medal-boost');
const { albumData } = require('./routes-info-album');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// gli id che finiscono in 2 o 4 cercano la riga id-1
check(cutinRowId(300444) === 300443 && cutinRowId(300442) === 300441 && cutinRowId(300443) === 300443 && cutinRowId(10) === 10,
  'cutinRowId come il client');

const lex = { medalId: 300444, name: 'Lexaeus A', cutinId: 300444, darklight: 2, rare: 7, type: 1, validBurst: 1, burstId: 3000444,
  groupId: 0, sortId: 1111, listSortId: 1111, validPack: 0 };
const se3 = { medalId: 10003, name: 'Goofy', cutinId: 10003, darklight: 1, rare: 3, type: 1, validBurst: 1, groupId: 0 };
const se4 = { ...se3, medalId: 10004, rare: 4 };                    // SE: la 3★ c'e', niente alias
const boosted = { ...lex, medalId: 1300444, groupId: 300444 };      // boosted che finisce in 4: alias verso la normale
const noBurst = { ...lex, medalId: 9000004, validBurst: 0, type: 9 }; // Trait Medal: nessuno speciale
const trait = { medalId: 9000001, type: 9, validBurst: 1, name: 'Trait Medal 1' };
const rows = [lex, se3, se4, boosted, noBurst, trait];

const a = aliasRows(rows);
const ids = a.map((r) => r.medalId).sort((x, y) => x - y);
check(JSON.stringify(ids) === JSON.stringify([300443, 1300443]), `alias solo dove manca id-1 e c'e' lo speciale: ${ids}`);
const al = a.find((r) => r.medalId === 300443);
check(al && al.cutinId === 300444 && al.darklight === 2 && al.name === 'Lexaeus A', 'alias con cut-in, darklight e nome della medaglia');
check(al && al.groupId === 300444 && isBoosted(al), 'alias fuori da Album/elenchi (groupId = la medaglia)');
check(a.find((r) => r.medalId === 1300443)?.groupId === 300444, 'alias di una boosted: groupId = la normale');

const all = new Map([...rows, ...a].map((r) => [r.medalId, r]));
check(a.every((r) => isCutinAlias(r, all)) && rows.every((r) => !isCutinAlias(r, all)), 'isCutinAlias riconosce solo gli alias');

// Album: l'alias non e' una voce e non conta
const album = albumData([], [...rows, ...a], () => 0).userAlbum;
const without = albumData([], rows, () => 0).userAlbum;
check(album.allMedalCount === without.allMedalCount, `album: alias fuori dal conteggio (${album.allMedalCount} / ${without.allMedalCount})`);

// patch: idempotente, non tocca le righe esistenti
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutin-'));
fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify(rows));
patch(dir); patch(dir);
const out = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8'));
check(out.length === rows.length + 2, `patch due volte: ${out.length} righe`);
check(JSON.stringify(out.filter((r) => !isCutinAlias(r, new Map(out.map((x) => [x.medalId, x]))))) === JSON.stringify(rows), 'righe esistenti invariate');
check(out[out.length - 1].medalId === 9000001, 'alias prima delle Trait Medal');
// la medaglia originale non deve piu' restare senza riga per il cut-in
const byId = new Set(out.map((r) => r.medalId));
check(out.filter((r) => r.validBurst).every((r) => byId.has(cutinRowId(r.medalId))), 'ogni medaglia con speciale trova la riga del cut-in');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('test-cutin-alias: ok');
