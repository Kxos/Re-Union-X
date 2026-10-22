// Orologio finto del server (docs/superpowers/specs/2026-10-16-orologio-finto-design.md).
// Funzioni pure sull'ora reale (ms UTC). La data finta e' la data reale nel suo «mese gemello»
// fra 5/2016 e 5/2021 (stesso giorno della settimana del giorno 1, stessa lunghezza; ripiego per
// i febbraio senza gemello: il febbraio di 28 giorni piu' recente). Lo scostamento si sceglie dal
// mese di «adesso - 8 ore», cioe' con lo stesso confine della scadenza mensile (giorno 1 08:00 UTC).
'use strict';
const DAY = 86400000;
const H8 = 8 * 3600000;
const SAFE_FROM = Date.UTC(2016, 4, 1);
const SAFE_TO = Date.UTC(2021, 5, 28, 23, 59, 59);
const DAY0 = Date.UTC(2018, 0, 1, 8); // lunedi' 1/1/2018 08:00 UTC: origine di giorni e settimane
const REV0 = Date.UTC(2026, 0, 1); // 1/1/2026 00:00 UTC: la revisione conta le scadenze da qui

const info = (y, m) => ({ y, m, first: Date.UTC(y, m, 1), len: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
  wd: new Date(Date.UTC(y, m, 1)).getUTCDay() });
const CANDIDATES = [];
for (let y = 2016; y <= 2021; y++) {
  for (let m = 0; m < 12; m++) if (!(y === 2016 && m < 4) && !(y === 2021 && m > 4)) CANDIDATES.push(info(y, m));
}
const twinCache = new Map();
function twinOf(y, m) {
  const key = y * 12 + m;
  if (!twinCache.has(key)) {
    const r = info(y, m);
    let c = CANDIDATES.filter((x) => x.len === r.len && x.wd === r.wd);
    if (!c.length) c = CANDIDATES.filter((x) => x.len === 28);
    twinCache.set(key, c[c.length - 1]);
  }
  return twinCache.get(key);
}
function monthKey(realMs) {
  const d = new Date(realMs - H8);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}
function twinOffset(realMs) {
  const { y, m } = monthKey(realMs);
  return twinOf(y, m).first - Date.UTC(y, m, 1);
}
const fake = (realMs, offset) => Math.min(Math.max(realMs + offset, SAFE_FROM), SAFE_TO);
const fakeString = (realMs, offset) => new Date(fake(realMs, offset)).toISOString().slice(0, 19).replace('T', ' ');
const dayIndex = (r) => Math.floor((r - DAY0) / DAY);
const weekIndex = (r) => Math.floor((r - DAY0) / (7 * DAY));
const monthIndex = (r) => { const { y, m } = monthKey(r); return y * 12 + m; };
const dayEnd = (r) => DAY0 + (dayIndex(r) + 1) * DAY;
const weekEnd = (r) => DAY0 + (weekIndex(r) + 1) * 7 * DAY;
const weekStartOf = (w) => DAY0 + w * 7 * DAY;
const monthEndOf = (mi) => Date.UTC(Math.floor(mi / 12), (mi % 12) + 1, 1) + H8;
const monthEnd = (r) => monthEndOf(monthIndex(r));
// revisione del master: BASE (la nostra, alzata a ogni cambio dei master) per un passo grande, piu'
// le scadenze settimanali e mensili passate dal 1/1/2026
function masterRevision(base, realMs) {
  return base * 100000 + (weekIndex(realMs) - weekIndex(REV0)) + (monthIndex(realMs) - monthIndex(REV0));
}

module.exports = { DAY, SAFE_FROM, SAFE_TO, twinOffset, fake, fakeString, dayIndex, weekIndex, monthIndex,
  dayEnd, weekEnd, monthEnd, weekStartOf, monthEndOf, masterRevision };
