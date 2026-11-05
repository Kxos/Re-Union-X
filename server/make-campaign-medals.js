#!/usr/bin/env node
// Campaign Boost Medals missing from the medal table (2 Nov 2026, Raid Boards: user decision «add them, do not skip»).
//
// 302016 Sora & Moogle B, 6★: JP 5th anniversary Medal, reward of the «JP 5th Anniv. Entry Medal Board» Raid Board
// (Sept 2020, 10 cells) and bonus of the SN++ Illustrated KH III Falling Price Deals (B0718-B0724). Roboloid
// (external/roboloid/medal_db.json, id 2016, album 1879): rarity 6, no attribute, ability text «JP 5th anniversary
// Medal! Increases strength and defense by 100.». Id = 300000 + Roboloid id, as the other added rows (Magic Broom
// 300948, medal-guilt.js); medal_gen/medal_map.json already maps 302016 -> Roboloid 2016 and the served medal_gen
// pack already has img/medal/Medal_L_302016.png and Medal_S_302016.png (the Roboloid art).
// Reconstructed row (no original row): a copy of Chip 6★ (90056, type 4 Boost, cost 999) with enhanceAttack and
// enhanceDefense 100 (the ability text: medal-guilt.js applyEnhance adds them up to addMaxAttack/addMaxDefense),
// sortId = album number 1879, advantage = the ability text, flavor empty (no source), sell 800 and the other fields
// of the template (not sourced). attribute 4 and darklight 3 are the template's and match Roboloid's «no attribute»
// (Fantasia Mickey A, also «None» there, has 4 too). Cut-in/art/display ids stay the template's (as Fantasia Mickey B;
// a Boost Medal never fights): the bench should check the Medal detail and the Album entry for Chip's picture.
// Idempotent; make-game-tables.js applies it before support-medal-cost.js. On its own (then raise the master revision):
//   node server/make-campaign-medals.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

const TEMPLATE_ID = 90056; // Chip 6★, type 4
const SORA_MOOGLE_B = 302016;

function campaignRows(medals) {
  const tpl = medals.find((m) => m.medalId === TEMPLATE_ID);
  if (!tpl) throw new Error(`make-campaign-medals: template row ${TEMPLATE_ID} (Chip 6★) missing`);
  return [{
    ...tpl, medalId: SORA_MOOGLE_B, imageId: SORA_MOOGLE_B, thumbId: SORA_MOOGLE_B, sortId: 1879, listSortId: 1879,
    name: 'Sora & Moogle B', flavor: '',
    advantage: 'JP 5th anniversary Medal! Increases\nstrength and defense by 100.',
    rare: 6, type: 4, enhanceAttack: 100, enhanceDefense: 100, enhanceCost: 0, enhanceGuilt: 0,
    validEvolve: 0, evolveId: 0, validEvolveNeed: 0, evolveNeedId: [0, 0, 0, 0, 0],
  }];
}

// -> rows added (0 when already there)
function addCampaignMedals(medals) {
  const have = new Set(medals.map((m) => m.medalId));
  const add = campaignRows(medals).filter((r) => !have.has(r.medalId));
  medals.push(...add);
  return add.length;
}

function patch(masterDir) {
  const file = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = addCampaignMedals(medals);
  if (n) fs.writeFileSync(file, JSON.stringify(medals));
  console.log(`campaign medals: +${n} (${SORA_MOOGLE_B} Sora & Moogle B 6★)`);
  return n;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { campaignRows, addCampaignMedals, patch, SORA_MOOGLE_B };
