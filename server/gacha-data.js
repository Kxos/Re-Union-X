// Estrazioni dello Shop: funzioni pure (docs/notes/shop.md, spec 2026-10-16-shop-banner-design.md 9.2/9.3).
// Il catalogo dei banner (server/game_data/gacha_catalog.json) lo scrive recon/tools/make_banner_catalog.py:
// per ogni banner una ricetta del pool (sotto-set, nomi, vetrina, garanzie) che qui si espande alla data
// di riferimento (inizio del banner; per i permanenti il punto della storia del giocatore).
'use strict';
const fs = require('fs');

const CATALOG_ID = 9001;
// Probabilita' RICOSTRUITE (spec 9.2): lo slot r★ sale di una stella con UPGRADE[r] se quella
// stella ha medaglie nel pool (cioe' era estraibile alla data del banner); i banner «Epic» del 2016
// mandano 3★/4★ a 5★ con EPIC_UPGRADE. Negli slot a lista la medaglia in vetrina pesa FEATURED_WEIGHT.
const UPGRADE = { 3: 0.10, 4: 0.06, 5: 0.04, 6: 0.03 };
const EPIC_UPGRADE = 0.15;
const FEATURED_WEIGHT = 2;
// Boosted «small chance» (sotto-progetto 2b): la percentuale non e' scritta nei notice, RICOSTRUITA al 5%
// per slot idoneo (Notices); «guaranteed» = sempre.
const BOOST_SMALL_CHANCE = 0.05;
const EMPTY = () => ({ banners: [], subsets: {}, medals: {}, firstRarity: {}, story: [] });

// «4★:1 3★:2 Other:1» -> [[4,1],[3,2]]: le voci senza ★ (Other) sono ignorate; ordine decrescente.
function parseRarityMix(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/(\d)★:(\d+)/g)) out.push([Number(m[1]), Number(m[2])]);
  return out.sort((a, b) => b[0] - a[0]);
}

// Una rarita' per slot, nell'ordine del mix. Slot mancanti: rarita' piu' bassa del mix; in eccesso: tagliati.
function slotRarities(banner) {
  const slots = [];
  for (const [rare, n] of banner.rarityMix) for (let k = 0; k < n; k++) slots.push(rare);
  const low = slots.length ? slots[slots.length - 1] : 3;
  while (slots.length < banner.lotCount) slots.push(low);
  return slots.slice(0, banner.lotCount);
}

// Legge il catalogo; vuoto ma valido se il file manca, non e' JSON o non ha «banners».
// I campi in piu' del catalogo vero (version, statistiche) restano.
function loadCatalog(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return c && Array.isArray(c.banners) ? { ...EMPTY(), ...c } : EMPTY();
  } catch {
    return EMPTY();
  }
}

// Data della tranche della storia che contiene la quest (la prima se quest < 1, l'ultima oltre la fine).
function storyDay(catalog, quest) {
  const s = catalog.story || [];
  if (!s.length) return '2016-04-07';
  const row = s.find(([a, b]) => quest >= a && quest <= b);
  return row ? row[2] : (quest < s[0][0] ? s[0][2] : s[s.length - 1][2]);
}

// Rotazione settimanale dello Shop (I-165, decisione dell'utente 19-10): la tranche della storia copre il periodo
// originale dalla sua data alla data della tranche dopo (l'ultima: una settimana); lo Shop mostra una settimana di
// quel periodo alla volta e avanza di una ogni settimana reale (lunedi', con l'aggiornamento dei dati), poi riparte.
// rot = {day, week}: tranche vista e settimana reale in cui il giocatore ci e' entrato (la rotazione parte da li').
// -> {day (data della tranche), from, to (finestra di 7 giorni), k, n (settimana k di n), weeksLeft (fino al cambio)}.
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function shopWindow(catalog, quest, week, rot) {
  const day = storyDay(catalog, quest);
  const dates = [...new Set((catalog.story || []).map((r) => r[2]))].sort();
  const next = dates.find((d) => d > day);
  const span = next ? Math.round((Date.parse(next) - Date.parse(day)) / 86400000) : 7;
  const n = Math.max(1, Math.ceil(span / 7));
  const start = rot && rot.day === day ? rot.week : week;
  const k = (((week - start) % n) + n) % n;
  const from = addDays(day, 7 * k);
  const end = next ? addDays(next, -1) : addDays(day, 6);
  const to = addDays(from, 6) < end ? addDays(from, 6) : end;
  const rows = (catalog.story || []).filter((r) => r[2] === day);
  return { day, from, to, k, n, periodEnd: end, qFrom: rows.length ? rows[0][0] : 0, qTo: rows.length ? rows[rows.length - 1][1] : 0 };
}

