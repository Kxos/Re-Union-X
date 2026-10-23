// Missioni Beginner (make-beginner-missions.js, server.js MISSION_DERIVED / MISSION_COUNTER): node server/test-beginner.js
// Controlla: 35 Draw Medal (una per estrazione riuscita, non per medaglia; un rifiuto non conta), 39 Nova (livello del
// Guilt Burst), 40 Spirit (rango della Gear), 30 (storia, non il Tour), e che le condizioni senza funzione restino a 0.
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo nuovo.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-beginner-${process.pid}.json`);
const BANNERS = path.join(os.tmpdir(), `khux-test-beginner-banners-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_PET = '1';
process.env.KHUX_GACHA_BANNERS = BANNERS;
process.env.KHUX_GACHA_SIZES = '1,3,10';
delete process.env.KHUX_GACHA_SHOW; delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
delete process.env.KHUX_GUILT_BURST_LV;
const realNowFn = Date.now;
Date.now = () => Date.parse('2026-10-16T15:00:00Z');
// catalogo sintetico nel formato di gacha_catalog.json (test-gacha-server.js); giocatore nuovo: storia a 0
const banner = (o) => ({ type: 'TIME_LIMITED', flags: [], start: '2016-04-07', end: '2016-04-30', endSource: 'original', unlockQuest: 0, payType: 1,
  currency: 'jewel', epicBoost: false, dayLimit: 0, vipFree: false, pool: { mode: 'released', sets: [], names: [], featured: [], filter: [] },
  guarantee: { list: [], count: 0, pity: null, every: null }, skill: null, bonus: [], catalogOnly: null, ...o });
const banners = [
  banner({ drawMedalTypeId: 10001, rowId: 'B0001', name: 'DAILY DEAL!', flags: ['PERMANENT', 'DAY_LIMITED'], end: '2018-01-31', prices: [600], lotCount: 3, rarityMix: [[4, 1], [3, 2]], dayLimit: 1 }),
  banner({ drawMedalTypeId: 10011, rowId: 'B0011', name: 'Epic Medal Carnival', prices: [3000], lotCount: 10, rarityMix: [[3, 10]] }),
];
const catalog = { firstRarity: { 3: '2016-04-07', 4: '2016-04-07', 5: '2016-04-07' }, story: [[1, 525, '2016-04-07'], [526, 979, '2017-01-12']], subsets: {},
  medals: { wakka: { date: '2016-04-07', ids: [[11013, 3, '2016-04-07'], [11014, 4, '2016-04-07']], std: true } }, banners };
fs.writeFileSync(BANNERS, JSON.stringify(catalog));
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const row = (cond, num) => t.masterRows('mission').find((r) => r.missionType === 1 && r.conditionId === cond && r.targetNum[0] === num);
const st = (id) => quiet(() => t.missionsData()).find((m) => m.id === id);

check(t.masterRows('mission').filter((r) => r.missionType === 1).length === 34, '34 righe Beginner');

// 35 Draw Medal: una per richiesta riuscita, di qualunque taglia
const d3 = row(35, 3), d7 = row(35, 7);
check(d3 && d7 && t.MISSION_COUNTER[35] === 'draw', 'contatore 35 = draw');
check(st(d3.id).numUpper === 0 && st(d3.id).status === 0, 'draw: parte da 0');
p.freeStone = 100000;
let r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 3 });
check(r.userMedalIds && r.userMedalIds.length === 3, 'draw x3 riuscita');
check(st(d3.id).numUpper === 1, `draw x3 (3 medaglie) conta 1, non 3: ${st(d3.id).numUpper}`);
r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 3 }); // Daily gia' usato: rifiutata
check(!r.userMedalIds && st(d3.id).numUpper === 1, 'estrazione rifiutata (Daily) non conta');
r = call(t.respondGachaDraw, { drawMedalTypeId: 9001, count: 1 }); // Catalog: rifiutata
check(!r.userMedalIds && st(d3.id).numUpper === 1, 'estrazione rifiutata (Catalog) non conta');
r = call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(r.userMedalIds && r.userMedalIds.length === 10, 'draw x10 riuscita');
check(st(d3.id).numUpper === 2 && st(d3.id).status === 0, `draw x10 conta 1: ${st(d3.id).numUpper}`);
r = call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(st(d3.id).numUpper === 3 && st(d3.id).status === 1, 'tre estrazioni: Draw x3 da riscuotere');
check(st(d7.id).numUpper === 3 && st(d7.id).status === 0, 'Draw x7 a 3/7');
for (let i = 0; i < 4; i++) call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(st(d7.id).numUpper === 7 && st(d7.id).status === 1, 'sette estrazioni: Draw x7 da riscuotere');
const skip = p.superSkipTicket || 0, plain = p.stageSkipTicket || 0;
call(t.respondMissionReceive, { receiveMissionIds: [d3.id] });
check((p.superSkipTicket || 0) === skip + 5, `premio Draw x3: 5 Skip Ticket+ (${skip} -> ${p.superSkipTicket})`);
check((p.stageSkipTicket || 0) === plain, 'premio Draw x3: nessuno Skip Ticket normale');

