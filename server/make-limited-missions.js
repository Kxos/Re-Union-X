#!/usr/bin/env node
// Missioni Limited (missionType 4, I-118) a rotazione, scelte fra le originali della khuxwiki
// (server/limited_missions.tsv; decisione dell'utente del 16-10, HANDOFF):
// - una campagna mensile dei Lux («[Monthly] Limited time! Obtain a total of N Lux», 35 originali
//   04/2018-02/2021) che cambia ogni mese;
// - una campagna breve a tema, intera, che cambia ogni settimana, fra quelle completabili oggi
//   (Story Quest Campaign fino alla 525, «Complete quest», «Nearly 10M downloads», «Defeat 100
//   enemies», le due speciali sui Lux totali). Proud/Raid/Union Cross entreranno quando ci saranno.
// Il master contiene tutte le righe (id 4001...); il server manda in missions[] solo quelle della
// rotazione attiva (server/limited_rotation.json, letto da server.js), e il client fa la scheda
// Limited solo con gli id ricevuti.
//
// Premi: Jewel (2), materiali per nome (5), medaglie per nome (3), parti dello Spirit per nome
// (33, itemId = petPartsId; icona/nome dal client caso 0x21). Le 4 parti
// senza grafica (jp_pet_parts.py) prendono un sostituto dello stesso slot (SUBST). Gli altri premi
// passano da REWARDS (tipo e id fissati a mano).
//   node server/make-limited-missions.js     (riscrive le righe 4xxx, alzare la revisione)
'use strict';
const fs = require('fs');
const path = require('path');
const { petPartsRows } = require('./make-pet-parts');
const { isBoosted } = require('./medal-boost');

const D = __dirname;
const SUBST = {
  'Starlight Bow': 'Starlight Headpiece',
  'KH III Sora Ornament A': 'KH III Sora Ornament B',
  'Balloon Aliens': 'Balloon Pegasus',
  'Balloon Baymax & Mochi': 'Colorful Balloon',
  'Orange Tortoirstar Body': 'Orange Tortoistar Body', // refuso della khuxwiki
};
// premi che non sono ne' materiali ne' medaglie ne' parti: [rewardType, itemId]
// (tipi da reference/missions/limited_rewards_map.md: 40/41 biglietti dei banner a tempo, 7 titolo)
const REWARDS = {
  Jewel: [2, 0],
  'Platinum Ticket': [40, 0],
  'Draw Ticket': [41, 0],
  'Holiday Draw Ticket': [41, 0],
  'Moogle Point': [41, 0],
  'Spooky Cookie': [41, 0],
  Title: [7, 12601], // «"" Title» della khuxwiki = «With Gratitude» (khuxwiki Title Banner, nameplate 1349)
};
const LIMITED = 4;
const FIRST_ID = 4001;

function readTsv(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('group\t')).map((l) => l.split('\t'));
}

function resolver() {
  const byName = (rows, key) => new Map(rows.map((r) => [r.name, r[key]]));
  const master = (n) => JSON.parse(fs.readFileSync(path.join(D, 'master_data', n + '.json'), 'utf8'));
  const materials = byName(master('material'), 'materialId');
  const medals = new Map();
  // le boosted (medal-boost.js) hanno il nome della normale: mai bersaglio di una ricompensa
  for (const m of master('medal')) if (!isBoosted(m) && (!medals.has(m.name) || m.rare > medals.get(m.name).rare)) medals.set(m.name, m);
  const parts = byName(petPartsRows(), 'petPartsId');
  return (text) => {
    const m = /^(.*?)\s*x\s*([\d,]+)$/.exec(text.trim());
    let name = (m ? m[1] : text).trim();
    const num = m ? Number(m[2].replace(/,/g, '')) : 1;
    name = SUBST[name] || name;
    if (REWARDS[name]) return { rewardType: REWARDS[name][0], itemId: REWARDS[name][1], itemNum: num };
    if (materials.has(name)) return { rewardType: 5, itemId: materials.get(name), itemNum: num };
    if (parts.has(name)) return { rewardType: 33, itemId: parts.get(name), itemNum: 1 };
    const medal = medals.get(name.replace(/^\d★\s*/, ''));
    if (medal) return { rewardType: 3, itemId: medal.medalId, itemNum: num };
    return null;
  };
}

function build() {
  const resolve = resolver();
  const rows = [];
  // weeklyMedalFrom[i]: data originale (ISO) della campagna settimanale i se regala una medaglia, altrimenti null
  // (19-10, decisione dell'utente: W04 SN++ - FF7R Aerith 7★ solo dalla tranche della storia di aprile 2020)
  const rotation = { monthly: [], weekly: [], weeklyMedalFrom: [] };
  const groups = new Map();
  const missing = new Set();
  readTsv(path.join(D, 'limited_missions.tsv')).forEach(([group, period, missionName, cond, target, reward], i) => {
    const conditionId = Number(cond);
    const r = resolve(reward);
    if (!r) missing.add(reward);
    const id = FIRST_ID + i;
    if (!groups.has(group)) {
      groups.set(group, []);
      (group.startsWith('M') ? rotation.monthly : rotation.weekly).push(groups.get(group));
      if (!group.startsWith('M')) rotation.weeklyMedalFrom.push(null);
    }
    if (!group.startsWith('M') && r && r.rewardType === 3) {
      const [mm, dd, yy] = period.split(' - ')[0].split('/');
      rotation.weeklyMedalFrom[rotation.weekly.length - 1] = `20${yy}-${mm}-${dd}`;
    }
    groups.get(group).push(id);
    // condizione 30 (storia fino alla quest N): targetId = N, targetNum 1 (MISSION_DERIVED)
    const story = conditionId === 30;
    rows.push({
      id, missionType: LIMITED, sortId: groups.get(group).length, conditionId, page: story || conditionId === 1 ? 10 : 0,
      missionName, validTarget: 1, targetType: [0], targetId: [story ? Number(target) : 0],
      targetNum: [story ? 1 : Number(target)], validStages: 0, targetStageType: [0, 0],
      targetStageStartId: [0, 0], targetStageEndId: [0, 0],
      rewardType: r ? r.rewardType : 0, itemId: r ? r.itemId : 0, skillType: 0, skillId: 0, skillLv: 0,
      burstUpperNumber: 0, itemNum: r ? r.itemNum : 0,
      startDate: '2015-01-01 08:00:00', endDate: '2099-12-31 23:59:59', rewardEndTime: '2099-12-31 23:59:59',
    });
  });
  return { rows, rotation, missing: [...missing] };
}

if (require.main === module) {
  const { rows, rotation, missing } = build();
  for (const file of [path.join(D, 'tables', 'mission.json'), path.join(D, 'master_data', 'mission.json')]) {
    const keep = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r.missionType !== LIMITED);
    fs.writeFileSync(file, JSON.stringify([...keep, ...rows].sort((a, b) => a.id - b.id), null, 1) + '\n');
  }
  fs.writeFileSync(path.join(D, 'limited_rotation.json'), JSON.stringify(rotation) + '\n');
  console.log(`Limited: ${rows.length} righe, ${rotation.monthly.length} campagne mensili, ${rotation.weekly.length} settimanali`);
  if (missing.length) console.log(`premi senza tipo (rewardType 0, da mappare in REWARDS): ${missing.join(' | ')}`);
}

module.exports = { build };
