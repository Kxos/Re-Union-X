// Prova della pagina /web/notices (aggiornamenti dati e differenze): node server/test-notices.js
'use strict';
const n = require('./routes-info-album');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const U = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h);

let p = n.noticesPage(U(2026, 10, 16, 15));
check(p.includes('About game data updates'), 'titolo base');
check(!p.includes('Game data updated today'), 'non e il giorno dell aggiornamento');
check(p.includes('Next update: in 2 days 17 hours'), 'venerdi 15:00 -> 2 giorni 17 ore');
const pos = (s) => p.indexOf(`<span class="x">${s}</span>`);
check(pos('About game data updates') >= 0 && pos('About game data updates') < pos('Differences from the original game')
  && pos('Differences from the original game') < pos('Missions'), 'ordine: dati aggiornati, differenze, poi il resto');
// since 22-10 the list is newest first (byDate): Shop (10/20) comes before Missions (10/16)
check(pos('Shop') < pos('Missions'), 'newest first: Shop (10/20) before Missions (10/16)');
check(n.NOTICES.some((x) => x.title === 'Missions' && /joins the rotation only once your Story reaches the date/.test(x.body.join(' '))), 'Missions: campagne con medaglia legate alla storia');
check(n.NOTICES.some((x) => x.title === 'Missions' && /are given once/.test(x.body.join(' ')) && /did not finish in time come back/.test(x.body.join(' '))), 'Missions: premi unici una volta sola');
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && /draw rates are reconstructed/.test(x.body.join(' '))), 'probabilita nelle differenze');
check(!p.includes('restored'), 'niente elenchi di modifiche');
check(p.includes('Differences from the original game') && p.includes('Limited Missions rotate'), 'notizia differenze');
check(p.includes('<a class="row" href="#n0"') && p.includes('id="d0"'), 'struttura elenco');

p = n.noticesPage(U(2026, 10, 19, 9));
check(p.includes('Game data updated today'), 'lunedi 09:00 -> aggiornato oggi');
check(p.includes('Next update: in 6 days 23 hours'), 'lunedi 09:00 -> prossimo fra 6 giorni 23 ore');

p = n.noticesPage(U(2026, 10, 31, 20));
check(p.includes('Next update: in 12 hours'), 'fine mese -> 12 ore');
p = n.noticesPage(U(2026, 11, 1, 9));
check(p.includes('Game data updated today'), 'giorno 1 -> aggiornato oggi');
p = n.noticesPage(U(2026, 10, 18, 8) + 30 * 60000);
check(p.includes('Next update: in 23 hours'), 'ore al singolare/plurale');
p = n.noticesPage(U(2026, 10, 19, 7) + 30 * 60000);
check(p.includes('Next update: in less than an hour'), 'meno di un ora');

{
  const ms = n.NOTICES.find((x) => x.tag === 'IMPORTANT' && x.title === 'Medal skills');
  const t = ms ? ms.body.join(' ') : '';
  check(ms && /reconstructed/.test(t) && /163/.test(t) && /Skill EXP/.test(t) && /every Medal in your deck/.test(t), 'notizia Medal skills');
}
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && /no purchases/.test(x.body.join(' '))), 'acquisti nelle differenze');
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && /maximum LV is \*\*999\*\*/.test(x.body.join(' ')) && /from LV 305 it is \*\*reconstructed\*\*/.test(x.body.join(' '))), 'livelli Lux ricostruiti nelle differenze');
{
  const diff = n.NOTICES.find((x) => x.title === 'Differences from the original game').body;
  const shop = n.NOTICES.find((x) => x.title === 'Shop').body;
  for (const s of ['Shop draw rates are reconstructed where the original game did not publish them (Medal rarities, guarantees and Skill rates are original): Draw Odds and each banner\'s Details say so.',
    'Bonus items of a draw (Magic Mirror, Gems...) arrive in your Presents.',
    'Free draws cost 1 Jewel. VIP Free Deals are open to everyone, with one free VIP draw per day in total.',
    'Seasonal draw currencies (Spooky Cookies, Moogle Points, Holiday Draw Tickets) are kept separately; the Shop shows one of them at a time.',
    'Some 2016-17 banners only drew Epic Medals; the game data no longer says which Medals were Epic, so these banners draw from their full sets.',
    'Blue Fairy Deal banners are in the Banner Catalog but cannot be drawn yet: Blue Fairies will come with a future update.',
    'Trait Medals are back: a deal that guaranteed a Trait Medal gives it (all 313 Trait Medals, matched to their Medals from the community wiki).',
    'Boosted Medals: the chance of a boosted version on deals that offered one is reconstructed (5% per eligible Medal). Guaranteed max-level Skills are given only for Skills that exist in this restoration.',
    'Boosted stats on deals that did not state them are reconstructed (+1000 STR, +1000 DEF), and bonus support Medals earned through a guarantee arrive in your Presents.',
    'Free deals that could be drawn only once (or once per day) keep that limit.',
    'The "Medal STR +N" and "Medal DEF +N" effects of Special Attacks and Supernovas are rebuilt from their descriptions, because the original values are lost.']) {
    check(diff.includes(s), `differenze: «${s.slice(0, 40)}...»`);
  }
  check(!diff.some((s) => /not enforced yet|^Trait Medals, boosted Medals/.test(s)), 'differenze: righe vecchie dei Tier e delle Trait tolte');
  check(shop.includes('Guarantees work as on the original banners: the yellow line under a banner counts down the draws left to its guaranteed Medal.'), 'Shop: riga delle garanzie');
  check(!diff.some((s) => s.startsWith('Shop draw rates are reconstructed where the original game did not publish them: ')), 'differenze: vecchia riga delle probabilita tolta');
  // I-153: la striscia di categoria e' un testo nostro
  check(shop.includes('When a guarantee covers too many Medals to name them all, the yellow line names the kind of Medal from the banner\'s original notice instead (for example "A SN or higher Medal is guaranteed! Draws left: 3"). This wording is written by this restoration.')
    && shop.findIndex((s) => s.startsWith('Guarantees work as on')) + 1 === shop.findIndex((s) => s.startsWith('When a guarantee covers')),
  'Shop: riga della striscia di categoria, dopo quella delle garanzie');
  check(shop.includes('Every original banner is in the Banner Catalog. Banners unlock as you progress through the Story; in the original game they followed the calendar.'), 'Shop: banner originali e storia');
  check(shop.includes('## Weekly rotation') && shop.some((x) => /every \*\*Monday\*\*|Every \*\*Monday\*\*/.test(x)), 'Shop: rotazione settimanale (I-165)');
}

