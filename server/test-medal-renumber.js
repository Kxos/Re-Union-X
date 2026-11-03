// Renumbered medals (I-225, medal-renumber.js): the ids ending in 2/4 whose cut-in row id-1 was another medal.
// Guard on the served master (make-cutin-alias.cutinConflicts: every medal of ours with a special finds its own
// cut-in, frame and sound in the row the client reads), mapping rules, catalogue, reward tables and the save
// migration (medalMapVersion 3) on a fake save (KHUX_SAVE, one child process per login; real saves untouched):
//   node server/test-medal-renumber.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const rn = require('./medal-renumber');
const { cutinConflicts, cutinRowId } = require('./make-cutin-alias');

const LIST = JSON.parse(fs.readFileSync(rn.MAP_FILE, 'utf8')).renumber;
const OLD = Object.keys(LIST).map(Number);

// 1. the frozen list: old + 10001, never ending in 2/4, ids distinct
assert.ok(OLD.length > 0, 'list not empty');
for (const o of OLD) {
  const to = LIST[o];
  assert.strictEqual(to, o + rn.STEP, `${o}: old + ${rn.STEP}`);
  assert.ok(o % 10 === 2 || o % 10 === 4, `${o} ends in 2/4`);
  assert.ok(to % 10 === 3 || to % 10 === 5, `${to} ends in 3/5`);
}
assert.strictEqual(LIST[302084], 312085, 'SN++ - MoM Kairi B 302084 -> 312085');

// 2. newId: normal rows, copies digit x 10^6, Trait Medals and SE ids unchanged, idempotent
assert.strictEqual(rn.newId(302084), 312085);
assert.strictEqual(rn.newId(2302084), 2312085, 'boosted copy follows its normal row');
assert.strictEqual(rn.newId(1300682), 1310683);
assert.strictEqual(rn.newId(302083), 302083, 'row id-1 (another medal) keeps its id');
assert.strictEqual(rn.newId(312085), 312085, 'idempotent');
assert.strictEqual(rn.newId(9000002), 9000002, 'Trait Medal unchanged');
assert.strictEqual(rn.newId(11012), 11012, 'SE original unchanged');
assert.strictEqual(rn.newId('302084'), '302084', 'not a number: unchanged');

// 3. reward tables: only reward type 3 (medal)
const stage = [{ submissionRewardType: [3, 5, 3], submissionItemId: [302084, 302084, 1] }];
const reward = [{ type: 3, id: 300682 }, { type: 5, id: 300682 }];
assert.strictEqual(rn.renumberRewards(stage, 'submissionRewardType', 'submissionItemId'), 1);
assert.deepStrictEqual(stage[0].submissionItemId, [312085, 302084, 1], 'stage: type 3 only');
assert.strictEqual(rn.renumberRewards(reward, 'type', 'id'), 1);
assert.deepStrictEqual(reward.map((r) => r.id), [310683, 300682], 'reward: type 3 only');

// 4. catalogue: name index, bonus and pity gift of type 3, Evolve pool
const cat = rn.mapCatalog({ medals: { 'sn++ - mom kairi b': { ids: [[302084, 7, '2020-01-01', 10]] } },
  banners: [{ bonus: [[3, 300724, 1], [5, 300724, 1]], guarantee: { pityGift: [3, 302084, 1] }, pool: { evolve: [[300682, 1]] } }] });
assert.strictEqual(cat.medals['sn++ - mom kairi b'].ids[0][0], 312085);
assert.deepStrictEqual(cat.banners[0].bonus, [[3, 310725, 1], [5, 300724, 1]]);
assert.deepStrictEqual(cat.banners[0].guarantee.pityGift, [3, 312085, 1]);
assert.deepStrictEqual(cat.banners[0].pool.evolve, [[310683, 1]]);

// 4b. server switch: a master with an old id turns the mapping off (identity), a renumbered one on
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renumber-'));
  try {
    fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify([{ medalId: 302083 }, { medalId: 302084 }]));
    assert.strictEqual(rn.syncWithMaster(dir), false, 'old master: off');
    assert.strictEqual(rn.newId(302084), 302084, 'old master: identity');
    fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify([{ medalId: 302083 }, { medalId: 312085 }]));
    assert.strictEqual(rn.syncWithMaster(dir), true, 'renumbered master: on');
    assert.strictEqual(rn.newId(302084), 312085);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// 5. served master: no cut-in conflict left, no old id, images and specials of the old id kept
