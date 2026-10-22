// Level Up delle medaglie: pallini dell'attacco speciale, guilt (Special Attack Bonus), Chip/Dale
// (+STR/+DEF), Cid (costo), Magic Mirror (+1% di guilt), Mickey & Brooms (Fantasia Mickey B).
// Usato da server.js (POST /user/medal/enhance), make-game-tables.js (righe medal/burst, guiltProb)
// e guilt-burst.js (guilt massima): docs/notes/guilt.md.
//
// Regole (reference\guilt\NOTE.md: khuxwiki Medal/Chip/Dale/Cid/Magic Mirror/Fantasia Mickey B,
// guida dell'utente p. 16, 20, 21) e comportamento del client 4.3.1 (anteprima):
// - pallini (userMedal.burstUpperNumber): materiale «da pallino» = stessa groupId (o medalId se 0),
//   oppure groupId del materiale in burstEnhanceCategory della base, oppure type 8 (Mickey &
// Brooms). Aggiunge 1 + i pallini del materiale, fino a burst.maxEnhanceCount.
// - guilt (userMedal.guiltFactor, centesimi di %: 10000 = +100%): un materiale da pallino fuso
//   quando i pallini sono gia' pieni sblocca (guilt 0) o rilancia la guilt: valore casuale dalle
//   righe guiltProb del tier (value = guiltValue), si tiene il piu' alto. Serve userDetail.isGuilt
//   (Power Bangle) e guiltValue > 0, come nel client.
// - Magic Mirror (enhanceGuilt 100): +1% se la guilt e' sbloccata e sotto il massimo del tier.
// - Chip/Dale (enhanceAttack/enhanceDefense): attackUpperNumber/defenseUpperNumber fino a
//   addMaxAttack/addMaxDefense della base.
// - Cid (enhanceCost 1/5/10): upperCost fino a cost - minCost della base. Qui upperCost e' la
// riduzione (positiva); al client va negato (userMedalElement di server.js).
'use strict';

// Intervalli della khuxwiki (Medal, «Special Attack Bonus»), in centesimi di %.
// campaignMin = minimo durante le campagne.
const GUILT_RANGES = {
  1: { min: 1000, max: 2500, campaignMin: 1500 },
  2: { min: 2000, max: 5000, campaignMin: 3000 },
  3: { min: 4000, max: 10000, campaignMin: 7000 },
  4: { min: 6000, max: 13000, campaignMin: 9000 },
  5: { min: 8000, max: 15000, campaignMin: 10000 },
  6: { min: 10000, max: 18000, campaignMin: 14000 },
  7: { min: 12000, max: 20000, campaignMin: 16000 },
  8: { min: 15000, max: 23000, campaignMin: 19000 },
  9: { min: 20000, max: 28000, campaignMin: 24000 },
  10: { min: 24000, max: 32000, campaignMin: 28000 },
};

// Tabella guiltProb {id, value, factor, weight, isCampaign}. Un valore ogni
// 1% fra minimo e massimo. I pesi originali non si conoscono: ipotesi = peso uniforme.
// isCampaign: il client moltiplica il peso di queste righe per il tasso della campagna;
// senza campagne attive tutte 0.
function guiltProbRows(step = 100) {
  const rows = [];
  let id = 1;
  for (const [tier, r] of Object.entries(GUILT_RANGES)) {
    for (let f = r.min; f <= r.max; f += step) {
      rows.push({ id: id++, value: Number(tier), factor: f, weight: 100, isCampaign: 0 });
    }
  }
  return rows;
}

function guiltRange(guiltProb, tier) {
  const fs = guiltProb.filter((r) => r.value === tier).map((r) => r.factor);
  return fs.length ? { min: Math.min(...fs), max: Math.max(...fs) } : { min: 0, max: 0 };
}

