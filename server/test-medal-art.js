// I-237 full artwork «Inspect»: medal-art.js flags (imageCategory 2 + JP artId) and the staged pictures. The client loads
// img/art/Art_<artId>.png on tap without checking it, so every flagged artId must have its line in originals.tsv.
//   node server/test-medal-art.js [--files <generated pack files, e.g. D:\Progetto_Restauro_KH_UX\stage_gen\files>]
// With --files (after a resource build) it also checks the pictures and the MedalArtAnim armature are in the pack.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ART, REISSUES, NO_ART, applyMedalArt, familyArt } = require('./medal-art');

const ROOT = path.join(__dirname, '..');

// 55 art ids, one family each, no row in two families
assert.strictEqual(ART.length, 55, '55 Medals had the art');
assert.strictEqual(new Set(ART.map((a) => a[0])).size, 55, 'art ids unique');
const allRows = ART.flatMap((a) => a[2]);
assert.strictEqual(new Set(allRows).size, allRows.length, 'a row belongs to one family only');
for (const id of REISSUES) assert.ok(allRows.includes(id), `reissue ${id} is a listed family row`);
assert.strictEqual(familyArt().size, allRows.length, 'reissues with the family picture flagged too (06-11)');
// user rule 06-11: only rows whose own picture is part of the art; SN++ Terra, Ven, Aqua has its own picture
assert.deepStrictEqual([...NO_ART.keys()].sort(), [302011, 311945], 'rows without art');
for (const id of NO_ART.keys()) assert.ok(!allRows.includes(id) && !familyArt().has(id), `${id} not flagged`);
assert.deepStrictEqual([...REISSUES].sort(), [302031, 302098, 312033, 312045], 'reissues with the family picture');

// unit: family row, boosted copy, reissue + its copy, unrelated row
const rows = [
  { medalId: 300778, groupId: 0, imageCategory: 0, artId: 300778, validSource: 1 },
  { medalId: 2300778, groupId: 300778, imageCategory: 0, artId: 300778, validSource: 1 },
  { medalId: 312045, groupId: 0, imageCategory: 0, artId: 302044, validSource: 1 },
  { medalId: 2312045, groupId: 312045, imageCategory: 0, artId: 302044, validSource: 1 },
  { medalId: 11012, groupId: 0, imageCategory: 0, artId: 11012, validSource: 1 },
  { medalId: 302011, groupId: 0, imageCategory: 2, artId: 52197, imageId: 302011, validSource: 1 },
  { medalId: 2302011, groupId: 302011, imageCategory: 2, artId: 52197, imageId: 302011, validSource: 1 },
  { medalId: 311945, groupId: 0, imageCategory: 0, artId: 301944, imageId: 301944, validSource: 1 },
];
const r = applyMedalArt(rows);
assert.deepStrictEqual(rows.map((m) => [m.imageCategory, m.artId]),
  [[2, 21266], [2, 21266], [2, 42096], [2, 42096], [0, 11012], [0, 302011], [0, 302011], [0, 301944]]);
assert.strictEqual(r.rows, 2);
assert.strictEqual(r.boosted, 2);
assert.strictEqual(r.cleared, 2, 'NO_ART rows flagged by an older patch are unflagged');
assert.ok(r.missing.includes(300779), 'family rows absent from the master are reported');
applyMedalArt(rows);
assert.deepStrictEqual(rows.map((m) => m.imageCategory), [2, 2, 2, 2, 0, 0, 0, 0], 'idempotent');

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
const stale = [];   // NO_ART rows still flagged: master generated before 06-11, regenerate it
const file = path.join(process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
if (fs.existsSync(file)) {
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const m of medals.filter((x) => x.imageCategory === 2)) {
    flagged++;
    assert.ok(staged.has(m.artId), `medal ${m.medalId} flagged with artId ${m.artId}, not staged`);
    assert.ok(m.validSource, `medal ${m.medalId} flagged but validSource 0`);
    if (NO_ART.has(m.groupId && m.groupId !== m.medalId ? m.groupId : m.medalId)) stale.push(m.medalId);
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
console.log(`OK: 55 art ids staged, ${familyArt().size} family rows (${REISSUES.size} SN++ reissues with the family picture), ` +
  `${NO_ART.size} rows without art; ` +
  `master: ${flagged} rows flagged${flagged ? '' : ' (master not regenerated yet)'}` +
  `${stale.length ? `; STALE master, NO_ART rows still flagged (regenerate): ${stale.join(' ')}` : ''}${packed}`);