// 39 Nova = livello del Guilt Burst (+1 prima guilt, +5 prima guilt massima)
const n20 = row(39, 20), n50 = row(39, 50);
p.guiltBurst = { first: [], max: [] };
check(st(n20.id).numUpper === 0, 'Nova: 0 senza guilt');
const medalRows = t.masterRows('medal');
const firsts = medalRows.slice(0, 20).map((m) => m.medalId);
const lvOf = (ids, mx) => ids.reduce((s, id) => s + (medalRows.find((m) => m.medalId === id)?.addGuiltBurstLv || 1), 0) + mx.reduce((s, id) => s + (medalRows.find((m) => m.medalId === id)?.addGuiltBurstLvMax || 5), 0);
p.guiltBurst = { first: firsts, max: [] };
check(t.userPointData(0).guiltBurstLv === lvOf(firsts, []), 'Nova: userPoint.guiltBurstLv = somma delle prime guilt');
check(st(n20.id).numUpper === Math.min(20, t.guiltBurst().level()) && st(n20.id).status === (t.guiltBurst().level() >= 20 ? 1 : 0), 'Nova: LV 20 segue il livello del Burst');
p.guiltBurst = { first: firsts.slice(0, 5), max: firsts.slice(0, 3) }; // 5 + 3x5 = 20
check(t.guiltBurst().level() === lvOf(firsts.slice(0, 5), firsts.slice(0, 3)), 'Nova: +5 per guilt massima');
check(st(n20.id).numUpper === Math.min(20, t.guiltBurst().level()), 'Nova: 20 con 5 prime + 3 massime');
process.env.KHUX_GUILT_BURST_LV = '49';
check(st(n20.id).status === 1 && st(n50.id).status === 0 && st(n50.id).numUpper === 49, 'Nova 49: LV20 si, LV50 no (49/50)');
process.env.KHUX_GUILT_BURST_LV = '50';
check(st(n50.id).status === 1, 'Nova 50: LV50 completata');
delete process.env.KHUX_GUILT_BURST_LV;

// 40 Spirit = rango della Gear (petRank, punti dalle medaglie nei 6 slot)
const s2 = row(40, 2), s3 = row(40, 3);
p.pet = p.pet || {};
p.pet.subslot = [];
check(t.petSubslotNow().rank === 1 && st(s2.id).numUpper === 1 && st(s2.id).status === 0, 'Spirit: Gear vuota = rango 1');
const strong = medalRows.filter((m) => (m.addPetPt || 0) > 0).sort((a, b) => b.addPetPt - a.addPetPt).slice(0, 6);
check(strong.length === 6, 'servono 6 medaglie con addPetPt');
const ids = strong.map((m) => { quiet(() => t.grantItem(3, m.medalId, 1)); return p.medals[p.medals.length - 1].userMedalId; });
p.pet.subslot = ids.slice(0, 1);
const rank1 = t.petSubslotNow().rank;
p.pet.subslot = ids;
const rankAll = t.petSubslotNow().rank;
check(rankAll >= 3 && rankAll >= rank1, `Spirit: rango con 6 medaglie ${rankAll} (con 1: ${rank1})`);
check(st(s2.id).numUpper === 2 && st(s2.id).status === 1 && st(s3.id).numUpper === 3 && st(s3.id).status === 1, 'Spirit: rango 2 e 3 completate');
check(t.MISSION_DERIVED[40]() === rankAll, 'Spirit: derivata = rango');

// 30: la storia, non il Tour (lastClearStageId viene portato dal Tour oltre la storia)
const q130 = row(30, 1) && t.masterRows('mission').find((r) => r.missionType === 1 && r.conditionId === 30 && r.targetId[0] === 130);
p.stageScores = { 1010: 0, 991005: 0 };
p.lastClearStageId = 991005;
check(st(q130.id).numUpper === 0, 'storia 130: un Tour non la completa');
const q6 = t.masterRows('mission').find((r) => r.missionType === 1 && r.conditionId === 30 && r.targetId[0] === 6);
const story = t.masterRows('stage').find((s) => s.id === 6);
p.stageScores[story.stageId] = 0;
check(st(q6.id).numUpper === 1, 'storia 6: completata dallo stage 6');

// senza funzione: restano a 0 (3 Raid Boss, 36-38 quest speciali/Proud Quest, 42 eventi, 43 Colosseo, 44 Union Cross;
// 41 Proud Mode ha la sua prova in test-proud.js e resta a 0 senza Proud superate)
for (const c of [3, 36, 37, 38, 41, 42, 43, 44]) {
  for (const x of t.masterRows('mission').filter((m) => m.missionType === 1 && m.conditionId === c)) check(st(x.id).numUpper === 0, `condizione ${c} deve restare a 0`);
}

Date.now = realNowFn;
for (const f of [SAVE, BANNERS]) try { fs.unlinkSync(f); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: missioni Beginner (35 draw, 39 Nova, 40 Spirit, 30 storia, 0 dove manca la funzione)');