// Decisione 13-bis, regola originale: dalla data del notice le 7★ di quel Tier estratte arrivano con pallini e guilt al
// massimo (server.js respondGachaDraw), confrontata con asOf del banner (la stessa data delle medaglie del pool).
const MAX_GUILT_FROM = Object.freeze({
  9: Object.freeze({ date: '2019-01-01', notice: 48236 }),   // deal Birth by Sleep a prezzo calante: i 7★ di Tier 9 col bonus massimo del 280%
  10: Object.freeze({ date: '2019-09-01', notice: 56838 }),  // deal Supernova+ dei Foreteller: i 7★ di Tier 10 col bonus massimo del 320%
});
// true se una 7★ di quel Tier, estratta alla data at (asOf), arriva al massimo per la regola (senza preset)
const maxGuiltRule = (rare, tier, at) => rare === 7 && !!MAX_GUILT_FROM[tier] && String(at) >= MAX_GUILT_FROM[tier].date;

// Data di riferimento del pool: inizio del banner; i PERMANENT seguono il giocatore, limitati a [inizio, fine].
function asOf(banner, day) {
  if (!(banner.flags || []).includes('PERMANENT')) return banner.start;
  const end = banner.end || '2099-12-31';
  return day < banner.start ? banner.start : day > end ? end : day;
}

