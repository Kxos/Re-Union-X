// Chiusura dei periodi delle missioni (server.js settleClock): node server/test-mission-settle.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-settle-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1';
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
t.player.medals = t.player.medals || [];
quiet(() => t.settleClock());

const daily = t.masterRows('mission').find((r) => r.missionType === 2 && t.MISSION_COUNTER[r.conditionId] === 'quest');
const list1 = quiet(() => t.missionsData());
check(list1.some((m) => m.id === daily.id), 'Daily attiva');
quiet(() => t.missionCount('quest', daily.targetNum[0]));
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).status === 1, 'Daily completata');
const presentsBefore = (t.player.presents || []).length;
// il giorno dopo alle 09:00: periodo chiuso, premio nei Presents una volta
at('2026-10-17T09:00:00Z');
quiet(() => t.settleClock());
quiet(() => t.settleClock());
const added = (t.player.presents || []).slice(presentsBefore);
check(added.length >= 1 && added.some((p) => p.comment === 'Daily Mission reward'), `Presents: ${JSON.stringify(added)}`);
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).status === 0, 'Daily ripartita');
// riscossione della campagna vecchia: niente premio
const stone = t.player.freeStone || 0;
call(t.respondMissionReceive, { receiveMissionIds: [daily.id] });
check((t.player.freeStone || 0) === stone, 'riscossione dopo la scadenza pagata');
// riavvio: nessuna seconda consegna
const n = (t.player.presents || []).length;
quiet(() => t.settleClock());
check((t.player.presents || []).length === n, 'consegna doppia');
// confine delle 08:00: alle 07:59 del 18 il giorno e' ancora il 17
at('2026-10-18T07:59:00Z');
quiet(() => t.missionCount('quest', 1));
at('2026-10-18T08:00:00Z');
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).numUpper === 0, 'azzeramento alle 08:00');

// Weekly A/B: una sola serie attiva per settimana, alternata
at('2026-10-14T12:00:00Z');
const wk = quiet(() => t.missionsData()).map((m) => m.id).filter((id) => id >= 3001 && id <= 3020);
at('2026-10-21T12:00:00Z');
const wk2 = quiet(() => t.missionsData()).map((m) => m.id).filter((id) => id >= 3001 && id <= 3020);
check(wk.length === 10 && wk2.length === 10, `Weekly attive ${wk.length}/${wk2.length}`);
check(!wk.some((id) => wk2.includes(id)), 'serie A/B non alternate');
// la serie A (3001-3010) e' quella delle settimane pari
const evenWk = require('./clock').weekIndex(Date.parse('2026-10-14T12:00:00Z')) % 2 === 0 ? wk : wk2;
check(evenWk.every((id) => id <= 3010), `serie A non attiva nella settimana pari: ${evenWk}`);

Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: chiusura dei periodi');
