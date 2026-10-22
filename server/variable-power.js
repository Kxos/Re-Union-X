// Speciali a danno variabile (I-189, docs/notes/medaglie.md#danno-variabile, analisi del 21-10; I-189b tutti i tipi,
// medaglie.md#danno-variabile-tipi):
//
// Il client mostra nel dettaglio della medaglia «x a - b» quando la riga burst ha specialPowerType diverso da 1 e 2
// (il massimo con la stessa regola): a = displayPower(PerEnforce)
// /1e4, b = displayMaxPower(PerEnforce) /1e4, entrambi per il fattore guilt. Le nostre 2276 righe erano tutte
// tipo 1/2 con displayMaxPower 0 (copie dei modelli di burst_base.json): Cloud II EX 7★ (burst 3000999) mostrava x7.12
// invece di «x7.12 - 8.64» (video https://www.youtube.com/watch?v=eLmkNDzwuPE 2:02).
// Danno in battaglia (I-189b) per specialPowerType (note private del 21-10), con
// S1 = sp1(PerEnforce)/1e4, S2 = sp2/1e4, B = basePower(PerEnforce)/1e4 e f(x) = x²/(S2 + x²).
//
// Tre casi (dopo medal-power-fix.js burstPowerFix, che ha gia' messo base/display di ogni riga):
// a. id presente in thethiny (burst.json originale) con tipo > 2: specialPowerType, sp1, sp2, displayMaxPower verbatim;
//    sp1/sp2PerEnforce e displayMaxPowerPerEnforce estesi ai pallini della riga come ext() di burstPowerFix (0 oltre).
//    Hanno la precedenza su tutto il resto.
// b. righe Roboloid (3000000 + id) con LowMulti/HighMulti e una condizione di TYPE_OF_CONDITION. Roboloid Low/High =
//    displayPower/displayMaxPower ai pallini pieni (~80 righe abbinate per nome con thethiny), max - display uguale a ogni
//    pallino. Al pallino massimo lo = LowMulti*1e4, hi = HighMulti*1e4; lo_i = display della riga al pallino i:
//    - tipi 3/4 (meno/piu' HP, B·S2·(S1 + 1 − hp/maxHP) / B·S2·(S1 + hp/maxHP)), verificati sulle 38/38 righe originali:
//      display = base*sp1/1e4, max = base*(sp1+sp2)/1e4, sp2 = 10000: bp = hi - lo, sp1 = lo*1e4/bp; per pallino
//      bp_i = lo_i*1e4/sp1, max_i = lo_i + bp_i (unica eccezione al divario costante, e' un rapporto);
//    - tipi a saturazione B + S1·f(x) (SATURATING: S2 e x al minimo/massimo dagli originali): sp1 = (hi − lo)/(f(x_hi) −
//      f(x_lo)), sp2 = S2·1e4, base_i = lo_i − sp1·f(x_lo), max_i = lo_i + (hi − lo). Riproduce 42 originali su 56 entro
//      15 (i 14 no sono copie guaste di thethiny: Dark End, Radiant Glory, Gale Assault +4/+5);
//    - tipi a scatto B + S1 se la condizione e' vera (20/21/22/35/36 sp2 0, 38 sp2 = indice dello slot da 0) e tipo 30
//      (piu' Lux, sp2 1e8 = x enorme): base = display = lo_i, sp1 = hi − lo, max_i = lo_i + sp1 (20/21/30 verificati su
//      tutte le righe originali 6/6/14, anche per pallino);
//    - tipo 31 (meno Lux, B − S1·f(lux), sp2 1e8 come il 30): base_i = max_i = lo_i + (hi − lo), sp1 = hi − lo;
//    - tipo 5 (paga HP, M = B + S2): base = lo_i, sp1 9000 (soglia degli originali Flare/Dark Fire Dash/Fiery Tornado),
//      sp2 = hi − lo;
//    - tipo 16 (paga DEF, B + S1·tier di DEF persi, sp2 30000): sp1 = (hi − lo)/6 per Cyclone Sword (originali 10571-10576),
//      /3 per tutti gli altri (originali Blitz e Swift Hero; Wheel Smash senza originale segue la maggioranza, 8 su 14).
//    Curve senza originale dello stesso tipo, ricostruite (resoconto curveReconstructed): 26/27 (S2 e x dal 27 di
//    Zone of Ruin), 31 (come il 30), 37 (come 23/25), 39 e 41 (come il 40).
// **Critical** (18 righe): nessun specialPowerType dedicato; il colpo critico usa criticalPower (moltiplicatore del
// critico = critical, la probabilita', non si tocca): criticalPower = round(hi/lo·1e4), il tipo resta 1.
// c. condizioni senza tipo noto: tipo 1, contate nel resoconto (unmapped).
//
// make-game-tables.js lo chiama dopo burstPowerFix; da solo corregge il master sul posto (idempotente):
//   node server/variable-power.js [cartella master]
'use strict';
const fs = require('fs');
const path = require('path');

