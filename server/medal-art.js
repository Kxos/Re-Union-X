#!/usr/bin/env node
// Full artwork «Inspect» of the Medal detail (I-147, I-237; docs/notes/medaglie.md#full-artwork).
//
// The WW 4.3.1 client shows the `Button_Art` of the Medal detail only for rows with imageCategory 2 and validSource != 0;
// the tap plays the armature cocostudio/publish/MedalArtAnim.ExportJson with img/art/Art_<artId>.png and checks neither
// file, so a flagged row without its picture crashes: the 55 JP 4.3.1 pictures are staged by recon/tools/originals.tsv
// (section «Medal full artwork») and the armature by import_jp_coco.py (JP_ARM). This patch only sets the flags.
//
// User decision 05-11: every star of the 55 families and their boosted copies (rows whose groupId is a family row).
// The family rows are the ones of the notes' table (matched by Medal icon to the JP art ids). Left OUT: the SN++ reissues
// of older families (REISSUES): their own Medal picture differs and their art is only a guess (notes, «not proven»).
// Which star variants carried the button in the original is not proven either.
//
// Applied by make-game-tables.js after every generator that adds medal rows. On its own (then raise the master revision):
//   node server/medal-art.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

// [JP art id, Medal that carries the art, family rows (6★/7★ and SN/SN+/Supernova variants)]
const ART = [
  [21266, 'Key Art #2', [300778, 300779]],
  [21406, 'Key Art #10', [311063, 301063]],
  [21516, 'The World Ends with You Art', [301170, 301171]],
  [21536, 'Key Art #12', [311213, 301213]],
  [21636, 'Key Art #15', [301441, 311443]],
  [21726, 'Toon Roxas & Pals', [301571, 311573]],
  [22346, 'Key Art #5', [300936, 300937]],
  [22446, 'Key Art #9', [301000, 301001]],
  [22606, 'Key Art #14', [301380, 301381]],
  [22716, 'The World Ends with You Art 3', [301606, 301607]],
  [23386, 'Orchestra Sora', [311003, 301003]],
  [23416, 'Key Art #11', [311093, 301093]],
  [23546, 'Key Art #13', [311243, 301243]],
  [23616, 'Toon Sora & Goofy', [301509, 301510]],
  [23656, 'Key Art #18', [301591, 311593]],
  [41146, 'Key Art #6', [300971, 310973]],
  [41226, 'Key Art "Sky"', [311013, 301013]],
  [41396, 'The World Ends with You Art 2', [301428, 301429]],
  [42096, 'Key Art #3', [300860, 300861, 312045]],
  [42166, 'Key Art "Bonds"', [311015, 301015]],
  [43086, 'Key Art #1', [300840, 300841]],
  [43106, 'Key Art #4', [300886, 300887]],
  [43146, 'Key Art #7', [300969, 300970]],
  [43186, 'Key Art #8', [310995, 300995, 302098]],
  [43206, 'Key Art "Beginning"', [301016, 301017]],
  [43416, 'Prime - Key Art #17', [301513, 311515]],
  [51036, 'Riku Art [EX]', [311165, 301165]],
  [51126, 'Stained Glass #3 [EX+]', [301473, 311475, 301475, 301476]],
  [51136, 'Stained Glass #4 [EX+]', [301477, 301478, 301479, 301480]],
  [51167, 'Stained Glass #7 [EX+]', [301603]],
  [52016, 'Axel Art [EX]', [311025, 301025, 302031]],
  [52096, 'Key Art #16 [EX+]', [301448, 301449]],
  [52106, 'Stained Glass #5 [EX+]', [301481, 311483, 301483, 311485]],
  [52116, 'Stained Glass #6 [EX+]', [301485, 301486, 301487, 301488]],
  [52167, 'Stained Glass #9 [EX+]', [301605]],
  [52197, 'SN+ - Terra, Ven, Aqua', [301673, 311675, 311945, 302011]],
  [53016, 'Sora Art [EX]', [301060, 301061]],
  [53026, 'Roxas Art [EX]', [301115, 301116, 312033]],
  [53136, 'Stained Glass #1 [EX+]', [301465, 301466, 301467, 301468]],
  [53146, 'Stained Glass #2 [EX+]', [301469, 301470, 301471, 311473]],
  [53187, 'Stained Glass #8 [EX+]', [311605]],
  [53197, 'Supernova+ - Key Art #19', [311625, 301625]],
  [53247, 'Supernova+ - Key Art #20', [301797, 301798, 302088]],
  [351417, 'SN++ - Key Art #22', [301939]],
  [351617, 'SN++ - Stained Glass #13', [302051]],
  [352327, 'Supernova+ - Key Art #21', [301889]],
  [352467, 'SN++ - Key Art #23', [301979]],
  [352557, 'SN++ - Stained Glass #11', [302046]],
  [352567, 'SN++ - Stained Glass #12', [302049]],
  [352577, 'SN++ - MoM Kairi', [302065]],
  [353497, 'SN++ - Key Art #24', [301989]],
  [353547, 'SN++ - Strelitzia', [302036]],
  [353567, 'SN++ - Stained Glass #10', [302045]],
  [353587, 'SN++ - Stained Glass #14', [302069]],
  [353907, 'SN++ - Key Art #25', [302007]],
];
// SN++ reissues of older families (own Medal picture, art only hypothesised): no flag, nor on their boosted copies
const REISSUES = new Set([312045, 302098, 302031, 312033, 311945, 302011]);
const IMAGE_CATEGORY_ART = 2;

// medalId -> JP art id for the family rows (reissues excluded)
function familyArt() {
  const m = new Map();
  for (const [art, , rows] of ART) for (const id of rows) if (!REISSUES.has(id)) m.set(id, art);
  return m;
}

// Sets imageCategory 2 and artId on the family rows and their boosted copies (groupId = family row).
// -> { rows, boosted, missing: [family ids absent], noSource: [ids with validSource 0] }
function applyMedalArt(medals) {
  const fam = familyArt();
  const out = { rows: 0, boosted: 0, missing: [], noSource: [] };
  const seen = new Set();
  for (const m of medals) {
    const own = fam.get(m.medalId);
    const art = own || (m.groupId && m.groupId !== m.medalId && !REISSUES.has(m.groupId) ? fam.get(m.groupId) : undefined);
    if (!art) continue;
    m.imageCategory = IMAGE_CATEGORY_ART;
    m.artId = art;
    if (own) { out.rows++; seen.add(m.medalId); } else out.boosted++;
    if (!m.validSource) out.noSource.push(m.medalId);
  }
  out.missing = [...fam.keys()].filter((id) => !seen.has(id));
  return out;
}

function patch(masterDir) {
  const file = path.join(masterDir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = applyMedalArt(medals);
  fs.writeFileSync(file, JSON.stringify(medals));
  console.log(`medal art (Inspect, I-237): imageCategory 2 on ${r.rows} family rows + ${r.boosted} boosted copies, ` +
    `${ART.length} art ids, ${REISSUES.size} SN++ reissues left out` +
    (r.missing.length ? `; family rows MISSING from the master: ${r.missing.join(' ')}` : '') +
    (r.noSource.length ? `; validSource 0 (no button): ${r.noSource.join(' ')}` : ''));
  return r;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { ART, REISSUES, IMAGE_CATEGORY_ART, familyArt, applyMedalArt, patch };
