// Prova del generatore del master drawMedalType: node server/test-make-banners.js
'use strict';
const m = require('./make-banners');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const base = { name: 'B', prices: [3000], lotCount: 10, rarityMix: [[5, 1], [4, 9]], dayLimit: 0, vipFree: false,
  guarantee: { list: [], count: 0, pity: null, every: null }, catalogOnly: null };
const catalog = { banners: [
  { ...base, drawMedalTypeId: 10001, name: 'DAILY DEAL!', prices: [600], lotCount: 3, rarityMix: [[4, 1], [3, 2]], dayLimit: 1 },
  { ...base, drawMedalTypeId: 10002, prices: [0, 3000] },
  { ...base, drawMedalTypeId: 10003, payType: 9, prices: [] },
  { ...base, drawMedalTypeId: 10004, payType: 4, prices: [0] },
  { ...base, drawMedalTypeId: 10005, payType: 8, prices: [1], name: '100% Fun' },
  { ...base, drawMedalTypeId: 10006, payType: 3, prices: [500] },
].map((b) => ({ payType: 1, ...b })) };
const rows = m.masterRows(catalog);
check(rows.length === 1 + catalog.banners.length && rows[0].drawMedalTypeId === 9001 && rows[0].payType === 6, '1 + N righe, prima la piastra 9001');
check(rows.every((r) => r.price >= 1), 'price >= 1');
check(rows.every((r) => [1, 4, 5, 6, 7, 8].includes(r.payType)), 'payType ammessi');
check(rows.find((r) => r.drawMedalTypeId === 10003).payType === 1 && rows.find((r) => r.drawMedalTypeId === 10006).payType === 1, 'payType 9 e 3 -> 1');
check(rows.every((r) => r.benefitId === 0), 'benefitId 0');
check(rows.find((r) => r.drawMedalTypeId === 10001).price === 600 && rows.find((r) => r.drawMedalTypeId === 10002).price === 1, 'prezzo della prima estrazione');
const r1 = rows.find((r) => r.drawMedalTypeId === 10001);
check(r1.bannerUrl === '/web/gacha/img/10001.png' && r1.detailUrl === '/web/gacha/detail/10001' && r1.sortId === 10, 'url e sortId');
check(rows.every((r) => !/%(?!%)/.test(r.comment.replace(/%%|%d/g, ''))), 'nessun % sciolto fuori da %d');

const pity = { ...base, rarityMix: [[6, 1], [5, 9]], lotCount: 10, guarantee: { list: [], count: 0, pity: 10, every: null } };
check(m.commentOf(pity) === '10 Medals: 1x 6★+, 9x 5★+ - featured Medal guaranteed within 10 draws', `pity: ${m.commentOf(pity)}`);
check(m.commentOf(catalog.banners[0]) === '3 Medals: 1x 4★+, 2x 3★+ - once per day', 'once per day');
check(m.commentOf({ ...base, dayLimit: 3 }) === '10 Medals: 1x 5★+, 9x 4★+ - 3 times per day', '3 times per day');
check(m.commentOf({ ...base, vipFree: true }) === '10 Medals: 1x 5★+, 9x 4★+ - one free VIP draw per day', 'VIP');
check(m.commentOf({ ...base, totalLimit: 1 }) === '10 Medals: 1x 5★+, 9x 4★+ - once', `totalLimit 1: ${m.commentOf({ ...base, totalLimit: 1 })}`);
check(m.commentOf({ ...base, totalLimit: 2 }) === '10 Medals: 1x 5★+, 9x 4★+ - 2 times in total', 'totalLimit 2');
check(m.commentOf({ ...base, lotCount: 1, rarityMix: [[5, 1]] }) === '1 Medal: 1x 5★+', 'singolare');
check(m.commentOf({ ...base, lotCount: undefined }) === 'Banner Catalog only' && m.commentOf({ ...base, lotCount: null }) === 'Banner Catalog only', 'lotCount mancante');

// Striscia della garanzia (Task 4): warrantOf e campi warrant* della riga
const wp = m.warrantOf({ ...base, guarantee: { ...base.guarantee, pity: 5, pityNames: ['hd axel'] } });
check(wp.display === 5 && wp.number === 5 && wp.validComment === 0, `warrantOf pity 5: ${JSON.stringify(wp)}`);
const wn = m.warrantOf(base);
check(wn.display === 1 && wn.number === 0 && wn.validComment === 1, `warrantOf senza pity: ${JSON.stringify(wn)}`);
const wg = m.warrantOf({ ...base, guarantee: { ...base.guarantee, pity: 7, pityNames: [], pityGift: [3, 5, 1] } });
check(wg.display === 7 && wg.number === 7 && wg.validComment === 0, 'pityGift: come ogni pity');
check(m.WARRANT_XML_SAFE === false, 'WARRANT_XML_SAFE spento di default');
const wx = m.warrantOf({ ...base, guarantee: { ...base.guarantee, pity: 5, pityNames: ['Yuna & Rikku & Paine'] } }, true);
check(wx.display === 5 && wx.number === 5 && wx.validComment === 1, 'XML safe con & -> validComment 1');
const wy = m.warrantOf({ ...base, guarantee: { ...base.guarantee, pity: 5, pityNames: ['Axel'] } }, true);
check(wy.validComment === 0, 'XML safe senza & -> validComment 0');
const cat2 = { banners: [
  { ...base, drawMedalTypeId: 20001, guarantee: { ...base.guarantee, pity: 5, pityNames: ['hd axel'] } },
  { ...base, drawMedalTypeId: 20002 },
  { ...base, drawMedalTypeId: 20003, guarantee: { ...base.guarantee, pity: 5, pityNames: ['Yuna & Rikku & Paine'] } },
] };
const r2 = m.masterRows(cat2);
const a = r2.find((r) => r.drawMedalTypeId === 20001), b = r2.find((r) => r.drawMedalTypeId === 20002);
check(a.warrantDisplayOfTime === 5 && a.warrantNumberOfTime === 5 && a.validComment === 0, 'riga con pity 5');
check(b.warrantDisplayOfTime === 1 && b.warrantNumberOfTime === 0 && b.validComment === 1 && b.comment === m.commentOf(cat2.banners[1]), 'riga senza pity: come oggi');
const r3 = m.masterRows(cat2, true).find((r) => r.drawMedalTypeId === 20003);
check(r3.validComment === 1 && r3.comment === '<important>Yuna &amp; Rikku &amp; Paine</important> guaranteed in <important>%d tries</important>!', `XML safe: ${r3.comment}`);
check(m.masterRows(cat2, true).every((r) => !/%(?!%)/.test(r.comment.replace(/%%|%d/g, ''))), 'XML safe: nessun % sciolto');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: make-banners');
