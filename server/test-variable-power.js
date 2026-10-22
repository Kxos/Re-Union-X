// Prova degli speciali a danno variabile (variable-power.js, I-189):
//   node server/test-variable-power.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { variablePower, patch, TYPE_OF_CONDITION } = require('./variable-power');
const { NOTICES } = require('./routes-info-album');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const clone = (x) => JSON.parse(JSON.stringify(x));

// Cloud II EX 7★ (Roboloid 999, burst 3000999): LowMulti 7.12, HighMulti 8.64, HigherHP; riga come la lascia burstPowerFix
// (passi della khuxwiki: x6.90 senza pallini, x7.12 a 5 pallini)
const cloudRobo = { ID: 999, LowMulti: 7.12, HighMulti: 8.64, Ability: { Condition: 'HigherHP' } };
const cloud = { burstId: 3000999, name: 'Omnislash +6', damageType: 1, maxEnhanceCount: 5,
  basePower: 69000, basePowerPerEnforce: [69440, 69880, 70320, 70760, 71200],
  displayPower: 69000, displayPowerPerEnforce: [69440, 69880, 70320, 70760, 71200],
  displayMaxPower: 0, displayMaxPowerPerEnforce: [0, 0, 0, 0, 0], specialPowerType: 1, sp1: 0, sp2: 0,
  sp1PerEnforce: [0, 0, 0, 0, 0], sp2PerEnforce: [0, 0, 0, 0, 0] };
// condizione senza tipo noto: resta tipo 1
const oneRobo = { ID: 500, LowMulti: 5.0, HighMulti: 9.0, Ability: { Condition: 'Mystery' } };
const one = { ...clone(cloud), burstId: 3000500, maxEnhanceCount: 0, basePower: 50000, displayPower: 50000,
  basePowerPerEnforce: [1, 1, 1, 1, 1], displayPowerPerEnforce: [1, 1, 1, 1, 1] };
// Poison (tipo 20, verificato sulle 6 righe originali: displayMax = base + sp1, sp2 0)
const poiRobo = { ID: 501, LowMulti: 2.0, HighMulti: 3.5, Ability: { Condition: 'Poison' } };
const poi = { ...clone(cloud), burstId: 3000501, maxEnhanceCount: 2, basePower: 19000, displayPower: 19000,
  basePowerPerEnforce: [19500, 20000, 1, 1, 1], displayPowerPerEnforce: [19500, 20000, 1, 1, 1] };
// riga originale di thethiny tipo 4 (10183, 1 pallino) in una riga del master con 3 pallini
const orig = { burstId: 10183, damageType: 1, maxEnhanceCount: 1, basePower: 13400, basePowerPerEnforce: [13600, 1, 1, 1, 1],
  displayPower: 15461, displayPowerPerEnforce: [15692, 1, 1, 1, 1], specialPowerType: 4, sp1: 11538, sp2: 10000,
  sp1PerEnforce: [11538, 0, 0, 0, 0], sp2PerEnforce: [10000, 0, 0, 0, 0], displayMaxPower: 28861,
  displayMaxPowerPerEnforce: [29292, 0, 0, 0, 0] };
const mo = { ...clone(cloud), burstId: 10183, maxEnhanceCount: 3, basePower: 13400, displayPower: 15461,
  basePowerPerEnforce: [13600, 13800, 14000, 1, 1], displayPowerPerEnforce: [15692, 15923, 16154, 1, 1] };
// danno fisso: non si tocca
const fixed = { ...clone(cloud), burstId: 3000502, damageType: 2 };
const fixRobo = { ID: 502, LowMulti: 1, HighMulti: 2, Ability: { Condition: 'HigherHP' } };

check(TYPE_OF_CONDITION.HigherHP === 4 && TYPE_OF_CONDITION.LowerHP === 3 && !('Mystery' in TYPE_OF_CONDITION), 'mappa delle condizioni');
// I-189b: mappa completa dal codice di battaglia (medaglie.md#danno-variabile-tipi)
const MAP = { DrainsHP: 5, MoreTurns: 6, SPSuccession: 7, DrainsDEF: 16, Paralysis: 22, GaugesFull: 23, GaugesUsed: 25,
  MoreGaugesPrevMedal: 26, MoreEnemiesDefeated: 28, LessLUX: 31, OneEnemy: 36, MoreSkillsStage: 37, Slot3: 38, Slot4: 38,
  Slot5: 38, Slot6: 38, LowerSlot: 39, HigherSlot: 40, MoreParty: 41 };
