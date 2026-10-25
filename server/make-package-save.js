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
  return max;
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

module.exports = { merge };
