// Special tab master rows (make-special.js): node server/test-make-special.js
// Small inline fixture (no real data): a catalogue with 2 series, 3 rules entries (one removed), one story stage of
// world 1. Then a check of the authored server/special_periods.json against the real local master, when present.
'use strict';
const fs = require('fs'), path = require('path');
const ms = require('./make-special');
const { objectiveCodes } = require('./make-story-oltre');
// temp folders on the D: disk (project rule), removed at the end
const TMP = process.env.KHUX_TMP || 'D:\\Progetto_Restauro_KH_UX\\tmp';
fs.mkdirSync(TMP, { recursive: true });
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- fixture ------------------------------------------------------------------------------------------------
const catalogue = { quests: [
  { quest: 'Alpha I', series: 'Series A', world: 'Daybreak Town', room: 'Fountain Square', ap: '12 / 20 / 30', level: '25',
    target: 'King Pretender', attribute: 'Power', objectives: [
      'Defeat the target enemy within 1 turn -> Avatar Coin x5',
      'Defeat Great Pretender x 1 -> Cid 6★ x1',
      'Use 2 or more special attacks -> Mythril Shard x1'] },
  { quest: 'Alpha II', series: 'Series A', world: 'Daybreak Town', room: 'Avenue', ap: '20', level: '30-35',
    target: 'King Pretender', attribute: 'Speed', objectives: [
      'Complete without having to continue -> Avatar Coin x5',
      'Defeat the target enemy within 2 turns -> Avatar Coin x5',
      'Collect 150 or more Lux -> Mythril Shard x1'] },
  { quest: 'Beta', series: 'Series B', world: 'Wonderland', room: 'White Rabbit\'s House', ap: 'zero', level: '15',
    target: 'King Pretender', attribute: 'Power', objectives: [
      'Complete without having to continue -> (See table) x1',
      'Complete without having to continue -> (See table) x1',
      'Complete without having to continue -> (See table) x1'] },
] };
const rules = {
  periods: [{ n: 1, name: 'p1', from: '2016-04-01', to: '2020-05-22' }, { n: 4, name: 'p4', from: '2020-05-23', to: '2020-11-15' }],
  entries: [
    { key: 'alpha', evStageId: 7001, series: ['Series A'], name: 'Alpha', family: 'SQ01', periods: [4], days: ['Mon'],
      vip: false, replacedBy: null, removed: '', resetGroup: 'cid', banner: 'Special - Alpha banner KHUX.png', drops: [{ type: 3, id: 90076, num: 1 }, { type: 5, id: 1, num: 1 }] },
    { key: 'beta', evStageId: 7002, quests: ['Beta'], name: 'Beta', family: 'SQ22', periods: [4], days: 'all', vip: true,
      replacedBy: null, removed: '', resetGroup: '', useAp: [0], rewards: ['Jewel x1400', 'Cid 6★ x2', 'Mythril Shard x3'], drops: [] },
    { key: 'gone', evStageId: 7003, series: ['Series A'], name: 'Gone', family: 'SQ06', periods: [1], days: ['Sat', 'Sun'],
      vip: false, replacedBy: null, removed: 'no-use', resetGroup: '', drops: [] },
  ],
};
const story = { stageId: 1010, stageBinId: 0, id: 1, name: 'Story 1', mapName: 'Room', useAp: 3, chapterId: 1, worldId: 1, thumbId: 77,
  onlyDrama: 0, stageKind: 1, validBeforeDrama: 1, beforeDramaId: [5], beforeDramaType: [0], validAfterDrama: 0, afterDramaId: [],
  afterDramaType: [], validClearGetItem: 1, clearGetItemType: [2], clearGetItemId: [0], clearGetAssignSkillType: [1],
  clearGetAssignSkillId: [0], clearGetAssignSkillLv: [1], clearGetItemNum: [50], validSubmission: 0, raidBoss: 5001,
  bgmField: 11, bgmBattle: 12, bgmBoss: 13 };
// template of the training dummy (spec 7): the Large Body row (8xxxx form), curves of 5 points
const LARGE_BODY = { enemyId: 89007, name: 'Large Body', displayId: 7, validGrowth: 5, baseLv: [1, 35, 100, 300, 999],
  hp: [3784, 10940, 26100, 56439, 372497], attack: [1000, 1750, 2815, 6969, 17672], exp: [4, 4, 20, 20, 20], money: [13, 17, 219, 679, 2037],
  raidPoint: [0, 0, 0, 0, 0], lux: [30, 30, 145, 350, 1050], validSkill: 2, skillId: [700, 701], skillRequire: [2, 4],
  skillRequireArg: [0, 5000], skillOdds: [10000, 3000] };
const master = {
  stage: [story, { ...story, stageId: 970123, id: 970123, stageKind: 2, name: 'old special' }],
  enemy: [{ enemyId: 1, name: 'Shadow' }, { enemyId: 1006, name: 'Prize Egg' }, { enemyId: 1004, name: 'Growth Egg' }, { enemyId: 1003, name: 'King Pretender' }, { enemyId: 11003, name: 'King Pretender' },
    { enemyId: 1002, name: 'Great Pretender' }, LARGE_BODY],
  enemyAttack: [{ enemyAttackId: 700, name: 'Attack' }, { enemyAttackId: 2101, name: 'Big Self Heal', heal: 3500 }],
  keyblade: [{ keybladeId: 1, maxBurstGauge: 9 }, { keybladeId: 2, maxBurstGauge: 25 }, { keybladeId: 3, maxBurstGauge: 12 }],
  medal: [{ medalId: 90076, name: 'Cid', rare: 6 }],
  material: [{ materialId: 1, name: 'Mythril Shard' }],
  reward: [{ rewardId: 1, validReward: 1, display: [1], type: [5], id: [13], assignSkillType: [0], assignSkillId: [0],
    assignSkillLv: [0], num: [1], odds: [10000] }],
};

