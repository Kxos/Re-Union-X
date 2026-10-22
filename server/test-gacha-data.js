// Prova delle funzioni pure delle estrazioni: node server/test-gacha-data.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const g = require('./gacha-data');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const J = JSON.stringify;

check(J(g.parseRarityMix('4★:1 3★:2')) === '[[4,1],[3,2]]', 'mix semplice');
check(J(g.parseRarityMix('6★:2 5★:3 3★:5 Other:1')) === '[[6,2],[5,3],[3,5]]', 'Other ignorato');
check(J(g.parseRarityMix('3★:5 5★:1 4★:4')) === '[[5,1],[4,4],[3,5]]', 'ordine decrescente');
check(J(g.parseRarityMix('')) === '[]', 'vuoto');

const b = { lotCount: 3, rarityMix: [[4, 1], [3, 2]] };
check(J(g.slotRarities(b)) === '[4,3,3]', 'slot dal mix');
check(J(g.slotRarities({ ...b, lotCount: 5 })) === '[4,3,3,3,3]', 'slot mancanti = rarita piu bassa');
check(J(g.slotRarities({ ...b, lotCount: 2 })) === '[4,3]', 'slot in eccesso tagliati');

// Catalogo sintetico (contratto di gacha_catalog.json + contract-ext: std, origin, att, pool.filter)
const CAT = {
  firstRarity: { 3: '2016-04-07', 4: '2016-04-07', 5: '2016-04-07', 6: '2016-07-15', 7: '2018-05-25' },
  story: [[1, 200, '2016-04-07'], [201, 250, '2016-04-21'], [251, 525, '2016-12-08']],
  subsets: {
    '1.1': { date: '2016-04-07', names: ['sora'] }, '2.2': { date: '2016-05-27', names: ['hades'] },
    '9.9': { date: '2016-04-07', names: ['mickey', 'cloud'] },
  },
  medals: {
    sora: { date: '2016-04-07', cls: '', class2: 'Attack', std: true, ids: [[31, 3, '2016-04-07'], [41, 4, '2016-04-07'], [51, 5, '2016-04-07'], [61, 6, '2016-04-07'], [71, 7, '2018-05-14']] },
    hades: { date: '2016-05-27', cls: '', class2: 'Attack', std: true, ids: [[32, 3, '2016-05-27'], [42, 4, '2016-05-27']] },
    vip: { date: '2016-04-07', cls: 'V', class2: 'Attack', std: false, ids: [[33, 3, '2016-04-07']] },
    mickey: { date: '2016-04-07', cls: '', class2: 'Attack', std: false, origin: 'disney', att: 'power', ids: [[34, 3, '2016-04-07']] },
    cloud: { date: '2016-04-07', cls: '', class2: 'Attack', std: false, origin: 'ffkh', att: 'speed', ids: [[35, 3, '2016-04-07']] },
    riku: { date: '2016-04-07', cls: '', class2: 'Attack', std: false, ids: [[45, 4, '2016-04-07'], [55, 5, '2016-04-07']] },
  },
};
const B = (o) => ({ rowId: 'B9', drawMedalTypeId: 10009, lotCount: 3, rarityMix: [[4, 1], [3, 2]], flags: [], start: '2016-05-01', end: '2016-05-31',
  epicBoost: false, pool: { mode: 'sets', sets: ['1.1'], names: [], featured: [], inheritAfter: null, evolve: null },
  guarantee: { list: [], count: 0, pity: null, every: null }, skill: null, ...o });
const P = (o) => ({ mode: 'sets', sets: ['1.1'], names: [], featured: [], inheritAfter: null, evolve: null, ...o });
const G = (o) => ({ list: [], count: 0, pity: null, every: null, ...o });
const allIds = (pool) => Object.values(pool).flat().sort((x, y) => x - y);

// storia e data di riferimento
check(g.storyDay(CAT, 525) === '2016-12-08', 'storyDay 525');
check(g.storyDay(CAT, 210) === '2016-04-21', 'storyDay 210');
check(g.storyDay(CAT, 0) === '2016-04-07', 'storyDay 0 = prima tranche');
check(g.asOf(B({}), '2016-12-08') === '2016-05-01', 'asOf banner normale = inizio');
check(g.asOf(B({ flags: ['PERMANENT'] }), '2016-12-08') === '2016-05-31', 'asOf permanente limitato alla fine');
check(g.asOf(B({ flags: ['PERMANENT'] }), '2016-04-07') === '2016-05-01', 'asOf permanente limitato all inizio');

