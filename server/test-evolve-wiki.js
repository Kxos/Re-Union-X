// Required medals of Evolve from the khuxwiki (I-205, evolve-wiki.js): parsing on synthetic pages and rows, then
// a check of the served master (server/master_data or KHUX_MASTER_DIR) when it is there.
//
//   node server/test-evolve-wiki.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ew = require('./evolve-wiki');

const FMB = ew.FANTASIA_MICKEY_B;
const row = (medalId, name, rare, extra = {}) => ({ medalId, name, rare, groupId: 0, validEvolve: 0, evolveId: 0,
  validEvolveNeed: 0, evolveNeedId: [0, 0, 0, 0, 0], ...extra });
const evo = (to, need = 0, ids = [0, 0, 0, 0, 0]) => ({ validEvolve: 1, evolveId: to, validEvolveNeed: need, evolveNeedId: ids });

const wiki = {
  'Illustrated King Mickey': "As of November 12, 2020, Illustrated King Mickey can be evolved into '''SN++ - Illus. BC King Mickey''' using one [[Fantasia Mickey B]] Medal.<ref>x</ref>",
  'Key Art 8': "As of February 10, 2021, Key Art #8 can be evolved into '''SN++ - Key Art #8'' using two [[Fantasia Mickey B]] Medals.",
  'SN++ - KH III Terra': 'As of September 3, 2020, SN++ - KH III Terra can be evolved using one [[Fantasia Mickey B]] Medal.',
  'Master Xehanort (EX+)': "As of January 28, 2021, Master Xehanort [EX] can be evolved into '''SN++ - Master Xehanort B''' using two [[Fantasia Mickey B]] Medals.",
  'Cloud & Leon': "As of November 19, 2020, Cloud & Leon can be evolved into '''<SB++> Cloud & Leon''' using one [[Fantasia Mickey B]] Medal.",
  'Hayner B': '{{Evo|base=Hayner B 5★|evo1=Hayner B 5★|evo2=Hayner B 5★|evo3=Hayner B 5★|evo4=Hayner B 5★|evo5=Hayner B 5★|result=Hayner B 6★}}\n'
    + '{{Evo|base=Hayner B 6★|evo1=Pence B 6★|evo2=Olette B 6★|evo3=Sea-Salt Ice Cream 3★|evo4=Sea-Salt Ice Cream 3★|evo5=Sea-Salt Ice Cream 3★|result=Hayner & Pence & Olette 6★}}',
  'Classic Goofy': '{{Evo|base=Classic Goofy ★|evo1=Classic Goofy ★|result=Classic Goofy 2★}}',
  'Queen of Hearts': '{{Evo|base=Queen of Hearts 3★|evo1=Playing Card 3★|evo2=Playing Card 3★|result=Queen of Hearts 4★}}',
  'Meow Wow': '{{Evo|base=Meow Wow 6★|evo1=KH 3D Sora 6★|evo2=KH 3D Riku 6★|result=Sora & Riku & Meow Wow 6★}}',
  'Fantasia Mickey B': '{{Evo|base=Fantasia Mickey A 5★|evo1=Magic Broom 5★|evo2=Magic Broom 5★|evo3=Magic Broom 5★|evo4=Magic Broom 5★|evo5=Magic Broom 5★|result=Fantasia Mickey B 6★}}',
};

// parsing: titles with «Illus.», the comma of the date, a target closed by '' only, no target
const rules = ew.fmbRules(wiki);
assert.deepEqual(rules.map((r) => [r.from, r.to, r.n]), [
  ['Illustrated King Mickey', 'SN++ - Illus. BC King Mickey', 1], ['Key Art #8', 'SN++ - Key Art #8', 2],
  ['SN++ - KH III Terra', null, 1], ['Master Xehanort [EX]', 'SN++ - Master Xehanort B', 2],
  ['Cloud & Leon', '<SB++> Cloud & Leon', 1]]);
assert.deepEqual(ew.evoTemplates({ a: wiki['Classic Goofy'] })[0].base, ['Classic Goofy', 1], '«★» alone = 1★');

