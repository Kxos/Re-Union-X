#!/usr/bin/env node
// Genera server/master_data/shop.json: solo le righe del pass VIP che il client cerca quando si tocca il lucchetto
// di una VIP Draw (I-134). Il tap legge misc 722/723 su Android (720/721 e 724/725 per le altre piattaforme:
// 103/1103, 203/1203, 303/1303), prende la riga Shop della prima se status != 0, altrimenti della seconda, senza
// controllare che esista (crash con shop.json vuoto); poi chiede il productId a Google Play. Con un productId che
// Google non conosce la richiesta fallisce e non succede niente (analisi del client 26-10, nota privata
// D:\Progetto_Restauro_KH_UX\tmp\vip\padlock_notes.md).
// os 0 e display 0: fuori dalla lista dei Jewel in vendita (che prende solo os 2 e display 1) e dalle richieste a
// Google della lista; benefitId 100 = il benefit del pass nei misc 505 del client (vip-benefit.VIP_BENEFIT_ID).
//
//   node server/make-shop-rows.js   (poi alzare KHUX_REVISION)
'use strict';
const fs = require('fs');
const path = require('path');
const { VIP_BENEFIT_ID } = require('./vip-benefit');

const OUT = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json'), 'utf8'));

const PASS_SHOP_IDS = [103, 1103, 203, 1203, 303, 1303];
const PRODUCT_ID = 'reunionx.vip.weekly.na'; // non esiste su Google Play: la richiesta del client fallisce

function blank() {
  const row = {};
  for (const [f, t] of schema.shop) row[f] = t.startsWith('string') ? '' : 0;
  return row;
}
const shopRows = () => PASS_SHOP_IDS.map((shopId) => ({ ...blank(), shopId, productId: PRODUCT_ID, benefitId: VIP_BENEFIT_ID, status: 1, os: 0, display: 0 }));

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = shopRows();
  fs.writeFileSync(path.join(OUT, 'shop.json'), JSON.stringify(rows));
  console.log(`shop.json: ${rows.length} righe del pass VIP (${PASS_SHOP_IDS.join(', ')}); poi alzare KHUX_REVISION`);
}
module.exports = { shopRows, PASS_SHOP_IDS, PRODUCT_ID };
