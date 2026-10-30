// Tab Special nel server (Task 5 del piano 2026-10-30-special-tab): /stage/event con eventCategory 1, functionFlags,
// /stage/clear di uno stage Special (storia ferma, drop di medaglie), Progress di /stage/achievements, reset del
// Daily Cid, righe evStage servite e immagini dei banner. Dati locali: server/game_data/special.json, master_data.
//   node server/test-special-server.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
// salvataggio temporaneo: mai server/save/
const SAVE = path.join(os.tmpdir(), `khux-test-special-server-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
delete process.env.KHUX_VIP;
delete process.env.KHUX_BENCH_STEAL_UID;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-27T09:00:00Z'); // martedi' 09:00 UTC (giorno di gioco martedi')
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const server = quiet(() => require('./server'));
const { _test: t } = server;
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const raw = (fn, ...a) => {
  const out = { code: 0, headers: {}, body: null };
  quiet(() => fn({ writeHead(c, h) { out.code = c; out.headers = h || {}; }, end(x) { out.body = x; } }, ...a));
  return out;
};
const p = t.player;
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const stages = t.masterRows('stage');
const sid = (q) => stages.find((r) => r.stageKind === 1 && r.id === q).stageId;
const ev = (cat) => call(t.respondStageEvent, { eventCategory: cat });
const byId = (list, id) => list.find((e) => e.eventStageId === id);

// 1. sblocco dopo la missione 6 (misc 122): prima nessun evento Special
p.stageScores = {}; p.clearMissions = {};
check(ev(1).events.length === 0, 'giocatore nuovo: Special non vuoto');
p.stageScores[sid(5)] = 1;
check(ev(1).events.length === 0, 'missione 5: Special non vuoto');
p.stageScores[sid(6)] = 1;
const q6 = ev(1).events;
check(q6.length >= 1 && q6[0].eventStageId === 7000, `missione 6 (periodo 1): ${q6.map((e) => e.eventStageId)}`);

// 2. storia nel periodo 4 (missione 925, giugno 2020), martedi'
p.stageScores[sid(925)] = 1;
let list = ev(1).events;
check(list[0] && list[0].eventStageId === 7000, `primo evento ${list[0] && list[0].eventStageId}`);
check(byId(list, 7012) && byId(list, 7012).isLock === 0, `EXP & Evolve Power (martedi'): isLock ${byId(list, 7012)?.isLock}`);
check(byId(list, 7011) && byId(list, 7011).isLock === 1, `Evolve Legendary (lunedi'): isLock ${byId(list, 7011)?.isLock}`);
check(list.every((e) => e.bannerUrl.startsWith(t.WEB_BASE + '/web/special/img/')), 'bannerUrl senza WEB_BASE');
process.env.KHUX_VIP = '1';
list = ev(1).events;
// VIP apre anche la quest del lunedi': isLock 2 (piastra «Available», regola del Task 2), il martedi' resta 0
check(byId(list, 7012)?.isLock === 0 && byId(list, 7011)?.isLock === 2, `VIP: isLock ${byId(list, 7012)?.isLock}/${byId(list, 7011)?.isLock}`);
delete process.env.KHUX_VIP;

// 3. functionFlags bit 4 (letto una volta al login) e la scheda Events vuota
check(t.ret().functionFlags === 4, `functionFlags ${t.ret().functionFlags}`);
check(ev(2).events.length === 0, 'Events (eventCategory 2) non vuota');

// 4. drop dei nemici: tipi per posizione della riga del POI; uid e conteggi attesi si ricavano dal POI e dalle righe
// reward lette qui (non dalla disposizione della mappa generata)
const drops = t.stageEnemyDrops(970120);
const poiRows = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'stage_poi.json'), 'utf8'))[970120].enemies.map((e) => [e.uid, e.reward]));
const rewards = t.masterRows('reward');
const rowOf = (uid) => rewards.find((r) => r.rewardId === (poiRows.get(uid) ?? 1));
const typesOf = (uid) => drops.find((d) => d.uniqueEnemyId === uid)?.dropItemTypeIds || [];
const medalOf = (uid) => { const i = typesOf(uid).indexOf(3); return i < 0 ? null : { id: rowOf(uid).id[i], num: rowOf(uid).num[i] }; };
const medalUid = drops.find((d) => medalOf(d.uniqueEnemyId))?.uniqueEnemyId;
const otherUid = drops.find((d) => medalOf(d.uniqueEnemyId) && medalOf(d.uniqueEnemyId).id !== medalOf(medalUid)?.id)?.uniqueEnemyId;
const matUid = drops.find((d) => d.dropItemTypeIds.includes(5))?.uniqueEnemyId;
check(medalUid !== undefined, 'nessun nemico con medaglia nello stage 970120');
check(matUid !== undefined, 'nessun nemico con materiale nello stage 970120');
// solo i tipi 3 e 5 sono posizioni di drop, tutto il resto 0
check(drops.every((d) => d.dropItemTypeIds.every((x) => [0, 3, 5].includes(x))), 'tipi di drop diversi da 0/3/5');
check(typesOf(matUid).every((x, i) => !x || x === rowOf(matUid).type[i]), 'posizioni dei materiali diverse dalla riga');

