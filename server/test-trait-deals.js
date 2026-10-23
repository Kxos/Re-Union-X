// Trait Medal deals unlocked by the story 526-979 (I-084, docs/notes/medaglie.md#trait-deals):
//   node server/test-trait-deals.js [--list]
// Uses the real catalogue (server/game_data/gacha_catalog.json) and the real master (server/master_data): both are local
// only (Square Enix data, ignored by git); without them the test prints SKIP. The save is a new temporary file (KHUX_SAVE),
// never server/save. For every deal with a «trait medal #N» in its recipe it checks, through server.js (storyCtx +
// gachaShopList, the same choice as GET /gacha/list):
//   1. the expected first appearance, computed here from catalog.story only: the story tranche whose original period
//      contains the deal's dates, the first quest of that tranche (or unlockQuest if higher), the first week of the weekly
//      rotation (gacha-data.shopWindow, I-165) whose 7 days overlap the deal: there the deal is in the Shop; the unlock
//      quest opens the whole tranche (unlockQuest = its first quest - 1, also when two story rows share the date, e.g.
//      716-725 and 726-730 on 2018-01-11: before 23-10 the deals stayed locked for 716-724);
//   2. one quest earlier the deal is in no week of the rotation (locked or outside the period);
//   3. at the unlock quest, the weeks that do not overlap the deal's dates never show it;
//   4. the VIP twins (catalogOnly VIP_TWIN) never reach the Shop, but a drawable deal with the same Trait Medal and
//      start exists;
//   5. the recipe expands at the deal's date: each Trait Medal #N has a master row (medalId 9000000+N, type 9);
//   6. end to end: GET /gacha/list shows B0259 at quest 716 (week 9 of 9 of the 2018-01-11 tranche) and 5 draws of it
//      give Trait Medal #1 (pity 5); B0293 (Trait slot) gives Trait Medal #10 in a single draw.
// The Shop choice depends on the real week (clock.weekIndex) and on the story point, not on the fake «twin month» date
// (server.md#orologio): only the seasons use the real calendar, so the real time is fixed on a Monday with no season.
// --list prints the table «deal, unlock quest, first Shop week» used in docs/notes/medaglie.md#trait-deals.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const CATALOG = path.join(__dirname, 'game_data', 'gacha_catalog.json');
const MASTER = path.join(__dirname, 'master_data');
if (!fs.existsSync(CATALOG) || !fs.existsSync(path.join(MASTER, 'medal.json')) || !fs.existsSync(path.join(MASTER, 'stage.json'))) {
  console.log('SKIP: real catalogue or master missing (server/game_data/gacha_catalog.json, server/master_data)');
  process.exit(0);
}
const SAVE = path.join(os.tmpdir(), `khux-test-trait-deals-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.on('exit', () => { try { fs.unlinkSync(SAVE); } catch { /* already gone */ } });
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_GACHA_SIZES = '1,2,3,4,5,6,7,8,9,10'; // as tools/ldplayer/session/run-server.ps1
for (const k of ['KHUX_GACHA_SHOW', 'KHUX_GACHA_BANNERS', 'KHUX_MASTER_DIR', 'KHUX_REAL_NOW', 'KHUX_SERVER_TIME']) delete process.env[k];
const NOW = Date.parse('2027-03-08T10:00:00Z'); // Monday, no Shop season active (checked below)
Date.now = () => NOW;
const LIST = process.argv.includes('--list');

const clock = require('./clock');
const gd = require('./gacha-data');
const seasons = require('./gacha-seasons');
const log = console.log, warn = console.warn;
const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
const { _test: t } = quiet(() => require('./server'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
check(seasons.activeSeasons(t.realNow()).length === 0, 'the fixed real time must fall outside every Shop season');

const cat = quiet(() => t.gachaCatalog()); // sanitized, as served
const story = cat.story;
const dates = [...new Set(story.map((r) => r[2]))].sort();
const questsOf = (d) => { const rows = story.filter((r) => r[2] === d); return [rows[0][0], rows[rows.length - 1][1]]; };
const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
// rotation weeks of the tranche d computed from catalog.story alone (independent of gacha-data.shopWindow)
function weeksOf(d) {
  const next = dates.find((x) => x > d), end = next ? addDays(next, -1) : addDays(d, 6);
  const n = Math.max(1, Math.ceil((next ? (Date.parse(next) - Date.parse(d)) / DAY : 7) / 7));
  return Array.from({ length: n }, (_, k) => { const from = addDays(d, 7 * k), to = addDays(from, 6) < end ? addDays(from, 6) : end; return { k, n, from, to }; });
}
const overlaps = (b, w) => b.start <= w.to && (b.end || '2099-12-31') >= w.from;
const stageOf = new Map(t.masterRows('stage').filter((r) => r.id >= 1 && r.id <= 979 && r.stageKind === 1).map((r) => [r.id, r.stageId]));
const W = clock.weekIndex(t.realNow());
// Shop list (drawMedalTypeId set) of a player whose last cleared story quest is q, in week k of the rotation
const memo = new Map();
function shopAt(q, k) {
  const key = `${q}:${k}`;
  if (!memo.has(key)) {
    p.stageScores = q > 0 ? { [stageOf.get(q)]: 1 } : {};
    p.gacha = { rot: { day: gd.storyDay(cat, q), week: W - k } };
    const list = quiet(() => t.gachaShopList()); // default ctx = storyCtx(), as GET /gacha/list
    memo.set(key, new Set(list.map((b) => b.drawMedalTypeId)));
  }
  return memo.get(key);
}
check(stageOf.size === 979, `story rows 1-979 in the master: ${stageOf.size}`);

const traitNames = (b) => [...new Set(JSON.stringify([b.pool, b.guarantee]).match(/trait medal #\d+/g) || [])];
const deals = cat.banners.filter((b) => traitNames(b).length);
const sizes = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const drawable = (b) => !b.catalogOnly && [1, 7, 8].includes(b.payType) && sizes.has(b.lotCount);
const medalRows = new Map(t.masterRows('medal').map((m) => [m.medalId, m]));
const table = [];
const crowded = [];
for (const b of deals) {
  const nums = traitNames(b).map((n) => Number(n.split('#')[1]));
  // 5. recipe: every Trait Medal #N resolves to its master row and is in the expanded slot/pity/featured at the deal's date
  for (const n of nums) {
    const row = medalRows.get(9000000 + n);
    check(row && row.type === 9, `${b.rowId}: Trait Medal #${n} without a type 9 master row`);
  }
  if (drawable(b)) {
    let ex = null;
    try { ex = gd.expandPool(b, cat, gd.asOf(b, b.start)); } catch (e) { check(false, `${b.rowId}: recipe does not expand (${e.message})`); }
    if (ex) {
      const got = new Set([...(ex.slotNames || []).flat().map(([n]) => n), ...(ex.pityNames || []).map(([n]) => n), ...(ex.featuredNames || []).map(([n]) => n),
        ...(ex.listNames || []).map(([n]) => n), ...[...(ex.medalInfo || new Map()).values()].map((m) => m.name)]);
      for (const n of traitNames(b)) check(got.has(n), `${b.rowId}: ${n} not drawable at ${b.start} (expandPool)`);
    }
  }
  // 4. VIP twins: never listed, but the same Trait Medal is offered by a drawable deal starting the same day
  if (b.catalogOnly) {
    const twin = deals.find((x) => x !== b && drawable(x) && x.start === b.start && traitNames(x).some((n) => traitNames(b).includes(n)));
    check(b.catalogOnly === 'VIP_TWIN' && twin, `${b.rowId} (${b.catalogOnly}): no drawable twin with ${traitNames(b).join(', ')}`);
    table.push({ b, nums, twin: twin?.rowId });
    continue;
  }
  check(drawable(b), `${b.rowId}: not drawable (payType ${b.payType}, lotCount ${b.lotCount})`);
  // 1. expected first appearance from catalog.story
  let first = null;
  for (const d of dates.filter((x) => x <= (b.end || '2099-12-31'))) {
    const [qa, qb] = questsOf(d);
    const q = Math.max(qa, b.unlockQuest);
    if (q > qb) continue;
    const ws = weeksOf(d).filter((w) => overlaps(b, w));
    if (ws.length) { first = { d, q, qa, qb, ws }; break; }
  }
  if (!first) { check(false, `${b.rowId}: no story tranche/week reaches ${b.start}-${b.end} with unlockQuest ${b.unlockQuest}`); continue; }
  check(first.q === first.qa, `${b.rowId}: unlockQuest ${b.unlockQuest} locks it for quests ${first.qa}-${first.q - 1} of its own tranche ${first.d}`);
  const shown = first.ws.filter((w) => shopAt(first.q, w.k).has(b.drawMedalTypeId));
  for (const w of first.ws) if (!shown.includes(w)) crowded.push(`${b.rowId} w${w.k + 1}`);
  check(shown.length > 0, `${b.rowId}: not in the Shop at quest ${first.q}, tranche ${first.d}, weeks ${first.ws.map((w) => w.k + 1).join(',')}`);
  // 3. weeks of the rotation outside the deal's dates never show it
  for (const w of weeksOf(first.d)) if (!overlaps(b, w)) check(!shopAt(first.q, w.k).has(b.drawMedalTypeId), `${b.rowId}: in the Shop at quest ${first.q} week ${w.k + 1} (${w.from}..${w.to}) outside its dates`);
  // 2. one quest earlier: in no week of that quest's tranche
  if (first.q > 1) {
    const d0 = gd.storyDay(cat, first.q - 1);
    for (const w of weeksOf(d0)) check(!shopAt(first.q - 1, w.k).has(b.drawMedalTypeId), `${b.rowId}: already in the Shop at quest ${first.q - 1} week ${w.k + 1}`);
  }
  const w0 = shown[0] || first.ws[0];
  table.push({ b, nums, q: first.q, d: first.d, qa: first.qa, qb: first.qb, k: w0.k, n: w0.n, from: w0.from, to: w0.to });
}
check(deals.length >= 250, `Trait deals in the catalogue: ${deals.length}`);
// every banner: unlockQuest = first quest of the tranche running at its start - 1 (rows with the same date = one tranche)
for (const b of cat.banners.filter((x) => x.start)) {
  const d = dates.filter((x) => x <= b.start).pop();
  const want = d ? questsOf(d)[0] - 1 : 0;
  check(b.unlockQuest === want, `${b.rowId}: unlockQuest ${b.unlockQuest}, tranche ${d} opens at ${want}`);
}
check(table.filter((r) => r.d).length >= 230, `drawable Trait deals with a Shop week: ${table.filter((r) => r.d).length}`);

