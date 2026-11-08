// Event Coins and Event Boards (Events Part 3, Task 5): routes-event-boards.js on synthetic sets (focus, hand-out once, chain,
// window, coins), then server.js on a fixture event index and fixture type-4 boards riding on the local master_data sphere
// tables (coins of an event quest clear, userPoint, /user/sphere/check and /update, grantItem 15 without a set).
// Check bodies as the client sends them (docs/notes/events.md «Event Boards spike»): the Event Boards button
// {checkTypes [3], boardTypes [1]} then {checkTypes [1,2], boardTypes [4,7]}; back to the list {[1,2], [4]}; home {[1,2], [1..11]}.
//   node server/test-event-board-routes.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const eventBoardRoutes = require('./routes-event-boards');
const rb = require('./raid-boards');

const BUTTON_CLOSE = { checkTypes: [3], boardTypes: [1] };
const BUTTON_OPEN = { checkTypes: [1, 2], boardTypes: [4, 7] };
const BACK = { checkTypes: [1, 2], boardTypes: [4] };
const HOME = { checkTypes: [1, 2], boardTypes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };

const masu = (id, cells, done) => {
  const m = { masuId: id, sphereBoardId: id };
  for (const k of ['spherePoint', 'rewardSelect', 'medalCategory', 'rewardId', 'rewardExpand', 'rewardExpandId', 'rewardValue', 'burstUpperNumber']) m[k] = Array(23).fill(0);
  cells.forEach(([cost, sel, rid, val], i) => { m.spherePoint[i] = cost; m.rewardSelect[i] = sel; m.rewardId[i] = rid; m.rewardValue[i] = val; });
  [m.rewardSelect[22], m.rewardId[22], m.rewardValue[22]] = done;
  return m;
};
const sphereRow = (id, name, openId = 3, openParam = 0) => ({ sphereBoardId: id, boardName: name, kindId: 0, boardId: 4, arryId: id, masuId: id, type: 4, openId, openParam,
  price: 0, detailUrl: '', startDatetime: '2015-01-01 08:00:00', endDatetime: '2099-12-31 23:59:59' });

// ---- unit: two sets, A (two chained boards) and B (one board) ----
const A1 = 4999001, A2 = 4999002, B1 = 4999011;
const TABLES = () => ({
  sphere: [sphereRow(A1, 'Board #1'), sphereRow(A2, 'Board #2', 5, A1), sphereRow(B1, 'Board #1 B'), { ...sphereRow(2100001, 'Avatar'), type: 1 }],
  sphereArray: [rb.gridRow(A1, 3), rb.gridRow(A2, 1), rb.gridRow(B1, 1)],
  sphereMasu: [masu(A1, [[10, 2, 0, 1], [20, 2, 0, 2], [30, 2, 0, 3]], [2, 0, 100]), masu(A2, [[5, 2, 0, 4]], [2, 0, 200]), masu(B1, [[7, 2, 0, 5]], [2, 0, 300])],
});
const SETS = () => ({ '2019-04': { boardIds: [A1, A2], chains: { [A2]: A1 }, censusIds: ['EV-0759', 'EV-0774'] }, '2019-10': { boardIds: [B1], chains: {}, censusIds: ['EV-0936'] } });

function world(opts = {}) {
  const w = { current: opts.current || ['EV-0759'], kept: opts.kept || null, grants: [], logs: [], nextId: 100 };
  w.player = opts.player || {};
  w.tables = TABLES();
  w.index = { entries: [], boardSets: SETS() };
  w.eb = eventBoardRoutes({
    player: w.player, master: (t) => w.tables[t] || [], now: () => 1234,
    events: { index: () => w.index, currentCensusIds: () => w.current, keptCensusId: () => w.kept },
    grantSphereReward: (m, i) => w.grants.push([m.masuId, i, m.rewardValue[i]]),
    nextUserSphereId: () => ++w.nextId, log: (m) => w.logs.push(m),
  });
  return w;
}
const fill = (w, setKey, n) => w.eb.addCoins(setKey, n);

