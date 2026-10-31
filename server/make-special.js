#!/usr/bin/env node
// Master rows of the Special tab (Quests > Special, plan docs/superpowers/plans/2026-10-30-special-tab.md Task 3, spec
// docs/superpowers/specs/2026-10-30-special-tab-design.md sections 5-8). Inputs:
// - server/special_periods.json (versioned, ours): periods {n, name, from, to} and the entries (key, evStageId, quests
//   picked by catalogue `series` or `quest` name, family, periods, days, vip, replacedBy, removed, resetGroup, useAp?,
//   rewards? (objective rewards that replace the catalogue ones, e.g. the «(See table)» VIP quests), objectives?
//   ({quest: reconstructed «text -> reward» lines} for a catalogue quest without any or with a typo), from? / to?
//   (days inside the periods, copied into the index), drops);
//   plus campaignSets / campaigns: the content of the 120 WW week-limited VIP campaigns (Task 12, campaignEntries below);
//   plus weekly: the week versions of the recurring VIP sets (round 17, weeklyEntries below; catalogue
//   `vip_recurring_weekly`, evStage ids from 7700);
// - the private catalogue of the original Special quests (KHUX_SPECIAL_SRC, default
//   D:\Progetto_Restauro_KH_UX\private\events\special\special_quests.json; never copied into the repo): per quest world,
//   room, AP, level, target and the three objectives «text -> reward».
//   Its `vip_limited_campaigns_ww` rows (id, notice, title, start, end) give the campaign entries 7501-7620.
// Output (idempotent: own rows are dropped first):
// - stage rows 970000-979999 with stageKind 2 (bench 30-10: a stageKind 2 row with id = stageId works as a Special
//   quest; Begin sends eventId = the evStage id). Stage ids: 970000 + (evStageId - 7000) * 10 + position (max 5).
//   Each row is a copy of the last story row 1-525 of the same world (as make-story-oltre.js picks its reference rows)
//   with name, room, AP and the three objectives (codes from objectiveCodes, first-clear rewards); no clear items, no
//   dramas; stageBinId = own stageId (own maps, Task 4). 970000 is the training quest of the catalogue banner (spec 7);
// - evStage rows: 7000 (catalogue banner, Details -> /web/special/catalog) and one per entry that is not removed, with the
//   38 fields of the bench row (every field mandatory, validStageId = count of stageId, dates parsable; paths relative,
//   the server adds the host). The client ignores week*/benefit* (bench 30-10): the server decides open/locked;
// - reward rows 970000+: one per drop, prize at position 0 (type 5 material, or type 3 medal: bench 30-10, the client
//   shows a medal dropped by an enemy when /stage/start sends 3 at its position). Task 4 puts them on the enemies;
// - training (spec 7, Task 10): enemy row DUMMY_ENEMY_ID (the unkillable training dummy, a Large Body copy) and reward
//   row CP_REWARD_ID (the CP chests of path B); index catalog.dummyEnemyId / catalog.rewardIds; the training map entry
//   gets training: true, dummy: [{name, enemyId, n, reward 1}] and chests: [CP_REWARD_ID per chest] (two-path map of
//   gen_story_maps.py build_training);
// - server/game_data/special.json: the index read by special.js / server.js (catalog + entries, Task 2 shape, plus the
//   map data Task 4 needs: world, room, target, level and drop rows per stage);
// - server/game_data/special_maps.json: the stage list for recon/tools/gen_story_maps.py (config key "special"):
//   {stageId, world (worldId), name, room, target, targetId, targetReward, level (wiki level, for the level field of the
//   enemy records, as the original maps), enemies: [[{name, enemyId, n, reward}] per group], treasures: [], rooms: 1}.
//   Target = the 1xxxx form of the enemy (as on the original maps; the same id goes into the objectives); groups = 2 of
//   the target enemy each, plus one carrier per drop row (enemy record reward = the drop row) and the enemies of
//   «Defeat X» objectives with their objective id. Every enemy (one member each) and the target carry one of the
//   entry's drop rows, round-robin (the original Special quests dropped the family items from every enemy; bench rev
//   215); an entry without drops and the training map (spec 7) put row 1 on every enemy, as the story maps (never 0: the
//   client reads the enemy's reward row and crashes after /stage/start without it, recon/tools/stage_poi.py). Carriers (builder's call): EXP medals on a
//   Growth Egg, Moogle (munny) on a Munny Egg, everything else on a Prize Egg.
// Wired at the end of make-game-tables.js (after make-proud). KHUX_SPECIAL=0 turns it off; without the private
// catalogue it is skipped with a warning (clean PC). After a run: raise the master revision.
//
//   node server/make-special.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');
const { imgPath } = require('./special');
const { objectiveCodes, objectiveReward, wikiLv, WIKI_WORLD } = require('./make-story-oltre');

// bench 30-10 (Task 1): K = stageKind 2
const STAGE_KIND = 2;
const STAGE_FIRST = 970000, STAGE_LAST = 979999;
const EV_FIRST = 7000, EV_LAST = 7999, CATALOG_EV = 7000, TRAINING_STAGE = 970000;
const REWARD_FIRST = 970000, REWARD_LAST = 979999;
// events with these stages are dropped by the client (bench 30-10)
const CLIENT_DROPPED = [95100, 95200];
const START = '2015-01-01 00:00:00', END = '2030-12-31 23:59:59';
const DEFAULT_SRC = 'D:\\Progetto_Restauro_KH_UX\\private\\events\\special\\special_quests.json';
// training quest (spec 7): 0 AP, target Shadow on path A; the dummy and the CP chests of path B come with its map
// (Tasks 4 and 10). Objective rewards: a little Munny, once (TRAINING_OBJECTIVE_REWARD_TYPE below).
// Room: the 1st District (DB_0004_00_00), a long street with the start in its middle (two paths, gen_story_maps.py
// build_training); the room the name «Training Grounds» picked (DB_0027_00_00) has 2 walkable grid points.
// reward of the three training objectives: Munny x100 each, first time only (user 31-10: «give Munny so the slots are
// not empty»; type 0 left the reward slots blank). respondStageClear grants nothing else from the training run.
const TRAINING_OBJECTIVE_REWARD_TYPE = 4, TRAINING_OBJECTIVE_MUNNY = 100;
const TRAINING = { name: 'Training Grounds', world: 'Daybreak Town', room: '1st District', target: 'Shadow', level: 1,
  objectives: ['Defeat the target enemy -> Munny x100', 'Complete without having to continue -> Munny x100', 'Defeat Shadow x 1 -> Munny x100'] };
