// Raid data generator: node server/test-make-raid.js
// Fixtures are built here; `real_census_week` reads the private sources when they exist and skips otherwise.
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const raidWindows = require('./raid-windows');
const mr = require('./make-raid');
const rr = require('./raid-rewards');
const rb = require('./raid-boards');

const W1 = 'WW-W-2019-10-07';
const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8'));
// board keys of the private board research (null when it is not readable)
const BOARDS_KEYS = () => {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(process.env.KHUX_RAID_SRC || mr.DEFAULT_SRC, 'raid_rewards', 'a_weekly', 'boards_weekly.json'), 'utf8'));
    return doc.boards.map((b) => b.id);
  } catch { return null; }
};
const tiers5 = ['Beginner', 'Intermediate', 'Advanced', 'Legendary', 'Epic'];
const stats = {
  def: { base: 1000, omega: 1100, epic: 50000 },
  periods: [{ from: '2016-04-07', atk: { single: 1000, Beginner: 100, Intermediate: 200, Advanced: 300, Legendary: 400, Epic: 500 } },
    { from: '2019-09-19', atk: { single: 2000, Beginner: 1100, Intermediate: 1200, Advanced: 1300, Legendary: 1400, Epic: 1500 } }],
};
const blankEnemy = { raidEnemyId: 100001, name: 'Darkside', raidDisplayId: 1, attribute: 2, rare: 1, weakness: 1, validParts: 2, parts: [1, 2], validGrowth: 4,
  baseLv: [1, 10, 30, 100], hp: [1, 2, 3, 4], attack: [1, 2, 3, 4], defense: [1, 2, 3, 4], rewardId: [1, 2, 3, 4], mvpRewardId: [1, 2, 3, 4], destroyAllRewardId: [1, 2, 3, 4],
  validLocked: 3, lockedLv: [1, 2, 3], lockedRewardId: [1, 2, 3], lockedMvpRewardId: [1, 2, 3], lockedDestroyAllRewardId: [1, 2, 3], attackWidth: 7, bufAttackUpright: 7,
  validSkill: 2, skillId: [101, 102], skillRequire: [2, 2], skillRequireArg: [0, 0], skillOdds: [1, 1], bgmRaid: 1, expAttack: [1, 1, 1, 1], luxAttack: [1, 1, 1, 1] };
const body2016 = (id, name, rare, partIds) => ({ raidEnemyId: id, name, attribute: 3, rare, weakness: 1, validParts: partIds.length, parts: [...partIds, 7497076, 1234567, 0].slice(0, 5),
  validGrowth: 4, baseLv: [1, 10, 30, 100, 0], hp: [12000, 36000, 180000, 900000, 0], attack: [12500, 15000, 25000, 80000, 0], defense: [1200, 1300, 1500, 2000, 0],
  expAttack: [48, 48, 48, 48, 0], luxAttack: [270, 1080, 6480, 38880, 0], rewardId: [70101, 70102, 70103, 70103, 0], mvpRewardId: [70201, 70202, 70203, 70203, 0],
  destroyAllRewardId: [70301, 70302, 70303, 70303, 0], drawHeight: 11200, validSkill: 2, skillId: [id * 100 + 1, id * 100 + 2, 70303, 70303], skillRequire: [2, 2, 70303, 70303],
  skillRequireArg: [0, 0, 70303, 70303], skillOdds: [10000, 5000, 70303, 70303], bgmRaid: 501001050 });
const part2016 = (id, weakness) => ({ raidEnemyId: id, name: 'str_rdb_dummy', attribute: 3, rare: 1, weakness, validParts: 0, parts: [1601336435, 1600283762, 1835890020, 121, 0],
  validGrowth: 4, baseLv: [1, 10, 30, 100, 0], hp: [7200, 24300, 121500, 607500, 0], attack: [0, 0, 0, 0, 0], defense: [120, 450, 750, 1350, 0], expAttack: [16, 16, 16, 16, 0], luxAttack: [90, 360, 2160, 12960, 0],
  rewardId: [0, 0, 0, 0, 0], mvpRewardId: [0, 0, 0, 0, 0], destroyAllRewardId: [0, 0, 0, 0, 0], validSkill: 0, skillId: [0, 0, 0, 0], skillRequire: [0, 0, 0, 0], skillRequireArg: [0, 0, 0, 0], skillOdds: [0, 0, 0, 0], bgmRaid: 1 });
const attack2016 = (id) => ({ raidEnemyAttackId: id, name: 'Attack', hitCount: 1, power: 10000, target: 1 });
const week = (start, end, tier, boss, map, extra = {}) => ({ start, end, tier, gem_drop: false, boss, map, ap: '0 / 5 / 90', quest_lv: String({ single: 25, Beginner: 25, Intermediate: 75, Advanced: 125, Legendary: 175, Epic: 225 }[tier]), ...extra });
const quest = (lvl) => ({ tier: 'x', info: { lvl: String(lvl), target: 'Eggcognito', naobj1: 'Defeat all enemies within 1 turn', naobjbonus1: 'Raid Coin', naobjbonus1qty: '5',
  naobj2: 'Complete without having to continue', naobjbonus2: 'Raid Coin', naobjbonus2qty: '5', naobj3: 'Complete within 00\'30"00', naobjbonus3: 'Raid Coin', naobjbonus3qty: '5' } });
const censusRow = (id, start, end, bosses, tier, extra = {}) => ({ id, family: 'weekly', region: 'WW', start, end, bosses, tier, map: 'x', rewards: 'Enhancement Boards', ...extra });
const era = (tier, hp, from, to) => ({ tier, hp, from, to });

function fixture() {
  return {
    census: { rows: [censusRow('S-1', null, null, [], 'quests'), censusRow(W1, '2019-10-07', '2019-10-13', ['Trickmaster', 'Blue Trident Tail'], 'Beginner; Advanced')],
      bosses: [{ ww: 'Trickmaster', raid_model_id: 7 }, { ww: 'Blue Trident Tail', raid_model_id: 1003 }, { ww: 'Gear Golem', raid_model_id: 21 }] },
    values: {
      weeks: [week('2019-10-07', '2019-10-13', 'Beginner', 'Trickmaster', 'Curious Room'), week('2019-10-07', '2019-10-13', 'Advanced', 'Blue Trident Tail', 'Morning Dew Grove: Clearing')],
      week_tier_hp: [],
      week_boards: [{ start: '2019-10-07', boards: ['Enhancement Boards'] }],
      quests: Object.assign({ 'Raid Time!': quest(25) }, ...tiers5.flatMap((t, i) => [{ [`(${t}) Raid Time!`]: quest(25 + 50 * i) }, { [`(${t}) Gem Drop: Raid Time!`]: quest(125) }])),
      hp_tier_era: { rows: [era('Beginner', 150000000, '2020-02-25', null), era('Intermediate', 150000000000, '2020-02-26', '2021-01-26'),
        era('Advanced', 54000000000, '2019-09-21', '2019-09-24'), era('Advanced', 42000000000, '2019-08-12', '2019-08-23'), era('Advanced', 70000000000, '2019-09-28', '2019-11-30'),
        era('Legendary', 700000000000, '2020-09-16', '2021-04-18'), era('Epic', 999999999999, '2020-12-14', '2021-04-25'),
        era('single, cap at LV 30+', 1200000000, '2018-10-07', '2018-12-14')] },
    },
    rewards: { correctionsMd: '- 5 Gear Golem rows dated 2020-02-22 are 2021-02-22 (wiki typo).' },
    orig2016: { raidEnemy: [body2016(7, 'Trickmaster', 1, [70002, 70003]), part2016(70002, 2), part2016(70003, 3), body2016(1003, 'Blue Trident Tail', 2, [10030002]), part2016(10030002, 2)],
      raidEnemyAttack: [attack2016(701), attack2016(702), attack2016(100301), attack2016(100302)] },
    master: { raidEnemy: [blankEnemy], raidSetting: [], raidReward: [], raidEnemyAttack: [{ raidEnemyAttackId: 101, name: 'A', hitCount: 1, heal: 0, bufAttackUpright: 0 }],
      stage: [{ stageId: 13030, id: 378, stageKind: 1, worldId: 3, mapName: 'Curious Room', raidBoss: 6010, name: 'x', useAp: 21, validBeforeDrama: 1, beforeDramaId: [1], beforeDramaType: [0], validAfterDrama: 0, afterDramaId: [], afterDramaType: [], bgmField: 9 },
        { stageId: 33180, id: 833, stageKind: 1, worldId: 3, mapName: 'Morning Dew Grove: Clearing', raidBoss: 3010, name: 'y', useAp: 0 },
        { stageId: 22000, id: 500, stageKind: 1, worldId: 7, mapName: 'Castle Courtyard', raidBoss: 0, name: 'z', useAp: 5 },
        { stageId: 1010, id: 1, stageKind: 1, worldId: 1, mapName: 'Fountain Square', raidBoss: 0, name: 'p', useAp: 0 }],
      evStage: [], enemy: [{ enemyId: 100, name: 'Eggcognito', raidPoint: [3000, 3000, 3000, 3000, 3000] }],
      world: [{ worldId: 1, raidBackground: 'bg_DB1' }, { worldId: 3, raidBackground: 'bg_WL1' }, { worldId: 7, raidBackground: 'bg_CD1' }] },
    models: { '0007': { fight: true, start: true, escape: true, put_down: true }, 1003: { fight: true, start: true, escape: true, put_down: true }, '0021': { fight: true, start: true, escape: true, put_down: true } },
    config: { onlyCensusIds: [W1], stats, weeklyUpMinutes: 20, useAp: 10, brokenBackgrounds: ['bg_CD1', 'bg_ED1'], backgroundFallbackWorld: 1, tierQuestLv: { single: 25, Beginner: 25, Intermediate: 75, Advanced: 125, Legendary: 175, Epic: 225 },
      singleEra: { knots: [1, 10, 20, 30, 99], hpShare: [0.015, 0.2, 0.4, 1, 1], atkShare: [0.15, 0.25, 0.5, 1, 1] }, modelTemplates: {}, mapWorlds: {}, eventHp: REAL_CONFIG.eventHp, reconstructedWhy: REAL_CONFIG.reconstructedWhy },
  };
}
const build = (mutate) => { const f = fixture(); if (mutate) mutate(f); return mr.buildRaid(f); };
// The local master_data as make-game-tables.js serves it: server/tables copied over it (petParts), campaign medals added
function asServed(master) {
  master.petParts = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'petParts.json'), 'utf8'));
  require('./make-campaign-medals').addCampaignMedals(master.medal);
  return master;
}

// Inputs of make-raid.js from the private sources and the local master_data (null when the sources are missing), with
// every model complete and the shipped raid_config.json: the real build once raid_models.json covers every boss.
let realMemo;
function realInputs() {
  if (realMemo !== undefined) return realMemo;
  realMemo = null;
  const src = process.env.KHUX_RAID_SRC || mr.DEFAULT_SRC;
  let sources;
  try { sources = mr.readSources(src, process.env.KHUX_RAID_2016 || mr.DEFAULT_2016); } catch (e) { console.log(`  (skipped: private sources not readable, ${e.code || e.message})`); return null; }
  const master = fixture().master;
  const dir = path.join(__dirname, 'master_data');
  if (fs.existsSync(path.join(dir, 'stage.json'))) {
    for (const n of ['stage', 'world', 'enemy', 'raidEnemy', 'raidEnemyAttack', 'medal', 'material', 'petParts', 'avatarParts', 'title']) master[n] = JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
    asServed(master);
    master.stage = master.stage.filter((r) => !(r.stageId >= 980000 && r.stageId <= 989999));
    master.evStage = []; master.raidSetting = []; master.raidReward = [];
    master.raidEnemy = master.raidEnemy.filter((r) => r.raidEnemyId < 2000000);
  }
  const all = { fight: true, start: true, escape: true, put_down: true };
  const models = new Proxy({}, { get: () => all });
  const config = { ...REAL_CONFIG, stats: JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_stats.json'), 'utf8')) };
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_ids.json'), 'utf8'));
  realMemo = { ...sources, master, models, config, ids };
  return realMemo;
}

// Raid Boards fixture: the shape of raid_rewards/a_weekly/boards_weekly.json and the master item tables
const cell = (n, cost, kind, reward, qty = 1) => ({ n, cost, kind, reward, qty });
const BOARD_MASTER = {
  medal: [{ medalId: 90026, rare: 6, name: 'Huey', groupId: 0 }, { medalId: 90036, rare: 6, name: 'Louie', groupId: 0 }, { medalId: 300948, rare: 5, name: 'Magic Broom', groupId: 0 },
    { medalId: 90146, rare: 6, name: 'Huey & Dewey & Louie', groupId: 0 }, { medalId: 90156, rare: 6, name: 'Magic Mirror', groupId: 0 }, { medalId: 90056, rare: 6, name: 'Chip', groupId: 0 },
    { medalId: 301388, rare: 6, name: 'Huey, Dewey & Louie', groupId: 0 }, { medalId: 2301388, rare: 6, name: 'Huey, Dewey & Louie', groupId: 301388 }],
  material: [{ materialId: 51, name: 'Sun Gem' }],
  petParts: [{ petPartsId: 407034, name: 'Halloween Crow: Wings' }, { petPartsId: 402066, name: 'Jessie Hat' }],
  avatarParts: [{ avatarPartsId: 201234, name: 'Starlight Bow', partsType: 7, gender: 1 }, { avatarPartsId: 201235, name: 'Starlight Bow', partsType: 7, gender: 2 }],
  title: [{ titleId: 12215, title: 'Shining' }],
};
const BOARDS = {
  boards: [
    { id: 'enhancement-A1', name: 'Enhancement Board', cells: [cell(2, 200, 'Medal', '6★ Louie'), cell(1, 100, 'Medal', '6★ Huey'), cell(3, 300, 'Material', 'Sun Gem', 2)], completion_reward: { value: '5★ Magic Broom' }, title: null },
    { id: 'enhancement-A2', name: 'Enhancement Board', cells: [cell(1, 100, 'Medal', '6★ Magic Mirror')], completion_reward: { value: '6★ Magic Mirror' }, title: null },
    { id: 'radiant-01', name: 'Radiant Rewards Board', cells: [cell(1, 300, 'Jewel', 'Jewels', 100), cell(2, 700, 'Avatar', 'Starlight Bow (Male)'), cell(3, 700, 'Avatar', 'Starlight Bow (Female)'),
      cell(4, 400, 'Pet', 'Jessie: Hat'), cell(5, 500, 'Ticket', 'Draw Ticket')], completion_reward: { value: null }, title: { value: 'Shining' } },
    { id: 'halloween-board-2019', name: 'Halloween Board', cells: [...Array.from({ length: 16 }, (_, i) => cell(i + 1, 300, 'Medal', '6★ Huey & Dewey & Louie')), cell(17, 700, 'Pet', 'Halloween Crow: Wings')],
      completion_reward: { value: '6★ Huey & Dewey & Louie' }, title: null },
  ],
  weeks: [
    { census_id: W1, family: 'weekly', boards: [{ board: 'enhancement-A1', confidence: 'wiki' }, { board: 'enhancement-A2', confidence: 'wiki' }] },
    { census_id: 'WW-W-2019-10-14', family: 'weekly', boards: [{ board: 'enhancement-A1', confidence: 'wiki' }, { board: 'enhancement-A2', confidence: 'wiki (inferred layout)' }] },
    { census_id: 'WW-W-2019-10-28', family: 'weekly', boards: [{ board: 'halloween-board-2019', confidence: 'wiki' }] },
    { census_id: 'WW-W-2018-09-03', family: 'radiant reward', boards: [{ board: 'radiant-01', confidence: 'wiki' }] },
    { census_id: 'WW-E1-1', family: 'weekly (pre-series raid event)', boards: [{ board: 'enhancement-A1', confidence: 'wiki' }] },
  ],
};
const HALLOWEEN_FIX = '## Boards\n- Halloween Board 2019, cell 17: wiki 700, total and cost ladder need 1,600 (inferred).\n';
const withBoards = (f, more = []) => {
  f.boards = JSON.parse(JSON.stringify(BOARDS));
  Object.assign(f.master, JSON.parse(JSON.stringify(BOARD_MASTER)));
  f.rewards.correctionsMd += '\n' + HALLOWEEN_FIX;
  for (const [id, start, end] of more) {
    f.census.rows.push(censusRow(id, start, end, ['Trickmaster'], 'Beginner'));
    f.values.weeks.push(week(start, end, 'Beginner', 'Trickmaster', 'Curious Room'));
  }
  f.config.onlyCensusIds = [W1, ...more.map((m) => m[0])];
};
// node sequence from START along the path pieces of a sphereArray row
function walkOrder(row) {
  const g = [row.spCol0, row.spCol1, row.spCol2, row.spCol3, row.spCol4];
  const OPEN = { 1001: 'UD', 1002: 'LR', 1003: 'UL', 1004: 'UR', 1005: 'DL', 1006: 'DR' };
  const DV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }, OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };
  let at = null;
  g.forEach((line, r) => line.forEach((v, c) => { if (v === 1000) at = [r, c]; }));
  assert.ok(at, 'START');
  assert.strictEqual((at[0] + at[1]) % 2, 0, 'START on an even cell');
  const order = [], seen = new Set([at.join()]);
  for (;;) {
    const next = Object.entries(DV).map(([d, [dr, dc]]) => [d, at[0] + dr, at[1] + dc]).find(([d, r, c]) => {
      const v = g[r]?.[c];
      return v && !seen.has(`${r},${c}`) && OPEN[v] && OPEN[v].includes(OPP[d]);
    });
    if (!next) break;
    let [d, r, c] = next;
    for (;;) { // follow the pieces to the next node
      seen.add(`${r},${c}`);
      const v = g[r][c];
      if (!OPEN[v]) break;
      const out = OPEN[v].replace(OPP[d], '');
      d = out; r += DV[out][0]; c += DV[out][1];
    }
    const v = g[r][c];
    assert.ok(v >= 1 && v <= 22, `piece leads to node, not ${v}`);
    assert.strictEqual((r + c) % 2, 0, `node ${v} on an even cell`);
    order.push(v); at = [r, c];
  }
  // nothing else on the grid
  const cells = g.flat().filter((v) => v);
  assert.strictEqual(cells.length, 2 * order.length + 1, 'only the path is drawn');
  return order;
}
const entry = (out, boss) => out.index.entries.find((e) => e.boss === boss);
const enemyOf = (out, id) => out.enemyRows.find((r) => r.raidEnemyId === id);
// one extra week in the fixture: census row plus its tier row
const addWeek = (f, id, start, end, tier, boss = 'Trickmaster', map = 'Curious Room') => {
  f.census.rows.push(censusRow(id, start, end, [boss], tier));
  f.values.weeks.push(week(start, end, tier, boss, map));
  f.config.onlyCensusIds = [id];
};

// Older WW event raids (Task 10): a census row of an event family, its quest in the event reward research
// (raid_rewards/b_events/event_raid_rewards.json shape) and, when it has one, its 2016 raidSetting row.
const objective = (objective, reward, qty) => ({ objective, reward, qty: String(qty) });
const eventQuest = (raid, lvl, ap = '10', objectives = [objective('Use 3 or more special attacks', 'Event Coin', 10),
  objective('Complete without having to continue', 'Jewel', 10), objective('Defeat all enemies within 1 turn', 'Raid Coin', 5)]) => ({ page: `${raid} (Quest)`, ap, lvl: String(lvl), raid, objectives });
const reward2016 = (id, num) => ({ raidRewardId: id, oddsUpPerLv: 50, pointUpPerLv: 1000, validReward: 3, type: [15, 15, 15, -1892354936], id: [0, 0, 0, -1892354936], assignSkillType: [1, 1, 1, 1],
  assignSkillId: [0, 0, 0, 0], assignSkillLv: [1, 1, 1, 1], num: [num, num + 2, num + 5, -1892354936], odds: [100000, 5000, 3333, -1892354936] });
const setting2016 = (raidSettingId, bossId, rareBossId, bossUpTime, useAp, rareBossUpTime, rareUseAp, rareUpTypeArg = 1) => ({ raidSettingId, bossId, bossUpTime, useAp, rareBossId, rareBossUpTime, rareUseAp,
  rareUpType: 3, rareUpTypeArg, rareUpTriggerBossId: bossId, validUnlockRare: 0, unlockRareBossId: [0, 0, 0], unlockRareNum: [0, 0, 0] });
function eventFixture(rows, quests = {}, more = null) {
  return (f) => {
    f.census.rows.push(...rows);
    f.census.bosses.push({ ww: 'Queen Bee', raid_model_id: 15 }, { ww: 'Queen Bee Ω', raid_model_id: 16 }, { ww: 'Gummi Hound', raid_model_id: 1010 }, { ww: 'Jewel Princess', raid_model_id: 20 });
    f.eventRewards = { rows: rows.map((r) => ({ row_id: r.id, region: 'WW', family: r.family, boards: [], quests: quests[r.id] || [eventQuest(r.bosses[0], 25)] })) };
    f.orig2016.raidEnemy.push(body2016(15, 'Queen Bee', 1, [150002]), part2016(150002, 2), body2016(16, 'Queen Bee Ω', 2, [160002]), part2016(160002, 2),
      body2016(1010, 'Gummi Hound', 2, [10100002]), part2016(10100002, 2));
    for (const id of [15, 16, 1010]) f.orig2016.raidEnemyAttack.push(attack2016(id * 100 + 1), attack2016(id * 100 + 2));
    f.orig2016.raidSetting = [setting2016(15000, 15, 16, 10, 10, 20, 10, 5), setting2016(160903000, 1010, 1010, 10, 1, 180, 1)];
    f.orig2016.raidReward = [7, 15, 16, 1010].flatMap((id) => [1, 2, 3].flatMap((t) => [1, 2, 3].map((k) => reward2016(id * 10000 + t * 100 + k, 10 * t + k))));
    for (const b of f.orig2016.raidEnemy.filter((x) => x.weakness === 1)) {
      b.rewardId = [1, 2, 3, 3, 0].map((k) => (k ? b.raidEnemyId * 10000 + 100 + k : 0));
      b.mvpRewardId = [1, 2, 3, 3, 0].map((k) => (k ? b.raidEnemyId * 10000 + 200 + k : 0));
      b.destroyAllRewardId = [1, 2, 3, 3, 0].map((k) => (k ? b.raidEnemyId * 10000 + 300 + k : 0));
    }
    Object.assign(f.models, { '0015': f.models['0007'], '0016': f.models['0007'], 1010: f.models['0007'], '0020': f.models['0007'] });
    f.config.modelTemplates = { 'Jewel Princess': 1010 };
    f.config.weekendUpMinutes = REAL_CONFIG.weekendUpMinutes;
    f.config.eventUpMinutes = REAL_CONFIG.eventUpMinutes;
    f.config.onlyCensusIds = rows.map((r) => r.id);
    if (more) more(f);
  };
}
// Story raid bosses (Task 11): census story rows, the 2016 story settings and rows, story stage rows naming those settings.
// Quests 4-23 Behemoth, 24 Trickmaster (census; the 2016 table says Behemoth: a conflict), 25-34 Behemoth, 221-250 Trickmaster (230 is
// a target raid of Trickmaster Ω), 556-561 Behemoth (outside the 2016 table), 609-613 Trickmaster, 614-615 «???», 616-621 Behemoth,
// 622-825 Enraged Arachnid (model 5000 not served), then 826-979 no spawn; quest 835 a target raid past the last range.
const storyRow = (id, family, tier, bosses, extra = {}) => ({ id, family, region: 'WW+JP', start: null, end: family === 'story spawn' ? '2019-01-24' : null, bosses, tier, map: null, rewards: null, ...extra });
const storySetting = (id, bossId, rareBossId, arg, type = 3) => ({ ...setting2016(id, bossId, rareBossId, 10, 10, 20, 10, arg), rareUpType: type });
const ITEM_MEDAL = 90023, ITEM_MATERIAL = 3;
const storyReward = (id) => ({ raidRewardId: id, oddsUpPerLv: 50, pointUpPerLv: 0, validReward: 2, type: [3, 5, -1892354936, -1892354936], id: [ITEM_MEDAL, ITEM_MATERIAL, -1892354936, -1892354936],
  assignSkillType: [1, 1, 1, 1], assignSkillId: [0, 0, 0, 0], assignSkillLv: [1, 1, 1, 1], num: [1, 1, -1892354936, -1892354936], odds: [100000, 5000, -1892354936, -1892354936] });
