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
// the Raid Catalog label «Not restored yet» (raids Part 2 Task 9) is quoted in the Raid Bosses notice: the only allowed hit
check(p.includes('Not restored yet') && !p.replace(/Not restored yet/g, '').includes('restored'), 'niente elenchi di modifiche');
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
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && ((t) => /## Raid Boards/.test(t) && /Sora & Moogle B/.test(t)
  && /6★ Fantasia Mickey A\*\* gives the \*\*5★/.test(t) && /Starlight Ears\*\* and \*\*Dazzling Disco\*\* Spirit parts \(Raid Board rewards\) each have one \*\*reconstructed\*\* texture/.test(t))(x.body.join('\n'))), 'Raid Boards nelle differenze');
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && /maximum LV is \*\*999\*\*/.test(x.body.join(' ')) && /from LV 305 it is \*\*reconstructed\*\*/.test(x.body.join(' '))), 'livelli Lux ricostruiti nelle differenze');
{
  const diff = n.NOTICES.find((x) => x.title === 'Differences from the original game').body;
  const shop = n.NOTICES.find((x) => x.title === 'Shop').body;
  for (const s of ['Shop draw rates are reconstructed where the original game did not publish them (Medal rarities, guarantees and Skill rates are original): Draw Odds and each banner\'s Details say so.',
    'Bonus items of a draw (Magic Mirror, Gems...) arrive in your Presents.',
    'Free draws cost 1 Jewel. All Free Deals share one draw a day, and VIP Free Deals need the VIP benefit (see the Free Deals and VIP Draws notices).',
    'Seasonal draw currencies (Spooky Cookies, Moogle Points, Holiday Draw Tickets) are kept separately; the Shop shows one of them at a time. When you earn one of them, the reward message calls it a Draw Ticket, but it goes to its own currency.',
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
  check(/Evolved versions count as the same Medal/.test(tr) && /reconstructed from the original deals/.test(tr), 'Traits: stessa medaglia = linea Album');
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
// Special Quests (Special tab, 30-10)
{
  const sq = n.NOTICES.find((x) => x.title === 'Special Quests');
  const t = sq ? sq.body.join(' ') : '';
  check(sq && sq.tag === 'IMPORTANT' && sq.date === '10/31', 'Special: IMPORTANT 10/31');
  check(/follows your Story/.test(t), 'Special: segue la storia');
  check(/Special Catalog/.test(t) && /one quest/.test(t), 'Special: catalogo, una quest');
  check(/Weekly Missions/.test(t), 'Special: VIP dalle missioni settimanali');
  check(/Adamantite Ore Challenge/.test(t) && /Mythril Madness/.test(t) && /no use/.test(t), 'Special: sfide non ripristinate');
  check(/Unlock All/.test(t) && /message/.test(t) && /Weekly Missions VIP/.test(t) && !/no function/.test(t), 'Special: Unlock All shows a message');
  check(/training/.test(t) && /Give Up/.test(t), 'Special: allenamento');
  check(/no Lux and no drops/.test(t) && /three objectives give a little Munny, once/.test(t) && !/no Lux and no rewards/.test(t), 'Special: allenamento, munny degli obiettivi una volta (31-10)');
  check(/VIP: all Special Quests open/.test(t) && /time left/.test(t), 'Special: VIP bar wording');
  check(/reconstructed/.test(t), 'Special: drop ricostruiti');
  check(/\*\*For now VIP cannot be earned\*\*/.test(t) && /rest of that week and the whole next week/.test(t), 'Special: VIP not earnable yet, its duration');
  check(/given \*\*once\*\*/.test(t) && /reset the following week/.test(t), 'Special: rewards once, Cid reset');
  check(/every \*\*Monday\*\*/i.test(t) && /go on with the Story/.test(t), 'Special: how the weeks and periods move');
  check(/period is over/.test(t) && /once that period has ended/.test(t), 'Special: keep rule');
  check(/placed by this restoration/.test(t) && /\*\*not included\*\*/.test(t), 'Special: generated maps declared');
  check(/only today's variant/.test(t) && /Daily Challenge: Cid/.test(t), 'Special: solo il Daily Cid di oggi (round 2, 31-10)');
  check(/recurring VIP quests/.test(t) && /change every week/.test(t) && /original rewards/.test(t) && /some weeks had two/.test(t) && /not known/.test(t), 'Special: recurring VIP quests change every week with their original rewards (round 17)');
  check(/details/.test(t) && /addition of this server/.test(t) && /had none/.test(t), 'Special: pagina dei dettagli del catalogo, aggiunta del server (round 2)');
  check(/limited VIP campaigns/.test(t) && /week/.test(t) && /one quest of its theme/.test(t), 'Special: campagne VIP settimanali (Task 12)');
  check(/closest/.test(t) && /left out/.test(t), 'Special: premi inesistenti sostituiti o tolti');
  check(!/VIP! Skill\*\* quest is not available/.test(t) && !/VIP! Skill[^.]*not available/.test(t), 'Special: VIP! Skill no longer «not available» (round 18)');
  check(/VIP! Skill/.test(t) && /Scrooge 6★/.test(t) && /maximum level/.test(t) && /as in the original/.test(t) && /none is replaced/.test(t) && /only in its original weeks/.test(t), 'Special: VIP! Skill gives its skills as in the original (Scrooge 6★, max level), no substitution (round 18)');
  check(/Anniversary Extravaganza: Limited VIP Boards!/.test(t) && /Limited VIP Coin Skill Board!/.test(t) && /original banners are lost/.test(t), 'Special: two campaign banners reconstructed (round 3, 30-10)');
}
n.NOTICES.push({ date: '1', tag: 'X', title: 'a<b>"&', body: ['<script>'] });
p = n.noticesPage(U(2026, 10, 16, 15));
n.NOTICES.pop();
check(p.includes('a&lt;b&gt;&quot;&amp;') && !p.includes('<script>alert') && p.includes('&lt;script&gt;'), 'escape HTML');

{
  // Raids Part 2: reconstructed raid boss graphics, inferred templates and spider data, withheld bosses (IMPORTANT)
  const rb = n.NOTICES.find((x) => x.title === 'Raid Bosses');
  const t = rb ? rb.body.join(' ') : '';
  check(rb && rb.tag === 'IMPORTANT', 'Raid Bosses: notizia IMPORTANT');
  check(/18 raid bosses/.test(t) && /Jewel Princess/.test(t) && /Closehanded Captain/.test(t) && /twin or related/.test(t), 'Raid Bosses: grafiche ricostruite');
  // render9 (user decision 4 Nov): Jewel Sorceress, Circus Crab, Crabby Cake, with their list banners and template moves
  check(/Jewel Sorceress, Circus Crab\*\* and \*\*Crabby Cake/.test(t) && /list banners\*\* of 21 raid bosses/.test(t) &&
    /The 18 bosses above/.test(t), 'Raid Bosses: Jewel Sorceress, Circus Crab, Crabby Cake ricostruiti (grafiche, banner, mosse)');
  // render10 (user decision 4 Nov): Enraged Arachnid served, JP demos with the English subtitle and copies, banner from its card
  check(/\*\*Enraged Arachnid\*\* now appears in the Story raids/.test(t) && /original Japanese ones with the English subtitle/.test(t) &&
    /copies of identical files/.test(t) && /Its list banner is \*\*reconstructed\*\* from its original Japanese boss card/.test(t) &&
    !/Arachnid[^.]*(do not|does not|never) spawn/.test(t), 'Raid Bosses: Enraged Arachnid servito (demo JP inglesi, copie, banner)');
  check(/Enraged Arachnid/.test(t) && /Egg Master/.test(t) && /Trickmaster/.test(t) && /Spinneret/.test(t) && /900 of 24,000/.test(t), 'Raid Bosses: modelli e ragni');
  check(/Queen Bee, Queen Bee Ω/.test(t) && /Lion Headliner/.test(t) && /older version of their animations/.test(t), 'Raid Bosses: api e Lion Headliner');
  check(/moves, part HP shares and rarity/.test(t) && /all their weak points/.test(t) && /Closehanded Captain\*\* keep/.test(t), 'Raid Bosses: modelli dei 15 e parti complete');
  check(!n.NOTICES.some((x) => /Raid Bosses and Union Cross, which are not available yet/.test(x.body.join(' '))), 'VIP/Special: i raid sono tornati');
  check(/4 weak points/.test(t) && /spiderlings/.test(t) && /\*\*not original\*\* here/.test(t), 'Raid Bosses: ragni con 4 parti dichiarati');
  // Raids Part 2 Task 12: solo play, kept damage, reconstructed values, story and event raids, what is not back yet
  check(/\*\*solo for now\*\*/.test(t) && /keeps the damage/.test(t), 'Raid Bosses: solo, il boss tiene il danno');
  check(/8,600/.test(t) && /6,000/.test(t) && /about 80/.test(t), 'Raid Bosses: soglia di comparsa');
  check(/3 minutes/.test(t) && /half of their HP/.test(t), 'Raid Bosses: ritorno dei punti deboli');
  check(/ATK and DEF/.test(t) && /below the cap/.test(t) && /midpoint/.test(t) && /higher amount and of Gems/.test(t) && /Intermediate/.test(t), 'Raid Bosses: valori ricostruiti');
  check(/2016/.test(t) && /every replay/.test(t) && /nearest quest/.test(t), 'Raid Bosses: boss della Storia');
  check(/weekend-only/.test(t) && /daily showdown/.test(t) && /not their hours/.test(t), 'Raid Bosses: raid evento 2016-2018');
  const has = (s) => t.includes(s);
  // I-228 (06-11, weekday / weekend, no exceptions): one rule for every raid, not original; free originals 5 AP on weekdays; June 2020 not served
  check(has('## Raid AP and Bonus Time') && has('**one rule applies to every raid**') && has('(**not original**)') && has('**Monday to Friday**') && has('**original AP**')
    && has('**Saturday and Sunday** raid quests cost **0 AP**') && has('**doubled**') && has('**no exceptions**') && has('costs **5 AP** from Monday to Friday') && has('Bonus Time came four times a day') && has('daily windows'), 'Raid Bosses: regola giorni feriali / weekend (I-228)');
  check(has('24-hour Bonus Time of June 2020 is not served') && !has('outside them the raid stays open') && !has('## Raid hours') && !has('**90 AP**'), 'Raid Bosses: niente finestre, niente giugno 2020');
  check(!has('Daily raids stay open all day'), 'Raid Bosses: la vecchia riga «open all day» non c\'è più');
  check(/Japanese version/.test(t) && /given at every win/.test(t) && /AI/.test(t) && /Medal pictures/.test(t), 'Raid Bosses: JP, monete ripetibili, immagini');
}
{
  // the counts come from raids.json: a fixture with one tier off and one story boss off
  const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'khux-notice-raid-'));
  const f = require('path').join(dir, 'raids.json');
  require('fs').writeFileSync(f, JSON.stringify({ entries: [{ boss: 'A', available: true }, { boss: 'B', available: false }, { boss: 'A', available: true }],
    story: { last: 825, bosses: [{ boss: 'X', available: true, hp: 8000, rare: { boss: 'X Ω' } }, { boss: 'Y', available: false }], quests: { 4: { boss: 'X' }, 5: { boss: 'Y' } },
      unknown: [614, 615], conflicts: [{ quest: 24 }] } }));
  const facts = n.raidNoticeFacts(f);
  check(facts && facts.tiers === 3 && facts.off === 1 && facts.bosses === 2 && facts.storyOff.join() === 'Y' && facts.storyQuests === 1 && facts.unknown === 2, `conteggi dei raid: ${JSON.stringify(facts)}`);
  const lines = n.raidNoticeLines(facts).join(' ');
  check(/\*\*1\*\* of the 3 raid tiers/.test(lines) && /Not restored yet/.test(lines) && /\*\*Y\*\*/.test(lines), `righe dei raid assenti: ${lines}`);
  check(n.raidNoticeFacts(require('path').join(dir, 'missing.json')) === null && n.raidNoticeLines(null).length > 0, 'senza raids.json: righe generiche');
  // I-232: the Japan-only raids are counted apart, with the ones not here (boss not named) and the ones that were WW raids too
  const g = require('path').join(dir, 'raids-jp.json');
  require('fs').writeFileSync(g, JSON.stringify({ entries: [{ boss: 'A', available: true }, { boss: 'J', available: true, jp: true, censusId: 'JP-SHR-6' }, { boss: 'K', available: true, jp: true, censusId: 'JP-RAID-1' }],
    jp: { notServed: [], skipped: [{ censusId: 'JP-RAID-21', start: '2016-12-25', why: 'boss not named by any source' }, { censusId: 'JP-D-2018-06-11', why: 'the same raid as WW-E41141-1 (same boss, same dates)' },
      { censusId: 'JP-D-2018-09-03', why: 'the same weekly raid as the worldwide one' }] } }));
  const jf = n.raidNoticeFacts(g);
  check(jf && jf.tiers === 1 && jf.jp && jf.jp.rows === 2 && jf.jp.unnamed.join() === '2016-12-25' && jf.jp.sameEvents === 1, `raid giapponesi: ${JSON.stringify(jf)}`);
  const jl = [...n.raidJpLines(jf), ...n.raidNoticeLines(jf)].join(' ');
  check(/## Raids of the Japanese version/.test(jl) && /\*\*2\*\* raids held only in the \*\*Japanese version\*\*/.test(jl) && /marked \*\*Japan only\*\*/.test(jl) && /not original/.test(jl)
    && /December 25, 2016/.test(jl) && /1 Japanese raid event of 2018/.test(jl) && !/not here yet/.test(jl), `righe dei raid giapponesi: ${jl}`);
  check(n.raidJpLines(facts).length === 0 && /not here yet/.test(n.raidNoticeLines(facts).join(' ')), 'senza raid giapponesi: la riga «not here yet»');
  check(!/July, August and September 2017|2016 Showdown|August 4|\*\*Magic Broom\*\* \(Egg Master/.test(jl),'senza le righe jpCensus quando quei raid non sono serviti');
  // jpCensus (06-11): the lines of the later JP research, each only when its raid is served; the span follows the served dates
  const h = require('path').join(dir, 'raids-jp2.json');
  const jpE = (censusId, start, end) => ({ boss: 'J', available: true, jp: true, censusId, start, end });
  require('fs').writeFileSync(h, JSON.stringify({ entries: [{ boss: 'A', available: true }, jpE('JP-RAID-1', '2015-10-18', '2015-10-31'), jpE('JP-RAID-21', '2016-12-25', '2017-01-01'),
    jpE('JP-RAID-30', '2017-09-01', '2017-09-30'), jpE('JP-D-2018-09-01', '2018-09-01', '2018-09-01'), jpE('JP-RAID-9', '2016-03-27', '2016-04-03')], jp: { notServed: [], skipped: [] } }));
  const kl = n.raidJpLines(n.raidNoticeFacts(h)).join(' ');
  check(/October 2015 to September 2018/.test(kl) && /July, August and September 2017/.test(kl) && /like every raid here, are open all day/.test(kl) && !/two daily windows in Japan time/.test(kl) && /Destroyer Behemoth/.test(kl)
    && /Crabby Cake\*\* \(\*\*probable\*\*/.test(kl) && /2016 Showdown!/.test(kl) && /10 levels/.test(kl) && /Saturday only/.test(kl) && /Malicious Spider/.test(kl) && /1\.5 billion/.test(kl)
    && /Magic Broom/.test(kl) && /Prince & Belle/.test(kl), `righe jpCensus: ${kl}`);
  require('fs').rmSync(dir, { recursive: true, force: true });
}
if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: notices');
