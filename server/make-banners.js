#!/usr/bin/env node
// Generatore del master drawMedalType (spec 2026-10-16-shop-banner-design.md, sotto-progetto 2).
//   node server/make-banners.js        poi alzare KHUX_REVISION (master drawMedalType)
// Fonte (fuori da git): server/game_data/gacha_catalog.json, scritto da recon/tools/make_banner_catalog.py.
// Uscita (fuori da git): server/master_data/drawMedalType.json = piastra Catalog (9001) + una riga per
// ogni banner del catalogo. Il master serve per Details (detailUrl) e la striscia scorrevole (comment);
// la lista dello Shop la decide il server a ogni /gacha/list (gacha.js). Mai price 0, mai benefitId != 0;
// payType fuori da [1, 4, 5, 6, 7, 8] (3, 9) diventa 1: quei banner restano solo nel catalogo.
'use strict';
const fs = require('fs');
const path = require('path');
const gd = require('./gacha-data');
const gacha = require('./gacha');

const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const GAME = process.env.KHUX_GAME_DATA || path.join(__dirname, 'game_data');

// Striscia scorrevole: composizione e limite o garanzia (stringa printf: drawMedalTypeRow raddoppia i %).
function commentOf(b) {
  if (!b.lotCount) return 'Banner Catalog only'; // banner INCOMPLETE senza dettagli originali
  const mix = (b.rarityMix || []).map(([r, n]) => `${n}x ${r}★+`).join(', ');
  const lim = gd.limitText(b);
  const extra = b.guarantee?.pity ? ` - featured Medal guaranteed within ${b.guarantee.pity} draws`
    : b.vipFree ? ' - one free VIP draw per day' : lim ? ` - ${lim}` : '';
  return `${b.lotCount} Medal${b.lotCount === 1 ? '' : 's'}${mix ? `: ${mix}` : ''}${extra}`;
}

// Striscia della garanzia. Con pity: conto alla rovescia (display = number = pity) e validComment 0, il client
// scrive «<nome> guaranteed in N tries!» dai nomi di warrantMedalIds (Task 6). Senza pity: la striscia di oggi.
// Con WARRANT_XML_SAFE un nome con «&» (o «<») romperebbe il parser XML del client: validComment 1 e
// comment XML scritto da noi, con i nomi escapati e il solo %d (ricerca §2, U3: da provare al banco).
// I-153 («Testo di categoria», decisione dell'utente): se la lista dei nomi distinti della pity supera
// gacha.WARRANT_LIST_MAX byte (stripBytes, stessa formula del server: gacha.warrantStripBytes) validComment 1 e
// un comment con la categoria del notice (guarantee.pityLabel, da recon/tools/banner_overrides.tsv campo pity_label).
// Il comment e' un sprintf con il solo %d = userWarrantDisplayOfTime e senza plurale: il numero in fondo.
const WARRANT_XML_SAFE = false;
const PITY_LABEL_FALLBACK = 'featured Medal'; // banner oltre il limite senza pity_label (log in masterRows)
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const categoryComment = (label) => `A <important>${xmlEsc(label)}</important> is guaranteed! Draws left: <important>%d</important>`;

function warrantOf(b, xmlSafe = WARRANT_XML_SAFE, stripBytes = 0) {
  const pity = b.guarantee?.pity;
  if (!pity) return { display: 1, number: 0, validComment: 1 };
  if (stripBytes > gacha.WARRANT_LIST_MAX) {
    return { display: pity, number: pity, validComment: 1, comment: categoryComment(b.guarantee.pityLabel || PITY_LABEL_FALLBACK) };
  }
  const names = b.guarantee.pityNames || [];
  if (xmlSafe && names.some((n) => /[&<>]/.test(n))) {
    return { display: pity, number: pity, validComment: 1,
      comment: `<important>${names.map(xmlEsc).join(' &amp; ')}</important> guaranteed in <important>%d tries</important>!` };
  }
  return { display: pity, number: pity, validComment: 0 };
}

// J della striscia (I-153) come la manderebbe il server, con il pool alla data del banner (gd.asOf: i limitati al loro
// inizio, i PERMANENT alla fine, il caso peggiore: il pool cresce col tempo) e gli stessi warrantFields/warrantStripBytes
// di gacha.js; 0 senza nameOf (nomi della tabella medal) o senza pity a lista (pityGift: un id solo)
const WORST_DAY = '2099-12-31';
function stripBytesOf(b, catalog, nameOf) {
  const g = b.guarantee || {};
  if (!nameOf || !g.pity || g.pityGift) return 0;
  let ex;
  try {
    ex = b.catalogOnly === 'INCOMPLETE' || !(b.rarityMix || []).length ? undefined : gd.expandPool(b, catalog, gd.asOf(b, WORST_DAY));
  } catch { ex = undefined; }
  const w = gacha.warrantFields(b, ex, { sinceFeatured: 0 }, catalog, nameOf);
  return gacha.warrantStripBytes(w.warrantMedalIds, nameOf);
}

// nameOf (Map medalId -> nome della tabella medal) attiva il controllo I-153; senza (prove sintetiche) come prima
function masterRows(catalog, xmlSafe = WARRANT_XML_SAFE, nameOf = null) {
  return [gacha.catalogRow(), ...catalog.banners.map((b, i) => {
    const bytes = stripBytesOf(b, catalog, nameOf), warrant = warrantOf(b, xmlSafe, bytes);
    if (bytes > gacha.WARRANT_LIST_MAX && !b.guarantee.pityLabel) {
      console.log(`  ${b.rowId} ${b.name}: striscia della pity di ${bytes} byte senza pity_label in banner_overrides.tsv: «${PITY_LABEL_FALLBACK}»`);
    }
    return gd.drawMedalTypeRow({
      drawMedalTypeId: b.drawMedalTypeId, name: b.name, payType: [1, 4, 5, 6, 7, 8].includes(b.payType) ? b.payType : 1,
      price: Math.max(1, (b.prices || [])[0] || 1), sortId: 10 + i,
      bannerUrl: `/web/gacha/img/${b.drawMedalTypeId}.png`, detailUrl: `/web/gacha/detail/${b.drawMedalTypeId}`, comment: warrant.comment || commentOf(b), warrant,
    });
  })];
}

function main() {
  const file = path.join(GAME, 'gacha_catalog.json');
  const catalog = gd.loadCatalog(file);
  if (!catalog.banners.length) {
    console.error(`${file}: nessun banner, lanciare prima recon/tools/make_banner_catalog.py`);
    process.exit(1);
  }
  // nomi della tabella medal del master (quella che il client legge per la striscia), per il limite di I-153
  const medal = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
  const nameOf = new Map(medal.map((r) => [r.medalId, r.name]));
  const rows = masterRows(catalog, WARRANT_XML_SAFE, nameOf);
  fs.writeFileSync(path.join(MASTER, 'drawMedalType.json'), JSON.stringify(rows));
  const cat = catalog.banners.filter((b) => rows.find((r) => r.drawMedalTypeId === b.drawMedalTypeId)?.comment.startsWith('A <important>'));
  console.log(`drawMedalType.json: ${rows.length} righe (piastra Catalog + ${catalog.banners.length} banner)`);
  console.log(`striscia di categoria (I-153, oltre ${gacha.WARRANT_LIST_MAX} byte): ${cat.length} banner ${cat.map((b) => b.rowId).join(',')}`);
  console.log('poi alzare KHUX_REVISION (drawMedalType)');
}

if (require.main === module) main();
module.exports = { commentOf, masterRows, warrantOf, stripBytesOf, categoryComment, WARRANT_XML_SAFE };
