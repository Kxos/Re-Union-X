// Prova di GET /stage/achievements (I-037: percentuali e COMPLETE delle categorie di Quests), senza client:
//
//   node server/test-achievements.js [cartella master]   (default server/master_data)
//
// Regola del client: «Progress: N%» con N = numeratore * 100 / denominatore (troncato), COMPLETE quando
// numeratore >= denominatore. Story = obiettivi compiuti di Standard (1-979) + Proud su tutti i loro obiettivi;
// Special/Events/Union Cross, che il server non ha ancora, 0/1 (0% senza COMPLETE).
// Casi: giocatore nuovo, storia parziale, storia tutta superata con e senza tutti gli obiettivi, Proud parziale e
// completa, salvataggio vecchio senza clearMissions. Non tocca server/save: KHUX_SAVE punta a un file temporaneo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-achievements-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const stages = JSON.parse(fs.readFileSync(path.join(MASTER, 'stage.json'), 'utf8'));
const story = stages.filter((r) => r.stageKind === 1 && r.id >= 1 && r.id <= 979).sort((a, b) => a.id - b.id);
const proud = stages.filter((r) => r.stageKind === 4 && r.stageId > 1000000).sort((a, b) => a.id - b.id);
const objs = (r) => Math.min(3, r.validSubmission || 0);
const STORY_OBJ = story.reduce((a, r) => a + objs(r), 0);
const PROUD_OBJ = proud.reduce((a, r) => a + objs(r), 0);
const TOTAL = STORY_OBJ + PROUD_OBJ;
check(story.length === 979 && proud.length === 979, `righe: storia ${story.length}, Proud ${proud.length}`);
check(TOTAL > 0 && TOTAL <= 0x7fff, `obiettivi totali ${TOTAL} fuori dagli short`);

const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;
// come il client: percentuale troncata, COMPLETE con num >= den
const view = (n, d) => (n >= d ? 'COMPLETE' : `${Math.trunc((n * 100) / d)}%`);
const ach = () => call(t.respondStageAchievements).stageAchievement;
const story0 = (a) => view(a.mainNumerator, a.mainDenominator);
const emptyOk = (a, when) => {
  for (const k of ['strength', 'event', 'multi']) {
    check(a[k + 'Numerator'] === 0 && a[k + 'Denominator'] === 1, `${when}: ${k} ${a[k + 'Numerator']}/${a[k + 'Denominator']} (atteso 0/1)`);
  }
  check(a.colosseumRank === 0 && a.pvpRanking && a.pvpRanking.userPvpRanking && a.pvpRanking.userPvpRanking.rank === 0,
    `${when}: Coliseum senza classifica`);
};

// forma completa della risposta (campi obbligatori dello schema del client)
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
p.stageScores = {}; p.clearMissions = {};
let a = ach();
for (const k of ['mainNumerator', 'mainDenominator', 'strengthNumerator', 'strengthDenominator', 'eventNumerator',
  'eventDenominator', 'multiNumerator', 'multiDenominator', 'colosseumRank']) check(Number.isInteger(a[k]), `campo ${k} mancante`);
check(Number.isInteger(a.pvpRanking.rankingStatus) && ['rank', 'class', 'point'].every((k) => Number.isInteger(a.pvpRanking.userPvpRanking[k])),
  'pvpRanking incompleto');

// 1. giocatore nuovo: 0%, nessuna categoria COMPLETE
check(a.mainNumerator === 0 && a.mainDenominator === TOTAL && story0(a) === '0%', `nuovo: ${a.mainNumerator}/${a.mainDenominator}`);
emptyOk(a, 'nuovo');

