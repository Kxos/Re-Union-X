// Prova di I-153 (striscia della pity con liste lunghe): node server/test-warrant-strip.js
// Parte sintetica: J (gacha.warrantStripBytes), un id per nome, soglia 900 di make-banners.warrantOf/masterRows,
// guardWarrant oltre il limite del client. Parte sul master e sul catalogo veri (fuori da git, saltata se mancano):
// i banner oltre 900 byte con validComment 1 e il comment di categoria, B0619/B0306 ancora con il nome.
'use strict';
const fs = require('fs');
const path = require('path');
const gacha = require('./gacha');
const gd = require('./gacha-data');
const mb = require('./make-banners');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const quiet = (fn) => { const log = console.log, out = []; console.log = (...a) => out.push(a.join(' ')); try { return [fn(), out]; } finally { console.log = log; } };

// --- J: stessa stringa che unisce il client (testi 106180302 «<important>%s</important>», 305 «, », 306 «, or »)
const joined = (names) => names.map((n, i) => `<important>${n}</important>` + (i + 2 === names.length ? ', or ' : i + 1 < names.length ? ', ' : '')).join('');
const names = { 1: 'HD Axel', 2: 'HD Axel', 3: 'SN+ - KH III Naminé', 4: 'Key Art #24', 5: 'Wakka' };
const nameOf = new Map(Object.entries(names).map(([k, v]) => [Number(k), v]));
const J = (ids, f = nameOf) => gacha.warrantStripBytes(ids, f);
check(J([]) === 0 && J([1]) === 7 && J([1, 2]) === 7, `J con 0/1 nome: ${J([])} ${J([1])} ${J([1, 2])}`);
check(J([1, 3]) === Buffer.byteLength(joined(['HD Axel', 'SN+ - KH III Naminé'])), `J 2 nomi (UTF-8): ${J([1, 3])}`);
check(J([1, 2, 3, 4, 5]) === Buffer.byteLength(joined(['HD Axel', 'SN+ - KH III Naminé', 'Key Art #24', 'Wakka'])), `J 4 nomi: ${J([1, 2, 3, 4, 5])}`);
check(J([1, 3], null) === 0, 'J senza nameOf: 0');
check(J([1, 3], (id) => names[id]) === J([1, 3]), 'nameOf come funzione');
check(gacha.WARRANT_LIST_MAX === 900 && gacha.WARRANT_HARD_MAX === 963, 'soglie 900 / 963');

// --- un id per nome, il primo nell'ordine dato
check(JSON.stringify(gacha.warrantDedupe([2, 1, 3, 1], nameOf)) === '[2,3]', `dedupe per nome: ${JSON.stringify(gacha.warrantDedupe([2, 1, 3, 1], nameOf))}`);
check(JSON.stringify(gacha.warrantDedupe([1, 2, 99, 99], nameOf)) === '[1,99]', 'id senza riga medal: resta (una volta)');
check(JSON.stringify(gacha.warrantDedupe([1, 2], null)) === '[1,2]', 'senza nameOf: come prima');
const bP = { rowId: 'BT1', drawMedalTypeId: 1, name: 'T', guarantee: { pity: 3, slots: [] } };
const wf = gacha.warrantFields(bP, { pityIds: [1, 2, 3], pool: {} }, { sinceFeatured: 1 }, null, nameOf);
check(wf.userWarrantDisplayOfTime === 2 && JSON.stringify(wf.warrantMedalIds) === '[1,3]', `warrantFields con nameOf: ${JSON.stringify(wf)}`);
check(JSON.stringify(gacha.warrantFields(bP, { pityIds: [1, 2, 3], pool: {} }, {}, null).warrantMedalIds) === '[1,2,3]', 'warrantFields senza nameOf: invariato');

// --- soglia 900 in make-banners (stripBytesOf con i nomi del catalogo: banner senza rarityMix -> niente pool)
const base = { name: 'Deal', prices: [3000], lotCount: 10, payType: 1, dayLimit: 0, vipFree: false, catalogOnly: null };
const withPity = (o) => ({ ...base, guarantee: { list: [], count: 0, pity: 3, every: null, slots: [], pityGift: null, ...o } });
check(mb.warrantOf(withPity({ pityNames: ['x'] }), false, 900).validComment === 0, 'J 900: lista dei nomi (validComment 0)');
const w901 = mb.warrantOf(withPity({ pityNames: ['x'], pityLabel: 'SN or higher Medal' }), false, 901);
check(w901.validComment === 1 && w901.display === 3 && w901.number === 3
  && w901.comment === 'A <important>SN or higher Medal</important> is guaranteed! Draws left: <important>%d</important>', `J 901: categoria ${JSON.stringify(w901)}`);
