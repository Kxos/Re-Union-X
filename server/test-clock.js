// Prova di server/clock.js (orologio finto, mesi gemelli): node server/test-clock.js
'use strict';
const c = require('./clock');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const U = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const len = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// gemelli: tutti i mesi 2026-2035, a meta' mese alle 15:00
for (let y = 2026; y <= 2035; y++) {
  for (let m = 1; m <= 12; m++) {
    const r = U(y, m, 15, 15);
    const f = new Date(c.fake(r, c.twinOffset(r)));
    check(f.getTime() >= c.SAFE_FROM && f.getTime() <= c.SAFE_TO, `${y}-${m}: fuori intervallo ${f.toISOString()}`);
    check(f.getUTCHours() === 15, `${y}-${m}: ora ${f.getUTCHours()}`);
    const exact = !(m === 2 && (len(y, 2) === 29 || [0, 2, 6].includes(new Date(Date.UTC(y, 1, 1)).getUTCDay())));
    if (exact) {
      check(f.getUTCDate() === 15, `${y}-${m}: giorno ${f.getUTCDate()}`);
      check(f.getUTCDay() === new Date(r).getUTCDay(), `${y}-${m}: giorno della settimana`);
    }
  }
}
// esempio della spec: venerdi' 16/10/2026 15:00 -> 16/10/2020 15:00
const ex = U(2026, 10, 16, 15);
check(c.fakeString(ex, c.twinOffset(ex)) === '2020-10-16 15:00:00', `esempio: ${c.fakeString(ex, c.twinOffset(ex))}`);
// confine del mese alle 08:00: fra 00:00 e 08:00 del giorno 1 vale ancora il mese prima
check(c.twinOffset(U(2026, 11, 1, 7, 59)) === c.twinOffset(U(2026, 10, 20)), 'giorno 1 07:59: scostamento del mese prima');
check(c.twinOffset(U(2026, 11, 1, 8, 0)) === c.twinOffset(U(2026, 11, 20)), 'giorno 1 08:00: scostamento nuovo');
check(c.monthIndex(U(2026, 11, 1, 7, 59)) === c.monthIndex(U(2026, 10, 31)), 'monthIndex al confine');
// scadenze
check(c.dayEnd(U(2026, 10, 16, 15)) === U(2026, 10, 17, 8), 'dayEnd');
check(c.dayEnd(U(2026, 10, 16, 7)) === U(2026, 10, 16, 8), 'dayEnd prima delle 8');
check(c.weekEnd(U(2026, 10, 16, 15)) === U(2026, 10, 19, 8), 'weekEnd (lunedi 19/10 08:00)');
check(c.weekEnd(U(2026, 10, 19, 8)) === U(2026, 10, 26, 8), 'weekEnd esattamente al confine');
check(c.monthEnd(U(2026, 10, 16, 15)) === U(2026, 11, 1, 8), 'monthEnd');
check(c.monthEnd(U(2026, 11, 1, 7)) === U(2026, 11, 1, 8), 'monthEnd prima delle 8 del giorno 1');
check(c.weekStartOf(c.weekIndex(U(2026, 10, 16))) === U(2026, 10, 12, 8), 'weekStartOf');
check(c.monthEndOf(c.monthIndex(U(2026, 10, 16))) === U(2026, 11, 1, 8), 'monthEndOf');
// conti alla rovescia esatti anche nel febbraio di ripiego (2028: bisestile, inizia di martedi')
for (const r of [U(2028, 2, 10, 12), U(2028, 2, 29, 12)]) {
  const o = c.twinOffset(r);
  check(c.fake(c.weekEnd(r), o) - c.fake(r, o) === c.weekEnd(r) - r, `febbraio 2028: conto settimanale ${new Date(r).toISOString()}`);
  check(c.fake(c.monthEnd(r), o) - c.fake(r, o) === c.monthEnd(r) - r, `febbraio 2028: conto mensile`);
}
// monotona dentro un mese
const o10 = c.twinOffset(U(2026, 10, 2));
check(c.fake(U(2026, 10, 31, 23), o10) > c.fake(U(2026, 10, 2), o10), 'monotona');
// limite di sicurezza
check(c.fake(U(2026, 10, 1), Date.UTC(2021, 5, 30) - U(2026, 10, 1)) === c.SAFE_TO, 'tetto al 28/6/2021');
// revisione: cambia solo alle scadenze, e insieme allo scostamento al confine mensile
const rv = (r) => c.masterRevision(117, r);
check(rv(U(2026, 10, 13, 9)) === rv(U(2026, 10, 19, 7, 59)), 'revisione stabile nella settimana');
check(rv(U(2026, 10, 19, 8)) === rv(U(2026, 10, 19, 7, 59)) + 1, 'revisione +1 al lunedi');
check(rv(U(2026, 11, 1, 8)) > rv(U(2026, 11, 1, 7, 59)), 'revisione al confine mensile');
check(rv(U(2026, 1, 1)) >= 117 * 100000 && rv(U(2035, 12, 31)) < 118 * 100000, 'revisione nel blocco della BASE');
check(rv(U(2035, 12, 31)) < 2 ** 31, 'revisione < 2^31');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: clock.js');