// 5. /stage/clear di uno stage Special: storia ferma, punteggio salvato, medaglia del nemico
const lastBefore = p.lastClearStageId;
const listBefore = JSON.stringify(call(t.respondStageList));
const medalsOf = (id) => (p.medals || []).filter((m) => m.medalId === id).length;
const mMain = medalOf(medalUid), mOther = otherUid === undefined ? null : medalOf(otherUid);
const m5 = medalsOf(mMain.id), m9 = mOther ? medalsOf(mOther.id) : 0;
const start = call(t.respondStageStart, { stageId: 970120, eventId: 7012, userKeybladeId: 0 });
check(start.userEnemyDropItems.find((d) => d.uniqueEnemyId === medalUid)?.dropItemTypeIds.join() === typesOf(medalUid).join(), '/stage/start: drop della medaglia');
p.steal = { stageId: 970120, uid: medalUid, mult: 2 }; // Steal del pet sulla medaglia: x2
const clear = call(t.respondStageClear, { getEnemyDropItems: [medalUid, matUid], getMaterials: [], clearMissionIds: [1], getPoint: { lux: 50 } });
check(clear.status === 0, `status ${clear.status}`);
check(p.lastClearStageId === lastBefore, `lastClearStageId ${lastBefore} -> ${p.lastClearStageId}`);
check(JSON.stringify(call(t.respondStageList)) === listBefore, 'elenco della storia cambiato');
check(p.stageScores[970120] === 50, `stageScores[970120] ${p.stageScores[970120]}`);
check(medalsOf(mMain.id) === m5 + mMain.num * 2 + (matUid !== medalUid && medalOf(matUid)?.id === mMain.id ? medalOf(matUid).num : 0), `medaglia ${mMain.id}: ${medalsOf(mMain.id) - m5} (attese ${mMain.num * 2}, Steal x2)`);
check(medalsOf(90095) === m9, 'medaglia dell\'uid 9 data senza drop');

// 6. cambio di giorno a quest aperta (Review Focus 4): start martedi', clear mercoledi'
const cidMedals = medalsOf(90076);
call(t.respondStageStart, { stageId: 970020, eventId: 7002, userKeybladeId: 0 });
at('2026-10-28T09:00:00Z');
const late = call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 10 } });
check(late.status === 0, `clear dopo il cambio di giorno: status ${late.status}`);
check(medalsOf(90076) === cidMedals + 3 && (p.clearMissions[970020] || []).join() === '1,2,3', 'premi degli obiettivi dopo il cambio di giorno');
check(byId(ev(1).events, 7002)?.isLock === 1, 'mercoledi\': Daily Cid del martedi\' ancora aperto');

// 7. righe evStage servite: indirizzi assoluti
const evRows = t.servedMasterRows('evStage', Date.now());
check(evRows.length > 0 && evRows.every((r) => r.bannerUrl.startsWith(t.WEB_BASE + '/')), 'evStage.bannerUrl non assoluto');
check(evRows.find((r) => r.eventStageId === 7000)?.detailUrl === t.WEB_BASE + '/web/special/catalog', 'evStage 7000 detailUrl');
check(evRows.filter((r) => r.eventStageId !== 7000).every((r) => r.detailUrl === ''), 'detailUrl vuoti cambiati');

