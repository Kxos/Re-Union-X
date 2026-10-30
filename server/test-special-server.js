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
// revisione finale: il bit 4 di functionFlags solo a scheda sbloccata (prima il pulsante dello Shop cambiava per niente)
check(t.ret().functionFlags === 0, `functionFlags prima della missione 6: ${t.ret().functionFlags}`);
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
// ogni id di medaglia e di materiale delle righe dei nemici: prima e dopo il clear devono cambiare solo i premi attesi
const allRows = [...new Set([...poiRows.values(), 1])].map((id) => rewards.find((r) => r.rewardId === id)).filter(Boolean);
const idsOf = (ty) => [...new Set(allRows.flatMap((r) => r.id.filter((_, i) => r.type[i] === ty)))];
const medalIds = idsOf(3), matIds = idsOf(5);
const matsOf = (id) => (p.materials || {})[id] || 0;
const beforeMedal = new Map(medalIds.map((id) => [id, medalsOf(id)])), beforeMat = new Map(matIds.map((id) => [id, matsOf(id)]));
const wantMedal = new Map(), wantMat = new Map();
for (const uid of [medalUid, matUid]) { // solo le posizioni inviate (non 0) dei nemici riportati; Steal x2 sul nemico rubato
  const row = rowOf(uid), k = uid === medalUid ? 2 : 1;
  typesOf(uid).forEach((ty, i) => { if (!ty) return; const m = ty === 3 ? wantMedal : wantMat; m.set(row.id[i], (m.get(row.id[i]) || 0) + row.num[i] * k); });
}
const start = call(t.respondStageStart, { stageId: 970120, eventId: 7012, userKeybladeId: 0 });
check(start.userEnemyDropItems.find((d) => d.uniqueEnemyId === medalUid)?.dropItemTypeIds.join() === typesOf(medalUid).join(), '/stage/start: drop della medaglia');
p.steal = { stageId: 970120, uid: medalUid, mult: 2 }; // Steal del pet sulla medaglia: x2
const clear = call(t.respondStageClear, { getEnemyDropItems: [medalUid, matUid], getMaterials: [], clearMissionIds: [1], getPoint: { lux: 50 } });
check(clear.status === 0, `status ${clear.status}`);
check(p.lastClearStageId === lastBefore, `lastClearStageId ${lastBefore} -> ${p.lastClearStageId}`);
check(JSON.stringify(call(t.respondStageList)) === listBefore, 'elenco della storia cambiato');
check(p.stageScores[970120] === 50, `stageScores[970120] ${p.stageScores[970120]}`);
check(medalsOf(mMain.id) - beforeMedal.get(mMain.id) === wantMedal.get(mMain.id), `medaglia ${mMain.id}: ${medalsOf(mMain.id) - beforeMedal.get(mMain.id)} (attese ${wantMedal.get(mMain.id)}, Steal x2)`);
for (const id of medalIds) check(medalsOf(id) - beforeMedal.get(id) === (wantMedal.get(id) || 0), `medaglia ${id} cambiata fuori dalle posizioni inviate: ${medalsOf(id) - beforeMedal.get(id)}`);
for (const id of matIds) check(matsOf(id) - beforeMat.get(id) === (wantMat.get(id) || 0), `materiale ${id} cambiato fuori dalle posizioni inviate`);
check(!mOther || mOther.id === mMain.id || wantMedal.has(mOther.id) || medalsOf(mOther.id) === beforeMedal.get(mOther.id), 'medaglia di un nemico non riportato data senza drop');