check(mb.warrantOf(withPity({ pityNames: ['x'] }), false, 5000).comment.includes('<important>featured Medal</important>'), 'senza pityLabel: ripiego');
check(mb.warrantOf({ ...base, guarantee: { pity: null } }, false, 5000).validComment === 1 && !mb.warrantOf({ ...base, guarantee: { pity: null } }, false, 5000).comment, 'senza pity: come prima');
// catalogo sintetico: n nomi da 30 byte (id 1000+i): J = n*53 + 2(n-2) + 5; 16 nomi -> 881, 17 -> 936
const nm = (i) => `Medal Name Number ${String(i).padStart(12, '0')}`; // 30 byte
const medals = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [nm(i).toLowerCase(), { ids: [[1000 + i, 7, '2016-04-07', 1]] }]));
const synNameOf = new Map(Array.from({ length: 20 }, (_, i) => [1000 + i, nm(i)]));
const pityOf = (n, label) => withPity({ pityNames: Object.keys(medals).slice(0, n), pityLabel: label });
const cat = { medals, banners: [{ ...pityOf(16), rowId: 'B9016', drawMedalTypeId: 19016 }, { ...pityOf(17, 'boosted SN++ Medal'), rowId: 'B9017', drawMedalTypeId: 19017 },
  { ...pityOf(18), rowId: 'B9018', drawMedalTypeId: 19018 }] };
check(mb.stripBytesOf(cat.banners[0], cat, synNameOf) === 881 && mb.stripBytesOf(cat.banners[1], cat, synNameOf) === 936, `stripBytesOf: ${mb.stripBytesOf(cat.banners[0], cat, synNameOf)} ${mb.stripBytesOf(cat.banners[1], cat, synNameOf)}`);
check(mb.stripBytesOf(cat.banners[0], cat, null) === 0, 'stripBytesOf senza nomi: 0');
const [rows, logs] = quiet(() => mb.masterRows(cat, false, synNameOf));
const row = (id) => rows.find((r) => r.drawMedalTypeId === id);
check(row(19016).validComment === 0 && row(19016).warrantDisplayOfTime === 3, 'masterRows 881 byte: validComment 0');
check(row(19017).validComment === 1 && row(19017).warrantDisplayOfTime === 3 && row(19017).comment === mb.categoryComment('boosted SN++ Medal'), `masterRows 936 byte: categoria ${row(19017).comment}`);
check(row(19018).validComment === 1 && logs.some((l) => /B9018.*pity_label/.test(l)) && !logs.some((l) => /B9017/.test(l)), `masterRows senza pity_label: log (${logs.join(' | ')})`);
check(mb.masterRows(cat).every((r) => r.drawMedalTypeId === 9001 || r.validComment === 0), 'masterRows senza nameOf: come prima');

// --- guardWarrant
const ids20 = [...synNameOf.keys()]; // 20 nomi: J 1105 > 963
const g = (w, vc, b = { ...bP, rowId: 'BG1', drawMedalTypeId: 77 }) => quiet(() => gacha.guardWarrant(w, b, undefined, null, vc, 1, synNameOf));
const [h1, l1] = g({ userWarrantDisplayOfTime: 2, warrantMedalIds: ids20 }, 0);
check(h1.userWarrantDisplayOfTime === 0 && JSON.stringify(h1.warrantMedalIds) === '[1000]' && l1.length === 1 && /BG1.*963/.test(l1[0]), `guard vc 0 oltre 963: ${JSON.stringify(h1)} ${l1}`);
const [, l1b] = g({ userWarrantDisplayOfTime: 2, warrantMedalIds: ids20 }, 0);
check(l1b.length === 0, 'guard: una riga di log per banner');
const [h2] = g({ userWarrantDisplayOfTime: 2, warrantMedalIds: ids20.slice(0, 17) }, 0);
check(h2.userWarrantDisplayOfTime === 2 && h2.warrantMedalIds.length === 17, 'guard vc 0 entro 963: invariato');
const [h3] = g({ userWarrantDisplayOfTime: 2, warrantMedalIds: ids20 }, 1);
check(h3.userWarrantDisplayOfTime === 2 && JSON.stringify(h3.warrantMedalIds) === '[1000]', `guard vc 1 con pity: un id ${JSON.stringify(h3)}`);
const [h4] = g({ userWarrantDisplayOfTime: 1, warrantMedalIds: [] }, 1, { rowId: 'BG2', drawMedalTypeId: 78, guarantee: {} });
check(h4.userWarrantDisplayOfTime === 1 && h4.warrantMedalIds.length === 0, 'guard vc 1 senza pity: {1, []}');
const [h5] = g({ userWarrantDisplayOfTime: 1, warrantMedalIds: [] }, 0, { rowId: 'BG3', drawMedalTypeId: 79, guarantee: {}, pool: {} });
check(h5.userWarrantDisplayOfTime === 0 && h5.warrantMedalIds.length === 1, 'guard vc 0 lista vuota: ripiego di prima');

