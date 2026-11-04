// Notices (Other > Notices, popup al login) e Album (Other > Album): docs/notes/home_profilo.md#notices-album.
//
// POST /system/information/list/151203 (azione 31): popUpViewUrl = array di
// stringhe (URL), obbligatorio.
// - Pulsante Notices: apre la WebView
// (titolo testo «Notices») sul PRIMO elemento, con i parametri di
// sessione aggiunti dal client. Senza elementi il client va in crash (banco 14-10). Serve almeno 1 URL.
// - Login: mostra in
//   sequenza le WebView di tutti gli elementi (il primo con i parametri di sessione): e' il popup
//   delle notizie dell'originale all'ingresso nella home.
// La WebView usa cocostudio/publish/Information2_Base.json (o, in alcuni casi, dark_Information2_Base.json):
// l'originale JP (uguale al WW 4.4.0) e'
// in recon/tools/jp_coco_layouts.txt.
// GET /system/information/list (azione 30): viewUrl stringa (non vista sul
// banco; stessa pagina).
//
// GET /user/album/161102 (azione 17): userAlbum {albumMedals[] {medalId uint,
// guiltStatus uint (letto come byte)}, allMedalCount int}, tutto obbligatorio (altrimenti
// crash del client, banco 14-10). La cella mostra la medaglia se
// medalId e' in albumMedals, altrimenti Medal_S_0 e «?» (Txt_Medal_Label); l'icona AlbumGuilt_1/2/3
// = guiltStatus 0/1/2, solo se userDetail.isGuilt e il tier della medaglia != 0.
// guiltStatus qui: 0 = nessuna copia con Special Attack Bonus, 1 = almeno una, 2 = una copia al
// bonus massimo del tier (ricostruzione: i valori originali non sono noti).

const clock = require('./clock');
const { isBoosted } = require('./medal-boost');
const { SEASONS, mmdd } = require('./gacha-seasons');
const fs = require('fs');
const path = require('path');
const { countStopgaps } = require('./make-story-oltre');

// obiettivi tappabuchi delle 526-979 contati nel master servito: 0 dal 21-10 (codici originali del client in
// make-story-oltre.js); il paragrafo della notizia compare solo se un master ne ha ancora (0 anche senza master)
function storyStopgaps() {
  const dir = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
  try { return countStopgaps(JSON.parse(fs.readFileSync(path.join(dir, 'stage.json'), 'utf8'))); } catch { return 0; }
}
const stopgapParagraph = (n) => (n ? [`${n} mission objectives show their original text, but they are checked as "Complete without having to continue", because the way the original game checked them is unknown.`] : []);

// Finestre stagionali dello Shop: generate dalla tabella SEASONS, cosi' la notizia non puo' divergere
const SEASON_LABEL = { newyear: 'New Year', lunar: 'Lunar New Year', valentine: "Valentine's Day", anniversary: 'Anniversary',
  summer: 'Summer', halloween: 'Halloween', blackfriday: 'Black Friday / Cyber Monday', holiday: 'Winter Holidays' };
const seasonLines = () => SEASONS.map((x) => (SEASON_LABEL[x.key] || x.key) + ': ' + mmdd(x.from) + ' – ' + mmdd(x.to));

// Ogni funzione che differisce dall'originale ha una notizia (docs/notes/home_profilo.md#notices-album)
const DIFFERENCES_BODY = [
  '## Game and progress',
  'This is a private restoration of KINGDOM HEARTS Union χ[Cross]. Your progress is saved only on this restoration server.',
  'The in-game date is set between 2016 and 2021 so that the original game keeps working. Missions reset at the real times shown in their countdowns.',
  'Completed missions that you did not collect before they end are sent to your Presents.',
  'The maximum LV is **999**, as in the original game from January 2021. The Lux needed for each level up to LV 304 is original; from LV 305 it is **reconstructed** from players’ videos of 2018-2021, because the original values are lost.',
  'Limited Missions rotate among the original campaigns: one monthly Lux campaign and one short campaign each week.',
  '## Medals',
  'A few Spirit parts without original graphics are replaced by a similar part.',
  'The "Medal STR +N" and "Medal DEF +N" effects of Special Attacks and Supernovas are rebuilt from their descriptions, because the original values are lost.',
  '## Raid Boards',
  'The **Sora & Moogle B** Medal (JP 5th anniversary, a Raid Board reward) is **reconstructed** from its description: used in a Level Up it adds 100 STR and 100 DEF, like Chip and Dale.',
  'The Raid Board cell listed as a **6★ Fantasia Mickey A** gives the **5★ Fantasia Mickey A**: no 6★ version of that Medal is known, and the board pairs it with Magic Brooms, which evolve the 5★.',
  'The **Starlight Ears** and **Dazzling Disco** Spirit parts (Raid Board rewards) each have one **reconstructed** texture: a small twinkling sparkle and a tiny dot were lost and are drawn with the matching sparkle of the same set.',
  '## Shop and draws',
  'Shop draw rates are reconstructed where the original game did not publish them (Medal rarities, guarantees and Skill rates are original): Draw Odds and each banner\'s Details say so.',
  'Bonus items of a draw (Magic Mirror, Gems...) arrive in your Presents.',
  'Free draws cost 1 Jewel. All Free Deals share one draw a day, and VIP Free Deals need the VIP benefit (see the Free Deals and VIP Draws notices).',
  'Free deals that could be drawn only once (or once per day) keep that limit.',
  'Seasonal draw currencies (Spooky Cookies, Moogle Points, Holiday Draw Tickets) are kept separately; the Shop shows one of them at a time. When you earn one of them, the reward message calls it a Draw Ticket, but it goes to its own currency.',
  'Some 2016-17 banners only drew Epic Medals; the game data no longer says which Medals were Epic, so these banners draw from their full sets.',
  'Blue Fairy Deal banners are in the Banner Catalog but cannot be drawn yet: Blue Fairies will come with a future update.',
  'Trait Medals are back: a deal that guaranteed a Trait Medal gives it (all 313 Trait Medals, matched to their Medals from the community wiki).',
  'Boosted Medals: the chance of a boosted version on deals that offered one is reconstructed (5% per eligible Medal). Guaranteed max-level Skills are given only for Skills that exist in this restoration.',
  'Boosted stats on deals that did not state them are reconstructed (+1000 STR, +1000 DEF), and bonus support Medals earned through a guarantee arrive in your Presents.',
  '## Seasonal banners and pinned banner',
  'Seasonal banners follow fixed dates of the real calendar, and the Shop shows the most recent unlocked edition of each season, from the first time you log in inside its window. In the original game each edition ran on its own dates.',
  'The banner you keep in the Shop with **Keep in the Shop** did not exist in the original game.',
  'Limited Missions that give Platinum Tickets or Draw Tickets appear only after a banner that uses them is unlocked.',
  'Draw Points from selling Medals start only when the Story reaches the first Draw Points Deal, and they never expire (see the Draw Points notice).',
  '## Purchases',
  'There are no purchases: Jewels and items come from quests, missions and presents.',
  'Spirit Training slots that were bought in the original game open in other ways (**not original**): slot 2 ("Purchase Weekly Jewels") opens while you have the **VIP benefit** of the Weekly Missions, until it ends; slot 4 ("Purchase Jewel Box E") opens when you complete **all the monthly Limited Missions** (the month\'s Lux campaign), for the rest of that month and the whole next month, although its label says "Valid until the end of the month". Slot 3 keeps its original rule: 5 draws from 10-Medal Deals paid with Jewels (not Free Deals or Ticket Draws) open it for 3 days.',
];

