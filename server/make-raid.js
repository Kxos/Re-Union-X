#!/usr/bin/env node
// Master rows and index of the raids (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 5, spec
// docs/superpowers/specs/2026-11-01-raids-design.md, client facts docs/notes/raid.md). Inputs:
// - server/raid_config.json (versioned, ours) and server/raid_stats.json (versioned, our deduced ATK / DEF);
// - the private sources under KHUX_RAID_SRC (never copied into the repo): raid_census.json (calendar of record, bosses and
//   model ids), raid_values.json (weeks, quests, HP), RAID_VALUES.md (part HP), raid_rewards/CORRECTIONS.md;
// - the 2016 rows (KHUX_RAID_2016): raidEnemy, raidEnemyAttack;
// - server/game_data/raid_models.json (model completeness): available = fight && put_down. No file: every boss is
//   unavailable, with a warning. `slots` (weak points of the model) must all have a part, else the entry is `parts`.
// Older WW event raids (Task 10): the tier rows of the event families come from the census row itself (eventTierRows), their quests
// and boards from raid_rewards/b_events/event_raid_rewards.json, their 2016 rows, settings and rewards from KHUX_RAID_2016
// (docs/notes/raid.md «Older WW event raids»).
// Story raid bosses (Task 11): raids.json `story` {last, bosses, quests, conflicts, unknown} from the census story ranges and the 2016
// rows and settings of the story bosses, fought on fight stages of their own (storyPlan, buildStory; docs/notes/raid.md «Story raid bosses»).
// Japan-only raids (I-232): Raid Catalog only (jpStatus, jpTierRows); raid_config.json jpCensus corrects the census JP rows from the
// later JP research when the census is read (applyJpCensus: weekday bosses, year-end 2016, the two 2018 weekends, JP level drops).
// One entry per tier row of a census row; every WW row with week data is built (onlyCensusIds of raid_config.json is a filter
// for tests and benches, absent in the shipped file). Which rows run in the player's week is raid-calendar.js's business: it
// reads censusId, start and end of the entries. Ids come from server/raid_ids.json (versioned, append-only), because they live in
// saves and in the client's master: rows {censusId: r}, entries {"<censusId>/<tier>[+gem]": n}. A new key takes the next
// free number, a key that disappears stays and its number is never reused, a repeated number stops the run. Every WW row is
// numbered whatever the filter says.
//   evStage 8000 + r (8000 is the Raid Catalog banner, CATALOG_EV), stage 980000 + n, raidSetting 30000 + n,
//   raidEnemy body 2000000 + 10n, parts + (weakness - 1), raidReward by rewardRowId (raid-rewards.js).
// Output (own rows dropped first, the previous run's list is raids.json `own`; anything else in our ranges stops the run):
// - stage (stageKind 2, raidBoss = setting, copy of a story row of the map's world), evStage (one per census row with an
//   available tier, eventCategory and eventType 2), raidEnemy, raidSetting, raidReward, raidEnemyAttack;
// - game_data/raids.json: {entries: [...], reasons: {label: why}, own: {...}}, entries in the shape of the plan plus gemDrop,
//   hp, worldId, level; reasons comes from reconstructedWhy of raid_config.json, one per label in use;
// - evStage detailUrl /web/raid/notice/<evStageId> when game_data/raid_notices.json (make-raid-notices.js) has the census row;
// - game_data/raid_maps.json: stage list for recon/tools/gen_story_maps.py (config key "special", as special_maps.json);
// - Raid Boards (raid-boards.js, from raid_rewards/a_weekly/boards_weekly.json): sphere / sphereArray / sphereMasu rows of type 5,
//   one set per census row with a raid, ids 3000000 + n (raid_ids.json `boards`); entries carry sphereBoardIds, raids.json `boards`
//   the report (cells left off for a reward with no item, corrected costs, size).
// Wired at the end of make-game-tables.js after make-special. KHUX_RAID=0 turns it off; without the private sources it
// warns and writes nothing. After a run: maps (raid_maps.json), then raise the master revision.
//
//   node server/make-raid.js [master folder]
//   node server/make-raid.js --stats       rewrites server/raid_stats.json from its inputs
//   node server/make-raid.js --ids         numbers new keys in server/raid_ids.json, without touching the master
'use strict';

const fs = require('fs');
const path = require('path');
const { coinRows, rewardRowId, CONFIG: REWARDS } = require('./raid-rewards');
const { objectiveCodes } = require('./make-story-oltre');
const raidBoards = require('./raid-boards');
const raidWindows = require('./raid-windows');
const { RAID_IMG_VERSION } = require('./routes-raid'); // same versioned card URL as /stage/event

const STAGE_KIND = 2;
const RANGES = { stage: ['stageId', 980000, 989999], evStage: ['eventStageId', 8000, 8999], raidSetting: ['raidSettingId', 30000, 39999],
  raidEnemy: ['raidEnemyId', 2000000, 2999999], raidReward: ['raidRewardId', 200000000, 299999999],
  sphere: ['sphereBoardId', raidBoards.BOARD_BASE, raidBoards.BOARD_MAX], sphereArray: ['arryId', raidBoards.BOARD_BASE, raidBoards.BOARD_MAX],
  sphereMasu: ['masuId', raidBoards.BOARD_BASE, raidBoards.BOARD_MAX] };
// master tables read for the board rewards (name -> item), never rewritten
const ITEM_TABLES = ['medal', 'material', 'petParts', 'avatarParts', 'title'];
const EV_BASE = 8000, EGG_ID = 100, EGG = 'Eggcognito', ENEMY_REWARD = 1;
// Raid Catalog banner (Task 9): evStage 8000 (EV_BASE, never a census row), Details -> /web/raid/catalog. An evStage needs a quest
// and a tap always opens the banner's quest list, so it holds the Training Grounds of the Special Catalog (make-special.js
// TRAINING_STAGE): our own quest (no Lux, no drops), never raid content. Emitted only when that stage row is in the master.
const CATALOG_EV = EV_BASE, CATALOG_STAGE = 970000, CATALOG_URL = '/web/raid/catalog';
// Details of a raid banner: /web/raid/notice/<evStageId>, the original notice (game_data/raid_notices.json, git-ignored)
const NOTICE_URL = '/web/raid/notice/';
const START = '2015-01-01 00:00:00', END = '2030-12-31 23:59:59';
const DEFAULT_SRC = 'D:\\Progetto_Restauro_KH_UX\\private\\events\\sources';
const DEFAULT_2016 = 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data';
const DEFAULT_WIKI_QUESTS = 'D:\\Progetto_Restauro_KH_UX\\wiki\\quests.json';
const CAP_TIER = 'single, cap at LV 30+', SINGLE = 'single';
const GROWTH = ['expAttack', 'expSuppress', 'moneyAttack', 'moneySuppress', 'luxAttack', 'luxSuppress', 'burstAttack', 'burstSuppress', 'hpAttack', 'hpSuppress', 'guiltSuppress'];
const KNOTS = 5, SKILLS = 4, PARTS = 5;
// story ATK of a period: median of the last tranches (one late tranche has 10 enemies at 4 times the others), new period
// only above the last value by this factor
const STORY_WINDOW = 5, STORY_STEP = 1.05;

