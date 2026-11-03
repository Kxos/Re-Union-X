// Spirit Blind Box (pet-draw.js, server/pet_draws.json): node server/test-pet-draw.js
'use strict';
const path = require('path');
const pd = require('./pet-draw');
const { petPartsRows } = require('./make-pet-parts');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- fixture ---
const rows = [{ petPartsId: 303001, name: 'Pink Kitstar Ears' }, { petPartsId: 304030, name: 'Red Squirrelstar Head' },
  { petPartsId: 402114, name: 'Beige Aviator Hat' }, { petPartsId: 405001, name: 'Collar' }, { petPartsId: 410001, name: 'Bubbles' }];
const data = { banners: [
  { rowId: 'B0775', drawPetTypeId: 775, start: '2021-01-01', end: '2021-01-14', price: 500, pool: ['Beige Aviator Hat', 'Kite'] },
  { rowId: 'B0810', drawPetTypeId: 810, start: '2021-02-25', end: '2021-06-29', price: 100, extend: 'unobtainable', pool: ['Red Squirrelstar Head'] },
] };
const bs = pd.loadDraws(rows, data);
check(bs[0].poolIds.join() === '402114' && bs[0].missing.join() === 'Kite', `pool ids by name, a name without a row reported (${bs[0].poolIds} / ${bs[0].missing})`);
let bad = false; try { pd.loadDraws(rows, { banners: [data.banners[0], { ...data.banners[1], drawPetTypeId: 775 }] }); } catch { bad = true; }
check(bad, 'duplicate drawPetTypeId rejected');
const story = [[1, 100, '2016-04-07'], [101, 200, '2020-12-20'], [201, 300, '2021-01-20'], [301, 400, '2021-02-20']];
check(pd.unlockQuest(story, '2021-01-01') === 101 && pd.unlockQuest(story, '2021-02-25') === 301 && pd.unlockQuest(story, '2016-01-01') === 1, 'unlockQuest: tranche containing the start');
bs.forEach((b) => { b.unlockQuest = pd.unlockQuest(story, b.start); });
// listed: the Shop week; the kept one only when past
const names = (l) => l.map((b) => b.rowId).join();
check(names(pd.listed(bs, { shopFrom: '2021-01-08', shopTo: '2021-01-14', storyQuest: 150, periodStart: '2020-12-20' })) === 'B0775', 'listed in its week');
check(names(pd.listed(bs, { shopFrom: '2021-02-20', shopTo: '2021-02-26', storyQuest: 350, periodStart: '2021-02-20' })) === 'B0810', 'B0810 from its start (story February 2021)');
check(names(pd.listed(bs, { shopFrom: '2021-02-20', shopTo: '2021-02-26', storyQuest: 350, periodStart: '2021-02-20', keptRowId: 'B0775' })) === 'B0775,B0810', 'a kept past deal first');
check(names(pd.listed(bs, { shopFrom: '2020-12-20', shopTo: '2020-12-26', storyQuest: 150, periodStart: '2020-12-20', keptRowId: 'B0810' })) === '', 'a future deal cannot be kept');
check(!pd.keepable(bs[0], { periodStart: '2021-01-10', storyQuest: 999 }) && pd.keepable(bs[0], { periodStart: '2021-01-20', storyQuest: 999 }), 'keepable once ended');
// draws: never an owned part; sold out = null; extend gives the parts without another source
const owned = new Set([303001]);
const el = pd.elsewhereIds((t) => ({ mission: [{ rewardType: 33, itemId: 405001 }], sphereMasu: [{ rewardSelect: [3, 33], rewardId: [9, 303001] }] }[t]), bs);
check([...el].sort().join() === [303001, 304001, 306001, 308001, 309001, 304030, 402114, 405001].sort().join(), `elsewhere: starter, missions, boards, pools (${[...el]})`);
check(pd.drawPart(bs[0], owned, rows, el).petPartsId === 402114, 'the only part not owned');
check(pd.drawPart(bs[0], new Set([402114]), rows, el) === null, 'sold out (B0775 has no extension)');
const x = pd.drawPart(bs[1], new Set([304030]), rows, el);
check(x && x.petPartsId === 410001 && x.extended && x.left === 0, `B0810 extension: the part without a source (${JSON.stringify(x)})`);
check(pd.drawPart(bs[1], new Set([304030, 410001]), rows, el) === null, 'B0810 sold out once everything is owned');
// uniform pick
const many = pd.loadDraws(rows, { banners: [{ rowId: 'X', drawPetTypeId: 1, start: '2021-01-01', end: '2021-01-02', price: 100, pool: rows.map((r) => r.name) }] })[0];
const got = new Set(); for (let i = 0; i < 200; i++) got.add(pd.drawPart(many, new Set(), rows, el).petPartsId);
check(got.size === rows.length, 'every pool part can come out');

// --- real data ---
const real = pd.loadDraws(petPartsRows());
check(real.map((b) => b.rowId).join() === 'B0197,B0206,N36849-1,N36849-2,B0775,B0810', `deals ${real.map((b) => b.rowId)}`);
const by = Object.fromEntries(real.map((b) => [b.rowId, b]));
check(by.B0810.price === 100 && by.B0810.start === '2021-02-25' && by.B0810.end === '2021-06-29' && by.B0810.extend === 'unobtainable', 'B0810: 100 Jewels, 2021-02-25 to the end of service, extended');
check(by.B0810.poolIds.length + by.B0810.missing.length === 78 && by.B0775.poolIds.length + by.B0775.missing.length === 22
  && by.B0197.poolIds.length === 16 && by.B0206.poolIds.length === 17, 'pool sizes of the notices (78, 22, 16, 17)');
// only reconstructed (unapproved) parts may be missing
const status = require('./make-pet-parts').partStatus();
const allRows = petPartsRows(undefined, { previewRecon: true });
const recon = new Set(allRows.filter((r) => status.get(r.petPartsId) === 'recon').map((r) => r.name));
check(real.every((b) => b.missing.every((n) => recon.has(n))), `pool names missing from petParts that are not reconstructed parts: ${real.flatMap((b) => b.missing.filter((n) => !recon.has(n)))}`);
check(pd.loadDraws(allRows).every((b) => !b.missing.length), 'every pool name is a part (with the reconstructed ones)');
check(by.B0810.poolIds.includes(407043), 'Flying Carpet (407043) in B0810');
check(require(path.join(__dirname, 'pet_draws.json')).banners.every((b) => new Set(b.pool).size === b.pool.length), 'no part twice in a pool');

if (errors.length) { console.error('test-pet-draw: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('test-pet-draw: OK');