const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
if (fs.existsSync(path.join(MASTER, 'medal.json'))) {
  const medals = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
  const byId = new Map(medals.map((r) => [r.medalId, r]));
  const bad = cutinConflicts(medals);
  assert.deepStrictEqual(bad.map((r) => `${r.medalId} ${r.name} -> row ${cutinRowId(r.medalId)} ${byId.get(cutinRowId(r.medalId))?.name}`), [],
    'every medal of ours with a special reads its own cut-in row (new conflicts: extend medal_renumber.json and the migration)');
  const left = medals.filter((r) => r.medalId < 9000000 && LIST[r.medalId % 1000000]).map((r) => r.medalId);
  assert.deepStrictEqual(left, [], 'no row keeps an old id');
  for (const o of OLD) {
    const r = byId.get(LIST[o]);
    assert.ok(r, `${o} -> ${LIST[o]} in the master`);
    assert.deepStrictEqual([r.imageId, r.thumbId, r.cutinId, r.artId], [o, o, o, o], `${LIST[o]}: images of the old id (no new resources)`);
  }
  const refs = medals.flatMap((r) => [r.evolveId, r.groupId, ...(r.evolveNeedId || [])]).filter((v) => v && v < 9000000 && LIST[v % 1000000]);
  assert.deepStrictEqual(refs, [], 'Evolve, materials and normal of a copy point to the new ids');
  const kairi = byId.get(312085);
  assert.ok(kairi && kairi.name === 'SN++ - MoM Kairi B' && kairi.burstId === 3002084 && kairi.superBurstId === 4002084, 'Kairi B keeps its specials');
  for (const [t, ty, id] of rn.REWARD_PAIRS) {
    const f = path.join(MASTER, t + '.json');
    if (!fs.existsSync(f)) continue;
    const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.strictEqual(rn.renumberRewards(rows, ty, id), 0, `${t}.${id}: no medal reward with an old id`);
  }
  // the catalogue as the server reads it (gacha-data.loadCatalog) has no old id left
  const gd = require('./gacha-data');
  const file = path.join(__dirname, 'game_data', 'gacha_catalog.json');
  if (fs.existsSync(file)) {
    const c = gd.loadCatalog(file);
    const ids = Object.values(c.medals || {}).flatMap((e) => (e.ids || []).map((x) => x[0]));
    assert.deepStrictEqual(ids.filter((v) => v < 9000000 && LIST[v % 1000000]), [], 'catalogue read with the new ids');
  }
}

// 6. save migration (medalMapVersion 2 -> 3)
const SAVE = path.join(os.tmpdir(), `khux-test-renumber-${process.pid}.json`);
const T = 1700000000000;
const save = (extra) => ({ created: true, name: 'Old', clockVersion: 2, skillVersion: 1, medalMapVersion: 2, nextUserSkillId: 6000,
  medals: [
    { userMedalId: 301, medalId: 302084, level: 50, exp: 9, getDatetime: T },       // SN++ - MoM Kairi B
    { userMedalId: 302, medalId: 2302084, level: 1, exp: 0, getDatetime: T + 1 },   // its boosted copy
    { userMedalId: 303, medalId: 302083, level: 1, exp: 0, getDatetime: T + 2 },    // Marluxia: stays
    { userMedalId: 304, medalId: 300682, level: 1, exp: 0, getDatetime: T + 3 },
    { userMedalId: 305, medalId: 9000002, level: 1, exp: 0, getDatetime: T + 4 }],  // Trait Medal: stays
  deck: [301, 302, 303], medalLocks: { 301: 1 }, supportUserMedalId: 301,
  medalState: { 304: { medalId: 300724, level: 3 } },
  presents: [{ userPresentId: 1, resourceType: 3, resourceId: 302084, number: 1, limitDatetime: T * 2, comment: 'x', created: T },
    { userPresentId: 2, resourceType: 5, resourceId: 302084, number: 1, limitDatetime: T * 2, comment: 'x', created: T }],
  presentLastId: 2,
  guiltBurst: { first: [302084, 312085, 300682, 302083], max: [300682] }, ...extra });
function login() {
  const env = { ...process.env, KHUX_SAVE: SAVE, KHUX_REVISION: '127' };
  delete env.KHUX_REAL_NOW; delete env.KHUX_SERVER_TIME;
  const code = `const log = console.log; console.log = () => {}; require(${JSON.stringify(path.join(__dirname, 'server'))}); log('done');`;
  execFileSync(process.execPath, ['-e', code], { env, encoding: 'utf8' });
  return JSON.parse(fs.readFileSync(SAVE, 'utf8'));
}
try {
  fs.writeFileSync(SAVE, JSON.stringify(save()));
  const p = login();
  const by = (id) => p.medals.find((m) => m.userMedalId === id).medalId;
  assert.strictEqual(p.medalMapVersion, 3);
  assert.deepStrictEqual([by(301), by(302), by(303), by(304), by(305)], [312085, 2312085, 302083, 310683, 9000002], 'medals[]');
  assert.deepStrictEqual(p.deck, [301, 302, 303], 'deck by userMedalId unchanged');
  assert.deepStrictEqual(p.medalLocks, { 301: 1 }); assert.strictEqual(p.supportUserMedalId, 301);
  assert.strictEqual(p.medals.find((m) => m.userMedalId === 301).level, 50, 'level kept');
  assert.strictEqual(p.medalState['304'].medalId, 310725, 'medalState');
  assert.deepStrictEqual(p.presents.map((x) => x.resourceId), [312085, 302084], 'medal present only');
  assert.deepStrictEqual(p.guiltBurst.first, [302084, 312085, 310683, 302083], 'Nova record: new id already there -> old kept, no second level up');
  assert.deepStrictEqual(p.guiltBurst.max, [310683]);
  const before = fs.readFileSync(SAVE, 'utf8');
  login();
  assert.strictEqual(fs.readFileSync(SAVE, 'utf8'), before, 'second login: save identical');
  console.log(`test-medal-renumber: ok (${OLD.length} renumbered medals)`);
} finally { try { fs.unlinkSync(SAVE); } catch { /* absent */ } }
