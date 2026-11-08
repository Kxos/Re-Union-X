// Draw Points (user decision 03-11): selling Attack Medals of Tier >= 2 gives Tier points (medal.sellTicket,
// make-sell-ticket.js), shown as userPoint.limitedDrawTicket3 and spent in the Draw Points Deal (payType 9, 100 a draw);
// reward type 42 credits them. Points are earned only once the Story reaches the first Draw Points Deal.
//   node server/test-draw-points.js [master folder]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-dp-${process.pid}.json`);
const BANNERS = path.join(os.tmpdir(), `khux-test-dp-banners-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE;
const SRC_MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const MASTER = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-dp-master-'));
const sellTicket = require('./make-sell-ticket');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- make-sell-ticket: the rule on synthetic rows
{
  const rows = [
    { medalId: 1, type: 1, guiltValue: 1 }, { medalId: 2, type: 1, guiltValue: 2 }, { medalId: 3, type: 1, guiltValue: 10 },
    { medalId: 4, type: 2, guiltValue: 0 }, { medalId: 5, type: 9, guiltValue: 8 }, { medalId: 6, type: 1, guiltValue: 0 },
    { medalId: 1000003, type: 1, guiltValue: 0, groupId: 3 }, { medalId: 7, type: 1, guiltValue: 5, sellTicket: 99 },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-dp-rows-'));
  fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify(rows));
  const log = console.log; console.log = () => {};
  const r1 = sellTicket.patch(dir), r2 = sellTicket.patch(dir);
  console.log = log;
  const got = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8')).map((r) => r.sellTicket || 0);
  check(JSON.stringify(got) === '[0,2,10,0,0,0,10,5]', `sellTicket = Tier on Attack Medals of Tier >= 2 (boosted copy from its normal Medal): ${got}`);
  check(r1.changed === 4 && r1.earning === 4 && r2.changed === 0, `patch idempotent (${JSON.stringify(r1)} ${JSON.stringify(r2)})`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- server: temporary master (real tables, small burst.json), sellTicket patched
for (const f of fs.readdirSync(SRC_MASTER).filter((x) => x.endsWith('.json') && x !== 'burst.json')) fs.copyFileSync(path.join(SRC_MASTER, f), path.join(MASTER, f));
fs.writeFileSync(path.join(MASTER, 'burst.json'), '[]');
{ const log = console.log; console.log = () => {}; sellTicket.patch(MASTER); console.log = log; }
process.on('exit', () => { try { fs.rmSync(MASTER, { recursive: true, force: true }); fs.unlinkSync(SAVE); fs.unlinkSync(BANNERS); } catch { /* gone */ } });
const medalRows = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
const T5 = medalRows.find((r) => r.type === 1 && r.guiltValue === 5 && r.medalId < 1000000 && !r.validPack);
const T1 = medalRows.find((r) => r.type === 1 && r.guiltValue === 1 && r.medalId < 1000000 && !r.validPack);
const SN = medalRows.find((r) => r.type === 1 && r.rare === 7 && r.guiltValue >= 8 && r.medalId < 1000000);
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_REVISION = '118';
process.env.KHUX_GACHA_BANNERS = BANNERS;
process.env.KHUX_GACHA_SIZES = '1,3,10';
delete process.env.KHUX_GACHA_SHOW; delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
const ms = Date.parse('2026-10-16T15:00:00Z'); Date.now = () => ms;
const dpDeal = {
  rowId: 'B0001', drawMedalTypeId: 10001, name: 'Draw Points Deal', type: 'T_POINTS', flags: ['PERMANENT'], start: '2016-04-07', end: '2016-06-30',
  endSource: 'original', unlockQuest: 250, payType: 9, currency: 'points', prices: [100], lotCount: 1, rarityMix: [[7, 1]], epicBoost: false,
  dayLimit: 0, totalLimit: 0, vipFree: false, pool: { mode: 'list', sets: [], names: ['sn'], featured: [], filter: [], inheritAfter: null, evolve: null },
  guarantee: { list: [], count: 0, pity: null, every: null, slots: [] }, enhance: { preset: [], boosted: [], maxSkill: [], notReproduced: [] },
  skill: null, bonus: [], catalogOnly: null, guaranteesText: '',
};
const catalog = {
  version: 1, firstRarity: { 3: '2016-04-07', 7: '2016-04-07' }, story: [[1, 249, '2016-04-07'], [250, 525, '2016-04-21']], subsets: {},
  medals: { sn: { date: '2016-04-07', ids: [[SN.medalId, 7, '2016-04-07']], std: false } }, banners: [dpDeal],
};
fs.writeFileSync(BANNERS, JSON.stringify(catalog));
const log = console.log, logs = [];
const quiet = (fn) => { console.log = (...a) => logs.push(a.join(' ')); try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const setQuest = (q) => { p.stageScores = { [t.masterRows('stage').find((r) => r.id === q).stageId]: 1 }; };
const give = (medalId) => { quiet(() => t.grantItem(3, medalId, 1)); return p.medals[p.medals.length - 1].userMedalId; };
const sell = (...ids) => call(t.respondMedalSell, { userMedalIds: ids, numbers: ids.map(() => 1) });
const points = () => t.userPointData(t.serverTime()).limitedDrawTicket3;

check(T5 && T1 && SN, 'medals of Tier 5 and 1 and a 7★ in the master');
check(T5.sellTicket === 5 && T1.sellTicket === 0, `master sellTicket: Tier 5 -> ${T5.sellTicket}, Tier 1 -> ${T1.sellTicket}`);

// before the Story reaches the first Draw Points Deal (unlockQuest 250): selling gives Munny only
setQuest(200);
let r = sell(give(T5.medalId));
check(r.userData.userPoint.limitedDrawTicket3 === 0 && !(p.drawPoints > 0), 'quest 200: no Draw Points before the Draw Points Deal');
// from the Draw Points Deal on: Tier points, Tier 1 nothing
setQuest(300);
r = sell(give(T5.medalId), give(T1.medalId), give(T5.medalId));
check(p.drawPoints === 10 && r.userData.userPoint.limitedDrawTicket3 === 10, `quest 300: two Tier 5 + one Tier 1 = 10 points (${p.drawPoints})`);
check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).drawPoints === 10, 'Draw Points saved');
// reward type 42 (Present Box): Draw Points
quiet(() => t.grantItem(42, 0, 1000));
check(p.drawPoints === 1010 && points() === 1010, `grantItem 42: +1000 Draw Points (${p.drawPoints})`);

// the Draw Points Deal in the Shop, payType 9, price 100
const l = call(t.respondGachaList);
const plate = l.gachaList.find((x) => x.drawMedalTypeId === 10001);
check(plate && plate.payType === 9 && plate.price === 100 && plate.lotCount === 1, `Shop plate: payType 9, 100, x1 (${JSON.stringify(plate && { payType: plate.payType, price: plate.price })})`);
const stone = p.freeStone;
r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 1 });
check(r.userMedalIds && r.userMedalIds.length === 1 && p.drawPoints === 910 && p.freeStone === stone, `draw: 100 points spent, Jewels untouched (${p.drawPoints})`);
check(r.userData && r.userData.userPoint.limitedDrawTicket3 === 910, 'draw response: limitedDrawTicket3 910');
p.drawPoints = 99;
r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 1 });
check(!r.userMedalIds && p.drawPoints === 99, 'draw refused with 99 points');

// Sell Medals worth Jewels (medal.sellJewel; Riku & Moogle 6★ 90296, medal-restored.js): +500 Jewels each, no Munny
const RM = medalRows.find((x) => x.medalId === 90296);
if (RM) {
  const st0 = p.freeStone || 0, mo0 = p.money || 0, dp0 = p.drawPoints;
  sell(give(90296), give(90296));
  check(p.freeStone === st0 + 1000 && p.money === mo0 && p.drawPoints === dp0,
    `two Riku & Moogle sold: +1000 Jewels (${(p.freeStone || 0) - st0}), Munny +${p.money - mo0}`);
} else console.log('  (Riku & Moogle 90296 not in this master: Sell Jewel check skipped)');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log('OK: draw points');
