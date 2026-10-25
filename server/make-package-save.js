// Start save of the play package: the most complete bench state, so that a tester can try every current feature.
// The max-power save (make-maxpower-save.js: every medal of the bench save plus the Tier 8-10 medals at maximum,
// story to 979) receives the Proud Mode progress of the Proud save (make-proud.js bench save, Proud 1-979 cleared):
// stage scores, missions and the keyblades it lacks (the Proud rewards), with new userKeybladeIds.
// The sources are never written.
//
//   node server/make-package-save.js [maxpower.json] [proudall.json] [destination]
//   (default server/save/maxpower.json + server/save/proudall.json -> server/save/package.json)
'use strict';
const fs = require('fs');
const path = require('path');

function merge(max, proud) {
  max.stageScores = { ...max.stageScores, ...proud.stageScores };
  const cm = { ...(max.clearMissions || {}) }; // stageId -> cleared objective numbers
  for (const [id, list] of Object.entries(proud.clearMissions || {})) cm[id] = [...new Set([...(cm[id] || []), ...list])].sort((a, b) => a - b);
  max.clearMissions = cm;
  max.missions = proud.missions;
  const owned = new Set(max.keyblades.map((k) => k.keybladeId));
  let next = Math.max(0, ...max.keyblades.map((k) => k.userKeybladeId)) + 1;
  for (const k of proud.keyblades) {
    if (!owned.has(k.keybladeId)) max.keyblades.push({ ...k, userKeybladeId: next++ });
  }
  pruneDuplicates(max, LIVE_TARGET);
  max.medalMaxExtra = Math.max(max.medalMaxExtra || 0, MEDAL_LIMIT); // storage at the game's maximum (3000 slots)
  max.freeStone = PACKAGE_JEWELS; // jewels for the tester: Shop draws, Moogle Shop traits (author, 25-10)
  // the bench party («Kxos's Party», the author's name) stays on the bench: the player creates their own from the Party
// menu (the party chat works since I-210, 25-10); the first-party jewel bonus stays available
delete max.party;
  delete max.partyFirstRewardDone;
  return max;
}

// The game refuses every quest when the medals exceed the storage (max 3000 slots): the max-power save has
// more. Spare copies of medals owned more than once are sold (medalState.removed, as Sell does) until LIVE_TARGET
// are left: never the last copy of a medal, never a medal in a deck, subslot, Spirit slot or support, locked
// copies only if needed, lowest level first.
const MEDAL_LIMIT = 3000, LIVE_TARGET = 2900, PACKAGE_JEWELS = 100000;
function pruneDuplicates(p, target) {
  const state = (p.medalState = p.medalState || {});
  const refs = new Set([...(p.deck || []), ...Object.values(p.keybladeDecks || {}).flat(),
    ...Object.values(p.keybladeSubslots || {}).flatMap((s) => Object.values(s)), ...(p.pet?.subslot || []),
    ...Object.values(p.petBaseSlots || {}), p.supportUserMedalId].filter((id) => id > 0));
  const live = p.medals.filter((m) => !state[m.userMedalId]?.removed).map((m) => ({
    id: m.userMedalId, kind: state[m.userMedalId]?.medalId || m.medalId,
    level: state[m.userMedalId]?.level || m.level || 1, locked: Boolean(p.medalLocks?.[m.userMedalId]),
  }));
  const copies = new Map();
  for (const m of live) copies.set(m.kind, (copies.get(m.kind) || 0) + 1);
  let count = live.length;
  for (const allowLocked of [false, true]) {
    const spare = live.filter((m) => !refs.has(m.id) && (allowLocked || !m.locked))
      .sort((a, b) => a.level - b.level || a.id - b.id);
    for (const m of spare) {
      if (count <= target) return count;
      if (copies.get(m.kind) < 2 || state[m.id]?.removed) continue;
      state[m.id] = { ...state[m.id], removed: true };
      copies.set(m.kind, copies.get(m.kind) - 1);
      count--;
    }
  }
  return count;
}

if (require.main === module) {
  const SAVES = path.join(__dirname, 'save');
  const MAX = process.argv[2] || path.join(SAVES, 'maxpower.json');
  const PROUD = process.argv[3] || path.join(SAVES, 'proudall.json');
  const DST = process.argv[4] || path.join(SAVES, 'package.json');
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const p = merge(read(MAX), read(PROUD));
  fs.writeFileSync(DST, JSON.stringify(p, null, 1));
  console.log(`${DST}: ${p.medals.length} medals, ${Object.keys(p.stageScores).length} stage scores, ${p.keyblades.length} keyblades`);
}

module.exports = { merge, pruneDuplicates };