for (const [k, t] of Object.entries(MAP)) check(TYPE_OF_CONDITION[k] === t, `mappa: ${k} -> ${TYPE_OF_CONDITION[k]} invece di ${t}`);
check(!('Critical' in TYPE_OF_CONDITION), 'Critical non ha un tipo');

const bursts = [cloud, one, poi, mo, fixed].map(clone);
const robo = new Map([cloudRobo, oneRobo, poiRobo, fixRobo].map((d) => [d.ID, d]));
const st = variablePower(bursts, { origBursts: new Map([[10183, orig]]), robo, medals: [] });
const c = bursts[0];
check(c.specialPowerType === 4 && c.sp2 === 10000, `Cloud II EX tipo 4: ${c.specialPowerType}/${c.sp2}`);
check(c.displayPowerPerEnforce[4] === 71200 && c.displayMaxPowerPerEnforce[4] === 86400, `Cloud a 5 pallini x7.12 - 8.64: ${c.displayPowerPerEnforce[4]} - ${c.displayMaxPowerPerEnforce[4]}`);
check(c.displayPower === 69000 && Math.abs(c.displayMaxPower - 83730) <= 2, `Cloud a 0 pallini ~x6.90 - 8.37: ${c.displayPower} - ${c.displayMaxPower}`);
// formula degli originali tipo 3/4: display = base*sp1/1e4, max = base*(sp1+sp2)/1e4; base intera: scarto fino a sp1/2e4
// (2.3 con sp1 46842), il display resta il valore esatto del video
const tol = c.sp1 / 2e4 + 0.5;
check(Math.abs(c.basePower * c.sp1 / 1e4 - c.displayPower) <= tol && c.displayMaxPower === c.displayPower + c.basePower, 'Cloud: formula tipo 4 a 0 pallini');
check(c.basePowerPerEnforce.every((bp, i) => Math.abs(bp * c.sp1PerEnforce[i] / 1e4 - c.displayPowerPerEnforce[i]) <= tol), 'Cloud: formula tipo 4 per pallino');
check(JSON.stringify(c.sp1PerEnforce) === JSON.stringify(Array(5).fill(c.sp1)) && JSON.stringify(c.sp2PerEnforce) === JSON.stringify(Array(5).fill(10000)), 'Cloud: sp per pallino');

const o = bursts[3];
check(o.specialPowerType === 4 && o.sp1 === 11538 && o.sp2 === 10000 && o.displayMaxPower === 28861, 'thethiny: tipo, sp1, sp2, max verbatim');
check(JSON.stringify(o.displayMaxPowerPerEnforce) === JSON.stringify([29292, 29723, 30154, 0, 0]), `thethiny: max per pallino esteso: ${o.displayMaxPowerPerEnforce}`);
check(JSON.stringify(o.sp1PerEnforce) === JSON.stringify([11538, 11538, 11538, 0, 0]) && JSON.stringify(o.sp2PerEnforce) === JSON.stringify([10000, 10000, 10000, 0, 0]), `thethiny: sp per pallino estesi: ${o.sp1PerEnforce}`);

const p = bursts[2];
check(p.specialPowerType === 20 && p.sp1 === 15000 && p.sp2 === 0 && p.basePower === 19000 && p.displayMaxPower === 34000 &&
  JSON.stringify(p.displayMaxPowerPerEnforce) === JSON.stringify([34500, 35000, 0, 0, 0]), `Poison tipo 20: ${p.specialPowerType} ${p.sp1} ${p.displayMaxPowerPerEnforce}`);

