// Pure rules of raid rewards (docs/notes/raid.md, /raid/reward). A reward row has the raidReward shape:
// raidRewardId, oddsUpPerLv, pointUpPerLv, validReward, type[4], id[4], assignSkill*[4], burstUpperNumber[4], num[4], odds[4].
// One slot is won per table (Victory, MVP/Host, All Points Defeated); slots are alternatives.
// Choices not read from the originals are in raid_config.json with a reason.
'use strict';
const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8')).rewards;
const TYPE_RAID_COIN = CFG.coinType, TYPE_MATERIAL = 5, TYPE_MEDAL = 3;
const TABLES = ['victory', 'mvp', 'all'];
const TIER_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Legendary', 'Epic'];
// raidReward id = raidEnemyId * 100 + table * 10 + band (tables 1 Victory, 2 MVP/Host, 3 All Points)
const rewardRowId = (enemyId, table, band) => enemyId * 100 + table * 10 + band;

const dateKey = (d) => (typeof d === 'number' ? new Date(d).toISOString().slice(0, 10) : String(d).slice(0, 10));

function emptyRow(raidRewardId) {
  const z = () => [0, 0, 0, 0];
  return { raidRewardId, oddsUpPerLv: 0, pointUpPerLv: 1000, validReward: 0, type: z(), id: z(),
    assignSkillType: [1, 1, 1, 1], assignSkillId: z(), assignSkillLv: [1, 1, 1, 1], burstUpperNumber: z(), num: z(), odds: z() };
}

// Slot odds (base oddsBase, last slot rolled first) for a list of target shares in percent.
function oddsFromShares(shares) {
  const odds = shares.map(() => 0);
  let left = 100;
  for (let i = shares.length - 1; i >= 1; i--) {
    odds[i] = Math.round((shares[i] / left) * CFG.oddsBase);
    left -= shares[i];
  }
  odds[0] = 100000; // slot 1 always catches the rest
  return odds;
}

function tableRow(id, items, shares) {
  const row = emptyRow(id);
  row.validReward = items.length;
  const odds = oddsFromShares(shares);
  items.forEach((it, i) => { row.type[i] = it.type; row.id[i] = it.id; row.num[i] = it.num; row.odds[i] = odds[i]; });
  return row;
}

// The three coin tables of a boss: {victory, mvp, all}. Before cfg.tierFrom the level bands apply (tier 'single').
// `enemyId`: the boss row the tables belong to (each boss has its own rows). Band = level band, or tier number (1-5).
function coinRows({ enemyId, date, tier, level, gemDrop = false }) {
  let idx, spec, name;
  if (dateKey(date) >= CFG.tierFrom) {
    name = tier === 'Standard' ? 'Beginner' : tier;
    spec = CFG.tiers[name];
    if (!spec) throw new Error(`raid tier ${tier} has no coin table`);
    idx = 1 + TIER_ORDER.indexOf(name);
  } else {
    const band = CFG.bandsBefore.findIndex((b) => level >= b.minLv && level <= b.maxLv);
    if (band < 0) throw new Error(`raid level ${level} outside the level bands`);
    spec = CFG.bandsBefore[band]; idx = band + 1; name = 'single'; gemDrop = false;
  }
  const gemPct = gemDrop ? CFG.gemPctByTier[name] : 0;
  const gems = Object.values(CFG.gemMaterialIds).map((id) => ({ type: TYPE_MATERIAL, id, num: 1 }));
  const coin = (num) => ({ type: TYPE_RAID_COIN, id: 0, num });
  const out = {};
  TABLES.forEach((t, k) => {
    const id = rewardRowId(enemyId, k + 1, idx);
    const amounts = t === 'victory' ? spec.victory : [spec[t]];
    if (gemDrop) { // the low coin amount or one gem; the gem odds are reconstructed
      const each = gemPct / gems.length;
      out[t] = tableRow(id, [coin(amounts[0]), ...gems], [100 - gemPct, each, each, each]);
    } else if (t === 'victory') out[t] = tableRow(id, [coin(amounts[0]), coin(amounts[1])], [100 - CFG.highCoinPct, CFG.highCoinPct]);
    else out[t] = tableRow(id, [coin(amounts[0])], [100]);
  });
  return out;
}

