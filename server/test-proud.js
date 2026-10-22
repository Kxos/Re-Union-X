// Prova della Proud Mode (I-200: make-proud.js e le rotte di server.js), senza client:
//
//   node server/test-proud.js [cartella master]   (default server/master_data; il master deve avere le righe Proud)
//
// Controlla: la forma delle righe (979 righe kind 4, 1001010 originale del 5.0.1, stageId/id/stageBinId, AP 0, jewel,
// keyblade Proud, condizioni con codice, obiettivi senza tappabuchi, combinedSubmissionFlag dalla 801, 978 solo
// filmato), le forme delle condizioni, GET /stage/hard (chiusa prima della storia 500, poi una alla volta), /stage/start e
// /stage/clear di una Proud (forzieri/drop dello stage della storia, punteggio a parte, lastClearStageId fermo),
// Beginner 41 e le varianti della Q555 Proud.
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo nuovo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-proud-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
for (const k of ['KHUX_KB_ALL', 'KHUX_PROUD_UNLOCK_QUEST', 'KHUX_PROUD']) delete process.env[k];
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const proud = require('./make-proud');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// ---- 1. forme delle condizioni e degli obiettivi (senza master) ------------------------------------------------
const F = (s) => (proud.conditionForm(s) || {});
check(F('Only special attacks with a bonus value of 40% or higher allowed.').kind === 'bonuspct_ge', 'bonus %');
check(F('Only special attacks requiring 3 or more gauges allowed.').kind === 'gauge_ge', 'gauge >=');
check(F('Only special attacks requiring 3 gauges<!--sic--> allowed.').kind === 'gauge_eq', 'gauge == con commento');
check(F('Only mutliple-target special attacks allowed.').kind === 'multiple', 'refuso mutliple');
check(F('Special attacks allowed only for Upright Medals').kind === 'upright', 'senza punto');
check(F('Special attacks allowed only for 5★').n === 5, '5★ senza «or higher Medals»');
check(F('Special attacks allowed only for Medals with a SP attack bonus value of 9 or less.').kind === 'spbonus_le', 'SP attack');
check(F('Special attacks allowed only for Medals with 7500 or higher STR.').n === 7500, 'STR 7500');
check(proud.wrapName('Only special attacks dealing %d or more hits allowed.') === 'Only special attacks dealing\n%d or more hits allowed.', 'a capo come l\'originale');
const c13 = proud.conditionCodes('Only special attacks with a bonus value of 40% or higher allowed.');
check(c13 && c13.codes && c13.codes.hardmodeRequire === 13 && c13.codes.hardmodeNum === 4000 && c13.codes.hardmodeComparison === 3,
  `codice 13 come la 1001010: ${JSON.stringify(c13)}`);
check(proud.proudObjective('Complete in 0\'35"00', {}).req === 37, '«Complete in» = 37');
check(proud.proudObjective('Deal 30 or less hits', {}).req === 32, '«Deal N or less hits» = 32');
check(proud.proudObjective('Inflict 50000 or more damage with 1 hit<br>(excl. Nova)', {}).req === 13, '«<br>(excl. Nova)» = 13');

