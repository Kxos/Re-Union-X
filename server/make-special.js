#!/usr/bin/env node
// Master rows of the Special tab (Quests > Special, plan docs/superpowers/plans/2026-10-30-special-tab.md Task 3, spec
// docs/superpowers/specs/2026-10-30-special-tab-design.md sections 5-8). Inputs:
// - server/special_periods.json (versioned, ours): periods {n, name, from, to} and the entries (key, evStageId, quests
//   picked by catalogue `series` or `quest` name, family, periods, days, vip, replacedBy, removed, resetGroup, useAp?,
//   rewards? (objective rewards that replace the catalogue ones, e.g. the «(See table)» VIP quests), drops);
// - the private catalogue of the original Special quests (KHUX_SPECIAL_SRC, default
//   D:\Progetto_Restauro_KH_UX\private\events\special\special_quests.json; never copied into the repo): per quest world,
//   room, AP, level, target and the three objectives «text -> reward».
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
// - server/game_data/special.json: the index read by special.js / server.js (catalog + entries, Task 2 shape, plus the
//   map data Task 4 needs: world, room, target, level and drop rows per stage).
// Wired at the end of make-game-tables.js (after make-proud). After a run: raise the master revision.
//
//   node server/make-special.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');
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
// (Tasks 4 and 10). Objective rewards: no original row has a reward of type 0, so the smallest reward, 1 munny.
const TRAINING = { name: 'Training Grounds', world: 'Daybreak Town', room: 'Training Grounds', target: 'Shadow', level: 1,
  objectives: ['Defeat the target enemy -> Munny x1', 'Complete without having to continue -> Munny x1', 'Defeat Shadow x 1 -> Munny x1'] };
// a «Title x1» objective without a title name in the catalogue (MOG quests): Avatar Coin x5, like the other small
// objective rewards of the Special quests (builder's call)
const TITLE_FALLBACK = [14, 0, 5];

const num = (s) => parseInt(String(s || '').replace(/,/g, ''), 10) || 0;
// «12 / 20 / 30» -> 12 (tier I), «zero» -> 0
const apOf = (s) => (String(s).trim().toLowerCase() === 'zero' ? 0 : num(String(s).split('/')[0]));
const stageIdOf = (evStageId, i) => STAGE_FIRST + (evStageId - EV_FIRST) * 10 + i;
const isOwnStage = (r) => r.stageId >= STAGE_FIRST && r.stageId <= STAGE_LAST;
const isOwnEv = (r) => r.eventStageId >= EV_FIRST && r.eventStageId <= EV_LAST;
const isOwnReward = (r) => r.rewardId >= REWARD_FIRST && r.rewardId <= REWARD_LAST;

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
  return {
    enemyId, medalId, materialId, avatarPartId,
    titleId: (name) => ((m.title || []).find((r) => r.title === name) || {}).titleId || 0,
    keybladeId: (name) => ((m.keyblade || []).find((k) => k.name === name && !k.lv) || {}).keybladeId || 0,
    skillId: (name) => ((m.skill || []).find((s) => s.name === name) || {}).skillId || 0,
  };
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
  const ctx = { ...L, target: L.enemyId(target), targetName: target, header: null };
  const subs = objectives.slice(0, 3).map((s, i) => {
    const o = splitObjective(s);
    if (rewardsOverride && rewardsOverride[i]) Object.assign(o, splitObjective(`x -> ${rewardsOverride[i]}`), { text: o.text });
    let c = /^Defeat the target enemy$/i.test(o.text)
      // training: «Defeat the target enemy» has no original code; 12 on the target with a turn limit no battle reaches
      ? { name: 'Defeat the target enemy', req: 12, dt: 4, it: 1, id: ctx.target, n: 99 }
      : objectiveCodes(o.text, ctx);
    if (!c) { report.stopgaps.push([where, i + 1, o.text]); c = { name: o.text, req: 10, dt: 1, it: 0, id: 0, n: 0 }; }
    let rw = rewardOf(o, L);
    if (!rw && o.reward === 'Title') { report.titleFallbacks.push([where, i + 1]); rw = TITLE_FALLBACK; }
    if (!rw) throw new Error(`special: ${where} objective ${i + 1}: reward «${o.reward}» not found in the master`);
    return [c, rw];
  });
  const pad = (f) => [0, 1, 2].map((i) => (i < subs.length ? f(subs[i]) : 0));
  return { validSubmission: subs.length,
    submissionRequire: pad(([c]) => c.req), submissionName: [0, 1, 2].map((i) => (i < subs.length ? subs[i][0].name : '')),
    submissionDataType: pad(([c]) => c.dt), submissionIdType: pad(([c]) => c.it), submissionId: pad(([c]) => c.id),
    submissionNum: pad(([c]) => c.n), submissionRewardType: pad(([, r]) => r[0]), submissionItemId: pad(([, r]) => r[1]),
    submissionSkillType: [0, 0, 0], submissionSkillId: [0, 0, 0], submissionSkillLv: [0, 0, 0],
    submissionItemNum: pad(([, r]) => r[2]) };
}

