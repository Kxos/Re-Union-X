// Raid routes against a stub server (fields by name and order: docs/notes/raid.md), then the wiring of server.js on a
// fixture index. Dates: 2026-10-27 is a Tuesday, 10:00 UTC = 03:00 PDT, outside the bonus hours.
//   node server/test-raid-routes.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const routesRaid = require('./routes-raid');
const { isBonusTime, questApAt } = routesRaid;
const { coinRows } = require('./raid-rewards');

const TUE = Date.parse('2026-10-27T10:00:00Z');
const STAGE = 980001, ENEMY = 2000010, SPECIAL = 970001;
const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const USER = { userId: 1, name: 'Prova', level: 7, userAvatar: { a: 1 } };

const enemyRow = (id, weakness, hp, extra = {}) => ({ raidEnemyId: id, weakness, attribute: weakness, rare: 1, validGrowth: 2, baseLv: [1, 99, 0, 0, 0],
  hp: [hp, hp, 0, 0, 0], validParts: 0, parts: [0, 0, 0, 0, 0], ...extra });
const coin = coinRows({ enemyId: ENEMY, date: '2019-10-07', tier: 'Beginner', level: 1 });
const rewardId = (t) => [t.raidRewardId, t.raidRewardId, 0, 0, 0];

function world(opts = {}) {
  const w = { now: TUE, week: { shopFrom: '2019-10-07', shopTo: '2019-10-13' }, saves: 0, sent: null, sentCode: 0, logs: [], grants: [], presents: [], ap: 100, lux: 0, burst: null, medalCount: 0, medalCap: 3000 };
  w.player = opts.player || { name: 'Prova', titles: [] };
  const victory = opts.victoryRow || coin.victory;
  w.tables = {
    stage: [{ stageId: STAGE, raidBoss: 30001 }],
    raidEnemy: [
      enemyRow(ENEMY, 1, 1000, { validParts: 2, parts: [ENEMY + 2, ENEMY + 1, 0, 0, 0], rewardId: rewardId(victory), mvpRewardId: rewardId(coin.mvp), destroyAllRewardId: rewardId(coin.all) }),
      enemyRow(ENEMY + 1, 2, 100), enemyRow(ENEMY + 2, 3, 200),
    ],
    raidReward: [victory, coin.mvp, coin.all],
  };
  w.index = opts.index || { entries: [{ key: 'WW-1/Beginner', censusId: 'WW-1', available: true, stageId: STAGE, evStageId: 8001, enemyId: ENEMY, modelId: 7, tier: 'Beginner',
    upMinutes: 20, useAp: 10, questAp: [0, 5, 90], start: '2019-10-07', end: '2019-10-13', level: 25 }], models: { '0007': { fight: true, start: true, escape: true, put_down: true } } };
  w.raid = routesRaid({
    player: w.player, savePlayer: () => { w.saves++; }, masterRows: (t) => w.tables[t] || [], raidIndex: () => w.index, storyWeek: () => w.week, smokeKey: () => w.smoke,
    realNow: () => w.now, serverTime: () => fmt(w.now), serverTimeAt: fmt,
    userPointData: (now) => ({ now, ap: w.ap, lux: w.lux }), userDetailData: () => ({ detail: 1 }),
    stageResumptionData: () => ({ resumptionStatus: 0, stageId: 0, raidId: 0, colosseumStageId: 0 }),
    inventoryBlocks: () => ({ userSkills: [{ userSkillId: 1 }], userMedals: [{ userMedalId: 9 }], userMaterials: [], userKeyblades: [{ userKeybladeId: 1 }], userAvatarParts: [],
      userTitles: (w.player.titles || []).map((titleId, i) => ({ userTitleId: i + 1, titleId })) }),
    inventorySnapshot: () => null, send: (res, code, body) => { w.sentCode = code; w.sent = body; }, ret: () => ({ ok: 1 }), clock: { weekEnd: (ms) => ms + 1000 },
    apNow: () => w.ap, changeAp: (d) => { w.ap += d; }, raidUser: () => USER, supportUsers: (id) => (id ? [{ supportUserId: id }] : []),
    guiltLists: () => ({ guiltBurstFirstUserMedalIds: [], guiltBurstMaxUserMedalIds: [] }),
    battlePoints: (getPoint, burst) => { const lux = Number(getPoint?.lux) || 0; w.lux += lux; w.burst = burst; return lux; }, beginBattle: (k) => { w.keyblade = k; },
    grantItem: (it) => { if (w.grantHook) w.grantHook(); w.grants.push(it); if (it.type === 7) w.player.titles = [...new Set([...w.player.titles, it.id])]; }, addPresent: (it) => w.presents.push(it),
    medalCount: () => w.medalCount, medalCap: () => w.medalCap,
    stageState: () => ({ score: 0, playStatus: 0, clearMissionIds: [] }), webBase: 'http://x', rng: () => 0.99, log: (m) => w.logs.push(m),
  });
  w.call = (fn, ...a) => { w.sent = null; w.raid[fn]({}, ...a); return w.sent; };
  w.spawn = () => { w.raid.onStageClear(STAGE, { raidPoint: 9000 }); assert(w.player.raid.boss, 'boss spawned'); return w.player.raid.boss; };
  w.start = () => w.call('start', { raidId: w.player.raid.boss.raidId, supportUserId: 0, userKeybladeId: 3 });
  w.clearParts = (hp) => w.call('clear', { parts: w.player.raid.boss.parts.map((p, i) => ({ raidEnemyId: p.raidEnemyId, partsId: p.partsId, hp: hp[i], damage: p.hp - hp[i] })),
    getPoint: { exp: 1, money: 1, lux: 50 }, maximumDamage: 1, guiltBurstMaximumDamage: 0, burst: 7 });
  return w;
}
const keys = (o) => Object.keys(o);
const INFO = ['raidId', 'level', 'useAp', 'timeLeft', 'feverFlag', 'feverTime', 'stageId', 'parts'];
const PART = ['raidEnemyId', 'partsId', 'hp', 'attribute', 'rare'];

