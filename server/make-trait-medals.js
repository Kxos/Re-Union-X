#!/usr/bin/env node
// Trait Medal (I-084 parte B, docs/superpowers/specs/2026-10-19-trait-design.md): righe del master.
//
// Una riga per voce di server/trait_medals.json (make-trait-medal-list.js), medalId = 9.000.000 + N, come le
// descrive la khuxwiki («Trait Medal») e il notice 38128: 6★, STR/DEF 1, costo 999 (non va sul keyblade), attacco
// «Lesser Attack» (1 nemico, 1 gauge, x1,00), 15 Pet Point, stesso numero di Album (sortId) della medaglia, type 9
// (filtro «Trait Medals» della Medal List, escluso dagli Special Trait:).
// Il legame con la medaglia lo fa il master, come lo legge il client:
// - trait: shuffleSkillGroupId della Trait Medal = quello della linea (make-trait-groups.js);
//  - pallino, sblocco e rilancio della guilt: burstEnhanceCategory[0] delle righe della linea (normali, boosted,
// varianti) = medalId della Trait Medal (groupId del materiale, 0 -> medalId, in uno dei due
//    valori della base; stessa regola in medal-guilt.js isDotMaterial).
// Su altre medaglie resta solo l'EXP da materiale. Idempotente; chiamato da make-game-tables.js dopo
// make-trait-groups. Dopo: alzare la revisione del master.
//
//   node server/make-trait-medals.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const ID_BASE = 9000000;
const LESSER_ATTACK = 9000000; // burstId
const traitMedalId = (n) => ID_BASE + n;
const isTraitMedal = (row) => Boolean(row && row.type === 9);

function lesserAttack(model) {
  const flat = [10000, 10000, 10000, 10000, 10000];
  const out = { ...model, burstId: LESSER_ATTACK, name: 'Lesser Attack', description: 'Deals 1 hit to one enemy.',
    target: 1, gauge: 1, hitCount: 1, maxEnhanceCount: 5, displayPower: 10000, displayPowerPerEnforce: flat,
    displayMaxPower: 0, displayMaxPowerPerEnforce: [0, 0, 0, 0, 0], basePower: 10000, basePowerPerEnforce: flat,
    attributeChange: 0, addTurn: 0, addCount: 0,
    // danno semplice: il modello (10221, tipo 7 di thethiny) e' a danno variabile dopo variable-power.js (I-189)
    specialPowerType: 1 };
  // niente effetti: azzera buff, debuff, reset, cure e simili del modello
  for (const k of Object.keys(out)) {
    if (/^(buf|debuf|reset|copyBuf|heal|cure|recovery|addGuilt|reflection|addBase|match|unmatch|opr|sp[12])/.test(k)) {
      out[k] = Array.isArray(out[k]) ? out[k].map(() => 0) : 0;
    }
  }
  return out;
}

function traitMedalRow(e, med) {
  const id = traitMedalId(e.n);
  return {
    ...med, medalId: id, imageId: id, thumbId: id, cutinId: id, artId: id, displayId: 0,
    name: `Trait Medal #${e.n}`,
    flavor: `A Trait Medal for ${med.name}.\n\nFuse it into ${med.name} to give it\na new trait and one Special Attack dot.`,
    advantage: `Fuse into ${med.name}:\n+1 trait and +1 Special Attack dot.`,
    // Tier 1: la guilt si puo' sbloccare (khuxwiki) ma non vale come quella della medaglia (sub-slot, missioni)
    guiltValue: 1, addGuiltBurstLv: 0, addGuiltBurstLvMax: 0,
    autoEnhance: 0, validPack: 1, type: 9, rare: 6, skillSlot: 0, shuffleskillSlot: 0, spShuffleskillSlot: 0, addPetPt: 15,
    attack: 1, maxAttack: 1, addMaxAttack: 0, defense: 1, maxDefense: 1, addMaxDefense: 0, cost: 999, minCost: 999,
    validBurst: 1, burstId: LESSER_ATTACK, validSuperBurst: 0, superBurstId: 0, burstEnhanceCategory: [0, 0], groupId: 0,
    sellJewel: 0, sellTicket: 0, enhanceAttack: 0, enhanceDefense: 0, enhanceCost: 0, enhanceGuilt: 0,
    shuffleSkillGroupId: med.shuffleSkillGroupId, burstLvGroupId: 0, validEvolve: 0, evolveId: 0, evolveMoney: 0,
    validEvolveNeed: 0, evolveNeedId: [0, 0, 0, 0, 0], voice: 0, bgm: 0,
  };
}

function patch(masterDir, list = JSON.parse(fs.readFileSync(path.join(__dirname, 'trait_medals.json'), 'utf8'))) {
  const medalFile = path.join(masterDir, 'medal.json');
  const burstFile = path.join(masterDir, 'burst.json');
  const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8')).filter((r) => !isTraitMedal(r));
  const bursts = JSON.parse(fs.readFileSync(burstFile, 'utf8'));
  const byId = new Map(medals.map((r) => [r.medalId, r]));
  const model = bursts.find((b) => b.burstId === byId.get(10095)?.burstId) || bursts.find((b) => b.target === 1);
  const want = lesserAttack(model);
  // animazione da 1 colpo come nel testo (burst-anim-fix.js; il modello ha l'animazione della sua medaglia)
  const animFix = require('./burst-anim-fix');
  animFix.applyBurstAnim([want], animFix.readMapping());
  const bi = bursts.findIndex((b) => b.burstId === LESSER_ATTACK);
  const burstChanged = bi < 0 || JSON.stringify(bursts[bi]) !== JSON.stringify(want);
  if (bi < 0) bursts.push(want); else bursts[bi] = want;

  // linea -> Trait Medal; con due Trait Medal sulla stessa linea si usa il secondo valore
  const rows = [];
  const links = new Map(); // shuffleSkillGroupId -> [medalId Trait Medal]
  for (const e of list) {
    const med = byId.get(e.affected);
    if (!med || !med.shuffleSkillGroupId) continue;
    rows.push(traitMedalRow(e, med));
    const l = links.get(med.shuffleSkillGroupId) || links.set(med.shuffleSkillGroupId, []).get(med.shuffleSkillGroupId);
    if (l.length < 2) l.push(traitMedalId(e.n));
  }
  for (const r of medals) {
    const l = links.get(r.shuffleSkillGroupId);
    if (!l || !((r.shuffleskillSlot || 0) > 0)) continue;
    r.burstEnhanceCategory = [l[0] || 0, l[1] || 0];
  }
  const before = fs.readFileSync(medalFile, 'utf8');
  const after = JSON.stringify([...medals, ...rows]);
  if (after !== before) fs.writeFileSync(medalFile, after);
  if (burstChanged) fs.writeFileSync(burstFile, JSON.stringify(bursts));
  console.log(`trait medal: ${rows.length} righe, ${links.size} linee collegate${after !== before || burstChanged ? '' : ' (invariato)'}`);
  return rows.length;
}

module.exports = { ID_BASE, LESSER_ATTACK, traitMedalId, isTraitMedal, traitMedalRow, patch };

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));
