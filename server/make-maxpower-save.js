// Bench save with maximum power, for testing late story quests against the original (huge) enemy HP.
// Copy of a real save (default server/save/provefine.json, story to 979) with:
// - every Tier 8, 9 and 10 attack medal (guiltValue of the medal row), last form of each Evolve chain only
//   (SN -> SN+ -> SN++: the SN++), strongest variant of each (the boosted copy 2xxxxxx/3xxxxxx, +1000/+2000
//   STR/DEF, cost -10); an existing copy of the same medalId is upgraded instead of adding a new one;
// - each one at maximum: level maxLv, special attack dots (burst.maxEnhanceCount), guilt at the top of the
//   tier range (guiltProb), Chip/Dale STR/DEF (addMaxAttack/addMaxDefense), Cid cost (cost - minCost), locked;
// - best traits (khuxwiki «Medal», Traits/Special Traits): Special Trait «Extra Attack: 120% Power» (1001)
//   and, in the normal slots, Ground Enemy DEF -70% (3), Aerial Enemy DEF -70% (4), then STR +1500 (6)
//   repeated. Extra Attack and the enemy DEF traits do not stack (only the strongest applies), STR does: with
//   the 120% Special Trait an «Extra Attack: 50%» in a normal slot would do nothing;
// - best skill: Attack Boost XV Max (1147, x4.0, 100% at LV 20) at its maximum level;
// - every owned keyblade at its last level (+60), gauge full, deck 1 = the best 5 of these medals for the
//   keyblade's slots (attribute / Upright-Reversed multipliers), 6th (pet) slot and the 120 subslots filled
//   (matching slot attribute, highest tier first); favorite / current keyblade = the one with the highest
//   deck value; Spirit gear = the 6 medals with the most Pet Points outside that deck;
// - the medals pre-registered in player.guiltBurst (first + max guilt) so that the first response does not
//   fire one «NOVA LEVEL UP!» popup per medal.
// Lux, HP, cost and the story stay those of the source (Lux level 296 already has the maximum deck cost and HP).
//
//   node server/make-maxpower-save.js [source] [destination]
//   (default server/save/provefine.json -> server/save/maxpower.json;
//    then tools/ldplayer/session/relogin.ps1 -Save maxpower -RealNow 2026-12-09T10:00:00Z)
'use strict';
const fs = require('fs');
const path = require('path');
const { guiltRange } = require('./medal-guilt');
const { expToReach } = require('./medal-skill');
const { isCutinAlias } = require('./make-cutin-alias');

const USER_KEYBLADE_ID = 1;
const TIERS = [10, 9, 8];
const SPECIAL_TRAIT = 1001;            // Extra Attack: 120% Power (Special Trait, shuffleskill type 2)
const NORMAL_TRAITS = [3, 4, 6, 6, 6]; // Ground DEF -70%, Aerial DEF -70%, STR +1500 x3
const SKILL_ID = 1147;                 // Attack Boost XV Max

function loadTables(dir) {
  const t = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  return {
    medal: t('medal'), burst: t('burst'), guiltProb: t('guiltProb'), medalMisc: t('medalMisc'), keyblade: t('keyblade'),
    keybladeSubslot: t('keybladeSubslot'), shuffleskill: t('shuffleskill'), skill: t('skill'), skillExp: t('skillExp'),
  };
}

// cumulative EXP to pass level lv (as medalExpToPass in server.js)
function expToPass(misc, row, lv) {
  const [n, a, p] = misc(105 + (row.expType >= 1 && row.expType <= 6 ? row.expType : 1));
  const f = Math.fround;
  return Math.trunc(f(a * f(Math.pow(f(lv / f(n - 1)), f(p / 10000)))));
}