// ---- 2. righe del master -------------------------------------------------------------------------------------
const load = (f) => JSON.parse(fs.readFileSync(path.join(MASTER, f + '.json'), 'utf8'));
const stages = load('stage');
const rows = stages.filter((r) => r.stageKind === 4 && r.stageId > 1000000);
const story = new Map(stages.filter((r) => r.stageKind === 1 && r.stageId < 100000 && r.id <= 979).map((r) => [r.id, r]));
check(rows.length === 979, `${rows.length} righe Proud, attese 979 (1-979, 978 compresa)`);
const byQ = new Map(rows.map((r) => [r.id - 1000000, r]));
const base = (() => { try { return load('stage_base').find((r) => r.stageId === 1001010); } catch { return null; } })();
if (base) check(JSON.stringify(byQ.get(1)) === JSON.stringify(base), 'la 1001010 e\' quella del 5.0.1');
for (const [q, r] of byQ) {
  const s = story.get(q);
  check(s && r.stageId === 1000000 + s.stageId && r.stageBinId === s.stageId, `Q${q}: stageId/stageBinId`);
  check(r.useAp === 0 && r.disableContinue === 1 && r.validStopStage === 0, `Q${q}: AP/continue/stop`);
  check(r.name === s.name && r.worldId === s.worldId && r.onlyDrama === s.onlyDrama, `Q${q}: nome/mondo/onlyDrama dalla storia`);
  if (q !== 978) {
    check(r.holdKeyblade > 0 && r.addLevel > 0, `Q${q}: keyblade ${r.holdKeyblade} livello +${r.addLevel}`);
    // 891, 892, 913: nessuna condizione nella wiki («—» nella pagina Proud Mode)
    if ([891, 892, 913].includes(q)) check(r.hardmodeRequire === 0, `Q${q}: condizione inattesa`);
    else check(r.hardmodeRequire > 1 && r.hardmodeRequire < 15 && r.hardmodeName !== 'strDummy', `Q${q}: condizione senza codice (${r.hardmodeName})`);
    check(r.hardmodeRequire === 0 || (r.hardmodeName.match(/%d/g) || []).length <= 1, `Q${q}: piu' di un %d`);
    check(r.validSubmission === 3, `Q${q}: ${r.validSubmission} obiettivi`);
  }
  check(r.combinedSubmissionFlag === (q >= 801 && q !== 978 ? 1 : 0), `Q${q}: combinedSubmissionFlag ${r.combinedSubmissionFlag}`);
  for (let i = 0; i < r.validSubmission; i++) {
    check(!(r.submissionRequire[i] === 10 && r.submissionName[i] !== 'Complete without having to continue'), `Q${q}: obiettivo ${i + 1} tappabuchi «${r.submissionName[i]}»`);
    check(r.submissionRewardType[i] > 0, `Q${q}: obiettivo ${i + 1} senza premio`);
  }
}
const jewel = (r) => (r.clearGetItemType || []).reduce((a, t, i) => a + (t === 2 ? r.clearGetItemNum[i] : 0), 0);
check(jewel(byQ.get(5)) === 150 && jewel(byQ.get(800)) === 150 && jewel(byQ.get(805)) === 300 && jewel(byQ.get(885)) === 600
  && jewel(byQ.get(979)) === 600 && jewel(byQ.get(4)) === 0, 'jewel 150/300/600 della wiki');
const kb = (q) => byQ.get(q).clearGetItemId[byQ.get(q).clearGetItemType.indexOf(13)];
check(kb(3) === 8000 && kb(103) === 9000 && kb(203) === 11000 && kb(328) === 12000 && kb(378) === 13000 && kb(428) === 15000, 'keyblade Proud');
check(rows.filter((r) => r.clearGetItemType.includes(13)).length === 6, 'solo 6 keyblade Proud');
const q978 = byQ.get(978);
check(q978 && q978.onlyDrama === 1 && q978.validSubmission === 0 && jewel(q978) === 600 && q978.clearGetItemId.includes(48) && q978.clearGetItemId.includes(49),
  'Q978 Proud: solo filmato, 600 jewel, Power e Speed Gem');
check(byQ.get(50).validClearGetTitle === 1, 'Q50 Proud: titolo «Seriously»');
check(byQ.get(555).branchType === 1 && byQ.get(555).stageBinId === 18300, 'Q555 Proud: varianti dell\'Unione');

