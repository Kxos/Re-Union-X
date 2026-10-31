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
check(evStageRows.every((r) => r.bannerUrl === `/web/special/img/v${require('./special').SPECIAL_IMG_VERSION}/${r.eventStageId}.png`), 'bannerUrl');
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
check(tr && tr.submissionRewardType.join() === '4,4,4' && tr.submissionItemId.join() === '0,0,0' && tr.submissionItemNum.join() === '100,100,100', 'training rewards: Munny x100 each (user 31-10)');

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
const tsh = dummyRows[1] || {};
check(tsh.enemyId === ms.TRAINING_SHADOW_ID && tsh.name === 'Shadow', 'training Shadow row: copy named Shadow, own id');
check(dummyRows.length === 2 && dmy.enemyId === ms.DUMMY_ENEMY_ID && dmy.name === 'Training Dummy' && dmy.displayId === 7, 'dummy enemy row: copy of Large Body (its look)');
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
  // final review: frozen evStageIds (rules.campaigns[key].evStageId). Rows shuffled and a new row added: the frozen keys
  // keep their ids (and stage ids), the new campaign takes the next free id after the highest frozen one
  const frozen = { C100: { ...C100, evStageId: 7501 }, C101: { ...C101, evStageId: 7502 }, C102: { ...C102, evStageId: 7503 } };
  const rowsF = cat2.vip_limited_campaigns_ww;
  const cat3 = { ...cat2, vip_limited_campaigns_ww: [rowsF[2], { id: 'E103-1', notice: 103, date: '2020-06-08', title: 'VIP New Week!', start: '2020-06-08', end: '2020-06-15' }, rowsF[0], rowsF[1]] };
  const o3 = ms.build({ ...rules2, campaigns: { ...frozen, C103: { parts: ['Alpha II'] } } }, cat3, master2);
  const ids3 = Object.fromEntries(o3.index.entries.filter((x) => x.campaign).map((x) => [x.key, x]));
  check(ids3.C100?.evStageId === 7501 && ids3.C101?.evStageId === 7502 && ids3.C102?.evStageId === 7503,
    `frozen evStageIds moved by a reordered catalogue: ${['C100', 'C101', 'C102'].map((k) => ids3[k]?.evStageId)}`);
  check(ids3.C102?.stageIds.join() === C('C102').stageIds.join(), `frozen stage ids moved: ${ids3.C102?.stageIds} vs ${C('C102').stageIds}`);
  check(ids3.C103?.evStageId === 7504 && ids3.C103.stageIds[0] === 975040, `new campaign: next free id (${ids3.C103?.evStageId})`);
  badC({ C100: frozen.C100, C101: { ...C101, evStageId: 7501 }, C102 }, 'two campaigns with the same frozen evStageId rejected');
}