// slot multiplier (x10000): accord with the same attribute, dlaccord with the same attribute and Upright/Reversed
// (darklight 3 = none); attribute 4 = any (make-keyblade-levels.js)
function slotMult(kb, i, row) {
  const a = kb.attribute[i], d = kb.darklight[i];
  if (a !== 4 && a !== row.attribute) return 10000;
  if (d !== 3 && d === row.darklight && kb.dlaccord[i] > 0) return Math.max(kb.accord[i], kb.dlaccord[i]);
  return kb.accord[i] || 10000;
}

// picks the medal rows: Tier 8-10 attack medals, last form of the chain, strongest variant
function pickRows(tables) {
  const byId = new Map(tables.medal.map((r) => [r.medalId, r]));
  const base = tables.medal.filter((r) => r.medalId < 1e6 && TIERS.includes(r.guiltValue) && r.type === 1 && !isCutinAlias(r, byId));
  const inSet = new Set(base.map((r) => r.medalId));
  const finals = base.filter((r) => !(r.validEvolve && inSet.has(r.evolveId)));
  return finals.map((r) => [r, ...[1, 2, 3].map((v) => byId.get(v * 1e6 + r.medalId))]
    .filter((x) => x && !isCutinAlias(x, byId))
    .sort((a, b) => b.attack - a.attack || b.medalId - a.medalId)[0]);
}