// Slot (1-based) won in a table. Slots after the first are rolled from the last one; the chance of each grows by
// oddsUpPerLv for every level above cfg.oddsUpFromLevel.
function rollReward(row, level, rng) {
  const up = (row.oddsUpPerLv || 0) * Math.max(0, level - CFG.oddsUpFromLevel);
  for (let i = row.validReward - 1; i >= 1; i--) {
    const chance = Math.min(CFG.oddsBase, row.odds[i] + up);
    if (rng() * CFG.oddsBase < chance) return i + 1;
  }
  return 1;
}

const slotItem = (row, slot) => ({ type: row.type[slot - 1], id: row.id[slot - 1], num: row.num[slot - 1],
  skillId: row.assignSkillId?.[slot - 1] || 0, skillLv: row.assignSkillLv?.[slot - 1] || 1 });

// Pending reward of a fight, or null when the raid was not won. `rows` = {victory, mvp, all}. The player alone is
// both summoner and top damage dealer, and MVP/Host pays once. All Points pays only when `allPoints`.
function pendingEntry({ raid, rows, victory, allPoints, rng }) {
  if (!victory) return null;
  const level = raid.level;
  const withAll = !!(allPoints && rows.all);
  return { raidId: raid.raidId, level, subdueId: rollReward(rows.victory, level, rng), mvpId: rollReward(rows.mvp, level, rng),
    partAllId: withAll ? rollReward(rows.all, level, rng) : 0,
    rewardIds: { victory: rows.victory.raidRewardId, mvp: rows.mvp.raidRewardId, all: withAll ? rows.all.raidRewardId : 0 } };
}

function entryItems(entry, rows) {
  const out = [];
  [['victory', entry.subdueId], ['mvp', entry.mvpId], ['all', entry.partAllId]].forEach(([from, slot]) => {
    if (slot > 0) out.push({ from, ...slotItem(rows[from], slot) });
  });
  return out;
}

// Drops entries the client would choke on (a slot past validReward, a row that no longer exists). `rowExists(id)`
// returns the row, or true when only existence is known. /raid/reward runs on every opening of the quest screen.
function sanitizePending(list, rowExists, log = console.log) {
  return (list || []).filter((e) => {
    for (const [from, slot, must] of [['victory', e.subdueId, true], ['mvp', e.mvpId, true], ['all', e.partAllId, false]]) {
      if (!must && !slot) continue;
      const id = e.rewardIds?.[from];
      const row = id ? rowExists(id) : null;
      if (!row) { log(`[raid] pending ${e.raidId} dropped: ${from} row ${id} missing`); return false; }
      if (!Number.isInteger(slot) || slot < 1 || (row.validReward !== undefined && slot > row.validReward)) {
        log(`[raid] pending ${e.raidId} dropped: ${from} slot ${slot} outside the row ${id}`); return false;
      }
    }
    return true;
  });
}

// A medal goes to the Present Box when the medal storage is full; anything else is granted.
const deliverReward = (item, { medalCount, cap }) => (item.type === TYPE_MEDAL && medalCount + (item.num || 1) > cap ? 'present' : 'grant');

// Delivers every item of an entry through the injected grant/present; a full box never stops the entry.
function deliverEntry(entry, rows, { medalCount, cap, grant, present }) {
  let count = medalCount, granted = 0, presented = 0;
  for (const item of entryItems(entry, rows)) {
    if (deliverReward(item, { medalCount: count, cap }) === 'present') { present(item); presented++; } else {
      grant(item); granted++;
      if (item.type === TYPE_MEDAL) count += item.num || 1;
    }
  }
  return { granted, presented };
}

// Old saves have no player.raid: it is filled in place.
function raidState(player) {
  const r = player.raid = player.raid || {};
  if (r.boss === undefined) r.boss = null;
  if (!r.levels) r.levels = {};
  if (typeof r.points !== 'number') r.points = 0;
  if (!Array.isArray(r.pending)) r.pending = [];
  if (r.kept === undefined) r.kept = null;
  return r;
}

module.exports = { rewardRowId, coinRows, rollReward, slotItem, pendingEntry, entryItems, sanitizePending, deliverReward, deliverEntry, raidState, CONFIG: CFG };
