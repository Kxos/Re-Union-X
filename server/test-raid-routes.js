// Raid routes against a stub server (fields by name and order: docs/notes/raid.md), then the wiring of server.js on a
// fixture index. Dates: 2026-10-27 is a Tuesday, 10:00 UTC = 03:00 PDT, outside the bonus hours.
//   node server/test-raid-routes.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const routesRaid = require('./routes-raid');
const { RAID_IMG_VERSION } = routesRaid;
const { isBonusTime, questApAt } = routesRaid;
const { coinRows } = require('./raid-rewards');
const evCampaign = require('./make-ev-campaign');

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
    evCampaign: [{ campaignId: 101, type: 7, power: 5000 }, ...evCampaign.raidAp0Rows([{ stageId: STAGE }])],
  };
  w.index = opts.index || { entries: [{ key: 'WW-1/Beginner', censusId: 'WW-1', available: true, stageId: STAGE, evStageId: 8001, enemyId: ENEMY, modelId: 7, tier: 'Beginner',
    upMinutes: 20, useAp: 10, questAp: [0, 5, 90], start: '2019-10-07', end: '2019-10-13', level: 25 }], models: { '0007': { fight: true, start: true, escape: true, put_down: true } } };
  w.raid = routesRaid({
    player: w.player, savePlayer: () => { w.saves++; }, masterRows: (t) => w.tables[t] || [], raidIndex: () => w.index, storyWeek: () => w.week, smokeKey: () => w.smoke, ap0Force: () => w.ap0,
    realNow: () => w.now, serverTime: () => fmt(w.now), serverTimeAt: fmt,
    userPointData: (now) => ({ now, ap: w.ap, lux: w.lux }), userDetailData: () => ({ detail: 1 }),
    stageResumptionData: () => ({ resumptionStatus: 0, stageId: 0, raidId: 0, colosseumStageId: 0 }),
    inventoryBlocks: () => ({ userSkills: [{ userSkillId: 1 }], userMedals: [{ userMedalId: 9 }], userMaterials: [], userKeyblades: [{ userKeybladeId: 1 }], userAvatarParts: [],
      userTitles: (w.player.titles || []).map((titleId, i) => ({ userTitleId: i + 1, titleId })) }),
    inventorySnapshot: () => null, send: (res, code, body) => { w.sentCode = code; w.sent = body; }, ret: () => ({ ok: 1 }), clock: { weekEnd: (ms) => ms + 1000, monthIndex: (ms) => { const d = new Date(ms - 8 * 3600e3); return d.getUTCFullYear() * 12 + d.getUTCMonth(); } },
    apNow: () => w.ap, changeAp: (d) => { w.ap += d; }, raidUser: () => USER, supportUsers: (id) => (id ? [{ supportUserId: id }] : []),
    guiltLists: () => ({ guiltBurstFirstUserMedalIds: [], guiltBurstMaxUserMedalIds: [] }),
    battlePoints: (getPoint, burst, factor = 1) => { const lux = (Number(getPoint?.lux) || 0) * factor; w.lux += lux; w.burst = burst; w.luxFactor = factor; return lux; }, beginBattle: (k) => { w.keyblade = k; },
    onDefeat: (boss) => { w.defeats = (w.defeats || 0) + 1; w.defeated = boss.raidId; },
    grantItem: (it) => { if (w.grantHook) w.grantHook(); w.grants.push(it); if (it.type === 7) w.player.titles = [...new Set([...w.player.titles, it.id])]; }, addPresent: (it) => w.presents.push(it),
    medalCount: () => w.medalCount, medalCap: () => w.medalCap,
    stageState: (id) => (w.stageStates && w.stageStates[id]) || ({ score: 0, playStatus: 0, clearMissionIds: [] }), webBase: 'http://x', rng: opts.rng || (() => 0.99), log: (m) => w.logs.push(m),
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
  clear_lux_doubles_in_bonus_time() {
    const w = world();
    w.spawn(); w.start();
    assert.strictEqual(w.clearParts([500, 100, 200]).getLux, 50, 'outside the bonus hours: as reported');
    assert.strictEqual(w.luxFactor, 1);
    w.now = Date.parse('2026-10-27T09:30:00Z'); // 02:30 PDT, a bonus hour
    assert(isBonusTime(w.now));
    w.start();
    assert.strictEqual(w.clearParts([400, 100, 200]).getLux, 100, 'bonus time: Lux x 2');
    assert.strictEqual(w.luxFactor, 2);
    assert.strictEqual(w.lux, 150);
  },
  defeat_counts_once_for_missions() {
    const w = world();
    const boss = w.spawn(); w.start();
    w.clearParts([500, 100, 200]);
    assert.strictEqual(w.defeats, undefined, 'a fight the boss survives is no defeat');
    w.start();
    assert.strictEqual(w.clearParts([0, 100, 200]).raidTimeStatus, 3);
    assert.strictEqual(w.defeats, 1);
    assert.strictEqual(w.defeated, boss.raidId);
    w.call('clear', { parts: boss.parts.map((x) => ({ raidEnemyId: x.raidEnemyId, partsId: x.partsId, hp: 0, damage: 1 })), getPoint: { lux: 5 } });
    assert.strictEqual(w.defeats, 1, 'a repeated clear counts nothing');
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
    assert.strictEqual(w.player.raid?.points || 0, 0, 'a story quest adds nothing when raids.json has no story block');
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
  bonus_level_step() {
    // weeks 2018-09-17..2019-08-11: a win in bonus time raises the boss 2 levels (notices #44500..#55884, «every day during
    // the event»; removed by #56463 of 2019-08-12); else 1
    const run = (start, now) => {
      const w = world();
      Object.assign(w.index.entries[0], { start, end: start, questAp: [0, 5, 90] });
      w.week = { shopFrom: start, shopTo: start }; // a raid of the week: a quest of another week feeds the catalogue counter
      w.now = now;
      w.spawn(); w.start(); w.clearParts([0, 100, 200]);
      return w.player.raid.levels['WW-1/Beginner'];
    };
    const BONUS = Date.parse('2026-10-27T15:00:00Z'), PLAIN = Date.parse('2026-10-27T10:00:00Z'); // 08:00 / 03:00 PDT
    assert.strictEqual(run('2019-03-04', BONUS), 3, 'bonus time in the +2 era');
    assert.strictEqual(run('2019-03-04', PLAIN), 2, 'outside bonus time');
    assert.strictEqual(run('2019-07-15', BONUS), 3, 'notice #55360 (2019-07-15) still has it');
    assert.strictEqual(run('2019-08-05', BONUS), 3, 'last week before the static stats');
    assert.strictEqual(run('2019-08-12', BONUS), 2, 'from 2019-08-12: +1');
    assert.strictEqual(run('2018-09-10', BONUS), 2, 'before 2018-09-17: +1');
    assert.strictEqual(run('2017-03-20', BONUS), 2, 'event raids of 2016-2018: +1');
  },
  rare_boss_spawn() {
    // an entry with a rare boss (raidSetting rareBossId): rareUpType 3 reads as one chance in rareUpTypeArg per spawn; the
    // rare body, its timer and its AP; the stage is the same, so the client fights rareBossId through parts[0].rare 2
    const RARE = ENEMY + 100;
    const run = (rngValue) => {
      const w = world({ rng: () => rngValue });
      w.tables.raidEnemy.push(enemyRow(RARE, 1, 5000, { rare: 2, validParts: 1, parts: [RARE + 1, 0, 0, 0, 0], rewardId: rewardId(coin.victory), mvpRewardId: rewardId(coin.mvp), destroyAllRewardId: rewardId(coin.all) }),
        enemyRow(RARE + 1, 2, 300));
      Object.assign(w.index.entries[0], { upMinutes: 10, useAp: 10, rare: { boss: 'Queen Bee Ω', modelId: 16, enemyId: RARE, upMinutes: 20, useAp: 1, every: 5 } });
      w.index.models['0016'] = w.index.models['0007'];
      return w;
    };
    const b = run(0.99).spawn();
    assert.deepStrictEqual([b.parts[0].raidEnemyId, b.parts[0].rare, b.endsAt - TUE, b.useAp], [ENEMY, 1, 10 * 60000, 10], 'chance 1 in 5 missed');
    const rare = run(0.1);
    const r = rare.spawn();
    assert.deepStrictEqual([r.parts[0].raidEnemyId, r.parts[0].rare, r.parts.length, r.endsAt - TUE, r.useAp, r.stageId], [RARE, 2, 2, 20 * 60000, 1, STAGE]);
    rare.start();
    rare.clearParts([1, 300]);
    assert.strictEqual(rare.player.raid.boss.useAp, 1);
    assert.strictEqual(rare.call('list').selfRaid.raid.useAp, 1, 'the rare AP after the first attempt');
  },
  ap0_campaign_every_quest() {
    // review I-2: in a bonus hour the AP 0 campaign goes out only when every listed raid quest costs 0 at that moment; an event
    // quest of 1 AP beside one of 0 would otherwise show 0 and be charged 1
    const BONUS = Date.parse('2026-10-27T15:00:00Z');
    const w = world();
    const ev = (key, ap, stageId) => ({ key, censusId: key, available: true, stageId, evStageId: 8002, enemyId: ENEMY, modelId: 7, tier: 'single', upMinutes: 10, useAp: 10,
      questAp: [ap], start: '2016-11-21', end: '2016-11-28', level: 25, event: true, periods: [['2016-11-21', '2016-11-27']] });
    w.index.entries = [ev('WW-E1-1', 0, STAGE), ev('WW-E2-1', 1, STAGE + 1)];
    w.tables.evCampaign = evCampaign.raidAp0Rows([{ stageId: STAGE }, { stageId: STAGE + 1 }]);
    w.week = { shopFrom: '2016-11-24', shopTo: '2016-11-30' };
    assert.deepStrictEqual([w.raid.stageAp(STAGE, BONUS), w.raid.stageAp(STAGE + 1, BONUS)], [0, 1]);
    assert.deepStrictEqual(w.raid.campaignIds(BONUS), [], 'one quest costs 1: no campaign');
    w.index.entries[1].questAp = [0];
    assert.notDeepStrictEqual(w.raid.campaignIds(BONUS), [], 'both cost 0: the campaign');
  },
  weekend_quest_after_midnight_counts_live() {
    // review M-2: a weekend quest cleared just after Sunday 23:59 PT spawns on the live counter, not on the Catalog's
    const w = world();
    Object.assign(w.index.entries[0], { event: true, open: 'weekend', start: '2016-11-05', end: '2016-11-07', periods: [['2016-11-05', '2016-11-06']], questAp: [1] });
    w.week = { shopFrom: '2016-11-03', shopTo: '2016-11-09' };
    w.now = Date.parse('2026-11-09T08:05:00Z'); // Monday 00:05 PST
    const boss = w.spawn();
    assert.strictEqual(boss.levelKey, undefined, 'live level key');
    w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 2);
  },
  level_drop_paid() {
    // review I-3: a level drop (entry.levelDrops, its raidReward row: every slot paid) at the level the boss is defeated, to the
    // Present Box; not at another level
    const DROP = ENEMY * 100 + 40;
    const run = (level) => {
      const w = world();
      w.tables.raidReward.push({ raidRewardId: DROP, oddsUpPerLv: 0, pointUpPerLv: 0, validReward: 2, type: [3, 3, 0, 0], id: [90056, 90066, 0, 0], num: [1, 1, 0, 0], odds: [100000, 100000, 0, 0],
        assignSkillType: [1, 1, 1, 1], assignSkillId: [0, 0, 0, 0], assignSkillLv: [1, 1, 1, 1], burstUpperNumber: [0, 0, 0, 0] });
      w.index.entries[0].levelDrops = [{ level: 2, rewardId: DROP }];
      w.player.raid = { levels: { 'WW-1/Beginner': level }, levelsMonth: w.raid.monthOf(w.now), levelOcc: { 'WW-1/Beginner': '2019-10-07' } };
      w.spawn(); w.start(); w.clearParts([0, 100, 200]);
      return w.presents.map((p) => p.id);
    };
    assert.deepStrictEqual(run(2), [90056, 90066]);
    assert.deepStrictEqual(run(3), []);
  },
  daily_level_resets_daily() {
    // daily raids (notice 29805: «The raid boss's level will reset every day (PT)»): one occurrence per Pacific day
    const w = world();
    Object.assign(w.index.entries[0], { open: 'daily', start: '2019-10-07' });
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.spawn().level, 2, 'same day');
    w.start(); w.clearParts([0, 100, 200]);
    w.now += 24 * 3600e3;
    assert.strictEqual(w.spawn().level, 1, 'next Pacific day');
  },
  level_reset_on_month_change() {
    const w = world();
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 2);
    w.now = Date.parse('2026-11-01T09:00:00Z'); // 02:00 PDT of the 1st: next month
    assert.strictEqual(w.spawn().level, 1, 'reset to LV 1');
    assert.strictEqual(w.player.raid.levelsMonth, w.raid.monthOf(w.now));
  },
  level_kept_within_month() {
    const w = world();
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    w.now = Date.parse('2026-10-31T10:00:00Z');
    assert.strictEqual(w.spawn().level, 2, 'same month: kept');
  },
  level_live_boss_untouched() {
    const w = world();
    w.player.raid = { levels: { 'WW-1/Beginner': 4 }, levelsMonth: w.raid.monthOf(w.now), levelOcc: { 'WW-1/Beginner': '2019-10-07' } };
    w.now = Date.parse('2026-11-01T07:50:00Z'); w.player.raid.levelsMonth = w.raid.monthOf(w.now);
    const boss = w.spawn();
    assert.strictEqual(boss.level, 4);
    w.now = Date.parse('2026-11-01T08:05:00Z');
    const b = w.call('list');
    assert.strictEqual(w.player.raid.boss, boss, 'live boss kept');
    assert.strictEqual(boss.level, 4);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], undefined, 'levels cleared');
    w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], undefined, 'old-month boss does not feed the new month');
    assert.strictEqual(w.spawn().level, 1);
  },
  level_returning_week_restarts() {
    const w = world();
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 2);
    w.index.entries[0].start = '2019-12-02'; w.index.entries[0].end = '2019-12-08'; // same key, a later week
    assert.strictEqual(w.spawn().level, 1, 'comes back at LV 1');
  },
  level_cap() {
    const w = world();
    w.player.raid = { levels: { 'WW-1/Beginner': 99 }, levelsMonth: w.raid.monthOf(w.now), levelOcc: { 'WW-1/Beginner': '2019-10-07' } };
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
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2019-07-15', [0, 5, 90]), t)), [0, 5, 90], 'rule week');
    // I-236: Radiant Reward weeks «0 / 5» cost 5 all week outside bonus time (notice 58020), June 2020 «0» costs 0 all day
    // (notice 66114); the master useAp (the last census value) is what the quest top shows, so the charge must agree
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2019-09-23', [0, 5]), t)), [0, 5, 5], 'Radiant Reward week');
    assert.deepStrictEqual([BONUS, SAT, WEEK].map((t) => questApAt(e('2020-06-01', [0]), t)), [0, 0, 0], 'June 2020: 0 all day');
    // the served raids (when built): on a weekday outside bonus time the charge = the master stage useAp (last census value)
    const served = path.join(__dirname, 'game_data', 'raids.json');
    if (fs.existsSync(served)) {
      const bad = JSON.parse(fs.readFileSync(served, 'utf8')).entries.filter((x) => Array.isArray(x.questAp) && x.questAp.length)
        .filter((x) => questApAt(x, WEEK) !== x.questAp[x.questAp.length - 1]).map((x) => `${x.start} ${x.boss} ${x.questAp.join('/')}`);
      assert.deepStrictEqual(bad, [], 'weekday charge = master useAp on every served raid quest');
    }
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
    // explicit mtimes: two writes inside one mtime tick would read as no change (flaky run seen in review b597b99)
    fs.writeFileSync(file, '{"key": "WW-2/Beginner"}');
    fs.utimesSync(file, now / 1000 - 10, now / 1000 - 10);
    assert.strictEqual(reader(now), 'WW-2/Beginner', 'rewritten: fresh again');
    fs.writeFileSync(file, 'not json');
    fs.utimesSync(file, now / 1000 - 5, now / 1000 - 5);
    assert.strictEqual(reader(now), null, 'corrupt: nothing');
    fs.rmSync(dir, { recursive: true, force: true });
    // an unknown key is logged once, not at every call
    const w = world();
    w.smoke = 'nothing/Beginner';
    w.call('list'); w.call('notice'); w.call('list');
    assert.strictEqual(w.logs.filter((m) => /not an available entry/.test(m)).length, 1);
  },
  ap0_rows() {
    // make-ev-campaign.js: type 7 power 0, stageType 2, 5 raid quest stages per row, the 18 fields in client order
    const rows = evCampaign.raidAp0Rows([{ stageId: 1010 }, ...[6, 1, 2, 3, 4, 5, 7, 1].map((n) => ({ stageId: 980000 + n })), { stageId: SPECIAL }]);
    assert.deepStrictEqual(rows.map((r) => [r.campaignId, r.validStageId, r.stageId]), [[98000, 5, [980001, 980002, 980003, 980004, 980005]], [98001, 2, [980006, 980007, 0, 0, 0]]]);
    assert.deepStrictEqual(keys(rows[0]), ['campaignId', 'type', 'power', 'displayText', 'stageType', 'validStageId', 'stageId', 'startTime', 'endTime',
      'weekMonday', 'weekTuesday', 'weekWednesday', 'weekThursday', 'weekFriday', 'weekSaturday', 'weekSunday', 'groupPattern', 'validMinute']);
    assert.deepStrictEqual([rows[0].type, rows[0].power, rows[0].stageType, rows[0].displayText], [7, 0, 2, 'Bonus Time: Raids cost 0 AP!']);
    assert.deepStrictEqual(evCampaign.raidAp0Ids([{ campaignId: 101, type: 7, power: 0 }, ...rows, { ...rows[0], campaignId: 98500, power: 5000 }]), [98000, 98001], 'own range, type 7 power 0 only');
    assert.deepStrictEqual(evCampaign.raidAp0Rows([]), []);
    // patch: own rows replaced, the others kept
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-evcampaign-'));
    fs.writeFileSync(path.join(dir, 'stage.json'), JSON.stringify([{ stageId: 980001 }]));
    fs.writeFileSync(path.join(dir, 'evCampaign.json'), JSON.stringify([{ campaignId: 101 }, { campaignId: 98003 }]));
    const log = console.log; console.log = () => {};
    try { evCampaign.patch(dir); evCampaign.patch(dir); } finally { console.log = log; }
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'evCampaign.json'), 'utf8')).map((r) => r.campaignId), [101, 98000], 'idempotent');
    fs.rmSync(dir, { recursive: true, force: true });
  },
  ap0_campaign_bonus_hours() {
    // original rule: 0 AP in the bonus hours, weekdays and weekends alike; the ids go out only then
    const w = world();
    const BONUS = Date.parse('2026-10-27T15:00:00Z'), SAT = Date.parse('2026-10-31T10:00:00Z'), SAT_BONUS = Date.parse('2026-10-31T15:00:00Z');
    assert.deepStrictEqual([TUE, BONUS, SAT, SAT_BONUS].map((t) => w.raid.campaignIds(t)), [[], [98000], [], [98000]]);
    assert.strictEqual(w.raid.stageAp(STAGE, BONUS), 0, 'the charge stays questApAt');
    // a week whose rule has no bonus value (5 / 90): no campaign in the bonus hours
    const old = world();
    Object.assign(old.index.entries[0], { start: '2019-03-04', end: '2019-03-10', questAp: [5, 90] });
    old.week = { shopFrom: '2019-03-04', shopTo: '2019-03-10' };
    assert.strictEqual(old.raid.stageAp(STAGE, BONUS), 90);
    assert.deepStrictEqual(old.raid.campaignIds(BONUS), []);
    // no raid in the week: none
    const none = world();
    none.week = { shopFrom: '2015-01-05', shopTo: '2015-01-11' };
    assert.deepStrictEqual(none.raid.campaignIds(BONUS), []);
    // a master without the rows: none
    const bare = world();
    bare.tables.evCampaign = [];
    assert.deepStrictEqual(bare.raid.campaignIds(BONUS), []);
  },
  ap0_campaign_start_and_force() {
    const w = world();
    w.spawn(); w.call('list');
    assert.deepStrictEqual(w.start().campaigns, [], '/raid/start outside the bonus hours');
    w.clearParts([500, 100, 0]);
    w.now = Date.parse('2026-10-27T15:00:00Z');
    w.player.raid.boss.endsAt = w.now + 3600e3;
    const b = w.call('start', { raidId: w.player.raid.boss.raidId, supportUserId: 0, userKeybladeId: 3 });
    assert.deepStrictEqual(b.campaigns, [98000], '/raid/start in the bonus hours');
    // bench switch: the ids at any hour, the charge unchanged
    const f = world();
    f.ap0 = true;
    assert.deepStrictEqual(f.raid.campaignIds(TUE), [98000]);
    assert.strictEqual(f.raid.stageAp(STAGE, TUE), 90);
    // the switch file: save/raid_ap0.json {"force": true}, fresh only (smokeReader with field «force»)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-raid-ap0-'));
    const file = path.join(dir, 'raid_ap0.json');
    const reader = routesRaid.smokeReader(file, () => {}, 'force');
    assert.strictEqual(reader(Date.now()), null, 'no file');
    fs.writeFileSync(file, '{"force": true}');
    assert.strictEqual(reader(Date.now()), true);
    fs.writeFileSync(file, '{"key": "WW-1/Beginner"}');
    fs.utimesSync(file, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    assert.strictEqual(reader(Date.now()), null, 'another field');
    fs.writeFileSync(file, '{"force": true}');
    const old = (Date.now() - routesRaid.SMOKE_MAX_AGE_MS - 60000) / 1000;
    fs.utimesSync(file, old, old);
    assert.strictEqual(reader(Date.now()), null, 'stale');
    fs.rmSync(dir, { recursive: true, force: true });
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
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [], 'a kept raid later than the Story is not served');
    w.week = { shopFrom: '2019-10-17', shopTo: '2019-10-23' };
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000001, 3000002], 'the kept raid keeps its boards');
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
    assert.strictEqual(ev[0].bannerUrl, `http://x/web/raid/img/v${RAID_IMG_VERSION}/8001.png`);
    assert.strictEqual(ev[0].endTime, fmt(TUE + 1000));
    assert.deepStrictEqual(ev[0].stages.map((s) => [s.stageId, s.useAp]), [[STAGE, 90], [STAGE + 1, 90]], 'only available tiers, AP of the moment');
    assert.deepStrictEqual(keys(ev[0].stages[0]), ['stageId', 'useAp', 'score', 'playStatus', 'clearMissionIds']);
    assert.strictEqual(ev[0].complete, 0, 'no objectives: no crown');
    const done = { score: 1, playStatus: 1, clearMissionIds: [1, 2, 3] };
    w.stageStates = { [STAGE]: done, [STAGE + 1]: { ...done, clearMissionIds: [1, 3] } };
    assert.strictEqual(w.raid.events(TUE)[0].complete, 0, 'one quest still missing an objective');
    w.stageStates[STAGE + 1] = done;
    assert.strictEqual(w.raid.events(TUE)[0].complete, 1, 'every quest with its 3 objectives: crown');
  },

  // ---- Raid Catalog (Task 9): one kept raid at a time, its own boss level, shared boards, coins every time ----
  catalog_keep_one() {
    const w = catWorld();
    const ids = () => w.raid.events(TUE).map((e) => e.eventStageId);
    assert.deepStrictEqual(ids(), [8000, 8001], 'the catalogue banner, then the week');
    const cat = w.raid.events(TUE)[0];
    assert.deepStrictEqual(keys(cat), ['stages', 'eventStageId', 'showIcon', 'bannerUrl', 'eventType', 'status', 'endTime', 'newStageId', 'isLock', 'complete']);
    assert.deepStrictEqual([cat.eventType, cat.isLock, cat.bannerUrl], [0, 0, `http://x/web/raid/img/v${RAID_IMG_VERSION}/8000.png`]);
    assert.deepStrictEqual(cat.stages.map((s) => [s.stageId, s.useAp]), [[970000, 0]], 'its quest: Training Grounds');
    assert.deepStrictEqual(w.raid.keep(8002), { code: 200, body: { ok: true } });
    assert.strictEqual(w.player.raid.kept, 'WW-0');
    assert(w.saves > 0);
    assert.deepStrictEqual(ids(), [8000, 8002, 8001], 'the kept raid beside the current one');
    const kept = w.raid.events(TUE)[1];
    assert.deepStrictEqual([kept.eventType, kept.bannerUrl], [2, `http://x/web/raid/img/v${RAID_IMG_VERSION}/8002-kept.png`]);
    assert.deepStrictEqual(kept.stages.map((s) => s.stageId), [STAGE + 5], 'only its available tiers');
    assert.deepStrictEqual(w.raid.keep(8003).code, 200);
    assert.deepStrictEqual(ids(), [8000, 8003, 8001], 'keeping another replaces it');
    assert.deepStrictEqual(w.raid.unkeep(), { code: 200, body: { ok: true } });
    assert.strictEqual(w.player.raid.kept, null);
    assert.deepStrictEqual(ids(), [8000, 8001]);
    // refused: the current week, a later one, one not restored, an unknown id; nothing changes
    w.raid.keep(8002);
    assert.deepStrictEqual(w.raid.keep(8001), { code: 409, body: { ok: false, why: 'now' } });
    assert.deepStrictEqual(w.raid.keep(8004), { code: 409, body: { ok: false, why: 'later' } });
    assert.deepStrictEqual(w.raid.keep(8005), { code: 409, body: { ok: false, why: 'removed' } });
    assert.deepStrictEqual(w.raid.keep(8999), { code: 404, body: { ok: false, why: 'unknown raid' } });
    assert.strictEqual(w.player.raid.kept, 'WW-0');
    // the pages' context: the week, the current rows, the kept one
    const c = w.raid.catalogCtx(TUE);
    assert.deepStrictEqual([c.shopFrom, c.shopTo, [...c.current], c.kept], ['2019-10-07', '2019-10-13', ['WW-1'], 'WW-0']);
    // no catalogue in the index: no banner
    const bare = world();
    assert.deepStrictEqual(bare.raid.events(TUE).map((e) => e.eventStageId), [8001]);
  },
  catalog_separate_levels() {
    // user 02-11: a kept raid's boss has its own level from LV 1; the live week's boss level never moves with it
    const w = catWorld();
    w.raid.keep(8002);
    const kept = w.spawnAt(STAGE + 5);
    assert.strictEqual(kept.level, 1);
    w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['cat:WW-0/Beginner'], 2, 'the catalogue counter');
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], undefined, 'the live week untouched');
    assert.strictEqual(w.spawn().level, 1, 'the live boss starts at its own level');
    w.start(); w.clearParts([0, 100, 200]);
    w.spawn(); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['WW-1/Beginner'], 3);
    assert.strictEqual(w.player.raid.levels['cat:WW-0/Beginner'], 2, 'the live boss never changes the catalogue level');
    assert.strictEqual(w.spawnAt(STAGE + 5).level, 2, 'the kept boss resumes its own level');
    w.start(); w.clearParts([0, 100, 200]);
    // the very week played live, kept once it is past: LV 1, not the live week's 3
    w.week = { shopFrom: '2019-10-14', shopTo: '2019-10-20' };
    w.index.entries.push({ ...w.index.entries[0], key: 'WW-2/Beginner', censusId: 'WW-2', evStageId: 8006, stageId: STAGE + 6, start: '2019-10-14', end: '2019-10-20' });
    w.tables.stage.push({ stageId: STAGE + 6, raidBoss: 30007 });
    assert.strictEqual(w.raid.keep(8001).code, 200, 'last week can be kept now');
    const again = w.spawnAt(STAGE);
    assert.strictEqual(again.level, 1, 'its own counter');
    w.start(); w.clearParts([0, 100, 200]);
    assert.deepStrictEqual([w.player.raid.levels['WW-1/Beginner'], w.player.raid.levels['cat:WW-1/Beginner']], [3, 2]);
    // the monthly reset clears both
    w.now = Date.parse('2026-11-01T09:00:00Z');
    assert.strictEqual(w.spawnAt(STAGE).level, 1);
    assert.deepStrictEqual(w.player.raid.levels, {});
  },
  catalog_key_without_kept() {
    // review b597b99: the kept raid removed or changed before the clear that spawns its boss: a past week's quest still feeds
    // the catalogue counter, never the plain entry key that the live week of that entry used
    const w = catWorld();
    w.player.raid = { levels: { 'WW-0/Beginner': 7 }, levelOcc: { 'WW-0/Beginner': '2019-09-30' }, levelsMonth: w.raid.monthOf(w.now) };
    w.raid.keep(8002); w.raid.unkeep();
    const boss = w.spawnAt(STAGE + 5);
    assert.strictEqual(boss.levelKey, 'cat:WW-0/Beginner');
    assert.strictEqual(boss.level, 1, 'not the live level 7');
    w.start(); w.clearParts([0, 100, 200]);
    assert.deepStrictEqual([w.player.raid.levels['WW-0/Beginner'], w.player.raid.levels['cat:WW-0/Beginner']], [7, 2]);
    w.raid.keep(8003);
    assert.strictEqual(w.spawnAt(STAGE + 5).levelKey, 'cat:WW-0/Beginner', 'another raid kept: still the catalogue key');
    // a quest of the week keeps the plain key
    w.player.raid.boss = null;
    assert.strictEqual(w.spawn().levelKey, undefined);
  },
  catalog_old_kept_shapes() {
    // review b597b99: older saves may hold kept as {key, censusId} or an entry key: converted to the census id, else cleared
    const cases = [[{ key: 'WW-0/Beginner', censusId: 'WW-0' }, 'WW-0'], [{ key: 'WW-0/Beginner' }, 'WW-0'], ['WW-0/Beginner', 'WW-0'], [{ key: 'gone' }, null], [{}, null], ['WW-0', 'WW-0']];
    for (const [old, want] of cases) {
      const w = catWorld();
      w.player.raid = { kept: old };
      w.raid.events(TUE);
      assert.strictEqual(w.player.raid.kept, want, JSON.stringify(old));
    }
  },
  catalog_off_today_is_not_later() {
    // review b597b99: a row of the Shop week that is not listed now (Task 10 weekend / daily rows) is no «later» row
    const w = catWorld();
    w.index.entries.push({ ...w.index.entries[0], key: 'WW-D/Beginner', censusId: 'WW-D', evStageId: 8007, stageId: STAGE + 11, start: '2019-10-12', end: '2019-10-12', sphereBoardIds: [] });
    const c = w.raid.catalogCtx(TUE);
    c.current.delete('WW-D'); // as a Weekend-only row on a Tuesday
    const row = require('./raid-calendar').catalogRows(w.index).find((r) => r.censusId === 'WW-D');
    assert.strictEqual(require('./raid-calendar').rowState(row, c), 'other');
  },
  catalog_boards_shared() {
    // boards belong to the census row: the kept raid hands out the very ids it had live, so a cell is bought once
    const w = catWorld();
    w.week = { shopFrom: '2019-09-30', shopTo: '2019-10-06' };
    const live = w.raid.boardIds(TUE).active;
    assert.deepStrictEqual(live, [3000005]);
    w.week = { shopFrom: '2019-10-07', shopTo: '2019-10-13' };
    w.raid.keep(8002);
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000001, 3000005], 'the same ids beside the current ones');
    w.raid.unkeep();
    assert.deepStrictEqual(w.raid.boardIds(TUE).active, [3000001]);
  },
  catalog_coins_repeat() {
    const w = catWorld();
    w.raid.keep(8002);
    for (let i = 0; i < 2; i++) {
      w.spawnAt(STAGE + 5); w.start(); w.clearParts([0, 0, 0]);
      assert.strictEqual(w.call('reward').raidRewards.length, 1, `kill ${i + 1} pays`);
    }
    assert.strictEqual(w.grants.length, 6, 'Victory, MVP and All Points coins, both times');
  },
  catalog_week_rules() {
    // a kept raid follows its own week's rules (entry.start): AP of 2019-03 (5 / 90), +2 levels in bonus time, AP 0 campaign
    const w = catWorld();
    Object.assign(w.index.entries[1], { start: '2019-03-04', end: '2019-03-10', questAp: [0, 5, 90] });
    w.raid.keep(8002);
    const BONUS = Date.parse('2026-10-27T15:00:00Z');
    assert.strictEqual(w.raid.stageAp(STAGE + 5, BONUS), 0, 'bonus 0 by its own rule');
    assert.strictEqual(w.raid.stageAp(STAGE + 5, TUE), 90);
    w.now = BONUS;
    w.spawnAt(STAGE + 5); w.start(); w.clearParts([0, 100, 200]);
    assert.strictEqual(w.player.raid.levels['cat:WW-0/Beginner'], 3, '+2 in bonus time for a 2019-03 week');
    // only the kept raid has 0 AP in the bonus hours: no campaign, since the week's quest still costs 90 (review I-2, .every)
    Object.assign(w.index.entries[0], { questAp: [5, 90], start: '2019-03-11', end: '2019-03-17' });
    w.week = { shopFrom: '2019-03-11', shopTo: '2019-03-17' };
    assert.deepStrictEqual(w.raid.campaignIds(BONUS), []);
    Object.assign(w.index.entries[0], { questAp: [0, 5, 90] });
    assert.deepStrictEqual(w.raid.campaignIds(BONUS), [98000], 'both 0 in bonus time: the campaign');
    Object.assign(w.index.entries[0], { questAp: [5, 90] });
    w.raid.unkeep();
    assert.deepStrictEqual(w.raid.campaignIds(BONUS), [], 'without it, none');
  },
};