// 6. cambio di giorno a quest aperta (Review Focus 4): start martedi', clear mercoledi'
const cidMedals = medalsOf(90076);
call(t.respondStageStart, { stageId: 970020, eventId: 7002, userKeybladeId: 0 });
at('2026-10-28T09:00:00Z');
const late = call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 10 } });
check(late.status === 0, `clear dopo il cambio di giorno: status ${late.status}`);
check(medalsOf(90076) === cidMedals + 3 && (p.clearMissions[970020] || []).join() === '1,2,3', 'premi degli obiettivi dopo il cambio di giorno');
// round 2 (originale): solo il Daily Cid di oggi e' nell'elenco, con o senza VIP; gli altri giorni non compaiono
const cidOf = (list) => list.filter((e) => e.eventStageId >= 7001 && e.eventStageId <= 7007).map((e) => `${e.eventStageId}/${e.isLock}`).join();
check(!byId(ev(1).events, 7002) && cidOf(ev(1).events) === '7003/0', `mercoledi': solo il Cid del mercoledi' (${cidOf(ev(1).events)})`);
process.env.KHUX_VIP = '1';
check(cidOf(ev(1).events) === '7003/0', `mercoledi' con VIP: solo il Cid del mercoledi' (${cidOf(ev(1).events)})`);
delete process.env.KHUX_VIP;

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
const vImg = raw(t.respondSpecialWeb, '/web/special/img/v2/7012.png');
check(vImg.code === 200 && Buffer.compare(vImg.body, fs.readFileSync(file)) === 0, 'versioned img served');
check(raw(t.respondSpecialWeb, '/web/special/img/v9/7012-kept.png').code === 200, 'any version, kept');
check(raw(t.respondSpecialWeb, '/web/special/img/vx/7012.png').code === 404, 'bad version: 404');
check(list.every((e) => e.eventStageId === 7000 || e.bannerUrl.includes('/img/v' + require('./special').SPECIAL_IMG_VERSION + '/')), 'bannerUrl versioned');
check(raw(t.respondSpecialWeb, '/web/special/img/99999.png').code === 404, 'img mancante: non 404');
check(raw(t.respondSpecialWeb, '/web/special/img/7000-kept.png').code === 404, 'img 7000-kept: non 404');
check(raw(t.respondSpecialWeb, '/web/special/img/../special.json').code === 404, 'percorso fuori dalla cartella: non 404');
const cat = raw(t.respondSpecialWeb, '/web/special/catalog?m=1');
check(cat.code === 200 && cat.headers['Content-Type'].startsWith('text/html') && cat.body.toString('utf8').includes('id="q7001"'), `catalogo: ${cat.code}`);
// polish 31-10: pagina dei dettagli /web/special/detail/<evStageId> (solo il percorso conta) e icone /web/special/icon/<chiave>.png
check(server.route('/web/special/detail/7012?from=catalog') === 'specialweb', 'rotta dettagli');
const det = raw(t.respondSpecialWeb, '/web/special/detail/7012?from=catalog');
const detHtml = det.body.toString('utf8'), en7012 = t.specialIndex().entries.find((x) => x.evStageId === 7012);
check(det.code === 200 && det.headers['Content-Type'].startsWith('text/html') && detHtml.includes(en7012.name.replace(/&/g, '&amp;')) && detHtml.includes('class="back"'), `dettagli 7012: ${det.code}`);
check(/<h3>Objectives<\/h3>/.test(detHtml) && detHtml.includes('Defeat the target enemy within 1 turn') && detHtml.includes('Avatar Coin x5'), 'dettagli 7012: obiettivi dal master');
check(!raw(t.respondSpecialWeb, '/web/special/detail/7012').body.toString('utf8').includes('class="back"'), 'dettagli senza from=catalog: niente BACK');
check(raw(t.respondSpecialWeb, '/web/special/detail/99999').code === 404 && raw(t.respondSpecialWeb, '/web/special/detail/7000').code === 404
  && raw(t.respondSpecialWeb, '/web/special/detail/abc').code === 404, 'dettagli: id sconosciuto 404');
// round 13: pagina della quest /web/special/quest/<id> (qualunque voce della quest); il vecchio /detail/<id> resta valido
{
  const qh = raw(t.respondSpecialWeb, "/web/special/quest/7002?from=catalog"), qb = qh.body.toString("utf8");
  check(qh.code === 200 && qb.includes("<title>Daily Challenge: Cid</title>") && qb.includes("class=\"ver ") && qb.includes("class=\"back\""), `quest 7002: ${qh.code}`);
  check(raw(t.respondSpecialWeb, "/web/special/quest/99999").code === 404 && raw(t.respondSpecialWeb, "/web/special/detail/7002").body.toString("utf8").includes("<title>Daily Challenge: Cid</title>"), "quest: 404 e vecchio indirizzo");
}
const iconDir = path.join(__dirname, 'game_data', 'special_icons');
if (fs.existsSync(path.join(iconDir, 'vip.png'))) {
  const ic = raw(t.respondSpecialWeb, '/web/special/icon/vip.png');
  check(ic.code === 200 && ic.headers['Content-Type'] === 'image/png' && Buffer.compare(ic.body, fs.readFileSync(path.join(iconDir, 'vip.png'))) === 0, `icona vip: ${ic.code}`);
} else console.log('(icone Special assenti: python -I recon/tools/special_icons.py)');
check(raw(t.respondSpecialWeb, '/web/special/icon/nope.png').code === 404 && raw(t.respondSpecialWeb, '/web/special/icon/../special.png').code === 404, 'icona fuori lista: 404');