const ROBO_BURST = 3000000;
// condizione di Roboloid (Ability.Condition) -> specialPowerType (vedi medaglie.md#danno-variabile-tipi).
// MoreGaugesPrevMedal e' 26 («previous Medal») o 27 («next Medal», dal testo dell'abilita'): vedi typeOf()
const TYPE_OF_CONDITION = { LowerHP: 3, HigherHP: 4, DrainsHP: 5, MoreTurns: 6, SPSuccession: 7, DrainsDEF: 16, Poison: 20,
  Sleep: 21, Paralysis: 22, GaugesFull: 23, GaugesUsed: 25, MoreGaugesPrevMedal: 26, MoreEnemiesDefeated: 28, MoreLUX: 30,
  LessLUX: 31, OneEnemy: 36, MoreSkillsStage: 37, Slot3: 38, Slot4: 38, Slot5: 38, Slot6: 38, LowerSlot: 39, HigherSlot: 40,
  MoreParty: 41 };
const SLOT_OF_CONDITION = { Slot3: 3, Slot4: 4, Slot5: 5, Slot6: 6 };
const RATIO = new Set([3, 4]);
// B + S1 a scatto (o x enorme, tipo 30): sp2 costante
const ADDITIVE_SP2 = { 20: 0, 21: 0, 22: 0, 30: 100000000, 35: 0, 36: 0 };
// tipo -> [S2, x al minimo, x al massimo] (sp2 e x impliciti negli originali di thethiny, tmp\i189b\scr\fitx.js: 6 Blitz
// Raid, 7 Sonic/Heroic Blitz, 23 Wicked Flame/Flame Arcanum, 25 Black Hole, 27 Zone of Ruin, 28 Fire Barrage/Dark Dual
// Disaster, 40 Ignito Arrows/Raging Blaze; confronto con Roboloid: Final Boss Xion 23, HD Larxene 25, Jafar 40; gli altri
// presi dal tipo piu' simile)
const SATURATING = { 6: [5, 1, 10], 7: [6, 1, 10], 23: [10, 1, 20], 25: [10, 0, 20], 26: [7, 0, 14], 27: [7, 0, 14],
  28: [50, 0, 100], 37: [10, 0, 20], 39: [5, 1, 10], 40: [5, 1, 10], 41: [5, 1, 10] };
const CURVE_RECONSTRUCTED = new Set([26, 27, 31, 37, 39, 41]);
const DRAIN_HP_SP1 = 9000;
const DRAIN_DEF_SP2 = 30000;
const LUX_SP2 = 100000000;

function typeOf(d) {
  const cond = d.Ability?.Condition;
  if (cond === 'MoreGaugesPrevMedal' && /next Medal/i.test(d.Ability?.Text || '')) return 27;
  return TYPE_OF_CONDITION[cond];
}

// valori per pallino della riga: i < want dall'originale, oltre con l'ultimo passo, fill dopo want
function ext(arr, p0, want, fill) {
  const v = (arr || []).filter((x) => x > 1).slice(0, want);
  const stepv = v.length ? (v[v.length - 1] - p0) / v.length : 0;
  while (v.length < want) v.push(Math.round(p0 + stepv * (v.length + 1)));
  return [0, 1, 2, 3, 4].map((i) => (i < want ? v[i] : fill));
}
const dots = (want, f, fill) => [0, 1, 2, 3, 4].map((i) => (i < want ? f(i) : fill));
const count = (o, k) => { o[k] = (o[k] || 0) + 1; };