// Notizia fissa sugli aggiornamenti dei dati (lunedi' e giorno 1, 08:00 UTC): il conto alla rovescia
// e' calcolato dal server sull'ora reale, perche' l'orologio del dispositivo e' fermo al 2021.
// Per aggiungere una frase (es. download interrotti) basta una riga in updateBody().
function lastUpdateMs(realMs) {
  return Math.max(clock.weekStartOf(clock.weekIndex(realMs)), clock.monthEndOf(clock.monthIndex(realMs) - 1));
}
function countdownText(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'in less than an hour';
  const d = Math.floor(h / 24), hh = h % 24;
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  return d >= 1 ? 'in ' + pl(d, 'day') + ' ' + pl(hh, 'hour') : 'in ' + pl(hh, 'hour');
}
function updateBody(realMs) {
  const next = Math.min(clock.weekEnd(realMs), clock.monthEnd(realMs));
  return [
    'Every Monday and on the 1st of each month, the game downloads updated game data (missions and events).',
    'The first time you open the game after an update, loading takes longer than usual. Please keep the app open until the home screen appears. Later logins are fast again.',
    'If the app is closed during the download, nothing is lost: the download simply starts again the next time you open the game.',
    'Next update: ' + countdownText(next - realMs),
  ];
}
function updateNotice(realMs) {
  const today = clock.dayIndex(lastUpdateMs(realMs)) === clock.dayIndex(realMs);
  return { date: '10/16', tag: 'IMPORTANT', title: today ? 'Game data updated today' : 'About game data updates',
    body: updateBody(realMs) };
}