const EV_FIELDS = ['eventStageId', 'parentEventStageId', 'validStageId', 'stageId', 'validStageWidthId', 'stageStartId',
  'stageEndId', 'resetFlag', 'eventCategory', 'eventType', 'scoreMedalListId', 'scoreStartReward', 'scoreEndReward', 'rankingId',
  'bannerUrl', 'mypageBanner', 'detailUrl', 'startTime', 'endTime', 'endDispTime', 'boardEndTime', 'weekMonday', 'weekTuesday',
  'weekWednesday', 'weekThursday', 'weekFriday', 'weekSaturday', 'weekSunday', 'benefitId', 'benefitMonday', 'benefitTuesday',
  'benefitWednesday', 'benefitThursday', 'benefitFriday', 'benefitSaturday', 'benefitSunday', 'groupPattern', 'validMinute'];
const DATE = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;

const out = ms.build(rules, catalogue, master);
const { stageRows, evStageRows, rewardRows, index } = out;

// evStage rows: catalogue banner 7000 + the two entries that are not removed
check(evStageRows.length === 3, `evStage rows ${evStageRows.length} (expected 3)`);
check(evStageRows.every((r) => JSON.stringify(Object.keys(r)) === JSON.stringify(EV_FIELDS)), 'evStage rows have the 38 fields in order');
check(evStageRows.every((r) => r.validStageId === r.stageId.length && r.validStageId >= 1 && r.validStageId <= 5), 'validStageId = stageId count, 1..5');
check(evStageRows.every((r) => ['startTime', 'endTime', 'endDispTime', 'boardEndTime'].every((k) => DATE.test(r[k]))), 'evStage dates');
check(evStageRows.every((r) => r.detailUrl === (r.eventStageId === 7000 ? '/web/special/catalog' : '')), 'detailUrl only on 7000');
check(evStageRows.every((r) => r.bannerUrl === `/web/special/img/${r.eventStageId}.png`), 'bannerUrl');
check(evStageRows.every((r) => r.eventCategory === 1), 'eventCategory 1');
const ev = (id) => evStageRows.find((r) => r.eventStageId === id);
check(ev(7001) && ev(7001).resetFlag === 1 && ev(7002).resetFlag === 0 && ev(7000).resetFlag === 0, 'resetFlag from resetGroup');
check(!ev(7003), 'removed entry: no evStage row');
check(ev(7000) && ev(7000).stageId.join() === '970000', 'catalogue banner holds the training stage');
check(evStageRows.every((r) => r.weekMonday === 1 && r.weekSunday === 1 && r.benefitId === 0 && r.benefitMonday === 0), 'week* 1, benefit* 0');

// stage rows
const ids = stageRows.map((r) => r.stageId);
check(stageRows.length === 4, `stage rows ${stageRows.length} (expected training + 2 + 1)`);
check(stageRows.every((r) => r.stageKind === ms.STAGE_KIND && r.id === r.stageId && r.stageBinId === r.stageId), 'stageKind K, id = stageBinId = stageId');
check(ms.STAGE_KIND === 2, 'K = stageKind 2 (bench 30-10)');
check(ids.every((id) => id >= 970000 && id <= 979999), 'stageIds in 970000-979999');
check(!ids.includes(95100) && !ids.includes(95200), 'no stageId 95100/95200');
check(stageRows.every((r) => r.validClearGetItem === 0 && r.validBeforeDrama === 0 && r.validAfterDrama === 0), 'no clear items, no dramas');
const row = (id) => stageRows.find((r) => r.stageId === id);
const a1 = row(970010), a2 = row(970011), b = row(970020), tr = row(970000);
check(a1 && a2 && b && tr, 'stage ids: 970000 + (evStageId - 7000) * 10 + i');
check(a1 && a1.useAp === 12 && a2.useAp === 20 && b.useAp === 0 && tr.useAp === 0, 'useAp: first number of «12 / 20 / 30», «zero» 0');
check(a1 && a1.name === 'Alpha I' && a1.mapName === 'Fountain Square' && a1.worldId === 1, 'name, room and world');
check(a1 && a1.thumbId === 77 && a1.bgmField === 11, 'cloned from the last story row of the world');
check(stageRows.every((r) => r.raidBoss === 0), 'raidBoss 0 on every Special and training row (not cloned from the story row)');
check(b && b.worldId === 3, 'Wonderland world 3 (no story row: fallback to the last story row)');
// objectives through objectiveCodes, like the story rows
const ctx = { target: 11003, targetName: 'King Pretender', enemyId: (n) => ({ 'great pretender': 1002, 'king pretender': 1003 })[n.toLowerCase()] || 0 };
const c0 = objectiveCodes('Defeat the target enemy within 1 turn', ctx);
check(a1 && a1.validSubmission === 3 && a1.submissionRequire[0] === c0.req && a1.submissionName[0] === c0.name
  && a1.submissionId[0] === 11003 && a1.submissionNum[0] === 1 && a1.submissionDataType[0] === 4, 'objective 1 codes as in the story rows');
check(a1 && a1.submissionRequire[1] === 4 && a1.submissionId[1] === 1002 && a1.submissionNum[1] === 1, '«Defeat Great Pretender x 1»');
check(a1 && a1.submissionRequire[2] === 5 && a1.submissionNum[2] === 2, '«Use 2 or more special attacks»');
check(a1 && a1.submissionRewardType.join() === '14,3,5' && a1.submissionItemId.join() === '0,90076,1'
  && a1.submissionItemNum.join() === '5,1,1', 'objective rewards: Avatar Coin, Cid 6★, Mythril Shard');