function storyFixture(more = null) {
  return (f) => {
    f.census.rows.push(storyRow('S-001-003', 'tutorial / no spawn', 'quests 1-3', []), storyRow('S-004-023', 'story spawn', 'quests 4-23', ['Behemoth']),
      storyRow('S-024-024', 'story spawn', 'quests 24-24', ['Trickmaster']), storyRow('S-025-034', 'story spawn', 'quests 25-34', ['Behemoth', 'Behemoth Ω']),
      storyRow('S-221-250', 'story spawn', 'quests 221-250', ['Trickmaster', 'Trickmaster Ω']), storyRow('S-556-561', 'story spawn', 'quests 556-561', ['Behemoth']),
      storyRow('S-609-613', 'story spawn', 'quests 609-613', ['Trickmaster']), storyRow('S-614-615', 'story spawn', 'quests 614-615', []),
      storyRow('S-616-621', 'story spawn', 'quests 616-621', ['Behemoth']), storyRow('S-622-825', 'story spawn', 'quests 622-825', ['Enraged Arachnid']),
      storyRow('S-826-979', 'story: no spawn (rule from 2019-01-24)', 'quests 826-979', []), storyRow('S-T024', 'story target raid', 'quest 24', ['Trickmaster']),
      storyRow('S-T230', 'story target raid', 'quest 230', ['Trickmaster Ω']), storyRow('S-T835', 'story target raid', 'quest 835', ['Trickmaster']));
    f.census.story_conflicts = [[24, 'Quest 24: Escorting Alice Pt. 2', 'Escorting Alice Pt. 2', 'Trickmaster', 'Behemoth']];
    f.census.bosses.push({ ww: 'Behemoth', raid_model_id: 3 }, { ww: 'Behemoth Ω', raid_model_id: 4 }, { ww: 'Trickmaster Ω', raid_model_id: 8 }, { ww: 'Enraged Arachnid', raid_model_id: 5000 });
    f.orig2016.raidEnemy.push(body2016(3, 'Behemoth', 1, [30002]), part2016(30002, 2), body2016(4, 'Behemoth Ω', 2, [40002]), part2016(40002, 2),
      body2016(8, 'Trickmaster Ω', 2, [80002, 80003]), part2016(80002, 2), part2016(80003, 3), body2016(5000, 'Enraged Arachnid', 1, [50000002]), part2016(50000002, 2), body2016(12, 'Venomous Spider', 2, []));
    for (const id of [3, 4, 8, 5000]) f.orig2016.raidEnemyAttack.push(attack2016(id * 100 + 1), attack2016(id * 100 + 2));
    f.orig2016.raidSetting = [storySetting(2000, 3, 4, 10000), storySetting(2010, 3, 4, 2), storySetting(4000, 7, 8, 10000), storySetting(4010, 7, 8, 2, 2), storySetting(50000000, 5000, 12, 1, 1)];
    f.orig2016.raidReward = [3, 4, 7, 8, 5000].flatMap((id) => [1, 2, 3].flatMap((t) => [1, 2, 3].map((k) => storyReward(id * 10000 + t * 100 + k))));
    for (const b of f.orig2016.raidEnemy.filter((x) => x.weakness === 1 && [3, 4, 7, 8, 5000].includes(x.raidEnemyId))) {
      for (const [field, t] of [['rewardId', 1], ['mvpRewardId', 2], ['destroyAllRewardId', 3]]) b[field] = [1, 2, 3, 3, 0].map((k) => (k ? b.raidEnemyId * 10000 + t * 100 + k : 0));
    }
    // story rows: quest -> [world, raidBoss of the master row]
    const rows = { 4: [2, 2000], 5: [2, 2010], 24: [3, 2000], 25: [3, 2000], 230: [3, 4010], 231: [3, 4000], 232: [3, 4000], 556: [7, 5015], 613: [2, 5015], 614: [2, 5015], 615: [2, 5015],
      616: [2, 5015], 700: [4, 5015], 825: [4, 6000], 826: [4, 5015] };
    f.master.stage = f.master.stage.filter((s) => s.id !== 500);
    for (const [q, [worldId, raidBoss]] of Object.entries(rows)) f.master.stage.push({ stageId: 10000 + Number(q), id: Number(q), stageKind: 1, worldId, mapName: `Map ${q}`, raidBoss, name: `Q${q}`, useAp: 5 });
    f.master.stage.push({ stageId: 1000700, id: 700, stageKind: 4, worldId: 4, mapName: 'Map 700', raidBoss: 5015, name: 'P700', useAp: 5 });
    f.master.world.push({ worldId: 2, raidBackground: 'bg_DW1' }, { worldId: 4, raidBackground: 'bg_AG1' });
    f.master.medal = [{ medalId: ITEM_MEDAL, rare: 3, name: 'Huey', groupId: 0 }];
    f.master.material = [{ materialId: ITEM_MATERIAL, name: 'Mythril Stone' }];
    Object.assign(f.models, { '0003': f.models['0007'], '0004': f.models['0007'], '0008': f.models['0007'] });
    f.config.story = REAL_CONFIG.story;
    if (more) more(f);
  };
}
const storyOf = (out) => out.index.story;

const eventRow = (id, family, start, end, bosses, extra = {}) => ({ id, family, region: 'WW', start, end, bosses, tier: 'quest LV 25', map: 'Curious Room', rewards: '', data: { hp: 'no' }, note: '', ...extra });
const knotsOf = (r, k) => r[k].slice(0, r.validGrowth);

// Japan-only raids (I-232): census JP rows beside two WW event raids (their quest donors), the JP sources' shapes
const jpRow = (id, family, start, end, bosses, extra = {}) => ({ id, family, region: 'JP', start, end, bosses, tier: null, map: null, rewards: null, data: { hp: 'no' }, note: '', ...extra });
const JP_ROWS = () => [
  jpRow('JP-RAID-1', 'event', '2016-04-10', '2016-04-24', ['Queen Bee', 'Queen Bee Ω'], { data: { hp: 'yes (2016 row)' } }),
  jpRow('JP-SHR-1', 'super-hard weekend', '2016-08-12', '2016-08-14', ['Gummi Hound'], { data: { hp: 'yes: fixed 30,000,000 (JP wiki, all levels)' } }),
  jpRow('JP-SHR-2', 'super-hard weekend', '2018-05-12', '2018-05-12', ['Gummi Hound'], { data: { hp: 'yes: fixed 150,000,000 (JP wiki, all levels)' } }),
  jpRow('JP-D-2017-08-13', 'event', '2017-08-13', null, ['Trickmaster']),
  jpRow('JP-D-2018-09-03', 'weekly', '2018-09-03', '2018-09-09', ['Trickmaster']),
  jpRow('JP-TWIN-1', 'event', '2016-06-06', '2016-06-12', ['Queen Bee']),
  jpRow('JP-RAID-21', 'event', '2016-12-25', '2017-01-01', []),
  jpRow('JP-RAID-27', 'daily rotating', '2017-10-15', '2017-10-22', ['Trickmaster', 'Queen Bee']),
  jpRow('JP-FAMRAID-1', 'regular-boss lure week', '2016-11-06', '2016-11-13', ['Trickmaster']),
];
const jpFixture = (more = null) => eventFixture([
  eventRow('WW-E9-1', 'one-off event', '2016-06-06', '2016-06-13', ['Queen Bee', 'Queen Bee Ω'], { data: { hp: 'yes (2016 row)' } }),
  eventRow('WW-E8-1', 'weekend-only', '2016-08-06', '2016-08-08', ['Gummi Hound'])], {}, (f) => {
  const jp = JP_ROWS();
  f.census.rows.push(...jp);
  f.config.onlyCensusIds.push(...jp.map((r) => r.id));
  f.config.jpTimer = REAL_CONFIG.jpTimer;
  if (more) more(f);
});
const jpEntry = (out, key) => out.index.entries.find((e) => e.key === key);

