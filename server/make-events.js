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
// - one evStage row per ORIGINAL donor evStage row of the record with a served quest (Part 2 Task 5; a record without donor rows:
//   one row): own id (allocateRows), card (/web/event/img/v<N>/<its id>.png, from the donor bannerKey: make_event_banners.py),
//   dates (index entry `rows`) and quests (quest -> row by its evStageId or the row's stage range); parentEventStageId stays 0 on
//   our rows (the donor value is in the index row only). eventCategory of the config (2, proven by the raids); eventType = the
//   donor row's (1 or 3), the config eventType (1) when the donor row has none (the entry keeps the record-level value). Never 2: on the client eventType 2 is the
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
// - short windows (a donor evStage row under shortWindowHours) open for their whole original Pacific day: entry `days`, label
//   wholeDay (not original). Every row of a record marked `shortWindow` (the Surprise events: one donor row of the whole day, and
//   every WW notice gave that whole Pacific day) is open on the day it starts: entry `days` and oneDay, original (no label);
// - Surprise events share their map key (741710 / 743840) between `shortWindow` records, each with its own stage row; and the
//   community-goal bonus of an event (private community_bonus.json, KHUX_EVENT_BONUS) goes into entry.communityBonus.
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
// Event Boards (Events Part 3 Task 4): KHUX_EVENT_BOARDS = the private board sets (board_sets.json {sets: [{setKey, censusIds, boards}]}):
// the type-4 rows of event-boards.js (ids event_ids.json `boards`) are appended to sphere / sphereArray / sphereMasu for the sets
// handed out: a set with at least one built board and a member entry (census id in its censusIds) with a served quest. Such an
// entry gets boardSet = its set and eventType config.boardEventType (1: the Event Boards button); every other entry boardSet null
// and a donor 1 served as config.eventType (3). A member of a set not handed out gets the label boardsLater (no board built: its
// rewards do not exist here yet) or noCoinSource (boards, but no quest of the set is served). events.json boardSets {[setKey]:
// {boardIds, chains, censusIds}} lists the sets handed out (server: Part 3 Task 5).
// Org XIII events (Part 5 Task 3, plan docs/superpowers/plans/2026-11-10-events-part5-orgxiii.md): a quest with map.source
// 'generate' gets its own generated map (genMapOf: stageBinId = its own stage id, game_data/event_gen_maps.json for
// recon/tools/gen_story_maps.py config key `events`, label wikiRoom; served once the generated-maps report lists it), 'jpTwin' a JP
// 4.3.1 map of the same quest (label jpTwinMap; levelShifted with map.levelShifted, served once the import applied the shift); an
// objective with code null holds its quest (objectiveUnmapped); scheduleLineOf records get no row (scheduleLine); datesOf dates
// another record (applyDatesOf); reward types 18 / 19 are paid as avatar parts (rewardTypeAliases); unionQuests mark the Union of
// a quest (index quest `union`); stagesOf lists another record's built quests on this record's card; a record's completionReward
// joins the bonus list (mergeCompletion, per Union with questUnion); catalogName renames the Event Catalog row.
// Wired in make-game-tables.js after make-raid. KHUX_EVENTS=0 turns it off; without KHUX_EVENT_SRC it warns and writes nothing.
//
//   node server/make-events.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { evStageRow, storyRefs } = require('./make-raid');
const eventBoards = require('./event-boards');

const STAGE_KIND = 2;
// raid and Special stage ids (make-special.js 970000-979999, make-raid.js 980000-989999) and the raid target Eggcognito
const RAID_SPECIAL = [970000, 989999], EGGCOGNITO = 100;
const NOT_SERVED = 'not served yet';
// labels this generator sets (the record labels come through labelPhrases)
const GENERATED_LABELS = ['wholeDay', 'communityBonus', 'completionReward', 'dramaOff', 'eventCoins', 'wwEnemy', 'wikiAp', 'boardsLater', 'noCoinSource', 'boosterLater', 'noBoardSet', 'quizBoard',
  'quizBoardFootage', 'quizBoardScreenshot', 'wikiRoom', 'jpTwinMap', 'levelShifted'];
// the labels a quizDramas entry may give its board (Part 4 Task 6): rebuilt from the khuxwiki text (quizBoard, the default of
// reconstructed true), redrawn from footage of the original (quizBoardFootage), taken from a screenshot of the original
// (quizBoardScreenshot)
const QUIZ_BOARD_LABELS = ['quizBoard', 'quizBoardFootage', 'quizBoardScreenshot'];
// reason of a record or quest not built (Events Part 2): text in event_config.json reasonText. Part 4 Task 4: boosterOnly (every
// reward a Booster), rewardTypeUnknown (a reward type not in payableTypes / payableDropTypes), quizTextMissing (a quiz quest whose
// board drama is not listed in quizDramas), objectiveMismatch (the private record's khuxwiki objective text contradicts the donor
// code: held, Task 1 ruling), notice (an information notice of the records, noQuests 'notice': no row, no catalogue row).
// Part 5 Task 3: objectiveUnmapped (an objective known only as text, code null: held, never a stopgap code; plan Global
// Constraints «Nothing half-served»), scheduleLine (a second notice of an event, scheduleLineOf: no row, no card, no catalogue row)
const REASONS = ['shared', 'board', 'coin', 'undated', 'wikiEmpty', 'rewardItemMissing', 'notSelected',
  'enemyMissing', 'mapUnusable', 'mapKeyUsed', 'rewardRowsMissing', 'raidSpecial', 'worldMismatch',
  'boosterOnly', 'rewardTypeUnknown', 'quizTextMissing', 'objectiveMismatch', 'notice', 'objectiveUnmapped', 'scheduleLine', 'enemyAmbiguous'];
// flags the private builder writes in a quest label (Task 1): this generator decides them itself (payableTypes, quizDramas,
// objectiveMismatch), so they carry no label of their own. objectiveResolved (I-251): a note, the donor objective is served as recorded
const RECORD_FLAGS = ['boosterLater', 'boosterOnly', 'quizTextMissing', 'rewardTypeUnknown', 'objectiveMismatch', 'objectiveResolved'];
// Union ids of the client (userDetail.unionId 1-5, docs/notes/mappe_storia.md Q555: Ursus 1, Anguis 2, Unicornis 3, Vulpes 4,
// Leopardus 5): the Union quests of a record (unionQuests {quest name: {Union: donor stage id}}, The Keyblade War part 3)
const UNION_IDS = Object.freeze({ Ursus: 1, Anguis: 2, Unicornis: 3, Vulpes: 4, Leopardus: 5 });
const unionIdOf = (name, where) => { const u = UNION_IDS[name]; if (!u) throw new Error(`events: ${where}: unknown Union «${name}»`); return u; };
// Generated maps (Part 5 Task 3, plan call 1): enemies per group at most, as make-special.js GROUP_MAX
const GEN_GROUP_MAX = 5;
const COIN_TYPE = 15, BOOSTER_TYPE = 34;
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
// A donor row of a short-window event (Part 4 Task 7): a window under shortWindowHours, or any row of a record marked
// `shortWindow` (the Surprise events: every WW notice gave one whole Pacific day, «12:00 a.m. to 11:59 p.m. (PT)», and the donor
// master keeps that one row of the day). Such a row is open on the Pacific days of its window; a long row of a shortWindow record
// on the day it starts only (a 24 h row from 08:00 UTC starts at 01:00 Pacific in summer and would touch the next day).
const shortWindowRow = (rec, r, hours) => !!(r && r.startTime && r.endTime && (isShort([r.startTime, r.endTime], hours) || rec.shortWindow));
const shortDaysOf = (r, hours) => (isShort([r.startTime, r.endTime], hours) ? daysOf([r.startTime, r.endTime]) : [ptDate(utcMs(r.startTime))]);

// Label ids of a record label («original; enemies missing: 2; donor kept; wiki is the 2018 run»): every phrase of labelPhrases;
// «original» and «enemies missing: N» (the master check decides that) carry none; anything else stops the run.
function labelIds(text, phrases) {
  let rest = String(text || '');
  const out = [];
  for (const p of Object.keys(phrases || {}).sort((a, b) => b.length - a.length)) {
    if (rest.includes(p)) { out.push(phrases[p]); rest = rest.split(p).join(';'); }
  }
  for (const f of RECORD_FLAGS) rest = rest.split(f).join(';');
  const left = rest.replace(/\boriginal\b/g, ';').replace(/enemies missing: \d+/g, ';').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (left.length) throw new Error(`events: quest label «${left.join('; ')}» has no labelPhrases entry in event_config.json`);
  return out;
}

