#!/usr/bin/env node
// Master rows and index of the event quests (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md
// Task 3, spec docs/superpowers/specs/2026-11-06-events-design.md, client facts docs/notes/events.md). Same shape as make-raid.js.
// Inputs:
// - server/event_config.json (versioned, ours): id bases, eventCategory / eventType of our rows, onlyCensusIds (the pilot filter),
//   labelPhrases (reconstruction notes of the records -> label id) and reconstructedWhy (the text of every label);
// - the event quest records (private, path in KHUX_EVENT_SRC, never copied into the repo): [{censusId, name, start, end, type,
//   notices, evStage: [donor rows], quests: [{stageId, name, worldId, room, level, ap, addLevel, targets, objectives, combined,
//   firstClear, drops, enemies: [{id, level, label, ...}], restrictions, drama, map: {key, stageBinId, status}, window, label}]}].
// Rules:
// - one evStage row per record (eventCategory / eventType of the config: 2 / 2, the values proven by the raids; the donor
//   eventType stays in the entry as origEventType), stageId capped at EVSTAGE_MAX_STAGES with the range (make-raid evStageRow);
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
// {"<censusId>/+<offset of its donor stage id from the lowest of the record>": n}; evStage = evStageBase + r, stage = stageBase + n. Every record read is numbered, whatever
// the filter says; a key that disappears keeps its number; a repeated number stops the run.
// Output (own rows dropped first, the previous run's list is events.json `own`; anything else in our ranges stops the run):
// stage, evStage; game_data/events.json {entries, reasons, own}; game_data/event_maps.json (stage list for gen_story_maps.py).
// Wired in make-game-tables.js after make-raid. KHUX_EVENTS=0 turns it off; without KHUX_EVENT_SRC it warns and writes nothing.
//
//   node server/make-events.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');
const { evStageRow, storyRefs } = require('./make-raid');