// Solo informazioni utili per capire come funziona il gioco (decisione dell'utente del 16-10): niente
// elenchi di modifiche. In lista prima la notizia dinamica dei dati aggiornati (updateNotice), poi queste, dalla piu' recente.
const NOTICES = [
  // boss raid ricostruiti (I-221, Raids Part 2: originals.tsv 49d/49e, raid_config.json modelTemplates/bossAttributes/modelParts,
  // docs/notes/raid.md), decisione dell'utente del 2-11: tutti i boss serviti, i 15 ricostruiti approvati a vista;
  // 0017, 1012, 1016 (49h/49i, render9) approvati il 4-11
  { date: '11/02', tag: 'IMPORTANT', title: 'Raid Bosses',
    body: ['The weekly **Raid Bosses** follow your Story like the Shop: each week shows the raids of the matching week of the original game. Their graphics, moves and strength come from the original game files wherever they survive; the parts below are **reconstructed**.',
      'Each Raid Boss has its own level: it rises by 1 for every defeat, up to **LV 99**, and all levels **reset to LV 1 on the 1st of every month** (00:00 Pacific time), as in the original game. A boss that comes back in a later week starts again at LV 1; a boss already on the field keeps its level until it is defeated or escapes.',
      '## Graphics',
      'The graphics of 18 raid bosses were incomplete in the surviving game files: **Assault Dragon, Adventurer, Jewel Princess, Gear Golem, Heartless Tsum, Loudmouth Parade, Greedy Grouch, Mysterious Sir, Merry-Go-Rowdy, Holiday Sleigh, Demon Tide, Cranky Cake, Mischief Bouquet, Red-Nosed Chariot, Closehanded Captain, Jewel Sorceress, Circus Crab** and **Crabby Cake**. Their missing pieces are **reconstructed** from the game\'s own files: pieces of their twin or related bosses and enemies, and pieces of the same size chosen by rule. Every one of them was checked by eye against the original look.',
      'The three spiders (**Scourge Spider, Wicked Spider, Malicious Spider**) use the version of their animations that has the **Spinneret** target, and some of their pictures are copied from the same spider or its twin.',
      '**Queen Bee, Queen Bee Ω** and **Lion Headliner** use an older version of their animations from the game files, whose weak points match their surviving data (the abdomen; the two arms); some of their pictures are copied from the same boss\'s 2016 files.',
      'The **list banners** of 20 raid bosses (the picture in the raid list) are **reconstructed**: the worldwide originals were not found, so they are cut from the original Japanese **boss cards**. The boss cards of **Assault Dragon, Adventurer, Jewel Princess, Gear Golem** and **Closehanded Captain** are the original cards of their twin bosses. The **Raid Time!** card of each week is the original weekly raid banner of that week, from archived copies of the original notices.',
      '## Moves and stats',
      'Some bosses have no surviving data of their own: the three spiders use the moves of **Enraged Arachnid**, and **Egg Master** the moves of **Trickmaster** (same animations; **reconstructed**). The spiders keep their own attribute, read from their colour (red Power, green Speed, blue Magic).',
      'The 18 bosses above have no surviving data either: their **moves, part HP shares and rarity** come from a 2016 boss with the same number of weak points (for example Trident Tail, Behemoth, Savage Spider, Fortress Crab; Jewel Sorceress uses Savage Spider, Circus Crab Fortress Crab and Crabby Cake Behemoth), so they are **reconstructed**. Each boss keeps its own attribute where the wiki gives it; its parts take the same attribute, not the separate attributes some wiki pages list for them.',
      '**Assault Dragon, Adventurer, Jewel Princess, Gear Golem** and **Closehanded Captain** keep **all their weak points** in every week (**not original**): in some later weekly raids they had fewer (for example Assault Dragon only its Head), but every surviving version of their animations has the full set, and the game cannot start the fight if a weak point has no HP bar.',
      'The spiders have **4 weak points**: the **Spinneret** and the three **spiderlings**, as from 2016 to July 2018. In the weekly raids from September 2018 only the Spinneret was a target (**not original** here): the only surviving spider animations that have the Spinneret also mark the spiderlings as weak points, and the game cannot start the fight if a weak point has no HP bar. The HP shares are the 2016 ones (Spinneret 900 of 24,000, each spiderling a quarter).',
      'Raid **ATK and DEF** after 2016 are not known and are **reconstructed**; HP comes from recordings of the original game where one exists, otherwise from the tier tables.',
      // Raid Boards: card pictures and names (3 Nov 2026, docs/notes/bacheche.md «Raid Boards»)
      '## Raid Boards',
      'Each **Raid Board** has its original name and card picture, so the boards of a week can be told apart by their picture, as in the original game (two boards of a week can share a name, such as **Enhancement Board**). Raid Coins have their original coin.',
      'The **week’s date is added to each Raid Board title** (**not original**, an addition of this server), for example **Enhancement Board 10/14/19**, so the boards of a kept raid can be told apart from those of the current week.',
      'The card pictures of 4 Raid Boards are **cut from screenshots** of the original game, because the picture files were not found: the **Enhancement Board** of March 11-17, 2019 and the **Radiant Rewards Boards** of July 8-14, 2019, October 14-20, 2019 and January 6-12, 2020.',
      'The positions of the cells on the Raid Boards are **not original**: they follow one path from START in the order of the original list of rewards.',
      // Raid Catalog (raids Part 2, Task 9; user 02-11: catalogue bosses have a level of their own)
      '## Raid Catalog',
      'The **Raid Catalog** is **not original**: it is an addition of this server, in the style of the Special Catalog. Its banner in the Events tab opens the **Training Grounds** when tapped, and its **Details** button lists every raid week of the game with its bosses, tiers and Raid Boards.',
      'One **past raid** at a time can be **kept** in the Events tab, beside the raids of the week. Raids later than your Story stay locked (**Unlocks at Story Quest N**), and raids whose boss cannot be served yet are marked **Not restored yet** and cannot be kept.',
      'The catalogue **Filters** (**not original**) find raids by boss, board or reward name, by type, tier and state, and by **Progress**: **Completed** shows the raids whose objectives you have all completed; **Raid Boards** shows the raids whose Raid Boards are all unlocked, or those with cells still to unlock.',
      'A kept raid follows the rules of its own week (AP, Bonus Time). Its boss has a **level of its own**, starting at **LV 1**: playing it never changes the level of the boss of the week, and the other way round. Its **Raid Boards** are the same as in its week, so a board reward is never given twice; **Raid Coins** are given at every win, as for the raid of the week.',
      'Raid **Lux** is **reconstructed** from what players reported: as in the original game it depends on the HP you take and on your Lux skills, not on hits or damage, and with Lux++ on every Medal a kill is worth about 2% of the boss HP (about 8 billion on Advanced, 14 billion on Legendary, 20 billion on Epic). In **Bonus Time** the Lux of a raid fight is **doubled**, as in the original game: the game counts the normal amount during the fight and the server doubles it when the fight ends.'] },
  // costo 999 delle medaglie di supporto (I-211, support-medal-cost.js, decisione dell'utente 26-10)
  { date: '10/27', tag: 'INFORMATION', title: 'Support Medal Cost',
    body: ['The support Medals (EXP Medals such as Huey, Dewey, Louie and Scrooge, Moogle Medals, Boost Medals such as Chip, Dale and Magic Mirror, Cid, and the Evolve Medals such as Merlin, Flora, Fantasia Mickey and the Blue Fairy) now show **cost 999**, like the Trait Medals.',
      'They are materials for other Medals: with this cost they do not fit on a Keyblade, so they cannot be used in battle by mistake (**not original**: the original data had cost 0).'] },
  // Draw Points (user decision 03-11; make-sell-ticket.js, server.js respondMedalSell/drawPointsUnlocked, gacha.js payType 9):
  // original rules from notices 62950/72831/73873; client 4.3.1: Sell screen sum of medal.sellTicket, payType 9 plate =
  // userPoint.limitedDrawTicket3 with icon 42; texts 106240301/106240303/106180336-341 ours (make_layouts.py)
  // Spirit parts restored (03-11): VIP Spirit Part quests, new parts, Spirit Blind Box (pet-draw.js)
  { date: '11/03', tag: 'IMPORTANT', title: 'Spirit Parts',
    body: ['The **VIP! Jewels & Spirit Part** quests and the Spirit Part VIP campaigns now give the **Spirit part** shown on their banner (with 1400 Jewels and a 6★ Moogle, as in the original game). Before, they gave the avatar accessory of the same name, and four weeks (Lion Dancer, Chocolate Hamstar, Word Bubble: I Love Sora, Cool Sunglasses) gave only a Moogle.',
      '**17 more Spirit parts** with their original graphics are back, among them Starlight Glasses, Balloon Moogle & Chirithy, Balloon Aqua, Balloon Terra, Flying Carpet, Lantern and Pinwheels.',
      '## Spirit Blind Box',
      'The **Spirit Blind Box** deals are in the Shop again, following the Story like the other banners: Bunstar (500 Jewels) and Pigstar (300 Jewels) of November 2017, both back in February 2018 (500 Jewels), January 2021 (500 Jewels) and the last one, from February 25, 2021 to the end of service (**100 Jewels**). Every draw gives one Spirit part of the deal that you do not own yet.',
      'Past Spirit Blind Box deals can be kept in the Shop from the **Banner Catalog** («Keep in the Shop»), one at a time, separately from the kept Medal banner (**not original**). The kept deal shows the **KEPT IN SHOP** badge on its banner, like the kept Medal banner.',
      'In the Banner Catalog, the filter **Banner type** shows only the Medal banners or only the **Spirit parts** deals (**not original**).',
      'Once you own every part of the last Spirit Blind Box, it also gives the Spirit parts that have **no other way to be obtained** here, because their original events are not back yet (**not original**).',
      '## What is reconstructed',
      'The **Gold Reinstar** VIP quests (December 2017): the notice says only that the special quests gave the five Gold Reinstar parts; here two quests give them (the 6★ Moogle of the second quest is ours).',
      'The banner picture of the February 2021 Spirit Blind Box is the one of January 2021 (same title): the original picture is lost.',
      'Two tiny sparkles of the Spirit Blind Box result animation are lost and are not drawn.',
      'The **SPIRIT PART GET!** title of the result survives only in the Japanese files, with some of its pictures missing: the crown and light effects are the ones of the identical **MEDAL GET!** title, and three of its letters (I, R, T) are copied from the same letters of the title.',
      'Some Spirit parts (for example Balloon Fairies and Flying Carpet) looked blurry: their original pictures are sharp but were drawn at a smaller size and then enlarged. They are now drawn at their full size; the pictures themselves are unchanged.',
      '**18 Spirit parts whose pictures were lost are back**, among them **Elsa’s Magic, Kite, Balloon Zazu**, Goldfish, Popcorn Hat, Mickey Mask, Minnie Mask and **Olaf’s Snow Cloud**. Their pictures are **reconstructed** from the original game files: the same item’s avatar accessory kept the identical pictures, and a few small missing pieces are copies of a twin piece of the same part (the Kite tails wave through 4 poses instead of 8; the Black Heart-Shaped Hat uses the placement of the Red one); Olaf’s Snow Cloud has its small round snow dot redrawn as a plain white disc. The Elsa’s Magic VIP week now gives the part. 21 parts have lost their original names (three unknown species and six accessories): they have provisional names that start with **Mystery**.'] },
  { date: '11/03', tag: 'IMPORTANT', title: 'Draw Points',
    body: ['**Draw Points** are back. Sell (convert) the Attack Medals you do not use: each Attack Medal of **Tier 2 or higher** gives as many points as its Tier (Tier 2 gives 2 points, Tier 10 gives 10 points). Tier 1 Medals, support Medals and Trait Medals give none.',
      'Spend them in the **Draw Points Deal**: **100 points = 1 draw** of one boosted SN+ or SN++ Medal. The Draw Points Deal follows the Story like the other banners (lineups of January, February, May, September and October 2020, January and February 2021); the February 2021 lineup also has the original Skill rates of its notice.',
      'Points are earned only once your Story reaches the first Draw Points Deal (Story Quest 895, January 2020); before that, the Sell screen shows the points but none are given. They never expire.',
      'Some 2021 rewards gave Draw Points in the Presents; when they come back, they will go to the same points.',
      '## What is reconstructed',
      'The labels **Draw Points** on the Sell screen and the points held on the Draw Points Deal are written by this restoration (the original texts are lost). The original Shop data of this version called this currency "Premium Ticket": the draw button now says Draw Points.',
      'In the original game the points of the first campaign (January 2020) were removed when it ended; here every point stays (**not original**).',
      'The Draw Points icon (the rainbow crystal printed on the Draw Points Deal banner) comes from the final Japanese version: the worldwide files of this version only had a gold placeholder ticket.',
      '## June 2021',
      'The **7★ Deal** and the **SN++ Deal** of February 2021 now run until the end of service (June 29, 2021), as in the original game, so they are in the Shop with the last part of the Story together with the Draw Points Deal.'] },
  // Free Deal giornaliere (gacha.isFreeDaily): una sola estrazione al giorno fra tutte, fissabili (decisione dell'utente 26-10)
  { date: '10/26', tag: 'IMPORTANT', title: 'Free Deals',
    body: ['**Free Deals** are the free banners with one draw a day, such as the anniversary and holiday draws and the VIP Free Deals. In this version a free draw costs 1 Jewel.',
      'All Free Deals share **one free draw a day**: when more than one is in the Shop, choose which one to draw. The draw comes back the next day (**not original**: each Free Deal had its own daily draw).',
      'Free Deals from past periods can be **kept in the Shop** from the Banner Catalog like the other banners. Keeping more of them, one after another, does not add draws.',
      'In the Banner Catalog the filter **Free Deals** shows them all. VIP Free Deals also need the VIP benefit (see the VIP Draws notice).'] },
  // VIP Draw (I-134, vip-benefit.js, ricerca D:\Progetto_Restauro_KH_UX\tmp\vip\REPORT.md): decisione dell'utente
  // 26-10 = benefit dalle 10 missioni settimanali, per il resto della settimana e la successiva; da rivedere (I-164)
  { date: '10/26', tag: 'IMPORTANT', title: 'VIP Draws',
    body: ['The **VIP Draws** of the original Shop are back: 52 VIP versions of the deals from December 2018 to November 2019. A VIP Draw costs the same as the standard draw and adds the original VIP extras of its deal, such as a closer guarantee of the featured Medal or more Magic Mirrors. The **VIP Free Deals** (one free draw a day) need the VIP benefit too, as in the original.',
      'In the original game VIP Draws needed a **paid weekly pass**. Here nothing is sold: you get the **VIP benefit** by completing **all the Weekly Missions** of a week. It then lasts for the rest of that week and the whole next week (**not original**).',
      'The Weekly Missions include Union Cross, which is not available yet (Raid Bosses are back: see the Raid Bosses notice). Until Union Cross comes back the VIP benefit cannot be earned, so VIP Draws and the VIP Special Quests stay locked.',
      'This rule is temporary and will be reviewed when the game balance is studied again.'] },
  // chat del party di un solo giocatore (I-210, routes-chat.js, stamp-table.js)
  { date: '10/25', tag: 'INFORMATION', title: 'Party Chat',
    body: ['The **Chat** button at the top of the home screen opens your party chat again, as in the original game. You need to be in a party: create one from the Party menu.',
      'Your party has only you as a member, so the chat shows only your own messages and stickers (up to 40 characters per message, the last 1000 messages are kept). It works like a notepad for now.',
      'Stickers: 7 of the original stickers are available. The others had Japanese text drawn in them and are not shown (**reconstructed** list).'] },
  // Proud Mode (I-200, make-proud.js, docs/notes/mappe_storia.md#proud-mode): sblocco alla Quest 500 (decisione
  // dell'utente del 22-10), AP 0 (valore finale), jewel e keyblade della wiki, condizioni coi codici del client
  { date: '10/22', tag: 'IMPORTANT', title: 'Proud Mode',
    body: ['**Proud Mode** is open: the hard version of the Story Quests, from Quest 1 to Quest 979. Tap **Proud Mode** in the Story Quests list.',
      'It opens when you complete **Story Quest 500**. Then the Proud Quests open one at a time, in order, like the Story.',
      'Each Proud Quest has stronger enemies, a **fixed Keyblade** (your own Keyblade of that kind, at its level) and a **condition** on which Medals may use their Special Attack. Continues are not available and Friend Medals cannot be used.',
      'If you do not have the Keyblade of a quest yet, the quest cannot be started: for example Proud Quest 216 needs Stroke of Midnight (Story Quest 595) and Proud Quest 444 needs Fairy Stars (Story Quest 683).',
      'From Proud Quest 801 all three objectives must be completed **together** in the same run.',
      '## Rewards',
      'Every 5 Proud Quests: 150 Jewels (300 from Quest 805, 600 from Quest 885). Objectives give Electrum Ore, Dark Matter, Magic Mirror, Gems, Avatar Coins and Huey, Dewey and Louie Medals.',
      'The Keyblades **Sleeping Lion**, **Counterpoint**, **Fenrir**, **Darkgnaw**, **Missing Ache** and **Diamond Dust** are the rewards of Proud Quests 3, 103, 203, 328, 378 and 428, as in the original game, and are no longer given at the start. If you already have them, you keep them.',
      '## What is reconstructed',
      'Only Quest 1 survives as an original Proud quest file. The other quests are rebuilt from the original game code (how conditions and objectives work) and from the community wiki (levels, Keyblades, conditions, objectives and rewards of each quest).',
      'Proud Quests cost **0 AP**, as at the end of the original game (at launch they cost 10).',
      'Proud Quests 891, 892 and 913 have no special attack condition: none is recorded for them.'] },
  // scheda Special (docs/superpowers/specs/2026-10-30-special-tab-design.md, sezione 9)
  { date: '10/31', tag: 'IMPORTANT', title: 'Special Quests',
    body: ['The **Special** tab of the Quests screen opens once you finish Story Quest 6.',
      '## What the tab shows',
      'The tab **follows your Story**: each part of the Story matches a period of the original game, and the tab shows the Special Quests of **one week** of that period, like the Shop. Every **Monday** it moves to the next week; after the last week of the period it starts again from the first one.',
      'To reach the quests of later periods, go on with the Story: the catalogue says at which Story Quest each of them opens.',
      '## Padlocks and weekdays',
      'Weekday quests open on their original weekdays. On the other days they show a **padlock**.',
      '**Daily Challenge: Cid** lists **only today\'s variant**, as in the original game: VIP does not open the Cid quests of the other days.',
      'Tapping **Unlock All** or a locked banner shows a **message** about the Weekly Missions VIP, because nothing is sold. Because locked banners are shown, the Shop button "Buy discounted 3,000 Jewel pack!" lights up, and it shows the same message.',
      '## VIP',
      '**VIP** is earned by finishing all the **Weekly Missions** of a week, and it lasts for the rest of that week and the whole next week (**not original**: it was a paid weekly pass).',
      '**For now VIP cannot be earned**: the Weekly Missions include Union Cross, which is not available yet (see the VIP Draws notice; Raid Bosses are back). Until it comes back, the VIP quests stay locked, and they are most of the Special Quests.',
      'While VIP is active, every weekday quest is open on any day, with an **Available** plate, and the VIP quests are open too. A bar at the bottom of the tab shows "VIP: all Special Quests open" and the time left (the wording is ours: the original text is unknown).',
      'The **limited VIP campaigns** of the original game return as VIP quests in the week of your Story that matches their original dates.',
      'The **recurring VIP quests** (VIP! Medal Quest, VIP! Gems, VIP! Draw Ticket, VIP! Skill and the others) **change every week** with their original rewards (some weeks had two); in the weeks whose contents are not known they show the rewards of one known week (**reconstructed**).',
      '**VIP! Skill** gives its skill medals as in the original game: a **Scrooge 6★** that carries the skill of its week at the **maximum level** (for example ATK B X Max & Lux++ at LV 20). All its skills exist in this version, so none is replaced. VIP! Skill appears **only in its original weeks** (2019 and from September 2020): in the other weeks it is not offered.',
      '## Rewards',
      'The reward of each objective is given **once**. If you clear a quest again you only get what its enemies give.',
      'The Daily Challenge: Cid quests are the exception: once every objective of all of them is complete, they **reset the following week** and you can earn their rewards again.',
      '## Special Catalog',
      'The first banner is the **Special Catalog**. **Details** opens the catalogue of every period. Tapping a quest in the catalogue opens the **details** of that quest (periods, objectives with their rewards, drops). This page is an addition of this server (**not original**): the original game had none.',
      'The catalogue **Filters** have a **Progress** group (**not original**): **Completed** shows the quests whose objectives you have all completed, **Incomplete** the others, so you can see which ones you have never finished.',
      '**Keep in Special**: you can keep **one quest** at a time. It appears under the catalogue with a KEPT banner, like the kept banner of the Shop (**not original**), and keeping another one replaces it.',
      'Only quests whose **period is over** can be kept: a past week of your current period can be kept once that period has ended. A quest replaced by a better later version cannot be kept. Kept weekday quests can be played on any day; kept VIP quests need VIP.',
      'Tapping the Special Catalog banner starts a **training** quest: it costs no AP and gives no Lux and no drops, and its enemies give no Munny; its three objectives give a little Munny, once. One path leads to a Shadow that clears the quest; the other leads to a training dummy that cannot be defeated, so leave it with **Give Up**. The chests on that path fill your special attack gauge, which is not kept after the quest.',
      '## Maps',
      'The rooms are the original ones, but the **enemies on the maps are placed by this restoration** (**reconstructed**), because the original quest files are lost: their number and positions differ from the original, and some enemies are added to carry the drops. For example, the original VIP! Mirror, Mirror had two enemies; here it has more. VIP! Skill of 2019 has its two original enemies.',
      'The chests and the materials listed for the original quests are **not included**, because their exact contents are not known. The small picture on a quest card may show another room of the same world.',
      '## Not available',
      'The **Adamantite Ore Challenge** and **Mythril Madness** are not available: their materials have **no use** in this version of the game.',
      '## Other reconstructed parts',
      'The drop rates and some rewards of the Special Quests are **reconstructed**, because the original data is lost; a VIP campaign whose quests are not known has one quest of its theme. Rewards that do not exist in this version are replaced by the closest one or left out.',
      'Two campaign banners, **Anniversary Extravaganza: Limited VIP Boards!** and **Limited VIP Coin Skill Board!**, are **reconstructed** from in-game screenshots of their boards, because the original banners are lost.'] },
  // missioni di storia 526-979 (I-009, piano docs/superpowers/plans/2026-10-21-missioni-526-979.md, make-story-oltre.js):
  // parti ricostruite (617/661, nemici, livelli dei nemici 876-979, keyblade, 978) e tappabuchi rimasti dei mondi nuovi;
  // obiettivi (codici del client) e trofei (materiali 61-63) originali dal 21-10; aspetto Dark Road della stessa specie
  // per le famiglie senza grafica originale (make-enemy-oltre.js DR_LOOK, I-194); 21-10 sera: grafiche recuperate dagli
  // OBB 5.0.1 (recon/tools/extra_donors.tsv) e famiglie ricolorate dal gemello DR (jp_recoloured.tsv, categoria 4);
  // 23-10: downscaled copies of original art (extra_donors_dedup.tsv rule dedup-rescale, category 3; served in 240,
  // 1538, 1552); 23-10: whole dead/wait copies (extra_donors_whole.tsv): 1576/1578/1618 dead reconstructed
  { date: '10/21', tag: 'IMPORTANT', title: 'Story Quests 526-979',
    body: ['The Story now goes on after Quest 525, up to **Quest 979**, with the original maps, enemies, objectives and rewards wherever they survive. The parts that were lost are **reconstructed**, as explained below.',
      '## Quests',
      'Quests 617 and 661: the first part of each quest was lost. It is rebuilt in the original room (Quest 661 with the number of enemies of the original stage).',
      'Quest 978 "What Comes After" has no battle: it only plays its cutscenes, as in the original game.',
      '## Enemy strength',
      '250 enemies of the later quests have no surviving stats: they use the abilities and **attack** of the most similar original enemy (same family and role). 62 other enemies are exact copies of their base enemy, as in the original game data.',
      'Enemy **HP above level 999** follows the original scale, measured on recordings of the original game: from Quest 851 enemies get much tougher, and the final quests reach hundreds of billions of HP (Quest 979, Ephemer & Skuld: about 650 billion). Up to level 999, and in Quests 1-525, nothing changes. Where no recording exists the HP is **estimated** from the nearest measured quests, and kept on the low side (**reconstructed**). Quest 960 is now level 1900, as in the original game.',
      'Quests 876-979: the original quest files do not say the level of each enemy (the original server gave it), so every enemy fights at the level of the quest: there are no weaker enemies mixed in.',
      'The late quests were made for the strongest teams of the original game: from about Quest 900 on you need a **very strong team** (high-tier Medals with traits, a strong Keyblade and Guilt).',
      'Some enemies **absorb** the damage of one kind of Medal, as their description says (for example Gargoyle Wizard absorbs Magic Medals, Darkness absorbs Reversed Medals).',
      '## Enemy counters',
      '**Enemy counters**: from Quest 585 on, many enemies show a counter above them. A red counter goes down with each Medal you use, a blue one with each hit. At 0 the enemy interrupts your attack with a move of its own, then the counter starts again from its first value. They are back for the 24 kinds of enemies whose move is described in their original description, such as the Archers (poison, paralysis, sleep), Green Requiem and Emerald Sonata (heal all enemies), Barrier Master (raises its allies\' DEF), Warlock Step and Fortuneteller (lower your STR) or Wight Knight (removes your boosts). Some values of these moves are not recorded anywhere (how much they heal, how long a status or a boost lasts): they are **reconstructed** from the closest original move. Enemies whose counter move is unknown, such as Cy-Bugs or Chocolate Monster, have no counter for now. On bosses the counter is shown next to their HP bar: the original boss bar has no place for it, so that spot is **reconstructed** from the bar of the other enemies.',
      '## Enemy look',
      'Every enemy and every ally now shows its own original look; where pieces were missing they are completed as described above.',
      'Some enemies show their original look, but a few small graphic details that were lost (for example their **shadow**) are reconstructed from the same enemy or from a standard one.',
      'A few pieces of Trickmaster, Shipwreck Shark (the water-slash arcs of its attack) and Luna Bandit survive only at a larger size, in other game files that show the same art: they are shown as **downscaled copies** of that original art (reconstructed).',
      'Barrier Master, Pot Spider, Apricot Opera, Margoyle and Guard Armor Ω show again their original look, recovered from later versions of the game files or from other places where the same enemy appears (raids, cutscenes).',
      'Chill Ripper, Red Gummi Saucer, Blue Gummi Saucer and Ring-A-Ding show their original look; only their defeat animation (a puff of smoke) is **reconstructed**: for Chill Ripper it comes from its twin enemy of Dark Road, for the two Gummi Saucers from the Green Gummi Saucer, and Ring-A-Ding uses the standard one shared by most enemies. The defeat animations of Red Gearbit and Blue Gearbit (from the Green Gearbit, the same model) and of one Cy-Bug (from the other Cy-Bugs of the same size) are **reconstructed** the same way.',
      'Eliminator, Emerald Sonata, Poison Archer, Paralysis Archer, Blitz Spear and Wight Knight had only part of their original graphics left: the missing pieces come from their twin enemy of Dark Road, which has the same model, with the colours matched to the surviving original pieces (**recoloured look**, reconstructed).',
      '## Allies and other characters',
      'In some quests a character fights **at your side** (Hercules, Aladdin, Mog, Phillip, Ephemer, Calhoun, Ralph, the Union leaders and other Keyblade wielders): as in the original game, they join the battle against the boss, attack after your turn and cannot be targeted. Their attacks are the original ally attacks.',
      'The allies show their original look; their original files have no hit or defeat animation, which an ally never uses, so those show the standing pose (**reconstructed**). All the Ralph allies share the same pieces, as in the original files.',
      'The characters standing in the quest maps of Quests 601-974 are back with their original look, except one character in Quests 918, 919 and 927 whose original graphics have not been found (it stays invisible).',
      'The characters you can talk to in the quest maps of Quests 541-930 (and one in Quest 151) had their lines only on the original download server, and only the Japanese version survives: they now speak an English **translation** of the Japanese line (**reconstructed**). One line comes from the original English text of the same scene and one from the community wiki.',
      '## Objectives and rewards',
      ...stopgapParagraph(storyStopgaps()),
      'Quest 555 "Inside the Clock Tower Pt. 10": you face the Master of your own Union. The two objectives "Defeat the target enemy within 2 turns" can only name one Master, so they are shown as **"Complete within 2 turns"** (same reward), which every Union can complete.',
      'The Keyblades **Stroke of Midnight**, **Fairy Stars** and **Bad Guy Breaker** are the rewards of Quests 595, 683 and 880, as in the original game, and are no longer given earlier. If you already have them, you keep them.',
      '## Worlds',
      'Castle of Dreams, Enchanted Dominion and the Wreck-It Ralph worlds play their own original music, but which track each quest used is not known (reconstructed); Game Central Station has only one track, which also plays in battle. Some quests show in the Story list the picture of another room of the same world.'] },
  // speciali a danno variabile (variable-power.js, I-189): righe thethiny verbatim, righe Roboloid ricostruite
  { date: '10/21', tag: 'IMPORTANT', title: 'Variable Special Attacks',
    body: ['Special Attacks whose damage depends on a condition (for example "Inflicts more damage the higher your HP") show their **damage range** again, as in the original game: the Medal details show "x7.12 - 8.64" instead of a single value, and in battle the damage follows the condition.',
      'For 65 Special Attacks the original values are known and are used as they were. The other 642 condition-based Special Attacks of later Medals have their damage range too (**reconstructed**): the lowest and highest damage come from the community Medal list, and the way damage grows between them follows the battle formula of the original game.',
      'The conditions are: HP, HP or defense paid, turns passed, attacks in succession, gauges full or used, gauges of the previous or next Medal, enemies defeated, Lux, a single enemy left, skills triggered, slot number, party size, and poisoned, asleep or paralyzed targets.',
      'For some conditions no original attack of the same kind is known (gauges of the previous or next Medal, less Lux, skills triggered, lower slot, party size): the **curve** between the lowest and the highest damage is reconstructed from a similar condition, so the damage in between may differ a little from the original.',
      'Special Attacks that are "more powerful when critical hit" (18) deal the lowest damage normally and the highest damage on a **critical** hit.',
      'Before this change, about 100 condition-based Special Attacks dealt their highest damage every time, so they may now feel weaker when the condition is not met.'] },
  { date: '10/18', tag: 'IMPORTANT', title: 'Medal skills',
    body: ['Medal skills are reconstructed: 25 of the 163 skills use the original values, the other 138 are rebuilt from the community skill list (power and max trigger rate from the wiki, other values estimated). Some long descriptions are shortened.',
      'After each mission, the Skill EXP of the battle goes to every Medal in your deck that has a skill. The original rule is not known, so this one is **reconstructed**.',
      'Combo skills marked "& GA 0", "& GA 1" and "& GA 2" make the special attack cost 0, 1 or 2 gauges; when the skill is checked is our estimate, as no original value was found.',
      'Scrooge Medals from the **Skills to Thrill** deals and from the VIP! Skill quest come with the skill shown on their banner, at max level. Other new Scrooge Medals get a skill picked by rarity, because the original skill depended on where the Scrooge came from. Scrooges you already own keep their skill.'] },
  { date: '10/16', tag: 'INFORMATION', title: 'Differences from the original game',
    body: DIFFERENCES_BODY },
  { date: '10/16', tag: 'INFORMATION', title: 'Missions',
    body: ['Open the **scroll** under your avatar on the home screen to see your Beginner, Daily, Weekly and Limited Missions, then tap **Receive** to collect the rewards.',
      'Daily Missions reset every day, Weekly Missions every Monday and Limited Missions with their campaign: the time left is shown on each tab.',
      'Limited campaigns come back in turn. A campaign that gives a Medal joins the rotation only once your Story reaches the date it ran in the original game (for example the "Defeat 100 enemies!" campaign with SN++ - FF7R Aerith, April 2020).',
      'Rewards that you can own only once (Medals, titles, Spirit parts) are given once: when their campaign comes back, the missions you already collected are not shown again. Missions you did not finish in time come back, and finished rewards you did not collect go to your Presents.'] },
  { date: '10/20', tag: 'IMPORTANT', title: 'Spirit points and ranks',
    body: ['Spirit points of each Medal, the points needed for each Spirit rank and the multiplier of the 6th Medal slot (your Spirit\'s slot) now follow the original values (community wiki): from x1.00 at rank 1 to x3.90 at rank 17 (2,592 points). Medals give points by their Special Attack Bonus level (15 to 270), with fixed values for Event, VIP, Prime, Supernova and some special Medals (up to 360), and 20% more with at least one trait.',
      'Your Spirit rank may be lower than before: the earlier values were estimates.',
      'Medals without a Special Attack Bonus level (below 6★) give 15 points (**reconstructed**: the original value is not documented).'] },
  { date: '10/20', tag: 'IMPORTANT', title: 'Enemy attacks',
    body: ['Enemies use their **original attacks** again: power, targets, boosts and healing as in the original game. Enemies such as Poison Apple, Neoshadow, Creeper Plant or Ice Plant can **poison**, put to **sleep** or **paralyze** you again (Esuna of your Spirit cures it). Before, every enemy used one of three simple attacks, so some battles may now be harder.',
      'The hit effect of some enemy attacks is not in the game data: those attacks show a standard hit effect (**reconstructed**).'] },
  { date: '10/20', tag: 'INFORMATION', title: 'Special Attack animations',
    body: ['Special Attacks use their **original animations** again, and the number of hits you see is always the one written on the Medal ("Deals 13 hits" = 13 hits). The total damage does not change.',
      'For about 700 Special Attacks the original animation is known: it is used as it was. Some later Medals (for example "Ars Solum EX") use the animation of the original attack with the same name.',
      'For the other Special Attacks the original animation is lost: they use the original animation of **another** Special Attack with the same number of hits (**reconstructed**). Support Special Attacks (healing, boosts) use the original support animations.',
      'A few Special Attacks still use a simple animation, because their only copy is incomplete.',
      'Supernovas deal 1 hit (4 for "Reversed Strike All M"), as in the original game. Which Supernova animation each Medal used is not known: each Supernova uses one of the original Supernova animations with that number of hits (**reconstructed**).'] },
  { date: '10/20', tag: 'INFORMATION', title: 'Spirit Tricks',
    body: ['All 22 **Tricks** of your Spirit work in battle, unlocked by Spirit rank as in the original game: Steal I-III, Blast I-V, Esuna I, HP Recovery I, Poison, Paralysis and Sleep Boost I, P/S/M Attack Boost I-II and Combo I-III. Only the highest level of each Trick is active.',
      'The original Trick data is lost: effects, ranks, charges and chances come from the community wiki, and how each Trick works in battle comes from the game itself. Some values are **reconstructed**: the "low HP" limit of Blast (25% of the enemy’s HP), the strength of Poison Boost and Sleep Boost, the ailments cured by Esuna, and how many times per battle P/S/M Attack Boost can trigger (once per turn, with no battle limit).',
      'Blast hits with a hidden attack that deals exactly its damage (10,000 to 750,000). Steal picks one enemy drop per battle (50% chance for each enemy that drops an item) and gives it x2, x3 or x4.'] },
  { date: '10/20', tag: 'INFORMATION', title: 'Login Bonus',
    body: ['The **Login Bonus** is back: log in once a day for the Daily Login Bonus (a 5-day cycle: 100, 100, 200, 200 and 300 Jewels, the amounts used from 2017 to the end of the game) and the Total Login Bonus (Jewels and titles on the original milestone days, up to day 1850). The rewards arrive in your Presents.',
      'The login day changes at **08:00 UTC**, together with the Daily Missions. In the original game it changed at 4:00 a.m. Pacific Time.',
      'Missing a day does not restart the 5-day cycle: it goes on from the day you reached (reconstructed: the original rule is not documented).',
      'Special Login Bonuses (campaigns with gifts on set dates) will come with the events.'] },
  { date: '10/19', tag: 'INFORMATION', title: 'Traits',
    body: ['Fusing two copies of the same Medal gives it a random trait, as in the original game. Copies of different rarities of the same Medal count too. One fusion gives one trait, even with several copies; Special Attack dots and the Special Attack Bonus still count every copy.',
      'When all trait slots are full you choose which trait to replace, or tap **Skip** to keep your traits. If you close the game before choosing, the choice comes back the next time you log in.',
      'The chances of each trait were never published: here **each of the 11 traits has the same chance** (reconstructed). The stronger traits added in 2020 (Extra Attack: 50% Power, Enemy DEF -70%, STR +1500, Damage in Raids +50%) are available **only from the Moogle Shop**.',
      'Evolved versions count as the same Medal: SN, SN+ and SN++ of the same character, or a Medal and its Supernova, share their Album slot and give each other traits (reconstructed from the original deals).',
      '**Trait Medals** are back: grey 6★ Medals that belong to one Medal and share its Album slot. Fused onto their Medal they give a trait and one Special Attack dot, or unlock or re-roll the Special Attack Bonus when the dots are full; fused onto other Medals they only give EXP. Their pictures are recreated in black and white from their Medal, and their EXP and sell price are those of their Medal (reconstructed).'] },
  { date: '10/20', tag: 'INFORMATION', title: 'Shop',
    body: ['The first banner in the Shop, **Banner Catalog**, cannot be drawn: tap its **Details** to see the banners and the Medals they contain.',
      'Draws cost Jewels or Tickets earned in the game. **Draw Odds** shows the rates used by this restoration.',
      'Guarantees work as on the original banners: the yellow line under a banner counts down the draws left to its guaranteed Medal.',
      'When a guarantee covers too many Medals to name them all, the yellow line names the kind of Medal from the banner\'s original notice instead (for example "A SN or higher Medal is guaranteed! Draws left: 3"). This wording is written by this restoration.',
      'Every original banner is in the Banner Catalog. Banners unlock as you progress through the Story; in the original game they followed the calendar.',
      '## Weekly rotation',
      'Each part of the Story matches a period of the original calendar. The Shop shows **one week** of that period at a time: every banner that ran during that week, up to 20.',
      'Every **Monday** the Shop moves to the next week; after the last week of the period it starts again from the first one, so every banner of your period comes back.',
      'When you clear enough Story Quests to reach the next period, the Shop moves to the first week of the new period. Banners of periods you have passed stay in the Banner Catalog, where you can still see their Medals and rates.',
      'Each banner\'s **Details** say whether it is in the Shop now and, if not, in how many weeks it comes back.',
      '## Seasonal banners',
      'During each of these windows of the **real calendar**, the most recent unlocked edition of that season\'s banners appears at the top of the Shop, right after the Banner Catalog (and the kept banner, if any), from the first time you log in inside the window until the first login after it ends. If no edition is unlocked yet, nothing appears.',
      'Windows (UTC):',
      ...seasonLines(),
      'When two seasons overlap, both appear, unless they use different special tickets (Spooky Cookies, Moogle Points, Holiday Draw Tickets): then only the first one in the list above shows. A seasonal banner that is already in the week\'s rotation is not shown twice.',
      '## Keep one banner in the Shop',
      'In the Banner Catalog, tap **📌 Keep in the Shop** on a banner\'s row (or in its **Details**). It then stays in the Shop every week, right after the Banner Catalog plate and above the seasonal banners, marked with a **📌 KEPT IN SHOP** badge.',
      'You can keep only banners from a period you have already passed in the Story. Daily Free Deals can be kept too (see the Free Deals notice). Other draws that cost 1 Jewel and seasonal banners cannot be kept.',
      'Keep one banner at a time: keeping another replaces the first, and **Remove from the Shop** takes it out whenever you like.',
      '**Leave and re-enter the Shop** after keeping a banner to see it.',
      'The banner\'s own draw limits still apply.',
      'The Shop never shows two different special tickets at once. When they clash, the seasonal banner wins, then the kept banner, then the weekly rotation; the banner that loses steps aside until the season ends. A clash means a different special ticket (for example Spooky Cookies, Moogle Points or Holiday Draw Tickets).',
      '## Catalog filters',
      'The **GAME YEAR** tabs split the Banner Catalog by year, each year running from one anniversary (April 7) to the next.',
      'The **Filters** panel has three parts: **Find a Medal** (the banners where it can be drawn), **Paid with** (Jewels, Tickets and so on) and **Show** (all banners, those in the Shop now, unlocked or still locked ones).',
      'Filters only change the Catalog, never the Shop.'] },
  { date: '10/14', tag: 'INFORMATION', title: 'Supernova and Dual Meow Wow',
    body: ['Equipping a Supernova Medal lets you unleash its powerful Supernova once per quest: tap the button under the special attack gauge during your turn.',
      'To unlock or raise the Supernova of a Medal, use Evolve with five identical Dual Meow Wow Medals; the base Medal must be at its max level.'] },
];
const TAG_COLOR = { EVENT: '#36c9d6', CAMPAIGN: '#8a3fc4', UPDATE: '#9fb85a', IMPORTANT: '#e0405a', INFORMATION: '#3f7fd0' };

