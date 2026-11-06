// Event quest generator: node server/test-make-events.js
// Synthetic fixtures only (no donor row, no notice text). `real_config_covers_labels` reads server/event_config.json.
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const me = require('./make-events');
const { EVSTAGE_MAX_STAGES } = require('./make-raid');

const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8'));
const CONFIG = { ...REAL_CONFIG, onlyCensusIds: null };

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
    assert.strictEqual(row.eventType, 2);
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
    assert.ok(row.bannerUrl.endsWith('/web/event/img/v1/20000.png'), row.bannerUrl);
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