// pool per set ed epoca
check(J(g.expandPool(B({}), CAT, '2016-05-01').pool) === '{"3":[31],"4":[41],"5":[51]}', 'pool per set (niente 6, niente Hades)');
const seven = (at) => g.expandPool(B({ rarityMix: [[6, 1]], lotCount: 1 }), CAT, at).pool;
check(J(seven('2018-06-01')[7]) === '[71]', 'epoca 7: 7 estraibile dal 25/05/2018');
check(!seven('2018-05-20')[7], 'epoca 7: niente 7 prima del 25/05/2018 (id gia uscito il 14/05)');
check(J(g.expandPool(B({ rarityMix: [[6, 1]], lotCount: 1 }), CAT, '2016-06-01').pool) === '{}', 'stella del mix non ancora uscita: esclusa');
const rel = (at) => allIds(g.expandPool(B({ pool: P({ mode: 'released', sets: [] }) }), CAT, at).pool);
check(J(rel('2016-04-30')) === '[31,41,51]', 'released: solo Sora prima di Hades');
check(J(rel('2016-06-01')) === '[31,32,41,42,51]', 'released: Sora e Hades, mai vip ne non std');
const inh = allIds(g.expandPool(B({ pool: P({ mode: 'inherit', inheritAfter: '2016-04-07' }) }), CAT, '2016-06-01').pool);
check(J(inh) === '[31,32,41,42,51]', 'inherit: set ereditati + uscite dopo');
check(J(g.expandPool(B({ pool: P({ sets: ['2.2'] }) }), CAT, '2016-05-01').pool) === '{}', 'sotto-set futuro ignorato');
// pool.filter: solo le medaglie dei sotto-set; vetrina e garanzie entrano comunque
const filt = (o) => allIds(g.expandPool(B({ rarityMix: [[3, 1]], lotCount: 1, pool: P({ sets: ['9.9'], filter: ['disney'], ...o }) }), CAT, '2016-05-01').pool);
check(J(filt({})) === '[34]', 'filtro disney: entra solo Mickey');
check(J(filt({ filter: [] })) === '[34,35]', 'filtro vuoto: entrano tutte');
check(J(filt({ filter: ['speed'] })) === '[35]', 'filtro per attributo');
check(J(filt({ featured: ['cloud'] })) === '[34,35]', 'filtro: la vetrina entra comunque');
const filtG = allIds(g.expandPool(B({ rarityMix: [[3, 1]], lotCount: 1, pool: P({ sets: ['9.9'], filter: ['disney'] }), guarantee: G({ list: ['cloud'], count: 1 }) }), CAT, '2016-05-01').pool);
check(J(filtG) === '[34,35]', 'filtro: la lista di garanzia entra comunque');
const ev = g.expandPool(B({ lotCount: 5, pool: P({ mode: 'evolve', sets: [], evolve: [[301682, 7], [301683, 8], [301684, 9]] }) }), CAT, '2016-05-01');
check(J(ev.weighted) === '[[301682,0.45],[301683,0.45],[301684,0.1]]', 'evolve: livello piu alto 10%');

// probabilita'
const ex = g.expandPool(B({}), CAT, '2016-05-01');
const odds = g.slotOdds(B({}), ex);
check(J(odds[0]) === '[{"rare":4,"pct":94},{"rare":5,"pct":6}]', 'odds slot 4');
check(J(odds[1]) === '[{"rare":3,"pct":90},{"rare":4,"pct":10}]', 'odds slot 3');
check(J(g.slotOdds(B({ epicBoost: true }), ex)[1]) === '[{"rare":3,"pct":85},{"rare":5,"pct":15}]', 'odds epicBoost');

// estrazione: rng 0.5 -> niente promozione, poi indice
check(J(g.rollDraw(B({}), ex, seq(0.5, 0.0)).medalIds) === '[41,31,31]', 'estrazione senza promozioni');
check(J(g.rollDraw(B({}), ex, seq(0.01, 0.0, 0.5, 0.0, 0.5, 0.0)).medalIds) === '[51,31,31]', 'promozione 4 -> 5');
let threw = false;
try { g.rollDraw(B({}), { pool: {}, featuredIds: [], listIds: [], listNames: [], featuredNames: [], weighted: [] }, Math.random); } catch (e) { threw = /pool vuoto/.test(e.message); }
check(threw, 'pool vuoto: errore');
check(J(g.rollDraw(B({ lotCount: 3, pool: P({ mode: 'evolve' }) }), ev, seq(0.95)).medalIds) === '[301684,301684,301684]', 'estrazione evolve');
threw = false;
try { g.rollDraw(B({ pool: P({ mode: 'evolve', evolve: [] }) }), { pool: {}, featuredIds: [], listIds: [], weighted: [] }, Math.random); } catch { threw = true; }
check(threw, 'evolve vuoto: errore');

// slot a lista: prima la medaglia per nome (vetrina peso 2), poi la variante alla stella dello slot
// (mix [[4,1],[3,2]] a 2016-06-01: sora {3,4,5} peso 1, hades {3,4} peso 2; slot 0 = 4★)
const LB = B({ pool: P({ featured: ['hades'] }), guarantee: G({ list: ['sora', 'hades'], count: 1 }) });
const lex = g.expandPool(LB, CAT, '2016-06-01');
check(J(lex.listIds) === '[31,32,41,42,51]' && J(lex.featuredIds) === '[32,42]', 'liste espanse');
check(J(lex.listNames) === '[["sora",1,{"3":[31],"4":[41],"5":[51]}],["hades",2,{"3":[32],"4":[42]}]]', 'listNames per nome');
check(J(lex.featuredNames) === '[["hades",1,{"3":[32],"4":[42]}]]', 'featuredNames per nome');
check(g.rollDraw(LB, lex, seq(0.0, 0.5, 0.0)).medalIds[0] === 41, 'slot a lista: rng 0 -> Sora alla stella dello slot');
check(g.rollDraw(LB, lex, seq(0.99, 0.0)).medalIds[0] === 42, 'slot a lista: rng 0.99 -> Hades 4★');
check(g.rollDraw(LB, lex, seq(0.4, 0.0)).medalIds[0] === 42, 'slot a lista: vetrina peso 2 (uniforme darebbe Sora)');
check(g.rollDraw(LB, lex, seq(0.0, 0.01, 0.0)).medalIds[0] === 51, 'slot a lista: salita 4 -> 5 della medaglia');
const NB = B({ rarityMix: [[5, 1], [3, 2]], guarantee: G({ list: ['hades'], count: 1 }) });
check(g.rollDraw(NB, g.expandPool(NB, CAT, '2016-06-01'), seq(0.0)).medalIds[0] === 42, 'slot a lista: variante piu vicina sotto lo slot');
const UB = B({ rarityMix: [[3, 1]], lotCount: 1, pool: P({ sets: [] }), guarantee: G({ list: ['riku'], count: 1 }) });
check(g.rollDraw(UB, g.expandPool(UB, CAT, '2016-06-01'), seq(0.0, 0.5, 0.0)).medalIds[0] === 45, 'slot a lista: variante piu bassa sopra lo slot');
check(J(g.slotOdds(LB, lex)[0]) === '[{"list":true,"rare":4,"pct":94},{"list":true,"rare":5,"pct":6}]', 'odds slot a lista');
check(J(g.slotOdds(LB, lex)[1]) === '[{"rare":3,"pct":90},{"rare":4,"pct":10}]', 'odds slot normale dopo la lista');