check(bursts[1].specialPowerType === 1 && bursts[1].displayMaxPower === 0, 'condizione ignota resta tipo 1');
check(st.unmapped.Mystery === 1 && st.unmappedRows.some((r) => r.burstId === 3000500 && r.condition === 'Mystery'), `condizione ignota nel resoconto: ${JSON.stringify(st.unmapped)}`);
check(bursts[4].specialPowerType === 1 && bursts[4].displayMaxPower === 0, 'danno fisso invariato');
check(st.orig === 1 && st.ratio === 1 && st.additive === 1, `conteggi: ${JSON.stringify(st)}`);

// idempotenza in memoria
const again = clone(bursts);
variablePower(again, { origBursts: new Map([[10183, orig]]), robo, medals: [] });
check(JSON.stringify(again) === JSON.stringify(bursts), 'due volte = una volta');

// ---- I-189b: tutti i tipi (medaglie.md#danno-variabile-tipi) ----
// riga del master come la lascia burstPowerFix: display per pallino, base = display, tipo 1
const row = (burstId, want, disp0, perDot) => ({ ...clone(cloud), burstId, maxEnhanceCount: want, basePower: disp0, displayPower: disp0,
  basePowerPerEnforce: [0, 1, 2, 3, 4].map((i) => (i < want ? perDot[i] : 1)),
  displayPowerPerEnforce: [0, 1, 2, 3, 4].map((i) => (i < want ? perDot[i] : 1)) });
const rb = (ID, lo, hi, Condition, extra) => ({ ID, LowMulti: lo, HighMulti: hi, Ability: { Name: 'X', Condition, Text: '', ...(extra || {}) } });
const steps = (p0, last, want) => [...Array(want)].map((_, i) => Math.round(p0 + (last - p0) * (i + 1) / want));
const nb = [
  row(3001131, 5, 26100, [26900, 27700, 28500, 29300, 30100]),   // Final Boss Xion Dark Horizon +5 (6★)
  row(3001223, 5, 25900, [26700, 27500, 28300, 29100, 29900]),   // HD Larxene Explosive Thunder +5 (6★)
  row(3000600, 3, 30000, steps(30000, 31600, 3)),                // OneEnemy (tipo 36, flag)
  row(3000601, 2, 40000, steps(40000, 41000, 2)),                // Slot4 (tipo 38)
  row(3001151, 3, 14800, [15000, 15200, 15400]),                 // Illusory Feat +4 (Critical)
  row(3000602, 5, 20000, steps(20000, 23400, 5)),                // DrainsHP (tipo 5)
  row(3000384, 2, 72500, [72900, 73300]),                        // Cyclone Sword +6 (DrainsDEF, /6)
  row(3000552, 2, 30000, [30400, 30800]),                        // Blitz +5 (DrainsDEF, /3)
  row(3000716, 2, 23000, [23400, 23800]),                        // Gale Assault +4 (LessLUX, tipo 31)
  row(3000806, 2, 22200, [22600, 23000]),                        // Glacial Arrows +4 (next Medal, tipo 27)
  row(3000800, 2, 22200, [22600, 23000]),                        // Wind Dash +4 (previous Medal, tipo 26)
];
const nr = new Map([
  rb(1131, 3.01, 4.25, 'GaugesFull'), rb(1223, 2.99, 4.86, 'GaugesUsed'), rb(600, 3.16, 4.5, 'OneEnemy'), rb(601, 4.1, 5.2, 'Slot4'),
  { ...rb(1151, 1.54, 3.85, 'Critical'), Ability: { Name: 'Illusory Feat +4', Condition: 'Critical', SelfBuffs: { CriticalChance: 50 } } },
  rb(602, 2.34, 2.74, 'DrainsHP'), rb(384, 7.33, 8.05, 'DrainsDEF', { Name: 'Cyclone Sword +6' }),
  rb(552, 3.08, 3.8, 'DrainsDEF', { Name: 'Blitz +5' }), rb(716, 2.38, 2.7, 'LessLUX'),
  rb(806, 2.3, 3.84, 'MoreGaugesPrevMedal', { Text: 'Deals 2 hits. Inflicts more damage the more gauges required for the next Medal.' }),
  rb(800, 2.3, 3.84, 'MoreGaugesPrevMedal', { Text: 'Deals 4 hits. Inflicts more damage the more gauges required for the previous Medal.' }),
].map((d) => [d.ID, d]));
const nst = variablePower(nb, { origBursts: new Map(), robo: nr, medals: [] });
const [xion, larx, oneE, slot4, crit, drHP, cyc, blitz, gale, next, prev] = nb;
check(xion.specialPowerType === 23 && xion.sp1 === 14016 && xion.sp2 === 100000 && xion.basePowerPerEnforce[4] === 28826 &&
  xion.displayPowerPerEnforce[4] === 30100 && xion.displayMaxPowerPerEnforce[4] === 42500,
  `Final Boss Xion tipo 23: ${xion.specialPowerType} ${xion.sp1} ${xion.sp2} ${xion.basePowerPerEnforce[4]} ${xion.displayPowerPerEnforce[4]} ${xion.displayMaxPowerPerEnforce[4]}`);