// Espande la ricetta del pool alla data `at` (spec 9.3). Vetrina, garanzie e pool.names entrano sempre;
// le medaglie dei sotto-set passano da pool.filter (origin o att, contract-ext 4); i modi released/inherit
// aggiungono le medaglie std uscite entro `at` (inherit: solo dopo inheritAfter). Rarita': quelle del mix
// (se gia' uscite: firstRarity) piu' la stella sopra se gia' uscita; ogni variante solo se uscita entro `at`.
// listNames/featuredNames: [[nome, peso, {rare: [ids]}]] per gli slot a lista e della pity (solo i nomi con
// almeno una variante nel pool; in lista la vetrina pesa FEATURED_WEIGHT, nella pity tutte 1).
// Catalogo v3 (sotto-progetto 2b): slotNames[j] = i nomi della riserva guarantee.slots[j] (lista, o nomi
// alternativi del Tier; per il Trait la Trait Medal #N se nota), pityNames = i bersagli della pity, pityIds = le loro varianti alla stella
// promessa (pityStar, o quella che la pity darebbe alla data: pityVariantStar), le sole che azzerano la pity;
// per questi nomi riservati entrano anche pityStar e le stelle degli slot, solo se gia' uscite alla data
// (firstRarity <= at). tiers: Map id -> Tier (4o campo di ids); medalInfo: Map id -> {name, rare}.
function expandPool(banner, catalog, at) {
  const p = banner.pool || {};
  const g = banner.guarantee || {};
  const res = Array.isArray(g.slots) ? g.slots : [];
  if (p.mode === 'evolve') {
    const ev = p.evolve || [];
    const top = Math.max(...ev.map(([, lv]) => lv));
    const rest = ev.length > 1 ? 0.9 / (ev.length - 1) : 1;
    const weighted = ev.map(([id, lv]) => [id, ev.length > 1 ? (lv === top ? 0.1 : rest) : 1]);
    return { pool: {}, featuredIds: [], listIds: [], listNames: [], featuredNames: [], weighted,
      slotNames: res.map(() => []), pityNames: [], pityIds: [], tiers: new Map(), medalInfo: new Map() };
  }
  const medals = catalog.medals || {};
  const reserved = new Set([...res.flatMap((s) => s.names || []), ...(g.pityNames || [])]);
  const names = new Set([...(p.names || []), ...(p.featured || []), ...(g.list || []), ...reserved]);
  const filter = p.filter || [];
  const passes = (m) => !filter.length || filter.includes(m.origin) || filter.includes(m.att);
  for (const s of p.sets || []) {
    const sub = (catalog.subsets || {})[s];
    if (!sub || sub.date > at) continue;
    for (const n of sub.names) if (medals[n] && passes(medals[n])) names.add(n);
  }
  if (p.mode === 'released' || p.mode === 'inherit') {
    const after = p.mode === 'inherit' ? p.inheritAfter || '' : '';
    for (const [n, m] of Object.entries(medals)) if (m.std && m.date > after && m.date <= at) names.add(n);
  }
  const first = catalog.firstRarity || {};
  const out = (r) => first[r] && first[r] > at;
  const rarities = new Set(banner.rarityMix.map(([r]) => r).filter((r) => !out(r)));
  for (const [r] of banner.rarityMix) if (first[r + 1] && first[r + 1] <= at) rarities.add(r + 1);
  // stelle dei nomi riservati: quelle del pool piu' pityStar e le stelle degli slot gia' uscite
  const resRarities = new Set(rarities);
  for (const r of [g.pityStar, ...res.map((s) => s.star), ...res.filter((s) => s.up).map((s) => s.star + 1)]) if (r && !out(r)) resRarities.add(r);
  const feat = new Set(p.featured || []), list = new Set(g.list || []);
  // nomi solo degli slot Trait (Trait Medal #N, I-084 parte B): li da' solo lo slot, non entrano nel pool generico
  const traitOnly = new Set(res.filter((s) => s.kind === 'trait').flatMap((s) => s.names || []));
  for (const n of [...feat, ...list, ...(p.names || []), ...(g.pityNames || []), ...res.filter((s) => s.kind !== 'trait').flatMap((s) => s.names || [])]) traitOnly.delete(n);
  const pool = {}, featuredIds = new Set(), listIds = new Set(), byName = new Map(), resByName = new Map();
  const tiers = new Map(), medalInfo = new Map();
  const add = (m, n, rare, id) => { if (!m.has(n)) m.set(n, {}); (m.get(n)[rare] ||= new Set()).add(id); };
  for (const n of names) {
    for (const [id, rare, rd, tier] of medals[n]?.ids || []) {
      if (rd > at) continue;
      const inPool = rarities.has(rare) && !traitOnly.has(n), inRes = reserved.has(n) && resRarities.has(rare);
      if (!inPool && !inRes) continue;
      tiers.set(id, tier || 0);
      medalInfo.set(id, { name: n, rare });
      if (inRes) add(resByName, n, rare, id);
      if (!inPool) continue;
      (pool[rare] ||= new Set()).add(id);
      add(byName, n, rare, id);
      if (feat.has(n)) featuredIds.add(id);
      if (list.has(n)) listIds.add(id);
    }
  }
  const sorted = (s) => [...s].sort((a, b) => a - b);
  const bySets = (o) => Object.fromEntries(Object.entries(o).map(([r, s]) => [r, sorted(s)]));
  const named = (ns, w, m = byName) => [...new Set(ns)].filter((n) => m.has(n)).map((n) => [n, w(n), bySets(m.get(n))]);
  const pityNames = named(g.pityNames || [], () => 1, resByName);
  const sr = slotRarities(banner), pStar = g.pityStar || (sr[g.pitySlot || 0] ?? sr[0]); // come pityOf: fuori misura -> slot 0
  const pityIds = pityNames.flatMap(([, , v]) => poolOf(v, pityVariantStar(v, pStar)));
  return {
    pool: bySets(pool), featuredIds: sorted(featuredIds), listIds: sorted(listIds),
    listNames: named(g.list || [], (n) => (feat.has(n) ? FEATURED_WEIGHT : 1)),
    featuredNames: named(p.featured || [], () => 1), weighted: [],
    slotNames: res.map((s) => named(s.names || [], (n) => (feat.has(n) ? FEATURED_WEIGHT : 1), resByName)),
    pityNames, pityIds: sorted(new Set(pityIds)), tiers, medalInfo,
  };
}

