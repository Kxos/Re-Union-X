// I-235: the payType 8 balance (userPoint.limitedDrawTicket2) follows the currency the Shop lists NOW, also before the
// first /gacha/list of a new season (the client reads the plate count from the last userPoint it got, and /gacha/list
// carries none). node server/test-listed-currency.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-listed-${process.pid}.json`);
const BANNERS = path.join(os.tmpdir(), `khux-test-listed-banners-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.on('exit', () => { for (const f of [SAVE, BANNERS]) try { fs.unlinkSync(f); } catch { /* gone */ } });
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_GACHA_BANNERS = BANNERS;
process.env.KHUX_GACHA_SIZES = '1,3,10';
process.env.KHUX_GACHA_SHOW = '';
delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
const ms = Date.parse('2026-10-16T15:00:00Z'); Date.now = () => ms;

const v = (base, date, rares = [3, 4, 5]) => rares.map((r) => [base + r, r, date]);
const medals = {
  wakka: { date: '2016-04-07', ids: v(11010, '2016-04-07'), std: true, origin: 'ffkh', att: 'power' },
  tidus: { date: '2016-04-07', ids: v(12010, '2016-04-07'), std: true, origin: 'ffkh', att: 'speed' },
};
let n = 0;
const mk = (o) => ({
  rowId: `B000${++n}`, drawMedalTypeId: 10000 + n, name: `Banner ${n}`, type: 'TIME_LIMITED', flags: [], start: '2016-04-07', end: '2016-04-30',
  endSource: 'original', unlockQuest: 1, payType: 1, currency: 'jewel', prices: [300], lotCount: 1, rarityMix: [[3, 1]],
  epicBoost: false, dayLimit: 0, vipFree: false, pool: { mode: 'sets', sets: [], names: ['wakka', 'tidus'], featured: [], filter: [], inheritAfter: null, evolve: null },
  guarantee: { list: [], count: 0, pity: null, every: null }, skill: null, bonus: [], catalogOnly: null, guaranteesText: '', ...o,
});
const catalog = {
  version: 1, firstRarity: { 3: '2016-04-07', 4: '2016-04-07', 5: '2016-04-07', 6: '2016-07-15', 7: '2018-05-25' },
  story: [[1, 200, '2016-04-07'], [201, 250, '2016-04-21'], [251, 525, '2016-05-05']],
  subsets: {}, medals,
  banners: [
    mk({ name: 'Jewel Deal', end: '2016-06-30' }),
    mk({ name: 'Spooky Cookies Deal', payType: 8, currency: 'spooky', prices: [10] }),
  ],
};
fs.writeFileSync(BANNERS, JSON.stringify(catalog));

const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const setQuest = (q) => { p.stageScores = { [t.masterRows('stage').find((r) => r.id === q).stageId]: 1 }; };
const ticket2 = () => quiet(() => t.userPointData(t.serverTime())).limitedDrawTicket2;

// Q200 = story 2016-04-07: the Spooky Cookies Deal is in the Shop. The last Shop opening listed no seasonal deal.
setQuest(200);
p.drawTickets = { draw: 1, holiday: 0, spooky: 10, moogle: 0 };
p.gacha = { ...(p.gacha || {}), listedCurrency: 'draw' };
check(ticket2() === 10, `before the first /gacha/list: limitedDrawTicket2 ${ticket2()} (want the 10 Spooky Cookies)`);
const l = call(t.respondGachaList);
check(l.gachaList.some((x) => x.drawMedalTypeId === 10002), 'the Spooky Cookies Deal is listed');
check(p.gacha.listedCurrency === 'spooky' && ticket2() === 10, 'after /gacha/list: still the Spooky Cookies');
// a board node pays spooky cookies: the balance of the next userPoint follows at once
quiet(() => t.grantItem(41, 2, 5));
check(ticket2() === 15, `after grantItem spooky +5: ${ticket2()}`);

// Q260 = story 2016-05-05: the season is over, the plate is the plain Draw Ticket again, without opening the Shop
setQuest(260);
check(ticket2() === 1, `after the season: limitedDrawTicket2 ${ticket2()} (want the 1 Draw Ticket)`);

// I-135: the Banner Catalog plate pays with paid Jewels (payType 3), which the server never grants: a draw on it is
// refused with a bare {ret} (client: «200 ERROR :76», back to the Shop) and nothing is charged or given
const cat = l.gachaList.find((x) => x.drawMedalTypeId === 9001);
check(cat && cat.payType === 3 && cat.price === 1, `Catalog plate on payType 3: ${JSON.stringify(cat && { payType: cat.payType, price: cat.price })}`);
check(l.gachaList.filter((x) => x.payType === 3).length === 1, 'payType 3 only on the Catalog plate');
// grey, untappable button: the client's «no draws left» state (isDayLimited 1, userLimitedCount 0), as a used DAILY DEAL!
check(cat.isDayLimited === 1 && cat.userLimitedCount === 0, `Catalog plate greyed (isDayLimited ${cat.isDayLimited}, userLimitedCount ${cat.userLimitedCount})`);
p.freeStone = 5000;
quiet(() => t.grantItem(2, 0, 300));
check(p.freeStone === 5300 && p.payStone === undefined, `a Jewel reward is free Jewels only (freeStone ${p.freeStone}, payStone ${p.payStone})`);
const before = JSON.stringify({ s: p.freeStone, m: (p.medals || []).length, d: p.drawTickets });
const d = call(t.respondGachaDraw, { drawMedalTypeId: 9001, count: 1 });
check(d && d.ret && Object.keys(d).length === 1, `draw on the Catalog plate refused with {ret} only: ${Object.keys(d || {})}`);
check(JSON.stringify({ s: p.freeStone, m: (p.medals || []).length, d: p.drawTickets }) === before, 'nothing charged or given by the refused draw');

if (errors.length) { console.log(`ERRORS (${errors.length}):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log('test-listed-currency: OK');
