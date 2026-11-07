// Medals that event rewards name but our master lacks, restored as a clone of a sibling row (Events Part 2, Task 5a,
// 7 Nov 2026). Used by make-game-tables.js after the real medal rows.
//
// SP Chip & Dale 6★ (medalId 90346): the reward of gem quests and of a login bonus; no row of our master, no file in the
// dumps (released 2020-04). Row = our 90056 «Chip» 6★ (support medal, same family of fodder medals) with only the fields
// that differ: name, flavor and effect text (khuxwiki / Roboloid album 1702, «Increases strength and defense by 1,000»,
// 6★, attribute none), album number 1702, +1,000 STR and DEF when used as material. cost/minCost stay 999 as on the
// siblings (harmless at maxLv 1). Art: Medal_L/Medal_S_90346 from the Roboloid render (fetch_medal_images.py, medal_map
// 90346 -> 1796); no cut-in (support medal). The row enters only when the art is in the medal package (master and
// package go together: a medal row without its image would show an empty card).
'use strict';

const fs = require('fs');
const path = require('path');

const RESTORED = [
  {
    medalId: 90346, sibling: 90056,
    fields: {
      sortId: 1702, listSortId: 1702, name: 'SP Chip & Dale',
      flavor: "Private Pluto (1943)\n\nOne of Disney Castle's engineers.",
      advantage: 'Increases strength and defense\nby 1,000.',
      rare: 6, enhanceAttack: 1000, enhanceDefense: 1000, sell: 800,
    },
  },
];

const hasArt = (filesDir, id) => ['L', 'S'].every((k) => fs.existsSync(path.join(filesDir, 'img', 'medal', `Medal_${k}_${id}.png`)));

// -> {rows: [new medal rows], skipped: [medalIds without art]}; filesDir = medal_gen\files
function restoredMedalRows(medals, filesDir) {
  const byId = new Map(medals.map((m) => [m.medalId, m]));
  const out = { rows: [], skipped: [] };
  for (const r of RESTORED) {
    if (byId.has(r.medalId)) continue;
    const sib = byId.get(r.sibling);
    if (!sib) throw new Error(`medal-restored: sibling ${r.sibling} of ${r.medalId} missing`);
    if (!filesDir || !hasArt(filesDir, r.medalId)) { out.skipped.push(r.medalId); continue; }
    const id = r.medalId;
    out.rows.push(Object.assign(JSON.parse(JSON.stringify(sib)), r.fields,
      { medalId: id, imageId: id, thumbId: id, cutinId: id, artId: id, displayId: id, imageCategory: 0 }));
  }
  return out;
}

module.exports = { RESTORED, restoredMedalRows };
