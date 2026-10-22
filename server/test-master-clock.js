// Master servito con l'orologio finto: node server/test-master-clock.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
// salvataggio temporaneo: mai server/save/
const SAVE = path.join(os.tmpdir(), `khux-test-master-clock-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_REVISION = '117';
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
check(Number.isFinite(t.player.clockOffset), 'clockOffset non fissato da /user/create');

const rev = t.masterRevisionNow();
check(rev > 117 * 100000, `revisione ${rev}`);
const m = call(t.respondMaster);
check(m.master.revision === rev && m.mission.revision === rev, 'revisione nel master');
const rows = t.servedMasterRows('mission', Date.now());
const end = (id) => rows.find((r) => r.id === id).endDate;
// settimana del 12/10/2026 (indice pari o dispari): una serie Weekly scade lunedi' 19/10, l'altra il 26/10
const a = end(3001), b = end(3011);
check(new Set([a, b]).size === 2 && [a, b].includes('2020-10-19 08:00:00') && [a, b].includes('2020-10-26 08:00:00'), `Weekly ${a} / ${b}`);
// Limited: la mensile attiva scade il 1/11 08:00 finto
const activeMonthly = t.LIMITED_ROTATION.monthly.find((ids) => ids.every((id) => t.limitedActive(id)));
check(end(activeMonthly[0]) === '2020-11-01 08:00:00', `Limited mensile ${end(activeMonthly[0])}`);
// rewardEndTime (conto alla rovescia delle missioni COMPLETE) uguale a endDate nelle righe riscritte
check(rows.filter((r) => r.missionType === 3 || (r.missionType === 4 && r.endDate !== '2099-12-31 23:59:59'))
  .every((r) => r.rewardEndTime === r.endDate), 'rewardEndTime diverso da endDate');
check(rows.find((r) => r.id === activeMonthly[0]).rewardEndTime === '2020-11-01 08:00:00', 'rewardEndTime della Limited mensile');
// stesso contenuto per la stessa revisione, e servito in meno di 50 ms dalla cache
const b1 = t.masterBody('mission'); const t0 = process.hrtime.bigint();
call(t.respondMaster);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
check(t.masterBody('mission').equals(b1), 'contenuto cambiato senza cambio di revisione');
check(ms < 50, `respondMaster ${ms.toFixed(1)} ms con la cache`);
// risorse: versionRes/darkVersionRes non seguono la revisione del master
// (versionDat e le altre stanno nell'involucro ret() di ogni risposta, non in respondStatus)
const st = call(t.respondMaster).ret;
check(st.darkVersionRes === 117 && st.versionDat === rev, `status ${st.versionDat} ${st.darkVersionRes}`);
// la settimana dopo: nuova revisione, nuove scadenze
at('2026-10-19T09:00:00Z');
check(t.masterRevisionNow() === rev + 1, 'revisione +1 al lunedi');

// Revisione fissata per la sessione (/system/login): una scadenza passata a gioco aperto non cambia
// ret().versionDat ne' il master servito (il client tornerebbe al titolo, banco 16-10)
const raw = (fn, ...a) => { let b = null; quiet(() => fn(...a, { writeHead() {}, end(x) { b = x; } })); return b; };
at('2026-10-26T07:55:00Z');
call(t.respondLogin);
const r0 = t.sessionRevision();
check(r0 === t.masterRevisionNow(), `revisione della sessione ${r0}`);
const m0 = call(t.respondMaster); const body0 = t.masterBody('mission');
at('2026-10-26T08:01:00Z');
check(t.masterRevisionNow() === r0 + 1, 'scadenza non passata');
const m1 = call(t.respondMaster);
check(m1.ret.versionDat === r0 && m1.ret.commonVersionDat === r0 && m1.ret.darkVersionDat === r0, `ret dopo la scadenza ${m1.ret.versionDat}`);
check(m1.master.revision === r0 && m1.mission.md5 === m0.mission.md5, 'master cambiato a sessione aperta');
// download a cavallo della scadenza: il corpo scaricato dopo corrisponde all'md5 dato prima
const file = raw(t.respondMasterFile, { url: '/master/mission' });
check(file.equals(body0) && crypto.createHash('md5').update(file).digest('hex') === m0.mission.md5, 'md5/corpo diversi dopo la scadenza');
process.env.KHUX_RESOURCE_SIZE = '5';
const rs = call(t.respondResourceSize, { masterRevision: r0, resourceRevision: 1e9 });
const rsOld = call(t.respondResourceSize, { masterRevision: r0 - 1, resourceRevision: 1e9 });
delete process.env.KHUX_RESOURCE_SIZE;
check(rs.size === 0 && rsOld.size === 5, `resourcesize a sessione aperta: ${rs.size} / ${rsOld.size}`);
// login successivo: revisione e master nuovi
call(t.respondLogin);
check(t.sessionRevision() === r0 + 1 && call(t.respondMaster).ret.versionDat === r0 + 1, 'revisione nuova al login');
check(!t.masterBody('mission').equals(body0), 'master uguale dopo il nuovo login');

Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
// KHUX_REAL_NOW illeggibile: il server non parte, con un errore chiaro
const bad = require('child_process').spawnSync(process.execPath, ['-e', "require('./server')"],
  { cwd: __dirname, env: { ...process.env, KHUX_REAL_NOW: 'lunedi', KHUX_SAVE: SAVE }, encoding: 'utf8' });
check(bad.status !== 0 && /KHUX_REAL_NOW non valido/.test(bad.stderr), `KHUX_REAL_NOW non valido accettato (${bad.status})`);
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: master con l\'orologio');
