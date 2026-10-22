#!/usr/bin/env node
// Tabella loginBonus (I-176): tolta dal master 5.0.1, il client 4.3.1 la legge ancora
// (schermata del login bonus). Fonte: master loginBonus di un'installazione 1.1.3 (cartella di riferimento locale),
// decodificato in reference\login_bonus\loginBonus_1.1.3_decoded.json (fuori dal repo: dati Square Enix).
// - Daily (bonusType 1, id 100-104): le 5 righe, una per pannello (il layout ha 5 Area_Cont: ne servono 5 esatte);
//   jewel 100/100/200/200/300 come dalla v2.3.1 (notice 32990, screenshot 2020-21), la 1.1.3 aveva 50/50/100/100/200
//   (scelta dell'utente 20-10);
// - Total (bonusType 2, id 200-292): i 93 traguardi della 1.1.3 fino al giorno 1850 (jewel o titoli 14001-14047),
//   invariati negli screenshot 2020-21;
// - Speciali (bonusType 3/4, campagne con date): non servite, arrivano con gli eventi (decisione dell'utente 20-10).
// Idempotente; in fondo a make-game-tables.js. Dopo: alzare la revisione.
//
//   node server/make-login-bonus.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'reference', 'login_bonus', 'loginBonus_1.1.3_decoded.json');
const DAILY_JEWELS = [100, 100, 200, 200, 300];
const FIELDS = ['loginBonusId', 'bonusType', 'title', 'description', 'comment', 'day', 'startDate', 'endDate',
  'rewardType', 'rewardId', 'rewardAssignSkillType', 'rewardAssignSkillId', 'rewardAssignSkillLv', 'rewardNum'];

function rows(src) {
  const pick = (r) => Object.fromEntries(FIELDS.map((k) => [k, r[k]]));
  const daily = src.filter((r) => r.bonusType === 1).sort((a, b) => a.day - b.day).map(pick);
  if (daily.length !== DAILY_JEWELS.length) throw new Error(`righe Daily: ${daily.length}, ne servono ${DAILY_JEWELS.length}`);
  daily.forEach((r, i) => { r.rewardType = 2; r.rewardNum = DAILY_JEWELS[i]; });
  const total = src.filter((r) => r.bonusType === 2).sort((a, b) => a.day - b.day).map(pick);
  return [...daily, ...total];
}

function patch(masterDir, src = SRC) {
  if (!fs.existsSync(src)) { console.log(`make-login-bonus: ${src} assente, loginBonus invariata`); return null; }
  const out = rows(JSON.parse(fs.readFileSync(src, 'utf8')));
  const file = path.join(masterDir, 'loginBonus.json');
  const after = JSON.stringify(out);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== after) fs.writeFileSync(file, after);
  console.log(`make-login-bonus: ${out.length} righe (${out.filter((r) => r.bonusType === 1).length} Daily, ${out.filter((r) => r.bonusType === 2).length} Total)`);
  return out;
}

module.exports = { DAILY_JEWELS, rows, patch };

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));