const tests = {
  list_empty_shape() {
    const w = world();
    const b = w.call('list');
    const now = fmt(TUE);
    assert.deepStrictEqual(b, { ret: { ok: 1 }, selfRaid: { raidStatus: 0, raid: { raidId: 0, level: 0, useAp: 0, timeLeft: now, feverFlag: 0, feverTime: now, stageId: 0, parts: [] } }, raids: [] });
    assert.deepStrictEqual(keys(b), ['ret', 'selfRaid', 'raids']);
    assert.deepStrictEqual(keys(b.selfRaid.raid), INFO);
  },
  list_boss() {
    const w = world();
    w.spawn();
    const b = w.call('list');
    assert.deepStrictEqual(keys(b), ['ret', 'selfRaid', 'raids']);
    assert.strictEqual(b.selfRaid.raidStatus, 4, 'start demo once');
    assert.deepStrictEqual(keys(b.selfRaid.raid), INFO);
    assert.deepStrictEqual(keys(b.selfRaid.raid.parts[0]), PART);
    assert.deepStrictEqual(b.selfRaid.raid.parts.map((p) => [p.partsId, p.raidEnemyId, p.hp]), [[1, ENEMY, 1000], [2, ENEMY + 1, 100], [3, ENEMY + 2, 200]], 'index = weakness - 1');
    assert.strictEqual(b.raids.length, 1);
    assert.deepStrictEqual(keys(b.raids[0]), ['raid', 'discoverer', 'isRelief', 'isEntry']);
    assert.strictEqual(b.raids[0].raid.raidId, b.selfRaid.raid.raidId);
    assert.deepStrictEqual(b.raids[0].discoverer, USER);
    assert.strictEqual(b.raids[0].isRelief, 0);
    assert.strictEqual(b.raids[0].isEntry, 0);
    assert.strictEqual(w.call('list').selfRaid.raidStatus, 3, 'then active');
    assert(w.saves >= 2, 'the demo shown once is saved');
  },
  flee_then_new_spawn() {
    const w = world();
    w.spawn();
    w.now += 20 * 60000;
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 0, 'a boss past its timer is not alive');
    const fled = w.call('list');
    assert.strictEqual(fled.selfRaid.raidStatus, 2, 'escape once');
    assert.deepStrictEqual(fled.raids, [], 'the map hides it');
    const after = w.call('list');
    assert.strictEqual(after.selfRaid.raidStatus, 0);
    assert.strictEqual(w.player.raid.boss, null);
    w.spawn();
  },
  orphan_boss_dropped() {
    const w = world();
    w.spawn();
    w.tables.stage = [];
    const b = w.call('list');
    assert.strictEqual(b.selfRaid.raidStatus, 0, 'a boss with no stage row would crash the client');
    assert.deepStrictEqual(b.raids, []);
    assert.strictEqual(w.player.raid.boss, null);
    assert(w.logs.some((l) => /dropped/.test(l)));
  },
  orphan_boss_not_advertised() {
    // a stored boss whose entry left the master (a model withheld after it spawned): the home's «Active request!» must not
    // offer it, since starting it would crash the client
    const w = world();
    w.spawn();
    w.tables.stage = [];
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 0);
    assert.strictEqual(w.player.raid.boss, null);
  },
  start_charges_ap() {
    const w = world();
    w.spawn(); w.call('list');
    const first = w.start();
    assert.deepStrictEqual(keys(first), ['ret', 'userData', 'raid', 'players', 'startRaidData', 'vitalsLog', 'partsLog', 'discovererUserId', 'campaigns', 'supportUsers']);
    assert.strictEqual(w.ap, 100, 'first attempt free');
    assert.strictEqual(first.raid.useAp, 0);
    assert.deepStrictEqual(keys(first.raid), INFO);
    assert.strictEqual(w.keyblade, 3);
    assert.deepStrictEqual(first.startRaidData, { raidId: first.raid.raidId, supportUserId: 0, userKeybladeId: 3 });
    assert.strictEqual(first.discovererUserId, 1);
    w.clearParts([500, 100, 0]);
    const second = w.call('start', { raidId: w.player.raid.boss.raidId, supportUserId: 1, userKeybladeId: 3 });
    assert.strictEqual(w.ap, 90, '10 AP lower');
    assert.strictEqual(second.userData.userPoint.ap, 90, 'new userPoint');
    assert.strictEqual(second.raid.useAp, 10);
    assert.deepStrictEqual(second.raid.parts.map((p) => p.hp), [500, 100, 0], 'damage kept');
    assert(Array.isArray(second.supportUsers) && second.supportUsers.length === 1);
    assert(Array.isArray(second.campaigns));
    assert(Array.isArray(second.players) && Array.isArray(second.vitalsLog) && Array.isArray(second.partsLog));
  },
  start_without_ap_refused() {
    const w = world();
    w.spawn(); w.call('list'); w.start(); w.clearParts([500, 100, 200]);
    w.ap = 9;
    const before = JSON.stringify(w.player.raid), saves = w.saves;
    const b = w.start();
    assert.strictEqual(b.startRaidData, undefined, 'the fight does not start');
    assert.strictEqual(w.ap, 9);
    assert.strictEqual(JSON.stringify(w.player.raid), before, 'no state changes');
    assert.strictEqual(w.saves, saves);
  },
  start_wrong_raid_refused() {
    const w = world();
    w.spawn();
    assert.strictEqual(w.call('start', { raidId: 12345 }).startRaidData, undefined);
    assert.strictEqual(w.player.raid.boss.fights, 0);
  },
  start_after_timer_plays_an_escape() {
    // bench 2-11: the deck screen open over the timer; a refused start is «200 ERROR :122», and OK resends it forever
    const w = world();
    w.spawn(); w.call('list'); w.start(); w.clearParts([500, 100, 200]);
    w.now = w.player.raid.boss.endsAt + 1;
    const b = w.start();
    assert.notStrictEqual(b.startRaidData, undefined, 'the fight starts');
    assert.strictEqual(w.ap, 100, 'no AP for a boss that is gone');
    const c = w.clearParts([0, 0, 0]);
    assert.strictEqual(c.raidTimeStatus, 2, 'even a win reads as escaped');
    assert.deepStrictEqual(w.player.raid.pending, [], 'no reward');
    assert.strictEqual(w.call('list').selfRaid.raidStatus, 2, 'the list plays the flee');
    assert.strictEqual(w.player.raid.boss, null);
  },
  clear_has_all_fields() {
    const w = world();
    w.spawn(); w.start();
    const b = w.clearParts([500, 100, 200]);
    assert.deepStrictEqual(keys(b), ['ret', 'userData', 'raidTimeStatus', 'reliefFlag', 'userSkills', 'userTitles', 'userKeyblades', 'getLux']);
    assert.deepStrictEqual(keys(b.userData), ['userPoint', 'userDetail', 'stageResumption']);
    assert.strictEqual(b.userData.stageResumption.resumptionStatus, 0);
    assert.strictEqual(b.getLux, 50);
    assert.strictEqual(w.burst, 7);
    assert.strictEqual(b.raidTimeStatus, 1, 'boss alive');
    assert.strictEqual(b.reliefFlag, 0);
    assert(Array.isArray(b.userKeyblades) && b.userKeyblades.length);
    assert(Array.isArray(b.userSkills));
    assert.strictEqual(w.player.raid.boss.parts[0].hp, 500);
  },
  clear_malformed_hp_is_not_victory() {
    for (const hp of [undefined, null, 'x', '', NaN, -1, {}]) {
      const w = world();
      w.spawn(); w.start();
      const b = w.call('clear', { parts: [{ raidEnemyId: ENEMY, partsId: 1, hp, damage: 5 }], getPoint: {} });
      assert.notStrictEqual(b.raidTimeStatus, 3, `hp ${String(hp)} is not a victory`);
      assert.strictEqual(w.player.raid.boss.parts[0].hp, 1000, `hp ${String(hp)} keeps the stored HP`);
    }
    for (const body of [undefined, {}, { parts: 'x' }, { parts: [null] }]) {
      const w = world();
      w.spawn(); w.start();
      assert.notStrictEqual(w.call('clear', body).raidTimeStatus, 3);
      assert.strictEqual(w.player.raid.boss.parts[0].hp, 1000);
    }
  },
  clear_without_fight_changes_nothing() {
    const w = world();
    w.spawn();
    const b = w.clearParts([0, 0, 0]);
    assert.strictEqual(b.raidTimeStatus, 5, 'no fight running');
    assert.strictEqual(b.getLux, 0);
    assert.strictEqual(w.player.raid.boss.parts[0].hp, 1000);
  },
  clear_after_timer() {
    const w = world();
    w.spawn(); w.start();
    w.now = w.player.raid.boss.endsAt + 1;
    assert.strictEqual(w.clearParts([500, 100, 200]).raidTimeStatus, 2, 'lost past the timer: escaped');
    assert.strictEqual(w.call('list').selfRaid.raidStatus, 2, 'the list still plays the flee');
    assert.strictEqual(w.player.raid.boss, null);
    const v = world();
    v.spawn(); v.start();
    v.now = v.player.raid.boss.endsAt + 1;
    assert.strictEqual(v.clearParts([0, 100, 200]).raidTimeStatus, 3, 'a win past the timer stays a win');
  },
  clear_titles_new_only() {
    const row = { ...coin.victory, validReward: 1, type: [7, 0, 0, 0], id: [777, 0, 0, 0], num: [1, 0, 0, 0] };
    const w = world({ victoryRow: row });
    w.player.titles = [5];
    w.spawn(); w.start();
    const first = w.clearParts([0, 100, 200]);
    assert.deepStrictEqual(first.userTitles.map((t) => t.titleId), [777], 'only the new title');
    assert.deepStrictEqual(first.userTitles[0], { userTitleId: 2, titleId: 777 }, 'same id as GET /user/title');
    const shown = w.call('reward');
    assert.deepStrictEqual(shown.raidRewards[0].userTitles, [], 'no second popup');
    w.spawn(); w.start();
    assert.deepStrictEqual(w.clearParts([0, 100, 200]).userTitles, [], 'already owned: no popup');
  },
  member_holds_player() {
    const w = world();
    w.spawn(); w.start();
    const raidId = w.player.raid.boss.raidId;
    assert.strictEqual(w.call('member', { raidId }).cooperators[0].damage, 0);
    w.clearParts([0, 100, 200]);
    const b = w.call('member', { raidId });
    assert.deepStrictEqual(keys(b), ['ret', 'cooperators', 'discovererUserId', 'mvpUserId']);
    assert.strictEqual(b.cooperators.length, 1, 'an empty list crashes');
    assert.deepStrictEqual(keys(b.cooperators[0]), ['user', 'damage']);
    assert.deepStrictEqual(b.cooperators[0].user, USER);
    assert.strictEqual(b.cooperators[0].damage, 1000);
    assert.strictEqual(b.discovererUserId, 1);
    assert.strictEqual(b.mvpUserId, 1);
    assert.strictEqual(world().call('member', {}).cooperators.length, 1, 'no boss at all');
  },
  notice_flags() {
    const w = world();
    assert.deepStrictEqual(w.call('notice'), { ret: { ok: 1 }, raidNotice: { isSelfRaid: 0, isOthersRaid: 0 } });
    w.spawn();
    assert.deepStrictEqual(w.call('notice').raidNotice, { isSelfRaid: 1, isOthersRaid: 0 });
    w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 0);
  },
  spawn_from_points() {
    const w = world();
    w.raid.onStageClear(SPECIAL, { raidPoint: 9000 });
    assert.strictEqual(w.player.raid?.points || 0, 0, 'a Special quest adds nothing');
    w.raid.onStageClear(1010, { raidPoint: 9000 });
    assert.strictEqual(w.player.raid?.points || 0, 0, 'a story quest adds nothing for now');
    w.raid.onStageClear(STAGE, { raidPoint: 3000 });
    w.raid.onStageClear(STAGE, { raidPoint: 3000 });
    assert.strictEqual(w.player.raid.boss, null);
    assert.strictEqual(w.player.raid.points, 6000);
    w.raid.onStageClear(STAGE, { raidPoint: 3000 });
    const boss = w.player.raid.boss;
    assert(boss, 'spawned at the third');
    assert.strictEqual(w.player.raid.points, 0, 'the counter restarts');
    assert.strictEqual(boss.stageId, STAGE);
    assert.strictEqual(boss.useAp, 10);
    assert.strictEqual(boss.endsAt, TUE + 20 * 60000);
    assert.strictEqual(boss.level, 1, 'first boss at LV 1, not the quest level');
    for (const bad of [undefined, null, {}, { raidPoint: 'x' }, { raidPoint: -5 }]) {
      const v = world();
      v.raid.onStageClear(STAGE, bad);
      assert.strictEqual(v.player.raid?.points || 0, 0);
    }
  },
  spawn_bonus_threshold() {
    const w = world();
    w.now = Date.parse('2026-10-27T15:30:00Z'); // 08:30 PDT
    w.raid.onStageClear(STAGE, { raidPoint: 3000 });
    assert.strictEqual(w.player.raid.boss, null);
    w.raid.onStageClear(STAGE, { raidPoint: 3000 });
    assert(w.player.raid.boss, 'two eggs in bonus time');
  },
  spawn_uses_padded_model_key() {
    const w = world();
    const boss = w.spawn();
    assert.strictEqual(boss.status, 4, 'raid_models.json keys are folder names: model 7 is 0007');
    assert.strictEqual(boss.hasEscapeDemo, true);
    const none = world();
    none.index.models = { 7: { fight: true, start: true, escape: true, put_down: true } };
    assert.strictEqual(none.spawn().status, 3, 'the bare number is not a key');
  },
  spawn_row_missing_keeps_counter() {
    const w = world();
    w.tables.raidEnemy = [];
    w.raid.onStageClear(STAGE, { raidPoint: 9000 });
    assert.strictEqual(w.player.raid.boss, null);
    assert.strictEqual(w.player.raid.points, 9000);
    assert(w.logs.some((l) => /raidEnemy/.test(l)));
  },
  no_second_boss() {
    const w = world();
    const boss = w.spawn();
    w.raid.onStageClear(STAGE, { raidPoint: 9000 });
    assert.strictEqual(w.player.raid.boss, boss, 'same boss');
    assert.strictEqual(w.player.raid.points, 9000, 'the counter is kept');
  },
  level_up_once() {
    const w = world();
    w.spawn(); w.start();
    assert.strictEqual(w.clearParts([0, 100, 200]).raidTimeStatus, 3);
    assert.strictEqual(w.player.raid.boss, null, 'the route removes the boss');
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 2);
    const lux = w.lux;
    const again = w.call('clear', { parts: [{ raidEnemyId: ENEMY, partsId: 1, hp: 0, damage: 5 }], getPoint: { lux: 50 } });
    assert.strictEqual(again.raidTimeStatus, 5);
    assert.strictEqual(again.getLux, 0);
    assert.strictEqual(w.lux, lux, 'no Lux twice');
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 2);
    assert.strictEqual(w.player.raid.pending.length, 1, 'one pending');
    assert.strictEqual(w.spawn().level, 2, 'next boss at the new level');
  },
  level_cap() {
    const w = world();
    w.player.raid = { levels: { 'WW-1/Beginner': 99 } };
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 99);
  },
  reward_once() {
    const w = world();
    const empty = w.call('reward');
    assert.deepStrictEqual(keys(empty), ['ret', 'userData', 'raidRewards', 'guiltBurstFirstUserMedalIds', 'guiltBurstMaxUserMedalIds']);
    assert.deepStrictEqual(empty.raidRewards, []);
    w.spawn(); w.start();
    const raidId = w.player.raid.boss.raidId;
    w.clearParts([0, 0, 0]);
    assert.strictEqual(w.grants.length, 0, 'delivered at /raid/reward');
    const b = w.call('reward');
    assert.strictEqual(b.raidRewards.length, 1);
    const e = b.raidRewards[0];
    assert.deepStrictEqual(keys(e), ['raidId', 'level', 'subdueId', 'mvpId', 'partAllId', 'parts', 'userMedals', 'userSkills', 'userTitles', 'userMaterials', 'userAvatarParts']);
    assert.strictEqual(e.raidId, raidId);
    assert.strictEqual(e.level, 1);
    assert.strictEqual(e.subdueId, 1, 'rng 0.99 misses the high coin slot');
    assert.strictEqual(e.mvpId, 1);
    assert.strictEqual(e.partAllId, 1, 'All Points');
    assert.deepStrictEqual(keys(e.parts[0]), PART);
    assert.strictEqual(w.grants.length, 3);
    assert.strictEqual(w.call('reward').raidRewards.length, 0, 'not shown twice');
    assert.strictEqual(w.grants.length, 3, 'not granted twice');
    assert.strictEqual(w.player.raid.pending.length, 0);
  },
  reward_no_all_points_when_a_part_survives() {
    const w = world();
    w.spawn(); w.start(); w.clearParts([0, 100, 0]);
    assert.strictEqual(w.call('reward').raidRewards[0].partAllId, 0);
    assert.strictEqual(w.grants.length, 2);
  },
  reward_sanitizes_every_call() {
    const w = world();
    w.player.raid = { pending: [{ raidId: 1, level: 1, subdueId: 9, mvpId: 1, partAllId: 0, parts: [], rewardIds: { victory: coin.victory.raidRewardId, mvp: coin.mvp.raidRewardId, all: 0 } },
      { raidId: 2, level: 1, subdueId: 1, mvpId: 1, partAllId: 0, parts: [], rewardIds: { victory: 123, mvp: coin.mvp.raidRewardId, all: 0 } }] };
    assert.deepStrictEqual(w.call('reward').raidRewards, [], 'a bad slot or a row no longer served is dropped');
    assert.strictEqual(w.logs.length, 2);
    assert.strictEqual(w.player.raid.pending.length, 0);
    assert.strictEqual(w.grants.length, 0);
  },
  reward_throwing_grant_pays_nothing_twice() {
    const row = { ...coin.victory, validReward: 1, type: [16, 0, 0, 0], id: [0, 0, 0, 0], num: [120, 0, 0, 0] };
    const w = world({ victoryRow: row });
    w.spawn(); w.start();
    const raidId = w.player.raid.boss.raidId;
    w.clearParts([0, 0, 0]);
    w.now += 1000;
    w.spawn(); w.start();
    w.clearParts([0, 0, 0]);
    assert.strictEqual(w.player.raid.pending.length, 2);
    let n = 0;
    w.grantHook = () => { if (++n === 2) throw new Error('boom'); }; // second item of the first entry
    const first = w.call('reward');
    w.grantHook = null;
    assert(first, 'the route answers');
    assert.strictEqual(first.raidRewards.length, 1, 'the failed entry is not shown, the good one is');
    assert.notStrictEqual(first.raidRewards[0].raidId, raidId, 'the one shown is the second');
    assert.strictEqual(w.player.raid.pending.length, 0, 'out of pending before delivery');
    assert(w.logs.some((l) => /boom/.test(l)), 'logged');
    const grants = w.grants.length;
    const second = w.call('reward');
    assert.deepStrictEqual(second.raidRewards, [], 'works on the next call');
    assert.strictEqual(w.grants.length, grants, 'nothing paid twice');
  },
  reward_full_box() {
    const row = { ...coin.victory, validReward: 1, type: [3, 0, 0, 0], id: [55, 0, 0, 0], num: [1, 0, 0, 0] };
    const w = world({ victoryRow: row });
    w.medalCount = 3000;
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.call('reward').raidRewards.length, 1);
    assert.deepStrictEqual(w.presents.map((p) => p.id), [55]);
    assert.strictEqual(w.player.raid.pending.length, 0);
  },
  no_index_answers_empty() {
    const w = world({ index: { entries: [], models: {} } });
    assert.strictEqual(w.call('list').selfRaid.raidStatus, 0);
    assert.deepStrictEqual(w.call('reward').raidRewards, []);
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 0);
    assert.deepStrictEqual(w.raid.events(TUE), []);
    assert.strictEqual(w.raid.stageAp(STAGE, TUE), null);
    w.raid.onStageClear(STAGE, { raidPoint: 9000 });
    assert.strictEqual(w.player.raid?.points || 0, 0);
  },
  old_save() {
    const w = world({ player: { name: 'Vecchio', titles: [] } });
    assert.strictEqual(w.player.raid, undefined);
    assert.strictEqual(w.call('list').selfRaid.raidStatus, 0);
    assert.strictEqual(w.player.raid.points, 0);
  },
  bonus_hours() {
    const pt = (iso) => isBonusTime(Date.parse(iso));
    for (const h of ['09', '15', '21']) assert(pt(`2026-07-01T${h}:00:00Z`), `summer ${h} UTC = 2, 8, 14 PDT`);
    assert(pt('2026-07-02T03:59:59Z'), '20:59 PDT');
    assert(pt('2026-07-01T09:59:59Z'), '02:59 PDT is in');
    assert(!pt('2026-07-01T10:00:00Z'), '03:00 PDT');
    assert(pt('2026-01-15T10:00:00Z'), 'winter: 02:00 PST');
    assert(!pt('2026-01-15T09:00:00Z'), 'winter: 01:00 PST');
  },
  quest_ap() {
    const e = (start, questAp) => ({ start, questAp });
    const WEEK = Date.parse('2026-10-27T10:00:00Z'), BONUS = Date.parse('2026-10-27T15:00:00Z'), SAT = Date.parse('2026-10-31T10:00:00Z');
    const now = e('2019-07-15', [5]);
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(now, t)), [0, 5, 90], 'from 2019-07-15');
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2019-02-11', [0, 5]), t)), [0, 5, 5], 'bonus / other');
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2019-03-01', [5, 90]), t)), [90, 5, 90], 'weekend / weekday, no bonus value');
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2018-10-01', [5]), t)), [5, 5, 5], 'one value');
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2018-09-03', [0]), t)), [0, 0, 0]);
  },
  stage_ap_only_raid_quests() {
    const w = world();
    assert.strictEqual(w.raid.stageAp(STAGE, TUE), 90);
    assert.strictEqual(w.raid.stageAp(SPECIAL, TUE), null);
    assert.strictEqual(w.raid.stageAp(1010, TUE), null);
  },
  smoke_forces_boss() {
    // bench smoke (tmp/raid_p2/smoke_raids.ps1 writes save/raid_smoke.json): /raid/list shows the named boss, any week
    const w = world();
    w.index.entries.push({ ...w.index.entries[0], key: 'WW-9/Advanced', censusId: 'WW-9', start: '2021-01-04', end: '2021-01-10', tier: 'Advanced' });
    w.smoke = 'WW-9/Advanced';
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 1, 'the home shows Active request! at once');
    const b = w.call('list');
    assert.strictEqual(b.selfRaid.raidStatus, 4, 'appears with its start demo');
    assert.strictEqual(w.player.raid.boss.key, 'WW-9/Advanced');
    const id = w.player.raid.boss.raidId;
    w.call('list');
    assert.strictEqual(w.player.raid.boss.raidId, id, 'the same boss stays, damage and all');
    w.smoke = 'WW-1/Beginner';
    w.call('list');
    assert.strictEqual(w.player.raid.boss.key, 'WW-1/Beginner', 'the next one replaces it');
    w.smoke = 'nothing/Beginner';
    w.call('list');
    assert.strictEqual(w.player.raid.boss.key, 'WW-1/Beginner', 'an unknown key changes nothing');
    w.smoke = null;
    const plain = world();
    plain.call('list');
    assert.strictEqual(plain.player.raid.boss, null, 'no file, no boss');
  },
  smoke_file_fresh_only() {
    // review fix: a file left by a killed script is ignored after SMOKE_MAX_AGE_MS, read once per change, logged once
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-raid-smoke-'));
    const file = path.join(dir, 'raid_smoke.json');
    const logs = [];
    const reader = routesRaid.smokeReader(file, (m) => logs.push(m));
    const now = Date.now();
    assert.strictEqual(reader(now), null, 'no file');
    fs.writeFileSync(file, '﻿{"key": "WW-1/Beginner"}');
    assert.strictEqual(reader(now), 'WW-1/Beginner', 'fresh, BOM dropped');
    let reads = 0;
    const realRead = fs.readFileSync;
    fs.readFileSync = (...a) => { reads++; return realRead(...a); };
    try { reader(now); reader(now); } finally { fs.readFileSync = realRead; }
    assert.strictEqual(reads, 0, 'read once per change (mtime)');
    const old = (now - routesRaid.SMOKE_MAX_AGE_MS - 60000) / 1000;
    fs.utimesSync(file, old, old);
    assert.strictEqual(reader(now), null, 'stale: ignored');
    assert.strictEqual(reader(now), null);
    assert.strictEqual(logs.filter((m) => /ignored/.test(m)).length, 1, 'logged once');
    fs.writeFileSync(file, '{"key": "WW-2/Beginner"}');
    assert.strictEqual(reader(Date.now()), 'WW-2/Beginner', 'rewritten: fresh again');
    fs.writeFileSync(file, 'not json');
    assert.strictEqual(reader(Date.now()), null, 'corrupt: nothing');
    fs.rmSync(dir, { recursive: true, force: true });
    // an unknown key is logged once, not at every call
    const w = world();
    w.smoke = 'nothing/Beginner';
    w.call('list'); w.call('notice'); w.call('list');
    assert.strictEqual(w.logs.filter((m) => /not an available entry/.test(m)).length, 1);
  },
  calendar_week() {
    // Task 8: /stage/event and the Raid Boards follow the Shop week of the story (storyCtx), the kept raid joins them
    const w = world();
    const base = w.index.entries[0];
    w.index.entries = [{ ...base, sphereBoardIds: [3000001] },
      { ...base, key: 'WW-2/Beginner', censusId: 'WW-2', evStageId: 8002, stageId: STAGE + 1, start: '2019-10-14', end: '2019-10-20', sphereBoardIds: [3000002] },
      { ...base, key: 'WW-3/Beginner', censusId: 'WW-3', evStageId: 8003, stageId: STAGE + 2, start: '2019-10-21', end: '2019-10-27', available: false, why: 'graphics', sphereBoardIds: [3000003] }];
    const listed = () => w.raid.events(TUE).map((e) => e.eventStageId);
    assert.deepStrictEqual(listed(), [8001]);
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000001]);
    w.week = { shopFrom: '2019-10-17', shopTo: '2019-10-23' };
    assert.deepStrictEqual(listed(), [8002], 'a Thursday-to-Wednesday week: the row holding shopFrom');
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000002]);
    w.week = { shopFrom: '2019-10-21', shopTo: '2019-10-27' };
    assert.deepStrictEqual(listed(), [], 'only an unavailable tier: no raid');
    w.week = { shopFrom: '2016-04-07', shopTo: '2016-04-13' };
    assert.deepStrictEqual(listed(), [], 'before the raids');
    w.player.raid.kept = 'WW-1';
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000001], 'the kept raid keeps its boards');
    assert.deepStrictEqual(w.raid.boardIds(TUE).all.sort(), [3000001, 3000002, 3000003]);
    // a quest of another week still counts once played (its screen was open across the Monday)
    assert.strictEqual(w.raid.stageAp(STAGE + 1, TUE), 90);
  },
  events_type_2() {
    const w = world();
    w.index.entries.push({ ...w.index.entries[0], key: 'WW-1/Advanced', stageId: STAGE + 1, tier: 'Advanced' },
      { ...w.index.entries[0], key: 'WW-1/Epic', stageId: STAGE + 2, tier: 'Epic', available: false, why: 'graphics' });
    const ev = w.raid.events(TUE);
    assert.strictEqual(ev.length, 1, 'one event per census row');
    assert.deepStrictEqual(keys(ev[0]), ['stages', 'eventStageId', 'showIcon', 'bannerUrl', 'eventType', 'status', 'endTime', 'newStageId', 'isLock', 'complete']);
    assert.strictEqual(ev[0].eventType, 2);
    assert.strictEqual(ev[0].eventStageId, 8001);
    assert.strictEqual(ev[0].bannerUrl, 'http://x/web/raid/img/8001.png');
    assert.strictEqual(ev[0].endTime, fmt(TUE + 1000));
    assert.deepStrictEqual(ev[0].stages.map((s) => [s.stageId, s.useAp]), [[STAGE, 90], [STAGE + 1, 90]], 'only available tiers, AP of the moment');
    assert.deepStrictEqual(keys(ev[0].stages[0]), ['stageId', 'useAp', 'score', 'playStatus', 'clearMissionIds']);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}