const poolOf = (pool, rare) => pool[rare] || pool[String(rare)] || [];
// stella della variante data per nome alla stella `star` (pity, liste): la piu' alta sotto (o uguale),
// altrimenti la piu' bassa sopra; v = {rare: [ids]} con le sole varianti gia' uscite alla data
function pityVariantStar(v, star) {
  const have = Object.keys(v).map(Number).filter((r) => poolOf(v, r).length);
  const below = have.filter((r) => r <= star), above = have.filter((r) => r > star);
  return below.length ? Math.max(...below) : Math.min(...above);
}
const pickIndex = (n, rng) => Math.min(n - 1, Math.floor(rng() * n));
function pickWeighted(items, rng) {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * tot;
  for (const [id, w] of items) { if ((x -= w) < 0) return id; }
  return items[items.length - 1][0];
}
// salita dello slot: { to, p } oppure null
function upgradeOf(banner, pool, rare) {
  if (banner.epicBoost && rare < 5 && poolOf(pool, 5).length) return { to: 5, p: EPIC_UPGRADE };
  if (UPGRADE[rare] && poolOf(pool, rare + 1).length) return { to: rare + 1, p: UPGRADE[rare] };
  return null;
}
// Uno slot: prima la promozione (rng), poi l'indice; se la stella estratta e' vuota scende alla prima piena.
function pickSlot(banner, pool, rare, rng) {
  const up = upgradeOf(banner, pool, rare);
  let r = up && rng() < up.p ? up.to : rare;
  while (r >= 1 && !poolOf(pool, r).length) r--;
  const list = poolOf(pool, r);
  if (!list.length) throw new Error(`banner ${banner.drawMedalTypeId}: pool vuoto per ${rare}★`);
  return list[pickIndex(list.length, rng)];
}
// Slot a lista o della pity: prima la medaglia per nome (pesi di `names`), poi la variante alla stella
// dello slot con la salita dello slot normale se la medaglia ha la stella sopra; se la medaglia non ha
// la stella dello slot prende la variante piu' vicina (prima la piu' alta sotto, poi la piu' bassa sopra).
function pickNamed(banner, names, rare, rng) {
  const [, , v] = names[pickWeighted(names.map((x, i) => [i, x[1]]), rng)];
  const up = upgradeOf(banner, v, rare);
  const want = up && rng() < up.p ? up.to : rare;
  const have = Object.keys(v).map(Number).filter((r) => poolOf(v, r).length);
  const below = have.filter((r) => r <= want), above = have.filter((r) => r > want);
  const r = below.length ? Math.max(...below) : Math.min(...above);
  const list = poolOf(v, r);
  return list[pickIndex(list.length, rng)];
}

// Slot a lista: count slot da guarantee.slot (indice in slotRarities, default 0; 1 su B0306-B0308/B0355, dove
// lo slot 7★ e' di una garanzia di stella con Tier e la lista sta sullo slot 6★: correzione finale C).
// Percorso vecchio (catalogo del sotto-progetto 2, senza guarantee.slots).
const isListSlot = (g, i, n) => n > 0 && i >= (g.slot || 0) && i < (g.slot || 0) + n;

// --- Riserve degli slot (catalogo v3, sotto-progetto 2b) ---
const hasSlots = (g) => Array.isArray(g?.slots);
// indici di una riserva: slotsUsed (solo sui conflitti) o slot..slot+count-1
const slotsOf = (s) => s.slotsUsed || Array.from({ length: Math.max(1, s.count || 1) }, (_, k) => s.slot + k);
const reservationIndex = (g, i) => (hasSlots(g) ? g.slots.findIndex((s) => slotsOf(s).includes(i)) : -1);
// riserva che copre lo slot i, o null
function reservationOf(banner, i) {
  const g = banner.guarantee || {};
  const j = reservationIndex(g, i);
  return j >= 0 ? g.slots[j] : null;
}
// variante di una medaglia per nome alla stella `star`: la piu' alta sotto (o uguale), altrimenti la piu'
// bassa sopra (comunque gia' uscita alla data: expandPool tiene solo quelle)
function pickVariant(v, star, rng) {
  const list = poolOf(v, pityVariantStar(v, star));
  return list[pickIndex(list.length, rng)];
}
const pickName = (names, rng) => names[pickWeighted(names.map((x, i) => [i, x[1]]), rng)][2];
const hasAtOrBelow = (v, star) => Object.keys(v).some((r) => Number(r) <= star && poolOf(v, r).length);
// Riserva a lista: solo i nomi con una variante alla stella dello slot o sotto (decisione 1: una lista a 6★
// non da' le medaglie che hanno solo la 7★), niente salita; se nessun nome ce l'ha, tutta la lista.
function pickList(names, rare, rng) {
  const ok = names.filter(([, , v]) => hasAtOrBelow(v, rare));
  return pickVariant(pickName(ok.length ? ok : names, rng), rare, rng);
}
// medaglie dello slot «tier» alla stella r: il pool della stella filtrato per Tier, piu' i nomi alternativi
function tierIds(ex, s, j, r) {
  const ok = (id) => {
    const t = ex.tiers?.get(id) ?? 0;
    return (s.tierMin == null || t >= s.tierMin) && (s.tierMax == null || t <= s.tierMax);
  };
  const ids = new Set(poolOf(ex.pool, r).filter(ok));
  for (const [, , v] of ex.slotNames?.[j] || []) for (const id of poolOf(v, r)) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}
