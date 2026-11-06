// Event routes (Events Part 1, Task 4): the Events tab list (/stage/event category 2 after the raids), the rewards of an event
// quest clear (objectives and first clear once per quest, Event Coins not paid), old saves; then the wiring of server.js on
// fixture indexes. Synthetic fixtures only. Dates: 2026-11-03 is a Tuesday, 20:00 UTC = 12:00 PST.
//   node server/test-event-routes.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const routesEvents = require('./routes-events');
const { EVENT_IMG_VERSION } = routesEvents;

const TUE = Date.parse('2026-11-03T20:00:00Z');
const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const S1 = 4009901, S2 = 4009902, S3 = 4009903, PAST = 4009904;
// stage rows: objectives 1 jewels, 2 Event Coins (type 15), 3 a medal; first clear: munny and Event Coins
const stageRow = (stageId, extra = {}) => ({ stageId, stageKind: 2, useAp: 5, stageBinId: 0, validSubmission: 3, submissionRewardType: [2, 15, 3], submissionItemId: [0, 0, 90011],
  submissionItemNum: [10, 50, 1], submissionSkillId: [0, 0, 0], validClearGetItem: 2, clearGetItemType: [4, 15], clearGetItemId: [0, 0], clearGetItemNum: [100, 30], ...extra });
const quest = (stageId, extra = {}) => ({ stageId, ap: 5, served: true, status: 'served', ...extra });
const INDEX = () => ({ entries: [
  { censusId: 'E-1', evStageId: 29901, start: '2019-04-01', end: '2019-04-14', stageIds: [S1, S2], available: true, quests: [quest(S1), quest(S2), quest(4009909, { served: false, status: 'not served yet' })] },
  { censusId: 'E-2', evStageId: 29902, start: '2019-04-03', end: '2019-04-09', stageIds: [S3], available: true, quests: [quest(S3, { ap: 3 })] },
  { censusId: 'E-0', evStageId: 29900, start: '2019-03-01', end: '2019-03-07', stageIds: [PAST], available: true, quests: [quest(PAST)] },
  { censusId: 'E-9', start: '2019-04-01', end: '2019-04-07', stageIds: [], available: false, quests: [quest(4009910, { served: false, status: 'not served yet' })] },
] });

function world(opts = {}) {
  const w = { now: TUE, week: { shopFrom: '2019-04-08', shopTo: '2019-04-14' }, saves: 0, grants: [], objectives: [], logs: [], scores: {} };
  w.player = opts.player || { name: 'Prova' };
  w.index = opts.index || INDEX();
  w.tables = { stage: [stageRow(S1), stageRow(S2), stageRow(S3, { validSubmission: 1 }), stageRow(PAST)] };
  w.ev = routesEvents({
    player: w.player, savePlayer: () => { w.saves++; }, masterRows: (t) => w.tables[t] || [], eventIndex: () => w.index, storyWeek: () => w.week, realNow: () => w.now,
    serverTimeAt: fmt, clock: { weekEnd: (ms) => ms + 7000, dayEnd: (ms) => ms + 1000 }, webBase: 'http://x', log: (m) => w.logs.push(m),
    stageState: (id) => ({ score: w.scores[id] || 0, playStatus: id in w.scores ? 3 : 0 }),
    grantItem: (type, id, num) => w.grants.push({ type, id, num }),
    grantObjective: (stage, n) => w.objectives.push({ stageId: stage.stageId, n, type: stage.submissionRewardType[n - 1] }),
  });
  return w;
}

