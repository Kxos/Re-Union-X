#!/usr/bin/env node
// Renumbered medals (I-225, user's decision 03-11): during a special attack the client reads the medal row
// cutinRowId(id) (ids ending in 2/4 -> id-1, the SE convention: a 2★/4★ uses its 1★/3★ cut-in; make-cutin-alias.js).
// Many of our Roboloid ids (300000 + Roboloid id) end in 2/4 with row id-1 holding ANOTHER medal, so the special
// showed that medal's cut-in, frame and sound (SN++ - MoM Kairi B 302084 -> SN++ - Illus. Marluxia 302083).
// No data can fix a shared row: those medals take a new medalId = old + 10001 (30xxxx -> 31xxxx, last digit 3 or 5,
// so the client reads their own row). imageId, thumbId, cutinId, artId, displayId, burstId stay: no new resources.
// The frozen list is medal_renumber.json (old -> new, normal rows only); copies (boosted 1-8xxxxxx = digit x 10^6 +
// the normal id) follow their normal row. Sources keep the Roboloid ids: make-game-tables.js renumbers medal.json
// after the medal rows are built, the readers of the banner catalogue map it (mapCatalog), the reward tables are
// mapped at the end (patch), saves migrate at load (server.js medalMapVersion 3).
//
//   node server/medal-renumber.js [master folder]      apply in place (idempotent)
//   node server/medal-renumber.js --make [master]      write medal_renumber.json from the conflicts of the master
'use strict';

const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, 'medal_renumber.json');
const STEP = 10001;
const readMap = (file = MAP_FILE) => {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).renumber).map(([a, b]) => [Number(a), b]));
  } catch { return new Map(); }
};
let BASE = readMap();

// old id -> new id (normal rows from the list, copies digit x 10^6 + normal); every other value unchanged
function newId(id, base = BASE) {
  if (typeof id !== 'number' || !base.size) return id;
  if (id < 1000000) return base.get(id) ?? id;
  if (id < 9000000) { const b = base.get(id % 1000000); return b ? id - (id % 1000000) + b : id; }
  return id;
}

// medal.json: the row's own id and the fields holding medal ids (Evolve, materials, normal of a copy, dot materials)
const MEDAL_FIELDS = ['medalId', 'evolveId', 'groupId'];
const MEDAL_ARRAYS = ['evolveNeedId', 'burstEnhanceCategory'];
function renumberMedals(medals, base = BASE) {
  let n = 0;
  for (const r of medals) {
    for (const k of MEDAL_FIELDS) { const to = newId(r[k], base); if (to !== r[k]) { r[k] = to; n++; } }
    for (const k of MEDAL_ARRAYS) {
      if (!Array.isArray(r[k])) continue;
      r[k] = r[k].map((v) => { const to = newId(v, base); if (to !== v) n++; return to; });
    }
  }
  return n;
}

// reward fields of the other tables: [table, type field, id field], reward type 3 = medal
const REWARD_PAIRS = [
  ['stage', 'clearGetItemType', 'clearGetItemId'], ['stage', 'submissionRewardType', 'submissionItemId'],
  ['stage_base', 'clearGetItemType', 'clearGetItemId'], ['stage_base', 'submissionRewardType', 'submissionItemId'],
  ['sphereMasu', 'rewardSelect', 'rewardId'], ['mission', 'rewardType', 'itemId'], ['loginBonus', 'rewardType', 'rewardId'],
  ['reward', 'type', 'id'], ['raidReward', 'type', 'id'], ['moogleshop', 'itemType', 'itemId'],
  ...['damagemvp', 'helpmvp', 'nohelpmvp', 'clearmission'].map((p) => ['multiStage', p + 'RewardType', p + 'ItemId']),
];
const MEDAL_REWARD = 3;
function renumberRewards(rows, typeKey, idKey, base = BASE) {
  let n = 0;
  for (const r of rows) {
    if (Array.isArray(r[idKey])) {
      const types = [].concat(r[typeKey]);
      r[idKey] = r[idKey].map((v, i) => { const to = types[i] === MEDAL_REWARD ? newId(v, base) : v; if (to !== v) n++; return to; });
    } else if (r[typeKey] === MEDAL_REWARD) {
      const to = newId(r[idKey], base);
      if (to !== r[idKey]) { r[idKey] = to; n++; }
    }
  }
  return n;
}