// a «Title x1» objective without a title name in the catalogue (MOG quests): Avatar Coin x5, like the other small
// objective rewards of the Special quests (builder's call)
const TITLE_FALLBACK = [14, 0, 5];
// Training dummy (spec 7, Task 10): an enemy row copied from the Large Body (its look, no new graphics), the same HP at
// every level, no exp/munny/lux. HP: the client keeps enemy HP as int64 (I-206: 979 Ephemer & Skuld are served at
// 6.5e11); 9e14 is the largest round value whose x10000 (a client rate in ten-thousandths, as the heal of an attack
// row) still fits an int64 and that a double holds exactly. Self heal: the original «Big Self Heal» row 2101 (Wibble
// Wobble; attack + heal 3500, motion 1) as second skill, usable at any HP (skillRequire 2): with HP this large the
// original condition (4, HP below a share) would never come true. Without row 2101 in the master: HP only.
const DUMMY_ENEMY_ID = 970007, DUMMY_TEMPLATE = 'Large Body', DUMMY_NAME = 'Training Dummy', DUMMY_HP = 900000000000000;
const DUMMY_HEAL = 2101, DUMMY_HEAL_ODDS = 3000;
// enemies of the training path A: the client adds up the Munny, EXP and Lux of the enemy rows by itself for
// CONGRATULATIONS (bench 30-10: «Munny 131», nothing granted). Target: the original Shadow row 15001 (10001 with 0 Munny,
// EXP and Lux; same HP and attack at Lv 1); the others: a copy of the Shadow 8xxxx row with these values at 0
const TRAINING_TARGET_ID = 15001, TRAINING_SHADOW_ID = 970008;
const DUMMY_FLAVOR = 'A training dummy that never falls. Test your Medals and specials here, then leave with Give Up.';
// CP chests of path B: one reward row (id fixed, own range) with one prize type 8 (special gauge, 1 gauge = 10000) of
// 60000, the largest original CP chest (row 82); count = ceil(largest keyblade maxBurstGauge x 10000 / 60000)
const CP_REWARD_ID = REWARD_LAST, CP_PER_CHEST = 60000, GAUGE_UNIT = 10000;

const num = (s) => parseInt(String(s || '').replace(/,/g, ''), 10) || 0;
// «12 / 20 / 30» -> 12 (tier I), «zero» -> 0
const apOf = (s) => (String(s).trim().toLowerCase() === 'zero' ? 0 : num(String(s).split('/')[0]));
const stageIdOf = (evStageId, i) => STAGE_FIRST + (evStageId - EV_FIRST) * 10 + i;
const isOwnStage = (r) => r.stageId >= STAGE_FIRST && r.stageId <= STAGE_LAST;
const isOwnEv = (r) => r.eventStageId >= EV_FIRST && r.eventStageId <= EV_LAST;
const isOwnReward = (r) => r.rewardId >= REWARD_FIRST && r.rewardId <= REWARD_LAST;
const isOwnEnemy = (r) => r.enemyId === DUMMY_ENEMY_ID || r.enemyId === TRAINING_SHADOW_ID;
// enemies of a map group: at most 5 (as the story groups), at least 3 normal groups
const GROUP_MAX = 5, GROUPS_MIN = 3, TARGET_PER_GROUP = 2;
const carrierOf = (medalName) => (/^(Huey|Dewey|Louie)\b/.test(medalName || '') ? 'Growth Egg'
  : /^Moogle\b/.test(medalName || '') ? 'Munny Egg' : 'Prize Egg');

// «Defeat X x 1 -> Cid 6★ x1» -> {text, reward, qty}
function splitObjective(s) {
  const [text, rw = ''] = String(s).split(/\s*->\s*/);
  const m = /^(.*?)(?:\s+x\s*([\d,?]+))?$/.exec(rw.trim());
  return { text: text.trim(), reward: m[1].trim(), qty: m[2] || '' };
}

// name lookups on the master tables; a medal label is «Name N★» (smallest medalId, as make-story-oltre.js: the
// boosted copies have bigger ids)
function lookups(m) {
  const lower = (s) => String(s).trim().toLowerCase();
  const enemyId = (name) => (m.enemy || []).filter((e) => lower(e.name) === lower(name)).map((e) => e.enemyId).sort((a, b) => a - b)[0] || 0;
  const medalId = (label) => {
    const x = /^(.+?)\s*(\d*)★$/.exec(String(label || '').trim());
    if (!x) return 0;
    const rare = num(x[2]) || 1;
    return ((m.medal || []).filter((r) => r.name === x[1] && r.rare === rare).sort((a, b) => a.medalId - b.medalId)[0] || {}).medalId || 0;
  };
  const materialId = (name) => ((m.material || []).find((r) => lower(r.name) === lower(name)) || {}).materialId || 0;
  // avatar parts «Name (♂)» / «Name (♀)»: gender 1 / 2
  const avatarPartId = (label) => {
    const x = /^(.+?)\s*\((♂|♀)\)$/.exec(String(label).trim());
    if (!x) return 0;
    return ((m.avatarParts || []).find((r) => r.name === x[1] && r.gender === (x[2] === '♂' ? 1 : 2)) || {}).avatarPartsId || 0;
  };
  // map form of an enemy (as enemy_id of gen_story_maps.py): target 1xxxx, others 8xxxx, otherwise the smallest id
  const mapEnemyId = (name, target) => {
    const ids = (m.enemy || []).filter((e) => lower(e.name) === lower(name)).map((e) => e.enemyId).sort((a, b) => a - b);
    return ids.find((i) => (target ? i >= 10000 && i < 20000 : i >= 80000 && i < 90000)) || ids[0] || 0;
  };
  return {
    enemyId, medalId, materialId, avatarPartId, mapEnemyId, avatarParts: m.avatarParts || [],
    titleId: (name) => ((m.title || []).find((r) => r.title === name) || {}).titleId || 0,
    keybladeId: (name) => ((m.keyblade || []).find((k) => k.name === name && !k.lv) || {}).keybladeId || 0,
    skillId: (name) => ((m.skill || []).find((s) => s.name === name) || {}).skillId || 0,
    skillRow: (name) => (m.skill || []).find((s) => s.name === name) || null,
  };
}

// a medal reward with an assigned skill (VIP! Skill, round 18): «Scrooge 6★ {ATK B X Max & Lux++} x1» = the medal
// «Scrooge 6★» carrying the master skill «ATK B X Max & Lux++» at its maxLv (the originals: «1 6★ ATK B X Max & Lux++»
// with the Scrooge 6★ image, khuxwiki VIP! Skill). -> {reward: «Scrooge 6★», skill: «ATK B X Max & Lux++»} (skill null
// without braces)
function skillPart(reward) {
  const m = /^(.*?)\s*\{([^{}]+)\}$/.exec(String(reward || '').trim());
  return m ? { reward: m[1].trim(), skill: m[2].trim() } : { reward: String(reward || '').trim(), skill: null };
}

// objective reward -> [type, id, num]: materials, munny, draw tickets and avatar parts here, the rest (Avatar Coin,
// Mythril Shard, Jewel, Title, medals) through objectiveReward of make-story-oltre.js. Null when not found.
function rewardOf(o, L) {
  const q = num(o.qty) || 1;
  if (o.reward === 'Munny') return [4, 0, q];
  if (/^Draw Tickets?$/i.test(o.reward)) return [41, 0, q]; // as make-limited-missions.js
  const part = L.avatarPartId(o.reward);
  if (part) return [20, part, 1];
  if (!['Mythril Shard', 'Avatar Coin', 'Jewel', 'Title', 'Trophy'].includes(o.reward)) {
    const mat = L.materialId(o.reward) || L.materialId(o.reward.replace(/s$/, ''));
    if (mat) return [5, mat, q];
  }
  return objectiveReward({ reward: o.reward, qty: String(q) }, { ...L, raw: { titles: [], img: [] } }, 0, 0);
}