// The fixture world plus the Raid Catalog: WW-0 a past week (8002, stage +5, boards 3000005), WW-00 another past one (8003),
// WW-L a later one (8004), WW-X not restored (8005); the catalogue banner 8000 with Training Grounds.
function catWorld() {
  const w = world();
  const base = w.index.entries[0];
  base.sphereBoardIds = [3000001];
  w.index.catalog = { evStageId: 8000, stageIds: [970000], useAp: [0] };
  w.index.entries.push({ ...base, key: 'WW-0/Beginner', censusId: 'WW-0', evStageId: 8002, stageId: STAGE + 5, start: '2019-09-30', end: '2019-10-06', sphereBoardIds: [3000005] },
    { ...base, key: 'WW-0/Epic', censusId: 'WW-0', evStageId: 8002, stageId: STAGE + 7, tier: 'Epic', start: '2019-09-30', end: '2019-10-06', available: false, why: 'graphics', sphereBoardIds: [3000005] },
    { ...base, key: 'WW-00/Beginner', censusId: 'WW-00', evStageId: 8003, stageId: STAGE + 8, start: '2019-09-23', end: '2019-09-29', sphereBoardIds: [] },
    { ...base, key: 'WW-L/Beginner', censusId: 'WW-L', evStageId: 8004, stageId: STAGE + 9, start: '2019-10-21', end: '2019-10-27', sphereBoardIds: [] },
    { ...base, key: 'WW-X/Beginner', censusId: 'WW-X', evStageId: 8005, stageId: STAGE + 10, start: '2019-09-16', end: '2019-09-22', available: false, why: 'graphics', sphereBoardIds: [] });
  w.tables.stage.push({ stageId: STAGE + 5, raidBoss: 30006 }, { stageId: STAGE + 8, raidBoss: 30009 });
  w.spawnAt = (stageId) => { w.raid.onStageClear(stageId, { raidPoint: 9000 }); assert(w.player.raid.boss, `boss spawned from ${stageId}`); return w.player.raid.boss; };
  return w;
}