const tierLabel = (s) => (s.tierMin == null ? `<=${s.tierMax}` : s.tierMax == null ? `>=${s.tierMin}`
  : s.tierMin === s.tierMax ? `${s.tierMin}` : `${s.tierMin}-${s.tierMax}`);
const tierWarned = new Set(); // una riga di log per banner e riserva
// Slot «tier»: la salita dello slot normale, poi la medaglia fra quelle del Tier alla stella estratta (se la
// stella sopra non ha medaglie del Tier resta la stella dello slot); Tier vuoto alla data: slot senza filtro.
function pickTier(banner, ex, s, j, rare, rng) {
  const up = upgradeOf(banner, ex.pool, rare);
  const r = up && rng() < up.p ? up.to : rare;
  let ids = tierIds(ex, s, j, r);
  if (!ids.length && r !== rare) ids = tierIds(ex, s, j, rare);
  if (ids.length) return ids[pickIndex(ids.length, rng)];
  const key = `${banner.drawMedalTypeId}:${j}`;
  if (!tierWarned.has(key)) {
    tierWarned.add(key);
    console.log(`  [gacha] ${banner.rowId}: nessuna medaglia del Tier ${tierLabel(s)} a ${rare}★ alla data, slot ${s.slot} senza filtro`);
  }
  return pickSlot(banner, ex.pool, rare, rng);
}
// pity: alla pity-esima estrazione senza bersaglio lo slot pitySlot da' un bersaglio alla stella fissa
// pityStar (se non ancora uscita alla data, la variante piu' alta sotto); con pityGift (medaglia di
// supporto, Present Box nel Task 6) nessuno slot viene sostituito
function pityOf(g, ex, state, n) {
  const gift = !!g.pityGift;
  const on = !!g.pity && (gift || (ex.pityNames || []).length > 0) && (state.sinceFeatured || 0) + 1 >= g.pity;
  const slot = on && !gift ? (g.pitySlot != null && g.pitySlot < n ? g.pitySlot : 0) : -1;
  return { on, slot };
}
function rollReserved(banner, ex, rng, state) {
  const g = banner.guarantee;
  const rares = slotRarities(banner);
  const listOn = g.every ? ((state.draws || 0) + 1) % g.every === 0 : true;
  const pity = pityOf(g, ex, state, rares.length);
  const medalIds = rares.map((rare, i) => {
    if (i === pity.slot) return pickVariant(pickName(ex.pityNames, rng), g.pityStar || rare, rng);
    const j = reservationIndex(g, i), s = j >= 0 ? g.slots[j] : null;
    if (s?.kind === 'list' && listOn && (ex.slotNames?.[j] || []).length) {
      // s.up (D5, Frozen «6 or 7★»): salita dello slot normale (UPGRADE) verso i nomi con la stella sopra
      const top = s.up && UPGRADE[rare] && ex.slotNames[j].some(([, , v]) => poolOf(v, rare + 1).length);
      return pickList(ex.slotNames[j], top && rng() < UPGRADE[rare] ? rare + 1 : rare, rng);
    }
    if (s?.kind === 'tier') return pickTier(banner, ex, s, j, rare, rng);
    if (s?.kind === 'trait' && (ex.slotNames?.[j] || []).length) return pickList(ex.slotNames[j], rare, rng); // Trait Medal #N
    return pickSlot(banner, ex.pool, rare, rng); // trait senza numero noto (6★ di ripiego) e slot liberi
  });
  // pityMode 'every' (2c: B0584, B0770): il contatore si azzera solo quando la pity scatta
  const got = g.pityMode === 'every' ? pity.on : pity.on || medalIds.some((id) => (ex.pityIds || []).includes(id));
  return { medalIds, featured: got, pityFired: pity.on, pitySlot: pity.slot };
}

