// VIP benefit (I-134, decisione dell'utente 26-10): regole pure, usate da server.js (GET /user/shop, azione 8,
// userBenefits) e dalla lista dello Shop (benefitId delle tavole VIP).
// Originale: il pass a pagamento «Weekly Jewels Extravaganza» (14,99 $, una volta a settimana, fino alla domenica
// 23:59 PT) sbloccava le VIP Draw (39 varianti VIP del catalogo, dic. 2018 - nov. 2019, stesso prezzo in jewel della
// standard; ricerca in D:\Progetto_Restauro_KH_UX\tmp\vip\REPORT.md). Qui niente soldi: il benefit si guadagna
// completando TUTTE le missioni settimanali di una settimana (le 10 della serie attiva: Raid Boss, Lux, Union Cross)
// e vale per il resto di quella settimana e per tutta la successiva. Da rivedere nel ribilanciamento (I-164).
'use strict';

// id del benefit: 100 = misc 505 del client (controllo «owned» del pass; 506 = 200 l'altro benefit, analisi del
// 26-10); uno solo per tutte le funzioni VIP
const VIP_BENEFIT_ID = 100;

// Settimana `week` guadagnata se ogni riga settimanale attiva quella settimana e' completata (count >= traguardo) o
// riscossa. rows = righe del master mission con missionType 3 attive nella settimana; state(row) = {period, count,
// received} della settimana corrente. Senza righe la settimana non conta (niente benefit gratis per una tabella vuota).
function weekEarned(rows, state, goal = (r) => r.targetNum?.[0] || 1) {
  if (!rows.length) return false;
  return rows.every((r) => { const s = state(r); return !!s && (s.received || s.count >= goal(r)); });
}

// stato nel salvataggio: player.vip = { earnedWeek } (indice clock.weekIndex dell'ultima settimana guadagnata)
function markEarned(vip, week) {
  const v = { ...(vip || {}) };
  if (!(v.earnedWeek >= week)) v.earnedWeek = week;
  return v;
}

// Attivo nella settimana guadagnata e nella successiva; fine = inizio della settimana dopo (clock.weekStartOf).
const activeUntilWeek = (vip) => (vip && Number.isInteger(vip.earnedWeek) ? vip.earnedWeek + 2 : null);
function isActive(vip, week) {
  const until = activeUntilWeek(vip);
  return until !== null && week >= vip.earnedWeek && week < until;
}

// userBenefits di /user/shop: [{benefitId, endDatetime}] (endDatetime gia' come stringa dell'ora finta del server)
function userBenefits(vip, week, endString) {
  return isActive(vip, week) ? [{ benefitId: VIP_BENEFIT_ID, endDatetime: endString(activeUntilWeek(vip)) }] : [];
}

module.exports = { VIP_BENEFIT_ID, weekEarned, markEarned, activeUntilWeek, isActive, userBenefits };