// opts: {origBursts: Map burstId -> riga thethiny, robo: Map id Roboloid -> voce medal_db, medals (non usato: la riga
// Roboloid si riconosce dall'id 3000000 + id)}
function variablePower(bursts, opts) {
  const { origBursts = new Map(), robo = new Map() } = opts || {};
  const st = { orig: 0, ratio: 0, additive: 0, saturating: 0, critical: 0, byType: {}, curveReconstructed: {},
    unverifiedRows: [], unmapped: {}, unmappedRows: [], loMismatch: [] };
  for (const b of bursts) {
    if (b.damageType === 2) continue;   // danno fisso (fixed-damage.js): sp1 e' il danno per colpo
    const want = b.maxEnhanceCount || 0;
    const o = origBursts.get(b.burstId);
    if (o && o.specialPowerType > 2) {
      Object.assign(b, { specialPowerType: o.specialPowerType, sp1: o.sp1, sp2: o.sp2, displayMaxPower: o.displayMaxPower,
        sp1PerEnforce: ext(o.sp1PerEnforce, o.sp1, want, 0), sp2PerEnforce: ext(o.sp2PerEnforce, o.sp2, want, 0),
        displayMaxPowerPerEnforce: ext(o.displayMaxPowerPerEnforce, o.displayMaxPower, want, 0) });
      // ext() filtra i valori <= 1: sp2 0 (tipi 20-22) resta 0 a ogni pallino
      if (!o.sp2) b.sp2PerEnforce = [0, 0, 0, 0, 0];
      st.orig++;
      continue;
    }
    if (!(b.burstId > ROBO_BURST && b.burstId < ROBO_BURST + 1000000)) continue;
    const d = robo.get(b.burstId - ROBO_BURST);
    if (!d || !d.LowMulti || !d.HighMulti) continue;
    const cond = d.Ability?.Condition || '(none)';
    const lo = Math.round(d.LowMulti * 10000), hi = Math.round(d.HighMulti * 10000);
    const row = { burstId: b.burstId, roboId: d.ID, condition: cond, low: d.LowMulti, high: d.HighMulti };
    if (cond === 'Critical') {
      // il critico moltiplica il danno singolo (tipo 1): x lo normale, x hi critico
      if (hi > lo) { b.criticalPower = Math.round(hi * 10000 / lo); st.critical++; } else st.unverifiedRows.push({ ...row, why: 'HighMulti <= LowMulti' });
      continue;
    }
    const type = typeOf(d);
    if (!type) {
      count(st.unmapped, cond);
      st.unmappedRows.push(row);
      continue;
    }
    if (hi <= lo) { st.unverifiedRows.push({ ...row, type, why: 'HighMulti <= LowMulti' }); continue; }
    const loAt = (i) => (i < 0 ? b.displayPower : b.displayPowerPerEnforce[i]);   // i = -1: senza pallini
    if (loAt(want - 1) !== lo) st.loMismatch.push({ ...row, display: loAt(want - 1) });
    // base_i = lo_i + baseOff, max_i = lo_i + (hi - lo), sp1/sp2 costanti a ogni pallino
    const setFlat = (sp1, sp2, baseOff) => Object.assign(b, { specialPowerType: type, sp1, sp2,
      basePower: loAt(-1) + baseOff, displayMaxPower: loAt(-1) + hi - lo,
      basePowerPerEnforce: dots(want, (i) => loAt(i) + baseOff, 1), displayMaxPowerPerEnforce: dots(want, (i) => loAt(i) + hi - lo, 0),
      sp1PerEnforce: dots(want, () => sp1, 0), sp2PerEnforce: dots(want, () => sp2, 0) });
    if (RATIO.has(type)) {
      const sp1 = Math.round(lo * 10000 / (hi - lo));
      const bpOf = (i) => Math.round(loAt(i) * 10000 / sp1);
      Object.assign(b, { specialPowerType: type, sp1, sp2: 10000,
        basePower: bpOf(-1), displayMaxPower: loAt(-1) + bpOf(-1),
        basePowerPerEnforce: dots(want, bpOf, 1), displayMaxPowerPerEnforce: dots(want, (i) => loAt(i) + bpOf(i), 0),
        sp1PerEnforce: dots(want, () => sp1, 0), sp2PerEnforce: dots(want, () => 10000, 0) });
      st.ratio++;
    } else if (SATURATING[type]) {
      // f(x_hi) - f(x_lo) = S2·(x_hi² − x_lo²) / ((S2 + x_hi²)(S2 + x_lo²)): in razionali, niente scarti di virgola mobile
      const [s2, xl, xh] = SATURATING[type];
      const sp1 = Math.round((hi - lo) * (s2 + xh * xh) * (s2 + xl * xl) / (s2 * (xh * xh - xl * xl)));
      setFlat(sp1, s2 * 10000, -Math.round(sp1 * xl * xl / (s2 + xl * xl)));
      st.saturating++;
    } else if (type in ADDITIVE_SP2 || type === 38) {
      setFlat(hi - lo, type === 38 ? (SLOT_OF_CONDITION[cond] - 1) * 10000 : ADDITIVE_SP2[type], 0);
      st.additive++;
    } else if (type === 31) {
      setFlat(hi - lo, LUX_SP2, hi - lo);
      st.additive++;
    } else if (type === 5) {
      setFlat(DRAIN_HP_SP1, hi - lo, 0);
      st.additive++;
    } else if (type === 16) {
      setFlat(Math.round((hi - lo) / (/Cyclone Sword/i.test(d.Ability?.Name || '') ? 6 : 3)), DRAIN_DEF_SP2, 0);
      st.additive++;
    } else {
      st.unverifiedRows.push({ ...row, type, why: 'tipo senza regola' });
      continue;
    }
    count(st.byType, type);
    if (CURVE_RECONSTRUCTED.has(type)) count(st.curveReconstructed, type);
  }
  return st;
}

