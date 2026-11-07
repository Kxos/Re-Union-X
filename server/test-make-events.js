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
const entry = (out, id) => out.index.entries.find((e) => e.censusId === id);

const tests = {
  ids_stable() {
    const a = build();
    const b = build(records(), a.ids, CONFIG, master(), a.anchors);
    assert.deepStrictEqual(b.ids, a.ids, 'same input, same ids');
    // the versioned ids file holds no donor stage id (offsets from the record's anchor, kept apart)
    assert.deepStrictEqual(Object.keys(a.ids.entries), ['E-1/+0', 'E-1/+1', 'E-2/+0']);
    assert.deepStrictEqual(a.anchors, { 'E-1': 700001, 'E-2': 700010 });
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
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(opts.anchorsFile, 'utf8')), { 'E-1': 700001, 'E-2': 700010 });
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
    delete bare.reconstructedWhy.eventCoins;
    assert.throws(() => build(records(), undefined, bare), /eventCoins/);
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
    // the real config: 13 pilot ids and the GEM type
    assert.strictEqual(REAL_CONFIG.serve.censusIds.length, 13);
    assert.deepStrictEqual(REAL_CONFIG.serve.types, ['GEM']);
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
    const recs = Object.keys(ids.rows).map((c) => record(c, (byRec[c] || []).map((off) => quest(ANCH + Number(off), 1, [501])), { type: 'EQ' }));
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
  no_source_writes_nothing() {
    const old = process.env.KHUX_EVENT_SRC;
    delete process.env.KHUX_EVENT_SRC;
    try { assert.strictEqual(me.patch(path.join(os.tmpdir(), 'khux-none')), null); } finally { if (old !== undefined) process.env.KHUX_EVENT_SRC = old; }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
