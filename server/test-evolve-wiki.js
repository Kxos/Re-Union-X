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
  // the Puppy table in short (with a wrong result name, as 835 «Puppy #30 - 36» on the wiki)
  Puppy: ['==Evolving Puppy Medals==', '{|', '|-valign="top"', '|', '{|class="wikitable"', '!3★||4★', '|-', '|Puppy #1',
    "|rowspan=\"3\"|'''830''': Puppy #0 - 3", '|-', '|Puppy #2', "|-'", '|Puppy #3', '|}', '|', '{|class="wikitable', '!5★||6★',
    '|-', '|Puppy #1 - 3', '|rowspan="3"|[[101 Dalmatians]]', '|-', '|[[Pongo]]', '|-', '|[[Perdita]]', '|}', '|}'].join('\n'),
  'Blue Fairy': '{{Evo|base=Blue Fairy (SA Bonus LV 1) 6★|evo1=Blue Fairy (SA Bonus LV 1) 6★|evo2=Blue Fairy (SA Bonus LV 1) 6★|evo3=Blue Fairy (SA Bonus LV 1) 6★|evo4=Blue Fairy (SA Bonus LV 1) 6★|evo5=Blue Fairy (SA Bonus LV 1) 6★|result=Blue Fairy (SA Bonus LV 2) 6★}}',
  'KH 3D Sora': '{{Evo|base=KH 3D Sora 6★|evo1=KH 3D Riku 6★|evo2=Meow Wow 6★|result=Sora & Riku & Meow Wow 6★}}',
  'Halloween Sora C': '{{Evo|base=Halloween Sora C 5★|evo1=Halloween Goofy C 5★|evo2=Halloween Donald C 5★|result=Sora & Donald & Goofy C 6★}}',
  'Fantasia Mickey B': '{{Evo|base=Fantasia Mickey A 5★|evo1=Magic Broom 5★|evo2=Magic Broom 5★|evo3=Magic Broom 5★|evo4=Magic Broom 5★|evo5=Magic Broom 5★|result=Fantasia Mickey B 6★}}',
};

// parsing: titles with «Illus.», the comma of the date, a target closed by '' only, no target
const rules = ew.fmbRules(wiki);
assert.deepEqual(rules.map((r) => [r.from, r.to, r.n]), [
  ['Illustrated King Mickey', 'SN++ - Illus. BC King Mickey', 1], ['Key Art #8', 'SN++ - Key Art #8', 2],
  ['SN++ - KH III Terra', null, 1], ['Master Xehanort [EX]', 'SN++ - Master Xehanort B', 2],
  ['Cloud & Leon', '<SB++> Cloud & Leon', 1]]);