// round 5: «later» con la quest della storia che la apre (righe story del catalogo dello Shop): periodo 5 = quest 946
{
  const en5 = t.specialIndex().entries.find((x) => Math.min(...x.periods) === 5 && !x.campaign && !x.from);
  const sc = t.player.stageScores; const keep = { ...sc };
  for (const k of Object.keys(sc)) delete sc[k];
  sc[sid(925)] = 1; // periodo 4
  const dh = raw(t.respondSpecialWeb, `/web/special/detail/${en5.evStageId}`).body.toString('utf8');
  check(dh.includes('Unlocks at Story Quest 946'), `periodo 5 dalla quest 946: ${(/class="s s-off">(?:<img[^>]*>)?[^<]*/.exec(dh) || [''])[0]}`);
  for (const k of Object.keys(sc)) delete sc[k];
  Object.assign(sc, keep);
}

// round 6: corona a destra del banner (complete): l'allenamento con [1,2,3] nel salvataggio -> catalogo complete 1
{
  const keep = p.clearMissions[970000];
  p.clearMissions[970000] = [1, 2, 3];
  check(ev(1).events[0]?.eventStageId === 7000 && ev(1).events[0].complete === 1, `catalogo con [1,2,3]: complete ${ev(1).events[0]?.complete}`);
  p.clearMissions[970000] = [1, 2];
  check(ev(1).events[0].complete === 0, 'catalogo con [1,2]: complete 0');
  if (keep === undefined) delete p.clearMissions[970000]; else p.clearMissions[970000] = keep;
}

// 11. fissare una quest: POST /web/special/pin/<evStageId> e /web/special/unpin
const post = (url) => { const r = raw(t.respondSpecialPost, url); return { code: r.code, body: JSON.parse(r.body.toString('utf8')) }; };
check(server.route('/web/special/pin/7060') === 'specialweb', 'rotta pin');
at('2026-11-10T09:00:00Z'); // martedi', periodo 4: Olympia (lunedi', periodi 1-2) e' passata
p.special = p.special || {}; delete p.special.pinned;
let r = post('/web/special/pin/7060');
check(r.code === 200 && r.body.ok === true && p.special.pinned === 'km-olympia', `pin Olympia: ${r.code} ${p.special.pinned}`);
list = ev(1).events;
check(list[1]?.eventStageId === 7060 && list[1].bannerUrl.endsWith('/7060-kept.png') && list[1].isLock === 2, `KEPT secondo: ${list[1]?.eventStageId} isLock ${list[1]?.isLock}`);
r = post('/web/special/pin/7011'); // quest corrente (periodo 4): non fissabile
check(r.code === 409 && r.body.ok === false && r.body.why && p.special.pinned === 'km-olympia', `pin corrente: ${r.code}`);
r = post('/web/special/pin/7056'); // sostituita da evolve-legendary
check(r.code === 409 && p.special.pinned === 'km-olympia', `pin sostituita: ${r.code} ${p.special.pinned}`);
r = post('/web/special/pin/7064');
check(r.code === 200 && p.special.pinned === 'km-lady-luck', `secondo pin sostituisce: ${p.special.pinned}`);
list = ev(1).events;
check(list.filter((e) => e.bannerUrl.includes('-kept')).length === 1 && list[1].eventStageId === 7064, 'un solo KEPT, il nuovo');
check(post('/web/special/pin/99999').code === 404, 'id sconosciuto: non 404');
// un pin gia' fissato diventa la quest del giorno: lunedi' Olympia e' aperta di suo (isLock 0)
at('2026-11-12T09:00:00Z'); // giovedi': Lady Luck e' il suo giorno
check(ev(1).events[1].isLock === 0, 'KEPT nel suo giorno: isLock 0');
at('2026-11-10T09:00:00Z');
r = post('/web/special/unpin');
check(r.code === 200 && r.body.ok === true && !p.special.pinned, 'unpin');
check(!ev(1).events.some((e) => e.bannerUrl.includes('-kept')), 'dopo unpin nessun KEPT');
// Review Focus 3: chiave fuori indice = niente KEPT e niente errore; VIP fissata senza VIP = KEPT con isLock 1
p.special.pinned = 'chiave-inesistente';
check(!ev(1).events.some((e) => e.bannerUrl.includes('-kept')), 'chiave fuori indice: nessun KEPT');
const vipPast = t.specialIndex().entries.find((en) => en.vip && Math.max(...en.periods) < 4 && !en.replacedBy && !en.removed);
if (vipPast) {
  p.special.pinned = vipPast.key;
  const k = ev(1).events[1];
  check(k.eventStageId === vipPast.evStageId && k.bannerUrl.includes('-kept') && k.isLock === 1, `VIP fissata senza VIP: ${k.eventStageId} isLock ${k.isLock}`);
} else errors.push('nessuna quest VIP passata nell\'indice per il test');
delete p.special.pinned;