const webBase = (sessionBase) => sessionBase.replace(/^https:/, 'http:');   // https: la WebView rifiuta il certificato
const noticesUrl = (sessionBase) => `${webBase(sessionBase)}/web/notices`;

function informationList(sessionBase) {
  return { viewUrl: noticesUrl(sessionBase) };
}

function informationPopup(sessionBase) {
  return { popUpViewUrl: [noticesUrl(sessionBase)] };
}

// project site (opts.web): the notices inside a frame like the in-game Notices popup (reference\other_menu)
const WEB_CSS = '<style>body{background:#000 linear-gradient(#06121c,#0a2233);min-height:100vh;padding:24px 12px;box-sizing:border-box}'
  + '.frame{max-width:980px;margin:0 auto;border:4px solid #1d8fe0;border-radius:14px;background:#0b4f8f;padding:10px 12px 14px;'
  + 'box-shadow:0 0 0 2px #0a2f55,0 8px 30px rgba(0,0,0,.6)}'
  + '.ttl{font:bold 30px sans-serif;color:#fff;text-shadow:0 2px 0 #0a2f55;padding:4px 8px 10px}'
  + '*{box-sizing:border-box}.x{min-width:0}#list{background:#174a5c;border:2px solid #36a6e6}.det{min-height:60vh}.bar{position:sticky}'
  + '.foot{max-width:980px;margin:14px auto 0;color:#8fb3c0;font:13px sans-serif;text-align:center}.foot a{color:#5fe0f0}'
  + '@media(max-width:600px){body{padding:12px 6px}.frame{padding:8px 6px 10px}.row{padding:10px 6px}.d{width:44px;font-size:13px}.t{width:96px;font-size:11px;margin-right:8px}.x{font-size:15px}.ttl{font-size:24px}}</style>';