// --- master e catalogo veri (gia' rigenerati con make-banners.js)
const MASTER = path.join(__dirname, 'master_data'), CAT = path.join(__dirname, 'game_data', 'gacha_catalog.json');
let real = '';
if (fs.existsSync(path.join(MASTER, 'medal.json')) && fs.existsSync(path.join(MASTER, 'drawMedalType.json')) && fs.existsSync(CAT)) {
  const medal = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
  const realNameOf = new Map(medal.map((r) => [r.medalId, r.name]));
  const dmt = new Map(JSON.parse(fs.readFileSync(path.join(MASTER, 'drawMedalType.json'), 'utf8')).map((r) => [r.drawMedalTypeId, r]));
  const catalog = gd.loadCatalog(CAT);
  const B = (rid) => catalog.banners.find((b) => b.rowId === rid);
  const TWELVE = ['B0646', 'B0637', 'B0638', 'B0545', 'B0523', 'B0526', 'B0548', 'B0797', 'B0803', 'B0807', 'B0788', 'B0792'];
  const OVER900 = [...TWELVE, 'B0678', 'B0771', 'B0778', 'B0781']; // 901-963 byte: corrette anche con i nomi, ma oltre la soglia
  const LABEL = { B0646: 'SN or higher Medal', B0637: 'SN or higher Medal', B0638: 'SN or higher Medal', B0678: 'SN or higher Medal',
    B0523: 'Medal that can be upgraded to Supernova+', B0526: 'Medal that can be upgraded to Supernova+', B0545: 'Medal that can be upgraded to Supernova+',
    B0548: 'Tier 8 or Tier 9 Medal that can be upgraded to Supernova+' };
  const bytes = new Map(catalog.banners.map((b) => [b.rowId, mb.stripBytesOf(b, catalog, realNameOf)]));
  check(TWELVE.every((r) => bytes.get(r) > gacha.WARRANT_HARD_MAX), `i 12 oltre 963: ${TWELVE.map((r) => `${r} ${bytes.get(r)}`).join(', ')}`);
  check(bytes.get('B0637') === 3089 && bytes.get('B0646') === 3272 && bytes.get('B0792') === 1041, 'J come la misura del report (3089, 3272, 1041)');
  const over = catalog.banners.filter((b) => bytes.get(b.rowId) > gacha.WARRANT_LIST_MAX).map((b) => b.rowId).sort();
  check(JSON.stringify(over) === JSON.stringify([...OVER900].sort()), `banner oltre 900: ${over.join(',')}`);
  for (const r of OVER900) {
    const b = B(r), m = dmt.get(b.drawMedalTypeId), label = LABEL[r] || 'boosted SN++ Medal';
    check(b.guarantee.pityLabel === label, `${r}: pityLabel ${b.guarantee.pityLabel}`);
    check(m && m.validComment === 1 && m.warrantDisplayOfTime === b.guarantee.pity && m.comment === mb.categoryComment(label), `${r}: riga del master ${m && [m.validComment, m.warrantDisplayOfTime, m.comment]}`);
  }
  check(dmt.get(10637).comment === 'A <important>SN or higher Medal</important> is guaranteed! Draws left: <important>%d</important>', 'B0637: comment della decisione');
  for (const r of ['B0619', 'B0306', 'B0768']) {
    const b = B(r);
    check(dmt.get(b.drawMedalTypeId).validComment === 0 && bytes.get(r) <= gacha.WARRANT_LIST_MAX, `${r}: ancora con i nomi (${bytes.get(r)} byte)`);
  }
  // ogni riga con validComment 0 e pity sta entro 900 byte
  const bad = catalog.banners.filter((b) => b.guarantee?.pity && dmt.get(b.drawMedalTypeId)?.validComment === 0 && bytes.get(b.rowId) > gacha.WARRANT_LIST_MAX);
  check(!bad.length, `validComment 0 oltre 900: ${bad.map((b) => b.rowId).join(',')}`);
  // piastre come le manda il server (warrantFields + guardWarrant con il validComment del master servito)
  const plate = (b, vc, since = 0) => {
    const ex = gd.expandPool(b, catalog, gd.asOf(b, '2099-12-31'));
    return quiet(() => gacha.guardWarrant(gacha.warrantFields(b, ex, { sinceFeatured: since }, catalog, realNameOf), b, ex, catalog, vc, 1, realNameOf))[0];
  };
  for (const r of TWELVE) {
    const b = B(r), p = plate(b, dmt.get(b.drawMedalTypeId).validComment, 1);
    check(p.userWarrantDisplayOfTime === b.guarantee.pity - 1 && p.warrantMedalIds.length === 1, `${r}: piastra con la categoria ${JSON.stringify(p)}`);
  }
  const old = plate(B('B0637'), 0);
  check(old.userWarrantDisplayOfTime === 0 && old.warrantMedalIds.length === 1, `B0637 con un master vecchio (validComment 0): striscia nascosta ${JSON.stringify(old)}`);
  const p619 = plate(B('B0619'), 0);
  check(p619.userWarrantDisplayOfTime === 10 && p619.warrantMedalIds.length >= 1
    && new Set(p619.warrantMedalIds.map((id) => realNameOf.get(id))).size === p619.warrantMedalIds.length, `B0619: nome e conto ${JSON.stringify(p619)}`);
  real = `, master veri (${over.length} banner con la categoria)`;
} else real = ' (master veri assenti: saltato)';

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log(`OK: striscia della pity I-153 (J, un id per nome, soglia 900, guardWarrant${real})`);