check(larx.specialPowerType === 25 && larx.sp1 === 19168 && larx.sp2 === 100000 && larx.basePowerPerEnforce[4] === 29900 &&
  larx.displayPowerPerEnforce[4] === 29900 && larx.displayMaxPowerPerEnforce[4] === 48600,
  `HD Larxene tipo 25: ${larx.specialPowerType} ${larx.sp1} ${larx.sp2} ${larx.basePowerPerEnforce[4]} ${larx.displayMaxPowerPerEnforce[4]}`);
check(oneE.specialPowerType === 36 && oneE.sp1 === 13400 && oneE.sp2 === 0 && oneE.basePowerPerEnforce[2] === 31600 && oneE.displayMaxPowerPerEnforce[2] === 45000,
  `OneEnemy tipo 36 (flag): ${oneE.specialPowerType} ${oneE.sp1} ${oneE.sp2} ${oneE.displayMaxPowerPerEnforce}`);
check(slot4.specialPowerType === 38 && slot4.sp2 === 30000 && slot4.sp1 === 11000 && JSON.stringify(slot4.sp2PerEnforce) === JSON.stringify([30000, 30000, 0, 0, 0]),
  `Slot4 tipo 38, sp2 30000: ${slot4.specialPowerType} ${slot4.sp1} ${slot4.sp2} ${slot4.sp2PerEnforce}`);
check(crit.specialPowerType === 1 && crit.criticalPower === 25000 && crit.critical === cloud.critical && crit.displayMaxPower === 0,
  `Critical: tipo 1, criticalPower hi/lo: ${crit.specialPowerType} ${crit.criticalPower} ${crit.critical}`);
check(drHP.specialPowerType === 5 && drHP.sp1 === 9000 && drHP.sp2 === 4000 && drHP.basePowerPerEnforce[4] === 23400 && drHP.displayMaxPowerPerEnforce[4] === 27400,
  `DrainsHP tipo 5: ${drHP.specialPowerType} ${drHP.sp1} ${drHP.sp2} ${drHP.displayMaxPowerPerEnforce}`);
check(cyc.specialPowerType === 16 && cyc.sp1 === 1200 && cyc.sp2 === 30000 && blitz.specialPowerType === 16 && blitz.sp1 === 2400 && blitz.sp2 === 30000,
  `DrainsDEF tipo 16 (/6 Cyclone Sword, /3 Blitz): ${cyc.sp1} ${blitz.sp1}`);
check(gale.specialPowerType === 31 && gale.basePowerPerEnforce[1] === 27000 && gale.sp1 === 3200 && gale.sp2 === 100000000 && gale.displayMaxPowerPerEnforce[1] === 27000,
  `LessLUX tipo 31 (base = massimo): ${gale.specialPowerType} ${gale.basePowerPerEnforce} ${gale.sp1} ${gale.sp2}`);
check(next.specialPowerType === 27 && prev.specialPowerType === 26 && next.sp2 === 70000 && prev.sp2 === 70000,
  `gauge della medaglia successiva 27 / precedente 26: ${next.specialPowerType} ${prev.specialPowerType}`);
