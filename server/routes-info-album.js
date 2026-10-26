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
  '## Shop and draws',
  'Shop draw rates are reconstructed where the original game did not publish them (Medal rarities, guarantees and Skill rates are original): Draw Odds and each banner\'s Details say so.',
  'Bonus items of a draw (Magic Mirror, Gems...) arrive in your Presents.',
  'Free draws cost 1 Jewel. VIP Free Deals are open to everyone, with one free VIP draw per day in total.',
  'Free deals that could be drawn only once (or once per day) keep that limit.',
  'Seasonal draw currencies (Spooky Cookies, Moogle Points, Holiday Draw Tickets) are kept separately; the Shop shows one of them at a time.',
  'Some 2016-17 banners only drew Epic Medals; the game data no longer says which Medals were Epic, so these banners draw from their full sets.',
  'Blue Fairy Deal banners are in the Banner Catalog but cannot be drawn yet: Blue Fairies will come with a future update.',
  'Trait Medals are back: a deal that guaranteed a Trait Medal gives it (all 313 Trait Medals, matched to their Medals from the community wiki).',
  'Boosted Medals: the chance of a boosted version on deals that offered one is reconstructed (5% per eligible Medal). Guaranteed max-level Skills are given only for Skills that exist in this restoration.',
  'Boosted stats on deals that did not state them are reconstructed (+1000 STR, +1000 DEF), and bonus support Medals earned through a guarantee arrive in your Presents.',
  '## Seasonal banners and pinned banner',
  'Seasonal banners follow fixed dates of the real calendar, and the Shop shows the most recent unlocked edition of each season, from the first time you log in inside its window. In the original game each edition ran on its own dates.',
  'The banner you keep in the Shop with **Keep in the Shop** did not exist in the original game.',
  'Limited Missions that give Platinum Tickets or Draw Tickets appear only after a banner that uses them is unlocked.',
  '## Purchases',
  'There are no purchases: Jewels and items come from quests, missions and presents.',
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
  // Free Deal giornaliere (gacha.isFreeDaily): una sola estrazione al giorno fra tutte, fissabili (decisione dell'utente 26-10)
  { date: '10/26', tag: 'IMPORTANT', title: 'Free Deals',
    body: ['**Free Deals** are the free banners with one draw a day, such as the anniversary and holiday draws and the VIP Free Deals.',
      'All Free Deals share **one free draw a day**: when more than one is in the Shop, choose which one to draw. The draw comes back the next day (**not original**: each Free Deal had its own daily draw).',
      'Free Deals from past periods can be **kept in the Shop** from the Banner Catalog like the other banners. Keeping more of them, one after another, does not add draws.',
      'In the Banner Catalog the filter **Free Deals** shows them all. VIP Free Deals also need the VIP benefit (see the VIP Draws notice).'] },
  // VIP Draw (I-134, vip-benefit.js, ricerca D:\Progetto_Restauro_KH_UX\tmp\vip\REPORT.md): decisione dell'utente
  // 26-10 = benefit dalle 10 missioni settimanali, per il resto della settimana e la successiva; da rivedere (I-164)
  { date: '10/26', tag: 'IMPORTANT', title: 'VIP Draws',
    body: ['The **VIP Draws** of the original Shop are back: 52 VIP versions of the deals from December 2018 to November 2019. A VIP Draw costs the same as the standard draw and adds the original VIP extras of its deal, such as a closer guarantee of the featured Medal or more Magic Mirrors. The **VIP Free Deals** (one free draw a day) need the VIP benefit too, as in the original.',
      'In the original game VIP Draws needed a **paid weekly pass**. Here nothing is sold: you get the **VIP benefit** by completing **all the Weekly Missions** of a week. It then lasts for the rest of that week and the whole next week (**not original**).',
      'The Weekly Missions include Raid Bosses and Union Cross, which are not available yet: until they come back the VIP benefit cannot be earned and VIP Draws show a padlock.',
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
  // missioni di storia 526-979 (I-009, piano docs/superpowers/plans/2026-10-21-missioni-526-979.md, make-story-oltre.js):
  // parti ricostruite (617/661, nemici, livelli dei nemici 876-979, keyblade, 978) e tappabuchi rimasti dei mondi nuovi;
  // obiettivi (codici del client) e trofei (materiali 61-63) originali dal 21-10; aspetto Dark Road della stessa specie
  // per le famiglie senza grafica originale (make-enemy-oltre.js DR_LOOK, I-194); 21-10 sera: grafiche recuperate dagli
  // OBB 5.0.1 (recon/tools/extra_donors.tsv) e famiglie ricolorate dal gemello DR (jp_recoloured.tsv, categoria 4);
  // 23-10: downscaled copies of original art (extra_donors_dedup.tsv rule dedup-rescale, category 3; served in 240,
  // 1538, 1552); 23-10: whole dead/wait copies (extra_donors_whole.tsv): 1576/1578/1618 dead reconstructed
  { date: '10/21', tag: 'IMPORTANT', title: 'Story Quests 526-979',
    body: ['The Story now goes on after Quest 525, up to **Quest 979**, with the original maps, enemies, objectives and rewards wherever they survive. The parts that were lost are **reconstructed**, as explained below.',
      '## Quests and enemies',
      'Quests 617 and 661: the first part of each quest was lost. It is rebuilt in the original room (Quest 661 with the number of enemies of the original stage).',
      '250 enemies of the later quests have no surviving stats: they use the abilities and **attack** of the most similar original enemy (same family and role). 62 other enemies are exact copies of their base enemy, as in the original game data.',
      'Enemy **HP above level 999** follows the original scale, measured on recordings of the original game: from Quest 851 enemies get much tougher, and the final quests reach hundreds of billions of HP (Quest 979, Ephemer & Skuld: about 650 billion). Up to level 999, and in Quests 1-525, nothing changes. Where no recording exists the HP is **estimated** from the nearest measured quests, and kept on the low side (**reconstructed**). Quest 960 is now level 1900, as in the original game.',
      'The late quests were made for the strongest teams of the original game: from about Quest 900 on you need a **very strong team** (high-tier Medals with traits, a strong Keyblade and Guilt).',
      'Some enemies show their original look, but a few small graphic details that were lost (for example their **shadow**) are reconstructed from the same enemy or from a standard one.',
      'A few pieces of Trickmaster, Shipwreck Shark (the water-slash arcs of its attack) and Luna Bandit survive only at a larger size, in other game files that show the same art: they are shown as **downscaled copies** of that original art (reconstructed).',
      'Barrier Master, Pot Spider, Apricot Opera, Margoyle and Guard Armor Ω show again their original look, recovered from later versions of the game files or from other places where the same enemy appears (raids, cutscenes).',
      'Chill Ripper, Red Gummi Saucer, Blue Gummi Saucer and Ring-A-Ding show their original look; only their defeat animation (a puff of smoke) is **reconstructed**: for Chill Ripper it comes from its twin enemy of Dark Road, for the two Gummi Saucers from the Green Gummi Saucer, and Ring-A-Ding uses the standard one shared by most enemies. The defeat animations of Red Gearbit and Blue Gearbit (from the Green Gearbit, the same model) and of one Cy-Bug (from the other Cy-Bugs of the same size) are **reconstructed** the same way.',
      'Eliminator, Emerald Sonata, Poison Archer, Paralysis Archer, Blitz Spear and Wight Knight had only part of their original graphics left: the missing pieces come from their twin enemy of Dark Road, which has the same model, with the colours matched to the surviving original pieces (**recoloured look**, reconstructed).',
      'Some later enemies whose original graphics are still missing use for now the **look of the same or a similar enemy**, from Dark Road (for example Sleep Archer or Amber Opera) or from Union χ itself (for example Martial Monkey shows as a Cheery Ape), until their original graphics are recovered.',
      'In some quests a character fights **at your side** (Hercules, Aladdin, Mog, Phillip, Ephemer, Calhoun, Ralph, the Union leaders and other Keyblade wielders): as in the original game, they join the battle against the boss, attack after your turn and cannot be targeted. Their attacks are the original ally attacks.',
      'Hercules and two Keyblade wielders (Quests 350, 525, 540 and 825), Aladdin (Quests 585, 753, 757, 760, 789 and 790), Ralph (Quests 923, 930, 931, 932, 935, 955, 965 and 975), Ephemer, Calhoun and two of the Union leaders (Quest 977) show their original look; their original files have no hit or defeat animation, which an ally never uses, so those show the standing pose (**reconstructed**). The original graphics of the other allies are incomplete: for now they show the look of Hercules (Prince Ali, Phillip) or of one of those Keyblade wielders (Mog, the other Union leaders), until their own graphics are recovered.',
      'Quests 876-979: the original quest files do not say the level of each enemy (the original server gave it), so every enemy fights at the level of the quest: there are no weaker enemies mixed in.',
      '**Enemy counters** (26-10): from Quest 585 on, many enemies show a counter above them. A red counter goes down with each Medal you use, a blue one with each hit. At 0 the enemy interrupts your attack with a move of its own, then the counter starts again from its first value. They are back for the 24 kinds of enemies whose move is described in their original description, such as the Archers (poison, paralysis, sleep), Green Requiem and Emerald Sonata (heal all enemies), Barrier Master (raises its allies\' DEF), Warlock Step and Fortuneteller (lower your STR) or Wight Knight (removes your boosts). Some values of these moves are not recorded anywhere (how much they heal, how long a status or a boost lasts): they are **reconstructed** from the closest original move. Enemies whose counter move is unknown, such as Cy-Bugs or Chocolate Monster, have no counter for now.',
      'Some enemies **absorb** the damage of one kind of Medal, as their description says (for example Gargoyle Wizard absorbs Magic Medals, Darkness absorbs Reversed Medals).',
      'Quest 978 "What Comes After" has no battle: it only plays its cutscenes, as in the original game.',
      '## Objectives and rewards',
      ...stopgapParagraph(storyStopgaps()),
      'Quest 555 "Inside the Clock Tower Pt. 10": you face the Master of your own Union. The two objectives "Defeat the target enemy within 2 turns" can only name one Master, so they are shown as **"Complete within 2 turns"** (same reward), which every Union can complete.',
      'The Keyblades **Stroke of Midnight**, **Fairy Stars** and **Bad Guy Breaker** are the rewards of Quests 595, 683 and 880, as in the original game, and are no longer given earlier. If you already have them, you keep them.',
      '## Worlds',
      'Castle of Dreams, Enchanted Dominion and the Wreck-It Ralph worlds play their own original music, but which track each quest used is not known (reconstructed); Game Central Station has only one track, which also plays in battle. Some quests show in the Story list the picture of another room of the same world.'] },
  // speciali a danno variabile (variable-power.js, I-189): righe thethiny verbatim, righe Roboloid ricostruite
  { date: '10/21', tag: 'IMPORTANT', title: 'Variable Special Attacks',
    body: ['Special Attacks whose damage depends on a condition (for example "Inflicts more damage the higher your HP") show their **damage range** again, as in the original game: the Medal details show "x7.12 - 8.64" instead of a single value, and in battle the damage follows the condition.',
      'For 65 Special Attacks the original values are known and are used as they were. All the other condition-based Special Attacks (642 of later Medals) now have their damage range too: HP, HP or defense paid, turns passed, attacks in succession, gauges full or used, gauges of the previous or next Medal, enemies defeated, Lux, a single enemy left, skills triggered, slot number, party size, poisoned, asleep or paralyzed targets. The lowest and highest damage come from the community Medal list, and the way damage grows between them follows the battle formula of the original game (**reconstructed**).',
      'For some conditions no original attack of the same kind is known (gauges of the previous or next Medal, less Lux, skills triggered, lower slot, party size): the **curve** between the lowest and the highest damage is reconstructed from a similar condition, so the damage in between may differ a little from the original.',
      'Special Attacks that are "more powerful when critical hit" (18) deal the lowest damage normally and the highest damage on a **critical** hit.',
      'Before this change, about 100 condition-based Special Attacks dealt their highest damage every time, so they may now feel weaker when the condition is not met.'] },
  { date: '10/18', tag: 'IMPORTANT', title: 'Medal skills',
    body: ['Medal skills are reconstructed: 25 of the 163 skills use the original values, the other 138 are rebuilt from the community skill list (power and max trigger rate from the wiki, other values estimated). Some long descriptions are shortened.',
      'After each mission, the Skill EXP of the battle goes to every Medal in your deck that has a skill. The original server could not know which Medals you used, so this is our deduction.',
      'Combo skills marked "& GA 0", "& GA 1" and "& GA 2" make the special attack cost 0, 1 or 2 gauges; when the skill is checked is our estimate, as no original value was found.',
      'Scrooge Medals from the **Skills to Thrill** deals come with the skill shown on their banner, at max level. Other new Scrooge Medals get a skill picked by rarity, because the original skill depended on where the Scrooge came from. Scrooges you already own keep their skill.'] },
  { date: '10/16', tag: 'INFORMATION', title: 'Differences from the original game',
    body: DIFFERENCES_BODY },
  { date: '10/16', tag: 'INFORMATION', title: 'Missions',
    body: ['Open the **scroll** under your avatar on the home screen to see your Beginner, Daily, Weekly and Limited Missions, then tap **Receive** to collect the rewards.',
      'Daily Missions reset every day, Weekly Missions every Monday and Limited Missions with their campaign: the time left is shown on each tab.',
      'Limited campaigns come back in turn. A campaign that gives a Medal joins the rotation only once your Story reaches the date it ran in the original game (for example the "Defeat 100 enemies!" campaign with SN++ - FF7R Aerith, April 2020).',
      'Rewards that you can own only once (Medals, titles, Spirit parts) are given once: when their campaign comes back, the missions you already collected are not shown again. Missions you did not finish in time come back, and finished rewards you did not collect go to your Presents.'] },
  { date: '10/20', tag: 'IMPORTANT', title: 'Spirit points and ranks',
    body: ['Spirit points of each Medal, the points needed for each Spirit rank and the 6th slot multiplier now follow the original values (community wiki): from x1.00 at rank 1 to x3.90 at rank 17 (2,592 points). Medals give points by their Special Attack Bonus level (15 to 270), with fixed values for Event, VIP, Prime, Supernova and some special Medals (up to 360), and 20% more with at least one trait.',
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
      'Evolved versions count as the same Medal: SN, SN+ and SN++ of the same character, or a Medal and its Supernova, share their Album slot and give each other traits (reconstructed from the original deals: Trait Medal #130 was sold for SN+ - KH III Xemnas, the wiki lists it for SN - KH III Xemnas).',
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
      'You can keep only banners from a period you have already passed in the Story. Free Deals, draws that cost 1 Jewel and seasonal banners cannot be kept.',
      'Keep one banner at a time: keeping another replaces the first, and **Remove from the Shop** takes it out whenever you like.',
      '**Leave and re-enter the Shop** after keeping a banner to see it.',
      'The banner\'s own draw limits still apply.',
      'The Shop never shows two different special tickets at once. When they clash, the seasonal banner wins, then the kept banner, then the weekly rotation; the banner that loses steps aside until the season ends. A clash means a different special ticket (for example Spooky Cookies, Moogle Points or Holiday Draw Tickets).',
      '## Catalog filters',
      'The **GAME YEAR** tabs split the Banner Catalog by year, each year running from one anniversary (April 7) to the next.',
      'The **Filters** panel has three parts: **Find a Medal** (the banners where it can be drawn), **Paid with** (Jewels, Tickets and so on) and **Show** (all banners, those in the Shop now, unlocked or still locked ones).',
      'Filters only change the Catalog, never the Shop.'] },
  { date: '10/14', tag: 'INFORMATION', title: 'Supernova and Dual Meow Wow',
    body: ['Equipping a Supernova Medal lets you unleash its powerful Supernova once per quest: tap the button under the Burst gauge during your turn.',
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
