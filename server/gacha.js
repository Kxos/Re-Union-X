// Shop > Draw: lista, estrazione e pagine WebView (docs/notes/shop.md; spec 2026-10-16-shop-banner-design.md 9.4-9.7).
// GET /gacha/list (azione 75): gachaList[] (campi tutti obbligatori) e petGachaList[]
// (obbligatorio anche vuoto: senza, «200 ERROR :75»). Il client la richiede a ogni apertura dello Shop
// e dopo ogni estrazione; la chiusura della WebView di Details NON la richiede.
// POST /gacha/draw (azione 76): corpo {drawMedalTypeId, count = lotCount}; il client controlla prima
// jewel/biglietti e 1 posto nel box, poi apre la scena e rilegge GET /user/stone: i jewel li scala il
// server qui. Risposta in server.js (respondGachaDraw).
// Lista PROVVISORIA (fino al sotto-progetto 3): i banner del catalogo estraibili, sbloccati dalla storia
// (unlockQuest) e attivi alla data del punto della storia (i PERMANENT con le loro date originali), piu'
// quelli di `show` (rowId); al massimo SHOP_MAX, i piu' recenti prima. Prezzi dinamici (9.4: mai 0,
// FIRST_FREE/FALLING dal contatore del giocatore); Free Deal VIP: una sola gratuita al giorno fra tutte
// (9.5); payType 4/5/6/9 solo nel catalogo (9.6); payType 8 = valute stagionali separate in
// player.drawTickets, mai due valute insieme nella lista (9.7).
'use strict';
const clock = require('./clock');
const gd = require('./gacha-data');
const { seasonOf, windowText } = require('./gacha-seasons');
const BOOST_PCT = gd.BOOST_SMALL_CHANCE * 100;
const { SKILL_TABLES } = gd;

// Versione dello stile del bollino «KEPT IN SHOP»: sta nell'URL (<id>-kept<N>.png) cosi' il client non riusa le vecchie immagini
const KEPT_STYLE = 2;
const SHOP_MAX = 20; // fino a 19 banner nella stessa settimana dell originale (2020-09-10); prima 8 (I-165)
const WALLET = { 1: 'freeStone', 7: 'limitedDrawTicket1' }; // payType 8: player.drawTickets[currency]
const TICKET_CURRENCIES = ['draw', 'holiday', 'spooky', 'moogle'];
const VIP_FREE = 'vipFree'; // chiave del limite condiviso delle Free Deal VIP (spec 9.5)

// Contatori delle valute payType 8: crea player.drawTickets e migra limitedDrawTicket2 una volta.
function ticketsOf(player) {
  if (!player.drawTickets) {
    player.drawTickets = Object.fromEntries(TICKET_CURRENCIES.map((c) => [c, 0]));
    player.drawTickets.draw = player.limitedDrawTicket2 || 0; // salvataggi del sotto-progetto 1
    delete player.limitedDrawTicket2;
  }
  return player.drawTickets;
}
const walletName = (b) => (b.payType === 8 ? `drawTickets.${b.currency}` : WALLET[b.payType]);
function balance(player, b) {
  if (b.payType === 8) return ticketsOf(player)[b.currency] || 0;
  return player[WALLET[b.payType]] || 0;
}
function spend(player, b, n) {
  if (b.payType === 8) { const t = ticketsOf(player); t[b.currency] = (t[b.currency] || 0) - n; }
  else player[WALLET[b.payType]] = (player[WALLET[b.payType]] || 0) - n;
}
// player.gacha = {day, used: {id: n, vipFree: n}, count: {id: n}, sinceFeatured: {id: n}, listedCurrency}
const gstate = (player) => (player.gacha ||= {});
const drawCount = (player, b) => gstate(player).count?.[b.drawMedalTypeId] || 0;
// Prezzo della prossima estrazione: lo scalino di prices per le estrazioni gia' fatte, mai sotto 1.
function priceFor(b, player) {
  const p = b.prices || [];
  return Math.max(1, p.length ? p[Math.min(drawCount(player, b), p.length - 1)] : 1);
}
const drawable = (b, sizes) => !b.catalogOnly && [1, 7, 8].includes(b.payType) && sizes.has(b.lotCount);
// Prima quest della storia da cui un banner estraibile spende il biglietto di una missione Limited (sp3 5): rewardType 40
// Platinum Ticket (payType 7), 41 Draw Ticket (payType 8, valuta draw). Infinity se nessun banner lo spende.
function ticketUnlockQuest(banners, rewardType, sizes) {
  const spends = rewardType === 40 ? (b) => b.payType === 7 : rewardType === 41 ? (b) => b.payType === 8 && b.currency === 'draw' : () => false;
  return banners.filter((b) => drawable(b, sizes) && spends(b)).reduce((m, b) => Math.min(m, b.unlockQuest), Infinity);
}
// Banner fissabile nello Shop (sp3 6.1): vecchio (finito prima dell'inizio del periodo della tranche, ctx.periodStart),
// sbloccato, estraibile, ne' Free Deal / 1 Jewel (tutti i prezzi <= 1, vipFree, nome «Free...») ne' stagionale.
const isFreeLike = (b) => (b.prices || []).every((x) => x <= 1) || !!b.vipFree || /^Free\b/i.test(b.name || '');
function pinnable(b, ctx) {
  if (!ctx.periodStart || b.catalogOnly || !drawable(b, ctx.sizes)) return false;
  if (b.unlockQuest > ctx.storyQuest && !ctx.show?.has(b.rowId)) return false;
  return (b.end || '2099-12-31') < ctx.periodStart && !isFreeLike(b) && !seasonOf(b);
}
// Il banner di player.gacha.pinned se e' ancora fissabile (altrimenti null; il campo resta nel salvataggio).
function pinnedBanner(banners, player, ctx) {
  const id = player?.gacha?.pinned;
  const b = id && banners.find((x) => x.rowId === id);
  return b && pinnable(b, ctx) ? b : null;
}
const activeOn = (b, day) => b.start <= day && day <= (b.end || '2099-12-31');

// shopFrom/shopTo: settimana della rotazione (gacha-data.shopWindow, I-165): entra ogni banner attivo in almeno un
// giorno della finestra; senza finestra, il solo storyDay (comportamento di prima, test)
// seasonal (banner delle stagioni attive, gia' in ordine, sp3 4.2) e pinned (banner fissato, 6.2) stanno in cima, prima
// della rotazione; ordine di visualizzazione (richiesta dell'utente 20-10): fissato, stagionali, rotazione. La precedenza
// per la valuta payType 8 e il tetto restano stagione > fissato > rotazione (si decide chi sopravvive, poi si ordina); un banner presente anche nella rotazione compare una volta sola (al posto della stagione/del fissato)
function shopBanners(banners, { storyQuest, storyDay, shopFrom, shopTo, sizes, show = new Set(), seasonal = [], pinned = null }) {
  const inside = (b) => (b.start >= shopFrom && (b.end || '2099-12-31') <= shopTo ? 1 : 0);
  const inWindow = (b) => (shopFrom ? b.start <= shopTo && (b.end || '2099-12-31') >= shopFrom : activeOn(b, storyDay));
  const top = [...seasonal, ...(pinned ? [pinned] : [])].filter((b, i, a) => a.findIndex((x) => x.drawMedalTypeId === b.drawMedalTypeId) === i);
  const topIds = new Set(top.map((b) => b.drawMedalTypeId));
  const pick = banners.filter((b) => !topIds.has(b.drawMedalTypeId) && drawable(b, sizes)
    && ((b.unlockQuest <= storyQuest && inWindow(b)) || show.has(b.rowId)))
    // con la finestra, prima i banner che stanno tutti dentro la settimana (non avranno un'altra occasione: con lo Shop
    // pieno restavano fuori), poi i piu' recenti
    .sort((a, b) => (shopFrom ? inside(b) - inside(a) : 0) || (a.start < b.start ? 1 : a.start > b.start ? -1 : a.drawMedalTypeId - b.drawMedalTypeId));
  let currency = null;
  const out = [];
  for (const b of [...top, ...pick]) {
    if (b.payType === 8) { if (currency && currency !== b.currency) continue; currency = b.currency; }
    out.push(b);
    if (out.length === SHOP_MAX) break;
  }
  const k = pinned ? out.findIndex((b) => b.drawMedalTypeId === pinned.drawMedalTypeId) : -1;
  if (k > 0) out.unshift(...out.splice(k, 1));
  return out;
}

// Conto alla rovescia sotto il pulsante (richiesta dell'utente 19-10; etichetta originale Plate_Limit del client,
// displayTimeLeft != 0 della riga drawMedalType -> tempo fino a endDate). Per ogni banner dello Shop
// della settimana `week`: la prima settimana reale in cui la rotazione (gd.shopWindow) lo toglie dallo Shop, entro il
// periodo della tranche (n settimane); null se resta in tutte (nessun conto alla rovescia).
// -> Map drawMedalTypeId -> indice della settimana reale in cui esce (clock.weekStartOf = lunedi' 08:00 UTC).
// seasonal: stagionali della settimana `week`; seasonalAt (opzionale): ms reali -> stagionali attive in quel momento, usata
// per le settimane future (inizio settimana, clock.weekStartOf) cosi' una stagione che comincia o finisce nel periodo
// cambia posti liberi e valuta payType 8 della simulazione; senza, le stagionali restano quelle di `week`.
function shopLeaveWeeks(catalog, { storyQuest, week, rot: rot0, sizes, show, seasonal = [], seasonalAt = null, pinned = null }) {
  const w0 = gd.shopWindow(catalog, storyQuest, week, rot0);
  const rot = rot0 && rot0.day === w0.day ? rot0 : { day: w0.day, week }; // come storyCtx: la rotazione parte da qui
  const fixed = new Set([...seasonal, ...(pinned ? [pinned] : [])].map((b) => b.drawMedalTypeId));
  const at = (w) => {
    const x = gd.shopWindow(catalog, storyQuest, w, rot);
    const sea = w > week && seasonalAt ? seasonalAt(clock.weekStartOf(w)) : seasonal;
    for (const b of sea) fixed.add(b.drawMedalTypeId);
    return new Set(shopBanners(catalog.banners, { storyQuest, storyDay: x.from, shopFrom: x.from, shopTo: x.to, sizes, show, seasonal: sea, pinned }).map((b) => b.drawMedalTypeId));
  };
  const n = w0.n;
  // stagionali (di ogni settimana simulata) e fissato non escono con la rotazione (la stagione ha il suo conto alla rovescia): fuori dalla mappa
  const nowAll = at(week), nexts = [];
  for (let j = 1; j < n; j++) nexts.push(at(week + j)); // riempie `fixed` con le stagionali di tutte le settimane
  const now = new Set([...nowAll].filter((id) => !fixed.has(id))), out = new Map();
  nexts.forEach((next, i) => { for (const id of now) if (!out.has(id) && !next.has(id)) out.set(id, week + i + 1); });
  return out;
}