check(b && b.submissionRewardType.join() === '2,3,5' && b.submissionItemNum.join() === '1400,2,3', 'rewards override of the entry');
check(tr && tr.name === 'Training Grounds' && tr.validSubmission === 3 && tr.submissionRequire.join() === '12,10,4'
  && tr.submissionId.join() === '1,0,1', 'training objectives: target, no continue, Shadow x1');
check(tr && tr.submissionRewardType.every((t) => t === 4) && tr.submissionItemNum.join() === '1,1,1', 'training rewards: 1 munny each');

// drop reward rows: one prize per row (position 0), after the current maximum
check(rewardRows.length === 3 && rewardRows.every((r) => r.rewardId > 1 && r.type.length === 1), 'one reward row per drop + the CP chest row');
check(rewardRows[0] && rewardRows[0].type[0] === 3 && rewardRows[0].id[0] === 90076 && rewardRows[1].type[0] === 5, 'medal type 3, material type 5');

// index
check(index.catalog && index.catalog.evStageId === 7000 && index.catalog.stageIds.join() === '970000' && index.catalog.useAp.join() === '0', 'index catalog');
const KEYS = ['key', 'evStageId', 'name', 'family', 'periods', 'days', 'vip', 'replacedBy', 'removed', 'campaign', 'resetGroup', 'stageIds', 'useAp'];
check(index.entries.length === 3 && index.entries.every((e) => KEYS.every((k) => k in e)), 'index entries with the Task 2 fields');
const gone = index.entries.find((e) => e.key === 'gone');
check(gone && gone.removed === 'no-use' && gone.stageIds.length === 0 && gone.useAp.length === 0, 'removed entry: index only');
const alpha = index.entries.find((e) => e.key === 'alpha');
check(alpha && alpha.banner === 'Special - Alpha banner KHUX.png' && gone.banner === '', 'index: banner file of the entry (make_special_banners.py)');
check(alpha && alpha.stageIds.join() === '970010,970011' && alpha.useAp.join() === '12,20' && alpha.campaign === null, 'index stageIds/useAp');
check(alpha && alpha.dropRewardIds.length === 2 && alpha.stages[0].wikiLv === 25 && alpha.stages[1].wikiLv === 30
  && alpha.stages[0].targetId === 11003, 'index map data for Task 4 (wikiLv, target, drops)');
// the target is the 1xxxx form of the enemy (as on the original maps and in gen_story_maps.py), same id in the objectives
check(tr && tr.submissionId[0] === 1, 'training target: Shadow 1 (the fixture has no 1xxxx Shadow)');

// map list for gen_story_maps.py (Task 4): one entry per stage, target in the 1xxxx family, drop carriers with the
// drop reward rows, enemies of «Defeat X» objectives with their objective id
const maps = out.maps || [];
check(maps.length === 4 && maps.map((m) => m.stageId).join() === '970000,970010,970011,970020', 'maps: one entry per stage');
const mA = maps.find((m) => m.stageId === 970010);
const members = (m) => m.enemies.flat();
check(mA && mA.world === 1 && mA.room === 'Fountain Square' && mA.name === 'Alpha I' && mA.target === 'King Pretender'
  && mA.targetId === 11003 && mA.level === 25 && mA.rooms === 1 && Array.isArray(mA.treasures) && mA.treasures.length === 0, 'map entry fields');
check(mA && mA.enemies.length >= 3 && mA.enemies.every((g) => g.length && g.reduce((n, x) => n + x.n, 0) <= 5), '>= 3 groups of at most 5');
check(mA && members(mA).every((x) => x.enemyId !== 11003), 'the target is not in the normal groups');
const carriers = mA ? members(mA).filter((x) => x.name !== 'King Pretender' && x.name !== 'Great Pretender') : [];
check(carriers.length === 2 && carriers.map((x) => x.reward).join() === alpha.dropRewardIds.join() && carriers.every((x) => x.n === 1),
  'one drop carrier per drop row, reward = the drop row');
// fix round 1 (bench rev 215): every enemy of a Special map with drops carries one of the entry's drop rows (round-robin,
// one enemy per member), the target too (targetReward); entries without drops: row 1 as the story maps (fix round 2:
// reward 0 = missing row, client crash risk after /stage/start, recon/tools/stage_poi.py); never 0
for (const m of maps.filter((x) => x.stageId !== 970000)) {
  const en = index.entries.find((e) => e.stageIds.includes(m.stageId));
  const ok = (r) => (en.dropRewardIds.length ? en.dropRewardIds.includes(r) : r === 1);
  check(members(m).every((x) => ok(x.reward) && x.n === 1), `map ${m.stageId}: every enemy on a drop row of the entry (or 1 without drops)`);
  check(ok(m.targetReward), `map ${m.stageId}: targetReward ${m.targetReward}`);
}
check(mA && new Set(members(mA).filter((x) => x.name === 'King Pretender').map((x) => x.reward)).size === 2, 'round-robin over both drop rows on the normal enemies');
check(mA && members(mA).filter((x) => x.name === 'King Pretender').length === 6, 'still 2 normal enemies per group, one member each');
check(carriers[0] && carriers[0].name === 'Prize Egg' && carriers[0].enemyId === 1006, 'medal drop: Prize Egg carrier');
check(mA && members(mA).some((x) => x.enemyId === 1002 && x.name === 'Great Pretender' && x.n === 1), 'objective enemy Great Pretender x1 on the map');
const mT = maps.find((m) => m.stageId === 970000);
check(mT && mT.target === 'Shadow' && mT.targetId === 1 && members(mT).every((x) => x.reward === 1) && (mT.targetReward || 1) === 1, 'training map: Shadow, no drops (row 1 as before)');