const WEB_FOOT = '<div class="foot">Re-Union X &middot; a fan restoration of Kingdom Hearts Union &chi;[Cross], not affiliated with Square Enix or Disney &middot; the in-game Notices, exported from the server '
  + '&middot; <a href="https://github.com/Kxos/Re-Union-X">project on GitHub</a></div>';

// Pagina /web/notices, come l'elenco originale (reference\other_menu\notices_list_yt_02.jpg: data,
// etichetta colorata, titolo, freccia rossa) e il dettaglio (notices_detail_yt_03.jpg e notices_dialog_01.jpg:
// fondo blu notte, testo spaziato, titoletti col quadratino, parole chiave in arancione, BACK blu in basso).
// Testo delle notizie: «## Titolo» = sezione (le righe sotto diventano un elenco puntato), «**parola**» = evidenziata.
// newest first, like the original list (dates are «MM/DD» of the same year); same date: the order of NOTICES
const byDate = (list) => list.map((n, i) => [n, i]).sort(([a, i], [b, j]) => b.date.localeCompare(a.date) || i - j).map(([n]) => n);

// opts.web: static copy for the project site (docs/notices/, export-notices.js): opts.notices instead of the live list,
// no timing beacon, a «Notices» frame like the in-game popup, centered, and #nN in the address opens notice N
function noticesPage(realMs = Date.now(), opts = {}) {
  const notices = byDate(opts.notices || [updateNotice(realMs), ...NOTICES]);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="k">$1</b>');
  const bodyHtml = (body) => {
    let out = '', list = false;
    for (const line of body) {
      if (line.startsWith('## ')) {
        if (list) out += '</ul>';
        out += `<h3>${esc(line.slice(3))}</h3><ul>`;
        list = true;
      } else out += list ? `<li>${rich(line)}</li>` : `<p>${rich(line)}</p>`;
    }
    return out + (list ? '</ul>' : '');
  };
  const rows = notices.map((n, i) => `<a class="row" href="#n${i}" onclick="show(${i});return false">`
    + `<span class="d">${esc(n.date)}</span><span class="t" style="background:${TAG_COLOR[n.tag] || '#3f7fd0'}">${esc(n.tag)}</span>`
    + `<span class="x">${esc(n.title)}</span><span class="a"></span></a>`).join('');
  const details = notices.map((n, i) => `<div class="det" id="d${i}"><div class="meta"><span class="t" style="background:${TAG_COLOR[n.tag] || '#3f7fd0'}">${esc(n.tag)}</span>`
    + `<span class="d">${esc(n.date)}</span></div><h2>${esc(n.title)}</h2>${bodyHtml(n.body)}`
    + '<div class="bar"><a class="back" href="#" onclick="show(-1);return false">BACK<span></span></a></div></div>').join('');
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;background:#174a5c;color:#fff;font:18px sans-serif;letter-spacing:.3px}'
    + '.row{display:flex;align-items:center;padding:12px 10px;border-bottom:2px dotted #8fb3c0;color:#fff;text-decoration:none}'
    + '.row:active{background:#1f5d72}.d{width:62px}'
    + '.t{display:inline-block;width:124px;text-align:center;font-size:14px;padding:5px 0;margin-right:12px;border-radius:3px;'
    + 'box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.18)}'
    + '.x{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.a{margin-left:10px;width:0;height:0;border-style:solid;border-width:8px 0 8px 13px;border-color:transparent transparent transparent #e8242c}'
    + '.det{display:none;min-height:100vh;box-sizing:border-box;background:#0d3350;padding:14px 22px 96px;line-height:1.85}'
    + '.meta{display:flex;align-items:center;color:#9fc3d6;font-size:15px}.meta .t{width:auto;padding:3px 12px}'
    + 'h2{color:#5fe0f0;font-size:21px;margin:10px 0 14px;padding-bottom:8px;border-bottom:2px solid #1e5f80}'
    + 'h2:before,h3:before{content:"";display:inline-block;width:14px;height:14px;background:#2fd0e8;margin-right:10px;vertical-align:1px}'
    + 'h3{color:#5fe0f0;font-size:18px;margin:22px 0 6px}p{color:#eef4f7;margin:0 0 14px}'
    + 'ul{margin:0 0 6px;padding:0 0 0 4px;list-style:none}li{position:relative;padding:6px 0 6px 22px;border-bottom:1px solid #1a4a68;color:#eef4f7}'
    + 'li:before{content:"";position:absolute;left:4px;top:19px;width:7px;height:7px;border-radius:50%;background:#2fd0e8}'
    + '.k{color:#ffae3b;font-weight:bold}'
    + '.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(6,26,42,0),rgba(6,26,42,.92) 35%)}'
    + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;'
    + 'font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);'
    + 'box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5);text-shadow:0 1px 2px #0a2a6a}.back span{display:inline-block;margin-left:12px;width:14px;height:9px;border:3px solid #fff;border-left:0;border-radius:0 8px 8px 0;vertical-align:1px;position:relative}.back span:after{content:"";position:absolute;left:-7px;bottom:-8px;border-style:solid;border-width:6px 9px 6px 0;border-color:transparent #fff transparent transparent}</style>'
    + (opts.web ? WEB_CSS : '')
    + '<script>function show(i){document.getElementById("list").style.display=i<0?"block":"none";'
    + 'for(var k=0;k<' + notices.length + ';k++)document.getElementById("d"+k).style.display=k===i?"block":"none";'
    + (opts.web ? 'history.replaceState(null,"",i<0?location.pathname:"#n"+i);' : '')
    + 'window.scrollTo(0,0)}'
    + (opts.web ? 'window.addEventListener("load",function(){var m=/^#n([0-9]+)$/.exec(location.hash);if(m)show(+m[1])})' : '')
    // avvisa il server appena disegnata (tempi del popup al primo avvio, server.js noticesshown)
    // tempi delle fasi misurati dalla WebView (risposta, DOM pronto, primo disegno, load), in ms dall'inizio della navigazione
    + (opts.web ? '' : 'window.addEventListener("load",function(){requestAnimationFrame(function(){var t=performance.timing,n=t.navigationStart,'
    + 'p=(performance.getEntriesByType&&performance.getEntriesByType("paint"))||[],fp=p.length?Math.round(p[0].startTime):-1;'
    + 'new Image().src="/web/notices/shown?resp="+(t.responseEnd-n)+"&dom="+(t.domContentLoadedEventEnd-n)+"&paint="+fp+"&load="+(t.loadEventStart-n)+"&now="+Math.round(performance.now())})})')
    + '</script></head><body>'
    + (opts.web ? `<div class="frame"><div class="ttl">Notices</div><div id="list">${rows}</div>${details}</div>${WEB_FOOT}` : `<div id="list">${rows}</div>${details}`)
    + '</body></html>';
}

