// Spirit Blind Box routes in server.js (03-11): node server/test-pet-draw-server.js
// Real master and banner catalogue, temporary save; KHUX_PET=1 and KHUX_PET_DRAW=1.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-petdraw-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.on('exit', () => { try { fs.unlinkSync(SAVE); } catch { /* gone */ } });
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_PET = '1';
process.env.KHUX_PET_DRAW = '1';
delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
const ms0 = Date.parse('2026-11-03T15:00:00Z');
Date.now = () => ms0;
const log = console.log, logs = [];
const quiet = (fn) => { console.log = (...a) => logs.push(a.join(' ')); try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const pd = require('./pet-draw');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const raw = (fn, ...a) => { let b = null, code = 0; quiet(() => fn({ writeHead(c) { code = c; }, end(x) { b = x; } }, ...a)); return { body: String(b), code }; };

call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const setQuest = (q) => { p.stageScores = { [t.masterRows('stage').find((r) => r.id === q).stageId]: 1 }; delete (p.gacha || {}).rot; };
const KEYS = ['drawPetTypeId', 'drawType', 'sortId', 'payType', 'price', 'lotName', 'lotCount', 'bannerUrl', 'mypageBanner', 'totalCount', 'restCount'];

// before the Spirit Blind Box of February 2021: none of the 2021 deals
setQuest(900);
let l = call(t.respondGachaList);
check(Array.isArray(l.petGachaList) && !l.petGachaList.some((x) => x.drawPetTypeId === 20810), `quest 900: no B0810 (${JSON.stringify(l.petGachaList.map((x) => x.drawPetTypeId))})`);
// story February 2021: B0810 listed, every key of the client parser, drawType 11, price 100
setQuest(965);
l = call(t.respondGachaList);
const bb = l.petGachaList.find((x) => x.drawPetTypeId === 20810);
check(bb && KEYS.every((k) => k in bb) && Object.keys(bb).length === KEYS.length, `B0810 plate keys (${bb && Object.keys(bb)})`);
check(bb && bb.drawType === 11 && bb.payType === 1 && bb.price === 100 && bb.lotCount === 1 && /\/web\/gacha\/petimg\/20810\.png$/.test(bb.bannerUrl), 'B0810: drawType 11, 100 Jewels, 1 part');
check(bb && bb.totalCount > 78 && bb.restCount === bb.totalCount, `B0810 counter: pool + extension, nothing owned (${bb && bb.restCount}/${bb && bb.totalCount})`);
check(l.gachaList.every((g) => g.sortId !== bb.sortId) && bb.sortId > 1, 'pet sortId apart from the medal plates and the Catalog');
// master drawPetType: Details opens detailUrl as given, so it must be absolute like drawMedalType (a path = «file not found», bench 03-11)
const mrow = t.servedMasterRows('drawPetType', Date.now()).find((r) => r.drawPetTypeId === 20810);
check(mrow && /^http:\/\/.+\/web\/gacha\/petdetail\/20810$/.test(mrow.detailUrl) && /^http:\/\/.+\/web\/gacha\/petimg\/20810\.png$/.test(mrow.bannerUrl), `drawPetType urls absolute (${mrow && mrow.detailUrl})`);
// draw: refused without Jewels, then one part not owned, Jewels charged, response contract
p.freeStone = 50;
let r = call(t.respondPetDraw, { drawPetTypeId: 20810 });
check(Object.keys(r).join() === 'ret', 'not enough Jewels: {ret} only');
p.freeStone = 1000;
r = call(t.respondPetDraw, { drawPetTypeId: 20810 });
const part = r.pet?.userPetParts?.[0];
check(part && r.effectNumbers.length >= 1 && r.effectNumbers[0] !== 0 && r.petGachaBonus?.addType === 1 && r.userData?.userPoint && r.userData?.userDetail?.isPet === 1, `draw response contract (${JSON.stringify(r).slice(0, 200)})`);
const pool810 = pd.loadDraws(t.masterRows('petParts')).find((b) => b.rowId === 'B0810').poolIds;
check(part && pool810.includes(part.petPartsId) && p.pet.parts[part.petPartsId] && p.freeStone === 900, `the part is from the pool, owned now, 100 Jewels spent (${part && part.petPartsId}, ${p.freeStone})`);
check(['petPartsId', 'partsType', 'getDatetime'].every((k) => k in part) && part.partsType === Math.floor(part.petPartsId / 1000) % 100, 'userPetParts element');
const keys = Object.keys(r.petGachaBonus).sort().join();
check(keys === ['addType', 'number', 'pet', 'userAvatarParts', 'userDecks', 'userKeybladeSubslots', 'userKeyblades', 'userMaterials', 'userMedals', 'userSkills', 'userTitles'].sort().join(), `petGachaBonus keys ${keys}`);
// never a part already owned: own all of the pool but one
for (const id of pool810) if (id !== pool810[5]) p.pet.parts[id] = '2021-03-01 00:00:00';
p.freeStone = 1000;
r = call(t.respondPetDraw, { drawPetTypeId: 20810 });
check(r.pet?.userPetParts?.[0]?.petPartsId === pool810[5], `last part of the pool (${r.pet?.userPetParts?.[0]?.petPartsId})`);
// pool owned: the extension (not original) gives a part without another source
r = call(t.respondPetDraw, { drawPetTypeId: 20810 });
const ext = r.pet?.userPetParts?.[0]?.petPartsId;
check(ext && !pool810.includes(ext), `extension part (${ext})`);
l = call(t.respondGachaList);
const bb2 = l.petGachaList.find((x) => x.drawPetTypeId === 20810);
check(bb2.restCount === bb2.totalCount - pool810.length - 1, `counter after the pool (${bb2.restCount}/${bb2.totalCount})`);
// a deal not in the Shop is refused
r = call(t.respondPetDraw, { drawPetTypeId: 20197 });
check(Object.keys(r).join() === 'ret', 'B0197 (2017) not in the Shop: refused');
// Keep: a past deal (B0775, January 2021) from the Catalog; a future one cannot
const post = (u) => raw(t.respondGachaPost, u);
check(post('/web/gacha/pinpet/20775').code === 200 && p.gacha.pinnedPet === 'B0775', 'keep B0775');
l = call(t.respondGachaList);
check(l.petGachaList.some((x) => x.drawPetTypeId === 20775), 'kept deal in the Shop');
setQuest(900);
check(post('/web/gacha/pinpet/20810').code === 409, 'a future deal cannot be kept');
check(!call(t.respondGachaList).petGachaList.some((x) => x.drawPetTypeId === 20775), 'kept deal not shown before its date');
check(post('/web/gacha/unpinpet').code === 200 && !p.gacha.pinnedPet, 'remove the kept deal');
// pages
setQuest(965);
const det = raw(t.respondGachaWeb, '/web/gacha/petdetail/20810?from=catalog');
check(det.code === 200 && /100 Jewels/.test(det.body) && /Flying Carpet/.test(det.body) && /Not original/.test(det.body), 'Details page');
const odds = raw(t.respondGachaWeb, '/web/gacha/petodds/20810');
check(odds.code === 200 && /same chance/.test(odds.body) || /every part/.test(odds.body), 'Draw Odds page');
const cat = raw(t.respondGachaWeb, '/web/gacha/catalog');
check(/Spirit Blind Box \(6\)/.test(cat.body) && /pinpet|petdetail\/20775/.test(cat.body), 'Banner Catalog section');
// filters (user 03-11): BANNER TYPE group, Spirit rows with the medal rows' data attributes inside a .cat of a .ksec section
check(cat.body.includes('<h4>BANNER TYPE</h4>') && cat.body.includes('>Spirit parts<'), 'catalogue: BANNER TYPE filter');
const prow = [...cat.body.matchAll(/<div class="b (\w+)" id="p(\d+)" data-year="(\d)" data-pay="jewel" data-vip="0" data-free="0" data-state="(\w+)" data-kind="spirit">/g)];
check(prow.length === 6 && prow.every((r) => r[1] === r[4]), `catalogue: 6 Spirit rows with data-* (${prow.length})`);
check(/<div class="ksec"><h2 id="spirit">[\s\S]*?<div class="cat">/.test(cat.body), 'catalogue: Spirit rows in .ksec .cat');
// Keep in the catalogue row (user 03-11): past deals at Q965 (Shop week of February 2021) get the button, the current one not
const keepBtn = (id) => new RegExp(`class="pk" data-k="pet" data-id="${id}" data-pin="/web/gacha/pinpet/${id}" data-on="1"`).test(cat.body);
check(keepBtn(20775) && !keepBtn(20810), 'catalogue: Keep button on the past deal B0775, none on the current B0810');
check(call(t.respondGachaPost, '/web/gacha/pinpet/20775')?.ok === true, 'pinpet answers ok');
const cat2 = raw(t.respondGachaWeb, '/web/gacha/catalog');
check(/data-k="pet" data-id="20775" data-pin="\/web\/gacha\/unpinpet" data-on="0">Remove from the Shop/.test(cat2.body), 'catalogue: kept deal shows Remove');
// master drawPetType: a row for every deal, all fields (client parser FUN_00f15760)
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'drawPetType.json'), 'utf8'));
check(rows.length === 6 && rows.every((x) => x.drawType === 11 && Object.keys(x).length === 24 && Object.values(x).every((v) => typeof v === 'string' || v >= 0)), 'tables/drawPetType.json: 6 rows, 24 fields, integers >= 0');

if (errors.length) { console.error('test-pet-draw-server: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('test-pet-draw-server: OK');