// training map (Task 10, spec 7): two paths in the 1st District (DB_0027_00_00, the room picked for «Training Grounds»,
// has 2 walkable grid points), the unkillable dummy and the CP chests (prize type 8; the largest maxBurstGauge 25 x 10000
// = 250000 CP, 60000 per chest as the largest original CP chest row 82 -> 5 chests)
check(mT && mT.training === true && mT.room === '1st District', 'training map: training flag, 1st District');
check(mT && Array.isArray(mT.dummy) && mT.dummy.length === 1 && mT.dummy[0].enemyId === ms.DUMMY_ENEMY_ID && mT.dummy[0].n === 1
  && mT.dummy[0].reward === 1 && mT.dummy[0].name === 'Training Dummy', 'training map: dummy group (reward row 1, never 0)');
check(mT && Array.isArray(mT.chests) && mT.chests.length === 5 && mT.chests.every((r) => r === ms.CP_REWARD_ID), `training map: 5 CP chests (got ${mT && JSON.stringify(mT.chests)})`);
const cpRow = rewardRows.find((r) => r.rewardId === ms.CP_REWARD_ID);
check(cpRow && cpRow.validReward === 1 && cpRow.type.join() === '8' && cpRow.num.join() === '60000' && cpRow.id.join() === '0'
  && cpRow.odds.join() === '10000' && cpRow.display.join() === '1', 'CP chest reward row: one type-8 prize of 60000');
check(ms.CP_REWARD_ID >= 970000 && ms.CP_REWARD_ID <= 979999 && rewardRows.filter((r) => r.rewardId === ms.CP_REWARD_ID).length === 1, 'CP row in the own reward range, once');
const dummyRows = out.enemyRows || [];
const dmy = dummyRows[0] || {};
check(dummyRows.length === 1 && dmy.enemyId === ms.DUMMY_ENEMY_ID && dmy.name === 'Training Dummy' && dmy.displayId === 7, 'dummy enemy row: copy of Large Body (its look)');
check(Array.isArray(dmy.hp) && dmy.hp.length === 5 && dmy.hp.every((v) => v === ms.DUMMY_HP) && ms.DUMMY_HP >= 6.5e11
  && ms.DUMMY_HP * 10000 < 2 ** 63 && Number.isSafeInteger(ms.DUMMY_HP), 'dummy HP: the same huge value at every level (int64, x10000 safe)');
check(['exp', 'money', 'lux', 'raidPoint'].every((k) => dmy[k] && dmy[k].every((v) => v === 0)), 'dummy: no exp, munny, lux');
check(dmy.validSkill === 2 && dmy.skillId[0] === 700 && dmy.skillId[1] === 2101 && dmy.skillRequire[1] === 2 && dmy.skillRequireArg[1] === 0,
  'dummy: original Big Self Heal row 2101 attached (always usable)');
check(LARGE_BODY.hp[0] === 3784 && LARGE_BODY.skillId[1] === 701, 'the template row is not modified');
check(index.catalog.dummyEnemyId === ms.DUMMY_ENEMY_ID && (index.catalog.rewardIds || []).join() === String(ms.CP_REWARD_ID), 'index catalog: dummy id and CP row');
{
  const noHeal = ms.build(rules, catalogue, { ...master, enemyAttack: [{ enemyAttackId: 700 }] }).enemyRows?.[0];
  check(noHeal && noHeal.skillId.join() === '700,701' && noHeal.hp.every((v) => v === ms.DUMMY_HP), 'no heal row in the master: HP only');
  let threw = false;
  try { ms.build(rules, catalogue, { ...master, enemy: master.enemy.filter((e) => e.name !== 'Large Body') }); } catch { threw = true; }
  check(threw, 'no Large Body in the master: error');
}

// objectives override per quest name (catalogue quest without objectives or with a typo) and from / to in the index
{
  const ov = ['Collect 150 or more Lux -> Avatar Coin x5', 'Complete without having to continue -> Avatar Coin x5', 'Defeat Great Pretender x 1 -> Mythril Shard x1'];
  const r2 = ms.build({ ...rules, entries: [{ ...rules.entries[0], objectives: { 'Alpha II': ov }, from: '2016-05-19', to: '2017-04-19' }] }, catalogue, master);
  const s0 = r2.stageRows.find((r) => r.stageId === 970010), s1 = r2.stageRows.find((r) => r.stageId === 970011);
  check(s0 && s0.submissionRequire[0] === a1.submissionRequire[0], 'objectives override: other quests keep the catalogue ones');
  check(s1 && s1.validSubmission === 3 && s1.submissionId[2] === 1002 && s1.submissionItemId[2] === 1 && s1.submissionRewardType[1] === 14, 'objectives override: Alpha II from the entry');
  const en = r2.index.entries[0];
  check(en.from === '2016-05-19' && en.to === '2017-04-19', 'index: from / to of the entry');
  check(!('from' in alpha) && !('to' in alpha), 'index: no from / to when the entry has none');
}