// An id range that cannot hold the numbers of this run stops it, with the range and the count (Part 4 Task 4)
function checkRoom(map, what, base, max) {
  const top = Math.max(0, ...Object.values(map));
  if (top > max - base) throw new Error(`events: ${what} id range ${base}-${max} overflows: ${top} numbers needed, ${max - base} available`);
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
  const out = { ...(ids || {}), rows: { ...((ids || {}).rows || {}) }, subRows: { ...((ids || {}).subRows || {}) }, entries: { ...((ids || {}).entries || {}) },
    checks: { ...((ids || {}).checks || {}) } };
  const outAnchors = { ...(anchors || {}) };
  const maxRow = config.evStageMax - config.evStageBase, maxEntry = config.stageMax - config.stageBase;
  checkNumbers({ ...out.rows, ...out.subRows }, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  let nextRow = Math.max(0, ...Object.values(out.rows), ...Object.values(out.subRows)) + 1, nextEntry = Math.max(0, ...Object.values(out.entries)) + 1;
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
  checkRoom({ ...out.rows, ...out.subRows }, 'evStage', config.evStageBase, config.evStageMax);
  checkRoom(out.entries, 'stage', config.stageBase, config.stageMax);
  checkNumbers({ ...out.rows, ...out.subRows }, 'row', maxRow);
  checkNumbers(out.entries, 'entry', maxEntry);
  return { ids: out, anchors: outAnchors };
}

// One evStage row per ORIGINAL donor evStage row of a record (Part 2 Task 5, user decision 07-11: the original event list showed
// one banner per row). The donor row that holds the record's number (event_ids.json rows) is frozen in the private sidecar as
// «<censusId>#row» (its donor eventStageId) on the record's first row numbering: the first donor row (record order), unless the
// sidecar already names the row matching the record (Task 5 migration: the row whose banner was the record's card). Every other donor row gets a number in event_ids.json subRows, key «<censusId>/r+<offset of its donor
// eventStageId from that row>» (no donor id in the public file). A stored key the record no longer gives stops the run.
const ROW_ANCHOR = (censusId) => `${censusId}#row`;
const donorRowsOf = (rec) => (rec.evStage || []).filter((r) => Number.isInteger(r.eventStageId));
function allocateRows(rec, ids, anchors, config) {
  const rows = donorRowsOf(rec), cid = rec.censusId, ak = ROW_ANCHOR(cid);
  const out = new Map();
  if (!rows.length) return out;
  if (!(ak in anchors)) {
    if (Object.keys(ids.subRows).some((k) => k.startsWith(`${cid}/r`))) {
      throw new Error(`events: ${cid} has row keys in event_ids.json but no ${ak} in event_anchors.json (the private sidecar was lost or moved): restore it`);
    }
    anchors[ak] = rows[0].eventStageId;
  }
  const anchor = anchors[ak];
  if (!rows.some((r) => r.eventStageId === anchor)) throw new Error(`events: ${cid}: the donor row that holds its evStage id (${ak} in event_anchors.json) is not in the record any more`);
  const prefix = `${cid}/r`, keys = new Set();
  let next = Math.max(0, ...Object.values(ids.rows), ...Object.values(ids.subRows)) + 1;
  for (const r of rows) {
    if (r.eventStageId === anchor) { out.set(r.eventStageId, config.evStageBase + ids.rows[cid]); continue; }
    const d = r.eventStageId - anchor, key = `${prefix}${d < 0 ? '-' : '+'}${Math.abs(d)}`;
    if (keys.has(key)) throw new Error(`events: two donor rows give the key ${key}`);
    keys.add(key);
    if (!(key in ids.subRows)) ids.subRows[key] = next++;
    out.set(r.eventStageId, config.evStageBase + ids.subRows[key]);
  }
  const lost = Object.keys(ids.subRows).filter((k) => k.startsWith(prefix) && !keys.has(k));
  if (lost.length) throw new Error(`events: ${cid}: the stored row keys ${lost.join(', ')} are not given by the record any more (a donor row removed, or ${ak} changed)`);
  checkRoom({ ...ids.rows, ...ids.subRows }, 'evStage', config.evStageBase, config.evStageMax);
  checkNumbers({ ...ids.rows, ...ids.subRows }, 'row', config.evStageMax - config.evStageBase);
  return out;
}
// the donor row of a quest: its evStageId, else the row whose stage list / range holds its stage id; else the first donor row
function inStageRange(row, stageId) {
  const r = row.stageRange || {};
  if (!Number.isInteger(stageId)) return false;
  if ((r.stageId || []).includes(stageId)) return true;
  return !!r.validStageWidthId && r.stageStartId <= stageId && stageId <= r.stageEndId;
}
// -> {row, guess}: guess true when the quest matches no row (the first row is taken; patch() warns)
function rowOfQuest(rows, q) {
  if (!rows.length) return { row: null, guess: false };
  const sid = Number.isInteger(q.stageId) ? q.stageId : q.donorStageOfLaterRun;
  const hit = rows.find((r) => r.eventStageId === q.evStageId) || rows.find((r) => inStageRange(r, sid));
  return { row: hit || rows[0], guess: !hit && rows.length > 1 };
}

const BOARD_TABLES = { sphere: 'sphereBoardId', sphereArray: 'arryId', sphereMasu: 'masuId' };
function checkRanges(master, config) {
  const ranges = { evStage: ['eventStageId', config.evStageBase, config.evStageMax], stage: ['stageId', config.stageBase, config.stageMax],
    ...Object.fromEntries(Object.entries(BOARD_TABLES).map(([t, k]) => [t, [k, eventBoards.ID_BASE, eventBoards.ID_MAX]])) };
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
// Part 4 Task 4: a title (7), an avatar part (20) or a Spirit part (33) must be in its table (title, avatarParts, petParts) when
// that table has rows (grantItem would hand out a row the client does not know).
function itemResolver(master) {
  const has = (t) => Array.isArray(master[t]) && master[t].length > 0;
  const owned = { 7: ['title', 'titleId'], 20: ['avatarParts', 'avatarPartsId'], 33: ['petParts', 'petPartsId'] };
  const ownedIds = Object.fromEntries(Object.entries(owned).filter(([, [t]]) => has(t)).map(([type, [t, k]]) => [type, new Set(master[t].map((r) => r[k]))]));
  if (!master.medal && !master.material && !Object.keys(ownedIds).length) return null;
  const medalIds = new Set((master.medal || []).map((m) => m.medalId)), materialIds = new Set((master.material || []).map((m) => m.materialId));
  const byName = new Map();
  for (const m of master.medal || []) {
    const k = `${m.name}|${m.rare}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(m);
  }
  const medalOf = new Map((master.medal || []).map((m) => [m.medalId, m]));
  const medal = (d) => {
    const mt = /^(.*) (\d+)★$/.exec(String(d.name || ''));
    // the donor id is ours when it names the same medal (or the record gives no «Name N★» to compare)
    if (medalIds.has(d.id)) {
      const own = medalOf.get(d.id);
      if (!mt || (own.name === mt[1] && String(own.rare) === mt[2])) return d.id;
    }
    if (!mt) return null;
    let rows = byName.get(`${mt[1]}|${mt[2]}`) || [];
    if (rows.length > 1) rows = rows.filter((m) => m.medalId === m.imageId);
    return rows.length === 1 ? rows[0].medalId : null;
  };
  return (d, missing) => {
    if (d && ownedIds[d.type]) {
      if (!ownedIds[d.type].has(d.id)) missing.push(`type ${d.type} id ${d.id}${d.name ? ` (${d.name})` : ''}`);
      return d;
    }
    if (!d || (d.type !== 3 && d.type !== 5)) return d;
    let id = d.id;
    if (d.type === 3 && master.medal) id = medal(d);
    else if (d.type === 5 && master.material) id = materialIds.has(d.id) ? d.id : null;
    if (id === null) { missing.push(`type ${d.type} id ${d.id}${d.name ? ` (${d.name})` : ''}`); return d; }
    return id === d.id ? d : { ...d, id };
  };
}
// Payable reward types of the config (Part 4 Task 4): {types, drop, booster} or null (no type check)
const payableOf = (config) => (config.payableTypes ? { types: new Set(config.payableTypes), drop: new Set(config.payableDropTypes || config.payableTypes),
  booster: Number.isInteger(config.boosterType) ? config.boosterType : BOOSTER_TYPE } : null);
// copy of the quest with our item ids in its first-clear items, objective rewards and drop rows (resolve null: ids kept). payable
// (payableOf): a Booster (reward.booster, objective.booster or the booster type) is taken out of the copy, its objective pays
// nothing here (reward null: type 0 in the stage row), and listed in boosters [{objective (0: first clear, with slot), emblemName}] for
// player.pendingBoosters (Part 6 grants it); any other type outside payable.types (objectives, first clear) or payable.drop (drop
// and chest rows) is listed in unknownTypes: the caller holds the quest, so the type never reaches a row of the client.
function remapItems(q, resolve, payable = null) {
  const missing = [], boosters = [], unknown = [];
  const res = resolve || ((d) => d);
  const c = JSON.parse(JSON.stringify(q));
  const isBooster = (d, o) => !!((o && o.booster) || (d && (d.booster || (payable && d.type === payable.booster))));
  const nameOf = (d, o) => ((o && o.booster) || (d && d.booster) || {}).name || (d && d.name) || 'Booster';
  const check = (d, set, where) => { if (payable && d && d.type && !set.has(d.type)) unknown.push(`${where} type ${d.type}`); };
  c.firstClear = (c.firstClear || []).filter((x, slot) => {
    if (!payable || !isBooster(x)) return true;
    boosters.push({ objective: 0, slot, emblemName: nameOf(x) }); // slot: its position among the first-clear items (two stay two)
    return false;
  }).map((x) => { check(x, payable && payable.types, 'first-clear item'); return res(x, missing); });
  c.objectives = (c.objectives || []).map((o, i) => {
    if (payable && isBooster(o.reward, o)) {
      boosters.push({ objective: i + 1, emblemName: nameOf(o.reward, o) });
      const { booster, ...rest } = o;
      return { ...rest, reward: null };
    }
    if (!o.reward) return o;
    check(o.reward, payable && payable.types, `objective ${i + 1}`);
    return { ...o, reward: res(o.reward, missing) };
  });
  if (c.drops) {
    const rows = (list, where) => (list || []).map((e) => ({ ...e, rows: (e.rows || []).map((r) => { check(r, payable && payable.drop, where); return res(r, missing); }) }));
    c.drops.enemies = rows(c.drops.enemies, 'drop row');
    c.drops.chests = rows(c.drops.chests, 'chest row');
  }
  return { q: c, missing: [...new Set(missing)], boosters, unknownTypes: [...new Set(unknown)] };
}
// what makes two records' quests the same quest (Part 4 Task 4, map_key_shared_quest): everything the stage row and the map are
// built from, not the name, window or labels
const questSig = (q, mapKey) => JSON.stringify([mapKey, q.worldId, q.level, q.ap, q.addLevel || 0, (q.targets || []).map((t) => t.id),
  (q.objectives || []).map((o) => [o.code, o.dataType, o.idType, o.id, o.num, (o.reward || {}).type || 0, (o.reward || {}).id || 0, (o.reward || {}).num || 0]),
  (q.firstClear || []).map((x) => [x.type, x.id || 0, x.num || 1]), (q.enemies || []).map((e) => [e.id, e.level, e.count]), q.restrictions || {}, q.drops || null,
  [(q.drama || {}).beforeIds || [], (q.drama || {}).afterIds || []], q.combined ? 1 : 0]);
// quizDramas entry of a quest key: {ids, reconstructed, label} | null (a bare list: ids). dramas: the drama ids available in our
// resources (buildEvents opts.dramas); a listed id not among them, or no such list, stops the run (fix round 1, M2). label: the
// board's label (QUIZ_BOARD_LABELS; default quizBoard when reconstructed, none for a bare list), another one stops the run
function quizDramaOf(config, key, dramas) {
  const v = (config.quizDramas || {})[key];
  if (!v) return null;
  const ids = Array.isArray(v) ? v : v.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every(Number.isInteger)) throw new Error(`events: quizDramas ${key} has no list of drama ids`);
  if (!dramas) throw new Error(`events: quizDramas ${key} lists dramas but no list of available dramas was given (KHUX_EVENT_DRAMAS / config.availableDramas)`);
  const off = ids.filter((id) => !dramas.has(id));
  if (off.length) throw new Error(`events: quizDramas ${key}: drama ${off.join(', ')} is not among the available dramas`);
  const reconstructed = !Array.isArray(v) && !!v.reconstructed;
  const label = Array.isArray(v) ? null : (v.label || (reconstructed ? 'quizBoard' : null));
  if (label && !QUIZ_BOARD_LABELS.includes(label)) throw new Error(`events: quizDramas ${key}: label ${label} is not a quiz board label (${QUIZ_BOARD_LABELS.join(', ')})`);
  return { ids, reconstructed, label };
}

// datesOf (Part 5 Task 3, user decision 10-11-2026): a schedule line that dates another record (EV-0913 «The Keyblade War Pt. 1»
// dates EV-0929 from 2019-09-03, gem.json untouched). -> a copy of the records where the target starts on datesOf.start (when it has
// no start or a later one) and, with no end of its own, ends on the Pacific day its last donor row ends (datesOf.end when given);
// the target keeps datesFrom = the census id of the line. A target not among the records stops the run.
function applyDatesOf(records) {
  const lines = records.filter((r) => r.datesOf);
  if (!lines.length) return records;
  const out = records.slice();
  for (const line of lines) {
    const d = line.datesOf, i = out.findIndex((r) => r.censusId === d.censusId);
    if (i < 0) throw new Error(`events: ${line.censusId} datesOf ${d.censusId}, which is not in the records`);
    if (!d.start) throw new Error(`events: ${line.censusId} datesOf ${d.censusId} without a start`);
    const t = { ...out[i], datesFrom: line.censusId };
    // fix round 1: only the quests the line names (datesOf.quests: Pt. 1, 740900-740904) open on its start; the others keep the
    // Pacific day their own donor row opened (origStart, Pt. 2 on 2019-09-20): index quest openFrom, read by event-calendar.js
    const starts = donorRowsOf(t).filter((r) => r.startTime).map((r) => ptDate(utcMs(r.startTime))).sort();
    const origStart = t.start || starts[0] || null;
    if (Array.isArray(d.quests) && origStart && d.start < origStart) { t.datesOfQuests = d.quests; t.origStart = origStart; }
    if (!t.start || d.start < t.start) t.start = d.start;
    if (!t.end) {
      const ends = donorRowsOf(t).filter((r) => r.endTime).map((r) => ptDate(utcMs(r.endTime))).sort();
      const last = ends.length ? ends[ends.length - 1] : null;
      t.end = d.end || (last && last >= t.start ? last : null);
    }
    out[i] = t;
  }
  return out;
}

// Reward types the server pays as another type (event_config.json rewardTypeAliases {"18": 20, "19": 20}, Part 5 Task 3): the
// avatar sets (18) and style avatar parts (19) of the original rows are avatarParts rows, paid as type 20 (an avatar part, the type
// the client shows in an objective list: the Special quests serve their sets and styles as 20, ♂ and ♀ on two objectives, and
// grantItem adds the id to player.avatarParts once). -> a copy of the quest with the aliased types in its objectives and first-clear
// items (drops never carry them)
function aliasRewardTypes(q, aliases) {
  if (!aliases || !Object.keys(aliases).length) return q;
  const as = (d) => (d && d.type && aliases[String(d.type)] ? { ...d, type: aliases[String(d.type)], origType: d.type } : d);
  const hit = [...(q.objectives || []).map((o) => o.reward), ...(q.firstClear || [])].some((d) => d && aliases[String(d.type)]);
  if (!hit) return q;
  return { ...q, objectives: (q.objectives || []).map((o) => (o.reward ? { ...o, reward: as(o.reward) } : o)), firstClear: (q.firstClear || []).map(as) };
}

// Generated map of a quest with no original map (map.source 'generate', Part 5 Task 3, plan call 1, user 10-11-2026: every source
// searched first, map.searched): the khuxwiki enemies (wikiEnemies {name: count}, the target counted once among them) in the
// khuxwiki room of the quest's world, placed by recon/tools/gen_story_maps.py (config key `events`, the rules of the Special
// quests). Names -> enemy ids by the rule of make-special.js mapEnemyId (event rows never answer: target 1xxxx, others 8xxxx,
// else the smallest id); an objective on an enemy id (idType 1) puts that id on the map for as many members of its name as the
// objective counts (the objective counts that id). Enemies are never substituted: a name with no row -> missing.
// look {byName(name) -> [ids] sorted, nameOf(id)}. -> {entry (event_gen_maps.json, gen_story_maps «special» list shape), enemies
// (record shape, for the stage row and the checks), targets, missing: [names]}
function genMapOf(q, stageId, look) {
  const target = ((q.targets || [])[0] || {}).name || null;
  const counts = new Map(Object.entries(q.wikiEnemies || {}).map(([n, c]) => [n, Number(c) || 0]));
  const missing = [];
  // fix round 1 (review of Task 3): never a silent pick among same-name rows. An explicit id of the record wins (wikiEnemyIds
  // {name: enemy id}, the target's targets[0].id; Task 4 pins them); else the rows of the name (target 1xxxx / others 8xxxx when
  // the name has such rows, else all its non-event rows): one row, or rows with the same stats (hp, attack, defense, baseLv,
  // growth), give that id; rows with different stats -> ambiguous (the quest is held: enemyAmbiguous, the candidates in why)
  const explicit = q.wikiEnemyIds || {};
  const ambiguous = [];
  const mapId = (name, isTarget) => {
    const pinned = isTarget ? ((q.targets || [])[0] || {}).id : explicit[name];
    if (Number.isInteger(pinned)) return pinned;
    const ids = look.byName(name);
    const band = ids.filter((i) => (isTarget ? i >= 10000 && i < 20000 : i >= 80000 && i < 90000));
    const cand = band.length ? band : ids;
    if (!cand.length) return 0;
    if (new Set(cand.map((i) => look.statsOf(i))).size > 1) { ambiguous.push({ name, ids: cand }); return -1; }
    return cand[0];
  };
  if (!target) missing.push('the target (no name)');
  if (target && counts.has(target)) counts.set(target, Math.max(0, counts.get(target) - 1));
  // objective enemies: name -> {id, n}
  const objOf = new Map();
  for (const o of q.objectives || []) {
    if (o.idType !== 1 || !Number.isInteger(o.id)) continue;
    const name = look.nameOf(o.id);
    if (!name) continue; // not in the master: enemyIdsOf lists it (enemyMissing)
    const k = [...counts.keys()].find((n) => n.toLowerCase() === name.toLowerCase()) || name;
    const prev = objOf.get(k);
    objOf.set(k, { id: o.id, n: Math.max(prev ? prev.n : 0, Math.max(1, Number(o.num) || 1)) });
    if (!counts.has(k)) counts.set(k, 0);
  }
  const members = [];
  for (const [name, n0] of counts) {
    const ob = objOf.get(name);
    const n = Math.max(n0, ob ? ob.n : 0);
    const own = ob ? Math.min(n, ob.n) : 0;
    const rest = n - own;
    const id = rest > 0 ? mapId(name, false) : 0;
    if (id === -1) continue;
    if (rest > 0 && !id) { missing.push(name); continue; }
    for (let k = 0; k < own; k++) members.push({ name, enemyId: ob.id });
    for (let k = 0; k < rest; k++) members.push({ name, enemyId: id });
  }
  const tId = target ? mapId(target, true) : 0;
  const targetId = tId > 0 ? tId : 0;
  if (target && !tId) missing.push(target);
  // genLayout (Part 5 Task 4 follow-up 2, user 10-11-2026): the start and the placement read on an original map of the same room or
  // on the original footage ({room, start, groups, target, arena, targetWith {name: n}, source, why}). targetWith: members that
  // fight in the target's own team (taken out of the normal groups, entry.targetWith); the rest goes to gen_story_maps.py as
  // entry.layout (apply_layout). No genLayout -> the entry is as before.
  const lay = q.genLayout || null;
  const tWith = [];
  for (const [name, n] of Object.entries((lay && lay.targetWith) || {})) {
    for (let k = 0; k < (Number(n) || 0); k++) {
      const i = members.map((m) => m.name).lastIndexOf(name);
      if (i < 0) { missing.push(`${name} (genLayout.targetWith: not among the quest's enemies)`); break; }
      const [m] = members.splice(i, 1);
      const last = tWith[tWith.length - 1];
      if (last && last.enemyId === m.enemyId) last.n++;
      else tWith.push({ name, enemyId: m.enemyId, n: 1, reward: 1 });
    }
  }
  // groups: the members in record order, at most GEN_GROUP_MAX per group, same enemy id merged ({name, enemyId, n, reward 1: the
  // no-drop row, the data-hole quests have no drop rows})
  const groups = [];
  for (let i = 0; i < members.length; i += GEN_GROUP_MAX) {
    const g = [];
    for (const m of members.slice(i, i + GEN_GROUP_MAX)) {
      const last = g[g.length - 1];
      if (last && last.enemyId === m.enemyId) last.n++;
      else g.push({ name: m.name, enemyId: m.enemyId, n: 1, reward: 1 });
    }
    groups.push(g);
  }
  const room = (q.wikiRooms || [])[0] || ((q.room || [])[0] || {}).name || null;
  // thumbRoomCodes (Part 5 Task 4 follow-up): the room of the donor stage row's thumbId (room*10000 + variant*100 + sub, the quest's
  // start room) comes before the khuxwiki room-name codes
  const roomCodes = [...new Set([...(q.thumbRoomCodes || []), ...(room ? ((q.wikiRoomCodes || {})[room] || []) : [])])];
  const entry = { stageId, world: q.worldId, name: q.name, room, roomCodes, target, targetId, level: q.level || 1,
    enemies: groups, treasures: [], rooms: 1 };
  if (lay) {
    entry.layout = { room: lay.room, start: lay.start, groups: lay.groups || [], target: lay.target || [], source: lay.source || null };
    if (lay.arena) entry.layout.arena = lay.arena;
    entry.targetWith = tWith;
  }
  const enemies = [...groups.flat().concat(tWith).map((m) => ({ id: m.enemyId, name: m.name, level: q.level, count: m.n, reward: 1, target: false })),
    ...(targetId ? [{ id: targetId, name: target, level: q.level, count: 1, reward: 1, target: true }] : [])];
  return { entry, enemies, targets: targetId ? [{ id: targetId, name: target }] : [], missing: [...new Set(missing)], ambiguous };
}

// Completion rewards of the records (Part 5 Task 3: EV-0941 completionReward, The Keyblade War Challenge Campaign, notice 61226):
// merged into the bonus list (opts.bonus, the private community_bonus.json) entry with the same censusId and noticeId, or added;
// the record's census id goes into alsoIn (its quests are counted too) and its questUnion {quest name: null | {Union: donor stage
// id}} with it (unionRule: only the player's own Union version counts). Only selected records.
function mergeCompletion(bonus, records, selected) {
  const out = (bonus || []).map((b) => ({ ...b }));
  for (const rec of records) {
    const cr = rec.completionReward;
    if (!cr || !selected(rec)) continue;
    let b = out.find((x) => x.censusId === cr.censusId && x.noticeId === cr.noticeId);
    if (!b) { b = { ...cr }; out.push(b); }
    b.alsoIn = [...new Set([...(b.alsoIn || []), rec.censusId])];
    if (cr.questUnion) b.questUnion = cr.questUnion;
  }
  return out;
}

// records, config (event_config.json), master {stage, evStage, enemy, reward?, sphere tables?, item tables?} without our own rows,
// ids (event_ids.json), anchors, maps (null: no map check, unit tests; else {status: Map(mapKey -> {status, why}), poi: {mapKey: poi}}
// of import_event_stages.py), boardSets (null: no event board; else the board sets {sets} of KHUX_EVENT_BOARDS)
// -> {evStage, stage, reward, sphere, sphereArray, sphereMasu, poi, maps, ids, boardReport, index: {entries, reasons, boardSets}}
// opts: {dramas} the drama ids available in our resources (a list or a Set; checked against quizDramas)
function buildEvents(records0, config, master, ids, anchors = {}, maps = null, boardSets = null, opts = {}) {
  const records = applyDatesOf(records0);
  const dramas = opts.dramas ? new Set(opts.dramas) : null;
  checkRanges(master, config);
  const { ids: allIds, anchors: allAnchors } = allocateIds(records, ids, config, anchors);
  // board sets: census id -> set key (sets[].censusIds); every board numbered (append-only), rows kept for the sets handed out
  const sets = (boardSets && boardSets.sets) || [];
  const setOf = new Map();
  for (const st of sets) {
    for (const c of st.censusIds || []) {
      if (setOf.has(c) && setOf.get(c) !== st.setKey) throw new Error(`events: ${c} feeds two board sets (${setOf.get(c)}, ${st.setKey})`);
      setOf.set(c, st.setKey);
    }
  }
  if (boardSets) {
    for (const rec of records) {
      if (rec.boardSet && setOf.get(rec.censusId) !== rec.boardSet) {
        throw new Error(`events: ${rec.censusId} has boardSet ${rec.boardSet} but the board sets list it under ${setOf.get(rec.censusId) || 'none'}`);
      }
      // a challenge event's own boardSetKey (Part 4, the month's set, cited in the record): the board sets may not say otherwise
      if (rec.boardSetKey && setOf.has(rec.censusId) && setOf.get(rec.censusId) !== rec.boardSetKey) {
        throw new Error(`events: ${rec.censusId} has boardSetKey ${rec.boardSetKey} but the board sets list it under ${setOf.get(rec.censusId)}`);
      }
      // ... nor lack it (fix round 1, M3: a typo would send the coins to a balance no board ever reads)
      if (rec.boardSetKey && !sets.some((st) => st.setKey === rec.boardSetKey)) {
        throw new Error(`events: ${rec.censusId} has boardSetKey ${rec.boardSetKey}, which is not a set of the board sets (KHUX_EVENT_BOARDS)`);
      }
    }
  }
  const eb = boardSets ? eventBoards.buildEventBoards({ sets, master, ids: allIds }) : null;
  if (eb) allIds.boards = eb.ids.boards;
  const builtBoards = (k) => ((eb && eb.bySet[k]) || []);
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
  const payable = payableOf(config);
  const quizTypes = new Set(config.quizTypes || ['QUIZ']);
  const builtQuests = new Map(); // donor stage id -> {stageId, censusId, sig}: the same quest in a later record is served by that row
  const reasonText = config.reasonText || {};
  const textOf = (r) => { if (!reasonText[r]) throw new Error(`events: reason ${r} has no reasonText in event_config.json`); return reasonText[r]; };
  // name lookups of the generated maps (genMapOf): the master's enemy rows without the event rows (make-event-enemies.js: an event
  // row never answers a name lookup; opts.eventEnemyIds in the tests), built on first use
  let genLook = null;
  const lookGen = () => {
    if (genLook) return genLook;
    const evIds = opts.eventEnemyIds ? new Set(opts.eventEnemyIds) : require('./make-event-enemies').eventIds();
    const byName = new Map();
    for (const e of master.enemy || []) {
      if (evIds.has(e.enemyId) || !e.name) continue;
      const k = String(e.name).trim().toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(e.enemyId);
    }
    for (const v of byName.values()) v.sort((a, b) => a - b);
    const rowOf = new Map((master.enemy || []).map((e) => [e.enemyId, e]));
    const statsOf = (id) => { const e = rowOf.get(id) || {}; return JSON.stringify([e.hp, e.attack, e.defense, e.baseLv, e.validGrowth]); };
    genLook = { byName: (n) => byName.get(String(n).trim().toLowerCase()) || [], nameOf: (id) => names.get(id) || null, statsOf };
    return genLook;
  };
  const aliases = config.rewardTypeAliases || null;
  const out = { evStage: [], stage: [], reward: [], sphere: [], sphereArray: [], sphereMasu: [], poi: {}, maps: [], genMaps: [], ids: allIds, anchors: allAnchors, skipped: [],
    boardReport: eb ? eb.report : null, index: { entries: [], reasons: {}, boardSets: {} } };
  const used = new Set();
  const builtMaps = new Map(); // map key -> our stage id built on it in this run

  // eventType served on /stage/event (bench 08-11): the client turns 1 into the board mode with the «Event Boards» button and 2 into
  // the raid mode (Raid Boards); original videos show no button on the quest list of a non-board event (Defeat Titan, donor 1).
  // A row of an entry whose board set is handed out and whose donor value is the board type (1): config.boardEventType (1), the Event
  // Boards button. A feeder with another donor value (a challenge event, donor 3) keeps it: no button. Otherwise a donor value in
  // config.servedEventTypes stays, except the board type, and anything else gives config.eventType (3, plain list); the donor value
  // stays in origEventType.
  const servedType = (t, boardSet) => {
    if (boardSet && t === config.boardEventType) return config.boardEventType;
    return Number.isInteger(t) && t !== config.boardEventType && (config.servedEventTypes || []).includes(t) ? t : config.eventType;
  };
  // processing order (Part 4 Task 4): the records numbered first come first, by the lowest stage number of their quests
  // (event_ids.json is append-only), so a quest served before keeps its map and its stage row when a newer record has the same
  // quest (the newer one shares it, sharedWith) or the same map key (the newer one waits, mapKeyUsed), whatever the file order.
  // The outputs are put back in record order after the loop.
  const rankOf = (rec) => Math.min(Infinity, ...(rec.quests || []).map((q) => allIds.entries[questKey(rec, q, allAnchors[rec.censusId])] || Infinity));
  const order = records.map((rec, i) => ({ rec, i, k: rankOf(rec) })).sort((a, b) => a.k - b.k || a.i - b.i);
  const ixMap = new Map();
  let recIx = 0;
  const put = (arr, obj) => { ixMap.set(obj, recIx); arr.push(obj); };
  for (const { rec, i } of order) {
    recIx = i;
    if (!selected(rec)) { put(out.skipped, { censusId: rec.censusId, reason: 'notSelected' }); continue; }
    const evStageId = config.evStageBase + allIds.rows[rec.censusId];
    const donorTypes = [...new Set((rec.evStage || []).map((r) => r.eventType))];
    const entry = { censusId: rec.censusId, evStageId, name: rec.name, type: rec.type, start: rec.start, end: rec.end, stageIds: [], useAp: null, label: 'original', labels: [],
      noticeIds: rec.notices || [], banner: `/web/event/img/v${config.imgVersion}/${evStageId}.png`, origEventType: donorTypes.length === 1 ? donorTypes[0] : donorTypes,
      eventType: servedType(donorTypes.length === 1 ? donorTypes[0] : null, null), boardSet: null,
      available: false, why: null, quests: [] };
    if (setOf.has(rec.censusId)) entry.boardSetKey = setOf.get(rec.censusId);
    else if (rec.boardSetKey) entry.boardSetKey = rec.boardSetKey;
    if (rec.sharedWith) entry.sharedWith = rec.sharedWith;
    if (rec.noQuests) entry.noQuests = rec.noQuests;
    // Part 5 Task 3: the Event Catalog name of a record whose catalogue row the original banner names otherwise (EV-1089, banner
    // «Challenge Organization XIII Pt.1»; event_ids.json keys unchanged), and the record a datesOf line dated
    if (rec.catalogName) entry.catalogName = rec.catalogName;
    if (rec.datesFrom) entry.datesFrom = rec.datesFrom;
    // a second notice of an event (scheduleLineOf, Part 5 call 4: EV-0648 / EV-0678 beside EV-0647 / EV-0679, EV-0913 beside EV-0929):
    // never a row, a card or a catalogue row of its own (one card per event); its quests, if any, are the other record's
    const lineOf = rec.scheduleLineOf ? (typeof rec.scheduleLineOf === 'object' ? rec.scheduleLineOf.censusId : rec.scheduleLineOf) : null;
    if (lineOf) entry.scheduleLineOf = lineOf;
    // a record that builds no quest of its own: noQuests (board, coin, undated), a shared notice (built with the other row), no date
    const noBuild = rec.noQuests || (lineOf ? 'scheduleLine' : rec.sharedWith ? 'shared' : (!rec.start ? 'undated' : null));
    if (noBuild) {
      entry.reason = noBuild;
      entry.why = textOf(noBuild);
      put(out.index.entries, entry);
      continue;
    }
    const labels = new Set();
    // short windows of the donor rows: open the whole Pacific day (label wholeDay, not original). A `shortWindow` record whose rows
    // are all whole days (the Surprise events) was open that whole Pacific day in the original too: oneDay, no label
    const shortDays = new Set();
    let cutWindow = false;
    for (const r of rec.evStage || []) {
      if (!shortWindowRow(rec, r, config.shortWindowHours)) continue;
      shortDaysOf(r, config.shortWindowHours).forEach((d) => shortDays.add(d));
      if (isShort([r.startTime, r.endTime], config.shortWindowHours)) cutWindow = true;
    }
    if (shortDays.size) {
      entry.days = [...shortDays].sort();
      if (rec.shortWindow && !cutWindow) entry.oneDay = true;
      else labels.add('wholeDay');
    }

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
    const donorRows = donorRowsOf(rec);
    const srcOf = new Map(); // index quest -> its record quest
    // the Union of a quest (unionQuests: donor stage id -> Union id), the player's own Union version only (routes-events.js)
    const unionOfStage = new Map();
    for (const [qname, byUnion] of Object.entries(rec.unionQuests || {})) {
      for (const [u, sid] of Object.entries(byUnion || {})) unionOfStage.set(sid, unionIdOf(u, `${rec.censusId} unionQuests «${qname}»`));
    }
    for (const q0 of rec.quests || []) {
      const key = questKey(rec, q0, allAnchors[rec.censusId]), stageId = config.stageBase + allIds.entries[key];
      // a quest with no original map in any source (map.source 'generate', Part 5 call 1): its own generated map, stageBinId = its
      // own stage id (as make-special.js); a JP 4.3.1 map of the same quest found by content (map.source 'jpTwin'): label jpTwinMap,
      // and levelShifted when the same layout is used at the quest's own level (map.levelShifted, user 10-11-2026)
      // A levelShifted map is a copy of the JP file with every enemy level shifted: it gets its own key (its own stage id, the JP
      // file in fromKey for recon/tools/import_event_stages.py), since the JP file itself may be the own map of another quest at its
      // original level (Demyx II 66950, the Daily XIII maps)
      const srcMap = (q0.map || {}).source, gen = srcMap === 'generate', shifted = !!(q0.map || {}).levelShifted;
      const mapKey = gen || shifted ? stageId : mapKeyOf(q0);
      const fromKey = shifted ? mapKeyOf(q0) : null;
      const qLabels = labelIds(q0.label, config.labelPhrases);
      const ensure = (l) => { if (!qLabels.includes(l)) qLabels.push(l); };
      if (gen) { ensure('wikiRoom'); const k = qLabels.indexOf('mapIncomplete'); if (k >= 0) qLabels.splice(k, 1); }
      if (srcMap === 'jpTwin') ensure('jpTwinMap');
      if ((q0.map || {}).levelShifted) ensure('levelShifted');
      const swapped = swapEnemies(q0, (config.mapEnemySwaps || {})[String(fromKey || mapKey)], names);
      if (swapped) qLabels.push('wwEnemy');
      // AP of the khuxwiki page of this run over the surviving stage row (private builder rule, conflict recorded in the record)
      if ((q0.conflicts || []).some((c) => c.kind === 'ap' && c.resolution === 'khuxwiki')) qLabels.push('wikiAp');
      let q = swapped || q0;
      const wiki = qLabels.includes('wikiQuest');
      const { row: donorRow, guess: rowGuess } = rowOfQuest(donorRows, q0);
      const item = { key, donorStageId: q.stageId, donorRow: donorRow ? donorRow.eventStageId : null, ...(rowGuess ? { rowGuess: true } : {}), stageId, name: q.displayName || q.name, ap: q.ap, level: q.level, window: q.window || null, served: false, status: NOT_SERVED,
        why: null, labels: qLabels, mapKey, mapStatus: gen ? 'generated' : (q.map || {}).status || null };
      if (q.window && isShort(q.window, config.shortWindowHours)) item.days = daysOf(q.window);
      if (unionOfStage.has(q0.stageId)) item.union = unionOfStage.get(q0.stageId);
      // a quest of a datesOf target that the line does not name opens on its own original day (applyDatesOf)
      if (rec.datesOfQuests && !rec.datesOfQuests.includes(q0.stageId)) item.openFrom = rec.origStart;
      if ((q0.map || {}).levelShifted) { const ls = q0.map.levelShifted; item.levelShift = { from: ls.from, to: ls.to, delta: ls.delta }; }
      entry.quests.push(item);
      srcOf.set(item, q0);
      qLabels.forEach((l) => used.add(l));
      if (raidish) { item.reason = 'raidSpecial'; item.why = 'raid or Special quest'; continue; }
      // a quest rebuilt from the wiki page only: with no map key or no enemy id there is nothing to build
      if (wiki && (!Number.isInteger(mapKey) || !(q.enemies || []).some((e) => Number.isInteger(e.id)))) { item.reason = 'wikiEmpty'; item.why = textOf('wikiEmpty'); continue; }
      // an objective known only as text (code null): held with its text, never a stopgap code (plan Global Constraints)
      const unmapped = (q.objectives || []).filter((o) => o.code === null || o.code === undefined);
      if (unmapped.length) { item.reason = 'objectiveUnmapped'; item.why = `${textOf('objectiveUnmapped')} (${unmapped.map((o) => `«${o.text || '?'}»`).join('; ')})`; continue; }
      let genEntry = null;
      if (gen) {
        // no world: no room to generate the map in
        if (!Number.isInteger(q.worldId)) { item.reason = 'wikiEmpty'; item.why = textOf('wikiEmpty'); continue; }
        // the JP table names a «variant» target (亜種: the Ω form, Part 5 Task 2) where the record keeps the plain khuxwiki name: the
        // plain row would be another enemy (plan: a variant is its own enemy, never substituted); held until the record names the Ω row
        const tname = ((q.targets || [])[0] || {}).name || '';
        const jpT = String((q.jpTable || {}).target || '');
        if (/variant/i.test(jpT) && !/Ω/.test(tname)) { item.reason = 'enemyMissing'; item.why = `enemies not in the master: ${tname} variant (JP table «${jpT}»: the Ω form, not named in the record)`; continue; }
        const g = genMapOf(q, stageId, lookGen());
        if (g.missing.length) { item.reason = 'enemyMissing'; item.why = `enemies not in the master: ${g.missing.join(', ')}`; continue; }
        if (g.ambiguous.length) {
          item.reason = 'enemyAmbiguous';
          item.why = `${textOf('enemyAmbiguous')} (${g.ambiguous.map((a) => `${a.name}: ${a.ids.join(', ')}`).join('; ')})`; continue;
        }
        // «Collect all materials» needs materials on the map: the khuxwiki pages give none for a generated map, so the objective
        // could never be met as the original (nothing half-served)
        const chests = (q.objectives || []).filter((o) => o.code === 18);
        if (chests.length) { item.reason = 'mapUnusable'; item.why = `map not usable: a generated map has no materials for «${chests[0].text}» (no treasure on the khuxwiki page)`; continue; }
        genEntry = g.entry;
        q = { ...q, enemies: g.enemies, targets: g.targets };
      }
      // an enemy or target without an integer id cannot be looked up: on an unusable map the map is the cause, else it is listed by name
      const noId = wiki ? [] : [...new Set([...(q.enemies || []), ...(q.targets || [])].filter((e) => !Number.isInteger(e.id)).map((e) => `${e.name || 'unnamed'} (no id)`))];
      const missing = [...enemyIdsOf(q).filter((id) => Number.isInteger(id) && !enemies.has(id)), ...noId];
      if (missing.length) {
        const rep = maps ? maps.status.get(mapKey) : null;
        const stat = (q.map || {}).status;
        const unusable = maps ? (!rep || rep.status !== 'imported') : (stat !== undefined && stat !== null && stat !== 'ok');
        if (unusable && missing.length === noId.length) { item.reason = 'mapUnusable'; item.why = `map not usable: ${stat || (rep && rep.status) || 'not imported'}`; continue; }
        item.reason = 'enemyMissing'; item.why = `enemies not in the master: ${missing.join(', ')}`; continue;
      }
      // a quest whose khuxwiki objective text contradicts the donor code (private record, Task 1 ruling): held until confirmed
      if ((q0.objectiveMismatch || []).length) { item.reason = 'objectiveMismatch'; item.why = textOf('objectiveMismatch'); continue; }
      // rewards (Part 4 Task 4): our item ids, a type we cannot pay holds the quest (never passed to the client), Boosters later
      const paid = remapItems(aliasRewardTypes(q, aliases), resolveItem, payable);
      if (paid.unknownTypes.length) { item.reason = 'rewardTypeUnknown'; item.why = `${textOf('rewardTypeUnknown')} (${paid.unknownTypes.join('; ')})`; continue; }
      if (paid.missing.length) { item.reason = 'rewardItemMissing'; item.why = `${textOf('rewardItemMissing')} (${paid.missing.join('; ')})`; continue; }
      q = paid.q;
      // «Booster only»: no objective or first-clear reward but Boosters. Drops are not counted (fix round 1, M5: a quest with drops
      // and only a Booster objective is held too; docs/notes/events.md)
      const otherRewards = (q.objectives || []).filter((o) => (o.reward || {}).type).length + (q.firstClear || []).length;
      if (paid.boosters.length && !otherRewards) { item.reason = 'boosterOnly'; item.why = textOf('boosterOnly'); continue; }
      // a quiz quest asks its question on a board shown in its before drama: served only with that drama (config quizDramas)
      const dr = q.drama || {};
      const quiz = quizTypes.has(rec.type) && !!(dr.before || (dr.beforeIds || []).length);
      const quizDrama = quiz ? quizDramaOf(config, key, dramas) : null;
      // the bookkeeping of a served quest (its own stage row, or the row of the same quest in an earlier record)
      const coins = [...(q.objectives || []).map((o) => o.reward || {}), ...(q.firstClear || []), ...((q.drops || {}).enemies || []).flatMap((e) => e.rows || []),
        ...((q.drops || {}).chests || []).flatMap((e) => e.rows || [])].some((x) => x.type === COIN_TYPE);
      const markServed = (sid) => {
        item.served = true; item.status = 'served';
        if (sid !== stageId) item.stageId = sid;
        if (!entry.stageIds.includes(sid)) entry.stageIds.push(sid);
        apMin = apMin === null ? q.ap : Math.min(apMin, q.ap);
        if (paid.boosters.length) { item.boosters = paid.boosters.map((x) => ({ ...x })); item.labels.push('boosterLater'); }
        if (quizDrama && quizDrama.label) item.labels.push(quizDrama.label);
        item.labels.forEach((l) => { labels.add(l); used.add(l); });
        const offIds = quizDrama ? [] : dr.beforeIds || [];
        if ((dr.before && !quizDrama) || dr.after) { item.drama = { beforeIds: offIds, afterIds: dr.afterIds || [] }; labels.add('dramaOff'); }
        // Event Coins go to the entry's board set (boardSetKey); without one they are logged, not paid (noBoardSet)
        if (coins) labels.add(entry.boardSetKey ? 'eventCoins' : 'noBoardSet');
      };
      // the same quest in an earlier record (a rerun: same donor stage, same values): served by that stage row (sharedWith); its
      // objectives are paid once, as any quest's
      const sig = questSig(q, mapKey);
      const twin = hasStage(q0) ? builtQuests.get(q0.stageId) : null;
      // a quest paying Event Coins is shared only between entries of the same board set (fix round 1, I2: its coins go to the set
      // of the entry that built it); otherwise the later one waits (mapKeyUsed below)
      const sameSet = !coins || (twin && (twin.setKey || null) === (entry.boardSetKey || null));
      if (twin && twin.censusId !== rec.censusId && twin.sig === sig && !quiz && sameSet) {
        item.sharedWith = twin.censusId;
        markServed(twin.stageId);
        continue;
      }
      const clash = byMap.get(mapKey);
      if (clash) { item.reason = 'mapKeyUsed'; item.why = `map key ${mapKey} is the map of stage ${clash.stageId}`; continue; }
      // a generated map (genMapOf): listed in event_gen_maps.json (recon/tools/gen_story_maps.py, config key `events`), served or
      // not; with the map report (live run) served only once gen_story_maps.py has written it (maps.generated, its report): a stage
      // row never points at a map file the resources do not have. Its POI (no drops: reward row 1) is written by gen_story_maps.py
      if (gen) {
        put(out.genMaps, { ...genEntry, censusId: rec.censusId });
        if (maps && !(maps.generated || new Set()).has(stageId)) {
          item.reason = 'mapUnusable'; item.why = 'map not usable: generated map not built yet (recon/tools/gen_story_maps.py, config key events)'; continue;
        }
      }
      // difficulty variants of one record share a donor map (same stageBinId, map and POI written once: the POI holds only the
      // uid -> reward rows of the map file, the level of a variant is its stage row's addLevel); another record or other drops: not served
      const prior = gen ? null : builtMaps.get(mapKey);
      const dropsKey = JSON.stringify(q.drops || null);
      // quiz answer maps (Part 4 Task 6, coordinator ruling): every original quiz run sent its stages to the same answer maps
      // (720510 / 720520 / 720530, 740260-740262), so a quiz stage of another quiz record shares the map key when the drops are equal
      const quizShare = !!(prior && quiz && prior.quiz && prior.dropsKey === dropsKey);
      // Surprise event maps (user 10-11-2026): every Surprise run used the same map (741710; 743840 for the Holiday Draw Tickets),
      // so a quest of another `shortWindow` record shares the map key whatever its objective rewards (each keeps its own stage row);
      // the drops are in the shared map file, so they must still be equal (the check below)
      const surpriseShare = !!(prior && rec.shortWindow && prior.shortWindow);
      // a JP twin map (Part 5 Task 3, map.source 'jpTwin': the map of the same quest, same enemies, counts, target and level) may be the
      // own map of another record's quest (the Daily XIII maps): one map file for both, so the drops must be equal (the check below);
      // data-hole records only (rec.dataHole, fix round 1), as binShare
      const twinShare = !!(prior && rec.dataHole && (srcMap === 'jpTwin' || prior.jpTwin));
      // a record rebuilt from the surviving stage rows of the 2016-17 data hole (rec.dataHole, Part 5): the original stage row of a
      // quest loaded another stage's map (its stageBinId: the Daily XIII quests of EV-0333 on the maps of the monthly runs, user
      // 10-11-2026), so it shares that map file; the drops must be equal (the check below). Other records keep the Part 4 rule
      const donorBin = (q0.map || {}).stageBinId;
      const binShare = !!(prior && rec.dataHole && !gen && !shifted && Number.isInteger(donorBin) && donorBin === mapKey && donorBin !== q0.stageId);
      if (prior && prior.censusId !== rec.censusId && !quizShare && !surpriseShare && !twinShare && !binShare) { item.reason = 'mapKeyUsed'; item.why = `map key ${mapKey} is the map of event stage ${prior.stageId} too`; continue; }
      if (prior && prior.dropsKey !== dropsKey) { item.reason = 'mapKeyUsed'; item.why = `map key ${mapKey} is shared with event stage ${prior.stageId} but the drops differ`; continue; }
      // every candidate goes into event_maps.json (the list import_event_stages.py imports), served or not
      const mapItem = prior ? prior.mapItem : { stageId, key: mapKey, mapStatus: item.mapStatus, censusId: rec.censusId, world: q.worldId, name: q.name, rooms: q.room || [], level: q.level, addLevel: q.addLevel || 0,
        targets: (q.targets || []).map((t) => t.id), enemies: (q.enemies || []).map((e) => ({ name: e.name, enemyId: e.id, level: e.level, n: e.count, reward: e.reward, rooms: e.rooms || [], target: !!e.target })),
        drops: q.drops || null, served: false, ...(item.levelShift ? { levelShift: item.levelShift, fromKey } : {}),
        // map parts the JP dump dropped as dedup stubs, taken from their source part (recon/tools/import_event_stages.py partSources)
        ...((q.map || {}).partSources ? { partSources: q.map.partSources } : {}) };
      if (!prior) { builtMaps.set(mapKey, { stageId, censusId: rec.censusId, dropsKey, mapItem, quiz, shortWindow: !!rec.shortWindow, jpTwin: srcMap === 'jpTwin' }); if (!gen) put(out.maps, mapItem); }
      const newRewards = [];
      if (maps && !gen) {
        // the original map file (recon/tools/import_event_stages.py report): not imported -> not served
        const st = maps.status.get(mapKey);
        if (!st || st.status !== 'imported') { item.reason = 'mapUnusable'; item.why = mapItem.why = `map not usable: ${st ? `${st.status}, ${st.why}` : 'not imported (recon/tools/import_event_stages.py)'}`; continue; }
        // the same JP layout at the quest's own level (levelShift, event_maps.json): the import must have applied the shift to the
        // copied map (report levelShifted), else the enemies would fight at the JP level
        if (item.levelShift && !st.levelShifted) { item.reason = 'mapUnusable'; item.why = mapItem.why = `map not usable: level shift ${item.levelShift.from} -> ${item.levelShift.to} not applied by recon/tools/import_event_stages.py`; continue; }
        // the map's rooms must be of the quest's world (roomWorlds by room prefix; a prefix missing there is another world).
        // neutralRooms {prefix: home world}: fits its home world, or any world when another room of the map is of the quest's
        // world. worldExceptions {mapKey: why}: maps checked by hand (EV-0282, EV-0293: donor world kept on another world's rooms)
        const worldOf = (rm) => (config.roomWorlds || {})[rm.slice(0, 2)], neutral = config.neutralRooms || {};
        const ownRoom = (st.rooms || []).some((rm) => !(rm.slice(0, 2) in neutral) && worldOf(rm) === q.worldId);
        const off = (st.rooms || []).filter((rm) => (rm.slice(0, 2) in neutral ? !(neutral[rm.slice(0, 2)] === q.worldId || ownRoom) : worldOf(rm) !== q.worldId));
        if (off.length && !(String(mapKey) in (config.worldExceptions || {}))) {
          item.reason = 'worldMismatch'; item.why = mapItem.why = `rooms of another world than ${q.worldId}: ${[...new Set(off)].join(', ')}`; continue;
        }
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
        if (missing.length) { item.reason = 'rewardRowsMissing'; item.why = mapItem.why = `reward rows missing: ${missing.join(', ')}`; continue; }
      }
      // last, so the quiz quests held for their board are otherwise ready (the quiz boards task draws those first)
      if (quiz && !quizDrama) { item.reason = 'quizTextMissing'; item.why = textOf('quizTextMissing'); continue; }
      if (maps && !gen) {
        for (const [r, d] of newRewards) { const row = rewardRowOf(r, d.rows); ownRewards.set(r, { row, key: d.key }); put(out.reward, row); }
        out.poi[String(mapKey)] = maps.poi[String(mapKey)];
      }
      mapItem.served = true;

      const r = q.restrictions || {};
      const ref = refs.of(q.worldId);
      const room = genEntry ? { name: genEntry.room } : (q.room || [])[0] || {};
      const before = quizDrama ? quizDrama.ids : [];
      put(out.stage, { ...JSON.parse(JSON.stringify(ref)), stageId, stageBinId: mapKey, id: stageId, name: q.name, mapName: room.name || ref.mapName, useAp: q.ap,
        chapterId: Math.floor(stageId / 1000), worldId: q.worldId, onlyDrama: 0, stageKind: STAGE_KIND, noPartner: r.noPartner || 0,
        validBeforeDrama: before.length, beforeDramaId: [...before], beforeDramaType: before.map(() => 0), validAfterDrama: 0, afterDramaId: [], afterDramaType: [], branchType: 0,
        disableContinue: r.disableContinue || 0, addLevel: q.addLevel || 0, holdKeyblade: r.holdKeyblade || 0, hardmodeRequire: r.hardmodeRequire || 0,
        hardmodeName: r.hardmodeName || 'strDummy', hardmodeComparison: r.hardmodeComparison === undefined ? 1 : r.hardmodeComparison, hardmodeNum: r.hardmodeNum || 0,
        validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, ...firstClearOf(q), resetSubMission: 0,
        ...questSubs(q, key), combinedSubmissionFlag: q.combined ? 1 : 0, raidBoss: 0 });
      if (hasStage(q0) && !builtQuests.has(q0.stageId)) builtQuests.set(q0.stageId, { stageId, censusId: rec.censusId, sig, setKey: entry.boardSetKey || null, item });
      markServed(stageId);
    }
    // stagesOf (Part 5 Task 3, The Keyblade War Pt. 3, EV-0941): quests of another record that the original row of this one also
    // listed (its stage range held parts 1-2 of EV-0929). They are built once, by that record; here they are listed on this record's
    // card with sharedWith (their objectives are paid once, by stage). A quest the other record does not serve is not listed.
    if (rec.stagesOf && !raidish) {
      const so = rec.stagesOf;
      for (const sid of so.stageIds || []) {
        const t = builtQuests.get(sid);
        if (!t || t.censusId !== so.censusId) continue;
        const { row: dr } = rowOfQuest(donorRows, { stageId: sid });
        const src = t.item;
        const item = { key: src.key, donorStageId: sid, donorRow: dr ? dr.eventStageId : null, stageId: t.stageId, name: src.name, ap: src.ap, level: src.level, window: null,
          served: true, status: 'served', why: null, labels: [], mapKey: src.mapKey, mapStatus: src.mapStatus, sharedWith: t.censusId, stagesOf: true };
        entry.quests.push(item);
        if (!entry.stageIds.includes(t.stageId)) entry.stageIds.push(t.stageId);
        apMin = apMin === null ? src.ap : Math.min(apMin, src.ap);
      }
    }
    // the entry's board set: handed out when it has a built board and this entry a served quest
    if (entry.boardSetKey && !raidish && entry.stageIds.length && builtBoards(entry.boardSetKey).length) {
      entry.boardSet = entry.boardSetKey;
      entry.eventType = servedType([].concat(entry.origEventType).includes(config.boardEventType) ? config.boardEventType : null, entry.boardSet);
    }
    if (raidish) entry.why = `raid or Special ${raidish}: served by make-raid / make-special`;
    else if (!entry.stageIds.length) {
      entry.why = `no quest served yet (${entry.quests.length} ${NOT_SERVED})`;
      const rs = [...new Set(entry.quests.map((x) => x.reason))];
      if (entry.quests.length && rs.length === 1 && rs[0]) { entry.reason = rs[0]; entry.why = textOf(rs[0]); }
    }
    // one row per donor row (allocateRows); a record without donor rows: one row, as before Task 5. Short rows (Part 4 Task 4,
    // short_rows_one_per_day): the short donor rows that start on one Pacific day are ONE row (the first of them), with the quests
    // of all of them, once: a Surprise event that ran 3 times a day with the same stages is one card of that day. Every donor
    // row keeps its number (allocateRows, append-only); the merged ones get no evStage row and no card.
    const rowIds = allocateRows(rec, allIds, allAnchors, config);
    const recEnd = rec.end || null;
    const shortRow = (d) => shortWindowRow(rec, d, config.shortWindowHours);
    const groups = [], byDay = new Map();
    for (const d of donorRows) {
      if (!shortRow(d)) { groups.push([d]); continue; }
      const day = ptDate(utcMs(d.startTime));
      if (byDay.has(day)) { byDay.get(day).push(d); continue; }
      const g = [d];
      byDay.set(day, g);
      groups.push(g);
    }
    // the quests of a group: by their donor row; a short group also by the stage list / range of each member and the quest's other
    // rows (alsoInRows of the record), so the run of every day lists them
    const inGroup = (g, x) => g.some((m) => x.donorRow === m.eventStageId || (shortRow(m) && (inStageRange(m, x.donorStageId)
      || ((srcOf.get(x) || {}).alsoInRows || []).includes(m.eventStageId))));
    entry.rows = (donorRows.length ? groups : [[null]]).map((g) => {
      const d = g[0];
      const id = d ? rowIds.get(d.eventStageId) || null : evStageId;
      const quests = entry.quests.filter((x) => (d ? inGroup(g, x) : true));
      const r = { evStageId: id, donorEvStageId: d ? d.eventStageId : null, start: rec.start, end: rec.end, eventType: entry.eventType, origEventType: d ? d.eventType : entry.origEventType,
        origCategory: d ? d.eventCategory : null, parentEventStageId: d ? d.parentEventStageId || 0 : 0, bannerKey: d ? d.bannerKey || null : null,
        noticeId: d ? d.detailNoticeId || null : null, stageIds: [...new Set(quests.filter((x) => x.served).map((x) => x.stageId))], quests: quests.length, available: false };
      if (g.length > 1) r.runs = g.length;
      if (d) {
        r.eventType = servedType(d.eventType, entry.boardSet);
        // own dates (Pacific) when the record has several rows (a single row keeps the record's dates and days, as before Task 5);
        // a window past the record's end (the permanent category 1 rows, until 2037) ends with the record
        if (donorRows.length > 1 && d.startTime && d.endTime) {
          r.start = ptDate(utcMs(d.startTime));
          r.end = [...g.map((m) => ptDate(utcMs(m.endTime || m.startTime)))].sort().pop();
          if (recEnd && r.end > recEnd) r.end = recEnd < r.start ? r.start : recEnd;
          if (shortRow(d)) r.days = [...new Set(g.flatMap((m) => shortDaysOf(m, config.shortWindowHours)))].sort();
        }
      }
      if (!r.days && entry.days && !(d && donorRows.length > 1)) r.days = entry.days;
      for (const x of quests) if (x.evStageId === undefined) x.evStageId = id;
      return r;
    });
    if (!raidish && entry.stageIds.length) {
      for (const r of entry.rows) {
        if (!r.stageIds.length) continue;
        // Details of the card: the original notice of the event (event-pages.js noticePage; «not available» without its text)
        const row = evStageRow(r.evStageId, r.stageIds, { eventType: r.eventType, detailUrl: entry.noticeIds.length ? `/web/event/notice/${r.evStageId}` : '' });
        row.eventCategory = config.eventCategory;
        row.bannerUrl = `/web/event/img/v${config.imgVersion}/${r.evStageId}.png`;
        put(out.evStage, row);
        r.available = true;
      }
      entry.available = true;
      // the entry covers its built rows (a donor row may start before the census dates)
      const built = entry.rows.filter((r) => r.available);
      const lo = built.map((r) => r.start).filter(Boolean).sort()[0], hi = built.map((r) => r.end).filter(Boolean).sort().pop();
      if (lo && entry.start && lo < entry.start) entry.start = lo;
      if (hi && entry.end && hi > entry.end) entry.end = hi;
    }
    entry.useAp = apMin;
    entry.labels = [...labels];
    entry.label = entry.labels.length ? 'reconstructed' : 'original';
    entry.labels.forEach((l) => used.add(l));
    put(out.index.entries, entry);
  }
  for (const arr of [out.skipped, out.index.entries, out.maps, out.reward, out.stage, out.evStage]) arr.sort((a, b) => ixMap.get(a) - ixMap.get(b));
  // board sets handed out: their rows and the index; a member entry of a set not handed out says why (label)
  // a set is handed out only when one of its entries is served as eventType 1 (donor 1); a feeder alone does not hand it out, its
  // coins still accrue to the set (boardSetKey). The entries of a set not handed out go back to the plain list.
  const handed = new Set(out.index.entries.filter((e) => e.boardSet && e.eventType === config.boardEventType).map((e) => e.boardSet));
  for (const e of out.index.entries) {
    if (!e.boardSet || handed.has(e.boardSet)) continue;
    e.boardSet = null;
    e.eventType = servedType([].concat(e.origEventType).length === 1 ? e.origEventType : null, null);
    for (const r of e.rows) {
      r.eventType = r.donorEvStageId !== null ? servedType(r.origEventType, null) : e.eventType;
      const row = out.evStage.find((x) => x.eventStageId === r.evStageId);
      if (row) row.eventType = r.eventType;
    }
  }
  if (eb) {
    for (const st of sets) {
      if (!handed.has(st.setKey)) continue;
      const boardIds = builtBoards(st.setKey), mine = new Set(boardIds);
      out.index.boardSets[st.setKey] = { boardIds, chains: Object.fromEntries(Object.entries(eb.chains).filter(([id]) => mine.has(Number(id)))), censusIds: [...(st.censusIds || [])] };
      out.sphere.push(...eb.sphereRows.filter((r) => mine.has(r.sphereBoardId)));
      out.sphereArray.push(...eb.arrayRows.filter((r) => mine.has(r.arryId)));
      out.sphereMasu.push(...eb.masuRows.filter((r) => mine.has(r.masuId)));
    }
    for (const e of out.index.entries) {
      if (!e.boardSetKey || e.boardSet || handed.has(e.boardSetKey)) continue;
      const l = builtBoards(e.boardSetKey).length ? 'noCoinSource' : 'boardsLater';
      if (!e.labels.includes(l)) e.labels.push(l);
      e.label = 'reconstructed';
      used.add(l);
    }
  }
  // community-goal bonus (user rule 10-11-2026): some 2020 events paid every player who cleared ALL their objectives a bonus sized
  // by how many players did it worldwide. opts.bonus (private community_bonus.json events: censusId, noticeId, count, tiers
  // [{min, max, rewards}] or perPlayer {type, id, name, roundUpTo}, result?, questPrefix?) -> entry.communityBonus {noticeId, count,
  // stageIds (the counted served quests), rewards (the tier the original reached), ready}: routes-events.js pays it once into the
  // Presents when every objective of those quests is cleared. No count: waiting (no rewards); a counted quest not served: not ready.
  // Label communityBonus (declared: the original count was of all players) on a ready entry. A typo in the data stops the run.
  // Fixed completion rewards (user 10-11-2026, same mechanism): kind 'completion', rewards [...] (no count, no tiers: every player
  // who completed all the challenges got them, notice 61226), quests? [name prefixes] the counted quests named by the notice ->
  // communityBonus {kind: 'completion', count: null, rewards, ready, missing?}. Ready when every prefix has a quest and every counted
  // quest is served; label completionReward (an original reward: entry label unchanged). An entry with no quest at all (an undated
  // record, quests []) is not ready (`missing` lists every prefix); a prefix list that matches none of its quests stops the run.
  // Part 5 Task 3: a completion reward may count quests of other records too (alsoIn: the record whose completionReward was merged,
  // mergeCompletion) and per Union (questUnion {quest name prefix: {Union: donor stage id}}: only the player's own Union version
  // counts, user 10-11-2026) -> communityBonus also gets byUnion {unionId: [served stage ids of its own versions]} and readyUnions
  // [unionIds whose quests are all served]; ready = every Union ready (routes-events.js pays a player of a ready Union).
  for (const b of mergeCompletion(opts.bonus, records, selected)) {
    const e = out.index.entries.find((x) => x.censusId === b.censusId);
    if (!e) throw new Error(`events: community bonus ${b.censusId} is not a record`);
    const fixed = b.kind === 'completion';
    if (b.kind && !fixed) throw new Error(`events: community bonus ${b.censusId}: unknown kind ${b.kind}`);
    const named = (q) => String(q.name || '');
    const prefixes = fixed && b.quests ? b.quests : null;
    // the quests counted: this entry's and those of the alsoIn entries (a quest listed twice, stagesOf, counted once)
    const pool = [];
    for (const x of [e, ...(b.alsoIn || []).filter((c) => c !== e.censusId).map((c) => out.index.entries.find((y) => y.censusId === c)).filter(Boolean)]) {
      for (const q of x.quests || []) if (!pool.some((p) => p.stageId === q.stageId)) pool.push(q);
    }
    const qu = (fixed && b.questUnion) || null;
    const isUnionPrefix = (p) => !!(qu && qu[p] && typeof qu[p] === 'object');
    const common = prefixes ? prefixes.filter((p) => !isUnionPrefix(p)) : null;
    const byUnion = {}, unionMissing = {};
    if (qu) {
      for (const u of Object.values(UNION_IDS)) { byUnion[u] = []; unionMissing[u] = []; }
      for (const p of (prefixes || []).filter(isUnionPrefix)) {
        for (const [uname, sid] of Object.entries(qu[p])) {
          const u = unionIdOf(uname, `community bonus ${b.censusId} questUnion «${p}»`);
          const q = pool.find((x) => x.donorStageId === sid && named(x).startsWith(p));
          if (q) byUnion[u].push(q); else unionMissing[u].push(p);
        }
      }
    }
    const unionQuests = Object.values(byUnion).flat();
    const counted = [...pool.filter((q) => (common ? common.some((p) => named(q).startsWith(p)) : !b.questPrefix || named(q).startsWith(b.questPrefix))), ...unionQuests];
    const noQuests = !pool.length;
    if (!counted.length && !(fixed && noQuests)) {
      const what = prefixes ? ` named ${prefixes.map((p) => `«${p}...»`).join(', ')}` : b.questPrefix ? ` named «${b.questPrefix}...»` : '';
      throw new Error(`events: community bonus ${b.censusId}: no quest${what}`);
    }
    let rewards = [];
    if (fixed) {
      if (!(b.rewards || []).length) throw new Error(`events: community bonus ${b.censusId}: a completion reward without rewards`);
      rewards = b.rewards.map((r) => ({ ...r }));
    } else if (b.count !== null && b.count !== undefined) {
      if (b.perPlayer) {
        const p = b.perPlayer;
        rewards = [{ type: p.type, id: p.id, num: Math.ceil(b.count / p.roundUpTo) * p.roundUpTo, name: p.name }];
      } else {
        const t = (b.tiers || []).find((x) => b.count >= x.min && (x.max === null || x.max === undefined || b.count <= x.max));
        if (!t) throw new Error(`events: community bonus ${b.censusId}: count ${b.count} is in no tier`);
        rewards = t.rewards.map((r) => ({ ...r }));
      }
      if (b.result && JSON.stringify(b.result) !== JSON.stringify(rewards)) {
        throw new Error(`events: community bonus ${b.censusId}: the result of the notice ${JSON.stringify(b.result)} is not what its rule gives ${JSON.stringify(rewards)}`);
      }
    }
    // the prefixes of the notice with no quest of the record (a part of the event not in our data)
    const missing = prefixes ? prefixes.filter((p) => !counted.some((q) => named(q).startsWith(p))) : [];
    const waiting = !rewards.length;
    let ready = !waiting && counted.length > 0 && !missing.length && counted.every((q) => q.served);
    let unionPart = {};
    if (qu) {
      const commonQ = counted.filter((q) => !unionQuests.includes(q));
      const commonOk = !waiting && !missing.length && commonQ.every((q) => q.served);
      const readyUnions = Object.keys(byUnion).map(Number).filter((u) => commonOk && !unionMissing[u].length && byUnion[u].length > 0 && byUnion[u].every((q) => q.served));
      ready = readyUnions.length === Object.keys(UNION_IDS).length;
      unionPart = { byUnion: Object.fromEntries(Object.entries(byUnion).map(([u, qs]) => [u, qs.filter((q) => q.served).map((q) => q.stageId)])), readyUnions };
    }
    e.communityBonus = { ...(b.name ? { name: b.name } : {}), noticeId: b.noticeId, ...(fixed ? { kind: 'completion' } : {}), count: waiting || fixed ? null : b.count,
      stageIds: [...new Set(counted.filter((q) => q.served && !unionQuests.includes(q)).map((q) => q.stageId))], rewards, ready, ...unionPart,
      ...(b.questPrefix && !fixed ? { questPrefix: b.questPrefix } : {}), ...(missing.length ? { missing } : {}), ...(waiting ? { waiting: true } : {}) };
    if ((ready || (unionPart.readyUnions || []).length) && fixed) { e.labels.push('completionReward'); used.add('completionReward'); }
    else if (ready) { e.labels.push('communityBonus'); e.label = 'reconstructed'; used.add('communityBonus'); }
  }
  // shared notices: the stage rows of the row they share (built once), no evStage row of their own
  for (const e of out.index.entries) {
    if (!e.sharedWith) continue;
    const target = out.index.entries.find((x) => x.censusId === e.sharedWith);
    if (target) Object.assign(e, { stageIds: [...target.stageIds], useAp: target.useAp, sharedEvStageId: target.evStageId });
    else if (!records.some((r) => r.censusId === e.sharedWith)) throw new Error(`events: ${e.censusId} shares with ${e.sharedWith}, which is not in the records`);
    else console.warn(`events: ${e.censusId} shares with ${e.sharedWith}, which is not selected: no quests for it`);
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
  for (const e of out.index.entries) for (const r of [e.reason, ...e.quests.map((x) => x.reason)]) if (r && !REASONS.includes(r)) throw new Error(`events: unknown reason ${r}`);
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
const IDS_NOTE = 'Append-only: event ids live in saves and in the master. Numbers are written by make-events.js; a key that disappears stays, its number is never reused. rows: evStage = evStageBase + r (the record; it stays on one donor row of the record, frozen in the private sidecar). subRows ("<censusId>/r+<offset of a donor evStage row from that row>"): the other original evStage rows of the record, same number space. entries ("<censusId>/+<offset from the anchor of the record>", no donor id; anchors in the private event_anchors.json next to the records): stage = stageBase + n (bases in event_config.json).';
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
// Generated maps (Part 5 Task 3): the report of recon/tools/gen_story_maps.py run with the `events` key (its entries with event
// true and a stageId; KHUX_EVENT_GEN_REPORT overrides <dir>/gen_report.json). Absent: no generated-map quest is served.
const GEN_REPORT = (dir) => process.env.KHUX_EVENT_GEN_REPORT || path.join(dir, 'gen_report.json');
function loadMaps(dir) {
  const gen = readJson(GEN_REPORT(dir), null);
  const generated = new Set((Array.isArray(gen) ? gen : []).filter((r) => r && r.event && Number.isInteger(r.stageId)).map((r) => r.stageId));
  const rep = readJson(path.join(dir, 'report.json'), null);
  if (!rep) { console.warn(`events: no map import report in ${dir} (recon/tools/import_event_stages.py): no event quest is served`); return { status: new Map(), poi: {}, generated }; }
  // levelShifted: the import applied the level shift of the map item (event_maps.json levelShift) to the copied map
  return { status: new Map((rep.stages || []).map((s) => [s.key, { status: s.status, why: s.why || '', rooms: s.rooms || [], levelShifted: !!s.levelShifted }])),
    poi: readJson(path.join(dir, 'stage_poi_events.json'), {}), generated };
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
  const keyOf = { stage: 'stageId', evStage: 'eventStageId', reward: 'rewardId', ...BOARD_TABLES };
  const load = (table, dflt) => {
    const mine = new Set(prev[table] || []);
    return readJson(path.join(masterDir, `${table}.json`), dflt).filter((r) => !mine.has(r[keyOf[table]]));
  };
  const had = Object.fromEntries(['reward', ...Object.keys(BOARD_TABLES)].map((t) => [t, fs.existsSync(path.join(masterDir, `${t}.json`))]));
  const master = { stage: load('stage'), evStage: load('evStage'), reward: load('reward', []), enemy: readJson(path.join(masterDir, 'enemy.json')),
    medal: readJson(path.join(masterDir, 'medal.json'), null), material: readJson(path.join(masterDir, 'material.json'), null),
    ...Object.fromEntries(Object.keys(BOARD_TABLES).map((t) => [t, load(t, [])])),
    ...Object.fromEntries(['title', 'avatarParts', 'petParts'].map((t) => [t, readJson(path.join(masterDir, `${t}.json`), [])])) };
  // the private board sets (KHUX_EVENT_BOARDS, or opts.boardSets in the tests): none -> no event board, every entry as before
  let boardSets = opts.boardSets !== undefined ? opts.boardSets : null;
  if (opts.boardSets === undefined && process.env.KHUX_EVENT_BOARDS) boardSets = readJson(process.env.KHUX_EVENT_BOARDS);
  if (!boardSets && !opts.records) console.warn('events: KHUX_EVENT_BOARDS not set (the private board sets): no event board, every entry served as a plain list');
  const idsFile = opts.idsFile || IDS_FILE;
  // the anchors sidecar: next to the records (private), or opts.anchorsFile; records given in opts without a file: game_data
  const anchorsFile = opts.anchorsFile || (opts.records ? path.join(gameData, 'event_anchors.json') : anchorsPathOf(process.env.KHUX_EVENT_SRC));
  const config = opts.config || loadConfig();
  const maps = opts.maps !== undefined ? opts.maps : (opts.records ? null : loadMaps(MAPS_DIR));
  // the drama ids available in our resources (quiz boards, quizDramas): opts.dramas, else the list file KHUX_EVENT_DRAMAS, else
  // config.availableDramas; none: a quizDramas entry stops the run
  const dramas = opts.dramas || (process.env.KHUX_EVENT_DRAMAS ? readJson(process.env.KHUX_EVENT_DRAMAS) : config.availableDramas) || null;
  // the community-goal bonus data (private): opts.bonus, else KHUX_EVENT_BONUS, else community_bonus.json in the folder above the
  // records folder (tmp/events/community_bonus.json next to tmp/events/records); none: no bonus
  let bonus = opts.bonus;
  if (bonus === undefined && !opts.records) {
    const file = process.env.KHUX_EVENT_BONUS || path.join(path.dirname(anchorsPathOf(process.env.KHUX_EVENT_SRC)), '..', 'community_bonus.json');
    const data = readJson(file, null);
    if (!data) console.warn(`events: no community bonus data (${file}): no community-goal bonus`);
    bonus = data ? data.events || [] : [];
  }
  const out = buildEvents(records, config, master, readIds(idsFile), readJson(anchorsFile, {}), maps, boardSets, { dramas, bonus });
  const added = { stage: out.stage, evStage: [...(out.catalogEvStage ? [out.catalogEvStage] : []), ...out.evStage], reward: out.reward,
    sphere: out.sphere, sphereArray: out.sphereArray, sphereMasu: out.sphereMasu };
  const clashR = out.reward.find((r) => master.reward.some((m) => m.rewardId === r.rewardId));
  if (clashR) throw new Error(`events: reward row ${clashR.rewardId} is in the master already`);
  // reward and sphere tables: written when the file is there, or when there are rows to add
  for (const [t, rows] of Object.entries(added)) if (!(t in had) || had[t] || rows.length) fs.writeFileSync(path.join(masterDir, `${t}.json`), JSON.stringify([...master[t], ...rows]));
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
  fs.writeFileSync(path.join(gameData, 'events.json'), JSON.stringify({ entries: out.index.entries, reasons: out.index.reasons, ...(out.index.catalog ? { catalog: out.index.catalog } : {}),
    boardSets: out.index.boardSets, own }, null, 1));
  fs.writeFileSync(path.join(gameData, 'event_maps.json'), JSON.stringify(out.maps, null, 1));
  // the generated maps (Part 5 Task 3): the list of recon/tools/gen_story_maps.py, config key `events` (the «special» list shape)
  fs.writeFileSync(path.join(gameData, 'event_gen_maps.json'), JSON.stringify(out.genMaps, null, 1));
  // anchors first (only grow: allocateIds never changes one), so ids are never written with keys whose anchor is not saved
  if (JSON.stringify(readJson(anchorsFile, {})) !== JSON.stringify(out.anchors)) fs.writeFileSync(anchorsFile, JSON.stringify(out.anchors, null, 1) + '\n');
  writeIds(idsFile, out.ids);
  const e = out.index.entries, qs = e.flatMap((x) => x.quests);
  console.log(`events: ${e.length} entries, ${e.filter((x) => x.available).length} with a served quest; ${qs.filter((q) => q.served).length} of ${qs.length} quests served, `
    + `${qs.filter((q) => !q.served).length} ${NOT_SERVED}; +${out.stage.length} stage, +${out.evStage.length} evStage, +${out.reward.length} reward, ${own.poi.length} POI keys, ${out.genMaps.length} generated maps listed`);
  const byReason = {};
  for (const q of qs.filter((x) => !x.served)) byReason[q.reason || 'other'] = (byReason[q.reason || 'other'] || 0) + 1;
  const entryReasons = {};
  for (const x of e) if (x.reason) entryReasons[x.reason] = (entryReasons[x.reason] || 0) + 1;
  console.log(`events: quests not served by reason ${JSON.stringify(byReason)}; entries by reason ${JSON.stringify(entryReasons)}; ${out.skipped.length} records not selected`);
  const skipped = e.filter((x) => !x.available).map((x) => `${x.censusId} (${x.why})`);
  if (skipped.length) console.log(`events: no evStage row: ${skipped.join(', ')}`);
  if (out.boardReport) {
    const bs = out.index.boardSets, byType = {};
    for (const x of e) byType[x.eventType] = (byType[x.eventType] || 0) + 1;
    console.log(`events: event boards: ${Object.keys(bs).length} sets handed out (${Object.keys(bs).join(', ') || '-'}), +${out.sphere.length} sphere rows (type 4); `
      + `${out.boardReport.unmatched.length} cells left off, ${out.boardReport.skipped.length} boards skipped; entries by eventType ${JSON.stringify(byType)}`);
    const later = [...new Set(e.filter((x) => x.boardSetKey && !bs[x.boardSetKey]).map((x) => x.boardSetKey))];
    if (later.length) console.log(`events: board sets not handed out: ${later.join(', ')}`);
  }
  const guesses = qs.filter((q) => q.rowGuess);
  if (guesses.length) console.warn(`events: ${guesses.length} quests match no donor row of their record (first row taken): ${guesses.slice(0, 8).map((q) => q.key).join(', ')}`);
  if (!out.catalogEvStage) console.warn(`events: no Event Catalog banner: the Training Grounds stage ${config.catalogStage} is not in the master (make-special first)`);
  return out;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { buildEvents, patch, readRecords, anchorsPathOf, REASONS, allocateIds, allocateRows, labelIds, daysOf, swapEnemies, dropRows, GENERATED_LABELS, NOT_SERVED,
  applyDatesOf, aliasRewardTypes, genMapOf, mergeCompletion, loadMaps, UNION_IDS };
