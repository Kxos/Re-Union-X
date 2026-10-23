// Skip Ticket del popup di avvio (I-203): node server/test-skip.js
// Controlla: /stage/start con stageSkip 1 scala uno Skip Ticket, con 2 uno Skip Ticket+, la risposta riporta i conteggi
// nuovi in userPoint, senza stageSkip non si scala nulla, a 0 biglietti non si va sotto zero.
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo nuovo.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-skip-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
p.stageSkipTicket = 2; p.superSkipTicket = 1;
const start = (o) => call(t.respondStageStart, { stageId: 1010, supportUserId: 0, userKeybladeId: 1, ...o });

let r = start({});
check(p.stageSkipTicket === 2 && p.superSkipTicket === 1, 'senza stageSkip nessun biglietto scalato');
check(r.userData.userPoint.stageSkipTicket === 2 && r.userData.userPoint.superSkipTicket === 1, 'userPoint con i due conteggi');
r = start({ stageSkip: 1 });
check(p.stageSkipTicket === 1 && p.superSkipTicket === 1, `stageSkip 1: Skip Ticket 2 -> ${p.stageSkipTicket}`);
check(r.userData.userPoint.stageSkipTicket === 1, 'risposta con lo Skip Ticket gia\' scalato');
check(r.startStageData.stageSkip === 1, 'startStageData.stageSkip ripetuto');
r = start({ stageSkip: 2 });
check(p.stageSkipTicket === 1 && p.superSkipTicket === 0, `stageSkip 2: Skip Ticket+ 1 -> ${p.superSkipTicket}`);
check(r.userData.userPoint.superSkipTicket === 0, 'risposta con lo Skip Ticket+ gia\' scalato');
start({ stageSkip: 2 });
check(p.superSkipTicket === 0, 'a 0 non va sotto zero');
start({ stageSkip: 7 });
check(p.stageSkipTicket === 1 && p.superSkipTicket === 0, 'stageSkip sconosciuto: nulla scalato');

// Lux Record: uno skip segna la missione superata ma non alza il record (23-10)
const clear = (lux) => call(t.respondStageClear, { getPoint: { exp: 0, money: 0, lux, score: 0 }, getMaterials: [],
  getEnemyDropItems: [], getTreasures: [], clearMissionIds: [] });
p.stageScores = {};
p.stageSkipTicket = 1;
start({ stageSkip: 1 }); clear(5000);
check(1010 in p.stageScores && p.stageScores[1010] === 0, `skip su missione nuova: superata, record 0 (${p.stageScores[1010]})`);
start({}); clear(3000);
check(p.stageScores[1010] === 3000, `partita normale: record 3000 (${p.stageScores[1010]})`);
p.superSkipTicket = 1;
start({ stageSkip: 2 }); clear(9000);
check(p.stageScores[1010] === 3000, `Force Skip: record invariato (${p.stageScores[1010]})`);

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log('ERRORI:\n  ' + errors.join('\n  ')); process.exit(1); }
log('OK: Skip Ticket (stageSkip 1) e Skip Ticket+ (stageSkip 2) scalati da /stage/start, Lux Record invariato dagli skip');