function rollGuilt(guiltProb, tier, rng = Math.random) {
  const rows = guiltProb.filter((r) => r.value === tier && r.weight > 0);
  const tot = rows.reduce((s, r) => s + r.weight, 0);
  if (!tot) return 0;
  let x = rng() * tot;
  for (const r of rows) { if ((x -= r.weight) < 0) return r.factor; }
  return rows[rows.length - 1].factor;
}

// Pallini massimi per rarita' (khuxwiki): per le burst di Roboloid con maxEnhanceCount 0.
const MAX_DOTS = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3, 6: 5, 7: 5 };

function groupOf(row) { return row.groupId || row.medalId; }

function isDotMaterial(baseRow, matRow) {
  const g = groupOf(matRow);
  if (g === groupOf(baseRow)) return true;
  if ((baseRow.burstEnhanceCategory || []).some((c) => c && c === g)) return true;
  return matRow.type === 8;
}

// base: {burstUpperNumber, guiltFactor, attackUpperNumber, defenseUpperNumber, upperCost}
// comps: [{row, burstUpperNumber}] in ordine (copie impilate gia' espanse).
// opts: {burstRow, guiltProb, isGuilt (userDetail.isGuilt), rng}
// Torna {state, events: {dots, guiltUnlocked, guiltRaised, guiltMaxed, rolls}}.
function applyEnhance(baseRow, base, comps, opts) {
  const s = {
    attackUpperNumber: base.attackUpperNumber || 0,
    defenseUpperNumber: base.defenseUpperNumber || 0,
    burstUpperNumber: base.burstUpperNumber || 0,
    upperCost: base.upperCost || 0,
    guiltFactor: base.guiltFactor || 0,
  };
  const ev = { dots: 0, guiltUnlocked: false, guiltRaised: false, guiltMaxed: false, rolls: [] };
  const maxDots = baseRow.validBurst ? (opts.burstRow?.maxEnhanceCount || 0) : 0;
  const tier = baseRow.guiltValue || 0;
  const range = guiltRange(opts.guiltProb || [], tier);
  const guiltOpen = !!opts.isGuilt && tier > 0 && range.max > 0;
  const before = s.guiltFactor;
  // pallini come l'anteprima del client: ogni copia vale 1 + i suoi pallini;
  // se il totale supera il massimo (strettamente) la fusione sblocca o rilancia la guilt con un solo tiro,
  // anche quando e' la stessa copia a riempire i pallini (banco 18-10: 2 + 2 + 2 su 5 -> guilt). La guilt
  // della copia non conta. Prima l'eccedenza si perdeva e tirava solo una copia aggiunta a pallini pieni.
  if (maxDots > 0) {
    const sum = comps.filter((c) => isDotMaterial(baseRow, c.row)).reduce((t, c) => t + 1 + (c.burstUpperNumber || 0), 0);
    const total = s.burstUpperNumber + sum;
    ev.dots = Math.max(0, Math.min(maxDots, total) - s.burstUpperNumber);
    s.burstUpperNumber = Math.max(s.burstUpperNumber, Math.min(maxDots, total));
    if (sum > 0 && total > maxDots && guiltOpen && s.guiltFactor < range.max) {
      const v = rollGuilt(opts.guiltProb, tier, opts.rng);
      ev.rolls.push(v);
      if (v > s.guiltFactor) s.guiltFactor = v;
    }
  }
  for (const c of comps) {
    const r = c.row;
    if (r.enhanceGuilt > 0 && guiltOpen && s.guiltFactor > 0) {
      s.guiltFactor = Math.min(range.max, s.guiltFactor + r.enhanceGuilt);
    }
    if (r.enhanceAttack > 0) s.attackUpperNumber = Math.min(baseRow.addMaxAttack || 0, s.attackUpperNumber + r.enhanceAttack);
    if (r.enhanceDefense > 0) s.defenseUpperNumber = Math.min(baseRow.addMaxDefense || 0, s.defenseUpperNumber + r.enhanceDefense);
    if (r.enhanceCost > 0) s.upperCost = Math.min(Math.max(0, (baseRow.cost || 0) - (baseRow.minCost || 0)), s.upperCost + r.enhanceCost);
  }
  ev.guiltUnlocked = before === 0 && s.guiltFactor > 0;
  ev.guiltRaised = s.guiltFactor > before;
  ev.guiltMaxed = s.guiltFactor > 0 && s.guiltFactor >= range.max && before < range.max;
  return { state: s, events: ev };
}