const tests = {
  list_shape() {
    const w = world();
    const list = w.ev.events();
    assert.deepStrictEqual(list.map((e) => e.eventStageId), [29901, 29902], 'the week\'s events with a served quest, index order');
    const e = list[0];
    assert.deepStrictEqual(Object.keys(e), ['stages', 'eventStageId', 'showIcon', 'bannerUrl', 'eventType', 'status', 'endTime', 'newStageId', 'isLock', 'complete']);
    assert.strictEqual(e.bannerUrl, `http://x/web/event/img/v${EVENT_IMG_VERSION}/29901.png`);
    assert.strictEqual(e.eventType, 2);
    assert.strictEqual(e.endTime, fmt(TUE + 7000));
    assert.deepStrictEqual(e.stages.map((s) => s.stageId), [S1, S2], 'only served quests');
    assert.deepStrictEqual(e.stages[0], { stageId: S1, useAp: 5, score: 0, playStatus: 0, clearMissionIds: [] });
    assert.strictEqual(list[1].stages[0].useAp, 3, 'AP of the quest');
  },
  // second clear of the same objectives pays nothing; a new objective later pays only itself; first-clear items once
  objectives_once() {
    const w = world();
    w.ev.onStageClear(S1, [1, 3]);
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [1, 3]);
    assert.deepStrictEqual(w.grants, [{ type: 4, id: 0, num: 100 }], 'first clear, no Event Coins');
    assert.deepStrictEqual(w.player.events.cleared[S1], [1, 3]);
    w.objectives.length = 0; w.grants.length = 0;
    w.ev.onStageClear(S1, [1, 3]);
    assert.deepStrictEqual(w.objectives, [], 'second clear: no objective reward');
    assert.deepStrictEqual(w.grants, [], 'second clear: no first-clear reward');
    w.ev.onStageClear(S1, []);
    assert.deepStrictEqual(w.grants, [], 'a clear with no objective: no first-clear reward again');
    assert.deepStrictEqual(w.player.events.cleared[S1], [1, 3]);
    // the list shows them
    assert.deepStrictEqual(w.ev.events()[0].stages[0].clearMissionIds, [1, 3]);
    // not an event stage: nothing happens, false
    assert.strictEqual(w.ev.onStageClear(1010, [1]), false);
    assert.strictEqual(w.ev.isEventStage(1010), false);
    assert.strictEqual(w.ev.isEventStage(S1), true);
  },
  // Event Coins (type 15) are not paid in this part, neither as an objective nor as a first-clear item (never as Raid Coins)
  coins_not_paid() {
    const w = world();
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [1, 3], 'objective 2 (type 15) not paid');
    assert.ok(!w.grants.some((g) => g.type === 15 || g.type === 16), `grants ${JSON.stringify(w.grants)}`);
    assert.deepStrictEqual(w.player.events.cleared[S1], [1, 2, 3], 'the objective counts as done');
    assert.ok(w.logs.some((l) => /Event Coin/.test(l)), 'logged');
  },
  // a save from before this part: no player.events; the list is served and nothing is cleared
  old_save() {
    const w = world({ player: { name: 'Old', raid: { kept: 'WW-1' } } });
    const list = w.ev.events();
    assert.deepStrictEqual(list.map((e) => e.eventStageId), [29901, 29902]);
    assert.ok(list.every((e) => e.stages.every((s) => s.clearMissionIds.length === 0) && e.complete === 0));
    assert.strictEqual(w.player.events, undefined, 'listing does not write the save');
    assert.deepStrictEqual(w.ev.catalogCtx().kept, null);
    w.ev.onStageClear(S3, [1]);
    assert.deepStrictEqual(w.player.events, { kept: null, cleared: { [S3]: [1] } });
  },
  // crown: every listed quest with its objectives 1..min(3, validSubmission) done
  complete_crown() {
    const w = world();
    w.ev.onStageClear(S3, [1]);
    assert.strictEqual(w.ev.events()[1].complete, 1, 'S3 has one objective');
    assert.strictEqual(w.ev.events()[0].complete, 0);
  },
  // a missing stage row on the first clear (master not yet rebuilt): nothing recorded, so the first-clear reward is paid once
  // the row is there (review of Task 4)
  missing_row_keeps_first_clear() {
    const w = world();
    w.tables.stage = w.tables.stage.filter((r) => r.stageId !== S2);
    w.ev.onStageClear(S2, [1]);
    assert.deepStrictEqual(w.grants, [], 'no row: no reward');
    assert.strictEqual((w.player.events.cleared || {})[S2], undefined, 'no row: nothing written');
    w.tables.stage.push(stageRow(S2));
    w.ev.onStageClear(S2, [1]);
    assert.deepStrictEqual(w.grants, [{ type: 4, id: 0, num: 100 }], 'first clear paid once the row exists');
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [1]);
    assert.deepStrictEqual(w.player.events.cleared[S2], [1]);
  },
  // endTime: the end of the real day when the entry or one of its open quests has days; `days: []` is no days (review of Task 4)
  end_time_days() {
    const ix = INDEX();
    ix.entries[1].days = [];
    ix.entries[0].quests[1].days = ['2019-04-09'];
    const w = world({ index: ix });
    const list = w.ev.events();
    assert.strictEqual(list.find((e) => e.eventStageId === 29902).endTime, fmt(TUE + 7000), 'days: [] -> end of the week');
    assert.strictEqual(list.find((e) => e.eventStageId === 29901).endTime, fmt(TUE + 1000), 'a quest with days -> end of the day');
  },
  // the Event Catalog banner (index.catalog of make-events.js): its Training Grounds quest, eventType 0, Details -> catalogue
  catalog_banner() {
    const ix = INDEX();
    ix.catalog = { evStageId: 20000, stageIds: [970000], useAp: [0] };
    const w = world({ index: ix });
    const [b] = w.ev.catalogEvents();
    assert.deepStrictEqual([b.eventStageId, b.eventType, b.stages.map((s) => s.stageId)], [20000, 0, [970000]]);
    assert.strictEqual(b.bannerUrl, `http://x/web/event/img/v${EVENT_IMG_VERSION}/20000.png`);
    assert.deepStrictEqual(world().ev.catalogEvents(), [], 'no catalog in the index: no banner');
    assert.ok(!w.ev.events().some((e) => e.eventStageId === 20000), 'not among the event cards');
  },
  // keep a past event (Task 5's catalogue buttons): listed first with the KEPT banner; only a past one; unkeep
  keep_unkeep() {
    const w = world();
    assert.deepStrictEqual(w.ev.keep(29902), { code: 409, body: { ok: false, why: 'now' } });
    assert.deepStrictEqual(w.ev.keep(12345), { code: 404, body: { ok: false, why: 'unknown event' } });
    assert.deepStrictEqual(w.ev.keep(29900), { code: 200, body: { ok: true } });
    assert.strictEqual(w.player.events.kept, 'E-0');
    const list = w.ev.events();
    assert.deepStrictEqual(list.map((e) => e.eventStageId), [29900, 29901, 29902]);
    assert.strictEqual(list[0].bannerUrl, `http://x/web/event/img/v${EVENT_IMG_VERSION}/29900-kept.png`);
    const c = w.ev.catalogCtx();
    assert.deepStrictEqual([c.shopFrom, c.shopTo, [...c.current], c.kept], ['2019-04-08', '2019-04-14', ['E-1', 'E-2'], 'E-0']);
    assert.deepStrictEqual(w.ev.unkeep(), { code: 200, body: { ok: true } });
    assert.deepStrictEqual(w.ev.events().map((e) => e.eventStageId), [29901, 29902]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}

// ---- server.js on fixture indexes: /stage/event category 2 order, /stage/clear of an event quest ----
function wiring() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-event-routes-'));
  process.env.KHUX_SAVE = path.join(dir, 'save.json');
  process.env.KHUX_RAID_INDEX = path.join(dir, 'raids.json');
  process.env.KHUX_RAID_MODELS = path.join(dir, 'raid_models.json');
  process.env.KHUX_EVENT_INDEX = path.join(dir, 'events.json');
  delete process.env.KHUX_REAL_NOW;
  delete process.env.KHUX_SERVER_TIME;
  const FAKE = 989999;
  // a raid and an event in every Shop week; a Raid Catalog banner
  fs.writeFileSync(process.env.KHUX_RAID_INDEX, JSON.stringify({ catalog: { evStageId: 8000, stageIds: [970000], useAp: [0] },
    entries: [{ key: 'K/Beginner', censusId: 'K', available: true, stageId: FAKE, evStageId: 8999, enemyId: 2999990, modelId: 7, tier: 'Beginner', upMinutes: 20, useAp: 10,
      questAp: [0, 5, 90], start: '2015-01-01', end: '2099-12-31' }], reasons: {} }));
  fs.writeFileSync(process.env.KHUX_RAID_MODELS, JSON.stringify({ '0007': { fight: true, start: true, escape: true, put_down: true } }));
  fs.writeFileSync(process.env.KHUX_EVENT_INDEX, JSON.stringify({ catalog: { evStageId: 20000, stageIds: [970000], useAp: [0] }, entries: [{ censusId: 'E-1', evStageId: 29901, start: '2015-01-01', end: '2099-12-31', stageIds: [S1], available: true,
    quests: [quest(S1)] }], reasons: {} }));
  // the event quest's stage row, appended to the master stage table as read (the map key 1010: the Prologue's POI, for the drops)
  const readFile = fs.readFileSync;
  fs.readFileSync = (f, ...a) => {
    const out = readFile(f, ...a);
    if (path.basename(String(f)) !== 'stage.json' || !String(f).includes('master_data')) return out;
    return JSON.stringify([...JSON.parse(out), stageRow(S1, { stageBinId: 1010 })]);
  };
  const realDateNow = Date.now;
  Date.now = () => TUE;
  const log = console.log, warn = console.warn;
  const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
  try {
    const { _test: t } = quiet(() => require('./server'));
    const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
    const p = t.player;
    call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
    // events_after_raids: Raid Catalog banner, Event Catalog banner (second), (kept raid), the week's raids, then the events
    const ev = call(t.respondStageEvent, { eventCategory: 2 }).events;
    assert.deepStrictEqual(ev.map((e) => [e.eventStageId, e.eventType]), [[8000, 0], [20000, 0], [8999, 2], [29901, 2]]);
    assert.strictEqual(ev[3].bannerUrl, `${t.WEB_BASE}/web/event/img/v${EVENT_IMG_VERSION}/29901.png`);
    console.log('ok events_after_raids');
    // drops: the event quest reads the POI of its map key (stageBinId), as the client loads mappoi_stg<stageBinId>
    assert.strictEqual(t.poiStageId(S1), 1010);
    // /stage/clear of the event quest: objectives 1-3 and first clear once, no Event Coins, no Raid Coins
    p.ap = 200; p.apTime = TUE;
    const coins = p.raidSpherePoint || 0, stone = p.freeStone || 0, money = p.money || 0;
    call(t.respondStageStart, { stageId: S1, userKeybladeId: 0 });
    const out = call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 0 } });
    assert.deepStrictEqual(out.clearMissionIds, [1, 2, 3]);
    assert.strictEqual(p.raidSpherePoint || 0, coins, 'coins_not_paid: no Raid Coins');
    assert.strictEqual(p.freeStone, stone + 10, 'objective 1 once');
    assert.strictEqual(p.money, money + 100, 'first clear once');
    assert.deepStrictEqual(p.events.cleared[S1], [1, 2, 3]);
    call(t.respondStageStart, { stageId: S1, userKeybladeId: 0 });
    call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 0 } });
    assert.deepStrictEqual([p.freeStone, p.money, p.raidSpherePoint || 0], [stone + 10, money + 100, coins], 'objectives_once: second clear pays nothing');
    assert.deepStrictEqual(call(t.respondStageEvent, { eventCategory: 2 }).events[3].stages[0].clearMissionIds, [1, 2, 3]);
    console.log('ok wiring_stage_clear');
  } finally {
    fs.readFileSync = readFile;
    Date.now = realDateNow;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
try { wiring(); console.log('ok wiring'); } catch (e) { failed++; console.error(`FAIL wiring: ${e.stack}`); }

if (failed) { console.error(`test-event-routes: ${failed} FAIL`); process.exit(1); }
console.log('test-event-routes: OK');
process.exit(0);