// guarantee.slot (correzione finale C, B0306 7★ Medal Deal: «Guarantees one Tier 4 or lower 7★ Medal. Guarantees
// one of the following Medals: ...», mix [[7,1],[6,1],[5,8]]): la lista va nello slot 1 (6★), lo slot 0 resta un 7★
// qualsiasi del pool; la pity resta sullo slot 0
const SCAT = { ...CAT, medals: { ...CAT.medals,
  kairi: { date: '2018-05-01', std: false, ids: [[66, 6, '2018-05-01'], [76, 7, '2018-05-14']] },
  axel: { date: '2018-05-01', std: false, ids: [[67, 6, '2018-05-01'], [77, 7, '2018-05-14']] } } };
const SB = B({ start: '2018-06-01', end: '2018-06-07', lotCount: 10, rarityMix: [[7, 1], [6, 1], [5, 8]], pool: P({ sets: ['1.1'] }),
  guarantee: G({ list: ['kairi', 'axel'], count: 1, slot: 1 }) });
const sex = g.expandPool(SB, SCAT, SB.start);
const tail = Array(8).fill([0.5, 0.0]).flat(); // slot 2-9: nessuna salita, primo id
const sr = g.rollDraw(SB, sex, seq(0.0, 0.0, 0.5, 0.0, ...tail));
check(sr.medalIds[0] === 71, `slot 0 di B0306: un 7★ qualsiasi del pool (${sr.medalIds[0]})`);
check(sr.medalIds[1] === 66, `slot 1 di B0306: la variante 6★ di una medaglia della lista (${sr.medalIds[1]})`);
check(sr.medalIds.slice(2).every((id) => id === 51), 'slot 2-9 di B0306: generici 5★');
const so = g.slotOdds(SB, sex);
check(!so[0][0].list && so[1].every((o) => o.list) && !so[2][0].list, 'odds: lista sullo slot 1');
check(J(g.slotOdds({ ...SB, guarantee: G({ list: ['kairi'], count: 2, slot: 1 }) }, sex).map((s) => !!s[0].list)) === '[false,true,true,false,false,false,false,false,false,false]', 'odds: count 2 dallo slot 1');
check(g.rollDraw({ ...SB, guarantee: G({ list: ['kairi', 'axel'], count: 1 }) }, sex, seq(0.0, 0.0)).medalIds[0] === 76, 'senza slot: lista sullo slot 0 (come prima)');
const SP = { ...SB, pool: P({ sets: ['1.1'], featured: ['axel'] }), guarantee: G({ list: ['kairi', 'axel'], count: 1, slot: 1, pity: 2 }) };
const spx = g.expandPool(SP, SCAT, SP.start);
const spr = g.rollDraw(SP, spx, seq(0.0, 0.0, 0.0, 0.5, 0.0, ...tail), { draws: 1, sinceFeatured: 1 });
check(spr.medalIds[0] === 77 && spr.medalIds[1] === 66, `pity sullo slot 0, lista sullo slot 1 (${spr.medalIds.slice(0, 2)})`);

// pity
const PB = B({ pool: P({ featured: ['hades'] }), guarantee: G({ pity: 3 }) });
const pex = g.expandPool(PB, CAT, '2016-06-01');
const pr = g.rollDraw(PB, pex, seq(0.0, 0.5, 0.0), { draws: 2, sinceFeatured: 2 });
check(pr.medalIds[0] === 42 && pr.featured === true, 'pity alla terza estrazione: vetrina alla stella dello slot');
const pn = g.rollDraw(PB, pex, seq(0.5, 0.0), { draws: 2, sinceFeatured: 1 });
check(J(pn.medalIds) === '[41,31,31]' && pn.featured === false, 'pity non ancora');

// every
const EB = B({ guarantee: G({ list: ['hades'], count: 1, every: 3 }) });
const eex = g.expandPool(EB, CAT, '2016-06-01');
check(g.rollDraw(EB, eex, seq(0.5, 0.0), { draws: 2, sinceFeatured: 0 }).medalIds[0] === 42, 'every 3: terza estrazione, Hades 4★');
check(g.rollDraw(EB, eex, seq(0.5, 0.0), { draws: 0, sinceFeatured: 0 }).medalIds[0] === 41, 'every 3: prima estrazione normale');

