// Attacchi speciali a danno fisso («Inflicts a fixed amount of damage regardless of target's
// defense»: Beast, KH II Yuffie, Ansem, ...). Formato delle righe burst originali di thethiny
// (data/burst.json, 20 righe): damageType 2, specialPowerType 2, basePower 0, sp1 = danno per
// colpo x10000, sp1PerEnforce = danno per colpo con 1..5 pallini; displayPower = sp1 * hitCount
// (il «x3600.00» del dettaglio = 3600 di danno totale). Senza queste righe make-game-tables.js
// trattava il valore della wiki come moltiplicatore normale (damageType 1, basePower 36000000).
//
// - burstId presente in thethiny con damageType 2: campi di danno copiati dall'originale;
// - altrimenti, medaglia Roboloid con FixedMulti (= danno per colpo con tutti i pallini * Hits,
//   verificato sulle righe thethiny: Yuffie 6★ 6300 = 1050 * 6, Beast 3★ 2450 = 350 * 7):
//   progressione dei pallini presa da Wind Blade +5 (600, 650, 750, 850, 950, 1050 per colpo).

const FIELDS = ['damageType', 'specialPowerType', 'hitCount', 'maxEnhanceCount', 'sp1', 'sp1PerEnforce',
  'sp2PerEnforce', 'displayPower', 'displayPowerPerEnforce', 'basePower', 'basePowerPerEnforce', 'description'];
const STEPS = [600, 650, 750, 850, 950, 1050].map((v) => v / 1050);
const FIXED_TEXT = /fixed amount of damage/i;

function fixedRow(maxTotal, hits, dots) {
  const n = Math.max(0, Math.min(5, dots));
  const perHit = STEPS.slice(5 - n).map((r) => Math.round((maxTotal / hits) * r) * 10000);
  const pad = (a, v) => [0, 1, 2, 3, 4].map((i) => (i < a.length ? a[i] : v));
  return {
    damageType: 2, specialPowerType: 2, hitCount: hits, maxEnhanceCount: n,
    sp1: perHit[0], sp1PerEnforce: pad(perHit.slice(1), 0), sp2PerEnforce: [0, 0, 0, 0, 0],
    displayPower: perHit[0] * hits, displayPowerPerEnforce: pad(perHit.slice(1).map((v) => v * hits), 1),
    basePower: 0, basePowerPerEnforce: [0, 0, 0, 0, 0],
  };
}

// medals: righe medal; bursts: righe burst (modificate sul posto); roboOf(m): record Roboloid;
// orig: Map burstId -> riga thethiny. Ritorna { orig: n, robo: n }.
function applyFixedDamage(medals, bursts, roboOf, orig) {
  const byId = new Map(bursts.map((b) => [b.burstId, b]));
  const stats = { orig: 0, robo: 0 };
  const done = new Set();
  for (const [id, o] of orig) {
    const b = byId.get(id);
    if (!b || o.damageType !== 2) continue;
    for (const k of FIELDS) if (o[k] !== undefined) b[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
    done.add(id);
    stats.orig++;
  }
  for (const m of medals) {
    const b = byId.get(m.burstId);
    if (!m.validBurst || !b || done.has(b.burstId)) continue;
    const d = roboOf(m);
    if (!d || !d.FixedMulti) continue;
    const ab = d.Ability || {};
    const hits = ab.Hits || b.hitCount || 1;
    Object.assign(b, fixedRow(d.FixedMulti, hits, b.maxEnhanceCount || 0));
    if (FIXED_TEXT.test(ab.Text || '')) b.description = ab.Text;
    done.add(b.burstId);
    stats.robo++;
  }
  return stats;
}

module.exports = { applyFixedDamage, fixedRow };