const STAGE_KIND = 2;
// raid and Special stage ids (make-special.js 970000-979999, make-raid.js 980000-989999) and the raid target Eggcognito
const RAID_SPECIAL = [970000, 989999], EGGCOGNITO = 100;
const NOT_SERVED = 'not served yet';
// labels this generator sets (the record labels come through labelPhrases)
const GENERATED_LABELS = ['wholeDay', 'dramaOff', 'eventCoins'];
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
// Key of a quest in event_ids.json: its offset from the lowest donor stage id of the record («EV-0001/+3»), so the public file
// holds no donor stage id (docs/notes/events.md: per-stage ids stay private); a quest with no donor stage id: «/w<position>».
function questKey(rec, q) {
  const has = (x) => Number.isInteger(x.stageId);
  if (!has(q)) return `${rec.censusId}/w${(rec.quests || []).indexOf(q) + 1}`;
  return `${rec.censusId}/+${q.stageId - Math.min(...(rec.quests || []).filter(has).map((x) => x.stageId))}`;
}
// Copy of ids with a number for every record and quest read (append-only).
function allocateIds(records, ids, config) {
  const out = { ...(ids || {}), rows: { ...((ids || {}).rows || {}) }, entries: { ...((ids || {}).entries || {}) } };
  const maxRow = config.evStageMax - config.evStageBase, maxEntry = config.stageMax - config.stageBase;
  checkNumbers(out.rows, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  let nextRow = Math.max(0, ...Object.values(out.rows)) + 1, nextEntry = Math.max(0, ...Object.values(out.entries)) + 1;
  for (const rec of records) {
    if (!rec.censusId) throw new Error('events: a record has no censusId');
    if (!(rec.censusId in out.rows)) out.rows[rec.censusId] = nextRow++;
    const keys = new Set();
    for (const q of rec.quests || []) {
      const key = questKey(rec, q);
      if (keys.has(key)) throw new Error(`events: two quests give the key ${key}`);
      keys.add(key);
      if (!(key in out.entries)) out.entries[key] = nextEntry++;
    }
  }
  checkNumbers(out.rows, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  return out;
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

// records, config (event_config.json), master {stage, evStage, enemy} without our own rows, ids (event_ids.json)
// -> {evStage, stage, maps, ids, index: {entries, reasons}}
function buildEvents(records, config, master, ids) {
  checkRanges(master, config);
  const allIds = allocateIds(records, ids, config);
  const enemies = new Set((master.enemy || []).map((e) => e.enemyId));
  const refs = storyRefs(master.stage);
  if (!refs.story.length) throw new Error('events: no story rows in the stage table');
  // map key -> a stage row of the master that loads it (stageBinId, or its own id when the bin is 0)
  const byMap = new Map();
  for (const s of master.stage || []) byMap.set(s.stageBinId || s.stageId, s);
  const only = Array.isArray(config.onlyCensusIds) ? new Set(config.onlyCensusIds) : null;
  const out = { evStage: [], stage: [], maps: [], ids: allIds, index: { entries: [], reasons: {} } };
  const used = new Set();

  for (const rec of records) {
    if (only && !only.has(rec.censusId)) continue;
    const evStageId = config.evStageBase + allIds.rows[rec.censusId];
    const donorTypes = [...new Set((rec.evStage || []).map((r) => r.eventType))];
    const entry = { censusId: rec.censusId, evStageId, name: rec.name, type: rec.type, start: rec.start, end: rec.end, stageIds: [], useAp: null, label: 'original', labels: [],
      noticeIds: rec.notices || [], banner: `/web/event/img/v${config.imgVersion}/${evStageId}.png`, origEventType: donorTypes.length === 1 ? donorTypes[0] : donorTypes,
      available: false, why: null, quests: [] };
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
    for (const q of rec.quests || []) {
      const key = questKey(rec, q), stageId = config.stageBase + allIds.entries[key], mapKey = mapKeyOf(q);
      const qLabels = labelIds(q.label, config.labelPhrases);
      const item = { key, donorStageId: q.stageId, stageId, name: q.displayName || q.name, ap: q.ap, level: q.level, window: q.window || null, served: false, status: NOT_SERVED,
        why: null, labels: qLabels, mapKey, mapStatus: (q.map || {}).status || null };
      if (q.window && isShort(q.window, config.shortWindowHours)) item.days = daysOf(q.window);
      entry.quests.push(item);
      qLabels.forEach((l) => used.add(l));
      if (raidish) { item.why = 'raid or Special quest'; continue; }
      const missing = enemyIdsOf(q).filter((id) => !enemies.has(id));
      if (missing.length) { item.why = `enemies not in the master: ${missing.join(', ')}`; continue; }
      const clash = byMap.get(mapKey);
      if (clash) { item.why = `map key ${mapKey} is the map of stage ${clash.stageId}`; continue; }

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
      out.maps.push({ stageId, key: mapKey, mapStatus: item.mapStatus, censusId: rec.censusId, world: q.worldId, name: q.name, rooms: q.room || [], level: q.level, addLevel: q.addLevel || 0,
        targets: (q.targets || []).map((t) => t.id), enemies: (q.enemies || []).map((e) => ({ name: e.name, enemyId: e.id, level: e.level, n: e.count, reward: e.reward, rooms: e.rooms || [], target: !!e.target })),
        drops: q.drops || null });
      item.served = true; item.status = 'served';
      entry.stageIds.push(stageId);
      apMin = apMin === null ? q.ap : Math.min(apMin, q.ap);
      qLabels.forEach((l) => labels.add(l));
      if (d.before || d.after) { item.drama = { beforeIds: d.beforeIds || [], afterIds: d.afterIds || [] }; labels.add('dramaOff'); }
      if ((q.objectives || []).some((o) => (o.reward || {}).type === COIN_TYPE)) labels.add('eventCoins');
    }
    if (raidish) entry.why = `raid or Special ${raidish}: served by make-raid / make-special`;
    else if (!entry.stageIds.length) entry.why = `no quest served yet (${entry.quests.length} ${NOT_SERVED})`;
    else {
      const row = evStageRow(evStageId, entry.stageIds, { eventType: config.eventType });
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
const IDS_NOTE = 'Append-only: event ids live in saves and in the master. Numbers are written by make-events.js; a key that disappears stays, its number is never reused. rows: evStage = evStageBase + r. entries ("<censusId>/+<offset from the lowest donor stage id of the record>", no donor id): stage = stageBase + n (bases in event_config.json).';
const readIds = (file) => readJson(file, { note: IDS_NOTE, rows: {}, entries: {} });
function writeIds(file, ids) {
  const text = JSON.stringify({ note: IDS_NOTE, ...ids }, null, 1) + '\n';
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch { /* first run */ }
  if (old === null || old.replace(/\r\n/g, '\n') !== text) fs.writeFileSync(file, text);
}
const loadConfig = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8'));

// Appends the rows to the master tables and writes game_data/events.json and event_maps.json. Returns null (nothing written)
// with KHUX_EVENTS=0 or without the records. opts: records, config, gameDataDir, idsFile (tests).
function patch(masterDir, opts = {}) {
  if (process.env.KHUX_EVENTS === '0') { console.log('events: off (KHUX_EVENTS=0)'); return null; }
  let records = opts.records;
  if (!records) {
    const src = process.env.KHUX_EVENT_SRC;
    if (!src) { console.warn('events: skipped, KHUX_EVENT_SRC not set (the private event quest records): no event rows'); return null; }
    try { records = readJson(src); } catch (e) { console.warn(`events: skipped, ${e.message}: no event rows`); return null; }
    if (!Array.isArray(records)) { console.warn(`events: skipped, ${src} is not a list of records: no event rows`); return null; }
  }
  const gameData = opts.gameDataDir || path.join(__dirname, 'game_data');
  const prev = readJson(path.join(gameData, 'events.json'), {}).own || {};
  const keyOf = { stage: 'stageId', evStage: 'eventStageId' };
  const load = (table) => {
    const mine = new Set(prev[table] || []);
    return readJson(path.join(masterDir, `${table}.json`)).filter((r) => !mine.has(r[keyOf[table]]));
  };
  const master = { stage: load('stage'), evStage: load('evStage'), enemy: readJson(path.join(masterDir, 'enemy.json')) };
  const idsFile = opts.idsFile || IDS_FILE;
  const out = buildEvents(records, opts.config || loadConfig(), master, readIds(idsFile));
  const added = { stage: out.stage, evStage: out.evStage };
  for (const [t, rows] of Object.entries(added)) fs.writeFileSync(path.join(masterDir, `${t}.json`), JSON.stringify([...master[t], ...rows]));
  fs.mkdirSync(gameData, { recursive: true });
  const own = Object.fromEntries(Object.entries(added).map(([t, rows]) => [t, rows.map((r) => r[keyOf[t]])]));
  fs.writeFileSync(path.join(gameData, 'events.json'), JSON.stringify({ entries: out.index.entries, reasons: out.index.reasons, own }, null, 1));
  fs.writeFileSync(path.join(gameData, 'event_maps.json'), JSON.stringify(out.maps, null, 1));
  writeIds(idsFile, out.ids);
  const e = out.index.entries, qs = e.flatMap((x) => x.quests);
  console.log(`events: ${e.length} entries, ${e.filter((x) => x.available).length} with a served quest; ${qs.filter((q) => q.served).length} of ${qs.length} quests served, `
    + `${qs.filter((q) => !q.served).length} ${NOT_SERVED}; +${out.stage.length} stage, +${out.evStage.length} evStage`);
  const skipped = e.filter((x) => !x.available).map((x) => `${x.censusId} (${x.why})`);
  if (skipped.length) console.log(`events: no evStage row: ${skipped.join(', ')}`);
  return out;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { buildEvents, patch, allocateIds, labelIds, daysOf, GENERATED_LABELS, NOT_SERVED };