// three objectives of a quest -> fields of the stage row (same layout as setSubs in make-story-oltre.js)
function subsOf(objectives, rewardsOverride, target, L, report, where) {
  const ctx = { ...L, target: L.mapEnemyId(target, true), targetName: target, header: null };
  const subs = objectives.slice(0, 3).map((s, i) => {
    const o = splitObjective(s);
    if (rewardsOverride && rewardsOverride[i]) Object.assign(o, splitObjective(`x -> ${rewardsOverride[i]}`), { text: o.text });
    let c = /^Defeat the target enemy$/i.test(o.text)
      // training: «Defeat the target enemy» has no original code; 12 on the target with a turn limit no battle reaches
      ? { name: 'Defeat the target enemy', req: 12, dt: 4, it: 1, id: ctx.target, n: 99 }
      : objectiveCodes(o.text, ctx);
    if (!c) { report.stopgaps.push([where, i + 1, o.text]); c = { name: o.text, req: 10, dt: 1, it: 0, id: 0, n: 0 }; }
    const sp = skillPart(o.reward);
    o.reward = sp.reward;
    let rw = rewardOf(o, L);
    if (!rw && o.reward === 'Title') { report.titleFallbacks.push([where, i + 1]); rw = TITLE_FALLBACK; }
    if (!rw) throw new Error(`special: ${where} objective ${i + 1}: reward «${o.reward}» not found in the master`);
    // assigned skill (round 18): only on a medal; submissionSkillType 1 as the original medal rewards (1/0/1 = no
    // skill, LV 1), here with the skill id and its maxLv
    let sk = [0, 0, 0];
    if (sp.skill) {
      const row = L.skillRow ? L.skillRow(sp.skill) : null;
      if (!row) throw new Error(`special: ${where} objective ${i + 1}: skill «${sp.skill}» not in the skill table`);
      if (rw[0] !== 3) throw new Error(`special: ${where} objective ${i + 1}: skill «${sp.skill}» on a reward that is not a medal`);
      sk = [1, row.skillId, row.maxLv || 1];
    }
    return [c, rw, sk];
  });
  const pad = (f) => [0, 1, 2].map((i) => (i < subs.length ? f(subs[i]) : 0));
  return { validSubmission: subs.length,
    submissionRequire: pad(([c]) => c.req), submissionName: [0, 1, 2].map((i) => (i < subs.length ? subs[i][0].name : '')),
    submissionDataType: pad(([c]) => c.dt), submissionIdType: pad(([c]) => c.it), submissionId: pad(([c]) => c.id),
    submissionNum: pad(([c]) => c.n), submissionRewardType: pad(([, r]) => r[0]), submissionItemId: pad(([, r]) => r[1]),
    submissionSkillType: pad(([, , k]) => k[0]), submissionSkillId: pad(([, , k]) => k[1]), submissionSkillLv: pad(([, , k]) => k[2]),
    submissionItemNum: pad(([, r]) => r[2]) };
}

// normal Shadow of the training (TRAINING_SHADOW_ID above): the 8xxxx row, else the smallest id
function trainingShadowRow(masterRows) {
  const is8 = (e) => (e.enemyId >= 80000 && e.enemyId < 90000 ? 1 : 0);
  const tpl = (masterRows.enemy || []).filter((e) => e.name === TRAINING.target && !isOwnEnemy(e))
    .sort((a, b) => is8(b) - is8(a) || a.enemyId - b.enemyId)[0];
  if (!tpl) throw new Error(`special: no «${TRAINING.target}» enemy row for the training`);
  const row = JSON.parse(JSON.stringify(tpl));
  row.enemyId = TRAINING_SHADOW_ID;
  for (const k of ['exp', 'money', 'raidPoint', 'lux']) if (Array.isArray(row[k])) row[k] = row[k].map(() => 0);
  return row;
}

// training dummy enemy row (DUMMY_* above): the 8xxxx Large Body row, else its smallest id
function dummyRow(masterRows) {
  const is8 = (e) => (e.enemyId >= 80000 && e.enemyId < 90000 ? 1 : 0);
  const tpl = (masterRows.enemy || []).filter((e) => e.name === DUMMY_TEMPLATE && !isOwnEnemy(e))
    .sort((a, b) => is8(b) - is8(a) || a.enemyId - b.enemyId)[0];
  if (!tpl) throw new Error(`special: no «${DUMMY_TEMPLATE}» enemy row for the training dummy`);
  const row = JSON.parse(JSON.stringify(tpl));
  const flat = (k, v) => { if (Array.isArray(row[k])) row[k] = row[k].map(() => v); };
  Object.assign(row, { enemyId: DUMMY_ENEMY_ID, name: DUMMY_NAME, flavor: DUMMY_FLAVOR });
  flat('hp', DUMMY_HP);
  for (const k of ['exp', 'money', 'raidPoint', 'lux']) flat(k, 0);
  if ((masterRows.enemyAttack || []).some((a) => a.enemyAttackId === DUMMY_HEAL)) {
    // first skill of the template (its basic attack) kept, the heal second; arrays keep their length
    const two = (arr, v) => { const o = [...(arr || [0, 0])]; while (o.length < 2) o.push(0); o[1] = v; return o.map((x, i) => (i > 1 ? 0 : x)); };
    Object.assign(row, { validSkill: 2, skillId: two(row.skillId, DUMMY_HEAL), skillRequire: two(row.skillRequire, 2),
      skillRequireArg: two(row.skillRequireArg, 0), skillOdds: two(row.skillOdds, DUMMY_HEAL_ODDS) });
  }
  return row;
}

function evStageRow(evStageId, stageIds, { resetFlag = 0, detailUrl = '' } = {}) {
  const row = { eventStageId: evStageId, parentEventStageId: 0, validStageId: stageIds.length, stageId: [...stageIds],
    validStageWidthId: 0, stageStartId: stageIds[0], stageEndId: stageIds[stageIds.length - 1], resetFlag, eventCategory: 1,
    eventType: 0, scoreMedalListId: 0, scoreStartReward: 0, scoreEndReward: 0, rankingId: 0,
    bannerUrl: imgPath(evStageId), mypageBanner: 0, detailUrl, startTime: START, endTime: END,
    endDispTime: END, boardEndTime: END };
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) row[`week${d}`] = 1;
  row.benefitId = 0;
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) row[`benefit${d}`] = 0;
  return Object.assign(row, { groupPattern: 0, validMinute: 0 });
}