assert.deepEqual(ew.evoTemplates({ a: wiki['Classic Goofy'] })[0].base, ['Classic Goofy', 1], '«★» alone = 1★');
assert.deepEqual(ew.puppyGroups(wiki).map((g) => [g.from, g.to, g.result, g.members]), [
  [3, 4, 'Puppy #0 - 3', ['Puppy #1', 'Puppy #2', 'Puppy #3']], [5, 6, '101 Dalmatians', ['Puppy #1 - 3', 'Pongo', 'Perdita']]], 'Puppy table');

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
  row(1022086, 'KH 3D Sora', 6, { groupId: 22086 }),
  row(301247, 'Puppy #1', 3, { validEvolveNeed: 3, evolveNeedId: [90083, 90083, 90083, 0, 0] }), row(301248, 'Puppy #2', 3), row(301249, 'Puppy #3', 3),
  row(301346, 'Puppy #1 - 3', 4), row(301363, 'Puppy #1 - 3', 5), row(301366, 'Pongo', 5, evo(301368, 2, [301363, 301367, 0, 0, 0])),
  row(301367, 'Perdita', 5), row(301368, '101 Dalmatians', 6),
  row(301495, 'Blue Fairy [SA Bonus LV 1]', 6, { validPack: 1 }), row(301496, 'Blue Fairy [SA Bonus LV 2]', 6, { validPack: 1 }),
  // Halloween Sora C evolving elsewhere: reported, not overwritten (one evolveId per row)
  row(301157, 'Halloween Goofy C', 5), row(301159, 'Halloween Sora C', 5, evo(999999)), row(301161, 'Halloween Donald C', 5),
  row(301162, 'Sora & Donald & Goofy C', 6), row(999999, 'Elsewhere', 6),
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
const evolves = (id) => [byId.get(id).validEvolve, byId.get(id).evolveId, ...need(id)];
// added evolutions (ADD): validEvolve + evolveId + the wiki materials, evolveMoney untouched
assert.deepEqual(evolves(23086), [1, 300826, 2, [22086, 21086, 0, 0, 0]], 'Meow Wow 6★ -> Sora & Riku & Meow Wow');
assert.deepEqual(evolves(22086), [1, 300826, 2, [21086, 23086, 0, 0, 0]], 'KH 3D Sora (its own page)');
assert.deepEqual(evolves(1022086), evolves(22086), 'the boosted copy gets the added evolution');
assert.equal(byId.get(21086).validEvolve, 0, 'KH 3D Riku: no template on these pages');
assert.deepEqual(evolves(301247), [1, 301346, 2, [301248, 301249, 0, 0, 0]], 'Puppy #1 + the rest of its group, generic materials replaced');
assert.ok(report.some((x) => /resolved by its members/.test(x.why)), 'wiki result name typo reported');
assert.deepEqual(evolves(301363), [1, 301368, 2, [301366, 301367, 0, 0, 0]], 'Puppy 5★ -> 101 Dalmatians with Pongo + Perdita');
assert.deepEqual(evolves(301366), [1, 301368, 2, [301363, 301367, 0, 0, 0]], 'Pongo unchanged');
assert.deepEqual(evolves(301346), [0, 0, 0, [0, 0, 0, 0, 0]], 'Puppy 4★: no 4★ -> 5★ group in this table');
assert.deepEqual(evolves(301495), [1, 301496, 5, Array(5).fill(301495)], 'Blue Fairy LV 1 -> LV 2 with five LV 1');
assert.equal(byId.get(301496).validEvolve, 0, 'Blue Fairy LV 2: no template here');
assert.deepEqual(evolves(301159), [1, 999999, 0, [0, 0, 0, 0, 0]], 'Halloween Sora C evolving elsewhere: kept');
assert.ok(report.some((x) => x.id === 301159 && /one evolveId per row/.test(x.why)), 'conflict reported');
assert.equal(byId.get(301157).validEvolve, 0, 'Halloween Goofy C: no template on these pages');
assert.deepEqual(need(90085), [5, [300948, 300948, 300948, 300948, 300948]], 'Fantasia Mickey A unchanged');
assert.ok(report.some((x) => x.page === 'Cloud & Leon'), 'a target missing from the master is reported');
assert.equal(changes.filter((c) => c.kind !== 'add').length, 9, 'the 8 of c9259dd + the boosted KH 3D Sora');
// added: Meow Wow, KH 3D Sora, Puppy #1-#3, Puppy #1 - 3 5★, Perdita, Blue Fairy LV 1
assert.deepEqual(changes.filter((c) => c.kind === 'add').map((c) => c.id).sort(), [22086, 23086, 301247, 301248, 301249, 301363, 301367, 301495]);
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
  // added evolutions (23-10): Sora & Riku & Meow Wow, Sora & Donald & Goofy C, the Puppy steps, Blue Fairy LV n -> n+1
  const ev = (id) => [mb.get(id).validEvolve, mb.get(id).evolveId, mb.get(id).validEvolveNeed, mb.get(id).evolveNeedId];
  assert.deepEqual(ev(23086), [1, 300826, 2, [22086, 21086, 0, 0, 0]], 'served: Meow Wow');
  assert.deepEqual(ev(22086), [1, 300826, 2, [21086, 23086, 0, 0, 0]], 'served: KH 3D Sora');
  assert.deepEqual(ev(21086), [1, 300826, 2, [22086, 23086, 0, 0, 0]], 'served: KH 3D Riku');
  assert.deepEqual(ev(301159), [1, 301162, 2, [301157, 301161, 0, 0, 0]], 'served: Halloween Sora C');
  assert.deepEqual(ev(301247), [1, 301346, 5, [301248, 301249, 301250, 301251, 301252]], 'served: Puppy #1');
  assert.deepEqual(ev(301345), [1, 301362, 2, [301343, 301344, 0, 0, 0]], 'served: Puppy #99');
  assert.deepEqual(ev(301277), [1, 301351, 5, [301278, 301279, 301280, 301281, 301282]], 'served: Puppy #31 (wiki «#30 - 36»)');
  assert.deepEqual(ev(301358), [1, 301365, 4, [301359, 301360, 301361, 301362, 0]], 'served: Puppy #73 - 78');
  assert.deepEqual(ev(301363), [1, 301368, 4, [301364, 301365, 301366, 301367, 0]], 'served: Puppy #1 - 36');
  assert.deepEqual(ev(301366), [1, 301368, 4, [301363, 301364, 301365, 301367, 0]], 'served: Pongo');
  for (let lv = 1; lv <= 7; lv++) assert.deepEqual(ev(301494 + lv), [1, 301495 + lv, 5, Array(5).fill(301494 + lv)], 'served: Blue Fairy LV ' + lv);
  assert.equal(mb.get(301502).validEvolve, 0, 'served: Blue Fairy LV 8 is the last tier');
  const puppies = m.filter((r) => r.medalId < 1000000 && /^Puppy #/.test(r.name));
  assert.equal(puppies.length, 99 + 17 + 3);
  assert.ok(puppies.every((r) => r.validEvolve && mb.get(r.evolveId).rare === r.rare + 1
    && r.evolveNeedId.slice(0, r.validEvolveNeed).every((x) => mb.get(x))), 'served: every Puppy step');
  console.log('served master: ok,', empty.length, 'Kyroo steps without a source');
}
console.log('OK');
