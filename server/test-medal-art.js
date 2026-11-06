// I-237 full artwork «Inspect»: medal-art.js flags (imageCategory 2 + JP artId) and the staged pictures. The client loads
// img/art/Art_<artId>.png on tap without checking it, so every flagged artId must have its line in originals.tsv.
//   node server/test-medal-art.js [--files <generated pack files, e.g. D:\Progetto_Restauro_KH_UX\stage_gen\files>]
// With --files (after a resource build) it also checks the pictures and the MedalArtAnim armature are in the pack.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ART, REISSUES, applyMedalArt, familyArt } = require('./medal-art');

const ROOT = path.join(__dirname, '..');

// 55 art ids, one family each, no row in two families
assert.strictEqual(ART.length, 55, '55 Medals had the art');
assert.strictEqual(new Set(ART.map((a) => a[0])).size, 55, 'art ids unique');
const allRows = ART.flatMap((a) => a[2]);
assert.strictEqual(new Set(allRows).size, allRows.length, 'a row belongs to one family only');
for (const id of REISSUES) assert.ok(allRows.includes(id), `reissue ${id} is a listed family row`);
assert.strictEqual(familyArt().size, allRows.length - REISSUES.size);

// unit: family row, boosted copy, reissue + its copy, unrelated row
const rows = [
  { medalId: 300778, groupId: 0, imageCategory: 0, artId: 300778, validSource: 1 },
  { medalId: 2300778, groupId: 300778, imageCategory: 0, artId: 300778, validSource: 1 },
  { medalId: 312045, groupId: 0, imageCategory: 0, artId: 302044, validSource: 1 },
  { medalId: 2312045, groupId: 312045, imageCategory: 0, artId: 302044, validSource: 1 },
  { medalId: 11012, groupId: 0, imageCategory: 0, artId: 11012, validSource: 1 },
];
const r = applyMedalArt(rows);
assert.deepStrictEqual(rows.map((m) => [m.imageCategory, m.artId]),
  [[2, 21266], [2, 21266], [0, 302044], [0, 302044], [0, 11012]]);
assert.strictEqual(r.rows, 1);
assert.strictEqual(r.boosted, 1);
assert.ok(r.missing.includes(300779), 'family rows absent from the master are reported');
applyMedalArt(rows);
assert.deepStrictEqual(rows.map((m) => m.imageCategory), [2, 2, 0, 0, 0], 'idempotent');

// every art id staged by a single-destination line of originals.tsv (section 51), and nothing else under img/art/
const tsv = fs.readFileSync(path.join(ROOT, 'recon', 'tools', 'originals.tsv'), 'utf8').split(/\r?\n/)
  .map((l) => l.split('#', 1)[0].trim()).filter(Boolean).map((l) => l.split('\t'));
const staged = new Set(tsv.filter((c) => /^img\/art\//.test(c[0])).map((c) => {
  const m = /^img\/art\/Art_(\d+)\.png$/.exec(c[0]);
  assert.ok(m && c[1] === 'jp' && !c[2], `originals.tsv: unexpected img/art line ${c.join(' | ')}`);
  return Number(m[1]);
}));
assert.deepStrictEqual([...staged].sort((a, b) => a - b), ART.map((a) => a[0]).sort((a, b) => a - b),
  'originals.tsv stages exactly the 55 Art_<artId>.png');

// the armature: JP_ARM of import_jp_coco.py
const coco = fs.readFileSync(path.join(ROOT, 'recon', 'tools', 'import_jp_coco.py'), 'utf8');
assert.ok(/'MedalArtAnim': \('ActMapTreasureBoxAnim0', 'MedalArtAnim0'\)/.test(coco), 'MedalArtAnim in JP_ARM');

// the master in use (when generated): every imageCategory 2 row has a staged artId
let flagged = 0;
const file = path.join(process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
if (fs.existsSync(file)) {
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const m of medals.filter((x) => x.imageCategory === 2)) {
    flagged++;
    assert.ok(staged.has(m.artId), `medal ${m.medalId} flagged with artId ${m.artId}, not staged`);
    assert.ok(m.validSource, `medal ${m.medalId} flagged but validSource 0`);
    assert.ok(!REISSUES.has(m.medalId) && !REISSUES.has(m.groupId), `reissue ${m.medalId} flagged`);
  }
  assert.ok(!medals.some((x) => x.imageCategory && x.imageCategory !== 2), 'no other imageCategory');
}

// after a resource build: the pictures and the armature in the generated pack
const fi = process.argv.indexOf('--files');
let packed = '';
if (fi > 0) {
  const dir = process.argv[fi + 1];
  const miss = [...staged].filter((id) => !fs.existsSync(path.join(dir, 'img', 'art', `Art_${id}.png`)));
  assert.deepStrictEqual(miss, [], 'Art pictures missing from the generated pack');
  assert.ok(fs.existsSync(path.join(dir, 'cocostudio', 'publish', 'MedalArtAnim.ExportJson')), 'MedalArtAnim.ExportJson in the pack');
  packed = `; pack ${dir}: 55 pictures + MedalArtAnim present`;
}
console.log(`OK: 55 art ids staged, ${familyArt().size} family rows, ${REISSUES.size} reissues left out; ` +
  `master: ${flagged} rows flagged${flagged ? '' : ' (master not regenerated yet)'}${packed}`);