// WW week-limited VIP campaigns (Task 12, spec 5.3): one entry per catalogue row `vip_limited_campaigns_ww`, key
// C<notice>, evStageId 7501 + row index, VIP, every day, period of its start, campaign window {start, end} with the
// end inclusive (the catalogue end is the next Monday, exclusive); content from rules.campaigns (catalogue quests,
// shared sets, featured medal sets, custom quests on a template), drops per quest
{
  const cat2 = { ...catalogue, quests: [...catalogue.quests,
    { quest: 'Gamma (1)', series: 'Gamma', world: 'Daybreak Town', room: 'Avenue', ap: '0', level: '25', target: 'King Pretender', objectives: [
      'Defeat Great Pretender x 1 -> Cid 6★ x1', 'Complete without having to continue -> Avatar Coin x5', 'Complete without having to continue -> Avatar Coin x5'] },
    { quest: 'Gamma (2)', series: 'Gamma', world: 'Daybreak Town', room: 'Avenue', ap: '0', level: '25', target: 'King Pretender', objectives: [
      'Defeat Great Pretender x 1 -> Cid 6★ x1', 'Complete without having to continue -> Avatar Coin x5', 'Complete without having to continue -> Avatar Coin x5'] },
    { quest: 'Gamma (3)', series: 'Gamma', world: 'Daybreak Town', room: 'Avenue', ap: '0', level: '25', target: 'King Pretender', objectives: [
      'Defeat Great Pretender x 1 -> Cid 6★ x1', 'Complete without having to continue -> Avatar Coin x5', 'Complete without having to continue -> Avatar Coin x5'] },
    { quest: 'VIP! Medal Quest', series: 'VIP! Medal Quest', world: 'Wonderland', room: 'White Rabbit\'s House', ap: 'zero', level: '15', target: 'King Pretender', objectives: [
      'Complete without having to continue -> (See table) x1', 'Complete without having to continue -> (See table) x1', 'Complete without having to continue -> (See table) x1'] },
  ], vip_limited_campaigns_ww: [
    { id: 'E100-1', notice: 100, date: '2016-05-02', title: '[Edited May 3] VIP Star Week!', start: '2016-05-02', end: '2016-05-09' },
    { id: 'E101-1', notice: 101, date: '2016-05-19', title: 'VIP Cid Week!', start: null, end: null },
    { id: 'E102-1', notice: 102, date: '2020-06-01', title: 'VIP Gamma Week!', start: '2020-06-01', end: '2020-06-15' },
  ] };
  const master2 = { ...master, medal: [...master.medal, { medalId: 500, name: 'Star', rare: 6 }, { medalId: 501, name: 'Trait Medal #9', rare: 6 },
    { medalId: 90016, name: 'Moogle', rare: 6 }] };
  const rules2 = { ...rules,
    campaignSets: { gamma: { quests: ['Gamma (1)', 'Gamma (2)', 'Gamma (3)'], pack: { objective: 0, total: 3 }, drops: [{ type: 3, id: 90076, num: 1 }] } },
    campaigns: {
      C100: { parts: [{ featured: 'Star 6★', trait: 'Trait Medal #9 6★' }, { quest: 'VIP! Star Bonus', rewards: ['Star 6★ x1', 'Moogle 6★ x1', 'Jewel x100'] }] },
      C101: { start: '2016-05-19', end: '2016-05-22', generic: true, parts: [{ quest: 'VIP Cid Week!', like: 'Alpha I', useAp: 10, dropsFrom: 'alpha' }] },
      C102: { name: 'Gamma Week', parts: [{ set: 'gamma', n: 2 }, 'Alpha II'] },
    } };
  const o = ms.build(rules2, cat2, master2);
  const camps = o.index.entries.filter((x) => x.campaign);
  check(camps.map((x) => `${x.key}:${x.evStageId}`).join() === 'C100:7501,C101:7502,C102:7503', `campaign keys / evStageIds (${camps.map((x) => x.key)})`);
  const C = (k) => camps.find((x) => x.key === k) || { stages: [], stageIds: [], periods: [], dropRewardIds: [], campaign: {} };
  check(camps.every((x) => x.vip === true && x.days === 'all' && x.replacedBy === null && !x.removed && x.family), 'campaigns: VIP, every day, not replaced');
  check(C('C100').campaign.start === '2016-05-02' && C('C100').campaign.end === '2016-05-08' && C('C100').periods.join() === '1', 'C100: window to the Sunday, period of the start');
  check(C('C101').campaign.start === '2016-05-19' && C('C101').campaign.end === '2016-05-22', 'C101: window from the rules when the catalogue has none');
  check(C('C102').periods.join() === '4' && C('C102').campaign.end === '2020-06-14', 'C102: period 4, two-week window');
  check(C('C100').name === 'VIP Star Week!' && C('C102').name === 'Gamma Week', 'campaign name: catalogue title without «[Edited ...]», or the rules name');
  check(C('C101').generic === true && C('C100').generic === false, 'generic flag in the index');
  // featured set: 2 quests, 4 medals + 1400 Jewels + the trait medal; custom quest on the VIP! Medal Quest template
  check(C('C100').stageIds.join() === '975010,975011,975012', `C100 stage ids ${C('C100').stageIds}`);
  const s = (id) => o.stageRows.find((r) => r.stageId === id) || { submissionItemId: [], submissionItemNum: [], submissionRewardType: [] };
  check(s(975010).name === 'VIP! Star (1)' && s(975011).name === 'VIP! Star (2)' && s(975012).name === 'VIP! Star Bonus', 'featured / custom quest names');
  check(s(975010).submissionRewardType.join() === '3,3,2' && s(975010).submissionItemId.join() === '500,500,0' && s(975010).submissionItemNum.join() === '1,1,1400', 'featured (1): 2 medals + 1400 Jewels');
  check(s(975011).submissionItemId.join() === '500,500,501', 'featured (2): 2 medals + the trait medal');
  check(s(975012).mapName === 'White Rabbit\'s House' && s(975012).useAp === 0 && s(975012).submissionItemNum.join() === '1,1,100', 'custom quest on the VIP! Medal Quest template');
  check(C('C100').dropRewardIds.length === 0, 'C100: no drops');
  // generic quest «like» a catalogue quest: its objectives, own name, AP and the drops of an entry
  check(s(975020).name === 'VIP Cid Week!' && s(975020).useAp === 10 && s(975020).submissionItemId.join() === '0,90076,1', 'generic quest like Alpha I');
  check(C('C101').dropRewardIds.length === 2, 'C101: drops of the entry «alpha»');
  // set with n quests of a 3-item pack: the last quest takes the rest; catalogue quest after the set
  check(C('C102').stageIds.join() === '975030,975031,975032' && s(975031).name === 'Gamma (2)' && s(975031).submissionItemNum[0] === 2
    && s(975030).submissionItemNum[0] === 1, 'set gamma n 2: (2) gives Cid x2');
  check(s(975032).name === 'Alpha II', 'catalogue quest after the set');
  // drops per quest: the set quests carry the set drop, Beta (no drops) row 1; the entry lists the union
  const st102 = C('C102').stages;
  check(C('C102').dropRewardIds.length === 1 && st102[0].dropRewardIds.join() === C('C102').dropRewardIds.join() && st102[2].dropRewardIds.length === 0, 'drops per quest');
  const mBeta = o.maps.find((m) => m.stageId === 975032), mG = o.maps.find((m) => m.stageId === 975030);
  check(mBeta && mBeta.enemies.flat().every((x) => x.reward === 1) && mBeta.targetReward === 1, 'campaign quest without drops: row 1 on every enemy');
  check(mG && mG.enemies.flat().every((x) => x.reward === C('C102').dropRewardIds[0]) && mG.targetReward === C('C102').dropRewardIds[0], 'campaign quest with drops: its drop row on every enemy');
  check(o.evStageRows.filter((r) => r.eventStageId >= 7501).map((r) => r.validStageId).join() === '3,1,3', 'one evStage row per campaign');
  // ids of the normal entries do not move
  check(o.index.entries.find((x) => x.key === 'alpha').stageIds.join() === '970010,970011' && o.rewardRows[0].rewardId === rewardRows[0].rewardId, 'normal entry ids unchanged');
  // window rules (special.currentEntries): listed in the weeks of its window only; pinnable from a later period; VIP only
  const sp = require('./special');
  const listed = (k, period, shopFrom, shopTo) => sp.currentEntries(o.index, { period, shopFrom, shopTo }).some((x) => x.key === k);
  check(listed('C100', 1, '2016-05-02', '2016-05-08') && !listed('C100', 1, '2016-05-09', '2016-05-15') && !listed('C100', 1, '2016-04-25', '2016-05-01'), 'C100 only in its week');
  check(listed('C102', 4, '2020-06-08', '2020-06-14') && !listed('C102', 4, '2020-06-15', '2020-06-21'), 'C102 in both weeks, not after');
  check(!sp.pinnable(C('C100'), 1).ok && sp.pinnable(C('C100'), 2).ok && !sp.pinnable(C('C102'), 4).ok && sp.pinnable(C('C102'), 5).ok, 'campaign pinnable from a later period only');
  check(sp.lockOf(C('C100'), { weekday: 'Mon', vip: false, pinned: true }) === 1 && sp.lockOf(C('C100'), { weekday: 'Mon', vip: true, pinned: true }) === 0, 'campaign playable only with VIP');
  // errors: a catalogue row without content, content for an unknown row, more than 5 quests, missing window
  const badC = (c, why, cat = cat2) => { let t = false; try { ms.build({ ...rules2, campaigns: c }, cat, master2); } catch { t = true; } check(t, why); };
  const { C100, C101, C102 } = rules2.campaigns;
  badC({ C100, C101 }, 'campaign row without content rejected');
  badC({ C100, C101, C102, C999: C102 }, 'content for an unknown campaign rejected');
  badC({ C100, C101, C102: { parts: [{ set: 'gamma' }, 'Alpha I', 'Alpha II', 'Alpha I'] } }, 'campaign with 6 quests rejected');
  badC({ C100, C101: { parts: C101.parts }, C102 }, 'campaign without a window rejected');
}