// owned: medaglie possedute [{medalId, guiltFactor}]; medalRows: tabella master medal;
// maxGuilt(tier) -> fattore massimo del tier (medal-guilt.js GUILT_RANGES). Le boosted (groupId = normale,
// medal-boost.js) non sono voci dell'album: la riga si trova per id, la copia conta per la normale. Le Trait Medal
// (type 9) condividono la cella della loro medaglia (notice 38128): non sono voci e non sbloccano la cella
function albumData(owned, medalRows, maxGuilt) {
  const byId = new Map(medalRows.map((r) => [r.medalId, r]));
  const best = new Map();
  for (const m of owned) {
    const row = byId.get(m.medalId);
    if (!row || m.medalId === 1 || row.type === 9) continue;
    const f = m.guiltFactor || 0;
    const top = maxGuilt(row.guiltValue || 0);
    const st = f <= 0 ? 0 : top && f >= top ? 2 : 1;
    const id = isBoosted(row) ? row.groupId : m.medalId;
    best.set(id, Math.max(best.get(id) ?? 0, st));
  }
  return {
    userAlbum: {
      albumMedals: [...best].sort((a, b) => a[0] - b[0]).map(([medalId, guiltStatus]) => ({ medalId, guiltStatus })),
      allMedalCount: medalRows.filter((r) => r.medalId !== 1 && !isBoosted(r) && r.type !== 9).length,
    },
  };
}

module.exports = { NOTICES, byDate, updateBody, noticesUrl, informationList, informationPopup, noticesPage, albumData };
