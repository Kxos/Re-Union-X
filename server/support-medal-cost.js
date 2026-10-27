#!/usr/bin/env node
// Cost 999 on the non-battle Medals (I-211, user decision 26-10, docs/notes/medaglie.md#support-cost).
//
// The support Medals cannot go on a Keyblade and be played: EXP (type 2: Huey/Dewey/Louie, Huey & Dewey & Louie,
// Scrooge), sell-only (3: Moogle), Boost (4: Chip/Dale/Magic Mirror), Cost (5: Cid/Cid 5/Cid 10), Evolve (6: Cheshire
// Cat, Merlin, Fairy Godmother, Yen Sid, Fantasia Mickey A, Flora/Fauna/Merryweather, Magic Broom, Dual Meow Wow,
// Blue Fairy) and Fantasia Mickey B (8). The original rows (thethiny, old format) have cost 0 / minCost 0; the khuxwiki
// infobox of the support Medals has no cost. The user wants them at 999 like the Trait Medals (type 9,
// make-trait-medals.js): cost and minCost 999, so Cid has nothing to lower (upperCost = cost - minCost = 0).
// Battle Medals (type 1, also the system rows 1-7 «空き»/Burst/Blast) and the Trait Medals are not touched.
//
// make-game-tables.js applies it after the other medal patches; on its own it fixes an existing master in place
// (idempotent; then raise the master revision):
//   node server/support-medal-cost.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

const SUPPORT_TYPES = new Set([2, 3, 4, 5, 6, 8]);
const SUPPORT_COST = 999;

const isSupportMedal = (m) => SUPPORT_TYPES.has(m.type);

// -> rows changed
function applySupportCost(medals) {
  let n = 0;
  for (const m of medals) {
    if (!isSupportMedal(m) || (m.cost === SUPPORT_COST && m.minCost === SUPPORT_COST)) continue;
    m.cost = SUPPORT_COST;
    m.minCost = SUPPORT_COST;
    n++;
  }
  return n;
}

function patch(masterDir) {
  const file = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = applySupportCost(medals);
  if (n) fs.writeFileSync(file, JSON.stringify(medals));
  console.log(`support-medal-cost: cost ${SUPPORT_COST} on ${n} rows`);
  return n;
}

module.exports = { SUPPORT_TYPES, SUPPORT_COST, isSupportMedal, applySupportCost, patch };

if (require.main === module) patch(path.resolve(process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data')));