// errors on bad rules
const bad = (r, why) => { let t = false; try { ms.build({ ...rules, entries: r }, catalogue, master); } catch { t = true; } check(t, why); };
bad([{ ...rules.entries[0], evStageId: 7002 }, rules.entries[1]], 'duplicate evStageId rejected');
bad([{ ...rules.entries[0], series: ['Nope'] }], 'entry without quests rejected');
bad([{ ...rules.entries[0], drops: [{ type: 3, id: 12345, num: 1 }] }], 'drop not in the medal table rejected');
bad([{ ...rules.entries[0], objectives: { 'Alpha III': ['a -> Munny x1', 'b -> Munny x1', 'c -> Munny x1'] } }], 'objectives override for a quest the entry does not pick rejected');

// patch: twice on a temp master copy gives identical files; old 970123 row dropped
const dir = fs.mkdtempSync(path.join(TMP, 'special-'));
try {
  for (const [k, v] of Object.entries(master)) fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(v));
  fs.writeFileSync(path.join(dir, 'evStage.json'), '[]');
  const opts = { rules, catalogue, gameDataDir: dir };
  ms.patch(dir, opts);
  const snap = () => ['stage', 'evStage', 'reward', 'special', 'enemy'].map((f) => fs.readFileSync(path.join(dir, f + '.json'), 'utf8'));
  const first = snap();
  ms.patch(dir, opts);
  check(JSON.stringify(first) === JSON.stringify(snap()), 'patch is idempotent');
  const st = JSON.parse(first[0]);
  check(!st.some((r) => r.stageId === 970123) && st.filter((r) => r.stageKind === 2).length === 4 && st[0].stageId === 1010, 'patch replaces own stage rows');
  check(JSON.parse(first[1]).length === 3 && JSON.parse(first[2]).length === 4, 'patch evStage and reward rows (2 drops + CP row + row 1)');
  check(JSON.parse(first[4]).filter((r) => r.enemyId === ms.DUMMY_ENEMY_ID).length === 1 && JSON.parse(first[4]).length === master.enemy.length + 1,
    'patch adds the dummy enemy row once');
  check(JSON.parse(first[3]).catalog.evStageId === 7000, 'patch writes special.json');
  const sm = fs.existsSync(path.join(dir, 'special_maps.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'special_maps.json'), 'utf8')) : null;
  check(Array.isArray(sm) && sm.length === 4, 'patch writes special_maps.json');
  // a reward row in the own range that the previous run did not write (e.g. make-game-tables from the POI) is foreign:
  // the guard runs on the unfiltered table
  const rw = JSON.parse(first[2]);
  const rejects = (rows, why) => {
    fs.writeFileSync(path.join(dir, 'reward.json'), JSON.stringify(rows));
    let threw = false;
    try { ms.patch(dir, opts); } catch { threw = true; }
    check(threw, why);
    fs.writeFileSync(path.join(dir, 'reward.json'), first[2]);
  };
  rejects([...rw, { ...rw[0], rewardId: 970050 }], 'foreign reward row 970050 (not listed by the previous run) rejected');
  rejects([...rw, { ...rw[0], rewardId: 980000 }], 'foreign reward row 980000 rejected');
  // off switch and missing private catalogue: skip with a message, no throw, nothing written
  const before = snap();
  const env = { off: process.env.KHUX_SPECIAL, src: process.env.KHUX_SPECIAL_SRC };
  try {
    process.env.KHUX_SPECIAL = '0';
    check(ms.patch(dir, opts) === null && JSON.stringify(before) === JSON.stringify(snap()), 'KHUX_SPECIAL=0: skipped');
    delete process.env.KHUX_SPECIAL;
    process.env.KHUX_SPECIAL_SRC = path.join(dir, 'missing.json');
    let r, err = null;
    try { r = ms.patch(dir, { rules, gameDataDir: dir }); } catch (e) { err = e; }
    check(!err && r === null && JSON.stringify(before) === JSON.stringify(snap()), `missing catalogue: skipped with a warning (${err && err.message})`);
  } finally {
    if (env.off === undefined) delete process.env.KHUX_SPECIAL; else process.env.KHUX_SPECIAL = env.off;
    if (env.src === undefined) delete process.env.KHUX_SPECIAL_SRC; else process.env.KHUX_SPECIAL_SRC = env.src;
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

// --- authored rules (server/special_periods.json) -----------------------------------------------------------
const real = require('./special_periods.json');
check(Array.isArray(real.periods) && real.periods.length === 5 && real.periods.every((p) => p.n && p.name && p.from && p.to), 'periods {n, name, from, to}');
check(real.periods[3].from === '2020-05-23' && real.periods[3].to === '2020-11-15', 'period 4 dates (spec 5.1)');
check(Array.isArray(require('./special').PERIODS) && require('./special').PERIODS.length === 5, 'special.js reads the periods array');
const p4 = real.entries.filter((e) => e.periods.includes(4));
check(p4.filter((e) => e.resetGroup === 'cid').length === 7, '7 Daily Cid entries');
check(p4.filter((e) => e.vip).length === 9, '9 VIP entries (6 + VIP! Materials 1-2 and VIP! Jewels & Spirit Part, Task 12)');
check(real.entries.filter((e) => e.removed === 'no-use').length === 2, 'Mythril Madness and Adamantite removed');
check(new Set(real.entries.map((e) => e.evStageId)).size === real.entries.length && new Set(real.entries.map((e) => e.key)).size === real.entries.length, 'unique keys and evStageIds');
const MASTER = path.join(__dirname, 'master_data');
const SRC = process.env.KHUX_SPECIAL_SRC || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\special\\special_quests.json';
if (fs.existsSync(path.join(MASTER, 'stage.json')) && fs.existsSync(SRC)) {
  const t = (n) => JSON.parse(fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'));
  const all = ms.build(real, JSON.parse(fs.readFileSync(SRC, 'utf8')), { stage: t('stage'), enemy: t('enemy'), medal: t('medal'),
    material: t('material'), reward: t('reward'), skill: t('skill'), title: t('title'), avatarParts: t('avatarParts'), keyblade: t('keyblade'), enemyAttack: t('enemyAttack') });
  const live = real.entries.filter((e) => !e.removed);
  check(all.evStageRows.length === 1 + live.length + 120, `real build: ${all.evStageRows.length} evStage rows (1 + ${live.length} + 120 campaigns)`);
  // the 120 WW week-limited VIP campaigns (Task 12)
  const sp = require('./special');
  const camps = all.index.entries.filter((e) => e.campaign);
  check(camps.length === 120 && camps.every((e, i) => e.evStageId === 7501 + i && /^C\d+$/.test(e.key)), `real build: 120 campaigns 7501-7620 (${camps.length})`);
  check(camps.every((e) => e.vip && e.stageIds.length >= 1 && e.stageIds.length <= 5 && e.campaign.start <= e.campaign.end), 'real build: campaigns VIP, 1-5 quests, window start <= end');
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  for (const e of camps) {
    const p = sp.periodOf(e.campaign.start, real.periods);
    const has = (from, to, per = p) => sp.currentEntries(all.index, { period: per, shopFrom: from, shopTo: to }).includes(e);
    check(e.periods.join() === String(p), `${e.key}: period ${e.periods} (start ${e.campaign.start})`);
    check(has(e.campaign.start, addD(e.campaign.start, 6)), `${e.key}: not listed in its first week`);
    check(!has(addD(e.campaign.end, 1), addD(e.campaign.end, 7)) && !has(addD(e.campaign.start, -7), addD(e.campaign.start, -1)), `${e.key}: listed outside its window`);
    check(!sp.pinnable(e, p).ok && (p === 5 || sp.pinnable(e, p + 1).ok), `${e.key}: pinnable only from a later period`);
    check(sp.lockOf(e, { weekday: 'Mon', vip: false, pinned: true }) === 1 && sp.lockOf(e, { weekday: 'Mon', vip: true, pinned: false }) === 0, `${e.key}: VIP only`);
  }
  check(new Set(all.stageRows.map((r) => r.stageId)).size === all.stageRows.length, 'real build: campaign stage ids unique');
  // fix round 1 (I-1): the campaigns of 2019-01-28..03-03 are the first weeks of the recurring VIP sets; in those weeks
  // no recurring-set reward is listed twice (fillers Jewel, Avatar Coin and Moogle 6★ apart) and the recurring
  // entries vip-medal / vip-jewels-avatar start on 2019-03-04
  const rewardsOf = (en) => en.stageIds.flatMap((id) => { const r = all.stageRows.find((x) => x.stageId === id);
    return r.submissionRewardType.map((t, i) => `${t}:${r.submissionItemId[i]}`); })
    .filter((k) => !['2:0', '14:0', '3:90016', '0:0'].includes(k));
  for (let w = '2019-01-28'; w <= '2019-02-25'; w = addD(w, 7)) {
    const listed = sp.currentEntries(all.index, { period: 3, shopFrom: w, shopTo: addD(w, 6) });
    const seen = new Map(); const twice = [];
    for (const en of listed.filter((x) => x.vip)) for (const k of new Set(rewardsOf(en))) { if (seen.has(k)) twice.push(`${k} (${seen.get(k)} + ${en.key})`); else seen.set(k, en.key); }
    check(!twice.length, `week ${w}: rewards listed twice ${twice.join(', ')}`);
    check(!listed.some((x) => x.key === 'vip-medal' || x.key === 'vip-jewels-avatar'), `week ${w}: recurring vip-medal / vip-jewels-avatar listed next to the campaign`);
  }
  check(real.entries.find((e) => e.key === 'vip-medal').from === '2019-03-04' && real.entries.find((e) => e.key === 'vip-jewels-avatar').from === '2019-03-04', 'vip-medal / vip-jewels-avatar from 2019-03-04');
  // fix round 1 (I-2): the banner plate font has no «★»: campaign names without it (quest names keep it)
  check(camps.every((e) => !/★/.test(e.name)), `campaign names with ★: ${camps.filter((e) => /★/.test(e.name)).map((e) => e.key)}`);
  check(['C49538', 'C49546', 'C50025'].every((k) => all.index.entries.find((e) => e.key === k).stages.some((st) => /★/.test(st.quest))), 'quest names keep ★');
  check(all.stageRows.every((r) => r.validSubmission === 3), 'real build: 3 objectives on every stage');
  check(all.report.stopgaps.length === 0, `real build: stopgap objectives ${JSON.stringify(all.report.stopgaps)}`);
  const mog = all.index.entries.find((e) => e.key === 'mog');
  check(mog && mog.stageIds.length === 5, 'MOG: 5 stages');
  // every period (Task 7): stable ids of the period-4 entries, dates in the index, row counts
  check(['cid-mon', 'mog', 'evolve-legendary', 'skill-exp', 'vip-medal'].every((k) => all.index.entries.find((e) => e.key === k).stageIds[0]
    === 970000 + (real.entries.find((e) => e.key === k).evStageId - 7000) * 10), 'real build: period-4 stage ids unchanged');
  check(all.index.entries.find((e) => e.key === 'cid-vip-mon').to === '2017-04-19', 'real build: from / to in the index');
  // drops per quest (campaigns: a quest without drops in an entry with drops keeps row 1)
  const withDrops = new Set(all.index.entries.flatMap((e) => e.stages.filter((s) => s.dropRewardIds.length).map((s) => s.stageId)));
  check(all.maps.every((m) => m.targetReward > 0 && m.enemies.flat().every((x) => x.reward > 0)), 'real build: no Special map enemy on reward 0');
  check(all.maps.filter((m) => withDrops.has(m.stageId)).every((m) => m.targetReward !== 1 && m.enemies.flat().every((x) => x.reward !== 1)), 'real build: no enemy on row 1 in a quest with drops');
  check(all.stageRows.every((r) => r.stageId >= 970000 && r.stageId <= 979999) && new Set(all.stageRows.map((r) => r.stageId)).size === all.stageRows.length, 'real build: stage ids unique, in range');
  const rt = all.maps.find((m) => m.stageId === 970000), rd = all.enemyRows[0];
  check(rt && rt.training && rt.chests.length === 5 && rd && rd.displayId === 7 && rd.skillId[1] === 2101, 'real build: training map with 5 CP chests, dummy with the heal');
  check(!t('enemy').some((e) => e.enemyId === ms.DUMMY_ENEMY_ID && e.name !== 'Training Dummy'), 'real build: enemy id of the dummy free');
  console.log(`(real build: ${all.stageRows.length} stage, ${all.evStageRows.length} evStage, ${all.rewardRows.length} reward rows, ${all.maps.length} maps; `
    + `entries per period ${[1, 2, 3, 4, 5].map((n) => live.filter((e) => e.periods.includes(n)).length).join('/')})`);
} else console.log('(local master or private catalogue missing: real build skipped)');

if (errors.length) { console.error(`test-make-special: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-make-special: OK');