function build(p, tables, opts = {}) {
  const misc = (id) => tables.medalMisc.find((r) => r.medalMiscId === id)?.value || [0, 0, 0];
  const bursts = new Map(tables.burst.map((r) => [r.burstId, r]));
  const kbRows = new Map(tables.keyblade.map((r) => [r.keybladeId, r]));
  const special = new Set(tables.shuffleskill.filter((r) => r.type === 2).map((r) => r.shuffleSkillId));
  const traitIds = new Set(tables.shuffleskill.map((r) => r.shuffleSkillId));
  for (const id of [SPECIAL_TRAIT, ...NORMAL_TRAITS]) if (!traitIds.has(id)) throw new Error(`trait ${id} missing from shuffleskill`);
  const skill = tables.skill.find((r) => r.skillId === SKILL_ID);
  if (!skill) throw new Error(`skill ${SKILL_ID} missing`);
  const skillExpRow = tables.skillExp.find((r) => r.expId === skill.expType)?.value;
  const now = opts.now || Math.max(Date.now(), ...(p.medals || []).map((m) => m.getDatetime || 0).filter(Number.isFinite));

  p.medals = p.medals || [];
  p.medalState = p.medalState || {};
  p.medalTraits = p.medalTraits || {};
  p.medalSkills = p.medalSkills || {};
  p.medalLocks = p.medalLocks || {};
  const removed = (id) => p.medalState[id]?.removed;
  const current = (m) => p.medalState[m.userMedalId]?.medalId ?? m.medalId;
  let nextId = Math.max(100, ...p.medals.map((m) => m.userMedalId), ...Object.keys(p.medalState).map(Number)) + 1;

  const picked = [];
  const tierCount = {};
  for (const row of pickRows(tables)) {
    const owned = p.medals.find((m) => current(m) === row.medalId && !removed(m.userMedalId));
    let id;
    if (owned) id = owned.userMedalId;
    else { id = nextId++; p.medals.push({ userMedalId: id, medalId: row.medalId, level: row.maxLv, getDatetime: now }); }
    const burst = bursts.get(row.burstId);
    const st = {
      medalId: row.medalId, level: row.maxLv, exp: expToPass(misc, row, row.maxLv - 1),
      burstUpperNumber: row.validBurst ? burst?.maxEnhanceCount || 0 : 0,
      guiltFactor: guiltRange(tables.guiltProb, row.guiltValue).max,
      attackUpperNumber: row.addMaxAttack || 0, defenseUpperNumber: row.addMaxDefense || 0,
      upperCost: Math.max(0, (row.cost || 0) - (row.minCost || 0)),
    };
    const prev = p.medalState[id] || {};
    delete prev.removed;
    p.medalState[id] = { ...prev, ...st };
    const m = p.medals.find((x) => x.userMedalId === id);
    m.medalId = row.medalId; m.level = row.maxLv;
    p.medalLocks[id] = 1;
    // traits: Special Trait first (as Spirit Training writes it), then the normal slots
    const traits = [];
    const add = (sid) => { p.nextShuffleSkillId = (p.nextShuffleSkillId || 1000) + 1; traits.push({ userShuffleSkillId: p.nextShuffleSkillId, shuffleSkillId: sid, type: 0, getDatetime: now }); };
    if ((row.spShuffleskillSlot || 0) > 0) add(SPECIAL_TRAIT);
    NORMAL_TRAITS.slice(0, row.shuffleskillSlot || 0).forEach(add);
    p.medalTraits[id] = traits;
    // skill
    if ((row.skillSlot ?? 1) > 0) {
      const old = p.medalSkills[id];
      const userSkillId = old?.userSkillId || (p.nextUserSkillId = (p.nextUserSkillId || 1) + 1);
      p.medalSkills[id] = { userSkillId, skillId: SKILL_ID, level: skill.maxLv, exp: skillExpRow ? expToReach(skillExpRow, skill.maxLv) : 0, getDatetime: now };
    }
    const strTraits = traits.filter((t) => !special.has(t.shuffleSkillId) && t.shuffleSkillId === 6).length * 1500;
    picked.push({ id, row, str: row.attack + st.attackUpperNumber + strTraits, cost: row.cost - st.upperCost, guilt: st.guiltFactor, owned: !!owned });
    tierCount[row.guiltValue] = (tierCount[row.guiltValue] || 0) + 1;
  }

  // guilt Burst registry: first + max guilt of every picked medal (key groupId || medalId, guilt-burst.js)
  p.guiltBurst = p.guiltBurst || { first: [], max: [] };
  for (const { row } of picked) {
    const key = row.groupId || row.medalId;
    if (!p.guiltBurst.first.includes(key)) p.guiltBurst.first.push(key);
    if (!p.guiltBurst.max.includes(key)) p.guiltBurst.max.push(key);
  }

  // keyblades at their last level, gauge full
  const owned = [{ userKeybladeId: USER_KEYBLADE_ID, keybladeId: p.starlightKeybladeId || 1000 }, ...(p.keyblades || [])];
  const topOf = (keybladeId) => {
    let r = kbRows.get(keybladeId);
    for (let n = 0; r && r.evolveId && n < 400; n++) r = kbRows.get(r.evolveId);
    return r;
  };
  const score = (m) => m.str * (1 + m.guilt / 10000);
  const decks = [];
  for (const k of owned) {
    const top = topOf(k.keybladeId);
    if (!top) throw new Error(`keyblade ${k.userKeybladeId}/${k.keybladeId} not in the master`);
    if (k.userKeybladeId === USER_KEYBLADE_ID) { p.starlightKeybladeId = top.keybladeId; p.keybladeBurst = top.maxBurstGauge * 10000; }
    else { const kk = p.keyblades.find((x) => x.userKeybladeId === k.userKeybladeId); kk.keybladeId = top.keybladeId; kk.burst = top.maxBurstGauge * 10000; }
    // best deck: top 8 candidates per slot, exhaustive over distinct medals
    const slots = Math.min(5, top.validConsist || 3);
    const cand = [...Array(slots).keys()].map((i) => picked.map((m) => ({ m, v: score(m) * slotMult(top, i, m.row) / 10000 }))
      .sort((a, b) => b.v - a.v).slice(0, 8));
    let best = { v: -1, ids: [] };
    const walk = (i, used, v, ids) => {
      if (i === slots) { if (v > best.v) best = { v, ids: ids.slice() }; return; }
      for (const c of cand[i]) if (!used.has(c.m.id)) { used.add(c.m.id); ids.push(c.m); walk(i + 1, used, v + c.v, ids); ids.pop(); used.delete(c.m.id); }
    };
    walk(0, new Set(), 0, []);
    const deckIds = best.ids.map((m) => m.id);
    if (k.userKeybladeId === USER_KEYBLADE_ID) p.deck = deckIds;
    else (p.keybladeDecks ||= {})[k.userKeybladeId] = deckIds;
    if (p.keybladeDeckSets?.[k.userKeybladeId]) p.keybladeDeckSets[k.userKeybladeId].active = 1;
    // 6th (pet) slot: the best medal outside the deck
    const rest = picked.filter((m) => !deckIds.includes(m.id)).sort((a, b) => score(b) - score(a));
    (p.petBaseSlots ||= {})[k.userKeybladeId] = rest[0]?.id || 0;
    // subslots: slot attribute (and Upright/Reversed) matched where possible, highest tier then STR
    const used = new Set([...deckIds, rest[0]?.id]);
    const sub = {};
    const rows = tables.keybladeSubslot.filter((r) => r.category === top.category && (r.lv ?? 0) <= (top.lv || 0))
      .sort((a, b) => a.slotNumber - b.slotNumber);
    const pool = rest.slice(1).sort((a, b) => b.row.guiltValue - a.row.guiltValue || score(b) - score(a));
    for (const r of rows) {
      const fit = (m) => !used.has(m.id) && (r.attribute === 4 || m.row.attribute === r.attribute) && (r.darklight === 3 || m.row.darklight === r.darklight);
      const m = pool.find(fit) || pool.find((x) => !used.has(x.id) && (r.attribute === 4 || x.row.attribute === r.attribute)) || pool.find((x) => !used.has(x.id));
      if (!m) break;
      used.add(m.id);
      sub[r.slotNumber] = m.id;
    }
    (p.keybladeSubslots ||= {})[k.userKeybladeId] = sub;
    decks.push({ userKeybladeId: k.userKeybladeId, keybladeId: top.keybladeId, name: top.name, value: Math.round(best.v), medals: best.ids,
      mults: best.ids.map((m, i) => slotMult(top, i, m.row)), subslots: Object.keys(sub).length, subslotRows: rows.length,
      cost: best.ids.reduce((s, m) => s + m.cost, 0) });
  }
  decks.sort((a, b) => b.value - a.value);
  const fav = decks[0];
  p.favoriteKeybladeId = fav.userKeybladeId;
  p.currentUserKeybladeId = fav.userKeybladeId;
  // Spirit gear: 6 medals with the most Pet Points outside the favorite deck
  if (p.pet) {
    const favIds = new Set(fav.medals.map((m) => m.id));
    p.pet.subslot = picked.filter((m) => !favIds.has(m.id)).sort((a, b) => (b.row.addPetPt || 0) - (a.row.addPetPt || 0) || score(b) - score(a))
      .slice(0, 6).map((m) => m.id);
  }
  p.money = Math.max(p.money || 0, 9999999);
  return { picked, tierCount, decks, fav };
}

if (require.main === module) {
  const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
  const SRC = process.argv[2] || path.join(__dirname, 'save', 'provefine.json');
  const DST = process.argv[3] || path.join(__dirname, 'save', 'maxpower.json');
  const p = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = build(p, loadTables(MASTER));
  fs.writeFileSync(DST, JSON.stringify(p, null, 1));
  console.log(`${DST}: ${out.picked.length} medals (tier ${Object.entries(out.tierCount).sort((a, b) => b[0] - a[0]).map(([t, n]) => `${t}: ${n}`).join(', ')}; `
    + `${out.picked.filter((m) => m.owned).length} upgraded copies)`);
  for (const d of out.decks) {
    console.log(`  ${d.userKeybladeId === out.fav.userKeybladeId ? '*' : ' '} ${d.name.padEnd(24)} value ${d.value} cost ${d.cost} subslots ${d.subslots}/${d.subslotRows}: `
      + d.medals.map((m, i) => `${m.row.name} (${m.str} x${d.mults[i] / 10000})`).join(', '));
  }
}

module.exports = { build, loadTables, pickRows, slotMult, SPECIAL_TRAIT, NORMAL_TRAITS, SKILL_ID };
