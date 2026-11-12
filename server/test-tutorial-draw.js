// Tutorial draw (tester report 12-11): the guided Shop step of the tutorial points its arrow at the SECOND plate of
// the list (A54 12-11) and expects the drawType 5 «Jewel Draw» of the original masters (1.1.3 and the late WW master:
// id 10, single draw, 300 Jewels). Without it the arrow was on a normal banner and a new player, short of Jewels, was
// stuck. Here: while the tutorial window is open and the draw has not been made the plate is second (after the
// Catalog) with drawType 5, the draw guarantees KH II King Mickey, and the master has the row.
//   node server/test-tutorial-draw.js
'use strict';
const gacha = require('./gacha');

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

const T = gacha.TUTORIAL_BANNER;
check(T && T.drawMedalTypeId === 10 && T.drawType === 5 && T.lotCount === 1, 'tutorial banner: id 10, drawType 5, single draw');
check(T && T.prices[0] === 300 && T.payType === 1, 'tutorial banner: 300 Jewels like the original row');
check(T && T.medalId === 33043, 'tutorial banner: KH II King Mickey');

const opts = (storyQuest) => ({ realMs: Date.UTC(2026, 10, 12), webBase: '', sizes: new Set([1, 10]), storyQuest,
  storyDay: '2016-04-10', show: new Set() });
const fresh = () => ({ freeStone: 300, gacha: {} });

// open: story before the end of the tutorial window, draw not made
let p = fresh();
let list = gacha.gachaListData([], p, { ...opts(6), tutorial: gacha.tutorialOpen(p, 6) }).gachaList;
const tp = list.find((x) => x.drawMedalTypeId === 10);
check(!!tp, 'plate listed during the tutorial');
check(tp && tp.drawType === 5, 'plate has drawType 5');
// the guide's arrow points at the second plate: the tutorial plate right after the Catalog, sortId between 1 and 10
check(list.findIndex((x) => x.drawMedalTypeId === 10) === 1 && list[0].drawMedalTypeId === gacha.catalogRow().drawMedalTypeId,
  'tutorial plate second in the list, after the Catalog');
check(tp && tp.sortId > list[0].sortId && list.slice(2).every((x) => x.sortId > tp.sortId), 'tutorial plate sortId between Catalog and banners');
check(tp && tp.price === 300 && tp.lotCount === 1, 'plate price 300, single draw');

// a normal plate keeps drawType 1
const normal = gacha.gachaListData([{ drawMedalTypeId: 10500, rowId: 'B0500', name: 'X', payType: 1, lotCount: 10, prices: [3000],
  unlockQuest: 1, start: '2016-04-01', end: '2016-04-30' }], fresh(), opts(6)).gachaList.find((x) => x.drawMedalTypeId === 10500);
check(normal && normal.drawType === 1, 'normal plate drawType 1');

// draw check: 300 Jewels are enough, 299 are not
check(gacha.checkDraw(T, fresh(), { drawMedalTypeId: 10, count: 1 }, { realMs: 0, freeSlots: 10, sizes: new Set([1]), storyQuest: 6 }) === null,
  'draw allowed with 300 Jewels');
check(gacha.checkDraw(T, { freeStone: 299, gacha: {} }, { drawMedalTypeId: 10, count: 1 },
  { realMs: 0, freeSlots: 10, sizes: new Set([1]), storyQuest: 6 }) !== null, 'draw refused with 299 Jewels');

// after the draw (or for a player past the tutorial window) the plate is gone
p = fresh();
gacha.payDraw(T, p, 0, true);
check(p.freeStone === 0, 'draw costs 300 Jewels');
check(!gacha.tutorialOpen(p, 6), 'closed after the draw');
check(!gacha.tutorialOpen(fresh(), 500), 'closed for a player past the tutorial window');
list = gacha.gachaListData([], p, { ...opts(6), tutorial: gacha.tutorialOpen(p, 6) }).gachaList;
check(!list.some((x) => x.drawMedalTypeId === 10), 'plate not listed after the draw');

// master row
const row = gacha.tutorialRow();
check(row && row.drawMedalTypeId === 10 && row.drawType === 5 && row.price === 300, 'master row id 10 drawType 5 price 300');

console.log(fails ? `test-tutorial-draw: ${fails} FAIL` : 'test-tutorial-draw: OK');
process.exit(fails ? 1 : 0);
