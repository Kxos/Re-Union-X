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

function evStageRow(evStageId, stageIds, { eventType = 2, detailUrl = '' } = {}) {
  const row = { eventStageId: evStageId, parentEventStageId: 0, validStageId: stageIds.length, stageId: [...stageIds], validStageWidthId: 0,
    stageStartId: stageIds[0], stageEndId: stageIds[stageIds.length - 1], resetFlag: 0, eventCategory: 2, eventType, scoreMedalListId: 0, scoreStartReward: 0,
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

const tierOf = (w, date) => (w.tier === SINGLE && date >= REWARDS.tierFrom ? 'Beginner' : w.tier);
const keyOf = (row, w) => `${row.id}/${tierOf(w, row.start)}${w.gem_drop ? '+gem' : ''}${w.day ? `@${w.day}` : ''}`;
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
// Monday, so the last Pacific day is the day before. Other event rows: their census dates as they stand.
function eventPeriods(row) {
  const lastDay = (end) => isoDay(dayMs(end) - DAY);
  if (row.family === 'one-off event' || row.family === 'monthly') return [[row.start, row.end]];
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
const BOARD_FAMILIES = new Set(['weekly', 'radiant reward', 'weekly (pre-series raid event)', ...EVENT_FAMILIES]);
function eventBoardDoc(census, eventRewards) {
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
  return { boards, weeks, gendered, standard };
}
const boardDocOf = (boards, census, eventRewards) => {
  const ev = eventBoardDoc(census, eventRewards);
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
// Timer and AP of an event raid: its own dated 2016 setting; weekend-only rows the weekend rule (3 h, 1 h from 2018-05-05:
// reddit 8h8217); the boss's 2016 setting; else 10 minutes, 20 for a rare 2 body (2016 story rows), and the AP of config.useAp.
function eventTimer({ row, w, settings, orig, rareBody, config, original }) {
  const s = setting2016Of(settings, orig, w, rareBody), labels = [];
  let up, ap;
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
function allocateIds({ census, weeks, ids, only }) {
  const out = { ...ids, rows: { ...(ids || {}).rows }, entries: { ...(ids || {}).entries } };
  checkNumbers(out.rows, 'row', RANGES.evStage[2] - EV_BASE);
  checkNumbers(out.entries, 'entry', RANGES.stage[2] - RANGES.stage[1]);
  let nextRow = Math.max(0, ...Object.values(out.rows)) + 1, nextEntry = Math.max(0, ...Object.values(out.entries)) + 1;
  const claimed = new Map();
  for (const row of census.rows) {
    if (!String(row.id).startsWith('WW-') && !(only && only.has(row.id))) continue;
    if (!(row.id in out.rows)) out.rows[row.id] = nextRow++;
    const keys = new Set();
    for (const w of tierRowsOf(row, weeks)) {
      const key = keyOf(row, w);
      if (keys.has(key)) throw new Error(`raid: two tier rows give the key ${key} (${w.boss})`);
      keys.add(key);
      if (claimed.has(w)) throw new Error(`raid: the tier row ${w.start} ${w.tier} ${w.boss} is claimed by ${claimed.get(w)} and ${row.id}`);
      claimed.set(w, row.id);
      if (!(key in out.entries)) out.entries[key] = nextEntry++;
      if (w.rare && !(key + RARE_KEY in out.entries)) out.entries[key + RARE_KEY] = nextEntry++;
    }
  }
  checkNumbers(out.rows, 'row', RANGES.evStage[2] - EV_BASE);
  checkNumbers(out.entries, 'entry', RANGES.stage[2] - RANGES.stage[1]);
  return out;
}

// The master rows of one boss at one tier, or {why} when the 2016 tables cannot give them.
// cap: raid_config.json modelParts, the first N parts of the template that the boss keeps (undefined: all of them).
// exact: the boss's own 2016 rows as they stand (an event raid of the 2016 tables): knots, HP, ATK, DEF and growth.
// floor(lv): a source HP the body never goes below (HP is never lowered, plan Global Constraints); hpFloored is then set.
function bossRows({ e, template, orig, blankEnemy, stat, hpBody, partShare, knots, single, cap, exact = false, floor = null }) {
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
  const bodyHp = (lv) => {
    const rule = Math.round(hpBody * (share ? share[idx(lv)] : 1)), min = floor ? Math.round(floor(lv)) : 0;
    if (min > rule) floored = true;
    return Math.max(rule, min);
  };
  const body = make(template, e.enemyId, bodyHp, (lv) => Math.round(stat.atk * (atkShare ? atkShare[idx(lv)] : 1)), () => stat.def);
  body.name = e.boss;
  body.raidDisplayId = e.modelId;
  body.weakness = 1;
  body.validParts = parts.length;
  body.parts = pad(parts.map((p) => e.enemyId + p.weakness - 1), PARTS);
  const partRows = parts.map((p, i) => make(p, e.enemyId + p.weakness - 1, (lv) => Math.round(hpBody * partShare(p, i) * (share ? share[idx(lv)] : 1)), () => 0,
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

function buildRaid({ census, values, rewards, orig2016, boards, eventRewards, master, models, config, ids }) {
  checkRanges(master);
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
  const numbers = allocateIds({ census, weeks, ids, only });
  const out = { enemyRows: [], settingRows: [], rewardRows: [], attackRows: [], stageRows: [], evStageRows: [], sphereRows: [], arrayRows: [], masuRows: [], maps: [],
    index: { entries: [], reasons: {} }, ids: numbers, report: { why: {}, templateGap: [], boards: null, skipped: [] } };
  const withRaid = new Set();
  const seenReward = new Set(), seenAttack = new Set();
  // event raids: the reward research (raid_rewards/b_events/event_raid_rewards.json) by census id, the 2016 reward rows, medals by name
  const eventRows = new Map(((eventRewards || {}).rows || []).filter((r) => r.region === 'WW').map((r) => [r.row_id, r]));
  const reward2016 = new Map((orig2016.raidReward || []).map((r) => [r.raidRewardId, r]));
  const medalIndex = raidBoards.itemIndex(master).medal;

  // The rows of one boss of a tier row: {rows, labels, hp, hpSource, template, own, original} or {why}. original: an event
  // raid with its own 2016 row (census data.hp «yes (2016 row)»): that row as it stands.
  const makeBoss = ({ row, w, bossName, modelId, enemyId, tier, date, single }) => {
    const labels = [];
    const own = orig.get(modelId), tplId = (config.modelTemplates || {})[bossName], template = own || orig.get(tplId);
    if (!template) return { why: 'template' };
    if (!own) labels.push('moves');
    const original = !!(w.event && own && /^yes/i.test(String((row.data || {}).hp || '')));
    const e = { boss: bossName, modelId, enemyId };
    const cap = (config.modelParts || {})[bossName];
    if (original) {
      const rows = bossRows({ e, template, orig, blankEnemy, cap, exact: true });
      return rows.why ? rows : { rows, labels, hp: rows.body.hp[0], hpSource: '2016', template, own, original };
    }
    const reading = w.event ? null : readings.find((x) => x.start === w.start && x.tier === w.tier && x.boss === w.boss && !!x.gem_drop === !!w.gem_drop && x.hp && x.confidence === 'video frame');
    // the event raids before 2019-08-12 follow the one-tier cap of their date, whatever their tier (Task 10)
    const table = tierHp(values, w.event ? SINGLE : tier, date);
    if (!reading && !table) return { why: 'hp' };
    const hpBody = reading ? reading.hp : table.hp;
    if (!reading || single) labels.push('hp');
    // an event raid before the first cap reading carries that cap back: the step rule's «last value carried on»
    if (!reading && (table.step || (w.event && date < table.first))) labels.push('hp_step');
    if (single) labels.push('atk_curve');
    const stat = statsAt(config.stats, tier, date, template.rare);
    if (stat.atk === undefined) throw new Error(`raid: raid_stats.json has no ATK for ${tier}`);
    const near = (partHp[bossName] || []).slice().sort((a, b) => Math.abs(dayMs(a.date) - dayMs(date)) - Math.abs(dayMs(b.date) - dayMs(date)))[0];
    const partShare = (p, i) => (near ? near.parts[i % near.parts.length] / near.body : p.hp[0] / template.hp[0]);
    const knots = single ? single.knots : null;
    // HP is never lowered: an event raid never goes below its boss's own 2016 row at the same level
    const floor = w.event && own ? (lv) => atLevel(own, 'hp', lv) : null;
    const rows = bossRows({ e, template, orig, blankEnemy, stat, hpBody, partShare, knots, single, cap, floor });
    if (rows.why) return rows;
    if (rows.hpFloored) labels.push('hpFloor');
    if (config.lux) applyLux(rows, config.lux);
    return { rows, labels, hp: hpBody, hpSource: reading ? 'video' : 'rule', template, own, original };
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

  census.rows.forEach((row) => {
    if (only ? !only.has(row.id) : !String(row.id).startsWith('WW-')) return;
    if (NOT_RAID_EVENT[row.family] || (EVENT_FAMILIES.has(row.family) && !row.start)) {
      out.report.skipped.push({ censusId: row.id, family: row.family, why: NOT_RAID_EVENT[row.family] || 'no dates' });
      return;
    }
    const evStageId = EV_BASE + numbers.rows[row.id];
    const tierRows = tierRowsOf(row, weeks);
    const evRow = eventRows.get(row.id);
    const stageIds = [];
    tierRows.forEach((w) => {
      const date = row.start;
      const tier = tierOf(w, date);
      const n = numbers.entries[keyOf(row, w)];
      const bossOf = (name) => (census.bosses || []).find((b) => b.ww === name);
      const modelId = bossOf(w.boss) ? bossOf(w.boss).raid_model_id : 0;
      const m = modelOf(modelId);
      const evQuest = w.event ? eventQuestOf(evRow, w) : null;
      const questKey = w.event ? (evQuest && evQuest.page ? String(evQuest.page).replace(/\s*\(Quest\)\s*$/, '') : w.boss)
        : w.tier === SINGLE ? 'Raid Time!' : `(${w.tier}) ${w.gem_drop ? 'Gem Drop: ' : ''}Raid Time!`;
      const quest = (values.quests || {})[w.event ? 'Raid Time!' : questKey];
      const worldReal = mapWorld(w.map);
      const reconstructed = ['atk', 'def', 'partHp', 'upMinutes', 'useAp', 'coinOdds', config.lux ? 'lux' : 'rewards2016'];
      const entry = { key: keyOf(row, w), censusId: row.id, family: row.family, start: row.start, end: row.end, tier, gemDrop: !!w.gem_drop,
        boss: w.boss, modelId, available: false, why: null, stageId: RANGES.stage[1] + n, evStageId, settingId: RANGES.raidSetting[1] + n, enemyId: RANGES.raidEnemy[1] + 10 * n,
        upMinutes: config.weeklyUpMinutes, useAp: config.useAp, questAp: w.event ? [num(evQuest && evQuest.ap)] : String(w.ap).split('/').map(num), map: w.map, worldId: 0,
        level: w.event ? w.quest_lv : (config.tierQuestLv || {})[tier] || num(w.quest_lv), hp: 0,
        boards: w.event ? ((evRow && evRow.boards) || []).map((b) => b.board) : (values.week_boards || []).find((b) => b.start === row.start)?.boards || fixes.boards[row.id] || String(row.rewards || '').split(/\s*[;,|]\s*/).filter(Boolean),
        reconstructed };
      // event raids (Task 10): when they open (raid-calendar.js openNow), on Pacific days
      if (w.event) {
        entry.event = true;
        entry.periods = w.day ? [[row.start, isoDay(dayMs(row.end) - DAY)]] : eventPeriods(row);
        if (row.family === 'weekend-only') entry.open = 'weekend';
        else if (row.family === 'daily showdown') { entry.open = 'day'; entry.day = w.day; } else if (row.family === 'daily') entry.open = 'daily';
      }
      out.index.entries.push(entry);

      const single = tier === SINGLE || w.event ? config.singleEra : null;
      if (!usable(m)) entry.why = 'graphics';
      else if (!orig.get(modelId) && !orig.get((config.modelTemplates || {})[w.boss])) entry.why = 'template';
      else if (!worldReal) entry.why = 'map';
      else if (!quest || (w.event && !evQuest)) entry.why = 'quest';
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
      out.settingRows.push({ raidSettingId: entry.settingId, bossId: entry.enemyId, bossUpTime: entry.upMinutes, useAp: entry.useAp, rareBossId: entry.enemyId, rareBossUpTime: entry.upMinutes,
        rareUseAp: entry.useAp, rareUpType: 3, rareUpTypeArg: 1, rareUpTriggerBossId: entry.enemyId, validUnlockRare: 0, unlockRareBossId: [0, 0, 0], unlockRareNum: [0, 0, 0], ...settingExtra });

      // stage: copy of a story row of the map's world; a world with a broken background draws world 1's instead
      let stageWorld = worldReal;
      if (!worldBg.has(worldReal) || broken.includes(worldBg.get(worldReal))) { stageWorld = fallbackWorld; reconstructed.push('background'); }
      entry.worldId = stageWorld;
      const ref = refByWorld.get(worldReal) || story[story.length - 1];
      if (!ref) throw new Error('raid: no story rows in the stage table');
      const questAp = entry.questAp;
      // objectives: the event quest's own, with their rewards; the standard Raid Time! ones when one cannot be served
      let subs = w.event ? eventQuestSubs(evQuest, medalIndex) : null;
      if (w.event && !subs) reconstructed.push('questObjectives');
      subs = subs || questSubs(quest.info, REWARDS.coinType, entry.key);
      const stage = { ...JSON.parse(JSON.stringify(ref)), stageId: entry.stageId, stageBinId: entry.stageId, id: entry.stageId, name: questKey, mapName: w.map,
        useAp: questAp[questAp.length - 1], chapterId: Math.floor(entry.stageId / 1000), worldId: stageWorld, onlyDrama: 0, stageKind: STAGE_KIND,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [], afterDramaType: [], branchType: 0, disableContinue: 0, addLevel: 0, holdKeyblade: 0,
        validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 0, clearGetItemType: [], clearGetItemId: [],
        clearGetAssignSkillType: [], clearGetAssignSkillId: [], clearGetAssignSkillLv: [], clearGetItemNum: [], resetSubMission: 0, combinedSubmissionFlag: 0, raidBoss: entry.settingId,
        ...subs };
      out.stageRows.push(stage);
      stageIds.push(entry.stageId);
      // map: one target plus two, each worth raidPoint 3000 (enemy row 100); `world` is the room's world, for the room choice
      const egg = () => ({ name: EGG, enemyId: EGG_ID, n: 1, reward: ENEMY_REWARD });
      out.maps.push({ stageId: entry.stageId, world: worldReal, name: questKey, room: w.map, target: EGG, targetId: EGG_ID, targetReward: ENEMY_REWARD, level: entry.level,
        enemies: [[egg(), egg()]], treasures: [], rooms: 1 });
      entry.available = true;
    });
    if (stageIds.length) { out.evStageRows.push(evStageRow(evStageId, stageIds)); withRaid.add(row.id); }
  });
  // Raid Boards (raid-boards.js): one set per census row with a raid, shared by its tiers
  if (boards) {
    const { doc, ev } = boardDocOf(boards, census, eventRewards);
    const b = raidBoards.buildBoards({ doc, correctionsMd: (rewards || {}).correctionsMd, master, ids: numbers, config: config.boards || {}, censusIds: withRaid, families: BOARD_FAMILIES });
    Object.assign(out, { sphereRows: b.sphereRows, arrayRows: b.arrayRows, masuRows: b.masuRows, boardArt: b.art });
    out.ids = { ...out.ids, boards: b.boardIds };
    out.report.boards = { ...b.report, count: b.sphereRows.length };
    for (const e of out.index.entries) {
      e.sphereBoardIds = b.byCensus[e.censusId] || [];
      if (e.sphereBoardIds.length) e.reconstructed.push(...(b.labels[e.censusId] || []), ...(ev.standard.has(e.censusId) ? ['boardStandard'] : []), ...(ev.gendered.has(e.censusId) ? ['boardGender'] : []));
    }
  } else for (const e of out.index.entries) e.sphereBoardIds = [];
  for (const e of out.index.entries) {
    if (e.why) out.report.why[e.why] = (out.report.why[e.why] || 0) + 1;
    if (e.why === 'template' && !out.report.templateGap.includes(e.boss)) out.report.templateGap.push(e.boss);
    for (const label of e.reconstructed) {
      const reason = (config.reconstructedWhy || {})[label];
      if (!reason) throw new Error(`raid: no reason for the label ${label} in reconstructedWhy of raid_config.json`);
      out.index.reasons[label] = reason;
    }
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
  const out = buildRaid({ ...sources, master, models, config: opts.config || loadConfig(), ids: readIds(idsFile) });
  const added = { stage: out.stageRows, evStage: [...(out.catalogEvStage ? [out.catalogEvStage] : []), ...out.evStageRows], raidSetting: out.settingRows, raidEnemy: out.enemyRows, raidReward: out.rewardRows, raidEnemyAttack: out.attackRows,
    sphere: out.sphereRows, sphereArray: out.arrayRows, sphereMasu: out.masuRows };
  for (const [t, rows] of Object.entries(added)) fs.writeFileSync(path.join(masterDir, `${t}.json`), JSON.stringify([...master[t], ...rows]));
  fs.mkdirSync(gameData, { recursive: true });
  const own = Object.fromEntries(Object.entries(added).map(([t, rows]) => [t, rows.map((r) => r[tableKey[t]])]));
  fs.writeFileSync(path.join(gameData, 'raids.json'), JSON.stringify({ entries: out.index.entries, reasons: out.index.reasons, ...(out.index.catalog ? { catalog: out.index.catalog } : {}), boards: out.report.boards, own }, null, 1));
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
  const { census, values, rewards, boards, eventRewards } = readSources(src, dir2016);
  const ids = allocateIds({ census, weeks: correctedFrom(values, rewards), ids: readIds(IDS_FILE), only: null });
  ids.boards = raidBoards.allocateBoardIds(boardDocOf(boards, census, eventRewards).doc, ids, BOARD_FAMILIES);
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

module.exports = { buildRaid, applyLux, atLevel, eventPeriods, eventTierRows, EVENT_FAMILIES, patch, allocateIds, deduceStats, readSources, parseCorrections, parsePartHp, tierHp, stepDate, DEFAULT_SRC, DEFAULT_2016 };
