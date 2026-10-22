#!/usr/bin/env node
// Livelli Lux 302-999 (richiesta dell'utente 19-10): la tabella player originale che abbiamo (thethiny) ha 301 righe,
// del periodo col livello massimo 300; il massimo e' salito a 500 (29-03-2018, notice 38914), 800, 850 (20-09-2019,
// 58013), 900 (05-03-2020, 63810) e 999 (14-01-2021, 73077). Il client legge le righe lv e lv+1 e misc
// 100 (livello massimo): senza la riga lv+1 va in crash, quindi servono tutte le righe fino a 999.
// Lux per livello (needExp[L] - needExp[L-1]):
// - 302-304 esatti dal wiki giapponese (wikiwiki.jp/khux/ステータス; il 301 coincide al Lux con thethiny);
// - poi i punti misurati nei video del 2018-2021 (D:\Progetto_Restauro_KH_UX\tmp\luxlevel\verify\datapoints.csv:
//   «LV Up in» / (1 - barra)), interpolati in modo geometrico fra un punto e il successivo; i salti dei blocchi
//   nuovi al primo livello del blocco (801, 851);
// - 878-900: la crescita misurata fra 858 e 876; 901-999 (nessun dato): +0,8% a livello, la crescita del blocco
//   801-850. RICOSTRUITO: dichiarato nelle Notices.
// AP 160, costo 440, HP 3530 e luxMedal 55 come la riga 301 (khuxwiki Stats: AP massimo 198 = 160 + Avatar Board;
// wiki JP: «アバターコイン x55» per livello dal 301). needExp oltre 2^53 resta intero (JSON senza esponente fino a
// 1e21); il client lo legge a 64 bit. Idempotente; in fondo a make-game-tables.js. Dopo: alzare la revisione.
//
//   node server/make-lux-levels.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LV = 999;
// [livello raggiunto, Lux per arrivarci dal livello prima]: esatti (302-304) e stime dai video (lv del video + 1)
const ANCHORS = [
  [302, 521557110], [303, 535117590], [304, 549030555],
  [320, 850e6], [342, 1.45e9], [426, 14.7e9], [482, 112e9], [494, 165e9],
  [559, 324e9], [569, 325e9], [588, 382e9], [736, 926e9], [739, 936e9], [741, 948e9], [748, 998e9], [795, 1.32e12],
  [800, 1.32e12 * 1.01 ** 5], // fine del blocco 501-800 (+1% a livello, come 748-795)
  [801, 16.9e12 / 1.0079 ** 8], [809, 16.9e12], [817, 18.2e12], [820, 18.7e12], [823, 19.2e12], [836, 21.2e12],
  [851, 23.5e12], [859, 42e12], [877, 80e12],
];
const GROWTH_877_900 = (80e12 / 42e12) ** (1 / 18); // 858 -> 876
const GROWTH_901_999 = 1.008;

function steps() {
  const out = new Map();
  for (let i = 0; i + 1 < ANCHORS.length; i++) {
    const [a, va] = ANCHORS[i], [b, vb] = ANCHORS[i + 1];
    for (let lv = a; lv < b; lv++) out.set(lv, va * (vb / va) ** ((lv - a) / (b - a)));
  }
  const [last, vlast] = ANCHORS[ANCHORS.length - 1];
  for (let lv = last; lv <= 900; lv++) out.set(lv, vlast * GROWTH_877_900 ** (lv - last));
  for (let lv = 901; lv <= MAX_LV + 1; lv++) out.set(lv, out.get(900) * GROWTH_901_999 ** (lv - 900));
  return out;
}

function rows(base) {
  const r301 = base.find((r) => r.lv === 301);
  if (!r301) throw new Error('player: riga 301 assente (tabella originale)');
  const st = steps();
  const out = [];
  let need = r301.needExp;
  // una riga oltre il massimo: il client la legge anche al livello massimo (banco 19-10: crash al 999 senza la
  // riga 1000); il server non la raggiunge mai (luxRankFor si ferma a misc 100)
  for (let lv = 302; lv <= MAX_LV + 1; lv++) {
    need += Math.round(st.get(lv));
    out.push({ ...r301, lv, needExp: need, luxMedal: 55, rewardId: 0 });
  }
  return out;
}

function patch(masterDir) {
  const file = path.join(masterDir, 'player.json');
  const base = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r.lv <= 301);
  const all = [...base, ...rows(base)];
  const before = fs.readFileSync(file, 'utf8'), after = JSON.stringify(all);
  if (before !== after) fs.writeFileSync(file, after);
  const miscFile = path.join(masterDir, 'misc.json');
  const misc = JSON.parse(fs.readFileSync(miscFile, 'utf8'));
  const m = misc.find((r) => r.miscId === 100);
  let miscChanged = false;
  if (m && m.value !== MAX_LV) { m.value = MAX_LV; miscChanged = true; }
  if (!m) { misc.push({ miscId: 100, value: MAX_LV }); miscChanged = true; }
  if (miscChanged) fs.writeFileSync(miscFile, JSON.stringify(misc));
  console.log(`lux: righe player fino a ${MAX_LV} (needExp 999 = ${all.find((r) => r.lv === MAX_LV).needExp}, piu' la riga ${MAX_LV + 1}), misc 100 = ${MAX_LV}` +
    `${before !== after || miscChanged ? '' : ' (invariato)'}`);
}

module.exports = { MAX_LV, ANCHORS, steps, rows, patch };

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));
