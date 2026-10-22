// Supernova (I-124): Evolve verso le medaglie SN/Supernova con le medaglie richieste.
// khuxwiki, pagina di ogni medaglia: «X can be evolved into '''SN - X''' by using 5 non-boosted 7★
// X Medals» (5 copie della stessa medaglia) e «SN - X can be evolved into '''SN+ - X''' by using 5
// {{b|Dual Meow Wow|SAB LV n}} Medals». Dual Meow Wow [SAB LV 7/8/9]: medaglie di supporto
// (Roboloid 1682-1684, «Grants Supernova to or strengthens the Supernova of specific Medals with an
// SP attack bonus LV of n»), materiale di Evolve come Magic Broom (medal-guilt.js). Il client legge
// validEvolveNeed (quante) ed evolveNeedId[5] (quali), come per Fantasia Mickey A + 5 Magic Broom.
const MEOW = { 7: 301682, 8: 301683, 9: 301684 };
const MEOW_ALBUM = { 7: 1626, 8: 1627, 9: 1628 };

// righe dei tre Dual Meow Wow, copiate dalla riga di Magic Broom (supporto, impilabile)
function meowRows(medalRows, broomId) {
  const broom = medalRows.find((r) => r.medalId === broomId);
  if (!broom) return [];
  const have = new Set(medalRows.map((r) => r.medalId));
  return Object.entries(MEOW).filter(([, id]) => !have.has(id)).map(([lv, id]) => ({
    ...broom, medalId: id, imageId: id, thumbId: id, cutinId: id, artId: id, displayId: id,
    sortId: MEOW_ALBUM[lv], listSortId: MEOW_ALBUM[lv],
    name: `Dual Meow Wow [SAB LV ${lv}]`,
    flavor: 'KINGDOM HEARTS 3D (2012)\n\nA friendly Dream Eater that charges\nin horn first.',
    advantage: `Grants Supernova to or strengthens the\nSupernova of specific Medals with an\nSP attack bonus LV of ${lv}.`,
    rare: 6, darklight: 1,
  }));
}

// regole dalla wiki: [{from, to, n, kind: 'self' | 'meow7' | 'meow8' | 'meow9'}]
function evolveRules(wiki) {
  const re = /(?:'''|\b)([^.\n']+?)(?:''')? can be evolved into '''([^']+)''' by using (\d+) ([^.\n]+?) Medals?\./g;
  const rules = [];
  for (const text of Object.values(wiki)) {
    for (const [, from, to, n, what] of text.matchAll(re)) {
      if (!/^(SN\+*|Supernova\+*) - /.test(to)) continue;
      const meow = /Dual Meow Wow\|SAB LV (\d+)/.exec(what);
      const kind = meow ? 'meow' + meow[1] : /non-boosted/.test(what) ? 'self' : null;
      if (kind) rules.push({ from: from.replace(/\{\{kh\|([^}]*)\}\}/g, '$1').trim(), to, n: Number(n), kind });
    }
  }
  return rules;
}

// applica le regole alle righe medal (sul posto). La medaglia di partenza e' quella che precede la
// destinazione nella catena Reference di Roboloid (le righe 300000 + id); torna le statistiche
function applyEvolveRules(medalRows, rules, robo) {
  const byId = new Map(medalRows.map((r) => [r.medalId, r]));
  const roboByName = new Map();
  for (const d of robo) if (!roboByName.has(d.Name)) roboByName.set(d.Name, d);
  const stats = { applied: 0, missing: 0 };
  for (const r of rules) {
    const d = roboByName.get(r.to);
    const chain = d && d.Reference || [];
    const prev = chain[chain.indexOf(d && d.ID) - 1];
    const from = prev && byId.get(300000 + prev);
    const to = d && byId.get(300000 + d.ID);
    const need = r.kind === 'self' ? from && from.medalId : MEOW[r.kind.slice(4)];
    if (!from || !to || !need || !byId.has(need)) { stats.missing++; continue; }
    Object.assign(from, { validEvolve: 1, evolveId: to.medalId, validEvolveNeed: r.n,
      evolveNeedId: Array.from({ length: 5 }, (_, i) => (i < r.n ? need : 0)) });
    stats.applied++;
  }
  return stats;
}

// Attacchi Supernova. Il client usa la riga burst di superBurstId al posto di
// burstId quando la medaglia lancia la Supernova; il pulsante sotto il Burst compare per ogni
// medaglia del deck con validSuperBurst e superBurstId, una volta per missione.
// Fonte: blocco Supernova di Roboloid (nome, testo, Multi, Timing, bersaglio, buff), uguale alla
// tabella «List of Supernovas» della khuxwiki. Una riga per medaglia, burstId 4000000 + id
// Roboloid (SN e SN+ hanno moltiplicatori diversi). superburstTiming = slot prima del quale scatta
// in difesa nel PvP. Animazioni: le 51 abl_500N1 servite (con eff_500N1, o la precedente se manca),
// assegnate a rotazione a ogni Supernova diversa fra quelle con i suoi colpi (assignSnMotions): l'abbinamento
// originale medaglia -> animazione non e' in nessun dato disponibile.
const SN_MOTIONS = [];
for (let n = 1; n <= 52; n++) if (n !== 43) SN_MOTIONS.push(50000 + n * 10 + 1);
// Colpi (eventi knockback_N) di ogni animazione servita: il danno arriva un colpo per evento, ciascuno
// attacco x potenza / hitCount (burst-anim-fix.js). Contati con reference\burst_anim\scripts\lwfev.py.
// Banco 20-10 (utente): animazione a 0 colpi = nessun danno, a 4 e 11 colpi = 4 e 11 colpi pieni.
const SN_KNOCKBACK = { 50011: 1, 50021: 1, 50031: 1, 50041: 1, 50051: 1, 50061: 1, 50071: 0, 50081: 0, 50091: 0,
  50101: 0, 50111: 4, 50121: 6, 50131: 11, 50141: 1, 50151: 4, 50161: 0, 50171: 0, 50181: 0, 50191: 2, 50201: 2,
  50221: 8, 50231: 3, 50241: 3, 50251: 4, 50261: 13, 50271: 2, 50281: 1, 50291: 0, 50301: 3, 50311: 5, 50321: 12,
  50331: 6, 50341: 1, 50351: 2, 50361: 1, 50371: 11, 50381: 8, 50391: 7, 50401: 13, 50411: 4, 50421: 0, 50441: 11,
  50451: 8, 50461: 9, 50471: 1, 50481: 9, 50491: 4, 50501: 3, 50511: 9, 50521: 11 };