// round 17: recurring VIP sets follow the weekly rotation. Catalogue `vip_recurring_weekly` rows -> week versions of the
// set's entry (key <entry>@<first Monday>, campaign = the row's weeks, weekOf = the entry), own stage per version with
// the row's rewards; ids frozen in rules.weekly.versions, new ones from 7700; aliases rename or leave out rewards
{
  check(ms.weeksOf('02/25/10 - 03/03/19; 03/04/19 - 03/10/19').join() === '2019-02-25,2019-03-04', `weeksOf: typo year -> the Sunday's week (${ms.weeksOf('02/25/10 - 03/03/19; 03/04/19 - 03/10/19')})`);
  check(ms.weeksOf('07/22/19 - 07/28/19 - 07/29/19 - 08/04/19').join() === '2019-07-22,2019-07-29', 'weeksOf: missing «;»');
  check(ms.weeksOf('01/30/20 - 01/26/20').join() === '2020-01-20' && ms.weeksOf('09/09/19 - 00/15/19').join() === '2019-09-09'
    && ms.weeksOf('06/10/19 - 06/16/29').join() === '2019-06-10' && ms.weeksOf('03/23/20 - 03/23/20').join() === '2020-03-23', 'weeksOf: other typos');
  check(ms.weeklyLabel('1400 Jewels') === 'Jewel x1400' && ms.weeklyLabel('8 6★ Trait Medal #205') === 'Trait Medal #205 6★ x8'
    && ms.weeklyLabel('1 6★ Moogle |}') === 'Moogle 6★ x1' && ms.weeklyLabel('Chocolate Cap (♂)') === 'Chocolate Cap (♂) x1'
    && ms.weeklyLabel('10 Power Gems') === 'Power Gems x10' && ms.weeklyLabel('1 7★', 'SN++ - Key Art 8') === 'SN++ - Key Art 8 7★ x1', 'weeklyLabel');
  const catW = { ...catalogue, vip_recurring_weekly: { 'VIP! Beta': [
    { banner: 'Get Star!', dates: '06/01/20 - 06/07/20; 06/08/20 - 06/14/20', rewards: ['1 7★ Star', '8 6★ Cid', '1 6★ Moogle'] },
    { banner: 'Gems x10', dates: '06/15/29 - 06/21/20', rewards: ['10 Power Gems', '1 6★ Cid', '1 6★ Moogle |}'] },
    { banner: 'Star again', dates: '06/15/20 - 06/21/20', rewards: ['1 7★', '1 6★ Old Medal', 'Lost Part'] },
    { banner: 'Too early', dates: '05/04/20 - 05/10/20', rewards: ['1 7★ Star', '1 6★ Moogle', '1 6★ Moogle'] },
  ], 'VIP! Skill': [{ banner: 'Skill', dates: '06/01/20 - 06/07/20', rewards: ['1 6★ ATK B X Max', '1 6★ Moogle', '1 6★ Moogle'] }] } };
  const masterW = { ...master, medal: [...master.medal, { medalId: 600, name: 'Star', rare: 7 }, { medalId: 90016, name: 'Moogle', rare: 6 }],
    material: [...master.material, { materialId: 48, name: 'Power Gem' }] };
  const weekly = { sets: { 'VIP! Beta': { entry: 'beta' } }, aliases: { 'Star again 7★': 'Star 7★', 'Old Medal 6★': 'Cid 6★', 'Lost Part': null },
    versions: { 'beta@2020-06-15': { evStageId: 7705, banner: 'Special - VIP Gems x10 banner KHUX.png' } } };
  const ow = ms.build({ ...rules, weekly }, catW, masterW);
  const wk = ow.index.entries.filter((x) => x.weekOf);
  check(wk.map((x) => `${x.key}:${x.evStageId}`).join() === 'beta@2020-06-01:7700,beta@2020-06-15:7705,beta@2020-06-15#2:7701', `week versions: keys / frozen ids (${wk.map((x) => `${x.key}:${x.evStageId}`)})`);
  const W = (k) => wk.find((x) => x.key === k) || { campaign: {}, stageIds: [], periods: [] };
  check(W('beta@2020-06-01').campaign.start === '2020-06-01' && W('beta@2020-06-01').campaign.end === '2020-06-14' && W('beta@2020-06-15').campaign.end === '2020-06-21', 'windows: first Monday to last Sunday');
  check(wk.every((x) => x.vip && x.days === 'all' && x.weekOf === 'beta' && x.periods.join() === '4' && x.name === 'Beta' && x.family === 'SQ22' && x.replacedBy === null), 'versions: VIP, every day, weekOf, period of the start, the set name');
  check(W('beta@2020-06-01').weekTitle === 'Get Star!' && W('beta@2020-06-15').banner === 'Special - VIP Gems x10 banner KHUX.png' && W('beta@2020-06-01').banner === '', 'week title; frozen banner, else the entry\'s');
  check(!wk.some((x) => /Too early/.test(x.weekTitle)), 'a row before the entry\'s window is left out');
  check(W('beta@2020-06-01').stageIds.join() === '977000' && W('beta@2020-06-15').stageIds.join() === '977050' && W('beta@2020-06-15#2').stageIds.join() === '977010', 'own stage ids per version');
  const sw = (id) => ow.stageRows.find((r) => r.stageId === id) || {};
  check(sw(977000).submissionRewardType.join() === '3,3,3' && sw(977000).submissionItemId.join() === '600,90076,90016' && sw(977000).submissionItemNum.join() === '1,8,1', `week 1 rewards: the 7★ of its row (${sw(977000).submissionItemId})`);
  check(sw(977050).submissionRewardType.join() === '5,3,3' && sw(977050).submissionItemId.join() === '48,90076,90016' && sw(977050).submissionItemNum.join() === '10,1,1', 'gems week: Power Gem x10');
  check(sw(977010).submissionItemId.join() === '600,90076,90016', 'aliases: banner-named medal, renamed medal, left out -> Moogle 6★');
  check(sw(977000).mapName === 'White Rabbit\'s House' && sw(977000).useAp === 0 && sw(977000).name === 'Beta', 'versions on the set\'s quest (room, AP, name)');
  check(ow.report.weeklyLeftOut.length === 1 && ow.report.weeklyLeftOut[0][2] === 'Lost Part' && ow.report.weeklyAliased.length === 2, 'report: left out / aliased');
  check(!wk.some((x) => /Skill/.test(x.weekTitle)), 'VIP! Skill: not a set, no versions');
  // round 18: VIP! Skill. A set with skills {catalogue skill text -> master skill name} and skillCarrier: «1 6★ <skill>» ->
  // the carrier medal of that rarity with the skill at its maxLv (submissionSkillType 1 / Id / Lv); weeks that are not
  // consecutive -> one version per run
  check(ms.skillPart('Scrooge 6★ {ATK B X Max & Lux++}').reward === 'Scrooge 6★' && ms.skillPart('Scrooge 6★ {ATK B X Max & Lux++}').skill === 'ATK B X Max & Lux++'
    && ms.skillPart('Moogle 6★').skill === null, 'skillPart');
  check(JSON.stringify(ms.runsOf(['2020-09-28', '2020-10-19', '2020-10-26', '2020-11-09'])) === JSON.stringify([['2020-09-28'], ['2020-10-19', '2020-10-26'], ['2020-11-09']]), 'runsOf');
  {
    const catS = { ...catW, vip_recurring_weekly: { 'VIP! Skill': [
      { banner: 'VIP! Skill', dates: '06/01/20 - 06/07/20; 06/15/20 - 06/21/20', rewards: ['1 6★ ATK B X Max & Lux++', '1 6★ Magic Mirror', '1 6★ Moogle'] },
      { banner: 'VIP! Skill 2', dates: '06/08/20 - 06/14/20', rewards: ['1 6★ Defense Boost VII Max', '1 6★ ATK B X Max & Lux++', '1 6★ Moogle |}'] },
    ] } };
    const masterS = { ...masterW, medal: [...masterW.medal, { medalId: 90126, name: 'Scrooge', rare: 6 }, { medalId: 90136, name: 'Magic Mirror', rare: 6 }],
      skill: [{ skillId: 1209, name: 'ATK B X Max & Lux++', maxLv: 20 }, { skillId: 1157, name: 'Defense Boost VII Max', maxLv: 20 }] };
    const rulesS = { ...rules, entries: [...rules.entries, { key: 'skill', evStageId: 7004, quests: ['Beta'], name: 'VIP! Skill', family: 'SQ22', periods: [4], days: 'all', vip: true,
      replacedBy: null, removed: '', resetGroup: '', useAp: [0], rewards: ['Scrooge 6★ {Defense Boost VII Max} x1', 'Magic Mirror 6★ x1', 'Moogle 6★ x1'], drops: [] },
      { key: 'skill-wo', evStageId: 7005, quests: ['Beta'], name: 'VIP! Skill', family: 'SQ22', periods: [4], days: 'all', vip: true, weeklyOnly: true,
      replacedBy: null, removed: '', resetGroup: '', useAp: [0], rewards: ['Scrooge 6★ {Defense Boost VII Max} x1', 'Magic Mirror 6★ x1', 'Moogle 6★ x1'], drops: [] }] };
    const weeklyS = { sets: { 'VIP! Skill': { entry: 'skill', skillCarrier: 'Scrooge', skills: { 'ATK B X Max & Lux++': 'ATK B X Max & Lux++', 'Defense Boost VII Max': 'Defense Boost VII Max' } } } };
    const os = ms.build({ ...rulesS, weekly: weeklyS }, catS, masterS);
    const vs = os.index.entries.filter((x) => x.weekOf === 'skill');
    check(vs.map((x) => `${x.key}:${x.campaign.start}/${x.campaign.end}`).join() === 'skill@2020-06-01:2020-06-01/2020-06-07,skill@2020-06-15:2020-06-15/2020-06-21,skill@2020-06-08:2020-06-08/2020-06-14',
      `skill set: one version per run of weeks (${vs.map((x) => `${x.key}:${x.campaign.start}/${x.campaign.end}`)})`);
    const rowOf = (k) => os.stageRows.find((r) => r.stageId === vs.find((x) => x.key === k).stageIds[0]);
    const a = rowOf('skill@2020-06-01'), b = rowOf('skill@2020-06-08');
    check(a.submissionRewardType.join() === '3,3,3' && a.submissionItemId.join() === '90126,90136,90016' && a.submissionItemNum.join() === '1,1,1', `skill week: Scrooge 6★ carrier (${a.submissionItemId})`);
    check(a.submissionSkillType.join() === '1,0,0' && a.submissionSkillId.join() === '1209,0,0' && a.submissionSkillLv.join() === '20,0,0', `skill week: skill 1209 at maxLv 20 on objective 1 (${a.submissionSkillId}/${a.submissionSkillLv})`);
    check(b.submissionItemId.join() === '90126,90126,90016' && b.submissionSkillId.join() === '1157,1209,0' && b.submissionSkillLv.join() === '20,20,0', `skill week 2: two skill medals (${b.submissionSkillId})`);
    const fb = os.stageRows.find((r) => r.stageId === os.index.entries.find((x) => x.key === 'skill').stageIds[0]);
    check(fb.submissionItemId[0] === 90126 && fb.submissionSkillId.join() === '1157,0,0', 'set entry (fallback): rewards with «{skill}» parsed too');
    check(os.report.weeklySkills.length === 4, `report: skill rewards (${os.report.weeklySkills.length})`);
    const sp0 = require('./special');
    // coordinator ruling 30-10: a weeklyOnly set entry (VIP! Skill) has no fallback: no rows, not in the index, its id reserved;
    // its week versions are listed only in their weeks and grouped as one quest in the catalogue
    const ow = ms.build({ ...rulesS, entries: rulesS.entries.filter((x) => x.key !== 'skill'), weekly: { sets: { 'VIP! Skill': { ...weeklyS.sets['VIP! Skill'], entry: 'skill-wo' } } } }, catS, masterS);
    const woV = ow.index.entries.filter((x) => x.weekOf === 'skill-wo');
    check(woV.length === 3 && !ow.index.entries.some((x) => x.key === 'skill-wo') && !ow.evStageRows.some((r) => r.eventStageId === 7005) && !ow.stageRows.some((r) => r.stageId === 970050),
      `weeklyOnly: versions only, no entry / rows (${woV.map((x) => x.key)})`);
    const lsW = (from, to) => sp0.currentEntries(ow.index, { period: 4, shopFrom: from, shopTo: to }).filter((x) => /^skill-wo/.test(x.key) || x.weekOf === 'skill-wo').map((x) => x.key).join();
    check(lsW('2020-06-08', '2020-06-14') === 'skill-wo@2020-06-08' && lsW('2020-06-22', '2020-06-28') === '', `weeklyOnly: nothing in a week without a row (${lsW('2020-06-22', '2020-06-28')})`);
    const famW = require('./special-pages').familiesOf(ow.index.entries).filter((f) => f.list.some((x) => x.weekOf === 'skill-wo'));
    check(famW.length === 1 && famW[0].versions.length === 3 && famW[0].list.length === 3, `weeklyOnly: catalogue groups the weeks as one quest (${famW.length} / ${famW[0]?.versions.length})`);
    let woBad = false; try { ms.build({ ...rulesS, entries: rulesS.entries.map((x) => (x.key === 'skill-wo' ? { ...x, evStageId: 7004 } : x)), weekly: { sets: {} } }, catS, masterS); } catch { woBad = true; }
    check(woBad, 'weeklyOnly: its reserved id still counts as used (no reuse)');
    const lsS = (from, to) => sp0.currentEntries(os.index, { period: 4, shopFrom: from, shopTo: to }).filter((x) => x.vip && (x.key === 'skill' || x.weekOf === 'skill')).map((x) => x.key).join();
    check(lsS('2020-06-08', '2020-06-14') === 'skill@2020-06-08' && lsS('2020-06-15', '2020-06-21') === 'skill@2020-06-15' && lsS('2020-06-22', '2020-06-28') === 'skill',
      `skill set listing per week (${lsS('2020-06-08', '2020-06-14')} / ${lsS('2020-06-15', '2020-06-21')} / ${lsS('2020-06-22', '2020-06-28')})`);
    const badS = (w, why, m = masterS) => { let t = false; try { ms.build({ ...rulesS, weekly: w }, catS, m); } catch { t = true; } check(t, why); };
    badS({ sets: { 'VIP! Skill': { ...weeklyS.sets['VIP! Skill'], skills: { ...weeklyS.sets['VIP! Skill'].skills, 'ATK B X Max & Lux++': 'No Such Skill' } } } }, 'unknown skill name rejected');
    badS({ sets: { 'VIP! Skill': { ...weeklyS.sets['VIP! Skill'], skillCarrier: undefined } } }, 'skills without a carrier rejected');
  }
  check(ow.evStageRows.filter((r) => r.eventStageId >= 7700).map((r) => `${r.eventStageId}:${r.validStageId}`).join() === '7700:1,7705:1,7701:1', 'one evStage row per version');
  check(ow.maps.filter((m) => m.stageId >= 977000).length === 3 && ow.maps.filter((m) => m.stageId >= 977000).every((m) => m.targetReward === 1 && m.enemies.flat().every((x) => x.reward === 1) && m.level === 15), 'a map per version: row 1 on every enemy, level of the set\'s quest');
  check(ow.stageRows.every((r) => r.stageId < 980000 && ![95100, 95200].includes(r.stageId)), 'stage ids < 980000, never 95100 / 95200');
  // the Special tab: the week's version instead of the set's entry; two versions are two stages with their own objectives
  const sp = require('./special');
  const ls = (from, to) => sp.currentEntries(ow.index, { period: 4, shopFrom: from, shopTo: to }).filter((x) => x.vip).map((x) => x.key).join();
  check(ls('2020-06-08', '2020-06-14') === 'beta@2020-06-01', `week 2020-06-08: its version only (${ls('2020-06-08', '2020-06-14')})`);
  check(ls('2020-06-15', '2020-06-21') === 'beta@2020-06-15,beta@2020-06-15#2', `week with two rows: both (${ls('2020-06-15', '2020-06-21')})`);
  check(ls('2020-06-22', '2020-06-28') === 'beta', 'week without a row: the set\'s entry (fallback)');
  const done = { 977050: [1, 2, 3] };
  const evs = sp.specialEvents(ow.index, { period: 4, weekday: 'Mon', vip: true, pinnedKey: '', shopFrom: '2020-06-15', shopTo: '2020-06-21',
    dayEndStr: 'D', weekEndStr: 'W', imgBase: '', stageState: (id) => ({ score: 0, playStatus: id in done ? 2 : 0, clearMissionIds: done[id] || [] }) });
  check(evs.find((x) => x.eventStageId === 7705)?.complete === 1 && evs.find((x) => x.eventStageId === 7701)?.complete === 0, 'objectives per week version (stage), not shared');
  // ids stay frozen when the table grows / reorders; a frozen key without a row and an unknown reward are rejected
  const catW2 = { ...catW, vip_recurring_weekly: { 'VIP! Beta': [catW.vip_recurring_weekly['VIP! Beta'][2], { banner: 'New', dates: '06/22/20 - 06/28/20', rewards: ['1 7★ Star', '1 6★ Moogle', '1 6★ Moogle'] }, ...catW.vip_recurring_weekly['VIP! Beta']] } };
  const frozenAll = Object.fromEntries(wk.map((x) => [x.key, { evStageId: x.evStageId }]));
  const ow2 = ms.build({ ...rules, weekly: { ...weekly, versions: frozenAll } }, catW2, masterW);
  const ids2 = Object.fromEntries(ow2.index.entries.filter((x) => x.weekOf).map((x) => [x.key, x.evStageId]));
  check(ids2['beta@2020-06-01'] === 7700 && ids2['beta@2020-06-15'] === 7705 && ids2['beta@2020-06-15#2'] === 7701 && ids2['beta@2020-06-22'] === 7702, `frozen ids kept, new version next free (${JSON.stringify(ids2)})`);
  const badW = (w, why, cat = catW) => { let t = false; try { ms.build({ ...rules, weekly: w }, cat, masterW); } catch { t = true; } check(t, why); };
  badW({ ...weekly, versions: { ...weekly.versions, 'beta@2020-07-06': { evStageId: 7800 } } }, 'frozen version without a table row rejected');
  badW({ ...weekly, aliases: {} }, 'reward not in the master without an alias rejected');
  badW({ ...weekly, sets: { 'VIP! Beta': { entry: 'nope' } } }, 'set on an unknown entry rejected');
  // fix round 1: a dropped version (its rewards are a campaign's) is left out, its id stays reserved
  const ow3 = ms.build({ ...rules, weekly: { ...weekly, versions: { ...weekly.versions, 'beta@2020-06-01': { evStageId: 7700, dropped: 'given by campaign C1' } } } }, catW, masterW);
  const ids3 = Object.fromEntries(ow3.index.entries.filter((x) => x.weekOf).map((x) => [x.key, x.evStageId]));
  check(!('beta@2020-06-01' in ids3) && ids3['beta@2020-06-15'] === 7705 && ids3['beta@2020-06-15#2'] === 7701 && !ow3.evStageRows.some((r) => r.eventStageId === 7700),
    `dropped version: left out, id 7700 reserved (${JSON.stringify(ids3)})`);
  // fix round 1: campaign ids (7501 up) and week-version ids (7700 up) never collide
  const errOf = (r, cat) => { try { ms.build(r, cat, masterW); return ''; } catch (err) { return err.message; } };
  check(/week-version id 7650 outside 7700-7999/.test(errOf({ ...rules, weekly: { ...weekly, versions: { ...weekly.versions, 'beta@2020-06-15': { evStageId: 7650 } } } }, catW)),
    'a frozen week-version id below 7700 rejected with a clear message');
}
{
  const catC = { ...catalogue, quests: [...catalogue.quests, { quest: 'VIP! Medal Quest', series: 'VIP! Medal Quest', world: 'Wonderland', room: "White Rabbit's House", ap: 'zero', level: '15', target: 'King Pretender', objectives: [
    'Complete without having to continue -> (See table) x1', 'Complete without having to continue -> (See table) x1', 'Complete without having to continue -> (See table) x1'] }],
  vip_limited_campaigns_ww: [{ id: 'E1-1', notice: 1, date: '2020-06-01', title: 'A', start: '2020-06-01', end: '2020-06-08' }, { id: 'E2-1', notice: 2, date: '2020-06-08', title: 'B', start: '2020-06-08', end: '2020-06-15' }] };
  const part = { parts: [{ quest: 'VIP! X', rewards: ['Cid 6★ x1', 'Cid 6★ x1', 'Cid 6★ x1'] }] };
  const errOf = (campaigns) => { try { ms.build({ ...rules, campaigns }, catC, master); return ''; } catch (err) { return err.message; } };
  check(/campaign C2: evStageId 7700 in the week-version range \(7700\+\)/.test(errOf({ C1: { ...part, evStageId: 7699 }, C2: part })), `next campaign id reaching 7700 rejected (${errOf({ C1: { ...part, evStageId: 7699 }, C2: part })})`);
  check(/campaign C1: evStageId 7700 in the week-version range/.test(errOf({ C1: { ...part, evStageId: 7700 }, C2: { ...part, evStageId: 7501 } })), 'frozen campaign id 7700 rejected');
  check(errOf({ C1: { ...part, evStageId: 7698 }, C2: part }) === '', 'campaign ids up to 7699 accepted');
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
  check(JSON.parse(first[4]).filter((r) => r.enemyId === ms.DUMMY_ENEMY_ID).length === 1 && JSON.parse(first[4]).length === master.enemy.length + 2,
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
const p4 = real.entries.filter((e) => e.periods.includes(4) && !e.weeklyOnly);
check(p4.filter((e) => e.resetGroup === 'cid').length === 7, '7 Daily Cid entries');
check(p4.filter((e) => e.vip).length === 9, '9 VIP entries (6 + VIP! Materials 1-2 and VIP! Jewels & Spirit Part, Task 12; VIP! Skill is weeklyOnly)');
check(real.entries.filter((e) => e.removed === 'no-use').length === 2, 'Mythril Madness and Adamantite removed');
check(new Set(real.entries.map((e) => e.evStageId)).size === real.entries.length && new Set(real.entries.map((e) => e.key)).size === real.entries.length, 'unique keys and evStageIds');
const MASTER = path.join(__dirname, 'master_data');
const SRC = process.env.KHUX_SPECIAL_SRC || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\special\\special_quests.json';
if (fs.existsSync(path.join(MASTER, 'stage.json')) && fs.existsSync(SRC)) {
  const t = (n) => JSON.parse(fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'));
  const all = ms.build(real, JSON.parse(fs.readFileSync(SRC, 'utf8')), { stage: t('stage'), enemy: t('enemy'), medal: t('medal'),
    material: t('material'), reward: t('reward'), skill: t('skill'), title: t('title'), avatarParts: t('avatarParts'), keyblade: t('keyblade'), enemyAttack: t('enemyAttack') });
  const live = real.entries.filter((e) => !e.removed && !e.weeklyOnly);
  const weeklyV = all.index.entries.filter((e) => e.weekOf);
  check(all.evStageRows.length === 1 + live.length + 120 + 198, `real build: ${all.evStageRows.length} evStage rows (1 + ${live.length} + 120 campaigns + 198 week versions)`);
  // the 120 WW week-limited VIP campaigns (Task 12)
  const sp = require('./special');
  const camps = all.index.entries.filter((e) => e.campaign && !e.weekOf);
  check(camps.length === 120 && camps.every((e, i) => e.evStageId === 7501 + i && /^C\d+$/.test(e.key)), `real build: 120 campaigns 7501-7620 (${camps.length})`);
  // final review: the frozen ids are the ones of the live index (server/game_data/special.json, read only)
  check(camps.every((e) => real.campaigns[e.key].evStageId === e.evStageId), 'real build: campaign ids not frozen in special_periods.json');
  const LIVE = path.join(__dirname, 'game_data', 'special.json');
  if (fs.existsSync(LIVE)) {
    const liveIds = new Map(JSON.parse(fs.readFileSync(LIVE, 'utf8')).entries.filter((e) => e.campaign).map((e) => [e.key, e]));
    check(camps.every((e) => liveIds.get(e.key)?.evStageId === e.evStageId && liveIds.get(e.key).stageIds.join() === e.stageIds.join()),
      'real build: campaign evStageIds / stageIds differ from the live game_data/special.json');
  }
  check(camps.every((e) => e.vip && e.stageIds.length >= 1 && e.stageIds.length <= 5 && e.campaign.start <= e.campaign.end), 'real build: campaigns VIP, 1-5 quests, window start <= end');
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const listedAt0 = (from) => sp.currentEntries(all.index, { period: sp.periodOf(from, real.periods), shopFrom: from, shopTo: addD(from, 6) });
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
  // round 17: the recurring VIP sets follow the weekly rotation (catalogue vip_recurring_weekly, appendix B)
  const perSet = {};
  for (const e of weeklyV) perSet[e.weekOf] = (perSet[e.weekOf] || 0) + 1;
  check(JSON.stringify(perSet) === JSON.stringify({ 'vip-medal': 46, 'vip-gems': 18, 'vip-draw-ticket': 8, 'vip-dual-meow-wow': 5, 'vip-spirit-part': 14, 'vip-jewels-avatar': 81, 'vip-subslot': 2, 'vip-skill': 24 }),
    `real build: week versions per set ${JSON.stringify(perSet)}`);
  check(weeklyV.every((e) => real.weekly.versions[e.key]?.evStageId === e.evStageId && e.evStageId >= 7700 && e.evStageId <= 7999), 'real build: week version ids frozen in special_periods.json (7700-7999)');
  check(Object.keys(real.weekly.versions).filter((k) => !k.startsWith('_')).length === 201, 'real build: 201 frozen week-version ids (3 dropped, reserved)');
  // fix round 1 (ruling): the two clipped Medal Quest rows of 2019-03-04 are the campaigns' (C49538 / C49546, C50518): dropped, ids reserved
  const dropped = Object.entries(real.weekly.versions).filter(([k, v]) => !k.startsWith('_') && v.dropped).map(([k, v]) => `${k}:${v.evStageId}`);
  check(dropped.join() === 'vip-medal@2019-03-04:7700,vip-medal@2019-03-04#2:7701,vip-skill@2021-01-04#2:7893' && !all.evStageRows.some((r) => [7700, 7701, 7893].includes(r.eventStageId)), `real build: dropped versions ${dropped}`);
  // cross-check: no week version gives a 7★ medal that a campaign of an overlapping week already gives
  const rare7 = new Set(t('medal').filter((m) => m.rare === 7).map((m) => m.medalId));
  const medals7 = (en) => en.stageIds.flatMap((id) => { const r = all.stageRows.find((x) => x.stageId === id); return r.submissionItemId.filter((m, i) => r.submissionRewardType[i] === 3 && rare7.has(m)); });
  const clash = [];
  // (the row's own first week, before the clip to the entry's from: clippedFrom)
  for (const v of weeklyV) for (const c of camps.filter((c) => c.campaign.start <= v.campaign.end && c.campaign.end >= (v.clippedFrom || v.campaign.start))) {
    const both = medals7(v).filter((m) => medals7(c).includes(m));
    if (both.length) clash.push(`${v.key} / ${c.key}: ${both}`);
  }
  check(!clash.length, `real build: 7★ medals of a week version also given by an overlapping campaign: ${clash.join('; ')}`);
  // bench rev 223: Shop weeks starting on Thursday (tranche days) list one version per set too: the one containing the
  // first day; two only when two original banners of the set ran on that day
  const jaThu = listedAt0('2020-09-03').filter((e) => e.weekOf === 'vip-jewels-avatar').map((e) => e.key);
  check(jaThu.join() === 'vip-jewels-avatar@2020-08-31', `real build: Shop week Thu 2020-09-03: one Jewels & Avatar Parts version (${jaThu})`);
  const extra = [];
  for (let d = '2018-10-01'; d <= '2021-05-31'; d = addD(d, 1)) {
    if (![1, 4].includes(new Date(d + 'T00:00:00Z').getUTCDay())) continue;
    const by = {};
    for (const en of listedAt0(d)) if (en.weekOf) (by[en.weekOf] ||= []).push(en);
    for (const [set, vs] of Object.entries(by)) if (vs.length > 1 && !vs.every((v) => v.campaign.start <= d && v.campaign.end >= d)) extra.push(`${d} ${set}: ${vs.map((v) => v.key)}`);
  }
  check(!extra.length, `real build: Monday / Thursday Shop weeks with two versions of a set that did not run together: ${extra.slice(0, 5).join('; ')}`);
  // ruling: two versions of one set in the same week where the original banners overlapped (faithful), each with a _note
  const twoWeeks = [], twoKeys = new Set();
  for (let w = '2018-10-01'; w <= '2021-05-24'; w = addD(w, 7)) {
    const by = {};
    for (const en of listedAt0(w)) if (en.weekOf) (by[en.weekOf] ||= []).push(en.key);
    for (const [set, keys] of Object.entries(by)) if (keys.length > 1) { twoWeeks.push(`${w} ${set}`); keys.forEach((k) => twoKeys.add(k)); }
  }
  check(twoWeeks.join() === ['2019-06-03 vip-medal', '2019-06-10 vip-medal', '2019-07-22 vip-gems', '2019-07-29 vip-gems', '2019-09-23 vip-medal', '2019-09-30 vip-medal', '2019-10-28 vip-medal'].join(),
    `real build: weeks with two versions of a set ${twoWeeks}`);
  check([...twoKeys].every((k) => /two/.test(real.weekly.versions[k]._note || '')) && Object.entries(real.weekly.versions).filter(([, v]) => /two versions/.test(v._note || '')).length === twoKeys.size,
    `real build: _note on exactly the versions sharing a week (${[...twoKeys].filter((k) => !real.weekly.versions[k]._note)})`);
  // round 18: VIP! Skill. Skill resolution of every reward text of the catalogue table (tmp/vipskill/SKILLS.md): the
  // master skill id, maxLv 20, carrier Scrooge 6★ (90126)
  const SKILL_IDS = { 'ATK B VIII Max & Paralysis': 1172, 'Attack Boost X Max': 1142, 'ATK B X Max & Lux++': 1209, 'AB IX Max & Lux++ & GA 2': 1222,
    'ATK B XIII Max & Paralysis': 1176, 'Defense Boost VII Max': 1157, 'ATK B XIV Max & GA 2': 1262, 'AB X Max & Lux++ & GA 2': 1223,
    'ATK B XIV Max & Paralysis': 1177, 'ATK B XIV Max & Sleep': 1163, 'ATK B XIII Max & GA 0': 1261, 'AB X Max & Lux++ & GA 1': 1224,
    'ATK B XI Max & Lux++': 1211, 'ATK B XIV Max & GA 1': 1263, 'AB X Max & Lux++ & GA 0': 1225, 'ATK B XIV Max & GA 0': 1264,
    'DEF Boost VIII Max': 1158, 'Attack Boost XV Max': 1147 };
  const catAll = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const texts = [...new Set(catAll.vip_recurring_weekly['VIP! Skill'].flatMap((r) => r.rewards).map((x) => ms.weeklyLabel(x).replace(/ 6★ x1$/, ''))
    .filter((n) => !['Moogle', 'Magic Mirror', 'Huey & Dewey & Louie'].includes(n)))].sort();
  check(texts.join('|') === Object.keys(SKILL_IDS).sort().join('|'), `VIP! Skill reward texts: ${texts.join(' | ')}`);
  const skillT = t('skill'), skillSet = real.weekly.sets['VIP! Skill'];
  for (const [txt, id] of Object.entries(SKILL_IDS)) {
    const row = skillT.find((r) => r.name === skillSet.skills[txt]);
    check(row && row.skillId === id && row.maxLv === 20, `skill «${txt}» -> ${row ? `${row.skillId} LV ${row.maxLv}` : 'missing'} (want ${id} LV 20)`);
  }
  check(skillSet.entry === 'vip-skill' && skillSet.skillCarrier === 'Scrooge', 'VIP! Skill set: entry vip-skill, carrier Scrooge');
  const skillV = weeklyV.filter((e) => e.weekOf === 'vip-skill');
  const srow = (en) => all.stageRows.find((r) => r.stageId === en.stageIds[0]);
  const skillCells = skillV.flatMap((en) => { const r = srow(en); return [0, 1, 2].filter((i) => r.submissionSkillId[i]).map((i) => [r, i]); });
  check(skillCells.length === 40 && skillCells.every(([r, i]) => r.submissionRewardType[i] === 3 && r.submissionItemId[i] === 90126 && r.submissionItemNum[i] === 1
    && r.submissionSkillType[i] === 1 && Object.values(SKILL_IDS).includes(r.submissionSkillId[i]) && r.submissionSkillLv[i] === 20),
    `real build: VIP! Skill rewards = Scrooge 6★ x1 with a table skill at LV 20 (${skillCells.length} of 40)`);
  check(!all.index.entries.some((e) => e.key === 'vip-skill') && !all.evStageRows.some((r) => r.eventStageId === 7092) && real.entries.find((e) => e.key === 'vip-skill')?.evStageId === 7092,
    'real build: VIP! Skill has no fallback entry (ruling 30-10), id 7092 reserved');
  check(all.stageRows.filter((r) => !skillV.some((en) => en.stageIds.includes(r.stageId)))
    .every((r) => r.submissionSkillId.every((x) => x === 0)), 'real build: no assigned skill outside VIP! Skill');
  const skAt = (from) => listedAt0(from).filter((e) => e.key === 'vip-skill' || e.weekOf === 'vip-skill').map((e) => e.key).join();
  check(skAt('2020-09-07') === 'vip-skill@2020-09-07' && skAt('2020-10-19') === 'vip-skill@2020-10-19' && skAt('2020-10-12') === 'vip-skill@2020-10-12'
    && skAt('2020-10-05') === '' && skAt('2021-01-04') === 'vip-skill@2021-01-04' && skAt('2021-03-01') === '' && skAt('2019-05-20') === ''
    && skAt('2019-06-03') === '' && skAt('2019-05-27') === 'vip-skill@2019-05-27' && skAt('2019-07-15') === 'vip-skill@2019-07-08' && skAt('2019-08-05') === '' && skAt('2020-01-06') === '',
    `real build: VIP! Skill listing per week (${['2020-09-07', '2020-10-19', '2020-10-12', '2020-10-05', '2021-01-04', '2021-03-01', '2019-05-20', '2019-06-03', '2019-05-27', '2019-07-15', '2019-08-05', '2020-01-06'].map(skAt)})`);
  const famS = require('./special-pages').familiesOf(all.index.entries).filter((f) => f.list.some((x) => x.weekOf === 'vip-skill'));
  check(famS.length === 1 && famS[0].list.length === 24 && famS[0].list.every((x) => x.weekOf === 'vip-skill'), `real build: catalogue groups the 24 VIP! Skill weeks as one quest (${famS.length})`);
  const s907 = srow(skillV.find((e) => e.key === 'vip-skill@2020-09-07'));
  check(s907.submissionItemId.join() === '90126,90156,90016' && s907.submissionSkillId.join() === '1209,0,0', 'real build: week 2020-09-07 = Scrooge 6★ ATK B X Max & Lux++, Magic Mirror 6★, Moogle 6★');
  const medalOf = (label) => { const m = t('medal').filter((x) => `${x.name} ${x.rare}★` === label).sort((a, b) => a.medalId - b.medalId)[0]; return m ? m.medalId : -1; };
  const listedAt = (from) => sp.currentEntries(all.index, { period: sp.periodOf(from, real.periods), shopFrom: from, shopTo: addD(from, 6) });
  const medalAt = (from) => listedAt(from).filter((e) => e.key === 'vip-medal' || e.weekOf === 'vip-medal');
  const goofy = medalAt('2020-05-25');
  check(goofy.length === 1 && goofy[0].key === 'vip-medal@2020-05-25' && all.stageRows.find((r) => r.stageId === goofy[0].stageIds[0]).submissionItemId[0] === medalOf('SN++ - KH III Goofy 7★'),
    `real build: week 2020-05-25 lists its Medal Quest version with SN++ - KH III Goofy 7★ (${goofy.map((e) => e.key)})`);
  const cidW = medalAt('2020-06-01'), donW = medalAt('2020-06-08');
  check(cidW.length === 1 && donW.length === 1 && cidW[0].stageIds[0] !== donW[0].stageIds[0]
    && all.stageRows.find((r) => r.stageId === cidW[0].stageIds[0]).submissionItemId[0] === medalOf('SN++ - KH III Cid 7★')
    && all.stageRows.find((r) => r.stageId === donW[0].stageIds[0]).submissionItemId[0] === medalOf('SN++ - KH III Donald 7★'), 'real build: two weeks = two stages with their own rewards');
  check(medalAt('2020-05-11').map((e) => e.key).join() === 'vip-medal' && medalAt('2020-06-15').map((e) => e.key).join() === 'vip-medal', 'real build: weeks without a row keep the representative vip-medal (fallback)');
  check(listedAt('2019-07-22').filter((e) => e.weekOf === 'vip-gems').length === 2 && !listedAt('2019-07-22').some((e) => e.key === 'vip-gems'), 'real build: two Gems rows in one week, both listed, no fallback');
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
  check(all.stageRows.every((r) => r.stageId < 980000 && ![95100, 95200].includes(r.stageId)), 'real build: no stage 95100 / 95200, all < 980000');
  // enemy level (bench 30-10: MOG at LV 1): every map entry carries the catalogue Lv of its quest (gen_story_maps.py
  // writes it into STG [11], the card / enemy level, and into every enemy record); addLevel stays 0 so it is not added twice
  const cat = JSON.parse(fs.readFileSync(SRC, 'utf8')).quests;
  const lvOf = (name) => { const q = cat.find((c) => c.quest === name || name.startsWith(`${c.quest} (`)); return q ? parseInt(q.level, 10) : null; };
  const quests = all.index.entries.flatMap((e) => e.stages);
  const badLv = all.maps.filter((m) => m.stageId !== 970000).filter((m) => {
    const st = quests.find((s) => s.stageId === m.stageId); const lv = lvOf(st.quest);
    const old = st.mapEnemies ? 25 : lv; // VIP! Skill 2019 (Curious Room LV 25): the catalogue row holds the 2020 level
    return !(m.level > 1 && (lv === null || m.level === old));
  });
  check(!badLv.length, `real build: map level = catalogue Lv (${badLv.slice(0, 5).map((m) => `${m.stageId} ${m.level}`).join(', ')})`);
  check(all.maps.find((m) => m.stageId === 970100)?.level === 160 && lvOf("A New Keyblade: Moogle O' Glory") === 160,
    'real build: MOG 970100 at Lv 160');
  check(all.stageRows.every((r) => r.addLevel === 0), 'real build: addLevel 0 on every Special stage row');
  check(all.maps.find((m) => m.stageId === 970000)?.level === 1, 'real build: training at Lv 1');
  // training (bench 30-10, «Munny 131» in CONGRATULATIONS): the client adds up the enemy rows, all at 0 on path A
  const rtr = all.maps.find((m) => m.stageId === 970000), allEnemies = [...t('enemy').filter((e) => e.enemyId !== ms.DUMMY_ENEMY_ID && e.enemyId !== ms.TRAINING_SHADOW_ID), ...all.enemyRows];
  const pathA = [rtr.targetId, ...rtr.enemies.flat().map((x) => x.enemyId)];
  check(rtr.targetId === ms.TRAINING_TARGET_ID && pathA.every((id) => { const e = allEnemies.find((x) => x.enemyId === id); return e && e.name === 'Shadow' && [...e.money, ...e.exp, ...e.lux].every((v) => v === 0); }),
    'real build: training path A enemies give no Munny, EXP or Lux');
  check(all.stageRows.find((r) => r.stageId === 970000).submissionId.join() === `${ms.TRAINING_TARGET_ID},0,${ms.TRAINING_TARGET_ID}`, 'real build: training objectives count the zero-reward target');
  check(all.enemyRows[1].hp[0] === t('enemy').find((e) => e.enemyId === 80001).hp[0] && all.enemyRows[1].attack[0] === t('enemy').find((e) => e.enemyId === 80001).attack[0], 'real build: training Shadows as strong as row 80001');
  // VIP! Skill 2019 = the original Curious Room quest (khuxwiki «Old» tab), 2020 versions unchanged
  for (const k of ['vip-skill@2019-05-27', 'vip-skill@2019-07-08']) {
    const st = all.index.entries.find((e) => e.key === k).stages[0], mp = all.maps.find((m) => m.stageId === st.stageId);
    const row = all.stageRows.find((r) => r.stageId === st.stageId);
    check(st.room === 'Curious Room' && st.target === "Bag O' Jewels" && st.attribute === 'Speed' && st.wikiLv === 25 && row.useAp === 0 && row.mapName === 'Curious Room', `real build: ${k} on the 2019 room`);
    check(mp.level === 25 && mp.targetId === 10023 && mp.enemies.length === 1 && mp.enemies[0].length === 1 && mp.enemies[0][0].name === "Bag O' Coins", `real build: ${k} map = target + Bag O' Coins`);
  }
  const v2020 = all.index.entries.find((e) => e.key === 'vip-skill@2020-09-07').stages[0];
  check(v2020.room === "White Rabbit's House" && v2020.target === 'Gift Shadow' && v2020.wikiLv === 15 && !v2020.mapEnemies, "real build: VIP! Skill 2020 keeps White Rabbit's House LV 15");
  const rt = all.maps.find((m) => m.stageId === 970000), rd = all.enemyRows[0];
  check(rt && rt.training && rt.chests.length === 5 && rd && rd.displayId === 7 && rd.skillId[1] === 2101, 'real build: training map with 5 CP chests, dummy with the heal');
  check(!t('enemy').some((e) => e.enemyId === ms.DUMMY_ENEMY_ID && e.name !== 'Training Dummy'), 'real build: enemy id of the dummy free');
  console.log(`(real build: ${all.stageRows.length} stage, ${all.evStageRows.length} evStage, ${all.rewardRows.length} reward rows, ${all.maps.length} maps; `
    + `entries per period ${[1, 2, 3, 4, 5].map((n) => live.filter((e) => e.periods.includes(n)).length).join('/')})`);
} else console.log('(local master or private catalogue missing: real build skipped)');

if (errors.length) { console.error(`test-make-special: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-make-special: OK');
