#!/usr/bin/env node
// Master rows and index of the event quests (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md
// Task 3, spec docs/superpowers/specs/2026-11-06-events-design.md, client facts docs/notes/events.md). Same shape as make-raid.js.
// Inputs:
// - server/event_config.json (versioned, ours): id bases, eventCategory / eventType of our rows, serve {censusIds, types} (what is built; Part 2: GEM), reasonText (why a record or quest is not built),
//   labelPhrases (reconstruction notes of the records -> label id) and reconstructedWhy (the text of every label);
// - the event quest records (private, path in KHUX_EVENT_SRC: a file or a folder of *.json, readRecords; never copied into the repo): [{censusId, name, start, end, type,
//   notices, evStage: [donor rows], quests: [{stageId, name, worldId, room, level, ap, addLevel, targets, objectives, combined,
//   firstClear, drops, enemies: [{id, level, label, ...}], restrictions, drama, map: {key, stageBinId, status}, window, label}]}].
// Rules:
// - one evStage row per record: eventCategory of the config (2, proven by the raids); eventType = the donor's (origEventType, 1 or 3
//   in the pilot), the config eventType (1) when the donor rows have none or disagree. Never 2: on the client eventType 2 is the
//   raid mode and adds the «Raid Boards» button to the quest list, which original non-raid events never had (bench 07-11,
//   reference/event_quest_screen); the value is written in the entry (eventType) for /stage/event. stageId capped at EVSTAGE_MAX_STAGES with the range (make-raid evStageRow);
// - one stage row per served quest: copy of a story row of the quest's world (make-raid storyRefs), stageKind 2, the record's
//   cost, restrictions and objectives, stageBinId = the record's map key (the client loads mappoi_stg<stageBinId>), raidBoss 0,
//   no first-clear item unless the record has one, scenes off (label dramaOff: their files are not checked yet);
// - enemies are never substituted: a quest with an enemy (enemies, targets, an objective on an enemy id) not in the master
//   `enemy` table is not built, and stays listed in the entry as «not served yet» with the ids; a rerun builds it once the
//   enemy lands. A record with no served quest has no evStage row (entry available false);
// - a record whose quest is a raid or Special stage (our ranges 970000-989999, a stageKind 2 row of the master on the same map
//   key, an Eggcognito target) is skipped with a reason: make-raid / make-special serve it;
// - short windows (a donor evStage row under shortWindowHours) open for their whole original Pacific day: entry `days`, label wholeDay.
// Ids come from server/event_ids.json (versioned, append-only, as raid_ids.json): rows {censusId: r}, entries
// {"<censusId>/+<offset of its donor stage id from the record's anchor>": n}, checks {censusId: {keys, hash}}; evStage = evStageBase + r,
// stage = stageBase + n. The anchor (a donor stage id per record, frozen at its first numbering) lives in the private sidecar
// event_anchors.json next to the records (KHUX_EVENT_SRC folder), never in the repo. Every record read is numbered, whatever the
// filter says; a record that disappears keeps its numbers; a repeated number, a numbered record without anchor or a record whose
// keys no longer cover its stored ones stops the run.
// Output (own rows dropped first, the previous run's list is events.json `own`; anything else in our ranges stops the run):
// stage, evStage (with the Event Catalog banner catalogEvStage, Task 5); game_data/events.json {entries, reasons, catalog?, own};
// game_data/event_maps.json (every candidate stage, for recon/tools/import_event_stages.py: the original JP maps), reward rows of the
// served maps (original drops) and their POI merged into game_data/stage_poi.json (map import report: MAPS_DIR, see loadMaps). An event row has detailUrl /web/event/notice/<evStageId> when its record names a notice.
// Wired in make-game-tables.js after make-raid. KHUX_EVENTS=0 turns it off; without KHUX_EVENT_SRC it warns and writes nothing.
//
//   node server/make-events.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { evStageRow, storyRefs } = require('./make-raid');

const STAGE_KIND = 2;
// raid and Special stage ids (make-special.js 970000-979999, make-raid.js 980000-989999) and the raid target Eggcognito
const RAID_SPECIAL = [970000, 989999], EGGCOGNITO = 100;
const NOT_SERVED = 'not served yet';
// labels this generator sets (the record labels come through labelPhrases)
const GENERATED_LABELS = ['wholeDay', 'dramaOff', 'eventCoins', 'wwEnemy'];
// reason of a record or quest not built (Events Part 2): text in event_config.json reasonText
const REASONS = ['shared', 'board', 'coin', 'undated', 'wikiEmpty', 'rewardItemMissing', 'notSelected'];
const COIN_TYPE = 15;
const DAY = 86400000;
const PT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const ptDate = (ms) => PT_DATE.format(new Date(ms));
// donor times are UTC («2019-04-01 07:00:00» = midnight Pacific in summer)
const utcMs = (t) => {
  const ms = Date.parse(`${String(t).trim().replace(' ', 'T')}Z`);
  if (!Number.isFinite(ms)) throw new Error(`events: time «${t}» not understood`);
  return ms;
};
// Pacific days a window touches, first to last
function daysOf([from, to]) {
  const out = [], a = ptDate(utcMs(from)), b = ptDate(utcMs(to));
  for (let d = Date.parse(`${a}T12:00:00Z`); ; d += DAY) {
    const day = new Date(d).toISOString().slice(0, 10);
    out.push(day);
    if (day >= b) break;
  }
  return out;
}
const isShort = ([from, to], hours) => utcMs(to) - utcMs(from) < hours * 3600000;

