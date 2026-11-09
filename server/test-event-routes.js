// Event routes (Events Part 1, Task 4): the Events tab list (/stage/event category 2 after the raids), the rewards of an event
// quest clear (objectives and first clear once per quest, Event Coins into the entry's board set), old saves; then the wiring of server.js on
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
  const w = { now: TUE, week: { shopFrom: '2019-04-08', shopTo: '2019-04-14' }, saves: 0, grants: [], objectives: [], logs: [], scores: {}, coins: [] };
  w.player = opts.player || { name: 'Prova' };
  w.index = opts.index || INDEX();
  w.tables = { stage: [stageRow(S1), stageRow(S2), stageRow(S3, { validSubmission: 1 }), stageRow(PAST)] };
  w.ev = routesEvents(w.opts = {
    player: w.player, savePlayer: () => { w.saves++; }, masterRows: (t) => w.tables[t] || [], eventIndex: () => w.index, storyWeek: () => w.week, realNow: () => w.now,
    serverTimeAt: fmt, clock: { weekEnd: (ms) => ms + 7000, dayEnd: (ms) => ms + 1000 }, webBase: 'http://x', log: (m) => w.logs.push(m),
    stageState: (id) => ({ score: w.scores[id] || 0, playStatus: id in w.scores ? 3 : 0 }),
    grantItem: (type, id, num) => w.grants.push({ type, id, num }),
    grantObjective: (stage, n) => w.objectives.push({ stageId: stage.stageId, n, type: stage.submissionRewardType[n - 1] }),
    addEventCoins: (setKey, n) => { if (setKey !== '2019-04') return false; w.coins.push([setKey, n]); return true; },
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
    assert.strictEqual(e.eventType, 3, 'index entry without eventType: the config fallback 3 (plain list; never 2, the raid mode)');
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
  // Event Coins (type 15, Part 3 Task 5): an objective and a first-clear item go into the entry's board set (addEventCoins), once;
  // never as a grantItem (Raid Coins). An entry without a set pays none (logged), the objective still counts as done
  coins_paid_to_set() {
    const ix = INDEX();
    ix.entries[0].boardSet = '2019-04';
    const w = world({ index: ix });
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [1, 3], 'objective 2 (type 15) not through grantObjective');
    assert.ok(!w.grants.some((g) => g.type === 15 || g.type === 16), `grants ${JSON.stringify(w.grants)}`);
    assert.deepStrictEqual(w.coins, [['2019-04', 30], ['2019-04', 50]], 'first-clear item, then objective 2');
    assert.deepStrictEqual(w.player.events.cleared[S1], [1, 2, 3]);
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.strictEqual(w.coins.length, 2, 'second clear: no coins again');
    assert.strictEqual(w.ev.boardSetOf(S1), '2019-04');
    assert.strictEqual(w.ev.boardSetOf(S3), null);
    // no set: logged, not paid
    w.ev.onStageClear(S3, [2]);
    assert.strictEqual(w.coins.length, 2, 'E-2 has no set');
    assert.deepStrictEqual(w.player.events.cleared[S3], [2], 'the objective counts as done');
    assert.ok(w.logs.some((l) => /Event Coins x50 not paid/.test(l)), `logged: ${w.logs.join(' | ')}`);
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
  // one card per original evStage row (Part 2 Task 5): own eventStageId, card, eventType and quests; the kept event as well
  cards_per_row() {
    const ix = INDEX();
    Object.assign(ix.entries[0], { rows: [{ evStageId: 29901, start: '2019-04-01', end: '2019-04-14', eventType: 1, stageIds: [S1], available: true },
      { evStageId: 29911, start: '2019-04-08', end: '2019-04-10', eventType: 3, stageIds: [S2], available: true },
      { evStageId: 29912, start: '2019-04-01', end: '2019-04-14', eventType: 3, stageIds: [], available: false }] });
    Object.assign(ix.entries[2], { rows: [{ evStageId: 29900, start: '2019-03-01', end: '2019-03-03', stageIds: [], available: false },
      { evStageId: 29920, start: '2019-03-01', end: '2019-03-07', eventType: 3, stageIds: [PAST], available: true }] });
    const w = world({ index: ix });
    const list = w.ev.events();
    assert.deepStrictEqual(list.map((e) => [e.eventStageId, e.eventType, e.stages.map((s) => s.stageId)]), [[29901, 1, [S1]], [29911, 3, [S2]], [29902, 3, [S3]]]);
    assert.strictEqual(list[1].bannerUrl, `http://x/web/event/img/v${EVENT_IMG_VERSION}/29911.png`);
    // keep by the entry id or by a row id: the kept event, one KEPT card per built row
    assert.deepStrictEqual(w.ev.keep(29920), { code: 200, body: { ok: true } });
    assert.strictEqual(w.player.events.kept, 'E-0');
    const k = w.ev.events()[0];
    assert.deepStrictEqual([k.eventStageId, k.bannerUrl, k.stages.map((s) => s.stageId)], [29920, `http://x/web/event/img/v${EVENT_IMG_VERSION}/29920-kept.png`, [PAST]]);
    assert.deepStrictEqual(w.ev.keep(29911), { code: 409, body: { ok: false, why: 'now' } });
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
  // Events Part 4 Task 4: a Booster objective reward (make-events.js: type 0 in the stage row, the Booster named in the index
  // quest) goes to player.pendingBoosters once, for Part 6 to grant; the other rewards are paid; a replay adds nothing
  booster_reward_pending_once() {
    const ix = INDEX();
    ix.entries[0].quests[0].boosters = [{ objective: 1, emblemName: 'P Booster +25%' }];
    const w = world({ index: ix });
    w.tables.stage[0] = stageRow(S1, { submissionRewardType: [0, 2, 3], submissionItemId: [0, 0, 90011], submissionItemNum: [0, 10, 1] });
    assert.deepStrictEqual(w.ev.pendingBoosters(), [], 'empty by default');
    assert.strictEqual(w.player.pendingBoosters, undefined, 'reading does not write the save');
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [2, 3], 'the other objectives are paid');
    assert.deepStrictEqual(w.grants, [{ type: 4, id: 0, num: 100 }], 'first clear paid');
    assert.deepStrictEqual(w.player.pendingBoosters, [{ emblemName: 'P Booster +25%', stageId: S1, objective: 1 }]);
    assert.deepStrictEqual(w.player.events.cleared[S1], [1, 2, 3]);
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.strictEqual(w.player.pendingBoosters.length, 1, 'a replay adds nothing');
    // a save that lost its cleared list (or a second clear of objective 1 only) still records the Booster once
    delete w.player.events.cleared[S1];
    w.ev.onStageClear(S1, [1]);
    assert.strictEqual(w.player.pendingBoosters.length, 1, 'never twice');
    assert.ok(w.logs.some((l) => /Booster/.test(l)), 'logged');
    // fix round 1 (M1): two Booster first-clear items (objective 0) stay two, by their position
    const ix2 = INDEX();
    ix2.entries[1].quests[0].boosters = [{ objective: 0, slot: 0, emblemName: 'P Booster +10%' }, { objective: 0, slot: 1, emblemName: 'P Booster +10%' }];
    const w2 = world({ index: ix2 });
    w2.ev.onStageClear(S3, [1]);
    assert.deepStrictEqual(w2.player.pendingBoosters.map((b) => [b.objective, b.slot]), [[0, 0], [0, 1]]);
    delete w2.player.events.cleared[S3];
    w2.ev.onStageClear(S3, [1]);
    assert.strictEqual(w2.player.pendingBoosters.length, 2, 'still two, once each');
  },
  // community-goal bonus (user 10-11-2026): an entry with communityBonus {ready, stageIds, rewards} (make-events.js) pays its
  // rewards once into the Presents (addPresent) when every objective (1..min(3, validSubmission)) of its stageIds is cleared;
  // player.events.bonus {censusId: {paidAt}} keeps it once per event: a replay or a login check pays nothing more. Not ready:
  // nothing. A past event (kept from the Event Catalog) pays as well. An old save already complete is paid by payBonuses (login).
  community_bonus_once() {
    const ix = INDEX();
    const rewards = [{ type: 5, id: 48, num: 30, name: 'Power Gem' }, { type: 5, id: 49, num: 30, name: 'Speed Gem' }];
    ix.entries[0].communityBonus = { noticeId: 63815, count: 7237, stageIds: [S1, S2], rewards, ready: true };
    ix.entries[1].communityBonus = { noticeId: 1, count: 100, stageIds: [S3], rewards, ready: false };
    ix.entries[2].communityBonus = { noticeId: 2, count: 9000, stageIds: [PAST], rewards, ready: true };
    const presents = [];
    const w = world({ index: ix });
    w.ev = routesEvents({ ...w.opts, addPresent: (type, id, num, comment) => presents.push({ type, id, num, comment }) });
    assert.strictEqual(w.ev.payBonuses(), 0, 'nothing cleared');
    assert.strictEqual(w.player.events, undefined, 'a check that pays nothing does not write the save');
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.deepStrictEqual(presents, [], 'S2 not cleared yet');
    w.ev.onStageClear(S2, [1, 2]);
    assert.deepStrictEqual(presents, [], 'objective 3 of S2 missing');
    w.ev.onStageClear(S2, [3]);
    assert.deepStrictEqual(presents.map((p) => [p.type, p.id, p.num]), [[5, 48, 30], [5, 49, 30]]);
    assert.ok(/Community goal/.test(presents[0].comment), presents[0].comment);
    assert.deepStrictEqual(Object.keys(w.player.events.bonus), ['E-1']);
    w.ev.onStageClear(S1, [1, 2, 3]);
    w.ev.onStageClear(S2, [1, 2, 3]);
    assert.strictEqual(w.ev.payBonuses(), 0);
    assert.strictEqual(presents.length, 2, 'once per event');
    w.ev.onStageClear(S3, [1]);
    assert.strictEqual(presents.length, 2, 'not ready: nothing');
    w.ev.onStageClear(PAST, [1, 2, 3]);
    assert.strictEqual(presents.length, 4, 'a past (kept) event pays too');
    assert.deepStrictEqual(Object.keys(w.player.events.bonus).sort(), ['E-0', 'E-1']);
    // an old save complete before the bonus existed: paid at login, once
    const p2 = [];
    const w2 = world({ index: ix, player: { name: 'Old', events: { kept: null, cleared: { [S1]: [1, 2, 3], [S2]: [1, 2, 3] } } } });
    w2.ev = routesEvents({ ...w2.opts, addPresent: (type, id, num) => p2.push({ type, id, num }) });
    assert.strictEqual(w2.ev.payBonuses(), 1);
    assert.strictEqual(w2.ev.payBonuses(), 0);
    assert.strictEqual(p2.length, 2);
    // without addPresent (old wiring) nothing is paid nor recorded
    const w3 = world({ index: ix });
    w3.ev.onStageClear(S1, [1, 2, 3]);
    w3.ev.onStageClear(S2, [1, 2, 3]);
    assert.strictEqual((w3.player.events.bonus || {})['E-1'], undefined);
  },
  // fix round 1 (I1): a reward the server cannot give now (a Spirit part with the pet off, canPay false) is not lost: it is kept in
  // player.pendingRewards once per stage / objective / position, and paid once by payPending when it can be given
  pending_reward_kept() {
    const w = world();
    let petOn = false;
    w.ev = routesEvents({ ...w.opts, canPay: (type) => type !== 33 || petOn });
    w.tables.stage[0] = stageRow(S1, { submissionRewardType: [2, 33, 3], submissionItemId: [0, 402003, 90011], submissionItemNum: [10, 1, 1],
      validClearGetItem: 1, clearGetItemType: [33], clearGetItemId: [402010], clearGetItemNum: [1] });
    w.ev.onStageClear(S1, [1, 2, 3]);
    assert.deepStrictEqual(w.objectives.map((o) => o.n), [1, 3], 'objective 2 not paid now');
    assert.deepStrictEqual(w.grants, [], 'the Spirit part first-clear item not paid now');
    assert.deepStrictEqual(w.player.pendingRewards, [{ stageId: S1, objective: 0, slot: 0, type: 33, id: 402010, num: 1 }, { stageId: S1, objective: 2, slot: 0, type: 33, id: 402003, num: 1 }]);
    delete w.player.events.cleared[S1];
    w.ev.onStageClear(S1, [2]);
    assert.strictEqual(w.player.pendingRewards.length, 2, 'once each');
    assert.strictEqual(w.ev.payPending(), 0, 'still cannot pay');
    petOn = true;
    assert.strictEqual(w.ev.payPending(), 2);
    assert.deepStrictEqual(w.grants, [{ type: 33, id: 402010, num: 1 }, { type: 33, id: 402003, num: 1 }]);
    assert.deepStrictEqual(w.player.pendingRewards, []);
    assert.strictEqual(w.ev.payPending(), 0, 'paid once');
    // without canPay (the old wiring) every type is paid as before
    const plain = world();
    plain.tables.stage[0] = w.tables.stage[0];
    plain.ev.onStageClear(S1, [2]);
    assert.deepStrictEqual(plain.objectives.map((o) => o.n), [2]);
    assert.strictEqual(plain.player.pendingRewards, undefined);
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
    quests: [quest(S1)], communityBonus: { noticeId: 63815, count: 7237, stageIds: [S1], rewards: [{ type: 5, id: 48, num: 30, name: 'Power Gem' }], ready: true } }], reasons: {} }));
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
    assert.deepStrictEqual(ev.map((e) => [e.eventStageId, e.eventType]), [[8000, 0], [20000, 0], [8999, 2], [29901, 3]]); // raids 2 (Raid Boards), events their own type
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
    assert.strictEqual(p.raidSpherePoint || 0, coins, 'an entry without a board set: no Event Coins, no Raid Coins');
    assert.strictEqual(p.freeStone, stone + 10, 'objective 1 once');
    assert.strictEqual(p.money, money + 100, 'first clear once');
    assert.deepStrictEqual(p.events.cleared[S1], [1, 2, 3]);
    // the community-goal bonus of the entry: in the Presents, once
    const bonusOf = () => (p.presents || []).filter((x) => x.resourceType === 5 && x.resourceId === 48 && x.number === 30 && /Community goal/.test(x.comment));
    assert.strictEqual(bonusOf().length, 1, 'community bonus in the Presents');
    call(t.respondStageStart, { stageId: S1, userKeybladeId: 0 });
    call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 0 } });
    assert.deepStrictEqual([p.freeStone, p.money, p.raidSpherePoint || 0], [stone + 10, money + 100, coins], 'objectives_once: second clear pays nothing');
    assert.strictEqual(bonusOf().length, 1, 'community bonus once');
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
