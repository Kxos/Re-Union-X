// Raid Boards in server.js (plan 2026-11-02-raids-part2, Task 7): /user/sphere lists the boards of the current and kept raids,
// /user/sphere/update charges Raid Coins and pays each reward once, /user/sphere/check closes the boards that left.
// Two fixture boards (ids 3999901, 3999902) are served on top of the local master_data sphere tables; the raid index is a
// fixture file. Needs server/master_data (skipped without it).
//   node server/test-raid-boards.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const rb = require('./raid-boards');

const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
if (!fs.existsSync(path.join(MASTER, 'sphere.json')) || !fs.existsSync(path.join(MASTER, 'medal.json'))) {
  console.log('test-raid-boards: skipped (no master_data)');
  process.exit(0);
}
const A = 3999901, B = 3999902, STD = 2100001;
const masu = (id, cells, done) => {
  const m = { masuId: id, sphereBoardId: id };
  for (const k of ['spherePoint', 'rewardSelect', 'medalCategory', 'rewardId', 'rewardExpand', 'rewardExpandId', 'rewardValue', 'burstUpperNumber']) m[k] = Array(23).fill(0);
  cells.forEach(([cost, sel, rid, val], i) => { m.spherePoint[i] = cost; m.rewardSelect[i] = sel; m.rewardId[i] = rid; m.rewardValue[i] = val; });
  [m.rewardSelect[22], m.rewardId[22], m.rewardValue[22]] = done;
  return m;
};
const sphereRow = (id, name) => ({ sphereBoardId: id, boardName: name, kindId: 0, boardId: 1, arryId: id, masuId: id, type: 5, openId: 0, openParam: 0, price: 0, detailUrl: '',
  startDatetime: '2015-01-01 00:00:00', endDatetime: '2099-12-31 23:59:59' });
const medalId = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'))[0].medalId;
const EXTRA = {
  'sphere.json': [sphereRow(A, 'Enhancement Board'), sphereRow(B, 'Radiant Rewards Board')],
  'sphereArray.json': [rb.gridRow(A, 3), rb.gridRow(B, 1)],
  'sphereMasu.json': [masu(A, [[10, 3, medalId, 1], [20, 2, 0, 100], [30, 5, 51, 2]], [3, medalId, 1]), masu(B, [[5, 2, 0, 7]], [2, 0, 50])],
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-raid-boards-'));
process.env.KHUX_SAVE = path.join(dir, 'save.json');
process.env.KHUX_RAID_INDEX = path.join(dir, 'raids.json');
process.env.KHUX_RAID_MODELS = path.join(dir, 'raid_models.json');
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
const entryOf = (key, censusId, ids, extra = {}) => ({ key, censusId, available: true, stageId: 989990, evStageId: 8990, enemyId: 2999900, modelId: 7, tier: 'Beginner', upMinutes: 20, useAp: 10,
  questAp: [0, 5, 90], start: '2015-01-01', end: '2099-12-31', sphereBoardIds: ids, ...extra }); // dates: in every Shop week (raid-calendar.js)
fs.writeFileSync(process.env.KHUX_RAID_INDEX, JSON.stringify({ entries: [entryOf('WA/Beginner', 'WA', [A]), entryOf('WA/Advanced', 'WA', [A], { tier: 'Advanced' }), entryOf('WB/Beginner', 'WB', [B])], reasons: {} }));
fs.writeFileSync(process.env.KHUX_RAID_MODELS, JSON.stringify({ '0007': { fight: true, start: true, escape: true, put_down: true } }));

// the fixture boards ride on the real sphere tables: in place before the server reads them for the first time
const readFile = fs.readFileSync;
fs.readFileSync = (f, ...a) => {
  const name = path.basename(String(f));
  if (EXTRA[name] && path.resolve(path.dirname(String(f))) === path.resolve(MASTER)) return JSON.stringify([...JSON.parse(readFile(f, 'utf8')), ...EXTRA[name]]);
  return readFile(f, ...a);
};
const log = console.log, warn = console.warn;
const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });

const list = () => quiet(() => t.userSphereAll({ setSent: true })).userSphereDatas; // GET /user/sphere
const byId = (datas, id) => datas.find((d) => d.sphereBoardId === id);
const update = (body) => call(t.respondSphereUpdate, body);
const check = (body) => call(t.respondSphereCheck, body);
const medals = () => (p.medals || []).length;

