// Prova delle stagioni dello Shop: node server/test-gacha-seasons.js
'use strict';
const path = require('path');
const fs = require('fs');
const s = require('./gacha-seasons');
const g = require('./gacha');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const U = (y, mo, d) => Date.UTC(y, mo - 1, d);
const keys = (ms) => s.activeSeasons(ms).map((a) => a.key);

const has = (ms, ...k) => k.every((x) => keys(ms).includes(x));
check(has(U(2026, 12, 31), 'newyear', 'holiday'), 'activeSeasons 31/12: newyear e holiday');
check(has(U(2027, 1, 5), 'newyear', 'holiday'), 'activeSeasons 5/1: newyear e holiday');
check(!keys(U(2027, 1, 18)).includes('newyear'), 'activeSeasons 18/1: niente newyear');
check(JSON.stringify(keys(U(2026, 10, 31))) === '["halloween"]', `activeSeasons 31/10: ${keys(U(2026, 10, 31))}`);
check(has(U(2026, 12, 1), 'blackfriday'), 'activeSeasons 1/12: blackfriday');
const ny = s.activeSeasons(U(2026, 12, 31)).find((a) => a.key === 'newyear');
check(ny && ny.start === U(2026, 12, 22) && ny.end === Date.UTC(2027, 0, 17, 23, 59, 59, 999), 'occorrenza newyear 2026-27');
const ny2 = s.activeSeasons(U(2027, 1, 5)).find((a) => a.key === 'newyear');
check(ny2 && ny2.start === U(2026, 12, 22), 'occorrenza newyear vista a gennaio');

check(s.editionOf({ rowId: 'B0072', start: '2017-01-01' }) === 2016, 'editionOf B0072');
check(s.editionOf({ rowId: 'B0219', start: '2017-12-22' }) === 2017, 'editionOf B0219');
check(s.editionOf({ rowId: 'B0774', start: '2020-12-22' }) === 2020, 'editionOf B0774');
check(s.seasonOf({ rowId: 'B0072' }) === 'newyear' && s.seasonOf({ rowId: 'B0001' }) === null, 'seasonOf');

const cat = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'gacha_catalog.json'), 'utf8'));
const ids = new Set(cat.banners.map((b) => b.rowId));
const sizes = new Set([1, 3, 10]);
const seen = new Set();
for (const se of s.SEASONS) for (const r of se.rowIds) {
  check(ids.has(r), `${r} manca nel catalogo`);
  check(!seen.has(r), `${r} in due stagioni`);
  seen.add(r);
}
const sb = (ms, q) => s.seasonBanners(cat.banners, ms, (b) => b.unlockQuest <= q && g.drawable(b, sizes));
const of = (r, k) => (r.find((x) => x.key === k) || { banners: [] }).banners.map((b) => b.rowId);
let r = sb(U(2026, 12, 8), 525);
check(JSON.stringify(of(r, 'blackfriday')) === '["B0066","B0067"]', `q525 8/12 blackfriday ${of(r, 'blackfriday')}`);
check(JSON.stringify(of(r, 'holiday')) === '["B0068"]', `q525 8/12 holiday ${of(r, 'holiday')}`);
r = sb(U(2026, 12, 28), 525);
check(JSON.stringify(of(r, 'holiday')) === '["B0068"]', 'q525 28/12 holiday');
check(JSON.stringify(of(r, 'newyear')) === '["B0072","B0073","B0074","B0075","B0076"]', `q525 28/12 newyear ${of(r, 'newyear')}`);
r = sb(U(2026, 12, 28), 705);
check(JSON.stringify(of(r, 'newyear')) === '["B0219"]', `q705 28/12 newyear ${of(r, 'newyear')}`);
check(sb(U(2026, 12, 28), 300).length === 0, 'q300 28/12: nessuna stagione');
check(r.every((x) => x.end > U(2026, 12, 28)), 'seasonBanners end');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: gacha-seasons');