// un'eccezione nei casi 2b conta come errore (non ferma i controlli vecchi)
try {
// --- sotto-progetto 2b: riserve degli slot (guarantee.slots), Tier, pity a stella fissa, potenziamenti ---
// Catalogo v3: ids = [id, rare, data, Tier]
const TCAT = { firstRarity: CAT.firstRarity, story: CAT.story, subsets: {}, medals: {
  'hd axel': { date: '2016-05-01', std: false, ids: [[51, 5, '2016-05-01', 4], [71, 7, '2018-05-14', 4]] },
  zack: { date: '2018-05-14', std: false, ids: [[72, 7, '2018-05-14', 7]] },
  kairi: { date: '2017-01-01', std: false, ids: [[61, 6, '2017-01-01', 3], [73, 7, '2018-05-14', 3]] },
  'sn only': { date: '2018-10-05', std: false, ids: [[74, 7, '2018-10-05', 10]] },
} };
const RES = (o) => ({ kind: 'list', slot: 0, count: 1, star: 6, names: [], tierMin: null, tierMax: null, ...o });
const G3 = (o) => ({ list: ['kairi', 'sn only'], count: 1, slot: 1, pity: 5, every: null,
  slots: [RES({ kind: 'tier', slot: 0, star: 7, tierMax: 4 }), RES({ slot: 1, names: ['kairi', 'sn only'] })],
  pityNames: ['hd axel'], pityStar: 7, pitySlot: 0, pityGift: null, erratum: null, source: null, ...o });
const EN = (o) => ({ preset: [], boosted: [], maxSkill: [], notReproduced: [], ...o });
const B3 = (o) => B({ rowId: 'B0306', drawMedalTypeId: 10306, start: '2018-11-01', end: '2018-11-07', lotCount: 10,
  rarityMix: [[7, 1], [6, 1], [5, 8]], pool: P({ sets: [], names: ['zack', 'sn only'], featured: ['hd axel'] }),
  guarantee: G3({}), enhance: EN({}), ...o });
const consts = [0, 0.01, 0.02, 0.2, 0.5, 0.97, 0.99, 0.999];
const rngs = [...consts.map((c) => () => c), ...Array(300).fill(Math.random)];
const NOPITY = { draws: 0, sinceFeatured: 0 }, PITY = { draws: 4, sinceFeatured: 4 };
// rng che da' 0.0 alle prime n chiamate (le scelte delle medaglie) e poi v (i tiri dei potenziamenti)
const after = (n, v) => { let k = 0; return () => (k++ < n ? 0.0 : v); };
const calls = (fn) => { let k = 0; fn(() => { k++; return 0.0; }); return k; };

check(g.BOOST_SMALL_CHANCE === 0.05, 'BOOST_SMALL_CHANCE 0.05');
const b3 = B3({}), x3 = g.expandPool(b3, TCAT, '2018-11-01');
check(J(x3.pool) === '{"5":[51],"6":[61],"7":[71,72,73,74]}', `pool di B0306 sintetico (${J(x3.pool)})`);
check(x3.slotNames.length === 2 && J(x3.slotNames[0]) === '[]' && J(x3.slotNames[1]) === '[["kairi",1,{"6":[61],"7":[73]}],["sn only",1,{"7":[74]}]]',
  `slotNames per riserva (${J(x3.slotNames)})`);
check(J(x3.pityNames) === '[["hd axel",1,{"5":[51],"7":[71]}]]' && J(x3.pityIds) === '[71]', `pityNames/pityIds (${J(x3.pityNames)} ${J(x3.pityIds)})`);
check(x3.tiers instanceof Map && x3.tiers.get(74) === 10 && x3.tiers.get(71) === 4 && x3.tiers.get(61) === 3, 'tiers dal 4o campo');
check(g.reservationOf(b3, 0)?.kind === 'tier' && g.reservationOf(b3, 1)?.kind === 'list' && g.reservationOf(b3, 2) === null, 'reservationOf');
const bUsed = B3({ guarantee: G3({ slots: [RES({ slot: 0, count: 2, slotsUsed: [3, 5], conflict: true, names: ['kairi'] })] }) });
check(g.reservationOf(bUsed, 5)?.slot === 0 && g.reservationOf(bUsed, 3) && g.reservationOf(bUsed, 1) === null && g.reservationOf(bUsed, 0) === null, 'reservationOf: slotsUsed rispettato');

// Tier (Review Focus 2) e decisione 1 (Review Focus 1): con ogni rng lo slot 0 e' 71 o 73 (Tier <= 4), mai 72/74;
// lo slot 1 (lista a 6★) e' sempre 61: «sn only» non ha la 6★, kairi non sale a 7★
let bad = 0, bad1 = 0;
for (const r of rngs) {
  const d = g.rollDraw(b3, x3, r, NOPITY);
  if (![71, 73].includes(d.medalIds[0])) bad++;
  if (d.medalIds[1] !== 61) bad1++;
}
check(bad === 0, `slot tier di B0306: ${bad} estrazioni fuori dal Tier <= 4`);
check(bad1 === 0, `slot lista a 6★ di B0306: ${bad1} estrazioni diverse da 61`);
const d3 = g.rollDraw(b3, x3, seq(0.99), NOPITY);
check(d3.featured === d3.medalIds.includes(71) && d3.pityFired === false && Array.isArray(d3.extras) && d3.extras.length === 10, 'estrazione v3: featured, pityFired, extras');
check(J(d3.extras[0]) === '{"boostedFrom":null,"preset":null,"skills":null}', `extras vuoti (${J(d3.extras[0])})`);
// pity alla quinta estrazione senza vetrina: hd axel 7★ sullo slot 0
for (const r of rngs.slice(0, 20)) {
  const d = g.rollDraw(b3, x3, r, PITY);
  check(d.medalIds[0] === 71 && d.featured === true && d.pityFired === true, `pity di B0306: slot 0 = ${d.medalIds[0]}, featured ${d.featured}`);
}
// Fix 1: la pity si azzera solo con il bersaglio alla stella promessa (pityStar o la variante che la pity darebbe)
const f51 = g.rollDraw(b3, x3, seq(0.5), NOPITY);
check(f51.medalIds.slice(2).includes(51) && !f51.medalIds.includes(71) && f51.featured === false,
  `hd axel 5★ in uno slot generico non azzera la pity 7★ (${f51.medalIds} featured ${f51.featured})`);
const f71 = g.rollDraw(b3, x3, seq(0.0), NOPITY);
check(f71.medalIds[0] === 71 && f71.pityFired === false && f71.featured === true, `hd axel 7★ estratta da sola azzera la pity (${f71.medalIds})`);

// Tier vuoto alla data: slot senza filtro, una riga di log, nessuna eccezione
const bT = B3({ drawMedalTypeId: 19001, guarantee: G3({ slots: [RES({ kind: 'tier', slot: 0, star: 7, tierMin: 8, tierMax: 9 })] }) });
const xT = g.expandPool(bT, TCAT, '2018-11-01');
const logs = [], origLog = console.log;
console.log = (...a) => logs.push(a.join(' '));
let tThrew = false, tIds = [];
try { for (let k = 0; k < 20; k++) tIds.push(g.rollDraw(bT, xT, Math.random, NOPITY).medalIds[0]); } catch (e) { tThrew = e.message; }
console.log = origLog;
check(!tThrew && tIds.every((id) => [71, 72, 73, 74].includes(id)), `Tier vuoto: slot 0 senza filtro (${tThrew || tIds})`);
check(logs.length === 1 && /Tier/.test(logs[0]), `Tier vuoto: una riga di log (${J(logs)})`);

// pity a stella fissa prima della data (Review Focus 1): a 2018-01-10 non ci sono 7★, la pity da' 51
const bE = B3({ start: '2018-01-10', end: '2018-01-17' }), xE = g.expandPool(bE, TCAT, '2018-01-10');
const fE = (() => { const l = console.log; console.log = () => {}; try { return g.rollDraw(bE, xE, seq(0.5), NOPITY); } finally { console.log = l; } })(); // Tier vuoto: log zittito
check(fE.medalIds.includes(51) && fE.pityFired === false && fE.featured === true, `prima delle 7★: la variante di ripiego (51) azzera la pity (${fE.medalIds})`);
check(!x3.pool[8] && !xE.pool[7] && J(xE.pityIds) === '[51]', `prima delle 7★: niente 7★ (${J(xE.pool)} ${J(xE.pityIds)})`);
for (const r of rngs.slice(0, 20)) {
  const d = g.rollDraw(bE, xE, r, PITY);
  check(d.medalIds[0] === 51 && d.featured, `pity 7★ prima della data: ${d.medalIds[0]}`);
  check(d.medalIds.every((id) => ![71, 72, 73, 74].includes(id)), `nessuna 7★ futura (${d.medalIds})`);
}
// 6★ fissa su un banner 5★ del 2016 (D8): la variante piu' alta gia' uscita
const b16 = B3({ start: '2016-06-01', end: '2016-06-07', lotCount: 3, rarityMix: [[5, 1], [4, 2]], pool: P({ sets: [], names: ['sora'], featured: ['hd axel'] }),
  guarantee: G3({ list: [], slots: [], pityStar: 6, pitySlot: 0 }) });
const x16 = g.expandPool(b16, { ...TCAT, medals: { ...TCAT.medals, sora: CAT.medals.sora } }, '2016-06-01');
check(g.rollDraw(b16, x16, seq(0.0), PITY).medalIds[0] === 51, 'pity 6★ su un banner del 2016: 51');
// stella della pity fuori dal mix: entra solo nei nomi riservati, non nel pool
const bO = B3({ lotCount: 3, rarityMix: [[5, 3]], pool: P({ sets: [], names: ['kairi'], featured: [] }), guarantee: G3({ list: [], slots: [], pityStar: 7 }) });
const xO = g.expandPool(bO, TCAT, '2018-11-01');
check(!xO.pool[7] && J(xO.pityNames) === '[["hd axel",1,{"5":[51],"7":[71]}]]', `pityStar fuori dal mix: solo nei nomi riservati (${J(xO.pool)})`);
check(g.rollDraw(bO, xO, seq(0.5), PITY).medalIds[0] === 71, 'pityStar 7 fuori dal mix: 71');

// pity sullo slot di una riserva a lista che non contiene il bersaglio: la lista cede lo slot solo per quella estrazione
const bL = B3({ guarantee: G3({ pitySlot: 1 }) }), xL = g.expandPool(bL, TCAT, '2018-11-01');
check(g.rollDraw(bL, xL, seq(0.5), PITY).medalIds[1] === 71, 'pity sullo slot della lista senza il bersaglio: 71');
check(g.rollDraw(bL, xL, seq(0.5), NOPITY).medalIds[1] === 61, 'estrazione dopo: la lista torna');
// bersaglio nella lista: lo slot da' il bersaglio, che e' della lista (la lista resta garantita)
const bLin = B3({ guarantee: G3({ pitySlot: 1, slots: [RES({ kind: 'tier', slot: 0, star: 7, tierMax: 4 }), RES({ slot: 1, names: ['kairi', 'hd axel'] })] }) });
const xLin = g.expandPool(bLin, TCAT, '2018-11-01');
const lin = g.rollDraw(bLin, xLin, seq(0.5), PITY).medalIds[1];
check(lin === 71 && xLin.slotNames[1].some(([, , v]) => Object.values(v).flat().includes(lin)), `bersaglio nella lista: ${lin}`);
// B0321 sintetico: pitySlot 1, lo slot 0 resta del Tier
let b321 = 0;
for (const r of rngs) {
  const d = g.rollDraw(bLin, xLin, r, PITY);
  if (![71, 73].includes(d.medalIds[0]) || d.medalIds[1] !== 71) b321++;
}
check(b321 === 0, `B0321: slot 0 del Tier e pity sullo slot 1 (${b321} errori)`);
// pityGift: nessuno slot sostituito, pityFired per il regalo (Task 6), featured azzera la pity
const bG = B3({ guarantee: G3({ pityNames: ['dual meow wow'], pityStar: null, pitySlot: null, pityGift: [3, 301684, 1] }) });
const xG = g.expandPool(bG, TCAT, '2018-11-01');
const dG = g.rollDraw(bG, xG, seq(0.3), PITY), dG0 = g.rollDraw(bG, xG, seq(0.3), NOPITY);
check(dG.pityFired === true && dG.featured === true && J(dG.medalIds) === J(dG0.medalIds) && dG0.pityFired === false, `pityGift: niente sostituito (${dG.medalIds} / ${dG0.medalIds})`);
// banner v3 con slots [] (solo pity): la pity va su pitySlot
const bS = B3({ guarantee: G3({ list: [], slots: [], pitySlot: 2, pityStar: 7 }) }), xS = g.expandPool(bS, TCAT, '2018-11-01');
check(g.rollDraw(bS, xS, seq(0.5), PITY).medalIds[2] === 71, 'slots vuoto: pity su pitySlot 2');

// boosted
const BOOST = new Map([['71:1000:1000', 2000071], ['61:1000:1000', 2000061], ['72:1000:1000', 2000072]]);
const opts = { boostedOf: (id, s, d) => BOOST.get(`${id}:${s}:${d}`) };
const bB = B3({ enhance: EN({ boosted: [{ on: { slots: [0] }, str: 1000, def: 1000, chance: 'small' }] }) });
const nB = calls((r) => g.rollDraw(bB, x3, r, NOPITY));
const dB = g.rollDraw(bB, x3, after(nB, 0.01), NOPITY, opts);
check(dB.medalIds[0] === 2000071 && dB.extras[0].boostedFrom === 71, `boosted small, rng 0.01: ${dB.medalIds[0]} da ${dB.extras[0].boostedFrom}`);
const dB5 = g.rollDraw(bB, x3, after(nB, 0.5), NOPITY, opts);
check(dB5.medalIds[0] === 71 && dB5.extras[0].boostedFrom === null, `boosted small, rng 0.5: ${dB5.medalIds[0]}`);
check(g.rollDraw(bB, x3, after(nB, 0.01), NOPITY).medalIds[0] === 71, 'senza opts.boostedOf: niente boosted');
const dBp = g.rollDraw(bB, x3, after(calls((r) => g.rollDraw(bB, x3, r, PITY)), 0.01), PITY, opts);
check(dBp.medalIds[0] === 2000071 && dBp.featured === true, 'boosted della pity: featured calcolato sulla normale');
const bBg = B3({ enhance: EN({ boosted: [{ on: { slots: [1] }, str: 1000, def: 1000, chance: 'guaranteed' }] }) });
check(rngs.slice(0, 30).every((r) => { const d = g.rollDraw(bBg, x3, r, NOPITY, opts); return d.medalIds[1] === 2000061 && d.extras[1].boostedFrom === 61; }),
  'boosted guaranteed sulla riserva lista: sempre la boosted');
const bBn = B3({ enhance: EN({ boosted: [{ on: { slots: [0, 1] }, str: 2000, def: 2000, chance: 'guaranteed' }] }) });
let nThrew = false, dBn;
try { dBn = g.rollDraw(bBn, x3, seq(0.0), NOPITY, opts); } catch { nThrew = true; }
check(!nThrew && dBn.medalIds[0] === 71 && dBn.medalIds[1] === 61 && dBn.extras[0].boostedFrom === null, 'senza riga boosted: la normale');
// forma per Tier (decisione 8): solo una medaglia gia' estratta, 7★ Tier >= 4, niente Prime
const bBt = B3({ enhance: EN({ boosted: [{ on: { star: 7, tierMin: 4, tierMax: null, excludePrime: true }, str: 1000, def: 1000, chance: 'guaranteed' }] }) });
let tb = 0;
for (const r of rngs) {
  const d = g.rollDraw(bBt, x3, r, NOPITY, opts);
  const n0 = d.extras[0].boostedFrom ?? d.medalIds[0];
  if ((n0 === 71) !== (d.medalIds[0] === 2000071)) tb++;
  if (d.medalIds.includes(2000072) || d.medalIds.includes(2000061)) tb++; // 72 mai estratta dallo slot Tier; 61 e' 6★
}
check(tb === 0, `boosted per Tier: ${tb} errori`);
const xPr = g.expandPool(bBt, { ...TCAT, medals: { ...TCAT.medals, 'prime - hd axel': TCAT.medals['hd axel'] } }, '2018-11-01');
xPr.medalInfo.set(71, { name: 'prime - hd axel', rare: 7 });
check(g.rollDraw(bBt, xPr, seq(0.0), NOPITY, opts).medalIds[0] === 71, 'boosted per Tier: Prime escluse');

// preset e abilita' al massimo
const bP = B3({ enhance: EN({ preset: [{ on: { slots: [0] }, dots: [1, 3], guilt: null }] }) });
const dots = new Set();
for (const r of rngs) {
  const d = g.rollDraw(bP, x3, r, NOPITY);
  const p0 = d.extras[0].preset;
  if (p0 && Number.isInteger(p0.dots) && p0.dots >= 1 && p0.dots <= 3 && p0.guilt === null) dots.add(p0.dots); else dots.add('bad');
  if (d.extras.slice(1).some((x) => x.preset)) dots.add('altri slot');
}
check(J([...dots].sort()) === '[1,2,3]', `preset dots [1, 3] sullo slot 0 (${J([...dots])})`);
const bPn = B3({ enhance: EN({ preset: [{ on: { names: ['hd axel'] }, dots: 'max', guilt: 'max' }], maxSkill: [{ on: { names: ['kairi'] }, skills: ['paralysis+ ii max'] }] }) });
let pnErr = 0;
for (const r of rngs) {
  const d = g.rollDraw(bPn, x3, r, NOPITY);
  d.medalIds.forEach((id, i) => {
    const axel = [51, 71].includes(id), kai = [61, 73].includes(id);
    if (axel !== !!d.extras[i].preset || (axel && J(d.extras[i].preset) !== '{"dots":"max","guilt":"max"}')) pnErr++;
    if (kai !== !!d.extras[i].skills || (kai && J(d.extras[i].skills) !== '["paralysis+ ii max"]')) pnErr++;
  });
}
check(pnErr === 0, `preset per nome e maxSkill: ${pnErr} errori`);
const bPs = B3({ enhance: EN({ preset: [{ on: { star: 6 }, dots: 3, guilt: null }] }) });
check(g.rollDraw(bPs, x3, seq(0.5), NOPITY).extras.map((x) => x.preset?.dots ?? 0).join('') === '0300000000', 'preset per stella');

// slotOdds di B0306
const o3 = g.slotOdds(b3, x3);
check(J(o3[0]) === '[{"rare":7,"pct":100,"kind":"tier","tier":"<=4"}]', `odds slot tier (${J(o3[0])})`);
check(o3[1].every((o) => o.kind === 'list' && o.list === true) && J(o3[1].map((o) => o.rare)) === '[6]', `odds slot lista (${J(o3[1])})`);
check(o3.slice(2).every((s) => J(s) === '[{"rare":5,"pct":96},{"rare":6,"pct":4}]'), `odds slot 2-9 come oggi (${J(o3[2])})`);
const oS = g.slotOdds(bS, xS);
check(oS[2].every((o) => o.kind === 'pity') && !oS[0][0].kind, `odds: pitySlot senza riserva -> kind pity (${J(oS[2])})`);
const oTr = g.slotOdds(B3({ guarantee: G3({ slots: [RES({ kind: 'trait', slot: 3, star: 5 })] }) }), x3);
check(oTr[3].every((o) => o.kind === 'trait'), 'odds: slot trait');
// slot Trait con la Trait Medal nel catalogo (I-084 parte B): lo slot la da' sempre, e solo lo slot (fuori dal pool)
const TMCAT = { ...SCAT, medals: { ...SCAT.medals, 'trait medal #23': { date: '2018-03-13', cls: 'LIST', std: false, ids: [[9000023, 6, '2018-03-13', 0]] } } };
const TB = { ...SB, guarantee: G({ list: [], count: 0, slots: [RES({ kind: 'trait', slot: 1, star: 6, names: ['trait medal #23'] })] }) };
const tex = g.expandPool(TB, TMCAT, TB.start);
check(!Object.values(tex.pool).flat().includes(9000023), `Trait Medal fuori dal pool generico (${J(tex.pool)})`);
const tr = g.rollDraw(TB, tex, seq(0.0, 0.0, 0.5, 0.0, ...tail));
check(tr.medalIds[1] === 9000023 && !tr.medalIds.slice(2).includes(9000023), `slot Trait: Trait Medal #23 (${tr.medalIds})`);
check(J(g.slotOdds(TB, tex)[1]) === '[{"rare":6,"pct":100,"kind":"trait","names":["trait medal #23"]}]', `odds: slot della Trait Medal #23 (${J(g.slotOdds(TB, tex)[1])})`);
// slot Trait senza numero noto: ripiego (6★ qualsiasi)
const TU = { ...SB, guarantee: G({ list: [], count: 0, slots: [RES({ kind: 'trait', slot: 1, star: 6, names: [] })] }) };
check(g.rollDraw(TU, g.expandPool(TU, TMCAT, TU.start), seq(0.0, 0.0, 0.5, 0.0, ...tail)).medalIds[1] !== 9000023, 'slot Trait sconosciuto: ripiego');
// pity su una Trait Medal (B0267): alla quinta estrazione lo slot della pity la da'
const TP = { ...SB, guarantee: G({ list: [], count: 0, slots: [], pity: 5, pityNames: ['trait medal #23'], pityStar: 6, pitySlot: 1 }) };
const tpx = g.expandPool(TP, TMCAT, TP.start);
check(g.rollDraw(TP, tpx, seq(0.0, 0.0, 0.5, 0.0, ...tail), { draws: 4, sinceFeatured: 4 }).medalIds[1] === 9000023, 'pity sulla Trait Medal #23');
check(J(g.slotOdds(B3({ guarantee: G3({ slots: [RES({ kind: 'tier', slot: 0, star: 7, tierMin: 3, tierMax: 4 })] }) }), x3)[0][0].tier) === '"3-4"', 'odds: Tier 3-4');
// compatibilita': banner senza slots -> extras presenti, featured dalla vetrina
const cd = g.rollDraw(B({}), ex, seq(0.5, 0.0));
check(Array.isArray(cd.extras) && cd.extras.length === 3 && cd.pityFired === false, 'percorso vecchio: extras e pityFired');
} catch (e) { errors.push(`2b: eccezione ${e.message}`); }