// 6. end to end on B0259 (quest 716, week 9 of 9 of the tranche 2018-01-11) and B0293 (Trait slot)
{
  const b259 = cat.banners.find((b) => b.rowId === 'B0259'), b293 = cat.banners.find((b) => b.rowId === 'B0293');
  check(b259 && b259.unlockQuest === 715, `B0259 unlockQuest ${b259 && b259.unlockQuest}, expected 715`);
  p.stageScores = { [stageOf.get(716)]: 1 };
  p.gacha = { rot: { day: '2018-01-11', week: W - 8 } };
  const l = call(t.respondGachaList);
  const plate = l.gachaList.find((x) => x.drawMedalTypeId === b259.drawMedalTypeId);
  check(plate && plate.price === 3000 && plate.lotCount === 10, `GET /gacha/list at quest 716 week 9: B0259 plate (${plate ? plate.price : 'missing'})`);
  p.gacha.rot.week = W - 7; // week 8 (2018-03-01..03-07): not yet
  check(!call(t.respondGachaList).gachaList.some((x) => x.drawMedalTypeId === b259.drawMedalTypeId), 'quest 716 week 8: no B0259');
  p.stageScores = { [stageOf.get(715)]: 1 }; p.gacha = { rot: { day: '2017-12-14', week: W } };
  check(!call(t.respondGachaList).gachaList.some((x) => x.drawMedalTypeId === b259.drawMedalTypeId), 'quest 715 (tranche 2017-12-14): no B0259');
  p.stageScores = { [stageOf.get(716)]: 1 }; p.gacha = { rot: { day: '2018-01-11', week: W - 8 } };
  call(t.respondGachaList);
  const before = (p.medals || []).length;
  p.freeStone = 3000 * 5;
  for (let i = 0; i < 5; i++) {
    const r = call(t.respondGachaDraw, { drawMedalTypeId: b259.drawMedalTypeId, count: 10 });
    check(r && Array.isArray(r.userMedalIds) && r.userMedalIds.length === 10, `B0259 draw ${i + 1}: ${JSON.stringify(r).slice(0, 120)}`);
  }
  const got = (p.medals || []).slice(before).map((m) => m.medalId);
  check(p.freeStone === 0, `B0259: 5 x 3000 Jewels spent (${p.freeStone} left)`);
  check(got.includes(9000001), 'B0259: Trait Medal #1 within 5 draws (pity)');
  // B0293 «8 Million Downloads Deal» (2018-04-27..05-21, unlockQuest 735): tranche 2018-04-12 (736-750), week 3
  const r293 = table.find((r) => r.b.rowId === 'B0293');
  check(r293 && r293.q === 736 && r293.d === '2018-04-12' && r293.k === 2, `B0293 first week: ${r293 && `${r293.q} ${r293.d} ${r293.k + 1}`}`);
  p.stageScores = { [stageOf.get(736)]: 1 }; p.gacha = { rot: { day: '2018-04-12', week: W - 2 } };
  call(t.respondGachaList);
  const n0 = p.medals.length;
  p.freeStone = 3000;
  const r = call(t.respondGachaDraw, { drawMedalTypeId: b293.drawMedalTypeId, count: 10 });
  check(r && r.userMedalIds && p.medals.slice(n0).some((m) => m.medalId === 9000010), 'B0293: Trait Medal #10 in one draw');
}

