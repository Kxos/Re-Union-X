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
      vip: false, replacedBy: null, removed: '', resetGroup: 'cid', drops: [{ type: 3, id: 90076, num: 1 }, { type: 5, id: 1, num: 1 }] },
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
const master = {
  stage: [story, { ...story, stageId: 970123, id: 970123, stageKind: 2, name: 'old special' }],
  enemy: [{ enemyId: 1, name: 'Shadow' }, { enemyId: 1003, name: 'King Pretender' }, { enemyId: 11003, name: 'King Pretender' },
    { enemyId: 1002, name: 'Great Pretender' }],
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
check(a1 && a1.thumbId === 77 && a1.raidBoss === 5001 && a1.bgmField === 11, 'cloned from the last story row of the world');
check(b && b.worldId === 3, 'Wonderland world 3 (no story row: fallback to the last story row)');
// objectives through objectiveCodes, like the story rows
const ctx = { target: 1003, targetName: 'King Pretender', enemyId: (n) => ({ 'great pretender': 1002, 'king pretender': 1003 })[n.toLowerCase()] || 0 };
const c0 = objectiveCodes('Defeat the target enemy within 1 turn', ctx);
check(a1 && a1.validSubmission === 3 && a1.submissionRequire[0] === c0.req && a1.submissionName[0] === c0.name
  && a1.submissionId[0] === 1003 && a1.submissionNum[0] === 1 && a1.submissionDataType[0] === 4, 'objective 1 codes as in the story rows');
check(a1 && a1.submissionRequire[1] === 4 && a1.submissionId[1] === 1002 && a1.submissionNum[1] === 1, '«Defeat Great Pretender x 1»');
check(a1 && a1.submissionRequire[2] === 5 && a1.submissionNum[2] === 2, '«Use 2 or more special attacks»');
check(a1 && a1.submissionRewardType.join() === '14,3,5' && a1.submissionItemId.join() === '0,90076,1'
  && a1.submissionItemNum.join() === '5,1,1', 'objective rewards: Avatar Coin, Cid 6★, Mythril Shard');
check(b && b.submissionRewardType.join() === '2,3,5' && b.submissionItemNum.join() === '1400,2,3', 'rewards override of the entry');
check(tr && tr.name === 'Training Grounds' && tr.validSubmission === 3 && tr.submissionRequire.join() === '12,10,4'
  && tr.submissionId.join() === '1,0,1', 'training objectives: target, no continue, Shadow x1');
check(tr && tr.submissionRewardType.every((t) => t === 4) && tr.submissionItemNum.join() === '1,1,1', 'training rewards: 1 munny each');

// drop reward rows: one prize per row (position 0), after the current maximum
check(rewardRows.length === 2 && rewardRows.every((r) => r.rewardId > 1 && r.type.length === 1), 'one reward row per drop');
check(rewardRows[0] && rewardRows[0].type[0] === 3 && rewardRows[0].id[0] === 90076 && rewardRows[1].type[0] === 5, 'medal type 3, material type 5');

// index
check(index.catalog && index.catalog.evStageId === 7000 && index.catalog.stageIds.join() === '970000' && index.catalog.useAp.join() === '0', 'index catalog');
const KEYS = ['key', 'evStageId', 'name', 'family', 'periods', 'days', 'vip', 'replacedBy', 'removed', 'campaign', 'resetGroup', 'stageIds', 'useAp'];
check(index.entries.length === 3 && index.entries.every((e) => KEYS.every((k) => k in e)), 'index entries with the Task 2 fields');
const gone = index.entries.find((e) => e.key === 'gone');
check(gone && gone.removed === 'no-use' && gone.stageIds.length === 0 && gone.useAp.length === 0, 'removed entry: index only');
const alpha = index.entries.find((e) => e.key === 'alpha');
check(alpha && alpha.stageIds.join() === '970010,970011' && alpha.useAp.join() === '12,20' && alpha.campaign === null, 'index stageIds/useAp');
check(alpha && alpha.dropRewardIds.length === 2 && alpha.stages[0].wikiLv === 25 && alpha.stages[1].wikiLv === 30
  && alpha.stages[0].targetId === 1003, 'index map data for Task 4 (wikiLv, target, drops)');

// errors on bad rules
const bad = (r, why) => { let t = false; try { ms.build({ ...rules, entries: r }, catalogue, master); } catch { t = true; } check(t, why); };
bad([{ ...rules.entries[0], evStageId: 7002 }, rules.entries[1]], 'duplicate evStageId rejected');
bad([{ ...rules.entries[0], series: ['Nope'] }], 'entry without quests rejected');
bad([{ ...rules.entries[0], drops: [{ type: 3, id: 12345, num: 1 }] }], 'drop not in the medal table rejected');

// patch: twice on a temp master copy gives identical files; old 970123 row dropped
const dir = fs.mkdtempSync(path.join(TMP, 'special-'));
try {
  for (const [k, v] of Object.entries(master)) fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(v));
  fs.writeFileSync(path.join(dir, 'evStage.json'), '[]');
  const opts = { rules, catalogue, gameDataDir: dir };
  ms.patch(dir, opts);
  const snap = () => ['stage', 'evStage', 'reward', 'special'].map((f) => fs.readFileSync(path.join(dir, f + '.json'), 'utf8'));
  const first = snap();
  ms.patch(dir, opts);
  check(JSON.stringify(first) === JSON.stringify(snap()), 'patch is idempotent');
  const st = JSON.parse(first[0]);
  check(!st.some((r) => r.stageId === 970123) && st.filter((r) => r.stageKind === 2).length === 4 && st[0].stageId === 1010, 'patch replaces own stage rows');
  check(JSON.parse(first[1]).length === 3 && JSON.parse(first[2]).length === 3, 'patch evStage and reward rows');
  check(JSON.parse(first[3]).catalog.evStageId === 7000, 'patch writes special.json');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

// --- authored rules (server/special_periods.json) -----------------------------------------------------------
const real = require('./special_periods.json');
check(Array.isArray(real.periods) && real.periods.length === 5 && real.periods.every((p) => p.n && p.name && p.from && p.to), 'periods {n, name, from, to}');
check(real.periods[3].from === '2020-05-23' && real.periods[3].to === '2020-11-15', 'period 4 dates (spec 5.1)');
check(Array.isArray(require('./special').PERIODS) && require('./special').PERIODS.length === 5, 'special.js reads the periods array');
const p4 = real.entries.filter((e) => e.periods.includes(4));
check(p4.filter((e) => e.resetGroup === 'cid').length === 7, '7 Daily Cid entries');
check(p4.filter((e) => e.vip).length === 6, '6 VIP entries');
check(real.entries.filter((e) => e.removed === 'no-use').length === 2, 'Mythril Madness and Adamantite removed');
check(new Set(real.entries.map((e) => e.evStageId)).size === real.entries.length && new Set(real.entries.map((e) => e.key)).size === real.entries.length, 'unique keys and evStageIds');
const MASTER = path.join(__dirname, 'master_data');
const SRC = process.env.KHUX_SPECIAL_SRC || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\special\\special_quests.json';
if (fs.existsSync(path.join(MASTER, 'stage.json')) && fs.existsSync(SRC)) {
  const t = (n) => JSON.parse(fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'));
  const all = ms.build(real, JSON.parse(fs.readFileSync(SRC, 'utf8')), { stage: t('stage'), enemy: t('enemy'), medal: t('medal'),
    material: t('material'), reward: t('reward'), skill: t('skill'), title: t('title'), avatarParts: t('avatarParts'), keyblade: t('keyblade') });
  const live = real.entries.filter((e) => !e.removed);
  check(all.evStageRows.length === 1 + live.length, `real build: ${all.evStageRows.length} evStage rows`);
  check(all.stageRows.every((r) => r.validSubmission === 3), 'real build: 3 objectives on every stage');
  check(all.report.stopgaps.length === 0, `real build: stopgap objectives ${JSON.stringify(all.report.stopgaps)}`);
  const mog = all.index.entries.find((e) => e.key === 'mog');
  check(mog && mog.stageIds.length === 5, 'MOG: 5 stages');
} else console.log('(local master or private catalogue missing: real build skipped)');

if (errors.length) { console.error(`test-make-special: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-make-special: OK');