// Potenziamenti per slot (banner.enhance), dopo la scelta delle medaglie (cosi' i tiri delle medaglie non
// cambiano): boosted (opts.boostedOf(normale, str, def) -> id della riga boosted; solo una medaglia gia'
// estratta dal pool, la boosted non entra mai da sola), preset {dots, guilt} e skills (maxSkill).
// on: {slots}, {names} o {star} con tierMin/tierMax/excludePrime (decisione 8, medal-boost.tierMatch).
function enhanceOn(on, id, i, ex, pitySlot = -1) {
  if (!on) return false;
  if (on.pity) return i === pitySlot; // solo la copia data dalla pity (2c: B0353 «pre-strengthened to 5 dots»)
  if (on.slots) return on.slots.includes(i);
  const info = ex.medalInfo?.get(id);
  if (on.names) return !!info && on.names.includes(info.name);
  if ('star' in on || 'tierMin' in on) {
    const { tierMatch } = require('./medal-boost'); // qui e non in cima: medal-boost richiede gacha-data
    return !!info && tierMatch(on, { rare: info.rare, guiltValue: ex.tiers?.get(id) || 0, name: info.name });
  }
  return false;
}
const dotsOf = (d, rng) => (Array.isArray(d) ? d[0] + pickIndex(d[1] - d[0] + 1, rng) : d);
function enhanceDraw(banner, ex, medalIds, rng, opts, pitySlot = -1) {
  const e = banner.enhance || {};
  const extras = [];
  const ids = medalIds.map((id, i) => {
    const x = { boostedFrom: null, preset: null, skills: null };
    let out = id;
    // voci idonee con la riga boosted nel master: una «guaranteed» vince, altrimenti un solo tiro per slot
    // (BOOST_SMALL_CHANCE anche se lo slot e' coperto da piu' voci «small»: vince la prima)
    const ok = (opts.boostedOf ? e.boosted || [] : []).filter((b) => enhanceOn(b.on, id, i, ex, pitySlot))
      .map((b) => [b.chance, opts.boostedOf(id, b.str, b.def)]).filter(([c, bid]) => bid && (c === 'small' || c === 'guaranteed'));
    const hit = ok.find(([c]) => c === 'guaranteed') || (ok.length && rng() < BOOST_SMALL_CHANCE ? ok[0] : null);
    if (hit) { out = hit[1]; x.boostedFrom = id; }
    const p = (e.preset || []).find((q) => enhanceOn(q.on, id, i, ex, pitySlot));
    if (p) x.preset = { dots: dotsOf(p.dots, rng), guilt: p.guilt ?? null };
    const m = (e.maxSkill || []).find((q) => enhanceOn(q.on, id, i, ex, pitySlot));
    if (m) x.skills = [...m.skills];
    extras.push(x);
    return out;
  });
  return { medalIds: ids, extras };
}