{
  // trait dalla fusione (I-084 parte A)
  const tr = (n.NOTICES.find((x) => x.title === 'Traits') || { body: [] }).body.join(' ');
  check(/Fusing two copies of the same Medal gives it a random trait/.test(tr), 'Traits: copie identiche');
  check(/each of the 11 traits has the same chance/.test(tr), 'Traits: probabilita uniforme');
  check(/only from the Moogle Shop/.test(tr), 'Traits: i 5 trait della 4.1.0 solo nel Moogle Shop');
  // Trait Medal e linea dell'Album (I-084 parte B)
  check(/Evolved versions count as the same Medal/.test(tr) && /Trait Medal #130/.test(tr), 'Traits: stessa medaglia = linea Album');
  check(/\*\*Trait Medals\*\* are back/.test(tr) && /only give EXP/.test(tr) && /black and white/.test(tr), 'Traits: Trait Medal');
}
{
  // Shop sp3: stagionali, banner fissato, filtri (spec 8)
  const shopN = n.NOTICES.find((x) => x.title === 'Shop');
  const shop = shopN.body, all = shop.join('\n');
  check(shopN.date === '10/20', 'Shop: data 10/20');
  for (const s of ['## Seasonal banners', '## Keep one banner in the Shop', '## Catalog filters']) check(shop.includes(s), `Shop: sezione ${s}`);
  const win = { newyear: 'New Year: December 22 – January 17', lunar: 'Lunar New Year: January 28 – February 3',
    valentine: 'Valentine\'s Day: February 3 – February 17', anniversary: 'Anniversary: April 6 – April 30',
    summer: 'Summer: August 22 – September 1', halloween: 'Halloween: October 12 – November 2',
    blackfriday: 'Black Friday / Cyber Monday: November 22 – December 9', holiday: 'Winter Holidays: December 7 – January 6' };
  for (const k of Object.keys(win)) check(shop.includes(win[k]), `Shop: finestra ${k}`);
  check(shop.includes('Windows (UTC):'), 'Shop: finestre in UTC');
  check(require('./gacha-seasons').SEASONS.length === 8, 'otto stagioni');
  check(/most recent unlocked edition/.test(all) && /nothing appears/.test(all), 'Shop: edizione piu recente, niente se nessuna');
  check(/Keep in the Shop/.test(all) && /Banner Catalog/.test(all) && /Leave and re-enter the Shop/.test(all), 'Shop: pulsante e rientro');
  check(/already passed in the Story/.test(all) && /Free Deals/.test(all) && /1 Jewel/.test(all) && /one banner at a time/.test(all)
    && /limits still apply/.test(all), 'Shop: regole del banner fissato');
  check(/right after the Banner Catalog plate and above the seasonal banners/.test(all) && /KEPT IN SHOP/.test(all) && /on a banner's row/.test(all), 'Shop: posizione e bollino del banner fissato');
  check(/right after the Banner Catalog \(and the kept banner, if any\)/.test(all), 'Shop: stagionali dopo Catalog e fissato');
  check(/from the first time you log in inside the window/.test(all) && /until the first login after it ends/.test(all), 'Shop: le stagionali appaiono dal primo login dentro la finestra');
  check(/steps aside until the season ends/.test(all), 'Shop: precedenza delle valute stagionali');
  check(/GAME YEAR/.test(all) && /Filters/.test(all) && /Find a Medal/.test(all) && /Paid with/.test(all) && /Show/.test(all), 'Shop: filtri del Catalog');
  const diff = n.NOTICES.find((x) => x.title === 'Differences from the original game').body;
  check(/unless they use different special tickets/.test(all) && /only the first one in the list above shows/.test(all), 'Shop: stagioni con valute diverse');
  check(/the seasonal banner wins, then the kept banner, then the weekly rotation/.test(all) && /for example Spooky Cookies, Moogle Points or Holiday Draw Tickets/.test(all), 'Shop: precedenza delle valute');
  check(diff.some((s) => /fixed dates of the real calendar/.test(s) && /most recent unlocked edition/.test(s)), 'differenze: stagionali');
  check(diff.some((s) => /Keep in the Shop/.test(s) && /did not exist in the original/.test(s)), 'differenze: banner fissato');
  check(diff.some((s) => /Platinum Tickets or Draw Tickets/.test(s) && /only after a banner that uses them/.test(s)), 'differenze: Limited coi biglietti');
}
n.NOTICES.push({ date: '1', tag: 'X', title: 'a<b>"&', body: ['<script>'] });
p = n.noticesPage(U(2026, 10, 16, 15));
n.NOTICES.pop();
check(p.includes('a&lt;b&gt;&quot;&amp;') && !p.includes('<script>alert') && p.includes('&lt;script&gt;'), 'escape HTML');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: notices');
