// Login bonus (I-176, login-bonus.js e POST /login/bonus): node server/test-login-bonus.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const lb = require('./login-bonus');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// regole pure, con una tabella ridotta: Daily 100-104, Total ai giorni 1, 4 (titolo) e 7
const ROWS = [
  ...[100, 100, 200, 200, 300].map((n, i) => ({ loginBonusId: 100 + i, bonusType: 1, day: i + 1, rewardType: 2, rewardId: 0, rewardNum: n })),
  { loginBonusId: 200, bonusType: 2, day: 1, rewardType: 2, rewardId: 0, rewardNum: 300 },
  { loginBonusId: 203, bonusType: 2, day: 4, rewardType: 7, rewardId: 14001, rewardNum: 1 },
  { loginBonusId: 206, bonusType: 2, day: 7, rewardType: 2, rewardId: 0, rewardNum: 100 },
];
check([1, 2, 3, 4, 5, 6, 10, 11].map(lb.cycleDay).join() === '1,2,3,4,5,1,5,1', 'ciclo di 5');
check(lb.acquirable(undefined, 0) && lb.acquirable(lb.fresh(), 5), 'stato nuovo: riscuotibile');
let r = lb.claim(undefined, 100, ROWS);
check(r.state.total === 1 && r.state.lastDay === 100, `giorno 1: ${JSON.stringify(r.state)}`);
check(JSON.stringify(r.rewards.map((x) => [x.type, x.num, x.comment])) === JSON.stringify([[2, 100, lb.DAILY_COMMENT], [2, 300, lb.TOTAL_COMMENT]]), `premi del giorno 1: ${JSON.stringify(r.rewards)}`);
check(JSON.stringify(r.response) === JSON.stringify({ continue: { loginBonusId: 100, dayCount: 1 }, total: { loginBonusId: 200, dayCount: 1 }, specials: [] }), `risposta del giorno 1: ${JSON.stringify(r.response)}`);
check(!lb.acquirable(r.state, 100), 'stesso giorno: non riscuotibile');
const again = lb.claim(r.state, 100, ROWS);
check(again.rewards.length === 0 && JSON.stringify(again.response) === JSON.stringify(r.response) && again.state.total === 1, 'stesso giorno due volte: stessa risposta, niente premi');
// giorno saltato: il ciclo continua (101 -> giorno 2, poi 105 -> giorno 3)
r = lb.claim(r.state, 101, ROWS);
r = lb.claim(r.state, 105, ROWS);
check(r.state.total === 3 && r.response.continue.loginBonusId === 102 && r.response.continue.dayCount === 3, `dopo un salto: ${JSON.stringify(r.response)}`);
check(r.response.total.loginBonusId === 0 && r.rewards.length === 1, 'giorno senza traguardo: total.loginBonusId 0, solo il Daily');
r = lb.claim(r.state, 106, ROWS);
check(r.rewards.some((x) => x.type === 7 && x.id === 14001) && r.response.total.loginBonusId === 203, `titolo al giorno 4: ${JSON.stringify(r.rewards)}`);
r = lb.claim(r.state, 107, ROWS); r = lb.claim(r.state, 108, ROWS);
check(r.response.continue.loginBonusId === 100 && r.rewards[0].num === 100, 'giorno 6: il Daily riparte da 1');

// generatore: 5 righe Daily con i jewel dalla v2.3.1, Total intatte
const gen = require('./make-login-bonus');
const src = [...[50, 50, 100, 100, 200].map((n, i) => ({ loginBonusId: 100 + i, bonusType: 1, day: i + 1, rewardType: 2, rewardNum: n, _end: 1 })),
  { loginBonusId: 200, bonusType: 2, day: 1, rewardType: 2, rewardNum: 300 }, { loginBonusId: 311, bonusType: 3, day: 0, rewardType: 2, rewardNum: 50 }];
const out = gen.rows(src);
check(out.length === 6 && out.slice(0, 5).map((x) => x.rewardNum).join() === '100,100,200,200,300', `generatore: ${JSON.stringify(out.map((x) => x.rewardNum))}`);
check(!out.some((x) => x.bonusType === 3) && !('_end' in out[0]), 'generatore: niente speciali ne\' campi del decodificatore');

// server: /khux/login e /login/bonus col master vero
const SAVE = path.join(os.tmpdir(), `khux-test-lb-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE; delete process.env.KHUX_SERVER_TIME; delete process.env.KHUX_LOGIN_BONUS;
const realNowFn = Date.now; const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-20T09:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
if (t.masterRows('loginBonus').length !== 98) errors.push(`master loginBonus: ${t.masterRows('loginBonus').length} righe (lanciare node server/make-login-bonus.js)`);
t.player.tutorialPhase = 0;
check(call(t.respondKhuxLogin).gameLogin.acquirableLoginBonus === false, 'tutorial non finito: niente login bonus');
t.player.tutorialPhase = 995;
check(call(t.respondKhuxLogin).gameLogin.acquirableLoginBonus === true, 'primo login: login bonus');
const n0 = (t.player.presents || []).length;
const b1 = call(t.respondLoginBonus);
check(b1.loginBonus.continue.loginBonusId === 100 && b1.loginBonus.total.dayCount === 1 && b1.loginBonus.total.loginBonusId === 200, `risposta: ${JSON.stringify(b1.loginBonus)}`);
const got = (t.player.presents || []).slice(n0);
check(got.length === 2 && got[0].comment === 'Daily Login Bonus Reward' && got[0].number === 100 && got[1].number === 300, `Presents: ${JSON.stringify(got)}`);
check(call(t.respondKhuxLogin).gameLogin.acquirableLoginBonus === false, 'secondo login dello stesso giorno');
call(t.respondLoginBonus);
check((t.player.presents || []).length === n0 + 2, 'riscossione doppia');
// cambio di giorno alle 08:00 UTC
at('2026-10-21T07:59:00Z');
check(call(t.respondKhuxLogin).gameLogin.acquirableLoginBonus === false, 'alle 07:59 e\' ancora lo stesso giorno');
at('2026-10-21T08:00:00Z');
check(call(t.respondKhuxLogin).gameLogin.acquirableLoginBonus === true, 'alle 08:00 nuovo giorno');
check(call(t.respondLoginBonus).loginBonus.continue.dayCount === 2, 'giorno 2');

Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: login bonus');