// Estrazione di un banner espanso (ex = expandPool). state = estrazioni gia' fatte dal giocatore su
// quel banner: draws (totale) e sinceFeatured (di fila senza vetrina). Con guarantee.slots (v3) ogni riserva
// pesca dalla sua (list, tier, trait), poi la pity su pitySlot; senza, il percorso vecchio: pity sullo slot 0
// con la vetrina, every: ogni every-esima estrazione gli slot a lista. Poi i potenziamenti (enhanceDraw).
// Risultato: {medalIds, featured, extras, pityFired}. featured = uscito un bersaglio della pity (v3: pityIds;
// vecchio: la vetrina) o pity scattata (azzera la pity in payDraw); pityFired = la pity e' scattata in questa
// estrazione, anche con pityGift (nessuno slot sostituito: il Task 6 da' il regalo nel Present Box).
// extras[i] = {boostedFrom: id normale | null, preset: {dots, guilt} | null, skills: [nomi] | null}.
function rollDraw(banner, ex, rng, state = { draws: 0, sinceFeatured: 0 }, opts = {}) {
  let r;
  if (banner.pool?.mode === 'evolve') {
    if (!ex.weighted.length) throw new Error(`banner ${banner.drawMedalTypeId}: evolve senza medaglie`);
    r = { medalIds: Array.from({ length: banner.lotCount }, () => pickWeighted(ex.weighted, rng)), featured: false, pityFired: false };
  } else if (hasSlots(banner.guarantee)) {
    r = rollReserved(banner, ex, rng, state || {});
  } else {
    const g = banner.guarantee || {};
    const n = (state.draws || 0) + 1;
    const listOn = (ex.listNames || []).length > 0 && (g.every ? n % g.every === 0 : true);
    const listSlots = listOn ? Math.max(1, g.count || 1) : 0;
    const pityOn = !!g.pity && (ex.featuredNames || []).length > 0 && (state.sinceFeatured || 0) + 1 >= g.pity;
    const medalIds = slotRarities(banner).map((rare, i) => {
      if (i === 0 && pityOn) return pickNamed(banner, ex.featuredNames, rare, rng);
      if (isListSlot(g, i, listSlots)) return pickNamed(banner, ex.listNames, rare, rng);
      return pickSlot(banner, ex.pool, rare, rng);
    });
    r = { medalIds, featured: medalIds.some((id) => ex.featuredIds.includes(id)), pityFired: pityOn };
  }
  return { ...r, ...enhanceDraw(banner, ex, r.medalIds, rng, opts || {}, r.pitySlot ?? -1) };
}

// Probabilita' per slot (percento, 2 decimali) per Draw Odds; negli slot a lista le stesse salite dello
// slot normale, con list: true su ogni voce. v3: kind su ogni voce degli slot riservati ('list': la stella
// dello slot al 100%, 'tier' con tier '<=4' / '>=5' / '3-4', 'trait'; 'pity' sullo slot della pity senza riserva).
function slotOdds(banner, ex) {
  const r2 = (x) => Math.round(x * 10000) / 100;
  const g = banner.guarantee || {};
  const base = (rare) => {
    const up = upgradeOf(banner, ex.pool, rare);
    return up ? [{ rare, pct: r2(1 - up.p) }, { rare: up.to, pct: r2(up.p) }] : [{ rare, pct: 100 }];
  };
  if (!hasSlots(g)) {
    const listSlots = (ex.listNames || []).length ? Math.max(1, g.count || 1) : 0;
    return slotRarities(banner).map((rare, i) => {
      const odds = base(rare);
      return isListSlot(g, i, listSlots) ? odds.map((o) => ({ list: true, ...o })) : odds;
    });
  }
  const rares = slotRarities(banner);
  const pitySlot = !g.pity || g.pityGift ? -1 : g.pitySlot != null && g.pitySlot < rares.length ? g.pitySlot : 0;
  return rares.map((rare, i) => {
    const j = reservationIndex(g, i), s = j >= 0 ? g.slots[j] : null;
    if (s?.kind === 'list' && (ex.slotNames?.[j] || []).length) return [{ list: true, rare, pct: 100, kind: 'list' }];
    if (s?.kind === 'tier') {
      // la salita conta solo se la stella sopra ha medaglie del Tier
      const up = upgradeOf(banner, ex.pool, rare);
      const odds = up && tierIds(ex, s, j, up.to).length ? base(rare) : [{ rare, pct: 100 }];
      return odds.map((o) => ({ ...o, kind: 'tier', tier: tierLabel(s) }));
    }
    if (s?.kind === 'trait' && (ex.slotNames?.[j] || []).length) return [{ rare, pct: 100, kind: 'trait', names: ex.slotNames[j].map(([n]) => n) }];
    if (s?.kind === 'trait') return base(rare).map((o) => ({ ...o, kind: 'trait' }));
    return i === pitySlot ? base(rare).map((o) => ({ ...o, kind: 'pity' })) : base(rare);
  });
}