const tests = {
  listed_with_the_raid() {
    p.raidSpherePoint = 0;
    const datas = list();
    assert.ok(byId(datas, A) && byId(datas, B), 'the boards of the current raids');
    assert.deepStrictEqual(Object.keys(byId(datas, A)), ['userSphereBoardId', 'sphereBoardId', 'isBuy', 'status', 'unlockMasuIds', 'getDatetime']);
    assert.deepStrictEqual([byId(datas, A).isBuy, byId(datas, A).status, byId(datas, A).unlockMasuIds], [1, 1, []]);
    assert.ok(byId(datas, STD), 'standard boards stay');
    assert.ok(!(A in (p.sphere || {})) && !(B in (p.sphere || {})), 'never opened by the Lux level');
    const ids = datas.map((d) => d.userSphereBoardId);
    assert.strictEqual(new Set(ids).size, ids.length, 'one userSphereBoardId sequence');
    // the Raid Boards button: reset, then check [1,2] / [5] right after the login list: nothing new, nothing announced
    const c = check({ checkTypes: [1, 2], boardTypes: [5] });
    assert.ok(!c.userSphere.userSphereDatas.some((d) => d.sphereBoardId === A || d.sphereBoardId === B));
    assert.deepStrictEqual(c.closeEventSphereBoardIds, []);
  },
  spends_raid_coins() {
    p.raidSpherePoint = 100; p.spherePoint = 50;
    const n = medals();
    const r = update({ sphereBoardId: A, releaseMasuId: 1 });
    assert.strictEqual(p.raidSpherePoint, 90);
    assert.strictEqual(p.spherePoint, 50, 'Avatar Coins untouched');
    assert.strictEqual(r.userData.userPoint.raidSpherePoint, 90, 'the balance the client shows for type 5');
    assert.deepStrictEqual(r.userSphere.userSphereDatas.map((d) => [d.sphereBoardId, d.unlockMasuIds, d.status]), [[A, [1], 1]]);
    assert.strictEqual(medals(), n + 1, 'the medal of node 1');
    // not enough Raid Coins: refused even with Avatar Coins to spare
    p.raidSpherePoint = 5; p.spherePoint = 500;
    update({ sphereBoardId: A, releaseMasuId: 2 });
    assert.deepStrictEqual([p.raidSpherePoint, p.spherePoint, p.raidSphere[A].unlock], [5, 500, [1]]);
    // a standard board still charges Avatar Coins
    const std = t.masterRows('sphereMasu').find((m) => m.masuId === STD);
    const node = t.masterRows('sphereArray').find((a) => a.arryId === STD);
    const first = [node.spCol0, node.spCol1, node.spCol2, node.spCol3, node.spCol4].flat().filter((v) => v >= 1 && v <= 23).sort((a, b) => a - b)[0];
    p.raidSpherePoint = 100; p.spherePoint = 500;
    p.sphere[STD].unlock = [];
    update({ sphereBoardId: STD, releaseMasuId: first });
    assert.strictEqual(p.spherePoint, 500 - std.spherePoint[first - 1]);
    assert.strictEqual(p.raidSpherePoint, 100);
  },
  board_reward_once() {
    p.raidSpherePoint = 1000;
    const n = medals(), stone = p.freeStone || 0;
    const again = update({ sphereBoardId: A, releaseMasuId: 1 });
    assert.strictEqual(p.raidSpherePoint, 1000, 'nothing charged');
    assert.strictEqual(medals(), n, 'nothing paid');
    assert.deepStrictEqual(again.userSphere.userSphereDatas[0].unlockMasuIds, [1]);
    // a node that is not on the board
    update({ sphereBoardId: A, releaseMasuId: 9 });
    assert.strictEqual(p.raidSpherePoint, 1000);
    // the rest of the board, then the completion reward (index 22), once
    update({ sphereBoardId: A, releaseMasuId: 2 });
    assert.strictEqual(p.freeStone, stone + 100, 'jewels of node 2');
    const mat = (p.materials || {})[51] || 0;
    const last = update({ sphereBoardId: A, releaseMasuId: 3 });
    assert.strictEqual(p.materials[51], mat + 2, 'material of node 3');
    assert.strictEqual(medals(), n + 1, 'completion medal');
    assert.strictEqual(last.userSphere.userSphereDatas[0].status, 3);
    assert.strictEqual(p.raidSpherePoint, 1000 - 20 - 30);
    update({ sphereBoardId: A, releaseMasuId: 0, allOpen: 1 });
    assert.strictEqual(medals(), n + 1, 'Unlock All on a complete board pays nothing');
    assert.strictEqual(p.raidSpherePoint, 950);
  },
  close_event_boards() {
    const real = t.raid().boardIds;
    try {
      p.raidSpherePoint = 100;
      update({ sphereBoardId: B, releaseMasuId: 1 });
      assert.deepStrictEqual(p.raidSphere[B].unlock, [1]);
      // B leaves the current and the kept raid
      t.raid().boardIds = () => ({ active: [A], all: [A, B] });
      const c = check({ checkTypes: [3], boardTypes: [1] });
      assert.deepStrictEqual(c.closeEventSphereBoardIds, [B]);
      assert.ok(!byId(list(), B), 'the login list leaves it out');
      const before = p.raidSpherePoint;
      p.raidSphere[B].unlock = [];
      update({ sphereBoardId: B, releaseMasuId: 1 });
      assert.strictEqual(p.raidSpherePoint, before, 'a closed board cannot be bought');
      p.raidSphere[B].unlock = [1];
      // it comes back (a kept raid): the check without 3 adds it, with its progress
      t.raid().boardIds = () => ({ active: [A, B], all: [A, B] });
      const back = check({ checkTypes: [1, 2], boardTypes: [5] });
      assert.deepStrictEqual(back.userSphere.userSphereDatas.filter((d) => d.sphereBoardId === B).map((d) => d.unlockMasuIds), [[1]]);
      assert.deepStrictEqual(check({ checkTypes: [1, 2], boardTypes: [5] }).userSphere.userSphereDatas.filter((d) => d.sphereBoardId === B), [], 'once');
      assert.deepStrictEqual(byId(list(), B).unlockMasuIds, [1]);
      assert.deepStrictEqual(check({ checkTypes: [3], boardTypes: [1] }).closeEventSphereBoardIds, []);
    } finally { t.raid().boardIds = real; }
  },
  kept_raid_boards() {
    // routes-raid: the boards of the kept raid join the current ones; an entry key or a census id names it
    const idx = t.raidIndex();
    const saved = idx.entries.map((e) => ({ ...e }));
    try {
      idx.entries.forEach((e) => { if (e.censusId === 'WB') e.available = false; });
      assert.deepStrictEqual(t.raid().boardIds().active, [A]);
      idx.entries.push(entryOf('WC/Beginner', 'WC', [3999903]));
      p.raid.kept = 'WC/Beginner';
      assert.deepStrictEqual(t.raid().boardIds().active, [A, 3999903]);
      p.raid.kept = 'WC';
      assert.deepStrictEqual(t.raid().boardIds().active, [A, 3999903]);
      assert.deepStrictEqual(t.raid().boardIds().all.sort(), [A, B, 3999903]);
      // a board id the master does not serve is never handed out (the client would crash opening it)
      assert.ok(!byId(list(), 3999903));
    } finally { idx.entries.splice(0, idx.entries.length, ...saved); p.raid.kept = null; }
  },
  catalog_board_done() {
    // RAID BOARDS filter of the Raid Catalog (user 03-11): a board is complete when every node is unlocked in player.raidSphere,
    // the rule of the board screen (status 3), whether the board is handed out now or not
    const done = t.raidPageCtx().boardDone;
    assert.strictEqual(done(A), true, 'A completed in board_reward_once');
    const keep = p.raidSphere[A].unlock;
    try {
      p.raidSphere[A].unlock = [1, 3];
      assert.strictEqual(done(A), false, 'one node missing');
      const real = t.raid().boardIds;
      t.raid().boardIds = () => ({ active: [], all: [A, B] });
      try { p.raidSphere[A].unlock = [1, 2, 3]; assert.strictEqual(t.raidPageCtx().boardDone(A), true, 'closed now, progress kept'); } finally { t.raid().boardIds = real; }
    } finally { p.raidSphere[A].unlock = keep; }
    assert.strictEqual(done(3999903), false, 'not in the master: never complete');
    assert.strictEqual(done(3999999), false);
    const html = require('./raid-pages').catalogPage(t.raidIndex(), t.raidPageCtx());
    assert(/data-boards="done"/.test(html), 'the page gets it');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`); }
}
fs.readFileSync = readFile;
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
