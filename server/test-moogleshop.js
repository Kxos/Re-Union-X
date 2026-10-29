// Moogle Shop con l'orologio finto (I-021): node server/test-moogleshop.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
// salvataggio temporaneo: mai server/save/
const SAVE = path.join(os.tmpdir(), `khux-test-moogleshop-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_REVISION = '117';
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });

// offerte a tempo: scadenza = lunedi' dopo, 08:00 finto (prima: endDate fissata alla generazione, «2137 days left»)
const rows = t.servedMasterRows('moogleshop', Date.now());
const timed = rows.filter((r) => r.display);
check(timed.length === 2, `${timed.length} offerte a tempo`);
check(timed.every((r) => r.endDate === '2020-10-19 08:00:00'), `scadenze ${timed.map((r) => r.endDate)}`);
check(rows.filter((r) => !r.display).every((r) => r.endDate === t.masterRows('moogleshop').find((x) => x.moogleshopId === r.moogleshopId).endDate),
  'righe permanenti cambiate');

// scambi: quelli delle offerte a tempo ripartono la settimana dopo, gli altri restano
const id = timed[0].moogleshopId, perm = rows.find((r) => !r.display).moogleshopId;
t.moogleshopBought(); // fissa la settimana corrente (un save senza moogleshopWeek riparte da zero sulle offerte a tempo)
Object.assign(t.player.moogleshopBought, { [id]: 3, [perm]: 1 });
check(t.moogleshopBought()[id] === 3, 'scambi della settimana persi');
at('2026-10-19T09:00:00Z');
const b = t.moogleshopBought();
check(!b[id] && b[perm] === 1, `dopo il lunedi': ${JSON.stringify(b)}`);
check(t.servedMasterRows('moogleshop', Date.now()).find((r) => r.moogleshopId === id).endDate === '2020-10-26 08:00:00', 'scadenza della settimana dopo');

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-moogleshop: OK');