// display/max a ogni pallino: ai pallini pieni Low/High di Roboloid, divario hi - lo uguale a ogni pallino
for (const b of nb) {
  if (b.specialPowerType <= 2) continue;
  const d = nr.get(b.burstId - 3000000), lo = Math.round(d.LowMulti * 1e4), hi = Math.round(d.HighMulti * 1e4), n = b.maxEnhanceCount;
  check(b.displayPowerPerEnforce[n - 1] === lo && b.displayMaxPowerPerEnforce[n - 1] === hi,
    `${b.burstId}: pallini pieni ${b.displayPowerPerEnforce[n - 1]} - ${b.displayMaxPowerPerEnforce[n - 1]} invece di ${lo} - ${hi}`);
  check(b.displayMaxPower - b.displayPower === hi - lo &&
    [...Array(n).keys()].every((i) => b.displayMaxPowerPerEnforce[i] - b.displayPowerPerEnforce[i] === hi - lo), `${b.burstId}: divario costante`);
}
check(nst.critical === 1 && nst.byType[23] === 1 && nst.byType[36] === 1 && nst.byType[38] === 1, `conteggi I-189b: ${JSON.stringify(nst.byType)} critical ${nst.critical}`);
check(nst.curveReconstructed && nst.curveReconstructed[26] === 1 && nst.curveReconstructed[27] === 1 && nst.curveReconstructed[31] === 1,
  `curve ricostruite: ${JSON.stringify(nst.curveReconstructed)}`);
const nAgain = clone(nb);
variablePower(nAgain, { origBursts: new Map(), robo: nr, medals: [] });
check(JSON.stringify(nAgain) === JSON.stringify(nb), 'I-189b: due volte = una volta');

// la ricostruzione dei tipi a saturazione riproduce gli originali di thethiny (come tmp\i189b\scr\rebuild.js): riga del
// master con i display dell'originale, Low/High = display/displayMax ai pallini pieni; sp1 e base a 0 pallini entro 15.
// I 14 non riprodotti sono copie guaste di thethiny (Dark End, Radiant Glory, Gale Assault +4/+5)
const ORIG_FILE = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
if (fs.existsSync(ORIG_FILE)) {
  const COND = { 6: ['MoreTurns'], 7: ['SPSuccession'], 23: ['GaugesFull'], 25: ['GaugesUsed'], 27: ['MoreGaugesPrevMedal', 'next Medal'],
    28: ['MoreEnemiesDefeated'], 40: ['HigherSlot'] };
  const SP2 = { 6: 50000, 7: 60000, 23: 100000, 25: 100000, 27: 70000, 28: 500000, 40: 50000 };
  let ok = 0, tot = 0;
  for (const o of JSON.parse(fs.readFileSync(ORIG_FILE, 'utf8'))) {
    if (!COND[o.specialPowerType] || o.sp2 !== SP2[o.specialPowerType]) continue;
    tot++;
    const n = o.maxEnhanceCount;
    const disp = (i) => (i < 0 ? o.displayPower : o.displayPowerPerEnforce[i]);
    const dmax = (i) => (i < 0 ? o.displayMaxPower : o.displayMaxPowerPerEnforce[i]);
    const m = row(3100000 + tot, n, o.displayPower, [...Array(n).keys()].map(disp));
    const [cond, text] = COND[o.specialPowerType];
    const r = rb(100000 + tot, disp(n - 1) / 1e4, dmax(n - 1) / 1e4, cond, { Text: text || '' });
    variablePower([m], { origBursts: new Map(), robo: new Map([[r.ID, r]]), medals: [] });
    if (m.specialPowerType === o.specialPowerType && Math.abs(m.sp1 - o.sp1) <= 15 && Math.abs(m.basePower - o.basePower) <= 15) ok++;
  }
  check(tot === 56 && ok >= 42, `originali a saturazione riprodotti: ${ok} su ${tot}`);
}

