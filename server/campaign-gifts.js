// Conditional Present campaigns (I-234, docs/notes/campaigns.md): original campaigns that sent Medals, titles, Gems,
// Jewels or Draw Tickets to the Present Box when the player met a condition (own some Medals, unlock their Special
// Attack Bonus or traits, draw a Deal N times, clear a Story Quest, LUX level, Medal storage). Data: server/campaign_gifts.json (paraphrased from the WW notices, ids cited there).
// Pure rules: server.js (checkCampaignGifts) gives the player state and sends the presents.
//
// Opening: a campaign opens when the Shop week of the player's Story reaches its start date (storyCtx().shopTo, the
// same calendar as the Shop) and then stays open: the original deadlines would make the rewards impossible to get in
// a game that follows the Story (declared in the Notice «Campaign Rewards»).
// Condition kinds (each reward is sent once per unit; units already given are remembered in player.campaignGifts):
// - each:     one unit per listed Medal (by name) of which at least one copy passes the test
// - eachCopy: one unit per copy (userMedalId) that passes the test, no limit (32512)
// - any:      one unit if any option holds; an option is a list of requirements that must all hold, a requirement
//             = at least one copy of one of its Medals passes its test
// - sets:     floor(copies passing the test / size) units, at most limit (copies counted separately, 69291)
// - tiers:    tier k is reached when the copies passing the test are at least tiers[k].at; each tier its own reward
// - draws:    draws of the listed Deals (player.gacha.count): every N -> one unit per N draws, at N -> one unit once
// - story:    one unit once the Story Quest is cleared
// - lux:      one unit per LUX level (51531: one Draw Ticket per level); with once: true the level is read only the
//             first time the campaign is checked open (the original read it on a fixed date), never topped up later
// - storage:  one unit once the Medal storage reaches `slots` (69125: 3,000 slots)
// Rewards: {medal, rare, num, dots?, skill?, boosted?} type 3, {material} 5, {title} 7, {jewels: n} 2,
// {ticket: currency, num} 41 (payType 8 Shop currency, index in `tickets` = gacha.TICKET_CURRENCIES; Bronze/Silver/Gold
// Tickets have no Shop currency here and are rejected, docs/notes/campaigns.md).
// Tests: own (any copy), saBonus (Special Attack Bonus unlocked: guiltFactor > 0), traits (at least `traits` traits).
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'campaign_gifts.json');
const BOOST_DIGIT = { '1000:0': 1, '1000:1000': 2, '2000:2000': 3 }; // medal-boost.js VARIANTS

function load(file = FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).campaigns || [];
}

// Master tables -> compiled campaigns: Medal names become id sets, rewards become present rows
// {type, id, num, dots?, skillId?}. Unknown names go to errors (the campaign is dropped, the others stay).
function compile(campaigns, { medals = [], materials = [], titles = [], skills = [], drawIdOf = () => undefined, tickets = [] } = {}) {
  const errors = [];
  const idsByName = new Map();
  for (const m of medals) {
    if (!idsByName.has(m.name)) idsByName.set(m.name, new Set());
    idsByName.get(m.name).add(m.medalId);
  }
  const normalOf = (name, rare) => medals.find((m) => m.name === name && m.rare === rare && !m.groupId);
  const idsOf = (names, where) => {
    const out = new Set();
    for (const n of names || []) {
      const s = idsByName.get(n);
      if (!s) errors.push(`${where}: Medal «${n}» not in the master`); else for (const id of s) out.add(id);
    }
    return out;
  };
  const rewardRows = (list, where) => (list || []).map((r) => {
    if (r.medal) {
      const row = normalOf(r.medal, r.rare);
      if (!row) { errors.push(`${where}: reward «${r.medal}» ${r.rare}★ not in the master`); return null; }
      let id = row.medalId;
      if (r.boosted) {
        const b = BOOST_DIGIT[r.boosted] * 1000000 + row.medalId;
        if (!BOOST_DIGIT[r.boosted] || !medals.some((m) => m.medalId === b)) { errors.push(`${where}: boosted ${r.boosted} of «${r.medal}» missing`); return null; }
        id = b;
      }
      const out = { type: 3, id, num: r.num || 1 };
      if (r.dots) out.dots = r.dots;
      if (r.skill) {
        const sk = skills.find((s) => s.name === r.skill);
        if (!sk) { errors.push(`${where}: skill «${r.skill}» not in skill.json`); return null; }
        out.skillId = sk.skillId;
      }
      return out;
    }
    if (r.material) {
      const row = materials.find((m) => m.name === r.material);
      if (!row) { errors.push(`${where}: material «${r.material}» missing`); return null; }
      return { type: 5, id: row.materialId, num: r.num || 1 };
    }
    if (r.title) {
      const row = titles.find((t) => t.title === r.title);
      if (!row) { errors.push(`${where}: title «${r.title}» missing`); return null; }
      return { type: 7, id: row.titleId, num: 1 };
    }
    if (r.jewels) return { type: 2, id: 0, num: Number(r.jewels) };
    if (r.ticket) {
      const i = tickets.indexOf(r.ticket);
      if (i < 0) { errors.push(`${where}: ticket «${r.ticket}» is not a Shop currency`); return null; }
      return { type: 41, id: i, num: r.num || 1 };
    }
    errors.push(`${where}: reward without medal/material/title/jewels/ticket`);
    return null;
  });
  const out = [];
  for (const c of campaigns) {
    const before = errors.length, cond = { ...c.condition }, w = c.id;
    if (cond.medals) cond.ids = idsOf(cond.medals, w);
    if (cond.medals && cond.kind === 'each') cond.idsByMedal = cond.medals.map((n) => idsByName.get(n) || new Set());
    if (cond.options) cond.options = cond.options.map((opt) => opt.map((req) => ({ ...req, ids: idsOf(req.medals, w) })));
    if (cond.banners) {
      cond.drawIds = cond.banners.map((b) => drawIdOf(b));
      cond.banners.forEach((b, i) => { if (cond.drawIds[i] === undefined) errors.push(`${w}: Deal ${b} not in the catalogue`); });
    }
    if (cond.tiers) cond.tiers = cond.tiers.map((t) => ({ at: t.at, reward: rewardRows(t.reward, `${w} tier ${t.at}`) }));
    const reward = rewardRows(c.reward, w);
    if (errors.length === before) out.push({ ...c, condition: cond, reward });
  }
  return { campaigns: out, errors };
}