// abilita'
const rows = new Map([[1100, { skillId: 1100, name: 'Attack Boost I' }], [1102, { name: 'Attack Boost All I', skillId: 1102 }], [1101, { name: 'Attack Boost II', skillId: 1101 }]]);
check(g.rollSkill({ table: '72415', slots: 'all' }, 1, rows, () => 0.0) === 1100, 'skill 72415 rng 0');
check(g.rollSkill({ table: '72415', slots: 'all' }, 1, rows, () => 0.99) === null, 'skill 72415 rng 0.99 -> nessuna');
check(g.rollSkill({ table: '50106', slots: 'first' }, 1, rows, () => 0) === null, 'skill 50106 solo primo slot');
check(g.rollSkill({ table: '50106', slots: 'first' }, 0, rows, () => 0.99) === 1101, 'skill 50106 slot 0 sempre una skill');
check(g.rollSkill(null, 0, rows, () => 0) === null, 'nessuna tabella');

const row = g.drawMedalTypeRow({ drawMedalTypeId: 10001, name: 'X', payType: 1, price: 600, sortId: 10,
  bannerUrl: '/web/gacha/img/10001.png', detailUrl: '/web/gacha/detail/10001', comment: '3 Medals' });
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json'), 'utf8')).drawMedalType;
const fields = schema.map(([f]) => f);
check(fields.length === 47 && fields.every((f) => f in row), 'riga master con tutti i 47 campi');
check(row.benefitId === 0 && row.drawType === 1 && row.price === 600 && row.validComment === 1 && row.warrantDisplayOfTime === 1, 'valori della riga');
const rowW = g.drawMedalTypeRow({ drawMedalTypeId: 10002, name: 'X', payType: 1, price: 600, sortId: 10, bannerUrl: 'a', detailUrl: 'b',
  comment: '100% <important>%d tries</important>', warrant: { display: 5, number: 5, validComment: 0 } });