// 2. storia parziale: 1-100 superate, ognuna con 2 obiettivi su 3 (la 978 non c'entra)
for (const r of story.slice(0, 100)) { p.stageScores[r.stageId] = 10; p.clearMissions[r.stageId] = [1, 2]; }
a = ach();
check(a.mainNumerator === 200 && a.mainDenominator === TOTAL, `storia 1-100 con 2 obiettivi: ${a.mainNumerator}`);
check(story0(a) === `${Math.trunc(20000 / TOTAL)}%`, `storia parziale: ${story0(a)}`);
// superata senza obiettivi: non conta; obiettivi doppi o fuori intervallo: non contano
p.stageScores[story[100].stageId] = 10; p.clearMissions[story[100].stageId] = [];
p.clearMissions[story[0].stageId] = [1, 1, 2, 7];
check(ach().mainNumerator === 200, `duplicati/fuori intervallo contati: ${ach().mainNumerator}`);
// missioni di prova (tour 991001-991008) e stage sconosciuti fuori dal conto
p.clearMissions[991001] = [1, 2, 3]; p.clearMissions[123456789] = [1];
check(ach().mainNumerator === 200, 'tour/stage sconosciuti contati');
emptyOk(ach(), 'storia parziale');

// 3. tutta la storia superata ma senza tutti gli obiettivi: niente COMPLETE (e la Proud manca)
for (const r of story) { p.stageScores[r.stageId] = 10; p.clearMissions[r.stageId] = [1]; }
a = ach();
const one = story.filter((r) => objs(r) >= 1).length;
check(a.mainNumerator === one && story0(a) !== 'COMPLETE', `storia tutta con 1 obiettivo: ${a.mainNumerator} ${story0(a)}`);

// 4. tutta la storia con tutti gli obiettivi: meta' (la Proud e' nel conto), non COMPLETE
for (const r of story) p.clearMissions[r.stageId] = Array.from({ length: objs(r) }, (_, i) => i + 1);
a = ach();
check(a.mainNumerator === STORY_OBJ && story0(a) === `${Math.trunc((STORY_OBJ * 100) / TOTAL)}%`, `storia completa: ${a.mainNumerator} ${story0(a)}`);

// 5. Proud parziale: 1-300 con tutti gli obiettivi
for (const r of proud.slice(0, 300)) { p.stageScores[r.stageId] = 1; p.clearMissions[r.stageId] = Array.from({ length: objs(r) }, (_, i) => i + 1); }
a = ach();
const p300 = proud.slice(0, 300).reduce((s, r) => s + objs(r), 0);
check(a.mainNumerator === STORY_OBJ + p300 && story0(a) !== 'COMPLETE', `Proud 1-300: ${a.mainNumerator} ${story0(a)}`);

// 6. Proud tutta superata, ma l'ultima con 2 obiettivi su 3: 99%, non COMPLETE
for (const r of proud) { p.stageScores[r.stageId] = 1; p.clearMissions[r.stageId] = Array.from({ length: objs(r) }, (_, i) => i + 1); }
const lastObj = [...proud].reverse().find((r) => objs(r) === 3);
p.clearMissions[lastObj.stageId] = [1, 2];
a = ach();
check(a.mainNumerator === TOTAL - 1 && story0(a) === '99%', `un obiettivo mancante: ${a.mainNumerator} ${story0(a)}`);

// 7. tutto: COMPLETE solo per Story; le altre restano 0%
p.clearMissions[lastObj.stageId] = [1, 2, 3];
a = ach();
check(a.mainNumerator === TOTAL && a.mainDenominator === TOTAL && story0(a) === 'COMPLETE', `tutto: ${a.mainNumerator}/${a.mainDenominator}`);
emptyOk(a, 'tutto');

// 8. salvataggio vecchio senza clearMissions: risponde 0%
delete p.clearMissions;
a = ach();
check(a.mainNumerator === 0 && story0(a) === '0%', 'salvataggio senza clearMissions');
p.clearMissions = {};

// 9. la rotta (GET con la query cifrata del client)
check(require('./server').route('/stage/achievements?m=1&i=1&v=x') === 'stageachievements', 'rotta /stage/achievements');
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.slice(0, 60).join('\n  ')); process.exit(1); }
log(`OK: /stage/achievements (Story ${STORY_OBJ} + Proud ${PROUD_OBJ} obiettivi, Special/Events/Union Cross 0/1)`);