const medals = [
  row(FMB, 'Fantasia Mickey B', 6, { validPack: 1 }),
  row(90085, 'Fantasia Mickey Ver. A', 5, evo(FMB, 5, [300948, 300948, 300948, 300948, 300948])),
  row(300948, 'Magic Broom', 5),
  row(300715, 'Illustrated King Mickey', 7, evo(302050)), row(302050, 'SN++ - Illus. BC King Mickey', 7),
  row(2300715, 'Illustrated King Mickey', 7, { ...evo(302050), groupId: 300715 }),
  row(300995, 'Key Art #8', 7, evo(302098)), row(302098, 'SN++ - Key Art #8', 7),
  // two rows with the same name: the sentence is about the one that evolves
  row(301941, 'SN++ - KH III Terra', 7, evo(302008)), row(302008, 'SN++ - KH III Terra', 7),
  row(301463, 'Master Xehanort [EX+]', 7, evo(302089)), row(302089, 'SN++ - Master Xehanort B', 7),
  row(301047, 'Hayner B', 5, evo(301048, 5, [90085, 90085, 90085, 90105, 90105])),
  row(301048, 'Hayner B', 6, evo(301052)), row(301046, 'Pence B', 6, evo(301052)), row(301050, 'Olette B', 6, evo(301052)),
  row(301051, 'Sea-Salt Ice Cream', 3), row(301052, 'Hayner & Pence & Olette', 6),
  row(300785, 'Classic Goofy', 1, evo(300786, 1, [90081, 0, 0, 0, 0])), row(300786, 'Classic Goofy', 2),
  row(21133, 'Queen of Hearts', 3, evo(21134, 1, [21123, 0, 0, 0, 0])), row(21134, 'Queen of Hearts', 4), row(21123, 'Playing Card', 3),
  row(23086, 'Meow Wow', 6), row(22086, 'KH 3D Sora', 6), row(21086, 'KH 3D Riku', 6), row(300826, 'Sora & Riku & Meow Wow', 6),
];
const byId = new Map(medals.map((r) => [r.medalId, r]));
const { changes, report } = ew.applyWikiEvolve(medals, wiki);
const need = (id) => [byId.get(id).validEvolveNeed, byId.get(id).evolveNeedId];
assert.deepEqual(need(300715), [1, [FMB, 0, 0, 0, 0]], 'one Fantasia Mickey B');
assert.deepEqual(need(2300715), [1, [FMB, 0, 0, 0, 0]], 'the boosted copy follows its row');
assert.deepEqual(need(300995), [2, [FMB, FMB, 0, 0, 0]], "target closed by '' only");
assert.deepEqual(need(301941), [1, [FMB, 0, 0, 0, 0]], 'the evolvable SN++ - KH III Terra');
assert.deepEqual(need(302008), [0, [0, 0, 0, 0, 0]], 'not the evolved one');
assert.deepEqual(need(301463), [2, [FMB, FMB, 0, 0, 0]], 'found by the target name ([EX] vs [EX+])');
assert.deepEqual(need(301047), [5, [301047, 301047, 301047, 301047, 301047]], 'five copies of itself');
assert.deepEqual(need(301048), [5, [301046, 301050, 301051, 301051, 301051]], 'combination in the wiki order');
assert.deepEqual(need(301046), [0, [0, 0, 0, 0, 0]], 'Pence B: no template on these pages');
assert.deepEqual(need(300785), [1, [300785, 0, 0, 0, 0]], 'Roboloid row: template materials replaced');
assert.deepEqual(need(21133), [1, [21123, 0, 0, 0, 0]], 'original SE materials kept');
assert.ok(report.some((x) => x.id === 21133 && /original SE/.test(x.why)), 'difference reported');
assert.equal(byId.get(23086).validEvolve, 0, 'no evolution added (Meow Wow)');
assert.ok(report.some((x) => x.page === 'Meow Wow' && /no such evolution/.test(x.why)), 'missing evolution reported');
assert.deepEqual(need(90085), [5, [300948, 300948, 300948, 300948, 300948]], 'Fantasia Mickey A unchanged');
assert.ok(report.some((x) => x.page === 'Cloud & Leon'), 'a target missing from the master is reported');
assert.equal(changes.length, 8);
assert.equal(ew.applyWikiEvolve(medals, wiki).changes.length, 0, 'idempotent');
console.log('synthetic: ok,', changes.length, 'changes,', report.length, 'reports');

// served master: every evolving base row has its required medals except the Kyroo SAB LV 7-9 steps (no source)
const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const file = path.join(MASTER, 'medal.json');
if (fs.existsSync(file)) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const empty = ew.stillEmpty(m);
  assert.ok(empty.every((r) => /Kyroo \[SAB LV [789]\]$/.test(r.name)), 'only Kyroo rows without required medals: '
    + empty.filter((r) => !/Kyroo/.test(r.name)).map((r) => r.medalId).join(','));
  const mb = new Map(m.map((r) => [r.medalId, r]));
  assert.deepEqual([mb.get(301941).validEvolveNeed, mb.get(301941).evolveNeedId], [1, [FMB, 0, 0, 0, 0]], 'served: Terra');
  assert.deepEqual(mb.get(2301941).evolveNeedId, mb.get(301941).evolveNeedId, 'served: boosted Terra');
  console.log('served master: ok,', empty.length, 'Kyroo steps without a source');
}
console.log('OK');