// Label ids of a record label («original; enemies missing: 2; donor kept; wiki is the 2018 run»): every phrase of labelPhrases;
// «original» and «enemies missing: N» (the master check decides that) carry none; anything else stops the run.
function labelIds(text, phrases) {
  let rest = String(text || '');
  const out = [];
  for (const p of Object.keys(phrases || {}).sort((a, b) => b.length - a.length)) {
    if (rest.includes(p)) { out.push(phrases[p]); rest = rest.split(p).join(';'); }
  }
  const left = rest.replace(/\boriginal\b/g, ';').replace(/enemies missing: \d+/g, ';').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (left.length) throw new Error(`events: quest label «${left.join('; ')}» has no labelPhrases entry in event_config.json`);
  return out;
}

function checkNumbers(map, what, max) {
  const seen = new Map();
  for (const [k, v] of Object.entries(map)) {
    if (!Number.isInteger(v) || v < 1 || v > max) throw new Error(`events: event_ids.json: ${what} ${k} has number ${v}, outside 1-${max}`);
    if (seen.has(v)) throw new Error(`events: event_ids.json: ${what} number ${v} repeats (${seen.get(v)}, ${k})`);
    seen.set(v, k);
  }
}
// Key of a quest in event_ids.json: its offset from the record's ANCHOR, a donor stage id frozen on the record's first numbering
// in the private sidecar event_anchors.json (next to the records, never in the repo): «EV-0001/+3», «/-2» for a quest below
// the anchor. The public file holds no donor stage id (docs/notes/events.md: per-stage ids stay private), and a quest added or
// removed later never shifts the other keys. A quest with no donor stage id: «/w<position>».
const hasStage = (q) => Number.isInteger(q.stageId);
function questKey(rec, q, anchor) {
  if (!hasStage(q)) return `${rec.censusId}/w${(rec.quests || []).indexOf(q) + 1}`;
  const d = q.stageId - anchor;
  return `${rec.censusId}/${d < 0 ? '-' : '+'}${Math.abs(d)}`;
}
// event_ids.json `checks`: per census row the number of keys and a hash of the sorted keys (offsets only, no donor id)
const keysHash = (keys) => crypto.createHash('sha256').update([...keys].sort().join('\n')).digest('hex').slice(0, 12);
// Copy of ids with a number for every record and quest read (append-only), and the anchors with the new records' added.
// Stops when a numbered record has no anchor (sidecar lost: re-anchoring could hand old numbers to other quests) or when the
// keys of a numbered record no longer include every stored key (anchor changed, or a quest gone from the record).
function allocateIds(records, ids, config, anchors = {}) {
  const out = { ...(ids || {}), rows: { ...((ids || {}).rows || {}) }, entries: { ...((ids || {}).entries || {}) }, checks: { ...((ids || {}).checks || {}) } };
  const outAnchors = { ...(anchors || {}) };
  const maxRow = config.evStageMax - config.evStageBase, maxEntry = config.stageMax - config.stageBase;
  checkNumbers(out.rows, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  let nextRow = Math.max(0, ...Object.values(out.rows)) + 1, nextEntry = Math.max(0, ...Object.values(out.entries)) + 1;
  for (const rec of records) {
    if (!rec.censusId) throw new Error('events: a record has no censusId');
    const prefix = `${rec.censusId}/`;
    const stored = Object.keys(out.entries).filter((k) => k.startsWith(prefix));
    const donorIds = (rec.quests || []).filter(hasStage).map((q) => q.stageId);
    if (!(rec.censusId in outAnchors) && donorIds.length) {
      if (stored.some((k) => !/\/w\d+$/.test(k))) {
        throw new Error(`events: ${rec.censusId} has keys in event_ids.json but no anchor in event_anchors.json (the private sidecar next to the records `
          + 'was lost or moved): restore it; re-anchoring would give old stage ids to other quests');
      }
      outAnchors[rec.censusId] = Math.min(...donorIds);
    }
    if (!(rec.censusId in out.rows)) out.rows[rec.censusId] = nextRow++;
    const keys = new Set();
    for (const q of rec.quests || []) {
      const key = questKey(rec, q, outAnchors[rec.censusId]);
      if (keys.has(key)) throw new Error(`events: two quests give the key ${key}`);
      keys.add(key);
    }
    const lost = stored.filter((k) => !keys.has(k));
    if (lost.length) {
      throw new Error(`events: ${rec.censusId}: the stored keys ${lost.slice(0, 5).join(', ')}${lost.length > 5 ? ' ...' : ''} are not given by the record any more `
        + '(anchor in event_anchors.json changed, or a quest removed): check the sidecar and the record before numbering');
    }
    for (const key of keys) if (!(key in out.entries)) out.entries[key] = nextEntry++;
    out.checks[rec.censusId] = { keys: keys.size, hash: keysHash(keys) };
  }
  checkNumbers(out.rows, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  return { ids: out, anchors: outAnchors };
}

function checkRanges(master, config) {
  const ranges = { evStage: ['eventStageId', config.evStageBase, config.evStageMax], stage: ['stageId', config.stageBase, config.stageMax] };
  for (const [table, [key, lo, hi]] of Object.entries(ranges)) {
    const hit = (master[table] || []).find((r) => r[key] >= lo && r[key] <= hi);
    if (hit) throw new Error(`events: ${table} row ${hit[key]} is inside our id range ${lo}-${hi} and is not ours`);
  }
}

const mapKeyOf = (q) => {
  const m = q.map || {};
  return m.key || m.stageBinId || q.stageId;
};
// Enemy ids a quest needs: its enemies, targets and the enemy of an objective on an enemy id (idType 1)
const enemyIdsOf = (q) => [...new Set([...(q.enemies || []).map((e) => e.id), ...(q.targets || []).map((t) => t.id),
  ...(q.objectives || []).filter((o) => o.idType === 1).map((o) => o.id)])];

// Objectives of the record, in the submission field layout of the stage table
function questSubs(q, where) {
  const list = q.objectives || [];
  if (list.length > 3) throw new Error(`events: ${where}: ${list.length} objectives`);
  const each = (f) => list.map(f);
  const rw = (o) => o.reward || {};
  return { validSubmission: list.length, submissionRequire: each((o) => o.code), submissionName: each((o) => o.text), submissionDataType: each((o) => o.dataType),
    submissionIdType: each((o) => o.idType), submissionId: each((o) => o.id), submissionNum: each((o) => o.num), submissionRewardType: each((o) => rw(o).type || 0),
    submissionItemId: each((o) => rw(o).id || 0), submissionSkillType: each(() => 0), submissionSkillId: each(() => 0), submissionSkillLv: each(() => 0),
    submissionItemNum: each((o) => rw(o).num || 0) };
}
function firstClearOf(q) {
  const list = q.firstClear || [];
  const each = (f) => list.map(f);
  return { validClearGetItem: list.length, clearGetItemType: each((x) => x.type), clearGetItemId: each((x) => x.id || 0), clearGetAssignSkillType: each(() => 1),
    clearGetAssignSkillId: each(() => 0), clearGetAssignSkillLv: each(() => 1), clearGetItemNum: each((x) => x.num || 1) };
}

// Map enemy swaps (event_config.json mapEnemySwaps {mapKey: [{from, to}]}, user ruling 06-11: the WW enemy where the JP map
// differs from the WW quest): a copy of the quest with the enemy id replaced in its enemies, targets, objectives on an enemy id
// and drops, the name from the master; recon/tools/import_event_stages.py patches the same ids in the map file. Label wwEnemy.
function swapEnemies(q, swaps, names) {
  if (!swaps || !swaps.length) return null;
  const to = new Map(swaps.map((w) => [w.from, w.to]));
  const id = (x) => (to.has(x) ? to.get(x) : x);
  const c = JSON.parse(JSON.stringify(q));
  c.enemies = (c.enemies || []).map((e) => (to.has(e.id) ? { ...e, id: id(e.id), name: names.get(id(e.id)) || e.name } : e));
  c.targets = (c.targets || []).map((t) => (to.has(t.id) ? { ...t, id: id(t.id), name: names.get(id(t.id)) || t.name } : t));
  c.objectives = (c.objectives || []).map((o) => (o.idType === 1 ? { ...o, id: id(o.id) } : o));
  if (c.drops) c.drops.enemies = (c.drops.enemies || []).map((d) => ({ ...d, enemy: id(d.enemy) }));
  return c;
}
// reward ids of a map POI (stage_poi.py format)
const poiRewards = (poi) => [...new Set([...(poi.enemies || []).map((e) => e.reward), ...(poi.chests || []).map((c) => c.reward)])].sort((a, b) => a - b);
// original drop rows of a quest (record drops: enemies [{rewardId, rows}], chests [{reward, rows}]) -> {rewardId: rows}
function dropRows(q) {
  const out = new Map();
  const add = (id, rows) => {
    if (!id || !rows || !rows.length) return;
    const key = JSON.stringify(rows.map((r) => [r.type, r.id || 0, r.num, r.odds]));
    if (out.has(id) && out.get(id).key !== key) out.set(id, { conflict: true, key });
    else if (!out.has(id)) out.set(id, { rows, key });
  };
  for (const e of (q.drops || {}).enemies || []) add(e.rewardId, e.rows);
  for (const c of (q.drops || {}).chests || []) add(c.reward, c.rows);
  return out;
}
// a reward row of the master layout (as rewardRow of make-game-tables.js) with the original contents and odds
const rewardRowOf = (rewardId, rows) => ({ rewardId, validReward: rows.length, display: rows.map(() => 1), type: rows.map((r) => r.type), id: rows.map((r) => r.id || 0),
  assignSkillType: rows.map(() => 0), assignSkillId: rows.map(() => 0), assignSkillLv: rows.map(() => 0), num: rows.map((r) => r.num), odds: rows.map((r) => r.odds) });

// Serve selection: config.serve {censusIds, types} (a record is built when its id or its type is listed); the old onlyCensusIds
// (ids only) still works. Neither: every record.
function selector(config) {
  if (config.serve) {
    const ids = new Set(config.serve.censusIds || []), types = new Set(config.serve.types || []);
    return (rec) => ids.has(rec.censusId) || types.has(rec.type);
  }
  if (Array.isArray(config.onlyCensusIds)) { const ids = new Set(config.onlyCensusIds); return (rec) => ids.has(rec.censusId); }
  return () => true;
}

// Reward items (Part 2): the donor master numbers medals differently from ours. A medal whose id is not in our medal master is
// resolved by name: «Name N★» -> our row named Name with rarity N (one match; on a tie the row whose medalId == imageId); the served
// reward uses our id. A gem material must be in the material table. Without master.medal / master.material (unit fixtures of
// Part 1) nothing is checked.
function itemResolver(master) {
  if (!master.medal && !master.material) return null;
  const medalIds = new Set((master.medal || []).map((m) => m.medalId)), materialIds = new Set((master.material || []).map((m) => m.materialId));
  const byName = new Map();
  for (const m of master.medal || []) {
    const k = `${m.name}|${m.rare}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(m);
  }
  const medal = (d) => {
    if (medalIds.has(d.id)) return d.id;
    const mt = /^(.*) (\d+)★$/.exec(String(d.name || ''));
    if (!mt) return null;
    let rows = byName.get(`${mt[1]}|${mt[2]}`) || [];
    if (rows.length > 1) rows = rows.filter((m) => m.medalId === m.imageId);
    return rows.length === 1 ? rows[0].medalId : null;
  };
  return (d, missing) => {
    if (!d || (d.type !== 3 && d.type !== 5)) return d;
    let id = d.id;
    if (d.type === 3 && master.medal) id = medal(d);
    else if (d.type === 5 && master.material) id = materialIds.has(d.id) ? d.id : null;
    if (id === null) { missing.push(`type ${d.type} id ${d.id}${d.name ? ` (${d.name})` : ''}`); return d; }
    return id === d.id ? d : { ...d, id };
  };
}
// copy of the quest with our item ids in its first-clear items, objective rewards and drop rows
function remapItems(q, resolve) {
  const missing = [];
  const c = JSON.parse(JSON.stringify(q));
  c.firstClear = (c.firstClear || []).map((x) => resolve(x, missing));
  c.objectives = (c.objectives || []).map((o) => (o.reward ? { ...o, reward: resolve(o.reward, missing) } : o));
  if (c.drops) {
    c.drops.enemies = (c.drops.enemies || []).map((e) => ({ ...e, rows: (e.rows || []).map((r) => resolve(r, missing)) }));
    c.drops.chests = (c.drops.chests || []).map((e) => ({ ...e, rows: (e.rows || []).map((r) => resolve(r, missing)) }));
  }
  return { q: c, missing: [...new Set(missing)] };
}

// records, config (event_config.json), master {stage, evStage, enemy, reward?} without our own rows, ids (event_ids.json), anchors,
// maps (null: no map check, unit tests; else {status: Map(mapKey -> {status, why}), poi: {mapKey: poi}} of import_event_stages.py)
// -> {evStage, stage, reward, poi, maps, ids, index: {entries, reasons}}
function buildEvents(records, config, master, ids, anchors = {}, maps = null) {
  checkRanges(master, config);
  const { ids: allIds, anchors: allAnchors } = allocateIds(records, ids, config, anchors);
  const enemies = new Set((master.enemy || []).map((e) => e.enemyId));
  const names = new Map((master.enemy || []).map((e) => [e.enemyId, e.name]));
  const masterRewards = new Set((master.reward || []).map((r) => r.rewardId));
  const ownRewards = new Map(); // rewardId -> {row, key} written by this run
  const refs = storyRefs(master.stage);
  if (!refs.story.length) throw new Error('events: no story rows in the stage table');
  // map key -> a stage row of the master that loads it (stageBinId, or its own id when the bin is 0)
  const byMap = new Map();
  for (const s of master.stage || []) byMap.set(s.stageBinId || s.stageId, s);
  const selected = selector(config);
  const resolveItem = itemResolver(master);
  const reasonText = config.reasonText || {};
  const textOf = (r) => { if (!reasonText[r]) throw new Error(`events: reason ${r} has no reasonText in event_config.json`); return reasonText[r]; };
  const out = { evStage: [], stage: [], reward: [], poi: {}, maps: [], ids: allIds, anchors: allAnchors, skipped: [], index: { entries: [], reasons: {} } };
  const used = new Set();
  const builtMaps = new Map(); // map key -> our stage id built on it in this run

  for (const rec of records) {
    if (!selected(rec)) { out.skipped.push({ censusId: rec.censusId, reason: 'notSelected' }); continue; }
    const evStageId = config.evStageBase + allIds.rows[rec.censusId];
    const donorTypes = [...new Set((rec.evStage || []).map((r) => r.eventType))];
    const entry = { censusId: rec.censusId, evStageId, name: rec.name, type: rec.type, start: rec.start, end: rec.end, stageIds: [], useAp: null, label: 'original', labels: [],
      noticeIds: rec.notices || [], banner: `/web/event/img/v${config.imgVersion}/${evStageId}.png`, origEventType: donorTypes.length === 1 ? donorTypes[0] : donorTypes,
      eventType: donorTypes.length === 1 && Number.isInteger(donorTypes[0]) && donorTypes[0] !== 2 ? donorTypes[0] : config.eventType,
      available: false, why: null, quests: [] };
    if (rec.sharedWith) entry.sharedWith = rec.sharedWith;
    if (rec.noQuests) entry.noQuests = rec.noQuests;
    // a record that builds no quest of its own: noQuests (board, coin, undated), a shared notice (built with the other row), no date
    const noBuild = rec.noQuests || (rec.sharedWith ? 'shared' : (!rec.start ? 'undated' : null));
    if (noBuild) {
      entry.reason = noBuild;
      entry.why = textOf(noBuild);
      out.index.entries.push(entry);
      continue;
    }
    const labels = new Set();
    // short windows of the donor rows: open the whole Pacific day
    const shortDays = new Set();
    for (const r of rec.evStage || []) {
      if (r.startTime && r.endTime && isShort([r.startTime, r.endTime], config.shortWindowHours)) daysOf([r.startTime, r.endTime]).forEach((d) => shortDays.add(d));
    }
    if (shortDays.size) { entry.days = [...shortDays].sort(); labels.add('wholeDay'); }

    // a raid or Special quest: the whole record is left to make-raid / make-special
    const raidish = (rec.quests || []).map((q) => {
      for (const k of [q.stageId, mapKeyOf(q)]) {
        if (k >= RAID_SPECIAL[0] && k <= RAID_SPECIAL[1]) return `stage ${k}`;
        const s = byMap.get(k);
        if (s && s.stageKind === STAGE_KIND) return `stage ${s.stageId}`;
      }
      return enemyIdsOf(q).includes(EGGCOGNITO) ? `quest ${q.stageId} (Eggcognito)` : null;
    }).find(Boolean);

    let apMin = null;
    for (const q0 of rec.quests || []) {
      const key = questKey(rec, q0, allAnchors[rec.censusId]), stageId = config.stageBase + allIds.entries[key], mapKey = mapKeyOf(q0);
      const qLabels = labelIds(q0.label, config.labelPhrases);
      const swapped = swapEnemies(q0, (config.mapEnemySwaps || {})[String(mapKey)], names);
      if (swapped) qLabels.push('wwEnemy');
      let q = swapped || q0;
      const wiki = qLabels.includes('wikiQuest');
      const item = { key, donorStageId: q.stageId, stageId, name: q.displayName || q.name, ap: q.ap, level: q.level, window: q.window || null, served: false, status: NOT_SERVED,
        why: null, labels: qLabels, mapKey, mapStatus: (q.map || {}).status || null };
      if (q.window && isShort(q.window, config.shortWindowHours)) item.days = daysOf(q.window);
      entry.quests.push(item);
      qLabels.forEach((l) => used.add(l));
      if (raidish) { item.why = 'raid or Special quest'; continue; }
      // a quest rebuilt from the wiki page only: with no map key or no enemy id there is nothing to build
      if (wiki && (!Number.isInteger(mapKey) || !(q.enemies || []).some((e) => Number.isInteger(e.id)))) { item.reason = 'wikiEmpty'; item.why = textOf('wikiEmpty'); continue; }
      const missing = enemyIdsOf(q).filter((id) => Number.isInteger(id) && !enemies.has(id));
      if (missing.length) { item.why = `enemies not in the master: ${missing.join(', ')}`; continue; }
      if (resolveItem) {
        const r = remapItems(q, resolveItem);
        if (r.missing.length) { item.reason = 'rewardItemMissing'; item.why = `${textOf('rewardItemMissing')} (${r.missing.join('; ')})`; continue; }
        q = r.q;
      }
      const clash = byMap.get(mapKey);
      if (clash) { item.why = `map key ${mapKey} is the map of stage ${clash.stageId}`; continue; }
      if (builtMaps.has(mapKey)) { item.why = `map key ${mapKey} is the map of event stage ${builtMaps.get(mapKey)} too`; continue; }
      builtMaps.set(mapKey, stageId);
      // every candidate goes into event_maps.json (the list import_event_stages.py imports), served or not
      const mapItem = { stageId, key: mapKey, mapStatus: item.mapStatus, censusId: rec.censusId, world: q.worldId, name: q.name, rooms: q.room || [], level: q.level, addLevel: q.addLevel || 0,
        targets: (q.targets || []).map((t) => t.id), enemies: (q.enemies || []).map((e) => ({ name: e.name, enemyId: e.id, level: e.level, n: e.count, reward: e.reward, rooms: e.rooms || [], target: !!e.target })),
        drops: q.drops || null, served: false };
      out.maps.push(mapItem);
      let newRewards = [];
      if (maps) {
        // the original map file (recon/tools/import_event_stages.py report): not imported -> not served
        const st = maps.status.get(mapKey);
        if (!st || st.status !== 'imported') { item.why = mapItem.why = `map not usable: ${st ? `${st.status}, ${st.why}` : 'not imported (recon/tools/import_event_stages.py)'}`; continue; }
        // reward rows of the map's enemies and chests: the master's, or the original rows of the record's drops (written here); else not served
        const known = dropRows(q), missing = [];
        for (const r of poiRewards(maps.poi[String(mapKey)] || {})) {
          if (masterRewards.has(r)) continue;
          const d = known.get(r);
          if (!d || d.conflict) { missing.push(r); continue; }
          const own = ownRewards.get(r);
          if (own && own.key !== d.key) { missing.push(r); continue; }
          if (!own) newRewards.push([r, d]);
        }
        if (missing.length) { item.why = mapItem.why = `reward rows missing: ${missing.join(', ')}`; continue; }
        for (const [r, d] of newRewards) { const row = rewardRowOf(r, d.rows); ownRewards.set(r, { row, key: d.key }); out.reward.push(row); }
        out.poi[String(mapKey)] = maps.poi[String(mapKey)];
      }
      mapItem.served = true;

      const r = q.restrictions || {}, d = q.drama || {};
      const ref = refs.of(q.worldId);
      const room = (q.room || [])[0] || {};
      out.stage.push({ ...JSON.parse(JSON.stringify(ref)), stageId, stageBinId: mapKey, id: stageId, name: q.name, mapName: room.name || ref.mapName, useAp: q.ap,
        chapterId: Math.floor(stageId / 1000), worldId: q.worldId, onlyDrama: 0, stageKind: STAGE_KIND, noPartner: r.noPartner || 0,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [], afterDramaType: [], branchType: 0,
        disableContinue: r.disableContinue || 0, addLevel: q.addLevel || 0, holdKeyblade: r.holdKeyblade || 0, hardmodeRequire: r.hardmodeRequire || 0,
        hardmodeName: r.hardmodeName || 'strDummy', hardmodeComparison: r.hardmodeComparison === undefined ? 1 : r.hardmodeComparison, hardmodeNum: r.hardmodeNum || 0,
        validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, ...firstClearOf(q), resetSubMission: 0,
        ...questSubs(q, key), combinedSubmissionFlag: q.combined ? 1 : 0, raidBoss: 0 });
      item.served = true; item.status = 'served';
      entry.stageIds.push(stageId);
      apMin = apMin === null ? q.ap : Math.min(apMin, q.ap);
      qLabels.forEach((l) => labels.add(l));
      if (d.before || d.after) { item.drama = { beforeIds: d.beforeIds || [], afterIds: d.afterIds || [] }; labels.add('dramaOff'); }
      if ((q.objectives || []).some((o) => (o.reward || {}).type === COIN_TYPE)) labels.add('eventCoins');
    }
    if (raidish) entry.why = `raid or Special ${raidish}: served by make-raid / make-special`;
    else if (!entry.stageIds.length) {
      entry.why = `no quest served yet (${entry.quests.length} ${NOT_SERVED})`;
      const rs = [...new Set(entry.quests.map((x) => x.reason))];
      if (entry.quests.length && rs.length === 1 && rs[0]) { entry.reason = rs[0]; entry.why = textOf(rs[0]); }
    }
    else {
      // Details of the card: the original notice of the event (event-pages.js noticePage; «not available» without its text)
      const row = evStageRow(evStageId, entry.stageIds, { eventType: entry.eventType, detailUrl: entry.noticeIds.length ? `/web/event/notice/${evStageId}` : '' });
      row.eventCategory = config.eventCategory;
      row.bannerUrl = entry.banner;
      out.evStage.push(row);
      entry.available = true;
    }
    entry.useAp = apMin;
    entry.labels = [...labels];
    entry.label = entry.labels.length ? 'reconstructed' : 'original';
    entry.labels.forEach((l) => used.add(l));
    out.index.entries.push(entry);
  }
  // shared notices: the stage rows of the row they share (built once), no evStage row of their own
  for (const e of out.index.entries) {
    if (!e.sharedWith) continue;
    const target = out.index.entries.find((x) => x.censusId === e.sharedWith);
    if (target) Object.assign(e, { stageIds: [...target.stageIds], useAp: target.useAp, sharedEvStageId: target.evStageId });
  }
  // Event Catalog banner (Task 5): as the Raid Catalog banner of make-raid.js (CATALOG_EV), an evStage holding the Training
  // Grounds of the Special Catalog (our own quest, no Lux, no drops: a tap always opens the banner's quest list), eventType 0,
  // Details -> the catalogue. Kept apart from the event rows; emitted only when that stage row is in the master.
  const training = (master.stage || []).find((r) => r.stageId === config.catalogStage);
  out.catalogEvStage = null;
  if (training && config.catalogEvStage) {
    const row = evStageRow(config.catalogEvStage, [config.catalogStage], { eventType: 0, detailUrl: config.catalogUrl });
    row.eventCategory = config.eventCategory;
    row.bannerUrl = `/web/event/img/v${config.imgVersion}/${config.catalogEvStage}.png`;
    out.catalogEvStage = row;
    out.index.catalog = { evStageId: config.catalogEvStage, stageIds: [config.catalogStage], useAp: [Number(training.useAp) || 0] };
  }
  for (const e of out.index.entries) if (e.reason && !REASONS.includes(e.reason)) throw new Error(`events: unknown reason ${e.reason}`);
  for (const l of [...used].sort()) {
    const why = (config.reconstructedWhy || {})[l];
    if (!why) throw new Error(`events: label ${l} has no reconstructedWhy text in event_config.json`);
    out.index.reasons[l] = why;
  }
  return out;
}

// A missing file gives dflt where the caller allows it (dflt undefined: it stops the run); a corrupt one always stops it.
function readJson(p, dflt) {
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT' && dflt !== undefined) return dflt;
    throw new Error(`events: ${p} not readable (${e.code || e.message})`);
  }
  try { return JSON.parse(text); } catch (e) { throw new Error(`events: ${p} is corrupt: ${e.message}`); }
}
const IDS_FILE = path.join(__dirname, 'event_ids.json');
const IDS_NOTE = 'Append-only: event ids live in saves and in the master. Numbers are written by make-events.js; a key that disappears stays, its number is never reused. rows: evStage = evStageBase + r. entries ("<censusId>/+<offset from the anchor of the record>", no donor id; anchors in the private event_anchors.json next to the records): stage = stageBase + n (bases in event_config.json).';
const ANCHORS_NAME = 'event_anchors.json';
const readIds = (file) => readJson(file, { note: IDS_NOTE, rows: {}, entries: {} });
function writeIds(file, ids) {
  const text = JSON.stringify({ note: IDS_NOTE, ...ids }, null, 1) + '\n';
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch { /* first run */ }
  if (old === null || old.replace(/\r\n/g, '\n') !== text) fs.writeFileSync(file, text);
}
// The map import of recon/tools/import_event_stages.py (private, D:\Progetto_Restauro_KH_UX\stage_gen\event_stages; KHUX_EVENT_MAPS
// overrides it): report.json (status per map key) and stage_poi_events.json. Absent: every quest is «map not usable».
const MAPS_DIR = process.env.KHUX_EVENT_MAPS || path.join('D:', path.sep, 'Progetto_Restauro_KH_UX', 'stage_gen', 'event_stages');
function loadMaps(dir) {
  const rep = readJson(path.join(dir, 'report.json'), null);
  if (!rep) { console.warn(`events: no map import report in ${dir} (recon/tools/import_event_stages.py): no event quest is served`); return { status: new Map(), poi: {} }; }
  return { status: new Map((rep.stages || []).map((s) => [s.key, { status: s.status, why: s.why || '' }])), poi: readJson(path.join(dir, 'stage_poi_events.json'), {}) };
}
// The records: a file (a list of records) or a folder (every *.json except the anchors file, sorted by name, concatenated).
// The anchors sidecar is next to the file, or inside the folder.
function readRecords(src) {
  const files = fs.statSync(src).isDirectory()
    ? fs.readdirSync(src).filter((f) => f.endsWith('.json') && f !== ANCHORS_NAME).sort().map((f) => path.join(src, f)) : [src];
  const out = [], seen = new Set();
  for (const f of files) {
    const list = readJson(f);
    if (!Array.isArray(list)) throw new Error(`events: ${f} is not a list of records`);
    for (const r of list) {
      if (r.censusId && seen.has(r.censusId)) throw new Error(`events: record ${r.censusId} is given twice (${f})`);
      seen.add(r.censusId);
      out.push(r);
    }
  }
  return out;
}
const anchorsPathOf = (src) => path.join(fs.existsSync(src) && fs.statSync(src).isDirectory() ? src : path.dirname(src), ANCHORS_NAME);
const loadConfig = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8'));

// Appends the rows to the master tables and writes game_data/events.json and event_maps.json. Returns null (nothing written)
// with KHUX_EVENTS=0 or without the records. opts: records, config, gameDataDir, idsFile, anchorsFile, maps (tests: {status, poi};
// records given without maps: no map check). Also appends the event reward rows to reward.json and merges the POI of the served
// event maps into game_data/stage_poi.json (own keys of the previous run dropped first; a key of another stage stops the run), so
// POI and reward rows land together in the master run (make-game-tables.js skips the reward ids and POI keys listed in `own`).
function patch(masterDir, opts = {}) {
  if (process.env.KHUX_EVENTS === '0') { console.log('events: off (KHUX_EVENTS=0)'); return null; }
  let records = opts.records;
  if (!records) {
    const src = process.env.KHUX_EVENT_SRC;
    if (!src) { console.warn('events: skipped, KHUX_EVENT_SRC not set (the private event quest records): no event rows'); return null; }
    try { records = readRecords(src); } catch (e) { console.warn(`events: skipped, ${e.message}: no event rows`); return null; }
  }
  const gameData = opts.gameDataDir || path.join(__dirname, 'game_data');
  const prev = readJson(path.join(gameData, 'events.json'), {}).own || {};
  const keyOf = { stage: 'stageId', evStage: 'eventStageId', reward: 'rewardId' };
  const load = (table, dflt) => {
    const mine = new Set(prev[table] || []);
    return readJson(path.join(masterDir, `${table}.json`), dflt).filter((r) => !mine.has(r[keyOf[table]]));
  };
  const hadReward = fs.existsSync(path.join(masterDir, 'reward.json'));
  const master = { stage: load('stage'), evStage: load('evStage'), reward: load('reward', []), enemy: readJson(path.join(masterDir, 'enemy.json')),
    medal: readJson(path.join(masterDir, 'medal.json'), null), material: readJson(path.join(masterDir, 'material.json'), null) };
  const idsFile = opts.idsFile || IDS_FILE;
  // the anchors sidecar: next to the records (private), or opts.anchorsFile; records given in opts without a file: game_data
  const anchorsFile = opts.anchorsFile || (opts.records ? path.join(gameData, 'event_anchors.json') : anchorsPathOf(process.env.KHUX_EVENT_SRC));
  const config = opts.config || loadConfig();
  const maps = opts.maps !== undefined ? opts.maps : (opts.records ? null : loadMaps(MAPS_DIR));
  const out = buildEvents(records, config, master, readIds(idsFile), readJson(anchorsFile, {}), maps);
  const added = { stage: out.stage, evStage: [...(out.catalogEvStage ? [out.catalogEvStage] : []), ...out.evStage], reward: out.reward };
  const clashR = out.reward.find((r) => master.reward.some((m) => m.rewardId === r.rewardId));
  if (clashR) throw new Error(`events: reward row ${clashR.rewardId} is in the master already`);
  for (const [t, rows] of Object.entries(added)) if (t !== 'reward' || hadReward || rows.length) fs.writeFileSync(path.join(masterDir, `${t}.json`), JSON.stringify([...master[t], ...rows]));
  fs.mkdirSync(gameData, { recursive: true });
  const own = Object.fromEntries(Object.entries(added).map(([t, rows]) => [t, rows.map((r) => r[keyOf[t]])]));
  // POI of the served event maps into stage_poi.json (the server reads an event stage's POI by its stageBinId)
  const poiFile = path.join(gameData, 'stage_poi.json');
  const poiAll = readJson(poiFile, {});
  for (const k of prev.poi || []) delete poiAll[k];
  for (const k of Object.keys(out.poi)) if (k in poiAll) throw new Error(`events: stage_poi.json key ${k} is not ours (map of another stage)`);
  if ((prev.poi || []).length || Object.keys(out.poi).length) {
    fs.writeFileSync(poiFile, JSON.stringify(Object.fromEntries(Object.entries({ ...poiAll, ...out.poi }).sort((a, b) => Number(a[0]) - Number(b[0])))));
  }
  own.poi = Object.keys(out.poi).sort((a, b) => a - b);
  fs.writeFileSync(path.join(gameData, 'events.json'), JSON.stringify({ entries: out.index.entries, reasons: out.index.reasons, ...(out.index.catalog ? { catalog: out.index.catalog } : {}), own }, null, 1));
  fs.writeFileSync(path.join(gameData, 'event_maps.json'), JSON.stringify(out.maps, null, 1));
  // anchors first (only grow: allocateIds never changes one), so ids are never written with keys whose anchor is not saved
  if (JSON.stringify(readJson(anchorsFile, {})) !== JSON.stringify(out.anchors)) fs.writeFileSync(anchorsFile, JSON.stringify(out.anchors, null, 1) + '\n');
  writeIds(idsFile, out.ids);
  const e = out.index.entries, qs = e.flatMap((x) => x.quests);
  console.log(`events: ${e.length} entries, ${e.filter((x) => x.available).length} with a served quest; ${qs.filter((q) => q.served).length} of ${qs.length} quests served, `
    + `${qs.filter((q) => !q.served).length} ${NOT_SERVED}; +${out.stage.length} stage, +${out.evStage.length} evStage, +${out.reward.length} reward, ${own.poi.length} POI keys`);
  const byReason = {};
  for (const q of qs.filter((x) => !x.served)) byReason[q.reason || 'other'] = (byReason[q.reason || 'other'] || 0) + 1;
  const entryReasons = {};
  for (const x of e) if (x.reason) entryReasons[x.reason] = (entryReasons[x.reason] || 0) + 1;
  console.log(`events: quests not served by reason ${JSON.stringify(byReason)}; entries by reason ${JSON.stringify(entryReasons)}; ${out.skipped.length} records not selected`);
  const skipped = e.filter((x) => !x.available).map((x) => `${x.censusId} (${x.why})`);
  if (skipped.length) console.log(`events: no evStage row: ${skipped.join(', ')}`);
  if (!out.catalogEvStage) console.warn(`events: no Event Catalog banner: the Training Grounds stage ${config.catalogStage} is not in the master (make-special first)`);
  return out;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { buildEvents, patch, readRecords, anchorsPathOf, REASONS, allocateIds, labelIds, daysOf, swapEnemies, dropRows, GENERATED_LABELS, NOT_SERVED };