const ROBO_DB = () => process.env.KHUX_ROBOLOID_DB || 'D:\\Progetto_Restauro_KH_UX\\external\\roboloid\\medal_db.json';
const ORIG = () => process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
const readSources = () => ({
  robo: new Map(JSON.parse(fs.readFileSync(ROBO_DB(), 'utf8')).map((d) => [d.ID, d])),
  origBursts: new Map(JSON.parse(fs.readFileSync(ORIG(), 'utf8')).map((b) => [b.burstId, b])),
});

// corregge burst.json della cartella master sul posto e restituisce il resoconto
function patch(masterDir) {
  const file = path.join(masterDir, 'burst.json');
  const bursts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = variablePower(bursts, readSources());
  fs.writeFileSync(file, JSON.stringify(bursts));
  return st;
}

const summary = (st) => `${st.orig} da thethiny, Roboloid per tipo ${JSON.stringify(st.byType)} (curva ricostruita ` +
  `${JSON.stringify(st.curveReconstructed)}), ${st.critical} Critical con criticalPower; tipo 1 per condizione senza tipo ` +
  `${JSON.stringify(st.unmapped)}` + (st.unverifiedRows.length ? `, ${st.unverifiedRows.length} righe senza intervallo` : '') +
  (st.loMismatch.length ? `; ${st.loMismatch.length} righe col valore a pallini pieni diverso da LowMulti` : '');

module.exports = { TYPE_OF_CONDITION, SATURATING, variablePower, patch, readSources, summary };

if (require.main === module) {
  const dir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(__dirname, 'master_data'));
  const st = patch(dir);
  console.log(`${dir}: speciali variabili: ${summary(st)}`);
  if (process.argv.includes('--rows')) console.log(JSON.stringify({ unverified: st.unverifiedRows, unmapped: st.unmappedRows, loMismatch: st.loMismatch }, null, 1));
}