// WW week-limited VIP campaigns (Task 12, spec 5.3): one entry per row of the catalogue's `vip_limited_campaigns_ww`
// (catalogue order), key C<notice>, evStageId frozen in rules.campaigns[key].evStageId (7501-7620 for the 120 rows, the
// catalogue order of 30-10; a campaign without one: next free id after the highest frozen one), VIP, every
// day, period of the start day, campaign window {start, end} in days, end inclusive (the catalogue end is the next
// Monday, exclusive; a row without dates takes start / end from the rules). Content (rules.campaigns[key].parts, at
// most 5 quests in all), each part:
// - «name»: a catalogue quest as it is;
// - {set, n?}: the first n quests of rules.campaignSets[set] (quests, objectives?, drops?, useAp?, pack?); pack
//   {objective, total}: the original set gave `total` items, one per quest: with n < total quests the last one gives
//   the rest (objective `objective` (an index or a list) of the last quest gets x(total - n + 1));
// - {featured: «Medal 6★», trait?}: the weekly featured-medal set (4 copies + 1400 Jewels, plus the trait medal from
//   2018-06): two quests «VIP! <medal> (1)» [medal, medal, Jewel x1400] and «(2)» [medal, medal, trait]; without a
//   trait medal [medal, medal, Jewel x700] twice;
// - {quest, like?, rewards?, useAp?, drops?, dropsFrom?}: a quest named `quest` on the template `like` (a catalogue
//   quest, default CAMPAIGN_TEMPLATE): world, room, target, level, AP and objective texts of the template, the three
//   rewards replaced by `rewards` when given; dropsFrom = key of an entry whose drops it copies.
// Drops are per quest (a part's drops on its quests only); the entry lists the union. Builder's calls in the rules
// (`generic`: one quest of the theme when the notices give no content, `_note`).
const CAMPAIGN_EV_FIRST = 7501, CAMPAIGN_TEMPLATE = 'VIP! Medal Quest', FEATURED_JEWELS = 1400;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const campaignName = (t) => String(t || '').replace(/^\[(?:Edited|Updated)[^\]]*\]\s*/, '').trim();
const periodOfDay = (day, periods) => periods.reduce((n, p) => (day >= p.from ? p.n : n), periods[0].n);

function campaignEntries(rules, catalogue) {
  const rows = catalogue.vip_limited_campaigns_ww || [];
  const specs = rules.campaigns || {}, sets = rules.campaignSets || {};
  const stray = Object.keys(specs).filter((k) => !k.startsWith('_') && !rows.some((r) => `C${r.notice}` === k));
  if (stray.length) throw new Error(`special: campaigns without a catalogue row: ${stray.join(', ')}`);
  const cat = (name, where) => {
    const q = catalogue.quests.find((x) => x.quest === name);
    if (!q) throw new Error(`special: ${where}: quest «${name}» not in the catalogue`);
    return q;
  };
  const entryDrops = (key, where) => {
    const en = rules.entries.find((x) => x.key === key);
    if (!en) throw new Error(`special: ${where}: dropsFrom «${key}» is not an entry`);
    return en.drops || [];
  };
  const withRewards = (objectives, rewards) => objectives.map((o, i) => `${splitObjective(o).text} -> ${rewards[i]}`);
  const setQty = (o, qty) => { const x = splitObjective(o); return `${x.text} -> ${x.reward} x${qty}`; };
  // frozen ids (final review): rules.campaigns[key].evStageId keeps a campaign's banner and stage ids (stageIdOf) when
  // the catalogue rows are reordered or extended; a campaign without one takes the next id after the highest frozen
  let next = Math.max(CAMPAIGN_EV_FIRST - 1, ...Object.keys(specs).filter((k) => !k.startsWith('_'))
    .map((k) => Number(specs[k].evStageId) || 0)) + 1;
  return rows.map((r) => {
    const key = `C${r.notice}`, sp = specs[key];
    if (!sp || !Array.isArray(sp.parts) || !sp.parts.length) throw new Error(`special: campaign ${key} («${r.title}») has no content in rules.campaigns`);
    const start = sp.start || r.start, end = sp.end || (r.end ? addDays(r.end, -1) : null);
    if (!start || !end || end < start) throw new Error(`special: campaign ${key}: window ${start}..${end}`);
    const quests = [];
    for (const part of sp.parts) {
      if (typeof part === 'string') { quests.push({ ...cat(part, key) }); continue; }
      if (part.set) {
        const set = sets[part.set];
        if (!set) throw new Error(`special: ${key}: unknown set «${part.set}»`);
        const n = part.n || set.quests.length;
        set.quests.slice(0, n).forEach((name, j) => {
          const q = cat(name, key);
          let objectives = (set.objectives && set.objectives[name]) || q.objectives;
          if (set.pack && j === n - 1 && n < set.pack.total) {
            objectives = objectives.map((o, k) => ([].concat(set.pack.objective).includes(k) ? setQty(o, set.pack.total - n + 1) : o));
          }
          quests.push({ ...q, objectives, _drops: set.drops || [], _ap: set.useAp });
        });
        continue;
      }
      if (part.featured) {
        const tpl = cat(CAMPAIGN_TEMPLATE, key), medal = part.featured, base = medal.replace(/\s*\d*★$/, '');
        const sets2 = part.trait ? [[`${medal} x1`, `${medal} x1`, `Jewel x${FEATURED_JEWELS}`], [`${medal} x1`, `${medal} x1`, `${part.trait} x1`]]
          : [0, 1].map(() => [`${medal} x1`, `${medal} x1`, `Jewel x${FEATURED_JEWELS / 2}`]);
        sets2.forEach((rw, j) => quests.push({ ...tpl, quest: `VIP! ${base} (${j + 1})`, objectives: withRewards(tpl.objectives, rw), _drops: [] }));
        continue;
      }
      if (part.quest) {
        const tpl = cat(part.like || CAMPAIGN_TEMPLATE, key);
        const drops = part.dropsFrom ? entryDrops(part.dropsFrom, key) : part.drops || [];
        quests.push({ ...tpl, quest: part.quest, objectives: part.rewards ? withRewards(tpl.objectives, part.rewards) : tpl.objectives,
          _drops: drops, _ap: part.useAp });
        continue;
      }
      throw new Error(`special: ${key}: unknown part ${JSON.stringify(part)}`);
    }
    if (quests.length > 5) throw new Error(`special: campaign ${key}: ${quests.length} quests, at most 5 per banner`);
    const evStageId = sp.evStageId || next++;
    // campaign ids run from 7501 to 7699: 7700 up belongs to the week versions of the recurring VIP sets (round 17)
    if (evStageId >= WEEKLY_EV_FIRST) throw new Error(`special: campaign ${key}: evStageId ${evStageId} in the week-version range (${WEEKLY_EV_FIRST}+): campaign ids run from ${CAMPAIGN_EV_FIRST} to ${WEEKLY_EV_FIRST - 1}`);
    return { key, evStageId, name: sp.name || campaignName(r.title), family: sp.family || 'SQ21',
      periods: [periodOfDay(start, rules.periods)], days: 'all', vip: true, replacedBy: null, removed: '', resetGroup: '',
      campaign: { start, end }, banner: sp.banner || '', generic: !!sp.generic, notice: r.notice, questObjs: quests };
  });
}