const num = (s) => parseInt(String(s || '').replace(/,/g, ''), 10) || 0;
const pad = (list, n) => [...list, ...Array(n).fill(0)].slice(0, n);
const blank = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Array.isArray(v) ? v.map(() => 0) : typeof v === 'string' ? '' : 0]));
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const median = (list) => {
  const a = [...list].sort((x, y) => x - y), m = a.length >> 1;
  return !a.length ? 0 : a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Value of a growth array at a level: linear between the knots, flat outside (how the client reads baseLv).
function atLevel(row, field, lv) {
  const n = row.validGrowth, b = row.baseLv, a = row[field] || [];
  if (lv <= b[0]) return a[0] || 0;
  for (let i = 1; i < n; i++) if (lv <= b[i]) return (a[i - 1] || 0) + ((a[i] || 0) - (a[i - 1] || 0)) * (lv - b[i - 1]) / (b[i] - b[i - 1]);
  return a[n - 1] || 0;
}

// CORRECTIONS.md: «5 Gear Golem rows dated 2020-02-22 are 2021-02-22» and the boards missing from the census.
function parseCorrections(md) {
  const text = String(md || '');
  const dates = [...text.matchAll(/(\d+) (.+?) rows dated (\d{4}-\d{2}-\d{2}) are (\d{4}-\d{2}-\d{2})/g)].map((m) => ({ boss: m[2], from: m[3], to: m[4] }));
  const boards = {};
  for (const line of text.split(/\r?\n/).filter((l) => /boards missing from the census/.test(l))) {
    let ids = [];
    for (const m of line.matchAll(/`([^`]+)`|\(([^)]+)\)/g)) {
      if (m[1]) ids.push(m[1]);
      else { for (const id of ids) boards[id] = m[2].split(/,\s*/); ids = []; }
    }
  }
  return { dates, boards };
}
function correctedWeeks(list, fixes) {
  return (list || []).map((w) => {
    const fix = fixes.find((x) => x.boss === w.boss && x.from === w.start);
    if (!fix) return w;
    const shift = dayMs(fix.to) - dayMs(fix.from);
    return { ...w, start: fix.to, ...(w.end ? { end: isoDay(dayMs(w.end) + shift) } : {}) };
  });
}

// RAID_VALUES.md, by «### Boss» heading: «hp body: N» followed by «hp part(s): A [and B] derived ...» -> {boss: [{date, body, parts}]}
function parsePartHp(md) {
  const out = {};
  let boss = null, body = 0;
  for (const line of String(md || '').split(/\r?\n/)) {
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) { boss = h[1]; body = 0; continue; }
    const b = /^\| hp body: ([\d,]+)/.exec(line);
    if (b) { body = num(b[1]); continue; }
    const p = /^\| hp parts?: ([\d,]+)(?: and ([\d,]+))? derived[^|]*\|[^|]*\|[^|]*\| (\d{4}-\d{2}-\d{2}) \|/.exec(line);
    if (p && boss && body) (out[boss] ||= []).push({ date: p[3], body, parts: [p[1], p[2]].filter(Boolean).map(num) });
  }
  return out;
}

// Monday of the week holding the midpoint between the last sighting of a value and the first of the next one.
function stepDate(a, b) {
  const mid = (dayMs(a.to || a.from) + dayMs(b.from)) / 2;
  const wd = (new Date(mid).getUTCDay() + 6) % 7;
  return isoDay(Math.floor(mid / 86400000) * 86400000 - wd * 86400000);
}
// HP of a tier on a date from the era table: {hp, step} (step: the week lies outside the range this value was seen in, so
// the midpoint rule or an extrapolation decided it). A tier with one value never has a step.
function tierHp(values, tier, date) {
  const rows = ((values.hp_tier_era || {}).rows || []).filter((r) => r.tier === (tier === SINGLE ? CAP_TIER : tier)).sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!rows.length) return null;
  let i = 0;
  while (i + 1 < rows.length && stepDate(rows[i], rows[i + 1]) <= date) i++;
  const r = rows[i];
  return { hp: r.hp, step: rows.length > 1 && (date < r.from || (r.to && date > r.to)), first: rows[0].from };
}

function statsAt(stats, tier, date, rare) {
  const periods = stats.periods.filter((p) => p.from <= date);
  const p = periods[periods.length - 1] || stats.periods[0];
  return { atk: p.atk[tier], def: tier === 'Epic' ? stats.def.epic : rare === 2 ? stats.def.omega : stats.def.base };
}

// Three objectives of the quest page: same field layout as make-special.js. Only Raid Coin rewards exist on these pages.
function questSubs(info, coinType, where) {
  const subs = [1, 2, 3].map((i) => {
    const text = info[`naobj${i}`];
    const code = objectiveCodes(text, { enemyId: () => 0, target: 0, targetName: EGG });
    if (!code) throw new Error(`raid: ${where}: objective «${text}» has no code`);
    if (info[`naobjbonus${i}`] !== 'Raid Coin') throw new Error(`raid: ${where}: objective reward «${info[`naobjbonus${i}`]}»`);
    return { ...code, qty: num(info[`naobjbonus${i}qty`]) };
  });
  const each = (f) => subs.map(f);
  return { validSubmission: 3, submissionRequire: each((c) => c.req), submissionName: each((c) => c.name), submissionDataType: each((c) => c.dt),
    submissionIdType: each((c) => c.it), submissionId: each((c) => c.id), submissionNum: each((c) => c.n), submissionRewardType: each(() => coinType),
    submissionItemId: each(() => 0), submissionSkillType: each(() => 0), submissionSkillId: each(() => 0), submissionSkillLv: each(() => 0), submissionItemNum: each((c) => c.qty) };
}

// The master schema gives stageId int[5]: ONE row with more than 5 elements makes the server drop the whole evStage table (the
// client then never gets a new row and a missing evStage id crashes the Events list; 04-11: the 7-day Showdown of Dec 2016).
// A longer list keeps its first 5 ids and the full range in stageStartId / stageEndId; /stage/event lists the stages itself.
const EVSTAGE_MAX_STAGES = 5;
function evStageRow(evStageId, stageIdsAll, { eventType = 2, detailUrl = '' } = {}) {
  const stageIds = stageIdsAll.slice(0, EVSTAGE_MAX_STAGES);
  const row = { eventStageId: evStageId, parentEventStageId: 0, validStageId: stageIds.length, stageId: [...stageIds], validStageWidthId: 0,
    stageStartId: stageIdsAll[0], stageEndId: stageIdsAll[stageIdsAll.length - 1], resetFlag: 0, eventCategory: 2, eventType, scoreMedalListId: 0, scoreStartReward: 0,
    scoreEndReward: 0, rankingId: 0, bannerUrl: `/web/raid/img/v${RAID_IMG_VERSION}/${evStageId}.png`, mypageBanner: 0, detailUrl, startTime: START, endTime: END, endDispTime: END, boardEndTime: END };
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const d of days) row[`week${d}`] = 1;
  row.benefitId = 0;
  for (const d of days) row[`benefit${d}`] = 0;
  return Object.assign(row, { groupPattern: 0, validMinute: 0 });
}

function checkRanges(master) {
  for (const [table, [key, lo, hi]] of Object.entries(RANGES)) {
    const hit = (master[table] || []).find((r) => r[key] >= lo && r[key] <= hi);
    if (hit) throw new Error(`raid: ${table} row ${hit[key]} is inside our id range ${lo}-${hi} and is not ours`);
  }
}

const tierOf = (w, date) => (w.tier === SINGLE && date >= REWARDS.tierFrom && !w.jp ? 'Beginner' : w.tier);
const keyOf = (row, w) => `${row.id}/${tierOf(w, row.start)}${w.gem_drop ? '+gem' : ''}${w.day ? `@${w.day}` : ''}${w.slot ? `#${w.slot}` : ''}`;
const RARE_KEY = '+rare'; // raid_ids.json entry of the rare body of a tier row (Queen Bee Ω beside Queen Bee): its own enemy id block

// ---- Older WW event raids (plan Task 10, spec step 5) ----
// Families of the census that are raid events of their own; their tier rows come from the census row (raid_values.json has
// week data only for the Weekly era). The other WW families are not raid events: listed in report.skipped.
const EVENT_FAMILIES = new Set(['one-off event', 'weekend-only', 'monthly', 'daily', 'daily showdown']);
const NOT_RAID_EVENT = {
  'regular-boss lure week': 'regular story bosses lured by the Eggcognito quests of an ordinary event (story raid bosses, Task 11), not a raid of its own',
  'rare spawn in event quests': 'the boss was a rare spawn inside an ordinary event (event_raid_rewards GAPS: «a campaign» / «an ordinary Event Coin event»)',
  'regular-boss event spawn': 'regular story bosses in an ordinary event, dates not read',
};
const isEventRow = (row) => EVENT_FAMILIES.has(row.family);
const DAY = 86400000;
const PT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const ptDate = (ms) => PT_DATE.format(new Date(ms)); // YYYY-MM-DD of the Pacific day
// Pacific days a census row runs: weekend-only rows list their other weekends in the census note («Other periods in notice:
// ["2016-11-12T08:00Z..2016-11-14T07:59Z", ...]», UTC, ending on the Monday 07:59/06:59 = Sunday 23:59 PT); the census end is that
// Monday, so the last Pacific day is the day before; the same for the one-off and monthly rows (their end is that Monday too,
// review M-1).
function eventPeriods(row) {
  const lastDay = (end) => isoDay(dayMs(end) - DAY);
  const out = [[row.start, row.end > row.start ? lastDay(row.end) : row.start]];
  const m = /Other periods in notice: (\[[^\]]*\])/.exec(String(row.note || ''));
  for (const p of m ? JSON.parse(m[1]) : []) {
    const [a, b] = String(p).split('..').map((s) => Date.parse(s.replace(/Z$/, ':00Z')));
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`raid: ${row.id}: period «${p}» not understood`);
    out.push([ptDate(a), ptDate(b)]);
  }
  return out;
}
// Tier rows of an event census row, in the shape of raid_values.json weeks (plus event, day, rare). «quest LV N» is one tier
// (single, the one-tier era of the level bands), «Beginner/Intermediate/Advanced (quest LV a/b/c)» three, maps by tier («; »).
// Daily showdown: boss i on day start + i, on map i. Two bosses «X» and «X Ω»: one quest, X with its rare X Ω (raidSetting rareBossId).
const eventMemo = new WeakMap();
function eventTierRows(row) {
  if (eventMemo.has(row)) return eventMemo.get(row);
  const t = String(row.tier || '').trim();
  const one = /^quest LV (\d+)$/.exec(t), three = /^Beginner\/Intermediate\/Advanced \(quest LV (\d+)\/(\d+)\/(\d+)\)$/.exec(t);
  const tiers = one ? [[SINGLE, num(one[1])]] : three ? [['Beginner', num(three[1])], ['Intermediate', num(three[2])], ['Advanced', num(three[3])]] : null;
  if (!tiers) throw new Error(`raid: ${row.id}: tier «${t}» not understood`);
  const maps = String(row.map || '').split(/\s*;\s*/).filter(Boolean);
  const base = { start: row.start, end: row.end, gem_drop: false, event: true };
  let out;
  if (row.family === 'daily showdown') {
    if (maps.length !== row.bosses.length || tiers.length !== 1) throw new Error(`raid: ${row.id}: ${row.bosses.length} bosses, ${maps.length} maps`);
    out = row.bosses.map((boss, i) => ({ ...base, tier: tiers[0][0], quest_lv: tiers[0][1], boss, map: maps[i], day: isoDay(dayMs(row.start) + i * DAY) }));
  } else {
    const [boss, rare] = row.bosses;
    if (!boss || row.bosses.length > 2 || (rare && rare !== `${boss} Ω`)) throw new Error(`raid: ${row.id}: bosses ${row.bosses.join(', ')} not understood`);
    out = tiers.map(([tier, lv], i) => ({ ...base, tier, quest_lv: lv, boss, ...(rare ? { rare } : {}), map: maps[i] || maps[0] }));
  }
  eventMemo.set(row, out);
  return out;
}
const tierRowsOf = (row, weeks) => (isEventRow(row) ? (row.start ? eventTierRows(row) : []) : weeks.filter((w) => w.start === row.start && row.bosses.includes(w.boss)));

// Raid Boards of the event raids (raid_rewards/b_events/event_raid_rewards.json, boards with every cell and cost; the 2016 table
// where it is the best source, cellsOf of raid-boards.js), in the shape of boards_weekly.json, appended to it. Names as the
// master writes them: avatar parts without the «Accessory: / Clothes: / Hairstyle:» prefix and with the board's gender, «Moogle
// 6★» as «6★ Moogle», «6★ Cid 10» as ten Cids. A row with no known board gets the boards of the nearest row of its family that
// has some and no title (spec, Answer 5), without the items exclusive to that event; label boardStandard. Pre-series rows keep
// their weekly-list boards.
const BOARD_FAMILIES = new Set(['weekly', 'radiant reward', 'weekly (pre-series raid event)', ...EVENT_FAMILIES, 'event', 'super-hard weekend', 'monthly (30-minute)', 'daily rotating']);
function eventBoardDoc(census, eventRewards, jpCfg = null) {
  const byId = new Map(((eventRewards || {}).rows || []).filter((r) => r.region === 'WW').map((r) => [r.row_id, r]));
  const rows = ((census || {}).rows || []).filter((r) => isEventRow(r) && r.start && String(r.id).startsWith('WW-'));
  const gName = (g) => (g === 'm' ? 'Male' : g === 'f' ? 'Female' : null);
  const avatar = (name, g) => {
    let n = String(name).trim().replace(/^(Accessory|Clothes|Hairstyle|Hair):\s*/i, '');
    let gender = gName(g);
    const inner = /\s*\((♂|♀)\)/.exec(n);
    if (inner) { gender = inner[1] === '♂' ? 'Male' : 'Female'; n = n.replace(inner[0], '').trim(); } else if (/\s(♂|♀)$/.test(n)) gender = /♂$/.test(n) ? 'Male' : 'Female';
    return /\((male|female)\)\s*$/i.test(n) || !gender ? n : `${n} (${gender})`;
  };
  const medalName = (v) => {
    let s = String(v).trim(), qty = 1;
    const back = /^(.+?) (\d★)$/.exec(s);
    if (back) s = `${back[2]} ${back[1]}`;
    const many = /^(\d★ .+?) (\d+)$/.exec(s);
    if (many) { s = many[1]; qty = num(many[2]); }
    return { name: s, qty };
  };
  const layout = (b, id, drop = new Set()) => {
    const cells = raidBoards.cellsOf({ ...b, id }).filter((c) => !drop.has(c.reward))
      .map((c, i) => ({ n: i + 1, cost: c.cost, kind: c.kind, reward: /^avatar$/i.test(c.kind) ? avatar(c.reward, b.gender) : c.reward, qty: c.qty || 1 }));
    const done = b.completion_reward ? medalName(b.completion_reward) : null;
    return { id, name: b.board, cells, completion_reward: done ? { value: done.name } : null, completion_qty: done ? done.qty : 1, title: b.title ? { value: b.title } : null };
  };
  const boards = [], weeks = [], gendered = new Set(), standard = new Set();
  const slug = (s) => raidBoards.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const row of rows) {
    const ev = byId.get(row.id);
    let list = ((ev && ev.boards) || []).map((b, i) => ({ b, drop: new Set(), key: `ev${i + 1}-${slug(b.board)}${b.gender ? `-${b.gender}` : ''}` }));
    if (!list.length) {
      const donors = rows.filter((r) => r.family === row.family && r.id !== row.id && (byId.get(r.id)?.boards || []).length && byId.get(r.id).boards.every((b) => !b.title))
        .sort((a, c) => Math.abs(dayMs(a.start) - dayMs(row.start)) - Math.abs(dayMs(c.start) - dayMs(row.start)));
      const donor = donors[0] && byId.get(donors[0].id);
      if (donor) {
        list = donor.boards.map((b, i) => ({ b, drop: new Set(Object.keys(donor.exclusive_items || {})), key: `std${i + 1}-${slug(b.board)}${b.gender ? `-${b.gender}` : ''}` }));
        standard.add(row.id);
      }
    }
    if (!list.length) continue;
    const refs = [];
    for (const { b, drop, key } of list) {
      const id = `${row.id}:${key}`;
      boards.push(layout(b, id, drop));
      refs.push({ board: id, confidence: b.confidence || '' });
      if (b.gender) gendered.add(row.id);
    }
    weeks.push({ census_id: row.id, family: row.family, start: row.start, boards: refs });
  }
  // Japan-only rows (I-232): no JP board survives with its cells and costs (the JP wiki lists cells, total coins and main rewards
  // only), so the generic boards of the nearest WW row of the matching family (JP_FAMILIES), else of any event family, without
  // that event's exclusive items (boardStandard, as a WW row with no known board), with the card picture of the donor board
  // (artFrom, raid-boards.js). Generic: no title, no gender, every cell a Medal or Jewels (the JP «Advanced bonus» boards are the
  // WW «Seasoned Wielder Bonus» ones), never a WW event's avatar boards, which the JP raid did not have. The super-hard weekends
  // (jpCfg.superHard) get the WW board whose 13 cells, items and 40,500 coins equal the JP «超難度レイド 討伐報酬» board (JP wiki,
  // 2016-08-20 to 2017-05; «the usual weekend raid board» of the digests after it, census inferred_board): label jpBoard, plus
  // boardSet when inferred; the first super-hard weekends had other small boards (5 or 4 cells), not itemised: boardStandard.
  const jpRows = new Map(((eventRewards || {}).rows || []).filter((r) => r.region === 'JP').map((r) => [r.row_id, r]));
  const exclusive = (r) => new Set(Object.keys((byId.get(r.id) || {}).exclusive_items || {}));
  const generic = (b, drop = new Set()) => !b.title && (!b.gender || b.gender === 'both') && (b.cells || []).length && b.cells.every((c) => /★|Jewel/i.test(String(c.reward)))
    && b.cells.some((c) => !drop.has(c.reward));
  const ok = (r) => (byId.get(r.id)?.boards || []).some((b) => generic(b, exclusive(r)));
  const digits = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
  const jpBoard = new Set();
  const sh = (jpCfg || {}).superHard || null;
  for (const row of ((census || {}).rows || []).filter((r) => jpServed(r, census))) {
    const byDate = (a, c) => Math.abs(dayMs(a.start) - dayMs(row.start)) - Math.abs(dayMs(c.start) - dayMs(row.start));
    let donorRow, pick = null, confidence = '';
    if (sh && row.family === 'super-hard weekend') {
      donorRow = rows.find((r) => r.id === sh.donor);
      pick = (b) => b.board === sh.board;
      const jr = jpRows.get(row.id) || {};
      const own = (jr.boards_summary || []).some((b) => digits(b.cells) === sh.cells && digits(b.coins) === sh.coins);
      if (own) jpBoard.add(row.id);
      else if (jr.inferred_board) { jpBoard.add(row.id); confidence = 'inferred (census inferred_board)'; } else standard.add(row.id);
    } else {
      donorRow = rows.filter((r) => r.family === JP_FAMILIES[row.family] && ok(r)).sort(byDate)[0] || rows.filter(ok).sort(byDate)[0];
      standard.add(row.id);
    }
    if (!donorRow) { standard.delete(row.id); continue; }
    const donor = byId.get(donorRow.id), drop = exclusive(donorRow);
    const refs = [];
    donor.boards.forEach((b, i) => {
      if (!(pick ? pick(b) : generic(b, drop))) return;
      const own = `ev${i + 1}-${slug(b.board)}${b.gender ? `-${b.gender}` : ''}`, id = `${row.id}:std${i + 1}-${slug(b.board)}`;
      boards.push({ ...layout(b, id, drop), artFrom: `${donorRow.id}:${own}` });
      refs.push({ board: id, confidence: confidence || b.confidence || '' });
    });
    weeks.push({ census_id: row.id, family: row.family, start: row.start, boards: refs, donor: donorRow.id });
  }
  return { boards, weeks, gendered, standard, jpBoard };
}
const boardDocOf = (boards, census, eventRewards, jpCfg = null) => {
  const ev = eventBoardDoc(census, eventRewards, jpCfg);
  return { doc: { ...(boards || {}), boards: [...((boards || {}).boards || []), ...ev.boards], weeks: [...((boards || {}).weeks || []), ...ev.weeks] }, ev };
};

// The event's quest (event_raid_rewards.json quests[]): the one of this boss and level, else of this boss, else the only one.
function eventQuestOf(evRow, w) {
  const qs = (evRow && evRow.quests) || [];
  const named = qs.filter((q) => q.raid === w.boss || q.raid === w.rare);
  return named.find((q) => num(q.lvl) === w.quest_lv) || named[0] || (qs.length === 1 ? qs[0] : null);
}
// Objectives of an event quest with their own rewards, in the field layout of questSubs; null when an objective has no code or
// a reward has no item here (the caller then uses the standard Raid Time! objectives, labelled questObjectives).
function eventQuestSubs(q, medals) {
  const subs = [];
  for (const o of (q && q.objectives) || []) {
    let code = null;
    try { code = objectiveCodes(o.objective, { enemyId: () => 0, target: 0, targetName: EGG }); } catch { code = null; }
    const qty = num(o.qty);
    if (!code || !qty) return null;
    const name = String(o.reward || '').trim(), medal = /^(.+?) (\d)★$/.exec(name);
    let reward = { 'Raid Coin': [REWARDS.coinType, 0], 'Event Coin': [15, 0], Jewel: [2, 0] }[name];
    if (!reward && medal) {
      const hit = medals.get(`${medal[2]}|${raidBoards.norm(medal[1])}`) || [];
      if (hit.length === 1) reward = [3, hit[0].medalId];
    }
    if (!reward) return null;
    subs.push({ ...code, type: reward[0], item: reward[1], qty });
  }
  if (subs.length !== 3) return null;
  const each = (f) => subs.map(f);
  return { validSubmission: 3, submissionRequire: each((c) => c.req), submissionName: each((c) => c.name), submissionDataType: each((c) => c.dt),
    submissionIdType: each((c) => c.it), submissionId: each((c) => c.id), submissionNum: each((c) => c.n), submissionRewardType: each((c) => c.type),
    submissionItemId: each((c) => c.item), submissionSkillType: each(() => 0), submissionSkillId: each(() => 0), submissionSkillLv: each(() => 0), submissionItemNum: each((c) => c.qty) };
}

// The 2016 raidSetting of an event raid (thethiny 1.1.3 tables): one dated by the row's own start (id yymmdd000), else the boss's
// setting (as rare when its body has rare 2, the field the client reads), else the pair X / X Ω. {setting, up, ap, dated}
function setting2016Of(settings, orig, w, rareBody) {
  const name = (id) => (orig.get(id) || {}).name;
  const dateOf = (s) => (s.raidSettingId >= 100000000 ? `20${String(Math.floor(s.raidSettingId / 1000)).replace(/^(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3')}` : null);
  const pair = w.rare && settings.find((s) => name(s.bossId) === w.boss && name(s.rareBossId) === w.rare);
  if (pair) return { setting: pair, up: pair.bossUpTime, ap: pair.useAp, rareUp: pair.rareBossUpTime, rareAp: pair.rareUseAp, dated: dateOf(pair) === w.start };
  const asRare = settings.filter((s) => name(s.rareBossId) === w.boss), asBoss = settings.filter((s) => name(s.bossId) === w.boss && s.rareBossId === s.bossId);
  const pool = rareBody ? asRare : [...asBoss, ...settings.filter((s) => name(s.bossId) === w.boss)];
  const pick = pool.find((s) => dateOf(s) === w.start) || pool.filter((s) => s.raidSettingId >= 100000000).pop() || pool[pool.length - 1];
  if (!pick) return null;
  return rareBody ? { setting: pick, up: pick.rareBossUpTime, ap: pick.rareUseAp, dated: dateOf(pick) === w.start }
    : { setting: pick, up: pick.bossUpTime, ap: pick.useAp, dated: dateOf(pick) === w.start };
}
// HP of a one-tier or 2018 three-tier raid before the cap era (raid_config.json eventHp, user decision of review I-1): the boss's
// 2016 row `ref` as the shape, scaled log-linearly by date from x1 on cfg.from to cfg.single.hp at cfg.single.level on
// cfg.single.date (never below x1), x cfg.weekend.factor for weekend raids before cfg.weekend.until; Advanced at least
// cfg.advanced.lv1 at LV 1 with the same shape, Intermediate the geometric mean of Beginner and Advanced. flatFrom: a level above
// which the shape stops growing (the weekly one-tier rows of 2018-09). Returns lv -> HP.
function eventHpCurve({ ref, date, tier, weekend, cfg, flatFrom = null }) {
  const shape = (lv) => atLevel(ref, 'hp', flatFrom ? Math.min(lv, flatFrom) : lv);
  const base = shape(cfg.single.level) || 1;
  const t = Math.min(1, Math.max(0, (dayMs(date) - dayMs(cfg.from)) / (dayMs(cfg.single.date) - dayMs(cfg.from))));
  const factor = Math.pow(Math.max(1, cfg.single.hp / base), t) * (weekend && date < cfg.weekend.until ? cfg.weekend.factor : 1);
  const beginner = (lv) => factor * shape(lv);
  const advanced = (lv) => Math.max(cfg.advanced.lv1 * shape(lv) / (shape(1) || 1), beginner(lv));
  if (tier === 'Advanced') return advanced;
  if (tier === 'Intermediate') return (lv) => Math.sqrt(beginner(lv) * advanced(lv));
  return beginner;
}

// Level drops of an event (event_raid_rewards.json level_rewards, from the notices): [{levels, items: [{type, id, num, name}]}]
// for the itemised ones, and `partial` when some are not served (not itemised, a chance drop, Boosted, coins with no amount).
// «10», «31, 71», «10, then every 10 levels» (to 90); «one 6★ Chip, one 6★ Dale», «6★ Chip + 6★ Dale set», «Setzer, guaranteed».
function levelDropsOf(evRow, medals) {
  const out = { drops: [], partial: false };
  for (const l of (evRow && evRow.level_rewards) || []) {
    const lvText = String(l.level).replace(/"/g, '').trim(), text = String(l.reward || '');
    let levels = null;
    const every = /^(\d+), then every (\d+) levels$/.exec(lvText);
    if (every) { levels = []; for (let v = num(every[1]); v <= 90; v += num(every[2])) levels.push(v); } else if (/^\d+(\s*,\s*\d+)*$/.test(lvText)) levels = lvText.split(/\s*,\s*/).map(num);
    if (!levels || /not itemised|chance|Boosted|amount not stated|rarity not stated|Raid Coins|Event Coins/i.test(text)) { out.partial = true; continue; }
    const items = [];
    for (const part of text.replace(/,?\s*guaranteed$/i, '').replace(/\s+set$/i, '').split(/\s*(?:,|\+)\s*/).filter(Boolean)) {
      const m = /^(?:one\s+)?(?:(\d)★\s*)?(.+?)$/i.exec(part.trim());
      const name = raidBoards.norm(m[2]);
      // a medal named without its rarity: the rarity the same event writes for it (its exclusive items, its board cells)
      const named = [...Object.keys(evRow.exclusive_items || {}), ...(evRow.boards || []).flatMap((b) => (b.cells || []).map((c) => c.reward))]
        .map((s) => /^(\d)★ (.+)$/.exec(String(s))).filter((x) => x && raidBoards.norm(x[2]) === name).map((x) => x[1]);
      const rare = m[1] || (new Set(named).size === 1 ? named[0] : null);
      const keys = [...medals.keys()].filter((k) => k.endsWith(`|${name}`) && (!rare || k.startsWith(`${rare}|`)));
      const hit = keys.length === 1 ? medals.get(keys[0]) : null;
      if (!hit || hit.length !== 1) { items.length = 0; break; }
      items.push({ type: 3, id: hit[0].medalId, num: 1, name: part.trim() });
    }
    if (!items.length || items.length > 4) { out.partial = true; continue; }
    out.drops.push({ levels, items });
  }
  return out;
}

// Timer and AP of an event raid: its own dated 2016 setting; weekend-only rows the weekend rule (3 h, 1 h from 2018-05-05:
// reddit 8h8217); the boss's 2016 setting; else 10 minutes, 20 for a rare 2 body (2016 story rows), and the AP of config.useAp.
function eventTimer({ row, w, settings, orig, rareBody, config, original }) {
  const s = setting2016Of(settings, orig, w, rareBody), labels = [];
  let up, ap;
  // JP rules of the JP wiki (raid_config.json jpTimer): super-hard weekends 12 h, 1 h from 2018-05-05; the monthly raids' 30 minutes
  const jp = w.jp ? (config.jpTimer || {})[row.family] : null;
  if (jp) {
    up = jp.minutes || (row.start < jp.oneHourFrom ? jp.before : jp.after);
    labels.push('jpTimer');
    if (s) ap = s.ap; else { ap = config.useAp; labels.push('useAp'); }
    return { up, ap, labels, setting: s };
  }
  if (s && s.dated) { up = s.up; ap = s.ap; } else {
    if (row.family === 'weekend-only') {
      const rule = config.weekendUpMinutes;
      up = row.start < rule.oneHourFrom ? rule.before : rule.after;
      labels.push('weekendTimer');
    } else if (s) up = s.up;
    else { up = rareBody ? config.eventUpMinutes.rare : config.eventUpMinutes.normal; labels.push('upMinutes'); }
    if (s) ap = s.ap; else { ap = config.useAp; labels.push('useAp'); }
    if (s && !original) labels.push('setting2016');
  }
  return { up, ap, labels, setting: s };
}
const correctedFrom = (values, rewards) => correctedWeeks(values.weeks, parseCorrections((rewards || {}).correctionsMd).dates);

// ---- Japan-only raids (I-232; docs/notes/raid.md «Japan-only raids») ----
// The census JP rows (JP 2015-10 to 2019-05). Served only in the Raid Catalog (entries jp: true, never a raid of the week: spec
// Answer 3), as event raids of one tier. JP_FAMILIES: JP family -> the WW family whose Raid Boards stand in for the unknown JP
// boards (boardStandard). A JP row is not served when it is the same raid as a WW row (the weekly raids from September 2018 ran
// in both versions; a 2018 event of the same boss starting the same day), when its boss is not named, or when it is not a raid
// event (the regular-boss lure weeks, as in WW).
const JP_FAMILIES = { event: 'one-off event', 'super-hard weekend': 'weekend-only', 'monthly (30-minute)': 'monthly', 'daily rotating': 'daily showdown' };
const JP_SAME_AS_WW = new Set(['weekly', 'weekly (date-coded enemy row)']);
const isJpRow = (row) => String(row.id).startsWith('JP-');
// {why} when the JP row is not served, else {}. A WW row of the same boss starting within a day (same family kind: event)
function jpStatus(row, census) {
  if (NOT_RAID_EVENT[row.family]) return { why: NOT_RAID_EVENT[row.family] };
  if (JP_SAME_AS_WW.has(row.family)) return { why: 'the same weekly raid as the worldwide one (from September 2018 both versions ran the same weekly raids)' };
  if (!JP_FAMILIES[row.family]) return { why: `family «${row.family}» not understood` };
  if (!(row.bosses || []).length || !row.start) return { why: 'boss not named by any source' };
  if (row.family === 'event') {
    const twin = ((census || {}).rows || []).find((r) => String(r.id).startsWith('WW-') && EVENT_FAMILIES.has(r.family) && r.start && (r.bosses || []).some((b) => row.bosses.includes(b))
      && Math.abs(dayMs(r.start) - dayMs(row.start)) <= DAY);
    if (twin) return { why: `the same raid as ${twin.id} (same boss, same dates)`, twin: twin.id };
  }
  return {};
}
const jpServed = (row, census) => isJpRow(row) && !jpStatus(row, census).why;
// Corrections to the census JP rows from the later JP research (raid_config.json jpCensus, user decisions 05-11 and 06-11): the
// private census file stays as it is, the overlay is applied when it is read (buildRaid, --ids). Per census id: family, bosses
// (in order: the days of a daily rotating row, Monday to Sunday with weekdays), weekdays (the boss of each weekday over the whole
// row), saturdayOnly (a one-day weekend: open on Saturday only), hp (census data.hp text, e.g. «yes: fixed N»), probableBosses
// (true or names: the boss is inferred, label jpBossProbable), hpProbable (jpHpProbable), levelStep (levels gained per defeat, routes-raid.js), levelDrops
// ([{level, reward: «N★ Name» or «N★ Name (Boosted)», boss?, probable?}], paid as the notices' level drops). Keys starting with
// «_» are notes. An id not in the census stops the run.
const JP_FIX_KEYS = new Set(['family', 'bosses', 'weekdays', 'saturdayOnly', 'hp', 'probableBosses', 'hpProbable', 'levelStep', 'levelDrops', 'source']);
function applyJpCensus(census, overlay) {
  if (!overlay || !census || !Array.isArray(census.rows)) return census;
  const ids = new Set(census.rows.map((r) => r.id));
  for (const [id, fix] of Object.entries(overlay)) {
    if (id.startsWith('_')) continue;
    if (!ids.has(id)) throw new Error(`raid: jpCensus: ${id} is not a census row`);
    const bad = Object.keys(fix).filter((k) => !JP_FIX_KEYS.has(k));
    if (bad.length) throw new Error(`raid: jpCensus: ${id}: unknown field ${bad.join(', ')}`);
    if (fix.weekdays && (fix.bosses || []).length !== 7) throw new Error(`raid: jpCensus: ${id}: weekdays needs 7 bosses (Monday to Sunday)`);
  }
  return { ...census, rows: census.rows.map((r) => {
    const fix = overlay[r.id];
    if (!fix) return r;
    return { ...r, ...(fix.family ? { family: fix.family } : {}), ...(fix.bosses ? { bosses: [...fix.bosses] } : {}),
      ...(fix.hp ? { data: { ...(r.data || {}), hp: fix.hp } } : {}), jpFix: fix };
  }) };
}
// Is this boss of a JP row named by the research only as probable (jpCensus probableBosses)?
const jpBossProbable = (row, boss) => {
  const p = row.jpFix && row.jpFix.probableBosses;
  return p === true || (Array.isArray(p) && p.includes(boss));
};
// Level drops of a JP row for one boss (jpCensus levelDrops): {drops: [{levels, items}], partial, probable} or null when the row
// lists none for that boss. A reward with no item in the master is left out (partial), never replaced.
function jpLevelDrops(row, boss, itemIdx) {
  const list = ((row.jpFix || {}).levelDrops || []).filter((d) => !d.boss || d.boss === boss);
  if (!list.length) return null;
  const out = { drops: [], partial: false, probable: false };
  for (const d of list) {
    const hit = raidBoards.matchReward(itemIdx, 'medal', d.reward, 1);
    if (hit.why) { out.partial = true; continue; }
    out.drops.push({ levels: [num(d.level)], items: [{ type: hit.sel, id: hit.id, num: 1, name: d.reward }] });
    if (d.probable) out.probable = true;
  }
  return out;
}
// Tier rows of a JP row (one tier, quest level from the donor): two bosses «X» and its rare (X Ω, or the rare boss of a 2016
// raidSetting pairing them: Savage Spider / Venomous Spider) are one quest; other bosses each a quest of their own (slot); the
// daily rotating raid one boss per day, the last N days of the row (the census start is the Pacific day before the JP Monday).
// Period: the census dates, a week when the end is missing (label jpDates).
function jpTierRows(row, pairs = new Set()) {
  if (eventMemo.has(row)) return eventMemo.get(row);
  const end = row.end || isoDay(dayMs(row.start) + 6 * DAY);
  const base = { start: row.start, end, tier: SINGLE, quest_lv: 0, gem_drop: false, event: true, jp: true, map: null, ...(row.end ? {} : { noEnd: true }) };
  const bosses = row.bosses || [];
  let out;
  const fix = row.jpFix || {};
  if (fix.weekdays) {
    // the boss of each weekday (Monday to Sunday) over the whole row: `day` = its first date in the row (key and weekday only)
    out = bosses.map((boss, i) => {
      let d = dayMs(row.start);
      while (new Date(d).getUTCDay() !== (i + 1) % 7) d += DAY;
      return { ...base, boss, day: isoDay(d) };
    });
  } else if (fix.saturdayOnly) {
    // a one-day weekend raid («Saturday only»): open on Saturday, not on the whole weekend
    if (new Date(dayMs(row.start)).getUTCDay() !== 6) throw new Error(`raid: jpCensus: ${row.id}: saturdayOnly but ${row.start} is not a Saturday`);
    out = bosses.map((boss, i) => ({ ...base, boss, day: row.start, ...(bosses.length > 1 ? { slot: i + 1 } : {}) }));
  } else if (row.family === 'daily rotating') {
    const first = dayMs(end) - (bosses.length - 1) * DAY;
    out = bosses.map((boss, i) => ({ ...base, boss, day: isoDay(first + i * DAY) }));
  } else if (bosses.length === 2 && (bosses[1] === `${bosses[0]} Ω` || pairs.has(`${bosses[0]}|${bosses[1]}`))) {
    out = [{ ...base, boss: bosses[0], rare: bosses[1] }];
  } else out = bosses.map((boss, i) => ({ ...base, boss, ...(bosses.length > 1 ? { slot: i + 1 } : {}) }));
  eventMemo.set(row, out);
  return out;
}
// 2016 raidSetting pairs «boss|rare boss» (by name), for jpTierRows
function rarePairsOf(orig2016) {
  const name = new Map(((orig2016 || {}).raidEnemy || []).map((e) => [e.raidEnemyId, e.name]));
  return new Set(((orig2016 || {}).raidSetting || []).filter((s) => s.rareBossId !== s.bossId && name.get(s.bossId) && name.get(s.rareBossId))
    .map((s) => `${name.get(s.bossId)}|${name.get(s.rareBossId)}`));
}
// JP HP of a row: census data.hp «yes: fixed N» (the super-hard weekends, JP wiki), else the JP wiki lines of RAID_VALUES.md under
// the boss's heading dated in the row's month: «hp fixed: body N; each part M» (Adventurer 2016-10), «hp body: N at LV 1; N LV 10; ...»
// (Jewel Princess 2016-11). {fixed, partFixed} | {knots: [[lv, hp]]} | null
function parseJpHp(md) {
  const out = {};
  let boss = null;
  for (const line of String(md || '').split(/\r?\n/)) {
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) { boss = h[1]; continue; }
    const m = /^\| (hp fixed: body ([\d,]+); each part ([\d,]+)|hp body: ([^|]+?)) \|[^|]*\| JP \| (\d{4}-\d{2}) \|/.exec(line);
    if (!m || !boss) continue;
    if (m[2]) { (out[boss] ||= []).push({ month: m[5], fixed: num(m[2]), partFixed: num(m[3]) }); continue; }
    const knots = [...m[4].split('.')[0].matchAll(/([\d,]+) (?:at )?LV (\d+)/g)].map((k) => [num(k[2]), num(k[1])]).sort((a, b) => a[0] - b[0]);
    if (knots.length >= 2) (out[boss] ||= []).push({ month: m[5], knots });
  }
  return out;
}
function jpHpOf(row, boss, jpHp) {
  const fixed = /fixed ([\d,]+)/.exec(String((row.data || {}).hp || ''));
  if (fixed) return { fixed: num(fixed[1]) };
  return (jpHp[boss] || []).find((x) => String(row.start).startsWith(x.month)) || null;
}
const knotHp = (knots) => (lv) => {
  if (lv <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (lv <= knots[i][0]) return knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * (lv - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
  return knots[knots.length - 1][1];
};
// Quest of a JP raid (no JP quest page survives): the map, level, AP and world of a WW event raid stage, its map file reused
// (stageBinId: no new map), the standard Raid Time! objectives. The donor: the WW event raid of the same boss nearest in date,
// else the WW event raid nearest in date. Label jpQuest.
function jpDonorOf(entries, w) {
  const pool = entries.filter((e) => e.event && !e.jp && e.available && e.stageId);
  const near = (list) => list.slice().sort((a, b) => Math.abs(dayMs(a.start) - dayMs(w.start)) - Math.abs(dayMs(b.start) - dayMs(w.start)) || a.stageId - b.stageId)[0] || null;
  return near(pool.filter((e) => e.boss === w.boss)) || near(pool);
}

// ---- Story raid bosses (plan Task 11, spec step 6; docs/notes/raid.md «Story raid bosses») ----
// Which boss a story quest spawns: the census «story spawn» rows (quest ranges, the census's choice where the wiki and the 2016
// table disagree, HOLES.md); a quest whose boss is unknown (wiki «???») takes the nearest known quest's boss (tie: the earlier
// quest), label storyBoss. Quests past the last range (826 on: notice 49535, raid bosses only in raid events) spawn nothing.
// The Ω chance of a quest: the 2016 raidSetting its master row names (stage.raidBoss) while the quest is inside the 2016 table
// (config.story.tableLast) and that setting is of the quest's boss; otherwise the boss's rule, the setting the 2016 table gives that
// boss most often (label storyOmega; conflicts storyConflict). rareUpType 3 and 2 are read as a chance of 1 in rareUpTypeArg
// (rareOdds; type 2 also rareType2), any other type has no rare. «story target raid» rows: that boss at the quest's clear.
// One fight stage per boss and stage world (no map of its own: stageBinId is a story row of that world), ids from raid_ids.json
// keys story/<boss>, story/<boss>+rare, story/<boss>@w<world>.
const STORY_FAMILY = 'story spawn', STORY_FIXED = 'story target raid', STORY_KEY = 'story/';
const questSpan = (tier) => {
  const m = /^quests? (\d+)(?:\s*-\s*(\d+))?$/.exec(String(tier || '').trim());
  return m ? [num(m[1]), num(m[2] || m[1])] : null;
};
const storyKeys = (plan) => (plan ? plan.bosses.flatMap((b) => [`${STORY_KEY}${b.boss}`, ...(b.rare ? [`${STORY_KEY}${b.boss}${RARE_KEY}`] : []),
  ...[...b.worlds].sort((x, y) => x - y).map((w) => `${STORY_KEY}${b.boss}@w${w}`)]) : []);
function storyPlan({ census, orig2016, master, config }) {
  const rows = ((census || {}).rows || []).filter((r) => r.family === STORY_FAMILY);
  if (!rows.length) return null;
  const cfg = config.story || {};
  const known = new Map(), unknown = [];
  let last = 0;
  for (const r of rows) {
    const span = questSpan(r.tier);
    if (!span) throw new Error(`raid: ${r.id}: story tier «${r.tier}» not understood`);
    for (let q = span[0]; q <= span[1]; q++) {
      last = Math.max(last, q);
      if ((r.bosses || []).length) known.set(q, { boss: r.bosses[0], census: r.id });
      else unknown.push(q);
    }
  }
  const name = new Map(((orig2016 || {}).raidEnemy || []).map((e) => [e.raidEnemyId, e.name]));
  const settings = new Map(((orig2016 || {}).raidSetting || []).map((s) => [s.raidSettingId, s]));
  const conflicts = ((census.story_conflicts || [])).map(([quest, title, , wiki, table]) => ({ quest, title, census: (known.get(quest) || {}).boss || null, wiki, table }));
  const conflictSet = new Set(conflicts.map((c) => c.quest));
  const storyRows = new Map((master.stage || []).filter((s) => s.stageKind === 1 && s.stageId < 100000 && s.id >= 1 && s.id <= last).map((s) => [s.id, s]));
  const tableLast = Number(cfg.tableLast) || 0;
  // the 2016 setting of a quest, only when it is of the quest's boss
  const ownSetting = (q, boss) => {
    const s = q <= tableLast && !conflictSet.has(q) && storyRows.get(q) ? settings.get(storyRows.get(q).raidBoss) : null;
    return s && name.get(s.bossId) === boss ? s : null;
  };
  const counts = new Map();
  for (const [q, k] of known) {
    const s = ownSetting(q, k.boss);
    if (!s) continue;
    const c = counts.get(k.boss) || new Map();
    c.set(s.raidSettingId, (c.get(s.raidSettingId) || 0) + 1);
    counts.set(k.boss, c);
  }
  const ruleOf = (boss) => {
    const c = counts.get(boss);
    if (!c) return null;
    const [id] = [...c].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return settings.get(id);
  };
  const quests = new Map();
  const knownList = [...known.keys()].sort((a, b) => a - b);
  for (let q = 1; q <= last; q++) {
    if (!storyRows.has(q)) continue; // a quest the master does not serve cannot be cleared
    let k = known.get(q);
    const labels = [];
    if (!k && unknown.includes(q)) {
      let best = null;
      for (const n of knownList) if (!best || Math.abs(n - q) < Math.abs(best - q)) best = n; // ascending: a tie keeps the earlier quest
      if (best === null) continue;
      k = { boss: known.get(best).boss, census: (rows.find((r) => { const s = questSpan(r.tier); return s[0] <= q && q <= s[1]; }) || {}).id, nearest: best };
      labels.push('storyBoss');
    }
    if (!k) continue;
    if (conflictSet.has(q)) labels.push('storyConflict');
    const own = ownSetting(q, k.boss), setting = own || ruleOf(k.boss);
    if (!own && setting && name.get(setting.rareBossId) && setting.rareBossId !== setting.bossId) labels.push('storyOmega');
    quests.set(q, { ...k, setting, labels });
  }
  // fixed spawns («story target raid», quest N): the boss itself, or the rare boss of a story boss («Trickmaster Ω»)
  const fixed = new Map();
  for (const r of ((census || {}).rows || []).filter((x) => x.family === STORY_FIXED)) {
    const span = questSpan(r.tier);
    if (!span || span[0] > last || !(r.bosses || []).length) continue;
    fixed.set(span[0], { name: r.bosses[0], census: r.id });
  }
  const rareOf = (setting) => (setting && setting.rareBossId !== setting.bossId && [2, 3].includes(setting.rareUpType) ? name.get(setting.rareBossId) || null : null);
  const bossNames = [...new Set([...[...quests.values()].map((x) => x.boss)])];
  for (const [, f] of fixed) {
    const base = bossNames.find((b) => rareOf(ruleOf(b)) === f.name);
    f.boss = base || f.name;
    f.rare = !!base;
    if (!bossNames.includes(f.boss)) bossNames.push(f.boss);
  }
  const worldBg = new Map((master.world || []).map((w) => [w.worldId, w.raidBackground]));
  const broken = config.brokenBackgrounds || [], fallback = config.backgroundFallbackWorld || 1;
  const stageWorld = (q) => {
    const w = (storyRows.get(q) || {}).worldId || 0;
    return { world: w, stage: worldBg.has(w) && !broken.includes(worldBg.get(w)) ? w : fallback };
  };
  for (const [q, x] of quests) {
    Object.assign(x, stageWorld(q));
    if (x.stage !== x.world) x.labels.push('background');
  }
  for (const [q, f] of fixed) Object.assign(f, stageWorld(q));
  const firstQuest = (b) => Math.min(...[...quests].filter(([, x]) => x.boss === b).map(([q]) => q), ...[...fixed].filter(([, f]) => f.boss === b).map(([q]) => q));
  const bosses = bossNames.sort((a, b) => firstQuest(a) - firstQuest(b) || (a < b ? -1 : 1)).map((boss) => {
    const rule = ruleOf(boss);
    return { boss, rule, rare: rareOf(rule), worlds: new Set([...[...quests.values()].filter((x) => x.boss === boss).map((x) => x.stage), ...[...fixed.values()].filter((f) => f.boss === boss).map((f) => f.stage)]) };
  });
  return { last, tableLast, quests, fixed, bosses, conflicts, unknown };
}

function checkNumbers(map, what, max) {
  const seen = new Map();
  for (const [k, v] of Object.entries(map)) {
    if (!Number.isInteger(v) || v < 1 || v > max) throw new Error(`raid: raid_ids.json: ${what} ${k} has number ${v}, outside 1-${max}`);
    if (seen.has(v)) throw new Error(`raid: raid_ids.json: ${what} number ${v} repeats (${seen.get(v)}, ${k})`);
    seen.set(v, k);
  }
}
// Copy of ids with a number for every WW row and its tier rows, and for the rows the filter names. Stops on a key that two
// tier rows would share, or a tier row that two census rows would claim.
function allocateIds({ census, weeks, ids, only, story = [], pairs = new Set() }) {
  const out = { ...ids, rows: { ...(ids || {}).rows }, entries: { ...(ids || {}).entries } };
  checkNumbers(out.rows, 'row', RANGES.evStage[2] - EV_BASE);
  checkNumbers(out.entries, 'entry', RANGES.stage[2] - RANGES.stage[1]);
  let nextRow = Math.max(0, ...Object.values(out.rows)) + 1, nextEntry = Math.max(0, ...Object.values(out.entries)) + 1;
  const claimed = new Map();
  // WW rows first, then the served JP rows (I-232): the JP numbers come after every WW one
  const jp = (row) => jpServed(row, census);
  for (const row of [...census.rows.filter((r) => !isJpRow(r)), ...census.rows.filter(jp)]) {
    if (!String(row.id).startsWith('WW-') && !jp(row) && !(only && only.has(row.id))) continue;
    if (isJpRow(row) && !jp(row)) continue;
    if (!(row.id in out.rows)) out.rows[row.id] = nextRow++;
    const keys = new Set();
    for (const w of (isJpRow(row) ? jpTierRows(row, pairs) : tierRowsOf(row, weeks))) {
      const key = keyOf(row, w);
      if (keys.has(key)) throw new Error(`raid: two tier rows give the key ${key} (${w.boss})`);
      keys.add(key);
      if (claimed.has(w)) throw new Error(`raid: the tier row ${w.start} ${w.tier} ${w.boss} is claimed by ${claimed.get(w)} and ${row.id}`);
      claimed.set(w, row.id);
      if (!(key in out.entries)) out.entries[key] = nextEntry++;
      if (w.rare && !(key + RARE_KEY in out.entries)) out.entries[key + RARE_KEY] = nextEntry++;
    }
  }
  // story raid bosses (storyKeys): numbered after the rows, append-only as the rest
  for (const key of story) if (!(key in out.entries)) out.entries[key] = nextEntry++;
  checkNumbers(out.rows, 'row', RANGES.evStage[2] - EV_BASE);
  checkNumbers(out.entries, 'entry', RANGES.stage[2] - RANGES.stage[1]);
  return out;
}

// The master rows of one boss at one tier, or {why} when the 2016 tables cannot give them.
// cap: raid_config.json modelParts, the first N parts of the template that the boss keeps (undefined: all of them).
// exact: the boss's own 2016 rows as they stand (an event raid of the 2016 tables): knots, HP, ATK, DEF and growth.
// floor(lv): a source HP the body never goes below (HP is never lowered, plan Global Constraints); hpFloored is then set.
// hpCurve(lv): the body HP at a level when a rule other than hpBody x singleEra share gives it (eventHpCurve); parts keep their share.
function bossRows({ e, template, orig, blankEnemy, stat, hpBody, partShare, knots, single, cap, exact = false, floor = null, hpCurve = null }) {
  const parts = [];
  for (const id of template.parts.slice(0, cap === undefined ? template.validParts : Math.min(cap, template.validParts))) {
    const p = orig.get(id);
    if (!p) return { why: 'template' };
    if (!(p.weakness >= 2 && p.weakness <= 6)) throw new Error(`raid: part ${id} of ${e.boss} has weakness ${p.weakness}`);
    parts.push(p);
  }
  const make = (src, id, hpAt, attackAt, defAt) => {
    const lv = knots || src.baseLv.slice(0, src.validGrowth);
    const row = { ...blankEnemy, ...src, raidEnemyId: id, raidDisplayId: 0, validGrowth: lv.length, baseLv: pad(lv, KNOTS), hp: pad(lv.map(hpAt), KNOTS), attack: pad(lv.map(attackAt), KNOTS), defense: pad(lv.map(defAt), KNOTS),
      validParts: 0, parts: pad([], PARTS), rewardId: pad([], KNOTS), mvpRewardId: pad([], KNOTS), destroyAllRewardId: pad([], KNOTS) };
    for (const k of GROWTH) row[k] = pad(lv.map((l) => (knots ? Math.round(atLevel(src, k, l)) : atLevel(src, k, l))), KNOTS);
    const skills = src.validSkill || 0;
    for (const k of ['skillId', 'skillRequire', 'skillRequireArg', 'skillOdds']) row[k] = pad((src[k] || []).slice(0, skills), SKILLS);
    return row;
  };
  const share = single ? single.hpShare : null, atkShare = single ? single.atkShare : null;
  const idx = (lv) => (knots ? knots.indexOf(lv) : 0);
  const baseDef = template.defense[0] || 1;
  if (exact) {
    const own = (src) => (k) => (lv) => atLevel(src, k, lv);
    const body = make(template, e.enemyId, own(template)('hp'), own(template)('attack'), own(template)('defense'));
    Object.assign(body, { name: e.boss, raidDisplayId: e.modelId, weakness: 1, validParts: parts.length, parts: pad(parts.map((p) => e.enemyId + p.weakness - 1), PARTS) });
    return { body, partRows: parts.map((p) => make(p, e.enemyId + p.weakness - 1, own(p)('hp'), own(p)('attack'), own(p)('defense'))) };
  }
  let floored = false;
  const ruleAt = (lv) => (hpCurve ? hpCurve(lv) : hpBody * (share ? share[idx(lv)] : 1));
  const bodyHp = (lv) => {
    const rule = Math.round(ruleAt(lv)), min = floor ? Math.round(floor(lv)) : 0;
    if (min > rule) floored = true;
    return Math.max(rule, min);
  };
  const body = make(template, e.enemyId, bodyHp, (lv) => Math.round(stat.atk * (atkShare ? atkShare[idx(lv)] : 1)), () => stat.def);
  body.name = e.boss;
  body.raidDisplayId = e.modelId;
  body.weakness = 1;
  body.validParts = parts.length;
  body.parts = pad(parts.map((p) => e.enemyId + p.weakness - 1), PARTS);
  const partRows = parts.map((p, i) => make(p, e.enemyId + p.weakness - 1, (lv) => Math.round(ruleAt(lv) * partShare(p, i)), () => 0,
    () => Math.round(stat.def * (p.defense[0] / baseDef))));
  return { body, partRows, hpFloored: floored };
}

// Lux of a defeat (docs/notes/raid.md «Lux»): the client reports the sum of luxAttack at the boss's level over the body and
// every part it breaks (bench 3 Nov: 450 = 270 + 90 + 90 at LV 1, 600 at LV 2), times the deck's Lux skills. Original rule
// (notice 60146, 2019-11-18): Lux follows the HP taken and the Lux skills, not hits or damage; reported per kill with Lux++
// on every medal and no bonus: Advanced 400B HP about 8B, Legendary 700B about 12B, Epic 1T about 20B (video frame
// 2021-06), so 2% of body HP. Base sum = body HP x perHpFullDeck / fullDeckMultiplier (our Lux++ luxUp 50000 = x5), shared
// over the rows as the template's luxAttack; luxSuppress keeps its template ratio. Munny and EXP stay the 2016 values.
function applyLux(rows, lux) {
  const all = [rows.body, ...rows.partRows], perHp = lux.perHpFullDeck / lux.fullDeckMultiplier;
  for (let k = 0; k < rows.body.validGrowth; k++) {
    const target = Math.round(rows.body.hp[k] * perHp);
    const sum = all.reduce((t, r) => t + (r.luxAttack[k] || 0), 0);
    for (const r of all) {
      const share = sum > 0 ? (r.luxAttack[k] || 0) / sum : r === rows.body ? 1 : 0;
      const ratio = r.luxAttack[k] > 0 ? (r.luxSuppress[k] || 0) / r.luxAttack[k] : 0;
      r.luxAttack[k] = Math.round(target * share);
      r.luxSuppress[k] = Math.round(r.luxAttack[k] * ratio);
    }
  }
}

function buildRaid({ census, values, rewards, orig2016, boards, eventRewards, master, models, config, ids, notices = null }) {
  checkRanges(master);
  census = applyJpCensus(census, config.jpCensus); // corrections of the JP rows (jpCensus), before anything reads the census
  const fixes = parseCorrections((rewards || {}).correctionsMd);
  const weeks = correctedWeeks(values.weeks, fixes.dates);
  const readings = correctedWeeks(values.week_tier_hp, fixes.dates);
  const partHp = parsePartHp(values.partHpMd);
  const orig = new Map((orig2016.raidEnemy || []).map((r) => [r.raidEnemyId, r]));
  const origAttack = new Map((orig2016.raidEnemyAttack || []).map((r) => [r.raidEnemyAttackId, r]));
  if (!(master.raidEnemy || []).length || !(master.raidEnemyAttack || []).length) throw new Error('raid: no served raidEnemy / raidEnemyAttack row to blank');
  const blankEnemy = blank(master.raidEnemy[0]), blankAttack = blank(master.raidEnemyAttack[0]);
  const haveAttack = new Set(master.raidEnemyAttack.map((r) => r.raidEnemyAttackId));
  const story = (master.stage || []).filter((r) => r.stageKind === 1 && r.stageId < 100000).sort((a, b) => a.id - b.id);
  const refByWorld = new Map(story.filter((r) => r.id <= 525).map((r) => [r.worldId, r]));
  const worldBg = new Map((master.world || []).map((w) => [w.worldId, w.raidBackground]));
  const broken = config.brokenBackgrounds || [], fallbackWorld = config.backgroundFallbackWorld || 1;
  if (broken.includes(worldBg.get(fallbackWorld))) throw new Error(`raid: fallback world ${fallbackWorld} has a broken background`);
  const mapWorld = (map) => {
    if (config.mapWorlds && config.mapWorlds[map]) return config.mapWorlds[map];
    const same = story.filter((r) => r.mapName === map);
    if (same.length) return same[same.length - 1].worldId;
    const prefix = String(map).split(':')[0] + ':';
    const near = story.filter((r) => String(r.mapName).startsWith(prefix));
    return near.length ? near[near.length - 1].worldId : 0;
  };
  const only = config.onlyCensusIds ? new Set(config.onlyCensusIds) : null;
  const plan = storyPlan({ census, orig2016, master, config });
  const pairs = rarePairsOf(orig2016), jpHpTable = parseJpHp(values.partHpMd);
  const numbers = allocateIds({ census, weeks, ids, only, story: storyKeys(plan), pairs });
  const out = { enemyRows: [], settingRows: [], rewardRows: [], attackRows: [], stageRows: [], evStageRows: [], sphereRows: [], arrayRows: [], masuRows: [], maps: [],
    index: { entries: [], reasons: {} }, ids: numbers, report: { why: {}, templateGap: [], boards: null, skipped: [] } };
  const withRaid = new Set();
  const seenReward = new Set(), seenAttack = new Set();
  // event raids: the reward research (raid_rewards/b_events/event_raid_rewards.json) by census id, the 2016 reward rows, medals by name
  const eventRows = new Map(((eventRewards || {}).rows || []).filter((r) => r.region === 'WW').map((r) => [r.row_id, r]));
  const reward2016 = new Map((orig2016.raidReward || []).map((r) => [r.raidRewardId, r]));
  const itemIdx = raidBoards.itemIndex(master), medalIndex = itemIdx.medal;

  // The rows of one boss of a tier row: {rows, labels, hp, hpSource, template, own, original} or {why}. original: an event
  // raid with its own 2016 row (census data.hp «yes (2016 row)»): that row as it stands.
  const makeBoss = ({ row, w, bossName, modelId, enemyId, tier, date, single }) => {
    const labels = [];
    const own = orig.get(modelId), tplId = (config.modelTemplates || {})[bossName], template = own || orig.get(tplId);
    if (!template) return { why: 'template' };
    if (!own) labels.push('moves');
    // a JP row with an HP of the JP wiki (fixed, or by level) is not «yes (2016 row)», whatever its census text (I-232)
    const jpHp = w.jp ? jpHpOf(row, bossName, jpHpTable) : null;
    const original = !!(w.event && own && !jpHp && /^yes \(2016 row/i.test(String((row.data || {}).hp || '')));
    if (original && w.jp) labels.push('jp2016');
    const e = { boss: bossName, modelId, enemyId };
    const cap = (config.modelParts || {})[bossName];
    if (original) {
      const rows = bossRows({ e, template, orig, blankEnemy, cap, exact: true });
      return rows.why ? rows : { rows, labels, hp: rows.body.hp[0], hpSource: '2016', template, own, original };
    }
    const reading = w.event ? null : readings.find((x) => x.start === w.start && x.tier === w.tier && x.boss === w.boss && !!x.gem_drop === !!w.gem_drop && x.hp && x.confidence === 'video frame');
    // before the cap era (eventHp.capFrom, 2018-10-07) a raid with no reading follows the scale of its boss's 2016 row (review I-1,
    // user decision): every event raid, and the one-tier weeks of 2018-09 (flat above LV 30)
    const ecfg = config.eventHp;
    const scaled = !reading && !jpHp && !!ecfg && (w.event || (tier === SINGLE && date < ecfg.capFrom));
    let hpBody, hpCurve = null, partFixed = null;
    if (jpHp) {
      // JP wiki HP (I-232): the body at every level (fixed, or linear between the wiki's levels); parts fixed when the wiki says so
      hpCurve = jpHp.knots ? knotHp(jpHp.knots) : () => jpHp.fixed;
      hpBody = Math.round(hpCurve(1));
      if (jpHp.partFixed) partFixed = jpHp.partFixed;
    } else if (scaled) {
      // a one-tier week is read at its last day, so the week of the 2018-09-11 reading (2018-09-10..16) reaches it, never below
      hpCurve = eventHpCurve({ ref: own || template, date: w.event ? date : row.end || date, tier, weekend: row.family === 'weekend-only', cfg: ecfg, flatFrom: w.event ? null : ecfg.single.level });
      hpBody = Math.round(hpCurve(1));
      labels.push('eventHp');
      if (w.event && tier !== SINGLE) labels.push('hpTier');
    } else {
      const table = tierHp(values, tier, date);
      if (!reading && !table) return { why: 'hp' };
      hpBody = reading ? reading.hp : table.hp;
      if (!reading || single) labels.push('hp');
      if (!reading && table.step) labels.push('hp_step');
    }
    if (single) labels.push('atk_curve');
    const stat = statsAt(config.stats, tier, date, template.rare);
    if (stat.atk === undefined) throw new Error(`raid: raid_stats.json has no ATK for ${tier}`);
    const near = (partHp[bossName] || []).slice().sort((a, b) => Math.abs(dayMs(a.date) - dayMs(date)) - Math.abs(dayMs(b.date) - dayMs(date)))[0];
    const partShare = (p, i) => (partFixed && jpHp.fixed ? partFixed / jpHp.fixed : near ? near.parts[i % near.parts.length] / near.body : p.hp[0] / template.hp[0]);
    const knots = single ? single.knots : null;
    // HP is never lowered: an event raid never goes below its boss's own 2016 row at the same level (a JP wiki HP stands as it is)
    const floor = w.event && own && !jpHp ? (lv) => atLevel(own, 'hp', lv) : null;
    const rows = bossRows({ e, template, orig, blankEnemy, stat, hpBody, partShare, knots, single, cap, floor, hpCurve });
    if (rows.why) return rows;
    if (rows.hpFloored) labels.push('hpFloor');
    if (config.lux) applyLux(rows, config.lux);
    return { rows, labels, hp: scaled || jpHp ? rows.body.hp[0] : hpBody, hpSource: jpHp ? 'jp' : reading ? 'video' : scaled ? 'scale' : 'rule', partFixed: !!partFixed, template, own, original };
  };
  // every weak point of the model (raid_models.json `slots`, parts<N> of its wait LWF) needs a part of weakness N: at fight
  // load the client looks up a raidEnemy row for each one and crashes on an empty slot (docs/notes/raid.md «Weak points»)
  const lackingSlots = (m, rows) => {
    const slots = m && Array.isArray(m.slots) ? m.slots : null;
    if (!slots) return [];
    const have = new Set([1, ...rows.partRows.map((p) => p.weakness)]);
    return slots.filter((s) => !have.has(s));
  };
  const modelOf = (modelId) => (models && modelId ? models[String(modelId).padStart(4, '0')] : null); // keyed by folder name: "0007", "1003"
  const usable = (m) => !!(m && m.fight && m.put_down);
  const skillsMissing = (template) => template.skillId.slice(0, template.validSkill).some((id) => !haveAttack.has(id) && !origAttack.has(id));
  // reward rows of a body: the 2016 rows of its own row for an original event raid (copied under our ids, slots past validReward
  // blanked), else the coin tables of raid-rewards.js (one set per level band or tier)
  const rewardRowsOf = (made, enemyId, tier, date, gemDrop) => {
    const body = made.rows.body, lvList = body.baseLv.slice(0, body.validGrowth);
    const fields = ['rewardId', 'mvpRewardId', 'destroyAllRewardId'];
    if (made.original) {
      const rows = [];
      for (let k = 0; k < lvList.length; k++) {
        fields.forEach((f, t) => {
          const src = reward2016.get((made.own[f] || [])[k]);
          if (!src) throw new Error(`raid: 2016 raidReward ${(made.own[f] || [])[k]} of ${made.own.name} (knot ${k}) is missing`);
          const v = Math.max(0, Math.min(4, src.validReward || 0)), slot = (a, dflt = 0) => pad((a || []).slice(0, v), 4).map((x, i) => (i < v ? x : dflt));
          rows.push({ raidRewardId: rewardRowId(enemyId, t + 1, k + 1), oddsUpPerLv: src.oddsUpPerLv || 0, pointUpPerLv: src.pointUpPerLv || 0, validReward: v, type: slot(src.type), id: slot(src.id),
            assignSkillType: slot(src.assignSkillType, 1), assignSkillId: slot(src.assignSkillId), assignSkillLv: slot(src.assignSkillLv, 1), burstUpperNumber: slot(src.burstUpperNumber), num: slot(src.num), odds: slot(src.odds) });
          body[f][k] = rewardRowId(enemyId, t + 1, k + 1);
        });
      }
      return rows;
    }
    const tables = lvList.map((level) => coinRows({ enemyId, date, tier, level, gemDrop }));
    body.rewardId = pad(tables.map((t) => t.victory.raidRewardId), KNOTS);
    body.mvpRewardId = pad(tables.map((t) => t.mvp.raidRewardId), KNOTS);
    body.destroyAllRewardId = pad(tables.map((t) => t.all.raidRewardId), KNOTS);
    return tables.flatMap((t) => [t.victory, t.mvp, t.all]);
  };
  const emit = (made, rewardList) => {
    for (const r of rewardList) if (!seenReward.has(r.raidRewardId)) { seenReward.add(r.raidRewardId); out.rewardRows.push(r); }
    for (const id of made.template.skillId.slice(0, made.template.validSkill)) {
      if (haveAttack.has(id) || seenAttack.has(id)) continue;
      seenAttack.add(id);
      out.attackRows.push({ ...blankAttack, ...origAttack.get(id) });
    }
    out.enemyRows.push(made.rows.body, ...made.rows.partRows);
  };

  const buildRow = (row) => {
    if (only ? !only.has(row.id) : !(String(row.id).startsWith('WW-') || isJpRow(row))) return;
    const jpWhy = isJpRow(row) ? jpStatus(row, census).why : null;
    if (NOT_RAID_EVENT[row.family] || (EVENT_FAMILIES.has(row.family) && !row.start) || jpWhy) {
      out.report.skipped.push({ censusId: row.id, family: row.family, why: jpWhy || NOT_RAID_EVENT[row.family] || 'no dates', ...(isJpRow(row) ? { jp: true, start: row.start, bosses: row.bosses || [] } : {}) });
      return;
    }
    const evStageId = EV_BASE + numbers.rows[row.id];
    const tierRows = isJpRow(row) ? jpTierRows(row, pairs) : tierRowsOf(row, weeks);
    const evRow = eventRows.get(row.id);
    const stageIds = [];
    tierRows.forEach((w) => {
      const date = row.start;
      const tier = tierOf(w, date);
      const n = numbers.entries[keyOf(row, w)];
      const bossOf = (name) => (census.bosses || []).find((b) => b.ww === name);
      const modelId = bossOf(w.boss) ? bossOf(w.boss).raid_model_id : 0;
      const m = modelOf(modelId);
      const evQuest = w.event && !w.jp ? eventQuestOf(evRow, w) : null;
      // a JP raid plays on the quest of a WW event raid (jpDonorOf): its map file, level, AP and world
      const donor = w.jp ? jpDonorOf(out.index.entries, w) : null;
      const questKey = w.event ? (evQuest && evQuest.page ? String(evQuest.page).replace(/\s*\(Quest\)\s*$/, '') : w.boss)
        : w.tier === SINGLE ? 'Raid Time!' : `(${w.tier}) ${w.gem_drop ? 'Gem Drop: ' : ''}Raid Time!`;
      const quest = (values.quests || {})[w.event ? 'Raid Time!' : questKey];
      const map = donor ? donor.map : w.map;
      const worldReal = mapWorld(map);
      const reconstructed = ['atk', 'def', 'partHp', 'upMinutes', 'useAp', 'coinOdds', config.lux ? 'lux' : 'rewards2016'];
      const jpAp = w.jp && (config.jpQuestAp || {})[row.id];
      const entry = { key: keyOf(row, w), censusId: row.id, family: row.family, start: row.start, end: w.jp ? w.end : row.end, tier, gemDrop: !!w.gem_drop,
        boss: w.boss, modelId, available: false, why: null, stageId: RANGES.stage[1] + n, evStageId, settingId: RANGES.raidSetting[1] + n, enemyId: RANGES.raidEnemy[1] + 10 * n,
        upMinutes: config.weeklyUpMinutes, useAp: config.useAp, questAp: w.jp ? (jpAp !== undefined ? [num(jpAp)] : donor ? [...donor.questAp] : [0]) : w.event ? [num(evQuest && evQuest.ap)] : String(w.ap).split('/').map(num), map, worldId: 0,
        level: w.jp ? (donor ? donor.level : 0) : w.event ? w.quest_lv : (config.tierQuestLv || {})[tier] || num(w.quest_lv), hp: 0,
        boards: w.jp ? [] : w.event ? ((evRow && evRow.boards) || []).map((b) => b.board) : (values.week_boards || []).find((b) => b.start === row.start)?.boards || fixes.boards[row.id] || String(row.rewards || '').split(/\s*[;,|]\s*/).filter(Boolean),
        reconstructed };
      // event raids (Task 10): when they open (raid-calendar.js openNow), on Pacific days
      if (w.event) {
        entry.event = true;
        entry.periods = w.jp ? [[w.start, w.end]] : w.day ? [[row.start, isoDay(dayMs(row.end) - DAY)]] : eventPeriods(row);
        // a tier row with a day (daily showdown / rotating, a JP weekday rotation, a Saturday-only weekend) opens on that weekday
        if (w.day) { entry.open = 'day'; entry.day = w.day; } else if (row.family === 'weekend-only' || row.family === 'super-hard weekend') entry.open = 'weekend';
        else if (row.family === 'daily') entry.open = 'daily';
      }
      // Japan-only raid (I-232): served only in the Raid Catalog (raid-calendar.js never lists it as a raid of the week)
      if (w.jp) {
        Object.assign(entry, { jp: true, region: 'JP', ...(donor ? { questFrom: donor.key } : {}) });
        // levels gained per defeat stated by the JP notice (jpCensus levelStep: year-end 2016 +10), read by routes-raid.js
        if (row.jpFix && row.jpFix.levelStep) entry.levelStep = num(row.jpFix.levelStep);
      }
      out.index.entries.push(entry);

      const single = tier === SINGLE || w.event ? config.singleEra : null;
      if (!usable(m)) entry.why = 'graphics';
      else if (!orig.get(modelId) && !orig.get((config.modelTemplates || {})[w.boss])) entry.why = 'template';
      else if (!worldReal) entry.why = 'map';
      else if (!quest || (w.event && !w.jp && !evQuest) || (w.jp && !donor)) entry.why = 'quest';
      if (entry.why) return;
      const made = makeBoss({ row, w, bossName: w.boss, modelId, enemyId: entry.enemyId, tier, date, single });
      if (made.why) { entry.why = made.why; return; }
      const lack = lackingSlots(m, made.rows);
      if (lack.length) { entry.why = 'parts'; entry.missingSlots = lack; return; }
      if (skillsMissing(made.template)) { entry.why = 'template'; return; }
      // a boss on another boss's row (modelTemplates) keeps its own attribute where raid_config.json bossAttributes states it
      const attribute = (config.bossAttributes || {})[w.boss];
      if (attribute && !made.own) {
        for (const r of [made.rows.body, ...made.rows.partRows]) r.attribute = attribute;
        made.labels.push('attribute');
      }
      entry.hp = made.hp;
      if (w.event) entry.hpSource = made.hpSource;

      // event raids: their own values replace the weekly labels where they are original
      let settingExtra = {};
      if (w.event) {
        const timer = eventTimer({ row, w, settings: orig2016.raidSetting || [], orig, rareBody: made.rows.body.rare === 2, config, original: made.original });
        Object.assign(entry, { upMinutes: timer.up, useAp: timer.ap });
        const keep = new Set(made.original ? [] : ['atk', 'def', 'partHp', 'coinOdds', config.lux ? 'lux' : 'rewards2016']);
        reconstructed.splice(0, reconstructed.length, ...reconstructed.filter((l) => keep.has(l)), ...timer.labels);
        if (!made.original) reconstructed.push('eventCoins');
        // Japan-only (I-232): Catalog only, quest of a WW raid, a week when the end date is not known; the parts of a wiki HP are its own
        if (w.jp) {
          if (made.partFixed && reconstructed.includes('partHp')) reconstructed.splice(reconstructed.indexOf('partHp'), 1);
          reconstructed.push('jp', 'jpQuest', ...(w.noEnd ? ['jpDates'] : []));
          // the later JP research (jpCensus): a boss or an HP only probable (the monthly windows: raidWindows, label jpWindow)
          const fix = row.jpFix || {};
          if (jpBossProbable(row, w.boss)) reconstructed.push('jpBossProbable');
          if (fix.hpProbable) reconstructed.push('jpHpProbable');
        }
        // the rare boss of the same quest (Queen Bee Ω beside Queen Bee): its own rows, timer and AP; chance 1 in rareUpTypeArg
        if (w.rare) {
          const rareModel = bossOf(w.rare) ? bossOf(w.rare).raid_model_id : 0, rm = modelOf(rareModel);
          const rn = numbers.entries[entry.key + RARE_KEY], rareEnemy = RANGES.raidEnemy[1] + 10 * rn;
          const rareMade = usable(rm) ? makeBoss({ row, w: { ...w, boss: w.rare }, bossName: w.rare, modelId: rareModel, enemyId: rareEnemy, tier, date, single }) : { why: 'graphics' };
          const pairSet = timer.setting && timer.setting.setting;
          if (rareMade.why || lackingSlots(rm, rareMade.rows).length || skillsMissing(rareMade.template) || !pairSet || pairSet.rareUpType !== 3) {
            (out.report.rareLeftOut ||= []).push({ key: entry.key, rare: w.rare, why: rareMade.why || (!pairSet || pairSet.rareUpType !== 3 ? 'no rare rule' : 'rows') });
          } else {
            rareMade.rows.body.rare = 2;
            emit(rareMade, rewardRowsOf(rareMade, rareEnemy, tier, date, false));
            entry.rare = { boss: w.rare, modelId: rareModel, enemyId: rareEnemy, upMinutes: timer.setting.rareUp, useAp: timer.setting.rareAp, every: pairSet.rareUpTypeArg };
            reconstructed.push('rareOdds', ...rareMade.labels.filter((l) => !reconstructed.includes(l)));
            settingExtra = { rareBossId: rareEnemy, rareBossUpTime: entry.rare.upMinutes, rareUseAp: entry.rare.useAp, rareUpTypeArg: pairSet.rareUpTypeArg };
          }
        }
      }
      for (const l of made.labels) if (!reconstructed.includes(l)) reconstructed.push(l);
      emit(made, rewardRowsOf(made, entry.enemyId, tier, date, !!w.gem_drop));
      // level drops of the notice (review I-3): one raidReward row per level, every slot paid (routes-raid.js), ids past the coin
      // tables of the body (enemyId x 100 + 40 + i)
      if (w.event) {
        // a JP row: the level drops of the JP notice mapped to worldwide items (jpCensus levelDrops), when it lists some for this boss
        const jpLd = w.jp ? jpLevelDrops(row, w.boss, itemIdx) : null;
        const ld = jpLd || levelDropsOf(evRow, medalIndex);
        const drops = ld.drops.flatMap((d) => d.levels.map((level) => ({ level, items: d.items }))).sort((a, b) => a.level - b.level);
        if (drops.length > 59) throw new Error(`raid: ${entry.key}: ${drops.length} level drops`);
        entry.levelDrops = drops.map((d, i) => {
          const z = () => [0, 0, 0, 0], row = { raidRewardId: entry.enemyId * 100 + 40 + i, oddsUpPerLv: 0, pointUpPerLv: 0, validReward: d.items.length, type: z(), id: z(),
            assignSkillType: [1, 1, 1, 1], assignSkillId: z(), assignSkillLv: [1, 1, 1, 1], burstUpperNumber: z(), num: z(), odds: z() };
          d.items.forEach((it, k) => { row.type[k] = it.type; row.id[k] = it.id; row.num[k] = it.num; row.odds[k] = 100000; });
          if (!seenReward.has(row.raidRewardId)) { seenReward.add(row.raidRewardId); out.rewardRows.push(row); }
          return { level: d.level, rewardId: row.raidRewardId, items: d.items.map((it) => it.name) };
        });
        if (drops.length) reconstructed.push('levelDrops');
        if (ld.partial) reconstructed.push('levelDropsPartial');
        if (ld.probable) reconstructed.push('jpRewardProbable');
      }
      out.settingRows.push({ raidSettingId: entry.settingId, bossId: entry.enemyId, bossUpTime: entry.upMinutes, useAp: entry.useAp, rareBossId: entry.enemyId, rareBossUpTime: entry.upMinutes,
        rareUseAp: entry.useAp, rareUpType: 3, rareUpTypeArg: 1, rareUpTriggerBossId: entry.enemyId, validUnlockRare: 0, unlockRareBossId: [0, 0, 0], unlockRareNum: [0, 0, 0], ...settingExtra });

      // stage: copy of a story row of the map's world; a world with a broken background draws world 1's instead
      let stageWorld = worldReal;
      if (!worldBg.has(worldReal) || broken.includes(worldBg.get(worldReal))) { stageWorld = fallbackWorld; reconstructed.push('background'); }
      entry.worldId = stageWorld;
      const ref = refByWorld.get(worldReal) || story[story.length - 1];
      if (!ref) throw new Error('raid: no story rows in the stage table');
      // objectives: the event quest's own, with their rewards; the standard Raid Time! ones when one cannot be served
      let subs = w.event && !w.jp ? eventQuestSubs(evQuest, medalIndex) : null;
      if (w.event && !w.jp && !subs) reconstructed.push('questObjectives');
      subs = subs || questSubs(quest.info, REWARDS.coinType, entry.key);
      // a JP raid reuses the map file of its donor's stage (stageBinId; server.js poiStageId follows it): no new map
      const stage = { ...JSON.parse(JSON.stringify(ref)), stageId: entry.stageId, stageBinId: donor ? donor.stageId : entry.stageId, id: entry.stageId, name: questKey, mapName: map,
        useAp: raidWindows.stageUseAp(entry, config), chapterId: Math.floor(entry.stageId / 1000), worldId: stageWorld, onlyDrama: 0, stageKind: STAGE_KIND,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [], afterDramaType: [], branchType: 0, disableContinue: 0, addLevel: 0, holdKeyblade: 0,
        validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 0, clearGetItemType: [], clearGetItemId: [],
        clearGetAssignSkillType: [], clearGetAssignSkillId: [], clearGetAssignSkillLv: [], clearGetItemNum: [], resetSubMission: 0, combinedSubmissionFlag: 0, raidBoss: entry.settingId,
        ...subs };
      out.stageRows.push(stage);
      stageIds.push(entry.stageId);
      // map: one target plus two, each worth raidPoint 3000 (enemy row 100); `world` is the room's world, for the room choice
      const egg = () => ({ name: EGG, enemyId: EGG_ID, n: 1, reward: ENEMY_REWARD });
      if (!donor) out.maps.push({ stageId: entry.stageId, world: worldReal, name: questKey, room: w.map, target: EGG, targetId: EGG_ID, targetReward: ENEMY_REWARD, level: entry.level,
        enemies: [[egg(), egg()]], treasures: [], rooms: 1 });
      entry.available = true;
    });
    // Details of the banner: the raid's original notice (make-raid-notices.js), only when there is one (no dead button)
    const detailUrl = notices && notices.rows && notices.rows[row.id] ? `${NOTICE_URL}${evStageId}` : '';
    if (stageIds.length) { out.evStageRows.push(evStageRow(evStageId, stageIds, { detailUrl })); withRaid.add(row.id); }
  };
  // WW rows first: the JP rows take their quests from the WW event raids built before them (jpDonorOf)
  census.rows.filter((r) => !isJpRow(r)).forEach(buildRow);
  census.rows.filter(isJpRow).forEach(buildRow);
  if (plan) out.index.story = buildStory(plan);
  // Story raid bosses (storyPlan): every boss with its own 2016 rows as they stand (HP, ATK, DEF, Lux, parts, moves) and its 2016
  // raidReward rows (medals and materials by level, no coins) under our ids; its 2016 raidSetting (the boss's rule) for the timer and
  // AP; the rare body of that setting as entry.rare. A boss whose model, weak points, moves or reward items are missing is not
  // emitted (available false, why) and its quests spawn nothing.
  function buildStory(p) {
    const bossOf = (n) => (census.bosses || []).find((b) => b.ww === n);
    const medals = master.medal ? new Set(master.medal.map((m) => m.medalId)) : null, materials = master.material ? new Set(master.material.map((m) => m.materialId)) : null;
    const itemsKnown = (list) => list.every((r) => r.type.slice(0, r.validReward).every((t, i) => (t === 3 ? !medals || medals.has(r.id[i]) : t === 5 ? !materials || materials.has(r.id[i]) : true)));
    const madeOf = (bossName, enemyId) => {
      const modelId = bossOf(bossName) ? bossOf(bossName).raid_model_id : 0, m = modelOf(modelId), own = orig.get(modelId);
      if (!usable(m)) return { modelId, why: 'graphics' };
      if (!own || own.name !== bossName) return { modelId, why: 'template' };
      const rows = bossRows({ e: { boss: bossName, modelId, enemyId }, template: own, orig, blankEnemy, exact: true });
      if (rows.why) return { modelId, why: rows.why };
      if (lackingSlots(m, rows).length) return { modelId, why: 'parts', missingSlots: lackingSlots(m, rows) };
      if (skillsMissing(own)) return { modelId, why: 'template' };
      const made = { rows, labels: [], template: own, own, original: true };
      const rewardList = rewardRowsOf(made, enemyId, 'story', null, false);
      if (!itemsKnown(rewardList)) return { modelId, why: 'rewards' };
      return { modelId, made, rewardList };
    };
    const reasons = new Set();
    const bosses = p.bosses.map((b) => {
      const n = numbers.entries[`${STORY_KEY}${b.boss}`], enemyId = RANGES.raidEnemy[1] + 10 * n, settingId = RANGES.raidSetting[1] + n;
      const entry = { key: `${STORY_KEY}${b.boss}`, story: true, boss: b.boss, modelId: 0, available: false, why: null, tier: 'story', start: null, settingId, enemyId,
        upMinutes: 0, useAp: 0, rare: null, stageId: 0, stages: {}, reconstructed: [] };
      const got = madeOf(b.boss, enemyId);
      entry.modelId = got.modelId;
      if (got.why) { entry.why = got.why; if (got.missingSlots) entry.missingSlots = got.missingSlots; } else if (!b.rule) entry.why = 'setting';
      if (entry.why) return entry;
      Object.assign(entry, { upMinutes: b.rule.bossUpTime, useAp: b.rule.useAp, hp: got.made.rows.body.hp[0] });
      let rareExtra = {};
      if (b.rare) {
        const rn = numbers.entries[`${STORY_KEY}${b.boss}${RARE_KEY}`], rareEnemy = RANGES.raidEnemy[1] + 10 * rn;
        const r = madeOf(b.rare, rareEnemy);
        if (r.why) (out.report.rareLeftOut ||= []).push({ key: entry.key, rare: b.rare, why: r.why });
        else {
          r.made.rows.body.rare = 2;
          emit(r.made, r.rewardList);
          entry.rare = { boss: b.rare, modelId: r.modelId, enemyId: rareEnemy, upMinutes: b.rule.rareBossUpTime, useAp: b.rule.rareUseAp };
          entry.reconstructed.push('rareOdds', ...(b.rule.rareUpType === 2 ? ['rareType2'] : []));
          rareExtra = { rareBossId: rareEnemy, rareBossUpTime: b.rule.rareBossUpTime, rareUseAp: b.rule.rareUseAp, rareUpTypeArg: b.rule.rareUpTypeArg };
        }
      }
      emit(got.made, got.rewardList);
      out.settingRows.push({ raidSettingId: settingId, bossId: enemyId, bossUpTime: entry.upMinutes, useAp: entry.useAp, rareBossId: enemyId, rareBossUpTime: entry.upMinutes,
        rareUseAp: entry.useAp, rareUpType: 3, rareUpTypeArg: 1, rareUpTriggerBossId: enemyId, validUnlockRare: 0, unlockRareBossId: [0, 0, 0], unlockRareNum: [0, 0, 0], ...rareExtra });
      // fight stages: a copy of a story row of the world (its map, never played: no evStage lists it), raidBoss = the setting
      for (const w of [...b.worlds].sort((x, y) => x - y)) {
        const sid = RANGES.stage[1] + numbers.entries[`${STORY_KEY}${b.boss}@w${w}`];
        const ref = refByWorld.get(w) || story[story.length - 1];
        if (!ref) throw new Error('raid: no story rows in the stage table');
        out.stageRows.push({ ...JSON.parse(JSON.stringify(ref)), stageId: sid, stageBinId: ref.stageId, id: sid, name: b.boss, useAp: 0, chapterId: Math.floor(sid / 1000), worldId: w,
          onlyDrama: 0, stageKind: STAGE_KIND, validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [], afterDramaType: [], branchType: 0,
          disableContinue: 0, addLevel: 0, holdKeyblade: 0, validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 0,
          clearGetItemType: [], clearGetItemId: [], clearGetAssignSkillType: [], clearGetAssignSkillId: [], clearGetAssignSkillLv: [], clearGetItemNum: [], resetSubMission: 0,
          combinedSubmissionFlag: 0, raidBoss: settingId });
        entry.stages[w] = sid;
      }
      entry.stageId = entry.stages[Math.min(...b.worlds)] || 0;
      entry.available = true;
      return entry;
    });
    const byName = new Map(bosses.map((b) => [b.boss, b]));
    const quests = {};
    for (const [q, x] of p.quests) {
      const b = byName.get(x.boss), labels = [...x.labels];
      const rare = b && b.rare && x.setting && x.setting.rareBossId !== x.setting.bossId && [2, 3].includes(x.setting.rareUpType) ? x.setting.rareUpTypeArg : null;
      if (rare && x.setting.rareUpType === 2) labels.push('rareType2'); // the quest's own Ω chance is a type-2 reading (review M-4)
      quests[q] = { boss: x.boss, census: x.census, stageId: b && b.available ? b.stages[x.stage] : 0, every: rare, reconstructed: labels,
        ...(x.nearest ? { nearest: x.nearest } : {}) };
      labels.forEach((l) => reasons.add(l));
    }
    for (const [q, f] of p.fixed) {
      const b = byName.get(f.boss);
      const ok = b && b.available && (!f.rare || b.rare);
      (quests[q] ||= { boss: f.boss, census: f.census, stageId: 0, every: null, reconstructed: [] }).fixed = { boss: f.boss, rare: f.rare, name: f.name, census: f.census, stageId: ok ? b.stages[f.stage] : 0 };
    }
    for (const b of bosses) b.reconstructed.forEach((l) => reasons.add(l));
    for (const label of reasons) {
      const reason = (config.reconstructedWhy || {})[label];
      if (!reason) throw new Error(`raid: no reason for the label ${label} in reconstructedWhy of raid_config.json`);
      out.index.reasons[label] = reason;
    }
    out.report.story = { bosses: bosses.length, available: bosses.filter((b) => b.available).length, quests: Object.keys(quests).length,
      spawning: Object.values(quests).filter((q) => q.stageId).length, unknown: p.unknown.length, conflicts: p.conflicts.length, stages: bosses.reduce((t, b) => t + Object.keys(b.stages).length, 0) };
    return { last: p.last, tableLast: p.tableLast, bosses, quests, conflicts: p.conflicts, unknown: p.unknown };
  }
  // Raid Boards (raid-boards.js): one set per census row with a raid, shared by its tiers
  if (boards) {
    const { doc, ev } = boardDocOf(boards, census, eventRewards, config.jpBoards);
    const b = raidBoards.buildBoards({ doc, correctionsMd: (rewards || {}).correctionsMd, master, ids: numbers, config: config.boards || {}, censusIds: withRaid, families: BOARD_FAMILIES });
    Object.assign(out, { sphereRows: b.sphereRows, arrayRows: b.arrayRows, masuRows: b.masuRows, boardArt: b.art });
    out.ids = { ...out.ids, boards: b.boardIds };
    out.report.boards = { ...b.report, count: b.sphereRows.length };
    for (const e of out.index.entries) {
      e.sphereBoardIds = b.byCensus[e.censusId] || [];
      if (e.sphereBoardIds.length) e.reconstructed.push(...(b.labels[e.censusId] || []), ...(ev.standard.has(e.censusId) ? ['boardStandard'] : []), ...(ev.gendered.has(e.censusId) ? ['boardGender'] : []), ...(ev.jpBoard && ev.jpBoard.has(e.censusId) ? ['jpBoard'] : []));
    }
  } else for (const e of out.index.entries) e.sphereBoardIds = [];
  // AP and Bonus Time rule (raid_config.json costRule, I-228): weekdayWeekend (served) labels every raid weekRule and a tier whose
  // original AP is 0 weekdayAp; originalWindows the opening-hours rule's label (raidWindow, jpWindow, weeklyWindow)
  for (const e of out.index.entries) {
    const labels = raidWindows.windowsOn(config) ? [raidWindows.windowLabel(e, config)] : ['weekRule', raidWindows.zeroAp(e, config) ? 'weekdayAp' : null];
    for (const l of labels) if (l && !e.reconstructed.includes(l)) e.reconstructed.push(l);
  }
  for (const e of out.index.entries) {
    if (e.why) out.report.why[e.why] = (out.report.why[e.why] || 0) + 1;
    if (e.why === 'template' && !out.report.templateGap.includes(e.boss)) out.report.templateGap.push(e.boss);
    for (const label of e.reconstructed) {
      const reason = (config.reconstructedWhy || {})[label];
      if (!reason) throw new Error(`raid: no reason for the label ${label} in reconstructedWhy of raid_config.json`);
      out.index.reasons[label] = reason;
    }
  }
  // Japan-only raids (I-232): what the Notices and the Catalog say about them (routes-info-album.js raidNoticeFacts)
  const jpEntries = out.index.entries.filter((e) => e.jp), jpSkipped = out.report.skipped.filter((s) => s.jp);
  if (jpEntries.length || jpSkipped.length) {
    out.index.jp = { rows: new Set(jpEntries.map((e) => e.censusId)).size, available: new Set(jpEntries.filter((e) => e.available).map((e) => e.censusId)).size,
      tiers: jpEntries.length, from: jpEntries.map((e) => e.start).sort()[0] || null, to: jpEntries.map((e) => e.end).sort().pop() || null,
      notServed: jpEntries.filter((e) => !e.available).map((e) => ({ censusId: e.censusId, boss: e.boss, why: e.why })),
      skipped: jpSkipped.map((s) => ({ censusId: s.censusId, family: s.family, start: s.start, bosses: s.bosses, why: s.why })) };
  }
  // Raid Catalog banner (CATALOG_EV): kept apart from the raid rows; patch() writes it in evStage
  const training = (master.stage || []).find((r) => r.stageId === CATALOG_STAGE);
  out.catalogEvStage = training ? evStageRow(CATALOG_EV, [CATALOG_STAGE], { eventType: 0, detailUrl: CATALOG_URL }) : null;
  if (training) out.index.catalog = { evStageId: CATALOG_EV, stageIds: [CATALOG_STAGE], useAp: [Number(training.useAp) || 0] };
  return out;
}

// ATK table of raid_stats.json. Ratio: median of body ATK / reference story enemy ATK at the same level, over every knot of
// the weekly bosses that have a 2016 row. Story ATK of a tranche: median ATK of the enemies on the maps of its story quests
// at the wiki level of each quest, then the median of the last STORY_WINDOW tranches, kept at its running maximum so a
// later period is never weaker. Tier: its quest level on
// the reference curve, against Advanced (Advanced = the period's story ATK; the single tier's value is the one at its cap).
function deduceStats({ raidEnemy2016, weeklyBosses, enemy, stage, poi, questLevels, story, config }) {
  const byId = new Map(enemy.map((e) => [e.enemyId, e]));
  const ref = byId.get(config.refEnemyId);
  if (!ref) throw new Error(`raid: reference enemy ${config.refEnemyId} not in the enemy table`);
  const refAt = (lv) => atLevel(ref, 'attack', lv);
  const bosses = [...new Set(weeklyBosses)].map((n) => raidEnemy2016.find((r) => r.name === n)).filter(Boolean);
  const ratios = bosses.flatMap((b) => Array.from({ length: b.validGrowth }, (_, i) => b.attack[i] / refAt(b.baseLv[i])));
  const ratio = median(ratios);
  const tiers = ['Beginner', 'Intermediate', 'Advanced', 'Legendary', 'Epic'];
  const share = Object.fromEntries(tiers.map((t) => [t, refAt(config.tierQuestLv[t]) / refAt(config.tierQuestLv.Advanced)]));
  const byNumber = new Map();
  for (const s of stage) if (s.stageKind === 1 && !byNumber.has(s.id)) byNumber.set(s.id, s);
  const round100 = (x) => Math.round(x / 100) * 100;
  const periods = [];
  let top = 0;
  const recent = [];
  for (const [qFrom, qTo, from] of story) {
    const atks = [], levels = [];
    for (let q = qFrom; q <= qTo; q++) {
      const s = byNumber.get(q), lv = questLevels.get(q);
      if (!s || !lv) continue;
      levels.push(lv);
      for (const x of (poi[s.stageId] || {}).enemies || []) {
        const e = byId.get(x.enemyId);
        if (e && e.name !== EGG) atks.push(atLevel(e, 'attack', lv));
      }
    }
    if (!atks.length) continue;
    recent.push(median(atks));
    const storyAtk = Math.round(median(recent.slice(-STORY_WINDOW)));
    if (storyAtk <= top * STORY_STEP) continue;
    top = storyAtk;
    const atk = { single: round100(top * ratio) };
    for (const t of tiers) atk[t] = round100(top * ratio * share[t]);
    periods.push({ from, quests: [qFrom, qTo], level: median(levels), storyAtk: top, atk });
  }
  return { reconstructed: true, ratio: { median: ratio, bosses: bosses.length, knots: ratios.length, refEnemyId: config.refEnemyId },
    tierShare: Object.fromEntries(tiers.map((t) => [t, Number(share[t].toFixed(3))])), def: config.def, periods };
}

const rowsOf = (file) => { const r = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(r) ? r : Object.values(r)[0]; };
// A missing file gives dflt where the caller allows it (dflt undefined: it stops the run); a corrupt one always stops it,
// or a truncated table would be rewritten with our rows only.
function readJson(p, dflt) {
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT' && dflt !== undefined) return dflt;
    throw new Error(`raid: ${p} not readable (${e.code || e.message})`);
  }
  try { return JSON.parse(text); } catch (e) { throw new Error(`raid: ${p} is corrupt: ${e.message}`); }
}
const IDS_FILE = path.join(__dirname, 'raid_ids.json');
const IDS_NOTE = 'Append-only: raid ids live in saves and in the master. Numbers are written by make-raid.js; a key that disappears stays, its number is never reused. rows: evStage = 8000 + r. entries: stage = 980000 + n, raidSetting = 30000 + n, raidEnemy = 2000000 + 10n. boards: sphereBoardId = arryId = masuId = 3000000 + n.';
const readIds = (file) => readJson(file, { note: IDS_NOTE, rows: {}, entries: {} });
function writeIds(file, ids) {
  const text = JSON.stringify(ids, null, 1) + '\n';
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch { /* first run */ }
  if (old === null || old.replace(/\r\n/g, '\n') !== text) fs.writeFileSync(file, text);
}

// Throws when a source is not readable.
function readSources(src, dir2016) {
  const values = JSON.parse(fs.readFileSync(path.join(src, 'raid_values', 'raid_values.json'), 'utf8'));
  values.partHpMd = fs.readFileSync(path.join(src, 'raid_values', 'RAID_VALUES.md'), 'utf8');
  return { census: JSON.parse(fs.readFileSync(path.join(src, 'raid_census', 'raid_census.json'), 'utf8')), values,
    rewards: { correctionsMd: fs.readFileSync(path.join(src, 'raid_rewards', 'CORRECTIONS.md'), 'utf8') },
    boards: JSON.parse(fs.readFileSync(path.join(src, 'raid_rewards', 'a_weekly', 'boards_weekly.json'), 'utf8')),
    eventRewards: JSON.parse(fs.readFileSync(path.join(src, 'raid_rewards', 'b_events', 'event_raid_rewards.json'), 'utf8')),
    orig2016: { raidEnemy: rowsOf(path.join(dir2016, 'raidEnemy.json')), raidEnemyAttack: rowsOf(path.join(dir2016, 'raidEnemyAttack.json')),
      raidSetting: rowsOf(path.join(dir2016, 'raidSetting.json')), raidReward: rowsOf(path.join(dir2016, 'raidReward.json')) } };
}

function loadConfig() {
  return { ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8')), stats: JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_stats.json'), 'utf8')) };
}

// Appends the rows to the master tables and writes game_data/raids.json and raid_maps.json. Returns null (nothing written)
// with KHUX_RAID=0 or without the private sources. opts: gameDataDir, sources, models, modelsFile, config (tests).
function patch(masterDir, opts = {}) {
  if (process.env.KHUX_RAID === '0') { console.log('raid: off (KHUX_RAID=0)'); return null; }
  let sources = opts.sources;
  if (!sources) {
    const src = process.env.KHUX_RAID_SRC || DEFAULT_SRC, dir2016 = process.env.KHUX_RAID_2016 || DEFAULT_2016;
    try { sources = readSources(src, dir2016); } catch (e) {
      console.warn(`raid: skipped, private sources under ${src} or ${dir2016} not readable (${e.code || e.message}): no raid rows`);
      return null;
    }
  }
  const gameData = opts.gameDataDir || path.join(__dirname, 'game_data');
  let models = opts.models;
  if (models === undefined) {
    const file = opts.modelsFile || path.join(gameData, 'raid_models.json');
    models = readJson(file, null);
    if (!models) console.warn(`raid: ${file} not readable: raid_models.json missing, every boss is unavailable`);
  }
  const prev = readJson(path.join(gameData, 'raids.json'), {}).own || {};
  // stage, world and the two tables with a row to blank must be there; the others are empty in the base master
  const REQUIRED = new Set(['stage', 'raidEnemy', 'raidEnemyAttack']);
  const load = (table, key) => {
    const mine = new Set(prev[table] || []);
    return readJson(path.join(masterDir, `${table}.json`), REQUIRED.has(table) ? undefined : []).filter((r) => !mine.has(r[key]));
  };
  const tableKey = { ...Object.fromEntries(Object.entries(RANGES).map(([t, [k]]) => [t, k])), raidEnemyAttack: 'raidEnemyAttackId' };
  const master = Object.fromEntries(Object.entries(tableKey).map(([t, k]) => [t, load(t, k)]));
  master.world = readJson(path.join(masterDir, 'world.json'));
  for (const t of ITEM_TABLES) master[t] = readJson(path.join(masterDir, `${t}.json`), []);
  if (!master.stage.some((r) => r.stageKind === 1)) throw new Error(`raid: ${path.join(masterDir, 'stage.json')} has no story rows`);
  const idsFile = opts.idsFile || IDS_FILE;
  let notices = opts.notices;
  if (notices === undefined) {
    const file = path.join(gameData, 'raid_notices.json');
    try { notices = readJson(file, null); } catch (e) { console.warn(e.message); notices = null; }
    if (!notices) console.warn(`raid: ${file} not readable (node server/make-raid-notices.js): no Details button on the raid banners`);
  }
  const out = buildRaid({ ...sources, master, models, config: opts.config || loadConfig(), ids: readIds(idsFile), notices });
  const added = { stage: out.stageRows, evStage: [...(out.catalogEvStage ? [out.catalogEvStage] : []), ...out.evStageRows], raidSetting: out.settingRows, raidEnemy: out.enemyRows, raidReward: out.rewardRows, raidEnemyAttack: out.attackRows,
    sphere: out.sphereRows, sphereArray: out.arrayRows, sphereMasu: out.masuRows };
  for (const [t, rows] of Object.entries(added)) fs.writeFileSync(path.join(masterDir, `${t}.json`), JSON.stringify([...master[t], ...rows]));
  fs.mkdirSync(gameData, { recursive: true });
  const own = Object.fromEntries(Object.entries(added).map(([t, rows]) => [t, rows.map((r) => r[tableKey[t]])]));
  fs.writeFileSync(path.join(gameData, 'raids.json'), JSON.stringify({ entries: out.index.entries, reasons: out.index.reasons, ...(out.index.catalog ? { catalog: out.index.catalog } : {}), ...(out.index.story ? { story: out.index.story } : {}), ...(out.index.jp ? { jp: out.index.jp } : {}), boards: out.report.boards, own }, null, 1));
  const st = out.report.story;
  if (st) console.log(`raid: story bosses ${st.available} of ${st.bosses} available, ${st.spawning} of ${st.quests} story quests spawn (to quest ${out.index.story.last}), ${st.unknown} with the nearest boss, ${st.conflicts} conflicts, ${st.stages} fight stages`);
  if (!out.index.catalog) console.warn(`raid: no Raid Catalog banner: the Training Grounds stage ${CATALOG_STAGE} is not in the master (make-special first)`);
  writeIds(idsFile, out.ids);
  fs.writeFileSync(path.join(gameData, 'raid_maps.json'), JSON.stringify(out.maps, null, 1));
  // card pictures of the Raid Boards: read by build-resources.ps1 (import_originals.py), docs/notes/bacheche.md «Raid Boards»
  fs.writeFileSync(path.join(gameData, 'raid_board_art.tsv'), raidBoards.artLines(out.boardArt || []));
  const on = out.index.entries.filter((e) => e.available).length;
  const rows = [...new Set(out.index.entries.filter((e) => e.available).map((e) => e.censusId))];
  console.log(`raid: ${rows.length} census rows with an available tier, calendar ${out.index.entries.map((e) => e.start).sort()[0] || '-'} to `
    + `${out.index.entries.map((e) => e.end || e.start).sort().pop() || '-'}`);
  console.log(`raid: ${on} of ${out.index.entries.length} tier rows available; +${out.stageRows.length} stage, +${out.evStageRows.length} evStage, +${out.settingRows.length} raidSetting, `
    + `+${out.enemyRows.length} raidEnemy, +${out.rewardRows.length} raidReward, +${out.attackRows.length} raidEnemyAttack`);
  console.log(`raid: Details (original notice) on ${out.evStageRows.filter((r) => r.detailUrl).length} of ${out.evStageRows.length} raid banners`);
  const bd = out.report.boards;
  if (bd) {
    console.log(`raid: +${bd.count} Raid Boards (sphere, sphereArray, sphereMasu: ${(bd.bytes / 1048576).toFixed(2)} MB), ${bd.unmatched.length} cells left off for a reward with no item, `
      + `${bd.corrected.length} corrected`);
  }
  const whys = Object.entries(out.report.why).sort().map(([k, v]) => `${k} ${v}`);
  if (whys.length) console.log(`raid: not available: ${whys.join(', ')}`);
  if (out.report.templateGap.length) console.warn(`raid: complete model but no template row, choose one in modelTemplates of raid_config.json: ${out.report.templateGap.join(', ')}`);
  return out;
}

// node server/make-raid.js --ids: numbers every WW row and tier row in raid_ids.json
function writeIdsFile() {
  const src = process.env.KHUX_RAID_SRC || DEFAULT_SRC, dir2016 = process.env.KHUX_RAID_2016 || DEFAULT_2016;
  const sources = readSources(src, dir2016), { values, rewards, boards, eventRewards } = sources;
  const census = applyJpCensus(sources.census, loadConfig().jpCensus);
  // the story keys need the story rows (worlds) and the worlds' backgrounds of the served master (read only)
  const md = path.join(__dirname, 'master_data');
  const plan = storyPlan({ census, orig2016: readSources(src, dir2016).orig2016, master: { stage: readJson(path.join(md, 'stage.json')), world: readJson(path.join(md, 'world.json')) }, config: loadConfig() });
  const ids = allocateIds({ census, weeks: correctedFrom(values, rewards), ids: readIds(IDS_FILE), only: null, story: storyKeys(plan), pairs: rarePairsOf(readSources(src, dir2016).orig2016) });
  ids.boards = raidBoards.allocateBoardIds(boardDocOf(boards, census, eventRewards, loadConfig().jpBoards).doc, ids, BOARD_FAMILIES);
  writeIds(IDS_FILE, ids);
  console.log(`raid_ids.json: ${Object.keys(ids.rows).length} rows, ${Object.keys(ids.entries).length} entries, ${Object.keys(ids.boards).length} boards`);
}

// node server/make-raid.js --stats: raid_stats.json from the served tables, the 2016 rows and the wiki levels
function writeStats() {
  const master = path.join(__dirname, 'master_data'), game = path.join(__dirname, 'game_data');
  const src = process.env.KHUX_RAID_SRC || DEFAULT_SRC, dir2016 = process.env.KHUX_RAID_2016 || DEFAULT_2016;
  const quests = JSON.parse(fs.readFileSync(process.env.KHUX_RAID_WIKI || DEFAULT_WIKI_QUESTS, 'utf8'));
  const questLevels = new Map();
  for (const q of Object.values(quests)) if (q.number && q.lvl && !questLevels.has(num(q.number))) questLevels.set(num(q.number), num(q.lvl));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8'));
  const stats = deduceStats({ raidEnemy2016: rowsOf(path.join(dir2016, 'raidEnemy.json')), weeklyBosses: readSources(src, dir2016).values.weeks.map((w) => w.boss),
    enemy: rowsOf(path.join(master, 'enemy.json')), stage: rowsOf(path.join(master, 'stage.json')), poi: JSON.parse(fs.readFileSync(path.join(game, 'stage_poi.json'), 'utf8')), questLevels,
    story: JSON.parse(fs.readFileSync(path.join(game, 'gacha_catalog.json'), 'utf8')).story, config: { ...cfg.statsRule, tierQuestLv: cfg.tierQuestLv } });
  const head = { note: 'Our own deduction, not original data: no ATK or DEF of a raid is known after 2016. Replaced if a source appears. Rule and inputs: docs/notes/raid.md, section ATK and DEF.',
    generatedBy: 'node server/make-raid.js --stats',
    inputs: ['2016 raidEnemy rows of the weekly bosses', 'served enemy table', 'story enemy lists per quest (stage_poi)', 'quest levels of the wiki', 'story dates of the Shop catalogue', 'tier quest levels of the wiki', 'community report of a 50,000 STR threshold on Epic'] };
  fs.writeFileSync(path.join(__dirname, 'raid_stats.json'), JSON.stringify({ ...head, ...stats }, null, 1) + '\n');
  console.log(`raid_stats.json: ratio ${stats.ratio.median} over ${stats.ratio.bosses} bosses, ${stats.periods.length} periods`);
}

if (require.main === module) {
  if (process.argv[2] === '--stats') writeStats();
  else if (process.argv[2] === '--ids') writeIdsFile();
  else patch(process.argv[2] || path.join(__dirname, 'master_data'));
}

module.exports = { applyJpCensus, storyPlan, storyKeys, evStageRow, EVSTAGE_MAX_STAGES, buildRaid, applyLux, atLevel, eventPeriods, eventTierRows, EVENT_FAMILIES, patch, allocateIds, deduceStats, readSources, parseCorrections, parsePartHp, tierHp, stepDate, DEFAULT_SRC, DEFAULT_2016 };
