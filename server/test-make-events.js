// Event quest generator: node server/test-make-events.js
// Synthetic fixtures only (no donor row, no notice text). `real_config_covers_labels` reads server/event_config.json.
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const me = require('./make-events');
const { EVSTAGE_MAX_STAGES } = require('./make-raid');

const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8'));
const CONFIG = { ...REAL_CONFIG, onlyCensusIds: null, serve: null };

const storyRow = (id, worldId) => ({ stageId: 1000 + id, stageBinId: 0, id, name: `Story ${id}`, mapName: 'Room', useAp: 9, chapterId: 1, worldId, thumbId: 40000, onlyDrama: 0, stageKind: 1,
  showIcon: 0, hideIcon: 0, noPartner: 0, validStopStage: 0, validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 1, afterDramaId: [7], afterDramaType: [0], branchType: 0,
  disableContinue: 0, addLevel: 0, holdKeyblade: 0, hardmodeRequire: 0, hardmodeName: 'strDummy', hardmodeComparison: 1, hardmodeNum: 0, validClearGetTitle: 0, clearGetTitle: 0,
  validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 1, clearGetItemType: [2], clearGetItemId: [0], clearGetAssignSkillType: [1], clearGetAssignSkillId: [0],
  clearGetAssignSkillLv: [1], clearGetItemNum: [150], resetSubMission: 0, validSubmission: 1, submissionRequire: [10], submissionName: ['x'], submissionDataType: [1], submissionIdType: [0],
  submissionId: [0], submissionNum: [0], submissionRewardType: [14], submissionItemId: [0], submissionSkillType: [0], submissionSkillId: [0], submissionSkillLv: [0], submissionItemNum: [1],
  combinedSubmissionFlag: 0, raidBoss: 4000, bgmField: 10 + worldId, bgmBattle: 20 + worldId, bgmBoss: 30 + worldId });

function master() {
  return {
    stage: [storyRow(1, 1), storyRow(2, 2), storyRow(3, 2), { ...storyRow(0, 1), stageId: 970010, id: 970010, stageKind: 2 }, { ...storyRow(0, 3), stageId: 980001, id: 980001, stageKind: 2 }],
    evStage: [{ eventStageId: 7000 }, { eventStageId: 8000 }],
    enemy: [{ enemyId: 501, name: 'Foe A' }, { enemyId: 502, name: 'Foe B' }],
  };
}

const objective = (code, text, reward) => ({ code, text, dataType: 1, idType: 0, id: 0, num: 0, reward });
const quest = (stageId, worldId, enemies, extra = {}) => ({
  stageId, name: `Quest ${stageId}`, worldId, room: [{ code: 'R_0001', name: 'Room' }], level: 10, ap: 5, addLevel: 0, targets: [{ id: enemies[0], name: 'Foe' }],
  objectives: [objective(10, 'Complete without having to continue', { type: 2, id: 0, num: 1 }), objective(10, 'Complete without having to continue', { type: 15, id: 0, num: 50 }),
    objective(10, 'Complete without having to continue', { type: 3, id: 90011, num: 1 })],
  combined: 0, firstClear: [], drops: { enemies: [], chests: [] },
  enemies: enemies.map((id) => ({ id, level: 10, name: `Foe ${id}`, count: 2, rooms: ['R_0001'], reward: 1, target: id === enemies[0], label: 'original' })),
  restrictions: { disableContinue: 0, holdKeyblade: 0, noPartner: 0, hardmodeRequire: 0, hardmodeName: 'strDummy', hardmodeComparison: 1, hardmodeNum: 0 },
  drama: { before: 0, after: 0, beforeIds: [], afterIds: [] }, map: { key: stageId, stageBinId: 0, status: 'ok' }, window: ['2019-04-01 07:00:00', '2019-04-08 06:59:59'],
  label: 'original', ...extra });
const donorEv = (extra = {}) => ({ eventStageId: 900001, startTime: '2019-04-01 07:00:00', endTime: '2019-04-08 06:59:59', eventCategory: 3, eventType: 1, ...extra });
const record = (censusId, quests, extra = {}) => ({ censusId, name: `Event ${censusId}`, start: '2019-04-01', end: '2019-04-07', type: 'EQ', notices: [11], evStage: [donorEv()], quests, ...extra });

// the two-row fixture: E-1 with two quests (worlds 1 and 2), E-2 with one
function records() {
  return [record('E-1', [quest(700001, 1, [501]), quest(700002, 2, [501, 502], { label: 'original; donor kept; wiki is the 2018 run', restrictions:
    { disableContinue: 1, holdKeyblade: 0, noPartner: 1, hardmodeRequire: 10, hardmodeName: 'Only special attacks', hardmodeComparison: 3, hardmodeNum: 1 } })]),
  record('E-2', [quest(700010, 2, [502], { map: { key: 740260, stageBinId: 740260, status: 'ok' } })])];
}
const build = (recs = records(), ids, config = CONFIG, m = master(), anchors) => me.buildEvents(recs, config, m, ids, anchors);
// board sets (Part 3): the synthetic fixture of test-event-boards.js, its set fed by E-1; master items it needs (and medal 90011 of the quest objectives)
const BOARD_FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures', 'event_board_sets.json'), 'utf8'));
// Board 2 (7002) of the fixture made fully payable (its medal-not-found and Booster cells paid in Jewels): since 08-11 a board with
// any unpayable cell is not served (test-event-boards.js)
const payable = (s) => { for (const c of s.boards[1].cells.slice(1)) Object.assign(c, { rewardSelect: 2, rewardId: 0, num: 5, name: '5 Jewels' }); return s; };
const boardSets = () => ({ sets: BOARD_FIX.sets.map((s) => payable({ ...JSON.parse(JSON.stringify(s)), censusIds: ['E-1'] })) });
const BOARD_MASTER = () => ({ medal: [{ medalId: 900001, name: 'Fixture Medal', rare: 6, groupId: 0 }, { medalId: 900002, name: 'Fixture Medal B', rare: 5, groupId: 0 },
  { medalId: 90011, name: 'Quest Medal', rare: 6, groupId: 0 }], material: [{ materialId: 9001, name: 'Fixture Gem' }], title: [{ titleId: 9101, title: 'Fixture Title' }], avatarParts: [], petParts: [] });
const entry = (out, id) => out.index.entries.find((e) => e.censusId === id);