// ---- server.js, on a fixture index: route kinds, /stage/clear, /stage/start, /stage/event, the banner route ----
function wiring() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-raid-routes-'));
  process.env.KHUX_SAVE = path.join(dir, 'save.json');
  process.env.KHUX_RAID_INDEX = path.join(dir, 'raids.json');
  process.env.KHUX_RAID_MODELS = path.join(dir, 'raid_models.json');
  process.env.KHUX_RAID_IMG = path.join(dir, 'img');
  delete process.env.KHUX_REAL_NOW;
  delete process.env.KHUX_SERVER_TIME;
  const FAKE = 989999; // far from any generated row
  // dates: in every Shop week (raid-calendar.js); the week itself is checked below
  fs.writeFileSync(process.env.KHUX_RAID_INDEX, JSON.stringify({ entries: [{ key: 'K/Beginner', censusId: 'K', available: true, stageId: FAKE, evStageId: 8999, enemyId: 2999990, modelId: 7, tier: 'Beginner', upMinutes: 20, useAp: 10, questAp: [0, 5, 90], start: '2015-01-01', end: '2099-12-31' }], reasons: {} }));
  fs.writeFileSync(process.env.KHUX_RAID_MODELS, JSON.stringify({ '0007': { fight: true, start: true, escape: true, put_down: true } }));
  fs.mkdirSync(process.env.KHUX_RAID_IMG);
  const realDateNow = Date.now;
  Date.now = () => TUE;
  const log = console.log, warn = console.warn;
  const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
  const { _test: t } = quiet(() => require('./server'));
  const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
  const web = (url) => { const o = { code: 0, body: null }; quiet(() => t.respondRaidWeb({ writeHead(c) { o.code = c; }, end(x) { o.body = x; } }, url)); return o; };
  const p = t.player;
  call(t.respondUserCreate, { name: 'Prova', unionId: 1 });

  assert.strictEqual(t.route('/raid/start'), 'raidstart');
  assert.strictEqual(t.route('/raid/clear'), 'raidclear');
  assert.strictEqual(t.route('/raid/member?m=0&v=x'), 'raidmember');
  assert.strictEqual(t.route('/raid/list/181221'), 'raidlist');
  assert.strictEqual(t.route('/raid/reward/151101'), 'raidreward');
  assert.strictEqual(t.route('/web/raid/img/8001.png'), 'raidweb');

  const ev = call(t.respondStageEvent, { eventCategory: 2 }).events;
  assert.deepStrictEqual(ev.map((e) => [e.eventStageId, e.eventType]), [[8999, 2]]);
  // the raids follow the Shop week of storyCtx(): a row that ends before shopFrom is gone, one that holds it is listed
  {
    const wk = quiet(() => t.storyCtx()), k = t.raidIndex().entries[0];
    const dayBefore = new Date(Date.parse(wk.shopFrom) - 86400000).toISOString().slice(0, 10);
    Object.assign(k, { start: '2015-01-01', end: dayBefore });
    assert.deepStrictEqual(call(t.respondStageEvent, { eventCategory: 2 }).events.filter((e) => e.eventType === 2), [], `row ending ${dayBefore}`);
    Object.assign(k, { start: wk.shopFrom, end: wk.shopFrom });
    assert.deepStrictEqual(call(t.respondStageEvent, { eventCategory: 2 }).events.map((e) => e.eventStageId), [8999]);
    Object.assign(k, { start: '2015-01-01', end: '2099-12-31' });
  }
  assert.strictEqual(ev[0].bannerUrl, `${t.WEB_BASE}/web/raid/img/8999.png`);
  assert.strictEqual(ev[0].stages[0].useAp, 90);

  p.ap = 200; p.apTime = TUE;
  const before = t.userPointData(t.serverTime()).ap;
  call(t.respondStageStart, { stageId: FAKE, userKeybladeId: 0 });
  assert.strictEqual(t.userPointData(t.serverTime()).ap, before - 90, '/stage/start charges the AP of the moment, not the master row');
  call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0, raidPoint: 3000 } });
  assert.strictEqual(p.raid.points, 3000, '/stage/clear adds the points');
  call(t.respondStageStart, { stageId: 1010, userKeybladeId: 0 });
  call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0, raidPoint: 3000 } });
  assert.strictEqual(p.raid.points, 3000, 'a story quest adds nothing for now');

  // a raid error never costs a quest clear
  const onClear = t.raid().onStageClear;
  t.raid().onStageClear = () => { throw new Error('boom'); };
  call(t.respondStageStart, { stageId: FAKE, userKeybladeId: 0 });
  const survived = call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0, raidPoint: 3000 } });
  assert(survived && survived.userData && Array.isArray(survived.userKeyblades), 'the clear answers whole');
  t.raid().onStageClear = onClear;

  assert.strictEqual(web('/web/raid/img/8999.png').code, 404, 'no file: 404, nothing crashes');
  fs.writeFileSync(path.join(process.env.KHUX_RAID_IMG, '0.png'), 'default');
  assert.strictEqual(web('/web/raid/img/8999.png').body.toString(), 'default', 'default art');
  fs.writeFileSync(path.join(process.env.KHUX_RAID_IMG, '8999.png'), 'own');
  assert.strictEqual(web('/web/raid/img/8999.png').body.toString(), 'own', 'own file first');
  assert.strictEqual(web('/web/raid/img/x.png').code, 404);

  const list = call(t.raid().list);
  assert.strictEqual(list.selfRaid.raidStatus, 0);
  assert.strictEqual(call(t.raid().notice).raidNotice.isSelfRaid, 0);
  assert.strictEqual(call(t.raid().member, {}).cooperators[0].user.name, 'Prova');

  // a whole fight on the real helpers of server.js: an existing boss row, an existing stage, a reward row added here
  const REWARD = 299999999;
  const bossRow = t.masterRows('raidEnemy')[0];
  const original = { rewardId: bossRow.rewardId, mvpRewardId: bossRow.mvpRewardId, destroyAllRewardId: bossRow.destroyAllRewardId };
  const coinRow = { ...coin.victory, raidRewardId: REWARD, validReward: 1, type: [16, 0, 0, 0], id: [0, 0, 0, 0], num: [120, 0, 0, 0] };
  // masterRows hands out copies and the real table may be empty: the file read is served here for this one table
  const readFile = fs.readFileSync;
  fs.readFileSync = (f, ...a) => (String(f).endsWith('raidReward.json') ? JSON.stringify([coinRow]) : readFile(f, ...a));
  Object.assign(bossRow, { rewardId: [REWARD, REWARD, REWARD, REWARD, REWARD], mvpRewardId: [REWARD, REWARD, REWARD, REWARD, REWARD], destroyAllRewardId: [REWARD, REWARD, REWARD, REWARD, REWARD] });
  const fight = require('./raid-fight');
  p.raid.boss = fight.newBoss({ key: 'K/Beginner', tier: 'Beginner', stageId: t.masterRows('stage')[0].stageId, enemy: bossRow, level: 1, upMinutes: 20, useAp: 10, nowMs: TUE,
    partRows: [{ raidEnemyId: bossRow.raidEnemyId, weakness: 1, hp: 1000, attribute: 1, rare: 1 }], hasStartDemo: false, hasEscapeDemo: true });
  const raidId = p.raid.boss.raidId, coins = t.userPointData(t.serverTime()).raidSpherePoint;
  assert.strictEqual(call(t.raid().list).selfRaid.raidStatus, 3);
  const started = call(t.raid().start, { raidId, supportUserId: 0, userKeybladeId: 0 });
  assert.strictEqual(started.startRaidData.raidId, raidId);
  const money = p.money || 0, luxBefore = p.lux;
  const cleared = call(t.raid().clear, { parts: [{ raidEnemyId: bossRow.raidEnemyId, partsId: 1, hp: 0, damage: 1000 }], getPoint: { exp: 0, money: 5, lux: 7 }, burst: 1000 });
  assert.strictEqual(cleared.raidTimeStatus, 3);
  assert.strictEqual(cleared.getLux, 7);
  assert.strictEqual(p.money, money + 5);
  assert.strictEqual(p.lux, luxBefore + 7);
  assert.strictEqual(cleared.userData.stageResumption.resumptionStatus, 0);
  const shown = call(t.raid().reward);
  assert.strictEqual(shown.raidRewards.length, 1);
  assert.strictEqual(shown.userData.userPoint.raidSpherePoint, coins + 360, 'Victory, MVP and All Points, 120 each, through grantItem');
  assert.strictEqual(call(t.raid().member, { raidId }).cooperators[0].damage, 1000);
  assert.strictEqual(call(t.raid().reward).userData.userPoint.raidSpherePoint, coins + 360, 'once');
  Object.assign(bossRow, original);
  fs.readFileSync = readFile;
  Date.now = realDateNow;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}
try { wiring(); console.log('ok wiring'); } catch (e) { failed++; console.error(`FAIL wiring: ${e.stack}`); }

if (failed) { console.error(`test-raid-routes: ${failed} FAIL`); process.exit(1); }
console.log('test-raid-routes: OK');
process.exit(0);