// Abilita' (spec 9.2; notice 50106 VIP Daily Skills to Thrill e 72415 SN+ Falling Price): solo le skill
// che esistono in skill.json, il resto della probabilita' va a «nessuna skill»; per 50106 lo slot ha
// sempre una skill, quindi le probabilita' si riscalano sulle skill presenti. Skill al livello 1.
const SKILL_TABLES = {
  50106: [['Attack Boost II', 5], ['Attack Boost All II', 5], ['Attack Prize Plus', 5], ['Lux Plus', 5], ['Defense Boost II', 5], ['No Cost', 1.70394]],
  72415: [['Attack Boost I', 1.68421], ['Attack Boost All I', 1.26315], ['Poison', 1.26315], ['Paralysis', 1.26315], ['Sleep', 1.26315], ['Defense Boost I', 1.26315]],
};
function rollSkill(spec, slotIndex, skillRows, rng) {
  if (!spec || !SKILL_TABLES[spec.table] || (spec.slots === 'first' && slotIndex !== 0)) return null;
  const byName = new Map([...skillRows.values()].map((r) => [r.name, r.skillId]));
  const items = SKILL_TABLES[spec.table].filter(([n]) => byName.has(n)).map(([n, pct]) => [byName.get(n), pct]);
  if (!items.length) return null;
  if (spec.slots === 'first') return pickWeighted(items, rng);
  let x = rng() * 100;
  for (const [id, pct] of items) { if ((x -= pct) < 0) return id; }
  return null;
}

// Riga del master drawMedalType (47 campi, recon/out/master_types_ww431.json).
// bannerUrl/detailUrl sono percorsi: server.js (servedMasterRows) ci mette davanti l'indirizzo http.
// drawType 1; benefitId 0 (il lucchetto apre l'acquisto in-app: crash, I-134); comment = striscia
// scorrevole sotto il banner, stringa printf (niente % sciolti), visibile con warrantDisplayOfTime 1
// e userWarrantDisplayOfTime 1 nella lista (spike del 16-10, prova 3). warrant = striscia della garanzia:
// {display, number, validComment}; con display != 0 la striscia compare se 1 <= userWarrantDisplayOfTime <= display.
function drawMedalTypeRow({ drawMedalTypeId, name, payType, price, sortId, bannerUrl, detailUrl, comment, warrant }) {
  const w = { display: 1, number: 0, validComment: 1, ...warrant };
  const z = (n) => Array(n).fill(0);
  return {
    drawMedalTypeId, drawType: 1, sortId, name, benefitId: 0, payType, price,
    validFluctuationPrice: 0, fluctuationPrice: z(5), tableId: 0, validLot: 0, lotName: ['', '', ''],
    lotCount: z(3), lotSsr: z(3), lotPsr: z(3), lotSr: z(3), lotPr: z(3), lotR: z(3), lotPn: z(3), lotN: z(3),
    tableIds: z(3), vipcoinNumber: 0, limitedvipcoinNumber: 0, validAdd: 0, addType: 0, addId: 0, addSkillType: 0,
    addSkillId: 0, addSkillLv: 0, addNum: 0, bannerUrl, mypageBanner: 0, detailUrl, dayCount: 0,
    warrantNumberOfTime: w.number, warrantDisplayOfTime: w.display, validComment: w.validComment,
    comment: String(comment).replace(/%(?!d)/g, '%%'), // %d (conto alla rovescia) resta com'e'
    warrantCounterId: 0, warrantTableIds: 0, warrantMedalListIds: [0], warrantMedalRepeat: 0,
    warrantResetMedalListIds: z(10), displayTimeLeft: 0, startDate: '2016-04-07 00:00:00',
    endDate: '2099-12-31 23:59:59', isDeleted: 0,
  };
}

// «once» / «N times in total» (totalLimit, «Available once»: Ruling 28), «once per day» (dayLimit 1 o Free Deal
// VIP) o «N times per day»; '' senza limite
const limitText = (b) => (b.totalLimit ? (b.totalLimit === 1 ? 'once' : `${b.totalLimit} times in total`)
  : b.vipFree || b.dayLimit === 1 ? 'once per day' : b.dayLimit ? `${b.dayLimit} times per day` : '');

const bannerById = (list, id) => list.find((b) => b.drawMedalTypeId === Number(id));

module.exports = {
  CATALOG_ID, UPGRADE, EPIC_UPGRADE, FEATURED_WEIGHT, BOOST_SMALL_CHANCE, SKILL_TABLES, parseRarityMix, slotRarities, loadCatalog,
  MAX_GUILT_FROM, maxGuiltRule, storyDay, shopWindow, asOf, expandPool, limitText, slotOdds, rollDraw, reservationOf, rollSkill, drawMedalTypeRow, bannerById,
};