const tests = {
  ids_stable() {
    const a = build();
    const b = build(records(), a.ids, CONFIG, master(), a.anchors);
    assert.deepStrictEqual(b.ids, a.ids, 'same input, same ids');
    // the versioned ids file holds no donor stage id (offsets from the record's anchor, kept apart)
    assert.deepStrictEqual(Object.keys(a.ids.entries), ['E-1/+0', 'E-1/+1', 'E-2/+0']);
    assert.deepStrictEqual(a.anchors, { 'E-1': 700001, 'E-2': 700010, 'E-1#row': 900001, 'E-2#row': 900001 }, 'the row of the record id frozen too');
    assert.ok(!JSON.stringify(a.ids).includes('7000'), 'no donor id in event_ids.json');
    assert.strictEqual(a.ids.checks['E-1'].keys, 2);
    assert.deepStrictEqual(b.stage.map((s) => s.stageId), a.stage.map((s) => s.stageId));
    assert.deepStrictEqual(a.evStage.map((r) => r.eventStageId), [CONFIG.evStageBase + 1, CONFIG.evStageBase + 2]);
    assert.deepStrictEqual(a.stage.map((s) => s.stageId), [CONFIG.stageBase + 1, CONFIG.stageBase + 2, CONFIG.stageBase + 3]);
    // a new row takes the next number, a removed row keeps its number
    const recs = records();
    recs.splice(0, 1);
    recs.push(record('E-3', [quest(700020, 1, [501])]));
    const c = build(recs, a.ids, CONFIG, master(), a.anchors);
    assert.strictEqual(c.ids.rows['E-1'], a.ids.rows['E-1'], 'removed row keeps its number');
    assert.strictEqual(c.ids.rows['E-3'], 3);
    assert.strictEqual(entry(c, 'E-2').evStageId, CONFIG.evStageBase + 2);
    assert.strictEqual(entry(c, 'E-3').evStageId, CONFIG.evStageBase + 3);
    assert.deepStrictEqual(entry(c, 'E-3').stageIds, [CONFIG.stageBase + 4]);
    // a repeated number stops the run
    assert.throws(() => build(records(), { rows: { 'E-1': 1, 'E-2': 1 }, entries: {} }), /repeats/);
  },
  anchor_frozen() {
    // a quest added below the lowest donor id (strided ids, as the real records): every old key keeps its number
    const strided = () => [record('E-1', [quest(700010, 1, [501]), quest(700020, 1, [501]), quest(700030, 1, [501])])];
    const a = build(strided());
    const recs = strided();
    recs[0].quests.unshift(quest(700000, 1, [501]));
    const b = build(recs, a.ids, CONFIG, master(), a.anchors);
    for (const [k, v] of Object.entries(a.ids.entries)) assert.strictEqual(b.ids.entries[k], v, k);
    assert.strictEqual(b.ids.entries['E-1/-10'], 4);
    assert.deepStrictEqual(b.anchors, a.anchors, 'anchor never moves');
    assert.deepStrictEqual(entry(b, 'E-1').quests.map((q) => [q.donorStageId, q.stageId]),
      [[700000, CONFIG.stageBase + 4], [700010, CONFIG.stageBase + 1], [700020, CONFIG.stageBase + 2], [700030, CONFIG.stageBase + 3]]);
    // a quest gone from a numbered record (or a moved anchor) stops the run instead of renumbering
    const gone = strided();
    gone[0].quests.splice(1, 1);
    assert.throws(() => build(gone, a.ids, CONFIG, master(), a.anchors), /not given by the record/);
    assert.throws(() => build(strided(), a.ids, CONFIG, master(), { 'E-1': 700020 }), /not given by the record/);
  },
  anchor_lost_stops() {
    const a = build();
    assert.throws(() => build(records(), a.ids, CONFIG, master(), {}), /no anchor in event_anchors.json/);
    assert.throws(() => build(records(), a.ids, CONFIG, master(), { 'E-1': 700001 }), /E-2 has keys/);
    // patch keeps the sidecar apart from the ids file and reads it back
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-events-'));
    const md = path.join(dir, 'master');
    fs.mkdirSync(md);
    for (const [t, rows] of Object.entries(master())) fs.writeFileSync(path.join(md, `${t}.json`), JSON.stringify(rows));
    const opts = { records: records(), config: CONFIG, gameDataDir: path.join(dir, 'gd'), idsFile: path.join(dir, 'event_ids.json'), anchorsFile: path.join(dir, 'private', 'event_anchors.json') };
    fs.mkdirSync(path.join(dir, 'private'));
    me.patch(md, opts);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(opts.anchorsFile, 'utf8')), { 'E-1': 700001, 'E-2': 700010, 'E-1#row': 900001, 'E-2#row': 900001 });
    me.patch(md, opts);
    fs.rmSync(opts.anchorsFile);
    assert.throws(() => me.patch(md, opts), /no anchor/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  same_map_key_built_once() {
    const recs = records();
    recs[1].quests.push(quest(700011, 2, [502], { map: { key: 700001, stageBinId: 0, status: 'ok' } }));
    const out = build(recs);
    const q = entry(out, 'E-2').quests.find((x) => x.donorStageId === 700011);
    assert.strictEqual(q.served, false);
    assert.match(q.why, /map key 700001 is the map of event stage 4000001/);
    assert.strictEqual(new Set(out.stage.map((s) => s.stageBinId)).size, out.stage.length);
  },
  evstage_row_fits_schema() {
    const many = Array.from({ length: 7 }, (_, i) => quest(710000 + i, 1, [501]));
    const out = build([record('E-9', many, { evStage: [donorEv({ eventType: 3 })] })]);
    const [row] = out.evStage;
    assert.ok(row.stageId.length <= EVSTAGE_MAX_STAGES && row.validStageId === row.stageId.length);
    assert.strictEqual(row.stageStartId, CONFIG.stageBase + 1);
    assert.strictEqual(row.stageEndId, CONFIG.stageBase + 7);
    assert.strictEqual(row.eventCategory, 2);
    assert.strictEqual(row.eventType, 3, 'the donor eventType (never 2: raid mode, Raid Boards button)');
    assert.ok(row.bannerUrl.includes(`/${row.eventStageId}.png`) && !row.bannerUrl.includes('/raid/'));
    assert.strictEqual(entry(out, 'E-9').origEventType, 3, 'donor value kept for the bench');
    assert.strictEqual(entry(out, 'E-9').stageIds.length, 7);
    // stage rows: copy of a story row of the world, kind 2, own map key, restrictions and objectives of the record
    const s = build().stage;
    assert.ok(s.every((r) => r.stageKind === 2 && r.id === r.stageId && r.raidBoss === 0 && r.validBeforeDrama === 0 && r.validAfterDrama === 0 && r.validClearGetItem === 0));
    assert.deepStrictEqual(s.map((r) => [r.worldId, r.bgmField, r.stageBinId]), [[1, 11, 700001], [2, 12, 700002], [2, 12, 740260]]);
    assert.deepStrictEqual([s[1].disableContinue, s[1].noPartner, s[1].hardmodeRequire, s[1].hardmodeNum], [1, 1, 10, 1]);
    assert.deepStrictEqual(s[0].submissionRewardType, [2, 15, 3]);
    assert.deepStrictEqual(s[0].submissionItemId, [0, 0, 90011]);
    assert.strictEqual(s[0].validSubmission, 3);
    // event_maps.json: one per built stage, with its map key
    assert.deepStrictEqual(build().maps.map((m) => [m.stageId, m.key]), [[CONFIG.stageBase + 1, 700001], [CONFIG.stageBase + 2, 700002], [CONFIG.stageBase + 3, 740260]]);
  },
  no_raid_or_special_rows() {
    const out = build([...records(), record('E-R', [quest(980001, 3, [501])]), record('E-S', [quest(700030, 1, [501], { map: { key: 970010, stageBinId: 970010, status: 'ok' } })]),
      record('E-G', [quest(700040, 1, [100])])]);
    for (const id of ['E-R', 'E-S', 'E-G']) {
      const e = entry(out, id);
      assert.strictEqual(e.available, false, id);
      assert.match(e.why, /raid or Special/, id);
    }
    assert.strictEqual(out.evStage.length, 2);
    assert.ok(out.stage.every((s) => s.stageId >= CONFIG.stageBase));
  },
  enemies_exist() {
    const out = build();
    const ids = new Set(master().enemy.map((e) => e.enemyId));
    for (const m of out.maps) for (const e of m.enemies) assert.ok(ids.has(e.enemyId), `enemy ${e.enemyId} of stage ${m.stageId}`);
    assert.strictEqual(out.maps.length, out.stage.length);
  },
  missing_enemy_skips_quest() {
    const recs = records();
    recs[0].quests[1] = quest(700002, 2, [501, 777]);
    recs[0].quests.push(quest(700003, 1, [501], { objectives: [{ code: 4, text: 'Defeat %d Foe', dataType: 2, idType: 1, id: 888, num: 3, reward: { type: 2, id: 0, num: 1 } }] }));
    recs[1].quests[0] = quest(700010, 2, [999]);
    const out = build(recs);
    const e1 = entry(out, 'E-1');
    assert.strictEqual(e1.available, true);
    assert.strictEqual(e1.stageIds.length, 1);
    const q = e1.quests.find((x) => x.donorStageId === 700002);
    assert.strictEqual(q.served, false);
    assert.strictEqual(q.status, 'not served yet');
    assert.match(q.why, /777/);
    assert.match(e1.quests.find((x) => x.donorStageId === 700003).why, /888/, 'an objective enemy counts');
    const e2 = entry(out, 'E-2');
    assert.strictEqual(e2.available, false);
    assert.strictEqual(e2.quests.length, 1);
    assert.strictEqual(e2.quests[0].status, 'not served yet');
    assert.ok(!out.evStage.some((r) => r.eventStageId === e2.evStageId), 'no evStage row without a quest');
    // the ids of a quest not served are kept: it is built under the same number when its enemy lands
    const m = master();
    m.enemy.push({ enemyId: 777 }, { enemyId: 888 }, { enemyId: 999 });
    const later = build(recs, out.ids, CONFIG, m, out.anchors);
    assert.strictEqual(entry(later, 'E-1').quests.find((x) => x.donorStageId === 700002).stageId, q.stageId);
    assert.strictEqual(entry(later, 'E-2').available, true);
  },
  labels_declared() {
    const out = build();
    const e1 = entry(out, 'E-1');
    assert.ok(e1.labels.includes('donorKept'), JSON.stringify(e1.labels));
    assert.strictEqual(e1.label, 'reconstructed');
    for (const e of out.index.entries) for (const l of e.labels) assert.ok(typeof out.index.reasons[l] === 'string' && out.index.reasons[l].length > 10, `label ${l}`);
    // a label with no text stops the run
    const recs = records();
    recs[0].quests[0].label = 'original; something new';
    assert.throws(() => build(recs), /something new/);
    const bare = { ...CONFIG, reconstructedWhy: { ...CONFIG.reconstructedWhy } };
    // E-1 pays Event Coins without a board set: noBoardSet (Part 4 Task 4; eventCoins only with a set)
    delete bare.reconstructedWhy.noBoardSet;
    assert.throws(() => build(records(), undefined, bare), /noBoardSet/);
  },
  real_config_covers_labels() {
    for (const id of [...Object.values(REAL_CONFIG.labelPhrases), ...me.GENERATED_LABELS]) assert.ok(REAL_CONFIG.reconstructedWhy[id], `reconstructedWhy.${id}`);
    for (const phrase of ['donor kept; wiki is the 2018 run', 'wiki value applied, low confidence', 'map incomplete', 'no khuxwiki page']) assert.ok(REAL_CONFIG.labelPhrases[phrase], phrase);
    assert.strictEqual(REAL_CONFIG.evStageBase, 20000);
    assert.strictEqual(REAL_CONFIG.stageBase, 4000000);
  },
  short_window_whole_day() {
    // 45 minutes on 10 May 2020 (12:00 PDT), and one crossing UTC midnight that is still 10 May in Pacific time
    const short = record('E-T', [quest(700050, 1, [501], { window: ['2020-05-10 19:00:00', '2020-05-10 19:44:59'] }), quest(700051, 1, [501], { window: ['2020-05-11 02:00:00', '2020-05-11 02:59:59'] })],
      { start: '2020-05-10', end: '2020-05-10', evStage: [donorEv({ startTime: '2020-05-10 19:00:00', endTime: '2020-05-10 19:44:59' }), donorEv({ eventStageId: 900002, startTime: '2020-05-11 02:00:00', endTime: '2020-05-11 02:59:59' })] });
    const out = build([short, ...records()]);
    const e = entry(out, 'E-T');
    assert.deepStrictEqual(e.days, ['2020-05-10']);
    assert.ok(e.labels.includes('wholeDay'));
    assert.deepStrictEqual(e.quests.map((q) => q.days), [['2020-05-10'], ['2020-05-10']]);
    // a week-long category 3 row, and a daily row (07:00 to 06:59:59), are not short windows
    assert.strictEqual(entry(out, 'E-1').days, undefined);
    const daily = build([record('E-D', [quest(700060, 1, [501])], { evStage: [donorEv({ startTime: '2019-04-01 07:00:00', endTime: '2019-04-02 06:59:59' })] })]);
    assert.strictEqual(entry(daily, 'E-D').days, undefined);
  },
  // Event Catalog banner (Task 5): evStage catalogEvStage of the config, the Training Grounds quest of the Special Catalog, Details ->
  // /web/event/catalog, as the Raid Catalog banner; only when that stage row is in the master; never a record's id
  catalog_banner() {
    const m = master();
    m.stage.push({ ...storyRow(0, 1), stageId: 970000, id: 970000, stageKind: 2, useAp: 0 });
    const out = build(records(), undefined, CONFIG, m);
    assert.strictEqual(CONFIG.catalogEvStage, 20000);
    const row = out.catalogEvStage;
    assert.deepStrictEqual([row.eventStageId, row.eventCategory, row.eventType, row.stageId, row.detailUrl], [20000, 2, 0, [970000], '/web/event/catalog']);
    assert.ok(row.bannerUrl.endsWith(`/web/event/img/v${CONFIG.imgVersion}/20000.png`), row.bannerUrl);
    assert.deepStrictEqual(out.index.catalog, { evStageId: 20000, stageIds: [970000], useAp: [0] });
    assert.ok(!out.evStage.some((r) => r.eventStageId === 20000), 'apart from the event rows');
    assert.ok(Object.values(out.ids.rows).every((r) => CONFIG.evStageBase + r !== 20000), 'no record numbered on it');
    const none = build();
    assert.strictEqual(none.catalogEvStage, null, 'no Training Grounds row: no banner');
    assert.strictEqual(none.index.catalog, undefined);
    // event rows: Details -> their notice page when the record has a notice
    assert.ok(out.evStage.every((r) => r.detailUrl === `/web/event/notice/${r.eventStageId}`));
  },
  only_census_ids_filter() {
    const out = build(records(), undefined, { ...CONFIG, onlyCensusIds: ['E-2'] });
    assert.deepStrictEqual(out.index.entries.map((e) => e.censusId), ['E-2']);
    assert.ok('E-1' in out.ids.rows, 'every row numbered whatever the filter says');
  },
  patch_drops_own_rows() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-events-'));
    const md = path.join(dir, 'master'), gd = path.join(dir, 'game_data');
    fs.mkdirSync(md);
    const m = master();
    for (const [t, rows] of Object.entries(m)) fs.writeFileSync(path.join(md, `${t}.json`), JSON.stringify(rows));
    const opts = { records: records(), config: CONFIG, gameDataDir: gd, idsFile: path.join(dir, 'event_ids.json') };
    me.patch(md, opts);
    me.patch(md, opts);
    const stage = JSON.parse(fs.readFileSync(path.join(md, 'stage.json'), 'utf8'));
    assert.strictEqual(stage.length, m.stage.length + 3, 'second run replaces its own rows');
    const ev = JSON.parse(fs.readFileSync(path.join(md, 'evStage.json'), 'utf8'));
    assert.strictEqual(ev.length, m.evStage.length + 2);
    const idx = JSON.parse(fs.readFileSync(path.join(gd, 'events.json'), 'utf8'));
    assert.deepStrictEqual(idx.own.evStage, [CONFIG.evStageBase + 1, CONFIG.evStageBase + 2]);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(gd, 'event_maps.json'), 'utf8')).length, 3);
    // with the Training Grounds row: the catalogue banner is written, kept among our own rows and replaced by the next run
    const m2 = master();
    m2.stage.push({ ...storyRow(0, 1), stageId: 970000, id: 970000, stageKind: 2, useAp: 0 });
    fs.writeFileSync(path.join(md, 'stage.json'), JSON.stringify([...stage.filter((r) => r.stageId < CONFIG.stageBase), m2.stage[m2.stage.length - 1]]));
    me.patch(md, opts);
    me.patch(md, opts);
    const ev2 = JSON.parse(fs.readFileSync(path.join(md, 'evStage.json'), 'utf8'));
    assert.deepStrictEqual(ev2.map((r) => r.eventStageId).filter((x) => x >= CONFIG.evStageBase), [20000, CONFIG.evStageBase + 1, CONFIG.evStageBase + 2]);
    const idx2 = JSON.parse(fs.readFileSync(path.join(gd, 'events.json'), 'utf8'));
    assert.deepStrictEqual(idx2.catalog, { evStageId: 20000, stageIds: [970000], useAp: [0] });
    fs.writeFileSync(path.join(md, 'evStage.json'), JSON.stringify(ev));
    // a row in our range that is not ours stops the run
    fs.writeFileSync(path.join(md, 'evStage.json'), JSON.stringify([...ev, { eventStageId: CONFIG.evStageBase + 50 }]));
    assert.throws(() => me.patch(md, opts), /not ours/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  // Task 6 fix 1: the map import report decides; status missing/skipped or a key not imported -> not served, why «map not usable»
  map_not_usable_not_served() {
    const poi = { enemies: [{ uid: 2, enemyId: 501, reward: 1, map: 0 }], chests: [] };
    const maps = { status: new Map([[700001, { status: 'imported' }], [700002, { status: 'missing', why: 'STG absent' }], [740260, { status: 'skipped', why: 'rooms not served: X' }]]),
      poi: { 700001: poi } };
    const m = { ...master(), reward: [{ rewardId: 1 }] };
    const out = me.buildEvents(records(), CONFIG, m, undefined, undefined, maps);
    const qs = out.index.entries.flatMap((e) => e.quests);
    assert.deepStrictEqual(qs.map((q) => q.served), [true, false, false]);
    assert.strictEqual(qs[1].why, 'map not usable: missing, STG absent');
    assert.strictEqual(qs[2].why, 'map not usable: skipped, rooms not served: X');
    assert.deepStrictEqual(out.stage.map((s) => s.stageBinId), [700001]);
    assert.deepStrictEqual(Object.keys(out.poi), ['700001']);
    assert.deepStrictEqual(out.maps.map((x) => [x.key, x.served]), [[700001, true], [700002, false], [740260, false]], 'every candidate listed for the import');
    assert.ok(!entry(out, 'E-2').available, 'no served quest: no evStage row');
    const none = me.buildEvents(records(), CONFIG, m, undefined, undefined, { status: new Map(), poi: {} });
    assert.ok(none.index.entries.flatMap((e) => e.quests).every((q) => !q.served && /^map not usable: not imported/.test(q.why)));
  },
  reward_rows_from_drops() {
    const recs = records();
    const q = recs[0].quests[0];
    q.drops = { enemies: [{ enemy: 501, rewardId: 62201, rows: [{ type: 3, id: 90011, num: 1, odds: 1000 }, { type: 3, id: 90031, num: 1, odds: 250 }] }, { enemy: 502, rewardId: 1, rows: [] }],
      chests: [{ reward: 162800, rows: [{ type: 8, id: 0, num: 30000, odds: 100000 }] }] };
    recs[0].quests[1].drops = { enemies: [], chests: [] };
    const maps = { status: new Map([[700001, { status: 'imported' }], [700002, { status: 'imported' }], [740260, { status: 'imported' }]]),
      poi: { 700001: { enemies: [{ uid: 2, enemyId: 501, reward: 62201, map: 0 }, { uid: 3, enemyId: 502, reward: 1, map: 0 }], chests: [{ uid: 4, reward: 162800, kind: 1, map: 0 }] },
        700002: { enemies: [{ uid: 2, enemyId: 501, reward: 77777, map: 0 }], chests: [] }, 740260: { enemies: [{ uid: 2, enemyId: 502, reward: 1, map: 0 }], chests: [] } } };
    const out = me.buildEvents(recs, CONFIG, { ...master(), reward: [{ rewardId: 1 }] }, undefined, undefined, maps);
    const qs = out.index.entries.flatMap((e) => e.quests);
    assert.deepStrictEqual(qs.map((x) => x.served), [true, false, true]);
    assert.strictEqual(qs[1].why, 'reward rows missing: 77777', 'a reward row neither in the master nor in the drops: not served');
    assert.deepStrictEqual(out.reward.map((r) => r.rewardId), [62201, 162800], 'master row 1 reused, original rows written');
    const r = out.reward[0];
    assert.deepStrictEqual([r.validReward, r.type, r.id, r.num, r.odds], [2, [3, 3], [90011, 90031], [1, 1], [1000, 250]], 'original contents and odds');
    assert.deepStrictEqual(out.reward[1].odds, [100000]);
    // the same reward id with other rows in a later quest: that quest is not served
    const recs2 = records();
    recs2[0].quests[0].drops = { enemies: [{ rewardId: 62201, rows: [{ type: 3, id: 90011, num: 1, odds: 1000 }] }], chests: [] };
    recs2[0].quests[1].drops = { enemies: [], chests: [] };
    recs2[1].quests[0].drops = { enemies: [{ rewardId: 62201, rows: [{ type: 3, id: 90011, num: 1, odds: 9 }] }], chests: [] };
    const maps2 = { status: maps.status, poi: { 700001: { enemies: [{ uid: 2, reward: 62201 }], chests: [] }, 700002: { enemies: [{ uid: 2, reward: 1 }], chests: [] },
      740260: { enemies: [{ uid: 2, reward: 62201 }], chests: [] } } };
    const out2 = me.buildEvents(recs2, CONFIG, { ...master(), reward: [{ rewardId: 1 }] }, undefined, undefined, maps2);
    assert.deepStrictEqual(out2.index.entries.flatMap((e) => e.quests).map((x) => x.served), [true, true, false]);
  },
  enemy_swap_ww() {
    const config = { ...CONFIG, mapEnemySwaps: { 700002: [{ from: 502, to: 503 }] } };
    const m = { ...master(), enemy: [...master().enemy, { enemyId: 503, name: 'Foe WW' }] };
    const recs = records();
    recs[0].quests[1].drops = { enemies: [{ enemy: 502, rewardId: 1, rows: [] }], chests: [] };
    const out = me.buildEvents(recs, config, m);
    const mp = out.maps.find((x) => x.key === 700002);
    assert.deepStrictEqual(mp.enemies.map((e) => [e.enemyId, e.name]), [[501, 'Foe 501'], [503, 'Foe WW']]);
    assert.deepStrictEqual(mp.drops.enemies.map((d) => d.enemy), [503]);
    const q = entry(out, 'E-1').quests[1];
    assert.ok(q.served && q.labels.includes('wwEnemy'), JSON.stringify(q));
    assert.ok(!entry(out, 'E-1').quests[0].labels.includes('wwEnemy'));
    assert.ok(out.index.reasons.wwEnemy, 'label text');
    assert.strictEqual(recs[0].quests[1].enemies[1].id, 502, 'the record is not changed');
    // the WW enemy not in the master: not served, no substitute
    const out2 = me.buildEvents(records(), config, master());
    assert.ok(!entry(out2, 'E-1').quests[1].served && /503/.test(entry(out2, 'E-1').quests[1].why));
    // the real config: both swaps of the user ruling
    assert.deepStrictEqual(REAL_CONFIG.mapEnemySwaps['734970'].map((w) => [w.from, w.to]), [[126, 99]]);
    assert.deepStrictEqual(REAL_CONFIG.mapEnemySwaps['725440'].map((w) => [w.from, w.to]), [[32, 23]]);
  },
  patch_poi_and_rewards() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-events-'));
    const md = path.join(dir, 'master'), gd = path.join(dir, 'game_data');
    fs.mkdirSync(md); fs.mkdirSync(gd);
    const m = { ...master(), reward: [{ rewardId: 1 }] };
    for (const [t, rows] of Object.entries(m)) fs.writeFileSync(path.join(md, `${t}.json`), JSON.stringify(rows));
    fs.writeFileSync(path.join(gd, 'stage_poi.json'), JSON.stringify({ 1010: { chests: [], enemies: [] } }));
    const recs = records();
    recs[0].quests[0].drops = { enemies: [{ rewardId: 62201, rows: [{ type: 3, id: 90011, num: 1, odds: 1000 }] }], chests: [] };
    const maps = { status: new Map([[700001, { status: 'imported' }], [700002, { status: 'imported' }]]),
      poi: { 700001: { enemies: [{ uid: 2, enemyId: 501, reward: 62201, map: 0 }], chests: [] }, 700002: { enemies: [{ uid: 2, enemyId: 501, reward: 1, map: 0 }], chests: [] } } };
    const opts = { records: recs, config: CONFIG, gameDataDir: gd, idsFile: path.join(dir, 'event_ids.json'), maps };
    me.patch(md, opts);
    me.patch(md, opts);
    const poi = JSON.parse(fs.readFileSync(path.join(gd, 'stage_poi.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(poi), ['1010', '700001', '700002'], 'POI merged, other keys kept');
    const reward = JSON.parse(fs.readFileSync(path.join(md, 'reward.json'), 'utf8'));
    assert.deepStrictEqual(reward.map((r) => r.rewardId), [1, 62201], 'second run replaces its own reward rows');
    const idx = JSON.parse(fs.readFileSync(path.join(gd, 'events.json'), 'utf8'));
    assert.deepStrictEqual([idx.own.reward, idx.own.poi], [[62201], ['700001', '700002']]);
    // a run that serves less: its old POI keys go away
    me.patch(md, { ...opts, maps: { status: new Map([[700001, { status: 'imported' }]]), poi: { 700001: maps.poi['700001'] } } });
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(gd, 'stage_poi.json'), 'utf8'))), ['1010', '700001']);
    // a POI key of another stage stops the run
    fs.writeFileSync(path.join(gd, 'stage_poi.json'), JSON.stringify({ 1010: {}, 700001: { chests: [], enemies: [] } }));
    const idx3 = JSON.parse(fs.readFileSync(path.join(gd, 'events.json'), 'utf8'));
    fs.writeFileSync(path.join(gd, 'events.json'), JSON.stringify({ ...idx3, own: { ...idx3.own, poi: [] } }));
    assert.throws(() => me.patch(md, opts), /not ours/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  // ---- Events Part 2 (gem quests), Task 3 ----
  records_folder() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-events-'));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify([record('E-2', [quest(700010, 2, [502])])]));
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify([record('E-1', [quest(700001, 1, [501])])]));
    fs.writeFileSync(path.join(dir, 'event_anchors.json'), JSON.stringify({ 'E-1': 700001, 'E-2': 700010 }));
    assert.deepStrictEqual(me.readRecords(dir).map((r) => r.censusId), ['E-1', 'E-2'], 'sorted by file name, anchors apart');
    assert.deepStrictEqual(me.readRecords(path.join(dir, 'b.json')).map((r) => r.censusId), ['E-2'], 'a file as in Part 1');
    assert.strictEqual(me.anchorsPathOf(dir), path.join(dir, 'event_anchors.json'));
    assert.strictEqual(me.anchorsPathOf(path.join(dir, 'b.json')), path.join(dir, 'event_anchors.json'));
    fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify([record('E-1', [])]));
    assert.throws(() => me.readRecords(dir), /E-1.*twice/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  serve_selection() {
    const recs = [...records(), record('G-1', [quest(700100, 1, [501])], { type: 'GEM' }), record('Q-1', [quest(700200, 1, [501])], { type: 'EQ' })];
    const serve = { censusIds: ['E-1', 'E-2'], types: ['GEM'] };
    const out = build(recs, undefined, { ...CONFIG, serve });
    assert.deepStrictEqual(out.index.entries.map((e) => e.censusId), ['E-1', 'E-2', 'G-1'], 'ids and type both build');
    assert.deepStrictEqual(out.skipped, [{ censusId: 'Q-1', reason: 'notSelected' }]);
    assert.ok('Q-1' in out.ids.rows, 'every record is numbered');
    // the old key alone still filters
    const old = build(recs, undefined, { ...CONFIG, onlyCensusIds: ['E-2'] });
    assert.deepStrictEqual(old.index.entries.map((e) => e.censusId), ['E-2']);
    // the real config: 13 pilot ids, the GEM type (Part 2), the COIN type (Part 3) and the challenge types EQ, KEY, QUIZ (Part 4)
    assert.strictEqual(REAL_CONFIG.serve.censusIds.length, 13);
    assert.deepStrictEqual(REAL_CONFIG.serve.types, ['GEM', 'COIN', 'EQ', 'KEY', 'QUIZ']);
    assert.ok(!('onlyCensusIds' in REAL_CONFIG));
  },
  shared_notice_built_once() {
    const recs = [record('S-1', [quest(700300, 1, [501]), quest(700301, 1, [502])], { type: 'GEM' }), record('S-2', [], { type: 'GEM', sharedWith: 'S-1' })];
    const out = build(recs);
    const a = entry(out, 'S-1'), b = entry(out, 'S-2');
    assert.strictEqual(a.stageIds.length, 2);
    assert.deepStrictEqual(b.stageIds, a.stageIds);
    assert.strictEqual(b.sharedWith, 'S-1');
    assert.strictEqual(b.reason, 'shared');
    assert.strictEqual(b.why, REAL_CONFIG.reasonText.shared);
    assert.strictEqual(out.evStage.length, 1, 'one evStage row for the shared stages');
    assert.strictEqual(out.stage.length, 2);
    // the other way round (the sharing row first) gives the same
    const rev = build([recs[1], recs[0]]);
    assert.deepStrictEqual(entry(rev, 'S-2').stageIds, entry(rev, 'S-1').stageIds);
    assert.strictEqual(rev.evStage.length, 1);
    // a sharing record with quests of its own: still no second set
    const both = build([recs[0], record('S-3', [quest(700310, 1, [501])], { type: 'GEM', sharedWith: 'S-1' })]);
    assert.strictEqual(both.stage.length, 2);
  },
  no_quest_rows_reasoned() {
    for (const why of ['board', 'coin']) {
      const out = build([record('N-1', [], { type: 'GEM', noQuests: why })]);
      const e = entry(out, 'N-1');
      assert.strictEqual(e.reason, why);
      assert.strictEqual(e.why, REAL_CONFIG.reasonText[why]);
      assert.ok(e.why.length > 10 && e.noQuests === why && !e.available);
      assert.strictEqual(out.evStage.length, 0);
      assert.strictEqual(out.stage.length, 0);
    }
  },
  undated_not_listed() {
    const rec = record('U-1', [quest(700400, 1, [501])], { type: 'GEM' });
    delete rec.start; delete rec.end;
    const out = build([rec]);
    const e = entry(out, 'U-1');
    assert.strictEqual(e.reason, 'undated');
    assert.strictEqual(e.why, REAL_CONFIG.reasonText.undated);
    assert.strictEqual(out.evStage.length, 0);
    assert.strictEqual(out.stage.length, 0);
    assert.ok(!e.available);
    for (const k of ['shared', 'board', 'coin', 'undated', 'wikiEmpty', 'rewardItemMissing']) assert.ok(REAL_CONFIG.reasonText[k] && REAL_CONFIG.reasonText[k].length > 10, k);
  },
  reward_items_exist() {
    const m = { ...master(), medal: [{ medalId: 99011, imageId: 99011, name: 'Fictional', rare: 6 }], material: [{ materialId: 48, name: 'Power Gem' }] };
    const gem = { type: 5, id: 48, num: 1, name: 'Power Gem' };
    const plain = [objective(10, 'Complete without having to continue', { type: 2, id: 0, num: 1 })];
    const withObj = (rewards) => rewards.map((r) => objective(10, 'Complete without having to continue', r));
    const good = quest(700500, 1, [501], { objectives: withObj([gem, { type: 3, id: 99011, num: 1, name: 'Fictional 6★' }]) });
    const bad = quest(700501, 1, [501], { objectives: plain, firstClear: [{ type: 3, id: 90346, num: 1, name: 'SP Fictional 6★' }] });
    const badGem = quest(700502, 1, [501], { objectives: withObj([{ type: 5, id: 999, num: 1, name: 'Nothing Gem' }]) });
    const okFirst = quest(700503, 1, [501], { objectives: plain, firstClear: [{ type: 3, id: 99011, num: 1, name: 'Fictional 6★' }, gem] });
    const out = build([record('R-1', [good, bad, badGem, okFirst], { type: 'GEM' })], undefined, CONFIG, m);
    const qs = entry(out, 'R-1').quests;
    assert.deepStrictEqual(qs.map((q) => q.served), [true, false, false, true]);
    assert.strictEqual(qs[1].reason, 'rewardItemMissing');
    assert.strictEqual(qs[2].reason, 'rewardItemMissing');
    assert.match(qs[1].why, /90346/);
    assert.deepStrictEqual(out.stage.flatMap((s) => s.clearGetItemId), [99011, 48]);
  },
  medal_id_remapped() {
    const row = (medalId, imageId, name, rare) => ({ medalId, imageId, name, rare });
    const m = { ...master(), material: [], medal: [row(300001, 300001, 'Foo', 7), row(300002, 300002, 'Foo', 6), row(400001, 400001, 'Tie', 7), row(400002, 400001, 'Tie', 7),
      row(500001, 500001, 'Dup', 7), row(500002, 500002, 'Dup', 7), row(600001, 600001, 'Bar', 5), row(600002, 600002, 'Baz', 6)] };
    const first = (id, name) => ({ firstClear: [{ type: 3, id, num: 5, name }], objectives: [objective(10, 'Complete without having to continue', { type: 2, id: 0, num: 1 })] });
    const recs = [record('M-1', [quest(700600, 1, [501], first(95001, 'Foo 7★')), quest(700601, 1, [501], first(95002, 'Tie 7★')), quest(700602, 1, [501], first(95003, 'Dup 7★')),
      quest(700603, 1, [501], first(95004, 'Nope 7★')),
      // the donor id is in our master but names another medal: by name -> ours; no such name -> rewardItemMissing; same name and rarity -> kept
      quest(700604, 1, [501], first(600001, 'Foo 7★')), quest(700605, 1, [501], first(600001, 'Nope 5★')), quest(700606, 1, [501], first(600001, 'Bar 5★')),
      quest(700607, 1, [501], first(600002, 'Baz 5★'))], { type: 'GEM' })];
    const out = build(recs, undefined, CONFIG, m);
    const qs = entry(out, 'M-1').quests;
    assert.deepStrictEqual(qs.map((q) => q.served), [true, true, false, false, true, false, true, false]);
    assert.deepStrictEqual(out.stage.flatMap((s) => s.clearGetItemId), [300001, 400001, 300001, 600001], 'our id; a tie goes to medalId == imageId');
    assert.strictEqual(qs[2].reason, 'rewardItemMissing');
    assert.strictEqual(qs[5].reason, 'rewardItemMissing');
    assert.strictEqual(qs[7].reason, 'rewardItemMissing', 'same name, other rarity: not the same medal');
    assert.strictEqual(recs[0].quests[0].firstClear[0].id, 95001, 'the record is not changed');
  },
  pilot_ids_unchanged() {
    const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_ids.json'), 'utf8'));
    // a record per numbered census row, its quests from the stored keys (offsets from a fixed anchor)
    const ANCH = 5000000, byRec = {};
    for (const k of Object.keys(ids.entries)) { const [c, off] = k.split('/'); (byRec[c] = byRec[c] || []).push(off); }
    // no donor rows: the stage ids are checked here (rows: rows_ids_stable)
    const recs = Object.keys(ids.rows).map((c) => record(c, (byRec[c] || []).map((off) => quest(ANCH + Number(off), 1, [501])), { type: 'EQ', evStage: [] }));
    const anchors = Object.fromEntries(Object.keys(ids.rows).map((c) => [c, ANCH]));
    const maxRow = Math.max(...Object.values(ids.rows)), maxEntry = Math.max(...Object.values(ids.entries));
    recs.push(record('G-NEW', [quest(ANCH + 1, 1, [501]), quest(ANCH + 2, 1, [501])], { type: 'GEM' }));
    const out = build(recs, ids, { ...CONFIG, serve: { censusIds: Object.keys(ids.rows), types: ['GEM'] } }, master(), { ...anchors, 'G-NEW': ANCH + 1 });
    for (const [k, v] of Object.entries(ids.rows)) assert.strictEqual(out.ids.rows[k], v, k);
    for (const [k, v] of Object.entries(ids.entries)) assert.strictEqual(out.ids.entries[k], v, k);
    assert.ok(out.ids.rows['G-NEW'] > maxRow);
    assert.ok(Object.entries(out.ids.entries).filter(([k]) => !(k in ids.entries)).every(([, v]) => v > maxEntry));
    assert.strictEqual(Object.keys(out.ids.entries).filter((k) => k.startsWith('G-NEW/')).length, 2);
  },
  difficulty_quests_apart() {
    // three AP variants of one quest on ONE donor map: three stage rows, one map file and one POI, each with its own AP and level
    const same = { map: { key: 760001, stageBinId: 0, status: 'ok' } };
    const qs = [5, 20, 40].map((ap, i) => quest(700700 + i, 1, [501], { ap, level: 10 + i * 100, addLevel: i * 100, name: 'No Continues: Weekly Gem', ...same }));
    const out = build([record('D-1', qs, { type: 'GEM' })]);
    assert.deepStrictEqual(out.stage.map((s) => s.useAp), [5, 20, 40]);
    assert.deepStrictEqual(out.stage.map((s) => s.addLevel), [0, 100, 200]);
    assert.strictEqual(new Set(out.stage.map((s) => s.stageId)).size, 3);
    assert.deepStrictEqual(out.stage.map((s) => s.stageBinId), [760001, 760001, 760001]);
    assert.strictEqual(out.maps.length, 1, 'the map is listed once');
    assert.ok(entry(out, 'D-1').quests.every((q) => q.served));
    // with the map report: one POI key for the three
    const maps = { status: new Map([[760001, { status: 'imported' }]]), poi: { 760001: { enemies: [{ uid: 2, enemyId: 501, reward: 1, map: 0 }], chests: [] } } };
    const o2 = me.buildEvents([record('D-1', qs, { type: 'GEM' })], CONFIG, { ...master(), reward: [{ rewardId: 1 }] }, undefined, undefined, maps);
    assert.deepStrictEqual(o2.stage.map((s) => s.useAp), [5, 20, 40]);
    assert.deepStrictEqual(Object.keys(o2.poi), ['760001']);
    assert.ok(o2.maps[0].served);
    // another record on the same map, or other drops: not served
    const other = build([record('D-1', qs, { type: 'GEM' }), record('D-2', [quest(700710, 1, [501], same)], { type: 'GEM' })]);
    assert.match(entry(other, 'D-2').quests[0].why, /760001 is the map of event stage/);
    const diffDrops = [quest(700720, 1, [501], same), quest(700721, 1, [501], { ...same, drops: { enemies: [{ enemy: 501, rewardId: 5, rows: [{ type: 3, id: 90011, num: 1, odds: 1 }] }], chests: [] } })];
    assert.deepStrictEqual(entry(build([record('D-3', diffDrops, { type: 'GEM' })]), 'D-3').quests.map((q) => q.served), [true, false]);
  },
  wiki_enemy_null_ids_only_for_wiki() {
    // a donor quest with a null target keeps the old reason; a wikiQuest ignores null ids
    const bad = quest(700900, 1, [501], { targets: [{ id: null, name: 'X' }] });
    const out = build([record('X-1', [bad], { type: 'GEM' })]);
    assert.match(entry(out, 'X-1').quests[0].why, /^enemies not in the master/);
    const wq = quest(700901, 1, [501], { label: 'wikiQuest', targets: [{ id: null, name: 'X' }] });
    assert.ok(entry(build([record('X-2', [wq], { type: 'GEM' })]), 'X-2').quests[0].served);
  },
  quest_reason_codes() {
    // every not-served quest has its own reason code, with a reasonText in event_config.json
    for (const k of ['enemyMissing', 'mapUnusable', 'mapKeyUsed', 'rewardRowsMissing', 'raidSpecial']) assert.ok(REAL_CONFIG.reasonText[k] && REAL_CONFIG.reasonText[k].length > 10, k);
    const bad = quest(701000, 1, [501], { targets: [{ id: null, name: 'X' }] });
    const q = entry(build([record('R-1', [bad], { type: 'GEM' })]), 'R-1').quests[0];
    assert.strictEqual(q.reason, 'enemyMissing');
    assert.match(q.why, /^enemies not in the master/);
    const maps = { status: new Map([[701011, { status: 'skipped', why: 'rooms not served' }]]), poi: {} };
    const m1 = quest(701010, 1, [501], { map: { key: 701011, status: 'ok' } });
    const o2 = me.buildEvents([record('R-2', [m1], { type: 'GEM' })], CONFIG, master(), undefined, undefined, maps);
    assert.strictEqual(entry(o2, 'R-2').quests[0].reason, 'mapUnusable');
    // the same donor stage with other values in another record (the same quest is shared since Part 4: map_key_shared_quest)
    const o3 = build([record('R-3', [quest(701020, 1, [501])], { type: 'GEM' }), record('R-4', [quest(701020, 1, [501], { level: 11 })], { type: 'GEM' })]);
    assert.strictEqual(entry(o3, 'R-4').quests[0].reason, 'mapKeyUsed');
  },
  // the rooms of the imported map must be of the quest's world (event_config.json roomWorlds; neutralRooms such as the Corridor of
  // Darkness DG fit any world; worldExceptions: records checked by hand), else worldMismatch (Task 5 Step 2 checks)
  // the rooms of the imported map must be of the quest's world (event_config.json roomWorlds; neutralRooms {prefix: home world}:
  // DG fits world 1, or any world when another room of the quest's world is on the map; worldExceptions by map key: maps checked
  // by hand), else worldMismatch (Task 5 Step 2 checks, fix round 1)
  world_of_rooms() {
    const st = (rooms) => ({ status: 'imported', rooms });
    const maps = { status: new Map([[701201, st(['ED_0008_01_00'])], [701202, st(['DG_0100_02_00', 'DB_0004_00_00'])], [701203, st(['ED_0008_01_00'])],
      [701204, st(['DG_0200_27_00'])], [701205, st(['DG_0200_27_00'])], [701206, st(['BC_0005_00_00', 'DG_0100_02_00'])], [701207, st(['ZZ_0001_00_00'])]]), poi: {} };
    const qq = (id, world) => quest(id, world, [501], { map: { key: id, status: 'ok' } });
    const qs = [qq(701201, 1), qq(701202, 1), qq(701204, 1), qq(701205, 6), qq(701206, 6), qq(701207, 1)];
    const cfg = { ...CONFIG, worldExceptions: { 701203: 'checked by hand' } };
    const out = me.buildEvents([record('W-7', qs, { type: 'GEM' }), record('W-8', [qq(701203, 1)], { type: 'GEM' })], cfg, master(), undefined, undefined, maps);
    const q = entry(out, 'W-7').quests;
    assert.deepStrictEqual(q.map((x) => x.reason || 'served'), ['worldMismatch', 'served', 'served', 'worldMismatch', 'served', 'worldMismatch'], JSON.stringify(q.map((x) => x.why)));
    assert.match(q[0].why, /ED_0008_01_00/);
    assert.match(q[3].why, /DG_0200_27_00/, 'DG alone fits world 1 only');
    assert.match(q[5].why, /ZZ_0001_00_00/, 'a prefix missing from roomWorlds is another world');
    assert.ok(entry(out, 'W-8').quests[0].served, 'a map listed in worldExceptions is served');
    assert.ok(REAL_CONFIG.reasonText.worldMismatch && REAL_CONFIG.roomWorlds.DB === 1 && REAL_CONFIG.neutralRooms.DG === 1);
    assert.deepStrictEqual(Object.keys(REAL_CONFIG.worldExceptions).sort(), ['360010', '360030'], 'EV-0282 and EV-0293 (ruling 07-11)');
    // the catalogue says it in plain words
    assert.match(require('./event-pages').whyPlain(q[0].why), /another world/);
  },
  // a quest whose row is a guess (no evStageId, outside every stage range): flagged rowGuess
  row_guess_flagged() {
    const rec = record('G-1', [quest(700401, 1, [501], { evStageId: 900041 }), quest(700402, 1, [501])], { type: 'GEM',
      evStage: [donorEv({ eventStageId: 900041, stageRange: { validStageId: 1, stageId: [700401] } }), donorEv({ eventStageId: 900042, stageRange: { validStageId: 1, stageId: [700499] } })] });
    const q = entry(build([rec]), 'G-1').quests;
    assert.deepStrictEqual(q.map((x) => !!x.rowGuess), [false, true]);
  },
  // a single donor row freezes the row of the record id: a row prepended later does not take it (review Important 3)
  single_row_frozen() {
    const one = () => record('F-1', [quest(700501, 1, [501], { evStageId: 900051 })], { type: 'GEM', evStage: [donorEv({ eventStageId: 900051 })] });
    const a = build([one()]);
    assert.strictEqual(a.anchors['F-1#row'], 900051);
    const two = one();
    two.evStage.unshift(donorEv({ eventStageId: 900050 }));
    two.quests.unshift(quest(700500, 1, [501], { evStageId: 900050 }));
    const b = build([two], a.ids, CONFIG, master(), a.anchors);
    const rows = entry(b, 'F-1').rows;
    assert.deepStrictEqual(rows.map((r) => [r.donorEvStageId, r.evStageId === CONFIG.evStageBase + a.ids.rows['F-1']]), [[900050, false], [900051, true]]);
  },
  // khuxwiki AP over the surviving stage row (record conflict kind ap, resolution khuxwiki): label wikiAp (review Minor 5)
  wiki_ap_labelled() {
    const q = quest(700601, 1, [501], { ap: 25, conflicts: [{ kind: 'ap', detail: 'wiki 25 / donor 5', resolution: 'khuxwiki', reason: '' }] });
    const out = build([record('A-1', [q, quest(700602, 1, [501], { conflicts: [{ kind: 'ap', detail: 'wiki 25 / donor 5', resolution: 'donor kept', reason: '' }] })], { type: 'GEM' })]);
    const e = entry(out, 'A-1');
    assert.deepStrictEqual(e.quests.map((x) => x.labels.includes('wikiAp')), [true, false]);
    assert.ok(e.labels.includes('wikiAp') && /khuxwiki/.test(out.index.reasons.wikiAp));
  },
  shared_target_checked() {
    assert.throws(() => build([record('S-9', [], { type: 'GEM', sharedWith: 'S-0' })]), /S-0.*not in the records/);
    const warn = console.warn; const seen = [];
    console.warn = (m) => seen.push(m);
    try { build([record('S-9', [], { type: 'GEM', sharedWith: 'Q-0' }), record('Q-0', [quest(700950, 1, [501])], { type: 'EQ' })], undefined, { ...CONFIG, serve: { censusIds: ['S-9'], types: [] } }); } finally { console.warn = warn; }
    assert.ok(seen.some((m) => /Q-0.*not selected/.test(m)), JSON.stringify(seen));
  },
  wiki_quest_labelled() {
    const wq = quest(700800, 1, [501], { label: 'wikiQuest' });
    const out = build([record('W-1', [wq], { type: 'GEM' })]);
    const e = entry(out, 'W-1');
    assert.ok(e.available && e.labels.includes('wikiQuest'), JSON.stringify(e.labels));
    assert.match(out.index.reasons.wikiQuest, /rebuilt from the khuxwiki page/);
    assert.strictEqual(REAL_CONFIG.reconstructedWhy.wikiQuest, 'Quest rebuilt from the khuxwiki page: no master row of the original is known');
    // a wiki-only quest with no map key and no enemy id cannot be built: wikiEmpty
    const empty = quest(1, 1, [501], { label: 'wikiQuest', map: { status: 'absent', source: null }, enemies: [{ id: null, name: 'X', label: 'wikiEnemy' }], targets: [{ id: null, name: 'X' }] });
    delete empty.stageId;
    const o2 = build([record('W-2', [empty], { type: 'GEM' })]);
    assert.strictEqual(entry(o2, 'W-2').quests[0].reason, 'wikiEmpty');
    assert.strictEqual(entry(o2, 'W-2').reason, 'wikiEmpty');
    assert.strictEqual(o2.stage.length, 0);
  },
  null_id_target_reason() {
    // a target without an id on a map the donor file could not give: the map is the cause, not an enemy
    const inc = quest(701100, 1, [501], { enemies: [], targets: [{ id: null, name: 'High Wizard' }], map: { key: 701100, status: 'incomplete: STG header absent' } });
    const q = entry(build([record('N-1', [inc], { type: 'GEM' })]), 'N-1').quests[0];
    assert.strictEqual(q.reason, 'mapUnusable');
    assert.match(q.why, /incomplete: STG header absent/);
    // a usable map: enemyMissing, and the list is never empty
    const ok = quest(701101, 1, [501], { enemies: [], targets: [{ id: null, name: 'High Wizard' }] });
    const q2 = entry(build([record('N-2', [ok], { type: 'GEM' })]), 'N-2').quests[0];
    assert.strictEqual(q2.reason, 'enemyMissing');
    assert.match(q2.why, /High Wizard \(no id\)/);
  },
  // Part 2 Task 5 (user decision 07-11): the original event list showed one banner per original evStage row, so a record gets one
  // evStage row per donor row with its own card (bannerKey), dates and quests (quest -> row: its evStageId, else the row's stage range)
  rows_one_per_donor_row() {
    const recs = [record('R-1', [quest(700101, 1, [501], { evStageId: 900011 }), quest(700102, 1, [501], { evStageId: 900011 }),
      quest(700103, 2, [502], { evStageId: 900012, window: ['2019-04-01 07:00:00', '2019-04-03 06:59:59'] }), quest(700104, 1, [777])],
    { type: 'GEM', evStage: [
      donorEv({ eventStageId: 900011, eventType: 1, eventCategory: 2, bannerKey: 'kA', detailNoticeId: 11, stageRange: { validStageWidthId: 1, stageStartId: 700101, stageEndId: 700102 } }),
      donorEv({ eventStageId: 900012, eventType: 3, eventCategory: 3, parentEventStageId: 900011, bannerKey: 'kB', startTime: '2019-04-01 07:00:00', endTime: '2019-04-03 06:59:59' }),
      donorEv({ eventStageId: 900013, eventType: 2, eventCategory: 2, bannerKey: 'kC', stageRange: { validStageId: 1, stageId: [700104] } })] })];
    const out = build(recs);
    const e = entry(out, 'R-1');
    const legacy = CONFIG.evStageBase + out.ids.rows['R-1'];
    assert.strictEqual(e.evStageId, legacy, 'the catalogue entry keeps its id');
    assert.deepStrictEqual(e.rows.map((r) => [r.donorEvStageId, r.bannerKey, r.available]), [[900011, 'kA', true], [900012, 'kB', true], [900013, 'kC', false]]);
    assert.strictEqual(e.rows[0].evStageId, legacy, 'the first donor row holds the record id');
    assert.ok(e.rows[1].evStageId > legacy && e.rows[2].evStageId > legacy, 'new rows: new ids');
    assert.deepStrictEqual(out.evStage.map((r) => r.eventStageId), [e.rows[0].evStageId, e.rows[1].evStageId], 'one evStage row per built donor row; the unserved one not built');
    const [r1, r2] = out.evStage;
    assert.deepStrictEqual([r1.stageId, r2.stageId], [[e.quests[0].stageId, e.quests[1].stageId], [e.quests[2].stageId]], 'each row its own quests');
    assert.deepStrictEqual([r1.eventType, r2.eventType], [3, 3], 'donor 1 without a set served as 3 (board mode only with a board set)');
    assert.deepStrictEqual(e.rows.map((r) => r.origEventType), [1, 3, 2], 'the donor eventType of each row stays in origEventType');
    assert.ok(r2.bannerUrl.endsWith(`/${e.rows[1].evStageId}.png`) && r2.detailUrl === `/web/event/notice/${e.rows[1].evStageId}`, 'own card and Details');
    assert.deepStrictEqual([r1.parentEventStageId, r2.parentEventStageId], [0, 0], 'parentEventStageId 0 on our rows (the donor value stays in the index)');
    assert.strictEqual(e.rows[1].parentEventStageId, 900011);
    assert.deepStrictEqual([e.rows[0].start, e.rows[0].end, e.rows[1].start, e.rows[1].end], ['2019-04-01', '2019-04-07', '2019-04-01', '2019-04-02'], 'own dates (Pacific)');
    assert.deepStrictEqual(e.quests.map((q) => q.evStageId), [e.rows[0].evStageId, e.rows[0].evStageId, e.rows[1].evStageId, e.rows[2].evStageId], 'quest -> row, by evStageId or stage range');
    assert.deepStrictEqual(e.rows.map((r) => r.stageIds.length), [2, 1, 0]);
    assert.deepStrictEqual(e.stageIds, [...r1.stageId, ...r2.stageId]);
    assert.strictEqual(e.rows[2].eventType, 3, 'a raid-mode donor row (2) never gives eventType 2');
    assert.ok(!JSON.stringify(out.ids).includes('9000'), 'no donor id in event_ids.json');
    assert.deepStrictEqual(Object.keys(out.ids.subRows), ['R-1/r+1', 'R-1/r+2']);
    assert.strictEqual(out.anchors['R-1#row'], 900011);
    // a record without donor rows (wiki-only, weekly 2017-18): today's single row
    const w = build([record('R-2', [quest(700120, 1, [501])], { type: 'GEM', evStage: [] })]);
    assert.deepStrictEqual(w.evStage.map((r) => r.eventStageId), [entry(w, 'R-2').evStageId]);
    assert.deepStrictEqual(entry(w, 'R-2').rows.map((r) => [r.evStageId, r.bannerKey]), [[entry(w, 'R-2').evStageId, null]]);
  },
  rows_ids_stable() {
    // the record id stays on its first donor row (frozen in the sidecar), served or not; the sidecar may name the matching row instead
    const mk = () => [record('R-3', [quest(700201, 1, [777], { evStageId: 900021 }), quest(700202, 1, [501], { evStageId: 900022 })],
      { type: 'GEM', evStage: [donorEv({ eventStageId: 900021 }), donorEv({ eventStageId: 900022 })] })];
    const a = build(mk());
    const legacy = CONFIG.evStageBase + a.ids.rows['R-3'];
    assert.strictEqual(a.anchors['R-3#row'], 900021);
    assert.deepStrictEqual(entry(a, 'R-3').rows.map((r) => [r.evStageId, r.available]), [[legacy, false], [CONFIG.evStageBase + a.ids.subRows['R-3/r+1'], true]]);
    assert.deepStrictEqual(a.evStage.map((r) => r.eventStageId), [CONFIG.evStageBase + a.ids.subRows['R-3/r+1']], 'only the served row is built');
    // later the enemy lands: the first row is built under the record id, nothing renumbered, quest stage ids unchanged
    const m = master();
    m.enemy.push({ enemyId: 777 });
    const b = build(mk(), a.ids, CONFIG, m, a.anchors);
    assert.deepStrictEqual(b.ids, a.ids, 'nothing renumbered');
    assert.deepStrictEqual(b.evStage.map((r) => r.eventStageId), [legacy, CONFIG.evStageBase + a.ids.subRows['R-3/r+1']]);
    assert.deepStrictEqual(b.stage.map((s) => s.stageId).sort(), [entry(a, 'R-3').quests[0].stageId, entry(a, 'R-3').quests[1].stageId].sort(), 'quest stage ids unchanged');
    // the sidecar names the matching row: the record id goes there, the first row gets a key of its own
    const c = build(mk(), undefined, CONFIG, master(), { 'R-3#row': 900022 });
    assert.deepStrictEqual(entry(c, 'R-3').rows.map((r) => r.evStageId), [CONFIG.evStageBase + c.ids.subRows['R-3/r-1'], CONFIG.evStageBase + c.ids.rows['R-3']]);
    assert.deepStrictEqual(c.evStage.map((r) => r.eventStageId), [CONFIG.evStageBase + c.ids.rows['R-3']]);
    // a stored donor row gone from the record stops the run; so does a sidecar row the record no longer has
    const gone = mk();
    gone[0].evStage = gone[0].evStage.slice(0, 1);
    gone[0].quests[1].evStageId = 900021;
    assert.throws(() => build(gone, a.ids, CONFIG, master(), a.anchors), /R-3\/r\+1/);
    assert.throws(() => build(mk(), undefined, CONFIG, master(), { 'R-3#row': 900029 }), /not in the record any more/);
    // stored row keys but no #row anchor (sidecar lost): stop, never re-derive the row of the record id
    const lost = { ...a.anchors };
    delete lost['R-3#row'];
    assert.throws(() => build(mk(), a.ids, CONFIG, master(), lost), /R-3#row/);
    // numbers repeated between rows and subRows stop the run
    assert.throws(() => build(mk(), { ...a.ids, subRows: { 'R-3/r+1': a.ids.rows['R-3'] } }, CONFIG, master(), a.anchors), /repeats/);
  },
  rows_window_capped() {
    // a permanent category 1 row (until 2037) ends with the record; a row that starts before the record widens the entry
    const rec = record('R-4', [quest(700301, 1, [501], { evStageId: 900031 }), quest(700302, 1, [501], { evStageId: 900032 })], { type: 'GEM', start: '2019-04-03', end: '2019-04-07',
      evStage: [donorEv({ eventStageId: 900031, eventCategory: 1, startTime: '2019-04-01 07:00:00', endTime: '2037-12-31 11:59:59' }),
        donorEv({ eventStageId: 900032, startTime: '2019-04-01 07:00:00', endTime: '2019-04-02 06:59:59' })] });
    const e = entry(build([rec]), 'R-4');
    assert.deepStrictEqual(e.rows.map((r) => [r.start, r.end]), [['2019-04-01', '2019-04-07'], ['2019-04-01', '2019-04-01']]);
    assert.deepStrictEqual([e.start, e.end], ['2019-04-01', '2019-04-07']);
  },
  // Part 3 Task 4: an entry whose census id belongs to a board set with a served board, and that has served quests, is served as
  // eventType 1 (Event Boards button); any other entry as 3. boardSets carries only the sets handed out.
  board_entry_type1() {
    const m = { ...master(), ...BOARD_MASTER() };
    const sets = boardSets();
    sets.sets.push({ setKey: '2099-02', censusIds: ['E-3'], boards: [JSON.parse(JSON.stringify(sets.sets[0].boards[2]))] });
    sets.sets.push({ setKey: '2099-03', censusIds: ['E-4'], boards: [JSON.parse(JSON.stringify(sets.sets[0].boards[0]))] });
    const recs = [...records(), record('E-3', [quest(700030, 1, [501])]), record('E-4', [quest(700040, 1, [777])])];
    const out = me.buildEvents(recs, CONFIG, m, undefined, undefined, null, sets);
    const e1 = entry(out, 'E-1'), e2 = entry(out, 'E-2'), e3 = entry(out, 'E-3'), e4 = entry(out, 'E-4');
    assert.strictEqual(e1.boardSet, '2099-01');
    assert.strictEqual(e1.eventType, 1, 'a board set with a served board: Event Boards button');
    assert.ok(e1.rows.every((r) => r.eventType === 1));
    assert.ok(out.evStage.filter((r) => e1.rows.some((x) => x.evStageId === r.eventStageId)).every((r) => r.eventType === 1), 'the evStage rows too');
    assert.strictEqual(e2.boardSet, null);
    assert.strictEqual(e2.eventType, 3, 'donor 1 without a set served as 3');
    // a set whose every board is skipped (completion with no item): not handed out, its entry is a plain list, labelled
    assert.strictEqual(e3.boardSet, null);
    assert.strictEqual(e3.eventType, 3);
    assert.strictEqual(e3.boardSetKey, '2099-02');
    assert.ok(e3.labels.includes('boardsLater'), JSON.stringify(e3.labels));
    // a set with a board but no served feeder quest: not handed out either
    assert.strictEqual(e4.available, false);
    assert.strictEqual(e4.boardSet, null);
    assert.ok(e4.labels.includes('noCoinSource'), JSON.stringify(e4.labels));
    assert.deepStrictEqual(Object.keys(out.index.boardSets), ['2099-01']);
    assert.deepStrictEqual(out.index.boardSets['2099-01'], { boardIds: [4000001, 4000002], chains: { 4000002: 4000001 }, censusIds: ['E-1'] });
    assert.deepStrictEqual(out.sphere.map((r) => r.sphereBoardId), [4000001, 4000002], 'only the rows of the sets handed out');
    assert.ok(out.sphere.every((r) => r.type === 4));
    assert.strictEqual(out.sphereMasu.length, 2);
    assert.strictEqual(out.sphereArray.length, 2);
    assert.ok(Object.keys(out.ids.boards).length >= 5, 'every board numbered, served or not (append-only)');
    for (const l of ['boardsLater', 'noCoinSource']) assert.ok(out.index.reasons[l], l);
    // without board sets: no board, every entry as before
    const plain = build();
    assert.ok(plain.index.entries.every((e) => e.boardSet === null && e.eventType === 3));
    assert.deepStrictEqual(plain.index.boardSets, {});
  },
  // Part 3 final fix: a feeder keeps its donor eventType (3: no Event Boards button); only a donor-1 entry gets 1
  feeder_keeps_donor_type() {
    const m = { ...master(), ...BOARD_MASTER() };
    const sets = boardSets();
    sets.sets[0].censusIds = ['E-1', 'E-5'];
    const recs = [...records(), record('E-5', [quest(700050, 1, [501])], { evStage: [donorEv({ eventStageId: 900005, eventType: 3 })] })];
    const out = me.buildEvents(recs, CONFIG, m, undefined, undefined, null, sets);
    const e1 = entry(out, 'E-1'), e5 = entry(out, 'E-5');
    assert.strictEqual(e1.eventType, 1);
    assert.strictEqual(e5.boardSetKey, '2099-01', 'the coins of the feeder accrue to the set');
    assert.strictEqual(e5.boardSet, '2099-01');
    assert.strictEqual(e5.eventType, 3, 'a donor-3 feeder keeps 3');
    assert.ok(e5.rows.every((r) => r.eventType === 3));
    assert.ok(out.evStage.filter((r) => e5.rows.some((x) => x.evStageId === r.eventStageId)).every((r) => r.eventType === 3), 'the evStage rows too');
    assert.deepStrictEqual(Object.keys(out.index.boardSets), ['2099-01']);
  },
  feeder_alone_does_not_hand_out_set() {
    const m = { ...master(), ...BOARD_MASTER() };
    const sets = boardSets();
    sets.sets[0].censusIds = ['E-5'];
    const recs = [record('E-5', [quest(700050, 1, [501])], { evStage: [donorEv({ eventStageId: 900005, eventType: 3 })] })];
    const out = me.buildEvents(recs, CONFIG, m, undefined, undefined, null, sets);
    const e5 = entry(out, 'E-5');
    assert.strictEqual(e5.boardSetKey, '2099-01');
    assert.strictEqual(e5.boardSet, null, 'a feeder alone does not hand out the set');
    assert.strictEqual(e5.eventType, 3);
    assert.ok(e5.rows.every((r) => r.eventType === 3));
    assert.ok(out.evStage.every((r) => r.eventType === 3));
    assert.deepStrictEqual(out.index.boardSets, {});
    assert.strictEqual(out.sphere.length, 0);
    assert.ok(e5.labels.includes('noCoinSource'), JSON.stringify(e5.labels));
  },
  boards_in_patch() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-events-'));
    const md = path.join(dir, 'master'), gd = path.join(dir, 'game_data');
    fs.mkdirSync(md);
    const m = { ...master(), ...BOARD_MASTER(), sphere: [{ sphereBoardId: 3000001, type: 5 }], sphereArray: [{ arryId: 3000001 }], sphereMasu: [{ masuId: 3000001 }] };
    for (const [t, rows] of Object.entries(m)) fs.writeFileSync(path.join(md, `${t}.json`), JSON.stringify(rows));
    const opts = { records: records(), config: CONFIG, gameDataDir: gd, idsFile: path.join(dir, 'event_ids.json'), boardSets: boardSets() };
    const snap = () => ['sphere', 'sphereArray', 'sphereMasu', 'stage', 'evStage'].map((t) => fs.readFileSync(path.join(md, `${t}.json`), 'utf8'))
      .concat([fs.readFileSync(path.join(gd, 'events.json'), 'utf8'), fs.readFileSync(opts.idsFile, 'utf8')]);
    me.patch(md, opts);
    const first = snap();
    const idx = JSON.parse(fs.readFileSync(path.join(gd, 'events.json'), 'utf8'));
    assert.deepStrictEqual(idx.own.sphere, [4000001, 4000002]);
    assert.deepStrictEqual(idx.own.sphereArray, [4000001, 4000002]);
    assert.deepStrictEqual(idx.own.sphereMasu, [4000001, 4000002]);
    assert.deepStrictEqual(Object.keys(idx.boardSets), ['2099-01']);
    assert.strictEqual(idx.entries.find((e) => e.censusId === 'E-1').boardSet, '2099-01');
    const sphere = JSON.parse(first[0]);
    assert.deepStrictEqual(sphere.map((r) => r.sphereBoardId), [3000001, 4000001, 4000002], 'appended after the raid boards');
    assert.ok(JSON.parse(fs.readFileSync(opts.idsFile, 'utf8')).boards['2099-01/7001'], 'board ids in event_ids.json');
    me.patch(md, opts);
    assert.deepStrictEqual(snap(), first, 'the second regen is identical');
    // a row in our board range that is not ours stops the run
    fs.writeFileSync(path.join(md, 'sphere.json'), JSON.stringify([...sphere, { sphereBoardId: 4000077, type: 4 }]));
    assert.throws(() => me.patch(md, opts), /not ours/);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  no_source_writes_nothing() {
    const old = process.env.KHUX_EVENT_SRC;
    delete process.env.KHUX_EVENT_SRC;
    try { assert.strictEqual(me.patch(path.join(os.tmpdir(), 'khux-none')), null); } finally { if (old !== undefined) process.env.KHUX_EVENT_SRC = old; }
  },

  // ---- Events Part 4 Task 4 ----
  // a Surprise event ran 3 times on one Pacific day (20 minutes each, the same 5 stages): one evStage row for that day, its
  // stages once, one card; a run on the next day is a row of its own with the same stages
  short_rows_one_per_day() {
    const ids = [700101, 700102, 700103, 700104, 700105];
    const range = { validStageId: 1, stageId: ids, validStageWidthId: 0, stageStartId: 0, stageEndId: 0 };
    const run = (n, from, to) => donorEv({ eventStageId: 900100 + n, startTime: from, endTime: to, eventType: 3, stageRange: range });
    const qs = ids.map((id) => quest(id, 1, [501], { evStageId: 900101, window: ['2020-02-02 18:00:00', '2020-02-02 18:19:59'] }));
    const rec = record('E-S', qs, { start: '2020-02-02', end: '2020-02-02', evStage: [run(1, '2020-02-02 18:00:00', '2020-02-02 18:19:59'),
      run(2, '2020-02-02 21:00:00', '2020-02-02 21:19:59'), run(3, '2020-02-03 02:00:00', '2020-02-03 02:19:59')] });
    const out = build([rec]);
    const e = entry(out, 'E-S');
    assert.strictEqual(out.evStage.length, 1, 'one evStage row for the day');
    assert.strictEqual(e.rows.length, 1, 'one card, no duplicate');
    assert.deepStrictEqual(e.rows[0].days, ['2020-02-02']);
    assert.strictEqual(e.rows[0].stageIds.length, 5);
    assert.strictEqual(new Set(e.rows[0].stageIds).size, 5, 'its stages once');
    assert.strictEqual(out.evStage[0].stageId.length, 5);
    assert.strictEqual(out.stage.length, 5);
    // a fourth run on the next Pacific day: its own row, same stages
    const two = record('E-S', ids.map((id) => quest(id, 1, [501], { evStageId: 900101 })), { start: '2020-02-02', end: '2020-02-03',
      evStage: [...rec.evStage, run(4, '2020-02-03 18:00:00', '2020-02-03 18:19:59')] });
    const o2 = build([two]);
    const e2 = entry(o2, 'E-S');
    assert.deepStrictEqual(e2.rows.map((r) => r.days), [['2020-02-02'], ['2020-02-03']]);
    assert.deepStrictEqual(e2.rows[1].stageIds, e2.rows[0].stageIds);
    assert.strictEqual(o2.evStage.length, 2);
    assert.strictEqual(o2.stage.length, 5, 'stage rows once');
  },
  // a Surprise event (Part 4 Task 7): the donor master keeps ONE row of the whole day (08:00 UTC to 07:59:59 UTC, which starts at
  // 01:00 Pacific in summer), and every WW notice gave that whole Pacific day (12:00 a.m. to 11:59 p.m. PT); the record's
  // `shortWindow` makes it a one-day event: open on the day its row starts only, oneDay (original: no wholeDay label). Without
  // the mark the same row is a daily event (no days).
  short_window_record_whole_day() {
    const range = { validStageId: 1, stageId: [700201], validStageWidthId: 0, stageStartId: 0, stageEndId: 0 };
    const mk = (extra) => record('E-SW', [quest(700201, 1, [501], { evStageId: 900201, window: ['2020-05-06 08:00:00', '2020-05-07 07:59:59'] })], {
      start: '2020-05-06', end: '2020-05-07', evStage: [donorEv({ eventStageId: 900201, startTime: '2020-05-06 08:00:00', endTime: '2020-05-07 07:59:59', eventType: 3, stageRange: range })], ...extra });
    const e = entry(build([mk({ shortWindow: 'open for one whole Pacific day (notice); donor row of the whole day' })]), 'E-SW');
    assert.deepStrictEqual(e.days, ['2020-05-06'], 'the day its row starts, not the next one');
    assert.strictEqual(e.oneDay, true, 'a one-day event');
    assert.ok(!e.labels.includes('wholeDay'), 'its whole day is the original window: no wholeDay label');
    assert.strictEqual(e.rows.length, 1);
    assert.deepStrictEqual(e.rows[0].days, ['2020-05-06']);
    assert.deepStrictEqual(e.quests[0].days, undefined, 'a 24 h quest window adds no days of its own');
    const plain = entry(build([mk({})]), 'E-SW');
    assert.strictEqual(plain.days, undefined, 'unmarked: a daily event');
    assert.strictEqual(plain.oneDay, undefined);
    assert.ok(!plain.labels.includes('wholeDay'));
    assert.strictEqual(plain.rows[0].days, undefined);
  },
  // a Booster objective reward (Part 6 grants it): the quest is served, the objective pays nothing here (type 0 in the stage
  // row, never 34), the index names the Booster for player.pendingBoosters; label boosterLater
  booster_reward_pending_once() {
    const booster = objective(32, 'Deal 3 or less hits', { type: 34, id: 1809001, num: 1, booster: { name: 'P Booster +25%', emblemId: 1809001 } });
    const q = quest(700600, 1, [501]);
    q.objectives[0] = booster;
    const out = build([record('E-B', [q])]);
    const item = entry(out, 'E-B').quests[0];
    assert.ok(item.served, JSON.stringify(item));
    assert.ok(item.labels.includes('boosterLater') && entry(out, 'E-B').labels.includes('boosterLater'));
    assert.deepStrictEqual(item.boosters, [{ objective: 1, emblemName: 'P Booster +25%' }]);
    const [s] = out.stage;
    assert.deepStrictEqual(s.submissionRewardType, [0, 15, 3]);
    assert.deepStrictEqual(s.submissionItemId, [0, 0, 90011]);
    assert.deepStrictEqual(s.submissionItemNum, [0, 50, 1]);
    assert.ok(out.index.reasons.boosterLater && /Booster/.test(out.index.reasons.boosterLater));
  },
  booster_only_held() {
    const b = (n) => objective(10, 'Complete without having to continue', { type: 34, id: 1809000 + n, num: 1, booster: { name: `M Booster +${n}%` } });
    const q = quest(700610, 1, [501], { objectives: [b(1), b(2), b(3)] });
    const out = build([record('E-BO', [q])]);
    const item = entry(out, 'E-BO').quests[0];
    assert.strictEqual(item.served, false);
    assert.strictEqual(item.reason, 'boosterOnly');
    assert.strictEqual(item.why, REAL_CONFIG.reasonText.boosterOnly);
    assert.strictEqual(out.stage.length, 0);
    assert.strictEqual(out.evStage.length, 0);
  },
  // a reward type the server cannot pay: the quest is not served and the type never reaches a row of the client
  unknown_reward_type_held() {
    const q = quest(700620, 1, [501]);
    q.objectives[1] = objective(10, 'Complete without having to continue', { type: 99, id: 5, num: 1 });
    const fc = quest(700621, 1, [501], { firstClear: [{ type: 99, id: 7, num: 1 }] });
    const ok = quest(700622, 1, [501]);
    const out = build([record('E-U', [q, fc, ok])]);
    const qs = entry(out, 'E-U').quests;
    assert.deepStrictEqual(qs.map((x) => x.reason || null), ['rewardTypeUnknown', 'rewardTypeUnknown', null]);
    assert.match(qs[0].why, /99/);
    assert.ok(!out.stage.some((s) => [...s.submissionRewardType, ...s.clearGetItemType].includes(99)), 'type 99 in no stage row');
    assert.ok(!out.reward.some((r) => r.type.includes(99)), 'type 99 in no reward row');
    assert.strictEqual(out.stage.length, 1);
  },
  // a quiz quest needs the drama with its question (event_config.json quizDramas {quest key: [drama ids]}, written by the quiz
  // boards task): without it quizTextMissing; with it the stage row shows that drama before the quest
  quiz_needs_drama() {
    const qz = (id) => quest(id, 1, [501], { drama: { before: 1, after: 0, beforeIds: [1900501], afterIds: [] } });
    const rec = () => record('E-Q', [qz(700700), qz(700701)], { type: 'QUIZ' });
    const out = build([rec()]);
    assert.deepStrictEqual(entry(out, 'E-Q').quests.map((x) => x.reason), ['quizTextMissing', 'quizTextMissing']);
    assert.strictEqual(entry(out, 'E-Q').quests[0].why, REAL_CONFIG.reasonText.quizTextMissing);
    assert.strictEqual(out.stage.length, 0);
    // the list names the first quest only: that one is served with the drama, the other still waits
    const cfg = { ...CONFIG, quizDramas: { 'E-Q/+0': { ids: [1990001], reconstructed: true } } };
    const o2 = me.buildEvents([rec()], cfg, master(), undefined, {}, null, null, { dramas: [1990001] });
    const qs = entry(o2, 'E-Q').quests;
    assert.deepStrictEqual(qs.map((x) => x.reason || null), [null, 'quizTextMissing']);
    assert.strictEqual(o2.stage.length, 1);
    assert.deepStrictEqual([o2.stage[0].validBeforeDrama, o2.stage[0].beforeDramaId, o2.stage[0].beforeDramaType], [1, [1990001], [0]]);
    assert.ok(qs[0].labels.includes('quizBoard') && o2.index.reasons.quizBoard, 'a reconstructed board is labelled');
    // a quest outside a quiz record with a before drama is served as before (scenes off)
    const plain = build([record('E-P', [qz(700702)])]);
    assert.ok(entry(plain, 'E-P').quests[0].served && entry(plain, 'E-P').labels.includes('dramaOff'));
  },
  // the same quest in two records (a rerun: same donor stage, same values): built once, the second record serves that stage
  // (sharedWith); another quest on the same map key keeps mapKeyUsed
  map_key_shared_quest() {
    const k = { map: { key: 745000, stageBinId: 745000, status: 'ok' } };
    const a = record('E-A', [quest(700800, 1, [501], k)]);
    const b = record('E-B2', [quest(700800, 1, [501], { ...k, window: ['2020-08-10 07:00:00', '2020-08-22 06:59:59'] })], { start: '2020-08-10', end: '2020-08-21' });
    const c = record('E-C', [quest(700801, 1, [501], k)], { start: '2020-09-01', end: '2020-09-07' });
    const d = record('E-D2', [quest(700800, 1, [501], { ...k, level: 99 })], { start: '2020-10-01', end: '2020-10-07' });
    const out = build([a, b, c, d]);
    assert.strictEqual(out.stage.length, 1, 'one stage row');
    const qa = entry(out, 'E-A').quests[0], qb = entry(out, 'E-B2').quests[0];
    assert.ok(qb.served, JSON.stringify(qb));
    assert.strictEqual(qb.sharedWith, 'E-A');
    assert.strictEqual(qb.stageId, qa.stageId);
    assert.deepStrictEqual(entry(out, 'E-B2').stageIds, [qa.stageId]);
    assert.ok(entry(out, 'E-B2').available && out.evStage.length === 2, 'the rerun has its own card');
    assert.strictEqual(entry(out, 'E-C').quests[0].reason, 'mapKeyUsed');
    assert.strictEqual(entry(out, 'E-D2').quests[0].reason, 'mapKeyUsed', 'same donor stage, other values');
  },
  // a quest served before keeps its stage row when an older run of the same quest is added later, before it in the files
  // (2018 challenge records read before the 2019 pilot): the newly numbered record shares it, whatever the file order
  served_quest_keeps_its_row() {
    const k = { map: { key: 745100, stageBinId: 745100, status: 'ok' } };
    const pilot = record('E-P9', [quest(700850, 1, [501], k)], { start: '2019-04-01' });
    const first = build([pilot]);
    const old = record('E-O8', [quest(700850, 1, [501], k)], { start: '2018-08-01', end: '2018-08-07' });
    const out = build([old, pilot], first.ids, CONFIG, master(), first.anchors);
    assert.strictEqual(entry(out, 'E-P9').quests[0].stageId, entry(first, 'E-P9').quests[0].stageId, 'the served stage id stays');
    assert.ok(!entry(out, 'E-P9').quests[0].sharedWith);
    assert.strictEqual(entry(out, 'E-O8').quests[0].sharedWith, 'E-P9');
    assert.deepStrictEqual(out.index.entries.map((e) => e.censusId), ['E-O8', 'E-P9'], 'index in record order');
    assert.strictEqual(out.stage.length, 1);
  },
  // fix round 1 (I2): the same quest paying Event Coins in two records of different board sets is not shared (its coins would
  // go to one set only): the later one waits, mapKeyUsed
  shared_quest_coins_same_set_only() {
    const k = { map: { key: 745200, stageBinId: 745200, status: 'ok' } };
    const a = record('E-SA', [quest(700860, 1, [501], k)], { boardSetKey: '2099-01' });
    const b = record('E-SB', [quest(700860, 1, [501], k)], { boardSetKey: '2099-02', start: '2019-05-01', end: '2019-05-07' });
    const c = record('E-SC', [quest(700860, 1, [501], k)], { boardSetKey: '2099-01', start: '2019-06-01', end: '2019-06-07' });
    const out = build([a, b, c]);
    assert.strictEqual(entry(out, 'E-SB').quests[0].reason, 'mapKeyUsed');
    assert.strictEqual(entry(out, 'E-SC').quests[0].sharedWith, 'E-SA', 'same set: shared');
    // without Event Coins the sets do not matter
    const noCoin = (r) => { r.quests[0].objectives[1] = objective(10, 'Complete without having to continue', { type: 2, id: 0, num: 5 }); return r; };
    const o2 = build([noCoin(record('E-SA', [quest(700860, 1, [501], k)], { boardSetKey: '2099-01' })), noCoin(record('E-SB', [quest(700860, 1, [501], k)], { boardSetKey: '2099-02', start: '2019-05-01' }))]);
    assert.strictEqual(entry(o2, 'E-SB').quests[0].sharedWith, 'E-SA');
  },
  // fix round 1 (M1): two Booster first-clear items stay two (each with its position)
  booster_positions_kept() {
    const q = quest(700870, 1, [501], { firstClear: [{ type: 34, id: 1, num: 1, booster: { name: 'P Booster +10%' } }, { type: 34, id: 2, num: 1, booster: { name: 'P Booster +10%' } }] });
    const item = entry(build([record('E-BP', [q])]), 'E-BP').quests[0];
    assert.ok(item.served);
    assert.deepStrictEqual(item.boosters, [{ objective: 0, slot: 0, emblemName: 'P Booster +10%' }, { objective: 0, slot: 1, emblemName: 'P Booster +10%' }]);
  },
  // fix round 1 (M2): a drama id of quizDramas that is not among the available dramas stops the run
  quiz_drama_must_exist() {
    const qz = quest(700710, 1, [501], { drama: { before: 1, after: 0, beforeIds: [1900501], afterIds: [] } });
    const cfg = { ...CONFIG, quizDramas: { 'E-QD/+0': { ids: [1990001], reconstructed: true } } };
    const recs = () => [record('E-QD', [JSON.parse(JSON.stringify(qz))], { type: 'QUIZ' })];
    assert.throws(() => me.buildEvents(recs(), cfg, master(), undefined, {}, null, null, { dramas: [1990002] }), /1990001/);
    assert.throws(() => me.buildEvents(recs(), cfg, master(), undefined, {}, null, null, {}), /available dramas/);
    const ok = me.buildEvents(recs(), cfg, master(), undefined, {}, null, null, { dramas: [1990001] });
    assert.ok(entry(ok, 'E-QD').quests[0].served);
  },
  // Part 4 Task 6: the label of a quiz board follows its source (quizDramas label): a board redrawn from footage or taken from a
  // screenshot of the original has its own label; reconstructed true without a label is quizBoard; an original-only entry has none.
  // A label that is not a quiz board label stops the run
  quiz_board_label_by_source() {
    const qz = (id) => quest(id, 1, [501], { drama: { before: 1, after: 0, beforeIds: [1900501], afterIds: [] } });
    const recs = () => [record('E-QL', [qz(700720), qz(700721), qz(700722), qz(700723)], { type: 'QUIZ' })];
    const cfg = { ...CONFIG, quizDramas: { 'E-QL/+0': { ids: [1990011], reconstructed: true }, 'E-QL/+1': { ids: [1990012], reconstructed: true, label: 'quizBoardFootage' },
      'E-QL/+2': { ids: [1990013, 1990014], reconstructed: true, label: 'quizBoardScreenshot' }, 'E-QL/+3': [1990015] } };
    const out = me.buildEvents(recs(), cfg, master(), undefined, {}, null, null, { dramas: [1990011, 1990012, 1990013, 1990014, 1990015] });
    const qs = entry(out, 'E-QL').quests;
    assert.ok(qs.every((x) => x.served), JSON.stringify(qs.map((x) => x.why)));
    const quizLabels = (x) => x.labels.filter((l) => l.startsWith('quizBoard'));
    assert.deepStrictEqual(qs.map(quizLabels), [['quizBoard'], ['quizBoardFootage'], ['quizBoardScreenshot'], []]);
    assert.ok(out.index.reasons.quizBoardFootage && out.index.reasons.quizBoardScreenshot, 'label texts in the index');
    assert.deepStrictEqual(out.stage.map((st) => st.beforeDramaId), [[1990011], [1990012], [1990013, 1990014], [1990015]]);
    assert.ok(qs.every((x) => !x.drama), 'no scene left off on a quiz with its board');
    const bad = { ...CONFIG, quizDramas: { 'E-QL/+0': { ids: [1990011], label: 'wikiAp' } } };
    assert.throws(() => me.buildEvents(recs(), bad, master(), undefined, {}, null, null, { dramas: [1990011] }), /wikiAp/);
  },
  // Part 4 Task 6 (coordinator ruling): every original quiz run sent its stages to the same answer maps (720510 / 720520 / 720530),
  // so quiz stages of two quiz records share a map key whose drops are equal; any other second record on that key still waits
  quiz_answer_map_shared() {
    const k = { map: { key: 745300, stageBinId: 745300, status: 'ok' }, drama: { before: 1, after: 0, beforeIds: [1900501], afterIds: [] } };
    const a = record('E-QA', [quest(700730, 1, [501], k)], { type: 'QUIZ' });
    const b = record('E-QB', [quest(700731, 1, [501], k)], { type: 'QUIZ', start: '2019-05-01', end: '2019-05-07' });
    const c = record('E-QC', [quest(700732, 1, [501], { ...k, drops: { enemies: [{ enemy: 501, rewardId: 999, rows: [] }], chests: [] } })], { type: 'QUIZ', start: '2019-06-01', end: '2019-06-07' });
    const d = record('E-QE', [quest(700733, 1, [501], { map: k.map })], { start: '2019-07-01', end: '2019-07-07' });
    const cfg = { ...CONFIG, quizDramas: { 'E-QA/+0': [1990021], 'E-QB/+0': [1990022], 'E-QC/+0': [1990023] } };
    const out = me.buildEvents([a, b, c, d], cfg, master(), undefined, {}, null, null, { dramas: [1990021, 1990022, 1990023] });
    const qa = entry(out, 'E-QA').quests[0], qb = entry(out, 'E-QB').quests[0];
    assert.ok(qa.served && qb.served, JSON.stringify([qa.why, qb.why]));
    assert.notStrictEqual(qa.stageId, qb.stageId, 'each quiz stage keeps its own stage row');
    assert.deepStrictEqual(out.stage.filter((st) => st.stageBinId === 745300).map((st) => st.beforeDramaId), [[1990021], [1990022]]);
    assert.strictEqual(out.maps.filter((m) => m.key === 745300).length, 1, 'the map is listed once');
    assert.strictEqual(entry(out, 'E-QC').quests[0].reason, 'mapKeyUsed', 'other drops: still a clash');
    assert.strictEqual(entry(out, 'E-QE').quests[0].reason, 'mapKeyUsed', 'a non-quiz quest on a quiz map: still a clash');
  },
  // Surprise events share their map (user 10-11-2026): every Surprise run used the same map (741710, Cave of Wonders: Treasure
  // Room; 743840 for the Holiday Draw Tickets runs), so a quest of another `shortWindow` record shares the map key even when its
  // objective rewards differ; each keeps its own stage row (objectives, rewards). The drops live in the shared map file, so other
  // drops still clash; a record without the mark on that key still waits.
  surprise_map_shared() {
    const k = { map: { key: 741710, stageBinId: 741710, status: 'ok' } };
    const sw = { shortWindow: 'one whole Pacific day (notice)' };
    const gem = (id) => [objective(10, 'Complete without having to continue', { type: 5, id, num: 1 }), objective(10, 'Complete without having to continue', { type: 5, id, num: 1 }),
      objective(10, 'Complete without having to continue', { type: 5, id, num: 1 })];
    const a = record('E-SA', [quest(741990, 4, [501], { ...k, objectives: gem(50) })], { ...sw, start: '2020-03-05', end: '2020-03-06' });
    const b = record('E-SB', [quest(741710, 4, [501], { map: { key: 741710, stageBinId: 0, status: 'ok' }, objectives: gem(52) })], { ...sw, start: '2020-02-02', end: '2020-02-03' });
    const c = record('E-SC', [quest(742000, 4, [501], { ...k, drops: { enemies: [{ enemy: 501, rewardId: 999, rows: [] }], chests: [] } })], { ...sw, start: '2020-04-01', end: '2020-04-02' });
    const d = record('E-SD', [quest(742010, 4, [501], k)], { start: '2020-05-01', end: '2020-05-07' });
    const out = build([a, b, c, d]);
    const qa = entry(out, 'E-SA').quests[0], qb = entry(out, 'E-SB').quests[0];
    assert.ok(qa.served && qb.served, JSON.stringify([qa.why, qb.why]));
    assert.notStrictEqual(qa.stageId, qb.stageId, 'each Surprise quest keeps its own stage row');
    const rows = out.stage.filter((st) => st.stageBinId === 741710);
    assert.deepStrictEqual(rows.map((st) => st.submissionItemId), [[50, 50, 50], [52, 52, 52]], 'its own objective rewards');
    assert.strictEqual(out.maps.filter((m) => m.key === 741710).length, 1, 'the map is listed once');
    assert.strictEqual(entry(out, 'E-SC').quests[0].reason, 'mapKeyUsed', 'other drops: still a clash');
    assert.strictEqual(entry(out, 'E-SD').quests[0].reason, 'mapKeyUsed', 'a record without shortWindow: still a clash');
  },
  // community-goal bonus (user 10-11-2026): the private data (community_bonus.json events) names the tier the original reached;
  // the entry gets communityBonus {noticeId, count, stageIds (its counted served quests), rewards, ready}. questPrefix narrows
  // the counted quests; no count: waiting (no rewards); a counted quest not served: not ready; perPlayer: the Jewels rounded up
  community_bonus_attached() {
    const gems = (n) => [{ type: 5, id: 48, num: n, name: 'Power Gem' }];
    const tiers = [{ min: 5000, max: null, rewards: gems(30) }, { min: 1, max: 4999, rewards: gems(1) }];
    const recs = [record('E-B1', [quest(702001, 1, [501], { name: 'Defeat X - 1/2' }), quest(702002, 1, [501], { name: 'Defeat X - 2/2' }), quest(702003, 1, [501], { name: 'Get a Part' })]),
      record('E-B2', [quest(702010, 1, [501])], { start: '2019-05-01', end: '2019-05-07' }),
      record('E-B3', [quest(702020, 1, [501]), quest(702021, 1, [999])], { start: '2019-06-01', end: '2019-06-07' }),
      record('E-B4', [quest(702030, 1, [501])], { start: '2019-07-01', end: '2019-07-07' })];
    const bonus = [{ censusId: 'E-B1', noticeId: 63815, count: 7237, tiers, questPrefix: 'Defeat X' },
      { censusId: 'E-B2', noticeId: 62688, count: 732, perPlayer: { type: 2, id: 0, name: 'Jewels', roundUpTo: 10 }, result: [{ type: 2, id: 0, num: 740, name: 'Jewels' }] },
      { censusId: 'E-B3', noticeId: 1, count: 100, tiers },
      { censusId: 'E-B4', noticeId: 2, count: null, tiers }];
    const out = me.buildEvents(recs, CONFIG, master(), undefined, {}, null, null, { bonus });
    const b1 = entry(out, 'E-B1');
    assert.deepStrictEqual(b1.communityBonus, { noticeId: 63815, count: 7237, stageIds: b1.quests.slice(0, 2).map((q) => q.stageId), rewards: gems(30), ready: true,
      questPrefix: 'Defeat X' });
    assert.ok(b1.labels.includes('communityBonus'), JSON.stringify(b1.labels));
    assert.ok(out.index.reasons.communityBonus);
    assert.deepStrictEqual(entry(out, 'E-B2').communityBonus.rewards, [{ type: 2, id: 0, num: 740, name: 'Jewels' }], 'Jewels rounded up to ten');
    const b3 = entry(out, 'E-B3').communityBonus;
    assert.strictEqual(b3.ready, false, 'a counted quest not served: not ready');
    assert.deepStrictEqual(b3.rewards, gems(1));
    assert.ok(!entry(out, 'E-B3').labels.includes('communityBonus'));
    const b4 = entry(out, 'E-B4').communityBonus;
    assert.deepStrictEqual([b4.waiting, b4.ready, b4.rewards], [true, false, []], 'no final count: waiting');
    // without the data nothing is attached
    assert.strictEqual(entry(build(recs), 'E-B1').communityBonus, undefined);
    // a typo stops the run: an unknown census id, a count in no tier, a result that the rule does not give, no counted quest
    const run = (b) => me.buildEvents(recs, CONFIG, master(), undefined, {}, null, null, { bonus: [b] });
    assert.throws(() => run({ censusId: 'E-ZZ', noticeId: 1, count: 1, tiers }), /E-ZZ/);
    assert.throws(() => run({ censusId: 'E-B2', noticeId: 1, count: 0, tiers }), /tier/);
    assert.throws(() => run({ ...bonus[1], result: [{ type: 2, id: 0, num: 730, name: 'Jewels' }] }), /result/);
    assert.throws(() => run({ ...bonus[0], questPrefix: 'Nothing' }), /quest/);
  },
  // fixed completion rewards (user 10-11-2026, notice 61226: «Complete all of the challenges ... to receive every type of 1 Tier 10
  // Subslot Medals»): kind 'completion', the same rewards for every finisher, no count; quests = the name prefixes of the counted
  // quests. Ready when every prefix has a quest and all are served (label completionReward, entry label unchanged: original); a
  // prefix with no quest (a part of the event not in our records) -> missing, not ready; an entry without quests (undated record)
  // -> not ready, no stop; prefixes that match no quest of a record with quests, no rewards or an unknown kind stop the run
  completion_reward_attached() {
    const medals = [{ type: 3, id: 311905, num: 1, name: 'Spirit Lord Kyroo [SAB LV 10]' }, { type: 3, id: 311925, num: 1, name: 'NM Sir Kyroo [SAB LV 10]' }];
    const recs = [record('E-C1', [quest(703001, 1, [501], { name: 'Battle vs. A' }), quest(703002, 1, [501], { name: 'Looking for B Pt. 1' }), quest(703003, 1, [501], { name: 'Extra' })]),
      record('E-C2', [quest(703010, 1, [501], { name: 'Battle vs. A' }), quest(703011, 1, [999], { name: 'Looking for B Pt. 1' })], { start: '2019-05-01', end: '2019-05-07' }),
      record('E-C3', [quest(703020, 1, [501], { name: 'Battle vs. A' })], { start: '2019-06-01', end: '2019-06-07' })];
    const done = (cid, extra = {}) => ({ censusId: cid, name: 'The Keyblade War Challenge Campaign', noticeId: 61226, kind: 'completion', rewards: medals,
      quests: ['Battle vs. A', 'Looking for B'], ...extra });
    const out = me.buildEvents(recs, CONFIG, master(), undefined, {}, null, null, { bonus: [done('E-C1'), done('E-C2'), done('E-C3')] });
    const c1 = entry(out, 'E-C1');
    assert.deepStrictEqual(c1.communityBonus, { name: 'The Keyblade War Challenge Campaign', noticeId: 61226, kind: 'completion', count: null,
      stageIds: c1.quests.slice(0, 2).map((q) => q.stageId), rewards: medals, ready: true });
    assert.ok(c1.labels.includes('completionReward') && !c1.labels.includes('communityBonus'), JSON.stringify(c1.labels));
    assert.strictEqual(c1.label, entry(build(recs), 'E-C1').label, 'an original reward: the entry label is not changed');
    assert.ok(out.index.reasons.completionReward);
    const c2 = entry(out, 'E-C2').communityBonus;
    assert.deepStrictEqual([c2.ready, c2.stageIds.length], [false, 1], 'a counted quest not served: not ready');
    const c3 = entry(out, 'E-C3').communityBonus;
    assert.deepStrictEqual([c3.ready, c3.missing], [false, ['Looking for B']], 'a part of the event not in the record: not ready');
    assert.ok(!entry(out, 'E-C3').labels.includes('completionReward'));
    // an undated record (no quest at all in its entry): attached, not ready, no stop
    const undated = me.buildEvents([record('E-C4', [quest(703030, 1, [501], { name: 'Battle vs. A' })], { start: null, end: null })], CONFIG, master(), undefined, {}, null, null,
      { bonus: [done('E-C4')] });
    const c4 = entry(undated, 'E-C4');
    assert.deepStrictEqual([c4.quests.length, c4.communityBonus.ready, c4.communityBonus.missing], [0, false, ['Battle vs. A', 'Looking for B']], JSON.stringify(c4.communityBonus));
    const run = (b) => me.buildEvents(recs, CONFIG, master(), undefined, {}, null, null, { bonus: [b] });
    assert.throws(() => run(done('E-C1', { quests: ['Nothing'] })), /no quest named «Nothing\.\.\.»/);
    assert.throws(() => run(done('E-C1', { rewards: [] })), /without rewards/);
    assert.throws(() => run(done('E-C1', { kind: 'other' })), /unknown kind/);
  },
  // fix round 1 (M3): a record's own boardSetKey that the board sets do not have stops the run (when board sets are given)
  record_set_key_known() {
    const m = { ...master(), ...BOARD_MASTER() };
    assert.throws(() => me.buildEvents([record('E-K', [quest(700880, 1, [501])], { boardSetKey: '2099-77' })], CONFIG, m, undefined, {}, null, boardSets()), /2099-77/);
    // without board sets the key is kept as it is (coins accrue to it)
    assert.strictEqual(entry(build([record('E-K', [quest(700880, 1, [501])], { boardSetKey: '2099-77' })]), 'E-K').boardSetKey, '2099-77');
  },
  // a challenge event paying Event Coins (type 15): with the boardSetKey of the month's set the quest is built and its coins go
  // to that set; without one it is labelled noBoardSet (coins logged, not paid)
  coin_feeder_by_set() {
    const out = build([record('E-F', [quest(700900, 1, [501])], { boardSetKey: '2099-01' }), record('E-G', [quest(700901, 1, [501])])]);
    const f = entry(out, 'E-F'), g = entry(out, 'E-G');
    assert.ok(f.available && f.boardSetKey === '2099-01');
    assert.ok(f.labels.includes('eventCoins') && !f.labels.includes('noBoardSet'), JSON.stringify(f.labels));
    assert.ok(out.stage.find((s) => s.stageId === f.stageIds[0]).submissionRewardType.includes(15));
    assert.ok(g.available && g.boardSetKey === undefined);
    assert.ok(g.labels.includes('noBoardSet') && !g.labels.includes('eventCoins'), JSON.stringify(g.labels));
    assert.ok(out.index.reasons.noBoardSet && /not paid/i.test(out.index.reasons.noBoardSet));
    // a record key that the board sets file contradicts stops the run
    assert.throws(() => me.buildEvents([record('E-1', [quest(700902, 1, [501])], { boardSetKey: '2099-02' })], CONFIG, { ...master(), ...BOARD_MASTER() }, undefined, {}, null, boardSets()), /2099-02/);
  },
  // an informative notice of the challenge records (noQuests 'notice'): no evStage row and no row in the catalogue
  notice_row_not_listed() {
    const out = build([record('E-N', [], { noQuests: 'notice' }), ...records()]);
    const e = entry(out, 'E-N');
    assert.strictEqual(e.reason, 'notice');
    assert.strictEqual(e.why, REAL_CONFIG.reasonText.notice);
    assert.ok(!e.available);
    assert.strictEqual(out.evStage.length, 2, 'only the two playable records');
    const listed = require('./event-pages').entriesOf(out.index).map((x) => x.censusId);
    assert.ok(!listed.includes('E-N') && listed.includes('E-1'), JSON.stringify(listed));
  },
  // the generator flags of the private records (Task 1) are not label phrases: the generator decides them itself; a quest whose
  // khuxwiki objective text contradicts the donor code (objectiveMismatch) is held
  record_flags_decided_here() {
    const q = quest(701100, 1, [501], { label: 'original; enemies missing: 1; boosterLater; quizTextMissing; rewardTypeUnknown; boosterOnly; objectiveMismatch' });
    const out = build([record('E-L', [q, quest(701101, 1, [501], { objectiveMismatch: ['1: wiki «A» / donor «B» (code 3, num 16)'] })])]);
    const qs = entry(out, 'E-L').quests;
    assert.ok(qs[0].served, JSON.stringify(qs[0]));
    assert.deepStrictEqual(qs[0].labels, []);
    assert.strictEqual(qs[1].reason, 'objectiveMismatch');
    assert.strictEqual(qs[1].why, REAL_CONFIG.reasonText.objectiveMismatch);
  },
  // the id ranges: a run that needs more numbers than the range holds stops with the range and the count
  id_range_overflow() {
    const cfg = { ...CONFIG, stageMax: CONFIG.stageBase + 2 };
    assert.throws(() => build([record('E-O', [quest(701200, 1, [501]), quest(701201, 1, [501]), quest(701202, 1, [501])])], undefined, cfg), /4000000-4000002.*3/);
    const rows = { ...CONFIG, evStageMax: CONFIG.evStageBase + 1 };
    assert.throws(() => build(records(), undefined, rows), /20000-20001.*2/);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