// Recurring VIP sets, one version per week (round 17, user 31-10: «faithful»). The original recurring VIP quests
// (SQ22: VIP! Medal Quest, VIP! Gems, ...) had their own contents and rewards every week: the catalogue's
// `vip_recurring_weekly` lists them per set (rows {banner, dates «MM/DD/YY - MM/DD/YY; ...», rewards [3 texts]}).
// rules.weekly: {sets: {<catalogue set name>: {entry, bothGenders?}}, aliases: {<reward name>: <master name> | null},
// versions: {<key>: {evStageId, banner?}}}. Each table row becomes a «week version» of the set's entry (the
// representative entry of special_periods.json): key <entry>@<first week> («#2» for a second row starting the same
// week), VIP, every day, campaign window {first Monday, last Sunday} of the row's weeks clipped to the entry's own window
// (from / to and its periods: the weeks before vip-medal / vip-jewels-avatar's from are the 2019 campaigns), period of
// its start, weekOf = the entry's key, weekTitle = the row's banner title, the entry's quest (world, room, target,
// level, AP, objective texts) with the row's three rewards. evStageId frozen in rules.weekly.versions (a new version: next
// free id from WEEKLY_EV_FIRST); banner = the week's original banner when the hunt has it (frozen there), else the entry's.
// Weeks of a row: every Monday and every Sunday (-> its Monday) of the dates, typos skipped (e.g. «02/25/10», «00/15/19»).
// Rewards: «1 7★ X» -> «X 7★ x1», «1400 Jewels» -> «Jewel x1400», «N Name» -> «Name xN», «Name» -> «Name x1»; a
// medal without name («1 7★») takes the row's banner title; an avatar part without gender takes the one the master has;
// aliases rename a reward the 4.3.1 master lacks (closest) or leave it out (null: the slot gets WEEKLY_FILLER, the
// set's own filler reward). bothGenders (spirit parts, as the entry vip-spirit-part): a gender-less part that exists
// for both genders fills slots 2-3 (♂, ♀) when slot 3 is the filler. The entry keeps the weeks without a row
// (special.currentEntries hides it in the weeks a version of it is listed).
// versions[key].quest: fields of the quest that differ in that version (VIP! Skill 2019, khuxwiki «Old» tab: room,
// level, target, attribute); mapEnemies: the normal enemies of the original map, one group each, instead of the
// generated groups.
const WEEKLY_EV_FIRST = 7700, WEEKLY_FILLER = 'Moogle 6★';
const WEEKLY_DAYS = ['2018-01-01', '2021-06-30'];
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
function weeksOf(dates) {
  const out = new Set();
  for (const [, mm, dd, yy] of String(dates || '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g)) {
    const d = `20${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, ms = Date.parse(`${d}T00:00:00Z`);
    if (Number.isNaN(ms) || isoOf(ms) !== d || d < WEEKLY_DAYS[0] || d > WEEKLY_DAYS[1]) continue;
    const wd = new Date(ms).getUTCDay();
    if (wd === 1) out.add(d); else if (wd === 0) out.add(addDays(d, -6));
  }
  return [...out].sort();
}
// catalogue reward text -> «Name xN» (null: a medal without a name)
function weeklyLabel(s, title) {
  const t = String(s).replace(/\s*\|\}\s*$/, '').trim();
  let m = /^(\d+)\s+(\d)★\s*(.*)$/.exec(t);
  if (m) {
    const name = m[3] || String(title || '').replace(/^Get\s+(?:one\s+)?/i, '').replace(/!+$/, '').trim();
    return name ? `${name} ${m[2]}★ x${m[1]}` : null;
  }
  m = /^([\d,]+)\s+(.+)$/.exec(t);
  if (m) return `${m[2].replace(/^Jewels$/, 'Jewel')} x${num(m[1])}`;
  return `${t} x1`;
}
const weekKey = (entryKey, start) => `${entryKey}@${start}`;
// consecutive Mondays of a sorted week list -> runs ([[w1, w2], [w5]])
function runsOf(weeks) {
  const out = [];
  for (const w of weeks) {
    const last = out[out.length - 1];
    if (last && addDays(last[last.length - 1], 7) === w) last.push(w); else out.push([w]);
  }
  return out;
}

function weeklyEntries(rules, catalogue, L, report = { weeklyLeftOut: [], weeklyAliased: [], weeklySkills: [] }) {
  const W = rules.weekly;
  if (!W || !W.sets) return [];
  const table = catalogue.vip_recurring_weekly || {};
  const frozen = Object.fromEntries(Object.entries(W.versions || {}).filter(([k]) => !k.startsWith('_')));
  // frozen ids live in WEEKLY_EV_FIRST..EV_LAST (campaigns stop below, campaignEntries); a dropped version (its rewards
  // are a campaign's, `dropped` = why) is left out but keeps its id reserved, so no other id moves
  for (const [k, v] of Object.entries(frozen)) {
    if (!(v.evStageId >= WEEKLY_EV_FIRST && v.evStageId <= EV_LAST)) throw new Error(`special: weekly ${k}: week-version id ${v.evStageId} outside ${WEEKLY_EV_FIRST}-${EV_LAST}`);
  }
  const used = new Set(Object.values(frozen).map((v) => v.evStageId)), seenKeys = new Set();
  let next = WEEKLY_EV_FIRST;
  const nextId = () => { while (used.has(next)) next++; used.add(next); return next++; };
  const aliases = W.aliases || {};
  const resolves = (label) => {
    if (!label) return false;
    const o = splitObjective(`x -> ${label}`), sp = skillPart(o.reward);
    return !!rewardOf({ ...o, reward: sp.reward }, L) && (!sp.skill || !!(L.skillRow && L.skillRow(sp.skill)));
  };
  const parts = (L.avatarParts || []);
  // «Spiky x1» -> «Spiky (♂) x1» when the master has the part in one gender only
  const genderOf = (name) => [...new Set(parts.filter((r) => r.name === name).map((r) => r.gender))].sort();
  const out = [], unknown = [];
  for (const [setName, spec] of Object.entries(W.sets).filter(([k]) => !k.startsWith('_'))) {
    const en = rules.entries.find((x) => x.key === spec.entry);
    if (!en || !en.quests || en.quests.length !== 1) throw new Error(`special: weekly set «${setName}»: entry ${spec.entry} missing or not a one-quest entry`);
    const tpl = catalogue.quests.find((q) => q.quest === en.quests[0]);
    if (!tpl) throw new Error(`special: weekly set «${setName}»: quest «${en.quests[0]}» not in the catalogue`);
    const pFrom = rules.periods.find((p) => p.n === Math.min(...en.periods)).from, pTo = rules.periods.find((p) => p.n === Math.max(...en.periods)).to;
    const lo = [pFrom, en.from || ''].sort().pop(), hi = [pTo, en.to || '9999'].sort()[0];
    const keys = new Set();
    for (const row of table[setName] || []) {
      const allWeeks = weeksOf(row.dates), weeks = allWeeks.filter((w) => w >= lo && w <= hi);
      if (!weeks.length) continue;
      // a row whose weeks are not consecutive (VIP! Skill 4: 09/28, 10/19, 11/09/20, alternating with VIP! Skill 5):
      // one version per run of consecutive weeks, so the weeks between show the other row (or the fallback)
      runsOf(weeks).forEach((run, ri) => {
        const start = run[0], end = [addDays(run[run.length - 1], 6), hi].sort()[0];
        let key = weekKey(spec.entry, start);
        for (let n = 2; keys.has(key); n++) key = `${weekKey(spec.entry, start)}#${n}`;
        keys.add(key);
        seenKeys.add(key);
        if ((frozen[key] || {}).dropped) return;
        const rewards = row.rewards.slice(0, 3).map((r, i) => {
          let label = weeklyLabel(r, row.banner);
          if (!label) return null;
          let [, name, qty] = /^(.*) x(\d+)$/.exec(label);
          if (Object.prototype.hasOwnProperty.call(aliases, name)) {
            if (aliases[name] === null) { report.weeklyLeftOut.push([key, i + 1, name]); return `${WEEKLY_FILLER} x1`; }
            report.weeklyAliased.push([key, i + 1, name, aliases[name]]);
            name = aliases[name];
          }
          // skill-assigned medal (round 18, spec.skills: catalogue skill text -> master skill name): «ATK B X Max & Lux++ 6★»
          // -> the carrier medal of that rarity with the skill, «Scrooge 6★ {ATK B X Max & Lux++}»
          const sk = spec.skills && /^(.*) (\d)★$/.exec(name);
          if (sk && Object.prototype.hasOwnProperty.call(spec.skills, sk[1]) && !sk[1].startsWith('_')) {
            if (!spec.skillCarrier) throw new Error(`special: weekly set «${setName}»: skills without skillCarrier`);
            report.weeklySkills.push([key, i + 1, sk[1], spec.skills[sk[1]]]);
            name = `${spec.skillCarrier} ${sk[2]}★ {${spec.skills[sk[1]]}}`;
          }
          const g = !/\((?:♂|♀)\)$/.test(name) && genderOf(name);
          if (g && g.length === 1) name = `${name} (${g[0] === 1 ? '♂' : '♀'})`;
          label = `${name} x${qty}`;
          return label;
      });
      // spirit parts (bothGenders): ♂ and ♀ in slots 2-3 when slot 3 is the filler
      if (spec.bothGenders && rewards[1] && rewards[2] === `${WEEKLY_FILLER} x1`) {
        const name = rewards[1].replace(/ x\d+$/, ''), g = genderOf(name);
        if (g.length === 2) { rewards[1] = `${name} (♂) x1`; rewards[2] = `${name} (♀) x1`; }
      }
      const bad = rewards.map((r, i) => [i + 1, r, row.rewards[i]]).filter(([, r]) => !resolves(r));
      if (bad.length) unknown.push(`${key} ${bad.map(([i, r, src]) => `${i} «${src}» (${r})`).join(', ')}`);
      const fz = frozen[key] || {};
      out.push({ key, evStageId: fz.evStageId || nextId(), name: en.name, family: en.family, periods: [periodOfDay(start, rules.periods)],
        days: 'all', vip: true, replacedBy: null, removed: '', resetGroup: '', campaign: { start, end }, banner: fz.banner || en.banner || '',
        weekOf: en.key, weekTitle: String(row.banner || '').trim(), ...(ri === 0 && start !== allWeeks[0] ? { clippedFrom: allWeeks[0] } : {}), questObjs: [{ ...tpl, ...fz.quest }], rewards, useAp: en.useAp, drops: en.drops || [] });
      });
    }
  }
  if (unknown.length) throw new Error(`special: weekly rewards not in the master (add rules.weekly.aliases): ${unknown.join('; ')}`);
  const stray = Object.keys(frozen).filter((k) => !seenKeys.has(k));
  if (stray.length) throw new Error(`special: rules.weekly.versions without a table row: ${stray.join(', ')}`);
  return out;
}

