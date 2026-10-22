// Stagioni dello Shop (spec Shop sp3, 4.1): finestre fisse sul calendario vero (UTC).
'use strict';

const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`B${String(i).padStart(4, '0')}`); return o; };
const SEASONS = [
  { key: 'newyear', from: '12-22', to: '01-17', rowIds: [...range(72, 76), 'B0219', 'B0774'] },
  { key: 'lunar', from: '01-28', to: '02-03', rowIds: ['B0084'] },
  { key: 'valentine', from: '02-03', to: '02-17', rowIds: ['B0085', 'B0086'] },
  { key: 'anniversary', from: '04-06', to: '04-30', rowIds: ['B0106', 'B0272', 'B0493', 'B0651'] },
  { key: 'summer', from: '08-22', to: '09-01', rowIds: ['B0042'] },
  { key: 'halloween', from: '10-12', to: '11-02', rowIds: ['B0731', 'B0732', 'B0740'] },
  { key: 'blackfriday', from: '11-22', to: '12-09', rowIds: ['B0066', 'B0067', 'B0621', 'B0752', 'B0754'] },
  { key: 'holiday', from: '12-07', to: '01-06', rowIds: ['B0068', 'B0758', 'B0759'] },
];

const SEASON_OF = new Map();
for (const s of SEASONS) for (const r of s.rowIds) SEASON_OF.set(r, s.key);
const seasonOf = (banner) => SEASON_OF.get(banner && banner.rowId) || null;

const md = (s) => s.split('-').map(Number);
// occorrenza della finestra che inizia nell'anno y: { start, end } in ms UTC (fine = 23:59:59.999 del giorno `to`)
const occurrence = (s, y) => {
  const [fm, fd] = md(s.from);
  const [tm, td] = md(s.to);
  const wraps = s.from > s.to;
  return { start: Date.UTC(y, fm - 1, fd), end: Date.UTC(wraps ? y + 1 : y, tm - 1, td, 23, 59, 59, 999) };
};
// occorrenza (con anno di inizio) che contiene ms, o null
const containing = (s, ms) => {
  const y = new Date(ms).getUTCFullYear();
  for (const sy of [y - 1, y]) {
    const o = occurrence(s, sy);
    if (ms >= o.start && ms <= o.end) return { ...o, year: sy };
  }
  return null;
};

const activeSeasons = (realMs) => {
  const out = [];
  for (const s of SEASONS) {
    const o = containing(s, realMs);
    if (o) out.push({ key: s.key, start: o.start, end: o.end });
  }
  return out;
};

// anno di inizio dell'occorrenza che contiene banner.start (se cade fuori finestra: l'ultima occorrenza iniziata prima)
const editionOf = (banner) => {
  const s = SEASONS.find((x) => x.key === seasonOf(banner));
  const ms = Date.parse(`${banner.start}T00:00:00Z`);
  const o = s && containing(s, ms);
  if (o) return o.year;
  const y = new Date(ms).getUTCFullYear();
  return s && ms < occurrence(s, y).start ? y - 1 : y;
};

const seasonBanners = (banners, realMs, isUnlockedDrawable) => {
  const out = [];
  for (const a of activeSeasons(realMs)) {
    const list = banners.filter((b) => seasonOf(b) === a.key && isUnlockedDrawable(b));
    if (!list.length) continue;
    const ed = Math.max(...list.map(editionOf));
    out.push({ key: a.key, end: a.end, banners: list.filter((b) => editionOf(b) === ed).sort((x, y) => x.drawMedalTypeId - y.drawMedalTypeId) });
  }
  return out;
};

// testo della finestra («December 22 – January 17»), condiviso da Notices e Details
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mmdd = (s) => { const [m, d] = s.split('-').map(Number); return MONTHS[m - 1] + ' ' + d; };
const windowText = (key) => { const s = SEASONS.find((x) => x.key === key); return s ? mmdd(s.from) + ' – ' + mmdd(s.to) : ''; };

module.exports = { SEASONS, seasonOf, activeSeasons, editionOf, seasonBanners, mmdd, windowText };