function evStageRow(evStageId, stageIds, { resetFlag = 0, detailUrl = '' } = {}) {
  const row = { eventStageId: evStageId, parentEventStageId: 0, validStageId: stageIds.length, stageId: [...stageIds],
    validStageWidthId: 0, stageStartId: stageIds[0], stageEndId: stageIds[stageIds.length - 1], resetFlag, eventCategory: 1,
    eventType: 0, scoreMedalListId: 0, scoreStartReward: 0, scoreEndReward: 0, rankingId: 0,
    bannerUrl: `/web/special/img/${evStageId}.png`, mypageBanner: 0, detailUrl, startTime: START, endTime: END,
    endDispTime: END, boardEndTime: END };
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) row[`week${d}`] = 1;
  row.benefitId = 0;
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) row[`benefit${d}`] = 0;
  return Object.assign(row, { groupPattern: 0, validMinute: 0 });
}

function build(rules, catalogue, masterRows) {
  const L = lookups(masterRows);
  const report = { stopgaps: [], titleFallbacks: [] };
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
      combinedSubmissionFlag: 0 }, subsOf(q.objectives, rewards, q.target, L, report, `${stageId} ${q.quest}`));
    stageRows.push(row);
    return { stageId, quest: q.quest, world: q.world, worldId, room: q.room, target: q.target, targetId: L.enemyId(q.target),
      attribute: q.attribute || '', wikiLv: wikiLv({ lvl: q.level }) };
  };

  // training quest behind the catalogue banner
  const training = stageRow(TRAINING_STAGE, { quest: TRAINING.name, world: TRAINING.world, room: TRAINING.room, target: TRAINING.target,
    level: String(TRAINING.level), objectives: TRAINING.objectives }, 0, null);
  const evStageRows = [evStageRow(CATALOG_EV, [TRAINING_STAGE], { detailUrl: '/web/special/catalog' })];

  const seenEv = new Set([CATALOG_EV]), seenKey = new Set();
  for (const en of rules.entries) {
    if (!(en.evStageId > EV_FIRST && en.evStageId <= EV_LAST) || seenEv.has(en.evStageId)) throw new Error(`special: ${en.key}: evStageId ${en.evStageId} missing, out of range or repeated`);
    if (seenKey.has(en.key)) throw new Error(`special: key ${en.key} repeated`);
    seenEv.add(en.evStageId); seenKey.add(en.key);
    const quests = en.quests ? en.quests.map((n) => catalogue.quests.find((q) => q.quest === n)).filter(Boolean)
      : catalogue.quests.filter((q) => (en.series || []).includes(q.series));
    if (!quests.length || (en.quests && quests.length !== en.quests.length)) throw new Error(`special: ${en.key}: quests not found in the catalogue`);
    const base = { key: en.key, evStageId: en.evStageId, name: en.name, family: en.family, periods: en.periods, days: en.days,
      vip: !!en.vip, replacedBy: en.replacedBy || null, removed: en.removed || '', campaign: en.campaign || null,
      resetGroup: en.resetGroup || '' };
    // removed (no use in the 4.3.1 client, spec 6): listed in the catalogue page only, no rows
    if (base.removed) { entries.push({ ...base, stageIds: [], useAp: [], stages: [], dropRewardIds: [] }); continue; }
    if (quests.length > 5) throw new Error(`special: ${en.key}: ${quests.length} quests, at most 5 per banner`);
    const useAp = quests.map((q, i) => (en.useAp && en.useAp[i] !== undefined ? en.useAp[i] : en.useAp ? en.useAp[0] : apOf(q.ap)));
    const dropRewardIds = (en.drops || []).map((d) => {
      if ((d.type === 3 && !medals.has(d.id)) || (d.type === 5 && !materials.has(d.id)) || ![3, 5].includes(d.type)) {
        throw new Error(`special: ${en.key}: drop ${JSON.stringify(d)} not in the medal/material table`);
      }
      const rewardId = REWARD_FIRST + rewardRows.length;
      rewardRows.push({ rewardId, validReward: 1, display: [1], type: [d.type], id: [d.id], assignSkillType: [0], assignSkillId: [0],
        assignSkillLv: [0], num: [d.num || 1], odds: [10000] });
      return rewardId;
    });
    const stages = quests.map((q, i) => ({ ...stageRow(stageIdOf(en.evStageId, i), q, useAp[i], en.rewards), dropRewardIds }));
    const stageIds = stages.map((s) => s.stageId);
    if (stageIds.some((id) => CLIENT_DROPPED.includes(id))) throw new Error(`special: ${en.key}: stage 95100/95200`);
    evStageRows.push(evStageRow(en.evStageId, stageIds, { resetFlag: base.resetGroup ? 1 : 0 }));
    entries.push({ ...base, stageIds, useAp, stages, dropRewardIds });
  }
  const index = { catalog: { evStageId: CATALOG_EV, stageIds: [TRAINING_STAGE], useAp: [0], stages: [{ ...training, training: true }] }, entries };
  return { stageRows, evStageRows, rewardRows, index, report };
}

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };

// appends the rows to the master tables (own rows of a previous run dropped first) and writes game_data/special.json
function patch(masterDir, opts = {}) {
  const t = (name, dflt = []) => readJson(path.join(masterDir, name + '.json'), dflt);
  const rules = opts.rules || JSON.parse(fs.readFileSync(path.join(__dirname, 'special_periods.json'), 'utf8'));
  const src = process.env.KHUX_SPECIAL_SRC || DEFAULT_SRC;
  let catalogue = opts.catalogue;
  if (!catalogue) {
    try { catalogue = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { throw new Error(`special: required source ${src}: ${e.message}`); }
  }
  const stage = t('stage').filter((r) => !isOwnStage(r));
  const evStage = t('evStage').filter((r) => !isOwnEv(r));
  const reward = t('reward').filter((r) => !isOwnReward(r));
  const out = build(rules, catalogue, { stage, reward, enemy: t('enemy'), medal: t('medal'), material: t('material'), skill: t('skill'),
    title: t('title'), keyblade: t('keyblade'), avatarParts: t('avatarParts') });
  fs.writeFileSync(path.join(masterDir, 'stage.json'), JSON.stringify([...stage, ...out.stageRows]));
  fs.writeFileSync(path.join(masterDir, 'evStage.json'), JSON.stringify([...evStage, ...out.evStageRows]));
  fs.writeFileSync(path.join(masterDir, 'reward.json'), JSON.stringify([...reward, ...out.rewardRows]));
  const gameData = opts.gameDataDir || path.join(__dirname, 'game_data');
  fs.mkdirSync(gameData, { recursive: true });
  fs.writeFileSync(path.join(gameData, 'special.json'), JSON.stringify(out.index, null, 1));
  console.log(`special: +${out.stageRows.length} stage (stageKind ${STAGE_KIND}), +${out.evStageRows.length} evStage, +${out.rewardRows.length} reward; `
    + `${out.report.stopgaps.length} stopgap objectives, ${out.report.titleFallbacks.length} titles -> Avatar Coin x5`);
  return out;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { build, patch, STAGE_KIND, TRAINING_STAGE, CATALOG_EV, apOf, splitObjective };
