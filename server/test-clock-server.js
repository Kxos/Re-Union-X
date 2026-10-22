// Ora del server dall'orologio finto (server.js + clock.js): node server/test-clock-server.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-clocksrv-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_SERVER_TIME;
const realNow = Date.now;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };

call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
call(t.respondKhuxLogin);
check(t.serverTime() === '2020-10-16 15:00:00', `serverTime ${t.serverTime()}`);
// la sessione attraversa il mese: lo scostamento resta quello del login
at('2026-11-02T10:00:00Z');
check(t.serverTime() === '2020-11-02 10:00:00', `dopo il cambio mese senza login: ${t.serverTime()}`);
// riavvio a gioco aperto: lo scostamento salvato si riprende
check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).clockOffset === t.clockOffset(), 'clockOffset salvato');
// nuovo login a novembre: gemello di novembre 2026 (inizia di domenica, 30 giorni -> novembre 2020)
call(t.respondKhuxLogin);
check(t.serverTime().startsWith('2020-11-02'), `login di novembre: ${t.serverTime()}`);
check(t.outTime(Date.parse('2026-11-02T10:00:00Z')) === '2020-11-02 10:00:00', 'outTime numero');
check(t.outTime('2021-05-15 12:00:00') === '2021-05-15 12:00:00', 'outTime stringa vecchia');
check(t.outTime(undefined, 'x') === 'x', 'outTime assente');

Date.now = realNow;
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: ora del server');