// Righe mancanti del master: Magic Broom (album NA 673) e Mickey & Brooms = Fantasia Mickey B
// (album NA 652). Id 300000 + id Roboloid (948, 913), come le altre aggiunte: le immagini
// Medal_L/S_300948 e _300913 sono gia' in medal_gen. Modelli: Fantasia Mickey A (90085) e Magic
// Mirror (90156). Fantasia Mickey A diventa evolvibile: 5 Magic Broom -> Mickey & Brooms (khuxwiki).
// Restituisce le righe nuove e la patch della 90085 (non tocca l'array passato).
const BROOM_ID = 300948;
const MICKEY_B_ID = 300913;

function extraMedalRows(medalRows) {
  const byId = new Map(medalRows.map((r) => [r.medalId, r]));
  const mickeyA = byId.get(90085), mirror = byId.get(90156);
  if (!mickeyA || !mirror) throw new Error('mancano le righe modello 90085/90156');
  const out = [];
  if (!byId.has(BROOM_ID)) {
    out.push({
      ...mickeyA, medalId: BROOM_ID, imageId: BROOM_ID, thumbId: BROOM_ID, sortId: 673, listSortId: 673,
      name: 'Magic Broom',
      flavor: "The Sorcerer's Apprentice (1940)\n\nEnchanted brooms put to work\nby King Mickey's magic.",
      advantage: 'A Medal necessary to evolve\na Fantasia Mickey Medal.',
      type: 6, rare: 5, validPack: 1, validEvolve: 0, evolveId: 0, validEvolveNeed: 0, evolveNeedId: [0, 0, 0, 0, 0],
    });
  }
  if (!byId.has(MICKEY_B_ID)) {
    out.push({
      ...mirror, medalId: MICKEY_B_ID, imageId: MICKEY_B_ID, thumbId: MICKEY_B_ID, sortId: 652, listSortId: 652,
      name: 'Fantasia Mickey B',
      flavor: "The Sorcerer's Apprentice (1940)\n\nA young Mickey, still learning\nfrom Master Yen Sid.",
      advantage: 'Boosts the special attack of a\n3★ Medal or higher by 1 level.',
      darklight: 1, type: 8, rare: 6, validPack: 1, enhanceGuilt: 0,
    });
  }
  const mickeyAPatch = {
    medalId: 90085, validEvolve: 1, evolveId: MICKEY_B_ID,
    validEvolveNeed: 5, evolveNeedId: [BROOM_ID, BROOM_ID, BROOM_ID, BROOM_ID, BROOM_ID],
  };
  return { rows: out, mickeyAPatch };
}

// Burst senza pallini (maxEnhanceCount 0, le 1.571 medaglie di Roboloid) e 6★ con 4 (dati
// vecchi di thethiny; khuxwiki: 6★ = 5): maxEnhanceCount per rarita' della medaglia.
// Torna {burstId: nuovo maxEnhanceCount} solo per le righe da cambiare.
function burstDotFixes(medalRows, burstRows) {
  const burst = new Map(burstRows.map((b) => [b.burstId, b]));
  const fix = {};
  for (const m of medalRows) {
    if (m.type !== 1 || !m.validBurst) continue;
    const b = burst.get(m.burstId);
    const want = MAX_DOTS[m.rare] ?? 0;
    if (b && b.maxEnhanceCount < want && (fix[b.burstId] ?? 0) < want) fix[b.burstId] = want;
  }
  return fix;
}

module.exports = {
  GUILT_RANGES, guiltProbRows, guiltRange, rollGuilt, isDotMaterial, applyEnhance,
  extraMedalRows, burstDotFixes, BROOM_ID, MICKEY_B_ID,
};