// ---- Story raid bosses (Task 11): raids.json `story` of make-raid.js on the stub server ----
// Story rows: quest 4 (Behemoth), 24 (target raid: Trickmaster), 30 (Behemoth, its boss not served), 2 (tutorial), 826 (past the last
// range), a Proud copy of quest 4 and a Special quest. Behemoth fights on stage 980050, Trickmaster on 980060.
const STORY_B = 2000500, STORY_T = 2000600, STORY_BR = 2000700, STAGE_B = 980050, STAGE_T = 980060;
const Q = { 2: 1016, 4: 1019, 24: 10024, 30: 10030, 230: 10230, 826: 40826 };
function storyWorld(opts = {}) {
  const w = world(opts);
  const story = (boss, enemyId, stageId, extra = {}) => ({ key: `story/${boss}`, story: true, boss, modelId: boss === 'Behemoth' ? 3 : 7, available: true, why: null, tier: 'story', start: null,
    settingId: 30050, enemyId, upMinutes: 10, useAp: 10, rare: null, stageId, stages: { 2: stageId }, reconstructed: [], ...extra });
  const victoryItem = { raidRewardId: STORY_B * 100 + 11, oddsUpPerLv: 0, pointUpPerLv: 0, validReward: 1, type: [3, 0, 0, 0], id: [90023, 0, 0, 0], assignSkillType: [1, 1, 1, 1],
    assignSkillId: [0, 0, 0, 0], assignSkillLv: [1, 1, 1, 1], burstUpperNumber: [0, 0, 0, 0], num: [1, 0, 0, 0], odds: [100000, 0, 0, 0] };
  const mvpItem = { ...victoryItem, raidRewardId: STORY_B * 100 + 21, type: [5, 0, 0, 0], id: [3, 0, 0, 0] };
  const allItem = { ...victoryItem, raidRewardId: STORY_B * 100 + 31 };
  w.tables.raidReward.push(victoryItem, mvpItem, allItem);
  const ids = (r) => [r.raidRewardId, r.raidRewardId, 0, 0, 0];
  w.tables.raidEnemy.push(enemyRow(STORY_B, 1, 8000, { validParts: 1, parts: [STORY_B + 1, 0, 0, 0, 0], rewardId: ids(victoryItem), mvpRewardId: ids(mvpItem), destroyAllRewardId: ids(allItem) }),
    enemyRow(STORY_B + 1, 2, 900),
    enemyRow(STORY_T, 1, 12000, { validParts: 0, rewardId: ids(victoryItem), mvpRewardId: ids(mvpItem), destroyAllRewardId: ids(allItem) }),
    enemyRow(STORY_BR, 1, 36000, { rare: 2, validParts: 0, rewardId: ids(victoryItem), mvpRewardId: ids(mvpItem), destroyAllRewardId: ids(allItem) }));
  w.tables.stage.push({ stageId: STAGE_B, raidBoss: 30050, stageKind: 2, id: STAGE_B }, { stageId: STAGE_T, raidBoss: 30060, stageKind: 2, id: STAGE_T },
    ...Object.entries(Q).map(([q, stageId]) => ({ stageId, id: Number(q), stageKind: 1, worldId: 2 })), { stageId: 1000004, id: 4, stageKind: 4, worldId: 2 },
    { stageId: SPECIAL, id: SPECIAL, stageKind: 2, worldId: 1 }, { stageId: 18300, id: 555, stageKind: 1, worldId: 2, branchType: 1 });
  w.index.models = { ...w.index.models, '0003': w.index.models['0007'], '0004': w.index.models['0007'] };
  w.index.story = {
    last: 825, tableLast: 555,
    bosses: [story('Behemoth', STORY_B, STAGE_B, { rare: { boss: 'Behemoth Ω', modelId: 4, enemyId: STORY_BR, upMinutes: 20, useAp: 10 } }), story('Trickmaster', STORY_T, STAGE_T, { settingId: 30060 }),
      { key: 'story/Enraged Arachnid', story: true, boss: 'Enraged Arachnid', available: false, why: 'graphics', stages: {} }],
    quests: { 4: { boss: 'Behemoth', stageId: STAGE_B, every: 10000, reconstructed: [] }, 24: { boss: 'Trickmaster', stageId: STAGE_T, every: 10000, reconstructed: ['storyConflict'],
      fixed: { boss: 'Trickmaster', rare: false, name: 'Trickmaster', stageId: STAGE_T } }, 30: { boss: 'Enraged Arachnid', stageId: 0, every: null, reconstructed: [] },
    230: { boss: 'Behemoth', stageId: STAGE_B, every: 10000, reconstructed: [], fixed: { boss: 'Behemoth', rare: true, name: 'Behemoth Ω', stageId: STAGE_B } },
    555: { boss: 'Behemoth', stageId: STAGE_B, every: 10000, reconstructed: [] } },
    conflicts: [], unknown: [],
  };
  w.storyClear = (q, raidPoint = 9000) => w.raid.onStageClear(Q[q] ?? q, { raidPoint });
  return w;
}
Object.assign(tests, {
  story_spawn_from_points() {
    const w = storyWorld();
    w.storyClear(4, 3000); w.storyClear(4, 3000);
    assert.strictEqual(w.player.raid.boss, null, '6000 < 8600');
    assert.strictEqual(w.player.raid.points, 6000);
    w.storyClear(4, 3000);
    const b = w.player.raid.boss;
    assert(b, 'the third clear spawns');
    assert.deepStrictEqual([b.key, b.stageId, b.parts[0].raidEnemyId, b.parts.length, b.useAp, b.endsAt - TUE, b.level], ['story/Behemoth', STAGE_B, STORY_B, 2, 10, 10 * 60000, 1]);
    assert.strictEqual(w.player.raid.points, 0, 'the counter restarts');
    // the event raid's quest and a story quest feed one counter (plan decision 3)
    const v = storyWorld();
    v.raid.onStageClear(STAGE, { raidPoint: 3000 });
    v.storyClear(4, 6000);
    assert.strictEqual(v.player.raid.boss.key, 'story/Behemoth');
  },
  replays_count() {
    // the route reads only the cleared stage id and its master row (no first-clear check): the same quest cleared again counts again
    const w = storyWorld();
    w.storyClear(4, 5000);
    assert.strictEqual(w.player.raid.points, 5000);
    w.storyClear(4, 5000);
    assert(w.player.raid.boss, 'the same quest cleared a second time reaches the threshold');
    for (const [id, what] of [[1000004, 'Proud'], [SPECIAL, 'Special'], [9999, 'unknown stage']]) {
      const v = storyWorld();
      v.raid.onStageClear(id, { raidPoint: 9000 });
      assert.strictEqual(v.player.raid?.points || 0, 0, `${what} adds nothing`);
      assert.strictEqual(v.player.raid?.boss || null, null);
    }
    // the variant of Q555 (branchType 1, 18300 + union - 1) is quest 555
    const u = storyWorld();
    u.raid.onStageClear(18302, { raidPoint: 9000 });
    assert.strictEqual(u.player.raid.boss.key, 'story/Behemoth');
  },
  tutorial_no_spawn() {
    const w = storyWorld();
    for (let i = 0; i < 5; i++) w.storyClear(2, 9000);
    assert.strictEqual(w.player.raid?.boss || null, null);
    assert.strictEqual(w.player.raid?.points || 0, 0, 'tutorial quests do not count');
  },
  story_stops_at_825() {
    const w = storyWorld();
    for (let i = 0; i < 5; i++) w.storyClear(826, 9000);
    assert.strictEqual(w.player.raid?.boss || null, null, 'quest 826: no spawn whatever the counter');
    assert.strictEqual(w.player.raid?.points || 0, 0);
    // a counter already full from earlier quests still spawns nothing at 826
    w.storyClear(4, 8000);
    w.storyClear(826, 9000);
    assert.strictEqual(w.player.raid.boss, null);
    assert.strictEqual(w.player.raid.points, 8000);
  },
  fixed_quest_always() {
    const w = storyWorld();
    w.storyClear(24, 0);
    const b = w.player.raid.boss;
    assert(b, 'a target raid quest spawns at its clear, with no points');
    assert.deepStrictEqual([b.key, b.stageId, b.parts[0].raidEnemyId], ['story/Trickmaster', STAGE_T, STORY_T]);
    assert.strictEqual(w.player.raid.points, 0, 'the counter is untouched');
    // Ω target: the rare body itself
    const o = storyWorld();
    o.storyClear(230, 100);
    assert.deepStrictEqual([o.player.raid.boss.parts[0].raidEnemyId, o.player.raid.boss.parts[0].rare, o.player.raid.boss.endsAt - TUE], [STORY_BR, 2, 20 * 60000]);
    assert.strictEqual(o.player.raid.points, 100, 'the clear\'s points still count');
    // a boss alive blocks the target raid too
    const z = storyWorld();
    z.storyClear(4, 9000);
    const first = z.player.raid.boss;
    z.storyClear(24, 0);
    assert.strictEqual(z.player.raid.boss, first, 'no second boss');
  },
  story_omega_roll() {
    const w = storyWorld({ rng: () => 0.00005 }); // below 1 / 10000
    w.storyClear(4, 9000);
    assert.strictEqual(w.player.raid.boss.parts[0].raidEnemyId, STORY_BR, 'the Ω with a chance of 1 in every');
    const v = storyWorld({ rng: () => 0.5 });
    v.storyClear(4, 9000);
    assert.strictEqual(v.player.raid.boss.parts[0].raidEnemyId, STORY_B);
  },
  unavailable_story_boss_held() {
    const w = storyWorld();
    w.storyClear(30, 9000);
    assert.strictEqual(w.player.raid.boss, null, 'the range\'s boss is not served: no spawn');
    assert.strictEqual(w.player.raid.points, 9000, 'the counter is held');
    w.storyClear(4, 100);
    assert(w.player.raid.boss, 'the next quest with a served boss spawns at once');
    assert.strictEqual(w.player.raid.points, 0);
  },
  story_pays_items_route() {
    const w = storyWorld();
    w.storyClear(4, 9000);
    w.call('list'); w.start();
    assert.strictEqual(w.clearParts([0, 0]).raidTimeStatus, 3);
    assert.strictEqual(w.player.raid.levels['story/Behemoth'], 2, '+1 level per defeat');
    const shown = w.call('reward');
    assert.strictEqual(shown.raidRewards.length, 1);
    const paid = w.grants.map((g) => [g.type, g.id]);
    assert.deepStrictEqual(paid.filter(([t]) => t === 16), [], 'no Raid Coins');
    assert.ok(paid.some(([t, id]) => t === 3 && id === 90023) && paid.some(([t, id]) => t === 5 && id === 3), `medal and material: ${JSON.stringify(paid)}`);
    // the next Behemoth starts at LV 2
    w.storyClear(4, 9000);
    assert.strictEqual(w.player.raid.boss.level, 2);
  },
  smoke_story_key() {
    // review I-1: the bench key story/<boss> forces the boss itself, story/<boss>+rare its Ω
    const w = storyWorld({ rng: () => 0.99 });
    w.smoke = 'story/Behemoth';
    w.call('notice');
    assert.deepStrictEqual([w.player.raid.boss.key, w.player.raid.boss.parts[0].raidEnemyId, w.player.raid.boss.stageId], ['story/Behemoth', STORY_B, STAGE_B], 'not the Ω');
    const o = storyWorld({ rng: () => 0.99 });
    o.smoke = 'story/Behemoth+rare';
    o.call('notice');
    assert.deepStrictEqual([o.player.raid.boss.parts[0].raidEnemyId, o.player.raid.boss.parts[0].rare], [STORY_BR, 2]);
  },
  weekly_and_story_block_each_other() {
    // plan decision 7 across families: a live weekly boss blocks a story spawn, and a live story boss a weekly one
    const w = storyWorld();
    const weekly = w.spawn();
    w.storyClear(4, 9000);
    assert.strictEqual(w.player.raid.boss, weekly, 'the weekly boss stays, no story boss');
    assert.strictEqual(w.player.raid.points, 9000, 'the counter is kept');
    const v = storyWorld();
    v.storyClear(4, 9000);
    const story = v.player.raid.boss;
    v.raid.onStageClear(STAGE, { raidPoint: 9000 });
    assert.strictEqual(v.player.raid.boss, story, 'the story boss stays, no weekly boss');
    assert.strictEqual(v.player.raid.points, 9000);
  },
  story_bonus_level_step() {
    // a story boss has no week (occ null): +1 per defeat even in a bonus hour (the +2 rule is of the 2018-09..2019-08 raid weeks)
    const w = storyWorld();
    w.now = Date.parse('2026-10-27T15:00:00Z'); // 08:00 PDT, bonus
    w.storyClear(4, 9000);
    w.call('list'); w.start();
    w.clearParts([0, 0]);
    assert.strictEqual(w.player.raid.levels['story/Behemoth'], 2);
  },
  story_boss_orphan_dropped() {
    const w = storyWorld();
    w.storyClear(4, 9000);
    w.tables.stage = w.tables.stage.filter((s) => s.stageId !== STAGE_B);
    assert.strictEqual(w.call('notice').raidNotice.isSelfRaid, 0, 'its fight stage is gone: dropped, as any boss');
  },
});

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
  process.env.KHUX_RAID_NOTICES = path.join(dir, 'raid_notices.json');
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
  assert.strictEqual(ev[0].bannerUrl, `${t.WEB_BASE}/web/raid/img/v${RAID_IMG_VERSION}/8999.png`);
  assert.strictEqual(ev[0].stages[0].useAp, 90);

  p.ap = 200; p.apTime = TUE;
  const before = t.userPointData(t.serverTime()).ap;
  call(t.respondStageStart, { stageId: FAKE, userKeybladeId: 0 });
  assert.strictEqual(t.userPointData(t.serverTime()).ap, before - 90, '/stage/start charges the AP of the moment, not the master row');
  call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0, raidPoint: 3000 } });
  assert.strictEqual(p.raid.points, 3000, '/stage/clear adds the points');
  // raid AP 0 campaign: none outside the bonus hours; the bench file save/raid_ap0.json lists the master's rows
  {
    assert.deepStrictEqual(call(t.respondStageStart, { stageId: 1010, userKeybladeId: 0 }).campaigns, [], 'outside the bonus hours');
    call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0 } });
    const readFile = fs.readFileSync;
    fs.readFileSync = (f, ...a) => (String(f).endsWith('evCampaign.json') ? JSON.stringify(evCampaign.raidAp0Rows([{ stageId: FAKE }])) : readFile(f, ...a));
    fs.writeFileSync(path.join(dir, 'raid_ap0.json'), '{"force": true}');
    try {
      const ids = t.raid().campaignIds();
      assert(ids.length >= 1 && ids.every((id) => id >= evCampaign.RAID_AP0_BASE && id <= evCampaign.RAID_AP0_MAX), `forced: ${ids}`);
      assert.deepStrictEqual(call(t.respondStageStart, { stageId: 1010, userKeybladeId: 0 }).campaigns, ids, '/stage/start lists them');
      call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0 } });
    } finally { fs.readFileSync = readFile; fs.rmSync(path.join(dir, 'raid_ap0.json')); }
    assert.deepStrictEqual(t.raid().campaignIds(), [], 'file gone');
  }
  call(t.respondStageStart, { stageId: 1010, userKeybladeId: 0 });
  call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [], getPoint: { lux: 0, raidPoint: 3000 } });
  assert.strictEqual(p.raid.points, 3000, 'a story quest adds nothing when raids.json has no story block');

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
  assert.strictEqual(web('/web/raid/img/v1/8999.png').body.toString(), 'own', 'versioned URL');
  assert.strictEqual(web('/web/raid/img/x.png').code, 404);
  // Raid Catalog (Task 9): the kept card falls back to the week's own card; the pages; the keep routes
  assert.strictEqual(web('/web/raid/img/v1/8999-kept.png').body.toString(), 'own', 'no -kept file: the card itself');
  fs.writeFileSync(path.join(process.env.KHUX_RAID_IMG, '8999-kept.png'), 'kept');
  assert.strictEqual(web('/web/raid/img/v1/8999-kept.png').body.toString(), 'kept');
  // original notice of a raid (Details of its banner): no file -> friendly page, 200; with the file -> the notice
  {
    const none = web('/web/raid/notice/8999');
    assert.strictEqual(none.code, 200, 'no raid_notices.json: never a crash');
    assert(/not available/i.test(none.body.toString()));
    fs.writeFileSync(process.env.KHUX_RAID_NOTICES, JSON.stringify({ rows: { K: { noticeId: 5, how: 'census id', confidence: 'high' } },
      notices: { 5: { title: 'A <Raid>', date: '2019-10-07', time: '07:00', category: 'EVENT', body: ['Line'] } } }));
    const one = web('/web/raid/notice/8999?from=raid');
    assert.strictEqual(one.code, 200);
    assert(one.body.toString().includes('A &lt;Raid&gt;') && one.body.toString().includes('class="back"'), 'notice page');
    assert(/not available/i.test(web('/web/raid/notice/12').body.toString()), 'unknown id');
    fs.writeFileSync(process.env.KHUX_RAID_NOTICES, '{broken');
    assert.strictEqual(web('/web/raid/notice/8999').code, 200, 'broken file: friendly page');
  }
  assert.strictEqual(t.route('/web/raid/catalog'), 'raidweb');
  {
    const cat = web('/web/raid/catalog?session=1');
    assert.strictEqual(cat.code, 200);
    assert(/<title>Raid Catalog<\/title>/.test(cat.body.toString()) && cat.body.toString().includes('id="q8999"'), 'catalogue page');
    assert(/In Events this week/.test(cat.body.toString()), 'the fixture row is the current week');
    // PROGRESS filter (user 03-11): the row is completed once its quest has its objectives done in the save (clearMissions)
    const doneAttr = () => (/id="q8999"[^>]*data-done="([01])"/.exec(web('/web/raid/catalog').body.toString()) || [])[1];
    const keepCm = p.clearMissions[FAKE];
    p.clearMissions[FAKE] = [1, 2];
    assert.strictEqual(doneAttr(), '0', 'one objective missing: incomplete');
    p.clearMissions[FAKE] = [1, 2, 3];
    assert.strictEqual(doneAttr(), '1', 'all objectives: completed');
    if (keepCm === undefined) delete p.clearMissions[FAKE]; else p.clearMissions[FAKE] = keepCm;
    const det = web('/web/raid/raid/8999?from=catalog');
    assert.strictEqual(det.code, 200);
    assert(det.body.toString().includes('class="back" href="/web/raid/catalog#q8999"'));
    assert.strictEqual(web('/web/raid/raid/1').code, 404);
    const post = (url) => { const o = { code: 0, body: null }; quiet(() => t.respondRaidPost({ writeHead(c) { o.code = c; }, end(x) { o.body = JSON.parse(x.toString('utf8')); } }, url)); return o; };
    assert.deepStrictEqual(post('/web/raid/keep/8999'), { code: 409, body: { ok: false, why: 'now' } });
    assert.deepStrictEqual(post('/web/raid/unkeep'), { code: 200, body: { ok: true } });
    assert.strictEqual(post('/web/raid/nothing').code, 404);
  }

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
  // raid_missions_count: the counts of every mission row before the defeat (conditions 3 and 6 must rise by 1)
  const missionRows = t.masterRows('mission');
  const countBefore = new Map(missionRows.map((r) => [r.id, p.missions?.[r.id]?.count || 0]));
  const cleared = call(t.raid().clear, { parts: [{ raidEnemyId: bossRow.raidEnemyId, partsId: 1, hp: 0, damage: 1000 }], getPoint: { exp: 0, money: 5, lux: 7 }, burst: 1000 });
  assert.strictEqual(cleared.raidTimeStatus, 3);
  assert.strictEqual(cleared.getLux, 7);
  // the defeat feeds the 'raid' mission counter: Daily 2007, Beginner 1023/1024 and the active Weekly party series
  {
    const rows = t.masterRows('mission').filter((r) => t.MISSION_COUNTER[r.conditionId] === 'raid');
    assert(rows.some((r) => r.id === 2007) && rows.some((r) => r.id === 1023), 'raid mission rows in the master');
    const counted = rows.filter((r) => (p.missions?.[r.id]?.count || 0) === 1).map((r) => r.id);
    assert(counted.includes(2007) && counted.includes(1023) && counted.includes(1024), `counted: ${counted}`);
    assert(counted.some((id) => id >= 3001 && id <= 3013), `a Weekly series counts: ${counted}`);
  }
  // raid_missions_count (Task 12): one defeat raises condition 3 (Daily, Beginner) and condition 6 (Weekly) by exactly 1,
  // and no other condition moves
  try {
    const rose = (r) => (p.missions?.[r.id]?.count || 0) - countBefore.get(r.id);
    for (const cond of [3, 6]) {
      const rows = missionRows.filter((r) => r.conditionId === cond);
      assert(rows.length, `condition ${cond} rows in the master`);
      assert(rows.some((r) => rose(r) === 1), `condition ${cond} rose: ${rows.map((r) => `${r.id}+${rose(r)}`)}`);
      assert(rows.every((r) => rose(r) === 0 || rose(r) === 1), `condition ${cond} at most +1: ${rows.map((r) => `${r.id}+${rose(r)}`)}`);
    }
    const others = missionRows.filter((r) => ![3, 6].includes(r.conditionId) && t.MISSION_COUNTER[r.conditionId] !== 'lux' && rose(r) !== 0);
    assert.deepStrictEqual(others.map((r) => r.id), [], 'only the raid conditions (and Lux, from the fight) move');
    console.log('ok raid_missions_count');
  } catch (e) { failed++; console.error(`FAIL raid_missions_count: ${e.message}`); }
  assert.strictEqual(p.money, money + 5);
  assert.strictEqual(p.lux, luxBefore + 7);
  assert.strictEqual(cleared.userData.stageResumption.resumptionStatus, 0);
  const shown = call(t.raid().reward);
  assert.strictEqual(shown.raidRewards.length, 1);
  assert.strictEqual(shown.userData.userPoint.raidSpherePoint, coins + 360, 'Victory, MVP and All Points, 120 each, through grantItem');
  assert.strictEqual(call(t.raid().member, { raidId }).cooperators[0].damage, 1000);
  assert.strictEqual(call(t.raid().reward).userData.userPoint.raidSpherePoint, coins + 360, 'once');
  // raid_missions_count, VIP part: every raid and Lux Weekly mission done still leaves VIP unearned, because the
  // Union Cross Weekly rows (condition 12) cannot move yet; vip-benefit.js keeps its rule
  try {
    quiet(() => { t.missionCount('raid', 1000); t.missionCount('lux', 1e15); });
    const weekly = missionRows.filter((r) => r.missionType === 3);
    const done = (r) => (p.missions?.[r.id]?.count || 0) >= (r.targetNum?.[0] || 1);
    assert(weekly.filter((r) => t.MISSION_COUNTER[r.conditionId] === 'raid').some(done), 'a raid Weekly series is complete');
    assert(weekly.some((r) => r.conditionId === 12 && !done(r)), 'Union Cross Weekly rows still open');
    assert(!(p.vip && Number.isInteger(p.vip.earnedWeek)), `VIP unearned: ${JSON.stringify(p.vip)}`);
    console.log('ok raid_missions_count (VIP unearned until Union Cross)');
  } catch (e) { failed++; console.error(`FAIL raid_missions_count VIP: ${e.message}`); }
  Object.assign(bossRow, original);
  fs.readFileSync = readFile;
  Date.now = realDateNow;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}
try { wiring(); console.log('ok wiring'); } catch (e) { failed++; console.error(`FAIL wiring: ${e.stack}`); }

if (failed) { console.error(`test-raid-routes: ${failed} FAIL`); process.exit(1); }
console.log('test-raid-routes: OK');
process.exit(0);