check(rowW.warrantDisplayOfTime === 5 && rowW.warrantNumberOfTime === 5 && rowW.validComment === 0, 'warrant nella riga');
check(rowW.comment === '100%% <important>%d tries</important>', `comment: % raddoppiato, %d intatto (${rowW.comment})`);

const EMPTY = '{"banners":[],"subsets":{},"medals":{},"firstRarity":{},"story":[]}';
check(J(g.loadCatalog('/non/esiste.json')) === EMPTY, 'catalogo assente -> vuoto');
const tmp = path.join(os.tmpdir(), `khux-test-catalog-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify({ version: 1, _stats: { n: 1 }, ...CAT, banners: [B({ drawMedalTypeId: 10001 })] }));
const cat = g.loadCatalog(tmp);
check(g.bannerById(cat.banners, 10001)?.drawMedalTypeId === 10001 && cat.medals.sora && cat.story.length === 3, 'caricamento (campi in piu ammessi) e ricerca');
fs.writeFileSync(tmp, '{rotto');
check(J(g.loadCatalog(tmp)) === EMPTY, 'file non valido -> vuoto');
fs.writeFileSync(tmp, '{"banners": 3}');
check(J(g.loadCatalog(tmp)) === EMPTY, 'senza lista banners -> vuoto');
fs.unlinkSync(tmp);
check(!('UPGRADE_CHANCE' in g) && !('loadBanners' in g), 'vecchie funzioni rimosse');
check(g.CATALOG_ID === 9001 && g.EPIC_UPGRADE === 0.15 && g.FEATURED_WEIGHT === 2 && J(g.UPGRADE) === '{"3":0.1,"4":0.06,"5":0.04,"6":0.03}', 'costanti');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: gacha-data');