function build(rules, catalogue, masterRows) {
  const L = lookups(masterRows);
  const report = { stopgaps: [], titleFallbacks: [], weeklyLeftOut: [], weeklyAliased: [], weeklySkills: [] };
  // reference rows: last story row 1-525 of each world, then the last story row of all
  const story = (masterRows.stage || []).filter((r) => r.stageKind === 1 && r.stageId < 100000 && r.id <= 525).sort((a, b) => a.id - b.id);
  if (!story.length) throw new Error('special: no story rows in the stage table');
  const refByWorld = new Map(story.map((r) => [r.worldId, r]));
  const others = (masterRows.reward || []).filter((r) => !isOwnReward(r));
  if (others.some((r) => r.rewardId >= REWARD_FIRST)) throw new Error(`special: reward rows at or above ${REWARD_FIRST} that are not ours`);
  const medals = new Set((masterRows.medal || []).map((r) => r.medalId));
  const materials = new Set((masterRows.material || []).map((r) => r.materialId));

  const stageRows = [], rewardRows = [], entries = [];
  const stageRow = (stageId, q, useAp, rewards) => {
    const worldId = WIKI_WORLD[q.world];
    if (!worldId) throw new Error(`special: ${q.quest}: unknown world «${q.world}»`);
    const ref = refByWorld.get(worldId) || story[story.length - 1];
    const row = JSON.parse(JSON.stringify(ref));
    Object.assign(row, { stageId, stageBinId: stageId, id: stageId, name: q.quest, mapName: q.room, useAp,
      chapterId: Math.floor(stageId / 1000), worldId, onlyDrama: 0, stageKind: STAGE_KIND,
      validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [], afterDramaType: [],
      branchType: 0, disableContinue: 0, addLevel: 0, holdKeyblade: 0, validClearGetTitle: 0, clearGetTitle: 0,
      validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 0, clearGetItemType: [], clearGetItemId: [],
      clearGetAssignSkillType: [], clearGetAssignSkillId: [], clearGetAssignSkillLv: [], clearGetItemNum: [], resetSubMission: 0,
      combinedSubmissionFlag: 0, raidBoss: 0 }, subsOf(q.objectives, rewards, q.target, L, report, `${stageId} ${q.quest}`));
    stageRows.push(row);
    return { stageId, quest: q.quest, world: q.world, worldId, room: q.room, target: q.target, targetId: L.mapEnemyId(q.target, true),
      attribute: q.attribute || '', wikiLv: wikiLv({ lvl: q.level }), ...(q.mapEnemies ? { mapEnemies: q.mapEnemies } : {}) };
  };

  // training quest behind the catalogue banner
  const training = stageRow(TRAINING_STAGE, { quest: TRAINING.name, world: TRAINING.world, room: TRAINING.room, target: TRAINING.target,
    level: String(TRAINING.level), objectives: TRAINING.objectives }, 0, null);
  // objective rewards: Munny (type 4, item 0) x TRAINING_OBJECTIVE_MUNNY each
  Object.assign(stageRows[stageRows.length - 1], { submissionRewardType: [TRAINING_OBJECTIVE_REWARD_TYPE, TRAINING_OBJECTIVE_REWARD_TYPE, TRAINING_OBJECTIVE_REWARD_TYPE],
    submissionItemId: [0, 0, 0], submissionItemNum: Array(3).fill(TRAINING_OBJECTIVE_MUNNY) });
  // zero-reward target when the master has its row (TRAINING_TARGET_ID above): objectives and map count that id
  const trainingRow = stageRows[stageRows.length - 1];
  if ((masterRows.enemy || []).some((e) => e.enemyId === TRAINING_TARGET_ID && e.name === TRAINING.target)) {
    trainingRow.submissionId = trainingRow.submissionId.map((id) => (id ? TRAINING_TARGET_ID : 0));
    training.targetId = TRAINING_TARGET_ID;
  }
  training.normalEnemyId = TRAINING_SHADOW_ID;
  const enemyRows = [dummyRow(masterRows), trainingShadowRow(masterRows)];
  const maxGauge = Math.max(0, ...(masterRows.keyblade || []).map((k) => k.maxBurstGauge || 0));
  const cpChests = Math.max(1, Math.ceil(maxGauge * GAUGE_UNIT / CP_PER_CHEST));
  const evStageRows = [evStageRow(CATALOG_EV, [TRAINING_STAGE], { detailUrl: '/web/special/catalog' })];

  // a weeklyOnly entry (VIP! Skill, coordinator ruling 30-10: no fallback, the set is listed only in the weeks of its
  // table rows) is only the template of its week versions: no rows, not in the index; its id and key stay reserved
  const seenEv = new Set([CATALOG_EV]), seenKey = new Set();
  for (const en of rules.entries.filter((x) => x.weeklyOnly)) {
    if (!(en.evStageId > EV_FIRST && en.evStageId <= EV_LAST) || seenEv.has(en.evStageId)) throw new Error(`special: ${en.key}: evStageId ${en.evStageId} missing, out of range or repeated`);
    seenEv.add(en.evStageId); seenKey.add(en.key);
  }
  // campaigns (Task 12) and the weekly versions of the recurring VIP sets (round 17) after the entries: the ids of the
  // entries' stage and drop rows do not move
  for (const en of [...rules.entries.filter((x) => !x.weeklyOnly), ...campaignEntries(rules, catalogue), ...weeklyEntries(rules, catalogue, L, report)]) {
    if (!(en.evStageId > EV_FIRST && en.evStageId <= EV_LAST) || seenEv.has(en.evStageId)) throw new Error(`special: ${en.key}: evStageId ${en.evStageId} missing, out of range or repeated`);
    if (seenKey.has(en.key)) throw new Error(`special: key ${en.key} repeated`);
    seenEv.add(en.evStageId); seenKey.add(en.key);
    // en.objectives {quest name: three «text -> reward» lines}: reconstructed objectives for a catalogue quest without
    // any (Keyblade Materials: Divine Rose) or with a typo the objective codes cannot read
    const quests = en.questObjs || (en.quests ? en.quests.map((n) => catalogue.quests.find((q) => q.quest === n)).filter(Boolean)
      : catalogue.quests.filter((q) => (en.series || []).includes(q.series)))
      .map((q) => (en.objectives && en.objectives[q.quest] ? { ...q, objectives: en.objectives[q.quest] } : q));
    const stray = Object.keys(en.objectives || {}).filter((n) => !quests.some((q) => q.quest === n));
    if (stray.length) throw new Error(`special: ${en.key}: objectives for quests the entry does not pick: ${stray.join(', ')}`);
    if (!quests.length || (en.quests && quests.length !== en.quests.length)) throw new Error(`special: ${en.key}: quests not found in the catalogue`);
    const base = { key: en.key, evStageId: en.evStageId, name: en.name, family: en.family, periods: en.periods, days: en.days,
      vip: !!en.vip, replacedBy: en.replacedBy || null, removed: en.removed || '', campaign: en.campaign || null,
      resetGroup: en.resetGroup || '', banner: en.banner || '' };
    if (en.questObjs && !en.weekOf) Object.assign(base, { generic: en.generic, notice: en.notice });
    if (en.weekOf) Object.assign(base, { weekOf: en.weekOf, weekTitle: en.weekTitle }, en.clippedFrom ? { clippedFrom: en.clippedFrom } : {});
    // optional days that split a period (special.currentEntries checks them against the Shop week)
    if (en.from) base.from = en.from;
    if (en.to) base.to = en.to;
    // removed (no use in the 4.3.1 client, spec 6): listed in the catalogue page only, no rows
    if (base.removed) { entries.push({ ...base, stageIds: [], useAp: [], stages: [], dropRewardIds: [] }); continue; }
    if (quests.length > 5) throw new Error(`special: ${en.key}: ${quests.length} quests, at most 5 per banner`);
    const useAp = quests.map((q, i) => (q._ap !== undefined ? q._ap : en.useAp && en.useAp[i] !== undefined ? en.useAp[i] : en.useAp ? en.useAp[0] : apOf(q.ap)));
    // one reward row per distinct drop of the entry; campaign quests carry their own drops (q._drops)
    const own = new Map();
    const dropRow = (d) => {
      const k = `${d.type}:${d.id}:${d.num || 1}`;
      if (own.has(k)) return own.get(k);
      if ((d.type === 3 && !medals.has(d.id)) || (d.type === 5 && !materials.has(d.id)) || ![3, 5].includes(d.type)) {
        throw new Error(`special: ${en.key}: drop ${JSON.stringify(d)} not in the medal/material table`);
      }
      const rewardId = REWARD_FIRST + rewardRows.length;
      rewardRows.push({ rewardId, validReward: 1, display: [1], type: [d.type], id: [d.id], assignSkillType: [0], assignSkillId: [0],
        assignSkillLv: [0], num: [d.num || 1], odds: [10000] });
      own.set(k, rewardId);
      return rewardId;
    };
    const entryDropIds = (en.drops || []).map(dropRow);
    const stageDrops = quests.map((q) => (q._drops ? q._drops.map(dropRow) : entryDropIds));
    const dropRewardIds = [...new Set([...entryDropIds, ...stageDrops.flat()])];
    const stages = quests.map((q, i) => ({ ...stageRow(stageIdOf(en.evStageId, i), q, useAp[i], en.rewards), dropRewardIds: stageDrops[i] }));
    const stageIds = stages.map((s) => s.stageId);
    if (stageIds.some((id) => CLIENT_DROPPED.includes(id))) throw new Error(`special: ${en.key}: stage 95100/95200`);
    evStageRows.push(evStageRow(en.evStageId, stageIds, { resetFlag: base.resetGroup ? 1 : 0 }));
    entries.push({ ...base, stageIds, useAp, stages, dropRewardIds });
  }
  if (rewardRows.some((r) => r.rewardId >= CP_REWARD_ID)) throw new Error(`special: drop rows reach the CP chest row ${CP_REWARD_ID}`);
  rewardRows.push({ rewardId: CP_REWARD_ID, validReward: 1, display: [1], type: [8], id: [0], assignSkillType: [0], assignSkillId: [0],
    assignSkillLv: [0], num: [CP_PER_CHEST], odds: [10000] });
  const index = { catalog: { evStageId: CATALOG_EV, stageIds: [TRAINING_STAGE], useAp: [0], stages: [{ ...training, training: true }],
    dummyEnemyId: DUMMY_ENEMY_ID, rewardIds: [CP_REWARD_ID] }, entries };
  const maps = mapsOf(index, stageRows, rewardRows, masterRows, L);
  // training map (gen_story_maps.py build_training): path B with the dummy group and the CP chests
  Object.assign(maps.find((m) => m.stageId === TRAINING_STAGE), { training: true,
    dummy: [{ name: DUMMY_NAME, enemyId: DUMMY_ENEMY_ID, n: 1, reward: 1 }], chests: Array(cpChests).fill(CP_REWARD_ID) });
  return { stageRows, evStageRows, rewardRows, enemyRows, index, maps, report };
}