// idempotenza sul master vero (copia), se c'e'
const MASTER = path.join(__dirname, 'master_data', 'burst.json');
const ROBO_DB = process.env.KHUX_ROBOLOID_DB || 'D:\\Progetto_Restauro_KH_UX\\external\\roboloid\\medal_db.json';
const ORIG = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
if (fs.existsSync(MASTER) && fs.existsSync(ROBO_DB) && fs.existsSync(ORIG)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varpow-'));
  fs.copyFileSync(MASTER, path.join(dir, 'burst.json'));
  const s1 = patch(dir);
  const first = fs.readFileSync(path.join(dir, 'burst.json'), 'utf8');
  patch(dir);
  check(first === fs.readFileSync(path.join(dir, 'burst.json'), 'utf8'), 'patch sul master: idempotente');
  const rows = JSON.parse(first);
  const cl = rows.find((r) => r.burstId === 3000999);
  check(cl && cl.specialPowerType === 4 && cl.displayMaxPowerPerEnforce[4] === 86400, 'master: Cloud II EX tipo 4, max x8.64');
  check(rows.every((r) => !(r.specialPowerType > 2) || r.displayMaxPower > r.displayPower), 'master: ogni riga variabile ha il massimo sopra il minimo');
  check(s1.orig >= 60 && s1.ratio > 0, `master: conteggi ${JSON.stringify({ orig: s1.orig, ratio: s1.ratio, additive: s1.additive })}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// catena medal-power-fix (burstPowerFix + variablePower) due volte su una copia del master: stesso risultato
const MEDAL = path.join(__dirname, 'master_data', 'medal.json');
if (fs.existsSync(MASTER) && fs.existsSync(MEDAL) && fs.existsSync(ROBO_DB) && fs.existsSync(ORIG)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varpow-chain-'));
  fs.copyFileSync(MASTER, path.join(dir, 'burst.json'));
  fs.copyFileSync(MEDAL, path.join(dir, 'medal.json'));
  const run = () => require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'medal-power-fix.js'), dir], { encoding: 'utf8' });
  run();
  const first = fs.readFileSync(path.join(dir, 'burst.json'), 'utf8');
  run();
  check(first === fs.readFileSync(path.join(dir, 'burst.json'), 'utf8'), 'catena medal-power-fix + variable-power: idempotente');
  const rows = new Map(JSON.parse(first).map((r) => [r.burstId, r]));
  const x = rows.get(3001131), x7 = rows.get(3001132), xs = rows.get(3002033), l = rows.get(3001223), l7 = rows.get(3001224);
  check(x && x.specialPowerType === 23 && x.sp1 === 14016 && x.sp2 === 100000 && x.basePowerPerEnforce[4] === 28826 &&
    x.displayPowerPerEnforce[4] === 30100 && x.displayMaxPowerPerEnforce[4] === 42500, 'master: Final Boss Xion 6★ tipo 23');
  check(x7 && x7.specialPowerType === 23 && xs && xs.specialPowerType === 23 && xs.displayMaxPowerPerEnforce[4] === 192400, 'master: Dark Horizon +6/+7 tipo 23');
  check(l && l.specialPowerType === 25 && l.sp1 === 19168 && l.basePowerPerEnforce[4] === 29900 && l.displayMaxPowerPerEnforce[4] === 48600 &&
    l7 && l7.specialPowerType === 25, 'master: HD Larxene tipo 25');
  check([...rows.values()].every((r) => !(r.specialPowerType > 2) || r.displayMaxPower > r.displayPower), 'master (catena): ogni riga variabile ha il massimo sopra il minimo');
  const crits = [...rows.values()].filter((r) => r.criticalPower > 10000).length;
  check(crits === 18, `master: 18 Critical con criticalPower (${crits})`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// la ricostruzione e' dichiarata nelle Notices
check(NOTICES.some((n) => /variable/i.test(n.title) && /reconstructed/.test(n.body.join(' '))), 'notice degli speciali variabili');
// I-189b: tutti i tipi variabili, curva ricostruita dichiarata, i colpi critici col moltiplicatore, niente piu' «valore basso»
const vn = NOTICES.find((n) => /variable/i.test(n.title));
const vtext = vn ? vn.body.join(' ') : '';
check(/critical/i.test(vtext) && /curve/i.test(vtext) && !/show and deal the \*\*lowest\*\*/.test(vtext), 'notice I-189b: tutti i tipi, curva e critici');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('test-variable-power: ok');