if (LIST) {
  const md = (s) => String(s).replace(/\|/g, '/');
  log('| Deal | Name | Trait Medal | Unlock quest | First in the Shop (quest, tranche, week) |');
  log('|---|---|---|---|---|');
  for (const r of table) {
    const tm = r.nums.map((n) => `#${n}`).join(', ');
    if (!r.d) { log(`| ${r.b.rowId} | ${md(r.b.name)} | ${tm} | ${r.b.unlockQuest} | never (VIP twin of ${r.twin}) |`); continue; }
    log(`| ${r.b.rowId} | ${md(r.b.name)} | ${tm} | ${r.b.unlockQuest} | ${r.q} (${r.d}, ${r.qa}-${r.qb}), week ${r.k + 1}/${r.n} ${r.from.slice(5)}..${r.to.slice(5)} |`);
  }
}
const drawn = table.filter((r) => r.d);
log(`Trait deals: ${deals.length} (${drawn.length} reach the Shop, ${deals.length - drawn.length} VIP twins); weeks cut by the 20-plate limit: ${crowded.length ? crowded.join(', ') : 'none'}`);
if (errors.length) { log(`ERRORS (${errors.length}):\n  ${errors.slice(0, 40).join('\n  ')}`); process.exit(1); }
log('OK test-trait-deals');