const tests = {
  // userPoint.stageSpherePoint shows the balance of the focus set (the last event quest started, else the newest of the week)
  stage_point_is_focus_balance() {
    const w = world({ current: ['EV-0759', 'EV-0936'] });
    fill(w, '2019-04', 50); fill(w, '2019-10', 9);
    assert.strictEqual(w.eb.focusSet(), '2019-10', 'no quest started: the newest set of the week');
    assert.strictEqual(w.eb.stagePoint(), 9);
    assert.strictEqual(w.eb.onStageStart({ censusId: 'EV-0759', boardSet: '2019-04' }), true);
    assert.strictEqual(w.eb.focusSet(), '2019-04');
    assert.strictEqual(w.eb.stagePoint(), 50);
    assert.strictEqual(w.eb.onStageStart({ censusId: 'EV-1', boardSet: null }), false, 'an event without a set does not move the focus');
    assert.strictEqual(w.eb.focusSet(), '2019-04');
    w.current = ['EV-0936'];
    assert.strictEqual(w.eb.focusSet(), '2019-10', 'the focus set left the week: back to the newest of the week');
    assert.deepStrictEqual(w.player.eventCoins, { '2019-04': 50, '2019-10': 9 }, 'coins stay');
  },
  // the client's own bodies: the focus set's boards, each in one answer only; a chained board not before Board 1 is complete
  check_hands_focus_only() {
    const w = world({ current: ['EV-0759', 'EV-0936'] });
    w.eb.onStageStart({ boardSet: '2019-04' });
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE), { add: [], close: [] }, 'checkTypes 3: nothing was ever handed out, nothing to close');
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN), { add: [A1], close: [] }, 'Board 1 of the focus set only');
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN), { add: [], close: [] }, 'sent once');
    assert.deepStrictEqual(w.eb.check(BACK), { add: [], close: [] });
    assert.deepStrictEqual(w.eb.check(HOME), { add: [], close: [] });
    assert.deepStrictEqual(w.eb.check({ checkTypes: [1, 2], boardTypes: [5] }), { add: [], close: [] }, 'a check without type 4 adds nothing');
    assert.deepStrictEqual(w.player.eventSphereSent, [A1]);
    assert.deepStrictEqual(Object.keys(w.player.eventSphere).map(Number), [A1], 'state only for the board handed out');
    assert.deepStrictEqual(w.eb.list({ setSent: true }), [A1], 'GET /user/sphere');
    // GET kept the board as sent: the next check sends nothing again
    assert.deepStrictEqual(w.eb.check(HOME).add, []);
  },
  // a pass-through node (cost 0, rewardSelect 0: a donor cell we cannot serve) is handed out already open: the client crashes
  // when its cursor lands on one (bench 08-11, Task 7b); it counts for the completion and cannot be bought
  pass_through_nodes_open() {
    const w = world({ current: ['EV-0759'] });
    w.tables.sphereArray = [rb.gridRow(A1, 4), rb.gridRow(A2, 1), rb.gridRow(B1, 1)];
    assert.deepStrictEqual(w.eb.passThrough(w.tables.sphere[0]), [4]);
    assert.deepStrictEqual(w.eb.check(HOME).add, [A1]);
    assert.deepStrictEqual(w.player.eventSphere[A1].unlock, [4], 'open at the hand-out');
    fill(w, '2019-04', 100);
    assert.deepStrictEqual([w.eb.update(A1, 4).ok, w.eb.update(A1, 4).why], [false, 'node'], 'already open, nothing paid');
    assert.strictEqual(w.player.eventCoins['2019-04'], 100);
    for (const n of [1, 2, 3]) assert.strictEqual(w.eb.update(A1, n).ok, true);
    assert.deepStrictEqual(w.grants.map((g) => g[1]), [0, 1, 2, 22], 'three cells, then the completion');
    // an older state without it gets it on the next hand-out
    const v = world({ current: ['EV-0759'], player: { eventSphere: { [A1]: { id: 7, unlock: [1], getDatetime: 1 } } } });
    v.tables.sphereArray = [rb.gridRow(A1, 4), rb.gridRow(A2, 1), rb.gridRow(B1, 1)];
    v.eb.list({ setSent: true });
    assert.deepStrictEqual(v.player.eventSphere[A1].unlock, [1, 4]);
  },
  // login order (bench 08-11): GET /user/sphere hands Board 1 out before the home check; the check still sends it once (popup)
  login_list_then_home_check_pops_once() {
    const w = world({ current: ['EV-0759'] });
    assert.deepStrictEqual(w.eb.list({ setSent: true }), [A1], 'listed at login');
    assert.deepStrictEqual(w.player.eventSphereSent, [], 'not marked as sent by the list');
    assert.deepStrictEqual(w.eb.check(HOME).add, [A1], 'home check: popup once');
    assert.deepStrictEqual(w.eb.list({ setSent: true }), [A1]);
    assert.deepStrictEqual(w.eb.check(HOME).add, [], 'not again after the next login list');
    w.eb.list({ setSent: 'merge' });
    assert.deepStrictEqual(w.player.eventSphereSent, [A1], 'merge leaves it');
  },
  // the focus moves to another set: the old boards close, the new ones are handed out; old progress and coins stay
  focus_switch_keeps_progress() {
    const w = world({ current: ['EV-0759', 'EV-0936'] });
    w.eb.onStageStart({ boardSet: '2019-04' });
    fill(w, '2019-04', 100); fill(w, '2019-10', 20);
    w.eb.check(BUTTON_OPEN);
    assert.strictEqual(w.eb.update(A1, 1).ok, true);
    assert.strictEqual(w.player.eventCoins['2019-04'], 90);
    w.eb.onStageStart({ boardSet: '2019-10' });
    assert.strictEqual(w.eb.stagePoint(), 20);
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE), { add: [], close: [A1] }, 'the board of the old set handed out (Board 2 never was)');
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [B1]);
    const r = w.eb.update(A1, 2);
    assert.deepStrictEqual([r.ok, r.why], [false, 'not handed out'], 'the old set\'s board refuses updates');
    assert.deepStrictEqual(w.player.eventSphere[A1].unlock, [1], 'progress kept');
    assert.strictEqual(w.player.eventCoins['2019-04'], 90, 'coins kept');
    // back: the board comes back with its progress, sent again (a new hand-out)
    w.eb.onStageStart({ boardSet: '2019-04' });
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE).close, [B1]);
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [A1]);
    assert.deepStrictEqual(w.player.eventSphere[A1].unlock, [1]);
    assert.strictEqual(w.eb.stagePoint(), 90);
  },
  // a set that closes and opens again: unlocked cells stay, nothing is paid twice, completion paid once
  reopen_no_repay() {
    const w = world();
    fill(w, '2019-04', 1000);
    w.eb.check(BUTTON_OPEN);
    for (const n of [1, 2, 3]) assert.strictEqual(w.eb.update(A1, n).ok, true);
    assert.deepStrictEqual(w.grants, [[A1, 0, 1], [A1, 1, 2], [A1, 2, 3], [A1, 22, 100]], 'cells, then the completion once');
    assert.strictEqual(w.player.eventCoins['2019-04'], 940);
    w.current = []; // the week changes: the set closes
    assert.strictEqual(w.eb.focusSet(), null);
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE).close, [A1], 'the boards handed out');
    w.current = ['EV-0774']; // another feeder of the same set: it opens again
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [A1, A2], 'Board 1 complete: Board 2 handed out too');
    w.grants.length = 0;
    for (const n of [1, 2, 3]) assert.strictEqual(w.eb.update(A1, n).ok, false);
    assert.strictEqual(w.eb.update(A1, 0, true).ok, false, 'allOpen on a complete board pays nothing');
    assert.deepStrictEqual(w.grants, []);
    assert.strictEqual(w.player.eventCoins['2019-04'], 940);
  },
  update_insufficient_coins() {
    const w = world();
    fill(w, '2019-04', 15);
    w.eb.check(BUTTON_OPEN);
    assert.strictEqual(w.eb.update(A1, 1).ok, true);
    const r = w.eb.update(A1, 2); // cost 20, balance 5
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /coins 5 < 20/);
    assert.strictEqual(w.player.eventCoins['2019-04'], 5);
    assert.deepStrictEqual(w.player.eventSphere[A1].unlock, [1]);
    assert.deepStrictEqual(w.grants, [[A1, 0, 1]]);
    assert.strictEqual(w.eb.update(A1, 0, true).ok, false, 'allOpen: 50 > 5');
    assert.strictEqual(w.eb.update(A1, 9).ok, false, 'a node not on the board');
    assert.deepStrictEqual(w.player.eventSphere[A1].unlock, [1]);
  },
  // Board 2 (openId 5 behind Board 1) cannot be updated before Board 1 is complete, whatever the client sends
  chained_board_locked() {
    const w = world();
    fill(w, '2019-04', 1000);
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [A1]);
    const r = w.eb.update(A2, 1);
    assert.deepStrictEqual([r.ok, r.why], [false, `chained behind ${A1}`]);
    assert.strictEqual(w.player.eventCoins['2019-04'], 1000);
    assert.strictEqual((w.player.eventSphere || {})[A2], undefined);
    w.eb.update(A1, 0, true);
    assert.deepStrictEqual(w.eb.check(BACK).add, [A2], 'handed out once Board 1 is complete');
    assert.strictEqual(w.eb.update(A2, 1).ok, true);
    assert.deepStrictEqual(w.grants.slice(-2), [[A2, 0, 4], [A2, 22, 200]]);
    assert.strictEqual(w.player.eventCoins['2019-04'], 1000 - 60 - 5);
  },
  // a save from before this part: no eventCoins / eventSphere / eventSphereSent / eventCoinFocus
  old_save_defaults() {
    const w = world({ player: { name: 'Old', sphere: { 2100001: { id: 1, unlock: [], getDatetime: 1 } } } });
    assert.strictEqual(w.eb.stagePoint(), 0);
    assert.strictEqual(w.eb.focusSet(), '2019-04');
    assert.deepStrictEqual(w.player, { name: 'Old', sphere: { 2100001: { id: 1, unlock: [], getDatetime: 1 } } }, 'reads write nothing');
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE).close, []);
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [A1]);
    assert.strictEqual(w.player.eventSphere[A1].id, 101, 'the shared user sphere id sequence');
    assert.strictEqual(w.eb.update(A1, 1).ok, false, 'no coins');
    w.player.eventSphere[4999901] = { id: 7, unlock: [1], getDatetime: 1 }; // a board no set has any more (the Task 1 spike)
    assert.deepStrictEqual(w.eb.check(BUTTON_CLOSE).close, [4999901], 'stale board closed, progress kept');
    assert.deepStrictEqual(w.player.eventSphere[4999901].unlock, [1]);
    // no set at all in the index (an events.json before Task 4)
    const v = world();
    v.index = { entries: [] };
    assert.deepStrictEqual([v.eb.focusSet(), v.eb.stagePoint(), v.eb.check(HOME).add, v.eb.list()], [null, 0, [], []]);
    assert.strictEqual(v.eb.addCoins('2019-04', 5), false);
  },
  // the kept event (Event Catalog) keeps its set available outside its week
  kept_event_window() {
    const w = world({ current: [] });
    assert.deepStrictEqual([w.eb.focusSet(), w.eb.check(BUTTON_OPEN).add], [null, []], 'outside the week: no board');
    fill(w, '2019-10', 10);
    assert.strictEqual(w.eb.update(B1, 1).ok, false, 'not handed out: outside the window');
    w.kept = 'EV-0936';
    assert.strictEqual(w.eb.focusSet(), '2019-10');
    assert.deepStrictEqual(w.eb.check(BUTTON_OPEN).add, [B1]);
    assert.strictEqual(w.eb.update(B1, 1).ok, true);
    // a set of the week wins over the kept one when no quest was started
    w.current = ['EV-0759'];
    assert.strictEqual(w.eb.focusSet(), '2019-04');
    w.eb.onStageStart({ boardSet: '2019-10' });
    assert.strictEqual(w.eb.focusSet(), '2019-10', 'the kept event\'s quest started: its set');
    w.kept = null;
    assert.strictEqual(w.eb.focusSet(), '2019-04', 'unkept: its set is not available any more');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.stack}`); }
}

// ---- server.js: fixture event index and boards on the local master_data ----
const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
// userPoint keys of GET /user before Part 3 Task 5 (a missing key, e.g. colosseumSpherePoint, made the client show «200 ERROR :1»)
const USERPOINT_KEYS = ['money', 'lux', 'totalLux', 'spherePoint', 'kizunaPoint', 'raidPoint', 'attack', 'defense', 'baseHp', 'hp', 'ap', 'maxHp', 'maxAp',
  'lastApDatetime', 'stageSpherePoint', 'raidSpherePoint', 'colosseumSpherePoint', 'specialPoint', 'stageSkipTicket', 'superSkipTicket', 'vipPoint', 'guiltBurstLv',
  'multiPoint', 'missionPoint', 'limitedVipPoint', 'drawTicket1', 'drawTicket2', 'drawTicket3', 'limitedDrawTicket1', 'limitedDrawTicket2', 'limitedDrawTicket3'];
function wiring() {
  if (!fs.existsSync(path.join(MASTER, 'sphere.json')) || !fs.existsSync(path.join(MASTER, 'stage.json'))) { console.log('wiring: skipped (no master_data)'); return; }
  const W1 = 4999801, W2 = 4999802, S1 = 4009951, S2 = 4009952, REWARD = 989951;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-event-board-routes-'));
  process.env.KHUX_SAVE = path.join(dir, 'save.json');
  process.env.KHUX_RAID_INDEX = path.join(dir, 'raids.json');
  process.env.KHUX_RAID_MODELS = path.join(dir, 'raid_models.json');
  process.env.KHUX_EVENT_INDEX = path.join(dir, 'events.json');
  delete process.env.KHUX_REAL_NOW;
  delete process.env.KHUX_SERVER_TIME;
  fs.writeFileSync(process.env.KHUX_RAID_INDEX, JSON.stringify({ entries: [], reasons: {} }));
  fs.writeFileSync(process.env.KHUX_RAID_MODELS, JSON.stringify({}));
  const quest = (stageId) => ({ stageId, ap: 5, served: true, status: 'served' });
  fs.writeFileSync(process.env.KHUX_EVENT_INDEX, JSON.stringify({ entries: [
    { censusId: 'EV-0759', evStageId: 29951, start: '2015-01-01', end: '2099-12-31', stageIds: [S1], available: true, eventType: 1, boardSet: '2019-04', quests: [quest(S1)] },
    { censusId: 'EV-0001', evStageId: 29952, start: '2015-01-01', end: '2099-12-31', stageIds: [S2], available: true, boardSet: null, quests: [quest(S2)] },
  ], boardSets: { '2019-04': { boardIds: [W1, W2], chains: { [W2]: W1 }, censusIds: ['EV-0759'] } }, reasons: {} }));
  // objectives: 1 jewels, 2 Event Coins x50, 3 munny; first clear: munny and Event Coins x30
  const stageRow = (stageId) => ({ stageId, stageKind: 2, useAp: 5, stageBinId: 0, validSubmission: 3, submissionRewardType: [2, 15, 4], submissionItemId: [0, 0, 0],
    submissionItemNum: [10, 50, 1], submissionSkillId: [0, 0, 0], validClearGetItem: 2, clearGetItemType: [4, 15], clearGetItemId: [0, 0], clearGetItemNum: [100, 30] });
  const EXTRA = {
    'stage.json': [stageRow(S1), stageRow(S2)],
    'reward.json': [{ rewardId: REWARD, validReward: 1, display: [1], type: [15], id: [0], assignSkillType: [0], assignSkillId: [0], assignSkillLv: [0], num: [20], odds: [10000] }],
    'sphere.json': [sphereRow(W1, 'Board #1: Test'), sphereRow(W2, 'Board #2: Test', 5, W1)],
    'sphereArray.json': [rb.gridRow(W1, 2), rb.gridRow(W2, 1)],
    'sphereMasu.json': [masu(W1, [[10, 2, 0, 7], [500, 2, 0, 8]], [2, 0, 50]), masu(W2, [[5, 2, 0, 9]], [2, 0, 60])],
  };
  const readFile = fs.readFileSync;
  fs.readFileSync = (f, ...a) => {
    const name = path.basename(String(f));
    if (EXTRA[name] && path.resolve(path.dirname(String(f))) === path.resolve(MASTER)) return JSON.stringify([...JSON.parse(readFile(f, 'utf8')), ...EXTRA[name]]);
    return readFile(f, ...a);
  };
  const log = console.log, warn = console.warn;
  let logs = [];
  const quiet = (fn) => { console.log = (...m) => logs.push(m.join(' ')); console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
  try {
    const { _test: t } = quiet(() => require('./server'));
    const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
    const p = t.player;
    call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
    const run = (name, fn) => { try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.stack}`); } };

    run('userpoint_keys', () => {
      const up = call(t.respondUser, {}).userData.userPoint;
      for (const k of USERPOINT_KEYS) assert.ok(k in up, `userPoint.${k} missing`);
      assert.strictEqual(up.stageSpherePoint, 0, 'old_save_defaults: no Event Coins');
      assert.strictEqual(up.colosseumSpherePoint, 0);
    });
    run('grantItem_15_without_set', () => {
      const raidBefore = p.raidSpherePoint || 0;
      logs = [];
      quiet(() => t.grantItem(15, 0, 7));
      assert.strictEqual(p.raidSpherePoint || 0, raidBefore, 'never Raid Coins');
      assert.deepStrictEqual(p.eventCoins || {}, {}, 'not paid');
      assert.ok(logs.some((l) => /Event Coin x7 not paid/.test(l)), `logged: ${logs.join(' | ')}`);
      quiet(() => t.grantItem(16, 0, 5));
      assert.strictEqual(p.raidSpherePoint, raidBefore + 5, 'type 16 still pays Raid Coins');
    });
    run('coins_to_entry_set', () => {
      t.STAGE_POI[S1] = { chests: [], enemies: [{ uid: 1, reward: REWARD }] };
      p.ap = 200; p.apTime = Date.now();
      const raid = p.raidSpherePoint || 0;
      const st = call(t.respondStageStart, { stageId: S1, userKeybladeId: 0 });
      assert.deepStrictEqual(st.userEnemyDropItems.find((d) => d.uniqueEnemyId === 1).dropItemTypeIds, [15], 'the coin drop is shown');
      assert.strictEqual(p.eventCoinFocus, '2019-04', '/stage/start of an event quest sets the focus');
      let out = call(t.respondStageClear, { getEnemyDropItems: [1], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 0 } });
      assert.strictEqual(p.eventCoins['2019-04'], 50 + 30 + 20, 'objective 2, first-clear item, drop');
      call(t.respondStageStart, { stageId: S1, userKeybladeId: 0 });
      out = call(t.respondStageClear, { getEnemyDropItems: [1], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 0 } });
      assert.strictEqual(p.eventCoins['2019-04'], 120, 'second clear: the drop only');
      assert.strictEqual(p.raidSpherePoint || 0, raid, 'no Raid Coins');
      assert.strictEqual(out.userData.userPoint.stageSpherePoint, 120, 'stage_point_is_focus_balance');
      // an event quest without a set: its coins are logged, not paid
      p.eventCoinFocus = '2019-04';
      call(t.respondStageStart, { stageId: S2, userKeybladeId: 0 });
      assert.strictEqual(p.eventCoinFocus, '2019-04', 'an event without a set keeps the focus');
      call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [2], getPoint: { lux: 0 } });
      assert.deepStrictEqual(p.eventCoins, { '2019-04': 120 });
    });
    run('server_check_and_update', () => {
      const ids = (b) => (b.userSphere.userSphereDatas || []).map((d) => d.sphereBoardId).filter((id) => id >= 4000000 && id <= 4999999);
      let b = call(t.respondSphereCheck, BUTTON_CLOSE);
      assert.ok(!b.closeEventSphereBoardIds.includes(W1), 'Board 1 handed out, not closed');
      assert.ok(!b.closeEventSphereBoardIds.includes(W2), 'Board 2 never handed out: nothing to close');
      assert.deepStrictEqual(ids(call(t.respondSphereCheck, BUTTON_OPEN)), [W1]);
      assert.deepStrictEqual(ids(call(t.respondSphereCheck, BUTTON_OPEN)), [], 'once');
      assert.deepStrictEqual(ids(call(t.respondSphereCheck, HOME)), []);
      const stone = p.freeStone || 0;
      b = call(t.respondSphereUpdate, { sphereBoardId: W1, releaseMasuId: 1 });
      assert.strictEqual(b.userData.userPoint.stageSpherePoint, 110);
      assert.deepStrictEqual(b.userSphere.userSphereDatas.map((d) => [d.sphereBoardId, d.unlockMasuIds, d.status]), [[W1, [1], 1]]);
      assert.strictEqual(p.freeStone, stone + 7, 'cell reward');
      b = call(t.respondSphereUpdate, { sphereBoardId: W1, releaseMasuId: 2 });
      assert.strictEqual(b.userData.userPoint.stageSpherePoint, 110, 'insufficient coins: refused');
      assert.deepStrictEqual(p.eventSphere[W1].unlock, [1]);
      b = call(t.respondSphereUpdate, { sphereBoardId: W2, releaseMasuId: 1 });
      assert.deepStrictEqual([b.userData.userPoint.stageSpherePoint, b.userSphere.userSphereDatas], [110, []], 'chained: refused');
      p.eventCoins['2019-04'] += 500;
      call(t.respondSphereUpdate, { sphereBoardId: W1, releaseMasuId: 2 });
      assert.strictEqual(p.freeStone, stone + 7 + 8 + 50, 'last cell and completion');
      assert.deepStrictEqual(ids(call(t.respondSphereCheck, BACK)), [W2], 'Board 2 handed out');
      const all = quiet(() => t.userSphereAll({ setSent: true })).userSphereDatas.map((d) => d.sphereBoardId);
      assert.ok(all.includes(W1) && all.includes(W2), 'GET /user/sphere lists both');
      assert.deepStrictEqual(p.eventSphereSent, [W1, W2]);
    });
  } finally {
    fs.readFileSync = readFile;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
try { wiring(); } catch (e) { failed++; console.error(`FAIL wiring: ${e.stack}`); }

if (failed) { console.error(`test-event-board-routes: ${failed} FAIL`); process.exit(1); }
console.log('test-event-board-routes: all passed');
process.exit(0);