// Piastra «Banner Catalog» (spec 4.1): Gold Ticket (payType 6, drawTicket3 sempre 0) prezzo 1: pulsante
// grigio, il tocco non manda richieste; Details apre il catalogo (detailUrl del master).
function catalogRow() {
  return gd.drawMedalTypeRow({ drawMedalTypeId: gd.CATALOG_ID, name: 'Banner Catalog', payType: 6, price: 1, sortId: 1,
    bannerUrl: `/web/gacha/img/${gd.CATALOG_ID}.png`, detailUrl: '/web/gacha/catalog', comment: 'Open Details to browse all banners' });
}

// sortId: il client raggruppa le piastre in una mappa per sortId della lista (non quello del master,
// che non legge) e le mostra per sortId crescente, poi drawMedalTypeId: un numero intero diverso per ogni piastra
// (senza, JSON.stringify lo toglie e il client rifiuta la lista: «200 ERROR:75», I-138).
function plate(b, webBase, userLimitedCount, price, sortId, warrant = warrantFields({}), kept = false) {
  return {
    validAdd: 0, drawMedalTypeId: b.drawMedalTypeId, drawType: 1, sortId, payType: b.payType, price,
    lotCount: b.lotCount, isDayLimited: b.dayLimit || b.vipFree || b.totalLimit ? 1 : 0, userLimitedCount,
    userWarrantDisplayOfTime: warrant.userWarrantDisplayOfTime,
    name: b.name, description: b.name, bannerUrl: `${webBase}/web/gacha/img/${b.drawMedalTypeId}${kept ? `-kept${KEPT_STYLE}` : ''}.png`, // -kept: stessa immagine con il bollino «KEPT IN SHOP»
    warrantMedalIds: warrant.warrantMedalIds, drawTicketlimitDate: '2030-12-31 23:59:59',
  };
}