// stage list for gen_story_maps.py (header comment): one map part per stage
function mapsOf(index, stageRows, rewardRows, masterRows, L) {
  const enemyName = new Map((masterRows.enemy || []).map((e) => [e.enemyId, e.name]));
  const medalName = new Map((masterRows.medal || []).map((r) => [r.medalId, r.name]));
  const stages = [...index.catalog.stages, ...index.entries.flatMap((e) => e.stages)];
  return stages.map((s) => {
    const row = stageRows.find((r) => r.stageId === s.stageId);
    // reward of each enemy: the entry's drop rows round-robin; row 1 for an entry without drops and for training
    const rr = s.stageId === TRAINING_STAGE ? [] : s.dropRewardIds || [];
    let k = 0;
    const next = () => (rr.length ? rr[k++ % rr.length] : 1);
    const normal = () => Array.from({ length: TARGET_PER_GROUP }, () => ({ name: s.target, enemyId: s.normalEnemyId || L.mapEnemyId(s.target, false), n: 1, reward: next() }));
    const carriers = (s.dropRewardIds || []).map((rid) => {
      const rw = rewardRows.find((r) => r.rewardId === rid);
      const name = carrierOf(rw.type[0] === 3 ? medalName.get(rw.id[0]) : '');
      return { name, enemyId: L.mapEnemyId(name, false), n: 1, reward: rid };
    });
    // «Defeat X x N» / «Defeat the X within N turns» on an enemy that is not the target: X on the map with the objective id
    const extra = [];
    row.submissionId.forEach((id, i) => {
      if (row.submissionIdType[i] !== 1 || !id || id === s.targetId || extra.some((x) => x.enemyId === id)) return;
      const n = row.submissionRequire[i] === 4 ? Math.max(1, row.submissionNum[i]) : 1;
      for (let j = 0; j < n; j++) extra.push({ name: enemyName.get(id) || '', enemyId: id, n: 1, reward: next() });
    });
    const size = (g) => g.reduce((n, x) => n + x.n, 0);
    const total = TARGET_PER_GROUP * GROUPS_MIN + [...carriers, ...extra].reduce((n, x) => n + x.n, 0);
    const groups = s.mapEnemies ? s.mapEnemies.map((name) => [{ name, enemyId: L.mapEnemyId(name, false), n: 1, reward: next() }])
      : Array.from({ length: Math.max(GROUPS_MIN, Math.ceil(total / GROUP_MAX)) }, () => normal());
    // carriers and objective enemies spread over the groups (fewest enemies first)
    for (const x of [...carriers, ...extra]) {
      const fit = groups.filter((gr) => size(gr) + x.n <= GROUP_MAX).sort((a, b) => size(a) - size(b))[0];
      if (fit) fit.push(x); else groups.push([x]);
    }
    return { stageId: s.stageId, world: s.worldId, name: s.quest, room: s.room, target: s.target, targetId: s.targetId,
      targetReward: next(), level: s.wikiLv || 1, enemies: groups, treasures: [], rooms: 1 };
  });
}

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };

// appends the rows to the master tables (own rows of a previous run dropped first) and writes game_data/special.json
// Returns null (nothing written) with KHUX_SPECIAL=0 or without the private catalogue.
function patch(masterDir, opts = {}) {
  if (process.env.KHUX_SPECIAL === '0') { console.log('special: off (KHUX_SPECIAL=0)'); return null; }
  const t = (name, dflt = []) => readJson(path.join(masterDir, name + '.json'), dflt);
  const rules = opts.rules || JSON.parse(fs.readFileSync(path.join(__dirname, 'special_periods.json'), 'utf8'));
  const src = process.env.KHUX_SPECIAL_SRC || DEFAULT_SRC;
  let catalogue = opts.catalogue;
  if (!catalogue) {
    try { catalogue = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) {
      console.warn(`special: skipped, private catalogue ${src} not readable (${e.code || e.message}): no Special rows`);
      return null;
    }
  }
  const gameData = opts.gameDataDir || path.join(__dirname, 'game_data');
  const stage = t('stage').filter((r) => !isOwnStage(r));
  const evStage = t('evStage').filter((r) => !isOwnEv(r));
  // reward rows from 970000 up are ours only if the previous run listed them (special.json): anything else there (e.g. a
  // row make-game-tables.js made from the POI) would be overwritten silently, so it stops the run
  const prev = readJson(path.join(gameData, 'special.json'), { entries: [] });
  const prevOwn = new Set([...(prev.entries || []).flatMap((e) => e.dropRewardIds || []), ...((prev.catalog || {}).rewardIds || [])]);
  const allReward = t('reward');
  const foreign = allReward.filter((r) => r.rewardId >= REWARD_FIRST && !(isOwnReward(r) && prevOwn.has(r.rewardId)));
  if (foreign.length) throw new Error(`special: reward rows ${foreign.map((r) => r.rewardId).join(', ')} at or above ${REWARD_FIRST} are not ours`);
  const reward = allReward.filter((r) => !isOwnReward(r));
  // enemy row DUMMY_ENEMY_ID: ours when it is the training dummy of a previous run, otherwise foreign
  const allEnemy = t('enemy');
  const foreignEnemy = allEnemy.filter((r) => isOwnEnemy(r) && r.name !== (r.enemyId === DUMMY_ENEMY_ID ? DUMMY_NAME : TRAINING.target));
  if (foreignEnemy.length) throw new Error(`special: enemy row ${foreignEnemy[0].enemyId} («${foreignEnemy[0].name}») is not a training enemy`);
  const enemy = allEnemy.filter((r) => !isOwnEnemy(r));
  const out = build(rules, catalogue, { stage, reward, enemy, medal: t('medal'), material: t('material'), skill: t('skill'),
    title: t('title'), keyblade: t('keyblade'), avatarParts: t('avatarParts'), enemyAttack: t('enemyAttack') });
  fs.writeFileSync(path.join(masterDir, 'stage.json'), JSON.stringify([...stage, ...out.stageRows]));
  fs.writeFileSync(path.join(masterDir, 'evStage.json'), JSON.stringify([...evStage, ...out.evStageRows]));
  fs.writeFileSync(path.join(masterDir, 'reward.json'), JSON.stringify([...reward, ...out.rewardRows]));
  fs.writeFileSync(path.join(masterDir, 'enemy.json'), JSON.stringify([...enemy, ...out.enemyRows]));
  fs.mkdirSync(gameData, { recursive: true });
  fs.writeFileSync(path.join(gameData, 'special.json'), JSON.stringify(out.index, null, 1));
  fs.writeFileSync(path.join(gameData, 'special_maps.json'), JSON.stringify(out.maps, null, 1));
  console.log(`special: +${out.stageRows.length} stage (stageKind ${STAGE_KIND}), +${out.evStageRows.length} evStage, +${out.rewardRows.length} reward, `
    + `+${out.enemyRows.length} enemy (training); `
    + `${out.report.stopgaps.length} stopgap objectives, ${out.report.titleFallbacks.length} titles -> Avatar Coin x5`);
  return out;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { build, patch, weeksOf, weeklyLabel, runsOf, skillPart, WEEKLY_EV_FIRST, STAGE_KIND, TRAINING_STAGE, CATALOG_EV, DUMMY_ENEMY_ID, DUMMY_HP, TRAINING_SHADOW_ID, TRAINING_TARGET_ID, CP_REWARD_ID, apOf, splitObjective };