// 8. Progress della scheda Special: obiettivi / 3 x stage delle quest aperte (senza l'allenamento)
// mercoledi' senza VIP: cid-wed (1 stage), MOG (5), EXP & Evolve Magic (1) = 7 stage
const special = t.specialEvents(Date.now()).filter((e) => e.eventStageId !== 7000 && e.isLock !== 1);
const nStages = special.reduce((a, e) => a + e.stages.length, 0);
p.clearMissions[970030] = [1, 2]; p.clearMissions[970100] = [3]; p.clearMissions[970000] = [1, 2, 3];
let a = call(t.respondStageAchievements).stageAchievement;
check(nStages === 7 && a.strengthDenominator === 21 && a.strengthNumerator === 3, `Special ${a.strengthNumerator}/${a.strengthDenominator} (${nStages} stage)`);
const saved = p.stageScores; p.stageScores = { [sid(5)]: 1 };
a = call(t.respondStageAchievements).stageAchievement;
check(a.strengthNumerator === 0 && a.strengthDenominator === 1, `Special chiusa: ${a.strengthNumerator}/${a.strengthDenominator}`);
p.stageScores = saved;

// 9. Daily Cid: obiettivi azzerati la settimana dopo che tutti e 7 sono completi
const cid = [970010, 970020, 970030, 970040, 970050, 970060, 970070];
for (const id of cid) p.clearMissions[id] = [1, 2, 3];
ev(1);
check(cid.every((id) => (p.clearMissions[id] || []).length === 3), 'Daily Cid azzerato nella stessa settimana');
at('2026-11-02T09:00:00Z'); // lunedi' dopo
ev(1);
check(cid.every((id) => !(p.clearMissions[id] || []).length), `Daily Cid non azzerato: ${cid.map((id) => p.clearMissions[id])}`);
check(p.special && p.special.cidReset === t.weekIndex(Date.now()), `cidReset ${p.special && p.special.cidReset}`);
check((p.clearMissions[970030] || []).length === 0 && (p.clearMissions[970100] || []).join() === '3', 'reset del Cid su altri stage');

// 9b. giro completo di domenica, clear di lunedi': il reset avviene prima e non cancella gli obiettivi del clear
for (const id of cid) p.clearMissions[id] = [1, 2, 3];
at('2026-11-08T09:00:00Z'); // domenica
ev(1);
check(cid.every((id) => (p.clearMissions[id] || []).length === 3), '9b: azzerato di domenica');
at('2026-11-09T09:00:00Z'); // lunedi'
call(t.respondStageStart, { stageId: 970020, eventId: 7002, userKeybladeId: 0 });
call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 10 } });
check((p.clearMissions[970020] || []).join() === '1,2,3', `9b: obiettivi del clear azzerati: ${p.clearMissions[970020]}`);
check((p.clearMissions[970030] || []).length === 0, '9b: gli altri stage del Cid azzerati');

// 10. immagini dei banner: /web/special/img/<id>.png e -kept
check(server.route('/web/special/img/7012.png?m=1') === 'specialweb', 'rotta specialweb');
const img = raw(t.respondSpecialWeb, '/web/special/img/7012.png?m=1');
const file = path.join(__dirname, 'game_data', 'special_img', '7012.png');
check(img.code === 200 && img.headers['Content-Type'] === 'image/png' && Buffer.compare(img.body, fs.readFileSync(file)) === 0, `img 7012: ${img.code}`);
const kept = raw(t.respondSpecialWeb, '/web/special/img/7012-kept.png');
check(kept.code === 200 && Buffer.compare(kept.body, fs.readFileSync(path.join(__dirname, 'game_data', 'special_img', '7012-kept.png'))) === 0, `img 7012-kept: ${kept.code}`);
check(raw(t.respondSpecialWeb, '/web/special/img/99999.png').code === 404, 'img mancante: non 404');
check(raw(t.respondSpecialWeb, '/web/special/img/7000-kept.png').code === 404, 'img 7000-kept: non 404');
check(raw(t.respondSpecialWeb, '/web/special/img/../special.json').code === 404, 'percorso fuori dalla cartella: non 404');
const cat = raw(t.respondSpecialWeb, '/web/special/catalog?m=1');
check(cat.code === 200 && cat.headers['Content-Type'].startsWith('text/html') && cat.body.toString('utf8').includes('id="q7001"'), `catalogo: ${cat.code}`);

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log(`FAIL (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('test-special-server: OK');