// state: {medals: [{userMedalId, medalId, guiltFactor, traits}], drawCount(drawMedalTypeId), storyQuest, luxLevel, medalSlots}
function passes(m, cond) {
  if (cond.test === 'saBonus') return (m.guiltFactor || 0) > 0;
  if (cond.test === 'traits') return (m.traits || 0) >= (cond.traits || 1);
  return true; // own
}
const passing = (state, ids, cond) => state.medals.filter((m) => ids.has(m.medalId) && passes(m, cond));

// -> {keys: [...]} for keyed kinds, {units: n} for counted ones
function earned(c, state) {
  const cond = c.condition;
  switch (cond.kind) {
    case 'each': return { keys: cond.medals.filter((n, i) => passing(state, cond.idsByMedal[i], cond).length > 0) };
    case 'eachCopy': return { keys: passing(state, cond.ids, cond).map((m) => String(m.userMedalId)) };
    case 'any': return { units: cond.options.some((opt) => opt.every((req) => passing(state, req.ids, req).length > 0)) ? 1 : 0 };
    case 'sets': {
      const n = Math.floor(passing(state, cond.ids, cond).length / (cond.size || 1));
      return { units: cond.limit ? Math.min(cond.limit, n) : n };
    }
    case 'tiers': {
      const have = passing(state, cond.ids, cond).length;
      return { units: cond.tiers.filter((t) => have >= t.at).length };
    }
    case 'draws': {
      const total = cond.drawIds.reduce((s, id) => s + (state.drawCount(id) || 0), 0);
      return { units: cond.at ? (total >= cond.at ? 1 : 0) : Math.floor(total / (cond.every || 1)) };
    }
    case 'story': return { units: (state.storyQuest || 0) >= cond.quest ? 1 : 0 };
    case 'lux': return { units: Math.max(0, Number(state.luxLevel) || 0) };
    case 'storage': return { units: (state.medalSlots || 0) >= cond.slots ? 1 : 0 };
    default: return { units: 0 };
  }
}

// Presents due now for the open campaigns. given = player.campaignGifts (changed in place: {units, keys}).
// -> [{campaign, rows: [present rows]}]
function due(compiled, state, given) {
  const out = [];
  for (const c of compiled) {
    const g = (given[c.id] ||= {});
    const e = earned(c, state);
    let rows = [];
    if (e.keys) {
      const had = new Set(g.keys || []);
      const fresh = e.keys.filter((k) => !had.has(k));
      if (!fresh.length) continue;
      g.keys = [...had, ...fresh];
      for (let k = 0; k < fresh.length; k++) rows.push(...c.reward);
    } else {
      const had = g.units || 0;
      if (c.condition.once && had) continue; // snapshot campaigns (lux): read once, never topped up
      if (e.units <= had) continue;
      if (c.condition.kind === 'tiers') rows = c.condition.tiers.slice(had, e.units).flatMap((t) => t.reward);
      else for (let k = had; k < e.units; k++) rows.push(...c.reward);
      g.units = e.units;
    }
    out.push({ campaign: c, rows: merge(rows) });
  }
  return out;
}

// same reward several times (units, tiers) -> one present with the summed number
function merge(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.type}:${r.id}:${r.dots || 0}:${r.skillId || 0}`;
    if (by.has(k)) by.get(k).num += r.num; else by.set(k, { ...r });
  }
  return [...by.values()];
}

// open = the Story Shop week reached the start (ISO dates compare as strings); stays open once seen (given[id].open)
function openCampaigns(compiled, shopTo, given) {
  return compiled.filter((c) => {
    if (given[c.id]?.open) return true;
    if (String(shopTo) < c.start) return false;
    (given[c.id] ||= {}).open = true;
    return true;
  });
}

module.exports = { FILE, load, compile, earned, due, openCampaigns, passes };
