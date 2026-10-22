#!/usr/bin/env node
// Righe master per il Burst (GuiltBurst, vedi guilt-burst.js e docs/notes/battaglia.md#burst).
// Si applica da sola (idempotente) a server/master_data, ed e' chiamata in fondo a
// make-game-tables.js, che riscrive medal.json e burst.json.
//
// - medal 2: la «medaglia» del Burst. Il client ne legge la riga (STR e DEF); senza riga
//   l'attacco non si prepara. Le nostre tabelle hanno solo la 1 (slot vuoto). burstId 11 =
//   la riga burst «11:ギルトボム» (Guilt Bomb, tutti i nemici, attributo 5) della 5.0.1.
//   STR/DEF segnaposto (KHUX_GUILT_BURST_STR, default 5000).
// - burst 11: animazioni lwf/burst/motion/abl_00011 ed effetto eff_00011 assenti dalle risorse:
//   se mancano si usano quelle di Thundaga (10145 / 110145, tutti i nemici). Base intatta in
//   burst_base.json.
// - shuffleskill 901 e 902: le legge senza controllo del null (crash all'avvio
// della battaglia se mancano) e ne usa enemyKind/enemyKindRate come bonus contro
//   un tipo di nemico: valori originali ignoti, 0 = nessun bonus.
//
//   node server/make-guilt-burst.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

function patch(dir) {
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  const write = (n, rows) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
  const zero = (v) => (Array.isArray(v) ? v.map(zero) : typeof v === 'string' ? '' : 0);
  const out = [];

  const medals = read('medal');
  if (!medals.some((m) => m.medalId === 2)) {
    const base = medals.find((m) => m.medalId === 1) || medals[0];
    const str = Number(process.env.KHUX_GUILT_BURST_STR || 5000);
    medals.push(Object.assign({}, base, {
      medalId: 2, name: 'Burst', flavor: 'Burst', advantage: 'Burst', validPack: 0, attribute: 4,
      guiltValue: 0, addGuiltBurstLv: 0, addGuiltBurstLvMax: 0, cost: 0, minCost: 0, maxLv: 1,
      attack: str, maxAttack: str, addMaxAttack: 0, defense: str, maxDefense: str, addMaxDefense: 0,
      validBurst: 1, burstId: 11, validSuperBurst: 0, superBurstId: 0, validEvolve: 0, evolveId: 0,
    }));
    write('medal', medals);
    out.push('medal 2');
  }

  const bursts = read('burst');
  const b11 = bursts.find((b) => b.burstId === 11);
  const namesPath = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
  const names = fs.existsSync(namesPath) ? fs.readFileSync(namesPath, 'utf8') : '';
  const has = (p) => names.includes(p + '\t') || names.includes(p + '\n');
  const pad = (n) => String(n).padStart(5, '0');
  const served = (b) => has(`lwf/burst/motion/abl_${pad(b.motionId)}/abl_${pad(b.motionId)}.lwf`)
    && has(`lwf/burst/effect/eff_${pad(b.effectId % 100000)}/eff_${pad(b.effectId % 100000)}.lwf`);
  if (!b11) {
    const tpl = bursts.find((b) => b.burstId === 10141) || bursts[0];
    bursts.push(Object.assign({}, tpl, { burstId: 11, name: 'Burst', description: 'Burst', gauge: 0, attribute: 5 }));
    write('burst', bursts);
    out.push('burst 11 (da 10141)');
  } else if (names && !served(b11)) {
    Object.assign(b11, { motionId: 10145, effectId: 110145 });
    write('burst', bursts);
    out.push('burst 11 -> animazioni 10145');
  }

  const shuffle = read('shuffleskill');
  let added = 0;
  // 901 = nemici di terra, 902 = nemici in aria (enemyKind 1/2 come i trait), bonus 0;
  // category = icona Kakusei_Icon0060/0061, come i trait omologhi (0 = icona inesistente)
  for (const [id, kind] of [[901, 1], [902, 2]]) {
    if (shuffle.some((s) => s.shuffleSkillId === id)) continue;
    const row = Object.fromEntries(Object.entries(shuffle[0]).map(([k, v]) => [k, zero(v)]));
    shuffle.push(Object.assign(row, {
      shuffleSkillId: id, category: 59 + kind, type: 1, name: 'Burst', sortId: id, enemyKind: kind, enemyKindRate: 0,
    }));
    added++;
  }
  if (added) { write('shuffleskill', shuffle); out.push('shuffleskill 901/902'); }
  return out;
}

if (require.main === module) {
  const dir = process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
  const done = patch(dir);
  console.log(done.length ? `burst (guilt): ${done.join(', ')} (alzare KHUX_REVISION)` : 'burst (guilt): righe gia\' presenti');
}

module.exports = { patch };