// ---- 3. server ---------------------------------------------------------------------------------------------
const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;
call(t.respondUserCreate, { name: 'Prova', unionId: 2 });
let r = call(t.respondProudList);
check(r.stories.length === 0 && r.newStageId === 0, 'Proud chiusa per un giocatore nuovo');
p.stageScores = p.stageScores || {}; p.clearMissions = p.clearMissions || {};
for (const [q, s] of story) if (q < 500) p.stageScores[s.stageId] = 10;
r = call(t.respondProudList);
check(r.stories.length === 0, 'chiusa con la storia fino alla 499');
p.stageScores[story.get(500).stageId] = 10;
r = call(t.respondProudList);
check(r.stories.length === 1 && r.stories[0].stageId === 1001010 && r.newStageId === 1001010 && r.stories[0].playStatus === 0, `aperta alla 500: ${JSON.stringify(r)}`);

// start + clear della Proud 1: drop e forzieri dello stage 1010, punteggio a parte, lastClearStageId fermo
const last = p.lastClearStageId;
const st = call(t.respondStageStart, { stageId: 1001010, userKeybladeId: 1 });
check(JSON.stringify(st.userTreasures) === JSON.stringify(t.stageTreasures(1010)) && st.userTreasures.length > 0, 'forzieri della 1010');
check(st.userEnemyDropItems.length === t.stageEnemyDrops(1010).length && st.userEnemyDropItems.length > 0, 'drop della 1010');
check(st.startStageData.clearMissionIds.length === 0, 'obiettivi Proud separati da quelli della storia');
const stone = p.freeStone || 0;
const cl = call(t.respondStageClear, { getPoint: { lux: 300, money: 0, exp: 0 }, clearMissionIds: [1], burst: 0 });
check(cl.firstClearFlag === 1 && p.stageScores[1001010] === 300, 'punteggio della Proud 1');
check(p.lastClearStageId === last, `lastClearStageId spostato a ${p.lastClearStageId}`);
check((p.clearMissions[1001010] || []).includes(1) && (p.clearMissions[1001010] || []).includes(2), 'obiettivi 1 e 2 (Lux 200) della Proud 1');
check((p.materials[55] || 0) >= 1, 'Electrum Ore dell\'obiettivo 1');
check((p.freeStone || 0) === stone, 'nessun jewel alla Proud 1');
r = call(t.respondProudList);
check(r.stories.length === 2 && r.stories[0].playStatus === 2 && r.newStageId === byQ.get(2).stageId, 'dopo la Proud 1 c\'e\' la 2');
// Beginner 41: Proud fino alla 3
const m41 = t.masterRows('mission').find((m) => m.missionType === 1 && m.conditionId === 41);
check(m41 && t.missionProgress(m41, { count: 0 }) === 0, 'Beginner 41 a 0');
for (const q of [2, 3]) { p.currentStageId = byQ.get(q).stageId; p.stageInProgress = true; call(t.respondStageClear, { getPoint: { lux: 1 } }); }
check(m41 && t.missionProgress(m41, { count: 0 }) === 1, 'Beginner 41 compiuta alla Proud 3');
check(t.ownedKeyblades().some((k) => k.keybladeId === 8000), 'Sleeping Lion dalla Proud 3');
// 801+: tutti gli obiettivi insieme o nessuno
{
  const r801 = byQ.get(801);
  p.currentStageId = r801.stageId; p.stageInProgress = true;
  const a = call(t.respondStageClear, { getPoint: { lux: 0 }, clearMissionIds: [1, 2] });
  check(a.clearMissionIds.length === 0 && !(p.clearMissions[r801.stageId] || []).length, `801: due obiettivi su tre contano ${a.clearMissionIds}`);
  p.currentStageId = r801.stageId; p.stageInProgress = true;
  const b = call(t.respondStageClear, { getPoint: { lux: 0 }, clearMissionIds: [1, 2, 3] });
  check(b.clearMissionIds.length === 3 && p.clearMissions[r801.stageId].length === 3, '801: tutti e tre insieme');
}
// I-201: elenco come l'originale. playStatus 2 per ogni Proud superata, con 0, 1, 2 o 3 obiettivi (il COMPLETE
// della Proud non dipende dagli obiettivi); clearMissionIds = gli obiettivi compiuti (le spunte sotto la casella)
{
  const lst = call(t.respondProudList);
  const of = (q) => lst.stories.find((x) => x.stageId === byQ.get(q).stageId);
  check(of(1).playStatus === 2 && JSON.stringify(of(1).clearMissionIds) === '[1,2]', `Proud 1 (2 obiettivi su 3): ${JSON.stringify(of(1))}`);
  check(of(2).playStatus === 2 && of(2).clearMissionIds.length === 0, `Proud 2 (nessun obiettivo): ${JSON.stringify(of(2))}`);
  check(lst.stories.filter((x) => x.playStatus !== 2).length === 1 && lst.stories[lst.stories.length - 1].playStatus === 0,
    'solo la prossima Proud senza playStatus 2');
  // 801 superata con 2 obiettivi su 3 «tutti insieme»: completata, ma nessuna spunta; poi tutti e tre: tre spunte
  const r801 = byQ.get(801);
  const keep = { ...p.stageScores }, keepM = { ...p.clearMissions };
  for (const x of rows) if (x.id - 1000000 < 801) p.stageScores[x.stageId] = p.stageScores[x.stageId] || 1;
  delete p.clearMissions[r801.stageId];
  p.currentStageId = r801.stageId; p.stageInProgress = true;
  call(t.respondStageClear, { getPoint: { lux: 0 }, clearMissionIds: [1, 2] });
  let e = call(t.respondProudList).stories.find((x) => x.stageId === r801.stageId);
  check(e && e.playStatus === 2 && e.clearMissionIds.length === 0, `801 con 2 su 3: completata senza spunte ${JSON.stringify(e)}`);
  p.currentStageId = r801.stageId; p.stageInProgress = true;
  call(t.respondStageClear, { getPoint: { lux: 0 }, clearMissionIds: [1, 2, 3] });
  e = call(t.respondProudList).stories.find((x) => x.stageId === r801.stageId);
  check(e && e.playStatus === 2 && JSON.stringify(e.clearMissionIds) === '[1,2,3]', `801 tutti insieme: tre spunte ${JSON.stringify(e)}`);
  // tutte le Proud superate: newStageId 0 (COMPLETE anche sull'ultima, «Coming Soon!» dopo)
  for (const x of rows) p.stageScores[x.stageId] = p.stageScores[x.stageId] || 1;
  const all = call(t.respondProudList);
  check(all.newStageId === 0 && all.stories.length === rows.length && all.stories.every((x) => x.playStatus === 2),
    `tutte le Proud superate: newStageId ${all.newStageId}, ${all.stories.length}/${rows.length}`);
  p.stageScores = keep; p.clearMissions = keepM;
}
// Q555 Proud, variante dell'Unione 2: riga 1018300, mappa 18301
check(t.stageRowOf(1018301)?.stageId === 1018300 && t.poiStageId(1018301) === 18301, 'Q555 Proud: variante 1018301 -> riga 1018300, mappa 18301');

// notizia IMPORTANT (regola del progetto: ogni parte non originale spiegata nelle Notices)
{
  const n = require('./routes-info-album').NOTICES.find((x) => x.title === 'Proud Mode');
  const b = n ? n.body.join(' ') : '';
  check(n && n.tag === 'IMPORTANT' && /Story Quest 500/.test(b) && /0 AP/.test(b) && /891, 892 and 913/.test(b) && /together/.test(b)
    && /no longer given/.test(b), 'notizia Proud Mode');
}
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.slice(0, Number(process.env.KHUX_TEST_MAX_ERRORS || 60)).join('\n  ')); process.exit(1); }
log(`OK: Proud Mode (${rows.length} righe, /stage/hard, start/clear, Beginner 41, Q555)`);