// banner catalogue (game_data/gacha_catalog.json, make_banner_catalog.py, Roboloid ids): medal ids of the name
// index, banner bonus and pity gift [type, id, n] of type 3, Evolve pool [id, n]. Changes and returns the object.
function mapCatalog(catalog, base = BASE) {
  if (!catalog || !base.size) return catalog;
  for (const e of Object.values(catalog.medals || {})) for (const x of e?.ids || []) if (Array.isArray(x)) x[0] = newId(x[0], base);
  const gift = (g) => { if (Array.isArray(g) && g[0] === MEDAL_REWARD) g[1] = newId(g[1], base); };
  for (const b of catalog.banners || []) {
    for (const g of b.bonus || []) gift(g);
    gift(b.guarantee?.pityGift);
    for (const x of b.pool?.evolve || []) if (Array.isArray(x)) x[0] = newId(x[0], base);
  }
  return catalog;
}

// in place on a master folder: medal.json and the reward tables; idempotent (new ids are never old ids)
function patch(masterDir, base = BASE) {
  const out = { medal: 0, rewards: 0 };
  const file = (t) => path.join(masterDir, t + '.json');
  const medals = JSON.parse(fs.readFileSync(file('medal'), 'utf8'));
  out.medal = renumberMedals(medals, base);
  if (out.medal) fs.writeFileSync(file('medal'), JSON.stringify(medals));
  const tables = new Map();
  for (const [t, ty, id] of REWARD_PAIRS) {
    if (!fs.existsSync(file(t))) continue;
    if (!tables.has(t)) tables.set(t, { rows: JSON.parse(fs.readFileSync(file(t), 'utf8')), n: 0 });
    const e = tables.get(t);
    e.n += renumberRewards(e.rows, ty, id, base);
  }
  for (const [t, e] of tables) if (e.n) { fs.writeFileSync(file(t), JSON.stringify(e.rows)); out.rewards += e.n; }
  return out;
}

// the list: normal rows whose cut-in row id-1 exists and is another medal (make-cutin-alias.cutinConflicts);
// a missing row id-1 is make-cutin-alias's job (alias row)
function conflictMap(medals) {
  const { cutinConflicts, cutinRowId } = require('./make-cutin-alias');
  const have = new Set(medals.map((r) => r.medalId));
  const out = new Map();
  for (const r of cutinConflicts(medals)) {
    if (r.medalId >= 1000000 || !have.has(cutinRowId(r.medalId))) continue;
    out.set(r.medalId, r.medalId + STEP);
  }
  for (const to of out.values()) {
    if (to % 10 === 2 || to % 10 === 4 || have.has(to)) throw new Error(`new id ${to} not usable`);
  }
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'master_data');
  if (args.includes('--make')) {
    const medals = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8'));
    const m = conflictMap(medals);
    const byId = new Map(medals.map((r) => [r.medalId, r]));
    const names = Object.fromEntries([...m.keys()].map((id) => [id, `${byId.get(id).name} (row ${id - 1}: ${byId.get(id - 1).name})`]));
    fs.writeFileSync(MAP_FILE, JSON.stringify({
      note: 'I-225: medalId old -> new (old + 10001), frozen: saves migrate with this list (server.js medalMapVersion 3). '
        + 'Written once by node server/medal-renumber.js --make on the master before the renumbering',
      renumber: Object.fromEntries(m), names }, null, 1) + '\n');
    console.log(`medal_renumber.json: ${m.size} medals`);
  } else {
    console.log('medal-renumber:', JSON.stringify(patch(dir)));
  }
}

// server: the mapping is on only when the served master is renumbered (no row with an old id); otherwise newId is the
// identity, so an old master, an old save and the catalogue keep agreeing until the master is regenerated
function syncWithMaster(masterDir) {
  const full = readMap();
  let medals = [];
  try { medals = JSON.parse(fs.readFileSync(path.join(masterDir, 'medal.json'), 'utf8')); } catch { /* no master */ }
  const old = medals.some((r) => r.medalId < 9000000 && full.has(r.medalId % 1000000));
  BASE = old ? new Map() : full;
  return !old;
}

module.exports = { MAP_FILE, STEP, readMap, newId, renumberMedals, renumberRewards, mapCatalog, patch, conflictMap, REWARD_PAIRS,
  syncWithMaster, reload: (file) => { BASE = readMap(file); return BASE; } };
