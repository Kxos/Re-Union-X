// Login bonus (I-176): regole pure, usate da server.js (POST /login/bonus, azione 65, e acquirableLoginBonus di
// /khux/login e /user/create). Ricerca: docs/notes/home_profilo.md#login-bonus.
// - giorno del login bonus = giorno delle missioni (clock.dayIndex, cambio alle 08:00 UTC; l'originale cambiava alle
//   4:00 a.m. PT: scelta dell'utente 20-10, spiegata nelle Notices);
// - Total = giorni di login (uno per giorno), Daily = ciclo di 5 che avanza a ogni login senza azzerarsi se si salta un
//   giorno (scelta dell'utente 20-10: negli screenshot originali il Daily e' sempre (Total - 1) mod 5 + 1);
// - premi nei Presents (commento «Daily Login Bonus Reward», reference\presents\presents_list_01.png).
'use strict';

const DAILY_COMMENT = 'Daily Login Bonus Reward';
const TOTAL_COMMENT = 'Total Login Bonus Reward';

const cycleDay = (total) => ((Math.max(1, total) - 1) % 5) + 1;

// stato nel salvataggio: player.loginBonus = { lastDay (indice del giorno dell'ultimo login bonus), total }
const fresh = () => ({ lastDay: null, total: 0 });

const acquirable = (state, day) => !state || state.lastDay === null || state.lastDay === undefined || day > state.lastDay;

// Riscossione del giorno `day`: { state, rewards: [{type, id, num, comment}], response } (response = loginBonus del
// client). Lo stesso giorno una seconda volta (rete, riavvio) da' la stessa risposta senza premi.
function claim(state, day, rows) {
  const s = { ...fresh(), ...(state || {}) };
  const rewards = [];
  const daily = rows.filter((r) => r.bonusType === 1).sort((a, b) => a.day - b.day);
  const totals = rows.filter((r) => r.bonusType === 2);
  if (acquirable(s, day)) {
    s.total += 1;
    s.lastDay = day;
    const d = daily.find((r) => r.day === cycleDay(s.total));
    const t = totals.find((r) => r.day === s.total);
    if (d) rewards.push({ type: d.rewardType, id: d.rewardId, num: d.rewardNum, comment: DAILY_COMMENT });
    if (t) rewards.push({ type: t.rewardType, id: t.rewardId, num: t.rewardNum, comment: TOTAL_COMMENT });
  }
  const d = daily.find((r) => r.day === cycleDay(s.total));
  const t = totals.find((r) => r.day === s.total);
  // ogni id mandato deve esistere nel master (riga mancante = crash del client): 0 = nessuna riga
  const response = {
    continue: { loginBonusId: d ? d.loginBonusId : 0, dayCount: s.total ? cycleDay(s.total) : 0 },
    total: { loginBonusId: t ? t.loginBonusId : 0, dayCount: s.total },
    specials: [],
  };
  return { state: s, rewards, response };
}

module.exports = { DAILY_COMMENT, TOTAL_COMMENT, cycleDay, fresh, acquirable, claim };