// 7. quest di allenamento 970000 (Task 11): niente gauge, Lux, munny della partita, materiali, drop, EXP; obiettivi: Munny x100 una volta;
// restano punteggio e obiettivi. Anche il Give Up non tocca la gauge
{
  p.keybladeBurst = 55000; p.money = 1000; p.lux = 700;
  const mats = JSON.stringify(p.materials || {}), medals = (p.medals || []).length, ap0 = p.ap;
  const moneyB = p.money, luxB = p.lux;
  delete p.clearMissions[970000]; delete p.stageScores[970000];
  // i tre obiettivi danno Munny x100 la prima volta (make-special.js, polish 31-10); il master locale puo' avere ancora la
  // riga vecchia (tipo 0): la si porta in memoria ai valori di make-special, senza scrivere master_data
  const trRow = t.masterRows('stage').find((r) => r.stageId === 970000);
  Object.assign(trRow, { submissionRewardType: [4, 4, 4], submissionItemId: [0, 0, 0], submissionItemNum: [100, 100, 100] });
  const ts = call(t.respondStageStart, { stageId: 970000, eventId: 7000, userKeybladeId: 0 });
  // revisione finale: nessun drop nell'allenamento (i record della mappa restano sulla riga 1)
  check(ts.userEnemyDropItems.length > 0 && ts.userEnemyDropItems.every((d) => Array.isArray(d.dropItemTypeIds) && d.dropItemTypeIds.length === 0),
    `allenamento: drop ${JSON.stringify(ts.userEnemyDropItems.filter((d) => d.dropItemTypeIds.length))}`);
  const tc = call(t.respondStageClear, { burst: 120000, getPoint: { lux: 500, money: 300, exp: 50 }, getMaterials: [{ materialId: 1, number: 5 }],
    getEnemyDropItems: [1, 2, 3], clearMissionIds: [1, 2] });
  check(p.keybladeBurst === 55000, `allenamento: gauge ${p.keybladeBurst}`);
  check(p.lux === luxB && p.money === moneyB + 200, `allenamento: lux ${p.lux}, money ${p.money} (solo gli obiettivi 1 e 2: +200)`);
  check(JSON.stringify(p.materials || {}) === mats && (p.medals || []).length === medals, 'allenamento: materiali o medaglie cambiati');
  check(tc.getLux === 0, `allenamento: getLux ${tc.getLux}`);
  check(JSON.stringify(p.clearMissions[970000]) === '[1,2]', `allenamento: obiettivi ${JSON.stringify(p.clearMissions[970000])}`);
  check(p.stageScores[970000] === 0, `allenamento: punteggio ${p.stageScores[970000]}`);
  check(p.ap === ap0, 'allenamento: AP cambiati');
  delete p.clearMissions[970000];
  const money0 = p.money;
  call(t.respondStageStart, { stageId: 970000, eventId: 7000, userKeybladeId: 0 });
  call(t.respondStageClear, { getPoint: { lux: 500, money: 300, exp: 50 }, getMaterials: [], getEnemyDropItems: [1], clearMissionIds: [1, 2, 3] });
  check(p.money === money0 + 300 && p.lux === luxB, `allenamento: obiettivi la prima volta +300 munny (${p.money - money0}), lux ${p.lux}`);
  call(t.respondStageStart, { stageId: 970000, eventId: 7000, userKeybladeId: 0 });
  call(t.respondStageClear, { getPoint: { lux: 500, money: 300, exp: 50 }, getMaterials: [], getEnemyDropItems: [1], clearMissionIds: [1, 2, 3] });
  check(p.money === money0 + 300, `allenamento: secondo clear +0 munny (${p.money - money0 - 300})`);
  call(t.respondStageStart, { stageId: 970000, eventId: 7000, userKeybladeId: 0 });
  call(t.respondStageContinue, '/stage/retire', { burst: 0 });
  check(p.keybladeBurst === 55000, `allenamento Give Up: gauge ${p.keybladeBurst}`);
  // revisione finale: il Continue dell'allenamento non costa jewel, quello di una quest vera si'
  p.freeStone = 500;
  call(t.respondStageStart, { stageId: 970000, eventId: 7000, userKeybladeId: 0 });
  call(t.respondStageContinue, '/stage/continue', {});
  check(p.freeStone === 500, `allenamento Continue: jewel ${p.freeStone}`);
  call(t.respondStageStart, { stageId: 970120, eventId: 7012, userKeybladeId: 0 });
  call(t.respondStageContinue, '/stage/continue', {});
  check(p.freeStone === 400, `quest vera Continue: jewel ${p.freeStone}`);
  // una quest vera dopo l'allenamento salva ancora la gauge
  call(t.respondStageStart, { stageId: 970120, eventId: 7012, userKeybladeId: 0 });
  call(t.respondStageContinue, '/stage/retire', { burst: 0 });
  check(p.keybladeBurst === 0, `quest vera: Give Up gauge ${p.keybladeBurst}`);
}

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log(`FAIL (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('test-special-server: OK');