// Striscia della garanzia sulla piastra (sotto-progetto 2b, ricerca §2). Senza pity: la striscia di oggi
// (userWarrantDisplayOfTime 1 con warrantDisplayOfTime 1 del master: compare il comment). Con pity il master ha
// warrantDisplayOfTime = pity e validComment 0 (make-banners.warrantOf): il client scrive «<nome> guaranteed in N
// tries!» con N = userWarrantDisplayOfTime e i nomi di warrantMedalIds, che con validComment 0 NON puo' essere
// vuota (crash, Review Focus 4). N = estrazioni che mancano alla pity (pity - sinceFeatured, mai sotto 1);
// warrantMedalIds = i bersagli alla stella promessa (ex.pityIds; catalogo vecchio senza slots: la vetrina), la
// medaglia del pityGift (Present Box), oppure, se la pity non ha bersagli alla data, 0 (striscia nascosta) e il
// primo id del pool, solo perche' la lista non sia vuota. Senza pool (ex undefined: expandFor ha lanciato, log in
// server.js) o con il pool vuoto (log qui, una riga per banner) gli id vengono dal catalogo: prima le varianti dei
// pityNames, poi una medaglia qualsiasi del banner (vetrina, nomi, liste, sotto-set), infine la prima del catalogo.
// I-153 (analisi in docs/notes/shop.md#i153): con piu' nomi il client unisce «<important>nome</important>» con «, »
// e «, or » prima dell'ultimo (testi 106180302/305/306) e il testo ha un limite di 1024 byte
// (con «<xml>%s</xml>»): oltre J = 963 byte la striscia esce «A guaranteed in !». Un id per nome
// (nameOf = nome della riga medal del master servito; il client toglie gia' i doppioni, si tiene il primo, come lui);
// J <= WARRANT_LIST_MAX: lista dei nomi (validComment 0); oltre, make-banners.warrantOf scrive validComment 1 e un
// testo di categoria; guardWarrant nasconde la striscia se un master vecchio ha ancora validComment 0 oltre il limite.
const WARRANT_LIST_MAX = 900; // margine sotto il limite duro (un «&» escapato costerebbe 4 byte in piu')
const WARRANT_HARD_MAX = 963; // limite del client per N fino a 99: J <= 965 - cifre di N
const utf8Bytes = (s) => Buffer.byteLength(String(s), 'utf8');
const nameGetter = (nameOf) => (typeof nameOf === 'function' ? nameOf : nameOf instanceof Map ? (id) => nameOf.get(id) : null);
// un id per nome, il primo nell'ordine dato (senza nameOf: gli id come sono); un id senza riga medal resta
function warrantDedupe(ids, nameOf) {
  const get = nameGetter(nameOf);
  if (!get) return [...ids];
  const seen = new Set();
  return ids.filter((id) => {
    const n = get(id), k = n === undefined ? `#${id}` : `=${n}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
// J = byte UTF-8 della lista unita dal client: 1 nome = il nome; k >= 2 nomi distinti = somma(23 + byte(nome))
// + 2·(k-2) + 5 (23 = «<important></important>», «, » fra i nomi, «, or » prima dell'ultimo); 0 senza nameOf
function warrantStripBytes(ids, nameOf) {
  const get = nameGetter(nameOf);
  if (!get) return 0;
  const names = [...new Set((ids || []).map(get).filter((n) => n !== undefined))];
  if (names.length < 2) return names.length ? utf8Bytes(names[0]) : 0;
  return names.reduce((sum, n) => sum + 23 + utf8Bytes(n), 0) + 2 * (names.length - 2) + 5;
}

const NO_WARRANT = { userWarrantDisplayOfTime: 1, warrantMedalIds: [] };
const warrantWarned = new Set();
function bannerMedalIds(b, catalog) {
  const medals = catalog?.medals || {}, g = b.guarantee || {}, p = b.pool || {};
  const ids = (names) => names.flatMap((n) => (medals[n]?.ids || []).map(([id]) => id));
  const pity = ids(g.pityNames || []);
  if (pity.length) return [...new Set(pity)].sort((x, y) => x - y);
  const names = [...(p.featured || []), ...(p.names || []), ...(g.list || []), ...(g.slots || []).flatMap((x) => x.names || []),
    ...(p.sets || []).flatMap((k) => catalog?.subsets?.[k]?.names || []), ...Object.keys(medals)];
  const any = ids(names)[0];
  return any ? [any] : [];
}
function warrantFields(b, ex, state = {}, catalog = null, nameOf = null) {
  const g = b.guarantee || {};
  if (!g.pity) return { ...NO_WARRANT, warrantMedalIds: [] };
  const left = Math.max(1, g.pity - (state.sinceFeatured || 0));
  if (g.pityGift) return { userWarrantDisplayOfTime: left, warrantMedalIds: [g.pityGift[1]] };
  const targets = (ex?.pityIds || []).length ? ex.pityIds : Array.isArray(g.slots) ? [] : ex?.featuredIds || [];
  if (targets.length) return { userWarrantDisplayOfTime: left, warrantMedalIds: warrantDedupe(targets, nameOf) };
  const any = Object.values(ex?.pool || {}).flat()[0];
  if (any) return { userWarrantDisplayOfTime: 0, warrantMedalIds: [any] };
  const ids = bannerMedalIds(b, catalog);
  if ((ex || !ids.length) && !warrantWarned.has(b.drawMedalTypeId)) {
    warrantWarned.add(b.drawMedalTypeId);
    console.log(`  [gacha] ${b.rowId} ${b.name}: striscia della pity senza pool${ids.length ? `, warrantMedalIds dal catalogo (${ids.slice(0, 3).join(',')})` : ' e nessuna medaglia nel catalogo: warrantMedalIds vuota'}`);
  }
  return { userWarrantDisplayOfTime: 0, warrantMedalIds: ids };
}

// Difesa (final review 2b, M2): validComment viene dal master servito (drawMedalType.json, make-banners.js), la
// pity dal catalogo vivo. Se i due non sono allineati (catalogo rigenerato senza make-banners, o il contrario) una riga
// con validComment 0 puo' incontrare NO_WARRANT: lista vuota = crash del client. Allora striscia nascosta
// (userWarrantDisplayOfTime 0) e una medaglia per la lista: la vetrina alla data (ex.featuredIds), poi gli id del
// catalogo (bannerMedalIds), il primo id del pool, infine safeMedalId del master; una riga di log per banner.
// I-153: con validComment 0 e J > WARRANT_HARD_MAX (master non rigenerato dopo I-153) striscia nascosta e un solo id,
// una riga di log per banner; con validComment 1 e pity il client non legge warrantMedalIds (il
// comment mostra solo userWarrantDisplayOfTime): basta il primo id.
const commentWarned = new Set();
const stripWarned = new Set();
function guardWarrant(w, b, ex, catalog, validComment, safeMedalId, nameOf = null) {
  const list = w.warrantMedalIds || [];
  if (validComment === 0 && list.length && warrantStripBytes(list, nameOf) > WARRANT_HARD_MAX) {
    if (!stripWarned.has(b.drawMedalTypeId)) {
      stripWarned.add(b.drawMedalTypeId);
      console.log(`  [gacha] ${b.rowId} ${b.name}: striscia della pity di ${warrantStripBytes(list, nameOf)} byte con validComment 0 `
        + `(oltre ${WARRANT_HARD_MAX}, I-153: master da rigenerare con make-banners.js): striscia nascosta, warrantMedalIds [${list[0]}]`);
    }
    return { userWarrantDisplayOfTime: 0, warrantMedalIds: [list[0]] };
  }
  if (validComment === 1 && b.guarantee?.pity && list.length > 1) return { ...w, warrantMedalIds: [list[0]] };
  if (validComment !== 0 || list.length) return w;
  const pick = (ex?.featuredIds || [])[0] ?? bannerMedalIds(b, catalog)[0] ?? Object.values(ex?.pool || {}).flat()[0] ?? safeMedalId;
  const ids = pick != null ? [pick] : [];
  if (!commentWarned.has(b.drawMedalTypeId)) {
    commentWarned.add(b.drawMedalTypeId);
    console.log(`  [gacha] ${b.rowId} ${b.name}: validComment 0 nel master ma nessun bersaglio della pity nel catalogo `
      + `(master e catalogo da rigenerare insieme): striscia nascosta, warrantMedalIds [${ids.join(',')}]`);
  }
  return { userWarrantDisplayOfTime: 0, warrantMedalIds: ids };
}

function catalogPlate(webBase) {
  return plate({ drawMedalTypeId: gd.CATALOG_ID, payType: 6, lotCount: 1, name: 'Banner Catalog' }, webBase, 0, 1, 1);
}

// Limiti giornalieri: al cambio di giorno (clock.dayIndex) si azzera solo «used».
function usedToday(player, key, realMs) {
  const g = gstate(player);
  return g.day === clock.dayIndex(realMs) ? g.used?.[key] || 0 : 0;
}
function dayLeft(player, b, realMs) {
  if (b.vipFree) return Math.max(0, 1 - usedToday(player, VIP_FREE, realMs));
  if (!b.dayLimit) return 0;
  return Math.max(0, b.dayLimit - usedToday(player, b.drawMedalTypeId, realMs));
}
// Estrazioni rimaste per la piastra (userLimitedCount): il minore fra limite del giorno e limite totale
// (totalLimit su player.gacha.count, Ruling 28); 0 se il banner non ha limiti (isDayLimited 0).
function drawsLeft(player, b, realMs) {
  const left = [];
  if (b.vipFree || b.dayLimit) left.push(dayLeft(player, b, realMs));
  if (b.totalLimit) left.push(Math.max(0, b.totalLimit - drawCount(player, b)));
  return left.length ? Math.min(...left) : 0;
}

// exFor(banner) -> expandPool del banner alla data del giocatore (server.js expandFor) e catalog (ripiego senza pool):
// per la striscia della garanzia; validCommentOf(banner) = validComment della riga drawMedalType servita, safeMedalId =
// ultimo ripiego per warrantMedalIds (guardWarrant), nameOf(medalId) = nome della riga medal servita (I-153: un id per
// nome e lunghezza della striscia)
function gachaListData(banners, player, { realMs, webBase, sizes, storyQuest, storyDay, shopFrom, shopTo, show, seasonal, pinned, exFor, catalog, validCommentOf, safeMedalId, nameOf }) {
  ticketsOf(player);
  const list = shopBanners(banners, { storyQuest, storyDay, shopFrom, shopTo, sizes, show, seasonal, pinned });
  gstate(player).listedCurrency = list.find((b) => b.payType === 8)?.currency || 'draw';
  const warrantOfList = (b) => {
    const ex = exFor?.(b);
    return guardWarrant(warrantFields(b, ex, drawState(player, b), catalog, nameOf), b, ex, catalog, validCommentOf?.(b), safeMedalId, nameOf);
  };
  // Catalog sortId 1, poi 10, 20, ... nell'ordine di shopBanners (i piu' recenti prima, spec 4.3).
  return {
    gachaList: [catalogPlate(webBase), ...list.map((b, i) => plate(b, webBase, drawsLeft(player, b, realMs), priceFor(b, player), 10 * (i + 1),
      warrantOfList(b), !!pinned && b.drawMedalTypeId === pinned.drawMedalTypeId))],
    petGachaList: [],
  };
}

function checkDraw(banner, player, body, { realMs, freeSlots, sizes, storyQuest, show }) {
  if (!banner) return `banner ${body?.drawMedalTypeId} sconosciuto`;
  if (banner.catalogOnly) return 'banner solo nel catalogo';
  if (![1, 7, 8].includes(banner.payType)) return `payType ${banner.payType} non estraibile`;
  if (banner.unlockQuest > storyQuest && !show?.has(banner.rowId)) return 'banner bloccato';
  if (!sizes.has(banner.lotCount)) return `animazione per ${banner.lotCount} medaglie assente`;
  if (Number(body?.count) !== banner.lotCount) console.log(`  [gacha] count ${body?.count} diverso da lotCount ${banner.lotCount}: vale lotCount`);
  if (banner.totalLimit && drawCount(player, banner) >= banner.totalLimit) return 'limite totale raggiunto';
  if (banner.vipFree && dayLeft(player, banner, realMs) < 1) return 'estrazione gratuita VIP gia\' usata oggi';
  if (!banner.vipFree && banner.dayLimit && dayLeft(player, banner, realMs) < 1) return 'limite giornaliero raggiunto';
  const price = priceFor(banner, player);
  if (balance(player, banner) < price) return `${walletName(banner)} ${balance(player, banner)} < ${price}`;
  if (freeSlots < banner.lotCount) return `box: ${freeSlots} posti per ${banner.lotCount} medaglie`;
  return null;
}

// Paga l'estrazione e aggiorna i contatori; gotFeatured = uscita una medaglia in vetrina (pity).
function payDraw(banner, player, realMs, gotFeatured) {
  const price = priceFor(banner, player);
  spend(player, banner, price);
  const g = gstate(player), id = banner.drawMedalTypeId;
  (g.count ||= {})[id] = (g.count[id] || 0) + 1;
  (g.sinceFeatured ||= {})[id] = gotFeatured ? 0 : (g.sinceFeatured[id] || 0) + 1;
  if (banner.vipFree || banner.dayLimit) {
    const day = clock.dayIndex(realMs);
    if (g.day !== day) { g.day = day; g.used = {}; }
    const key = banner.vipFree ? VIP_FREE : id;
    (g.used ||= {})[key] = (g.used[key] || 0) + 1;
  }
  return price;
}

const drawState = (player, b) => ({ draws: drawCount(player, b), sinceFeatured: gstate(player).sinceFeatured?.[b.drawMedalTypeId] || 0 });

// gachaBonus addType 1 = nessun bonus (con altri valori la scena apre MedalInfo_DrowBonus, assente);
// effectNumbers 0 = nessun effetto (1/2 aprono Draw_RareMedal/Draw_LimitRareMedal: findings.md §3)
function drawResultFields(userMedalIds, firstIds) {
  return { gachaBonus: { addType: 1, number: 0, userMedalIds: [] }, firstGetUserMedalIds: firstIds, userMedalIds, effectNumbers: userMedalIds.map(() => 0) };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAY = { 1: 'Jewels', 4: 'Bronze Tickets', 5: 'Silver Tickets', 6: 'Gold Tickets', 7: 'Platinum Tickets', 8: 'Draw Tickets' };
const CURRENCY_NAME = { spooky: 'Spooky Cookies', moogle: 'Moogle Points', holiday: 'Holiday Draw Tickets', draw: 'Draw Tickets' };
// payType sconosciuto: ripiega su Jewels (1) o Tickets, senza lanciare; payType 8: valuta del banner
const unitOf = (b) => (b.payType === 8 ? CURRENCY_NAME[b.currency] || PAY[8] : PAY[b.payType] || (b.payType === 1 ? 'Jewels' : 'Tickets'));
const priceText = (b, price) => `${price} ${price === 1 ? unitOf(b).replace(/s$/, '') : unitOf(b)}`;
const num = (n) => n.toLocaleString('en-US');
// Riga sui gradini di prezzo (FIRST_FREE o in calo a ogni estrazione); '' se il prezzo e' unico.
function priceSteps(b) {
  const p = b.prices || [];
  if (p.length < 2) return '';
  if (p[0] === 0) return `<p class="n">First draw: 1 ${unitOf(b).replace(/s$/, '')}, then ${num(p[1])} ${unitOf(b)}.</p>`;
  return `<p class="n">Price falls with each draw: ${p.map(num).join(' → ')} ${unitOf(b)}.</p>`;
}
const priceLine = (b) => (b.catalogOnly === 'INCOMPLETE' ? ''
  : `${esc(priceText(b, firstPrice(b)))}, ${b.lotCount ?? '?'} Medal${b.lotCount === 1 ? '' : 's'}`);
const firstPrice = (b) => Math.max(1, (b.prices || [])[0] || 1);
// Stile delle pagine originali (reference\shop_odds_details\NOTE.md: notice 46003 da Wayback e screenshot di Draw
// Odds): fondo #043654, testo bianco spaziato, titoli «■» azzurri #00d4ed, frasi chiave arancio/giallo, tabelle con
// bordi bianchi e intestazione #365e76, sezioni gialle «6★Medals» con «↑PAGE TOP», nomi colorati per attributo.
// side: HTML accanto al titolo, a destra (pulsante «⚙ Filters» del Catalog)
function page(title, body, cls = '', side = '') {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;background:#043654;color:#fff;font:17px/1.8 sans-serif;letter-spacing:.4px;padding:6px 18px 40px}'
    + 'h1{font-size:22px;margin:8px 0 4px;color:#fff}h2{color:#00d4ed;font-size:18px;margin:20px 0 6px}h2:before{content:"\\25A0  "}'
    + 'h3{color:#ffcd4a;font-size:19px;margin:16px 0 4px}a{color:#00d4ed}p{margin:4px 0 8px}'
    + 'img{width:100%;max-width:640px;height:auto;display:block;margin:8px 0}'
    + '.b{border-bottom:2px solid #9fb7c6;padding:10px 0 16px}hr{border:0;border-top:2px solid #9fb7c6;margin:20px 0}'
    + '.n{color:#b9cfdc;font-size:15px}.s{display:inline-block;background:#1a6fa8;border-radius:12px;padding:0 12px;font-size:14px;margin:4px 0}'
    + '.s-now{background:#2e9e3e;font-weight:bold}.s-now:before{content:"\\25B6  "}.s-later{background:#1a6fa8}.s-pinned{background:#b8860b;font-weight:bold}.b.pinned{border-left:5px solid #b8860b;padding-left:10px}.s-locked{background:#5a6470;color:#e0e6ea}.s-locked:before{content:"\\1F512  "}.s-size,.s-catalog{background:transparent;border:1px solid #8aa3b3;color:#b9cfdc}.b.now{border-left:5px solid #2e9e3e;padding-left:10px}.b.locked img{opacity:.55;filter:grayscale(.6)}'
    + '.k{color:#ffa500;font-weight:bold}.y{color:#ffcd4a;font-weight:bold}'
    + 'table{width:97%;margin:6px auto 10px;border-collapse:collapse;table-layout:fixed;font-size:85%}'
    + 'th,td{border:1px solid #fff;padding:4px 8px;text-align:center;vertical-align:middle}th{background:#365e76;font-weight:normal}'
    + 'td.l{text-align:left}ul{margin:4px 0 8px;padding-left:22px}li{margin:3px 0}'
    + '.ml{columns:3;column-gap:18px;list-style:none;padding:0;font-size:15px;line-height:1.6}.ml li{break-inside:avoid}'
    + '.p{color:#ff4a74}.g{color:#5cd94a}.m{color:#62a7ff}.f{font-weight:bold;text-decoration:underline}'
    + '.why{border-left:4px solid #8aa3b3;background:#0a4466;padding:6px 12px;margin:8px 0 4px;font-size:15px;line-height:1.6}'
    + '.why ol{margin:4px 0;padding-left:22px}.why li{margin:2px 0}.why .v{margin:8px 0 2px;padding:6px 10px;background:#0d5a86;border-radius:6px;color:#ffcd4a}.why .v b{color:#fff}.why.now{border-color:#2e9e3e}.why.locked{border-color:#7d8894}.why.later{border-color:#1a6fa8}'
    + '.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(2,24,40,0),rgba(2,24,40,.92) 35%)}'
    + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;'
    + 'font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);'
    + 'box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5);text-shadow:0 1px 2px #0a2a6a}'
    + '.back span{display:inline-block;margin-left:12px;width:14px;height:9px;border:3px solid #fff;border-left:0;border-radius:0 8px 8px 0;vertical-align:1px;position:relative}.back span:after{content:"";position:absolute;left:-7px;bottom:-8px;border-style:solid;border-width:6px 9px 6px 0;border-color:transparent #fff transparent transparent}'
    + 'body.hb{padding-bottom:90px}'
    + '.pin{margin:10px 0}.btn{display:inline-block;padding:7px 22px;border-radius:10px;border:2px solid #ffe08a;color:#fff;text-decoration:none;font:bold 18px sans-serif;background:linear-gradient(#e0a020,#a8700a)}'
    + '.pinmsg{display:none;border:3px solid #5cd94a;background:#0d4a2a;border-radius:10px;padding:10px 14px;margin:10px 0;text-align:center;font:bold 22px/1.3 sans-serif;color:#fff;box-shadow:0 0 12px rgba(92,217,74,.5)}'
    + '.pinmsg small{display:block;font:15px/1.4 sans-serif;color:#e6f5ea;margin-top:5px}.pinmsg.off{border-color:#ffa500;background:#5a3a08;box-shadow:0 0 12px rgba(255,165,0,.5)}.pinmsg.err{border-color:#ff4a74;background:#5a1224;box-shadow:none}'
    + '.top{text-align:right;font-size:15px}.box{border:2px solid #ffcd4a;padding:6px 10px;margin:8px 0}</style></head><body' + (cls ? ` class="${cls}"` : '') + '>'
    + `${side ? `<div class="hdr"><h1>${esc(title)}</h1>${side}</div>` : `<h1>${esc(title)}</h1>`}${body}</body></html>`;
}

// Ultima quest della storia restaurata (spec 4.4): oltre, i banner restano bloccati «in attesa dell'aggiornamento».
const RESTORED_QUEST = 979; // 525 fino al 21-10; poi le missioni 526-979 (I-009)
const FUTURE = ' — coming with a future update';
const CATALOG_ONLY_TEXT = {
  PVP_TICKETS: `Requires PvP tickets${FUTURE}`, DRAW_POINTS: `Draw Points${FUTURE}`,
  VIP_TWIN: 'VIP variant, not reproduced', INCOMPLETE: 'Original details missing — not available',
  // messo da server.js (sanitizeBanners): uno slot senza medaglie, es. le Blue Fairy che arrivano col PvP
  NO_MEDALS: `Medals not available yet${FUTURE}`,
};
// Stato di un banner per catalogo e dettagli. ctx = {storyQuest, sizes, show, shown}: shown = drawMedalTypeId nella lista dello Shop.
function stateOf(b, ctx) {
  if (b.catalogOnly) return { key: 'catalog', text: CATALOG_ONLY_TEXT[b.catalogOnly] || 'Not available' };
  if (b.unlockQuest > ctx.storyQuest && !ctx.show?.has(b.rowId)) {
    return { key: 'locked', text: `Unlocks after Story Quest ${b.unlockQuest}${b.unlockQuest > RESTORED_QUEST ? FUTURE : ''}` };
  }
  if (!ctx.sizes.has(b.lotCount)) return { key: 'size', text: 'This draw size is not available yet' };
  if (ctx.pinnedRowId === b.rowId && pinnable(b, ctx)) return { key: 'pinned', text: '📌 Kept in the Shop' };
  if (ctx.shown?.has(b.drawMedalTypeId)) return { key: 'now', text: 'In the Shop now' };
  return { key: 'later', text: `Not in the Shop now${pinnable(b, ctx) ? ' — can be kept in the Shop' : ''}` };
}

const dates = (b) => `${esc(b.start)} to ${esc(b.end || 'open end')}${b.end && b.endSource !== 'original' ? ' (end date reconstructed)' : ''}`;
const r2 = (x) => Math.round(x * 10000) / 100;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
const rar = (o) => `${o.rare}★ ${o.pct}%`;

// «<=4» -> «4 or lower», «>=5» -> «5 or higher» (etichette di slotOdds)
const tierWords = (t) => String(t).replace(/^<=(\d+)$/, '$1 or lower').replace(/^>=(\d+)$/, '$1 or higher');
// Tabella «Medal | Rarity | Probability» (o i livelli di un banner evolve), condivisa da dettagli e Draw Odds; le
// posizioni consecutive con le stesse probabilita' diventano una riga sola («Medal 2-10»).
function oddsTable(banner, ex, medalNames) {
  if (banner.pool?.mode === 'evolve') {
    return '<table><tr><th>Medal</th><th>Probability</th></tr>'
      + (ex.weighted || []).map(([id, w]) => `<tr><td class="l">${esc(medalNames?.get(id) || `#${id}`)}</td><td>${r2(w)}%</td></tr>`).join('') + '</table>';
  }
  const every = banner.guarantee?.every;
  const rows = gd.slotOdds(banner, ex).map((s) => {
    const lead = s[0]?.list ? `${every ? `every ${ordinal(every)} draw: ` : ''}one of the listed Medals (featured Medals twice as likely)` : '';
    const kind = s[0]?.kind === 'tier' ? `Tier ${tierWords(s[0].tier)}` : s[0]?.kind === 'trait' ? (s[0].names ? s[0].names.map(traitLabel).join(' or ') : 'Trait Medal slot') : s[0]?.kind === 'pity' ? 'guaranteed Medal slot' : '';
    return { what: [kind, lead].filter(Boolean).join(', '), odds: s };
  });
  const groups = [];
  rows.forEach((r, i) => {
    const last = groups[groups.length - 1];
    if (last && last.what === r.what && JSON.stringify(last.odds) === JSON.stringify(r.odds)) last.to = i + 1;
    else groups.push({ ...r, from: i + 1, to: i + 1 });
  });
  return '<table><tr><th style="width:26%">Medal</th><th>Rarity</th><th style="width:22%">Probability</th></tr>' + groups.map((g) => {
    const label = `Medal ${g.from}${g.to > g.from ? `-${g.to}` : ''}`;
    const span = g.odds.length > 1 ? ` rowspan="${g.odds.length}"` : '';
    return g.odds.map((o, k) => `<tr>${k ? '' : `<td${span}>${label}${g.what ? `<div class="n">${esc(g.what)}</div>` : ''}</td>`}`
      + `<td><span class="y">${o.rare}★</span></td><td>${o.pct}%</td></tr>`).join('');
  }).join('') + '</table>';
}

function skillSection(banner, skillNames) {
  const spec = banner.skill;
  const rows = (SKILL_TABLES[spec?.table] || []).filter(([n]) => !skillNames || skillNames.has(n));
  if (!rows.length) return '';
  const who = spec.slots === 'first' ? 'the first Medal of the draw' : 'every Medal of the draw';
  return `<h2>Skills</h2><p class="n">Original rates (notice). Chance of each skill on ${who}; other Medals have no skill.</p>`
    + `<table><tr><th>Skill</th><th style="width:30%">Probability</th></tr>${rows.map(([n, pct]) => `<tr><td class="l">${esc(n)}</td><td>${pct}%</td></tr>`).join('')}</table>`;
}

// Garanzia scritta ma senza medaglie estraibili alla data del banner (lista o vetrina vuote in expandPool):
// i dettagli lo dicono invece di promettere una garanzia che non scatta (correzione finale D).
const NOT_REPRODUCED = 'This guarantee is not reproduced yet.';
// v3 (slots): i bersagli sono ex.pityNames (o il regalo pityGift, che non dipende dal pool); percorso vecchio: ex.featuredNames.
const hasSlotsOf = (banner) => Array.isArray(banner.guarantee?.slots);
const pityHasTargets = (banner, ex) => !ex || (hasSlotsOf(banner)
  ? !!banner.guarantee.pityGift || (ex.pityNames || []).length > 0 : (ex.featuredNames || []).length > 0);
// nomi del catalogo in minuscolo -> «HD Axel», «Illustrated Kairi [EX]»
const UPPER_WORDS = new Set(['hd', 'ex', 'sp', 'sn', 'dx', 'ii', 'iii', 'iv']);
const niceName = (n) => String(n).replace(/[A-Za-z0-9+]+/g, (w) => (UPPER_WORDS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
// nome del catalogo -> nome del master (medal.json) via gli id di ex (medalInfo, pityNames, slotNames); senza id, niceName
function namer(ex, medalNames) {
  const ids = new Map();
  for (const [id, info] of ex?.medalInfo || []) if (!ids.has(info.name)) ids.set(info.name, id);
  for (const [n, , v] of [...(ex?.pityNames || []), ...(ex?.slotNames || []).flat()]) {
    const id = Object.values(v || {}).flat()[0];
    if (id != null && !ids.has(n)) ids.set(n, id);
  }
  return (n) => (ids.has(n) && medalNames?.get(ids.get(n))) || niceName(n);
}
const niceList = (a, nm = niceName) => (a || []).map(nm).join(', ');
const pityText = (banner, ex, medalNames) => {
  const g = banner.guarantee;
  const who = hasSlotsOf(banner) && (g.pityNames || []).length ? `${niceList(g.pityNames, namer(ex, medalNames))}${g.pityStar ? ` (${g.pityStar}★)` : ''}` : 'Featured Medal';
  if (hasSlotsOf(banner) && g.pityGift) return esc(`${who} is sent to your Present Box (original: included in the draw) within ${g.pity} draws.`);
  // pityMode 'every' (B0584, B0770): il notice dice che il contatore non si azzera se il bersaglio esce da solo
  if (g.pityMode === 'every') return esc(`${who} guaranteed every ${g.pity} draws (original): the count does not restart when one of these Medals comes out earlier.${pityHasTargets(banner, ex) ? '' : ` ${NOT_REPRODUCED}`}`);
  return esc(`${who} guaranteed within ${g.pity} draws (original).${pityHasTargets(banner, ex) ? '' : ` ${NOT_REPRODUCED}`}`);
};
// v3: una riserva a lista con nomi scritti ma nessuna medaglia estraibile alla data (ex.slotNames[j] vuoto)
const listLost = (banner, ex) => !!ex && (hasSlotsOf(banner)
  ? banner.guarantee.slots.some((s, j) => s.kind === 'list' && (s.names || []).length && !(ex.slotNames?.[j] || []).length)
  : (banner.guarantee?.list || []).length && !(ex.listNames || []).length);

// Righe dei Details per le garanzie v3 e i potenziamenti (catalogo version 3); vuoto senza guarantee.slots/enhance.
const tierRange = (s) => (s.tierMin == null && s.tierMax == null ? '' : s.tierMin == null ? ` Tier ${s.tierMax} or lower`
  : s.tierMax == null ? ` Tier ${s.tierMin} or higher` : s.tierMin === s.tierMax ? ` Tier ${s.tierMin}` : ` Tier ${s.tierMin}-${s.tierMax}`);
function onText(on, nm) {
  if (on?.pity) return 'Guaranteed Medal (pity)';
  if (on?.slots) return `Medal ${on.slots.map((i) => i + 1).join(', ')}`;
  if (on?.names) return niceList(on.names, nm);
  if (on && ('star' in on || 'tierMin' in on)) {
    return `${on.star ? `${on.star}★` : 'Any'}${tierRange(on)} Medals${on.excludePrime ? ' (not Prime)' : ''}`;
  }
  return 'Eligible Medals';
}
// Trait Medal #N -> «Trait Medal #N (for <medaglia>)» (server/trait_medals.json, I-084 parte B)
const TRAIT_FOR = new Map(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'trait_medals.json'), 'utf8')).map((e) => [e.n, e.name]));
const traitKnown = (n) => TRAIT_FOR.has(Number((/^trait medal #(\d+)$/.exec(n) || [])[1]));
function traitLabel(n) {
  const m = /^trait medal #(\d+)$/.exec(n);
  const name = m && TRAIT_FOR.get(Number(m[1]));
  return m ? `Trait Medal #${m[1]}${name ? ` (for ${name})` : ''}` : niceName(n);
}
const NOT_REPRODUCED_KINDS = {
  trait: 'Trait Medal: not reproduced where the Medal it belongs to is unknown (numbers missing from the surviving lists), a regular Medal of the same rarity instead.',
  traitSlots: 'Trait Medal slots: not reproduced, regular Medals of the same rarity instead.',
  skill: 'Guaranteed max-level Skill: not reproduced for Skills that do not exist in this restoration.',
  epic: 'Epic-only draw: not reproduced, the full set of Medals is drawn.',
  pity: 'Pity Medal: not reproduced, the target Medal is not available in this restoration.',
  imitation: 'Imitation Medal bonus: not reproduced.',
};
// riga della regola 13-bis alla data del banner (gacha-data.MAX_GUILT_FROM); '' prima del 2019-01-01
function ruleLine(at) {
  const tiers = Object.keys(gd.MAX_GUILT_FROM).filter((k) => gd.maxGuiltRule(7, Number(k), at));
  return tiers.length ? `Any 7★ Tier ${tiers.length > 1 ? `${tiers[0]}-${tiers[tiers.length - 1]}` : tiers[0]} Medal: comes with its Special Attack Bonus maxed (original)` : '';
}
function guaranteeSection(banner, ex, medalNames, at) {
  const nm = namer(ex, medalNames);
  const g = banner.guarantee || {}, e = banner.enhance || {}, out = [];
  for (const s of g.slots || []) {
    const n = s.count || 1;
    if (s.kind === 'tier') out.push(`${n}x ${s.star}★${tierRange(s)}${(s.names || []).length ? ` (or ${niceList(s.names, nm)})` : ''}`);
    else if (s.kind === 'trait' && (s.names || []).some(traitKnown)) out.push(`${n}x ${s.names.map((t) => traitLabel(t).replace(' (for ', ` (${s.star}★, for `)).join(' or ')}`);
    else if (s.kind === 'trait') out.push(`${n}x Trait Medal (${s.star}★)`);
    else out.push(`${n}x one of the listed Medals (${s.star}★${s.up && gd.UPGRADE?.[s.star] ? `, ${Math.round(gd.UPGRADE[s.star] * 100)}% chance of ${s.star + 1}★, reconstructed` : ''})`);
  }
  // testo per voce (2c/G10): prima ogni preset diceva «Special Attack Bonus maxed», anche con 1-3 o 0 pallini
  const presetText = (p) => (p.guilt === 'max' ? 'comes with its Special Attack Bonus maxed'
    : p.dots === 'max' ? 'comes with all Special Attack dots filled'
      : Array.isArray(p.dots) ? `comes with ${p.dots[0]} to ${p.dots[1]} Special Attack dots`
        : `comes with ${p.dots} Special Attack dot${p.dots === 1 ? '' : 's'}`);
  for (const p of e.preset || []) out.push(`${onText(p.on, nm)}: ${presetText(p)} (original)`);
  // decisione 13-bis: con i preset elencati, la regola generale delle 7★ di Tier 9-10 alla data del banner (server.js
  // respondGachaDraw), perche' i preset su altri slot non facciano pensare il contrario
  if ((e.preset || []).length && (banner.rarityMix || []).some(([r]) => r >= 7) && ruleLine(at)) out.push(ruleLine(at));
  for (const b of e.boosted || []) {
    const stats = [b.str ? `+${b.str} STR` : '', b.def ? `+${b.def} DEF` : ''].filter(Boolean).join(', ');
    const rec = b.on && ('star' in b.on || 'tierMin' in b.on) ? ', reconstructed' : ''; // valori nostri: la frase non li dava
    out.push(b.chance === 'guaranteed' ? `${onText(b.on, nm)}: boosted version guaranteed (${stats}${rec})`
      : `${onText(b.on, nm)}: Small chance of a boosted version (${stats}${rec}): ${BOOST_PCT}% per eligible Medal (reconstructed)`);
  }
  for (const m of e.maxSkill || []) out.push(`${onText(m.on, nm)}: Max-level Skill (${m.skills.map(niceName).join(', ')})`);
  for (const k of e.notReproduced || []) if (NOT_REPRODUCED_KINDS[k]) out.push(NOT_REPRODUCED_KINDS[k]);
  const box = g.erratum ? `<div class="box">${esc(g.erratum)}</div>` : '';
  return `${out.length ? `<h2>Guarantees and bonuses</h2><ul>${out.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${box}`;
}

// classe di colore dell'attributo (medal.attribute: 1 Power, 2 Speed, 3 Magic), come i nomi nei notice originali
const ATTR_CLASS = { 1: 'p', 2: 'g', 3: 'm' };
// cosa vuol dire lo stato del banner (richiesta dell'utente 19-10: «Not in the Shop now» non si capiva)
const STATE_WHY = {
  now: 'You can draw from this banner in the Shop now.',
  locked: 'Clear the Story Quest above to reach the date of this banner. In the original game banners followed the calendar; here they follow your progress in the Story.',
};
// «Not in the Shop now» con la rotazione settimanale (I-165): passi brevi con le date vere del periodo e della
// settimana mostrata, poi la risposta per questo banner in evidenza (HTML, testi gia' sicuri)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
function laterWhy(banner, w, ctx) {
  const sea = seasonOf(banner);
  if (sea) return `<p class="v">Seasonal banner: it returns to the top of the Shop every year, <b>${windowText(sea)}</b> (UTC, real calendar), when it is the most recent unlocked edition of its season.</p>`;
  if (!w) return esc('This banner is not in the Shop this week.');
  const end = banner.end || '2099-12-31';
  let verdict;
  if (end < w.day) verdict = 'This banner ran <b>before</b> your period, so it will not come back to the Shop'
    + (pinnable(banner, ctx || {}) ? (ctx.fromCatalog ? ', unless you keep it in the Shop with the button below' : ', unless you keep it in the Shop from the Banner Catalog') : '') + '. You can still see its Medals and rates here.';
  else if (banner.start > w.periodEnd) verdict = 'This banner comes in a <b>later period</b>: keep going in the Story.';
  else {
    for (let d = 1; d <= w.n && !verdict; d++) {
      const k = (w.k + d) % w.n;
      const from = new Date(Date.parse(w.day + 'T00:00:00Z') + 7 * k * 86400000).toISOString().slice(0, 10);
      const to = new Date(Math.min(Date.parse(from) + 6 * 86400000, Date.parse(w.periodEnd))).toISOString().slice(0, 10);
      if (banner.start <= to && end >= from) verdict = `It comes to the Shop <b>${d === 1 ? 'next Monday' : `in ${d} weeks (on a Monday)`}</b>, when the Shop shows ${niceDay(from)} - ${niceDay(to)}.`;
    }
    verdict ||= 'It is in your period, but the Shop is full in its weeks.';
  }
  const quests = w.qFrom ? ` (Story Quests ${w.qFrom}-${w.qTo})` : '';
  return '<b>How the Shop works</b><ol>'
    + `<li>Your progress in the Story${quests} matches this period of the original calendar: <b>${niceDay(w.day)} - ${niceDay(w.periodEnd)}</b>.</li>`
    + `<li>The Shop shows one week of it at a time. This week: <b>${niceDay(w.from)} - ${niceDay(w.to)}</b>.</li>`
    + `<li>Every Monday it moves to the next week${w.n > 1 ? `; after the last one it starts again (${w.n} weeks in this period)` : ' (this period is a single week)'}.</li></ol>`
    + `<p class="v">${verdict}</p>`;
}
// Codice condiviso (ES5, XMLHttpRequest: WebView di Android 9) dei pulsanti «Keep in the Shop» / «Remove from the Shop»
// di Details e Catalog: l'elemento porta data-pin (URL del POST) e data-on (1 = fissa, 0 = toglie); khuxPin manda il
// POST, mostra nel riquadro `box` la conferma ben visibile (scorrendo fino a lei) e chiama onOk(fissato).
const PIN_JS = 'var KHUX_PIN={1:["Pinned!","Leave and re-enter the Shop to see it.","pinmsg"],0:["Removed.","Leave and re-enter the Shop.","pinmsg off"]};'
  + 'function khuxSet(el,id,pinned){el.setAttribute("data-pin",pinned?"/web/gacha/unpin":"/web/gacha/pin/"+id);el.setAttribute("data-on",pinned?"0":"1");el.textContent=pinned?"Remove from the Shop":"\uD83D\uDCCC Keep in the Shop";}'
  + 'function khuxSay(box,cls,head,sub){box.className=cls;box.innerHTML="";var b=document.createElement("div"),s=document.createElement("small");b.textContent=head;s.textContent=sub;box.appendChild(b);box.appendChild(s);box.style.display="block";if(box.scrollIntoView)box.scrollIntoView(false);}'
  + 'function khuxPin(el,box,onOk){var on=el.getAttribute("data-on")==="1",m=KHUX_PIN[on?1:0],x=new XMLHttpRequest();x.open("POST",el.getAttribute("data-pin"));'
  + 'x.onload=function(){if(x.status===200){khuxSay(box,m[2],m[0],m[1]);if(onOk)onOk(on);}else khuxSay(box,"pinmsg err","Could not change the Shop","This banner cannot be kept.");};'
  + 'x.onerror=function(){khuxSay(box,"pinmsg err","Could not reach the server","Try again.");};x.send("");return false;}';
// Pulsante dei Details (solo dal Catalog): dopo il POST sparisce e al suo posto compare il riquadro di conferma.
function pinButton(banner, ctx) {
  if (!ctx?.fromCatalog || !pinnable(banner, ctx)) return '';
  const pinned = ctx.pinnedRowId === banner.rowId;
  const url = pinned ? '/web/gacha/unpin' : `/web/gacha/pin/${banner.drawMedalTypeId}`;
  const repl = !pinned && ctx.pinnedRowId && ctx.pinnedName ? `<div class="n">Replaces: ${esc(ctx.pinnedName)}</div>` : '';
  return `<div class="pin">${repl}<a class="btn" id="pinbtn" href="#" data-pin="${url}" data-on="${pinned ? 0 : 1}" `
    + `onclick="return khuxPin(this,document.getElementById('pinmsg'),function(){document.getElementById('pinbtn').style.display='none';})">${pinned ? 'Remove from the Shop' : '📌 Keep in the Shop'}</a><div id="pinmsg" class="pinmsg"></div></div>`
    + `<script>${PIN_JS}</script>`;
}
function detailPage(banner, ex, medalNames, ctx) {
  const evolve = banner.pool?.mode === 'evolve';
  const st = stateOf(banner, ctx);
  const pity = banner.guarantee?.pity ? `<p class="k">★ ${pityText(banner, ex, medalNames)}</p>` : '';
  const garanzie = !evolve && ex && banner.rarityMix?.length ? guaranteeSection(banner, ex, medalNames, gd.asOf(banner, ctx?.storyDay || banner.start)) : '';
  const gtext = [banner.guaranteesText, listLost(banner, ex) ? NOT_REPRODUCED : ''].filter(Boolean).map(esc).join(' ');
  const rated = !!(ex && banner.rarityMix?.length) && banner.catalogOnly !== 'INCOMPLETE';
  const featured = new Set(ex?.pityIds || []);
  const attr = ctx?.medalAttr;
  const pool = evolve || !rated ? '' : Object.entries(ex.pool).sort((a, b) => b[0] - a[0]).map(([r, ids]) => {
    const byName = new Map();
    for (const id of ids) {
      const n = medalNames.get(id) || `#${id}`;
      if (!byName.has(n)) byName.set(n, { cls: ATTR_CLASS[attr?.get(id)] || '', f: false });
      if (featured.has(id)) byName.get(n).f = true;
    }
    const names = [...byName.keys()].sort();
    return `<h3>${r}★Medals (${names.length})</h3><ul class="ml">${names.map((n) => {
      const v = byName.get(n);
      const cls = [v.cls, v.f ? 'f' : ''].filter(Boolean).join(' ');
      return `<li${cls ? ` class="${cls}"` : ''}>${esc(n)}</li>`;
    }).join('')}</ul>`;
  }).join('');
  const lim = gd.limitText(banner);
  const head = priceLine(banner) ? `<p class="k">★ ${priceLine(banner).replace(', ', ' for ')}${lim ? `, ${lim}` : ''}.</p>${priceSteps(banner)}` : '';
  const legend = attr ? '<p class="n">Names: <span class="p">Power</span>, <span class="g">Speed</span>, <span class="m">Magic</span>'
    + `${featured.size ? ', <span class="f">guaranteed Medal</span>' : ''}.</p>` : '';
  const rates = rated ? '<h2>Draw rates</h2><p class="n">Medal rarities of each draw: original. Chances of one more star: reconstructed for this restoration.</p>'
    + `${oddsTable(banner, ex, medalNames)}${pity}${garanzie}${skillSection(banner, ctx.skillNames)}${evolve ? '' : `<hr><h2>Medals in this draw</h2>${legend}`}${pool}` : '';
  const back = ctx?.fromCatalog ? `<div class="bar"><a class="back" href="/web/gacha/catalog#c${banner.drawMedalTypeId}">BACK<span></span></a></div>` : '';
  return page(banner.name, `<img src="/web/gacha/img/${banner.drawMedalTypeId}.png" alt="">${head}`
    + `<span class="s s-${st.key}">${esc(st.text)}</span>${st.key === 'later' ? `<div class="why later">${laterWhy(banner, ctx?.shopWeek, ctx)}</div>` : STATE_WHY[st.key] ? `<div class="why ${st.key}">${esc(STATE_WHY[st.key])}</div>` : ''}${pinButton(banner, ctx)}<h2>Campaign Period</h2><p>Original banner: ${dates(banner)}.</p>`
    + `${gtext ? `<h2>Deal Details</h2><p>${gtext}</p>` : ''}${rates}${back}`, back ? 'hb' : '');
}

function oddsPage(entries) {
  const list = entries.filter(({ banner, ex }) => ex && banner.rarityMix?.length);
  const toc = list.length > 1 ? `<p>${list.map(({ banner }, i) => `<a href="#b${i}">${esc(banner.name)}</a>`).join(' / ')}</p>` : '';
  return page('Probabilities', '<a id="top"></a>' + toc
    + '<p class="n">Medal rarities of each draw are original; the chances of one more star are reconstructed for this restoration. Percentages are rounded.</p>'
    + list.map(({ banner, ex, medalNames }, i) => `<div class="b" id="b${i}"><h3>[${esc(banner.name)}]</h3>`
      + `${banner.guarantee?.pity ? `<p class="k">★ ${pityText(banner, ex, medalNames)}</p>` : ''}`
      + `${oddsTable(banner, ex, medalNames)}${list.length > 1 ? '<div class="top"><a href="#top">↑PAGE TOP</a></div>' : ''}</div>`).join(''));
}

// Ricerca per medaglia del Catalog (sp3 7.1): entries = [{ banner, names: [nome di medaglia] }] (pool espanso piu' nomi delle
// garanzie); confronto senza maiuscole, con gli spazi multipli ridotti, per parte del nome. q vuota = tutti i banner.
const searchKey = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
function medalSearch(entries, q) {
  const key = searchKey(q);
  return new Set(entries.filter((e) => !key || (e.names || []).some((n) => searchKey(n).includes(key))).map((e) => e.banner.drawMedalTypeId));
}

// Catalog per anno di gioco e pannello Filters (sp3 7.1-7.2). Anno di un banner = data di inizio; gli anni vanno da un
// anniversario (7 aprile, uscita del gioco nel 2016) al giorno prima del successivo: 0 = Launch year ... 5 = Final months
// (dal 2021-04-07); date fuori intervallo ripiegano su 0 / 5.
function gameYearOf(start) {
  const s = String(start || '');
  const i = Number(s.slice(0, 4)) - 2016 - (s.slice(5, 10) < '04-07' ? 1 : 0);
  return Number.isFinite(i) ? Math.max(0, Math.min(5, i)) : 0;
}
const GAME_YEARS = [0, 1, 2, 3, 4, 5].map((i) => ({
  name: i === 0 ? 'Launch year' : i === 5 ? 'Final months' : `Year ${i + 1}`,
  sub: i === 0 ? 'Apr 2016 → 1st 🎂' : i === 5 ? '5th 🎂 → end' : `${ordinal(i)} 🎂 → ${ordinal(i + 1)} 🎂`,
  phrase: i === 0 ? 'the launch year' : i === 5 ? 'the final months' : `Year ${i + 1}`,
  dates: i === 5 ? 'Apr 7, 2021 – end' : `Apr 7, ${2016 + i} – Apr 6, ${2017 + i}`,
}));
// PAID WITH (spec 7.2, revisione del 20-10): Jewels = payType 1, Platinum = 7, Draw Ticket = 8 con valuta draw, Seasonal =
// 8 con spooky/holiday/moogle, Other = 4/5/6/9 (e ogni payType sconosciuto). VIP e' a parte (flag del banner, qualunque moneta).
const SEASONAL_CURRENCIES = new Set(['spooky', 'holiday', 'moogle']);
function payGroupOf(b) {
  if (b.payType === 1) return 'jewel';
  if (b.payType === 7) return 'platinum';
  if (b.payType === 8) return b.currency === 'draw' ? 'draw' : SEASONAL_CURRENCIES.has(b.currency) ? 'seasonal' : 'other';
  return 'other';
}
const isVip = (b) => (b.flags || []).includes('VIP');
// icone originali delle valute (JP 4.3.1, servite da /web/gacha/icon/<chiave>.png; recon/tools/shop_icons.py le prepara).
// Se non si caricano l'<img> resta un quadrato vuoto di misura fissa: l'impaginazione non cambia.
const PAY_ICON_KEYS = ['jewel', 'platinum', 'draw', 'seasonal', 'vip', 'other'];
const payIcon = (k) => `<img class="ic" src="/web/gacha/icon/${k}.png" alt="">`;
const PAY_ICON = Object.fromEntries(PAY_ICON_KEYS.map((k) => [k, `${payIcon(k)} `]));
const PAY_OPTS = [['all', 'All'], ['jewel', `${payIcon('jewel')}Jewels`], ['platinum', `${payIcon('platinum')}Platinum Ticket`], ['draw', `${payIcon('draw')}Draw Ticket`], ['seasonal', `${payIcon('seasonal')}Seasonal tickets`], ['vip', `${payIcon('vip')}VIP`], ['other', `${payIcon('other')}Other`]];
// SHOW: «In the Shop now» comprende il fissato; «Unlocked, not in the Shop now» = later e size; i banner solo catalogo
// (stato catalog) compaiono solo con «All banners»
const SHOW_OPTS = [['all', 'All banners'], ['now', '▶ In the Shop now'], ['unl', 'Unlocked, not in the Shop now'], ['lock', '🔒 Still locked']];
// date della riga: «Apr 7 – Apr 13, 2016», «Dec 16, 2016 – Jan 6, 2017» (come le bozze)
function niceRange(b) {
  if (!b.end) return `${niceDay(b.start)} – open end`;
  const from = b.start.slice(0, 4) === b.end.slice(0, 4) ? niceDay(b.start).replace(/, \d{4}$/, '') : niceDay(b.start);
  return `${from} – ${niceDay(b.end)}${b.endSource !== 'original' ? ' (end date reconstructed)' : ''}`;
}
const CATALOG_CSS = 'img.ic{display:inline-block;width:1.3em;height:1.3em;max-width:none;vertical-align:middle;margin:-.15em .25em 0 0;border:0}'
  + '.hdr{display:flex;align-items:center;justify-content:space-between;gap:10px}'
  + '.fbtn,.ok{border:0;color:#fff;background:linear-gradient(#f08a3a,#d4541c);border-radius:18px;padding:5px 16px;font:bold 15px sans-serif;box-shadow:0 2px 0 #8a3510;cursor:pointer;white-space:nowrap}'
  + '.dot{display:inline-block;background:#fff;color:#d4541c;border-radius:10px;padding:0 7px;margin-left:6px;font-size:13px;line-height:1.5}.dot:empty{display:none}'
  + '.gy{color:#00d4ed;font-size:13px;letter-spacing:.5px;margin:10px 0 3px;line-height:1.4}.gy span{color:#b9cfdc;letter-spacing:0}'
  + '.tabs{display:flex;gap:3px}.tab{flex:1 1 0;min-width:0;border:0;font-family:inherit;cursor:pointer;text-align:center;background:#0d4a70;border-radius:7px 7px 0 0;padding:4px 1px 3px;line-height:1.15;color:#b9cfdc;letter-spacing:0}'
  + '.tab b{display:block;font-size:11.5px;color:#fff}.tab small{display:block;font-size:9px}.tab .c{display:block;color:#ffa500;font-weight:bold;font-size:12px}'
  + '.tab.on{background:linear-gradient(#25c4d8,#0a8fa3);color:#e9fbff}.tabline{height:3px;background:#0a8fa3;margin-bottom:8px}'
  + '.sum{background:#06283e;border-radius:6px;padding:6px 10px;margin:0 0 6px;font-size:15px;line-height:1.7}.sum .n1{color:#ffa500;font-weight:bold}'
  + '.tag{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:14px;padding:0 4px 0 10px;margin:3px 4px 0 0;font-size:14px;line-height:1.6}'
  + '.tag a{display:inline-block;background:#043654;border-radius:10px;width:20px;text-align:center;margin-left:5px;color:#fff;text-decoration:none}.clear{font-size:14px;margin-left:3px}'
  + '.cat .b{display:flex;gap:12px;align-items:center;padding-top:8px;padding-bottom:8px;border-bottom:1px solid #2f5d78}.cat .b.hide{display:none}'
  + '.cat .im{flex:0 0 46%;max-width:300px}.cat .im img{margin:0;border-radius:4px}.cat .info{flex:1;min-width:0;line-height:1.4}'
  + '.cat .nm{color:#fff;font-weight:bold;text-decoration:none}.cat .n,.cat .pay{font-size:14px}.pay{color:#ffcd4a}.cat .s{font-size:13px;margin:3px 0 0}'
  + '.dim{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,12,20,.68);z-index:5}'
  + '.sheet{display:none;position:fixed;left:10px;right:10px;top:52px;max-width:560px;margin:0 auto;max-height:calc(100% - 64px);overflow:auto;box-sizing:border-box;'
  + 'background:#0b3d5c;border:2px solid #39a7cf;border-radius:10px;padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.6);z-index:6;line-height:1.5}'
  + 'body.fo .dim,body.fo .sheet{display:block}.shd{display:flex;justify-content:space-between;align-items:center}.shd b{font-size:18px}'
  + '.x{background:#043654;border:1px solid #39a7cf;border-radius:50%;width:30px;height:30px;color:#fff;font-size:15px;cursor:pointer;padding:0}'
  + '.sheet h4{margin:10px 0 4px;color:#00d4ed;font-size:13px;letter-spacing:1px}'
  + '.search{display:flex;align-items:center;background:#fff;border-radius:18px;padding:2px 12px;color:#7a8a96}'
  + '.search input{flex:1;min-width:0;border:0;outline:0;font:16px sans-serif;color:#222;background:transparent;padding:4px 6px}'
  + '.pk{margin-top:5px;border:2px solid #ffe08a;border-radius:10px;color:#fff;font:bold 13px sans-serif;padding:3px 12px;background:linear-gradient(#e0a020,#a8700a);cursor:pointer}'
  + '.cat .pinmsg{font-size:16px;padding:6px 8px;margin:6px 0 0}.cat .pinmsg small{font-size:13px}'
  + '.hint{color:#9fb7c6;font-size:13px;margin:3px 0 0 4px}.opts{display:flex;flex-wrap:wrap;gap:6px}'
  + '.o{border:1px solid #5d8aa6;border-radius:16px;padding:3px 12px;font:14px sans-serif;color:#d9e6ee;background:#083048;cursor:pointer}'
  + '.o.on{background:#00a6bb;border-color:#7beaf7;color:#fff;font-weight:bold}.o.st-now.on{background:#2e9e3e;border-color:#7be08a}'
  + '.o.st-unl.on{background:#1a6fa8;border-color:#62a7ff}.o.st-lock.on{background:#5a6470;border-color:#9aa4ae}'
  + '.foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px}.ok{padding:6px 20px}.ok:disabled{opacity:.6;cursor:default}.reset{color:#b9cfdc;font-size:14px}';
// Filtro tutto lato pagina (ES5, nessuno script esterno). cur = filtri applicati, dr = bozza del pannello (la X la
// scarta, «Show N banners» la applica). Ricerca per medaglia: /web/gacha/search?q= (encodeURIComponent: un «+» crudo
// diventerebbe uno spazio) con 300 ms di attesa dopo l'ultimo tasto e «Searching…» finche' non risponde; risultati in
// cache per testo. Filtri ricordati in sessionStorage (facoltativo, spec 7.2) perche' BACK dai Details ritrovi la lista.
const CATALOG_JS = `(function(){
var Y=__YEARS__,LAB={pay:__PAY__,show:__SHOW__};
var SHOW={now:{now:1,pinned:1},unl:{later:1,size:1},lock:{locked:1}};
var HINT='Shows the banners where this Medal can be drawn.',KEY='khuxCatalog';
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var rows=[].map.call(document.querySelectorAll('.cat .b'),function(el){return {el:el,id:el.id.slice(1),y:attr(el,'data-year'),pay:attr(el,'data-pay'),vip:attr(el,'data-vip')==='1',st:attr(el,'data-state')};});
var cur={y:'all',pay:'all',show:'all',q:'',ids:null},dr=null,cache={},timer=null,xhr=null,busy=false,err=false;
function copy(s){return {y:s.y,pay:s.pay,show:s.show,q:s.q,ids:s.ids};}
function match(r,s,anyYear){
if(!anyYear&&s.y!=='all'&&r.y!==s.y)return false;
if(s.pay==='vip'?!r.vip:(s.pay!=='all'&&r.pay!==s.pay))return false;
if(s.show!=='all'&&!SHOW[s.show][r.st])return false;
return !s.q||!s.ids||!!s.ids[r.id];}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.pay!=='all'?1:0)+(s.show!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n){return n+' banner'+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify({y:cur.y,pay:cur.pay,show:cur.show,q:cur.q,ids:cur.ids?Object.keys(cur.ids):null}));}catch(e){}}
function render(){
var c={all:0},n=0,i,r,on;for(i=0;i<6;i++)c[i]=0;
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true)){c.all++;c[r.y]++;}
on=match(r,cur);if(on)n++;r.el.className=r.el.className.replace(/ hide/g,'')+(on?'':' hide');}
[].forEach.call(document.querySelectorAll('.tab'),function(t){var y=attr(t,'data-y');t.className='tab'+(y===cur.y?' on':'');$('yc'+y).textContent=c[y];});
var k=nf(cur),y=cur.y,h='<span class="n1">'+plural(n)+'</span>';
if(y!=='all')h+=' from <b>'+Y[y].phrase+'</b> ('+Y[y].dates+')';
if(!k)h+=y==='all'?' · all years, no filters':' · no filters';
else{h+=y==='all'?' match:':' match your filters:';
if(cur.pay!=='all')h+=' '+tag('pay',LAB.pay[cur.pay]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.q)h+=' '+tag('q','🔍 &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=k?k:'';save();}
function sync(){
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
var b=$('fok'),wait=!!dr.q&&!dr.ids;b.disabled=wait;
b.textContent=busy?'Searching…':wait?'Show banners':'Show '+plural(count(dr));
$('fh').textContent=busy?'Searching…':err?'Could not reach the server. Try again.':HINT;}
function stop(){clearTimeout(timer);if(xhr){var x=xhr;xhr=null;x.abort();}busy=false;err=false;}
function find(q){var x=xhr=new XMLHttpRequest();x.open('GET','/web/gacha/search?q='+encodeURIComponent(q));
x.onload=function(){if(xhr!==x)return;xhr=null;busy=false;var ids={},ok=x.status===200;
if(ok){try{JSON.parse(x.responseText).ids.forEach(function(i){ids[i]=1;});}catch(e){ok=false;}}
if(ok){cache[q]=ids;if(dr&&dr.q===q)dr.ids=ids;}else err=true;if(dr)sync();};
x.onerror=function(){if(xhr!==x)return;xhr=null;busy=false;err=true;if(dr)sync();};x.send();}
function openF(){dr=copy(cur);stop();$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){stop();dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){var q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');stop();dr.q=q;
if(!q)dr.ids=null;else if(cache[q])dr.ids=cache[q];else{dr.ids=null;busy=true;timer=setTimeout(function(){find(q);},300);}sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var v=attr(e.target,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();stop();dr.pay='all';dr.show='all';dr.q='';dr.ids=null;$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr||this.disabled)return;var s=dr;s.y=cur.y;closeF();cur=s;render();};
$('sum').onclick=function(e){var x=attr(e.target,'data-x');if(!x)return;e.preventDefault();
if(x==='pay'||x==='all')cur.pay='all';if(x==='show'||x==='all')cur.show='all';if(x==='q'||x==='all'){cur.q='';cur.ids=null;}render();};
document.querySelector('.tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-y'))t=t.parentNode;if(!t)return;cur.y=attr(t,'data-y');render();};
var kept=null,last=null;
function rowOf(id){for(var i=0;i<rows.length;i++)if(rows[i].id===id)return rows[i];}
function boxOf(b){return b.parentNode.querySelector('.pinmsg');}
function setSt(r,key,text){r.st=key;r.el.className='b '+key;var s=r.el.querySelector('.s');s.className='s s-'+key;s.textContent=text;}
function later(b){setSt(rowOf(attr(b,'data-id')),'later','Not in the Shop now \u2014 can be kept in the Shop');khuxSet(b,attr(b,'data-id'),false);}
[].forEach.call(document.querySelectorAll('.cat .pk'),function(b){if(rowOf(attr(b,'data-id')).st==='pinned')kept=b;
b.onclick=function(){return khuxPin(b,boxOf(b),function(on){
if(last&&last!==b){last.style.display='';boxOf(last).style.display='none';}
if(on){if(kept&&kept!==b){later(kept);kept.style.display='';boxOf(kept).style.display='none';}
setSt(rowOf(attr(b,'data-id')),'pinned','\uD83D\uDCCC Kept in the Shop');khuxSet(b,attr(b,'data-id'),true);kept=b;}
else{later(b);if(kept===b)kept=null;}
b.style.display='none';last=b;render();});};});
try{var s=null;if(/^#c/.test(location.hash))s=JSON.parse(sessionStorage.getItem(KEY)||'null');else sessionStorage.removeItem(KEY);if(s&&/^(all|[0-5])$/.test(s.y)&&document.querySelector('.tab[data-y="'+s.y+'"]')){cur.y=s.y;cur.pay=LAB.pay[s.pay]?s.pay:'all';cur.show=LAB.show[s.show]?s.show:'all';
if(s.q&&s.ids){cur.q=s.q;cur.ids={};s.ids.forEach(function(i){cur.ids[i]=1;});cache[s.q]=cur.ids;}}}catch(e){}
render();
var t=location.hash&&document.getElementById(location.hash.slice(1));if(t&&t.className.indexOf(' hide')<0&&t.scrollIntoView)t.scrollIntoView();
})();`;
function catalogPage(banners, ctx) {
  const sorted = [...banners].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.drawMedalTypeId - b.drawMedalTypeId));
  const perYear = [0, 0, 0, 0, 0, 0];
  const rows = sorted.map((b) => {
    const st = stateOf(b, ctx), y = gameYearOf(b.start), pay = payGroupOf(b), href = `/web/gacha/detail/${b.drawMedalTypeId}?from=catalog`;
    perYear[y]++;
    const pk = pinnable(b, ctx) ? (() => { const on = st.key !== 'pinned'; return `<div class="pkw"><button type="button" class="pk" data-id="${b.drawMedalTypeId}" data-pin="${on ? `/web/gacha/pin/${b.drawMedalTypeId}` : '/web/gacha/unpin'}" data-on="${on ? 1 : 0}">${on ? '📌 Keep in the Shop' : 'Remove from the Shop'}</button><div class="pinmsg"></div></div>`; })() : '';
    return `<div class="b ${st.key}" id="c${b.drawMedalTypeId}" data-year="${y}" data-pay="${pay}" data-vip="${isVip(b) ? 1 : 0}" data-state="${st.key}">`
      + `<a class="im" href="${href}"><img loading="lazy" width="640" height="140" src="/web/gacha/img/${b.drawMedalTypeId}.png" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${esc(b.name)}</a><div class="n">${esc(niceRange(b))}</div>`
      + `${priceLine(b) ? `<div class="pay">${PAY_ICON[pay]}${priceLine(b)}</div>` : ''}<span class="s s-${st.key}">${esc(st.text)}</span>${pk}</div></div>`;
  });
  const tab = (y, name, sub, n) => `<button type="button" class="tab${y === 'all' ? ' on' : ''}" data-y="${y}"><b>${name}</b><small>${sub}</small><span class="c" id="yc${y}">${n}</span></button>`;
  const opts = (list, cls = () => '') => list.map(([v, l], i) => `<button type="button" class="o${cls(v)}${i ? '' : ' on'}" data-v="${v}">${l}</button>`).join('');
  const n = sorted.length, nb = `${n} banner${n === 1 ? '' : 's'}`;
  const js = CATALOG_JS.replace('__YEARS__', JSON.stringify(GAME_YEARS.map(({ phrase, dates: d }) => ({ phrase, dates: d }))))
    .replace('__PAY__', JSON.stringify(Object.fromEntries(PAY_OPTS.slice(1)))).replace('__SHOW__', JSON.stringify(Object.fromEntries(SHOW_OPTS.slice(1))));
  return page('Banner Catalog', `<style>${CATALOG_CSS}</style>`
    + `<p class="n">${n} original banners. Banners unlock as you progress through the Story; in the original game they followed the calendar.</p>`
    + '<div class="gy">GAME YEAR <span>— each year runs from one anniversary (April 7) to the next</span></div>'
    + `<div class="tabs">${tab('all', 'All years', '2016–2021', n)}${GAME_YEARS.map((g, i) => (perYear[i] ? tab(i, g.name, g.sub, perYear[i]) : '')).join('')}</div><div class="tabline"></div>`
    + `<div class="sum" id="sum"><span class="n1">${nb}</span> · all years, no filters</div>`
    + `<div class="cat">${rows.join('')}</div>`
    + '<div class="dim" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND A MEDAL</h4><div class="search">🔍<input type="search" id="fq" placeholder="Medal name" autocomplete="off"></div>'
    + '<div class="hint" id="fh">Shows the banners where this Medal can be drawn.</div>'
    + `<h4>PAID WITH</h4><div class="opts" data-g="pay">${opts(PAY_OPTS)}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v}`))}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${nb}</button></div></div>`
    + `<script>${PIN_JS}</script><script>${js}</script>`, '', '<button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button>');
}

module.exports = {
  KEPT_STYLE, PAY_ICON_KEYS,
  SHOP_MAX, WALLET, shopLeaveWeeks, TICKET_CURRENCIES, ticketsOf, walletName, balance, priceFor, drawable, ticketUnlockQuest, shopBanners, catalogRow, catalogPlate,
  dayLeft, drawsLeft, gachaListData, warrantFields, guardWarrant, warrantDedupe, warrantStripBytes, WARRANT_LIST_MAX, WARRANT_HARD_MAX, checkDraw, payDraw, drawState, drawResultFields, detailPage, oddsPage, catalogPage, gameYearOf, payGroupOf, isVip, medalSearch, stateOf, RESTORED_QUEST, isFreeLike, pinnable, pinnedBanner,
};