const tests = {
  jp_rows_catalog_only() {
    const out = build(jpFixture());
    const jp = out.index.entries.filter((e) => e.jp);
    assert.deepStrictEqual(jp.map((e) => e.key), ['JP-RAID-1/single', 'JP-SHR-1/single', 'JP-SHR-2/single', 'JP-D-2017-08-13/single', 'JP-RAID-27/single@2017-10-21', 'JP-RAID-27/single@2017-10-22']);
    assert.ok(jp.every((e) => e.available && e.region === 'JP' && e.event && e.reconstructed.includes('jp') && e.reconstructed.includes('jpQuest')), JSON.stringify(jp.map((e) => [e.key, e.why])));
    // not served: the same weekly raid as WW, the same event as a WW row, a boss no source names, a lure week
    const why = Object.fromEntries(out.index.jp.skipped.map((s) => [s.censusId, s.why]));
    assert.deepStrictEqual(Object.keys(why).sort(), ['JP-D-2018-09-03', 'JP-FAMRAID-1', 'JP-RAID-21', 'JP-TWIN-1']);
    assert.match(why['JP-TWIN-1'], /WW-E9-1/);
    assert.match(why['JP-RAID-21'], /not named/);
    assert.deepStrictEqual([out.index.jp.rows, out.index.jp.available, out.index.jp.tiers], [5, 5, 6]);
    // numbered after every WW row (raid_ids.json append-only)
    assert.ok(Math.min(...jp.map((e) => out.ids.rows[e.censusId])) > Math.max(out.ids.rows['WW-E9-1'], out.ids.rows['WW-E8-1']));
  },
  jp_quest_reuses_ww_map() {
    const out = build(jpFixture());
    const qb = jpEntry(out, 'JP-RAID-1/single'), d = jpEntry(out, 'JP-D-2017-08-13/single');
    // the WW event raid of the same boss (Queen Bee), else the WW event raid nearest in date (Gummi Hound, 2016-08-06)
    assert.strictEqual(qb.questFrom, 'WW-E9-1/single');
    assert.strictEqual(d.questFrom, 'WW-E8-1/single');
    const donor = jpEntry(out, qb.questFrom), st = out.stageRows.find((s) => s.stageId === qb.stageId);
    assert.strictEqual(st.stageBinId, donor.stageId, 'the map file of the WW quest, no new map');
    assert.ok(!out.maps.some((m) => jp(m)), 'no map is generated for a JP stage');
    function jp(m) { return out.index.entries.some((e) => e.jp && e.stageId === m.stageId); }
    assert.deepStrictEqual([qb.level, qb.questAp, qb.map, qb.worldId], [donor.level, donor.questAp, donor.map, donor.worldId]);
    assert.strictEqual(st.submissionRewardType.every((t) => t === rr.CONFIG.coinType), true, 'the standard Raid Time! objectives');
    // one week from the start when the JP source gives no end
    assert.deepStrictEqual([d.end, d.periods], ['2017-08-19', [['2017-08-13', '2017-08-19']]]);
    assert.ok(d.reconstructed.includes('jpDates'));
  },
  jp_hp_sources() {
    const out = build(jpFixture());
    // the 2016 row as it stands, with its rare Ω (the 2016 setting pairs them)
    const qb = jpEntry(out, 'JP-RAID-1/single');
    assert.deepStrictEqual([qb.hpSource, qb.rare && qb.rare.boss], ['2016', 'Queen Bee Ω']);
    assert.ok(qb.reconstructed.includes('jp2016') && !qb.reconstructed.includes('eventHp'));
    // super-hard weekends: the JP wiki's fixed HP at every level (no 2016 floor), 12 h, 1 h from 2018-05-05, weekend only
    for (const [key, hp, up] of [['JP-SHR-1/single', 30000000, 720], ['JP-SHR-2/single', 150000000, 60]]) {
      const e = jpEntry(out, key), body = enemyOf(out, e.enemyId), part = enemyOf(out, e.enemyId + 1);
      assert.strictEqual(e.hpSource, 'jp', key);
      assert.ok(knotsOf(body, 'hp').every((h) => h === hp), `${key} ${knotsOf(body, 'hp')}`);
      assert.strictEqual(new Set(knotsOf(part, 'hp')).size, 1, 'parts fixed too');
      assert.deepStrictEqual([e.upMinutes, e.open], [up, 'weekend']);
      assert.ok(e.reconstructed.includes('jpTimer') && !e.reconstructed.includes('hpFloor') && !e.reconstructed.includes('eventHp'));
    }
    // daily rotating: one boss per day, the last days of the row
    const day = out.index.entries.filter((e) => e.censusId === 'JP-RAID-27');
    assert.deepStrictEqual(day.map((e) => [e.boss, e.open, e.day]), [['Trickmaster', 'day', '2017-10-21'], ['Queen Bee', 'day', '2017-10-22']]);
  },
  jp_hp_wiki_lines() {
    const md = ['### Adventurer', '| hp fixed: body 7,777,777; each part 77,777 | all | JP | 2016-10 | wikiwiki/raidboss_list.md | wiki |',
      '### Jewel Princess', '| hp body: 60,000 at LV 1; 550,181 LV 10; 1,094,827 LV 20; 2,728,767 LV 50; 5,397,535 LV 99. Parts at LV 99: head 6,682,575 | LV 1-99 | JP | 2016-11 | wikiwiki | wiki |',
      '| hp body: 150,000,000 (easy) | LV 1, static era | JP | 2019-08-12 | reddit | guide |'].join('\n');
    const out = build(jpFixture((f) => {
      f.values.partHpMd = md;
      f.census.rows.push(jpRow('JP-RAID-20', 'event', '2016-11-20', '2016-11-27', ['Jewel Princess'], { data: { hp: 'other figure only' } }));
      f.config.onlyCensusIds.push('JP-RAID-20');
    }));
    const e = jpEntry(out, 'JP-RAID-20/single'), body = enemyOf(out, e.enemyId);
    assert.ok(e.available, e.why);
    assert.strictEqual(e.hpSource, 'jp');
    // knots 1, 10, 20, 30, 99 of the one-tier rows: the wiki's levels, linear between them (LV 30 between 20 and 50)
    assert.deepStrictEqual(knotsOf(body, 'hp'), [60000, 550181, 1094827, Math.round(1094827 + (2728767 - 1094827) / 3), 5397535]);
  },
  jp_boards_rule() {
    const out = build(jpFixture((f) => {
      const cells = (rewards) => rewards.map((reward, i) => ({ n: i + 1, cost: 100 * (i + 1), type: 'medal', reward, qty: 1 }));
      const board = (name, rewards, extra = {}) => ({ board: name, cells: cells(rewards), completion_reward: '6★ Moogle', ...extra });
      // WW-E9-1: a gender board (an avatar board of the event) and a generic bonus board; WW-E8-1: the super-hard donor
      Object.assign(f.eventRewards.rows.find((r) => r.row_id === 'WW-E9-1'), { boards: [board('Zootopia', ['5★ Chip', '6★ Dale'], { gender: 'm' }), board('Seasoned Wielder Bonus', ['6★ Chip', '6★ Dale'], { gender: 'both' })] });
      Object.assign(f.eventRewards.rows.find((r) => r.row_id === 'WW-E8-1'), { boards: [board('Legendary Raid Reward', ['6★ Moogle', '6★ Chip'])] });
      f.eventRewards.rows.push({ row_id: 'JP-SHR-2', region: 'JP', boards_summary: [], inferred_board: { value: 'same standard super-hard board' } },
        { row_id: 'JP-SHR-1', region: 'JP', boards_summary: [{ board: 'Super-hard defeat reward', cells: '**13**', coins: '**40,500**' }] });
      f.config.jpBoards = { superHard: { donor: 'WW-E8-1', board: 'Legendary Raid Reward', cells: 13, coins: 40500 } };
      f.config.boards = { art: { 'WW-E8-1:ev1-legendary-raid-reward': { jp: 'img/sphere_incentive/1.png' },
        'WW-E9-1:ev2-seasoned-wielder-bonus-both': { screenshot: 'shot.png' } } };
      f.boards = { boards: [], weeks: [] };
      f.master.medal = ['Chip', 'Dale', 'Moogle'].flatMap((n, i) => [5, 6].map((rare) => ({ medalId: 100 + 10 * i + rare, name: n, rare })));
      f.master.avatarParts = [];
      // the private JP board list (user decision 06-11): JP-RAID-1 has a reconstructed board with its own JP card picture,
      // JP-RAID-27 an original one whose only cell is a JP-only medal (left off: no board), the other JP rows nothing
      f.eventRewards.jpBoards = { rows: {
        'JP-RAID-1': { status: 'deduced', boards: [{ name: 'Test Set', cells: [{ cost: 50, kind: 'medal', reward: '6★ Chip' }, { cost: 150, kind: 'medal', reward: '5★ Dale' }], completion_reward: { value: '6★ Moogle' }, art: { jp: 'img/sphere_incentive/Board Raid/2400011.png' } }] },
        'JP-RAID-27': { status: 'original', boards: [{ name: 'Only JP', cells: [{ cost: 10, kind: 'medal', reward: '1★ Sora Santa Ver.' }], completion_reward: { value: '6★ Moogle' } }] } } };
      f.config.boards.unmatched = { '1★ Sora Santa Ver.': 'JP-only medal' };
    }));
    const boardsOf = (key) => jpEntry(out, key).sphereBoardIds.map((id) => out.sphereRows.find((r) => r.sphereBoardId === id).boardName);
    // (b) a reconstructed board: its cells as listed, label jpBoardDeduced, never the generic stand-in of a WW raid
    assert.deepStrictEqual(boardsOf('JP-RAID-1/single'), ['Test Set 4/10/16']);
    const e1 = jpEntry(out, 'JP-RAID-1/single');
    assert.ok(e1.reconstructed.includes('jpBoardDeduced') && !e1.reconstructed.includes('boardStandard') && !e1.reconstructed.includes('jpNoBoard'));
    const masu = out.masuRows.find((m) => m.masuId === e1.sphereBoardIds[0]);
    assert.deepStrictEqual(masu.spherePoint.slice(0, 3), [50, 150, 0]);
    // its own JP card picture
    const jpArt = rb.artLines(out.boardArt).split('\n').find((l) => l.startsWith(`img/sphere_incentive/${e1.sphereBoardIds[0]}.png`));
    assert.strictEqual(jpArt.split('\t').slice(1).join('\t'), 'jp\timg/sphere_incentive/Board Raid/2400011.png');
    // (c) nothing known: no board at all, label jpNoBoard; a board whose every cell is left off: the same
    for (const key of ['JP-D-2017-08-13/single', 'JP-RAID-27/single@2017-10-21']) {
      const e = jpEntry(out, key);
      assert.deepStrictEqual(e.sphereBoardIds, [], key);
      assert.ok(e.reconstructed.includes('jpNoBoard') && !e.reconstructed.includes('boardStandard'), key);
    }
    // super-hard weekends: the WW board equal to the JP one; its card picture (artFrom); inferred after the wiki's dates
    for (const key of ['JP-SHR-1/single', 'JP-SHR-2/single']) {
      const e = jpEntry(out, key);
      assert.strictEqual(boardsOf(key)[0].split(' ').slice(0, 3).join(' '), 'Legendary Raid Reward', key);
      assert.ok(e.reconstructed.includes('jpBoard') && !e.reconstructed.includes('boardStandard'), key);
      assert.ok(out.boardArt.some((a) => a.sphereBoardId === e.sphereBoardIds[0] && a.jp === 'img/sphere_incentive/1.png'), `art of ${key}`);
    }
    assert.ok(jpEntry(out, 'JP-SHR-2/single').reconstructed.includes('boardSet') && !jpEntry(out, 'JP-SHR-1/single').reconstructed.includes('boardSet'));
  },
  jp_boards_round5() {
    // round 5 (user decision 06-11): a board rebuilt on a worldwide model (shape 'ww': label jpBoardWwShape), a reward a worldwide
    // board also gives replaced (subs: label jpBoardShared, entry boardSubs named by the worldwide raid's boss and date), a Spirit
    // part as completion reward (completion_reward.kind) with its qty, and a proposed card picture (artPending) not served
    const out = build(jpFixture((f) => {
      f.boards = { boards: [], weeks: [] };
      f.master.medal = ['Chip', 'Dale', 'Moogle', 'Magic Mirror'].flatMap((n, i) => [5, 6].map((rare) => ({ medalId: 100 + 10 * i + rare, name: n, rare })));
      f.master.avatarParts = [];
      f.master.petParts = [{ petPartsId: 304003, name: 'Rainbow Kitstar Head' }];
      f.config.boards = {};
      f.eventRewards.jpBoards = { rows: {
        'JP-RAID-1': { status: 'deduced', boards: [{ name: 'Kitstar Head', shape: 'ww', cells: [{ cost: 20, kind: 'medal', reward: '6★ Chip' }, { cost: 50, kind: 'medal', reward: '6★ Magic Mirror' }],
          completion_reward: { value: 'Rainbow Kitstar Head', kind: 'pet' }, artPending: { jp: 'img/sphere_incentive/2300116.png' },
          subs: [{ cell: 2, from: '6★ Trickmaster', to: '6★ Magic Mirror', ww: 'WW-E9-1' }] }] } } };
    }));
    const e = jpEntry(out, 'JP-RAID-1/single');
    assert.ok(['jpBoardDeduced', 'jpBoardWwShape', 'jpBoardShared', 'boardNoArt'].every((l) => e.reconstructed.includes(l)), e.reconstructed.join());
    assert.strictEqual(e.boardSubs.length, 1);
    assert.deepStrictEqual({ ...e.boardSubs[0], ww: undefined }, { board: 'Kitstar Head', cell: 2, from: '6★ Trickmaster', to: '6★ Magic Mirror', ww: undefined });
    assert.ok(/ raid of \d{4}-\d{2}-\d{2}$/.test(e.boardSubs[0].ww), e.boardSubs[0].ww);
    const masu = out.masuRows.find((m) => m.masuId === e.sphereBoardIds[0]);
    assert.deepStrictEqual([masu.rewardSelect[22], masu.rewardId[22]], [33, 304003]);
    assert.ok(!out.boardArt.some((a) => a.sphereBoardId === e.sphereBoardIds[0]), 'a proposed card is not served');
    for (const l of ['jpBoardWwShape', 'jpBoardShared']) assert.ok(REAL_CONFIG.reconstructedWhy[l], l);
  },
  jp_board_probable_and_wiki_card() {
    // round 2 (06-11): an original board whose tie to the raid is probable (JP-RAID-3 = 4400001: label jpBoardProbable) and a
    // board card known only from the JP wiki (art.wiki: a loc line named by the board key, label boardArtWiki)
    const out = build(jpFixture((f) => {
      f.boards = { boards: [], weeks: [] };
      f.master.medal = ['Chip', 'Dale', 'Moogle'].flatMap((n, i) => [5, 6].map((rare) => ({ medalId: 100 + 10 * i + rare, name: n, rare })));
      f.master.avatarParts = [];
      f.config.boards = {};
      f.eventRewards.jpBoards = { rows: {
        'JP-RAID-1': { status: 'original', probable: true, boards: [{ name: 'Test Set', cells: [{ cost: 50, kind: 'medal', reward: '6★ Chip' }], completion_reward: { value: '6★ Moogle' }, art: { wiki: 'board_raid1610_01.png' } }] } } };
    }));
    const e = jpEntry(out, 'JP-RAID-1/single');
    assert.ok(['jpBoardOriginal', 'jpBoardProbable', 'boardArtWiki'].every((l) => e.reconstructed.includes(l)) && !e.reconstructed.includes('boardNoArt'), e.reconstructed.join());
    const line = rb.artLines(out.boardArt).split('\n').find((l) => l.startsWith(`img/sphere_incentive/${e.sphereBoardIds[0]}.png`));
    assert.strictEqual(line.split('\t').slice(1).join('\t'), 'loc\t=img/sphere_incentive_ww/JP-RAID-1_jp1-test-set.png');
    for (const l of ['jpBoardProbable', 'boardArtWiki']) assert.ok(REAL_CONFIG.reconstructedWhy[l], l);
  },
  jp_census_overlay() {
    // the later JP research (raid_config.json jpCensus, user 05-11 / 06-11): rows the census leaves without a boss get one, the
    // 2017 monthly raids rotate by weekday, the 2018 one-day weekends open on Saturday only with a probable HP, JP level drops
    // mapped to worldwide medals (a boosted copy included); the census object itself is not changed
    const WEEK = ['Queen Bee', 'Gummi Hound', 'Trickmaster', 'Queen Bee', 'Gummi Hound', 'Trickmaster', 'Queen Bee']; // Monday to Sunday
    let census = null;
    const out = build(jpFixture((f) => {
      f.census.rows.push(jpRow('JP-RAID-29', 'monthly (30-minute)', '2017-08-02', '2017-08-31', []), jpRow('JP-D-2018-08-04', 'super-hard weekend', '2018-08-04', '2018-08-04', []));
      f.config.onlyCensusIds.push('JP-RAID-29', 'JP-D-2018-08-04');
      f.master.medal = [{ medalId: 301180, rare: 6, name: 'Trickmaster', groupId: 0, attack: 7261, defense: 7188 }, { medalId: 1301180, rare: 6, name: 'Trickmaster', groupId: 301180, attack: 8261, defense: 7188 },
        { medalId: 2301180, rare: 6, name: 'Trickmaster', groupId: 301180, attack: 8261, defense: 8188 }, { medalId: 300948, rare: 5, name: 'Magic Broom', groupId: 0, attack: 1, defense: 1 }];
      f.config.jpCensus = {
        _note: 'notes are skipped',
        'JP-RAID-21': { family: 'daily rotating', bosses: ['Trickmaster', 'Queen Bee'], probableBosses: true, levelStep: 10 },
        'JP-RAID-29': { weekdays: true, bosses: WEEK, levelDrops: [{ boss: 'Trickmaster', level: 10, reward: '6★ Trickmaster (Boosted)', probable: true }] },
        'JP-D-2018-08-04': { bosses: ['Gummi Hound'], saturdayOnly: true, hp: 'yes: fixed 1,500,000,000 (carried over)', probableBosses: true, hpProbable: true },
        'JP-RAID-1': { levelDrops: [{ level: 40, reward: '5★ Magic Broom' }, { level: 95, reward: '6★ No Such Medal' }] },
      };
      Object.assign(f.config, { costRule: REAL_CONFIG.costRule, weekdayZeroAp: REAL_CONFIG.weekdayZeroAp, raidWindows: REAL_CONFIG.raidWindows }); // I-228: the served rule
      census = f.census;
    }));
    assert.deepStrictEqual(census.rows.find((r) => r.id === 'JP-RAID-21').bosses, [], 'the census rows are not edited');
    assert.ok(!out.index.jp.skipped.some((s) => /not named/.test(s.why)), JSON.stringify(out.index.jp.skipped));
    // year-end 2016: daily rotating, the last days of the row, +10 levels per defeat, bosses probable
    const ye = out.index.entries.filter((e) => e.censusId === 'JP-RAID-21');
    assert.deepStrictEqual(ye.map((e) => [e.key, e.open, e.day, e.levelStep]), [['JP-RAID-21/single@2016-12-31', 'day', '2016-12-31', 10], ['JP-RAID-21/single@2017-01-01', 'day', '2017-01-01', 10]]);
    assert.ok(ye.every((e) => e.available && e.reconstructed.includes('jpBossProbable')), JSON.stringify(ye.map((e) => [e.why, e.reconstructed])));
    // monthly by weekday: 7 tiers, each open on its weekday (e.day is its first date in the row), the weekday / weekend rule (weekRule,
    // I-228: the master quest shows the weekday price; no opening hours), Saturday's drop
    const mo = out.index.entries.filter((e) => e.censusId === 'JP-RAID-29');
    assert.deepStrictEqual(mo.map((e) => [e.boss, new Date(`${e.day}T12:00:00Z`).getUTCDay()]), WEEK.map((b, i) => [b, (i + 1) % 7]));
    assert.deepStrictEqual(mo.map((e) => e.day), ['2017-08-07', '2017-08-08', '2017-08-02', '2017-08-03', '2017-08-04', '2017-08-05', '2017-08-06']);
    assert.ok(mo.every((e) => e.available && e.open === 'day' && e.upMinutes === 30 && e.reconstructed.includes('weekRule') && !e.reconstructed.includes('jpWindow') && !e.reconstructed.includes('jpWindowLevel') && !e.reconstructed.includes('jpBossProbable')));
    assert.ok(mo.every((e) => out.stageRows.find((s) => s.stageId === e.stageId).useAp === raidWindows.stageUseAp(e, REAL_CONFIG) && raidWindows.stageUseAp(e, REAL_CONFIG) > 0), 'master useAp: the weekday price');
    const sat = mo.find((e) => e.day === '2017-08-05');
    assert.deepStrictEqual(sat.levelDrops.map((d) => [d.level, d.items]), [[10, ['6★ Trickmaster (Boosted)']]]);
    const drop = out.rewardRows.find((r) => r.raidRewardId === sat.levelDrops[0].rewardId);
    assert.deepStrictEqual([drop.type[0], drop.id[0], drop.num[0], drop.odds[0]], [3, 1301180, 1, 100000], 'the +1,000 STR boosted row, not the STR+DEF one');
    assert.ok(sat.reconstructed.includes('levelDrops') && sat.reconstructed.includes('jpRewardProbable'));
    assert.ok(mo.filter((e) => e !== sat && e.boss !== 'Trickmaster').every((e) => !(e.levelDrops || []).length), 'the drop is the Saturday boss only');
    // one-day weekend: Saturday only, 60 minutes (2018), the carried-over HP at every level, probable labels, the super-hard board kept
    const we = jpEntry(out, 'JP-D-2018-08-04/single@2018-08-04');
    assert.deepStrictEqual([we.boss, we.open, we.day, we.upMinutes, we.hp, we.hpSource], ['Gummi Hound', 'day', '2018-08-04', 60, 1500000000, 'jp']);
    assert.ok(knotsOf(enemyOf(out, we.enemyId), 'hp').every((h) => h === 1500000000));
    assert.ok(['jpBossProbable', 'jpHpProbable', 'jpTimer'].every((l) => we.reconstructed.includes(l)), we.reconstructed.join());
    assert.ok(we.reconstructed.includes('weekRule') && out.stageRows.find((s) => s.stageId === we.stageId).useAp === raidWindows.stageUseAp(we, REAL_CONFIG), 'the weekday price');
    // a JP level drop with an item is paid; one with no item in the master is left off (levelDropsPartial), never replaced
    const qb = jpEntry(out, 'JP-RAID-1/single');
    assert.deepStrictEqual(qb.levelDrops.map((d) => [d.level, d.items]), [[40, ['5★ Magic Broom']]]);
    assert.ok(qb.reconstructed.includes('levelDropsPartial') && !qb.reconstructed.includes('jpRewardProbable'));
    // every label has its reason
    for (const l of ['jpBossProbable', 'jpHpProbable', 'weekRule', 'jpRewardProbable']) assert.ok(out.index.reasons[l], l);
    // the overlay refuses an unknown row, an unknown field and a weekday rotation that is not 7 bosses
    const base = { rows: [{ id: 'JP-X', bosses: [] }] };
    assert.throws(() => mr.applyJpCensus(base, { 'JP-Y': { bosses: ['A'] } }), /not a census row/);
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { boss: 'A' } }), /unknown field/);
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { windowLevel: true } }), /unknown field/, 'the old per-window note: raidWindows now');
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { weekdays: true, bosses: ['A'] } }), /7 bosses/);
    assert.throws(() => build(jpFixture((f) => {
      f.census.rows.push(jpRow('JP-D-2018-08-05', 'super-hard weekend', '2018-08-05', '2018-08-05', ['Gummi Hound']));
      f.config.onlyCensusIds.push('JP-D-2018-08-05');
      f.config.jpCensus = { 'JP-D-2018-08-05': { saturdayOnly: true } };
    })), /not a Saturday/);
  },
  jp_census_notice_fields() {
    // the live JP notice sweep (06-11): a row's JP dates (the census gives some as the Pacific days before), the notice's time
    // limit (upMinutes, original: no upMinutes label) and level steps (bonusLevelStep: +1, +5 in Bonus Time; levelStep: always)
    const out = build(jpFixture((f) => {
      f.config.jpCensus = {
        'JP-SHR-1': { start: '2016-08-13' },
        'JP-D-2017-08-13': { start: '2017-08-14', end: '2017-08-20', upMinutes: 180, bonusLevelStep: 5 },
        'JP-RAID-27': { start: '2017-10-16', levelStep: 5, upMinutes: 180 },
      };
    }));
    const shr = jpEntry(out, 'JP-SHR-1/single');
    assert.deepStrictEqual([shr.start, shr.end, shr.periods, shr.open, shr.upMinutes], ['2016-08-13', '2016-08-14', [['2016-08-13', '2016-08-14']], 'weekend', 720], 'Saturday 0:00 - Sunday 23:59, 12 hours kept');
    const d = jpEntry(out, 'JP-D-2017-08-13/single');
    assert.deepStrictEqual([d.start, d.end, d.periods, d.upMinutes, d.bonusLevelStep, d.levelStep], ['2017-08-14', '2017-08-20', [['2017-08-14', '2017-08-20']], 180, 5, undefined]);
    assert.ok(!d.reconstructed.includes('jpDates') && !d.reconstructed.includes('upMinutes') && !d.reconstructed.includes('jpTimer') && !d.reconstructed.includes('setting2016'), d.reconstructed.join());
    assert.strictEqual(out.settingRows.find((s) => s.raidSettingId === d.settingId).bossUpTime, 180, 'the master raidSetting carries the 3 hours');
    // the daily rotating days follow the end (keys unchanged), every day +5 and 3 hours
    const dr = out.index.entries.filter((e) => e.censusId === 'JP-RAID-27');
    assert.deepStrictEqual(dr.map((e) => [e.key, e.start, e.levelStep, e.upMinutes]), [['JP-RAID-27/single@2017-10-21', '2017-10-16', 5, 180], ['JP-RAID-27/single@2017-10-22', '2017-10-16', 5, 180]]);
    // bad values stop the run
    const base = { rows: [{ id: 'JP-X', start: '2016-08-12', end: '2016-08-14', bosses: [] }] };
    assert.deepStrictEqual(['start', 'end'].map((k) => mr.applyJpCensus(base, { 'JP-X': { start: '2016-08-13' } }).rows[0][k]), ['2016-08-13', '2016-08-14']);
    assert.strictEqual(base.rows[0].start, '2016-08-12', 'the census object is not edited');
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { start: '8/13/2016' } }), /not a YYYY-MM-DD day/);
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { start: '2016-08-15' } }), /before start/);
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { upMinutes: '180' } }), /positive integer/);
    assert.throws(() => mr.applyJpCensus(base, { 'JP-X': { bonusLevelStep: 0 } }), /positive integer/);
  },
  jp_census_real_config() {
    // the shipped overlay: every id is a census row (checked by the real build) and the rows the users decided are in it
    const fix = REAL_CONFIG.jpCensus;
    const ids = Object.keys(fix).filter((k) => !k.startsWith('_'));
    assert.deepStrictEqual(ids.filter((k) => !/^JP-SHR-/.test(k)).sort(), ['JP-D-2017-05-22', 'JP-D-2017-06-19', 'JP-D-2017-07-17', 'JP-D-2017-08-13', 'JP-D-2017-09-04', 'JP-D-2017-09-18', 'JP-D-2017-11-13', 'JP-D-2017-12-11',
      'JP-D-2018-01-15', 'JP-D-2018-02-12', 'JP-D-2018-04-09', 'JP-D-2018-07-09', 'JP-D-2018-08-04', 'JP-D-2018-08-06', 'JP-D-2018-09-01', 'JP-FAMRAID-1', 'JP-FAMRAID-2',
      'JP-RAID-1', 'JP-RAID-10', 'JP-RAID-11', 'JP-RAID-13', 'JP-RAID-14', 'JP-RAID-15', 'JP-RAID-16', 'JP-RAID-17', 'JP-RAID-18', 'JP-RAID-19', 'JP-RAID-20', 'JP-RAID-21', 'JP-RAID-22', 'JP-RAID-23', 'JP-RAID-24',
      'JP-RAID-25', 'JP-RAID-26', 'JP-RAID-27', 'JP-RAID-28', 'JP-RAID-29', 'JP-RAID-3', 'JP-RAID-30', 'JP-RAID-4', 'JP-RAID-6', 'JP-RAID-7', 'JP-RAID-8', 'JP-RAID-9']);
    // round 3 (06-11): the 2015-2016 raid events start on the JP Monday of the wiki copies of their notices (Gap research 10 §3)
    assert.deepStrictEqual(['JP-RAID-1', 'JP-RAID-7', 'JP-RAID-10', 'JP-RAID-11', 'JP-RAID-13', 'JP-RAID-16', 'JP-RAID-17', 'JP-RAID-19', 'JP-RAID-20'].map((id) => fix[id].start),
      ['2015-10-19', '2016-02-08', '2016-04-11', '2016-05-02', '2016-06-13', '2016-09-05', '2016-09-19', '2016-10-17', '2016-11-21']);
    for (const id of ['JP-RAID-1', 'JP-RAID-7', 'JP-RAID-10', 'JP-RAID-11', 'JP-RAID-13', 'JP-RAID-16', 'JP-RAID-17', 'JP-RAID-19', 'JP-RAID-20']) {
      assert.strictEqual(new Date(`${fix[id].start}T12:00:00Z`).getUTCDay(), 1, `${id}: a Monday`);
      assert.ok(/JP wiki copy of the notice/.test(fix[id].source), id);
    }
    // live JP notices (06-11): every super-hard weekend starts on the JP Saturday (18958, 19740, 19871, 19875, 20289, 24640;
    // standing 20079; the Saturday-only ones of the JP wiki banners 土曜限定), not on the Pacific Friday of the census
    const shr = ids.filter((k) => /^JP-SHR-/.test(k));
    assert.strictEqual(shr.length, 96, 'every super-hard weekend 2016-2018');
    for (const id of shr) assert.ok(new Date(`${fix[id].start}T12:00:00Z`).getUTCDay() === 6 && /\d{5}|土曜限定/.test(fix[id].source), id);
    assert.ok(/24640/.test(fix['JP-SHR-28'].source) && fix['JP-SHR-28'].start === '2017-01-21', 'notice 24640');
    // round 4 (06-11, Gap research 9): the first 60-minute weekend is the JP Saturday 2018-05-05 (JP-SHR-95; digest 5/4/2018, reddit 8gzyzv)
    assert.deepStrictEqual([fix['JP-SHR-95'].start, fix['JP-SHR-96'].start, REAL_CONFIG.jpTimer['super-hard weekend'].oneHourFrom], ['2018-05-05', '2018-05-12', '2018-05-05']);
    assert.ok(/60 minutes/.test(fix['JP-SHR-95'].source), 'JP-SHR-95 says 60 minutes');
    // round 4: JP-RAID-18 = the Clarice avatar event 11/14-11/24/2016 (its notice in a video), JP-RAID-26 from the JP Monday of its notice
    assert.deepStrictEqual([fix['JP-RAID-18'].start, fix['JP-RAID-18'].end, fix['JP-RAID-26'].start], ['2016-11-14', '2016-11-24', '2017-04-17']);
    for (const id of ['JP-RAID-18', 'JP-RAID-26']) assert.ok(/YouTube \w+/.test(fix[id].source) && /Gap research 9/.test(fix[id].source), id);
    // round 2 notices 28549, 30537: 3 hours, +1 / +5; JP-RAID-3: the wiki copy of its notice, Saturday-Sunday 11/14-15/2015
    for (const id of ['JP-D-2017-05-22', 'JP-D-2017-07-17']) assert.ok(fix[id].upMinutes === 180 && fix[id].bonusLevelStep === 5, id);
    assert.deepStrictEqual([fix['JP-RAID-3'].start, fix['JP-RAID-3'].end], ['2015-11-14', '2015-11-15']);
    // the raid events whose notice says «3 hours, +1 per defeat, +5 in Bonus Time»
    for (const id of ['JP-RAID-14', 'JP-RAID-15', 'JP-RAID-22', 'JP-D-2017-06-19', 'JP-D-2017-08-13', 'JP-D-2017-09-04', 'JP-D-2017-09-18', 'JP-D-2017-11-13', 'JP-D-2017-12-11',
      'JP-D-2018-01-15', 'JP-D-2018-02-12', 'JP-D-2018-04-09', 'JP-D-2018-07-09', 'JP-D-2018-08-06']) assert.ok(fix[id].upMinutes === 180 && fix[id].bonusLevelStep === 5 && /JP notice \d+/.test(fix[id].source), id);
    assert.ok(fix['JP-RAID-24'].upMinutes === 180 && !fix['JP-RAID-24'].bonusLevelStep, 'notice 25538 states no Bonus Time step');
    assert.deepStrictEqual([fix['JP-RAID-27'].start, fix['JP-RAID-27'].levelStep, fix['JP-RAID-27'].upMinutes], ['2017-10-16', 5, 180], 'notice 33250');
    assert.deepStrictEqual([fix['JP-RAID-15'].start, fix['JP-D-2017-06-19'].bosses], ['2016-08-15', ['Jewel Sorceress']], 'notices 20078, 29434');
    assert.deepStrictEqual(fix['JP-RAID-28'].bosses, ['Assault Dragon', 'Queen Bee Ω', 'Jewel Princess', 'Jack in the Box', 'Gummi Hound', 'Closehanded Captain', 'Gear Golem']);
    assert.deepStrictEqual(fix['JP-RAID-30'].probableBosses, ['Crabby Cake']);
    for (const id of ['JP-RAID-28', 'JP-RAID-29', 'JP-RAID-30']) assert.ok(fix[id].weekdays && !('windowLevel' in fix[id]) && fix[id].levelDrops.length === 1 && fix[id].levelDrops[0].level === 10, id);
    assert.ok(REAL_CONFIG.boards.boostedMedals.some((m) => m.name === 'Twilight Thorn' && m.str === 1000 && m.def === 0), 'the boosted Twilight Thorn row the August 2017 drop needs');
    // the 2018 Saturday-only weekends: bosses named by their own notices (43217 Gear Golem, 44270 Bane Spider = Scourge Spider), HP still probable
    assert.deepStrictEqual([fix['JP-D-2018-08-04'].bosses, fix['JP-D-2018-09-01'].bosses], [['Gear Golem'], ['Scourge Spider']]);
    for (const id of ['JP-D-2018-08-04', 'JP-D-2018-09-01']) assert.ok(fix[id].saturdayOnly && !('probableBosses' in fix[id]) && fix[id].hpProbable && /fixed 1,500,000,000/.test(fix[id].hp), id);
    // Gap research 12 (06-11, original notices of the live host): JP-RAID-23 is Circus Fortress (24641 banner art, the rare Adventurer
    // of the digest stays probable) from the Monday 1/23; JP-RAID-25 from the Monday 3/13 (26469); JP-RAID-20 3 hours, +1 / +5 (22600)
    assert.deepStrictEqual([fix['JP-RAID-23'].start, fix['JP-RAID-23'].bosses, fix['JP-RAID-23'].probableBosses, fix['JP-RAID-25'].start],
      ['2017-01-23', ['Circus Crab', 'Adventurer'], ['Adventurer'], '2017-03-13']);
    for (const id of ['JP-RAID-20', 'JP-RAID-23', 'JP-RAID-25']) assert.ok(fix[id].upMinutes === 180 && fix[id].bonusLevelStep === 5 && /notice \d{5}/.test(fix[id].source), id);
    // every «Saturday only» super-hard weekend (own notice or 土曜限定 banner) is open on its Saturday only, not the whole weekend
    const satOnly = shr.filter((id) => fix[id].saturdayOnly);
    assert.deepStrictEqual(satOnly.map((id) => +id.slice(7)).sort((x, y) => x - y), [14, 19, 24, 26, 28, 32, 35, 40, 45, 49, 53, 57, 60, 62, 66, 70, 74, 79, 83, 86, 91, 96]);
    for (const id of shr) assert.strictEqual(!!fix[id].saturdayOnly, /Saturday.only/.test(fix[id].source), id);
    for (const [id, n] of [['JP-SHR-32', 25537], ['JP-SHR-79', 36190], ['JP-SHR-83', 36817], ['JP-SHR-86', 37932], ['JP-SHR-91', 38870], ['JP-SHR-96', 40266]]) assert.ok(fix[id].source.includes(`JP notice ${n}`), id);
    // the familiar-raid lure weeks (notices 22155, 23091): Vicious Spider = Savage Spider, not Trident Tail; still not served (lure weeks)
    for (const id of ['JP-FAMRAID-1', 'JP-FAMRAID-2']) assert.ok(fix[id].bosses.includes('Savage Spider') && !fix[id].bosses.includes('Trident Tail'), id);
  },
  old_hp_2016() {
    // a 2016 event raid with its own 2016 row keeps that row: knots, HP, ATK, DEF, Lux and reward rows
    const out = build(eventFixture([eventRow('WW-E1-1', 'one-off event', '2016-06-06', '2016-06-13', ['Trickmaster'], { data: { hp: 'yes (2016 row)' } })]));
    const e = out.index.entries[0];
    assert.ok(e.available, e.why);
    assert.strictEqual(e.tier, 'single');
    assert.strictEqual(e.hpSource, '2016');
    const body = enemyOf(out, e.enemyId), part = enemyOf(out, e.enemyId + 1);
    assert.deepStrictEqual(knotsOf(body, 'baseLv'), [1, 10, 30, 100]);
    assert.deepStrictEqual(knotsOf(body, 'hp'), [12000, 36000, 180000, 900000]);
    assert.deepStrictEqual(knotsOf(body, 'attack'), [12500, 15000, 25000, 80000]);
    assert.deepStrictEqual(knotsOf(body, 'defense'), [1200, 1300, 1500, 2000]);
    assert.deepStrictEqual(knotsOf(body, 'luxAttack'), [270, 1080, 6480, 38880], 'the original Lux, not the lux rule');
    assert.deepStrictEqual(knotsOf(part, 'hp'), [7200, 24300, 121500, 607500]);
    for (const l of ['hp', 'atk', 'def', 'partHp', 'lux', 'coinOdds', 'moves']) assert.ok(!e.reconstructed.includes(l), `${l} is original`);
    // baseLv as the client reads it: linear between the knots, flat outside (docs/notes/raid.md)
    // the server's rule (review M-6): no client oracle for the rounding between knots; one off-knot level is a bench check
    assert.strictEqual(mr.atLevel(body, 'hp', 1), 12000);
    assert.strictEqual(mr.atLevel(body, 'hp', 20), 108000);
    assert.strictEqual(mr.atLevel(body, 'hp', 65), 540000);
    assert.strictEqual(mr.atLevel(body, 'hp', 120), 900000);
    // the 2016 reward rows, under our ids, garbage slots blanked
    const victory = out.rewardRows.find((r) => r.raidRewardId === body.rewardId[0]);
    assert.strictEqual(body.rewardId[0], rr.rewardRowId(e.enemyId, 1, 1));
    assert.deepStrictEqual([victory.validReward, victory.type, victory.num, victory.oddsUpPerLv], [3, [15, 15, 15, 0], [11, 13, 16, 0], 50]);
    assert.strictEqual(enemyOf(out, e.enemyId).rewardId[3], rr.rewardRowId(e.enemyId, 1, 4));
    // the quest of the event: its AP, level and objectives with their own rewards (Event Coin 15, Jewel 2, Raid Coin 16)
    const st = out.stageRows.find((s) => s.stageId === e.stageId);
    assert.deepStrictEqual(e.questAp, [10]);
    assert.strictEqual(st.useAp, 10);
    assert.deepStrictEqual(st.submissionRewardType, [15, 2, 16]);
    assert.deepStrictEqual(st.submissionItemNum, [10, 10, 5]);
    assert.strictEqual(st.name, 'Trickmaster');
  },
  old_hp_scale_labelled() {
    // fix round 1, user decision I-1 (b): 2016-11 to 2018-08 without an original row, HP is the boss's own 2016 row (its growth
    // shape) scaled by date, log-linear and monotone, from x1 on 2016-10-31 to 1 billion at LV 30 on 2018-09-11 (RAID_VALUES.md:
    // «1,000,000,000 at LV 30 cap», Closehanded Captain); the 1.2-16.5 billion cap is not used before 2018-10-07
    const cfg = REAL_CONFIG.eventHp;
    assert.deepStrictEqual([cfg.from, cfg.single.date, cfg.single.level, cfg.single.hp, cfg.advanced.lv1, cfg.capFrom], ['2016-10-31', '2018-09-11', 30, 1000000000, 500000000, '2018-10-07']);
    const day = (d) => Date.parse(`${d}T00:00:00Z`);
    const trick = body2016(7, 'Trickmaster', 1, [70002, 70003]), shape = (lv) => mr.atLevel(trick, 'hp', lv), s30 = shape(30);
    const line = (date, lv) => {
      const t = Math.min(1, Math.max(0, (day(date) - day(cfg.from)) / (day(cfg.single.date) - day(cfg.from))));
      return s30 * Math.pow(Math.max(1, cfg.single.hp / s30), t) * shape(lv) / s30;
    };
    const KN = [1, 10, 20, 30, 99];
    const one = (rows) => build(eventFixture(rows));
    const out = one([eventRow('WW-E2-1', 'monthly', '2017-03-20', '2017-03-27', ['Trickmaster'], { data: { hp: 'older row only' } })]);
    const e = out.index.entries[0], body = enemyOf(out, e.enemyId);
    assert.ok(e.available, e.why);
    assert.strictEqual(e.hpSource, 'scale');
    assert.deepStrictEqual(knotsOf(body, 'baseLv'), KN);
    assert.deepStrictEqual(knotsOf(body, 'hp'), KN.map((lv) => Math.round(line('2017-03-20', lv))));
    assert.strictEqual(e.hp, body.hp[0], 'entry.hp is the LV 1 HP');
    for (const l of ['eventHp', 'atk', 'atk_curve', 'def']) assert.ok(e.reconstructed.includes(l), `label ${l}`);
    for (const l of ['hp', 'hp_step']) assert.ok(!e.reconstructed.includes(l), `no cap label ${l}`);
    assert.ok(knotsOf(body, 'hp').every((h, i) => h >= shape(KN[i])), 'never below the 2016 row');
    assert.ok(body.hp[3] < 1200000000, 'far below the 1.2 billion cap');
    // monotone by date at every level
    const at = (start) => { const o = one([eventRow('WW-E2-1', 'monthly', start, start, ['Trickmaster'])]); return knotsOf(enemyOf(o, o.index.entries[0].enemyId), 'hp'); };
    const dates = ['2016-11-21', '2017-03-20', '2017-08-14', '2018-03-19', '2018-08-20'], series = dates.map(at);
    for (let i = 1; i < series.length; i++) assert.ok(series[i].every((h, k) => h > series[i - 1][k]), `${dates[i]} above ${dates[i - 1]}`);
    // the three tiers of 2018: Beginner the line, Advanced 500M at LV 1 (2018-07-23 reading «500,000,000 at LV 1»), Intermediate
    // their geometric mean; different at every level, Beginner < Intermediate < Advanced
    const t3 = one([eventRow('WW-E3-1', 'monthly', '2018-06-11', '2018-06-18', ['Trickmaster'], { tier: 'Beginner/Intermediate/Advanced (quest LV 25/80/120)', map: 'Curious Room; Curious Room; Curious Room' })]);
    const [b, i, a] = t3.index.entries.map((x) => knotsOf(enemyOf(t3, x.enemyId), 'hp'));
    assert.deepStrictEqual(b, KN.map((lv) => Math.round(line('2018-06-11', lv))));
    assert.deepStrictEqual(a, KN.map((lv) => Math.round(Math.max(cfg.advanced.lv1 * shape(lv) / shape(1), line('2018-06-11', lv)))));
    assert.strictEqual(a[0], 500000000);
    assert.ok(b.every((h, k) => h < i[k] && i[k] < a[k]), 'B < I < A');
    assert.ok(i.every((h, k) => Math.abs(h - Math.round(Math.sqrt(line('2018-06-11', KN[k]) * a[k]))) <= 1), 'Intermediate = geometric mean');
    assert.ok(t3.index.entries.every((x) => x.reconstructed.includes('eventHp') && x.reconstructed.includes('hpTier')));
    // weekend raids before the 2018-05-05 weekend: twice the HP («half of previous» that weekend, reddit 8h8217)
    const wk = (start) => { const o = one([eventRow('WW-E4-1', 'weekend-only', start, start, ['Trickmaster']), eventRow('WW-E5-1', 'monthly', start, start, ['Trickmaster'])]);
      return o.index.entries.map((x) => enemyOf(o, x.enemyId).hp[0]); };
    const [wBefore, mBefore] = wk('2018-04-07'), [wAfter, mAfter] = wk('2018-05-05');
    assert.strictEqual(wBefore, 2 * mBefore);
    assert.strictEqual(wAfter, mAfter);
    // a 2016 row stronger than the target: never lowered, the factor stays 1
    const strong = build((f) => { eventFixture([eventRow('WW-E2-1', 'monthly', '2018-08-20', '2018-08-27', ['Trickmaster'])])(f); f.orig2016.raidEnemy[0].hp = [30000000, 400000000, 2000000000, 9000000000, 0]; });
    const sb = enemyOf(strong, strong.index.entries[0].enemyId);
    assert.deepStrictEqual(knotsOf(sb, 'hp'), KN.map((lv) => Math.round(mr.atLevel({ ...trick, hp: [30000000, 400000000, 2000000000, 9000000000, 0] }, 'hp', lv))));
  },
  cap_era_boundaries() {
    // the 1.2-16.5 billion cap: one-tier weeks from 2018-10-07 to 2019-08-11 only; a one-tier week before it with no video reading
    // uses the scale (pre-series 2018-09, flat from LV 30: «caps out at level 30 with 1bn HP»); 2019-08-12 the tier table
    const single = (start, tier = 'single', end = start) => build((f) => {
      addWeek(f, `WW-W-${start}`, start, end, tier);
      f.values.hp_tier_era.rows.push(era('single, cap at LV 30+', 16500000000, '2019-07-21', '2019-08-11'));
    });
    const hpOf = (out) => { const e = out.index.entries[0]; return [e, knotsOf(enemyOf(out, e.enemyId), 'hp')]; };
    const [c1, h1] = hpOf(single('2018-10-07'));
    assert.strictEqual(c1.hp, 1200000000);
    assert.strictEqual(h1[3], 1200000000);
    assert.ok(c1.reconstructed.includes('hp') && !c1.reconstructed.includes('eventHp'));
    const [c2, h2] = hpOf(single('2019-08-11'));
    assert.deepStrictEqual([c2.hp, h2[4]], [16500000000, 16500000000]);
    const [c0, h0] = hpOf(single('2018-09-17'));
    assert.ok(c0.reconstructed.includes('eventHp') && !c0.reconstructed.includes('hp'), 'before 2018-10-07: the scale');
    assert.deepStrictEqual([h0[3], h0[4]], [1000000000, 1000000000], 'the 2018-09-11 reading, flat above LV 30');
    // the week holding the reading (Closehanded Captain, 2018-09-10..16) reaches it: read at its last day
    assert.strictEqual(hpOf(single('2018-09-10', 'single', '2018-09-16'))[1][3], 1000000000);
    assert.ok(hpOf(single('2018-09-03', 'single', '2018-09-09'))[1][3] < 1000000000, 'the week before: still rising');
    const [c3] = hpOf(single('2019-08-12', 'Beginner'));
    assert.strictEqual(c3.hp, 150000000);
  },
  level_drops() {
    // fix round 1 (I-3): the level drops the notices name, as raidReward rows of their own; a row pays every slot (all items);
    // the rest («not itemised», «chance drop», Boosted, coins with no amount) stays out, labelled
    const out = build((f) => {
      eventFixture([eventRow('WW-E6-1', 'weekend-only', '2017-03-04', '2017-03-06', ['Trickmaster'])])(f);
      f.master.medal = [{ medalId: 90056, rare: 6, name: 'Chip', groupId: 0 }, { medalId: 90066, rare: 6, name: 'Dale', groupId: 0 }, { medalId: 90076, rare: 6, name: 'Moogle', groupId: 0 },
        { medalId: 300500, rare: 5, name: 'Young Kairi', groupId: 0 }];
      f.eventRewards.rows[0].level_rewards = [{ level: 10, reward: 'one 6★ Chip, one 6★ Dale, one 6★ Moogle' }, { level: '30, then every 10 levels', reward: 'Young Kairi' },
        { level: 'every 10th level', reward: 'additional Medals, not itemised' }, { level: '96+', reward: 'Young Kairi, chance drop' }];
    });
    const e = out.index.entries[0];
    assert.deepStrictEqual(e.levelDrops.map((d) => d.level), [10, 30, 40, 50, 60, 70, 80, 90]);
    const row = (d) => out.rewardRows.find((r) => r.raidRewardId === d.rewardId);
    assert.deepStrictEqual([row(e.levelDrops[0]).validReward, row(e.levelDrops[0]).type.slice(0, 3), row(e.levelDrops[0]).id.slice(0, 3)], [3, [3, 3, 3], [90056, 90066, 90076]]);
    assert.deepStrictEqual([row(e.levelDrops[1]).validReward, row(e.levelDrops[1]).id[0], row(e.levelDrops[1]).num[0]], [1, 300500, 1]);
    assert.ok(e.levelDrops.every((d) => d.rewardId > e.enemyId * 100 + 35 && d.rewardId < (e.enemyId + 1) * 100), 'ids of the boss, past its coin tables');
    assert.ok(e.reconstructed.includes('levelDropsPartial'), 'the not itemised ones are declared');
    assert.ok(e.reconstructed.includes('eventCoins'), 'the coins stay the standard table');
  },
  old_level_bands() {
    // one tier before 2019-08-12: coins by level band (1-9, 10-19, 20-29, 30-99) on the event raids too
    const out = build(eventFixture([eventRow('WW-E2-1', 'monthly', '2017-03-20', '2017-03-27', ['Trickmaster'])]));
    const e = out.index.entries[0], body = enemyOf(out, e.enemyId);
    const victory = (k) => out.rewardRows.find((r) => r.raidRewardId === body.rewardId[k]);
    assert.deepStrictEqual([0, 1, 2, 3, 4].map((k) => victory(k).num.slice(0, 2)), [[40, 60], [120, 180], [150, 220], [180, 270], [180, 270]]);
    assert.ok(e.reconstructed.includes('eventCoins'));
  },
  timers() {
    // normal 10, Ω 20, Gummi Hound 180 (its 2016 setting), weekend 3 h before May 2018 and 1 h after
    const out = build(eventFixture([
      eventRow('WW-E4-1', 'monthly', '2017-04-24', '2017-05-01', ['Trickmaster']),
      eventRow('WW-E5-1', 'monthly', '2017-05-22', '2017-05-29', ['Jewel Princess']),
      eventRow('WW-E6-1', 'monthly', '2017-08-14', '2017-08-21', ['Gummi Hound']),
      eventRow('WW-E7-1', 'weekend-only', '2017-04-08', '2017-04-10', ['Trickmaster']),
      eventRow('WW-E8-1', 'weekend-only', '2018-06-02', '2018-06-04', ['Trickmaster']),
      eventRow('WW-E9-1', 'monthly', '2017-06-19', '2017-06-26', ['Darkside Ω'])], {}, (f) => {
      // a real Ω with no 2016 setting of its own (review M-9): Darkside Ω, rare 2
      f.census.bosses.push({ ww: 'Darkside Ω', raid_model_id: 2 });
      f.orig2016.raidEnemy.push(body2016(2, 'Darkside Ω', 2, [20002]), part2016(20002, 2));
      f.orig2016.raidEnemyAttack.push(attack2016(201), attack2016(202));
      f.models['0002'] = f.models['0007'];
    }));
    const up = (id) => out.index.entries.find((e) => e.censusId === id);
    assert.deepStrictEqual(['WW-E4-1', 'WW-E5-1', 'WW-E6-1', 'WW-E7-1', 'WW-E8-1', 'WW-E9-1'].map((id) => up(id).upMinutes), [10, 20, 180, 180, 60, 20]);
    assert.ok(up('WW-E9-1').reconstructed.includes('upMinutes') && !up('WW-E9-1').reconstructed.includes('setting2016'));
    assert.ok(up('WW-E4-1').reconstructed.includes('upMinutes'));
    assert.ok(up('WW-E6-1').reconstructed.includes('setting2016'));
    assert.ok(up('WW-E7-1').reconstructed.includes('weekendTimer'));
    for (const id of ['WW-E4-1', 'WW-E6-1', 'WW-E8-1']) {
      const s = out.settingRows.find((x) => x.raidSettingId === up(id).settingId);
      assert.strictEqual(s.bossUpTime, up(id).upMinutes);
      assert.strictEqual(s.rareBossUpTime, up(id).upMinutes, 'a rare 2 body reads the rare fields');
    }
  },
  use_ap_from_row() {
    // AP of a further attempt: the raid's 2016 setting (1 for Gummi Hound and Fortress Crab), else 10
    const out = build(eventFixture([eventRow('WW-E6-1', 'weekend-only', '2016-09-03', '2016-09-05', ['Gummi Hound'], { data: { hp: 'yes (2016 row)' } }),
      eventRow('WW-E4-1', 'monthly', '2017-04-24', '2017-05-01', ['Trickmaster'])]));
    const [g, t] = out.index.entries;
    assert.deepStrictEqual([g.useAp, g.upMinutes, t.useAp], [1, 180, 10]);
    assert.ok(!g.reconstructed.includes('useAp') && !g.reconstructed.includes('upMinutes') && !g.reconstructed.includes('setting2016'), 'its own dated 2016 setting');
    assert.ok(t.reconstructed.includes('useAp'));
    const s = out.settingRows.find((x) => x.raidSettingId === g.settingId);
    assert.deepStrictEqual([s.useAp, s.rareUseAp], [1, 1]);
  },
  rare_boss() {
    // Queen Bee and Queen Bee Ω: one quest, the setting holds both; the client fights rareBossId when parts[0].rare is 2
    const out = build(eventFixture([eventRow('WW-E9-1', 'one-off event', '2016-05-02', '2016-05-16', ['Queen Bee', 'Queen Bee Ω'], { data: { hp: 'yes (2016 row)' } })],
      { 'WW-E9-1': [eventQuest('Queen Bee', 25, '15')] }));
    assert.strictEqual(out.index.entries.length, 1);
    const e = out.index.entries[0];
    assert.ok(e.available, e.why);
    assert.ok(e.rare && e.rare.enemyId && e.rare.enemyId !== e.enemyId);
    assert.deepStrictEqual([e.upMinutes, e.useAp, e.rare.upMinutes, e.rare.useAp, e.rare.every], [10, 10, 20, 10, 5]);
    assert.ok(e.reconstructed.includes('rareOdds'));
    const s = out.settingRows.find((x) => x.raidSettingId === e.settingId);
    assert.deepStrictEqual([s.bossId, s.rareBossId, s.bossUpTime, s.rareBossUpTime, s.useAp, s.rareUseAp, s.rareUpType, s.rareUpTypeArg], [e.enemyId, e.rare.enemyId, 10, 20, 10, 10, 3, 5]);
    const body = enemyOf(out, e.enemyId), rare = enemyOf(out, e.rare.enemyId);
    assert.deepStrictEqual([body.rare, rare.rare, rare.raidDisplayId, rare.validParts], [1, 2, 16, 1]);
    assert.ok(enemyOf(out, e.rare.enemyId + 1), 'the rare body has its part rows');
    assert.ok(rare.rewardId.slice(0, rare.validGrowth).every((id) => out.rewardRows.some((r) => r.raidRewardId === id)));
  },
  weekend_and_daily_open() {
    // weekend-only: the census dates plus the other periods of the notice, as Pacific days; daily showdown: one boss per day
    const out = build(eventFixture([
      eventRow('WW-E22111-1', 'weekend-only', '2016-11-05', '2016-11-07', ['Trickmaster'], { note: 'Other periods in notice: ["2016-11-12T08:00Z..2016-11-14T07:59Z", "2017-03-18T07:00Z..2017-03-20T06:59Z"].' }),
      eventRow('WW-E10-1', 'daily showdown', '2016-12-26', '2017-01-02', ['Trickmaster', 'Gummi Hound'], { map: 'Curious Room; Curious Room' }),
      eventRow('WW-E11-1', 'daily', '2017-07-03', '2017-07-10', ['Trickmaster'])]));
    const [w, d1, d2, daily] = out.index.entries;
    assert.deepStrictEqual([w.open, w.periods], ['weekend', [['2016-11-05', '2016-11-06'], ['2016-11-12', '2016-11-13'], ['2017-03-18', '2017-03-19']]]);
    assert.deepStrictEqual([d1.open, d1.day, d1.boss, d2.day, d2.boss], ['day', '2016-12-26', 'Trickmaster', '2016-12-27', 'Gummi Hound']);
    assert.notStrictEqual(d1.key, d2.key);
    assert.deepStrictEqual([daily.open, daily.periods], ['daily', [['2017-07-03', '2017-07-09']]]);
    // review M-1: one-off and monthly rows end on the Pacific day before their Monday 07:00Z end too
    assert.deepStrictEqual(mr.eventPeriods(eventRow('WW-E12-1', 'monthly', '2016-11-21', '2016-11-28', ['Trickmaster'])), [['2016-11-21', '2016-11-27']]);
  },
  raid_windows_labels() {
    // I-228, served rule weekdayWeekend (06-11): every raid carries weekRule, a tier whose original AP is 0 weekdayAp too, and its master
    // quest the weekday price (the census value, 5 for a 0); no opening-hours label
    const rows = [eventRow('WW-E29805-1', 'daily', '2017-07-03', '2017-07-10', ['Trickmaster']), eventRow('WW-E35529-1', 'daily', '2018-01-08', '2018-01-15', ['Trickmaster'])];
    const cfg = (rule) => (f) => { Object.assign(f.config, { costRule: rule, weekdayZeroAp: REAL_CONFIG.weekdayZeroAp, raidWindows: REAL_CONFIG.raidWindows }); };
    const out = build(eventFixture(rows, { 'WW-E35529-1': [eventQuest('Trickmaster', 25, '0')] }, cfg('weekdayWeekend')));
    const [jul, jan] = out.index.entries;
    const ap = (e) => out.stageRows.find((s) => s.stageId === e.stageId).useAp;
    assert.deepStrictEqual([jul.reconstructed.includes('weekRule'), jul.reconstructed.includes('raidWindow'), ap(jul)], [true, false, raidWindows.stageUseAp(jul, REAL_CONFIG)]);
    assert.deepStrictEqual([jan.questAp, jan.reconstructed.includes('weekdayAp'), ap(jan)], [[0], true, 5], 'an original 0 pays 5 on weekdays');
    assert.ok(/I-228/.test(out.index.reasons.weekRule) && /I-228/.test(out.index.reasons.weekdayAp));
    // originalWindows (switched off, kept): the opening-hours label and the outside price, 90
    const orig = build(eventFixture(rows, {}, cfg('originalWindows')));
    const [ojul, ojan] = orig.index.entries;
    const oap = (e) => orig.stageRows.find((s) => s.stageId === e.stageId).useAp;
    assert.deepStrictEqual([ojul.reconstructed.includes('raidWindow'), ojul.reconstructed.includes('weekRule'), oap(ojul)], [true, false, 90]);
    assert.deepStrictEqual([ojan.reconstructed.includes('raidWindow'), oap(ojan)], [false, ojan.questAp[ojan.questAp.length - 1]]);
    assert.ok(/I-228/.test(orig.index.reasons.raidWindow));
    for (const l of ['raidWindow', 'jpWindow', 'weeklyWindow']) assert.ok(REAL_CONFIG.reconstructedWhy[l], l);
    assert.ok(!REAL_CONFIG.reconstructedWhy.jpWindowLevel, 'the old label is gone');
  },
  unknown_rewards_standard() {
    // a raid with no known board gets the standard board of its family (the nearest row of the same family that has one),
    // labelled, without the medals exclusive to that other event; the coins are the standard table, labelled
    const out = build((f) => {
      eventFixture([eventRow('WW-E12-1', 'weekend-only', '2016-09-03', '2016-09-05', ['Trickmaster']), eventRow('WW-E13-1', 'weekend-only', '2016-10-01', '2016-10-03', ['Trickmaster'])])(f);
      withBoards(f);
      f.config.onlyCensusIds = ['WW-E12-1', 'WW-E13-1'];
      f.eventRewards.rows[1].boards = [{ board: 'Weekend Warrior Raid Board', gender: null, completion_reward: '6★ Huey', title: null,
        cells: [{ n: 1, type: 'medal', reward: '6★ Louie', cost: 50 }, { n: 2, type: 'medal', reward: '6★ Magic Mirror', cost: 70 }] }];
      f.eventRewards.rows[1].exclusive_items = { '6★ Magic Mirror': 'this event only' };
    });
    const [none, known] = out.index.entries;
    assert.ok(known.sphereBoardIds.length === 1 && !known.reconstructed.includes('boardStandard'));
    assert.strictEqual(none.sphereBoardIds.length, 1);
    assert.ok(none.reconstructed.includes('boardStandard'));
    assert.notStrictEqual(none.sphereBoardIds[0], known.sphereBoardIds[0], 'its own board, its own progress');
    const masu = out.masuRows.find((m) => m.masuId === none.sphereBoardIds[0]);
    assert.deepStrictEqual(masu.rewardId.slice(0, 2), [90036, 0], 'the exclusive medal is left off');
    assert.ok(none.reconstructed.includes('eventCoins'));
  },
  event_families_only() {
    // lure weeks, rare spawns in ordinary events and rows with no dates are not raid events: reported, not built
    const out = build(eventFixture([eventRow('WW-LUX-1', 'regular-boss lure week', '2016-11-07', '2016-11-13', ['Trickmaster']), eventRow('WW-E4-1', 'monthly', '2017-04-24', '2017-05-01', ['Trickmaster'])]));
    assert.deepStrictEqual(out.index.entries.map((e) => e.censusId), ['WW-E4-1']);
    assert.deepStrictEqual(out.report.skipped.map((s) => s.censusId), ['WW-LUX-1']);
  },
  trickmaster_row() {
    const out = build();
    const e = entry(out, 'Trickmaster');
    const r = enemyOf(out, e.enemyId);
    assert.strictEqual(r.raidDisplayId, 7);
    assert.strictEqual(r.weakness, 1);
    assert.strictEqual(r.validGrowth, 4, 'static era keeps the 2016 knots with flat values');
    assert.deepStrictEqual(r.baseLv.slice(0, 4), [1, 10, 30, 100]);
    assert.deepStrictEqual(r.hp.slice(0, r.validGrowth), Array(4).fill(150000000));
    assert.strictEqual(r.hp[4], 0);
    assert.strictEqual(r.validParts, 2);
    assert.deepStrictEqual(r.parts, [e.enemyId + 1, e.enemyId + 2, 0, 0, 0], 'parts clean beyond validParts');
    assert.deepStrictEqual(r.skillId.slice(2), [0, 0], 'skills clean beyond validSkill');
    for (const [w, id] of [[2, e.enemyId + 1], [3, e.enemyId + 2]]) {
      const p = enemyOf(out, id);
      assert.ok(p, `part ${id}`);
      assert.strictEqual(p.weakness, w);
      assert.deepStrictEqual(p.parts, [0, 0, 0, 0, 0]);
      assert.strictEqual(p.hp[0], 90000000, 'body-to-part ratio of the 2016 row at its first knot');
      assert.strictEqual(p.attack[0], 0);
    }
    // 4.3.1 fields the 2016 rows lack come from the blank row
    assert.strictEqual(r.validLocked, 0);
    assert.strictEqual(r.attackWidth, 0);
    assert.strictEqual(r.bufAttackUpright, 0);
    assert.strictEqual(e.enemyId, 2000000 + 10 * (e.stageId - 980000));
    assert.strictEqual(e.settingId, 30000 + (e.stageId - 980000));
    assert.ok(e.evStageId >= 8000 && e.evStageId <= 8999);
  },
  lux_follows_body_hp() {
    // docs/notes/raid.md «Lux»: sum of luxAttack over body and parts = body HP x 2% / 5, shared as the template's luxAttack
    assert.deepStrictEqual(REAL_CONFIG.lux, { perHpFullDeck: 0.02, fullDeckMultiplier: 5 });
    const out = build((f) => { f.config.lux = REAL_CONFIG.lux; });
    const e = entry(out, 'Trickmaster');
    const body = enemyOf(out, e.enemyId), parts = [enemyOf(out, e.enemyId + 1), enemyOf(out, e.enemyId + 2)];
    for (let k = 0; k < body.validGrowth; k++) {
      assert.strictEqual(body.luxAttack[k] + parts[0].luxAttack[k] + parts[1].luxAttack[k], 600000, `knot ${k}: 150M HP x 0.004`);
      assert.strictEqual(body.luxAttack[k], 360000, '270 : 90 : 90 of the 2016 rows');
    }
    assert.ok(e.reconstructed.includes('lux') && !e.reconstructed.includes('rewards2016'));
    assert.ok(out.index.reasons.lux.length > 20);
    const epic = { body: { validGrowth: 2, hp: [999999999999, 999999999999], luxAttack: [270, 1080], luxSuppress: [68, 272] },
      partRows: [{ luxAttack: [90, 360], luxSuppress: [23, 92] }, { luxAttack: [0, 0], luxSuppress: [0, 0] }] };
    mr.applyLux(epic, REAL_CONFIG.lux);
    assert.strictEqual(epic.body.luxAttack[0] + epic.partRows[0].luxAttack[0], 4000000000, 'Epic: 4B base, 20B with Lux++ on every medal');
    assert.strictEqual(epic.body.luxAttack[0], 3000000000);
    assert.strictEqual(epic.body.luxSuppress[0], Math.round(3000000000 * 68 / 270), 'luxSuppress keeps its ratio');
    assert.strictEqual(epic.partRows[1].luxAttack[0], 0);
    const none = { body: { validGrowth: 1, hp: [1000000], luxAttack: [0], luxSuppress: [0] }, partRows: [{ luxAttack: [0], luxSuppress: [0] }] };
    mr.applyLux(none, REAL_CONFIG.lux);
    assert.deepStrictEqual([none.body.luxAttack[0], none.partRows[0].luxAttack[0]], [4000, 0], 'a template with no Lux: all on the body');
  },
  hp_bar_max() {
    const hpOf = (start, end, tier) => {
      const out = build((f) => addWeek(f, 'X', start, end, tier));
      const e = out.index.entries[0];
      return { hp: enemyOf(out, e.enemyId).hp, rec: e.reconstructed };
    };
    assert.strictEqual(hpOf('2019-10-14', '2019-10-20', 'Advanced').hp[0], 70000000000);
    assert.strictEqual(hpOf('2020-10-05', '2020-10-11', 'Legendary').hp[3], 700000000000);
    assert.strictEqual(hpOf('2021-01-04', '2021-01-10', 'Epic').hp[2], 999999999999);
    assert.strictEqual(hpOf('2020-10-05', '2020-10-11', 'Intermediate').hp[0], 150000000000);
    // between 2019-09-24 (54B) and 2019-09-28 (70B): midpoint 09-26, its Monday 09-23
    const before = hpOf('2019-09-16', '2019-09-22', 'Advanced'), after = hpOf('2019-09-23', '2019-09-29', 'Advanced');
    assert.strictEqual(before.hp[0], 54000000000);
    assert.strictEqual(after.hp[0], 70000000000);
    assert.ok(after.rec.includes('hp_step'), 'a week decided by the midpoint rule is labelled');
    // 08-23 (42B) -> 09-21 (54B): midpoint 09-06, its Monday 09-02
    assert.strictEqual(hpOf('2019-08-26', '2019-09-01', 'Advanced').hp[0], 42000000000);
    assert.strictEqual(hpOf('2019-09-02', '2019-09-08', 'Advanced').hp[0], 54000000000);
    assert.ok(hpOf('2019-09-02', '2019-09-08', 'Advanced').rec.includes('hp_step'));
    assert.ok(!hpOf('2019-10-14', '2019-10-20', 'Advanced').rec.includes('hp_step'), 'inside the range seen on video');
    assert.ok(hpOf('2019-10-14', '2019-10-20', 'Advanced').rec.includes('hp'));
  },
  hp_video_reading_wins_and_is_not_labelled() {
    const out = build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced');
      f.values.week_tier_hp.push({ start: '2019-10-14', tier: 'Advanced', boss: 'Trickmaster', gem_drop: false, hp: 71000000000, confidence: 'video frame' });
    });
    const e = out.index.entries[0];
    assert.strictEqual(enemyOf(out, e.enemyId).hp[0], 71000000000);
    assert.ok(!e.reconstructed.includes('hp'));
  },
  part_hp_derived_wins_over_ratio() {
    const out = build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced');
      f.values.partHpMd = '### Trickmaster\n| hp body: 42,000,000,000 (hard) | LV 1 | JP | 2019-08-12 | x | y |\n| hp part: 7,000,000,000 derived from +349991 | LV 1 | JP | 2019-08-12 | x | inferred |\n### Other\n';
    });
    const e = out.index.entries[0];
    assert.strictEqual(enemyOf(out, e.enemyId + 1).hp[0], Math.round(70000000000 * 7 / 42));
    assert.ok(e.reconstructed.includes('partHp'));
  },
  stage_links() {
    const f = fixture();
    const out = mr.buildRaid(f);
    assert.strictEqual(out.index.entries.length, 2);
    for (const e of out.index.entries) {
      const stage = out.stageRows.find((r) => r.stageId === e.stageId);
      assert.strictEqual(stage.stageKind, 2);
      assert.strictEqual(stage.raidBoss, e.settingId);
      assert.strictEqual(stage.stageBinId, e.stageId);
      assert.strictEqual(stage.validBeforeDrama, 0);
      assert.ok(stage.stageId >= 980000 && stage.stageId <= 989999);
      const setting = out.settingRows.find((r) => r.raidSettingId === stage.raidBoss);
      assert.strictEqual(setting.bossId, e.enemyId);
      assert.strictEqual(setting.rareBossId, e.enemyId);
      assert.deepStrictEqual(setting.unlockRareBossId, [0, 0, 0]);
      assert.strictEqual(setting.bossUpTime, 20);
      assert.strictEqual(setting.useAp, 10);
      assert.ok(enemyOf(out, setting.bossId));
      const world = f.master.world.find((w) => w.worldId === stage.worldId);
      assert.ok(world && !f.config.brokenBackgrounds.includes(world.raidBackground));
      const ev = out.evStageRows.find((r) => r.eventStageId === e.evStageId);
      assert.ok(ev.stageId.includes(e.stageId));
      assert.strictEqual(ev.validStageId, ev.stageId.length);
      assert.strictEqual(ev.eventType, 2);
    }
    assert.strictEqual(out.evStageRows.length, 1, 'one evStage per census row');
  },
  broken_background_falls_back() {
    const out = build((f) => addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Trickmaster', 'Castle Courtyard'));
    const e = out.index.entries[0];
    assert.ok(e.available);
    assert.strictEqual(out.stageRows[0].worldId, 1, 'world 1 bg_DB1');
    assert.ok(e.reconstructed.includes('background'));
    assert.strictEqual(out.maps[0].world, 7, 'the map keeps the room of its own world');
    assert.ok(!entry(build(), 'Trickmaster').reconstructed.includes('background'));
  },
  every_reward_row_exists() {
    const out = build();
    const ids = new Set(out.rewardRows.map((r) => r.raidRewardId));
    const skills = new Set([...out.attackRows.map((r) => r.raidEnemyAttackId), 101]);
    const bodies = out.enemyRows.filter((r) => r.weakness === 1);
    assert.strictEqual(bodies.length, 2);
    for (const r of bodies) {
      for (const k of ['rewardId', 'mvpRewardId', 'destroyAllRewardId']) {
        const list = r[k].slice(0, r.validGrowth);
        assert.ok(list.length && list.every((x) => ids.has(x)), `${k} of ${r.raidEnemyId}`);
      }
      assert.ok(r.skillId.slice(0, r.validSkill).every((x) => skills.has(x)));
    }
    assert.ok(out.rewardRows.every((r) => r.type[0] === 16));
    // ids by the rule of raid-rewards.js: Advanced is tier 3
    const e = entry(out, 'Blue Trident Tail');
    assert.strictEqual(enemyOf(out, e.enemyId).rewardId[0], rr.rewardRowId(e.enemyId, 1, 3));
  },
  gem_drop_own_row() {
    const out = build((f) => {
      f.census.rows.push(censusRow('X', '2020-03-16', '2020-03-22', ['Trickmaster'], 'Advanced (Gem Drop)'));
      f.values.weeks.push(week('2020-03-16', '2020-03-22', 'Advanced', 'Trickmaster', 'Curious Room', { gem_drop: true }));
      f.config.onlyCensusIds = ['X'];
    });
    const e = out.index.entries[0];
    assert.strictEqual(e.gemDrop, true);
    assert.strictEqual(e.key, 'X/Advanced+gem');
    const row = out.rewardRows.find((r) => r.raidRewardId === enemyOf(out, e.enemyId).rewardId[0]);
    assert.strictEqual(row.validReward, 4);
    assert.strictEqual(out.stageRows[0].name, '(Advanced) Gem Drop: Raid Time!');
  },
  unavailable_not_emitted() {
    const out = build((f) => { f.models['0007'] = { fight: false, start: true, escape: true, put_down: true }; });
    const e = entry(out, 'Trickmaster');
    assert.strictEqual(e.available, false);
    assert.strictEqual(e.why, 'graphics');
    assert.ok(!enemyOf(out, e.enemyId));
    assert.ok(!out.stageRows.some((r) => r.stageId === e.stageId));
    assert.ok(!out.settingRows.some((r) => r.raidSettingId === e.settingId));
    assert.strictEqual(out.stageRows.length, 1, 'the other tier stays');
    assert.deepStrictEqual(out.evStageRows[0].stageId, [entry(out, 'Blue Trident Tail').stageId]);
    // put_down false is unavailable too; no models file: nothing at all
    const noPutDown = build((f) => { f.models['0007'] = { fight: true, put_down: false }; });
    assert.strictEqual(entry(noPutDown, 'Trickmaster').available, false);
    const none = build((f) => { f.models = null; });
    assert.ok(none.index.entries.every((x) => !x.available && x.why === 'graphics'));
    assert.deepStrictEqual([none.stageRows.length, none.enemyRows.length, none.evStageRows.length, none.maps.length], [0, 0, 0, 0]);
  },
  weak_points_need_a_part() {
    // slots of raid_models.json: the model's weak points (parts<N> of the wait LWF). The client dereferences a raidEnemy row
    // for every one of them at fight load, so a slot with no part of that weakness crashes it (Queen Bee, Lion Headliner).
    const ok = build((f) => { f.models['0007'].slots = [1, 2, 3]; f.models[1003].slots = [1, 2]; });
    assert.deepStrictEqual(ok.index.entries.map((e) => [e.boss, e.available]), [['Trickmaster', true], ['Blue Trident Tail', true]]);
    // an extra part with no weak point in the model is harmless (Jack in the Box: 2 weak points, 3 parts)
    assert.strictEqual(entry(build((f) => { f.models['0007'].slots = [1, 2]; }), 'Trickmaster').available, true);
    const out = build((f) => { f.models['0007'].slots = [1, 2, 3, 4, 5]; });
    const e = entry(out, 'Trickmaster');
    assert.deepStrictEqual([e.available, e.why, e.missingSlots], [false, 'parts', [4, 5]]);
    assert.ok(!enemyOf(out, e.enemyId));
    assert.ok(!out.stageRows.some((r) => r.stageId === e.stageId));
    assert.ok(!out.settingRows.some((r) => r.raidSettingId === e.settingId));
    assert.strictEqual(entry(out, 'Blue Trident Tail').available, true, 'the other boss stays');
    // no slots in the file (LWF in the base resources, not parsed): no check
    assert.strictEqual(entry(build(), 'Trickmaster').available, true);
  },
  model_key_is_four_digits() {
    const out = build((f) => { f.models = { '0007': { fight: true, start: true, escape: true, put_down: true }, 1003: { fight: true, start: true, escape: true, put_down: true } }; });
    assert.deepStrictEqual(out.index.entries.map((e) => [e.modelId, e.available, e.why]), [[7, true, null], [1003, true, null]]);
    assert.strictEqual(entry(out, 'Trickmaster').modelId, 7, 'the index keeps the number, the file has the folder name');
    // the unpadded form is not a key of the real file
    const bare = build((f) => { f.models = { 7: { fight: true, put_down: true } }; });
    assert.strictEqual(entry(bare, 'Trickmaster').why, 'graphics');
  },
  no_template_is_unavailable() {
    const out = build((f) => addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem'));
    assert.strictEqual(out.index.entries[0].available, false);
    assert.strictEqual(out.index.entries[0].why, 'template');
  },
  ids_stable_when_the_filter_goes() {
    const narrow = entry(build(), 'Trickmaster');
    const wide = entry(build((f) => { f.census.rows[0].id = 'WW-X'; delete f.config.onlyCensusIds; }), 'Trickmaster');
    assert.strictEqual(narrow.stageId, wide.stageId);
    assert.strictEqual(narrow.enemyId, wide.enemyId);
  },
  single_era_row() {
    const out = build((f) => addWeek(f, 'X', '2018-11-05', '2018-11-11', 'single'));
    const e = out.index.entries[0];
    const r = enemyOf(out, e.enemyId);
    assert.deepStrictEqual(r.baseLv, [1, 10, 20, 30, 99]);
    assert.strictEqual(r.validGrowth, 5);
    assert.strictEqual(r.hp[3], 1200000000);
    assert.strictEqual(r.hp[4], 1200000000);
    assert.ok(r.hp[0] < r.hp[1] && r.hp[1] < r.hp[2]);
    assert.ok(e.reconstructed.includes('hp'));
    assert.strictEqual(new Set(r.rewardId).size, 4, 'four level bands');
    const ids = new Set(out.rewardRows.map((x) => x.raidRewardId));
    assert.ok(r.rewardId.every((x) => ids.has(x)));
    assert.strictEqual(enemyOf(out, e.enemyId + 1).validGrowth, 5);
  },
  single_after_the_tiers_is_beginner() {
    const out = build((f) => addWeek(f, 'X', '2019-08-26', '2019-08-31', 'single'));
    const e = out.index.entries[0];
    assert.strictEqual(e.tier, 'Beginner');
    assert.strictEqual(enemyOf(out, e.enemyId).hp[0], 150000000);
  },
  eggcognito_quest() {
    const out = build();
    const e = entry(out, 'Blue Trident Tail');
    const m = out.maps.find((x) => x.stageId === e.stageId);
    assert.strictEqual(m.target, 'Eggcognito');
    assert.strictEqual(m.targetId, 100);
    assert.strictEqual(m.targetReward, 1);
    assert.strictEqual(m.enemies.flat().reduce((n, x) => n + x.n, 0), 2, 'one target plus two');
    assert.ok(m.enemies.flat().every((x) => x.enemyId === 100 && x.reward === 1));
    assert.strictEqual(m.level, 125);
    assert.strictEqual(m.room, 'Morning Dew Grove: Clearing');
    const s = out.stageRows.find((r) => r.stageId === e.stageId);
    assert.strictEqual(s.validSubmission, 3);
    assert.deepStrictEqual(s.submissionRewardType, [16, 16, 16]);
    assert.deepStrictEqual(s.submissionItemNum, [5, 5, 5]);
    assert.strictEqual(s.submissionRequire[2], 37);
    assert.strictEqual(s.submissionNum[2], 30);
    assert.strictEqual(s.useAp, 90);
    assert.deepStrictEqual(e.questAp, [0, 5, 90]);
    assert.deepStrictEqual(e.boards, ['Enhancement Boards']);
    assert.strictEqual(e.upMinutes, 20);
    assert.strictEqual(e.useAp, 10);
    assert.strictEqual(e.map, 'Morning Dew Grove: Clearing');
  },
  quest_level_slip_on_gem_beginner() {
    const out = build((f) => {
      f.census.rows.push(censusRow('X', '2020-03-16', '2020-03-22', ['Trickmaster'], 'Beginner (Gem Drop)'));
      f.values.weeks.push(week('2020-03-16', '2020-03-22', 'Beginner', 'Trickmaster', 'Curious Room', { gem_drop: true, quest_lv: '125' }));
      f.config.onlyCensusIds = ['X'];
    });
    assert.strictEqual(out.maps[0].level, 25);
  },
  detail_url_on_rows() {
    // Details of a raid banner: its original notice (game_data/raid_notices.json of make-raid-notices.js), none without one
    const f = fixture();
    f.master.stage.push({ stageId: 970000, id: 970000, stageKind: 2, worldId: 1, mapName: 'Training', raidBoss: 0, name: 'Training Grounds', useAp: 0 });
    const plain = mr.buildRaid(f);
    assert.ok(plain.evStageRows.length && plain.evStageRows.every((r) => r.detailUrl === ''), 'no notices file: no Details');
    const out = mr.buildRaid({ ...fixture(), master: f.master, notices: { rows: { [W1]: { noticeId: 51000 } }, notices: {} } });
    const ev = out.index.entries.find((e) => e.censusId === W1).evStageId;
    assert.strictEqual(out.evStageRows.find((r) => r.eventStageId === ev).detailUrl, `/web/raid/notice/${ev}`);
    assert.strictEqual(out.catalogEvStage.detailUrl, '/web/raid/catalog', 'the Raid Catalog banner keeps its page');
    const other = mr.buildRaid({ ...fixture(), master: f.master, notices: { rows: { 'WW-W-1999-01-01': { noticeId: 1 } }, notices: {} } });
    assert.ok(other.evStageRows.every((r) => r.detailUrl === ''), 'a row without a notice: no dead button');
  },
  catalog_banner_row() {
    // Task 9: the Raid Catalog banner, evStage 8000 (kept free by the numbering), Details -> /web/raid/catalog, a tap opens
    // the Training Grounds of the Special Catalog (970000): an evStage needs a quest
    const f = fixture();
    f.master.stage.push({ stageId: 970000, id: 970000, stageKind: 2, worldId: 1, mapName: 'Training', raidBoss: 0, name: 'Training Grounds', useAp: 0 });
    const out = mr.buildRaid(f);
    const row = out.catalogEvStage;
    assert.ok(row, 'catalogue row');
    assert.deepStrictEqual([row.eventStageId, row.validStageId, row.stageId, row.stageStartId, row.stageEndId], [8000, 1, [970000], 970000, 970000]);
    assert.deepStrictEqual([row.eventCategory, row.eventType, row.detailUrl], [2, 0, '/web/raid/catalog']);
    assert.strictEqual(row.bannerUrl, `/web/raid/img/v${require('./routes-raid').RAID_IMG_VERSION}/8000.png`);
    for (const k of ['startTime', 'endTime', 'endDispTime', 'boardEndTime']) assert.ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row[k]), k);
    assert.deepStrictEqual(out.index.catalog, { evStageId: 8000, stageIds: [970000], useAp: [0] });
    assert.ok(!out.evStageRows.some((r) => r.eventStageId === 8000), 'not one of the raid rows');
    assert.ok(!Object.values(out.ids.rows).includes(0), 'no census row takes 8000');
    // without the Training Grounds row (Special not built): no banner
    const none = build();
    assert.strictEqual(none.catalogEvStage, null);
    assert.strictEqual(none.index.catalog, undefined);
    // patch writes it in evStage and lists it as ours, so the next run drops it first
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const master = path.join(dir, 'master'), game = path.join(dir, 'game');
    fs.mkdirSync(master); fs.mkdirSync(game);
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(master, n + '.json'), JSON.stringify(rows));
    const opts = { gameDataDir: game, idsFile: path.join(game, 'raid_ids.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config };
    mr.patch(master, opts);
    mr.patch(master, opts);
    const ev = JSON.parse(fs.readFileSync(path.join(master, 'evStage.json'), 'utf8'));
    assert.strictEqual(ev.filter((r) => r.eventStageId === 8000).length, 1, 'once after two runs');
    const index = JSON.parse(fs.readFileSync(path.join(game, 'raids.json'), 'utf8'));
    assert.deepStrictEqual(index.catalog, { evStageId: 8000, stageIds: [970000], useAp: [0] });
    assert.ok(index.own.evStage.includes(8000));
    fs.rmSync(dir, { recursive: true, force: true });
  },
  idempotent() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const master = path.join(dir, 'master'), game = path.join(dir, 'game');
    fs.mkdirSync(master); fs.mkdirSync(game);
    const f = fixture();
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(master, n + '.json'), JSON.stringify(rows));
    const opts = { gameDataDir: game, idsFile: path.join(game, 'raid_ids.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config };
    const snap = () => Object.fromEntries([...fs.readdirSync(master).map((n) => [n, path.join(master, n)]), ...fs.readdirSync(game).map((n) => [n, path.join(game, n)])].map(([n, p]) => [n, fs.readFileSync(p, 'utf8')]));
    mr.patch(master, opts);
    const first = snap();
    assert.ok(JSON.parse(first['stage.json']).some((r) => r.stageId >= 980000));
    assert.ok(first['raids.json'] && first['raid_maps.json']);
    mr.patch(master, opts);
    assert.deepStrictEqual(snap(), first);
    // a row in the range that the previous run did not list is not ours
    const stage = JSON.parse(first['stage.json']);
    stage.push({ stageId: 989999, id: 989999 });
    fs.writeFileSync(path.join(master, 'stage.json'), JSON.stringify(stage));
    assert.throws(() => mr.patch(master, opts), /989999/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  patch_writes_nothing_without_sources() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const log = console.warn; const warned = [];
    console.warn = (s) => warned.push(s);
    const save = process.env.KHUX_RAID_SRC;
    process.env.KHUX_RAID_SRC = path.join(dir, 'none');
    try {
      assert.strictEqual(mr.patch(dir, { gameDataDir: dir }), null);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
      assert.ok(warned.length);
    } finally { console.warn = log; if (save === undefined) delete process.env.KHUX_RAID_SRC; else process.env.KHUX_RAID_SRC = save; fs.rmSync(dir, { recursive: true, force: true }); }
    process.env.KHUX_RAID = '0';
    try { assert.strictEqual(mr.patch(dir), null); } finally { delete process.env.KHUX_RAID; }
  },
  no_models_warns_and_emits_no_rows() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const f = fixture();
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
    const log = console.warn; const warned = [];
    console.warn = (s) => warned.push(s);
    try {
      const out = mr.patch(dir, { gameDataDir: dir, idsFile: path.join(dir, 'raid_ids.json'), modelsFile: path.join(dir, 'absent.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, config: f.config });
      assert.strictEqual(out.stageRows.length, 0);
      assert.ok(warned.some((s) => /raid_models/.test(s)));
    } finally { console.warn = log; fs.rmSync(dir, { recursive: true, force: true }); }
  },
  id_collision_stops() {
    for (const [table, row, re] of [['stage', { stageId: 980005 }, /stage.*980005/], ['evStage', { eventStageId: 8500 }, /evStage.*8500/], ['raidSetting', { raidSettingId: 30001 }, /raidSetting.*30001/], ['raidEnemy', { raidEnemyId: 2000015 }, /raidEnemy.*2000015/]]) {
      assert.throws(() => build((f) => f.master[table].push(row)), re);
    }
  },
  corrections_applied() {
    const out = build((f) => {
      f.census.rows.push(censusRow('WW-W-2021-02-22', '2021-02-22', '2021-02-28', ['Gear Golem'], 'Beginner; Epic (Gem Drop)'));
      for (const t of ['Beginner', 'Epic']) f.values.weeks.push(week('2020-02-22', '2020-02-28', t, 'Gear Golem', 'Fountain Square', { gem_drop: true }));
      f.config.onlyCensusIds = ['WW-W-2021-02-22'];
    });
    assert.strictEqual(out.index.entries.length, 2);
    assert.ok(out.index.entries.every((e) => e.start === '2021-02-22' && e.end === '2021-02-28' && e.censusId === 'WW-W-2021-02-22'));
    // sources stay untouched
    const f = fixture();
    f.values.weeks.push(week('2020-02-22', '2020-02-28', 'Beginner', 'Gear Golem', 'Fountain Square'));
    const before = JSON.stringify(f.values.weeks);
    mr.buildRaid(f);
    assert.strictEqual(JSON.stringify(f.values.weeks), before);
  },
  reconstructed_labelled() {
    const e = entry(build(), 'Trickmaster');
    for (const k of ['atk', 'def', 'hp', 'partHp', 'upMinutes']) assert.ok(e.reconstructed.includes(k), k);
    const out = build();
    const r = enemyOf(out, e.enemyId), a = enemyOf(out, entry(out, 'Blue Trident Tail').enemyId);
    assert.deepStrictEqual(r.attack.slice(0, 4), Array(4).fill(1100));
    assert.deepStrictEqual(r.defense.slice(0, 4), Array(4).fill(1000));
    assert.strictEqual(a.attack[0], 1300);
    assert.strictEqual(a.defense[0], 1100, 'rare 2');
    const part = enemyOf(out, e.enemyId + 1);
    assert.strictEqual(part.defense[0], 100, 'part base DEF / body base DEF of the 2016 row, times the table');
  },
  epic_def() {
    const out = build((f) => addWeek(f, 'X', '2021-01-04', '2021-01-10', 'Epic'));
    assert.strictEqual(enemyOf(out, out.index.entries[0].enemyId).defense[0], 50000);
  },
  deduce_stats() {
    const ref = { enemyId: 80001, name: 'Shadow', validGrowth: 2, baseLv: [1, 101], attack: [100, 1100] };
    const s = mr.deduceStats({
      raidEnemy2016: [{ raidEnemyId: 7, name: 'A', validGrowth: 2, baseLv: [1, 101, 0], attack: [1000, 22000, 0] }, { raidEnemyId: 8, name: 'B', validGrowth: 1, baseLv: [1], attack: [3000] }, { raidEnemyId: 9, name: 'NotWeekly', validGrowth: 1, baseLv: [1], attack: [90000] }],
      weeklyBosses: ['A', 'B', 'Unknown'],
      enemy: [ref, { enemyId: 500, name: 'Foe', validGrowth: 2, baseLv: [1, 101], attack: [100, 1100] }, { enemyId: 100, name: 'Eggcognito', validGrowth: 2, baseLv: [1, 101], attack: [9999, 9999] }],
      stage: [{ stageId: 1, id: 1, stageKind: 1 }, { stageId: 2, id: 2, stageKind: 1 }, { stageId: 3, id: 3, stageKind: 1 }],
      poi: { 1: { enemies: [{ enemyId: 500 }, { enemyId: 100 }] }, 2: { enemies: [{ enemyId: 500 }] }, 3: { enemies: [{ enemyId: 500 }] } },
      questLevels: new Map([[1, 101], [2, 51], [3, 1]]),
      story: [[1, 1, '2019-01-01'], [2, 2, '2019-02-01'], [3, 3, '2019-03-01']],
      config: { refEnemyId: 80001, tierQuestLv: { single: 25, Beginner: 1, Intermediate: 51, Advanced: 101, Legendary: 101, Epic: 101 }, def: { base: 1000, omega: 1100, epic: 50000 } },
    });
    // ratios 10, 20, 30: median 20; story ATK 1100, then 600 kept at the running maximum (merged), and 100 too
    assert.strictEqual(s.ratio.median, 20);
    assert.strictEqual(s.ratio.bosses, 2);
    assert.strictEqual(s.periods.length, 1);
    assert.strictEqual(s.periods[0].atk.Advanced, 22000);
    assert.strictEqual(s.periods[0].atk.single, 22000);
    assert.strictEqual(s.periods[0].atk.Beginner, 2000, '22000 x 100/1100');
    assert.strictEqual(s.reconstructed, true);
    assert.ok(!JSON.stringify(s).includes('NotWeekly'));
  },
  ids_survive_inserted_row() {
    const first = build();
    const before = entry(first, 'Trickmaster'), other = entry(first, 'Blue Trident Tail');
    const next = build((f) => {
      f.ids = first.ids;
      // a row inserted before ours, and the tier rows in another order
      f.census.rows.unshift(censusRow('WW-NEW', '2019-08-19', '2019-08-25', ['Trickmaster'], 'Beginner'));
      f.values.weeks.reverse();
      f.values.weeks.unshift(week('2019-08-19', '2019-08-25', 'Beginner', 'Trickmaster', 'Curious Room'));
      f.config.onlyCensusIds = [W1, 'WW-NEW'];
    });
    const ours = next.index.entries.filter((e) => e.censusId === W1);
    for (const k of ['stageId', 'evStageId', 'settingId', 'enemyId']) {
      assert.strictEqual(ours.find((e) => e.boss === 'Trickmaster')[k], before[k], k);
      assert.strictEqual(ours.find((e) => e.boss === 'Blue Trident Tail')[k], other[k], k);
    }
    const added = next.index.entries.find((e) => e.censusId === 'WW-NEW');
    assert.ok(added.stageId > Math.max(before.stageId, other.stageId), 'the new key takes the next free number');
    assert.ok(added.evStageId > before.evStageId);
  },
  id_of_a_gone_key_is_never_reused() {
    const first = build();
    const gone = entry(first, 'Blue Trident Tail');
    const next = build((f) => {
      f.ids = first.ids;
      f.values.weeks = f.values.weeks.filter((w) => w.boss !== 'Blue Trident Tail');
      f.census.rows.push(censusRow('WW-NEW', '2019-08-19', '2019-08-25', ['Trickmaster'], 'Beginner'));
      f.values.weeks.push(week('2019-08-19', '2019-08-25', 'Beginner', 'Trickmaster', 'Curious Room'));
      f.config.onlyCensusIds = [W1, 'WW-NEW'];
    });
    assert.ok(gone.key in next.ids.entries, 'the key stays in the file');
    assert.ok(next.index.entries.every((e) => e.stageId !== gone.stageId));
  },
  repeated_id_number_throws() {
    const first = build();
    const dupEntries = JSON.parse(JSON.stringify(first.ids));
    const keys = Object.keys(dupEntries.entries);
    dupEntries.entries[keys[1]] = dupEntries.entries[keys[0]];
    assert.throws(() => build((f) => { f.ids = dupEntries; }), /repeat/);
    const dupRows = JSON.parse(JSON.stringify(first.ids));
    dupRows.rows.X = dupRows.rows[W1];
    assert.throws(() => build((f) => { f.ids = dupRows; }), /repeat/);
  },
  ids_cover_every_ww_row_under_the_filter() {
    const out = build((f) => {
      f.census.rows.push(censusRow('WW-OTHER', '2020-01-06', '2020-01-12', ['Trickmaster'], 'Beginner'), censusRow('WW-NOWEEK', '2020-01-13', '2020-01-19', ['Trickmaster'], 'x'));
      f.values.weeks.push(week('2020-01-06', '2020-01-12', 'Beginner', 'Trickmaster', 'Curious Room'));
    });
    assert.strictEqual(out.index.entries.length, 2, 'the filter still limits the rows built');
    assert.ok('WW-OTHER/Beginner' in out.ids.entries);
    assert.ok('WW-OTHER' in out.ids.rows && 'WW-NOWEEK' in out.ids.rows);
  },
  duplicate_key_throws() {
    assert.throws(() => build((f) => { f.values.weeks.push(week('2019-10-07', '2019-10-13', 'Beginner', 'Blue Trident Tail', 'Curious Room')); }), /WW-W-2019-10-07\/Beginner/);
    // one tier row claimed by two census rows
    assert.throws(() => build((f) => {
      f.census.rows.push(censusRow('WW-TWIN', '2019-10-07', '2019-10-13', ['Trickmaster'], 'Beginner'));
      f.config.onlyCensusIds = [W1, 'WW-TWIN'];
    }), /WW-TWIN/);
  },
  ids_file_written_and_kept() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const f = fixture();
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
    const idsFile = path.join(dir, 'raid_ids.json');
    const opts = { gameDataDir: dir, idsFile, sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config };
    try {
      const a = mr.patch(dir, opts);
      const saved = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
      assert.strictEqual(saved.entries[`${W1}/Beginner`], a.index.entries[0].stageId - 980000);
      assert.strictEqual(saved.rows[W1], a.index.entries[0].evStageId - 8000);
      // a key removed from the census stays in the file
      opts.sources = { ...opts.sources, values: { ...f.values, weeks: f.values.weeks.filter((w) => w.tier === 'Beginner') } };
      mr.patch(dir, opts);
      assert.ok(`${W1}/Advanced` in JSON.parse(fs.readFileSync(idsFile, 'utf8')).entries);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  },
  every_label_has_a_reason() {
    const variants = [build(), build((f) => addWeek(f, 'X', '2018-11-05', '2018-11-11', 'single')), build((f) => addWeek(f, 'X', '2019-09-23', '2019-09-29', 'Advanced')),
      build((f) => addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Trickmaster', 'Castle Courtyard')),
      build((f) => { addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem'); f.config.modelTemplates = { 'Gear Golem': 7 }; })];
    const seen = new Set();
    for (const out of variants) {
      for (const e of out.index.entries) {
        assert.ok(e.reconstructed.includes('rewards2016'), e.key);
        for (const l of e.reconstructed) { seen.add(l); assert.ok(typeof out.index.reasons[l] === 'string' && out.index.reasons[l].length > 20, `no reason for ${l}`); }
      }
    }
    for (const l of ['atk', 'def', 'coinOdds', 'hp', 'hp_step', 'moves', 'background', 'rewards2016', 'atk_curve']) assert.ok(seen.has(l), l);
    assert.ok(/spike/.test(REAL_CONFIG.reconstructedWhy.def) && /statsRule/.test(REAL_CONFIG.reconstructedWhy.def) && /--stats/.test(REAL_CONFIG.reconstructedWhy.def));
    assert.throws(() => build((f) => { f.config.reconstructedWhy = {}; }), /reason/);
    // written to raids.json
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const f = fixture();
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
    try {
      mr.patch(dir, { gameDataDir: dir, idsFile: path.join(dir, 'raid_ids.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config });
      assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'raids.json'), 'utf8')).reasons.rewards2016);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  },
  template_gap_is_reported() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
    const f = fixture();
    addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem');
    f.config.onlyCensusIds = ['X', W1];
    delete f.models[1003];
    delete f.models['0007'];
    for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
    const warn = console.warn, log = console.log; const warned = [], logged = [];
    console.warn = (s) => warned.push(s); console.log = (s) => logged.push(s);
    try {
      mr.patch(dir, { gameDataDir: dir, idsFile: path.join(dir, 'raid_ids.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config });
    } finally { console.warn = warn; console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
    assert.ok(warned.some((s) => /Gear Golem/.test(s) && /template/.test(s)), warned.join('|'));
    assert.ok(!warned.some((s) => /Blue Trident Tail/.test(s)), 'a boss without graphics is not a template gap');
    assert.ok(logged.some((s) => /template 1/.test(s) && /graphics 2/.test(s)), logged.join('|'));
  },
  template_with_own_attribute() {
    // Task 8 fix: a boss on a template row keeps the template's moves and parts, and takes its own attribute when set
    const out = build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem');
      f.config.onlyCensusIds = ['X'];
      f.config.modelTemplates = { 'Gear Golem': 7 };
      f.config.bossAttributes = { 'Gear Golem': 1 };
    });
    const e = entry(out, 'Gear Golem');
    assert.ok(e.available, e.why);
    const body = enemyOf(out, e.enemyId);
    assert.strictEqual(body.raidDisplayId, 21, 'its own model');
    assert.strictEqual(body.validParts, 2, 'the parts of the template');
    assert.deepStrictEqual([body, ...body.parts.slice(0, 2).map((id) => enemyOf(out, id))].map((r) => r.attribute), [1, 1, 1]);
    assert.ok(e.reconstructed.includes('moves') && e.reconstructed.includes('attribute'));
    // without bossAttributes: the template's attribute, no label
    const plain = entry(build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem');
      f.config.onlyCensusIds = ['X'];
      f.config.modelTemplates = { 'Gear Golem': 7 };
    }), 'Gear Golem');
    assert.ok(!plain.reconstructed.includes('attribute'));
    // the shipped config: the three spiders and Egg Master have a template, each spider its colour's attribute
    for (const [b, id] of Object.entries({ 'Scourge Spider': 5000, 'Wicked Spider': 5000, 'Malicious Spider': 5000, 'Egg Master': 7 })) assert.strictEqual(REAL_CONFIG.modelTemplates[b], id);
    for (const [b, a] of Object.entries({ 'Scourge Spider': 1, 'Wicked Spider': 2, 'Malicious Spider': 3 })) assert.strictEqual(REAL_CONFIG.bossAttributes[b], a);
  },
  model_parts_cap() {
    // Raids Part 2 serving: modelParts keeps only the first N parts of the template row (spiders in the weekly era: body +
    // Spinneret, the template's first part, weakness 2; the spiderlings of 5000 had no bar from Sep 2018)
    const out = build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem');
      f.config.onlyCensusIds = ['X'];
      f.config.modelTemplates = { 'Gear Golem': 7 };
      f.config.modelParts = { 'Gear Golem': 1 };
    });
    const e = entry(out, 'Gear Golem');
    assert.ok(e.available, e.why);
    const body = enemyOf(out, e.enemyId);
    assert.strictEqual(body.validParts, 1);
    assert.deepStrictEqual(body.parts, [e.enemyId + 1, 0, 0, 0, 0, 0].slice(0, body.parts.length));
    const part = enemyOf(out, e.enemyId + 1);
    assert.strictEqual(part.weakness, 2);
    assert.strictEqual(part.hp[0], Math.round(body.hp[0] * 7200 / 12000), 'HP share of the template part');
    assert.ok(!enemyOf(out, e.enemyId + 2), 'no row for the capped part');
    // a cap above the template's parts changes nothing; another boss is not capped
    const wide = build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Gear Golem');
      f.config.onlyCensusIds = ['X'];
      f.config.modelTemplates = { 'Gear Golem': 7 };
      f.config.modelParts = { 'Gear Golem': 4, 'Trickmaster': 1 };
    });
    assert.strictEqual(enemyOf(wide, entry(wide, 'Gear Golem').enemyId).validParts, 2);
    // the shipped config: the three spiders keep the 4 parts of 5000 (Spinneret + 3 spiderlings, coordinator ruling 2 Nov:
    // their only LWFs with the Spinneret mark the spiderlings as weak points too, so 1 part would crash, see spiders_*)
    assert.deepStrictEqual(REAL_CONFIG.modelParts, { 'Scourge Spider': 4, 'Wicked Spider': 4, 'Malicious Spider': 4 });
  },
  reconstructed_bosses_have_templates() {
    // render7/TEMPLATES15 (coordinator ruling 2 Nov): the 15 reconstructed bosses get a 2016 template row whose part
    // weaknesses equal the model's weak points; with the real raid_models.json slots no entry is `template` or `parts`
    const FIFTEEN = ['Assault Dragon', 'Adventurer', 'Jewel Princess', 'Gear Golem', 'Heartless Tsum', 'Loudmouth Parade', 'Greedy Grouch',
      'Mysterious Sir', 'Merry-Go-Rowdy', 'Holiday Sleigh', 'Demon Tide', 'Cranky Cake', 'Mischief Bouquet', 'Red-Nosed Chariot', 'Closehanded Captain'];
    for (const b of FIFTEEN) assert.ok(Number.isInteger(REAL_CONFIG.modelTemplates[b]), `template of ${b}`);
    // render9 (user decision 4 Nov), same rule: Savage Spider, Fortress Crab, Behemoth; body attribute from the wiki
    const R9 = { 'Jewel Sorceress': [11, 3], 'Circus Crab': [13, 1], 'Crabby Cake': [3, 3] };
    for (const [b, [tpl, attr]] of Object.entries(R9)) {
      assert.strictEqual(REAL_CONFIG.modelTemplates[b], tpl, `template of ${b}`);
      assert.strictEqual(REAL_CONFIG.bossAttributes[b], attr, `attribute of ${b}`);
    }
    const real = realInputs();
    if (!real) return;
    const file = path.join(__dirname, 'game_data', 'raid_models.json');
    if (!fs.existsSync(file)) { console.log('  (skipped: no raid_models.json)'); return; }
    const out = mr.buildRaid({ ...real, models: JSON.parse(fs.readFileSync(file, 'utf8')) });
    const mine = out.index.entries.filter((e) => FIFTEEN.includes(e.boss));
    assert.ok(mine.length > 0);
    assert.deepStrictEqual(mine.filter((e) => !e.available).map((e) => `${e.key} ${e.why} ${e.missingSlots || ''}`), []);
    // no boss at all is left without a template or with an unpaired weak point
    assert.deepStrictEqual(out.index.entries.filter((e) => e.why === 'template' || e.why === 'parts').map((e) => e.key), []);
  },
  spiders_cover_every_weak_point() {
    // weekly-era spider LWFs (parts2 revisions) have weak points parts1-5: with the shipped modelTemplates / modelParts the
    // spiders get 4 parts of weakness 2-5 from 5000 and stay available under the weak-point rule
    const spider = (cap) => build((f) => {
      addWeek(f, 'X', '2019-10-14', '2019-10-20', 'Advanced', 'Scourge Spider');
      f.config.onlyCensusIds = ['X'];
      f.census.bosses.push({ ww: 'Scourge Spider', raid_model_id: 9101 });
      f.orig2016.raidEnemy.push(body2016(5000, 'Enraged Arachnid', 1, [50000002, 50000003, 50000004, 50000005]),
        part2016(50000002, 2), part2016(50000003, 3), part2016(50000004, 4), part2016(50000005, 5));
      f.orig2016.raidEnemyAttack.push(attack2016(500001), attack2016(500002));
      f.models[9101] = { fight: true, start: true, escape: true, put_down: true, slots: [1, 2, 3, 4, 5] };
      f.config.modelTemplates = { 'Scourge Spider': REAL_CONFIG.modelTemplates['Scourge Spider'] };
      f.config.modelParts = { 'Scourge Spider': cap };
    });
    const out = spider(REAL_CONFIG.modelParts['Scourge Spider']);
    const e = entry(out, 'Scourge Spider');
    assert.ok(e.available, e.why);
    const body = enemyOf(out, e.enemyId);
    assert.strictEqual(body.validParts, 4);
    assert.deepStrictEqual(body.parts.slice(0, 4).map((id) => enemyOf(out, id).weakness), [2, 3, 4, 5]);
    // one part (the weekly-era layout) leaves slots 3-5 empty: withheld, it would crash at fight load
    const one = entry(spider(1), 'Scourge Spider');
    assert.deepStrictEqual([one.available, one.why, one.missingSlots], [false, 'parts', [3, 4, 5]]);
  },
  corrupt_or_missing_table_throws() {
    const setup = () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkraid-'));
      const f = fixture();
      for (const [n, rows] of Object.entries(f.master)) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
      return { dir, opts: { gameDataDir: dir, idsFile: path.join(dir, 'raid_ids.json'), sources: { census: f.census, values: f.values, rewards: f.rewards, orig2016: f.orig2016 }, models: f.models, config: f.config } };
    };
    // corrupt JSON in any file we read: throws and leaves stage.json as it was
    for (const name of ['stage.json', 'evStage.json', 'raidSetting.json', 'raidReward.json', 'raidEnemy.json', 'raidEnemyAttack.json', 'world.json', 'raids.json', 'raid_ids.json']) {
      const { dir, opts } = setup();
      try {
        fs.writeFileSync(path.join(dir, name), '{"truncated": [');
        const stageBefore = fs.readFileSync(path.join(dir, 'stage.json'), 'utf8');
        assert.throws(() => mr.patch(dir, opts), new RegExp(name.replace('.', '\\.')), name);
        assert.strictEqual(fs.readFileSync(path.join(dir, 'stage.json'), 'utf8'), stageBefore, name);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    { // corrupt models file: not the same as no models file
      const { dir, opts } = setup();
      delete opts.models; opts.modelsFile = path.join(dir, 'raid_models.json');
      fs.writeFileSync(opts.modelsFile, '{');
      try { assert.throws(() => mr.patch(dir, opts), /raid_models\.json/); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    // a table that must exist: missing stops the run, and so does an empty stage table
    for (const name of ['stage.json', 'world.json', 'raidEnemy.json', 'raidEnemyAttack.json']) {
      const { dir, opts } = setup();
      fs.rmSync(path.join(dir, name));
      try { assert.throws(() => mr.patch(dir, opts), new RegExp(name.replace('.', '\\.')), name); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    { const { dir, opts } = setup(); fs.writeFileSync(path.join(dir, 'stage.json'), '[]'); try { assert.throws(() => mr.patch(dir, opts), /stage\.json/); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
    // those that may legitimately be absent do not stop it
    for (const name of ['evStage.json', 'raidSetting.json', 'raidReward.json', 'raids.json', 'raid_ids.json']) {
      const { dir, opts } = setup();
      fs.rmSync(path.join(dir, name), { force: true });
      const log = console.log; console.log = () => {};
      try { assert.strictEqual(mr.patch(dir, opts).stageRows.length, 2, name); } finally { console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
    }
  },
  one_board_set_per_raid() {
    const out = build((f) => withBoards(f, [['WW-W-2019-10-14', '2019-10-14', '2019-10-20']]));
    const mine = out.index.entries.filter((e) => e.censusId === W1);
    assert.strictEqual(mine.length, 2, 'two tiers');
    assert.strictEqual(mine[0].sphereBoardIds.length, 2);
    assert.ok(mine.every((e) => JSON.stringify(e.sphereBoardIds) === JSON.stringify(mine[0].sphereBoardIds)), 'every tier points at the same boards');
    const other = out.index.entries.find((e) => e.censusId === 'WW-W-2019-10-14');
    assert.strictEqual(other.sphereBoardIds.length, 2, 'same layout');
    assert.ok(other.sphereBoardIds.every((id) => !mine[0].sphereBoardIds.includes(id)), 'each raid keeps its own boards');
    for (const id of [...mine[0].sphereBoardIds, ...other.sphereBoardIds]) {
      assert.ok(id >= 3000000 && id <= 3999999);
      const s = out.sphereRows.find((r) => r.sphereBoardId === id);
      assert.deepStrictEqual([s.type, s.arryId, s.masuId, s.price, s.detailUrl, s.kindId], [5, id, id, 0, '', 0]);
      assert.ok(out.arrayRows.some((r) => r.arryId === id) && out.masuRows.some((r) => r.masuId === id && r.sphereBoardId === id));
    }
    assert.deepStrictEqual(out.sphereRows.filter((r) => mine[0].sphereBoardIds.includes(r.sphereBoardId)).map((r) => r.boardName), ['Enhancement Board 10/7/19', 'Enhancement Board 10/7/19'], 'the original title, twice, with the week');
    assert.deepStrictEqual(out.sphereRows.filter((r) => other.sphereBoardIds.includes(r.sphereBoardId)).map((r) => r.boardName), ['Enhancement Board 10/14/19', 'Enhancement Board 10/14/19']);
    assert.deepStrictEqual([rb.usDate('2019-03-11'), rb.usDate('2020-12-28')], ['3/11/19', '12/28/20']);
    // ids: every Weekly / Radiant row is numbered whatever the filter, and the pre-series rows since Task 10
    assert.deepStrictEqual(Object.keys(out.ids.boards).sort(), ['WW-E1-1/enhancement-A1', 'WW-W-2018-09-03/radiant-01', `${W1}/enhancement-A1`, `${W1}/enhancement-A2`, 'WW-W-2019-10-14/enhancement-A1',
      'WW-W-2019-10-14/enhancement-A2', 'WW-W-2019-10-28/halloween-board-2019'].sort());
    // only raids that exist get rows; the label of an inferred set
    assert.strictEqual(out.sphereRows.length, 4);
    assert.ok(other.reconstructed.includes('boardSet') && !mine[0].reconstructed.includes('boardSet'));
    assert.ok(mine[0].reconstructed.includes('boardPath'));
    // stable when a row is added before
    const again = build((f) => {
      withBoards(f, [['WW-W-2019-10-14', '2019-10-14', '2019-10-20']]);
      f.ids = out.ids;
      f.boards.weeks.unshift({ census_id: 'WW-W-2017-01-02', family: 'weekly', boards: [{ board: 'enhancement-A1' }] });
    });
    assert.deepStrictEqual(again.index.entries.find((e) => e.censusId === W1).sphereBoardIds, mine[0].sphereBoardIds);
    // a raid with no available tier has no boards
    const none = build((f) => { withBoards(f); f.models = null; });
    assert.ok(none.index.entries.every((e) => e.sphereBoardIds.length === 0));
    assert.strictEqual(none.sphereRows.length, 0);
  },
  board_art() {
    // card: boardId = the configured background (Board_0005), the picture of each board key under every id that uses it
    const art = { 'enhancement-A1': { jp: 'img/sphere_incentive/Board Raid/Repeat/2400393.png' }, 'enhancement-A2': { screenshot: 'Raid_Board_-_Enhancement_Board_(2)_KHUX.png' } };
    const out = build((f) => { withBoards(f, [['WW-W-2019-10-14', '2019-10-14', '2019-10-20']]); f.config.boards = { background: 5, art }; });
    assert.ok(out.sphereRows.every((r) => r.boardId === 5));
    const mine = entry(out, 'Trickmaster').sphereBoardIds;
    assert.deepStrictEqual(out.boardArt.filter((a) => mine.includes(a.sphereBoardId)).map((a) => [a.board, a.jp || a.screenshot]),
      [['enhancement-A1', art['enhancement-A1'].jp], ['enhancement-A2', art['enhancement-A2'].screenshot]]);
    assert.strictEqual(out.boardArt.length, out.sphereRows.length, 'every board of every week');
    assert.ok(entry(out, 'Trickmaster').reconstructed.includes('boardArt') && !entry(out, 'Trickmaster').reconstructed.includes('boardNoArt'));
    const lines = rb.artLines(out.boardArt).split('\n').filter((l) => l && !l.startsWith('#'));
    assert.strictEqual(lines.length, out.sphereRows.length);
    assert.ok(lines.includes(`img/sphere_incentive/${mine[0]}.png\tjp\timg/sphere_incentive/Board Raid/Repeat/2400393.png`));
    assert.ok(lines.includes(`img/sphere_incentive/${mine[1]}.png\tloc\t=img/sphere_incentive_ww/enhancement-A2.png`));
    // a board with no picture keeps the default background and is labelled; a malformed entry stops the build
    const bare = build((f) => withBoards(f));
    assert.ok(bare.sphereRows.every((r) => r.boardId === 1) && bare.boardArt.length === 0);
    assert.ok(entry(bare, 'Trickmaster').reconstructed.includes('boardNoArt'));
    assert.throws(() => build((f) => { withBoards(f); f.config.boards = { art: { 'enhancement-A1': {} } }; }), /boards\.art\.enhancement-A1/);
    // the shipped config: every board of the research has a picture, and the JP files exist where the data is
    const real = REAL_CONFIG.boards.art, keys = BOARDS_KEYS();
    if (keys) assert.deepStrictEqual(keys.filter((k) => !real[k]), [], 'boards without a card picture');
    const jp = process.env.KHUX_JP_DATA || path.join('D:', 'Progetto_Restauro_KH_UX', '[local reference data]', ' KHUx data shared', '[local reference data]', 'data', '[local reference data]', 'data', 'jp_final_4.3.1');
    if (fs.existsSync(jp)) assert.deepStrictEqual(Object.values(real).filter((a) => a.jp && !fs.existsSync(path.join(jp, a.jp))), [], 'JP files');
    else console.log('  (JP files not checked: no JP data)');
  },
  cell_order() {
    const out = build((f) => withBoards(f));
    const id = entry(out, 'Trickmaster').sphereBoardIds[0];
    const arr = out.arrayRows.find((r) => r.arryId === id), masu = out.masuRows.find((r) => r.masuId === id);
    assert.deepStrictEqual(walkOrder(arr), [1, 2, 3], 'one path from START in the order n');
    assert.deepStrictEqual(masu.spherePoint.slice(0, 4), [100, 200, 300, 0]);
    assert.deepStrictEqual(masu.rewardSelect.slice(0, 3), [3, 3, 5]);
    assert.deepStrictEqual(masu.rewardId.slice(0, 3), [90026, 90036, 51]);
    assert.deepStrictEqual(masu.rewardValue.slice(0, 3), [1, 1, 2]);
    for (const k of ['spherePoint', 'rewardSelect', 'medalCategory', 'rewardId', 'rewardExpand', 'rewardExpandId', 'rewardValue', 'burstUpperNumber']) assert.strictEqual(masu[k].length, 23, k);
    assert.deepStrictEqual([masu.rewardSelect[22], masu.rewardId[22], masu.spherePoint[22]], [3, 300948, 0], 'completion at index 22');
    for (const k of ['spCol0', 'spCol1', 'spCol2', 'spCol3', 'spCol4']) assert.strictEqual(arr[k].length, 9);
    // every size the grid holds keeps the order
    for (let n = 1; n <= rb.NODES; n++) assert.deepStrictEqual(walkOrder(rb.gridRow(1, n)), Array.from({ length: n }, (_, i) => i + 1), `${n} cells`);
    assert.throws(() => rb.gridRow(1, 23), /23 cells/);
    // radiant: jewels, both genders of an avatar part, a Spirit part by its master spelling, a draw ticket, a title at completion
    const all = build((f) => { withBoards(f); f.boards.weeks[3].census_id = W1; });
    const rad = all.masuRows.find((r) => all.sphereRows.find((s) => s.sphereBoardId === r.masuId).boardName.startsWith('Radiant Rewards Board '));
    assert.deepStrictEqual(rad.rewardSelect.slice(0, 5), [2, 20, 20, 33, 41]);
    assert.deepStrictEqual(rad.rewardId.slice(0, 5), [0, 201234, 201235, 402066, 0]);
    assert.strictEqual(rad.rewardValue[0], 100);
    assert.deepStrictEqual([rad.rewardSelect[22], rad.rewardId[22]], [7, 12215]);
  },
  halloween_cell_17() {
    const out = build((f) => { withBoards(f); f.boards.weeks[2].census_id = W1; });
    const sid = out.sphereRows.find((r) => r.boardName.startsWith('Halloween Board ')).sphereBoardId;
    const masu = out.masuRows.find((r) => r.masuId === sid);
    assert.strictEqual(masu.spherePoint[16], 1600, 'CORRECTIONS.md: 700 on the wiki');
    assert.strictEqual(masu.rewardSelect[16], 33);
    assert.ok(entry(out, 'Trickmaster').reconstructed.includes('boardCost'));
    assert.deepStrictEqual(out.report.boards.corrected, [{ board: 'halloween-board-2019', n: 17, what: 'cost 700 -> 1600 (CORRECTIONS.md, inferred)' }]);
    // event boards: the original table rules over the wiki where the research names it the best source (Task 10 builds them)
    const zoo = { id: 'zootopia-swb', name: 'Seasoned Wielder Bonus', best_cells: 'original_table.cells', cells: [cell(1, 120, 'medal', '6★ Moogle')],
      original_table: { cells: [{ slot: 21, type: 'medal', reward: '5★ Dewey', cost: 120 }, { slot: 1, type: 'medal', reward: '6★ Moogle', cost: 300 }, { slot: 18, type: 'medal', reward: '5★ Moogle', cost: 120 }] } };
    assert.deepStrictEqual(rb.cellsOf(zoo).map((c) => [c.n, c.reward, c.cost]), [[1, '6★ Moogle', 300], [2, '5★ Moogle', 120], [3, '5★ Dewey', 120]]);
    const vac = { id: 'vacation-resort', name: 'Vacation Resort', best_cells: 'original_table.cells', cells: [cell(5, 60, 'medal', '3★ Chip')],
      original_table: { cells: [{ slot: 2, type: 'medal', reward: '5★ Chip', cost: 60 }] } };
    assert.deepStrictEqual(rb.cellsOf(vac).map((c) => [c.reward, c.cost]), [['5★ Chip', 60]]);
    // on the real research files when they are readable
    const src = process.env.KHUX_RAID_SRC || mr.DEFAULT_SRC;
    let ev;
    try { ev = JSON.parse(fs.readFileSync(path.join(src, 'raid_rewards', 'b_events', 'event_raid_rewards.json'), 'utf8')); } catch { console.log('  (real event boards skipped: not readable)'); return; }
    const boards = ev.rows.flatMap((r) => (r.boards || []).map((b) => ({ ...b, row: r })));
    const realZoo = boards.find((b) => /Seasoned Wielder/.test(b.board) && b.row.boards.some((x) => /Zootopia/i.test(x.board)));
    assert.ok(realZoo, 'Zootopia Seasoned Wielder Bonus board');
    const zc = rb.cellsOf({ ...realZoo, id: 'z', name: realZoo.board });
    assert.ok(zc.some((c) => c.cost === 120) && zc.filter((c) => c.cost === 120).every((c) => /^5★/.test(c.reward)), 'Seasoned Wielder Bonus 5★ at 120');
    const realVac = boards.find((b) => b.board === 'Vacation Resort');
    const vc = rb.cellsOf({ ...realVac, id: 'v', name: realVac.board });
    assert.ok(vc.some((c) => c.reward === '5★ Chip' && c.cost === 60) && !vc.some((c) => c.reward === '3★ Chip' && c.cost === 60), 'Vacation Resort: the 60-coin Chip is 5★');
  },
  unknown_reward_stops_declared_is_reported() {
    const bad = (f) => { withBoards(f); f.boards.boards[1].cells.push(cell(2, 50, 'Medal', '6★ Nobody'), cell(3, 50, 'Coin', 'Mystery Coin')); };
    assert.throws(() => build(bad), (e) => /6★ Nobody/.test(e.message) && /Mystery Coin/.test(e.message), 'one list with every name');
    const ok = build((f) => { bad(f); f.config.boards = { unmatched: { '6★ Nobody': 'not a medal', 'Mystery Coin': 'no such item' } }; });
    assert.deepStrictEqual(ok.report.boards.unmatched.map((u) => [u.board, u.n, u.reward, u.weeks]), [['enhancement-A2', 2, '6★ Nobody', 1], ['enhancement-A2', 3, 'Mystery Coin', 1]]);
    const id = entry(ok, 'Trickmaster').sphereBoardIds[1];
    assert.deepStrictEqual(ok.masuRows.find((r) => r.masuId === id).spherePoint.slice(0, 2), [100, 0], 'the cell is left off, not replaced');
    assert.ok(entry(ok, 'Trickmaster').reconstructed.includes('boardCells'));
    // a board left with no cell is not built; a copy row (groupId of another medal) does not make a name ambiguous
    const empty = build((f) => { withBoards(f); f.boards.boards[1].cells = [cell(1, 50, 'Coin', 'Mystery Coin')]; f.config.boards = { unmatched: { 'Mystery Coin': 'x' } }; });
    assert.strictEqual(entry(empty, 'Trickmaster').sphereBoardIds.length, 1);
    assert.deepStrictEqual(empty.report.boards.dropped, ['enhancement-A2']);
    assert.strictEqual(rb.matchReward(rb.itemIndex(BOARD_MASTER), 'Medal', '6★ Huey, Dewey & Louie').id, 301388);
    assert.throws(() => build((f) => { withBoards(f); f.boards.boards[0].completion_reward = { value: '6★ Nobody' }; }), /completion of enhancement-A1/);
  },
  seasonal_tickets_and_aliases() {
    const idx = rb.itemIndex(BOARD_MASTER);
    // Draw Ticket and the seasonal currencies: rewardSelect 41, rewardId = the gacha.js currency index
    const g = require('./gacha');
    for (const [name, kind, cur] of [['Draw Ticket', 'Ticket', 'draw'], ['Holiday Draw Ticket', 'Holidayticket', 'holiday'], ['Spooky Cookie', 'Cookie', 'spooky'], ['Moogle Points', 'Mogpoints', 'moogle']]) {
      const m = rb.matchReward(idx, kind, name, 10);
      assert.strictEqual(m.sel, 41, name);
      assert.strictEqual(g.ticketCurrency(m.id), cur, name);
      assert.strictEqual(m.value, 10, name);
    }
    // a declared alias gives the other item and labels the week
    const out = build((f) => {
      withBoards(f);
      f.boards.boards[1].cells.push(cell(2, 50, 'Medal', '6★ Fantasia Mickey A'), cell(3, 50, 'Cookie', 'Spooky Cookie', 10));
      f.master.medal = [...(f.master.medal || []), { medalId: 90085, rare: 5, name: 'Fantasia Mickey A', groupId: 0 }];
      f.config.boards = { aliases: { '6★ Fantasia Mickey A': { item: '5★ Fantasia Mickey A', why: 'x' } } };
    });
    const id = entry(out, 'Trickmaster').sphereBoardIds[1];
    const masu = out.masuRows.find((r) => r.masuId === id);
    assert.deepStrictEqual([masu.rewardSelect.slice(0, 3), masu.rewardId.slice(0, 3), masu.rewardValue.slice(0, 3)], [[3, 3, 41], [90156, 90085, 2], [1, 1, 10]]);
    assert.ok(entry(out, 'Trickmaster').reconstructed.includes('boardAlias'));
    assert.deepStrictEqual(out.report.boards.unmatched, []);
    // a reward drawn with a reconstructed texture labels the week
    const tx = build((f) => { withBoards(f); f.boards.boards[1].cells.push(cell(2, 50, 'Pet', 'Jessie Hat')); f.config.boards = { reconstructedTexture: ['Jessie Hat'] }; });
    assert.ok(entry(tx, 'Trickmaster').reconstructed.includes('boardTexture'));
    assert.ok(!entry(build((f) => withBoards(f)), 'Trickmaster').reconstructed.includes('boardTexture'));
  },
  master_size() {
    const out = build((f) => withBoards(f));
    assert.ok(out.report.boards.bytes > 0 && out.report.boards.bytes < 40 * 1048576);
    const src = process.env.KHUX_RAID_SRC || mr.DEFAULT_SRC;
    let sources;
    try { sources = mr.readSources(src, process.env.KHUX_RAID_2016 || mr.DEFAULT_2016); } catch { console.log('  (real boards skipped: private sources not readable)'); return; }
    const dir = path.join(__dirname, 'master_data');
    if (!fs.existsSync(path.join(dir, 'medal.json'))) { console.log('  (real boards skipped: no master_data)'); return; }
    const master = {};
    for (const t of ['medal', 'material', 'petParts', 'avatarParts', 'title']) master[t] = JSON.parse(fs.readFileSync(path.join(dir, t + '.json'), 'utf8'));
    asServed(master);
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8'));
    const all = rb.buildBoards({ doc: sources.boards, correctionsMd: sources.rewards.correctionsMd, master, ids: JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_ids.json'), 'utf8')), config: cfg.boards });
    const weeks = Object.keys(all.byCensus).length;
    console.log(`  (all ${weeks} Weekly and Radiant rows: ${all.sphereRows.length} boards, +${all.report.bytes} bytes = ${(all.report.bytes / 1048576).toFixed(2)} MB; `
      + `${all.report.unmatched.length} cells left off, boards with no cell: ${all.report.dropped.join(', ') || 'none'})`);
    assert.strictEqual(weeks, 130);
    assert.deepStrictEqual(all.report.unmatched, [], 'every Raid Board reward is an item (2 Nov 2026)');
    assert.ok(all.report.bytes < 40 * 1048576, `${all.report.bytes} bytes`);
    assert.strictEqual(all.report.corrected.length, 1, 'Halloween Board 2019 cell 17');
    assert.strictEqual(new Set(all.sphereRows.map((r) => r.sphereBoardId)).size, all.sphereRows.length);
    for (const a of all.arrayRows) walkOrder(a);
  },
  all_rows_build() {
    // Task 8: the shipped config builds every WW row with week data, no filter
    assert.ok(!('onlyCensusIds' in REAL_CONFIG), 'raid_config.json has no onlyCensusIds');
    const real = realInputs();
    if (!real) return;
    const out = mr.buildRaid(real);
    const the130 = real.census.rows.filter((r) => String(r.id).startsWith('WW-') && (r.family === 'weekly' || r.family === 'radiant reward'));
    assert.strictEqual(the130.length, 130);
    const inIndex = new Set(out.index.entries.map((e) => e.censusId));
    assert.deepStrictEqual(the130.filter((r) => !inIndex.has(r.id)).map((r) => r.id), ['WW-W-2020-11-01'], 'only the one-day event of 2020-11-01 has no week data');
    const by = (rows, k) => new Map(rows.map((r) => [r[k], r]));
    const stages = by(out.stageRows, 'stageId'), settings = by(out.settingRows, 'raidSettingId'), enemies = by(out.enemyRows, 'raidEnemyId'), evs = by(out.evStageRows, 'eventStageId');
    const rewards = new Set(out.rewardRows.map((r) => r.raidRewardId));
    const skills = new Set([...out.attackRows, ...real.master.raidEnemyAttack].map((r) => r.raidEnemyAttackId));
    const boards = new Set(out.sphereRows.map((r) => r.sphereBoardId));
    const on = out.index.entries.filter((e) => e.available);
    for (const e of on) {
      const st = stages.get(e.stageId), set = settings.get(e.settingId), body = enemies.get(e.enemyId), ev = evs.get(e.evStageId);
      assert.ok(st && st.stageKind === 2 && st.raidBoss === e.settingId, `stage of ${e.key}`);
      assert.ok(set && set.bossId === e.enemyId, `raidSetting of ${e.key}`);
      assert.ok(body && body.validParts >= 1 && body.parts.slice(0, body.validParts).every((id) => enemies.has(id)), `raidEnemy rows of ${e.key}`);
      // a row holds at most 5 ids (schema int[5]); a longer event (the 7-day Showdown) is covered by stageStartId..stageEndId
      assert.ok(ev && ev.stageId.length <= 5 && (ev.stageId.includes(e.stageId) || (e.stageId >= ev.stageStartId && e.stageId <= ev.stageEndId)), `evStage of ${e.key}`);
      for (const k of ['rewardId', 'mvpRewardId', 'destroyAllRewardId']) assert.ok(body[k].slice(0, body.validGrowth).every((x) => rewards.has(x)), `${k} of ${e.key}`);
      assert.ok(body.skillId.slice(0, body.validSkill).every((x) => skills.has(x)), `skills of ${e.key}`);
      assert.ok(e.sphereBoardIds.every((id) => boards.has(id)), `boards of ${e.key}`);
    }
    // every_reward_row_exists on the whole table
    for (const r of out.enemyRows.filter((x) => x.weakness === 1)) {
      for (const k of ['rewardId', 'mvpRewardId', 'destroyAllRewardId']) assert.ok(r[k].slice(0, r.validGrowth).every((x) => rewards.has(x)), `${k} of ${r.raidEnemyId}`);
    }
    // nothing leaves a Weekly board cell off (seasonal Draw Tickets, Spirit parts, the reconstructed Sora & Moogle B included);
    // the event boards leave off only the declared Boosted medals and the Booster (Task 10)
    // ... and the JP boards (user decision 06-11) only the JP-only medals with no worldwide item yet (declared)
    assert.deepStrictEqual(out.report.boards.unmatched.filter((u) => !String(u.board).startsWith('WW-E') && !String(u.board).startsWith('JP-')), []);
    assert.deepStrictEqual([...new Set(out.report.boards.unmatched.filter((u) => String(u.board).startsWith('JP-')).map((u) => u.reward))].sort(),
      ['1★ Sora Santa Ver.', '5★ Minnie VD Ver.', '5★ Necho Cat', '5★ Sora & Riku KH3D Ver.', 'Booster [Final Form Sora] +5%', 'Happi Coat: Hair Ornament (Female)', 'Maidama (Female)', 'Maidama (Male)']);
    assert.ok(out.report.boards.unmatched.every((u) => u.reward in REAL_CONFIG.boards.unmatched), 'only declared cells are left off');
    const of130 = new Set(the130.map((r) => r.id));
    const avail130 = new Set(on.filter((e) => of130.has(e.censusId)).map((e) => e.censusId));
    const withBoards = [...avail130].filter((id) => on.some((e) => e.censusId === id && e.sphereBoardIds.length));
    const size = ['stageRows', 'evStageRows', 'settingRows', 'enemyRows', 'rewardRows', 'attackRows', 'sphereRows', 'arrayRows', 'masuRows'].reduce((n, k) => n + JSON.stringify(out[k]).length, 0);
    console.log(`  (every model complete: ${on.length} of ${out.index.entries.length} tier rows available, ${avail130.size} of the 130 rows with a raid, ${withBoards.length} with boards, `
      + `+${(size / 1048576).toFixed(2)} MB of rows)`);
    assert.ok(avail130.size >= 85, `${avail130.size} rows (85 on 2 Nov 2026; the rest wait for modelTemplates)`);
    assert.ok(size < 40 * 1048576);
  },
  hp_table_whole() {
    const real = realInputs();
    if (!real) return;
    const out = mr.buildRaid(real);
    let table = 0, read = 0, events2016 = 0, eventsRule = 0, scaled = 0;
    const capFrom = REAL_CONFIG.eventHp.capFrom;
    for (const e of out.index.entries.filter((x) => x.available)) {
      assert.ok(e.hp > 0, `HP of ${e.key}`);
      const body = out.enemyRows.find((r) => r.raidEnemyId === e.enemyId);
      assert.ok(body.hp.slice(0, body.validGrowth).every((h) => h > 0), `HP knots of ${e.key}`);
      if (e.event) {
        // event raids (Task 10): their own 2016 row unlabelled, else the scale of their boss's row (fix round 1), labelled, far
        // below the cap of the later era
        if (e.hpSource === '2016') { assert.ok(!e.reconstructed.includes('hp'), `label of ${e.key}`); events2016++; continue; }
        // Japan-only raids (I-232): the JP wiki HP stands as it is, at every level when it is fixed
        if (e.hpSource === 'jp') {
          assert.ok(e.jp && !e.reconstructed.includes('eventHp') && !e.reconstructed.includes('hpFloor'), `label of ${e.key}`);
          if (/^JP-SHR-/.test(e.censusId)) assert.ok(body.hp.slice(0, body.validGrowth).every((h) => h === e.hp) && [30000000, 50000000, 150000000, 99999990].includes(e.hp), `fixed HP of ${e.key}`);
          continue;
        }
        assert.strictEqual(e.hpSource, 'scale', e.key);
        assert.ok(e.reconstructed.includes('eventHp') && !e.reconstructed.includes('hp'), `label of ${e.key}`);
        assert.ok(e.tier === 'Advanced' ? body.hp[0] >= 500000000 : body.hp[0] < 1200000000, `scale of ${e.key}`);
        eventsRule++;
        continue;
      }
      if (e.tier === 'single' && e.start < capFrom && e.reconstructed.includes('eventHp')) { scaled++; continue; } // 2018-09 one-tier weeks
      const rule = mr.tierHp(real.values, e.tier, e.start);
      assert.ok(rule && rule.hp > 0, `tier rule for ${e.key}`);
      if (e.tier === 'single') {
        // one tier before 2019-08-12: the cap is read or comes from the rule, the shares below it are ours, always labelled
        assert.ok(e.reconstructed.includes('hp'), `label of ${e.key}`);
        if (e.hp === rule.hp) table++; else read++;
      } else if (e.reconstructed.includes('hp')) {
        table++;
        // a missing reading uses the tier rule
        assert.strictEqual(e.hp, rule.hp, `tier rule for ${e.key}`);
        assert.strictEqual(e.reconstructed.includes('hp_step'), rule.step, `hp_step of ${e.key}`);
      } else read++;
    }
    console.log(`  (HP: ${read} tier rows read on video, ${table} from the tier rule, labelled hp; event raids: ${events2016} on their 2016 row, ${eventsRule} on the scale; ${scaled} one-tier weeks of 2018-09 on the scale)`);
    assert.ok(table > 0 && read > 0);
  },
  evstage_row_fits_schema() {
    // review of Task 10 (04-11): a 7-stage evStage row (the Dec 2016 Showdown) broke the schema int[5], the server dropped the whole
    // table and the client crashed on the first new event id. A row keeps at most 5 stage ids and the full range.
    const ids = [980359, 980360, 980361, 980362, 980363, 980364, 980365];
    const row = mr.evStageRow(8013, ids);
    assert.deepStrictEqual(row.stageId, ids.slice(0, 5));
    assert.strictEqual(row.validStageId, 5);
    assert.strictEqual(row.stageStartId, 980359); assert.strictEqual(row.stageEndId, 980365);
    const small = mr.evStageRow(8001, [980345]);
    assert.deepStrictEqual([small.stageId, small.validStageId, small.stageStartId, small.stageEndId], [[980345], 1, 980345, 980345]);
    // the schema file, when present, says the same
    const schemaFile = path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json');
    if (fs.existsSync(schemaFile)) {
      const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8')), t = JSON.stringify(schema.evStage || schema.tables?.evStage || {});
      assert.ok(!t || /"stageId"[^}]*int\[5\]|int\[5\]/.test(t) || t === '{}', 'evStage.stageId is int[5] in the schema');
    }
  },
  // ---- Story raid bosses (Task 11) ----
  range_boss() {
    const s = storyOf(build(storyFixture()));
    assert.ok(s, 'raids.json has a story block');
    assert.strictEqual(s.quests[24].boss, 'Trickmaster');
    assert.strictEqual(s.quests[4].boss, 'Behemoth');
    assert.strictEqual(s.quests[230].boss, 'Trickmaster');
    const behemoth = s.bosses.find((b) => b.boss === 'Behemoth');
    assert.ok(behemoth.available, behemoth.why);
    assert.strictEqual(s.quests[4].stageId, behemoth.stages[2], 'quest 4 (world 2) fights on the boss\'s world-2 stage');
    assert.strictEqual(s.quests[25].stageId, behemoth.stages[3]);
    // the 2016 setting of the master row gives the Ω chance where it is the quest's boss: 2000 (1 in 10000), 2010 (1 in 2)
    assert.deepStrictEqual([s.quests[4].every, s.quests[5].every, s.quests[25].every], [10000, 2, 10000]);
    assert.deepStrictEqual(s.quests[4].reconstructed, []);
  },
  story_stage_links() {
    // the client fights stage.raidBoss -> raidSetting.bossId (rareBossId for the Ω): every fight stage leads to served rows
    const f = fixture(); storyFixture()(f);
    const out = mr.buildRaid(f);
    const s = storyOf(out);
    assert.ok(s.bosses.filter((x) => x.available).length >= 2);
    for (const b of s.bosses.filter((x) => x.available)) {
      for (const [w, sid] of Object.entries(b.stages)) {
        const st = out.stageRows.find((r) => r.stageId === sid);
        assert.ok(st && st.stageKind === 2 && st.worldId === Number(w), `stage ${sid}`);
        assert.ok(sid >= 980000 && sid <= 989999);
        assert.ok(f.master.stage.some((r) => r.stageKind === 1 && r.stageId === st.stageBinId && r.worldId === Number(w)), 'stageBinId: a story row of that world (its map)');
        const set = out.settingRows.find((r) => r.raidSettingId === st.raidBoss);
        assert.strictEqual(set.bossId, b.enemyId);
        const body = enemyOf(out, set.bossId);
        assert.strictEqual(body.raidDisplayId, b.modelId);
        for (const id of body.parts.slice(0, body.validParts)) assert.ok(enemyOf(out, id), `part ${id}`);
        if (b.rare) assert.ok(enemyOf(out, set.rareBossId) && set.rareBossId === b.rare.enemyId && enemyOf(out, b.rare.enemyId).rare === 2);
      }
    }
    const ids = new Set(out.rewardRows.map((r) => r.raidRewardId));
    for (const body of out.enemyRows.filter((r) => r.weakness === 1)) {
      for (const f of ['rewardId', 'mvpRewardId', 'destroyAllRewardId']) assert.ok(body[f].slice(0, body.validGrowth).every((x) => ids.has(x)), `${body.name} ${f}`);
    }
    // no story row of the master is rewritten: a raid Info names our fight stage, never the story row
    assert.ok(!out.stageRows.some((r) => r.stageKind === 1));
  },
  stops_at_825() {
    const s = storyOf(build(storyFixture()));
    assert.strictEqual(s.last, 825);
    assert.ok(Object.keys(s.quests).every((q) => Number(q) <= 825), 'no quest past 825');
    assert.strictEqual(s.quests[826], undefined);
    assert.strictEqual(s.quests[835], undefined, 'a target raid past the last range is an ordinary target');
    for (const q of [1, 2, 3]) assert.strictEqual(s.quests[q], undefined, 'tutorial quests spawn nothing');
  },
  unknown_quest_nearest() {
    const out = build(storyFixture());
    const s = storyOf(out);
    assert.strictEqual(s.quests[614].boss, 'Trickmaster', 'nearest: 613');
    assert.strictEqual(s.quests[615].boss, 'Behemoth', 'nearest: 616');
    assert.strictEqual(s.quests[614].nearest, 613);
    assert.ok(s.quests[614].reconstructed.includes('storyBoss') && s.quests[615].reconstructed.includes('storyBoss'));
    assert.ok(!s.quests[613].reconstructed.includes('storyBoss'));
    assert.deepStrictEqual(s.unknown, [614, 615], 'listed for the Notices');
    assert.ok(out.index.reasons.storyBoss, 'its reason');
  },
  conflict_rule() {
    const s = storyOf(build(storyFixture()));
    assert.deepStrictEqual(s.conflicts, [{ quest: 24, title: 'Quest 24: Escorting Alice Pt. 2', census: 'Trickmaster', wiki: 'Trickmaster', table: 'Behemoth' }], 'listed for the Notices');
    const q = s.quests[24];
    assert.strictEqual(q.boss, 'Trickmaster', 'the census choice, not the table\'s Behemoth');
    assert.ok(q.reconstructed.includes('storyConflict'));
    assert.strictEqual(q.stageId, s.bosses.find((b) => b.boss === 'Trickmaster').stages[3]);
    assert.strictEqual(q.every, 10000, 'the master row names a Behemoth setting: Trickmaster\'s rule (4000) instead');
  },
  fixed_quest_rows() {
    const s = storyOf(build(storyFixture()));
    const tm = s.bosses.find((b) => b.boss === 'Trickmaster');
    assert.deepStrictEqual(s.quests[24].fixed, { boss: 'Trickmaster', rare: false, name: 'Trickmaster', census: 'S-T024', stageId: tm.stages[3] });
    assert.deepStrictEqual(s.quests[230].fixed, { boss: 'Trickmaster', rare: true, name: 'Trickmaster Ω', census: 'S-T230', stageId: tm.stages[3] });
    assert.strictEqual(tm.rare.boss, 'Trickmaster Ω');
  },
  story_pays_items() {
    const out = build(storyFixture());
    const b = storyOf(out).bosses.find((x) => x.boss === 'Behemoth');
    const body = enemyOf(out, b.enemyId);
    assert.deepStrictEqual(knotsOf(body, 'hp'), [12000, 36000, 180000, 900000], 'the 2016 row as it stands');
    assert.deepStrictEqual(knotsOf(body, 'luxAttack'), [270, 1080, 6480, 38880], '2016 Lux, not the raid-event Lux rule');
    assert.strictEqual(b.upMinutes, 10);
    assert.strictEqual(b.useAp, 10);
    for (const f of ['rewardId', 'mvpRewardId', 'destroyAllRewardId']) {
      for (const id of knotsOf(body, f)) {
        const row = out.rewardRows.find((r) => r.raidRewardId === id);
        assert.ok(row, `${f} ${id}`);
        const types = row.type.slice(0, row.validReward);
        assert.deepStrictEqual(types, [3, 5], 'medal and material, by level');
        assert.ok(!types.includes(rr.CONFIG.coinType), 'no Raid Coins');
      }
    }
    // a reward item the master does not hold: the boss is not emitted
    const bad = storyOf(build(storyFixture((f) => { f.master.material = []; })));
    assert.strictEqual(bad.bosses.find((x) => x.boss === 'Behemoth').why, 'rewards');
  },
  unavailable_story_boss() {
    const out = build(storyFixture());
    const s = storyOf(out);
    const ea = s.bosses.find((b) => b.boss === 'Enraged Arachnid');
    assert.strictEqual(ea.available, false);
    assert.strictEqual(ea.why, 'graphics');
    assert.strictEqual(s.quests[700].boss, 'Enraged Arachnid');
    assert.strictEqual(s.quests[700].stageId, 0, 'no stage: no spawn');
    assert.ok(!out.enemyRows.some((r) => r.name === 'Enraged Arachnid'), 'no master row');
    assert.ok(!out.settingRows.some((r) => r.raidSettingId === ea.settingId));
  },
  omega_roll() {
    const s = storyOf(build(storyFixture()));
    // 556 (outside the 2016 table): Behemoth's rule, the setting the table gives it most often (2000 on 4 and 25, 2010 on 5; 24 is a conflict)
    assert.strictEqual(s.quests[556].every, 10000);
    assert.ok(s.quests[556].reconstructed.includes('storyOmega'));
    assert.ok(!s.quests[5].reconstructed.includes('storyOmega'));
    assert.strictEqual(s.quests[231].every, 10000, 'Trickmaster 4000 twice, 4010 once');
    assert.strictEqual(s.quests[613].every, 10000);
    assert.ok(s.quests[613].reconstructed.includes('storyOmega'));
    assert.ok(s.quests[556].reconstructed.includes('background'), 'world 7 draws the fallback background');
    assert.strictEqual(s.quests[556].stageId, s.bosses.find((b) => b.boss === 'Behemoth').stages[1]);
    // review M-4: a quest whose own 2016 setting has rareUpType 2 (fixture 4010 on quest 230) carries rareType2 itself
    assert.strictEqual(s.quests[230].every, 2);
    assert.ok(s.quests[230].reconstructed.includes('rareType2'));
    assert.ok(!s.quests[231].reconstructed.includes('rareType2'), 'its rule 4000 is type 3');
    assert.ok(!s.bosses.find((b) => b.boss === 'Trickmaster').reconstructed.includes('rareType2'));
    // Enraged Arachnid: rareUpType 1, no reading: no rare
    assert.strictEqual(s.bosses.find((b) => b.boss === 'Enraged Arachnid').rare, null);
  },
  story_ids_append_only() {
    const f = fixture(); storyFixture()(f);
    const a = mr.buildRaid(f);
    const keys = Object.keys(a.ids.entries).filter((k) => k.startsWith('story/'));
    assert.deepStrictEqual(keys.slice(0, 3), ['story/Behemoth', 'story/Behemoth+rare', 'story/Behemoth@w1']);
    const again = mr.buildRaid({ ...f, ids: a.ids });
    assert.deepStrictEqual(again.ids, a.ids, 'idempotent');
    assert.deepStrictEqual(again.index.story, a.index.story);
  },
  board_art_jp_files_exist() {
    // build-resources 06-11 stopped on JP cards named under Board Raid/ that live only in img/sphere_incentive/: every `jp` source
    // of the served card list must be a file of the JP 4.3.1 data (skipped without the list or the folder; KHUX_JP_DATA overrides)
    const list = path.join(__dirname, 'game_data', 'raid_board_art.tsv');
    let jp = process.env.KHUX_JP_DATA;
    if (!jp) { try { jp = require('child_process').execFileSync('python', ['-I', path.join(__dirname, '..', 'recon', 'tools', 'private_tools.py'), 'path', 'jp_data'], { encoding: 'utf8' }).trim(); } catch { jp = null; } }
    if (!fs.existsSync(list) || !jp || !fs.existsSync(jp)) { console.log('  (skipped: no card list or no JP data folder)'); return; }
    const missing = fs.readFileSync(list, 'utf8').split(/\r?\n/).map((l) => l.split('\t')).filter((c) => c[1] === 'jp' && !fs.existsSync(path.join(jp, c[2]))).map((c) => `${c[0]} <- ${c[2]}`);
    assert.deepStrictEqual(missing, [], 'jp card sources missing from the JP data');
  },
  real_census_week() {
    const real = realInputs();
    if (!real) return;
    const { master, models } = real;
    const sources = real, seeded = real.ids;
    const config = { ...real.config, onlyCensusIds: [W1] };
    const out = mr.buildRaid({ ...sources, master, models, config, ids: seeded });
    assert.deepStrictEqual(out.ids, seeded, 'raid_ids.json already covers every WW row');
    assert.deepStrictEqual(out.index.entries.map((e) => [e.tier, e.boss, e.modelId]), [['Beginner', 'Trickmaster', 7], ['Advanced', 'Blue Trident Tail', 1003]]);
    const [b, a] = out.index.entries;
    const row = (e) => out.enemyRows.find((r) => r.raidEnemyId === e.enemyId);
    assert.strictEqual(row(b).raidDisplayId, 7);
    assert.ok(row(b).hp.slice(0, row(b).validGrowth).every((h) => h === 150000000));
    assert.strictEqual(row(a).hp[0], 70000000000);
    assert.deepStrictEqual(out.enemyRows.filter((r) => r.raidEnemyId > b.enemyId && r.raidEnemyId <= b.enemyId + 5).map((r) => r.weakness), [2, 3]);
    // the week's raid stages (the story fight stages are built whatever onlyCensusIds says)
    assert.ok(out.stageRows.filter((s) => out.index.entries.some((e) => e.stageId === s.stageId)).every((s) => s.worldId === 3 && s.raidBoss));
    // all rows, as Task 8 will build them: nothing throws and the 2016 bosses come out
    const every = mr.buildRaid(real);
    assert.deepStrictEqual(every.ids, seeded);
    assert.strictEqual(new Set(every.index.entries.map((e) => e.key)).size, every.index.entries.length);
    const count = (f) => every.index.entries.filter(f).length;
    console.log(`  (all WW rows: ${every.index.entries.length} tier rows, ${count((e) => e.available)} buildable, ${count((e) => e.why === 'template')} without a template, ${count((e) => e.why === 'map')} without a map world)`);
    assert.ok(count((e) => e.available) > 100);
    const ids = new Set(every.rewardRows.map((r) => r.raidRewardId));
    assert.ok(every.enemyRows.filter((r) => r.weakness === 1).every((r) => r.rewardId.slice(0, r.validGrowth).every((x) => ids.has(x))));
    assert.strictEqual(new Set(every.stageRows.map((r) => r.stageId)).size, every.stageRows.length);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