const SN_EFFECTS = new Set([50011, 50041, 50051, 50061, 50081, 50111, 50121, 50131, 50141, 50151, 50191,
  50201, 50211, 50221, 50231, 50241, 50251, 50261, 50271, 50301, 50311, 50321, 50331, 50351, 50361,
  50371, 50381, 50391, 50401, 50411, 50421, 50441, 50451, 50461, 50471, 50481, 50491, 50501, 50511, 50521]);
const effectFor = (motion) => {
  let e = motion;
  while (e > 50011 && !SN_EFFECTS.has(e)) e -= 10;
  return 100000 + e;
};

// Animazione di ogni riga Supernova: una servita con tanti colpi quanti hitCount (Roboloid: 1, 4 per le tre
// «Reversed Strike All M»), a rotazione per nome in ordine di burstId. Idempotente; anche sul master servito.
function assignSnMotions(bursts) {
  const rows = bursts.filter((b) => b.burstId >= 4000000 && b.burstId < 5000000).sort((a, b) => a.burstId - b.burstId);
  const seen = new Map(); const used = {};
  let changed = 0;
  for (const b of rows) {
    const key = `${b.hitCount}|${b.name}`;
    if (!seen.has(key)) {
      const pool = SN_MOTIONS.filter((m) => SN_KNOCKBACK[m] === b.hitCount);
      if (!pool.length) continue;
      used[b.hitCount] = (used[b.hitCount] || 0) + 1;
      seen.set(key, pool[(used[b.hitCount] - 1) % pool.length]);
    }
    const motion = seen.get(key);
    if (b.motionId !== motion || b.effectId !== effectFor(motion)) { b.motionId = motion; b.effectId = effectFor(motion); changed++; }
  }
  return changed;
}

function supernovaBursts(medalRows, burstRows, robo, buffFields) {
  const byBurst = new Map(burstRows.map((b) => [b.burstId, b]));
  const zero = (v) => (Array.isArray(v) ? v.map(zero) : typeof v === 'string' ? '' : 0);
  const blankRow = Object.fromEntries(Object.entries(burstRows[0]).map(([k, v]) => [k, zero(v)]));
  const sn = robo.filter((d) => d.Supernova).sort((a, b) => a.AlbumNum - b.AlbumNum);
  const motionOf = new Map();
  for (const d of sn) if (!motionOf.has(d.Supernova.Name)) motionOf.set(d.Supernova.Name, SN_MOTIONS[motionOf.size % SN_MOTIONS.length]);
  const medalById = new Map(medalRows.map((m) => [m.medalId, m]));
  const rows = [];
  for (const d of sn) {
    const m = medalById.get(300000 + d.ID);
    if (!m) continue;
    const s = d.Supernova;
    const id = 4000000 + d.ID;
    const target = /single/i.test(s.Target || '') ? 1 : 2;
    const power = Math.round((s.Multi || 100) * 10000);
    const motion = motionOf.get(s.Name);
    const row = Object.assign({}, blankRow, {
      burstId: id, motionId: motion, effectId: effectFor(motion), distance: (byBurst.get(m.burstId) || {}).distance || 250,
      name: s.Name, description: s.Text || '', target, hitCount: s.Hits || 1, gauge: 0, criticalPower: 10000,
      displayPower: power, basePower: power, displayPowerPerEnforce: [1, 1, 1, 1, 1], basePowerPerEnforce: [1, 1, 1, 1, 1],
      damageType: 1, specialPowerType: 1, superburstTiming: s.Timing || 0,
    }, buffFields(s, target).out);
    rows.push(row);
    Object.assign(m, { validSuperBurst: 1, superBurstId: id });
    // Badge sulla medaglia (displayId): 100/200/300 -> img/ui/SBurst_Icon1/2/3
    // (SN, SN+, SN++), +1000 -> variante ...R (Supernova che rinnova le altre).
    const plus = /^(?:SN|Supernova)(\+*)\s*-/.exec(m.name);
    if (plus) m.displayId = 100 * Math.min(plus[1].length + 1, 3) + (row.recurringAttribute ? 1000 : 0);
  }
  assignSnMotions(rows);
  return rows;
}

module.exports = { MEOW, meowRows, evolveRules, applyEvolveRules, supernovaBursts, assignSnMotions, SN_KNOCKBACK };
